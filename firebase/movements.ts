import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, runTransaction, serverTimestamp, startAfter, Timestamp, where, type QueryConstraint } from 'firebase/firestore';
import type { AccountClient } from './profiles';
import { bankContextKey, readBank, requireBankEnvironment, requireBankReadEnvironment } from './banks';
import { OFFICIAL_PROJECT_ID } from './config';
import { measureRead } from './diagnostics';
import { readCategory, resolveHistoricalCategory } from './categories';
import { categorySupports } from '../domain/categories';
import { parseBank, type BankScope } from '../domain/banks';
import { validCents } from '../domain/money';
import { financialDayStart, toFinancialCivilDate } from '../utils/financialCivilDate';
import { isTagVisibleInRegularUsageList } from '../utils/tagUsage';
import { getCycleKeyFromDate } from '../utils/mandatoryExpenses';
import { civilDate, mandatoryAmount } from '../domain/mandatory';
import { mandatoryRef, parseMandatory } from './mandatory';
import { movementDate, movementEffect, validateBankOperation, validateMovement, type BankLedgerInput, type BankOperationInput, type BankTransferInput, type LedgerEntry, type LedgerInput, type Movement, type MovementInput } from '../domain/movements';

function movements(client: AccountClient, scope: BankScope) {
  requireBankReadEnvironment(client, scope);
  return collection(client.db, 'financialContexts', bankContextKey(scope), 'movements');
}
function movementRef(client: AccountClient, scope: BankScope, id: string) {
  if (!/^[A-Za-z0-9]{20}(-credit|-\d{4}-(0[1-9]|1[0-2]))?$/.test(id)) throw Error('movements/invalid-id');
  return doc(movements(client, scope), id);
}
function accountRef(client: AccountClient, scope: BankScope, id: string) {
  if (!/^[A-Za-z0-9]{20}$/.test(id)) throw Error('movements/invalid-account');
  return doc(client.db, 'financialContexts', bankContextKey(scope), 'bankAccounts', id);
}
function parseLedgerEntry(id: string, data: Record<string, any>, scope: BankScope): LedgerEntry {
  if (data.scopeKind !== scope.kind || data.scopeId !== scope.id || data.schemaVersion !== 1 || !['posted', 'cancelled'].includes(data.status) || !Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.date?.toDate !== 'function') throw Error('movements/incompatible');
  const common = { name: data.name, type: data.type, amountCents: data.amountCents, accountId: data.accountId, date: data.date.toDate().toISOString().slice(0, 10), explanation: data.explanation, paymentFormats: data.paymentFormats };
  const metadata = { id, status: data.status, revision: data.revision };
  if (data.operation === undefined) return { ...metadata, ...validateMovement({ ...common, categoryId: data.categoryId, categorySource: data.categorySource, ...(data.isFromMandatory === true ? { isFromMandatory: true } : {}) }) };
  const operation: unknown = data.operation;
  const bankOperation = { ...common, ...validateBankOperation(common) };
  if (operation === 'cash-withdrawal' && data.type === 'expense') return { ...metadata, ...bankOperation, operation };
  if ((operation === 'transfer-out' || operation === 'transfer-in') && data.type === (operation === 'transfer-out' ? 'expense' : 'gain') && /^[A-Za-z0-9]{20}$/.test(data.transferId)) {
    return { ...metadata, ...bankOperation, operation, transferId: data.transferId };
  }
  throw Error('movements/incompatible');
}
function parseMovement(id: string, data: Record<string, any>, scope: BankScope): Movement {
  const entry = parseLedgerEntry(id, data, scope);
  if ('operation' in entry) throw Error('movements/unsupported-edit');
  return entry;
}
async function checkCategory(client: AccountClient, scope: BankScope, value: MovementInput) {
  const category = await readCategory(client, scope, { id: value.categoryId, source: value.categorySource });
  const mandatory = value.type === 'gain' ? category.isMandatoryGain : category.isMandatoryExpense;
  if (!categorySupports(category, value.type) || (value.isFromMandatory && !mandatory)) throw Error('movements/invalid-category');
  return mandatory && !isTagVisibleInRegularUsageList(category, value.type);
}

