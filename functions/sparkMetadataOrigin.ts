import { doc, serverTimestamp, type Firestore, type Transaction } from 'firebase/firestore';
import type { SparkIdentity } from './sparkFinancialProtocol';

/** [[Categorias e CDI Spark]]: conservar o documento legado inteiro antes de normalizar seus campos. */
export async function prepareSparkMetadataOrigin(firestore: Firestore, transaction: Transaction, input: SparkIdentity,
  domain: 'category' | 'cdi', recordId: string, previous: Record<string, unknown> | undefined) {
  if (!previous) return () => {};
  if (previous.schemaVersion === 1) {
    const fields = domain === 'category'
      ? ['schemaVersion', 'personId', 'groupId', 'name', 'usageType', 'isMandatoryExpense', 'isMandatoryGain', 'showInBothLists', 'iconFamily', 'iconName', 'iconStyle', 'historyKnown', 'deleted', 'revision', 'lastOperationId', 'createdAt', 'updatedAt']
      : ['schemaVersion', 'personId', 'groupId', 'annualRateInBasisPoints', 'effectiveFrom', 'revision', 'lastOperationId', 'createdAt', 'updatedAt'];
    if (previous.groupId !== input.groupId || Object.keys(previous).length !== fields.length || fields.some(key => !Object.hasOwn(previous, key))) {
      throw new Error('Formato de metadados desconhecido; conclua o inventário antes da edição.');
    }
    return () => {};
  }
  if (previous.schemaVersion !== undefined) throw new Error('Formato de metadados desconhecido; conclua o inventário antes da edição.');
  const ref = doc(firestore, 'financialGroups', input.groupId, 'sparkMetadataOrigins', `${domain}_${recordId}`);
  if ((await transaction.get(ref)).exists()) throw new Error('A origem dos metadados precisa de revisão antes da edição.');
  return () => transaction.set(ref, { schemaVersion: 1, domain, recordId, source: previous, operationId: input.clientActionId, createdAt: serverTimestamp() });
}
