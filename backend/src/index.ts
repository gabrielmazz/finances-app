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
import type { FinanceMonthlySummaryV1 } from '../../utils/financeReadModels';

if (getApps().length === 0) initializeApp();

const db = getFirestore();
const REGION = 'southamerica-east1';
const MAX_MIGRATION_WRITES_PER_CALL = 400;

setGlobalOptions({ region: REGION, maxInstances: 20 });

type FinancialRole = 'admin' | 'member';
type JsonRecord = Record<string, unknown>;
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

function callableUserId(request: { auth?: { uid: string } | null }): string {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in before performing a financial operation.');
  }
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
): Promise<PersistedLedgerResult> {
  try {
    validateLedgerTransaction(ledgerTransaction);
  } catch (error) {
    throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid ledger transaction.');
  }

  const role = await roleFor(firestoreTransaction, ledgerTransaction.groupId, ledgerTransaction.actorId);
  const operationRef = operationReference(ledgerTransaction.groupId, ledgerTransaction.clientActionId);
  const operationSnapshot = await firestoreTransaction.get(operationRef);
  if (operationSnapshot.exists) {
    const previousActorId = operationSnapshot.data()?.actorId;
    if (previousActorId !== ledgerTransaction.actorId) {
      throw new HttpsError('already-exists', 'clientActionId was already used by another member.');
    }
    const transactionId = operationSnapshot.data()?.transactionId;
    if (typeof transactionId === 'string') return { transactionId, idempotent: true };
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
    if (account.archivedAt) {
      throw new HttpsError('failed-precondition', 'Archived financial accounts cannot receive new movements.');
    }

    const deltaInCents = ledgerTransaction.legs.find((leg) => leg.accountId === accountId)?.deltaInCents ?? 0;
    const nextBalanceInCents = account.currentBalanceInCents + deltaInCents;
    if (account.kind === 'cash') {
      try {
        assertCashBalanceWillRemainNonNegative(account.currentBalanceInCents, deltaInCents);
      } catch (error) {
        throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'Cash cannot become negative.');
      }
    }
    if (requiresOverdraftJustification(account.kind, account.currentBalanceInCents, deltaInCents)) {
      if (typeof ledgerTransaction.overdraftReason !== 'string' || ledgerTransaction.overdraftReason.trim().length < 3) {
        throw new HttpsError('failed-precondition', 'A bank overdraft requires a recorded justification.');
      }
    }
    updatedBalances.set(accountId, nextBalanceInCents);
  });

  const ledgerRef = db.doc('ledgerTransactions/' + ledgerTransaction.id);
  const existingLedgerSnapshot = await firestoreTransaction.get(ledgerRef);
  if (existingLedgerSnapshot.exists) {
    const existingActionId = existingLedgerSnapshot.data()?.clientActionId;
    if (existingActionId === ledgerTransaction.clientActionId) {
      return { transactionId: ledgerTransaction.id, idempotent: true };
    }
    throw new HttpsError('already-exists', 'Ledger transaction id already exists.');
  }

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

  // The read proves membership, including that a member is still active. Roles
  // are intentionally not used to grant members any account-management ability.
  void role;
  return { transactionId: ledgerTransaction.id, idempotent: false };
}

function newLedgerId(prefix: string, clientActionId: string): string {
  return prefix + '-' + clientActionId;
}

