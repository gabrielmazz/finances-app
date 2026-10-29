import type { LegacyMigrationInput } from '../../../utils/financialLedgerMigration';
import { reconcileSparkLegacySnapshot } from '../../../utils/sparkFinancialReconciliation';
import { endOfFinancialCivilDay } from '../../../utils/financialCivilDate';
import { decodeSparkFinancialValue, parseSparkInstant } from './sparkBootstrapPreflight';
import { digest, inventorySnapshot, LocalSnapshotError, type Fields, type LocalSnapshot } from './sparkLocalSnapshot';

/** [[Importação Financeira Local Spark]]: normalização diagnóstica; nunca alimenta o writer do razão. */
export function normalizeSparkLegacy(snapshot: LocalSnapshot, scope: unknown) {
  const inventory = inventorySnapshot(snapshot);
  const allowed = ['schemaVersion', 'groupId', 'memberIds', 'asOf', 'confirmedCashBalanceInCents', 'confirmedAt', 'observedInvestmentBalancesInCents'];
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || Object.keys(scope).some(key => !allowed.includes(key))) throw new LocalSnapshotError('Escopo legado inválido.');
  const spec = scope as Record<string, any>;
  const id = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 160 && !value.includes('/') && !['.', '..'].includes(value);
  if (spec.schemaVersion !== 1 || !id(spec.groupId) || !Array.isArray(spec.memberIds) || spec.memberIds.length === 0
    || !spec.memberIds.every(id) || new Set(spec.memberIds).size !== spec.memberIds.length
    || !Number.isSafeInteger(spec.confirmedCashBalanceInCents) || Math.abs(spec.confirmedCashBalanceInCents) > 1e12) throw new LocalSnapshotError('Membros, caixa ou versão do escopo inválidos.');
  const asOf = parseSparkInstant(spec.asOf), confirmedAt = parseSparkInstant(spec.confirmedAt), cutoff = endOfFinancialCivilDay(asOf);
  const observations = spec.observedInvestmentBalancesInCents ?? {};
  if (!observations || typeof observations !== 'object' || Array.isArray(observations)
    || Object.entries(observations).some(([key, value]) => !id(key) || !Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 1e12)) throw new LocalSnapshotError('Observações independentes de investimento inválidas.');
  const issues: Array<{ code: string; id: string; detail: string }> = [];
  const issue = (code: string, source: string, detail: string) => issues.push({ code, id: source, detail });
  if (cutoff.valueOf() > Date.parse(snapshot.capturedAt) || confirmedAt > cutoff || confirmedAt.valueOf() > Date.parse(snapshot.capturedAt)) issue('unobserved-cutoff', spec.groupId, 'Fechamento/conferência posterior à captura ou ao corte.');
  for (const memberId of spec.memberIds) {
    if (inventory.users.find(user => user.uid === memberId)?.storageModel !== 'legacy') issue('non-legacy-member', memberId, 'Perfil ausente, já migrado ou com estado desconhecido.');
  }
  if (inventory.groups.some(group => group.groupId === spec.groupId)) issue('existing-destination-group', spec.groupId, 'Não reutilizar grupo existente na proposta legada.');
  const sources: Array<{ path: string; ownerId: string; actorId: string; dateField: string | null; documentSha256: string }> = [];
  const memberIds = new Set<string>(spec.memberIds);
  const collectionRows = new Map<string, LocalSnapshot['documents']>();
  for (const row of snapshot.documents) {
    const parts = row.path.split('/');
    if (parts.length !== 2) continue;
    const list = collectionRows.get(parts[0]) ?? [];
    list.push(row); collectionRows.set(parts[0], list);
  }
  // Não descarte um documento de outro titular antes de conferir se um alias aponta ao escopo.
  const scopedOwner = (row: LocalSnapshot['documents'][number]): string | null => {
    const owner = row.fields.personId?.stringValue;
    const hasAlias = Object.hasOwn(row.fields, 'userId');
    const alias = row.fields.userId?.stringValue;
    if (typeof owner !== 'string' || !owner) {
      issue('unscoped-legacy-source', row.path, 'Documento sem personId explícito.');
      return null;
    }
    if (hasAlias && (typeof alias !== 'string' || !alias || alias !== owner)) {
      if (typeof alias !== 'string' || !alias || memberIds.has(owner) || memberIds.has(alias))
        issue('conflicting-legacy-owner', row.path, 'Titulares personId e userId são divergentes ou inválidos.');
      return null;
    }
    return memberIds.has(owner) ? owner : null;
  };
  const rows = <T>(collection: string, mapper: (read: (name: string) => any, id: string, date: () => Date) => T): T[] => {
    const result: T[] = [];
    for (const row of collectionRows.get(collection) ?? []) {
      const owner = scopedOwner(row);
      if (owner === null) continue;
      try {
        const read = (name: string): any => Object.hasOwn(row.fields, name) ? decodeSparkFinancialValue(row.fields[name]) : undefined;
        if (row.fields.userId && read('userId') !== owner) throw new Error();
        const actorId = read('actorId') ?? owner;
        if (!id(actorId)) throw new Error();
        let dateField: string | null = null;
        const date = () => {
          dateField = row.fields.date && row.fields.date.nullValue !== null ? 'date' : 'createdAt';
          const value = read(dateField);
          if (!(value instanceof Date) || value.valueOf() < 0) throw new Error(); return value;
        };
        const value = mapper(read, row.path.split('/')[1], date);
        result.push(value); sources.push({ path: row.path, ownerId: owner, actorId, dateField, documentSha256: digest(row.fields) });
      } catch { issue('unsupported-legacy-schema', row.path, 'Tipo, autoria, precisão, unidade ou campo obrigatório inválido; documento não aprovado.'); }
    }
    return result;
  };
  const text = (value: unknown): string => { if (typeof value !== 'string' || !value) throw new Error(); return value; };
  const optionalText = (value: unknown): string | null => value == null ? null : text(value);
  const cents = (value: unknown): number => { if (!Number.isSafeInteger(value) || Math.abs(Number(value)) > 1e12) throw new Error(); return Number(value); };
  const flag = (value: unknown) => { if (value !== undefined && typeof value !== 'boolean') throw new Error(); return value; };
  const movement = (read: (name: string) => any, id: string, date: () => Date, direction: 'expense' | 'gain') => {
    const isBankTransfer = flag(read('isBankTransfer')), transferId = optionalText(read('bankTransferPairId'));
    const deposit = flag(read('isInvestmentDeposit')), redemption = flag(read('isInvestmentRedemption')), investmentId = optionalText(read('investmentId'));
    if (isBankTransfer && !transferId) issue('unidentified-transfer-counterpart', id, 'Contraparte marcada como transferência exige par identificável.');
    if (direction === 'expense' && redemption || direction === 'gain' && deposit || (isBankTransfer || transferId) && (deposit || redemption)) issue('conflicting-financial-classification', id, 'Tipo especial incompatível com a direção ou com o par declarado.');
    if (investmentId && !deposit && !redemption) issue('unclassified-investment-reference', id, 'Referência de investimento sem classificação financeira explícita.');
    if (flag(read('isBalanceAdjustment'))) issue('editable-adjustment-normalization-required', id, 'Movimento marcado como ajuste exige identidade e resolução próprias.');
    return { id, bankId: optionalText(read('bankId')),
    amountInCents: cents(read('valueInCents')), effectiveAt: date(), categoryId: optionalText(read('tagId')),
    note: optionalText(read('explanation')) ?? optionalText(read('name')), transferId, isBankTransfer,
    investmentId, isInvestmentDeposit: deposit, isInvestmentRedemption: redemption,
    isFinanceInvestment: flag(read('isFinanceInvestment')), isFinanceInvestmentSync: flag(read('isFinanceInvestmentSync')) };
  };
  const input: LegacyMigrationInput = {
    groupId: spec.groupId, memberIds: spec.memberIds,
    banks: rows('banks', (read, id) => ({ id, name: text(read('name')), colorHex: optionalText(read('colorHex')) })),
    expenses: rows('expenses', (read, id, date) => movement(read, id, date, 'expense')), gains: rows('gains', (read, id, date) => movement(read, id, date, 'gain')),
    bankTransfers: rows('bankTransfers', (read, id, date) => ({ id, fromBankId: text(read('sourceBankId')), toBankId: text(read('targetBankId')),
      amountInCents: cents(read('valueInCents')), effectiveAt: date(), expenseId: text(read('expenseId')), gainId: text(read('gainId')) })),
    cashRescues: rows('cashRescues', (read, id, date) => ({ id, bankId: text(read('bankId')), amountInCents: cents(read('valueInCents')), effectiveAt: date(), note: optionalText(read('description')) })),
    investments: rows('financeInvestments', (read, id, date) => {
      const current = read('initialValueInCents'), previous = read('initialInvestedInCents');
      if (current !== undefined && previous !== undefined && current !== previous) throw new Error();
      return { id, name: text(read('name')), bankId: optionalText(read('bankId')), initialValueInCents: cents(current ?? previous), effectiveAt: date() };
    }),
    monthlyBalances: rows('monthlyBalances', (read, id) => ({ id, bankId: text(read('bankId')), year: cents(read('year')), month: cents(read('month')), balanceInCents: cents(read('valueInCents')) })),
    balanceAdjustments: rows('bankBalanceAdjustments', (read, id, date) => {
      issue('editable-adjustment-normalization-required', id, 'Original/inverso/substituição precisam de identidade e resolução preservadas; não filtrar por status.');
      return { id, bankId: text(read('bankId')), differenceInCents: cents(read('differenceInCents')), effectiveAt: date(), note: optionalText(read('description')) };
    }),
    confirmedCashBalanceInCents: spec.confirmedCashBalanceInCents, confirmedAt,
  };
  // Um membro não selecionado pode ter escrito numa conta compartilhada do escopo.
  // Ignorar essa fonte poderia produzir um saldo aparentemente reconciliado, mas incompleto.
  const scopedBankIds = new Set(input.banks.map(bank => bank.id));
  const bankReferenceFields: Record<string, string[]> = {
    expenses: ['bankId'], gains: ['bankId'], monthlyBalances: ['bankId'], cashRescues: ['bankId'],
    financeInvestments: ['bankId'], financeInvestmentSyncs: ['bankId'], bankBalanceAdjustments: ['bankId'],
    bankTransfers: ['sourceBankId', 'targetBankId'],
  };
  for (const row of snapshot.documents) {
    const parts = row.path.split('/'), fields = Object.hasOwn(bankReferenceFields, parts[0]) ? bankReferenceFields[parts[0]] : undefined;
    const owner = row.fields.personId?.stringValue;
    if (parts.length !== 2 || !fields || typeof owner !== 'string' || memberIds.has(owner)) continue;
    if (fields.some(name => typeof row.fields[name]?.stringValue === 'string' && scopedBankIds.has(row.fields[name].stringValue as string)))
      issue('cross-scope-financial-source', row.path, 'Fonte de titular fora do escopo referencia banco selecionado; revise vínculos e participantes.');
  }
  const investmentIds = new Set(input.investments.map(investment => investment.id));
  for (const observationId of Object.keys(observations)) if (!investmentIds.has(observationId)) issue('unmatched-investment-observation', observationId, 'Observação independente aponta para investimento ausente no escopo.');
  for (const row of collectionRows.get('financeInvestmentSyncs') ?? []) {
    if (scopedOwner(row) !== null) issue('investment-sync-normalization-required', row.path, 'Sincronização exige adaptador de identidade/contrapartida próprio.');
  }
  for (const row of collectionRows.get('investments') ?? []) {
    if (scopedOwner(row) !== null) issue('obsolete-investment-normalization-required', row.path, 'Investimento da coleção antiga exige conversão e reconciliação específicas.');
  }
  let reconciliation: ReturnType<typeof reconcileSparkLegacySnapshot> | null = null;
  try { reconciliation = reconcileSparkLegacySnapshot({ ...input, asOf, observedInvestmentBalancesInCents: observations }); issues.push(...reconciliation.issues); }
  catch { issue('invalid-legacy-contract', spec.groupId, 'Normalização não atende ao reconciliador; não aprovar descartando documentos.'); }
  const sourcesByPath = new Map(sources.map(source => [source.path, source]));
  for (const account of reconciliation?.accounts ?? []) for (const entry of account.entries) if (entry.kind === 'movement') {
    const attribution = entry.sourceReferences?.map(reference => sourcesByPath.get(`${reference.collection}/${reference.id}`)).find(Boolean);
    entry.actorId = attribution?.actorId;
    if (!attribution) issue('unknown-legacy-actor', entry.id, 'Não atribuir a operação ao primeiro membro da migração.');
  }
  return { schemaVersion: 1, mode: 'legacy-diagnostic', snapshotSha256: snapshot.sha256, proposedGroupId: spec.groupId,
    cutoff, temporalPolicy: 'financial-civil-day-end', normalizedSha256: digest({ input, asOf, observations }), normalized: input,
    sources, issues, canReviewNormalization: issues.length === 0, canApply: false, readyForCutover: false, reconciliation,
    authorshipPolicy: 'original-source-actor-index-not-migration-operator',
    pending: ['unknown-before-first-opening', 'native-operation-identities-and-claims', 'recurring-and-account-metadata', 'member-consent', 'legacy-writer-cutover'] };
}
