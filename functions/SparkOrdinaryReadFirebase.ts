import { getAuth } from 'firebase/auth';
import { doc, runTransaction, Timestamp, type Firestore } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { assertSparkDocumentId, parseSparkStoredPosition, SPARK_MAX_CENTS } from './sparkFinancialProtocol';
import { createAssistantRecordFingerprint } from '../utils/assistantRecordFingerprint';
import { validateSparkMovementDetails, type SparkMovementDetails } from '../utils/sparkMovementDetails';
import type { SparkExecutionReference } from '../utils/sparkFinancialReadModel';
import { toFinancialCivilDate } from '../utils/financialCivilDate';

export type SparkEditableMovement = {
  groupId: string; readerActorId: string; reference: SparkExecutionReference; expectedFingerprint: string;
  movementKind: 'income' | 'expense'; accountId: string; amountInCents: number; effectiveAt: Timestamp;
  categoryId: string | null; details: SparkMovementDetails; personId: string;
};

/** [[Operações Ordinárias Spark]]: buscar o alvo imutável não transforma o ID visual em permissão de escrita. */
export async function readSparkOrdinaryForEditFirebase(firestore: Firestore, actorId: string, groupId: string, reference: SparkExecutionReference): Promise<SparkEditableMovement> {
  reference = { ...reference };
  if (reference.family !== 'ordinary' || !['live', 'imported'].includes(reference.source)) throw new Error('Use o fluxo específico deste lançamento.');
  assertSparkDocumentId(reference.operationId);
  const current = () => { if (getAuth(firestore.app).currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.'); };
  const context = await getSparkContextFirebase(firestore, actorId);
  if (!context || context.groupId !== groupId) throw new Error('O grupo financeiro mudou.');
  const result = await runTransaction(firestore, async transaction => {
    current();
    const group = doc(firestore, 'financialGroups', groupId), imported = reference.source === 'imported';
    const original = (await transaction.get(doc(group, imported ? 'sparkImportedIdentities' : 'sparkOperations', reference.operationId))).data();
    const resolved = await transaction.get(doc(group, imported ? 'sparkImportedClaims' : 'sparkMovementClaims', reference.operationId));
    if (!original || !['income', 'expense', 'movement_correction'].includes(original.kind)
      || imported && original.ordinaryResolutionAllowed !== true) throw new Error('Use o fluxo específico deste lançamento.');
    if (resolved.exists()) throw new Error('Este lançamento já foi estornado ou substituído. Atualize o extrato.');
    const movementKind = original.kind === 'movement_correction' ? original.movementKind : original.kind;
    const accountId = original.kind === 'movement_correction' ? original.toAccountId : original.accountId;
    assertSparkDocumentId(accountId);
    const position = parseSparkStoredPosition((await transaction.get(doc(group, 'sparkPositions', accountId))).data() ?? {});
    if (!['income', 'expense'].includes(movementKind) || position.kind === 'investment'
      || !Number.isSafeInteger(original.amountInCents) || original.amountInCents <= 0 || original.amountInCents > SPARK_MAX_CENTS) throw new Error('Lançamento precisa de reconciliação.');
    const effectiveAt = original.effectiveAt ?? original.readModel?.effectiveAt ?? original.createdAt;
    if (!(effectiveAt instanceof Timestamp)) throw new Error('Lançamento sem data efetiva válida.');
    const categoryId = original.categoryId ?? original.readModel?.categoryId ?? null;
    if (categoryId !== null) assertSparkDocumentId(categoryId);
    const note = original.note ?? original.readModel?.note ?? null;
    const details = validateSparkMovementDetails(original.hasDetails ? original.details : original.readModel?.details ?? {
      name: typeof note === 'string' && note.trim().length <= 160 && note.trim() || (movementKind === 'income' ? 'Ganho' : 'Despesa'), explanation: note,
      paymentFormats: [], moneyFormat: position.kind === 'cash',
    });
    // O indicador apresentado segue a conta, não uma flag descritiva anterior divergente.
    details.moneyFormat = position.kind === 'cash';
    current();
    return { groupId, readerActorId: actorId, reference, expectedFingerprint: createAssistantRecordFingerprint(original), movementKind,
      accountId, amountInCents: original.amountInCents, effectiveAt, categoryId, details, personId: original.actorId } as SparkEditableMovement;
  });
  if ((await getSparkContextFirebase(firestore, actorId))?.groupId !== groupId) throw new Error('O acesso financeiro mudou.');
  current(); return result;
}

export function sparkEditableMovementRecord(target: SparkEditableMovement) {
  return { name: target.details.name, explanation: target.details.explanation, paymentFormats: [...target.details.paymentFormats], moneyFormat: target.details.moneyFormat,
    valueInCents: target.amountInCents, date: toFinancialCivilDate(target.effectiveAt.toDate()), tagId: target.categoryId, bankId: target.accountId === 'cash' ? null : target.accountId,
    personId: target.personId, isSparkMovement: true, sparkExecutionReference: target.reference, sparkExpectedFingerprint: target.expectedFingerprint };
}
