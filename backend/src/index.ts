import { findTagIconByLabel } from '../../utils/tagIconCatalog';
import { createHash } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  FieldPath,
  getFirestore,
  Timestamp,
  type DocumentData,
  type Transaction as FirestoreTransaction,
} from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import {
  assertCashBalanceWillRemainNonNegative,
  assertCents,
  assertClientActionId,
  createReversalTransaction,
  isFinancialAccountKind,
  requiresOverdraftJustification,
  validateLedgerTransaction,
  type FinancialAccountKind,
  type LedgerLeg,
  type LedgerTransaction,
  type LedgerTransactionKind,
} from '../../utils/financialLedger';
import {
	createLegacyMigrationPlan,
  type MigrationIssue,
  type LegacyMigrationInput,
} from '../../utils/financialLedgerMigration';
import { fromFinancialCivilDate, toFinancialCivilDate } from '../../utils/financialCivilDate';
import type { FinanceMonthlySummaryV1 } from '../../utils/financeReadModels';
import { createAssistantRecordFingerprint } from '../../utils/assistantRecordFingerprint';
import { getMandatoryInstallmentValueInCents, normalizeMandatoryInstallmentTotal, resolveMandatoryInstallmentsCompleted } from '../../utils/mandatoryInstallments';

if (getApps().length === 0) initializeApp();

const db = getFirestore();
export { bankBalanceAdjustment } from './bankBalanceAdjustments';
export { executeLegacyFinancialMovement } from './legacyFinancialMovements';
const REGION = 'southamerica-east1';
const MAX_MIGRATION_WRITES_PER_CALL = 400;

setGlobalOptions({ region: REGION, maxInstances: 20 });

type FinancialRole = 'admin' | 'member';
type JsonRecord = Record<string, unknown>;

function requestFingerprint(value: unknown): string {
  const canonical = (entry: unknown): unknown => {
    if (entry instanceof Date) return entry.toISOString();
    if (entry instanceof Timestamp) return entry.toDate().toISOString();
    if (Array.isArray(entry)) return entry.map(canonical);
    if (entry && typeof entry === 'object') return Object.fromEntries(Object.entries(entry).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
    return entry;
  };
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
type MandatoryNotificationKind = 'expense' | 'gain';
type ExpoPushTicket = {
  status?: unknown;
  details?: { error?: unknown };
};

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_MESSAGE_LIMIT = 100;

type FinancialAccountDocument = {
  groupId: string;
  kind: FinancialAccountKind;
  currentBalanceInCents: number;
  archivedAt?: Timestamp | null;
  isActive: boolean;
};

function asRecord(value: unknown, field = 'data'): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', field + ' must be an object.');
  }
  return value as JsonRecord;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError('invalid-argument', field + ' is required.');
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  return requiredString(value, field);
}

function requiredCents(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new HttpsError('invalid-argument', field + ' must be a safe integer in cents.');
  }
  return value;
}

function requiredPositiveCents(value: unknown, field: string): number {
  const cents = requiredCents(value, field);
  if (cents <= 0) throw new HttpsError('invalid-argument', field + ' must be greater than zero.');
  return cents;
}

function optionalDate(value: unknown, field: string): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) return date;
  }
  throw new HttpsError('invalid-argument', field + ' must be an ISO-8601 timestamp.');
}

function timestampToDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return new Date(0);
}

function callableUserId(request: { auth?: { uid: string } | null; data?: unknown }): string {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in before performing a financial operation.');
  }
  if (request.data && typeof request.data === 'object' && 'expectedActorId' in request.data && request.data.expectedActorId !== request.auth.uid) throw new HttpsError('unauthenticated', 'The account changed while the operation was being sent.');
  return request.auth.uid;
}

function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && /^(?:ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(value);
}

async function linkedRecipientIds(ownerId: string): Promise<string[]> {
  const owner = await db.doc('users/' + ownerId).get();
  const related = Array.isArray(owner.data()?.relatedIdUsers)
    ? owner.data()!.relatedIdUsers.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
    : [];
  return Array.from(new Set([ownerId, ...related]));
}

async function remoteDevicesForRecipients(recipientIds: string[]) {
  const snapshots = await Promise.all(recipientIds.map(userId => db.collection('users').doc(userId).collection('pushDevices').get()));
  return snapshots.flatMap(snapshot => snapshot.docs.flatMap(device => {
    const token = device.data().expoPushToken;
    return isExpoPushToken(token) ? [{ token, reference: device.ref }] : [];
  }));
}

async function sendRemoteNotification({
  ownerId,
  title,
  body,
  data,
}: {
  ownerId: string;
  title: string;
  body: string;
  data: JsonRecord;
}) {
  const recipientIds = await linkedRecipientIds(ownerId);
  const devices = await remoteDevicesForRecipients(recipientIds);
  const uniqueDevices = Array.from(new Map(devices.map(device => [device.token, device])).values());
  let acceptedCount = 0;

  for (let index = 0; index < uniqueDevices.length; index += EXPO_PUSH_MESSAGE_LIMIT) {
    const batch = uniqueDevices.slice(index, index + EXPO_PUSH_MESSAGE_LIMIT);
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(batch.map(device => ({
        to: device.token,
        title,
        body,
        sound: 'default',
        priority: 'high',
        data: { notificationSystem: 'lumus-remote-notifications-v1', ...data },
      }))),
    });
    if (!response.ok) throw new Error('Expo Push respondeu com HTTP ' + response.status + '.');

    const payload = await response.json() as { data?: ExpoPushTicket[] };
    const tickets = Array.isArray(payload.data) ? payload.data : [];
    await Promise.all(batch.map(async (device, ticketIndex) => {
      const ticket = tickets[ticketIndex];
      if (ticket?.status === 'ok') {
        acceptedCount += 1;
      } else if (ticket?.details?.error === 'DeviceNotRegistered') {
        await device.reference.delete();
      }
    }));
  }

  return { recipientCount: recipientIds.length, deviceCount: uniqueDevices.length, acceptedCount };
}

function mandatoryNotificationCopy(kind: MandatoryNotificationKind, operation: 'created' | 'updated' | 'deleted', name: string) {
  const subject = kind === 'expense' ? 'Gasto obrigatório' : 'Ganho obrigatório';
  const action = operation === 'created' ? 'adicionado' : operation === 'deleted' ? 'removido' : 'atualizado';
  return {
    title: `${subject} ${action}`,
    body: `${name} foi ${action} em uma conta vinculada.`,
  };
}

async function notifyMandatoryDocumentChange(kind: MandatoryNotificationKind, event: { params: { id: string }; data?: { before: { exists: boolean; data: () => DocumentData | undefined }; after: { exists: boolean; data: () => DocumentData | undefined } } }) {
  const before = event.data?.before;
  const after = event.data?.after;
  if (!before || !after || (!before.exists && !after.exists)) return;

  const previous = before.exists ? before.data() ?? {} : {};
  const current = after.exists ? after.data() ?? {} : {};
  const source = after.exists ? current : previous;
  const ownerId = typeof source.personId === 'string' ? source.personId : null;
  if (!ownerId) return;
  const operation = !before.exists ? 'created' : !after.exists ? 'deleted' : 'updated';
  const name = typeof source.name === 'string' && source.name.trim().length > 0
    ? source.name.trim()
    : kind === 'expense' ? 'Gasto sem nome' : 'Ganho sem nome';
  const copy = mandatoryNotificationCopy(kind, operation, name);

  try {
    await sendRemoteNotification({
      ownerId,
      ...copy,
      data: { kind, operation, templateId: event.params.id },
    });
  } catch (error) {
    // O Firestore já confirmou a alteração. Uma falha de entrega não a desfaz.
    console.error('Erro ao enviar notificação remota de recorrência:', error);
  }
}

function operationReference(groupId: string, clientActionId: string) {
  return db.doc('financialGroups/' + groupId + '/operations/' + clientActionId);
}

async function roleFor(
  transaction: FirestoreTransaction,
  groupId: string,
  userId: string,
): Promise<FinancialRole> {
  const groupSnapshot = await transaction.get(db.doc('financialGroups/' + groupId));
  if (!groupSnapshot.exists) {
    throw new HttpsError('not-found', 'Financial group was not found.');
  }
  if (groupSnapshot.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'Financial group is not active.');
  const members = asRecord(groupSnapshot.data()?.members ?? {}, 'financialGroups.members');
  const role = members[userId];
  if (role !== 'admin' && role !== 'member') {
    throw new HttpsError('permission-denied', 'You are not a member of this financial group.');
  }
  return role;
}

async function requireAdmin(
  transaction: FirestoreTransaction,
  groupId: string,
  userId: string,
): Promise<void> {
  if (await roleFor(transaction, groupId, userId) !== 'admin') {
    throw new HttpsError('permission-denied', 'Only financial group administrators may perform this action.');
  }
}

function accountDocument(snapshot: { data: () => DocumentData | undefined }, accountId: string): FinancialAccountDocument {
  const data = snapshot.data() ?? {};
  const groupId = typeof data.groupId === 'string' ? data.groupId : '';
  const kind = data.kind;
  const currentBalanceInCents = data.currentBalanceInCents;

  if (!groupId || !isFinancialAccountKind(kind) || !Number.isSafeInteger(currentBalanceInCents)) {
    throw new HttpsError('failed-precondition', 'Financial account ' + accountId + ' has invalid persisted data.');
  }

  return {
    groupId,
    kind,
    currentBalanceInCents,
    archivedAt: data.archivedAt instanceof Timestamp ? data.archivedAt : null,
    isActive: data.isActive !== false,
  };
}

function toStoredTransaction(transaction: LedgerTransaction): DocumentData {
  return {
    id: transaction.id,
    groupId: transaction.groupId,
    kind: transaction.kind,
    effectiveAt: Timestamp.fromDate(transaction.effectiveAt),
    actorId: transaction.actorId,
    clientActionId: transaction.clientActionId,
    categoryId: transaction.categoryId ?? null,
    note: transaction.note ?? null,
    overdraftReason: transaction.overdraftReason ?? null,
    reversesTransactionId: transaction.reversesTransactionId ?? null,
    sourceReferences: transaction.sourceReferences ?? [],
    legs: transaction.legs,
    createdAt: FieldValue.serverTimestamp(),
  };
}

