import { doc, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';
import { compareSparkTime, isSparkProofMovementIncluded, type SparkHistoryProof } from './SparkHistoryFirebase';
import { assertSparkBalance, assertSparkDocumentId, assertSparkPositionCurrent, parseSparkPosition, runSparkOperation,
  sparkText, SPARK_MAX_CENTS, type SparkIdentity } from './sparkFinancialProtocol';
import { toFinancialCivilDate } from '../utils/financialCivilDate';
import { getCycleKeyFromDate } from '../utils/mandatoryExpenses';

export type SparkAdjustmentReplacementInput = SparkIdentity & {
  accountId: string; originalOperationId: string; effectiveAt: Timestamp;
  targetBalanceInCents: number; expectedRevision: number; note?: string | null; overdraftReason?: string | null;
};

/** [[Ajuste de Saldo]]: inverso antigo e substituto novos são um único evento com duas datas verificadas. */
export async function replaceSparkBalanceAdjustmentFirebase(firestore: Firestore, input: SparkAdjustmentReplacementInput) {
  input = { ...input }; [input.accountId, input.originalOperationId].forEach(assertSparkDocumentId);
  if (!(input.effectiveAt instanceof Timestamp) || input.effectiveAt.seconds < 0 || 'date' in input
    || !Number.isSafeInteger(input.targetBalanceInCents) || Math.abs(input.targetBalanceInCents) > SPARK_MAX_CENTS
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= SPARK_MAX_CENTS) {
    throw new Error('Conta, data, saldo ou revisão da substituição inválidos.');
  }
  const civil = toFinancialCivilDate(input.effectiveAt.toDate()), today = toFinancialCivilDate(new Date());
  const cycle = getCycleKeyFromDate(civil);
  const effectiveMode = cycle === getCycleKeyFromDate(today) && civil.getDate() === today.getDate() ? 'commit' : 'day_end';
  const groupRef = doc(firestore, 'financialGroups', input.groupId);
  const claimRef = doc(groupRef, 'sparkAdjustmentReversals', input.originalOperationId);
  return runSparkOperation(firestore, { groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId }, async (transaction, role) => {
    const original = (await transaction.get(doc(groupRef, 'sparkOperations', input.originalOperationId))).data();
    if (!original || !['balance_adjustment', 'dated_adjustment', 'adjustment_replacement'].includes(original.kind)) throw new Error('Selecione um ajuste ativo, não um estorno.');
    if (role !== 'admin' || original.actorId !== input.actorId || original.accountId !== input.accountId) {
      throw new Error('A substituição exige autor administrador e o mesmo banco do ajuste.');
    }
    return { kind: 'adjustment_replacement', accountId: input.accountId, replacesOperationId: input.originalOperationId,
      originalEffectiveAt: (original.effectiveAt ?? original.createdAt) as Timestamp, originalDifferenceInCents: original.differenceInCents as number,
      proofId: input.clientActionId, requestedEffectiveAt: input.effectiveAt, expectedRevision: input.expectedRevision,
      targetBalanceInCents: input.targetBalanceInCents, cycle, civilDay: civil.getDate(),
      note: sparkText(input.note, 2000), overdraftReason: sparkText(input.overdraftReason, 500) };
  }, async (transaction, material) => {
    if ((await transaction.get(claimRef)).exists()) throw new Error('Este ajuste já foi substituído ou estornado.');
    const positionRef = doc(groupRef, 'sparkPositions', input.accountId);
    const positionData = (await transaction.get(positionRef)).data() ?? {};
    const position = parseSparkPosition(positionData); assertSparkPositionCurrent(position);
    const proof = (await transaction.get(doc(groupRef, 'sparkHistoryProofs', input.clientActionId))).data() as SparkHistoryProof | undefined;
    const checkpoint = (await transaction.get(doc(groupRef, 'sparkCheckpoints', input.accountId))).data();
    const month = (await transaction.get(doc(firestore, 'sparkCivilMonths', cycle))).data();
    if (!proof || proof.phase !== 'done' || proof.actorId !== input.actorId || proof.accountId !== input.accountId
      || proof.purpose !== 'instant' || !proof.asOf.isEqual(input.effectiveAt)) throw new Error('Conclua a projeção da nova data antes de substituir.');
    if (position.revision !== input.expectedRevision || proof.headRevision !== position.revision || proof.headOperationId !== position.lastOperationId) {
      throw new Error('A prévia ficou desatualizada. Refaça a projeção com um novo identificador.');
    }
    if (position.kind !== 'bank' || !proof.baselineAt || compareSparkTime(input.effectiveAt, proof.baselineAt) <= 0) {
      throw new Error('O ajuste exige banco ativo e instante posterior à abertura elegível.');
    }
    const dayEnd = month?.dayEnds?.[civil.getDate() - 1] as Timestamp | undefined;
    if (!dayEnd || (effectiveMode === 'day_end' && !dayEnd.isEqual(input.effectiveAt))) throw new Error('Escolha o fim do dia civil passado no calendário autorizado.');
    if (effectiveMode === 'commit' && compareSparkTime(input.effectiveAt, positionData.updatedAt) < 0) throw new Error('Atualize a prévia de hoje após o último movimento.');
    const previousBalanceInCents = proof.balanceInCents - (isSparkProofMovementIncluded(proof, material.originalEffectiveAt) ? material.originalDifferenceInCents : 0);
    const differenceInCents = input.targetBalanceInCents - previousBalanceInCents;
    const oldCovered = checkpoint && (compareSparkTime(checkpoint.effectiveAt, material.originalEffectiveAt) > 0
      || (compareSparkTime(checkpoint.effectiveAt, material.originalEffectiveAt) === 0 && !checkpoint.includesBoundary));
    const newCovered = proof.latestCheckpointAt && compareSparkTime(proof.latestCheckpointAt, input.effectiveAt) > 0;
    const currentEffectInCents = (oldCovered ? 0 : -material.originalDifferenceInCents) + (newCovered ? 0 : differenceInCents);
    if (!Number.isSafeInteger(previousBalanceInCents) || Math.abs(previousBalanceInCents) > 2 * SPARK_MAX_CENTS
      || !Number.isSafeInteger(differenceInCents) || Math.abs(differenceInCents) > SPARK_MAX_CENTS
      || !Number.isSafeInteger(currentEffectInCents) || Math.abs(currentEffectInCents) > 2 * SPARK_MAX_CENTS) throw new Error('Diferença fora do limite permitido.');
    assertSparkBalance('bank', input.targetBalanceInCents, material.overdraftReason);
    assertSparkBalance('bank', position.balanceInCents + currentEffectInCents, material.overdraftReason);
    transaction.update(positionRef, { balanceInCents: position.balanceInCents + currentEffectInCents, revision: position.revision + 1,
      lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    transaction.set(claimRef, { schemaVersion: 1, actorId: input.actorId, reversalOperationId: input.clientActionId, createdAt: serverTimestamp() });
    return { effectiveMode, effectiveAt: effectiveMode === 'commit' ? serverTimestamp() : input.effectiveAt,
      previousOperationId: position.lastOperationId, previousBalanceInCents, differenceInCents, currentEffectInCents };
  });
}
