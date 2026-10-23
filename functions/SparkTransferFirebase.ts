import { doc, serverTimestamp, Timestamp, type Firestore, type Transaction } from 'firebase/firestore';
import { sparkMovementCurrentEffect } from './SparkMovementFirebase';
import {
  assertSparkBalance, assertSparkDocumentId, assertSparkPositionCurrent, parseSparkPosition, runSparkOperation, sparkText,
  SPARK_MAX_CENTS, type SparkIdentity,
} from './sparkFinancialProtocol';

export { SPARK_TRANSFER_PROOF_PROTOCOL } from './sparkFinancialProtocol';
export type SparkTransferInput = SparkIdentity & {
  fromAccountId: string; toAccountId: string;
  kind: 'transfer' | 'investment_deposit' | 'investment_redemption';
  amountInCents: number; note?: string | null; overdraftReason?: string | null;
  expectedFromRevision?: number; expectedToRevision?: number;
};
export type SparkReversalInput = SparkIdentity & {
  originalOperationId: string; originalSource?: 'live' | 'imported'; note?: string | null; overdraftReason?: string | null;
};
export type SparkDatedTransferInput = SparkTransferInput & { effectiveAt: Timestamp };
export type SparkDatedReversalInput = SparkReversalInput & { effectiveAt: Timestamp };