function matchesPostedInput(entry: LedgerEntry, expected: LedgerInput) {
  const { id, status, revision, ...current } = entry;
  return status === 'posted' && Object.keys(current).length === Object.keys(expected).length
    && Object.entries(current).every(([key, value]) => JSON.stringify(value) === JSON.stringify(Reflect.get(expected, key)));
}
// A competing commit can reach Rules before the SDK reports ABORTED. Retry
// only when a server-confirmed account revision actually changed.
async function withBalanceRetry<T>(client: AccountClient, scope: BankScope, action: (observe: (id: string, revision: number) => void) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const observed = new Map<string, number>();
    try { return await action((id, revision) => observed.set(id, revision)); }
    catch (error) {
      if (attempt >= 2 || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'permission-denied' || !observed.size) throw error;
      let changed = false;
      try {
        for (const [id, revision] of observed) {
          const latest = await getDocFromServer(accountRef(client, scope, id));
          if (latest.exists() && (latest.data().balanceRevision ?? 0) !== revision) changed = true;
        }
      } catch { throw error; }
      if (!changed) throw error;
    }
  }
}
export function newMovementId(client: AccountClient, scope: BankScope) {
  requireBankEnvironment(client, scope);
  return doc(movements(client, scope)).id;
}
export async function readMovement(client: AccountClient, scope: BankScope, id: string) {
  const snap = await getDocFromServer(movementRef(client, scope, id));
  requireBankReadEnvironment(client, scope);
  if (!snap.exists()) throw Error('movements/not-found');
  return parseMovement(snap.id, snap.data(), scope);
}
export type MovementCursor = { date: Date; id: string };
export async function readMovementPage(client: AccountClient, scope: BankScope, filters: { accountId?: string; type?: MovementInput['type']; from?: Date; to?: Date }, cursor?: MovementCursor | null) {
  const constraints: QueryConstraint[] = [where('status', '==', 'posted')];
  if (filters.accountId) constraints.push(where('accountId', '==', filters.accountId));
  if (filters.type) constraints.push(where('type', '==', filters.type));
  if (filters.from) constraints.push(where('date', '>=', Timestamp.fromDate(filters.from)));
  if (filters.to) constraints.push(where('date', '<', Timestamp.fromDate(filters.to)));
  constraints.push(orderBy('date', 'desc'), orderBy(documentId()), limit(20));
  if (cursor) constraints.push(startAfter(Timestamp.fromDate(cursor.date), cursor.id));
  const snap = await getDocsFromServer(query(movements(client, scope), ...constraints));
  requireBankReadEnvironment(client, scope);
  const items = snap.docs.map(item => parseLedgerEntry(item.id, item.data(), scope));
  const last = items.at(-1);
  return { items, cursor: snap.size === 20 && last ? { date: movementDate(last.date), id: last.id } : null };
}
export async function createMovement(client: AccountClient, scope: BankScope, id: string, input: MovementInput) {
  requireBankEnvironment(client, scope);
  if (!/^[A-Za-z0-9]{20}$/.test(id)) throw Error('movements/invalid-id');
  const value = validateMovement(input);
  const existing = await getDocFromServer(movementRef(client, scope, id));
  requireBankEnvironment(client, scope);
  if (existing.exists()) {
    const current = parseMovement(id, existing.data(), scope);
    if (!value.isFromMandatory && current.isFromMandatory) value.isFromMandatory = true;
    if (!matchesPostedInput(current, value)) throw Error('movements/operation-conflict');
    return current;
  }
  if (await checkCategory(client, scope, value)) value.isFromMandatory = true;
  await createLedgerEntries(client, scope, [{ id, value }]);
  return readMovement(client, scope, id);
}

export async function confirmMandatoryCycle(client: AccountClient, scope: BankScope, templateId: string, input: MovementInput, installments = 1) {
  requireBankEnvironment(client, scope);
  const value = validateMovement({ ...input, isFromMandatory: true });
  const cycle = getCycleKeyFromDate(civilDate(value.date)), id = templateId + '-' + cycle;
  const template = mandatoryRef(client, scope, templateId), ref = movementRef(client, scope, id), bank = accountRef(client, scope, value.accountId);
  await withBalanceRetry(client, scope, observe => runTransaction(client.db, async tx => {
    const [plan, previous, account] = await Promise.all([tx.get(template), tx.get(ref), tx.get(bank)]);
    requireBankEnvironment(client, scope);
    if (previous.exists() && previous.data().status === 'posted') {
      if (previous.data().installmentCount === installments && matchesPostedInput(parseMovement(id, previous.data(), scope), value)) return;
      throw Error('mandatory/cycle-already-confirmed');
    }
    if (!plan.exists()) throw Error('mandatory/not-found');
    const current = parseMandatory(templateId, plan.data());
    if (!current.isActive || (current.lastCycle && cycle < current.lastCycle) || (current.installmentStartDate && cycle < current.installmentStartDate.slice(0, 7))) throw Error('mandatory/cycle-unavailable');
    if (value.type !== current.type || value.name !== current.name || value.categoryId !== current.categoryId || value.categorySource !== current.categorySource || value.amountCents !== mandatoryAmount(current, installments)) throw Error('mandatory/conflict');
    if (!account.exists()) throw Error('movements/invalid-account');
    const accountData = account.data(), parsed = parseBank(account.id, 'new', accountData, scope);
    if (parsed.status !== 'active' || parsed.balanceInCents === null) throw Error('movements/invalid-account');
    if (parsed.legacyBankId && parsed.openingDate && value.date <= parsed.openingDate) throw Error('movements/before-reference');
    const posted = { ...value, status: 'posted' as const };
    const balance = parsed.balanceInCents + movementEffect(posted, account.id);
    if (!validCents(balance)) throw Error('movements/amount-limit');
    const date = Timestamp.fromDate(movementDate(value.date));
    observe(account.id, accountData.balanceRevision ?? 0);
    tx.update(bank, { balanceCents: balance, balanceRevision: (accountData.balanceRevision ?? 0) + 1, lastMovementId: id });
    tx.set(ref, { schemaVersion: 1, scopeKind: scope.kind, scopeId: scope.id, ...posted, date, recurringTemplateId: templateId,
      installmentCount: installments, revision: previous.exists() ? previous.data().revision + 1 : 0,
      createdBy: previous.exists() ? previous.data().createdBy : scope.uid, createdAt: previous.exists() ? previous.data().createdAt : serverTimestamp(),
      updatedBy: scope.uid, updatedAt: serverTimestamp() });
    tx.update(template, { revision: current.revision + 1, lastCycle: cycle, lastMovementDate: date, lastAmountCents: value.amountCents,
      lastInstallments: installments, installmentsCompleted: current.installmentsCompleted + (current.installmentTotal === null ? 0 : installments), updatedBy: scope.uid, updatedAt: serverTimestamp() });
  }));
  return readMovement(client, scope, id);
}

