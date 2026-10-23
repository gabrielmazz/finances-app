import { doc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { assertSparkDocumentId, runSparkOperation, type SparkIdentity } from './sparkFinancialProtocol';
import { validateSparkRecurringMetadata, type SparkRecurringMetadata } from '../utils/sparkRecurringMetadata';

export type SparkRecurringMetadataInput = SparkIdentity & {
  planId: string; expectedMetadataRevision: number | null; metadata: SparkRecurringMetadata;
};
/** [[Conversão de Recorrências Spark]]: configuração não altera ciclos, contrato ou saldo. */
export async function saveSparkRecurringMetadataFirebase(firestore: Firestore, input: SparkRecurringMetadataInput) {
  input = { ...input }; assertSparkDocumentId(input.planId);
  const metadata = validateSparkRecurringMetadata(input.metadata);
  if (input.expectedMetadataRevision !== null && (!Number.isSafeInteger(input.expectedMetadataRevision) || input.expectedMetadataRevision < 0)) throw new Error('Revisão de metadados inválida.');
  const identity = { groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId };
  return runSparkOperation(firestore, identity, () => ({ kind: 'recurring_metadata_update', planId: input.planId,
    expectedMetadataRevision: input.expectedMetadataRevision, ...metadata }), async transaction => {
    const group = doc(firestore, 'financialGroups', input.groupId);
    const plan = (await transaction.get(doc(group, 'sparkRecurringPlans', input.planId))).data();
    const ref = doc(group, 'sparkRecurringMetadata', input.planId), existing = (await transaction.get(ref)).data();
    if (!plan || plan.actorId !== input.actorId) throw new Error('Definição indisponível ou de outro proprietário.');
    if ((existing?.revision ?? null) !== input.expectedMetadataRevision) throw new Error('Metadados alterados. Atualize a confirmação.');
    transaction.set(ref, { schemaVersion: 1, actorId: input.actorId, ...metadata, revision: (existing?.revision ?? -1) + 1,
      lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
  });
}
