import { collection, deleteField, doc, documentId, getDocFromServer, getDocsFromServer, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, startAfter, Timestamp, where, type QueryConstraint } from 'firebase/firestore';
import type { AccountClient } from './profiles';
import { bankContextKey, readBank, requireBankEnvironment, requireBankReadEnvironment } from './banks';
import { LOCAL_PROJECT_ID, OFFICIAL_PROJECT_ID, usesCanonicalFinance } from './config';
import { measureRead } from './diagnostics';
import { readCategory, resolveHistoricalCategory } from './categories';
import { categorySupports } from '../domain/categories';
import { parseBank, validId, type BankAccount, type BankScope } from '../domain/banks';
import { validCents } from '../domain/money';
import { civilDateKey, financialDateKey, financialDayStart, financialTime, toFinancialCivilDate } from '../utils/financialCivilDate';
import { isTagVisibleInRegularUsageList } from '../utils/tagUsage';
import { getCycleKeyFromDate } from '../utils/mandatoryExpenses';
import { civilDate, mandatoryAmount } from '../domain/mandatory';
import { mandatoryRef, parseMandatory } from './mandatory';
import { CASH_HISTORY_ID, movementDate, movementEffect, movementInstant, validateBankOperation, validateMovement, type BankLedgerInput, type BankOperationInput, type BankTransferInput, type LedgerEntry, type LedgerInput, type Movement, type MovementInput } from '../domain/movements';

function movements(client: AccountClient, scope: BankScope) {
  requireBankReadEnvironment(client, scope);
  return collection(client.db, 'financialContexts', bankContextKey(scope), 'movements');
}

// A server-confirmed commit invalidates every affected account, including old
// statement dates and cancellations that leave the posted movements query.
export function watchMovementChanges(client: AccountClient, scope: BankScope, onChange: (initial: boolean) => void) {
  const latest = query(movements(client, scope), orderBy('updatedAt', 'desc'), limit(1));
  let last: string | undefined;
  return onSnapshot(latest, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || client.auth.currentUser?.uid !== scope.uid) return;
    const movement = snapshot.docs[0];
    const stamp = movement?.data().updatedAt as Timestamp | undefined;
    const key = JSON.stringify([movement?.id, stamp?.seconds, stamp?.nanoseconds, movement?.data().revision]);
    if (key === last) return;
    const initial = last === undefined;
    last = key;
    onChange(initial);
  }, () => { /* Scoped queries surface read errors and the group watcher handles revocation. */ });
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
  const date = data.date.toDate().toISOString().slice(0, 10);
  // Firestore already checked the posting time. Other devices can have a lagging clock.
  const latest = Number.POSITIVE_INFINITY;
  let time: string | undefined;
  if (data.occurredAt !== undefined) {
    if (typeof data.occurredAt?.toDate !== 'function') throw Error('movements/incompatible');
    const instant = data.occurredAt.toDate();
    time = financialTime(instant);
    if (movementInstant(date, time, latest).getTime() !== instant.getTime() || data.occurredAt.nanoseconds !== 0) throw Error('movements/incompatible');
  }
  const common = { name: data.name, type: data.type, amountCents: data.amountCents, accountId: data.accountId, date,
    ...(time ? { time } : {}), ...(data.referenceTreatment !== undefined ? { referenceTreatment: data.referenceTreatment } : {}),
    explanation: data.explanation, paymentFormats: data.paymentFormats };
  const metadata = { id, status: data.status, revision: data.revision };
  if (data.operation === undefined) return { ...metadata, ...validateMovement({ ...common, categoryId: data.categoryId, categorySource: data.categorySource, paymentMethod: data.paymentMethod, ...(data.isFromMandatory === true ? { isFromMandatory: true } : {}) }, latest) };
  const operation: unknown = data.operation;
  const bankOperation = { ...common, ...validateBankOperation(common, latest) };
  if (operation === 'cash-withdrawal' && data.type === 'expense') return { ...metadata, ...bankOperation, operation };
  if ((operation === 'transfer-out' || operation === 'transfer-in') && data.type === (operation === 'transfer-out' ? 'expense' : 'gain') && /^[A-Za-z0-9]{20}$/.test(data.transferId)) {
    return { ...metadata, ...bankOperation, operation, transferId: data.transferId };
  }
  throw Error('movements/incompatible');
}
function parseMovement(id: string, data: Record<string, any>, scope: BankScope): Movement {
  if (typeof data.historicalSourcePath === 'string') throw Error('movements/unsupported-edit');
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
  if (expected.referenceTreatment === undefined) delete current.referenceTreatment;
  return status === 'posted' && Object.keys(current).length === Object.keys(expected).length
    && Object.entries(current).every(([key, value]) => JSON.stringify(value) === JSON.stringify(Reflect.get(expected, key)));
}

