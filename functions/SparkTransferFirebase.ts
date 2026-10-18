import { doc, serverTimestamp, type Firestore, type Transaction } from 'firebase/firestore';
import {
  assertSparkBalance, assertSparkDocumentId, assertSparkPositionCurrent, parseSparkPosition, runSparkOperation, sparkText,
  SPARK_MAX_CENTS, type SparkIdentity,
} from './sparkFinancialProtocol';

export { SPARK_TRANSFER_PROOF_PROTOCOL } from './sparkFinancialProtocol';
export type SparkTransferInput = SparkIdentity & {
  fromAccountId: string; toAccountId: string;
  kind: 'transfer' | 'investment_deposit' | 'investment_redemption';
  amountInCents: number; note?: string | null; overdraftReason?: string | null;
};
export type SparkReversalInput = SparkIdentity & {
  originalOperationId: string; note?: string | null; overdraftReason?: string | null;
};

type PairMaterial = {
  kind: string; fromAccountId: string; toAccountId: string; amountInCents: number;
  note: string | null; overdraftReason: string | null; reversesOperationId?: string;
};

async function applyPair(firestore: Firestore, input: SparkIdentity, transaction: Transaction, material: PairMaterial) {
  const groupRef = doc(firestore, 'financialGroups', input.groupId);
  const fromRef = doc(groupRef, 'sparkPositions', material.fromAccountId);
  const toRef = doc(groupRef, 'sparkPositions', material.toAccountId);
  const fromSnapshot = await transaction.get(fromRef);
  const toSnapshot = await transaction.get(toRef);
  if (!fromSnapshot.exists() || !toSnapshot.exists()) throw new Error('Conta financeira não encontrada.');
  const from = parseSparkPosition(fromSnapshot.data());
  const to = parseSparkPosition(toSnapshot.data());
  assertSparkPositionCurrent(from); assertSparkPositionCurrent(to);
  if (material.kind !== 'transfer_reversal') {
    const valid = material.kind === 'transfer' ? from.kind !== 'investment' && to.kind !== 'investment'
      : material.kind === 'investment_deposit' ? from.kind !== 'investment' && to.kind === 'investment'
        : from.kind === 'investment' && to.kind !== 'investment';
    if (!valid) throw new Error('Contas incompatíveis com o tipo da operação.');
  }
  const fromBalance = from.balanceInCents - material.amountInCents;
  const toBalance = to.balanceInCents + material.amountInCents;
  assertSparkBalance(from.kind, fromBalance, material.overdraftReason);
  assertSparkBalance(to.kind, toBalance, material.overdraftReason);
  for (const [ref, position, balance] of [[fromRef, from, fromBalance], [toRef, to, toBalance]] as const) {
    transaction.update(ref, { balanceInCents: balance, revision: position.revision + 1,
      lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
  }
  return { fromRevision: from.revision, toRevision: to.revision,
    fromPreviousOperationId: from.lastOperationId, toPreviousOperationId: to.lastOperationId };
}

export async function transferSparkFundsFirebase(firestore: Firestore, input: SparkTransferInput) {
  input = { ...input };
  [input.fromAccountId, input.toAccountId].forEach(assertSparkDocumentId);
  if (input.fromAccountId === input.toAccountId) throw new Error('As contas precisam ser diferentes.');
  if (!Number.isSafeInteger(input.amountInCents) || input.amountInCents <= 0 || input.amountInCents > SPARK_MAX_CENTS) {
    throw new Error('Valor deve ser positivo e inteiro em centavos.');
  }
  if (!['transfer', 'investment_deposit', 'investment_redemption'].includes(input.kind)) throw new Error('Tipo de operação inválido.');
  const material = { kind: input.kind, fromAccountId: input.fromAccountId, toAccountId: input.toAccountId,
    amountInCents: input.amountInCents, note: sparkText(input.note, 2000), overdraftReason: sparkText(input.overdraftReason, 500) };
  return runSparkOperation(firestore, input, () => material, (transaction, prepared) => applyPair(firestore, input, transaction, prepared));
}

export async function reverseSparkTransferFirebase(firestore: Firestore, input: SparkReversalInput) {
  input = { ...input };
  assertSparkDocumentId(input.originalOperationId);
  const groupRef = doc(firestore, 'financialGroups', input.groupId);
  const claimRef = doc(groupRef, 'sparkReversals', input.originalOperationId);
  return runSparkOperation(firestore, input, async (transaction, role) => {
    const original = (await transaction.get(doc(groupRef, 'sparkOperations', input.originalOperationId))).data();
    if (!original || !['transfer', 'investment_deposit', 'investment_redemption'].includes(original.kind)) {
      throw new Error('Operação original não permite este estorno.');
    }
    if (role !== 'admin' && original.actorId !== input.actorId) throw new Error('Você só pode estornar suas próprias operações.');
    return { kind: 'transfer_reversal', fromAccountId: original.toAccountId as string,
      toAccountId: original.fromAccountId as string, amountInCents: original.amountInCents as number,
      reversesOperationId: input.originalOperationId, note: sparkText(input.note, 2000), overdraftReason: sparkText(input.overdraftReason, 500) };
  }, async (transaction, material) => {
    if ((await transaction.get(claimRef)).exists()) throw new Error('Esta operação já foi estornada.');
    const derived = await applyPair(firestore, input, transaction, material);
    transaction.set(claimRef, { schemaVersion: 1, actorId: input.actorId,
      reversalOperationId: input.clientActionId, createdAt: serverTimestamp() });
    return derived;
  });
}