function fromStoredTransaction(id: string, data: DocumentData): LedgerTransaction {
  const legs = Array.isArray(data.legs)
    ? data.legs.map((leg: unknown) => {
      const parsed = asRecord(leg, 'ledger leg');
      return {
        accountId: typeof parsed.accountId === 'string' ? parsed.accountId : null,
        deltaInCents: requiredCents(parsed.deltaInCents, 'ledger leg deltaInCents'),
      } as LedgerLeg;
    })
    : [];
  const sourceReferences = Array.isArray(data.sourceReferences)
    ? data.sourceReferences.flatMap((reference: unknown) => {
      const parsed = asRecord(reference, 'source reference');
      if (typeof parsed.collection !== 'string' || typeof parsed.id !== 'string') return [];
      return [{ collection: parsed.collection, id: parsed.id }];
    })
    : [];

  return {
    id,
    groupId: requiredString(data.groupId, 'transaction.groupId'),
    kind: requiredString(data.kind, 'transaction.kind') as LedgerTransactionKind,
    effectiveAt: timestampToDate(data.effectiveAt),
    actorId: requiredString(data.actorId, 'transaction.actorId'),
    clientActionId: requiredString(data.clientActionId, 'transaction.clientActionId'),
    categoryId: typeof data.categoryId === 'string' ? data.categoryId : null,
    note: typeof data.note === 'string' ? data.note : null,
    overdraftReason: typeof data.overdraftReason === 'string' ? data.overdraftReason : null,
    reversesTransactionId: typeof data.reversesTransactionId === 'string' ? data.reversesTransactionId : null,
    sourceReferences,
    legs,
  };
}

type PersistedLedgerResult = {
  transactionId: string;
  idempotent: boolean;
};