function ledgerFields({ time, ...value }: LedgerInput) {
  return { ...value, date: Timestamp.fromDate(movementDate(value.date)),
    ...(time ? { occurredAt: Timestamp.fromDate(movementInstant(value.date, time)) } : {}) };
}

export class MovementReferenceConfirmationRequired extends Error {
  constructor(readonly accountId: string, readonly accountName: string, readonly referenceAt: Date) {
    super('movements/reference-confirmation-required');
  }
}

function reconcileMovement<T extends LedgerInput>(account: BankAccount, value: T, preserveOccurrence = false): T {
  const { date, time, referenceTreatment } = value;
  if ('paymentMethod' in value && value.paymentMethod === 'credit') return value;
  if (!account.openingDate) throw Error('movements/invalid-account');
  if (account.referenceAt) {
    const day = movementDate(date).getTime();
    const referenceDay = financialDateKey(account.referenceAt);
    if (day < referenceDay) {
      if (referenceTreatment !== undefined && referenceTreatment !== 'historical') throw Error('movements/invalid-reference-treatment');
      return { ...value, referenceTreatment: 'historical' };
    }
    if (day === referenceDay) {
      if (referenceTreatment === 'included' || referenceTreatment === 'after') return value;
      if (referenceTreatment !== undefined) throw Error('movements/invalid-reference-treatment');
      if (!time) throw new MovementReferenceConfirmationRequired(account.id, account.name, account.referenceAt);
      if (movementInstant(date, time) <= account.referenceAt) {
        if (preserveOccurrence) return { ...value, referenceTreatment: 'included' };
        throw Error('movements/before-reference');
      }
      return value;
    }
    // Older references around the UTC-02/UTC-03 boundary can need an explicit
    // classification in Rules even when the São Paulo day is known to be later.
    if (!time && (referenceTreatment === undefined || referenceTreatment === 'after') && account.referenceAt.getUTCFullYear() < 2020 &&
      date === new Date(account.referenceAt.getTime() - 2 * 3600000).toISOString().slice(0, 10)) {
      return { ...value, referenceTreatment: 'after' };
    }
  } else if (date < account.openingDate) throw Error('movements/before-opening');
  if (referenceTreatment !== undefined) throw Error('movements/invalid-reference-treatment');
  return value;
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
type TimelinePosition = { date: Timestamp; id: string };
type MovementOrder = { day: number; createdAt?: Timestamp; id: string; source?: string };
const MAX_PAGE_SIZE = 20;
const MAX_PAGE_READS = 4;

function compareMovementOrder(a: MovementOrder, b: MovementOrder, descendingId = false) {
  const aSeconds = a.createdAt?.seconds ?? Number.MIN_SAFE_INTEGER;
  const bSeconds = b.createdAt?.seconds ?? Number.MIN_SAFE_INTEGER;
  const idOrder = a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
  return b.day - a.day || bSeconds - aSeconds || (b.createdAt?.nanoseconds ?? 0) - (a.createdAt?.nanoseconds ?? 0)
    || (descendingId ? -idOrder : idOrder)
    || (a.source === b.source ? 0 : (a.source ?? '') < (b.source ?? '') ? -1 : 1);
}

// A legacy instant may belong to an earlier São Paulo day than its UTC day.
function unreadDay(after: TimelinePosition | null, exhausted: boolean) {
  return exhausted ? -Infinity : after ? Math.floor(after.date.seconds / 86400) * 86400000 : Infinity;
}

type PendingLedgerEntry = MovementOrder & { entry: LedgerEntry };
export type MovementCursor = { after: TimelinePosition | null; exhausted: boolean; pending: PendingLedgerEntry[] };
export async function readMovementPage(client: AccountClient, scope: BankScope, filters: { accountId?: string; type?: MovementInput['type']; from?: Date; to?: Date }, cursor?: MovementCursor | null) {
  const constraints: QueryConstraint[] = [where('status', '==', 'posted')];
  if (filters.accountId) constraints.push(where('accountId', '==', filters.accountId));
  if (filters.type) constraints.push(where('type', '==', filters.type));
  if (filters.from) constraints.push(where('date', '>=', Timestamp.fromDate(filters.from)));
  if (filters.to) constraints.push(where('date', '<', Timestamp.fromDate(filters.to)));
  constraints.push(orderBy('date', 'desc'), orderBy(documentId()), limit(MAX_PAGE_SIZE));
  let after = cursor?.after ?? null, exhausted = cursor?.exhausted ?? false;
  const pending = [...(cursor?.pending ?? [])];
  for (let reads = 0; reads < MAX_PAGE_READS && !exhausted && pending.filter(item => item.day > unreadDay(after, exhausted)).length < MAX_PAGE_SIZE; reads++) {
    const position = after ? [startAfter(after.date, after.id)] : [];
    const snap = await getDocsFromServer(query(movements(client, scope), ...constraints, ...position));
    requireBankReadEnvironment(client, scope);
    for (const item of snap.docs) {
      const data = item.data();
      const entry = parseLedgerEntry(item.id, data, scope);
      const day = typeof data.historicalSourcePath === 'string' ? financialDateKey(data.date.toDate()) : movementDate(entry.date, Infinity).getTime();
      pending.push({ entry, day, createdAt: data.createdAt, id: item.id });
    }
    const last = snap.docs.at(-1);
    if (last) after = { date: last.data().date, id: last.id };
    exhausted = snap.size < MAX_PAGE_SIZE;
  }
  pending.sort(compareMovementOrder);
  const firstUnready = pending.findIndex(item => item.day <= unreadDay(after, exhausted));
  const items = pending.splice(0, firstUnready < 0 ? MAX_PAGE_SIZE : Math.min(firstUnready, MAX_PAGE_SIZE)).map(item => item.entry);
  return { items, cursor: !exhausted || pending.length ? { after, exhausted, pending } : null };
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

export async function confirmMandatoryCycle(client: AccountClient, scope: BankScope, templateId: string, input: MovementInput, installments = 1, expectedCents?: number) {
  requireBankEnvironment(client, scope);
  const value = validateMovement({ ...input, isFromMandatory: true });
  if (!value.accountId || value.paymentMethod) throw Error('movements/invalid-format');
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
    if (!current.isActive || (current.lastCycle && cycle < current.lastCycle)) throw Error('mandatory/cycle-unavailable');
    const planned = mandatoryAmount(current, installments);
    if (value.type !== current.type || value.name !== current.name || value.categoryId !== current.categoryId || value.categorySource !== current.categorySource ||
        (expectedCents !== undefined && expectedCents !== planned) ||
        (value.amountCents !== planned && (installments !== 1 || current.installmentTotal === null || expectedCents !== planned))) throw Error('mandatory/conflict');
    if (!account.exists()) throw Error('movements/invalid-account');
    const accountData = account.data(), parsed = parseBank(account.id, 'new', accountData, scope);
    if (parsed.status !== 'active' || parsed.balanceInCents === null) throw Error('movements/invalid-account');
    const reconciled = reconcileMovement(parsed, value);
    const posted = { ...reconciled, status: 'posted' as const };
    const balance = parsed.balanceInCents + movementEffect(posted, account.id);
    if (!validCents(balance)) throw Error('movements/amount-limit');
    const fields = ledgerFields(reconciled);
    observe(account.id, accountData.balanceRevision ?? 0);
    tx.update(bank, { balanceCents: balance, balanceRevision: (accountData.balanceRevision ?? 0) + 1, lastMovementId: id });
    const cancelled = previous.data();
    const audit = cancelled?.reversalHistory ?? [];
    if (audit.length >= 50) throw Error('mandatory/reversal-limit');
    const reversalHistory = cancelled && (cancelled.plannedInstallmentCents !== undefined || audit.length) ? [...audit, {
      revision: cancelled.revision, date: cancelled.date, amountCents: cancelled.amountCents, accountId: cancelled.accountId,
      plannedInstallmentCents: cancelled.plannedInstallmentCents ?? null, installmentCount: cancelled.installmentCount,
      cancelledAt: cancelled.updatedAt, cancelledBy: cancelled.updatedBy,
    }] : null;
    tx.set(ref, { schemaVersion: 1, scopeKind: scope.kind, scopeId: scope.id, ...fields, status: 'posted', recurringTemplateId: templateId,
      installmentCount: installments, ...(reversalHistory ? { reversalHistory } : {}), ...(value.amountCents !== planned ? { plannedInstallmentCents: planned } : {}), revision: previous.exists() ? previous.data().revision + 1 : 0,
      createdBy: previous.exists() ? previous.data().createdBy : scope.uid, createdAt: previous.exists() ? previous.data().createdAt : serverTimestamp(),
      updatedBy: scope.uid, updatedAt: serverTimestamp() });
    tx.update(template, { revision: current.revision + 1, lastCycle: cycle, lastMovementDate: fields.date, lastAmountCents: value.amountCents,
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
    if (!movement.accountId) throw Error('movements/invalid-account');
    const bank = accountRef(client, scope, movement.accountId), account = await tx.get(bank);
    requireBankEnvironment(client, scope);
    if (!account.exists()) throw Error('movements/invalid-account');
    const data = account.data(), parsed = parseBank(account.id, 'new', data, scope);
    if (parsed.status !== 'active' || parsed.balanceInCents === null) throw Error('movements/invalid-account');
    reconcileMovement(parsed, movement);
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
  const { referenceTreatment: _originTreatment, ...destination } = common;
  const credit = validateBankOperation({ ...destination, accountId: input.destinationAccountId,
    referenceTreatment: input.destinationReferenceTreatment });
  await createLedgerEntries(client, scope, [
    { id, value: { ...common, type: 'expense', operation: 'transfer-out' } },
    { id: `${id}-credit`, value: { ...destination, ...credit, type: 'gain', operation: 'transfer-in' } },
  ]);
  return id;
}

export async function cancelBankOperation(client: AccountClient, scope: BankScope, id: string) {
  requireBankEnvironment(client, scope);
  const selected = movementRef(client, scope, id);
  await withBalanceRetry(client, scope, observe => runTransaction(client.db, async tx => {
    const current = await tx.get(selected);
    if (!current.exists()) throw Error('movements/not-found');
    const data = current.data();
    if (data.historicalSourcePath) throw Error('movements/unsupported-edit');
    const entry = parseLedgerEntry(id, data, scope);
    if (!('operation' in entry)) throw Error('movements/unsupported-edit');
    const movements = [{ ref: selected, entry }];
    if (entry.operation !== 'cash-withdrawal') {
      const outgoing = entry.operation === 'transfer-out';
      const opposite = movementRef(client, scope, outgoing ? entry.transferId + '-credit' : entry.transferId);
      const snapshot = await tx.get(opposite);
      if (!snapshot.exists() || snapshot.data().historicalSourcePath) throw Error('movements/incomplete-operation');
      const pair = parseLedgerEntry(snapshot.id, snapshot.data(), scope);
      if (!('transferId' in pair) || pair.transferId !== entry.transferId || pair.operation !== (outgoing ? 'transfer-in' : 'transfer-out') ||
          pair.accountId === entry.accountId || pair.amountCents !== entry.amountCents || pair.date !== entry.date || pair.time !== entry.time ||
          pair.explanation !== entry.explanation || pair.status !== entry.status) throw Error('movements/incomplete-operation');
      movements.push({ ref: opposite, entry: pair });
    }
    requireBankEnvironment(client, scope);
    if (entry.status === 'cancelled') return;
    const banks = await Promise.all(movements.map(item => tx.get(accountRef(client, scope, item.entry.accountId))));
    requireBankEnvironment(client, scope);
    for (const [index, snapshot] of banks.entries()) {
      if (!snapshot.exists()) throw Error('movements/invalid-account');
      const { ref, entry: leg } = movements[index];
      const data = snapshot.data(), bank = parseBank(snapshot.id, 'new', data, scope);
      if (bank.status !== 'active' || bank.balanceInCents === null) throw Error('movements/invalid-account');
      reconcileMovement(bank, leg);
      const effect = movementEffect(leg, bank.id);
      const balance = bank.balanceInCents - effect;
      if (!validCents(balance)) throw Error('movements/amount-limit');
      if (effect > 0 && balance < 0) throw Error('movements/insufficient-balance');
      const revision = data.balanceRevision ?? 0;
      observe(bank.id, revision);
      tx.update(snapshot.ref, { balanceCents: balance, balanceRevision: revision + 1, lastMovementId: leg.id });
      tx.update(ref, { status: 'cancelled', revision: leg.revision + 1, updatedBy: scope.uid, updatedAt: serverTimestamp() });
    }
  }));
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
  const documents = entries.map(({ id, value }) => ({ id, value, ref: movementRef(client, scope, id), bank: value.accountId ? accountRef(client, scope, value.accountId) : null }));
  await withBalanceRetry(client, scope, observe => runTransaction(client.db, async tx => {
    const [existing, balances] = await Promise.all([
      Promise.all(documents.map(item => tx.get(item.ref))),
      Promise.all(documents.map(item => item.bank ? tx.get(item.bank) : null)),
    ]);
    requireBankEnvironment(client, scope);
    if (existing.some(item => item.exists())) {
      if (!existing.every(item => item.exists())) throw Error('movements/incomplete-operation');
      if (!existing.every((item, index) => matchesPostedInput(parseLedgerEntry(item.id, item.data()!, scope), documents[index].value))) throw Error('movements/operation-conflict');
      return;
    }
    for (const [index, { id, value, ref, bank }] of documents.entries()) {
      const bankSnap = balances[index];
      if (!bank) {
        tx.set(ref, { schemaVersion: 1, scopeKind: scope.kind, scopeId: scope.id, ...ledgerFields(value), status: 'posted', revision: 0,
          createdBy: scope.uid, updatedBy: scope.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        continue;
      }
      if (!bankSnap?.exists()) throw Error('movements/invalid-account');
      observe(bankSnap.id, bankSnap.data().balanceRevision ?? 0);
      const account = parseBank(bankSnap.id, 'new', bankSnap.data(), scope);
      if (account.status !== 'active' || account.balanceInCents === null) throw Error('movements/invalid-account');
      const reconciled = reconcileMovement(account, value);
      const effect = movementEffect({ ...reconciled, status: 'posted' }, account.id);
      const next = account.balanceInCents + effect;
      if (!validCents(next)) throw Error('movements/amount-limit');
      if ('operation' in value && effect < 0 && next < 0) throw Error('movements/insufficient-balance');
      tx.update(bank, { balanceCents: next, balanceRevision: (bankSnap.data().balanceRevision ?? 0) + 1, lastMovementId: id });
      tx.set(ref, { schemaVersion: 1, scopeKind: scope.kind, scopeId: scope.id, ...ledgerFields(reconciled), status: 'posted', revision: 0, createdBy: scope.uid, updatedBy: scope.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
    const sameDate = value?.date === current.date;
    const samePosition = sameDate && value?.accountId === current.accountId;
    const ids = [...new Set([current.accountId, value?.accountId])].filter((id): id is string => !!id);
    const refs = ids.map(id => accountRef(client, scope, id));
    const accounts = await Promise.all(refs.map(ref => tx.get(ref)));
    requireBankEnvironment(client, scope);
    const banks = accounts.map(accountSnap => {
      if (!accountSnap.exists()) throw Error('movements/invalid-account');
      observe(accountSnap.id, accountSnap.data().balanceRevision ?? 0);
      const account = parseBank(accountSnap.id, 'new', accountSnap.data(), scope);
      if (account.status !== 'active' || account.balanceInCents === null) throw Error('movements/invalid-account');
      if (current.accountId === account.id) reconcileMovement(account, current);
      return { ...account, balanceInCents: account.balanceInCents };
    });
    const draft = value ? {
      ...value, ...(sameDate && current.time ? { time: current.time } : {}),
      ...(samePosition && current.referenceTreatment && value.paymentMethod !== 'credit' ? { referenceTreatment: current.referenceTreatment } : {}),
    } : null;
    const destination = banks.find(account => account.id === draft?.accountId);
    const reconciled = draft && destination ? reconcileMovement(destination, draft, sameDate && !samePosition) : draft;
    const next = reconciled ? { ...reconciled, status: 'posted' as const } : null;
    banks.forEach((account, index) => {
      const balance = account.balanceInCents + movementEffect(next, account.id) - movementEffect(current, account.id);
      if (!validCents(balance)) throw Error('movements/amount-limit');
      tx.update(refs[index], { balanceCents: balance, balanceRevision: (accounts[index].data()!.balanceRevision ?? 0) + 1, lastMovementId: expected.id });
    });
    const fields = reconciled ? ledgerFields(reconciled) : null;
    tx.update(ref, { ...(fields ? { ...fields, occurredAt: fields.occurredAt ?? deleteField(), referenceTreatment: fields.referenceTreatment ?? deleteField(), paymentMethod: reconciled?.paymentMethod ?? deleteField() } : { status: 'cancelled' }),
      revision: current.revision + 1, updatedBy: scope.uid, updatedAt: serverTimestamp() });
  }));
  return readMovement(client, scope, expected.id);
}

// Historical roots are read-only: never infer a group or apply their amounts to a balance.
export async function readHistoricalMovement(client: AccountClient, scope: BankScope, type: 'gain' | 'expense', id: string) {
  requireBankReadEnvironment(client, scope);
  if (usesCanonicalFinance(client.db.app.options.projectId)) throw Error('movements/not-found');
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
type TimelineItem = MovementOrder & { record: import('../types/bankMovements').MovementRecord };
type TimelineStream = { source: TimelineSource; accountIds?: string[]; after: TimelinePosition | null; exhausted: boolean; pending: TimelineItem[] };
export type TimelineCursor = { streams: TimelineStream[] };

export async function hasCashHistory(client: AccountClient, scope: BankScope) {
  if (!usesCanonicalFinance(client.db.app.options.projectId) && client.db.app.options.projectId !== LOCAL_PROJECT_ID) return false;
  const result = await getDocsFromServer(query(movements(client, scope), where('status', '==', 'posted'), where('accountId', '==', null),
    orderBy('date', 'desc'), orderBy(documentId(), 'asc'), limit(1)));
  requireBankReadEnvironment(client, scope);
  return !result.empty;
}

// Firestore pages use the stored timestamp. Only emit a civil day once all
// streams have passed it so sorting by creation stays stable across pages.
export async function readMovementTimeline(client: AccountClient, scope: BankScope, accountId: string | null, from: Date, to: Date, cursor?: TimelineCursor | null, allowedAccountIds?: readonly string[], includeCategories = true) {
  requireBankReadEnvironment(client, scope);
  if ((accountId !== null && (!accountId || accountId.includes('/'))) || (accountId === null && !allowedAccountIds) || !(from < to)) throw Error('movements/invalid-account');
  const allowedAccounts = new Set(allowedAccountIds ?? []);
  const legacyFrom = financialDayStart(from), legacyTo = financialDayStart(to);
  const canonical = usesCanonicalFinance(client.db.app.options.projectId);
  const local = client.db.app.options.projectId === LOCAL_PROJECT_ID;
  const requestingCash = accountId === CASH_HISTORY_ID;
  if (requestingCash && !canonical && !local) throw Error('movements/cash-history-unavailable');
  const officialLegacy = !canonical && client.db.app.options.projectId === OFFICIAL_PROJECT_ID;
  const accountGroups: string[][] = [];
  const candidates = accountId ? [accountId] : [...allowedAccounts].sort();
  const accountIds = canonical || officialLegacy ? [] : (await Promise.all(candidates.map(async id =>
    /^[A-Za-z0-9]{20}$/.test(id) && (await getDocFromServer(accountRef(client, scope, id))).exists() ? id : null
  ))).filter((id): id is string => id !== null);
  requireBankReadEnvironment(client, scope);
  for (let i = 0; i < accountIds.length; i += 2) accountGroups.push(accountIds.slice(i, i + 2));
  const sources: { source: TimelineSource; accountIds?: string[] }[] = canonical || requestingCash
    ? [{ source: 'new', accountIds: accountId ? [accountId] : [] }] : [
    ...(local && !accountId ? [{ source: 'new' as const, accountIds: [CASH_HISTORY_ID] }] : []),
    ...accountGroups.map(ids => ({ source: 'new' as const, accountIds: ids })),
    ...(scope.kind === 'personal' ? (['legacy-gain', 'legacy-expense', 'legacy-cash'] as TimelineSource[]) : ['group-legacy'] as TimelineSource[]).map(source => ({ source })),
  ];
  const streams: TimelineStream[] = cursor ? cursor.streams.map(stream => ({ ...stream, pending: [...stream.pending] }))
    : sources.map(source => ({ ...source, after: null, exhausted: false, pending: [] }));
  if (streams.length !== sources.length || streams.some((stream, i) => stream.source !== sources[i].source || JSON.stringify(stream.accountIds) !== JSON.stringify(sources[i].accountIds))) throw Error('movements/invalid-cursor');
  let issues = 0, cashIncomplete = false;
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
  const fetchPage = async (stream: TimelineStream) => {
    const isNew = stream.source === 'new', isGroup = stream.source === 'group-legacy', isCash = stream.source === 'legacy-cash';
    const officialPersonalLegacy = !isNew && !isGroup && officialLegacy;
    if (isNew && officialLegacy) { stream.exhausted = true; issues++; return; }
    const base = isNew ? movements(client, scope) : isGroup ? collection(client.db, 'financialGroups', scope.id, 'movements') : collection(client.db, isCash ? 'cashRescues' : stream.source === 'legacy-gain' ? 'gains' : 'expenses');
    const filters: QueryConstraint[] = isNew ? [where('status', '==', 'posted'), ...(stream.accountIds!.length ?
      [where('accountId', stream.accountIds!.length === 1 ? '==' : 'in',
        stream.accountIds![0] === CASH_HISTORY_ID ? null : stream.accountIds!.length === 1 ? stream.accountIds![0] : stream.accountIds!)] : [])] : isGroup ? (accountId ? [where('bankId', '==', accountId)] : []) : [
      where('personId', '==', scope.uid),
      ...(officialPersonalLegacy ? [] : [...(accountId && !isCash ? [where('bankId', '==', accountId)] : []), where('groupId', '==', null), where('financialGroupId', '==', null), where('ledgerGroupId', '==', null)]),
    ];
    filters.push(where('date', '>=', Timestamp.fromDate(isNew ? from : legacyFrom)), where('date', '<', Timestamp.fromDate(isNew && !canonical ? to : legacyTo)));
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
    // The official index is per owner/date, so a bounded page can contain
    // movements from another account of the same authenticated user.
    const records = (cashFallback ? [...snap.docs].reverse() : snap.docs).map(item => ({ item, effectiveSource: stream.source as PresentationSource }));
    const candidates = records.filter(({ item }) => {
      const id = item.data()[isNew ? 'accountId' : 'bankId'];
      if (canonical) {
        const data = item.data();
        const migrated = typeof data.historicalSourcePath === 'string';
        const instant = data.date.toMillis();
        return instant >= (migrated ? legacyFrom : from).getTime() && instant < (migrated ? legacyTo : to).getTime();
      }
      if (isNew && stream.accountIds?.[0] === CASH_HISTORY_ID) return id === null;
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
        const migrated = typeof data.historicalSourcePath === 'string';
        const noAccount = data.accountId === null;
        const value = parseLedgerEntry(item.id, data, scope);
        const [year, month, day] = value.date.split('-').map(Number);
        record = { id: item.id, storageSource: 'new', name: value.name, type: value.type, valueInCents: value.amountCents,
          date: migrated ? toFinancialCivilDate(data.date.toDate()) : value.time
            ? toFinancialCivilDate(data.occurredAt.toDate()) : new Date(year, month - 1, day), bankId: noAccount ? null : value.accountId,
          occurrenceTime: migrated ? financialTime(data.date.toDate()) : value.time,
          historical: migrated, moneyFormat: noAccount && (!migrated || data.moneyFormat === true),
          ...(scope.kind === 'group' && validId(data.createdBy) ? { personId: data.createdBy } : {}),
          explanation: value.explanation, paymentFormats: value.paymentFormats };
        if ('operation' in value) {
          if (value.operation === 'cash-withdrawal') record.isCashRescue = true;
          else Object.assign(record, { isBankTransfer: true, bankTransferPairId: value.transferId, bankTransferDirection: value.operation === 'transfer-out' ? 'outgoing' : 'incoming' });
        } else {
          const category = includeCategories ? await categoryFor(value.categoryId, value.categorySource) : null;
          Object.assign(record, { tagId: `${value.categorySource}:${value.categoryId}`, tagName: category?.name ?? 'Categoria indisponível', tagIconFamily: category?.iconFamily, tagIconName: category?.iconName, tagIconStyle: category?.iconStyle, isFromMandatory: value.isFromMandatory, paymentMethod: value.paymentMethod, plannedInstallmentCents: data.plannedInstallmentCents, recurringTemplateId: typeof data.recurringTemplateId === 'string' ? data.recurringTemplateId : undefined });
        }
      } else if (effectiveSource === 'legacy-cash') {
        if (data.personId !== scope.uid || data.groupId != null || data.financialGroupId != null || data.ledgerGroupId != null ||
          !validCents(data.valueInCents) || data.valueInCents <= 0 || data.deleted === true ||
          (data.status != null && !['active', 'posted'].includes(data.status))) return null;
        record = { id: item.id, storageSource: 'legacy-cash', name: 'Saque em dinheiro', type: 'expense', valueInCents: data.valueInCents,
          date: toFinancialCivilDate(data.date.toDate()), occurrenceTime: financialTime(data.date.toDate()), bankId: data.bankId, isCashRescue: true,
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
          date: toFinancialCivilDate(data.date.toDate()), occurrenceTime: financialTime(data.date.toDate()), bankId: data.bankId, tagId: usableCategory ? `${usableCategory.source}:${data.tagId}` : null, tagName: usableCategory?.name ?? null,
          tagIconFamily: usableCategory?.iconFamily, tagIconName: usableCategory?.iconName, tagIconStyle: usableCategory?.iconStyle,
          isBankTransfer: isTransfer, bankTransferDirection: isTransfer ? data.bankTransferDirection : null,
          isInvestmentDeposit: isDeposit, isInvestmentRedemption: isRedemption,
          investmentNameSnapshot: typeof data.investmentNameSnapshot === 'string' ? data.investmentNameSnapshot : null,
          bankTransferSourceBankNameSnapshot: typeof data.bankTransferSourceBankNameSnapshot === 'string' ? data.bankTransferSourceBankNameSnapshot : null,
          bankTransferTargetBankNameSnapshot: typeof data.bankTransferTargetBankNameSnapshot === 'string' ? data.bankTransferTargetBankNameSnapshot : null,
          isFromMandatory: isMandatory,
          explanation: typeof data.explanation === 'string' ? data.explanation : null };
      }
      return { day: civilDateKey(record.date!), createdAt: data.createdAt, source: stream.source, id: record.id, record };
    }));
    const present = items.filter((item): item is NonNullable<typeof item> => item !== null);
    stream.pending.push(...present);
    issues += items.length - present.length;
  };
  const frontier = () => Math.max(...streams.map(stream => unreadDay(stream.after, stream.exhausted)));
  let boundary = frontier();
  for (let reads = 0; reads < MAX_PAGE_READS && boundary !== -Infinity &&
    streams.reduce((count, stream) => count + stream.pending.filter(item => item.day > boundary).length, 0) < MAX_PAGE_SIZE; reads++) {
    await Promise.all(streams.filter(stream => unreadDay(stream.after, stream.exhausted) === boundary).map(fetchPage));
    boundary = frontier();
  }
  const page = streams.flatMap(stream => stream.pending.filter(item => item.day > boundary)).sort((a, b) => compareMovementOrder(a, b, officialLegacy)).slice(0, MAX_PAGE_SIZE);
  const delivered = new Set(page);
  for (const stream of streams) stream.pending = stream.pending.filter(item => !delivered.has(item));
  const items = page.map(item => item.record);
  return { items, issues, cashIncomplete, cursor: streams.some(stream => stream.pending.length || !stream.exhausted) ? { streams } : null };
}
