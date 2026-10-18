import { doc, serverTimestamp, type Firestore, type Timestamp } from 'firebase/firestore';
import {
  assertSparkBalance, assertSparkDocumentId, assertSparkPositionCurrent, parseSparkPosition, runSparkOperation, sparkText,
  SPARK_MAX_CENTS, type SparkIdentity,
} from './sparkFinancialProtocol';

export type SparkCountInput = SparkIdentity & {
  accountId: string; kind: 'account_count' | 'balance_adjustment';
  targetBalanceInCents: number; expectedRevision: number; note?: string | null; overdraftReason?: string | null;
};

/** Contagem no commit. Não calcula nem promete saldo de uma data passada arbitrária. */
export async function countSparkAccountFirebase(firestore: Firestore, input: SparkCountInput) {
  input = { ...input };
  assertSparkDocumentId(input.accountId);
  if (!['account_count', 'balance_adjustment'].includes(input.kind)
    || !Number.isSafeInteger(input.targetBalanceInCents) || Math.abs(input.targetBalanceInCents) > SPARK_MAX_CENTS
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= SPARK_MAX_CENTS) {
    throw new Error('Contagem ou revisão inválida.');
  }
  const material = { kind: input.kind, accountId: input.accountId, targetBalanceInCents: input.targetBalanceInCents,
    expectedRevision: input.expectedRevision, note: sparkText(input.note, 2000), overdraftReason: sparkText(input.overdraftReason, 500) };
  const groupRef = doc(firestore, 'financialGroups', input.groupId);
  return runSparkOperation(firestore, input, (_transaction, role) => {
    if (role !== 'admin') throw new Error('A contagem exige administrador do grupo.');
    return material;
  }, async transaction => {
    const positionRef = doc(groupRef, 'sparkPositions', input.accountId);
    const snapshot = await transaction.get(positionRef);
    if (!snapshot.exists()) throw new Error('Conta financeira não encontrada.');
    const position = parseSparkPosition(snapshot.data());
    assertSparkPositionCurrent(position);
    if (position.revision !== input.expectedRevision) throw new Error('A prévia ficou desatualizada. Confira o saldo novamente.');
    if (position.kind === 'investment' || (input.kind === 'balance_adjustment' && position.kind !== 'bank')) {
      throw new Error('Tipo de conta incompatível com a contagem.');
    }
    assertSparkBalance(position.kind, input.targetBalanceInCents, material.overdraftReason);
    const differenceInCents = input.targetBalanceInCents - position.balanceInCents;
    if (Math.abs(differenceInCents) > SPARK_MAX_CENTS) throw new Error('Diferença fora do limite permitido.');
    transaction.update(positionRef, { balanceInCents: input.targetBalanceInCents, revision: position.revision + 1,
      lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    if (input.kind === 'account_count') transaction.set(doc(groupRef, 'sparkCheckpoints', input.accountId), {
      operationId: input.clientActionId, countedBalanceInCents: input.targetBalanceInCents, effectiveAt: serverTimestamp(),
      includesBoundary: false,
    });
    return { previousOperationId: position.lastOperationId,
      previousBalanceInCents: position.balanceInCents, differenceInCents, currentEffectInCents: differenceInCents };
  });
}

export type SparkAdjustmentReversalInput = SparkIdentity & {
  originalOperationId: string; note?: string | null; overdraftReason?: string | null;
};

export async function reverseSparkBalanceAdjustmentFirebase(firestore: Firestore, input: SparkAdjustmentReversalInput) {
  input = { ...input };
  assertSparkDocumentId(input.originalOperationId);
  const groupRef = doc(firestore, 'financialGroups', input.groupId);
  const claimRef = doc(groupRef, 'sparkAdjustmentReversals', input.originalOperationId);
  return runSparkOperation(firestore, input, async (transaction, role) => {
    const original = (await transaction.get(doc(groupRef, 'sparkOperations', input.originalOperationId))).data();
    if (!original || !['balance_adjustment', 'dated_adjustment', 'adjustment_replacement'].includes(original.kind)) throw new Error('Selecione um ajuste de saldo original.');
    if (role !== 'admin' || original.actorId !== input.actorId) throw new Error('O estorno exige administrador e autor do ajuste.');
    return { kind: 'adjustment_reversal', accountId: original.accountId as string, reversesOperationId: input.originalOperationId,
      effectiveAt: (original.effectiveAt ?? original.createdAt) as Timestamp, differenceInCents: -(original.differenceInCents as number),
      note: sparkText(input.note, 2000), overdraftReason: sparkText(input.overdraftReason, 500) };
  }, async (transaction, material) => {
    if ((await transaction.get(claimRef)).exists()) throw new Error('Este ajuste já foi estornado ou substituído.');
    const positionRef = doc(groupRef, 'sparkPositions', material.accountId);
    const snapshot = await transaction.get(positionRef);
    const checkpoint = (await transaction.get(doc(groupRef, 'sparkCheckpoints', material.accountId))).data();
    if (!snapshot.exists()) throw new Error('Conta financeira não encontrada.');
    const position = parseSparkPosition(snapshot.data());
    assertSparkPositionCurrent(position);
    if (position.kind !== 'bank') throw new Error('O ajuste exige conta bancária.');
    const checkpointAt = checkpoint?.effectiveAt as Timestamp | undefined;
    const covered = checkpointAt && (checkpointAt.seconds > material.effectiveAt.seconds
      || (checkpointAt.seconds === material.effectiveAt.seconds && (checkpointAt.nanoseconds > material.effectiveAt.nanoseconds
        || (checkpointAt.nanoseconds === material.effectiveAt.nanoseconds && checkpoint?.includesBoundary !== true))));
    const currentEffectInCents = covered ? 0 : material.differenceInCents;
    const balance = position.balanceInCents + currentEffectInCents;
    assertSparkBalance(position.kind, balance, material.overdraftReason);
    transaction.update(positionRef, { balanceInCents: balance, revision: position.revision + 1,
      lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    transaction.set(claimRef, { schemaVersion: 1, actorId: input.actorId,
      reversalOperationId: input.clientActionId, createdAt: serverTimestamp() });
    return { expectedRevision: position.revision, previousOperationId: position.lastOperationId, currentEffectInCents };
  });
}
