import { doc, serverTimestamp, type Firestore, type Transaction } from 'firebase/firestore';
import { assertSparkDocumentId, parseSparkPosition, runSparkOperation, type SparkIdentity } from './sparkFinancialProtocol';
import { validateSparkAccountCatalog, type SparkAccountCatalog, type SparkAccountKind } from '../utils/sparkAccountCatalog';

export type SparkAccountCatalogInput = SparkIdentity & {
  accountId: string; accountKind: SparkAccountKind; expectedCatalogRevision: number | null; catalog: SparkAccountCatalog;
};

export async function validateSparkLinkedBank(firestore: Firestore, transaction: Transaction, groupId: string, accountId: string, bankId: string | null) {
  if (bankId === null) return;
  if (bankId === accountId) throw new Error('O banco vinculado deve ser outra conta bancária do grupo.');
  const bank = (await transaction.get(doc(firestore, 'financialGroups', groupId, 'sparkPositions', bankId))).data();
  if (!bank || bank.kind !== 'bank' || !bank.active) throw new Error('Banco vinculado indisponível neste grupo.');
}

export function sparkAccountCatalogDocument(actorId: string, accountKind: SparkAccountKind, catalog: SparkAccountCatalog, revision: number, operationId: string) {
  return { schemaVersion: 1, actorId, accountKind, ...catalog, revision, lastOperationId: operationId, updatedAt: serverTimestamp() };
}

/** Compartilhado por Web/mobile/assistente; altera somente a descrição, sem tocar a cadeia de saldo. */
export async function saveSparkAccountCatalogFirebase(firestore: Firestore, input: SparkAccountCatalogInput) {
  input = { ...input }; assertSparkDocumentId(input.accountId);
  const catalog = validateSparkAccountCatalog(input.accountKind, input.catalog);
  if (input.expectedCatalogRevision !== null && (!Number.isSafeInteger(input.expectedCatalogRevision)
    || input.expectedCatalogRevision < 0 || input.expectedCatalogRevision >= 1_000_000_000_000)) throw new Error('Revisão de cadastro inválida.');
  const identity = { groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId };
  return runSparkOperation(firestore, identity, (_transaction, role) => {
    if (role !== 'admin') throw new Error('O cadastro de contas exige administrador do grupo.');
    return { kind: 'account_catalog_update', accountId: input.accountId, accountKind: input.accountKind,
      expectedCatalogRevision: input.expectedCatalogRevision, ...catalog };
  }, async transaction => {
    const group = doc(firestore, 'financialGroups', input.groupId);
    const position = (await transaction.get(doc(group, 'sparkPositions', input.accountId))).data();
    const ref = doc(group, 'sparkAccountCatalog', input.accountId), existing = (await transaction.get(ref)).data();
    if (!position || parseSparkPosition(position).kind !== input.accountKind) throw new Error('Conta indisponível ou de outro tipo.');
    if ((existing?.revision ?? null) !== input.expectedCatalogRevision) throw new Error('Cadastro alterado. Atualize a confirmação.');
    await validateSparkLinkedBank(firestore, transaction, input.groupId, input.accountId, catalog.bankAccountId);
    transaction.set(ref, sparkAccountCatalogDocument(input.actorId, input.accountKind, catalog, (existing?.revision ?? -1) + 1, input.clientActionId));
  });
}
