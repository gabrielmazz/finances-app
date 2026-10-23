import { doc, serverTimestamp, Timestamp, type Firestore, type Transaction } from 'firebase/firestore';
import { compareSparkTime } from './sparkHistoryEvent';
import { prepareSparkMovementDetails, sparkMovementDetailsMaterial } from './sparkMovementDetails';
import type { SparkMovementDetails } from '../utils/sparkMovementDetails';
import { sparkMovementConfirmation, type SparkMovementConfirmation } from '../utils/sparkMovementConfirmation';
import { createAssistantRecordFingerprint } from '../utils/assistantRecordFingerprint';
import {
  assertSparkBalance, assertSparkDocumentId, assertSparkPositionCurrent, parseSparkPosition,
  runSparkOperation, sparkText, SPARK_MAX_CENTS, type SparkIdentity,
} from './sparkFinancialProtocol';

type MovementKind = 'income' | 'expense';
type MovementFields = {
  accountId: string; amountInCents: number; effectiveAt: Timestamp;
  categoryId?: string | null; note?: string | null; overdraftReason?: string | null;
  details?: SparkMovementDetails;
};
export type SparkMovementInput = SparkIdentity & SparkMovementConfirmation & MovementFields & { kind: MovementKind };
export type SparkMovementResolutionInput = SparkIdentity & SparkMovementConfirmation & {
  originalOperationId: string; originalSource?: 'live' | 'imported'; effectiveAt: Timestamp;
  expectedMovementKind?: MovementKind;
  note?: string | null; overdraftReason?: string | null;
};
export type SparkMovementCorrectionInput = SparkMovementResolutionInput & MovementFields;