export async function cancelMandatoryCycle(client: AccountClient, scope: BankScope, templateId: string, cycle: string, expectedRevision: number) {
  requireBankEnvironment(client, scope);
  const template = mandatoryRef(client, scope, templateId), id = templateId + '-' + cycle, ref = movementRef(client, scope, id);
  await withBalanceRetry(client, scope, observe => runTransaction(client.db, async tx => {
    const [plan, old] = await Promise.all([tx.get(template), tx.get(ref)]);
    requireBankEnvironment(client, scope);
    if (!plan.exists() || !old.exists()) throw Error('mandatory/not-found');
    const current = parseMandatory(templateId, plan.data()), movement = parseMovement(id, old.data(), scope);
    if (movement.status === 'cancelled') return;
    if (!current.isActive || current.lastCycle !== cycle || old.data().recurringTemplateId !== templateId) throw Error('mandatory/cycle-unavailable');
    if (current.revision !== expectedRevision) throw Error('mandatory/conflict');
    const bank = accountRef(client, scope, movement.accountId), account = await tx.get(bank);
    requireBankEnvironment(client, scope);
    if (!account.exists()) throw Error('movements/invalid-account');
    const data = account.data(), parsed = parseBank(account.id, 'new', data, scope);
    if (parsed.status !== 'active' || parsed.balanceInCents === null) throw Error('movements/invalid-account');
    const balance = parsed.balanceInCents - movementEffect(movement, bank.id);
    if (!validCents(balance)) throw Error('movements/amount-limit');
    observe(account.id, data.balanceRevision ?? 0);
    tx.update(bank, { balanceCents: balance, balanceRevision: (data.balanceRevision ?? 0) + 1, lastMovementId: id });
    tx.update(ref, { status: 'cancelled', revision: movement.revision + 1, updatedBy: scope.uid, updatedAt: serverTimestamp() });
    tx.update(template, { revision: current.revision + 1, lastMovementDate: null, lastAmountCents: null, lastInstallments: 0,
      installmentsCompleted: current.installmentsCompleted - (current.installmentTotal === null ? 0 : current.lastInstallments), updatedBy: scope.uid, updatedAt: serverTimestamp() });
  }));
}

export async function createCashWithdrawal(client: AccountClient, scope: BankScope, id: string, input: BankOperationInput) {
  requireBankEnvironment(client, scope);
  const value: BankLedgerInput = { ...validateBankOperation(input), name: 'Saque em dinheiro', type: 'expense', paymentFormats: [], operation: 'cash-withdrawal' };
  await createLedgerEntries(client, scope, [{ id, value }]);
  return id;
}

export async function createBankTransfer(client: AccountClient, scope: BankScope, id: string, input: BankTransferInput) {
  requireBankEnvironment(client, scope);
  const value = validateBankOperation(input);
  if (value.accountId === input.destinationAccountId) throw Error('movements/same-account');
  const common = { ...value, name: 'Transferência entre bancos', paymentFormats: [], transferId: id };
  await createLedgerEntries(client, scope, [
    { id, value: { ...common, type: 'expense', operation: 'transfer-out' } },
    { id: `${id}-credit`, value: { ...common, type: 'gain', operation: 'transfer-in', accountId: input.destinationAccountId } },
  ]);
  return id;
}

