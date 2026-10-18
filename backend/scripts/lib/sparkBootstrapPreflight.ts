import { reconcileSparkLedgerSnapshot } from '../../../utils/sparkFinancialReconciliation';
import type { AccountReconciliation, LedgerTransaction } from '../../../utils/financialLedger';
import type { FinancialAccountSeed } from '../../../utils/financialLedgerMigration';
import { digest, inventorySnapshot, LocalSnapshotError, type Fields, type LocalSnapshot } from './sparkLocalSnapshot';

export function parseSparkInstant(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value.slice(0, 19) + 'Z').toISOString().slice(0, 19) !== value.slice(0, 19)
    || Date.parse(value) < 0) throw new LocalSnapshotError('Informe instante ISO válido, com fuso e precisão de até milissegundos.');
  return new Date(value);
}

export function decodeSparkFinancialValue(value: Record<string, any>): any {
  if ('integerValue' in value) {
    const number = Number(value.integerValue);
    if (!Number.isSafeInteger(number)) throw new Error('Inteiro fora da precisão do reconciliador.');
    return number;
  }
  if ('timestampValue' in value) {
    const fraction = value.timestampValue.match(/\.(\d+)Z$/)?.[1] ?? '';
    if (/[1-9]/.test(fraction.slice(3))) throw new Error('Data financeira tem precisão inferior a milissegundo.');
    return new Date(value.timestampValue);
  }
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decodeSparkFinancialValue(item as Fields[string])]));
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeSparkFinancialValue);
  for (const key of ['stringValue', 'booleanValue', 'nullValue']) if (key in value) return value[key];
  throw new Error('Tipo não normalizável para o contrato financeiro.');
}
function selected(fields: Fields, names: string[]) {
  return Object.fromEntries(names.filter(name => Object.hasOwn(fields, name)).map(name => [name, decodeSparkFinancialValue(fields[name])]));
}