function monthKeyFor(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Stored in the same transaction as the ledger command; duplicate commands do not double-count. */
function writeLedgerMonthlySummary(transaction: FirestoreTransaction, ledgerTransaction: LedgerTransaction) {
  const monthKey = monthKeyFor(ledgerTransaction.effectiveAt);
  const bankDeltaInCents: Record<string, number> = {};
  ledgerTransaction.legs.forEach(leg => {
    if (leg.accountId) bankDeltaInCents[leg.accountId] = (bankDeltaInCents[leg.accountId] ?? 0) + leg.deltaInCents;
  });
  const increments = Object.fromEntries(Object.entries(bankDeltaInCents).map(([accountId, delta]) => [
    `bankDeltaInCents.${accountId}`, FieldValue.increment(delta),
  ]));
  transaction.set(db.doc(`financeMonthlySummaries/${ledgerTransaction.groupId}-${monthKey}`), {
    version: 1,
    scopeType: 'group',
    scopeId: ledgerTransaction.groupId,
    groupId: ledgerTransaction.groupId,
    monthKey,
    transactionCount: FieldValue.increment(1),
    ...increments,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function rebuildLedgerSummaryForMonth(groupId: string, monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const start = Timestamp.fromDate(new Date(Date.UTC(year, month - 1, 1)));
  const end = Timestamp.fromDate(new Date(Date.UTC(year, month, 1)));
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
    ledgerTransactionFromMovement(data, actorId),
  ));
});

export const transferFunds = onCall(async (request) => {
  const actorId = callableUserId(request);
  const data = asRecord(request.data);
  return db.runTransaction(async (transaction) => persistLedgerTransaction(
    transaction,
    ledgerTransactionFromTransfer(data, actorId),
  ));
});

export const sendLinkedDevicesNotificationTest = onCall(async (request) => {
  const ownerId = callableUserId(request);
  return sendRemoteNotification({
    ownerId,
    title: 'Teste de notificações vinculadas',
    body: 'Os avisos remotos do Lumus estão funcionando para este grupo vinculado.',
    data: { kind: 'test', operation: 'manual' },
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
    if (role !== 'admin' && original.actorId !== actorId) {
      throw new HttpsError('permission-denied', 'Members may only reverse their own transactions.');
    }

    const reversal = createReversalTransaction(original, {
      id: newLedgerId('reversal', clientActionId),
      effectiveAt: optionalDate(data.effectiveAt, 'effectiveAt'),
      actorId,
      clientActionId,
      note: optionalString(data.note, 'note'),
    });
    return persistLedgerTransaction(transaction, reversal);
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
  try {
    assertClientActionId(clientActionId);
  } catch (error) {
    throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid clientActionId.');
  }

  return db.runTransaction(async (transaction) => {
    await requireAdmin(transaction, groupId, actorId);
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
    return {
      reconciliationId,
      transactionId: differenceInCents === 0 ? null : adjustment.id,
      differenceInCents,
    };
  });
});

export const manageAccount = onCall(async (request) => {
  const actorId = callableUserId(request);
  const data = asRecord(request.data);
  const groupId = requiredString(data.groupId, 'groupId');
  const action = requiredString(data.action, 'action');
  const clientActionId = requiredString(data.clientActionId, 'clientActionId');
  try {
    assertClientActionId(clientActionId);
  } catch (error) {
    throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid clientActionId.');
  }

  return db.runTransaction(async (transaction) => {
    await requireAdmin(transaction, groupId, actorId);
    const operationRef = operationReference(groupId, clientActionId);
    const operationSnapshot = await transaction.get(operationRef);
    if (operationSnapshot.exists) return operationSnapshot.data()?.result ?? { idempotent: true };

    if (action === 'create') {
      const kind = data.kind;
      if (!isFinancialAccountKind(kind)) {
        throw new HttpsError('invalid-argument', 'kind must be bank, cash or investment.');
      }
      const name = requiredString(data.name, 'name');
      const accountId = kind === 'cash'
        ? 'cash-' + groupId
        : 'account-' + groupId + '-' + clientActionId;
      const accountRef = db.doc('financialAccounts/' + accountId);
      const existingAccount = await transaction.get(accountRef);
      if (existingAccount.exists) {
        throw new HttpsError('already-exists', kind === 'cash' ? 'This group already has a cash account.' : 'Account already exists.');
      }
      transaction.set(accountRef, {
        id: accountId,
        groupId,
        kind,
        name,
        legacyBankId: optionalString(data.legacyBankId, 'legacyBankId'),
        legacyInvestmentId: optionalString(data.legacyInvestmentId, 'legacyInvestmentId'),
        currentBalanceInCents: 0,
        archivedAt: null,
        createdBy: actorId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const result = { accountId, idempotent: false };
      transaction.set(operationRef, {
        actorId,
        operation: 'manageAccount.create',
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

    if (action === 'rename') {
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
      throw new HttpsError('invalid-argument', 'action must be create, rename or archive.');
    }
    const result = { accountId, idempotent: false };
    transaction.set(operationRef, {
      actorId,
      operation: 'manageAccount.' + action,
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
  const [banks, expenses, gains, bankTransfers, cashRescues, investments, monthlyBalances] = await Promise.all([
    legacyDocumentsForMembers('banks', memberIds),
    legacyDocumentsForMembers('expenses', memberIds),
    legacyDocumentsForMembers('gains', memberIds),
    legacyDocumentsForMembers('bankTransfers', memberIds),
    legacyDocumentsForMembers('cashRescues', memberIds),
    legacyDocumentsForMembers('financeInvestments', memberIds),
    legacyDocumentsForMembers('monthlyBalances', memberIds),
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