const identityOf = (input: SparkIdentity): SparkIdentity => ({ groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId });
function effectiveDate(at: Timestamp) {
  if (!(at instanceof Timestamp) || at.seconds < 0 || at.toMillis() > Date.now()) throw new Error('Data efetiva inválida ou futura.');
}
function movementFields(input: MovementFields) {
  assertSparkDocumentId(input.accountId); effectiveDate(input.effectiveAt);
  if (!Number.isSafeInteger(input.amountInCents) || input.amountInCents <= 0 || input.amountInCents > SPARK_MAX_CENTS) throw new Error('Valor deve ser positivo e inteiro em centavos.');
  const categoryId = input.categoryId ?? null;
  if (categoryId !== null) assertSparkDocumentId(categoryId);
  return { accountId: input.accountId, amountInCents: input.amountInCents, effectiveAt: input.effectiveAt, categoryId,
    note: sparkText(input.note, 2000), overdraftReason: sparkText(input.overdraftReason, 500) };
}
async function currentEffect(firestore: Firestore, transaction: Transaction, groupId: string, accountId: string, at: Timestamp, delta: number) {
  const checkpoint = (await transaction.get(doc(firestore, 'financialGroups', groupId, 'sparkCheckpoints', accountId))).data();
  return !checkpoint || compareSparkTime(at, checkpoint.effectiveAt) > 0
    || (compareSparkTime(at, checkpoint.effectiveAt) === 0 && checkpoint.includesBoundary) ? delta : 0;
}
async function position(firestore: Firestore, transaction: Transaction, groupId: string, accountId: string) {
  const ref = doc(firestore, 'financialGroups', groupId, 'sparkPositions', accountId);
  const parsed = parseSparkPosition((await transaction.get(ref)).data() ?? {}); assertSparkPositionCurrent(parsed);
  if (parsed.kind === 'investment') throw new Error('Use aporte ou resgate para movimentar investimentos.');
  return { ref, ...parsed };
}
async function category(firestore: Firestore, transaction: Transaction, input: SparkIdentity, categoryId: string | null, kind: MovementKind) {
  if (categoryId === null) return () => {};
  const data = (await transaction.get(doc(firestore, 'tags', categoryId))).data();
  const owner = data?.groupId !== input.groupId && typeof data?.personId === 'string' && data.personId !== input.actorId
    ? (await transaction.get(doc(firestore, 'users', data.personId))).data() : null;
  if (!data || data.deleted === true || data.schemaVersion === 1 && data.groupId !== input.groupId
    || !(data.groupId === input.groupId || data.personId === input.actorId || owner?.financialGroupId === input.groupId)
    || ![undefined, 'both', kind === 'income' ? 'gain' : 'expense'].includes(data.usageType)) throw new Error('Categoria incompatível com o grupo ou tipo do lançamento.');
  if (data.schemaVersion !== 1) return () => {};
  const ref = doc(firestore, 'sparkCategoryReferences', categoryId), exists = (await transaction.get(ref)).exists();
  // Retornar a escrita mantém todas as leituras da operação antes de qualquer efeito.
  return () => { if (!exists) transaction.set(ref, { schemaVersion: 1, groupId: input.groupId, categoryId, operationId: input.clientActionId, createdAt: serverTimestamp() }); };
}
function update(transaction: Transaction, input: SparkIdentity, before: Awaited<ReturnType<typeof position>>, delta: number, reason: string | null) {
  const balance = before.balanceInCents + delta; assertSparkBalance(before.kind, balance, reason);
  transaction.update(before.ref, { balanceInCents: balance, revision: before.revision + 1,
    lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
}
export { currentEffect as sparkMovementCurrentEffect, position as readSparkMovementPosition,
  category as validateSparkMovementCategory, update as updateSparkMovementPosition };

/** [[Operações Ordinárias Spark]]: receitas/despesas reais, com data e efeito após a última contagem. */
export async function postSparkMovementFirebase(firestore: Firestore, input: SparkMovementInput) {
  input = { ...input };
  if (!['income', 'expense'].includes(input.kind)) throw new Error('Tipo ordinário inválido.');
  const fields = movementFields(input), delta = input.kind === 'income' ? fields.amountInCents : -fields.amountInCents;
  const details = sparkMovementDetailsMaterial(input.details);
  const confirmation = sparkMovementConfirmation(input);
  return runSparkOperation(firestore, identityOf(input), () => ({ kind: input.kind, ...fields, differenceInCents: delta, ...details.material, ...confirmation }), async (transaction, material) => {
    const before = await position(firestore, transaction, input.groupId, material.accountId);
    const markCategory = await category(firestore, transaction, input, material.categoryId, input.kind);
    const effect = await currentEffect(firestore, transaction, input.groupId, material.accountId, material.effectiveAt, delta);
    const saveDetails = await prepareSparkMovementDetails(firestore, transaction, input, details.details);
    markCategory(); saveDetails(); update(transaction, input, before, effect, material.overdraftReason);
    return { expectedRevision: before.revision, previousOperationId: before.lastOperationId, currentEffectInCents: effect };
  });
}

async function originalMovement(firestore: Firestore, transaction: Transaction, input: SparkMovementResolutionInput, role: string) {
  assertSparkDocumentId(input.originalOperationId);
  const source = input.originalSource ?? 'live';
  if (!['live', 'imported'].includes(source)) throw new Error('Origem de lançamento inválida.');
  const group = doc(firestore, 'financialGroups', input.groupId);
  const original = (await transaction.get(doc(group, source === 'live' ? 'sparkOperations' : 'sparkImportedIdentities', input.originalOperationId))).data();
  if (!original || !['income', 'expense', 'movement_correction'].includes(original.kind)
    || source === 'imported' && original.ordinaryResolutionAllowed !== true) throw new Error('Lançamento exige seu fluxo específico de resolução.');
  if (role !== 'admin' && original.actorId !== input.actorId) throw new Error('Você só pode resolver seus próprios lançamentos.');
  const kind = (original.kind === 'movement_correction' ? original.movementKind : original.kind) as MovementKind;
  if (input.expectedMovementKind !== undefined && input.expectedMovementKind !== kind) throw new Error('Tipo do lançamento diverge da confirmação.');
  if (input.expectedFingerprint != null && createAssistantRecordFingerprint(original) !== input.expectedFingerprint) throw new Error('O lançamento diverge da confirmação. Atualize os dados.');
  return { originalSource: source, originalOperationId: input.originalOperationId, movementKind: kind,
    fromAccountId: (original.kind === 'movement_correction' ? original.toAccountId : original.accountId) as string,
    originalDeltaInCents: (kind === 'income' ? 1 : -1) * (original.amountInCents as number) };
}
const claimRef = (firestore: Firestore, input: SparkMovementResolutionInput) => doc(firestore, 'financialGroups', input.groupId,
  input.originalSource === 'imported' ? 'sparkImportedClaims' : 'sparkMovementClaims', input.originalOperationId);
function claim(transaction: Transaction, firestore: Firestore, input: SparkMovementResolutionInput) {
  transaction.set(claimRef(firestore, input), { schemaVersion: 1, actorId: input.actorId, reversalOperationId: input.clientActionId, createdAt: serverTimestamp() });
}

export async function reverseSparkMovementFirebase(firestore: Firestore, input: SparkMovementResolutionInput) {
  input = { ...input }; effectiveDate(input.effectiveAt);
  const confirmation = sparkMovementConfirmation(input);
  return runSparkOperation(firestore, identityOf(input), async (transaction, role) => {
    const original = await originalMovement(firestore, transaction, input, role);
    return { kind: 'movement_reversal', ...original, accountId: original.fromAccountId, differenceInCents: -original.originalDeltaInCents,
      effectiveAt: input.effectiveAt, note: sparkText(input.note, 2000), overdraftReason: sparkText(input.overdraftReason, 500), ...confirmation };
  }, async (transaction, material) => {
    if ((await transaction.get(claimRef(firestore, input))).exists()) throw new Error('Lançamento já estornado ou substituído.');
    const before = await position(firestore, transaction, input.groupId, material.accountId);
    const effect = await currentEffect(firestore, transaction, input.groupId, material.accountId, material.effectiveAt, material.differenceInCents);
    update(transaction, input, before, effect, material.overdraftReason); claim(transaction, firestore, input);
    return { expectedRevision: before.revision, previousOperationId: before.lastOperationId, currentEffectInCents: effect };
  });
}

/** Inverso e substituto na NOVA data, como correctMovement; mesma conta recebe somente o efeito líquido. */
export async function correctSparkMovementFirebase(firestore: Firestore, input: SparkMovementCorrectionInput) {
  input = { ...input }; const fields = movementFields(input);
  const details = sparkMovementDetailsMaterial(input.details);
  const confirmation = sparkMovementConfirmation(input);
  return runSparkOperation(firestore, identityOf(input), async (transaction, role) => {
    const original = await originalMovement(firestore, transaction, input, role);
    return { kind: 'movement_correction', ...original, toAccountId: fields.accountId, amountInCents: fields.amountInCents,
      differenceInCents: (original.movementKind === 'income' ? 1 : -1) * fields.amountInCents,
      effectiveAt: fields.effectiveAt, categoryId: fields.categoryId, note: fields.note, overdraftReason: fields.overdraftReason, ...details.material, ...confirmation };
  }, async (transaction, material) => {
    if ((await transaction.get(claimRef(firestore, input))).exists()) throw new Error('Lançamento já estornado ou substituído.');
    const from = await position(firestore, transaction, input.groupId, material.fromAccountId);
    const to = material.fromAccountId === material.toAccountId ? from : await position(firestore, transaction, input.groupId, material.toAccountId);
    const markCategory = await category(firestore, transaction, input, material.categoryId, material.movementKind);
    const fromEffect = await currentEffect(firestore, transaction, input.groupId, material.fromAccountId, material.effectiveAt, -material.originalDeltaInCents);
    const toEffect = await currentEffect(firestore, transaction, input.groupId, material.toAccountId, material.effectiveAt, material.differenceInCents);
    const saveDetails = await prepareSparkMovementDetails(firestore, transaction, input, details.details);
    markCategory(); saveDetails();
    if (from.ref.path === to.ref.path) update(transaction, input, from, fromEffect + toEffect, material.overdraftReason);
    else { update(transaction, input, from, fromEffect, material.overdraftReason); update(transaction, input, to, toEffect, material.overdraftReason); }
    claim(transaction, firestore, input);
    return { fromRevision: from.revision, toRevision: to.revision, fromPreviousOperationId: from.lastOperationId,
      toPreviousOperationId: to.lastOperationId, fromCurrentEffectInCents: fromEffect, toCurrentEffectInCents: toEffect };
  });
}