type PairMaterial = {
  kind: string; dated: boolean; fromAccountId: string; toAccountId: string; amountInCents: number;
  note: string | null; overdraftReason: string | null; reversesOperationId?: string;
  effectiveAt?: Timestamp;
  expectedFromRevision?: number; expectedToRevision?: number;
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
  if (material.expectedFromRevision !== undefined && from.revision !== material.expectedFromRevision
    || material.expectedToRevision !== undefined && to.revision !== material.expectedToRevision) throw new Error('O saldo mudou após a confirmação. Atualize os valores.');
  if (material.kind !== 'transfer_reversal') {
    const valid = material.kind === 'transfer' ? from.kind !== 'investment' && to.kind !== 'investment'
      : material.kind === 'investment_deposit' ? from.kind !== 'investment' && to.kind === 'investment'
        : from.kind === 'investment' && to.kind !== 'investment';
    if (!valid) throw new Error('Contas incompatíveis com o tipo da operação.');
  }
  const fromEffect = material.effectiveAt ? await sparkMovementCurrentEffect(firestore, transaction, input.groupId, material.fromAccountId, material.effectiveAt, -material.amountInCents) : -material.amountInCents;
  const toEffect = material.effectiveAt ? await sparkMovementCurrentEffect(firestore, transaction, input.groupId, material.toAccountId, material.effectiveAt, material.amountInCents) : material.amountInCents;
  const fromBalance = from.balanceInCents + fromEffect;
  const toBalance = to.balanceInCents + toEffect;
  assertSparkBalance(from.kind, fromBalance, material.overdraftReason);
  assertSparkBalance(to.kind, toBalance, material.overdraftReason);
  for (const [ref, position, balance] of [[fromRef, from, fromBalance], [toRef, to, toBalance]] as const) {
    transaction.update(ref, { balanceInCents: balance, revision: position.revision + 1,
      lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
  }
  return { fromRevision: from.revision, toRevision: to.revision,
    fromPreviousOperationId: from.lastOperationId, toPreviousOperationId: to.lastOperationId,
    ...(material.effectiveAt ? { fromCurrentEffectInCents: fromEffect, toCurrentEffectInCents: toEffect } : {}) };
}

function transferMaterial(input: SparkTransferInput) {
  [input.fromAccountId, input.toAccountId].forEach(assertSparkDocumentId);
  if (input.fromAccountId === input.toAccountId) throw new Error('As contas precisam ser diferentes.');
  if (!Number.isSafeInteger(input.amountInCents) || input.amountInCents <= 0 || input.amountInCents > SPARK_MAX_CENTS) {
    throw new Error('Valor deve ser positivo e inteiro em centavos.');
  }
  if (!['transfer', 'investment_deposit', 'investment_redemption'].includes(input.kind)) throw new Error('Tipo de operação inválido.');
  for (const revision of [input.expectedFromRevision, input.expectedToRevision]) if (revision !== undefined
    && (!Number.isSafeInteger(revision) || revision < 0 || revision >= SPARK_MAX_CENTS)) throw new Error('Revisão de confirmação inválida.');
  return { kind: input.kind, dated: false, fromAccountId: input.fromAccountId, toAccountId: input.toAccountId,
    amountInCents: input.amountInCents, note: sparkText(input.note, 2000), overdraftReason: sparkText(input.overdraftReason, 500),
    ...(input.expectedFromRevision === undefined ? {} : { expectedFromRevision: input.expectedFromRevision }),
    ...(input.expectedToRevision === undefined ? {} : { expectedToRevision: input.expectedToRevision }) };
}
export async function transferSparkFundsFirebase(firestore: Firestore, input: SparkTransferInput) {
  input = { ...input }; const material = transferMaterial(input);
  return runSparkOperation(firestore, input, () => material, (transaction, prepared) => applyPair(firestore, input, transaction, prepared));
}

function datedIdentity(input: SparkIdentity & { effectiveAt: Timestamp }) {
  if ('date' in input || 'observedAt' in input || !(input.effectiveAt instanceof Timestamp) || input.effectiveAt.seconds < 0
    || input.effectiveAt.toMillis() > Date.now()) throw new Error('Informe uma única data efetiva válida, sem data futura.');
  return { groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId };
}
/** [[Movimentos Datados em Par Spark]]: cada posição respeita sua própria referência. */
export async function transferSparkDatedFundsFirebase(firestore: Firestore, input: SparkDatedTransferInput) {
  input = { ...input }; const identity = datedIdentity(input), material = { ...transferMaterial(input), dated: true, effectiveAt: input.effectiveAt };
  return runSparkOperation(firestore, identity, () => material, (transaction, prepared) => applyPair(firestore, identity, transaction, prepared));
}

export async function reverseSparkTransferFirebase(firestore: Firestore, input: SparkReversalInput) {
  return reversePair(firestore, input);
}
export async function reverseSparkDatedTransferFirebase(firestore: Firestore, input: SparkDatedReversalInput) {
  const identity = datedIdentity(input);
  return reversePair(firestore, { ...identity, originalOperationId: input.originalOperationId, originalSource: input.originalSource,
    note: input.note, overdraftReason: input.overdraftReason }, input.effectiveAt);
}
async function reversePair(firestore: Firestore, input: SparkReversalInput, effectiveAt?: Timestamp) {
  input = { ...input };
  assertSparkDocumentId(input.originalOperationId);
  if (input.originalSource !== undefined && !['live', 'imported'].includes(input.originalSource)) throw new Error('Origem de operação inválida.');
  const groupRef = doc(firestore, 'financialGroups', input.groupId);
  const imported = input.originalSource === 'imported';
  const claimRef = doc(groupRef, imported ? 'sparkImportedClaims' : 'sparkReversals', input.originalOperationId);
  return runSparkOperation(firestore, input, async (transaction, role) => {
    const original = (await transaction.get(doc(groupRef, imported ? 'sparkImportedIdentities' : 'sparkOperations', input.originalOperationId))).data();
    if (!original || !['transfer', 'investment_deposit', 'investment_redemption'].includes(original.kind)
      || imported && original.pairResolutionAllowed !== true) {
      throw new Error('Operação original não permite este estorno.');
    }
    if (role !== 'admin' && original.actorId !== input.actorId) throw new Error('Você só pode estornar suas próprias operações.');
    return { kind: 'transfer_reversal', dated: effectiveAt !== undefined, fromAccountId: original.toAccountId as string,
      toAccountId: original.fromAccountId as string, amountInCents: original.amountInCents as number,
      reversesOperationId: input.originalOperationId, ...(imported ? { originalSource: 'imported' } : {}),
      note: sparkText(input.note, 2000), overdraftReason: sparkText(input.overdraftReason, 500), ...(effectiveAt ? { effectiveAt } : {}) };
  }, async (transaction, material) => {
    if ((await transaction.get(claimRef)).exists()) throw new Error('Esta operação já foi estornada.');
    const derived = await applyPair(firestore, input, transaction, material);
    transaction.set(claimRef, { schemaVersion: 1, actorId: input.actorId,
      reversalOperationId: input.clientActionId, createdAt: serverTimestamp() });
    return derived;
  });
}
