import { doc, getDocFromServer, serverTimestamp, type Firestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { prepareSparkHistoryProofFirebase, type SparkHistoryProof, type SparkPreparationOptions } from './SparkHistoryFirebase';
import { assertSparkBalance, assertSparkDocumentId, assertSparkPositionCurrent, parseSparkPosition, runSparkOperation, sparkText, SPARK_MAX_CENTS, type SparkIdentity } from './sparkFinancialProtocol';

export type SparkInvestmentValuationReversalInput = SparkIdentity & { accountId: string; originalOperationId: string; expectedRevision: number; reason: string };

/** [[Sincronização de Investimentos Spark]]: refaz a fotografia sem a referência vigente, mantendo todos os movimentos. */
export async function prepareSparkInvestmentValuationReversalFirebase(firestore: Firestore, input: SparkInvestmentValuationReversalInput, maxPages = 20, options?: SparkPreparationOptions) {
  input = { ...input }; [input.accountId, input.originalOperationId].forEach(assertSparkDocumentId);
  if (getAuth(firestore.app).currentUser?.uid !== input.actorId) throw new Error('A sessão autenticada mudou.');
  const original = (await getDocFromServer(doc(firestore, 'financialGroups', input.groupId, 'sparkOperations', input.originalOperationId))).data();
  if (!original || !['investment_sync', 'investment_edit_valuation'].includes(original.kind) || original.accountId !== input.accountId) throw new Error('Avaliação indisponível.');
  return prepareSparkHistoryProofFirebase(firestore, { groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId,
    accountId: input.accountId, asOf: original.effectiveAt, purpose: 'valuation_undo', excludedCheckpointOperationId: input.originalOperationId }, maxPages, options);
}

export async function reverseSparkInvestmentValuationFirebase(firestore: Firestore, input: SparkInvestmentValuationReversalInput) {
  input = { ...input }; [input.accountId, input.originalOperationId].forEach(assertSparkDocumentId);
  const reason = sparkText(input.reason, 2000);
  if (!reason || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= SPARK_MAX_CENTS) throw new Error('Motivo e revisão são obrigatórios.');
  const identity = { groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId };
  return runSparkOperation(firestore, identity, async (transaction, role) => {
    if (role !== 'admin') throw new Error('Desfazer uma avaliação exige administrador do grupo.');
    const original = (await transaction.get(doc(firestore, 'financialGroups', input.groupId, 'sparkOperations', input.originalOperationId))).data();
    if (!original || !['investment_sync', 'investment_edit_valuation'].includes(original.kind) || original.accountId !== input.accountId) throw new Error('Avaliação indisponível.');
    return { kind: 'investment_valuation_reversal', accountId: input.accountId, reversesOperationId: input.originalOperationId,
      expectedRevision: input.expectedRevision, proofId: input.clientActionId, effectiveAt: original.effectiveAt, note: reason };
  }, async (transaction, material) => {
    const group = doc(firestore, 'financialGroups', input.groupId), positionRef = doc(group, 'sparkPositions', input.accountId);
    const position = parseSparkPosition((await transaction.get(positionRef)).data() ?? {}); assertSparkPositionCurrent(position);
    const proof = (await transaction.get(doc(group, 'sparkHistoryProofs', input.clientActionId))).data() as SparkHistoryProof | undefined;
    const reference = (await transaction.get(doc(group, 'sparkCheckpoints', input.accountId))).data();
    const claimRef = doc(group, 'sparkInvestmentValuationReversals', input.originalOperationId), claim = await transaction.get(claimRef);
    if (claim.exists() || position.kind !== 'investment' || reference?.operationId !== input.originalOperationId) throw new Error('A avaliação já foi desfeita ou substituída.');
    if (!proof || proof.phase !== 'done' || proof.purpose !== 'valuation_undo' || proof.excludedCheckpointOperationId !== input.originalOperationId
      || proof.actorId !== input.actorId || proof.accountId !== input.accountId || !proof.asOf.isEqual(material.effectiveAt)
      || position.revision !== input.expectedRevision || proof.headRevision !== position.revision || proof.headOperationId !== position.lastOperationId) {
      throw new Error('Conclua a preparação na revisão apresentada antes de desfazer a avaliação.');
    }
    const target = proof.balanceInCents, next = target + proof.tailDeltaInCents, effect = next - position.balanceInCents;
    assertSparkBalance('investment', target, null); assertSparkBalance('investment', next, null);
    if (!Number.isSafeInteger(effect) || Math.abs(effect) > SPARK_MAX_CENTS) throw new Error('Efeito do desfazimento fora do limite permitido.');
    transaction.update(positionRef, { balanceInCents: next, revision: position.revision + 1, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    transaction.set(doc(group, 'sparkCheckpoints', input.accountId), { operationId: input.clientActionId, effectiveAt: material.effectiveAt,
      countedBalanceInCents: target, includesBoundary: false });
    transaction.set(claimRef, { schemaVersion: 1, actorId: input.actorId, reversalOperationId: input.clientActionId, createdAt: serverTimestamp() });
    return { previousOperationId: position.lastOperationId, targetBalanceInCents: target,
      previousBalanceInCents: position.balanceInCents, differenceInCents: target - reference.countedBalanceInCents, currentEffectInCents: effect };
  });
}
