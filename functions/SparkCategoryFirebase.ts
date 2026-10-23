import { doc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { assertSparkDocumentId, runSparkOperation, SPARK_MAX_CENTS, type SparkIdentity } from './sparkFinancialProtocol';
import { validateSparkCategory, type SparkCategory } from '../utils/sparkCategory';
import { createAssistantRecordFingerprint } from '../utils/assistantRecordFingerprint';
import { sparkMetadataConfirmation, type SparkMetadataConfirmation } from '../utils/sparkMetadataConfirmation';
import { prepareSparkMetadataOrigin } from './sparkMetadataOrigin';

type CategoryIdentity = SparkIdentity & SparkMetadataConfirmation & { categoryId: string; expectedRevision: number | null };
export type SparkCategoryInput = CategoryIdentity & { category: SparkCategory };
function validate(input: CategoryIdentity) {
  assertSparkDocumentId(input.categoryId);
  if (input.expectedRevision !== null && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= SPARK_MAX_CENTS)) throw new Error('Revisão de categoria inválida.');
}
export async function saveSparkCategoryFirebase(firestore: Firestore, input: SparkCategoryInput) {
  input = { ...input }; validate(input); const category = validateSparkCategory(input.category);
  const ref = doc(firestore, 'tags', input.categoryId);
  const confirmation = sparkMetadataConfirmation(input);
  return runSparkOperation(firestore, input, () => ({ kind: 'category_save', categoryId: input.categoryId, expectedRevision: input.expectedRevision, ...confirmation, ...category }), async transaction => {
    const previous = (await transaction.get(ref)).data();
    if (previous && (previous.personId !== input.actorId || previous.groupId && previous.groupId !== input.groupId || previous.deleted === true)) throw new Error('Categoria indisponível ou de outro proprietário.');
    if ((previous?.revision ?? null) !== input.expectedRevision) throw new Error('A categoria mudou. Atualize a confirmação.');
    if (confirmation.expectedFingerprint && (!previous || createAssistantRecordFingerprint(previous) !== confirmation.expectedFingerprint)) throw new Error('A categoria mudou após a confirmação.');
    const preserveOrigin = await prepareSparkMetadataOrigin(firestore, transaction, input, 'category', input.categoryId, previous);
    preserveOrigin();
    transaction.set(ref, { schemaVersion: 1, personId: input.actorId, groupId: input.groupId, ...category,
      historyKnown: previous ? previous.historyKnown === true : true, deleted: false,
      revision: (previous?.revision ?? -1) + 1, lastOperationId: input.clientActionId,
      createdAt: previous?.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() });
  });
}
/** [[Categorias e CDI Spark]]: a marca permanente de uso não pode ser removida pelo cliente. */
export async function deleteSparkCategoryFirebase(firestore: Firestore, input: CategoryIdentity) {
  input = { ...input }; validate(input);
  const confirmation = sparkMetadataConfirmation(input);
  return runSparkOperation(firestore, input, () => ({ kind: 'category_delete', categoryId: input.categoryId, expectedRevision: input.expectedRevision, ...confirmation }), async transaction => {
    const ref = doc(firestore, 'tags', input.categoryId), previous = (await transaction.get(ref)).data();
    if (!previous || previous.personId !== input.actorId || previous.groupId !== input.groupId || previous.deleted) throw new Error('Categoria indisponível ou de outro proprietário.');
    if (previous.revision !== input.expectedRevision) throw new Error('A categoria mudou. Atualize a confirmação.');
    if (confirmation.expectedFingerprint && createAssistantRecordFingerprint(previous) !== confirmation.expectedFingerprint) throw new Error('A categoria mudou após a confirmação.');
    if (previous.historyKnown !== true) throw new Error('Conclua o inventário dos vínculos antigos antes de excluir esta categoria.');
    if ((await transaction.get(doc(firestore, 'sparkCategoryReferences', input.categoryId))).exists()) throw new Error('A categoria possui registros vinculados e não pode ser excluída.');
    transaction.update(ref, { deleted: true, revision: previous.revision + 1, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
  });
}