export async function readTransferCounterpartyName(client: AccountClient, scope: BankScope, transferId: string, direction: 'outgoing' | 'incoming') {
  const oppositeId = direction === 'outgoing' ? `${transferId}-credit` : transferId;
  const other = await getDocFromServer(movementRef(client, scope, oppositeId));
  requireBankReadEnvironment(client, scope);
  if (!other.exists()) return null;
  const entry = parseLedgerEntry(other.id, other.data(), scope);
  if (!('operation' in entry) || entry.operation !== (direction === 'outgoing' ? 'transfer-in' : 'transfer-out') || !('transferId' in entry) || entry.transferId !== transferId || entry.status !== 'posted') return null;
  return (await readBank(client, scope, { id: entry.accountId, source: 'new' })).name;
}

async function createLedgerEntries(client: AccountClient, scope: BankScope, entries: { id: string; value: LedgerInput }[]) {
  const documents = entries.map(({ id, value }) => ({ id, value, ref: movementRef(client, scope, id), bank: accountRef(client, scope, value.accountId) }));
  await withBalanceRetry(client, scope, observe => runTransaction(client.db, async tx => {
    const [existing, balances] = await Promise.all([
      Promise.all(documents.map(item => tx.get(item.ref))),
      Promise.all(documents.map(item => tx.get(item.bank))),
    ]);
    requireBankEnvironment(client, scope);
    if (existing.some(item => item.exists())) {
      if (!existing.every(item => item.exists())) throw Error('movements/incomplete-operation');
      if (!existing.every((item, index) => matchesPostedInput(parseLedgerEntry(item.id, item.data()!, scope), documents[index].value))) throw Error('movements/operation-conflict');
      return;
    }
    for (const [index, { id, value, ref, bank }] of documents.entries()) {
      const bankSnap = balances[index];
      if (!bankSnap.exists()) throw Error('movements/invalid-account');
      observe(bankSnap.id, bankSnap.data().balanceRevision ?? 0);
      const account = parseBank(bankSnap.id, 'new', bankSnap.data(), scope);
      if (account.status !== 'active' || account.balanceInCents === null) throw Error('movements/invalid-account');
      if (account.legacyBankId && account.openingDate && value.date <= account.openingDate) throw Error('movements/before-reference');
      const next = account.balanceInCents + movementEffect({ ...value, status: 'posted' }, account.id);
      if (!validCents(next)) throw Error('movements/amount-limit');
      if ('operation' in value && value.type === 'expense' && next < 0) throw Error('movements/insufficient-balance');
      tx.update(bank, { balanceCents: next, balanceRevision: (bankSnap.data().balanceRevision ?? 0) + 1, lastMovementId: id });
      tx.set(ref, { schemaVersion: 1, scopeKind: scope.kind, scopeId: scope.id, ...value, date: Timestamp.fromDate(movementDate(value.date)), status: 'posted', revision: 0, createdBy: scope.uid, updatedBy: scope.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
  }));
}
export async function updateMovement(client: AccountClient, scope: BankScope, expected: Movement, input: MovementInput | null) {
  requireBankEnvironment(client, scope);
  if (/^[A-Za-z0-9]{20}-[0-9]{4}-[0-9]{2}$/.test(expected.id)) throw Error('mandatory/manage-in-template');
  if (input?.isFromMandatory && !expected.isFromMandatory) throw Error('movements/invalid-category');
  const value = input ? validateMovement(expected.isFromMandatory ? { ...input, isFromMandatory: true } : input) : null;
  if (value && value.type !== expected.type) throw Error('movements/invalid-type');
  const ref = movementRef(client, scope, expected.id);
  await getDocFromServer(ref);
  if (value && (value.categoryId !== expected.categoryId || value.categorySource !== expected.categorySource)) await checkCategory(client, scope, value);
  await withBalanceRetry(client, scope, observe => runTransaction(client.db, async tx => {
    const snap = await tx.get(ref);
    requireBankEnvironment(client, scope);
    if (!snap.exists()) throw Error('movements/not-found');
    const current = parseMovement(snap.id, snap.data(), scope);
    if (current.status === 'cancelled' && !value && current.revision === expected.revision + 1) return;
    if (JSON.stringify(current) !== JSON.stringify(expected) || current.status !== 'posted') throw Error('movements/conflict');
    const next = value ? { ...current, ...value, revision: current.revision + 1 } : { ...current, status: 'cancelled' as const, revision: current.revision + 1 };
    const ids = [...new Set([current.accountId, next.accountId])];
    const refs = ids.map(id => accountRef(client, scope, id));
    const accounts = await Promise.all(refs.map(ref => tx.get(ref)));
    requireBankEnvironment(client, scope);
    accounts.forEach((accountSnap, index) => {
      if (!accountSnap.exists()) throw Error('movements/invalid-account');
      observe(accountSnap.id, accountSnap.data().balanceRevision ?? 0);
      const account = parseBank(accountSnap.id, 'new', accountSnap.data(), scope);
      if (account.status !== 'active' || account.balanceInCents === null) throw Error('movements/invalid-account');
      if (account.legacyBankId && account.openingDate && ((current.accountId === account.id && current.date <= account.openingDate) || (next.accountId === account.id && next.date <= account.openingDate))) throw Error('movements/before-reference');
      const balance = account.balanceInCents + movementEffect(next, account.id) - movementEffect(current, account.id);
      if (!validCents(balance)) throw Error('movements/amount-limit');
      tx.update(refs[index], { balanceCents: balance, balanceRevision: (accountSnap.data().balanceRevision ?? 0) + 1, lastMovementId: expected.id });
    });
    tx.update(ref, value ? { ...value, date: Timestamp.fromDate(movementDate(value.date)), revision: next.revision, updatedBy: scope.uid, updatedAt: serverTimestamp() } : { status: 'cancelled', revision: next.revision, updatedBy: scope.uid, updatedAt: serverTimestamp() });
  }));
  return readMovement(client, scope, expected.id);
}

// Historical roots are read-only: never infer a group or apply their amounts to a balance.
export async function readHistoricalMovement(client: AccountClient, scope: BankScope, type: 'gain' | 'expense', id: string) {
  requireBankReadEnvironment(client, scope);
  if (scope.kind !== 'personal' || scope.id !== scope.uid || !['gain', 'expense'].includes(type) || typeof id !== 'string' || !id || id.includes('/')) throw Error('movements/incompatible');
  const snap = await getDocFromServer(doc(client.db, type === 'gain' ? 'gains' : 'expenses', id));
  requireBankReadEnvironment(client, scope);
  if (!snap.exists()) throw Error('movements/not-found');
  const data = snap.data();
  if (data.personId !== scope.uid || data.groupId != null || data.financialGroupId != null || data.ledgerGroupId != null ||
      (data.type != null && data.type !== type) || typeof data.name !== 'string' || !data.name.trim() ||
      !validCents(data.valueInCents) || data.valueInCents <= 0 || typeof data.date?.toDate !== 'function' ||
      typeof data.bankId !== 'string' || !data.bankId || typeof data.tagId !== 'string' || !data.tagId)
    throw Error('movements/incompatible');
  const category = await readCategory(client, scope, { id: data.tagId, source: 'legacy' });
  // Historical lookup does not assign a type to an untyped legacy category;
  // the write path still requires categorySupports() for new movements.
  if (category.blocked || (category.usageType !== type && category.usageType !== 'both' && category.usageType !== null)) throw Error('movements/incompatible');
  const date = data.date.toDate();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw Error('movements/incompatible');
  return { id: snap.id, type, name: data.name, amountCents: data.valueInCents, accountId: data.bankId, categoryId: data.tagId ?? null, date };
}

type TimelineSource = 'new' | 'legacy-gain' | 'legacy-expense' | 'legacy-cash' | 'group-legacy';
type PresentationSource = TimelineSource;
type TimelinePosition = { date: Timestamp; id: string };
type TimelineItem = { date: Timestamp; source: TimelineSource; record: import('../types/bankMovements').MovementRecord };
type TimelineStream = { source: TimelineSource; accountIds?: string[]; after: TimelinePosition | null; exhausted: boolean; pending: TimelineItem[] };
export type TimelineCursor = { streams: TimelineStream[] };

// The independent collections are merged by timestamp, ID and source. Each request
// fetches at most one bounded page per source; legacy data never changes balances.
export async function readMovementTimeline(client: AccountClient, scope: BankScope, accountId: string | null, from: Date, to: Date, cursor?: TimelineCursor | null, allowedAccountIds?: readonly string[]) {
  requireBankReadEnvironment(client, scope);
  if ((accountId !== null && (!accountId || accountId.includes('/'))) || (accountId === null && !allowedAccountIds) || !(from < to)) throw Error('movements/invalid-account');
  const allowedAccounts = new Set(allowedAccountIds ?? []);
  const legacyFrom = financialDayStart(from), legacyTo = financialDayStart(to);
  const accountGroups: string[][] = [];
  const candidates = accountId ? [accountId] : [...allowedAccounts].sort();
  const accountIds = client.db.app.options.projectId === OFFICIAL_PROJECT_ID ? [] : (await Promise.all(candidates.map(async id =>
    /^[A-Za-z0-9]{20}$/.test(id) && (await getDocFromServer(accountRef(client, scope, id))).exists() ? id : null
  ))).filter((id): id is string => id !== null);
  requireBankReadEnvironment(client, scope);
  for (let i = 0; i < accountIds.length; i += 2) accountGroups.push(accountIds.slice(i, i + 2));
  const sources: { source: TimelineSource; accountIds?: string[] }[] = [
    ...accountGroups.map(ids => ({ source: 'new' as const, accountIds: ids })),
    ...(scope.kind === 'personal' ? (['legacy-gain', 'legacy-expense', 'legacy-cash'] as TimelineSource[]) : ['group-legacy'] as TimelineSource[]).map(source => ({ source })),
  ];
  const streams: TimelineStream[] = cursor ? cursor.streams.map(stream => ({ ...stream, pending: [...stream.pending] }))
    : sources.map(source => ({ ...source, after: null, exhausted: false, pending: [] }));
  if (streams.length !== sources.length || streams.some((stream, i) => stream.source !== sources[i].source || JSON.stringify(stream.accountIds) !== JSON.stringify(sources[i].accountIds))) throw Error('movements/invalid-cursor');
  let issues = 0, cashIncomplete = false;
  await Promise.all(streams.map(async stream => {
    if (stream.pending.length || stream.exhausted) return;
    const isNew = stream.source === 'new', isGroup = stream.source === 'group-legacy', isCash = stream.source === 'legacy-cash';
    const officialPersonalLegacy = !isNew && !isGroup && client.db.app.options.projectId === OFFICIAL_PROJECT_ID;
    if (isNew && client.db.app.options.projectId === OFFICIAL_PROJECT_ID) { stream.exhausted = true; issues++; return; }
    const base = isNew ? movements(client, scope) : isGroup ? collection(client.db, 'financialGroups', scope.id, 'movements') : collection(client.db, isCash ? 'cashRescues' : stream.source === 'legacy-gain' ? 'gains' : 'expenses');
    const filters: QueryConstraint[] = isNew ? [where('status', '==', 'posted'), where('accountId', stream.accountIds!.length === 1 ? '==' : 'in', stream.accountIds!.length === 1 ? stream.accountIds![0] : stream.accountIds!)] : isGroup ? (accountId ? [where('bankId', '==', accountId)] : []) : [
      where('personId', '==', scope.uid),
      ...(officialPersonalLegacy ? [] : [...(accountId && !isCash ? [where('bankId', '==', accountId)] : []), where('groupId', '==', null), where('financialGroupId', '==', null), where('ledgerGroupId', '==', null)]),
    ];
    filters.push(where('date', '>=', Timestamp.fromDate(isNew ? from : legacyFrom)), where('date', '<', Timestamp.fromDate(isNew ? to : legacyTo)));
    const readPage = (ascending: boolean) => {
      const constraints = [...filters, orderBy('date', ascending ? 'asc' : 'desc'), orderBy(documentId(), ascending ? 'asc' : officialPersonalLegacy || isCash ? 'desc' : 'asc'), limit(20)];
      if (stream.after) constraints.push(startAfter(stream.after.date, stream.after.id));
      return measureRead('movements.page.' + stream.source, () => getDocsFromServer(query(base, ...constraints)), value => value.size);
    };
    let cashFallback = false;
    let snap;
    try { snap = await readPage(false); }
    catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
      if (!isCash || !officialPersonalLegacy || code !== 'failed-precondition' || stream.after) throw error;
      cashFallback = true;
      snap = await readPage(true);
    }
    requireBankReadEnvironment(client, scope);
    // The published cash index is ascending only. A full page cannot prove we
    // have the most recent results, so a narrower period is required.
    if (cashFallback && snap.size === 20) { stream.exhausted = true; issues++; cashIncomplete = true; return; }
    const final = snap.docs.at(-1);
    stream.exhausted = snap.size < 20;
    stream.after = final ? { date: final.data().date, id: final.id } : null;
    const categories = new Map<string, Promise<Awaited<ReturnType<typeof readCategory>> | null>>();
    const categoryFor = (id: string, source: import('../domain/categories').CategorySource) => {
      const key = `${source}:${id}`;
      if (!categories.has(key)) categories.set(key, readCategory(client, scope, { id, source }).catch(error => {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error ? error.message : '';
        if (['permission-denied', 'categories/not-found', 'categories/incompatible', 'categories/ambiguous-owner', 'categories/invalid-id'].includes(code)) return null;
        throw error;
      }));
      return categories.get(key)!;
    };
    const uniqueHistoricalCategory = (id: string) => {
      const key = `resolve:${id}`;
      if (!categories.has(key)) categories.set(key, resolveHistoricalCategory(client, scope, id).catch(error => {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error ? error.message : '';
        if (['permission-denied', 'categories/not-found', 'categories/incompatible', 'categories/ambiguous', 'categories/ambiguous-owner', 'categories/invalid-id'].includes(code)) return null;
        throw error;
      }));
      return categories.get(key)!;
    };
    // The official index is per owner/date, so a bounded page can contain
    // movements from another account of the same authenticated user.
    const records = (cashFallback ? [...snap.docs].reverse() : snap.docs).map(item => ({ item, effectiveSource: stream.source as PresentationSource }));
    const candidates = records.filter(({ item }) => {
      const id = item.data()[isNew ? 'accountId' : 'bankId'];
      return accountId ? id === accountId : typeof id === 'string' && allowedAccounts.has(id);
    });
    const mandatoryIds = new Set<string>();
    if (officialPersonalLegacy && !isCash && candidates.length) {
      const mandatoryCollection = stream.source === 'legacy-gain' ? 'mandatoryGains' : 'mandatoryExpenses';
      const referenceField = stream.source === 'legacy-gain' ? 'lastReceiptGainId' : 'lastPaymentExpenseId';
      try {
        const mandatory = await measureRead('movements.mandatory.' + mandatoryCollection,
          () => getDocsFromServer(query(collection(client.db, mandatoryCollection), where('personId', '==', scope.uid), limit(20))), value => value.size);
        requireBankReadEnvironment(client, scope);
        for (const item of mandatory.docs) {
          const data = item.data();
          if (data.personId === scope.uid && data.groupId == null && data.financialGroupId == null && data.ledgerGroupId == null && typeof data[referenceField] === 'string') mandatoryIds.add(data[referenceField]);
        }
        if (mandatory.size === 20) issues++;
      } catch { issues++; }
      requireBankReadEnvironment(client, scope);
    }
    const items = await Promise.all(candidates.map(async ({ item, effectiveSource }) => {
      const data = item.data();
      let record: import('../types/bankMovements').MovementRecord;
      if (isNew) {
        const value = parseLedgerEntry(item.id, data, scope);
        const [year, month, day] = value.date.split('-').map(Number);
        record = { id: item.id, storageSource: 'new', name: value.name, type: value.type, valueInCents: value.amountCents,
          date: new Date(year, month - 1, day), bankId: value.accountId, explanation: value.explanation, paymentFormats: value.paymentFormats };
        if ('operation' in value) {
          if (value.operation === 'cash-withdrawal') record.isCashRescue = true;
          else Object.assign(record, { isBankTransfer: true, bankTransferPairId: value.transferId, bankTransferDirection: value.operation === 'transfer-out' ? 'outgoing' : 'incoming' });
        } else {
          const category = await categoryFor(value.categoryId, value.categorySource);
          Object.assign(record, { tagId: `${value.categorySource}:${value.categoryId}`, tagName: category?.name ?? 'Categoria indisponível', tagIconFamily: category?.iconFamily, tagIconName: category?.iconName, tagIconStyle: category?.iconStyle, isFromMandatory: value.isFromMandatory, recurringTemplateId: typeof data.recurringTemplateId === 'string' ? data.recurringTemplateId : undefined });
        }
      } else if (effectiveSource === 'legacy-cash') {
        if (data.personId !== scope.uid || data.groupId != null || data.financialGroupId != null || data.ledgerGroupId != null ||
          !validCents(data.valueInCents) || data.valueInCents <= 0 || data.deleted === true ||
          (data.status != null && !['active', 'posted'].includes(data.status))) return null;
        record = { id: item.id, storageSource: 'legacy-cash', name: 'Saque em dinheiro', type: 'expense', valueInCents: data.valueInCents,
          date: toFinancialCivilDate(data.date.toDate()), bankId: data.bankId, isCashRescue: true,
          cashRescueSourceBankName: typeof data.bankNameSnapshot === 'string' ? data.bankNameSnapshot : null,
          explanation: typeof data.description === 'string' ? data.description : null };
      } else {
        const type = isGroup ? data.type : effectiveSource === 'legacy-gain' ? 'gain' : 'expense';
        const categorySource = isGroup ? data.categorySource ?? null : 'legacy';
        if (!['gain', 'expense'].includes(type) || (isGroup ? ((data.groupId != null && data.groupId !== scope.id) || (data.financialGroupId != null && data.financialGroupId !== scope.id) || (data.ledgerGroupId != null && data.ledgerGroupId !== scope.id) || (categorySource !== null && !['group-legacy', 'group-root', 'new'].includes(categorySource))) :
          (data.personId !== scope.uid || data.groupId != null || data.financialGroupId != null || data.ledgerGroupId != null || (data.type != null && data.type !== type))) ||
          typeof data.name !== 'string' || !data.name.trim() ||
          !validCents(data.valueInCents) || data.valueInCents <= 0 ||
          data.deleted === true || (data.status != null && !['active', 'posted', 'paid', 'received'].includes(data.status)) ||
          data.isPaid === false || data.paid === false || data.isReceived === false || data.received === false || data.isPending === true || data.pending === true ||
          data.moneyFormat === true || data.isBalanceAdjustment === true || data.isFinanceInvestment === true || data.isCashRescue === true ||
          data.isFinanceInvestmentSync === true || data.isReclaimedRecurring === true) return null;
        if (['isBankTransfer', 'isCashRescue', 'isFromMandatory', 'isFinanceInvestment', 'isInvestmentDeposit', 'isInvestmentRedemption', 'moneyFormat']
          .some(field => data[field] != null && typeof data[field] !== 'boolean')) return null;
        const isTransfer = data.isBankTransfer === true;
        const isDeposit = data.isInvestmentDeposit === true, isRedemption = data.isInvestmentRedemption === true;
        if ((isDeposit && type !== 'expense') || (isRedemption && type !== 'gain') || Number(isTransfer) + Number(isDeposit) + Number(isRedemption) > 1) return null;
        if (!isTransfer && (data.bankTransferDirection != null || data.bankTransferPairId != null)) return null;
        if (isTransfer && data.bankTransferDirection !== (type === 'gain' ? 'incoming' : 'outgoing')) return null;
        const tagValid = typeof data.tagId === 'string' && !!data.tagId && !data.tagId.includes('/') && data.tagId !== '.' && data.tagId !== '..';
        const category = tagValid ? (categorySource ? await categoryFor(data.tagId, categorySource) : await uniqueHistoricalCategory(data.tagId)) : null;
        const usableCategory = category && !category.blocked && (category.usageType === type || category.usageType === 'both' || category.usageType === null) ? category : null;
        const isMandatory = data.isFromMandatory === true || mandatoryIds.has(item.id);
        if (isMandatory && category?.usageType && !usableCategory) return null;
        if (!isTransfer && !isDeposit && !isRedemption && !usableCategory && !officialPersonalLegacy) return null;
        if (!isTransfer && !isDeposit && !isRedemption && !usableCategory && tagValid) issues++;
        record = { id: item.id, storageSource: effectiveSource, name: data.name, type, valueInCents: data.valueInCents,
          date: toFinancialCivilDate(data.date.toDate()), bankId: data.bankId, tagId: usableCategory ? `${usableCategory.source}:${data.tagId}` : null, tagName: usableCategory?.name ?? null,
          tagIconFamily: usableCategory?.iconFamily, tagIconName: usableCategory?.iconName, tagIconStyle: usableCategory?.iconStyle,
          isBankTransfer: isTransfer, bankTransferDirection: isTransfer ? data.bankTransferDirection : null,
          isInvestmentDeposit: isDeposit, isInvestmentRedemption: isRedemption,
          investmentNameSnapshot: typeof data.investmentNameSnapshot === 'string' ? data.investmentNameSnapshot : null,
          bankTransferSourceBankNameSnapshot: typeof data.bankTransferSourceBankNameSnapshot === 'string' ? data.bankTransferSourceBankNameSnapshot : null,
          bankTransferTargetBankNameSnapshot: typeof data.bankTransferTargetBankNameSnapshot === 'string' ? data.bankTransferTargetBankNameSnapshot : null,
          isFromMandatory: isMandatory,
          explanation: typeof data.explanation === 'string' ? data.explanation : null };
      }
      return { date: data.date as Timestamp, source: stream.source, record };
    }));
    stream.pending = items.filter((item): item is TimelineItem => item !== null);
    issues += items.length - stream.pending.length;
  }));
  const items: import('../types/bankMovements').MovementRecord[] = [];
  while (items.length < 20 && streams.some(stream => stream.pending.length) && streams.every(stream => stream.pending.length || stream.exhausted)) {
    const candidates = streams.filter(stream => stream.pending.length).sort((a, b) => {
      const x = a.pending[0], y = b.pending[0];
      const idOrder = x.record.id < y.record.id ? -1 : x.record.id > y.record.id ? 1 : 0;
      return y.date.seconds - x.date.seconds || y.date.nanoseconds - x.date.nanoseconds ||
        (client.db.app.options.projectId === OFFICIAL_PROJECT_ID && scope.kind === 'personal' ? -idOrder : idOrder) ||
        (x.source < y.source ? -1 : x.source > y.source ? 1 : 0);
    });
    if (!candidates.length) break;
    items.push(candidates[0].pending.shift()!.record);
  }
  return { items, issues, cashIncomplete, cursor: streams.some(stream => stream.pending.length || !stream.exhausted) ? { streams } : null };
}