/** Candidato local ligado ao bruto. Nunca grava posições, marcadores, consentimentos ou papéis. */
export function prepareSparkBootstrap(snapshot: LocalSnapshot, groupId: string, asOf: Date) {
  const inventory = inventorySnapshot(snapshot);
  if (!groupId || groupId.includes('/') || groupId.length > 160 || !Number.isFinite(asOf.valueOf()) || asOf.valueOf() < 0) throw new LocalSnapshotError('Grupo ou instante de preparação inválido.');
  const issues: Array<{ code: string; id: string; detail: string }> = [];
  const issue = (code: string, id: string, detail: string) => issues.push({ code, id, detail });
  if (asOf.valueOf() > Date.parse(snapshot.capturedAt)) issue('future-cutoff', groupId, 'Instante de preparação posterior à captura.');
  const group = snapshot.documents.find(row => row.path === `financialGroups/${groupId}`);
  const members = group?.fields.members?.mapValue as { fields?: Fields } | undefined;
  const relatedUsers = new Set(Object.keys(members?.fields ?? {}));
  for (const row of snapshot.documents) if (/^(users|financialCutovers)\/[^/]+$/.test(row.path)
    && (row.fields.financialGroupId?.stringValue === groupId || row.fields.groupId?.stringValue === groupId)) relatedUsers.add(row.path.split('/')[1]);
  for (const item of inventory.issues) if (item.path === `financialGroups/${groupId}`
    || /^(users|financialCutovers)\/[^/]+$/.test(item.path) && relatedUsers.has(item.path.split('/')[1])) {
    issue('inventory-' + item.code, item.path, 'Conflito de identidade detectado no inventário; revisar o bruto antes de preparar.');
  }
  if (!group) issue('missing-group', groupId, 'Grupo não consta no bruto. Legado sem grupo exige inventário e normalização próprios.');
  if (group?.fields.status?.stringValue !== 'active') issue('inactive-group', groupId, 'Grupo precisa de estado ativo conhecido.');
  if (group?.fields.sparkProtocol) issue('already-spark', groupId, 'Não reinicializar grupo com protocolo Spark.');
  if (!members?.fields || !Object.values(members.fields).some(role => role.stringValue === 'admin')) issue('invalid-members', groupId, 'Papéis protegidos ausentes ou sem administrador.');
  for (const [uid, role] of Object.entries(members?.fields ?? {})) {
    const profile = snapshot.documents.find(row => row.path === `users/${uid}`);
    const cutover = snapshot.documents.find(row => row.path === `financialCutovers/${uid}`);
    if (!['admin', 'member'].includes(role.stringValue as string) || profile?.fields.financialGroupId?.stringValue !== groupId
      || profile?.fields.financialGroupRole?.stringValue !== role.stringValue || cutover?.fields.groupId?.stringValue !== groupId) {
      issue('membership-mismatch', uid, 'Grupo, perfil, papel ou corte divergem; nenhuma correção automática.');
    }
  }
  const rows = (collection: string, names: string[]) => snapshot.documents.filter(row => {
    if (row.path.split('/').length !== 2 || row.path.split('/')[0] !== collection) return false;
    if (typeof row.fields.groupId?.stringValue !== 'string') issue('unscoped-source', row.path, 'Documento financeiro sem grupo identificável.');
    return row.fields.groupId?.stringValue === groupId;
  }).flatMap(row => {
    try { return [{ ...selected(row.fields, names), id: row.path.split('/')[1] }]; }
    catch { issue('unsupported-normalization', row.path, 'Tipo, inteiro ou precisão de data exige normalização explícita.'); return []; }
  });
  const accounts = rows('financialAccounts', ['groupId', 'kind', 'name', 'currentBalanceInCents', 'legacyBankId', 'legacyInvestmentId']) as FinancialAccountSeed[];
  const transactions = rows('ledgerTransactions', ['groupId', 'kind', 'effectiveAt', 'actorId', 'clientActionId', 'legs', 'categoryId', 'note', 'overdraftReason', 'reversesTransactionId', 'sourceReferences']) as LedgerTransaction[];
  const reconciliations = rows('accountReconciliations', ['groupId', 'accountId', 'effectiveAt', 'countedBalanceInCents', 'differenceInCents', 'source', 'transactionId', 'legacyApproximation']) as AccountReconciliation[];
  if (!accounts.length) issue('missing-accounts', groupId, 'Não há contas do razão para conferir; legado não é convertido implicitamente.');
  const accountIds = new Set(accounts.map(account => account.id));
  const aliases = new Set<string>();
  for (const account of accounts) {
    const alias = account.kind + ':' + (account.kind === 'cash' ? 'cash' : account.legacyBankId ?? account.legacyInvestmentId ?? account.id);
    if (aliases.has(alias)) issue('duplicate-account-source', account.id, 'Duas contas representam a mesma origem.'); aliases.add(alias);
  }
  for (const event of transactions) {
    if (event.sourceReferences != null && !Array.isArray(event.sourceReferences)) {
      issue('invalid-source-references', event.id, 'Lista de referências inválida.'); continue;
    }
    for (const reference of event.sourceReferences ?? []) {
      if (!reference || typeof reference.collection !== 'string' || typeof reference.id !== 'string'
        || reference.collection.includes('/') || reference.id.includes('/')
        || !snapshot.documents.some(row => row.path === `${reference.collection}/${reference.id}`)) {
        issue('missing-source-reference', event.id, 'Referência original não encontrada no bruto.');
      }
    }
    if (event.kind === 'reconciliation_adjustment' || event.sourceReferences?.some(ref => ref?.collection === 'bankBalanceAdjustments')) {
      issue('adjustment-normalization-required', event.id, 'Ajuste editável exige preservar identidade, resolução e termos compostos antes de inicializar.');
    }
    if (event.reversesTransactionId && !transactions.some(original => original.id === event.reversesTransactionId)) issue('missing-reversed-event', event.id, 'Evento original do estorno ausente.');
  }
  for (const opening of reconciliations) {
    if (!accountIds.has(opening.accountId)) issue('orphan-opening', opening.id, 'Reconciliação sem conta.');
  }
  for (const row of snapshot.documents) if (/^bankBalanceAdjustments\/[^/]+$/.test(row.path)
    && (row.fields.groupId?.stringValue === groupId || [row.fields.personId?.stringValue, row.fields.userId?.stringValue]
      .some(uid => typeof uid === 'string' && relatedUsers.has(uid)))) {
    issue('adjustment-normalization-required', row.path, 'O bruto contém ajustes editáveis fora do contrato normalizado.');
  }
  let reconciliation: ReturnType<typeof reconcileSparkLedgerSnapshot> | null = null;
  try { reconciliation = reconcileSparkLedgerSnapshot({ groupId, asOf, accounts, transactions, reconciliations }); issues.push(...reconciliation.issues); }
  catch { issue('invalid-ledger-schema', groupId, 'Contrato bruto incompleto ou inválido; nenhuma entrada é descartada para aprovar o saldo.'); }
  return { schemaVersion: 1, mode: 'dry-run' as const, snapshotSha256: snapshot.sha256, groupId, asOf,
    normalizedSha256: digest({ groupId, asOf, accounts, transactions, reconciliations }),
    normalized: { accounts, transactions, reconciliations },
    sourceCompleteness: inventory.sourceCompleteness, issues, canReviewInitialization: issues.length === 0,
    canApply: false, readyForCutover: false, writes: [],
    pending: ['reviewed-raw-normalization', 'restore-rehearsal-for-this-snapshot', 'preserve-account-lifecycle-and-editable-identities', 'consent-and-old-writer-cutover', 'reviewed-bootstrap-writer'],
    reconciliation };
}
