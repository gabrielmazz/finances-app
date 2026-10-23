import { doc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { assertSparkBalance, assertSparkDocumentId, runSparkOperation, sparkText, type SparkIdentity } from './sparkFinancialProtocol';
import { validateSparkAccountCatalog, type SparkAccountCatalog, type SparkAccountKind } from '../utils/sparkAccountCatalog';
import { sparkAccountCatalogDocument, validateSparkLinkedBank } from './SparkAccountCatalogFirebase';

export type SparkOpeningInput = SparkIdentity & {
  accountId: string; kind: SparkAccountKind; note?: string | null; catalog?: SparkAccountCatalog;
};
export type SparkBankOpeningInput = SparkIdentity & {
  accountId: string; openingBalanceInCents: number; catalog: SparkAccountCatalog; note?: string | null; overdraftReason?: string | null;
};

/** [[Cadastros de Contas Spark]]: saldo bancário declarado, catálogo e referência inicial no mesmo commit. */
export async function openSparkBankFirebase(firestore: Firestore, input: SparkBankOpeningInput) {
  if ('date' in input || 'effectiveAt' in input || 'observedAt' in input) throw new Error('A abertura bancária usa o instante de confirmação; datas extras não são aceitas.');
  input = { ...input, openingBalanceInCents: input.openingBalanceInCents === 0 ? 0 : input.openingBalanceInCents }; assertSparkDocumentId(input.accountId);
  if (input.accountId === 'cash') throw new Error('A abertura bancária não pode substituir o Caixa.');
  const catalog = validateSparkAccountCatalog('bank', input.catalog), overdraftReason = sparkText(input.overdraftReason, 500);
  assertSparkBalance('bank', input.openingBalanceInCents, overdraftReason);
  const identity = { groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId };
  return runSparkOperation(firestore, identity, (_transaction, role) => {
    if (role !== 'admin') throw new Error('A abertura exige administrador do grupo.');
    return { kind: 'bank_opening', accountId: input.accountId, accountKind: 'bank', openingBalanceInCents: input.openingBalanceInCents,
      note: sparkText(input.note, 2000), overdraftReason, ...catalog };
  }, async transaction => {
    const group = doc(firestore, 'financialGroups', input.groupId), position = doc(group, 'sparkPositions', input.accountId);
    const catalogRef = doc(group, 'sparkAccountCatalog', input.accountId), checkpoint = doc(group, 'sparkCheckpoints', input.accountId);
    for (const ref of [position, catalogRef, checkpoint]) if ((await transaction.get(ref)).exists()) throw new Error('Esta conta já possui abertura ou cadastro.');
    transaction.set(position, { schemaVersion: 1, kind: 'bank', active: true, balanceInCents: input.openingBalanceInCents,
      revision: 0, lastOperationId: input.clientActionId, nextActivationAt: null, updatedAt: serverTimestamp() });
    transaction.set(catalogRef, sparkAccountCatalogDocument(input.actorId, 'bank', catalog, 0, input.clientActionId));
    transaction.set(checkpoint, { operationId: input.clientActionId, countedBalanceInCents: input.openingBalanceInCents, effectiveAt: serverTimestamp(), includesBoundary: false });
  });
}

/** Criação zero por identidade da conta; não deriva nem importa saldo do histórico. */
export async function openSparkAccountFirebase(firestore: Firestore, input: SparkOpeningInput) {
  input = { ...input };
  assertSparkDocumentId(input.accountId);
  if (!['bank', 'cash', 'investment'].includes(input.kind) || (input.kind === 'cash') !== (input.accountId === 'cash')) {
    throw new Error('Tipo ou identidade da conta inválidos.');
  }
  const catalog = input.catalog === undefined ? null : validateSparkAccountCatalog(input.kind, input.catalog);
  const material = { kind: 'account_opening', accountId: input.accountId,
    accountKind: input.kind, openingBalanceInCents: 0, note: sparkText(input.note, 2000), ...(catalog ?? {}) };
  return runSparkOperation(firestore, input, (_transaction, role) => {
    if (role !== 'admin') throw new Error('A abertura exige administrador do grupo.');
    return material;
  }, async transaction => {
    const ref = doc(firestore, 'financialGroups', input.groupId, 'sparkPositions', input.accountId);
    if ((await transaction.get(ref)).exists()) throw new Error('Esta conta já possui abertura.');
    const catalogRef = doc(firestore, 'financialGroups', input.groupId, 'sparkAccountCatalog', input.accountId);
    if (catalog) {
      if ((await transaction.get(catalogRef)).exists()) throw new Error('Esta conta já possui cadastro.');
      await validateSparkLinkedBank(firestore, transaction, input.groupId, input.accountId, catalog.bankAccountId);
    }
    transaction.set(ref, { schemaVersion: 1, kind: input.kind, active: true, balanceInCents: 0,
      revision: 0, lastOperationId: input.clientActionId, nextActivationAt: null, updatedAt: serverTimestamp() });
    if (catalog) transaction.set(catalogRef, sparkAccountCatalogDocument(input.actorId, input.kind, catalog, 0, input.clientActionId));
  });
}
