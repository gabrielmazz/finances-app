import { doc, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';
import { compareSparkTime, type SparkHistoryProof } from './SparkHistoryFirebase';
import { toFinancialCivilDate } from '../utils/financialCivilDate';
import { getCycleKeyFromDate } from '../utils/mandatoryExpenses';
import { assertSparkBalance, assertSparkDocumentId, assertSparkPositionCurrent, parseSparkPosition, runSparkOperation, sparkText, SPARK_MAX_CENTS, type SparkIdentity } from './sparkFinancialProtocol';

export type SparkTemporalBalanceInput = SparkIdentity & {
  accountId: string; kind: 'dated_adjustment' | 'dated_reconciliation' | 'monthly_opening'; effectiveAt: Timestamp;
  targetBalanceInCents: number; expectedRevision: number; cycle?: string | null;
  expectedOpeningOperationId?: string | null; note?: string | null; overdraftReason?: string | null;
};

/** [[Protocolo Financeiro Spark]]: confirmação usa somente projeção completa, própria e na revisão apresentada. */
export async function saveSparkTemporalBalanceFirebase(firestore: Firestore, input: SparkTemporalBalanceInput) {
  input = { ...input };
  assertSparkDocumentId(input.accountId);
  if (!['dated_adjustment', 'dated_reconciliation', 'monthly_opening'].includes(input.kind)
    || !(input.effectiveAt instanceof Timestamp) || input.effectiveAt.seconds < 0
    || !Number.isSafeInteger(input.targetBalanceInCents) || Math.abs(input.targetBalanceInCents) > SPARK_MAX_CENTS
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('Saldo, data ou revisão inválidos.');
  if ('date' in input) throw new Error('Informe apenas a data efetiva da projeção.');
  const civil = toFinancialCivilDate(input.effectiveAt.toDate()), today = toFinancialCivilDate(new Date());
  const adjustment = input.kind === 'dated_adjustment';
  const civilCycle = getCycleKeyFromDate(civil);
  const effectiveMode = !adjustment ? 'instant' : civilCycle === getCycleKeyFromDate(today) && civil.getDate() === today.getDate() ? 'commit' : 'day_end';
  if (input.kind !== 'monthly_opening' && (input.cycle != null || input.expectedOpeningOperationId != null)) throw new Error('Ciclo só se aplica à abertura mensal.');
  const material = { kind: input.kind, accountId: input.accountId, proofId: input.clientActionId,
    requestedEffectiveAt: input.effectiveAt, civilDay: adjustment ? civil.getDate() : null,
    targetBalanceInCents: input.targetBalanceInCents, expectedRevision: input.expectedRevision,
    cycle: adjustment ? civilCycle : input.cycle ?? null, expectedOpeningOperationId: input.expectedOpeningOperationId ?? null,
    note: sparkText(input.note, 2000), overdraftReason: sparkText(input.overdraftReason, 500) };
  if (input.kind === 'monthly_opening' && (!material.cycle || !/^\d{4}-(0[1-9]|1[0-2])$/.test(material.cycle))) throw new Error('Ciclo mensal inválido.');
  if (material.expectedOpeningOperationId !== null) assertSparkDocumentId(material.expectedOpeningOperationId);
  const groupRef = doc(firestore, 'financialGroups', input.groupId);
  return runSparkOperation(firestore, { groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId }, (_transaction, role) => {
    if (role !== 'admin') throw new Error('A operação exige administrador do grupo.');
    return material;
  }, async transaction => {
    const positionRef = doc(groupRef, 'sparkPositions', input.accountId);
    const position = parseSparkPosition((await transaction.get(positionRef)).data() ?? {});
    assertSparkPositionCurrent(position);
    const proof = (await transaction.get(doc(groupRef, 'sparkHistoryProofs', input.clientActionId))).data() as SparkHistoryProof | undefined;
    if (!proof || proof.phase !== 'done' || proof.actorId !== input.actorId || proof.accountId !== input.accountId
      || !proof.asOf.isEqual(input.effectiveAt) || proof.purpose !== (input.kind === 'monthly_opening' ? 'monthly' : 'instant')) {
      throw new Error('Conclua a projeção correspondente antes de confirmar.');
    }
    if (position.revision !== input.expectedRevision || position.revision !== proof.headRevision || position.lastOperationId !== proof.headOperationId) {
      throw new Error('A prévia ficou desatualizada. Refaça a projeção com um novo identificador.');
    }
    if (position.kind === 'investment' || (input.kind !== 'dated_reconciliation' && position.kind !== 'bank')) throw new Error('Tipo de conta incompatível.');
    if (input.kind === 'dated_adjustment' && (!proof.baselineAt || compareSparkTime(input.effectiveAt, proof.baselineAt) <= 0)) {
      throw new Error('Escolha um instante posterior à abertura elegível.');
    }
    if (adjustment) {
      const month = (await transaction.get(doc(firestore, 'sparkCivilMonths', civilCycle))).data();
      const dayEnd = month?.dayEnds?.[civil.getDate() - 1] as Timestamp | undefined;
      if (!dayEnd || (effectiveMode === 'day_end' && !dayEnd.isEqual(input.effectiveAt))) throw new Error('Escolha o fim do dia civil passado no calendário autorizado.');
      if (effectiveMode === 'commit' && compareSparkTime(input.effectiveAt, (await transaction.get(positionRef)).data()!.updatedAt) < 0) {
        throw new Error('Atualize a prévia de hoje após o último movimento.');
      }
    }
    if (input.kind === 'monthly_opening') {
      const month = (await transaction.get(doc(firestore, 'sparkCivilMonths', material.cycle!))).data();
      if (!month?.startAt?.isEqual(input.effectiveAt)) throw new Error('Calendário civil ausente ou início do ciclo divergente.');
      const opening = (await transaction.get(doc(groupRef, 'sparkMonthlyOpenings', input.accountId, 'cycles', material.cycle!))).data();
      if ((opening?.operationId ?? null) !== material.expectedOpeningOperationId) throw new Error('A abertura mensal mudou após a prévia.');
    }
    const future = input.kind === 'monthly_opening' && compareSparkTime(input.effectiveAt, Timestamp.now()) > 0;
    const differenceInCents = future ? 0 : input.targetBalanceInCents - proof.balanceInCents;
    const covered = proof.latestCheckpointAt && compareSparkTime(proof.latestCheckpointAt, input.effectiveAt) > 0;
    const currentEffectInCents = future || covered ? 0 : input.kind === 'dated_adjustment' ? differenceInCents
      : input.targetBalanceInCents + proof.tailDeltaInCents - position.balanceInCents;
    if (![proof.balanceInCents, differenceInCents, currentEffectInCents].every(value => Number.isSafeInteger(value) && Math.abs(value) <= SPARK_MAX_CENTS)) throw new Error('Diferença fora do limite permitido.');
    assertSparkBalance(position.kind, input.targetBalanceInCents, material.overdraftReason);
    assertSparkBalance(position.kind, position.balanceInCents + currentEffectInCents, material.overdraftReason);
    transaction.update(positionRef, { balanceInCents: position.balanceInCents + currentEffectInCents,
      nextActivationAt: future && (!position.nextActivationAt || compareSparkTime(input.effectiveAt, position.nextActivationAt) < 0)
        ? input.effectiveAt : position.nextActivationAt,
      revision: position.revision + 1, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    if (input.kind !== 'dated_adjustment' && !future && !covered) transaction.set(doc(groupRef, 'sparkCheckpoints', input.accountId), {
      operationId: input.clientActionId, effectiveAt: input.effectiveAt, countedBalanceInCents: input.targetBalanceInCents,
      includesBoundary: input.kind === 'monthly_opening',
    });
    if (input.kind === 'monthly_opening') transaction.set(doc(groupRef, 'sparkMonthlyOpenings', input.accountId, 'cycles', material.cycle!), {
      operationId: input.clientActionId, effectiveAt: input.effectiveAt, countedBalanceInCents: input.targetBalanceInCents,
    });
    return { effectiveMode, effectiveAt: effectiveMode === 'commit' ? serverTimestamp() : input.effectiveAt,
      previousOperationId: position.lastOperationId, previousBalanceInCents: proof.balanceInCents, differenceInCents, currentEffectInCents };
  });
}
