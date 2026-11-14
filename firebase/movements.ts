import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, runTransaction, serverTimestamp, startAfter, Timestamp, where, type QueryConstraint } from 'firebase/firestore';
import type { AccountClient } from './profiles';
import { bankContextKey, requireBankEnvironment, requireBankReadEnvironment } from './banks';
import { OFFICIAL_PROJECT_ID } from './config';
import { measureRead } from './diagnostics';
import { readCategory, resolveHistoricalCategory } from './categories';
import { categorySupports } from '../domain/categories';
import { parseBank, type BankScope } from '../domain/banks';
import { validCents } from '../domain/money';
import { financialDayStart, toFinancialCivilDate } from '../utils/financialCivilDate';
import { movementDate, movementEffect, validateMovement, type Movement, type MovementInput } from '../domain/movements';

function movements(client: AccountClient, scope: BankScope) {
  requireBankReadEnvironment(client, scope);
  return collection(client.db, 'financialContexts', bankContextKey(scope), 'movements');
}
function movementRef(client: AccountClient, scope: BankScope, id: string) {
  if (!/^[A-Za-z0-9]{20}$/.test(id)) throw Error('movements/invalid-id');
  return doc(movements(client, scope), id);
}
function accountRef(client: AccountClient, scope: BankScope, id: string) {
  if (!/^[A-Za-z0-9]{20}$/.test(id)) throw Error('movements/invalid-account');
  return doc(client.db, 'financialContexts', bankContextKey(scope), 'bankAccounts', id);
}
function parseMovement(id: string, data: Record<string, any>, scope: BankScope): Movement {
  if (data.scopeKind !== scope.kind || data.scopeId !== scope.id || data.schemaVersion !== 1 || !['posted', 'cancelled'].includes(data.status) || !Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.date?.toDate !== 'function') throw Error('movements/incompatible');
  const value = validateMovement({ name: data.name, type: data.type, amountCents: data.amountCents, accountId: data.accountId, categoryId: data.categoryId, categorySource: data.categorySource, date: data.date.toDate().toISOString().slice(0, 10), explanation: data.explanation, paymentFormats: data.paymentFormats });
  return { id, ...value, status: data.status, revision: data.revision };
}
async function checkCategory(client: AccountClient, scope: BankScope, value: MovementInput) {
  const category = await readCategory(client, scope, { id: value.categoryId, source: value.categorySource });
  if (!categorySupports(category, value.type)) throw Error('movements/invalid-category');
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
  const items = snap.docs.map(item => parseMovement(item.id, item.data(), scope));
  const last = items.at(-1);
  return { items, cursor: snap.size === 20 && last ? { date: movementDate(last.date), id: last.id } : null };
}
export async function createMovement(client: AccountClient, scope: BankScope, id: string, input: MovementInput) {
  requireBankEnvironment(client, scope);
  const value = validateMovement(input), ref = movementRef(client, scope, id), bank = accountRef(client, scope, value.accountId);
  await getDocFromServer(ref);
  await checkCategory(client, scope, value);
  await withBalanceRetry(client, scope, observe => runTransaction(client.db, async tx => {
    const [existing, bankSnap] = await Promise.all([tx.get(ref), tx.get(bank)]);
    requireBankEnvironment(client, scope);
    if (existing.exists()) {
      const current = parseMovement(id, existing.data(), scope);
      if (current.status !== 'posted' || Object.entries(value).some(([key, item]) => JSON.stringify(current[key as keyof MovementInput]) !== JSON.stringify(item))) throw Error('movements/operation-conflict');
      return;
    }
    if (!bankSnap.exists()) throw Error('movements/invalid-account');
    observe(bankSnap.id, bankSnap.data().balanceRevision ?? 0);
    const account = parseBank(bankSnap.id, 'new', bankSnap.data(), scope);
    if (account.status !== 'active' || account.balanceInCents === null) throw Error('movements/invalid-account');
    const next = account.balanceInCents + movementEffect({ ...value, status: 'posted' }, account.id);
    if (!validCents(next)) throw Error('movements/amount-limit');
    tx.update(bank, { balanceCents: next, balanceRevision: (bankSnap.data().balanceRevision ?? 0) + 1, lastMovementId: id });
    tx.set(ref, { schemaVersion: 1, scopeKind: scope.kind, scopeId: scope.id, ...value, date: Timestamp.fromDate(movementDate(value.date)), status: 'posted', revision: 0, createdBy: scope.uid, updatedBy: scope.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }));
  return readMovement(client, scope, id);
}
export async function updateMovement(client: AccountClient, scope: BankScope, expected: Movement, input: MovementInput | null) {
  requireBankEnvironment(client, scope);
  const value = input ? validateMovement(input) : null;
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
  if (category.blocked || (category.usageType !== type && category.usageType !== 'both' && !(client.db.app.options.projectId === OFFICIAL_PROJECT_ID && category.usageType === null))) throw Error('movements/incompatible');
  const date = data.date.toDate();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw Error('movements/incompatible');
  return { id: snap.id, type, name: data.name, amountCents: data.valueInCents, accountId: data.bankId, categoryId: data.tagId ?? null, date };
}

type TimelineSource = 'new' | 'legacy-gain' | 'legacy-expense' | 'legacy-cash' | 'group-legacy';
type TimelinePosition = { date: Timestamp; id: string };
type TimelineItem = { date: Timestamp; source: TimelineSource; record: import('../types/bankMovements').MovementRecord };
type TimelineStream = { source: TimelineSource; after: TimelinePosition | null; exhausted: boolean; pending: TimelineItem[] };
export type TimelineCursor = { streams: TimelineStream[] };

// The independent collections are merged by timestamp, ID and source. Each request
// fetches at most one bounded page per source; legacy data never changes balances.
export async function readMovementTimeline(client: AccountClient, scope: BankScope, accountId: string | null, from: Date, to: Date, cursor?: TimelineCursor | null, allowedAccountIds?: readonly string[]) {
  requireBankReadEnvironment(client, scope);
  if ((accountId !== null && (!accountId || accountId.includes('/'))) || (accountId === null && !allowedAccountIds) || !(from < to)) throw Error('movements/invalid-account');
  const allowedAccounts = new Set(allowedAccountIds ?? []);
  const legacyFrom = financialDayStart(from), legacyTo = financialDayStart(to);
  const sources: TimelineSource[] = scope.kind === 'personal' ? ['new', 'legacy-gain', 'legacy-expense', 'legacy-cash'] : ['new', 'group-legacy'];
  const streams: TimelineStream[] = cursor ? cursor.streams.map(stream => ({ ...stream, pending: [...stream.pending] }))
    : sources.map(source => ({ source, after: null, exhausted: false, pending: [] }));
  if (streams.length !== sources.length || streams.some((stream, i) => stream.source !== sources[i])) throw Error('movements/invalid-cursor');
  let issues = 0, cashIncomplete = false;
  await Promise.all(streams.map(async stream => {
    if (stream.pending.length || stream.exhausted) return;
    const isNew = stream.source === 'new', isGroup = stream.source === 'group-legacy', isCash = stream.source === 'legacy-cash';
    const officialPersonalLegacy = !isNew && !isGroup && client.db.app.options.projectId === OFFICIAL_PROJECT_ID;
    if (isNew && client.db.app.options.projectId === OFFICIAL_PROJECT_ID) { stream.exhausted = true; issues++; return; }
    const base = isNew ? movements(client, scope) : isGroup ? collection(client.db, 'financialGroups', scope.id, 'movements') : collection(client.db, isCash ? 'cashRescues' : stream.source === 'legacy-gain' ? 'gains' : 'expenses');
    const filters: QueryConstraint[] = isNew ? [where('status', '==', 'posted'), ...(accountId ? [where('accountId', '==', accountId)] : [])] : isGroup ? (accountId ? [where('bankId', '==', accountId)] : []) : [
      where('personId', '==', scope.uid),
      ...(officialPersonalLegacy || isCash ? [] : [...(accountId ? [where('bankId', '==', accountId)] : []), where('groupId', '==', null), where('financialGroupId', '==', null), where('ledgerGroupId', '==', null)]),
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
    const candidates = (cashFallback ? [...snap.docs].reverse() : snap.docs).filter(item => {
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
    const items = await Promise.all(candidates.map(async item => {
      const data = item.data();
      let record: import('../types/bankMovements').MovementRecord;
      if (isNew) {
        const value = parseMovement(item.id, data, scope);
        const category = await categoryFor(value.categoryId, value.categorySource);
        const [year, month, day] = value.date.split('-').map(Number);
        record = { id: item.id, storageSource: stream.source, name: value.name, type: value.type, valueInCents: value.amountCents,
          date: new Date(year, month - 1, day), bankId: value.accountId, tagId: `${value.categorySource}:${value.categoryId}`,
          tagName: category?.name ?? 'Categoria indisponível', tagIconFamily: category?.iconFamily, tagIconName: category?.iconName,
          tagIconStyle: category?.iconStyle, explanation: value.explanation, paymentFormats: value.paymentFormats };
      } else if (isCash) {
        if (data.personId !== scope.uid || data.groupId != null || data.financialGroupId != null || data.ledgerGroupId != null ||
          !validCents(data.valueInCents) || data.valueInCents <= 0 || data.deleted === true ||
          (data.status != null && !['active', 'posted'].includes(data.status))) return null;
        record = { id: item.id, storageSource: 'legacy-cash', name: 'Saque em dinheiro', type: 'expense', valueInCents: data.valueInCents,
          date: toFinancialCivilDate(data.date.toDate()), bankId: data.bankId, isCashRescue: true,
          cashRescueSourceBankName: typeof data.bankNameSnapshot === 'string' ? data.bankNameSnapshot : null,
          explanation: typeof data.description === 'string' ? data.description : null };
      } else {
        const type = isGroup ? data.type : stream.source === 'legacy-gain' ? 'gain' : 'expense';
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
        const usableCategory = category && !category.blocked && (category.usageType === type || category.usageType === 'both' || (officialPersonalLegacy && category.usageType === null)) ? category : null;
        if (!isTransfer && !isDeposit && !isRedemption && !usableCategory && !officialPersonalLegacy) return null;
        if (!isTransfer && !isDeposit && !isRedemption && !usableCategory && tagValid) issues++;
        record = { id: item.id, storageSource: stream.source, name: data.name, type, valueInCents: data.valueInCents,
          date: toFinancialCivilDate(data.date.toDate()), bankId: data.bankId, tagId: usableCategory ? `${usableCategory.source}:${data.tagId}` : null, tagName: usableCategory?.name ?? null,
          tagIconFamily: usableCategory?.iconFamily, tagIconName: usableCategory?.iconName, tagIconStyle: usableCategory?.iconStyle,
          isBankTransfer: isTransfer, bankTransferDirection: isTransfer ? data.bankTransferDirection : null,
          isInvestmentDeposit: isDeposit, isInvestmentRedemption: isRedemption,
          investmentNameSnapshot: typeof data.investmentNameSnapshot === 'string' ? data.investmentNameSnapshot : null,
          bankTransferSourceBankNameSnapshot: typeof data.bankTransferSourceBankNameSnapshot === 'string' ? data.bankTransferSourceBankNameSnapshot : null,
          bankTransferTargetBankNameSnapshot: typeof data.bankTransferTargetBankNameSnapshot === 'string' ? data.bankTransferTargetBankNameSnapshot : null,
          isFromMandatory: data.isFromMandatory === true || mandatoryIds.has(item.id),
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