async function persistLedgerTransaction(
  firestoreTransaction: FirestoreTransaction,
  ledgerTransaction: LedgerTransaction,
  deferred?: { writes: Array<() => void>; balances: Map<string, number> },
  assistantRequestFingerprint?: unknown,
): Promise<PersistedLedgerResult> {
  try {
    validateLedgerTransaction(ledgerTransaction);
  } catch (error) {
    throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid ledger transaction.');
  }

  const role = await roleFor(firestoreTransaction, ledgerTransaction.groupId, ledgerTransaction.actorId);
  const operationRef = operationReference(ledgerTransaction.groupId, ledgerTransaction.clientActionId);
  const operationSnapshot = await firestoreTransaction.get(operationRef);
  const ledgerFingerprint = requestFingerprint(ledgerTransaction);
  if (operationSnapshot.exists) {
    if (assistantRequestFingerprint !== undefined && operationSnapshot.data()?.assistantRequestFingerprint !== assistantRequestFingerprint) throw new HttpsError('failed-precondition', 'Assistant arguments changed after commit.');
    const previousActorId = operationSnapshot.data()?.actorId;
    if (previousActorId !== ledgerTransaction.actorId) {
      throw new HttpsError('already-exists', 'clientActionId was already used by another member.');
    }
    const transactionId = operationSnapshot.data()?.transactionId;
    if (typeof transactionId === 'string') {
      const previous = operationSnapshot.data()?.ledgerFingerprint;
      const stored = previous ? null : await firestoreTransaction.get(db.doc('ledgerTransactions/' + transactionId));
      const previousFingerprint = previous ?? (stored?.exists ? requestFingerprint(fromStoredTransaction(stored.id, stored.data()!)) : null);
      if (previousFingerprint !== ledgerFingerprint) throw new HttpsError('failed-precondition', 'Financial arguments changed under the same request identity.');
      return { transactionId, idempotent: true };
    }
    throw new HttpsError('already-exists', 'clientActionId belongs to another operation.');
  }

  if (ledgerTransaction.categoryId) {
    const category = await firestoreTransaction.get(db.doc('tags/' + ledgerTransaction.categoryId));
    if (!category.exists) throw new HttpsError('not-found', 'Category was not found.');
    const metadata = category.data()!;
    const usage = ledgerTransaction.kind === 'expense' ? 'expense' : ledgerTransaction.kind === 'income' ? 'gain' : null;
    if (usage && metadata.usageType !== undefined && metadata.usageType !== 'both' && metadata.usageType !== usage) throw new HttpsError('failed-precondition', 'Category does not accept this movement type.');
    if (metadata.groupId !== ledgerTransaction.groupId && metadata.personId !== ledgerTransaction.actorId) {
      const owner = typeof metadata.personId === 'string' ? await firestoreTransaction.get(db.doc('users/' + metadata.personId)) : null;
      if (owner?.data()?.financialGroupId !== ledgerTransaction.groupId) throw new HttpsError('permission-denied', 'Category is outside the financial group.');
    }
  }

  const accountIds = ledgerTransaction.legs
    .flatMap((leg) => (leg.accountId === null ? [] : [leg.accountId]));
  const accountRefs = accountIds.map((accountId) => db.doc('financialAccounts/' + accountId));
  const accountSnapshots = await Promise.all(accountRefs.map((reference) => firestoreTransaction.get(reference)));
  const updatedBalances = new Map<string, number>();

  accountSnapshots.forEach((snapshot, index) => {
    const accountId = accountIds[index];
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Financial account ' + accountId + ' was not found.');
    }
    const account = accountDocument(snapshot, accountId);
    if (account.groupId !== ledgerTransaction.groupId) {
      throw new HttpsError('permission-denied', 'Every ledger leg must belong to the same financial group.');
    }
    if (account.archivedAt || !account.isActive) {
      throw new HttpsError('failed-precondition', 'Archived financial accounts cannot receive new movements.');
    }

    const deltaInCents = ledgerTransaction.legs.find((leg) => leg.accountId === accountId)?.deltaInCents ?? 0;
    const currentBalanceInCents = deferred?.balances.get(accountId) ?? account.currentBalanceInCents;
    const nextBalanceInCents = currentBalanceInCents + deltaInCents;
    if (!Number.isSafeInteger(nextBalanceInCents)) throw new HttpsError('failed-precondition', 'Account balance exceeds exact integer cents.', { reason: 'amount-limit' });
    if (!deferred && account.kind === 'investment' && nextBalanceInCents < 0) throw new HttpsError('failed-precondition', 'Investment balance cannot become negative.');
    if (!deferred && account.kind === 'cash') {
      try {
        assertCashBalanceWillRemainNonNegative(currentBalanceInCents, deltaInCents);
      } catch (error) {
        throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'Cash cannot become negative.');
      }
    }
    if (!deferred && requiresOverdraftJustification(account.kind, currentBalanceInCents, deltaInCents)) {
      if (typeof ledgerTransaction.overdraftReason !== 'string' || ledgerTransaction.overdraftReason.trim().length < 3) {
        throw new HttpsError('failed-precondition', 'A bank overdraft requires a recorded justification.');
      }
    }
    updatedBalances.set(accountId, nextBalanceInCents);
  });

  const ledgerRef = db.doc('ledgerTransactions/' + ledgerTransaction.id);
  const existingLedgerSnapshot = await firestoreTransaction.get(ledgerRef);
  if (existingLedgerSnapshot.exists) {
    if (requestFingerprint(fromStoredTransaction(existingLedgerSnapshot.id, existingLedgerSnapshot.data()!)) === ledgerFingerprint) {
      return { transactionId: ledgerTransaction.id, idempotent: true };
    }
    throw new HttpsError('already-exists', 'Ledger transaction id already exists.');
  }

  const write = () => {
  firestoreTransaction.set(ledgerRef, toStoredTransaction(ledgerTransaction));
  writeLedgerMonthlySummary(firestoreTransaction, ledgerTransaction);
  updatedBalances.forEach((currentBalanceInCents, accountId) => {
    firestoreTransaction.update(db.doc('financialAccounts/' + accountId), {
      currentBalanceInCents,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  firestoreTransaction.set(operationRef, {
    actorId: ledgerTransaction.actorId,
    transactionId: ledgerTransaction.id,
    operation: ledgerTransaction.kind,
    ledgerFingerprint,
    assistantRequestFingerprint: typeof assistantRequestFingerprint === 'string' ? assistantRequestFingerprint : null,
    createdAt: FieldValue.serverTimestamp(),
  });
  firestoreTransaction.set(db.doc('financialAuditEvents/' + ledgerTransaction.id), {
    groupId: ledgerTransaction.groupId,
    actorId: ledgerTransaction.actorId,
    action: ledgerTransaction.kind,
    transactionId: ledgerTransaction.id,
    clientActionId: ledgerTransaction.clientActionId,
    createdAt: FieldValue.serverTimestamp(),
  });
  };
  if (deferred) {
    deferred.writes.push(write);
    updatedBalances.forEach((balance, accountId) => deferred.balances.set(accountId, balance));
  } else write();

  // The read proves membership, including that a member is still active. Roles
  // are intentionally not used to grant members any account-management ability.
  void role;
  return { transactionId: ledgerTransaction.id, idempotent: false };
}

async function validateDeferredLedgerBalances(transaction: FirestoreTransaction, deferred: { balances: Map<string, number> }, overdraftReason?: unknown) {
  for (const [accountId, finalBalance] of deferred.balances) {
    const snapshot = await transaction.get(db.doc('financialAccounts/' + accountId));
    const account = accountDocument(snapshot, accountId);
    if (!Number.isSafeInteger(finalBalance) || ((account.kind === 'cash' || account.kind === 'investment') && finalBalance < 0)) throw new HttpsError('failed-precondition', 'The correction would leave an invalid account balance.');
    if (account.kind === 'bank' && finalBalance < 0 && (typeof overdraftReason !== 'string' || overdraftReason.trim().length < 3)) throw new HttpsError('failed-precondition', 'A corrected bank overdraft requires a justification.');
  }
}

function newLedgerId(prefix: string, clientActionId: string): string {
  return prefix + '-' + clientActionId;
}

function monthKeyFor(date: Date): string {
  const civil = toFinancialCivilDate(date);
  return `${civil.getFullYear()}-${String(civil.getMonth() + 1).padStart(2, '0')}`;
}

/** Stored in the same transaction as the ledger command; duplicate commands do not double-count. */
function writeLedgerMonthlySummary(transaction: FirestoreTransaction, ledgerTransaction: LedgerTransaction) {
  const monthKey = monthKeyFor(ledgerTransaction.effectiveAt);
  const bankDeltaInCents: Record<string, number> = {};
  ledgerTransaction.legs.forEach(leg => {
    if (leg.accountId) bankDeltaInCents[leg.accountId] = (bankDeltaInCents[leg.accountId] ?? 0) + leg.deltaInCents;
  });
  const increments = Object.fromEntries(Object.entries(bankDeltaInCents).map(([accountId, delta]) => [
    accountId, FieldValue.increment(delta),
  ]));
  transaction.set(db.doc(`financeMonthlySummaries/${ledgerTransaction.groupId}-${monthKey}`), {
    version: 1,
    scopeType: 'group',
    scopeId: ledgerTransaction.groupId,
    groupId: ledgerTransaction.groupId,
    monthKey,
    transactionCount: FieldValue.increment(1),
    bankDeltaInCents: increments,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function rebuildLedgerSummaryForMonth(groupId: string, monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const start = Timestamp.fromDate(fromFinancialCivilDate(new Date(year, month - 1, 1)));
  const end = Timestamp.fromDate(fromFinancialCivilDate(new Date(year, month, 1)));
  const snapshot = await db.collection('ledgerTransactions')
    .where('groupId', '==', groupId)
    .where('effectiveAt', '>=', start)
    .where('effectiveAt', '<', end)
    .get();
  const bankDeltaInCents: Record<string, number> = {};
  snapshot.docs.forEach(document => {
    const legs = Array.isArray(document.data().legs) ? document.data().legs : [];
    legs.forEach((leg: unknown) => {
      const item = leg as { accountId?: unknown; deltaInCents?: unknown };
      if (typeof item.accountId === 'string' && typeof item.deltaInCents === 'number' && Number.isSafeInteger(item.deltaInCents)) {
        bankDeltaInCents[item.accountId] = (bankDeltaInCents[item.accountId] ?? 0) + item.deltaInCents;
      }
    });
  });
  await db.doc(`financeMonthlySummaries/${groupId}-${monthKey}`).set({
    version: 1,
    scopeType: 'group',
    scopeId: groupId,
    groupId,
    monthKey,
    transactionCount: snapshot.size,
    bankDeltaInCents,
    updatedAt: FieldValue.serverTimestamp(),
  } satisfies FinanceMonthlySummaryV1, { merge: false });
  return snapshot.size;
}

function ledgerTransactionFromMovement(data: JsonRecord, actorId: string): LedgerTransaction {
  const groupId = requiredString(data.groupId, 'groupId');
  const accountId = requiredString(data.accountId, 'accountId');
  const direction = requiredString(data.direction, 'direction');
  if (direction !== 'income' && direction !== 'expense') {
    throw new HttpsError('invalid-argument', 'direction must be income or expense.');
  }
  const amountInCents = requiredPositiveCents(data.amountInCents, 'amountInCents');
  const clientActionId = requiredString(data.clientActionId, 'clientActionId');
  try {
    assertClientActionId(clientActionId);
  } catch (error) {
    throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid clientActionId.');
  }
  const deltaInCents = direction === 'income' ? amountInCents : -amountInCents;

  return {
    id: newLedgerId(direction, clientActionId),
    groupId,
    kind: direction,
    effectiveAt: optionalDate(data.effectiveAt, 'effectiveAt'),
    actorId,
    clientActionId,
    categoryId: optionalString(data.categoryId, 'categoryId'),
    note: optionalString(data.note, 'note'),
    overdraftReason: optionalString(data.overdraftReason, 'overdraftReason'),
    legs: [
      { accountId, deltaInCents },
      { accountId: null, deltaInCents: -deltaInCents },
    ],
  };
}

function ledgerTransactionFromTransfer(data: JsonRecord, actorId: string): LedgerTransaction {
  const groupId = requiredString(data.groupId, 'groupId');
  const fromAccountId = requiredString(data.fromAccountId, 'fromAccountId');
  const toAccountId = requiredString(data.toAccountId, 'toAccountId');
  if (fromAccountId === toAccountId) {
    throw new HttpsError('invalid-argument', 'Source and destination accounts must be different.');
  }
  const clientActionId = requiredString(data.clientActionId, 'clientActionId');
  try {
    assertClientActionId(clientActionId);
  } catch (error) {
    throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid clientActionId.');
  }
  const kind = data.kind === 'investment_deposit' || data.kind === 'investment_redemption'
    ? data.kind
    : 'transfer';
  const amountInCents = requiredPositiveCents(data.amountInCents, 'amountInCents');

  return {
    id: newLedgerId(kind, clientActionId),
    groupId,
    kind,
    effectiveAt: optionalDate(data.effectiveAt, 'effectiveAt'),
    actorId,
    clientActionId,
    categoryId: optionalString(data.categoryId, 'categoryId'),
    note: optionalString(data.note, 'note'),
    overdraftReason: optionalString(data.overdraftReason, 'overdraftReason'),
    legs: [
      { accountId: fromAccountId, deltaInCents: -amountInCents },
      { accountId: toAccountId, deltaInCents: amountInCents },
    ],
  };
}

export const postMovement = onCall(async (request) => {
  const actorId = callableUserId(request);
  const data = asRecord(request.data);
  return db.runTransaction(async (transaction) => persistLedgerTransaction(
    transaction,
    ledgerTransactionFromMovement(data, actorId), undefined, data.assistantRequestFingerprint,
  ));
});

export const transferFunds = onCall(async (request) => {
  const actorId = callableUserId(request);
  const data = asRecord(request.data);
  return db.runTransaction(async (transaction) => persistLedgerTransaction(
    transaction,
    ledgerTransactionFromTransfer(data, actorId), undefined, data.assistantRequestFingerprint,
  ));
});

export const correctMovement = onCall(async (request) => {
  const actorId = callableUserId(request);
  const data = asRecord(request.data);
  const groupId = requiredString(data.groupId, 'groupId');
  const originalTransactionId = requiredString(data.originalTransactionId, 'originalTransactionId');
  const replacement = ledgerTransactionFromMovement(data, actorId);
  const fingerprint = requestFingerprint(data);
  return db.runTransaction(async transaction => {
    const role = await roleFor(transaction, groupId, actorId);
    const receiptRef = operationReference(groupId, replacement.clientActionId);
    const receipt = await transaction.get(receiptRef);
    if (receipt.exists) {
      if (receipt.data()?.actorId !== actorId || receipt.data()?.fingerprint !== fingerprint) throw new HttpsError('failed-precondition', 'Correction arguments changed under the same request identity.');
      return { ...receipt.data()?.result, idempotent: true };
    }
    const originalSnapshot = await transaction.get(db.doc('ledgerTransactions/' + originalTransactionId));
    if (!originalSnapshot.exists) throw new HttpsError('not-found', 'Original transaction was not found.');
    const original = fromStoredTransaction(originalSnapshot.id, originalSnapshot.data()!);
    if (original.groupId !== groupId || (role !== 'admin' && original.actorId !== actorId)) throw new HttpsError('permission-denied', 'You may only correct your own group movements.');
    if ((original.kind !== 'expense' && original.kind !== 'income') || original.kind !== replacement.kind) throw new HttpsError('failed-precondition', 'Only ordinary income and expenses use this correction command.');
    const reversalReceiptRef = operationReference(groupId, 'reversal_of_' + createHash('sha256').update(originalTransactionId).digest('hex'));
    const reversalReceipt = await transaction.get(reversalReceiptRef);
    const previousReversals = await transaction.get(db.collection('ledgerTransactions').where('groupId', '==', groupId).where('reversesTransactionId', '==', originalTransactionId));
    if (reversalReceipt.exists || !previousReversals.empty) throw new HttpsError('failed-precondition', 'Original movement was already reversed or replaced.');
    const reversal = createReversalTransaction(original, {
      id: newLedgerId('correction_reversal', replacement.clientActionId), effectiveAt: replacement.effectiveAt,
      actorId, clientActionId: replacement.clientActionId + '_reverse', note: 'Estorno para correção',
    });
    const deferred = { writes: [] as Array<() => void>, balances: new Map<string, number>() };
    await persistLedgerTransaction(transaction, reversal, deferred);
    const replacementResult = await persistLedgerTransaction(transaction, { ...replacement, clientActionId: replacement.clientActionId + '_replace' }, deferred);
    await validateDeferredLedgerBalances(transaction, deferred, data.overdraftReason);
    deferred.writes.forEach(write => write());
    const result = { transactionId: replacementResult.transactionId, reversalTransactionId: reversal.id, idempotent: false };
    transaction.set(reversalReceiptRef, { actorId, clientActionId: replacement.clientActionId, transactionId: reversal.id, operation: 'correctMovement', createdAt: FieldValue.serverTimestamp() });
    transaction.set(receiptRef, { actorId, assistantRequestFingerprint: data.assistantRequestFingerprint ?? null, fingerprint, operation: 'correctMovement', result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const notifyMandatoryExpenseChange = onDocumentWritten(
  'mandatoryExpenses/{id}',
  event => notifyMandatoryDocumentChange('expense', event),
);

export const notifyMandatoryGainChange = onDocumentWritten(
  'mandatoryGains/{id}',
  event => notifyMandatoryDocumentChange('gain', event),
);

export const reverseTransaction = onCall(async (request) => {
  const actorId = callableUserId(request);
  const data = asRecord(request.data);
  const groupId = requiredString(data.groupId, 'groupId');
  const originalTransactionId = requiredString(data.transactionId, 'transactionId');
  const clientActionId = requiredString(data.clientActionId, 'clientActionId');
  const fingerprint = requestFingerprint(data);
  try {
    assertClientActionId(clientActionId);
  } catch (error) {
    throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid clientActionId.');
  }

  return db.runTransaction(async (transaction) => {
    const role = await roleFor(transaction, groupId, actorId);
    const originalSnapshot = await transaction.get(db.doc('ledgerTransactions/' + originalTransactionId));
    if (!originalSnapshot.exists) throw new HttpsError('not-found', 'Original ledger transaction was not found.');
    const original = fromStoredTransaction(originalSnapshot.id, originalSnapshot.data() ?? {});
    if (original.groupId !== groupId) throw new HttpsError('permission-denied', 'Transaction belongs to another group.');
    if (original.sourceReferences?.some(source => source.collection === 'bankBalanceAdjustments')) {
      throw new HttpsError('failed-precondition', 'Use o estorno de ajuste de saldo para preservar o histórico do banco.');
    }
    if (role !== 'admin' && original.actorId !== actorId) {
      throw new HttpsError('permission-denied', 'Members may only reverse their own transactions.');
    }

    const reversalReceipt = operationReference(groupId, 'reversal_of_' + createHash('sha256').update(originalTransactionId).digest('hex'));
    const receipt = await transaction.get(reversalReceipt);
    if (receipt.exists) {
      const data = receipt.data();
      if (data?.clientActionId === clientActionId && data.actorId === actorId && data.fingerprint === fingerprint) return { transactionId: data.transactionId, idempotent: true };
      throw new HttpsError('failed-precondition', 'This ledger transaction was already reversed.');
    }
    const existingReversals = await transaction.get(db.collection('ledgerTransactions').where('groupId', '==', groupId).where('reversesTransactionId', '==', originalTransactionId));
    if (!existingReversals.empty) {
      const existing = existingReversals.docs[0]!;
      if (existing.data().clientActionId === clientActionId && existing.data().actorId === actorId) return { transactionId: existing.id, idempotent: true };
      throw new HttpsError('failed-precondition', 'This ledger transaction was already reversed.');
    }

    const reversal = createReversalTransaction(original, {
      id: newLedgerId('reversal', clientActionId),
      effectiveAt: optionalDate(data.effectiveAt, 'effectiveAt'),
      actorId,
      clientActionId,
      note: optionalString(data.note, 'note'),
    });
    const result = await persistLedgerTransaction(transaction, reversal, undefined, data.assistantRequestFingerprint);
    transaction.set(reversalReceipt, { actorId, assistantRequestFingerprint: data.assistantRequestFingerprint ?? null, clientActionId, fingerprint, transactionId: result.transactionId, operation: 'reverseTransaction', createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const reconcileAccount = onCall(async (request) => {
  const actorId = callableUserId(request);
  const data = asRecord(request.data);
  const groupId = requiredString(data.groupId, 'groupId');
  const accountId = requiredString(data.accountId, 'accountId');
  const countedBalanceInCents = requiredCents(data.countedBalanceInCents, 'countedBalanceInCents');
  const effectiveAt = optionalDate(data.effectiveAt, 'effectiveAt');
  const clientActionId = requiredString(data.clientActionId, 'clientActionId');
  const reconciliationFingerprint = requestFingerprint(data);
  try {
    assertClientActionId(clientActionId);
  } catch (error) {
    throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid clientActionId.');
  }

  return db.runTransaction(async (transaction) => {
    await requireAdmin(transaction, groupId, actorId);
    const receiptRef = operationReference(groupId, clientActionId);
    const receipt = await transaction.get(receiptRef);
    if (receipt.exists) {
      if (receipt.data()?.actorId !== actorId || receipt.data()?.reconciliationFingerprint !== reconciliationFingerprint) throw new HttpsError('failed-precondition', 'Reconciliation arguments changed under the same request identity.');
      return { ...receipt.data()?.result, idempotent: true };
    }
    const accountSnapshot = await transaction.get(db.doc('financialAccounts/' + accountId));
    if (!accountSnapshot.exists) throw new HttpsError('not-found', 'Financial account was not found.');
    const account = accountDocument(accountSnapshot, accountId);
    if (account.groupId !== groupId) throw new HttpsError('permission-denied', 'Account belongs to another group.');

    const ledgerSnapshots = await transaction.get(
      db.collection('ledgerTransactions').where('groupId', '==', groupId),
    );
    const laterDeltaInCents = ledgerSnapshots.docs.reduce((total, snapshot) => {
      const persisted = fromStoredTransaction(snapshot.id, snapshot.data());
      if (persisted.effectiveAt.valueOf() <= effectiveAt.valueOf()) return total;
      return total + (persisted.legs.find((leg) => leg.accountId === accountId)?.deltaInCents ?? 0);
    }, 0);
    const balanceAtEffectiveAt = account.currentBalanceInCents - laterDeltaInCents;
    const differenceInCents = countedBalanceInCents - balanceAtEffectiveAt;
    const adjustment: LedgerTransaction = {
      id: newLedgerId('reconciliation', clientActionId),
      groupId,
      kind: 'reconciliation_adjustment',
      effectiveAt,
      actorId,
      clientActionId,
      note: optionalString(data.note, 'note'),
      overdraftReason: optionalString(data.overdraftReason, 'overdraftReason'),
      legs: [
        { accountId, deltaInCents: differenceInCents },
        { accountId: null, deltaInCents: -differenceInCents },
      ],
    };

    if (differenceInCents === 0) {
      const operationRef = operationReference(groupId, clientActionId);
      const existingOperation = await transaction.get(operationRef);
      if (!existingOperation.exists) {
        transaction.set(operationRef, {
          actorId,
          transactionId: null,
          operation: 'reconciliation',
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    } else {
      await persistLedgerTransaction(transaction, adjustment);
    }

    const reconciliationId = 'reconciliation-' + clientActionId;
    transaction.set(db.doc('accountReconciliations/' + reconciliationId), {
      id: reconciliationId,
      groupId,
      accountId,
      effectiveAt: Timestamp.fromDate(effectiveAt),
      countedBalanceInCents,
      differenceInCents,
      source: 'manual',
      transactionId: differenceInCents === 0 ? null : adjustment.id,
      createdBy: actorId,
      createdAt: FieldValue.serverTimestamp(),
    });
    const result = {
      reconciliationId,
      transactionId: differenceInCents === 0 ? null : adjustment.id,
      differenceInCents,
    };
    transaction.set(receiptRef, { actorId, assistantRequestFingerprint: data.assistantRequestFingerprint ?? null, transactionId: result.transactionId, operation: 'reconciliation', reconciliationFingerprint, result, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    return result;
  });
});

// [[Assistente Lumus]]: metadata remains readable by the existing screens; writes after cutover are governed here.
const metadataCollections: Record<string, string> = { category: 'tags', mandatoryExpense: 'mandatoryExpenses', mandatoryGain: 'mandatoryGains', cdi: 'investmentCdiRates' };

function validatedMetadata(domain: string, raw: JsonRecord, current: JsonRecord = {}): JsonRecord {
  const allowed = domain === 'category' ? ['name', 'usageType', 'isMandatoryExpense', 'isMandatoryGain', 'showInBothLists', 'iconLabel']
    : domain === 'cdi' ? ['annualRateInBasisPoints', 'effectiveFrom']
    : ['name', 'valueInCents', 'dueDay', 'usesBusinessDays', 'tagId', 'description', 'reminderEnabled', 'reminderConfigVersion', 'reminderDaysBefore', 'reminderOnDueDate', 'reminderHour', 'reminderMinute', 'installmentTotal', 'installmentTotalValueInCents', 'installmentStartDate', 'installmentEndDate'];
  if (Object.keys(raw).some(key => !allowed.includes(key))) throw new HttpsError('invalid-argument', 'Unsupported metadata field.');
  const fields = { ...current, ...raw };
  if (domain === 'cdi') {
    const rate = requiredCents(fields.annualRateInBasisPoints, 'annualRateInBasisPoints');
    if (rate < 0 || rate > 100_000) throw new HttpsError('invalid-argument', 'CDI rate is out of range.');
    return { annualRateInBasisPoints: rate, effectiveFrom: Timestamp.fromDate(optionalDate(fields.effectiveFrom, 'effectiveFrom')) };
  }
  const name = requiredString(fields.name, 'name');
  if (name.length > 160) throw new HttpsError('invalid-argument', 'Name is too long.');
  if (domain === 'category') {
    if (!['expense', 'gain', 'both'].includes(String(fields.usageType))) throw new HttpsError('invalid-argument', 'Invalid category usage.');
    const icon = raw.iconLabel === undefined ? { iconFamily: current.iconFamily ?? null, iconName: current.iconName ?? null, iconStyle: current.iconStyle ?? null }
      : raw.iconLabel === null ? { iconFamily: null, iconName: null, iconStyle: null }
      : typeof raw.iconLabel === 'string' ? findTagIconByLabel(raw.iconLabel) : null;
    if (!icon) throw new HttpsError('invalid-argument', 'Unknown category icon.', { reason: 'invalid-icon' });
    return { name: fields.name, usageType: fields.usageType, showInBothLists: fields.showInBothLists === true,
      iconFamily: icon.iconFamily, iconName: icon.iconName, iconStyle: icon.iconStyle ?? null,
      isMandatoryExpense: fields.usageType !== 'gain' && (fields.isMandatoryExpense === true || fields.showInBothLists === true),
      isMandatoryGain: fields.usageType !== 'expense' && (fields.isMandatoryGain === true || fields.showInBothLists === true) };
  }
  requiredPositiveCents(fields.valueInCents, 'valueInCents');
  if (!Number.isInteger(fields.dueDay) || Number(fields.dueDay) < 1 || Number(fields.dueDay) > 31) throw new HttpsError('invalid-argument', 'dueDay must be 1 to 31.');
  const total = normalizeMandatoryInstallmentTotal(fields.installmentTotal);
  if (fields.installmentTotal !== undefined && fields.installmentTotal !== null && total === null) throw new HttpsError('invalid-argument', 'Invalid installment quantity.');
  const output: JsonRecord = Object.fromEntries(allowed.filter(key => fields[key] !== undefined).map(key => [key, fields[key]]));
  if (total !== null) {
    const contractTotal = requiredPositiveCents(raw.installmentTotalValueInCents ?? (raw.valueInCents === undefined ? current.installmentTotalValueInCents : undefined) ?? Number(fields.valueInCents) * total, 'installmentTotalValueInCents');
    if (contractTotal < total) throw new HttpsError('invalid-argument', 'Each installment must contain at least one cent.');
    if (Number(current.installmentsCompleted ?? 0) > total) throw new HttpsError('failed-precondition', 'Plan quantity is below already completed installments.');
    output.installmentTotalValueInCents = contractTotal;
    output.valueInCents = Math.floor(contractTotal / total);
  } else { output.installmentTotal = null; output.installmentTotalValueInCents = null; }
  for (const key of ['installmentStartDate', 'installmentEndDate']) if (output[key] !== undefined && output[key] !== null) output[key] = Timestamp.fromDate(optionalDate(output[key], key));
  if (output.installmentStartDate && output.installmentEndDate && timestampToDate(output.installmentStartDate).valueOf() > timestampToDate(output.installmentEndDate).valueOf()) throw new HttpsError('invalid-argument', 'Installment end precedes start.');
  for (const [key, max] of [['reminderHour', 23], ['reminderMinute', 59], ['reminderDaysBefore', 3]] as const) {
    if (output[key] !== undefined && (!Number.isInteger(output[key]) || Number(output[key]) < 0 || Number(output[key]) > max)) throw new HttpsError('invalid-argument', 'Invalid reminder configuration.');
  }
  output.reminderConfigVersion = 1;
  return output;
}

export const manageFinancialMetadata = onCall(async (request) => {
  const actorId = callableUserId(request); const data = asRecord(request.data);
  const groupId = optionalString(data.groupId, 'groupId'); const domain = requiredString(data.domain, 'domain');
  const collectionName = metadataCollections[domain]; if (!collectionName) throw new HttpsError('invalid-argument', 'Unknown metadata domain.');
  const action = requiredString(data.action, 'action'); if (!['create', 'update', 'delete', 'upsert'].includes(action)) throw new HttpsError('invalid-argument', 'Unknown metadata action.');
  const clientActionId = requiredString(data.clientActionId, 'clientActionId'); assertClientActionId(clientActionId);
  const fingerprint = requestFingerprint(data); const fields = asRecord(data.fields ?? {}, 'fields');
  const recordId = action === 'create' ? 'metadata-' + actorId + '-' + clientActionId : requiredString(data.recordId, 'recordId');
  const reference = db.doc(collectionName + '/' + recordId);
  return db.runTransaction(async transaction => {
    if (groupId) await roleFor(transaction, groupId, actorId);
    else {
      if (domain !== 'category' || action !== 'delete') throw new HttpsError('invalid-argument', 'A financial group is required for this metadata command.');
      const user = await transaction.get(db.doc('users/' + actorId));
      if (!user.exists || user.data()?.financialGroupId || user.data()?.financialLegacyCutoverAt) throw new HttpsError('permission-denied', 'Legacy metadata cannot be changed after financial cutover.');
      if (typeof data.assistantRequestFingerprint !== 'string') throw new HttpsError('invalid-argument', 'Legacy request fingerprint is required.');
    }
    const receiptId = 'assistant_' + createAssistantRecordFingerprint({ personId: actorId, actionId: clientActionId, suffix: 'receipt' }) + '_receipt';
    const receiptRef = groupId ? operationReference(groupId, clientActionId) : db.doc('assistantOperationReceipts/' + receiptId); const receipt = await transaction.get(receiptRef);
    if (receipt.exists) {
      if ((receipt.data()?.actorId ?? receipt.data()?.personId) !== actorId || (receipt.data()?.serverFingerprint ?? receipt.data()?.fingerprint) !== fingerprint) throw new HttpsError('failed-precondition', 'Metadata changed under the same request identity.');
      return { ...receipt.data()?.result, idempotent: true };
    }
    const existing = await transaction.get(reference); const current = existing.data() ?? {};
    if (existing.exists && (current.personId !== actorId || (current.groupId && current.groupId !== groupId))) throw new HttpsError('permission-denied', 'Only the metadata owner may change it.');
    if (!existing.exists && (action === 'update' || action === 'delete')) throw new HttpsError('not-found', 'Metadata was not found.');
    if (action === 'create' && existing.exists) throw new HttpsError('already-exists', 'Metadata already exists.');
    if (data.expectedFingerprint && createAssistantRecordFingerprint(current) !== data.expectedFingerprint) throw new HttpsError('failed-precondition', 'Metadata changed after confirmation.');
    if (action === 'delete' && domain === 'category') {
      const linkedCollections = await Promise.all(['expenses', 'gains', 'mandatoryExpenses', 'mandatoryGains'].map(name => transaction.get(db.collection(name).where('tagId', '==', recordId).limit(1))));
      const ledgerLinks = await transaction.get(db.collection('ledgerTransactions').where('categoryId', '==', recordId).limit(1));
      if (linkedCollections.some(snapshot => !snapshot.empty) || !ledgerLinks.empty) throw new HttpsError('failed-precondition', 'Reclassify linked records before deleting this category.', { reason: 'linked-record' });
    }
    if (action === 'delete') transaction.delete(reference);
    else {
      const validated = validatedMetadata(domain, fields, current);
      if (typeof validated.tagId === 'string') {
        const category = await transaction.get(db.doc('tags/' + validated.tagId));
        if (!category.exists || (category.data()?.personId !== actorId && category.data()?.groupId !== groupId)) throw new HttpsError('permission-denied', 'Category is outside the current scope.');
        const usage = domain === 'mandatoryExpense' ? 'expense' : 'gain';
        if (category.data()?.usageType !== undefined && !['both', usage].includes(String(category.data()?.usageType))) throw new HttpsError('failed-precondition', 'Category does not accept this recurring type.');
      }
      transaction.set(reference, { ...validated, personId: actorId, groupId, assistantActionId: current.assistantActionId ?? clientActionId, updatedAt: FieldValue.serverTimestamp(),
        ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp(), ...(domain.startsWith('mandatory') ? { installmentsCompleted: 0, completedCycles: {}, assistantCycleHistoryComplete: true } : {}) }) }, { merge: true });
    }
    const result = { recordId, idempotent: false };
    transaction.set(receiptRef, { actorId, assistantRequestFingerprint: data.assistantRequestFingerprint ?? null, fingerprint: groupId ? fingerprint : data.assistantRequestFingerprint, result, operation: 'manageFinancialMetadata.' + domain + '.' + action, ...(groupId ? {} : { personId: actorId, clientActionId, kind: 'delete_category', serverFingerprint: fingerprint }), createdAt: FieldValue.serverTimestamp() });
    transaction.set(db.doc('financialAuditEvents/metadata-' + (groupId ?? actorId) + '-' + clientActionId), { groupId, actorId, collection: collectionName, recordId, action, clientActionId, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const completeFinancialRecurring = onCall(async request => {
  const actorId = callableUserId(request); const data = asRecord(request.data);
  const groupId = requiredString(data.groupId, 'groupId'); const templateId = requiredString(data.templateId, 'templateId');
  const recurringType = requiredString(data.recurringType, 'recurringType');
  if (!['expense', 'gain'].includes(recurringType)) throw new HttpsError('invalid-argument', 'Unknown recurring type.');
  const action = requiredString(data.action, 'action'); if (!['settle', 'undo'].includes(action)) throw new HttpsError('invalid-argument', 'Unknown recurring operation.');
  const effectiveAt = optionalDate(data.effectiveAt, 'effectiveAt'); const clientActionId = requiredString(data.clientActionId, 'clientActionId'); assertClientActionId(clientActionId);
  const fingerprint = requestFingerprint(data); const expense = recurringType === 'expense';
  const reference = db.doc((expense ? 'mandatoryExpenses/' : 'mandatoryGains/') + templateId);
  const civilParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(effectiveAt);
  const civil = Object.fromEntries(civilParts.map(part => [part.type, part.value]));
  const cycleKey = civil.year + '-' + civil.month;
  const linkKey = expense ? 'lastPaymentExpenseId' : 'lastReceiptGainId'; const cycleField = expense ? 'lastPaymentCycle' : 'lastReceiptCycle';
  const countKey = expense ? 'lastPaymentInstallmentsCount' : 'lastReceiptInstallmentsCount'; const dateKey = expense ? 'lastPaymentDate' : 'lastReceiptDate';
  return db.runTransaction(async transaction => {
    await roleFor(transaction, groupId, actorId);
    const receiptRef = operationReference(groupId, clientActionId); const receipt = await transaction.get(receiptRef);
    if (receipt.exists) {
      if (receipt.data()?.actorId !== actorId || receipt.data()?.fingerprint !== fingerprint) throw new HttpsError('failed-precondition', 'Recurring arguments changed under the same identity.');
      return { ...receipt.data()?.result, idempotent: true };
    }
    const template = await transaction.get(reference); if (!template.exists) throw new HttpsError('not-found', 'Recurring plan was not found.');
    const current = template.data()!;
    if (current.personId !== actorId || (current.groupId && current.groupId !== groupId)) throw new HttpsError('permission-denied', 'Only the plan owner may settle or undo it.');
    if (data.expectedFingerprint && createAssistantRecordFingerprint(current) !== data.expectedFingerprint) throw new HttpsError('failed-precondition', 'Recurring plan changed after confirmation.');
    let movement: LedgerTransaction; let updates: JsonRecord; let amountInCents: number;
    if (action === 'undo') {
      const linkedId = requiredString(current[linkKey], 'completed transaction'); const linked = await transaction.get(db.doc('ledgerTransactions/' + linkedId));
      if (!linked.exists || linked.data()?.groupId !== groupId) throw new HttpsError('failed-precondition', 'Completed plan transaction is unavailable.');
      const reversals = await transaction.get(db.collection('ledgerTransactions').where('groupId', '==', groupId).where('reversesTransactionId', '==', linkedId));
      if (!reversals.empty) throw new HttpsError('failed-precondition', 'Completed plan transaction was already reversed.');
      movement = createReversalTransaction(fromStoredTransaction(linked.id, linked.data()!), { id: newLedgerId('recurring-reversal', clientActionId), effectiveAt, actorId, clientActionId, note: 'Estorno de recorrência' });
      amountInCents = Math.abs(movement.legs.find(leg => leg.accountId !== null)?.deltaInCents ?? 0);
      const completedCycles = { ...asRecord(current.completedCycles ?? {}, 'completedCycles') }; delete completedCycles[String(current[cycleField])];
      updates = { completedCycles, [linkKey]: null, [cycleField]: null, [dateKey]: null, [countKey]: null, installmentsCompleted: Math.max(0, Number(current.installmentsCompleted ?? 0) - Number(current[countKey] ?? 1)) };
    } else {
      if (current[cycleField] === cycleKey || asRecord(current.completedCycles ?? {}, 'completedCycles')[cycleKey]) throw new HttpsError('failed-precondition', 'This cycle was already completed.', { reason: 'already-completed-cycle' });
      const cycleFor = (value: unknown) => { const civil = toFinancialCivilDate(timestampToDate(value)); return civil.getFullYear() + '-' + String(civil.getMonth() + 1).padStart(2, '0'); };
      if (current.installmentStartDate && cycleFor(current.installmentStartDate) > cycleKey || current.installmentEndDate && cycleFor(current.installmentEndDate) < cycleKey) throw new HttpsError('failed-precondition', 'The settlement is outside the installment plan civil months.', { reason: 'plan-outside-period' });
      if (current.assistantCycleHistoryComplete !== true && typeof current[cycleField] === 'string' && cycleKey < current[cycleField]) throw new HttpsError('failed-precondition', 'Historical recurring payments cannot be proven from legacy last-cycle data.', { reason: 'history-unavailable' });
      const total = normalizeMandatoryInstallmentTotal(current.installmentTotal);
      const completed = resolveMandatoryInstallmentsCompleted({ storedCompleted: current.installmentsCompleted, installmentTotal: total, startDate: current.installmentStartDate ? toFinancialCivilDate(timestampToDate(current.installmentStartDate)) : null, isCurrentCycleCompleted: false, referenceDate: toFinancialCivilDate(effectiveAt) });
      const quantity = data.installmentsToAdvance === undefined ? 1 : requiredCents(data.installmentsToAdvance, 'installmentsToAdvance');
      if (quantity < 1 || quantity > (total === null ? 1 : total - completed)) throw new HttpsError('failed-precondition', 'Requested quantity exceeds remaining installments.', { reason: 'installment-complete' });
      amountInCents = total === null ? requiredPositiveCents(data.valueInCents ?? current.valueInCents, 'valueInCents') : getMandatoryInstallmentValueInCents({ installmentTotal: total, installmentsCompleted: completed, installmentsToSettle: quantity, installmentValueInCents: current.valueInCents, installmentTotalValueInCents: current.installmentTotalValueInCents }) ?? 0;
      if (amountInCents <= 0 || (total !== null && data.valueInCents !== undefined && data.valueInCents !== amountInCents)) throw new HttpsError('invalid-argument', 'Installment settlement must match its contractual cents.');
      const accountId = requiredString(data.accountId, 'accountId');
      movement = { id: newLedgerId('recurring', clientActionId), groupId, kind: expense ? 'expense' : 'income', effectiveAt, actorId, clientActionId, categoryId: typeof current.tagId === 'string' ? current.tagId : null, note: String(current.name ?? 'Recorrência'), overdraftReason: optionalString(data.overdraftReason, 'overdraftReason'), sourceReferences: [{ collection: expense ? 'mandatoryExpenses' : 'mandatoryGains', id: templateId }], legs: [{ accountId, deltaInCents: expense ? -amountInCents : amountInCents }, { accountId: null, deltaInCents: expense ? amountInCents : -amountInCents }] };
      updates = { [linkKey]: movement.id, [cycleField]: cycleKey, [dateKey]: Timestamp.fromDate(effectiveAt), [countKey]: quantity, completedCycles: { ...asRecord(current.completedCycles ?? {}, 'completedCycles'), [cycleKey]: { transactionId: movement.id, installmentsCount: quantity, amountInCents } }, ...(total === null ? {} : { installmentsCompleted: completed + quantity }) };
    }
    await persistLedgerTransaction(transaction, movement);
    transaction.update(reference, { ...updates, groupId, updatedAt: FieldValue.serverTimestamp() });
    const result = { transactionId: movement.id, amountInCents, idempotent: false };
    transaction.set(receiptRef, { actorId, assistantRequestFingerprint: data.assistantRequestFingerprint ?? null, fingerprint, result, operation: 'completeFinancialRecurring.' + action, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    return result;
  });
});

function validatedAccountMetadata(raw: unknown, kind: string): JsonRecord {
  const fields = raw === undefined ? {} : asRecord(raw, 'metadata');
  const allowed = kind === 'investment' ? ['bankAccountId', 'cdiPercentageInBasisPoints', 'assetType', 'valuationMethod', 'redemptionTerm', 'description', 'colorHex', 'iconKey'] : ['colorHex', 'iconKey', 'isActive'];
  if (Object.keys(fields).some(key => !allowed.includes(key))) throw new HttpsError('invalid-argument', 'Unsupported account metadata field.');
  if (fields.isActive !== undefined && typeof fields.isActive !== 'boolean') throw new HttpsError('invalid-argument', 'Invalid bank activity status.');
  if (fields.cdiPercentageInBasisPoints !== undefined && (!Number.isSafeInteger(fields.cdiPercentageInBasisPoints) || Number(fields.cdiPercentageInBasisPoints) < 0 || Number(fields.cdiPercentageInBasisPoints) > 1_000_000)) throw new HttpsError('invalid-argument', 'Invalid fixed-point CDI percentage.');
  if (fields.assetType !== undefined && !['fixed_income', 'treasury', 'stock', 'fund'].includes(String(fields.assetType))) throw new HttpsError('invalid-argument', 'Invalid asset type.');
  if (fields.valuationMethod !== undefined && !['cdi', 'manual'].includes(String(fields.valuationMethod))) throw new HttpsError('invalid-argument', 'Invalid valuation method.');
  if (fields.assetType !== undefined && fields.assetType !== 'fixed_income' && fields.valuationMethod === 'cdi') throw new HttpsError('invalid-argument', 'This asset requires a manual valuation.');
  for (const key of ['redemptionTerm', 'description', 'colorHex', 'iconKey', 'bankAccountId']) if (fields[key] !== undefined && fields[key] !== null && typeof fields[key] !== 'string') throw new HttpsError('invalid-argument', 'Invalid account metadata text.');
  if (typeof fields.colorHex === 'string' && !/^#[0-9a-f]{6}$/i.test(fields.colorHex)) throw new HttpsError('invalid-argument', 'Invalid account color.');
  return fields;
}

export const manageAccount = onCall(async (request) => {
  const actorId = callableUserId(request);
  const data = asRecord(request.data);
  const groupId = requiredString(data.groupId, 'groupId');
  const action = requiredString(data.action, 'action');
  const clientActionId = requiredString(data.clientActionId, 'clientActionId');
  const fingerprint = requestFingerprint(data);
  try {
    assertClientActionId(clientActionId);
  } catch (error) {
    throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid clientActionId.');
  }

  return db.runTransaction(async (transaction) => {
    await requireAdmin(transaction, groupId, actorId);
    const operationRef = operationReference(groupId, clientActionId);
    const operationSnapshot = await transaction.get(operationRef);
    if (operationSnapshot.exists) {
      if (operationSnapshot.data()?.actorId !== actorId || operationSnapshot.data()?.fingerprint !== fingerprint) throw new HttpsError('failed-precondition', 'Account arguments changed under the same request identity.');
      return { ...operationSnapshot.data()?.result, idempotent: true };
    }

    if (action === 'create') {
      const kind = data.kind;
      if (!isFinancialAccountKind(kind)) {
        throw new HttpsError('invalid-argument', 'kind must be bank, cash or investment.');
      }
      const name = requiredString(data.name, 'name');
      const metadata = validatedAccountMetadata(data.metadata, kind);
      const initialBalanceInCents = data.initialBalanceInCents === undefined ? 0 : requiredCents(data.initialBalanceInCents, 'initialBalanceInCents');
      const countedBalanceInCents = data.initialCountedBalanceInCents === undefined ? initialBalanceInCents : requiredCents(data.initialCountedBalanceInCents, 'initialCountedBalanceInCents');
      if (kind !== 'investment' && countedBalanceInCents !== initialBalanceInCents) throw new HttpsError('invalid-argument', 'Initial valuation applies only to investments.');
      if (kind === 'investment' && countedBalanceInCents < 0) throw new HttpsError('invalid-argument', 'Initial investment valuation cannot be negative.');
      const effectiveAt = data.effectiveAt === undefined ? new Date() : optionalDate(data.effectiveAt, 'effectiveAt');
      const overdraftReason = optionalString(data.overdraftReason, 'overdraftReason');
      if ((kind === 'cash' || kind === 'investment') && initialBalanceInCents < 0) {
        throw new HttpsError('invalid-argument', 'Cash and investment opening balances cannot be negative.');
      }
      if (kind === 'bank' && initialBalanceInCents < 0 && (!overdraftReason || overdraftReason.length < 3)) {
        throw new HttpsError('failed-precondition', 'A negative bank opening requires a recorded justification.');
      }
      const accountId = kind === 'cash'
        ? 'cash-' + groupId
        : 'account-' + groupId + '-' + clientActionId;
      const accountRef = db.doc('financialAccounts/' + accountId);
      const existingAccount = await transaction.get(accountRef);
      if (existingAccount.exists) {
        throw new HttpsError('already-exists', kind === 'cash' ? 'This group already has a cash account.' : 'Account already exists.');
      }
      if (typeof metadata.bankAccountId === 'string') {
        const linkedBank = await transaction.get(db.doc('financialAccounts/' + metadata.bankAccountId));
        if (!linkedBank.exists || linkedBank.data()?.groupId !== groupId || linkedBank.data()?.kind !== 'bank' || linkedBank.data()?.archivedAt || linkedBank.data()?.isActive === false) throw new HttpsError('permission-denied', 'The investment bank must be active in this group.');
      }
      const fundingAccountId = optionalString(data.fundingAccountId, 'fundingAccountId');
      let fundingBalance: number | null = null;
      if (fundingAccountId) {
        if (kind !== 'investment' || initialBalanceInCents <= 0) throw new HttpsError('invalid-argument', 'Funding applies to positive initial investments.');
        const funding = await transaction.get(db.doc('financialAccounts/' + fundingAccountId));
        if (!funding.exists) throw new HttpsError('not-found', 'Funding account was not found.');
        const bank = accountDocument(funding, fundingAccountId);
        if (bank.groupId !== groupId || bank.kind !== 'bank' || bank.archivedAt || !bank.isActive) throw new HttpsError('permission-denied', 'Funding requires an active bank of this group.');
        fundingBalance = bank.currentBalanceInCents - initialBalanceInCents;
        if (!Number.isSafeInteger(fundingBalance) || fundingBalance < 0) throw new HttpsError('failed-precondition', 'Insufficient investment funding balance.', { reason: 'insufficient-balance' });
      }
      transaction.set(accountRef, {
        id: accountId,
        assistantActionId: clientActionId,
        groupId,
        kind,
        name,
        legacyBankId: optionalString(data.legacyBankId, 'legacyBankId'),
        legacyInvestmentId: optionalString(data.legacyInvestmentId, 'legacyInvestmentId'),
        currentBalanceInCents: countedBalanceInCents,
        ...metadata,
        ...(kind === 'investment' ? { openingTransactionId: initialBalanceInCents > 0 && fundingAccountId ? newLedgerId('opening', clientActionId) : null, bankAccountId: fundingAccountId ?? metadata.bankAccountId ?? null, initialValueInCents: initialBalanceInCents, date: Timestamp.fromDate(effectiveAt), personId: actorId } : {}),
        archivedAt: null,
        createdBy: actorId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (initialBalanceInCents !== 0) {
        // [[Balanço Mensal]]: creating the account and its opening event is one atomic operation.
        const opening: LedgerTransaction = {
          id: newLedgerId('opening', clientActionId), groupId, kind: fundingAccountId ? 'investment_deposit' : 'reconciliation_adjustment', effectiveAt,
          actorId, clientActionId, note: 'Saldo inicial', overdraftReason,
          legs: [{ accountId, deltaInCents: initialBalanceInCents }, { accountId: fundingAccountId, deltaInCents: -initialBalanceInCents }],
        };
        validateLedgerTransaction(opening);
        transaction.set(db.doc('ledgerTransactions/' + opening.id), toStoredTransaction(opening));
        writeLedgerMonthlySummary(transaction, opening);
        if (fundingAccountId && fundingBalance !== null) transaction.update(db.doc('financialAccounts/' + fundingAccountId), { currentBalanceInCents: fundingBalance, updatedAt: FieldValue.serverTimestamp() });
        if (!fundingAccountId) transaction.set(db.doc('accountReconciliations/opening-' + clientActionId), {
          groupId, accountId, effectiveAt: Timestamp.fromDate(effectiveAt), countedBalanceInCents: initialBalanceInCents,
          differenceInCents: initialBalanceInCents, source: 'manual', transactionId: opening.id,
          createdBy: actorId, createdAt: FieldValue.serverTimestamp(),
        });
        transaction.set(db.doc('financialAuditEvents/' + opening.id), {
          groupId, actorId, action: 'manageAccount.create', transactionId: opening.id,
          clientActionId, createdAt: FieldValue.serverTimestamp(),
        });
      }
      if (countedBalanceInCents !== initialBalanceInCents) {
        const differenceInCents = countedBalanceInCents - initialBalanceInCents;
        const valuation: LedgerTransaction = { id: newLedgerId('initial-valuation', clientActionId), groupId, kind: 'reconciliation_adjustment', effectiveAt, actorId, clientActionId: clientActionId + '_valuation', note: 'Valor atual informado na criação', legs: [{ accountId, deltaInCents: differenceInCents }, { accountId: null, deltaInCents: -differenceInCents }] };
        validateLedgerTransaction(valuation); transaction.set(db.doc('ledgerTransactions/' + valuation.id), toStoredTransaction(valuation)); writeLedgerMonthlySummary(transaction, valuation);
        transaction.set(db.doc('accountReconciliations/initial-valuation-' + clientActionId), { groupId, accountId, effectiveAt: Timestamp.fromDate(effectiveAt), countedBalanceInCents, differenceInCents, transactionId: valuation.id, source: 'manual', createdBy: actorId, createdAt: FieldValue.serverTimestamp() });
        transaction.set(db.doc('financialAuditEvents/' + valuation.id), { groupId, actorId, action: 'manageAccount.initialValuation', transactionId: valuation.id, clientActionId, createdAt: FieldValue.serverTimestamp() });
      }
      const result = { accountId, idempotent: false };
      transaction.set(operationRef, {
        actorId,
        assistantRequestFingerprint: data.assistantRequestFingerprint ?? null,
        operation: 'manageAccount.create',
        fingerprint,
        result,
        createdAt: FieldValue.serverTimestamp(),
      });
      return result;
    }

    const accountId = requiredString(data.accountId, 'accountId');
    const accountRef = db.doc('financialAccounts/' + accountId);
    const accountSnapshot = await transaction.get(accountRef);
    if (!accountSnapshot.exists) throw new HttpsError('not-found', 'Financial account was not found.');
    const account = accountDocument(accountSnapshot, accountId);
    if (account.groupId !== groupId) throw new HttpsError('permission-denied', 'Account belongs to another group.');
    if (typeof data.expectedName === 'string' && accountSnapshot.data()?.name !== data.expectedName) {
      throw new HttpsError('failed-precondition', 'The account changed after the proposal was prepared.');
    }

    if (typeof data.expectedFingerprint === 'string' && createAssistantRecordFingerprint(accountSnapshot.data()!) !== data.expectedFingerprint) throw new HttpsError('failed-precondition', 'Account changed after confirmation.');
    if (action === 'update') {
      const metadata = validatedAccountMetadata(data.metadata, account.kind);
      const previousMetadata = Object.fromEntries(['bankAccountId', 'cdiPercentageInBasisPoints', 'assetType', 'valuationMethod', 'redemptionTerm', 'description', 'colorHex', 'iconKey', 'isActive'].filter(key => accountSnapshot.data()?.[key] !== undefined && (account.kind === 'investment' ? key !== 'isActive' : ['colorHex', 'iconKey', 'isActive'].includes(key))).map(key => [key, accountSnapshot.data()![key]]));
      validatedAccountMetadata({ ...previousMetadata, ...metadata }, account.kind);
      if (typeof metadata.bankAccountId === 'string') {
        const bank = await transaction.get(db.doc('financialAccounts/' + metadata.bankAccountId));
        if (!bank.exists || bank.data()?.groupId !== groupId || bank.data()?.kind !== 'bank' || bank.data()?.archivedAt || bank.data()?.isActive === false) throw new HttpsError('permission-denied', 'Investment bank is outside this group.');
      }
      const deferred = { writes: [] as Array<() => void>, balances: new Map<string, number>() };
      let principalMetadata: JsonRecord = {};
      if (data.initialValueInCents !== undefined) {
        if (account.kind !== 'investment') throw new HttpsError('invalid-argument', 'Principal correction applies only to investments.');
        const principal = requiredCents(data.initialValueInCents, 'initialValueInCents'); if (principal < 0) throw new HttpsError('invalid-argument', 'Principal cannot be negative.');
        const openingId = typeof accountSnapshot.data()?.openingTransactionId === 'string' ? accountSnapshot.data()!.openingTransactionId : typeof accountSnapshot.data()?.legacyInvestmentId === 'string' ? 'migration-investment-' + accountSnapshot.data()!.legacyInvestmentId : null;
        const original = openingId ? await transaction.get(db.doc('ledgerTransactions/' + openingId)) : null;
        let fundingId = typeof metadata.bankAccountId === 'string' ? metadata.bankAccountId : typeof accountSnapshot.data()?.bankAccountId === 'string' ? accountSnapshot.data()!.bankAccountId : null;
        let effectiveAt = optionalDate(data.effectiveAt, 'effectiveAt');
        if (original?.exists) {
          const opening = fromStoredTransaction(original.id, original.data()!);
          if (opening.groupId !== groupId || opening.kind !== 'investment_deposit' || !opening.legs.some(leg => leg.accountId === accountId && leg.deltaInCents > 0)) throw new HttpsError('failed-precondition', 'Original principal event is unavailable.', { reason: 'original-unavailable' });
          const prior = await transaction.get(db.collection('ledgerTransactions').where('groupId', '==', groupId).where('reversesTransactionId', '==', opening.id));
          if (!prior.empty) throw new HttpsError('failed-precondition', 'Original principal was already reversed.', { reason: 'already-reversed' });
          fundingId = typeof metadata.bankAccountId === 'string' ? metadata.bankAccountId : opening.legs.find(leg => leg.accountId !== accountId && leg.accountId !== null)?.accountId ?? fundingId;
          effectiveAt = opening.effectiveAt;
          await persistLedgerTransaction(transaction, createReversalTransaction(opening, { id: newLedgerId('principal-reversal', clientActionId), effectiveAt, actorId, clientActionId: clientActionId + '_principal_reverse', note: 'Estorno para corrigir aporte inicial' }), deferred);
        } else if (openingId) throw new HttpsError('failed-precondition', 'Original principal transaction cannot be proven.', { reason: 'original-unavailable' });
        const replacementId = newLedgerId('principal-replacement', clientActionId);
        if (principal > 0) {
          if (!fundingId) throw new HttpsError('failed-precondition', 'Initial principal requires a linked bank.');
          await persistLedgerTransaction(transaction, { id: replacementId, groupId, kind: 'investment_deposit', effectiveAt, actorId, clientActionId: clientActionId + '_principal_replace', note: 'Aporte inicial corrigido', overdraftReason: optionalString(data.overdraftReason, 'overdraftReason'), legs: [{ accountId: fundingId, deltaInCents: -principal }, { accountId, deltaInCents: principal }] }, deferred);
        }
        principalMetadata = { initialValueInCents: principal, openingTransactionId: principal > 0 ? replacementId : null };
      }
      if (data.countedBalanceInCents !== undefined) {
        if (account.kind !== 'investment') throw new HttpsError('invalid-argument', 'Use bank balance adjustment for bank reconciliation.');
        const counted = requiredCents(data.countedBalanceInCents, 'countedBalanceInCents');
        if (counted < 0) throw new HttpsError('invalid-argument', 'Investment valuation cannot be negative.');
        const difference = counted - (deferred.balances.get(accountId) ?? account.currentBalanceInCents);
        if (difference !== 0) {
          await persistLedgerTransaction(transaction, { id: newLedgerId('account-update', clientActionId), groupId, kind: 'reconciliation_adjustment', effectiveAt: optionalDate(data.effectiveAt, 'effectiveAt'), actorId, clientActionId: clientActionId + '_valuation', note: 'Sincronização do investimento', legs: [{ accountId, deltaInCents: difference }, { accountId: null, deltaInCents: -difference }] }, deferred);
        }
      }
      await validateDeferredLedgerBalances(transaction, deferred, data.overdraftReason);
      deferred.writes.forEach(write => write());
      transaction.update(accountRef, { ...metadata, ...principalMetadata, ...(data.name === undefined ? {} : { name: requiredString(data.name, 'name') }), updatedAt: FieldValue.serverTimestamp() });
    } else if (action === 'rename') {
      transaction.update(accountRef, {
        name: requiredString(data.name, 'name'),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (action === 'archive') {
      transaction.update(accountRef, {
        archivedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      throw new HttpsError('invalid-argument', 'action must be create, update, rename or archive.');
    }
    const result = { accountId, idempotent: false };
    transaction.set(operationRef, {
      actorId,
      assistantRequestFingerprint: data.assistantRequestFingerprint ?? null,
      operation: 'manageAccount.' + action,
      fingerprint,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
});

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readLegacyDate(data: DocumentData): Date {
  const rawDate = data.date ?? data.createdAt;
  if (rawDate === undefined || rawDate === null) {
    throw new HttpsError('invalid-argument', 'Legacy document has no date or createdAt value.');
  }
  const date = timestampToDate(rawDate);
  if (Number.isNaN(date.valueOf())) {
    throw new HttpsError('invalid-argument', 'Legacy document has an invalid date value.');
  }
  return date;
}

async function legacyDocumentsForMembers(collectionName: string, memberIds: string[]) {
  const documents: Array<{ id: string; data: DocumentData }> = [];
  for (let index = 0; index < memberIds.length; index += 10) {
    const personIds = memberIds.slice(index, index + 10);
    const snapshot = await db.collection(collectionName).where('personId', 'in', personIds).get();
    snapshot.docs.forEach((document) => documents.push({ id: document.id, data: document.data() }));
  }
  return documents;
}

async function loadLegacyMigrationInput(groupId: string, memberIds: string[], confirmedCashBalanceInCents?: number | null): Promise<LegacyMigrationInput> {
  const [banks, expenses, gains, bankTransfers, cashRescues, investments, monthlyBalances, balanceAdjustments] = await Promise.all([
    legacyDocumentsForMembers('banks', memberIds),
    legacyDocumentsForMembers('expenses', memberIds),
    legacyDocumentsForMembers('gains', memberIds),
    legacyDocumentsForMembers('bankTransfers', memberIds),
    legacyDocumentsForMembers('cashRescues', memberIds),
    legacyDocumentsForMembers('financeInvestments', memberIds),
    legacyDocumentsForMembers('monthlyBalances', memberIds),
    legacyDocumentsForMembers('bankBalanceAdjustments', memberIds),
  ]);
  const preflightIssues: MigrationIssue[] = [];
  const mapSafely = <T>(
    collection: string,
    documents: Array<{ id: string; data: DocumentData }>,
    mapper: (document: { id: string; data: DocumentData }) => T,
  ): T[] => documents.flatMap((document) => {
    try {
      return [mapper(document)];
    } catch (error) {
      preflightIssues.push({
        code: 'invalid-amount',
        collection,
        id: document.id,
        detail: error instanceof Error ? error.message : 'Legacy document could not be parsed.',
      });
      return [];
    }
  });

  return {
    groupId,
    memberIds,
    banks: mapSafely('banks', banks, ({ id, data }) => ({
      id,
      name: requiredString(data.name, 'banks.name'),
      colorHex: stringOrNull(data.colorHex),
    })),
    expenses: mapSafely('expenses', expenses, ({ id, data }) => ({
      id,
      bankId: stringOrNull(data.bankId),
      amountInCents: requiredCents(data.valueInCents, 'expenses.valueInCents'),
      effectiveAt: readLegacyDate(data),
      categoryId: stringOrNull(data.tagId),
      note: stringOrNull(data.explanation) ?? stringOrNull(data.name),
      transferId: stringOrNull(data.bankTransferPairId),
      investmentId: stringOrNull(data.investmentId),
      isInvestmentDeposit: data.isInvestmentDeposit === true,
    })),
    gains: mapSafely('gains', gains, ({ id, data }) => ({
      id,
      bankId: stringOrNull(data.bankId),
      amountInCents: requiredCents(data.valueInCents, 'gains.valueInCents'),
      effectiveAt: readLegacyDate(data),
      categoryId: stringOrNull(data.tagId),
      note: stringOrNull(data.explanation) ?? stringOrNull(data.name),
      transferId: stringOrNull(data.bankTransferPairId),
      investmentId: stringOrNull(data.investmentId),
      isInvestmentRedemption: data.isInvestmentRedemption === true,
    })),
    bankTransfers: mapSafely('bankTransfers', bankTransfers, ({ id, data }) => ({
      id,
      fromBankId: requiredString(data.sourceBankId, 'bankTransfers.sourceBankId'),
      toBankId: requiredString(data.targetBankId, 'bankTransfers.targetBankId'),
      amountInCents: requiredCents(data.valueInCents, 'bankTransfers.valueInCents'),
      effectiveAt: readLegacyDate(data),
      expenseId: requiredString(data.expenseId, 'bankTransfers.expenseId'),
      gainId: requiredString(data.gainId, 'bankTransfers.gainId'),
    })),
    cashRescues: mapSafely('cashRescues', cashRescues, ({ id, data }) => ({
      id,
      bankId: requiredString(data.bankId, 'cashRescues.bankId'),
      amountInCents: requiredCents(data.valueInCents, 'cashRescues.valueInCents'),
      effectiveAt: readLegacyDate(data),
      note: stringOrNull(data.description),
    })),
    investments: mapSafely('financeInvestments', investments, ({ id, data }) => ({
      id,
      name: requiredString(data.name, 'financeInvestments.name'),
      bankId: stringOrNull(data.bankId),
      initialValueInCents: requiredCents(data.initialValueInCents ?? data.initialInvestedInCents ?? 0, 'financeInvestments.initialValueInCents'),
      effectiveAt: readLegacyDate(data),
    })),
    monthlyBalances: mapSafely('monthlyBalances', monthlyBalances, ({ id, data }) => ({
      id,
      bankId: requiredString(data.bankId, 'monthlyBalances.bankId'),
      year: requiredCents(data.year, 'monthlyBalances.year'),
      month: requiredCents(data.month, 'monthlyBalances.month'),
      balanceInCents: requiredCents(data.valueInCents, 'monthlyBalances.valueInCents'),
    })),
    balanceAdjustments: mapSafely('bankBalanceAdjustments', balanceAdjustments, ({ id, data }) => ({
      id, bankId: requiredString(data.bankId, 'bankBalanceAdjustments.bankId'),
      differenceInCents: requiredCents(data.differenceInCents, 'bankBalanceAdjustments.differenceInCents'),
      effectiveAt: readLegacyDate(data), note: stringOrNull(data.description),
    })),
    confirmedCashBalanceInCents,
    preflightIssues,
  };
}

function migrationFingerprint(plan: ReturnType<typeof createLegacyMigrationPlan>): string {
  const documentIds = plan.transactions
    .flatMap((transaction) => transaction.sourceReferences ?? [])
    .concat(plan.reconciliations.flatMap((reconciliation) => [{ collection: 'accountReconciliations', id: reconciliation.id }]))
    .sort((left, right) => (left.collection + left.id).localeCompare(right.collection + right.id));
  return createHash('sha256').update(JSON.stringify({
    documentIds,
    issues: plan.issues,
    accounts: plan.accounts.map((account) => account.id).sort(),
  })).digest('hex');
}

function migrationItems(plan: ReturnType<typeof createLegacyMigrationPlan>, groupId: string): Array<{ path: string; data: DocumentData }> {
  const items: Array<{ path: string; data: DocumentData }> = [];
  plan.accounts.forEach((account) => {
    items.push({
      path: 'financialAccounts/' + account.id,
      data: {
        ...account,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  });
  plan.transactions.forEach((transaction) => {
    items.push({ path: 'ledgerTransactions/' + transaction.id, data: toStoredTransaction(transaction) });
  });
  plan.reconciliations.forEach((reconciliation) => {
    items.push({
      path: 'accountReconciliations/' + reconciliation.id,
      data: {
        ...reconciliation,
        effectiveAt: Timestamp.fromDate(reconciliation.effectiveAt),
        createdAt: FieldValue.serverTimestamp(),
      },
    });
  });
  plan.issues.forEach((issue) => {
    const digest = createHash('sha256').update(issue.collection + ':' + issue.id + ':' + issue.detail).digest('hex').slice(0, 16);
    items.push({
      path: 'financialMigrationIssues/' + groupId + '-' + digest,
      data: {
        ...issue,
        groupId,
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
      },
    });
  });
  return items;
}

/**
 * Backfills one cursor page at a time. Group is always derived from the caller's
 * user document; callers cannot rebuild another account's data.
 */
export const rebuildFinancialReadModels = onCall(async (request) => {
  const actorId = callableUserId(request);
  const data = asRecord(request.data ?? {});
  const dryRun = data.dryRun === true;
  const pageSize = Math.min(200, Math.max(1, typeof data.pageSize === 'number' ? Math.trunc(data.pageSize) : 100));
  const cursor = typeof data.cursor === 'string' && data.cursor.length > 0 ? data.cursor : null;
  const user = await db.doc(`users/${actorId}`).get();
  const groupId = typeof user.data()?.financialGroupId === 'string' ? user.data()!.financialGroupId : null;
  if (!groupId) throw new HttpsError('failed-precondition', 'No financial group is configured for this account.');
  const group = await db.doc(`financialGroups/${groupId}`).get();
  if (group.data()?.members?.[actorId] !== 'admin') throw new HttpsError('permission-denied', 'Only group administrators can rebuild read models.');
  let sourceQuery = db.collection('ledgerTransactions').where('groupId', '==', groupId).orderBy(FieldPath.documentId()).limit(pageSize);
  if (cursor) sourceQuery = sourceQuery.startAfter(cursor);
  const source = await sourceQuery.get();
  const monthKeys = Array.from(new Set(source.docs.map(document => {
    const date = timestampToDate(document.data().effectiveAt);
    return Number.isNaN(date.valueOf()) ? null : monthKeyFor(date);
  }).filter((value): value is string => value !== null)));
  let rebuiltTransactionCount = 0;
  if (!dryRun) {
    for (const monthKey of monthKeys) rebuiltTransactionCount += await rebuildLedgerSummaryForMonth(groupId, monthKey);
  }
  return {
    groupId,
    dryRun,
    scannedDocuments: source.size,
    rebuiltMonths: monthKeys,
    rebuiltTransactionCount,
    nextCursor: source.size === pageSize ? source.docs[source.docs.length - 1].id : null,
  };
});

export const migrateFinancialGroup = onCall(async (request) => {
  const actorId = callableUserId(request);
  const data = asRecord(request.data);
  const mode = requiredString(data.mode, 'mode');
  const clientActionId = requiredString(data.clientActionId, 'clientActionId');
  try {
    assertClientActionId(clientActionId);
  } catch (error) {
    throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid clientActionId.');
  }
  const selectedMembers = Array.isArray(data.memberIds)
    ? data.memberIds.map((memberId) => requiredString(memberId, 'memberIds[]'))
    : [];
  const memberIds = Array.from(new Set([actorId, ...selectedMembers]));
  if (memberIds.length === 0) throw new HttpsError('invalid-argument', 'At least one group member is required.');
  const groupId = 'group-' + actorId + '-' + clientActionId;
  const confirmedCashBalanceInCents = data.confirmedCashBalanceInCents === undefined
    ? undefined
    : requiredCents(data.confirmedCashBalanceInCents, 'confirmedCashBalanceInCents');
  const plan = createLegacyMigrationPlan(await loadLegacyMigrationInput(
    groupId,
    memberIds,
    confirmedCashBalanceInCents,
  ));
  const fingerprint = migrationFingerprint(plan);

  if (mode === 'dry-run') {
    return {
      groupId,
      fingerprint,
      sourceDocumentCount: plan.sourceDocumentCount,
      accountCount: plan.accounts.length,
      transactionCount: plan.transactions.length,
      reconciliationCount: plan.reconciliations.length,
      issueCount: plan.issues.length,
      blockingIssues: plan.issues,
    };
  }
  if (mode !== 'execute') throw new HttpsError('invalid-argument', 'mode must be dry-run or execute.');
  if (requiredString(data.approvedFingerprint, 'approvedFingerprint') !== fingerprint) {
    throw new HttpsError('failed-precondition', 'The approved dry-run fingerprint no longer matches live legacy data.');
  }

  const groupRef = db.doc('financialGroups/' + groupId);
  const runRef = groupRef.collection('migrationRuns').doc(clientActionId);
  const existingRun = await runRef.get();
  const currentCursor = typeof existingRun.data()?.cursor === 'number' ? existingRun.data()?.cursor : 0;
  const items = migrationItems(plan, groupId);
  const nextItems = items.slice(currentCursor, currentCursor + MAX_MIGRATION_WRITES_PER_CALL);
  const nextCursor = currentCursor + nextItems.length;
  const complete = nextCursor >= items.length;

  if (!existingRun.exists) {
    const userSnapshots = await db.getAll(...memberIds.map((memberId) => db.doc('users/' + memberId)));
    userSnapshots.forEach((snapshot) => {
      const existingGroupId = snapshot.data()?.financialGroupId;
      if (typeof existingGroupId === 'string' && existingGroupId.length > 0) {
        throw new HttpsError('failed-precondition', 'A selected member already belongs to a financial group.');
      }
    });
  }

  const batch = db.batch();
  batch.set(groupRef, {
    id: groupId,
    status: complete ? 'active' : 'migrating',
    members: Object.fromEntries(memberIds.map((memberId) => [memberId, memberId === actorId ? 'admin' : 'member'])),
    createdBy: actorId,
    migrationFingerprint: fingerprint,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: existingRun.exists ? existingRun.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
  }, { merge: true });
  nextItems.forEach((item) => batch.set(db.doc(item.path), item.data, { merge: false }));
  batch.set(runRef, {
    groupId,
    actorId,
    fingerprint,
    cursor: nextCursor,
    totalItems: items.length,
    status: complete ? 'completed' : 'running',
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: existingRun.exists ? existingRun.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
  }, { merge: true });
  if (complete) {
    memberIds.forEach((memberId) => {
      batch.set(db.doc('users/' + memberId), {
        financialGroupId: groupId,
        financialGroupRole: memberId === actorId ? 'admin' : 'member',
        financialLegacyCutoverAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  }
  await batch.commit();

  return {
    groupId,
    fingerprint,
    cursor: nextCursor,
    totalItems: items.length,
    complete,
    issueCount: plan.issues.length,
  };
});
export { userRelationship } from './userRelationships';
