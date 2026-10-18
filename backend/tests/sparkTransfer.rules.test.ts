import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc as seedDeleteDoc, doc as seedDoc, getDoc as seedGetDoc, setDoc as seedSetDoc, updateDoc as seedUpdateDoc, writeBatch as seedWriteBatch } from 'firebase/firestore';
import { transferSparkFundsFirebase, reverseSparkTransferFirebase, SPARK_TRANSFER_PROOF_PROTOCOL, type SparkTransferInput } from '../../functions/SparkTransferFirebase';
import { openSparkAccountFirebase, type SparkOpeningInput } from '../../functions/SparkAccountFirebase';
import { countSparkAccountFirebase, reverseSparkBalanceAdjustmentFirebase, type SparkCountInput } from '../../functions/SparkBalanceFirebase';
import { calculateAccountBalanceInCents, type LedgerTransaction } from '../../utils/financialLedger';
import { prepareSparkHistoryProofFirebase, startSparkHistoryProofFirebase, stepSparkHistoryProofFirebase, renewSparkHistoryBudgetFirebase, SparkPreparationError, advanceSparkHistory, getSparkPreparationProgress, type SparkHistoryProof } from '../../functions/SparkHistoryFirebase';
import { saveSparkTemporalBalanceFirebase, type SparkTemporalBalanceInput } from '../../functions/SparkTemporalBalanceFirebase';
import { activateSparkMonthlyOpeningFirebase, readCurrentSparkPositionFirebase, refreshSparkMonthlyOpeningFirebase } from '../../functions/SparkMonthlyActivationFirebase';
import { replaceSparkBalanceAdjustmentFirebase, type SparkAdjustmentReplacementInput } from '../../functions/SparkAdjustmentReplacementFirebase';
import { createSparkPreparationMetrics, estimateSparkPreparation, SPARK_PREPARATION_DAY_MS } from '../../utils/sparkPreparationBudget';
import { createSparkCivilMonthCalendar, reconcileSparkLedgerSnapshot } from '../../utils/sparkFinancialReconciliation';

import { certifySparkHistorySegmentFirebase, warmSparkHistorySegmentsFirebase, sparkSegmentRef, sparkSegmentId, applySparkHistorySegment } from '../../functions/sparkHistorySegments';

// O serviço compartilhado resolve o SDK da raiz; os clientes devem usar a mesma instância.
const clientRequire = createRequire(resolve(process.cwd(), '..', 'package.json'));
const { initializeApp, deleteApp } = clientRequire('firebase/app') as typeof import('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously } = clientRequire('firebase/auth') as typeof import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection, writeBatch, serverTimestamp, deleteField, Timestamp, terminate } = clientRequire('firebase/firestore') as typeof import('firebase/firestore');

const projectId = 'demo-lumus-spark';
let environment: RulesTestEnvironment;
const apps: ReturnType<typeof initializeApp>[] = [];
const databases: ReturnType<typeof getFirestore>[] = [];
let owner: ReturnType<typeof getFirestore>;
let secondSession: ReturnType<typeof getFirestore>;
let outsider: ReturnType<typeof getFirestore>;
let anonymous: ReturnType<typeof getFirestore>;
let expired: ReturnType<typeof getFirestore>;
let uid: string;
const fixtures = {
  bank: { kind: 'bank', balanceInCents: 10_000 },
  cash: { kind: 'cash', balanceInCents: 10_000 },
  investment: { kind: 'investment', balanceInCents: 5000 },
  third: { kind: 'bank', balanceInCents: 100 },
};

function client(name: string, mockUserToken?: Record<string, unknown>) {
  const app = initializeApp({ projectId, apiKey: 'fake-api-key', authDomain: 'localhost' }, `spark-${name}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080, mockUserToken ? { mockUserToken } : undefined);
  databases.push(firestore);
  return { auth, firestore };
}

function positionRef(firestore: ReturnType<typeof getFirestore>, accountId = 'bank') {
  return doc(firestore, 'financialGroups', 'proof', 'sparkPositions', accountId);
}
function operationRef(firestore: ReturnType<typeof getFirestore>, id = 'action_123456') {
  return doc(firestore, 'financialGroups', 'proof', 'sparkOperations', id);
}
function command(overrides: Partial<SparkTransferInput> = {}): SparkTransferInput {
  return { groupId: 'proof', actorId: uid, clientActionId: 'action_123456', fromAccountId: 'bank',
    toAccountId: 'cash', kind: 'transfer', amountInCents: 1000, ...overrides };
}
async function seedPosition(accountId: keyof typeof fixtures, fields: Record<string, unknown>) {
  await environment.withSecurityRulesDisabled(async context => {
    await seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkPositions', accountId),
      Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value instanceof Timestamp ? value.toDate() : value])));
  });
}
async function seedGroup(fields: Record<string, unknown>) {
  await environment.withSecurityRulesDisabled(async context => {
    await seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups', 'proof'), fields);
  });
}
async function denied(promise: Promise<unknown>) {
  await assert.rejects(promise, (error: any) => {
    assert.equal(error.code, 'permission-denied');
    assert.doesNotMatch(error.message, /maximum of|too many (?:document|access|expression)/i,
      'A recusa deve vir da invariante de segurança, sem esgotar o orçamento de Rules.');
    return true;
  });
}
async function balance(accountId: string) {
  return (await getDoc(positionRef(owner, accountId))).data()!;
}

function rawBatch(firestore = owner, options: {
  id?: string; from?: keyof typeof fixtures; to?: keyof typeof fixtures; amount?: number;
  operation?: Record<string, unknown>; fromChanges?: Record<string, unknown>; toChanges?: Record<string, unknown>;
  quota?: Record<string, unknown>; omit?: 'from' | 'to' | 'operation' | 'quota'; third?: boolean;
} = {}) {
  const id = options.id ?? 'action_123456';
  const from = options.from ?? 'bank';
  const to = options.to ?? 'cash';
  const amount = options.amount ?? 1000;
  const batch = writeBatch(firestore);
  if (options.omit !== 'quota') batch.set(doc(firestore, 'sparkTransferQuotas', uid), {
    groupId: 'proof', count: 1, windowStartInMillis: Math.floor(Date.now() / 60_000) * 60_000,
    lastOperationId: id, updatedAt: serverTimestamp(), ...options.quota,
  });
  if (options.omit !== 'operation') batch.set(operationRef(firestore, id), {
    schemaVersion: 1, actorId: uid, kind: 'transfer', fromAccountId: from, toAccountId: to,
    amountInCents: amount, fromRevision: 0, toRevision: 0,
    fromPreviousOperationId: `bootstrap_${from}`, toPreviousOperationId: `bootstrap_${to}`, note: null, overdraftReason: null,
    createdAt: serverTimestamp(), ...options.operation,
  });
  if (options.omit !== 'from') batch.update(positionRef(firestore, from), {
    balanceInCents: fixtures[from].balanceInCents - amount, revision: 1, lastOperationId: id,
    updatedAt: serverTimestamp(), ...options.fromChanges,
  });
  if (options.omit !== 'to') batch.update(positionRef(firestore, to), {
    balanceInCents: fixtures[to].balanceInCents + amount, revision: 1, lastOperationId: id,
    updatedAt: serverTimestamp(), ...options.toChanges,
  });
  if (options.third) batch.update(positionRef(firestore, 'third'), {
    balanceInCents: 1100, revision: 1, lastOperationId: id, updatedAt: serverTimestamp(),
  });
  return batch;
}

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
  environment = await initializeTestEnvironment({ projectId,
    firestore: { rules: readFileSync(resolve(process.cwd(), '..', 'firestore.rules'), 'utf8') } });
  const first = client('owner');
  const email = `spark-${Date.now()}@example.test`;
  const password = 'synthetic-local-password';
  uid = (await createUserWithEmailAndPassword(first.auth, email, password)).user.uid;
  owner = first.firestore;
  const second = client('second-session');
  await signInWithEmailAndPassword(second.auth, email, password);
  secondSession = second.firestore;
  const other = client('outsider');
  await signInAnonymously(other.auth);
  outsider = other.firestore;
  anonymous = client('unauthenticated').firestore;
  const now = Math.floor(Date.now() / 1000);
  expired = client('expired', { sub: uid, auth_time: now - 8 * 3600 - 60, iat: now }).firestore;
}, { timeout: 60_000 });

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore();
    await seedSetDoc(seedDoc(firestore, 'financialGroups', 'proof'), {
      status: 'active', members: { [uid]: 'member' }, sparkProtocol: SPARK_TRANSFER_PROOF_PROTOCOL,
    });
    for (const month of createSparkCivilMonthCalendar(2026, 2026)) {
      await seedSetDoc(seedDoc(firestore, 'sparkCivilMonths', month.cycle), month);
    }
    for (const [id, fields] of Object.entries(fixtures)) {
      await seedSetDoc(seedDoc(firestore, 'financialGroups', 'proof', 'sparkPositions', id), {
        schemaVersion: 1, ...fields, active: true, revision: 0, lastOperationId: `bootstrap_${id}`, nextActivationAt: null, updatedAt: new Date(),
      });
      await seedSetDoc(seedDoc(firestore, 'financialGroups', 'proof', 'sparkOperations', `bootstrap_${id}`), {
        schemaVersion: 1, actorId: uid, kind: 'account_bootstrap', accountId: id,
        openingBalanceInCents: fields.balanceInCents, createdAt: new Date('1900-01-01T00:00:00Z'),
      });
    }
  });
});

after(async () => {
  await Promise.all(databases.map(database => terminate(database)));
  await Promise.all(apps.map(app => deleteApp(app)));
  await environment?.cleanup();
});

test('shared client commits an atomic transfer with real Auth and no Functions', async () => {
  assert.deepEqual(await transferSparkFundsFirebase(owner, command({ note: ' teste ' })), {
    transactionId: 'action_123456', idempotent: false,
  });
  assert.equal((await balance('bank')).balanceInCents, 9000);
  assert.equal((await balance('cash')).balanceInCents, 11_000);
  assert.equal((await balance('bank')).revision, 1);
  const receipt = (await getDoc(operationRef(owner))).data()!;
  assert.equal(receipt.actorId, uid);
  assert.equal(receipt.note, 'teste');
  assert.equal(receipt.createdAt.toMillis(), (await balance('bank')).updatedAt.toMillis());
});

test('response-loss retry returns the committed operation without reapplying its effects', async () => {
  await transferSparkFundsFirebase(owner, command());
  assert.deepEqual(await transferSparkFundsFirebase(secondSession, command()), {
    transactionId: 'action_123456', idempotent: true,
  });
  assert.equal((await balance('bank')).balanceInCents, 9000);
  assert.equal((await balance('bank')).revision, 1);
  assert.equal((await getDocs(collection(owner, 'financialGroups', 'proof', 'sparkOperations'))).size, 5);
  for (const changes of [{ amountInCents: 1001 }, { note: 'alterada' }, { toAccountId: 'third' },
    { kind: 'investment_deposit' as const }, { overdraftReason: 'alterada' }]) {
    await assert.rejects(transferSparkFundsFirebase(secondSession, command(changes)), /outros argumentos/);
  }
});

test('two sessions submitting the same action commit once', async () => {
  const results = await Promise.all([transferSparkFundsFirebase(owner, command()), transferSparkFundsFirebase(secondSession, command())]);
  assert.deepEqual(results.map(result => result.idempotent).sort(), [false, true]);
  assert.equal((await balance('bank')).revision, 1);
});

test('concurrent reuse of an action with different arguments cannot return two successes', async () => {
  const results = await Promise.allSettled([
    transferSparkFundsFirebase(owner, command()),
    transferSparkFundsFirebase(secondSession, command({ amountInCents: 2000 })),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const receipt = (await getDoc(operationRef(owner))).data()!;
  assert.equal((await balance('bank')).balanceInCents, 10_000 - receipt.amountInCents);
  assert.equal((await balance('bank')).revision, 1);
});

test('concurrent sessions cannot spend the same cash twice', async () => {
  const input = command({ fromAccountId: 'cash', toAccountId: 'bank', amountInCents: 7500 });
  const results = await Promise.allSettled([
    transferSparkFundsFirebase(owner, input),
    transferSparkFundsFirebase(secondSession, { ...input, clientActionId: 'another_123456' }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await balance('cash')).balanceInCents, 2500);
  assert.equal((await balance('bank')).balanceInCents, 17_500);
});

test('investment deposit and redemption preserve both positions', async () => {
  await transferSparkFundsFirebase(owner, command({ kind: 'investment_deposit', toAccountId: 'investment' }));
  await transferSparkFundsFirebase(owner, command({ kind: 'investment_redemption', fromAccountId: 'investment',
    toAccountId: 'bank', amountInCents: 500, clientActionId: 'redemption_123456' }));
  assert.equal((await balance('bank')).balanceInCents, 9500);
  assert.equal((await balance('investment')).balanceInCents, 5500);
  assert.equal((await balance('investment')).revision, 2);
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!;
  assert.equal(quota.count, 2);
  assert.equal(quota.lastOperationId, 'redemption_123456');
});

test('bank overdraft requires a persisted nonblank reason', async () => {
  await assert.rejects(transferSparkFundsFirebase(owner, command({ amountInCents: 11_000 })), /justificativa/);
  await transferSparkFundsFirebase(owner, command({ amountInCents: 11_000, overdraftReason: ' limite aprovado ' }));
  assert.equal((await balance('bank')).balanceInCents, -1000);
  assert.equal((await getDoc(operationRef(owner))).data()!.overdraftReason, 'limite aprovado');
});

test('valid upper amount/text bounds commit and balance overflow is refused', async () => {
  await seedPosition('bank', { balanceInCents: 1_000_000_000_000 });
  await seedPosition('cash', { balanceInCents: 0 });
  await transferSparkFundsFirebase(owner, command({ amountInCents: 1_000_000_000_000,
    note: 'a'.repeat(2000), overdraftReason: 'a'.repeat(500) }));
  assert.equal((await balance('bank')).balanceInCents, 0);
  assert.equal((await balance('cash')).balanceInCents, 1_000_000_000_000);
  await assert.rejects(transferSparkFundsFirebase(owner, command({ clientActionId: 'overflow_123456',
    amountInCents: 1, overdraftReason: 'justificada' })), /limite permitido/);
});

const attacks: [string, Parameters<typeof rawBatch>[1]][] = [
  ['debit without credit', { omit: 'to' }],
  ['credit without debit', { omit: 'from' }],
  ['effects without a receipt', { omit: 'operation' }],
  ['effects without the mandatory quota', { omit: 'quota' }],
  ['invented first quota count', { quota: { count: 2 } }],
  ['fractional quota count', { quota: { count: 1.5 } }],
  ['quota above 120', { quota: { count: 121 } }],
  ['quota in a forged time window', { quota: { windowStartInMillis: 0 } }],
  ['quota attached to another group', { quota: { groupId: 'other' } }],
  ['quota attached to another operation', { quota: { lastOperationId: 'another_123456' } }],
  ['unbalanced credit', { toChanges: { balanceInCents: 12_000 } }],
  ['third position attached to receipt', { third: true }],
  ['spoofed actor', { operation: { actorId: 'outsider' } }],
  ['wrong source revision', { operation: { fromRevision: 1 } }],
  ['skipped revision', { fromChanges: { revision: 2 } }],
  ['decreased revision', { fromChanges: { revision: -1 } }],
  ['wrong position receipt ID', { toChanges: { lastOperationId: 'different_123456' } }],
  ['unknown operation field', { operation: { admin: true } }],
  ['unknown position field', { fromChanges: { groupId: 'other' } }],
  ['changed account kind', { fromChanges: { kind: 'cash' } }],
  ['changed account activity', { fromChanges: { active: false } }],
  ['changed schema version', { operation: { schemaVersion: 2 } }],
  ['forged event timestamp', { operation: { createdAt: new Date(0) } }],
  ['forged position timestamp', { toChanges: { updatedAt: new Date(0) } }],
  ['zero amount', { amount: 0 }],
  ['negative amount', { amount: -1 }],
  ['fractional amount', { amount: 1.5 }],
  ['amount overflow', { amount: 1_000_000_000_001, operation: { overdraftReason: 'justificada' } }],
  ['negative cash', { from: 'cash', to: 'bank', amount: 11_000, operation: { overdraftReason: 'justificada' } }],
  ['negative investment', { from: 'investment', to: 'bank', amount: 6000, operation: { kind: 'investment_redemption', overdraftReason: 'justificada' } }],
  ['unjustified bank overdraft', { amount: 11_000 }],
  ['whitespace-only bank overdraft reason', { amount: 11_000, operation: { overdraftReason: '   ' } }],
  ['short bank overdraft reason', { amount: 11_000, operation: { overdraftReason: 'ab' } }],
  ['oversized reason', { operation: { overdraftReason: 'a'.repeat(501) } }],
  ['oversized note', { operation: { note: 'a'.repeat(2001) } }],
  ['invalid operation ID', { id: 'short' }],
  ['investment hidden as ordinary transfer', { to: 'investment' }],
  ['deposit with no investment account', { operation: { kind: 'investment_deposit' } }],
  ['redemption in wrong direction', { to: 'investment', operation: { kind: 'investment_redemption' } }],
  ['invented source account', { operation: { fromAccountId: 'missing' } }],
  ['account path injection', { operation: { toAccountId: 'other/path' } }],
];
for (const [name, options] of attacks) test(`Rules reject ${name} without any partial effects`, async () => {
  await denied(rawBatch(owner, options).commit());
  assert.equal((await balance('bank')).balanceInCents, 10_000);
  assert.equal((await balance('cash')).balanceInCents, 10_000);
  assert.equal((await balance('investment')).balanceInCents, 5000);
  assert.equal((await getDocs(collection(owner, 'financialGroups', 'proof', 'sparkOperations'))).size, 4);
});

test('receipt alone, direct balance edits, position creation and deletion are denied', async () => {
  const batch = rawBatch();
  // A receipt without either position must also fail, independently of partial batches above.
  const receipt = writeBatch(owner);
  receipt.set(operationRef(owner), { schemaVersion: 1, actorId: uid, kind: 'transfer', fromAccountId: 'bank',
    toAccountId: 'cash', amountInCents: 1000, fromRevision: 0, toRevision: 0, note: null,
    overdraftReason: null, createdAt: serverTimestamp() });
  await denied(receipt.commit());
  const edit = writeBatch(owner); edit.update(positionRef(owner), { balanceInCents: 500_000 });
  await denied(edit.commit());
  const create = writeBatch(owner); create.set(positionRef(owner, 'invented'), await balance('bank'));
  await denied(create.commit());
  const remove = writeBatch(owner); remove.delete(positionRef(owner)); await denied(remove.commit());
  await batch.commit();
});

test('immutable receipt cannot be replayed, edited or deleted', async () => {
  await transferSparkFundsFirebase(owner, command());
  const replay = writeBatch(owner);
  replay.update(positionRef(owner), { balanceInCents: 8000, revision: 2, lastOperationId: 'action_123456', updatedAt: serverTimestamp() });
  replay.update(positionRef(owner, 'cash'), { balanceInCents: 12_000, revision: 2, lastOperationId: 'action_123456', updatedAt: serverTimestamp() });
  await denied(replay.commit());
  const edit = writeBatch(owner); edit.update(operationRef(owner), { amountInCents: 2000 }); await denied(edit.commit());
  const remove = writeBatch(owner); remove.delete(operationRef(owner)); await denied(remove.commit());
  assert.equal((await balance('bank')).revision, 1);
});

test('stale prepared revision is denied after another session commits', async () => {
  const stale = rawBatch(secondSession, { id: 'stale_123456', quota: { count: 2 } });
  await transferSparkFundsFirebase(owner, command());
  await denied(stale.commit());
  assert.equal((await balance('bank')).balanceInCents, 9000);
});

test('quota cannot be reset, deleted, listed, read by another UID or changed without an operation', async () => {
  await transferSparkFundsFirebase(owner, command());
  const quotaRef = doc(owner, 'sparkTransferQuotas', uid);
  const reset = writeBatch(owner); reset.update(quotaRef, { count: 0, updatedAt: serverTimestamp() });
  await denied(reset.commit());
  const detached = writeBatch(owner); detached.update(quotaRef, {
    count: 2, lastOperationId: 'detached_123456', updatedAt: serverTimestamp(),
  });
  await denied(detached.commit());
  const remove = writeBatch(owner); remove.delete(quotaRef); await denied(remove.commit());
  await denied(getDocs(collection(owner, 'sparkTransferQuotas')));
  await denied(getDoc(doc(outsider, 'sparkTransferQuotas', uid)));
  assert.equal((await getDoc(quotaRef)).data()!.count, 1);
});

test('120th committed action blocks further writes and still permits replay of a committed receipt', async () => {
  await transferSparkFundsFirebase(owner, command());
  const quotaRef = doc(owner, 'sparkTransferQuotas', uid);
  const quota = (await getDoc(quotaRef)).data()!;
  // Fixture sintética para o limite; não reduz a carga nem modifica o contador do gate anterior.
  await environment.withSecurityRulesDisabled(async context => {
    await seedUpdateDoc(seedDoc(context.firestore(), 'sparkTransferQuotas', uid), { count: 120 });
  });
  const originalNow = Date.now;
  Date.now = () => quota.windowStartInMillis + 1000;
  try {
    await assert.rejects(transferSparkFundsFirebase(owner, command({ clientActionId: 'over_quota_123456' })), /Limite temporário/);
    assert.equal((await transferSparkFundsFirebase(secondSession, command())).idempotent, true);
  } finally { Date.now = originalNow; }
  await denied(rawBatch(owner, { id: 'over_quota_123456', quota: { count: 121 },
    operation: { fromRevision: 1, toRevision: 1 },
    fromChanges: { balanceInCents: 8000, revision: 2 }, toChanges: { balanceInCents: 12_000, revision: 2 },
  }).commit());
  assert.equal((await balance('bank')).balanceInCents, 9000);
  assert.equal((await getDoc(quotaRef)).data()!.count, 120);
});

test('fresh action cannot reset an existing quota to one while applying otherwise valid effects', async () => {
  await transferSparkFundsFirebase(owner, command());
  await transferSparkFundsFirebase(owner, command({ clientActionId: 'second_123456' }));
  const quotaRef = doc(owner, 'sparkTransferQuotas', uid);
  const quota = (await getDoc(quotaRef)).data()!;
  await denied(rawBatch(owner, { id: 'reset_123456', quota: { count: 1, windowStartInMillis: quota.windowStartInMillis },
    operation: { fromRevision: 2, toRevision: 2 },
    fromChanges: { balanceInCents: 7000, revision: 3 }, toChanges: { balanceInCents: 13_000, revision: 3 },
  }).commit());
  assert.equal((await balance('bank')).balanceInCents, 8000);
  assert.equal((await getDoc(quotaRef)).data()!.count, 2);
});

test('forged client clock cannot bypass the server quota window', async () => {
  const originalNow = Date.now;
  const forgedTime = originalNow() - 120_000;
  Date.now = () => forgedTime;
  try {
    await denied(transferSparkFundsFirebase(owner, command()));
  } finally {
    Date.now = originalNow;
  }
  assert.equal((await balance('bank')).revision, 0);
});

test('another authorized group member cannot replay a receipt as its original actor', async () => {
  await transferSparkFundsFirebase(owner, command());
  const otherUid = getAuth(outsider.app).currentUser!.uid;
  await seedGroup({ members: { [uid]: 'member', [otherUid]: 'member' } });
  await assert.rejects(transferSparkFundsFirebase(outsider, command()), /sessão autenticada mudou/);
  await assert.rejects(transferSparkFundsFirebase(outsider, command({ actorId: otherUid })), /outros argumentos/);
  assert.equal((await balance('bank')).revision, 1);
});

test('revocation invalidates a prepared write and receipt reads', async () => {
  const prepared = rawBatch();
  await seedGroup({ members: {} });
  await denied(prepared.commit());
  await denied(getDoc(positionRef(owner)));
  await denied(getDoc(operationRef(owner)));
  await assert.rejects(transferSparkFundsFirebase(owner, command()));
});

test('inactive or nonenrolled groups cannot use the protocol or self-enroll', async () => {
  await seedGroup({ sparkProtocol: 'not-enrolled' });
  await denied(rawBatch().commit());
  const enroll = writeBatch(owner);
  enroll.update(doc(owner, 'financialGroups', 'proof'), { sparkProtocol: SPARK_TRANSFER_PROOF_PROTOCOL });
  await denied(enroll.commit());
  await seedGroup({ sparkProtocol: SPARK_TRANSFER_PROOF_PROTOCOL, status: 'inactive' });
  await denied(rawBatch().commit());
});

test('outsider, unauthenticated and expired login cannot read or write positions/receipts', async () => {
  for (const firestore of [outsider, anonymous, expired]) {
    await denied(getDoc(positionRef(firestore)));
    await denied(getDoc(operationRef(firestore)));
    await denied(rawBatch(firestore).commit());
    await assert.rejects(transferSparkFundsFirebase(firestore, command()));
  }
});

test('inactive account and same source/target are denied by Rules', async () => {
  await seedPosition('bank', { active: false });
  await denied(rawBatch().commit());
  await seedPosition('bank', { active: true });
  await denied(rawBatch(owner, { from: 'bank', to: 'bank' }).commit());
});

test('client validates cents, identity and unsupported kind before writing', async () => {
  for (const changes of [{ amountInCents: NaN }, { amountInCents: 0 }, { amountInCents: 1.5 },
    { amountInCents: 1_000_000_000_001 }, { fromAccountId: '../path' }, { clientActionId: 'bad' },
    { toAccountId: 'bank' }, { kind: 'income' as any }]) {
    await assert.rejects(transferSparkFundsFirebase(owner, command(changes)));
  }
  assert.equal((await balance('bank')).revision, 0);
});

function opening(overrides: Partial<SparkOpeningInput> = {}): SparkOpeningInput {
  return { groupId: 'proof', actorId: uid, clientActionId: 'opening_123456', accountId: 'new-bank', kind: 'bank', ...overrides };
}
function rawOpening(options: { operation?: Record<string, unknown>; position?: Record<string, unknown>;
  omit?: 'operation' | 'position' | 'quota'; accountId?: string } = {}) {
  const id = 'opening_123456';
  const accountId = options.accountId ?? 'new-bank';
  const batch = writeBatch(owner);
  if (options.omit !== 'operation') batch.set(operationRef(owner, id), {
    schemaVersion: 1, actorId: uid, kind: 'account_opening', accountId, accountKind: 'bank', openingBalanceInCents: 0,
    note: null, createdAt: serverTimestamp(), ...options.operation,
  });
  if (options.omit !== 'position') batch.set(positionRef(owner, accountId), { schemaVersion: 1, kind: 'bank', active: true,
    balanceInCents: 0, revision: 0, lastOperationId: id, nextActivationAt: null, updatedAt: serverTimestamp(), ...options.position });
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', count: 1,
    windowStartInMillis: Math.floor(Date.now() / 60_000) * 60_000, lastOperationId: id, updatedAt: serverTimestamp() });
  return batch;
}

test('administrator creates a canonical zero account with one immutable opening receipt', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  assert.equal((await openSparkAccountFirebase(owner, opening())).idempotent, false);
  assert.equal((await balance('new-bank')).balanceInCents, 0);
  assert.equal((await balance('new-bank')).revision, 0);
  assert.equal((await balance('new-bank')).lastOperationId, 'opening_123456');
  assert.equal((await getDoc(operationRef(owner, 'opening_123456'))).data()!.openingBalanceInCents, 0);
  assert.equal((await openSparkAccountFirebase(secondSession, opening())).idempotent, true);
  await assert.rejects(openSparkAccountFirebase(owner, opening({ accountId: 'other-bank' })), /outros argumentos/);
});

test('two different opening action IDs for the same account produce one position and one receipt', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const results = await Promise.allSettled([openSparkAccountFirebase(owner, opening()),
    openSparkAccountFirebase(secondSession, opening({ clientActionId: 'opening_other_123456' }))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await getDocs(collection(owner, 'financialGroups', 'proof', 'sparkOperations'))).size, 5);
  assert.equal((await balance('new-bank')).revision, 0);
});

test('concurrent identical opening is idempotent', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const results = await Promise.all([openSparkAccountFirebase(owner, opening()), openSparkAccountFirebase(secondSession, opening())]);
  assert.deepEqual(results.map(result => result.idempotent).sort(), [false, true]);
});

test('member cannot create an opening, including bypassing the client service', async () => {
  await assert.rejects(openSparkAccountFirebase(owner, opening()), /administrador/);
  await denied(rawOpening().commit());
  assert.equal((await getDoc(positionRef(owner, 'new-bank'))).exists(), false);
});

const openingAttacks: [string, Parameters<typeof rawOpening>[0]][] = [
  ['nonzero invented initial balance', { operation: { openingBalanceInCents: 1000 }, position: { balanceInCents: 1000 } }],
  ['position alone', { omit: 'operation' }], ['opening receipt alone', { omit: 'position' }],
  ['missing opening quota', { omit: 'quota' }], ['starting at a different revision', { position: { revision: 1 } }],
  ['opening inactive account', { position: { active: false } }],
  ['mismatched opening account kind', { position: { kind: 'cash' } }],
  ['second cash identity', { operation: { accountKind: 'cash' }, position: { kind: 'cash' } }],
  ['unfunded investment opening', { operation: { accountKind: 'investment' }, position: { kind: 'investment' } }],
  ['opening an existing account again', { accountId: 'bank' }],
  ['forged opening actor', { operation: { actorId: 'other' } }],
  ['unknown opening field', { operation: { countedByAdmin: true } }],
];
for (const [name, options] of openingAttacks) test(`Rules reject ${name}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await denied(rawOpening(options).commit());
  assert.equal((await getDoc(positionRef(owner, 'new-bank'))).exists(), false);
  assert.equal((await balance('bank')).balanceInCents, 10_000);
});

function reversal(overrides: Record<string, unknown> = {}) {
  return { groupId: 'proof', actorId: uid, clientActionId: 'reverse_123456', originalOperationId: 'action_123456', ...overrides };
}
function rawReversal(options: { operation?: Record<string, unknown>; claim?: Record<string, unknown>;
  omit?: 'claim' | 'debit' | 'credit' | 'operation' | 'quota'; claimId?: string } = {}) {
  const id = 'reverse_123456';
  const batch = writeBatch(owner);
  if (options.omit !== 'operation') batch.set(operationRef(owner, id), { schemaVersion: 1, actorId: uid, kind: 'transfer_reversal',
    fromAccountId: 'cash', toAccountId: 'bank', amountInCents: 1000, fromRevision: 1, toRevision: 1,
    fromPreviousOperationId: 'action_123456', toPreviousOperationId: 'action_123456',
    reversesOperationId: 'action_123456', note: null, overdraftReason: null, createdAt: serverTimestamp(), ...options.operation });
  if (options.omit !== 'claim') batch.set(doc(owner, 'financialGroups', 'proof', 'sparkReversals', options.claimId ?? 'action_123456'), {
    schemaVersion: 1, actorId: uid, reversalOperationId: id, createdAt: serverTimestamp(), ...options.claim });
  for (const [accountId, omit] of [['cash', 'debit'], ['bank', 'credit']] as const) {
    if (options.omit !== omit) batch.update(positionRef(owner, accountId), { balanceInCents: 10_000,
      revision: 2, lastOperationId: id, updatedAt: serverTimestamp() });
  }
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', count: 2,
    windowStartInMillis: Math.floor(Date.now() / 60_000) * 60_000, lastOperationId: id, updatedAt: serverTimestamp() });
  return batch;
}

test('reversal restores both positions once and retry preserves the original result', async () => {
  await transferSparkFundsFirebase(owner, command());
  assert.equal((await reverseSparkTransferFirebase(owner, reversal())).idempotent, false);
  assert.equal((await balance('bank')).balanceInCents, 10_000);
  assert.equal((await balance('cash')).balanceInCents, 10_000);
  assert.equal((await balance('bank')).revision, 2);
  assert.equal((await reverseSparkTransferFirebase(secondSession, reversal())).idempotent, true);
  await assert.rejects(reverseSparkTransferFirebase(owner, reversal({ clientActionId: 'reverse_again_123456' })), /já foi estornada/);
  await assert.rejects(reverseSparkTransferFirebase(owner, reversal({ note: 'changed' })), /outros argumentos/);
});

test('concurrent reversal requests with different action IDs cannot reverse twice', async () => {
  await transferSparkFundsFirebase(owner, command());
  const results = await Promise.allSettled([reverseSparkTransferFirebase(owner, reversal()),
    reverseSparkTransferFirebase(secondSession, reversal({ clientActionId: 'reverse_other_123456' }))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await balance('bank')).balanceInCents, 10_000);
  assert.equal((await balance('bank')).revision, 2);
});

test('simultaneous identical reversal returns one commit and one idempotent result', async () => {
  await transferSparkFundsFirebase(owner, command());
  const results = await Promise.all([reverseSparkTransferFirebase(owner, reversal()), reverseSparkTransferFirebase(secondSession, reversal())]);
  assert.deepEqual(results.map(result => result.idempotent).sort(), [false, true]);
});

test('reversal of investment deposit restores principal without calling it an ordinary redemption', async () => {
  await transferSparkFundsFirebase(owner, command({ kind: 'investment_deposit', toAccountId: 'investment' }));
  await reverseSparkTransferFirebase(owner, reversal());
  assert.equal((await balance('bank')).balanceInCents, 10_000);
  assert.equal((await balance('investment')).balanceInCents, 5000);
  assert.equal((await getDoc(operationRef(owner, 'reverse_123456'))).data()!.kind, 'transfer_reversal');
});

const reversalAttacks: [string, Parameters<typeof rawReversal>[0]][] = [
  ['reversal without its unique claim', { omit: 'claim' }],
  ['claim without reversal receipt', { omit: 'operation' }],
  ['reversal without debit', { omit: 'debit' }], ['reversal without credit', { omit: 'credit' }],
  ['reversal without quota', { omit: 'quota' }],
  ['reversal changing the original amount', { operation: { amountInCents: 999 } }],
  ['reversal changing the original counterpart', { operation: { toAccountId: 'third' } }],
  ['reversal of missing original', { operation: { reversesOperationId: 'missing_123456' } }],
  ['claim attached to a different original', { claimId: 'other_original_123456' }],
  ['claim attached to a different reversal', { claim: { reversalOperationId: 'other_reverse_123456' } }],
  ['claim actor injection', { claim: { actorId: 'outsider' } }],
  ['claim timestamp forgery', { claim: { createdAt: new Date(0) } }],
  ['claim field injection', { claim: { admin: true } }],
];
for (const [name, options] of reversalAttacks) test(`Rules reject ${name}`, async () => {
  await transferSparkFundsFirebase(owner, command());
  await denied(rawReversal(options).commit());
  assert.equal((await balance('bank')).balanceInCents, 9000);
  assert.equal((await balance('cash')).balanceInCents, 11_000);
});

test('member cannot reverse another member operation; administrator may', async () => {
  const otherUid = getAuth(outsider.app).currentUser!.uid;
  await seedGroup({ members: { [uid]: 'member', [otherUid]: 'member' } });
  await transferSparkFundsFirebase(outsider, command({ actorId: otherUid }));
  await assert.rejects(reverseSparkTransferFirebase(owner, reversal()), /próprias operações/);
  await denied(rawReversal().commit());
  await seedGroup({ members: { [uid]: 'admin', [otherUid]: 'member' } });
  await reverseSparkTransferFirebase(owner, reversal());
  assert.equal((await balance('bank')).balanceInCents, 10_000);
});

test('reversal claims are immutable and a reversal cannot itself be reversed', async () => {
  await transferSparkFundsFirebase(owner, command());
  await reverseSparkTransferFirebase(owner, reversal());
  const claimRef = doc(owner, 'financialGroups', 'proof', 'sparkReversals', 'action_123456');
  const edit = writeBatch(owner); edit.update(claimRef, { reversalOperationId: 'other_123456' }); await denied(edit.commit());
  const remove = writeBatch(owner); remove.delete(claimRef); await denied(remove.commit());
  await assert.rejects(reverseSparkTransferFirebase(owner, reversal({ originalOperationId: 'reverse_123456', clientActionId: 'nested_123456' })), /não permite/);
});

function count(overrides: Partial<SparkCountInput> = {}): SparkCountInput {
  return { groupId: 'proof', actorId: uid, clientActionId: 'count_123456', accountId: 'bank',
    kind: 'account_count', targetBalanceInCents: 12_000, expectedRevision: 0, ...overrides };
}
function rawCount(options: { operation?: Record<string, unknown>; checkpoint?: Record<string, unknown>;
  position?: Record<string, unknown>; omit?: 'position' | 'operation' | 'quota' | 'checkpoint' } = {}) {
  const id = 'count_123456';
  const batch = writeBatch(owner);
  if (options.omit !== 'operation') batch.set(operationRef(owner, id), { schemaVersion: 1, actorId: uid, kind: 'account_count',
    accountId: 'bank', targetBalanceInCents: 12_000, previousBalanceInCents: 10_000, differenceInCents: 2000,
    currentEffectInCents: 2000, expectedRevision: 0, previousOperationId: 'bootstrap_bank', note: null, overdraftReason: null, createdAt: serverTimestamp(), ...options.operation });
  if (options.omit !== 'position') batch.update(positionRef(owner), { balanceInCents: 12_000, revision: 1,
    lastOperationId: id, updatedAt: serverTimestamp(), ...options.position });
  if (options.omit !== 'checkpoint') batch.set(doc(owner, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank'), {
    operationId: id, countedBalanceInCents: 12_000, effectiveAt: serverTimestamp(), includesBoundary: false, ...options.checkpoint });
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', count: 1,
    windowStartInMillis: Math.floor(Date.now() / 60_000) * 60_000, lastOperationId: id, updatedAt: serverTimestamp() });
  return batch;
}

test('authorized count records the derived difference and checkpoint atomically', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count());
  const operation = (await getDoc(operationRef(owner, 'count_123456'))).data()!;
  const checkpoint = (await getDoc(doc(owner, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank'))).data()!;
  assert.equal(operation.previousBalanceInCents, 10_000);
  assert.equal(operation.differenceInCents, 2000);
  assert.equal((await balance('bank')).balanceInCents, 12_000);
  assert.ok(checkpoint.effectiveAt.isEqual(operation.createdAt));
  assert.equal((await countSparkAccountFirebase(secondSession, count())).idempotent, true);
  await assert.rejects(countSparkAccountFirebase(owner, count({ targetBalanceInCents: 13_000 })), /outros argumentos/);
});

test('member cannot count a balance through either client service or a direct batch', async () => {
  await assert.rejects(countSparkAccountFirebase(owner, count()), /administrador/);
  await denied(rawCount().commit());
});

test('two counts from the same preview revision cannot both overwrite the balance', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const results = await Promise.allSettled([countSparkAccountFirebase(owner, count()), countSparkAccountFirebase(secondSession,
    count({ clientActionId: 'second_count_123456', targetBalanceInCents: 15_000 }))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await balance('bank')).revision, 1);
  assert.ok([12_000, 15_000].includes((await balance('bank')).balanceInCents));
});

test('unchanged count still records a new reference and serializes future writes', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count({ targetBalanceInCents: 10_000 }));
  assert.equal((await balance('bank')).revision, 1);
  assert.equal((await getDoc(operationRef(owner, 'count_123456'))).data()!.differenceInCents, 0);
});

test('opening then explicit count does not let the zero creation claim import history', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await openSparkAccountFirebase(owner, opening());
  await countSparkAccountFirebase(owner, count({ accountId: 'new-bank' }));
  assert.equal((await balance('new-bank')).balanceInCents, 12_000);
  assert.equal((await balance('new-bank')).revision, 1);
  const receipt = (await getDoc(operationRef(owner, 'count_123456'))).data()!;
  assert.equal(receipt.previousBalanceInCents, 0);
  assert.equal(receipt.differenceInCents, 12_000);
});

const countAttacks: [string, Parameters<typeof rawCount>[0]][] = [
  ['count without position', { omit: 'position' }], ['count without receipt', { omit: 'operation' }],
  ['count without checkpoint', { omit: 'checkpoint' }], ['count without quota', { omit: 'quota' }],
  ['forged previous balance', { operation: { previousBalanceInCents: 9000 } }],
  ['forged counted difference', { operation: { differenceInCents: 999 } }],
  ['forged current count effect', { operation: { currentEffectInCents: 0 } }],
  ['stale count revision', { operation: { expectedRevision: 1 } }],
  ['fractional counted balance', { operation: { targetBalanceInCents: 12_000.5 } }],
  ['checkpoint points to another operation', { checkpoint: { operationId: 'other_123456' } }],
  ['checkpoint has another counted balance', { checkpoint: { countedBalanceInCents: 20_000 } }],
  ['backdated checkpoint', { checkpoint: { effectiveAt: new Date(0) } }],
  ['injected count effective date', { operation: { effectiveAt: new Date(0) } }],
  ['extra checkpoint field', { checkpoint: { admin: true } }],
];
for (const [name, options] of countAttacks) test(`Rules reject ${name}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await denied(rawCount(options).commit());
  assert.equal((await balance('bank')).balanceInCents, 10_000);
  assert.equal((await getDoc(doc(owner, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank'))).exists(), false);
});

test('current adjustment and its reversal change the balance without introducing a counted checkpoint', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count({ kind: 'balance_adjustment' }));
  assert.equal((await getDoc(doc(owner, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank'))).exists(), false);
  const input = { groupId: 'proof', actorId: uid, clientActionId: 'undo_adjustment_123456', originalOperationId: 'count_123456' };
  await reverseSparkBalanceAdjustmentFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, 10_000);
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  assert.equal(receipt.differenceInCents, -2000);
  assert.equal(receipt.currentEffectInCents, -2000);
  assert.equal((await reverseSparkBalanceAdjustmentFirebase(secondSession, input)).idempotent, true);
  await assert.rejects(reverseSparkBalanceAdjustmentFirebase(owner, { ...input, clientActionId: 'another_undo_123456' }), /já foi estornado/);
  await assert.rejects(reverseSparkTransferFirebase(owner, reversal({ originalOperationId: 'count_123456' })), /não permite/);
});

test('reversing an old adjustment after a newer counted opening preserves current balance and later movements', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count({ kind: 'balance_adjustment' }));
  await countSparkAccountFirebase(owner, count({ clientActionId: 'new_reference_123456', targetBalanceInCents: 8000, expectedRevision: 1 }));
  // O oráculo legado usa Date (ms); separar commits evita perder sua ordem ao converter Timestamp (ns).
  await new Promise(resolve => setTimeout(resolve, 2));
  await transferSparkFundsFirebase(owner, command({ amountInCents: 500 }));
  const original = (await getDoc(operationRef(owner, 'count_123456'))).data()!;
  const transfer = (await getDoc(operationRef(owner))).data()!;
  const checkpoint = (await getDoc(doc(owner, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank'))).data()!;
  await reverseSparkBalanceAdjustmentFirebase(owner, { groupId: 'proof', actorId: uid,
    originalOperationId: 'count_123456', clientActionId: 'historical_undo_123456' });
  const inverse = (await getDoc(operationRef(owner, 'historical_undo_123456'))).data()!;
  assert.ok(inverse.effectiveAt.isEqual(original.createdAt));
  assert.equal(inverse.currentEffectInCents, 0);
  assert.equal(inverse.differenceInCents, -2000);
  const base = { groupId: 'proof', actorId: uid, clientActionId: 'oracle_123456' };
  const transactions: LedgerTransaction[] = [
    { ...base, id: 'original', kind: 'reconciliation_adjustment', effectiveAt: original.createdAt.toDate(),
      legs: [{ accountId: 'bank', deltaInCents: 2000 }, { accountId: null, deltaInCents: -2000 }] },
    { ...base, id: 'inverse', kind: 'reversal', reversesTransactionId: 'original', effectiveAt: inverse.effectiveAt.toDate(),
      legs: [{ accountId: 'bank', deltaInCents: -2000 }, { accountId: null, deltaInCents: 2000 }] },
    { ...base, id: 'transfer', kind: 'transfer', effectiveAt: transfer.createdAt.toDate(),
      legs: [{ accountId: 'bank', deltaInCents: -500 }, { accountId: 'cash', deltaInCents: 500 }] },
  ];
  const oracle = calculateAccountBalanceInCents({ accountId: 'bank', transactions,
    reconciliation: { id: 'reference', groupId: 'proof', accountId: 'bank', effectiveAt: checkpoint.effectiveAt.toDate(),
      countedBalanceInCents: 8000, differenceInCents: -4000, source: 'manual' } });
  assert.equal(oracle, 7500);
  assert.equal((await balance('bank')).balanceInCents, oracle);
  assert.equal((await balance('bank')).revision, 4);
});

test('checkpoint cannot be changed or removed without an authorized count operation', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count());
  const ref = doc(owner, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank');
  const edit = writeBatch(owner); edit.update(ref, { effectiveAt: serverTimestamp() }); await denied(edit.commit());
  const remove = writeBatch(owner); remove.delete(ref); await denied(remove.commit());
});

async function rawAdjustmentReversal(options: { operation?: Record<string, unknown>; position?: Record<string, unknown>;
  claim?: Record<string, unknown>; omit?: 'position' | 'operation' | 'quota' | 'claim' } = {}) {
  const original = (await getDoc(operationRef(owner, 'count_123456'))).data()!;
  const current = await balance('bank');
  const checkpoint = (await getDoc(doc(owner, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank'))).data();
  const effect = checkpoint && checkpoint.effectiveAt.toMillis() >= original.createdAt.toMillis() ? 0 : -original.differenceInCents;
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data();
  const id = 'undo_adjustment_123456';
  const batch = writeBatch(owner);
  if (options.omit !== 'operation') batch.set(operationRef(owner, id), { schemaVersion: 1, actorId: uid, kind: 'adjustment_reversal',
    accountId: 'bank', reversesOperationId: 'count_123456', effectiveAt: original.createdAt,
    expectedRevision: current.revision, previousOperationId: current.lastOperationId, differenceInCents: -original.differenceInCents, currentEffectInCents: effect,
    note: null, overdraftReason: null, createdAt: serverTimestamp(), ...options.operation });
  if (options.omit !== 'position') batch.update(positionRef(owner), { balanceInCents: current.balanceInCents + effect,
    revision: current.revision + 1, lastOperationId: id, updatedAt: serverTimestamp(), ...options.position });
  if (options.omit !== 'claim') batch.set(doc(owner, 'financialGroups', 'proof', 'sparkAdjustmentReversals', 'count_123456'), {
    schemaVersion: 1, actorId: uid, reversalOperationId: id, createdAt: serverTimestamp(), ...options.claim });
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof',
    count: quota?.windowStartInMillis === Math.floor(Date.now() / 60_000) * 60_000 ? quota.count + 1 : 1,
    windowStartInMillis: Math.floor(Date.now() / 60_000) * 60_000, lastOperationId: id, updatedAt: serverTimestamp() });
  return batch;
}

const adjustmentReversalAttacks: [string, Parameters<typeof rawAdjustmentReversal>[0]][] = [
  ['adjustment reversal without position', { omit: 'position' }], ['adjustment reversal without receipt', { omit: 'operation' }],
  ['adjustment reversal without unique claim', { omit: 'claim' }], ['adjustment reversal without quota', { omit: 'quota' }],
  ['rewritten adjustment effective date', { operation: { effectiveAt: new Date(0) } }],
  ['wrong original adjustment', { operation: { reversesOperationId: 'missing_123456' } }],
  ['wrong historic inverse amount', { operation: { differenceInCents: -1000 } }],
  ['suppressed effect without a newer checkpoint', { operation: { currentEffectInCents: 0 }, position: { balanceInCents: 12_000 } }],
  ['stale adjustment reversal revision', { operation: { expectedRevision: 0 } }],
  ['adjustment reversal actor forgery', { operation: { actorId: 'other' } }],
  ['wrong adjustment reversal claim actor', { claim: { actorId: 'other' } }],
  ['wrong adjustment reversal claim target', { claim: { reversalOperationId: 'other_123456' } }],
  ['extra adjustment reversal authority field', { operation: { admin: true } }],
];
for (const [name, options] of adjustmentReversalAttacks) test(`Rules reject ${name}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count({ kind: 'balance_adjustment' }));
  await denied((await rawAdjustmentReversal(options)).commit());
  assert.equal((await balance('bank')).balanceInCents, 12_000);
  assert.equal((await balance('bank')).revision, 1);
});

test('historic adjustment reversal cannot debit again after a later counted opening', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count({ kind: 'balance_adjustment' }));
  await countSparkAccountFirebase(owner, count({ clientActionId: 'new_reference_123456', expectedRevision: 1, targetBalanceInCents: 8000 }));
  await denied((await rawAdjustmentReversal({ operation: { currentEffectInCents: -2000 }, position: { balanceInCents: 6000 } })).commit());
  assert.equal((await balance('bank')).balanceInCents, 8000);
});

test('concurrent count and adjustment reversal preserve a serial state and explicit recovery', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count({ kind: 'balance_adjustment' }));
  const [countResult, inverseResult] = await Promise.allSettled([
    countSparkAccountFirebase(owner, count({ clientActionId: 'new_reference_123456', expectedRevision: 1, targetBalanceInCents: 8000 })),
    reverseSparkBalanceAdjustmentFirebase(secondSession, { groupId: 'proof', actorId: uid,
      originalOperationId: 'count_123456', clientActionId: 'undo_adjustment_123456' }),
  ]);
  assert.ok(countResult.status === 'fulfilled' || inverseResult.status === 'fulfilled');
  if (inverseResult.status === 'rejected') {
    assert.equal(countResult.status, 'fulfilled');
    assert.equal(inverseResult.reason.code, 'permission-denied', String(inverseResult.reason));
    assert.doesNotMatch(inverseResult.reason.message, /maximum of|too many (?:document|access|expression)/i);
    assert.equal((await balance('bank')).balanceInCents, 8000);
    assert.equal((await getDoc(operationRef(owner, 'undo_adjustment_123456'))).exists(), false);
    // Simula retomada explícita após conferir ausência do recibo; o serviço não reenvia sozinho.
    await reverseSparkBalanceAdjustmentFirebase(secondSession, { groupId: 'proof', actorId: uid,
      originalOperationId: 'count_123456', clientActionId: 'undo_adjustment_123456' });
  }
  const current = await balance('bank');
  if (countResult.status === 'fulfilled') {
    assert.equal(current.balanceInCents, 8000); assert.equal(current.revision, 3);
  } else {
    assert.ok(countResult.status === 'rejected');
    assert.ok(countResult.reason.code === 'permission-denied' || /prévia ficou desatualizada/.test(String(countResult.reason)), String(countResult.reason));
    assert.doesNotMatch(String(countResult.reason), /maximum of|too many (?:document|access|expression)/i);
    assert.equal((await getDoc(operationRef(owner, 'new_reference_123456'))).exists(), false);
    assert.equal(current.balanceInCents, 10_000); assert.equal(current.revision, 2);
  }
});

test('two different reversals of the same adjustment produce one inverse', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count({ kind: 'balance_adjustment' }));
  const input = { groupId: 'proof', actorId: uid, originalOperationId: 'count_123456', clientActionId: 'undo_adjustment_123456' };
  const results = await Promise.allSettled([reverseSparkBalanceAdjustmentFirebase(owner, input),
    reverseSparkBalanceAdjustmentFirebase(secondSession, { ...input, clientActionId: 'other_adjustment_undo_123456' })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await balance('bank')).balanceInCents, 10_000);
  assert.equal((await balance('bank')).revision, 2);
});

test('administrator still cannot reverse an adjustment authored by someone else', async () => {
  const otherUid = getAuth(outsider.app).currentUser!.uid;
  await seedGroup({ members: { [uid]: 'admin', [otherUid]: 'admin' } });
  await countSparkAccountFirebase(outsider, count({ actorId: otherUid, kind: 'balance_adjustment' }));
  await assert.rejects(reverseSparkBalanceAdjustmentFirebase(owner, { groupId: 'proof', actorId: uid,
    originalOperationId: 'count_123456', clientActionId: 'undo_adjustment_123456' }), /autor do ajuste/);
  await denied((await rawAdjustmentReversal()).commit());
});

test('counting cannot fund an investment by bypassing a debit from its funding account', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await seedPosition('bank', { kind: 'investment' });
  await assert.rejects(countSparkAccountFirebase(owner, count()), /incompatível/);
  await denied(rawCount().commit());
});

test('negative counted bank balance requires a recorded justification', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await denied(rawCount({ operation: { targetBalanceInCents: -1000, differenceInCents: -11_000, currentEffectInCents: -11_000 },
    position: { balanceInCents: -1000 }, checkpoint: { countedBalanceInCents: -1000 } }).commit());
  await countSparkAccountFirebase(owner, count({ targetBalanceInCents: -1000, overdraftReason: 'saldo conferido' }));
  assert.equal((await balance('bank')).balanceInCents, -1000);
});

test('cash opening uses the single group identity and can subsequently receive funds', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await environment.withSecurityRulesDisabled(async context => {
    await seedDeleteDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkPositions', 'cash'));
  });
  await openSparkAccountFirebase(owner, opening({ accountId: 'cash', kind: 'cash' }));
  await transferSparkFundsFirebase(owner, command());
  assert.equal((await balance('cash')).balanceInCents, 1000);
  await assert.rejects(openSparkAccountFirebase(owner, opening({ accountId: 'cash', kind: 'cash', clientActionId: 'another_cash_123456' })), /já possui abertura/);
});

test('services explicitly reject unsupported effective dates instead of dropping them', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const unsupported = { effectiveAt: new Date('2026-01-01T00:00:00Z') };
  await assert.rejects(transferSparkFundsFirebase(owner, { ...command(), ...unsupported }), /não aceita data efetiva/);
  await assert.rejects(openSparkAccountFirebase(owner, { ...opening(), ...unsupported }), /não aceita data efetiva/);
  await assert.rejects(countSparkAccountFirebase(owner, { ...count(), ...unsupported }), /não aceita data efetiva/);
  assert.equal((await balance('bank')).revision, 0);
});

test('adjustment reversal claims remain immutable after their effect was applied', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count({ kind: 'balance_adjustment' }));
  await reverseSparkBalanceAdjustmentFirebase(owner, { groupId: 'proof', actorId: uid,
    originalOperationId: 'count_123456', clientActionId: 'undo_adjustment_123456' });
  const claim = doc(owner, 'financialGroups', 'proof', 'sparkAdjustmentReversals', 'count_123456');
  const remove = writeBatch(owner); remove.delete(claim); await denied(remove.commit());
  const edit = writeBatch(owner); edit.update(claim, { reversalOperationId: 'other_123456' }); await denied(edit.commit());
});

const past = (iso = '2026-09-15T02:59:59.999Z') => Timestamp.fromDate(new Date(iso));
function temporal(overrides: Partial<SparkTemporalBalanceInput> = {}): SparkTemporalBalanceInput {
  return { groupId: 'proof', actorId: uid, clientActionId: 'temporal_123456', accountId: 'bank', kind: 'dated_adjustment',
    effectiveAt: past(), targetBalanceInCents: 12_000, expectedRevision: 0, ...overrides };
}
async function preview(input = temporal(), maxSteps = 100) {
  return prepareSparkHistoryProofFirebase(owner, { ...input, asOf: input.effectiveAt,
    purpose: input.kind === 'monthly_opening' ? 'monthly' : 'instant' }, maxSteps);
}
function proofRef(id = 'temporal_123456') { return doc(owner, 'financialGroups', 'proof', 'sparkHistoryProofs', id); }
async function calendar(cycle = '2026-09', startAt = '2026-09-01T03:00:00Z') {
  await environment.withSecurityRulesDisabled(async context => {
    const row = createSparkCivilMonthCalendar(Number(cycle.slice(0, 4)), Number(cycle.slice(0, 4))).find(month => month.cycle === cycle)!;
    await seedSetDoc(seedDoc(context.firestore(), 'sparkCivilMonths', cycle), { ...row, startAt: new Date(startAt) });
  });
}

test('history projection resumes across sessions and verifies both complete passes', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const initial = await preview(temporal(), 1);
  assert.equal(initial.phase, 'checkpoints'); assert.equal(initial.cursorRevision, -1);
  const resumed = await prepareSparkHistoryProofFirebase(secondSession, { ...temporal(), asOf: past(), purpose: 'instant' });
  assert.equal(resumed.phase, 'done'); assert.equal(resumed.balanceInCents, 10_000);
  assert.equal(resumed.tailDeltaInCents, 0);
  await saveSparkTemporalBalanceFirebase(owner, temporal());
  assert.equal((await balance('bank')).balanceInCents, 12_000);
  assert.equal((await saveSparkTemporalBalanceFirebase(secondSession, temporal())).idempotent, true);
  await assert.rejects(saveSparkTemporalBalanceFirebase(owner, temporal({ targetBalanceInCents: 13_000 })), /outros argumentos/);
});

test('adjustment for today uses the server confirmation instant while replay preserves the prepared intent', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const input = temporal({ effectiveAt: Timestamp.now() }); await preview(input);
  await saveSparkTemporalBalanceFirebase(owner, input);
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  assert.ok(receipt.effectiveAt.isEqual(receipt.createdAt));
  assert.ok(receipt.requestedEffectiveAt.isEqual(input.effectiveAt));
  assert.equal(receipt.effectiveMode, 'commit'); assert.equal((await balance('bank')).balanceInCents, 12_000);
  assert.equal((await saveSparkTemporalBalanceFirebase(secondSession, input)).idempotent, true);
});

test('past adjustment rejects an arbitrary hour and requires the verified civil day end', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const input = temporal({ effectiveAt: past('2026-09-14T15:00:00Z') }); await preview(input);
  await assert.rejects(saveSparkTemporalBalanceFirebase(owner, input), /fim do dia civil/);
});

test('backdated adjustment preserves later movements and its exact-date reversal', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await transferSparkFundsFirebase(owner, command({ amountInCents: 500 }));
  const input = temporal({ expectedRevision: 1 });
  const proof = await preview(input); assert.equal(proof.balanceInCents, 10_000); assert.equal(proof.tailDeltaInCents, -500);
  await saveSparkTemporalBalanceFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, 11_500);
  await reverseSparkBalanceAdjustmentFirebase(owner, { groupId: 'proof', actorId: uid,
    clientActionId: 'dated_inverse_123456', originalOperationId: input.clientActionId });
  assert.equal((await balance('bank')).balanceInCents, 9500);
  const inverse = (await getDoc(operationRef(owner, 'dated_inverse_123456'))).data()!;
  assert.ok(inverse.effectiveAt.isEqual(input.effectiveAt));
  const reproject = await preview(temporal({ clientActionId: 'reproject_123456', expectedRevision: 3 }));
  assert.equal(reproject.balanceInCents, 10_000);
});

test('adjustment before a newer count changes history and has no current effect', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count({ targetBalanceInCents: 8000 }));
  const input = temporal({ expectedRevision: 1 }); await preview(input);
  await saveSparkTemporalBalanceFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, 8000);
  assert.equal((await getDoc(operationRef(owner, input.clientActionId))).data()!.currentEffectInCents, 0);
  const proof = await preview(temporal({ clientActionId: 'historical_check_123456', expectedRevision: 2 }));
  assert.equal(proof.balanceInCents, 12_000);
  await reverseSparkBalanceAdjustmentFirebase(owner, { groupId: 'proof', actorId: uid, clientActionId: 'undo_dated_123456', originalOperationId: input.clientActionId });
  assert.equal((await balance('bank')).balanceInCents, 8000);
});

test('historical reconciliation recalculates current position from counted base plus the verified tail', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await transferSparkFundsFirebase(owner, command({ amountInCents: 500 }));
  const input = temporal({ kind: 'dated_reconciliation', expectedRevision: 1, targetBalanceInCents: 8000 });
  await preview(input); await saveSparkTemporalBalanceFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, 7500);
  const checkpoint = (await getDoc(doc(owner, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank'))).data()!;
  assert.ok(checkpoint.effectiveAt.isEqual(input.effectiveAt)); assert.equal(checkpoint.includesBoundary, false);
});

test('monthly opening is canonical by account and cycle and updates preserve immutable history', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await calendar();
  await transferSparkFundsFirebase(owner, command({ amountInCents: 500 }));
  const input = temporal({ kind: 'monthly_opening', cycle: '2026-09', effectiveAt: past('2026-09-01T03:00:00Z'), expectedRevision: 1 });
  await preview(input); await saveSparkTemporalBalanceFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, 11_500);
  const update = { ...input, clientActionId: 'monthly_update_123456', expectedRevision: 2,
    expectedOpeningOperationId: input.clientActionId, targetBalanceInCents: 9000 };
  await preview(update); await saveSparkTemporalBalanceFirebase(owner, update);
  assert.equal((await balance('bank')).balanceInCents, 8500);
  const pointer = (await getDoc(doc(owner, 'financialGroups', 'proof', 'sparkMonthlyOpenings', 'bank', 'cycles', '2026-09'))).data()!;
  assert.equal(pointer.operationId, update.clientActionId);
  assert.equal((await getDoc(operationRef(owner, input.clientActionId))).data()!.targetBalanceInCents, 12_000);
});

test('older monthly opening never overrides a later counted balance', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await calendar();
  await countSparkAccountFirebase(owner, count({ targetBalanceInCents: 8000 }));
  const input = temporal({ kind: 'monthly_opening', cycle: '2026-09', effectiveAt: past('2026-09-01T03:00:00Z'), expectedRevision: 1 });
  await preview(input); await saveSparkTemporalBalanceFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, 8000);
});

test('new zero account accepts a month opening earlier than its registration without a later zero reset', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await calendar();
  await openSparkAccountFirebase(owner, opening());
  const input = temporal({ accountId: 'new-bank', kind: 'monthly_opening', cycle: '2026-09', effectiveAt: past('2026-09-01T03:00:00Z') });
  await preview(input); await saveSparkTemporalBalanceFirebase(owner, input);
  assert.equal((await balance('new-bank')).balanceInCents, 12_000);
  const next = await preview({ ...input, clientActionId: 'check_new_month_123456', expectedRevision: 1 });
  assert.equal(next.balanceInCents, 12_000);
});

test('historical adjustment cannot invent a zero base without an eligible counted opening', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await openSparkAccountFirebase(owner, opening());
  const input = temporal({ accountId: 'new-bank' }); await preview(input);
  await assert.rejects(saveSparkTemporalBalanceFirebase(owner, input), /posterior à abertura/);
  const batch = await rawTemporal({ operation: { accountId: 'new-bank', previousOperationId: 'opening_123456', previousBalanceInCents: 0,
    differenceInCents: 12_000, currentEffectInCents: 12_000 }, omit: 'position' });
  batch.update(positionRef(owner, 'new-bank'), { balanceInCents: 12_000, revision: 1, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
  batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', count: 2,
    windowStartInMillis: Math.floor(Date.now() / 60_000) * 60_000, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
  await denied(batch.commit()); assert.equal((await balance('new-bank')).balanceInCents, 0);
});

test('a movement after the preview makes temporal confirmation stale without partial effects', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await preview();
  await transferSparkFundsFirebase(owner, command());
  await assert.rejects(saveSparkTemporalBalanceFirebase(owner, temporal()), /prévia ficou desatualizada/);
  assert.equal((await balance('bank')).balanceInCents, 9000);
  assert.equal((await getDoc(operationRef(owner, 'temporal_123456'))).exists(), false);
});

test('projection cannot skip steps, forge an accumulator or complete early', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await startSparkHistoryProofFirebase(owner, { ...temporal(), asOf: past(), purpose: 'instant' });
  for (const change of [{ phase: 'done' }, { cursorRevision: -1, nextOperationId: null }, { balanceInCents: 5000 },
    { baselineBalanceInCents: 5000 }, { headRevision: 9 }, { nextOperationId: 'bootstrap_cash' }, { asOf: past('2026-01-01T00:00:00Z') },
    { actorId: 'other' }, { purpose: 'monthly' }, { baselineOperationId: 'bootstrap_cash' }, { nextCheckpointAt: past() }, { extra: true }]) {
    const batch = writeBatch(owner); batch.update(proofRef(), { ...change, updatedAt: serverTimestamp() }); await denied(batch.commit());
  }
});

test('projection is private and membership, role and session are rechecked on every step', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await preview(temporal(), 0);
  await denied(getDoc(doc(outsider, 'financialGroups', 'proof', 'sparkHistoryProofs', 'temporal_123456')));
  await seedGroup({ members: { [uid]: 'member' } });
  await assert.rejects(stepSparkHistoryProofFirebase(owner, temporal(), 0), /administrador/);
  await assert.rejects(saveSparkTemporalBalanceFirebase(owner, temporal()), /administrador/);
});

test('civil month boundaries are protected rather than trusting the phone timezone', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await calendar('2018-12', '2018-12-01T02:00:00Z');
  const input = temporal({ kind: 'monthly_opening', cycle: '2018-12', effectiveAt: past('2018-12-01T02:00:00Z') });
  await preview(input); await saveSparkTemporalBalanceFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, 12_000);
  const edit = writeBatch(owner); edit.update(doc(owner, 'sparkCivilMonths', '2018-12'), { startAt: past('2018-12-01T03:00:00Z') }); await denied(edit.commit());
});

test('unprepared bootstrap, incomplete proof and future dates fail explicitly', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await seedPosition('bank', { lastOperationId: null });
  await assert.rejects(preview(), /bootstrap/);
  await seedPosition('bank', { lastOperationId: 'bootstrap_bank' });
  await preview(temporal(), 0);
  await assert.rejects(saveSparkTemporalBalanceFirebase(owner, temporal()), /Conclua a projeção/);
  await denied(startSparkHistoryProofFirebase(owner, { ...temporal({ clientActionId: 'future_123456' }), asOf: past('2099-01-01T00:00:00Z'), purpose: 'instant' }));
});

async function rawTemporal(options: { operation?: Record<string, unknown>; position?: Record<string, unknown>;
  omit?: 'position' | 'operation' | 'quota'; proofChanges?: Record<string, unknown> } = {}) {
  const id = 'temporal_123456'; const batch = writeBatch(owner);
  if (options.omit !== 'operation') batch.set(operationRef(owner, id), { schemaVersion: 1, actorId: uid, accountId: 'bank',
    kind: 'dated_adjustment', proofId: id, expectedRevision: 0, previousOperationId: 'bootstrap_bank', effectiveAt: past(),
    requestedEffectiveAt: past(), effectiveMode: 'day_end', civilDay: 14,
    targetBalanceInCents: 12_000, previousBalanceInCents: 10_000, differenceInCents: 2000, currentEffectInCents: 2000,
    cycle: '2026-09', expectedOpeningOperationId: null, note: null, overdraftReason: null, createdAt: serverTimestamp(), ...options.operation });
  if (options.omit !== 'position') batch.update(positionRef(owner), { balanceInCents: 12_000, revision: 1,
    lastOperationId: id, updatedAt: serverTimestamp(), ...options.position });
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', count: 1,
    windowStartInMillis: Math.floor(Date.now() / 60_000) * 60_000, lastOperationId: id, updatedAt: serverTimestamp() });
  if (options.proofChanges) batch.update(proofRef(), options.proofChanges);
  return batch;
}
const temporalAttacks: [string, Parameters<typeof rawTemporal>[0]][] = [
  ['missing temporal position', { omit: 'position' }], ['missing temporal receipt', { omit: 'operation' }], ['missing temporal quota', { omit: 'quota' }],
  ['forged proved balance', { operation: { previousBalanceInCents: 9000, differenceInCents: 3000 } }],
  ['forged historical difference', { operation: { differenceInCents: 1000 } }],
  ['forged temporal current effect', { operation: { currentEffectInCents: 0 }, position: { balanceInCents: 10_000 } }],
  ['proof of another action', { operation: { proofId: 'other_action_123456' } }],
  ['changed temporal date', { operation: { effectiveAt: past('2026-08-01T03:00:00Z') } }],
  ['temporal actor spoofing', { operation: { actorId: 'other' } }],
  ['omitted previous link', { operation: { previousOperationId: null } }],
  ['skipped previous link', { operation: { previousOperationId: 'bootstrap_cash' } }],
  ['changed proof and financial write together', { proofChanges: { balanceInCents: 5000, updatedAt: serverTimestamp() } }],
  ['dated reconciliation without mandatory checkpoint', { operation: { kind: 'dated_reconciliation' } }],
  ['monthly operation without canonical pointer or calendar', { operation: { kind: 'monthly_opening', cycle: '2026-09' } }],
  ['injected authority field', { operation: { approvedBy: 'admin' } }],
  ['fractional historical amount', { operation: { targetBalanceInCents: 12_000.5 } }],
  ['oversized historical note', { operation: { note: 'a'.repeat(2001) } }],
  ['past adjustment bypassing civil day with instant mode', { operation: { effectiveMode: 'instant' } }],
  ['past adjustment forged as a current commit', { operation: { effectiveMode: 'commit', effectiveAt: serverTimestamp() } }],
  ['different civil day from the projected instant', { operation: { civilDay: 15 } }],
  ['different civil month from the projected instant', { operation: { cycle: '2026-08' } }],
];
for (const [name, options] of temporalAttacks) test(`Rules reject ${name}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await preview();
  await denied((await rawTemporal(options)).commit());
  assert.equal((await balance('bank')).balanceInCents, 10_000);
  assert.equal((await getDoc(operationRef(owner, 'temporal_123456'))).exists(), false);
});

test('direct temporal batch succeeds only with a completed, unchanged proof', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await preview();
  await (await rawTemporal()).commit(); assert.equal((await balance('bank')).balanceInCents, 12_000);
});

test('Rules reject stale temporal proof even when bypassing the client check', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await preview();
  await transferSparkFundsFirebase(owner, command());
  await denied((await rawTemporal({ operation: { expectedRevision: 1, previousOperationId: 'action_123456' },
    position: { revision: 2 } })).commit());
});

test('current-day adjustment cannot use an earlier-hour projection that excludes a known movement', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const earlier = Timestamp.fromMillis(Date.now() - 60_000);
  await transferSparkFundsFirebase(owner, command());
  const input = temporal({ effectiveAt: earlier, expectedRevision: 1 }); await preview(input);
  await assert.rejects(saveSparkTemporalBalanceFirebase(owner, input), /Atualize a prévia de hoje/);
  const civil = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(earlier.toDate());
  const batch = await rawTemporal({ operation: { requestedEffectiveAt: earlier, effectiveAt: serverTimestamp(), effectiveMode: 'commit',
    cycle: civil.slice(0, 7), civilDay: Number(civil.slice(8)), expectedRevision: 1, previousOperationId: 'action_123456' },
    position: { balanceInCents: 11_000, revision: 2 } });
  batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', count: 2,
    windowStartInMillis: Math.floor(Date.now() / 60_000) * 60_000, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
  await denied(batch.commit()); assert.equal((await balance('bank')).balanceInCents, 9000);
});

test('Rules require previous links for every pair writer', async () => {
  await denied(rawBatch(owner, { operation: { fromPreviousOperationId: 'bootstrap_cash' } }).commit());
  await denied(rawBatch(owner, { operation: { toPreviousOperationId: null } }).commit());
});

test('two temporal confirmations of the same preview cannot both change the position', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const first = temporal(), second = temporal({ clientActionId: 'other_temporal_123456', targetBalanceInCents: 9000 });
  await preview(first); await preview(second);
  const results = await Promise.allSettled([saveSparkTemporalBalanceFirebase(owner, first), saveSparkTemporalBalanceFirebase(secondSession, second)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok([12_000, 9000].includes((await balance('bank')).balanceInCents)); assert.equal((await balance('bank')).revision, 1);
});

test('monthly pointer cannot be detached, rewritten, removed or created under another cycle', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await calendar();
  const input = temporal({ kind: 'monthly_opening', cycle: '2026-09', effectiveAt: past('2026-09-01T03:00:00Z') });
  await preview(input); await saveSparkTemporalBalanceFirebase(owner, input);
  const ref = doc(owner, 'financialGroups', 'proof', 'sparkMonthlyOpenings', 'bank', 'cycles', '2026-09');
  const edit = writeBatch(owner); edit.update(ref, { countedBalanceInCents: 99_000 }); await denied(edit.commit());
  const remove = writeBatch(owner); remove.delete(ref); await denied(remove.commit());
  const create = writeBatch(owner); create.set(doc(owner, 'financialGroups', 'proof', 'sparkMonthlyOpenings', 'bank', 'cycles', '2026-08'),
    (await getDoc(ref)).data()!); await denied(create.commit());
});

test('first monthly creation from two sessions serializes on the canonical account cycle', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await calendar();
  const first = temporal({ kind: 'monthly_opening', cycle: '2026-09', effectiveAt: past('2026-09-01T03:00:00Z') });
  const second = { ...first, clientActionId: 'second_month_123456', targetBalanceInCents: 9000 };
  await preview(first); await preview(second);
  const results = await Promise.allSettled([saveSparkTemporalBalanceFirebase(owner, first), saveSparkTemporalBalanceFirebase(secondSession, second)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await getDocs(collection(owner, 'financialGroups', 'proof', 'sparkMonthlyOpenings', 'bank', 'cycles'))).size, 1);
});

test('imported snapshot reconciles locally and the real Rules projection reproduces its historical/current balances', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const firstAt = past('2026-09-01T03:00:00Z'), secondAt = past('2026-09-02T12:00:00Z');
  const report = reconcileSparkLedgerSnapshot({ groupId: 'proof', asOf: secondAt.toDate(), verificationDates: [firstAt.toDate()],
    accounts: [{ id: 'bank', groupId: 'proof', kind: 'bank', name: 'Bank', currentBalanceInCents: 9500 }],
    reconciliations: [{ id: 'month', groupId: 'proof', accountId: 'bank', effectiveAt: firstAt.toDate(), countedBalanceInCents: 10_000, differenceInCents: 0, source: 'legacyMonthStart' }],
    transactions: [{ id: 'importedExpense', groupId: 'proof', actorId: uid, clientActionId: 'imported_expense_123456', kind: 'expense', effectiveAt: firstAt.toDate(),
      legs: [{ accountId: 'bank', deltaInCents: -500 }, { accountId: null, deltaInCents: 500 }] }] });
  assert.equal(report.eligibleForReviewedBootstrap, true);
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore();
    await seedSetDoc(seedDoc(firestore, 'financialGroups', 'proof', 'sparkOperations', 'import_root_123456'), {
      kind: 'account_opening', accountId: 'bank', openingBalanceInCents: 0, createdAt: firstAt.toDate() });
    let previous = 'import_root_123456'; let revision = 0;
    for (const entry of report.accounts[0].entries) {
      const id = `import_entry_${++revision}`;
      await seedSetDoc(seedDoc(firestore, 'financialGroups', 'proof', 'sparkOperations', id), {
        kind: entry.kind === 'checkpoint' ? 'imported_checkpoint' : 'imported_movement', accountId: 'bank',
        expectedRevision: revision - 1, previousOperationId: previous, effectiveAt: entry.effectiveAt, createdAt: secondAt.toDate(),
        differenceInCents: entry.kind === 'movement' ? entry.amountInCents : 0,
        targetBalanceInCents: entry.kind === 'checkpoint' ? entry.amountInCents : 0, includesBoundary: entry.includesBoundary });
      previous = id;
    }
    await seedUpdateDoc(seedDoc(firestore, 'financialGroups', 'proof', 'sparkPositions', 'bank'), { balanceInCents: 9500, revision, lastOperationId: previous });
  });
  const proof = await preview(temporal({ effectiveAt: firstAt, expectedRevision: 2 }));
  assert.equal(proof.balanceInCents, report.accounts[0].historicalBalances[0].balanceInCents);
  assert.equal(proof.balanceInCents, 9500);
  const month = temporal({ clientActionId: 'boundary_month_123456', kind: 'monthly_opening', cycle: '2026-09', effectiveAt: firstAt, expectedRevision: 2, targetBalanceInCents: 12_000 });
  await calendar(); await preview(month); await saveSparkTemporalBalanceFirebase(owner, month);
  assert.equal((await balance('bank')).balanceInCents, 11_500);
});

const futureMonth = (overrides: Partial<SparkTemporalBalanceInput> = {}) => temporal({ kind: 'monthly_opening',
  cycle: '2026-11', effectiveAt: past('2026-11-01T03:00:00Z'), ...overrides });

test('future opening preserves current money and checkpoint and becomes a protected deadline', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count({ targetBalanceInCents: 9000 }));
  const checkpointRef = doc(owner, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank');
  const previousCheckpoint = (await getDoc(checkpointRef)).data();
  const input = futureMonth({ expectedRevision: 1 }); await preview(input);
  await saveSparkTemporalBalanceFirebase(owner, input);
  const position = await balance('bank');
  assert.equal(position.balanceInCents, 9000); assert.ok(position.nextActivationAt.isEqual(input.effectiveAt));
  assert.deepEqual((await getDoc(checkpointRef)).data(), previousCheckpoint);
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  assert.equal(receipt.currentEffectInCents, 0); assert.equal(receipt.differenceInCents, 0);
  assert.equal((await saveSparkTemporalBalanceFirebase(secondSession, input)).idempotent, true);
  await transferSparkFundsFirebase(owner, command()); assert.equal((await balance('bank')).balanceInCents, 8000);
});

test('future months can be inserted out of order and updated without losing the nearest deadline', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const december = futureMonth({ cycle: '2026-12', effectiveAt: past('2026-12-01T03:00:00Z') });
  await preview(december); await saveSparkTemporalBalanceFirebase(owner, december);
  const november = futureMonth({ clientActionId: 'near_month_123456', expectedRevision: 1 });
  await preview(november); await saveSparkTemporalBalanceFirebase(owner, november);
  const update = { ...november, clientActionId: 'edit_future_123456', expectedRevision: 2,
    expectedOpeningOperationId: november.clientActionId, targetBalanceInCents: 7000 };
  await preview(update); await saveSparkTemporalBalanceFirebase(owner, update);
  assert.ok((await balance('bank')).nextActivationAt.isEqual(november.effectiveAt));
  assert.equal((await balance('bank')).balanceInCents, 10_000);
  const projected = await preview({ ...november, clientActionId: 'future_projection_123456' });
  assert.equal(projected.balanceInCents, 7000); assert.equal(projected.baselineOperationId, update.clientActionId);
});

test('future checkpoint cannot neutralize a current adjustment or its reversal', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const future = futureMonth(); await preview(future); await saveSparkTemporalBalanceFirebase(owner, future);
  const adjustment = temporal({ clientActionId: 'before_future_123456', expectedRevision: 1 });
  const proof = await preview(adjustment); assert.ok(proof.latestCheckpointAt!.toMillis() < adjustment.effectiveAt.toMillis());
  await saveSparkTemporalBalanceFirebase(owner, adjustment); assert.equal((await balance('bank')).balanceInCents, 12_000);
  await reverseSparkBalanceAdjustmentFirebase(owner, { groupId: 'proof', actorId: uid,
    clientActionId: 'undo_before_future_123456', originalOperationId: adjustment.clientActionId });
  assert.equal((await balance('bank')).balanceInCents, 10_000);
  assert.ok((await balance('bank')).nextActivationAt.isEqual(future.effectiveAt));
});

async function rawFuture(options: { position?: Record<string, unknown>; operation?: Record<string, unknown>; omitPointer?: boolean; checkpoint?: boolean } = {}) {
  const input = futureMonth();
  const batch = await rawTemporal({ operation: { kind: 'monthly_opening', cycle: input.cycle, effectiveAt: input.effectiveAt,
    requestedEffectiveAt: input.effectiveAt, effectiveMode: 'instant', civilDay: null,
    currentEffectInCents: 0, differenceInCents: 0, ...options.operation },
  position: { balanceInCents: 10_000, nextActivationAt: input.effectiveAt, ...options.position } });
  if (!options.omitPointer) batch.set(doc(owner, 'financialGroups', 'proof', 'sparkMonthlyOpenings', 'bank', 'cycles', input.cycle!), {
    operationId: input.clientActionId, effectiveAt: input.effectiveAt, countedBalanceInCents: input.targetBalanceInCents });
  if (options.checkpoint) batch.set(doc(owner, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank'), {
    operationId: input.clientActionId, effectiveAt: input.effectiveAt, countedBalanceInCents: input.targetBalanceInCents, includesBoundary: true });
  return batch;
}

for (const [name, options] of [
  ['missing future deadline', { position: { nextActivationAt: null } }],
  ['delayed future deadline', { position: { nextActivationAt: past('2026-12-01T03:00:00Z') } }],
  ['premature future money', { operation: { currentEffectInCents: 2000 }, position: { balanceInCents: 12_000 } }],
  ['future monthly receipt without canonical slot', { omitPointer: true }],
  ['future checkpoint replacing current reference early', { checkpoint: true }],
] as [string, Parameters<typeof rawFuture>[0]][]) test(`Rules reject ${name}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await preview(futureMonth());
  await denied((await rawFuture(options)).commit()); assert.equal((await balance('bank')).revision, 0);
});

test('direct future monthly batch succeeds with unchanged balance and the earliest mandatory deadline', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await preview(futureMonth()); await (await rawFuture()).commit();
  assert.equal((await balance('bank')).balanceInCents, 10_000);
});

for (const from of ['bank', 'cash'] as const) test(`Rules block a stale bank on the ${from === 'bank' ? 'debit' : 'credit'} side and prevent erasing its deadline`, async () => {
  await seedPosition('bank', { nextActivationAt: Timestamp.fromMillis(Date.now() - 60_000) });
  const options = from === 'bank' ? { from, to: 'cash' as const, fromChanges: { nextActivationAt: null } }
    : { from, to: 'bank' as const, toChanges: { nextActivationAt: null } };
  await denied(rawBatch(owner, options).commit());
  await assert.rejects(transferSparkFundsFirebase(owner, command({ fromAccountId: from, toAccountId: from === 'bank' ? 'cash' : 'bank' })), /aberturas mensais vencidas/);
});

test('Rules block current count and retroactive adjustment on an overdue position', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await preview();
  await seedPosition('bank', { nextActivationAt: Timestamp.fromMillis(Date.now() - 60_000) });
  await denied(rawCount().commit()); await denied((await rawTemporal()).commit());
  await assert.rejects(countSparkAccountFirebase(owner, count()), /aberturas mensais vencidas/);
  await assert.rejects(saveSparkTemporalBalanceFirebase(owner, temporal()), /aberturas mensais vencidas/);
});

test('current-position read uses server time even when the local clock is behind the deadline', async () => {
  await seedPosition('bank', { nextActivationAt: Timestamp.fromMillis(Date.now() - 30_000) });
  const input = { groupId: 'proof', actorId: uid, clientActionId: 'clock_guard_123456', accountId: 'bank' };
  const originalNow = Date.now; const delayed = Date.now() - 60_000;
  try { Date.now = () => delayed; await denied(refreshSparkMonthlyOpeningFirebase(owner, input)); }
  finally { Date.now = originalNow; }
  await denied(readCurrentSparkPositionFirebase(owner, input));
});

test('current-position guard permits a current account and rejects foreign identity and guard writes', async () => {
  const input = { groupId: 'proof', actorId: uid, clientActionId: 'fresh_read_123456', accountId: 'bank' };
  assert.equal((await refreshSparkMonthlyOpeningFirebase(owner, input)).status, 'current');
  await assert.rejects(readCurrentSparkPositionFirebase(owner, { ...input, actorId: 'other' }), /sessão/);
  const batch = writeBatch(owner); batch.set(doc(owner, 'financialGroups', 'proof', 'sparkCurrentPositions', 'bank'), { active: true });
  await denied(batch.commit());
});

// Representa documentos agendados antes da virada, após meses sem acesso; só fixtures privilegiadas.
async function seedDueMonths(options: { future?: boolean; beforeBalance?: number; target?: number; futureAt?: ReturnType<typeof Timestamp.now> } = {}) {
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore();
    let previous = 'bootstrap_bank', revision = 0;
    const entries = [ { cycle: '2026-06', at: past('2026-06-01T03:00:00Z'), target: 12_000 },
      { cycle: '2026-07', at: past('2026-07-01T03:00:00Z'), target: options.target ?? 8000 },
      ...(options.future ? [{ cycle: '2026-11', at: options.futureAt ?? futureMonth().effectiveAt, target: 15_000 }] : []) ];
    for (const entry of entries) {
      const id = `scheduled_${entry.cycle}`;
      await seedSetDoc(seedDoc(firestore, 'financialGroups', 'proof', 'sparkOperations', id), {
        schemaVersion: 1, actorId: uid, kind: 'monthly_opening', accountId: 'bank', expectedRevision: revision++,
        previousOperationId: previous, effectiveAt: entry.at.toDate(), targetBalanceInCents: entry.target,
        differenceInCents: 0, currentEffectInCents: 0, createdAt: new Date('2026-05-20T12:00:00Z') });
      await seedSetDoc(seedDoc(firestore, 'financialGroups', 'proof', 'sparkMonthlyOpenings', 'bank', 'cycles', entry.cycle), {
        operationId: id, effectiveAt: entry.at.toDate(), countedBalanceInCents: entry.target });
      previous = id;
    }
    await seedUpdateDoc(seedDoc(firestore, 'financialGroups', 'proof', 'sparkPositions', 'bank'), {
      balanceInCents: options.beforeBalance ?? 10_000, revision, lastOperationId: previous,
      nextActivationAt: entries[0].at.toDate(), updatedAt: new Date('2026-05-20T12:00:00Z') });
  });
}
const activation = () => ({ groupId: 'proof', actorId: uid, clientActionId: 'activate_month_123456', accountId: 'bank', asOf: Timestamp.now() });

test('member resumes activation on another session after several closed-app months and preserves original checkpoint', async () => {
  await seedDueMonths({ future: true }); const input = activation();
  const first = await refreshSparkMonthlyOpeningFirebase(owner, input, 1); assert.equal(first.status, 'preparing');
  const result = await refreshSparkMonthlyOpeningFirebase(secondSession, input); assert.equal(result.status, 'current');
  assert.equal((await balance('bank')).balanceInCents, 8000); assert.ok((await balance('bank')).nextActivationAt.isEqual(futureMonth().effectiveAt));
  const checkpoint = (await getDoc(doc(owner, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank'))).data()!;
  assert.equal(checkpoint.operationId, 'scheduled_2026-07'); assert.equal(checkpoint.activationOperationId, input.clientActionId);
  assert.ok(checkpoint.effectiveAt.isEqual(past('2026-07-01T03:00:00Z')));
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  assert.equal(receipt.differenceInCents, 0); assert.equal(receipt.currentEffectInCents, -2000);
  await transferSparkFundsFirebase(owner, command()); assert.equal((await balance('bank')).balanceInCents, 7000);
  await seedGroup({ members: { [uid]: 'admin' } });
  const history = await preview(temporal({ clientActionId: 'after_activation_123456', effectiveAt: Timestamp.now() }));
  assert.equal(history.balanceInCents, 7000); assert.equal(history.baselineOperationId, 'scheduled_2026-07');
  assert.equal(history.baselineBalanceInCents, 8000);
});

test('activation permits a certified change between both monetary extremes without permanently locking the bank', async () => {
  await seedDueMonths({ beforeBalance: -1_000_000_000_000, target: 1_000_000_000_000 });
  const input = activation(); const result = await refreshSparkMonthlyOpeningFirebase(owner, input); assert.equal(result.status, 'current');
  assert.equal((await balance('bank')).balanceInCents, 1_000_000_000_000);
  assert.equal((await getDoc(operationRef(owner, input.clientActionId))).data()!.currentEffectInCents, 2_000_000_000_000);
});

async function preparedActivation(id = 'activate_month_123456') {
  return prepareSparkHistoryProofFirebase(owner, { ...activation(), clientActionId: id, purpose: 'activation' });
}
async function rawActivation(options: { operation?: Record<string, unknown>; position?: Record<string, unknown>; checkpoint?: Record<string, unknown>;
  omit?: 'operation' | 'position' | 'checkpoint' | 'quota'; proofChanges?: Record<string, unknown> } = {}) {
  const id = 'activate_month_123456'; const proof = (await getDoc(proofRef(id))).data()!;
  const position = await balance('bank'); const batch = writeBatch(owner);
  if (options.omit !== 'operation') batch.set(operationRef(owner, id), { schemaVersion: 1, actorId: uid, kind: 'monthly_activation', accountId: 'bank',
    proofId: id, asOf: proof.asOf, expectedRevision: position.revision, previousOperationId: position.lastOperationId,
    baselineOperationId: proof.baselineOperationId, effectiveAt: proof.baselineAt, targetBalanceInCents: proof.baselineBalanceInCents,
    includesBoundary: proof.includesBoundary, projectedBalanceInCents: proof.balanceInCents, differenceInCents: 0,
    currentEffectInCents: proof.balanceInCents - position.balanceInCents, nextActivationAt: proof.nextCheckpointAt, createdAt: serverTimestamp(), ...options.operation });
  if (options.omit !== 'position') batch.update(positionRef(owner), { balanceInCents: proof.balanceInCents, revision: position.revision + 1,
    lastOperationId: id, nextActivationAt: proof.nextCheckpointAt, updatedAt: serverTimestamp(), ...options.position });
  if (options.omit !== 'checkpoint') batch.set(doc(owner, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank'), {
    operationId: proof.baselineOperationId, effectiveAt: proof.baselineAt, countedBalanceInCents: proof.baselineBalanceInCents,
    includesBoundary: proof.includesBoundary, activationOperationId: id, ...options.checkpoint });
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', count: 1,
    windowStartInMillis: Math.floor(Date.now() / 60_000) * 60_000, lastOperationId: id, updatedAt: serverTimestamp() });
  if (options.proofChanges) batch.update(proofRef(id), { ...options.proofChanges, updatedAt: serverTimestamp() });
  return batch;
}

for (const [name, options] of [
  ['missing activation position', { omit: 'position' }], ['missing activation receipt', { omit: 'operation' }],
  ['missing activation checkpoint', { omit: 'checkpoint' }], ['missing activation quota', { omit: 'quota' }],
  ['forged activation amount', { operation: { projectedBalanceInCents: 9000, currentEffectInCents: -1000 }, position: { balanceInCents: 9000 } }],
  ['activation counted as a real historical movement', { operation: { differenceInCents: -2000 } }],
  ['activation detaching a future deadline', { operation: { nextActivationAt: null }, position: { nextActivationAt: null } }],
  ['activation shifting checkpoint to the commit instant', { operation: { effectiveAt: serverTimestamp() }, checkpoint: { effectiveAt: serverTimestamp() } }],
  ['activation replacing the selected original', { operation: { baselineOperationId: 'scheduled_2026-06' }, checkpoint: { operationId: 'scheduled_2026-06' } }],
  ['activation removing boundary movements', { operation: { includesBoundary: false }, checkpoint: { includesBoundary: false } }],
  ['activation applying another account projection', { operation: { accountId: 'cash' } }],
  ['activation mutating completed proof at commit', { proofChanges: { nextCheckpointAt: null } }],
  ['activation with injected authorization', { operation: { role: 'admin' } }],
] as [string, Parameters<typeof rawActivation>[0]][]) test(`Rules reject ${name}`, async () => {
  await seedDueMonths({ future: true }); await preparedActivation();
  await denied((await rawActivation(options)).commit()); assert.equal((await balance('bank')).balanceInCents, 10_000);
});

test('direct activation batch succeeds with a certified projection and original checkpoint', async () => {
  await seedDueMonths({ future: true }); await preparedActivation(); await (await rawActivation()).commit();
  assert.equal((await balance('bank')).balanceInCents, 8000);
});

test('two sessions activating one action return exactly one application and one reconciled receipt', async () => {
  await seedDueMonths(); const proof = await preparedActivation();
  const input = { ...activation(), asOf: proof.asOf, expectedRevision: proof.headRevision };
  const result = await Promise.all([activateSparkMonthlyOpeningFirebase(owner, input), activateSparkMonthlyOpeningFirebase(secondSession, input)]);
  assert.deepEqual(result.map(item => item.idempotent).sort(), [false, true]);
  assert.equal((await balance('bank')).balanceInCents, 8000); assert.equal((await balance('bank')).revision, 3);
});

test('different concurrent activation IDs cannot materialize the same overdue position twice', async () => {
  await seedDueMonths(); const first = await preparedActivation(), second = await preparedActivation('activate_other_123456');
  const result = await Promise.allSettled([
    activateSparkMonthlyOpeningFirebase(owner, { ...activation(), asOf: first.asOf, expectedRevision: first.headRevision }),
    activateSparkMonthlyOpeningFirebase(secondSession, { ...activation(), clientActionId: 'activate_other_123456', asOf: second.asOf, expectedRevision: second.headRevision }),
  ]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1); assert.equal((await balance('bank')).revision, 3);
});

test('next opening becoming due between preparation and confirmation invalidates activation', async () => {
  const boundary = Timestamp.fromMillis(Date.now() + 1500);
  await seedDueMonths({ future: true, futureAt: boundary }); await preparedActivation();
  await new Promise(resolve => setTimeout(resolve, Math.max(0, boundary.toMillis() - Date.now() + 40)));
  await denied((await rawActivation()).commit());
  assert.equal((await balance('bank')).balanceInCents, 10_000);
});

test('revoked membership invalidates prepared activation and member cannot prepare arbitrary historical corrections', async () => {
  await seedDueMonths(); const proof = await preparedActivation();
  await assert.rejects(preview(), /administrador/);
  await seedGroup({ members: {} });
  await denied(activateSparkMonthlyOpeningFirebase(owner, { ...activation(), asOf: proof.asOf, expectedRevision: proof.headRevision }));
});

test('member cannot schedule a future counted value even with a completed administrator proof', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await preview(futureMonth());
  await seedGroup({ members: { [uid]: 'member' } });
  await assert.rejects(saveSparkTemporalBalanceFirebase(owner, futureMonth()), /administrador/);
  await denied((await rawFuture()).commit());
});

test('ordinary transfer cannot invent or postpone a future deadline', async () => {
  const deadline = futureMonth().effectiveAt;
  await denied(rawBatch(owner, { fromChanges: { nextActivationAt: deadline } }).commit());
  await seedPosition('bank', { nextActivationAt: deadline });
  await denied(rawBatch(owner, { fromChanges: { nextActivationAt: past('2026-12-01T03:00:00Z') } }).commit());
  await denied(rawBatch(owner, { fromChanges: { nextActivationAt: null } }).commit());
});

test('old position without the mandatory deadline cannot bypass the new protocol', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const ref = seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkPositions', 'bank');
    const value = (await seedGetDoc(ref)).data()!; delete value.nextActivationAt; await seedSetDoc(ref, value);
  });
  await denied(rawBatch().commit());
  await assert.rejects(transferSparkFundsFirebase(owner, command()), /Posição financeira inválida/);
});

test('activation cannot consume an instant-purpose proof or a date preceding the latest known revision', async () => {
  await seedDueMonths(); await seedGroup({ members: { [uid]: 'admin' } });
  await prepareSparkHistoryProofFirebase(owner, { ...activation(), purpose: 'instant' });
  await denied((await rawActivation()).commit());
  const tooOld = { ...activation(), clientActionId: 'old_activation_123456', asOf: past('2026-05-19T12:00:00Z'), purpose: 'activation' as const };
  const proof = await prepareSparkHistoryProofFirebase(owner, tooOld);
  await assert.rejects(activateSparkMonthlyOpeningFirebase(owner, { ...tooOld, expectedRevision: proof.headRevision }), /não cobre/);
});

test('real server time crosses a scheduled boundary, blocks spending, and certified refresh activates the original opening', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  // Calendário sintético protegido somente no Emulator para ensaiar a passagem do tempo sem esperar um mês.
  const boundary = Timestamp.fromMillis(Date.now() + 5000);
  await calendar('2026-11', boundary.toDate().toISOString());
  const input = futureMonth({ effectiveAt: boundary }); await preview(input); await saveSparkTemporalBalanceFirebase(owner, input);
  await transferSparkFundsFirebase(owner, command()); assert.equal((await balance('bank')).balanceInCents, 9000);
  assert.equal((await readCurrentSparkPositionFirebase(owner, activation())).balanceInCents, 9000);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, boundary.toMillis() - Date.now() + 250)));
  // Sincronizar com request.time observado, sem alterar a posição/deadline do banco ensaiado.
  let observedServerTime = 0;
  for (let probe = 0; probe < 8 && observedServerTime < boundary.toMillis(); probe += 1) {
    const clockId = `server_clock_${probe}_123456`;
    await countSparkAccountFirebase(owner, count({ accountId: 'third', expectedRevision: probe, targetBalanceInCents: 100, clientActionId: clockId }));
    observedServerTime = (await getDoc(operationRef(owner, clockId))).data()!.createdAt.toMillis();
    if (observedServerTime < boundary.toMillis()) await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(observedServerTime >= boundary.toMillis(), 'O servidor precisa ter alcançado a fronteira antes de exigir recusa.');
  await denied(readCurrentSparkPositionFirebase(owner, activation()));
  await assert.rejects(transferSparkFundsFirebase(owner, command({ clientActionId: 'after_boundary_123456' })), /aberturas mensais vencidas/);
  await seedGroup({ members: { [uid]: 'member' } });
  const result = await refreshSparkMonthlyOpeningFirebase(secondSession, activation()); assert.equal(result.status, 'current');
  assert.equal((await balance('bank')).balanceInCents, 12_000); assert.equal((await balance('bank')).nextActivationAt, null);
  const checkpoint = (await getDoc(doc(owner, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank'))).data()!;
  assert.equal(checkpoint.operationId, input.clientActionId); assert.ok(checkpoint.effectiveAt.isEqual(boundary));
  await transferSparkFundsFirebase(owner, command({ clientActionId: 'after_refresh_123456' }));
  assert.equal((await balance('bank')).balanceInCents, 11_000);
});

const replacement = (overrides: Partial<SparkAdjustmentReplacementInput> = {}): SparkAdjustmentReplacementInput => ({
  groupId: 'proof', actorId: uid, clientActionId: 'replace_adjustment_123456', accountId: 'bank', originalOperationId: 'old_adjustment_123456',
  effectiveAt: past('2026-09-21T02:59:59.999Z'), targetBalanceInCents: 13_000, expectedRevision: 1, ...overrides,
});
async function sourceAdjustment() {
  await seedGroup({ members: { [uid]: 'admin' } });
  const source = temporal({ clientActionId: 'old_adjustment_123456' }); await preview(source); await saveSparkTemporalBalanceFirebase(owner, source);
}
async function replacementPreview(input = replacement()) {
  return prepareSparkHistoryProofFirebase(owner, { ...input, asOf: input.effectiveAt, purpose: 'instant' });
}
let projectionId = 0;
async function historicalBalance(iso: string) {
  const proof = await prepareSparkHistoryProofFirebase(owner, { groupId: 'proof', actorId: uid,
    clientActionId: `verify_history_${++projectionId}`, accountId: 'bank', asOf: past(iso), purpose: 'instant' });
  return proof.balanceInCents;
}

test('replacement atomically cancels old dated effect and records the new one with one revision and quota', async () => {
  await sourceAdjustment(); const input = replacement(); await replacementPreview(input);
  assert.equal((await replaceSparkBalanceAdjustmentFirebase(owner, input)).idempotent, false);
  assert.equal((await balance('bank')).balanceInCents, 13_000); assert.equal((await balance('bank')).revision, 2);
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  assert.equal(receipt.previousBalanceInCents, 10_000); assert.equal(receipt.differenceInCents, 3000); assert.equal(receipt.currentEffectInCents, 1000);
  assert.equal(receipt.originalDifferenceInCents, 2000); assert.ok(receipt.originalEffectiveAt.isEqual(past()));
  assert.equal((await getDoc(operationRef(owner, input.originalOperationId))).data()!.kind, 'dated_adjustment');
  assert.equal((await getDoc(doc(owner, 'financialGroups', 'proof', 'sparkAdjustmentReversals', input.originalOperationId))).data()!.reversalOperationId, input.clientActionId);
  assert.equal((await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!.count, 2);
  assert.equal(await historicalBalance('2026-09-13T12:00:00Z'), 10_000);
  assert.equal(await historicalBalance('2026-09-16T12:00:00Z'), 10_000);
  assert.equal(await historicalBalance('2026-09-22T12:00:00Z'), 13_000);
});

test('moving replacement earlier keeps both temporal effects on their own dates', async () => {
  await sourceAdjustment(); const input = replacement({ effectiveAt: past('2026-09-11T02:59:59.999Z') });
  await replacementPreview(input); await replaceSparkBalanceAdjustmentFirebase(owner, input);
  assert.equal(await historicalBalance('2026-09-09T12:00:00Z'), 10_000);
  assert.equal(await historicalBalance('2026-09-12T12:00:00Z'), 13_000);
  assert.equal(await historicalBalance('2026-09-16T12:00:00Z'), 13_000);
  assert.equal((await balance('bank')).balanceInCents, 13_000);
});

for (const target of [9000, 10_000, 13_000]) test(`same-day replacement with target ${target} excludes the old adjustment exactly once`, async () => {
  await sourceAdjustment(); const input = replacement({ effectiveAt: past(), targetBalanceInCents: target });
  await replacementPreview(input); await replaceSparkBalanceAdjustmentFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, target);
  assert.equal(await historicalBalance('2026-09-16T12:00:00Z'), target);
});

test('original covered by a later count does not get subtracted from the replacement preview again', async () => {
  await sourceAdjustment();
  const count = temporal({ clientActionId: 'middle_count_123456', kind: 'dated_reconciliation', expectedRevision: 1,
    effectiveAt: past('2026-09-18T12:00:00Z'), targetBalanceInCents: 8000 });
  await preview(count); await saveSparkTemporalBalanceFirebase(owner, count);
  const input = replacement({ expectedRevision: 2, targetBalanceInCents: 9000 });
  const proof = await replacementPreview(input); assert.equal(proof.balanceInCents, 8000);
  await replaceSparkBalanceAdjustmentFirebase(owner, input);
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  assert.equal(receipt.previousBalanceInCents, 8000); assert.equal(receipt.differenceInCents, 1000);
  assert.equal(receipt.currentEffectInCents, 1000); assert.equal((await balance('bank')).balanceInCents, 9000);
});

test('moving a current contribution before a later counted reference removes only its current old contribution', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const source = temporal({ clientActionId: 'old_adjustment_123456', effectiveAt: past('2026-09-21T02:59:59.999Z') });
  await preview(source); await saveSparkTemporalBalanceFirebase(owner, source);
  const middle = temporal({ clientActionId: 'middle_count_123456', kind: 'dated_reconciliation', expectedRevision: 1,
    effectiveAt: past('2026-09-18T12:00:00Z'), targetBalanceInCents: 8000 });
  await preview(middle); await saveSparkTemporalBalanceFirebase(owner, middle); assert.equal((await balance('bank')).balanceInCents, 10_000);
  const input = replacement({ expectedRevision: 2, effectiveAt: past(), targetBalanceInCents: 12_000 });
  await replacementPreview(input); await replaceSparkBalanceAdjustmentFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, 8000);
  assert.equal(await historicalBalance('2026-09-16T12:00:00Z'), 12_000);
  assert.equal(await historicalBalance('2026-09-22T12:00:00Z'), 8000);
});

test('both adjustment dates covered by a newer reference preserve the current counted balance', async () => {
  await sourceAdjustment();
  await countSparkAccountFirebase(owner, count({ expectedRevision: 1, targetBalanceInCents: 8000 }));
  const input = replacement({ expectedRevision: 2 }); await replacementPreview(input); await replaceSparkBalanceAdjustmentFirebase(owner, input);
  assert.equal((await getDoc(operationRef(owner, input.clientActionId))).data()!.currentEffectInCents, 0);
  assert.equal((await balance('bank')).balanceInCents, 8000);
  assert.equal(await historicalBalance('2026-09-22T12:00:00Z'), 13_000);
});

test('replacing a replacement and then reversing it keeps all earlier inverses intact', async () => {
  await sourceAdjustment(); const first = replacement({ targetBalanceInCents: 10_000 });
  await replacementPreview(first); await replaceSparkBalanceAdjustmentFirebase(owner, first);
  const next = replacement({ clientActionId: 'replace_again_123456', originalOperationId: first.clientActionId, expectedRevision: 2,
    effectiveAt: past('2026-09-23T02:59:59.999Z'), targetBalanceInCents: 15_000 });
  await replacementPreview(next); await replaceSparkBalanceAdjustmentFirebase(owner, next);
  assert.equal((await balance('bank')).balanceInCents, 15_000);
  await reverseSparkBalanceAdjustmentFirebase(owner, { groupId: 'proof', actorId: uid, clientActionId: 'undo_replacement_123456', originalOperationId: next.clientActionId });
  assert.equal((await balance('bank')).balanceInCents, 10_000);
  assert.equal(await historicalBalance('2026-09-25T12:00:00Z'), 10_000);
  assert.equal(await historicalBalance('2026-09-16T12:00:00Z'), 10_000);
});

test('replacement replay recovers the exact receipt and refuses any changed material argument', async () => {
  await sourceAdjustment(); const input = replacement(); await replacementPreview(input); await replaceSparkBalanceAdjustmentFirebase(owner, input);
  assert.equal((await replaceSparkBalanceAdjustmentFirebase(secondSession, input)).idempotent, true);
  for (const changes of [{ targetBalanceInCents: 14_000 }, { note: 'outra nota' }, { expectedRevision: 2 },
    { overdraftReason: 'outra razão' }, { effectiveAt: past('2026-09-22T02:59:59.999Z') }]) {
    await assert.rejects(replaceSparkBalanceAdjustmentFirebase(secondSession, { ...input, ...changes }), /outros argumentos/);
  }
  assert.equal((await balance('bank')).revision, 2); assert.equal((await balance('bank')).balanceInCents, 13_000);
});

async function rawReplacement(options: { operation?: Record<string, unknown>; position?: Record<string, unknown>; claim?: Record<string, unknown>;
  omit?: 'operation' | 'position' | 'claim' | 'quota'; proofChanges?: Record<string, unknown> } = {}) {
  const input = replacement(), batch = writeBatch(owner);
  const previousQuota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data();
  const windowStartInMillis = Math.floor(Date.now() / 60_000) * 60_000;
  if (options.omit !== 'operation') batch.set(operationRef(owner, input.clientActionId), { schemaVersion: 1, actorId: uid,
    kind: 'adjustment_replacement', accountId: 'bank', replacesOperationId: input.originalOperationId,
    originalEffectiveAt: past(), originalDifferenceInCents: 2000, proofId: input.clientActionId, requestedEffectiveAt: input.effectiveAt,
    expectedRevision: 1, targetBalanceInCents: 13_000, cycle: '2026-09', civilDay: 20, note: null, overdraftReason: null,
    effectiveMode: 'day_end', effectiveAt: input.effectiveAt, previousOperationId: input.originalOperationId,
    previousBalanceInCents: 10_000, differenceInCents: 3000, currentEffectInCents: 1000, createdAt: serverTimestamp(), ...options.operation });
  if (options.omit !== 'position') batch.update(positionRef(owner), { balanceInCents: 13_000, revision: 2,
    lastOperationId: input.clientActionId, updatedAt: serverTimestamp(), ...options.position });
  if (options.omit !== 'claim') batch.set(doc(owner, 'financialGroups', 'proof', 'sparkAdjustmentReversals', input.originalOperationId), {
    schemaVersion: 1, actorId: uid, reversalOperationId: input.clientActionId, createdAt: serverTimestamp(), ...options.claim });
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof',
    count: previousQuota?.windowStartInMillis === windowStartInMillis ? previousQuota.count + 1 : 1,
    windowStartInMillis, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
  if (options.proofChanges) batch.update(proofRef(input.clientActionId), { ...options.proofChanges, updatedAt: serverTimestamp() });
  return batch;
}

test('direct replacement batch has a permitted full path within Rules budget', async () => {
  await sourceAdjustment(); await replacementPreview(); await (await rawReplacement()).commit();
  assert.equal((await balance('bank')).balanceInCents, 13_000);
});

const replacementAttacks: [string, Parameters<typeof rawReplacement>[0]][] = [
  ['missing replacement position', { omit: 'position' }], ['missing replacement operation', { omit: 'operation' }],
  ['missing shared resolution claim', { omit: 'claim' }], ['missing replacement quota', { omit: 'quota' }],
  ['forged original delta with a plausible final balance', { operation: { originalDifferenceInCents: 1000, previousBalanceInCents: 11_000, differenceInCents: 2000 } }],
  ['forged original effective date', { operation: { originalEffectiveAt: past('2026-09-11T02:59:59.999Z') } }],
  ['forged replacement base', { operation: { previousBalanceInCents: 11_000 } }],
  ['forged replacement difference', { operation: { differenceInCents: 1000 } }],
  ['forged replacement current effect', { operation: { currentEffectInCents: 0 }, position: { balanceInCents: 12_000 } }],
  ['replacement proof of another action', { operation: { proofId: 'other_projection_123456' } }],
  ['replacement jumping previous link', { operation: { previousOperationId: 'bootstrap_bank' } }],
  ['replacement actor spoofing', { operation: { actorId: 'other' } }],
  ['replacement claim actor spoofing', { claim: { actorId: 'other' } }],
  ['claim pointing to another replacement', { claim: { reversalOperationId: 'other_replace_123456' } }],
  ['replacement under another original id', { operation: { replacesOperationId: 'bootstrap_bank' } }],
  ['changing bank during replacement', { operation: { accountId: 'third' } }],
  ['replacement adding an authorization field', { operation: { approved: true } }],
  ['replacement fractional target', { operation: { targetBalanceInCents: 13_000.5 } }],
  ['replacement oversized description', { operation: { note: 'x'.repeat(2001) } }],
  ['past replacement bypassing civil time', { operation: { effectiveMode: 'instant' } }],
  ['replacement changing its confirmed projection date', { operation: { requestedEffectiveAt: past() } }],
  ['replacement rewriting a completed proof at commit', { proofChanges: { balanceInCents: 9000 } }],
  ['replacement removing the mandatory activation field', { position: { nextActivationAt: deleteField() } }],
];
for (const [name, options] of replacementAttacks) test(`Rules reject ${name}`, async () => {
  await sourceAdjustment(); await replacementPreview();
  await denied((await rawReplacement(options)).commit()); assert.equal((await balance('bank')).balanceInCents, 12_000);
  assert.equal((await getDoc(operationRef(owner, replacement().clientActionId))).exists(), false);
});

test('concurrent replacement of one action commits once and reconciles the shared receipt', async () => {
  await sourceAdjustment(); const input = replacement(); await replacementPreview(input);
  const result = await Promise.all([replaceSparkBalanceAdjustmentFirebase(owner, input), replaceSparkBalanceAdjustmentFirebase(secondSession, input)]);
  assert.deepEqual(result.map(item => item.idempotent).sort(), [false, true]); assert.equal((await balance('bank')).revision, 2);
});

test('replacement and reversal share one claim so only one can resolve the original', async () => {
  await sourceAdjustment(); const input = replacement(); await replacementPreview(input);
  const result = await Promise.allSettled([replaceSparkBalanceAdjustmentFirebase(owner, input),
    reverseSparkBalanceAdjustmentFirebase(secondSession, { groupId: 'proof', actorId: uid,
      clientActionId: 'competing_inverse_123456', originalOperationId: input.originalOperationId })]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1);
  const claim = (await getDoc(doc(owner, 'financialGroups', 'proof', 'sparkAdjustmentReversals', input.originalOperationId))).data()!;
  assert.equal((await balance('bank')).balanceInCents, claim.reversalOperationId === input.clientActionId ? 13_000 : 10_000);
  assert.equal((await balance('bank')).revision, 2);
});

test('two different replacement IDs cannot replace the same original twice', async () => {
  await sourceAdjustment(); const first = replacement(), second = replacement({ clientActionId: 'competing_replace_123456', targetBalanceInCents: 9000 });
  await replacementPreview(first); await replacementPreview(second);
  const result = await Promise.allSettled([replaceSparkBalanceAdjustmentFirebase(owner, first), replaceSparkBalanceAdjustmentFirebase(secondSession, second)]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1); assert.equal((await balance('bank')).revision, 2);
});

test('replacing a resolved original, changing bank or replacing an inverse fails explicitly', async () => {
  await sourceAdjustment(); const input = replacement(); await replacementPreview(input); await replaceSparkBalanceAdjustmentFirebase(owner, input);
  await assert.rejects(replaceSparkBalanceAdjustmentFirebase(owner, { ...input, clientActionId: 'reuse_original_123456' }), /já foi substituído/);
  await assert.rejects(replaceSparkBalanceAdjustmentFirebase(owner, { ...input, accountId: 'third' }), /mesmo banco/);
  await reverseSparkBalanceAdjustmentFirebase(owner, { groupId: 'proof', actorId: uid, clientActionId: 'inverse_new_123456', originalOperationId: input.clientActionId });
  await assert.rejects(replaceSparkBalanceAdjustmentFirebase(owner, { ...input, originalOperationId: 'inverse_new_123456' }), /não um estorno/);
});

test('new movement, revoked role or overdue opening invalidates replacement without partial effects', async () => {
  await sourceAdjustment(); await replacementPreview(); await transferSparkFundsFirebase(owner, command());
  await assert.rejects(replaceSparkBalanceAdjustmentFirebase(owner, replacement()), /desatualizada/);
  await seedGroup({ members: { [uid]: 'member' } });
  await assert.rejects(replaceSparkBalanceAdjustmentFirebase(owner, replacement()), /administrador/);
  await denied((await rawReplacement()).commit());
  await seedGroup({ members: { [uid]: 'admin' } });
  await seedPosition('bank', { nextActivationAt: Timestamp.fromMillis(Date.now() - 1000) });
  await assert.rejects(replaceSparkBalanceAdjustmentFirebase(owner, replacement()), /aberturas mensais vencidas/);
  assert.equal((await balance('bank')).balanceInCents, 11_000);
});

test('replacement dated today preserves requested preview and uses server commit for the new component', async () => {
  await sourceAdjustment(); const input = replacement({ effectiveAt: Timestamp.now() }); await replacementPreview(input);
  await replaceSparkBalanceAdjustmentFirebase(owner, input);
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  assert.ok(receipt.effectiveAt.isEqual(receipt.createdAt)); assert.ok(receipt.requestedEffectiveAt.isEqual(input.effectiveAt));
  assert.ok(receipt.originalEffectiveAt.isEqual(past())); assert.equal(receipt.effectiveMode, 'commit');
  assert.equal((await replaceSparkBalanceAdjustmentFirebase(secondSession, input)).idempotent, true);
});

test('replacement neither neutralizes before a future opening nor changes its activation deadline', async () => {
  await sourceAdjustment(); const future = futureMonth({ clientActionId: 'after_original_month_123456', expectedRevision: 1 });
  await preview(future); await saveSparkTemporalBalanceFirebase(owner, future);
  const input = replacement({ expectedRevision: 2 }); await replacementPreview(input); await replaceSparkBalanceAdjustmentFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, 13_000);
  assert.ok((await balance('bank')).nextActivationAt.isEqual(future.effectiveAt));
  const projection = await preview({ ...future, clientActionId: 'project_future_replaced_123456' });
  assert.equal(projection.balanceInCents, 12_000);
});

for (const inclusive of [false, true]) test(`replacement excludes only the original component eligible at a ${inclusive ? 'monthly inclusive' : 'exact exclusive'} boundary`, async () => {
  await sourceAdjustment();
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore(), id = 'same_instant_count_123456';
    await seedSetDoc(seedDoc(firestore, 'financialGroups', 'proof', 'sparkOperations', id), {
      kind: 'imported_checkpoint', accountId: 'bank', expectedRevision: 1, previousOperationId: replacement().originalOperationId,
      effectiveAt: past().toDate(), createdAt: past().toDate(), targetBalanceInCents: 8000, includesBoundary: inclusive, differenceInCents: 0 });
    await seedUpdateDoc(seedDoc(firestore, 'financialGroups', 'proof', 'sparkPositions', 'bank'), {
      balanceInCents: inclusive ? 10_000 : 8000, revision: 2, lastOperationId: id });
    await seedSetDoc(seedDoc(firestore, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank'), {
      operationId: id, effectiveAt: past().toDate(), countedBalanceInCents: 8000, includesBoundary: inclusive });
  });
  const input = replacement({ expectedRevision: 2, targetBalanceInCents: 9000 });
  const proof = await replacementPreview(input); assert.equal(proof.balanceInCents, inclusive ? 10_000 : 8000);
  await replaceSparkBalanceAdjustmentFirebase(owner, input);
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  assert.equal(receipt.previousBalanceInCents, 8000); assert.equal(receipt.differenceInCents, 1000);
  assert.equal(receipt.currentEffectInCents, inclusive ? -1000 : 1000);
  assert.equal((await balance('bank')).balanceInCents, 9000);
});

test('replacement between valid monetary extremes accepts a derived effect twice the individual delta limit', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await seedPosition('bank', { balanceInCents: 0 });
  await environment.withSecurityRulesDisabled(async context => {
    await seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkOperations', 'bootstrap_bank'), { openingBalanceInCents: 0 });
  });
  const source = temporal({ clientActionId: 'old_adjustment_123456', targetBalanceInCents: -1_000_000_000_000, overdraftReason: 'limite conferido' });
  await preview(source); await saveSparkTemporalBalanceFirebase(owner, source);
  const input = replacement({ targetBalanceInCents: 1_000_000_000_000 }); await replacementPreview(input);
  await replaceSparkBalanceAdjustmentFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, 1_000_000_000_000);
  assert.equal((await getDoc(operationRef(owner, input.clientActionId))).data()!.currentEffectInCents, 2_000_000_000_000);
  assert.equal(await historicalBalance('2026-09-16T12:00:00Z'), 0);
  assert.equal(await historicalBalance('2026-09-22T12:00:00Z'), 1_000_000_000_000);
});

test('negative replacement target requires a persisted justification and preserves it on replay', async () => {
  await sourceAdjustment(); const input = replacement({ targetBalanceInCents: -1000 }); await replacementPreview(input);
  await assert.rejects(replaceSparkBalanceAdjustmentFirebase(owner, input), /justificativa/);
  await denied((await rawReplacement({ operation: { targetBalanceInCents: -1000, differenceInCents: -11_000, currentEffectInCents: -13_000 },
    position: { balanceInCents: -1000 } })).commit());
  const justified = { ...input, overdraftReason: ' saldo conferido em cheque especial ' };
  await replaceSparkBalanceAdjustmentFirebase(owner, justified);
  assert.equal((await balance('bank')).balanceInCents, -1000);
  assert.equal((await getDoc(operationRef(owner, input.clientActionId))).data()!.overdraftReason, justified.overdraftReason.trim());
});

test('replacement source certification rejects a different author even when the requester remains administrator', async () => {
  await sourceAdjustment();
  await environment.withSecurityRulesDisabled(async context => {
    await seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkOperations', replacement().originalOperationId), { actorId: 'different_author' });
  });
  await replacementPreview();
  await assert.rejects(replaceSparkBalanceAdjustmentFirebase(owner, replacement()), /autor administrador/);
  await denied((await rawReplacement()).commit());
});

test('Rules enforce stale replacement head independently of the shared client precheck', async () => {
  await sourceAdjustment(); await replacementPreview(); await transferSparkFundsFirebase(owner, command());
  const batch = await rawReplacement({ operation: { expectedRevision: 2, previousOperationId: 'action_123456' },
    position: { revision: 3, balanceInCents: 12_000 } });
  await denied(batch.commit()); assert.equal((await balance('bank')).balanceInCents, 11_000);
});

test('replacement cannot advance a proof by omitting its old inverse from the second pass', async () => {
  await sourceAdjustment(); const input = replacement(); await replacementPreview(input); await replaceSparkBalanceAdjustmentFirebase(owner, input);
  const inspect = { groupId: 'proof', actorId: uid, clientActionId: 'inspect_compound_123456', accountId: 'bank',
    asOf: past('2026-09-16T12:00:00Z'), purpose: 'instant' as const };
  let proof = await prepareSparkHistoryProofFirebase(owner, inspect, 4);
  assert.equal(proof.phase, 'movements'); assert.equal(proof.nextOperationId, input.clientActionId);
  proof = await renewSparkHistoryBudgetFirebase(owner, inspect, proof.leaseRevision);
  const batch = writeBatch(owner); batch.set(proofRef(inspect.clientActionId), { ...await nextPreparationPage(proof),
    balanceInCents: proof.balanceInCents, tailDeltaInCents: 3000, updatedAt: serverTimestamp() });
  await denied(batch.commit());
  proof = await prepareSparkHistoryProofFirebase(secondSession, inspect); assert.equal(proof.balanceInCents, 10_000);
});

test('counterfactual replacement base may exceed a stored balance limit while all individual deltas and final balances remain valid', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await environment.withSecurityRulesDisabled(async context => {
    for (const accountId of ['bank', 'cash', 'third']) {
      await seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkPositions', accountId), { balanceInCents: 0 });
      await seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkOperations', `bootstrap_${accountId}`), { openingBalanceInCents: 0 });
    }
  });
  const source = temporal({ clientActionId: 'old_adjustment_123456', targetBalanceInCents: 1_000_000_000_000 });
  await preview(source); await saveSparkTemporalBalanceFirebase(owner, source);
  await transferSparkFundsFirebase(owner, command({ amountInCents: 1_000_000_000_000 }));
  await transferSparkFundsFirebase(owner, command({ clientActionId: 'second_outflow_123456', toAccountId: 'third',
    amountInCents: 1_000_000_000_000, overdraftReason: 'saldo negativo conferido' }));
  const input = replacement({ effectiveAt: Timestamp.now(), expectedRevision: 3, targetBalanceInCents: -1_000_000_000_000,
    overdraftReason: 'saldo negativo conferido' });
  await replacementPreview(input); await replaceSparkBalanceAdjustmentFirebase(owner, input);
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  assert.equal(receipt.previousBalanceInCents, -2_000_000_000_000); assert.equal(receipt.differenceInCents, 1_000_000_000_000);
  assert.equal(receipt.currentEffectInCents, 0); assert.equal((await balance('bank')).balanceInCents, -1_000_000_000_000);
});

test('current adjustment without an explicit effectiveAt can be moved to the past and then reversed safely', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count({ clientActionId: 'old_adjustment_123456', kind: 'balance_adjustment' }));
  const input = replacement(); await replacementPreview(input); await replaceSparkBalanceAdjustmentFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, 13_000);
  assert.equal(await historicalBalance('2026-09-22T12:00:00Z'), 13_000);
  await reverseSparkBalanceAdjustmentFirebase(owner, { groupId: 'proof', actorId: uid,
    clientActionId: 'undo_moved_current_123456', originalOperationId: input.clientActionId });
  assert.equal((await balance('bank')).balanceInCents, 10_000);
});

test('historical reconciliation after replacement uses the full signed tail of both dated components', async () => {
  await sourceAdjustment(); const input = replacement(); await replacementPreview(input); await replaceSparkBalanceAdjustmentFirebase(owner, input);
  const count = temporal({ clientActionId: 'count_before_replaced_123456', kind: 'dated_reconciliation',
    effectiveAt: past('2026-09-13T12:00:00Z'), expectedRevision: 2, targetBalanceInCents: 8000 });
  const proof = await preview(count); assert.equal(proof.balanceInCents, 10_000); assert.equal(proof.tailDeltaInCents, 3000);
  await saveSparkTemporalBalanceFirebase(owner, count);
  assert.equal((await balance('bank')).balanceInCents, 11_000);
  assert.equal(await historicalBalance('2026-09-16T12:00:00Z'), 8000);
  assert.equal(await historicalBalance('2026-09-22T12:00:00Z'), 11_000);
});


// [[Protocolo Financeiro Spark]]: limites de preparação são certificados nas Rules, não no aparelho.
function preparationInput(id = 'budget_proof_123456') {
  return { groupId: 'proof', actorId: uid, clientActionId: id, accountId: 'bank', asOf: past(), purpose: 'instant' as const };
}
const utcBudgetDay = () => Math.floor(Date.now() / SPARK_PREPARATION_DAY_MS) * SPARK_PREPARATION_DAY_MS;
const preparationUserRef = () => doc(owner, 'sparkPreparationUserQuotas', uid);
const preparationProjectRef = () => doc(owner, 'sparkPreparationQuotas', 'project');
async function seedPreparationQuota(scope: 'user' | 'project', changes: Record<string, unknown>) {
  await environment.withSecurityRulesDisabled(async context => {
    await seedSetDoc(seedDoc(context.firestore(), scope === 'user' ? 'sparkPreparationUserQuotas' : 'sparkPreparationQuotas', scope === 'user' ? uid : 'project'), {
      schemaVersion: 1, windowStartInMillis: utcBudgetDay(), readUnits: 0, writeUnits: 0, updatedAt: new Date(),
      ...(scope === 'user' ? { groupId: 'proof', proofId: 'previous_budget_123456', reservedPages: 1, leaseRevision: 1 } : {}), ...changes,
    });
  });
}
async function seedHistory(nodes: number, compound = false) {
  await seedGroup({ members: { [uid]: 'admin' } });
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore(); let batch = seedWriteBatch(firestore); let writes = 0;
    for (let revision = 1; revision < nodes; revision += 1) {
      batch.set(seedDoc(firestore, 'financialGroups', 'proof', 'sparkOperations', `history_${revision}`), {
        schemaVersion: 1, actorId: uid, accountId: 'bank', kind: compound ? 'adjustment_replacement' : 'imported_movement',
        expectedRevision: revision - 1, previousOperationId: revision === 1 ? 'bootstrap_bank' : `history_${revision - 1}`,
        differenceInCents: compound ? 3 : 1, effectiveAt: new Date(compound ? '2026-09-20T12:00:00Z' : '2026-09-02T12:00:00Z'),
        ...(compound ? { originalEffectiveAt: new Date('2026-09-10T12:00:00Z'), originalDifferenceInCents: 2 } : {}),
        createdAt: new Date('2026-09-02T12:00:00Z'),
      });
      if (++writes === 400) { await batch.commit(); batch = seedWriteBatch(firestore); writes = 0; }
    }
    if (writes) await batch.commit();
    await seedUpdateDoc(seedDoc(firestore, 'financialGroups', 'proof', 'sparkPositions', 'bank'), {
      revision: nodes - 1, lastOperationId: nodes === 1 ? 'bootstrap_bank' : `history_${nodes - 1}`,
      balanceInCents: 10_000 + nodes - 1, updatedAt: new Date('2026-09-02T12:00:00Z'),
    });
  });
}
async function nextPreparationPage(proof: SparkHistoryProof) {
  let next = proof;
  if (proof.cursorRevision < 0) next = advanceSparkHistory(proof);
  else for (let i = 0; i < 1 && next.cursorRevision >= 0; i += 1) {
    next = advanceSparkHistory(next, (await getDoc(operationRef(owner, next.nextOperationId!))).data());
  }
  return { ...next, workRevision: proof.workRevision + 1, updatedAt: serverTimestamp() };
}
async function rawPreparationGrant(proof: SparkHistoryProof, options: {
  omit?: 'proof' | 'user' | 'project'; proof?: Record<string, unknown>; user?: Record<string, unknown>; project?: Record<string, unknown>;
} = {}) {
  const user = (await getDoc(preparationUserRef())).data()!;
  const project = (await getDoc(preparationProjectRef())).data()!;
  const batch = writeBatch(owner); const leaseRevision = proof.leaseRevision + 1;
  const totals = (before: typeof user) => ({ ...before, readUnits: before.readUnits + 50, writeUnits: before.writeUnits + 4, updatedAt: serverTimestamp() });
  if (options.omit !== 'proof') batch.update(proofRef('budget_proof_123456'), {
    leaseRevision, leaseWindowStartInMillis: utcBudgetDay(), leaseEndWorkRevision: proof.workRevision + 1, updatedAt: serverTimestamp(), ...options.proof,
  });
  if (options.omit !== 'user') batch.set(preparationUserRef(), { ...totals(user), leaseRevision, reservedPages: 1, ...options.user });
  if (options.omit !== 'project') batch.set(preparationProjectRef(), { ...totals(project), ...options.project });
  return batch;
}
async function exhaustedLease() {
  await seedGroup({ members: { [uid]: 'admin' } });
  await startSparkHistoryProofFirebase(owner, preparationInput(), undefined, 1);
  return stepSparkHistoryProofFirebase(owner, preparationInput(), 0);
}

test('preparation reserves all three documents atomically and replays do not charge or advance', async () => {
  await seedHistory(3); const input = preparationInput(); const metrics = createSparkPreparationMetrics();
  const start = await startSparkHistoryProofFirebase(owner, input, { metrics }, 1);
  assert.equal(start.leaseEndWorkRevision, 1); assert.equal(metrics.confirmedWrites, 3);
  const quota = (await getDoc(preparationUserRef())).data()!;
  assert.equal(quota.readUnits, 50); assert.equal(quota.writeUnits, 4);
  await startSparkHistoryProofFirebase(secondSession, input, { metrics }, 1);
  const page = await stepSparkHistoryProofFirebase(owner, input, 0, { metrics });
  const replay = await stepSparkHistoryProofFirebase(secondSession, input, 0, { metrics });
  assert.equal(page.workRevision, 1); assert.equal(replay.workRevision, 1); assert.equal(metrics.confirmedWrites, 4);
  const grant = await renewSparkHistoryBudgetFirebase(owner, input, 1, { metrics }, 1);
  await renewSparkHistoryBudgetFirebase(secondSession, input, 1, { metrics }, 1);
  assert.equal(grant.leaseRevision, 2); assert.equal(metrics.confirmedWrites, 7);
  assert.equal((await getDoc(preparationUserRef())).data()!.writeUnits, 8);
  assert.equal((await getDoc(preparationProjectRef())).data()!.writeUnits, 8);
  assert.deepEqual(Object.keys((await getDoc(preparationProjectRef())).data()!).sort(),
    ['readUnits', 'schemaVersion', 'updatedAt', 'windowStartInMillis', 'writeUnits']);
});

test('two sessions requesting the same work revision commit exactly one page', async () => {
  await seedHistory(3); const input = preparationInput(); await startSparkHistoryProofFirebase(owner, input);
  const results = await Promise.all([stepSparkHistoryProofFirebase(owner, input, 0), stepSparkHistoryProofFirebase(secondSession, input, 0)]);
  assert.ok(results.every(proof => proof.workRevision === 1));
  assert.equal((await getDoc(proofRef(input.clientActionId))).data()!.workRevision, 1);
});

for (const [label, options] of [
  ['missing user charge', { omit: 'user' }], ['missing project charge', { omit: 'project' }], ['quota without proof', { omit: 'proof' }],
  ['user refund', { user: { readUnits: 0 } }], ['project refund', { project: { writeUnits: 0 } }],
  ['forged pages', { user: { reservedPages: 64 } }], ['excess lease', { proof: { leaseEndWorkRevision: 1000 } }],
  ['wrong group', { user: { groupId: 'another' } }], ['wrong proof', { user: { proofId: 'another_proof_123456' } }],
  ['wrong revision', { user: { leaseRevision: 100 } }], ['work advanced during grant', { proof: { workRevision: 2 } }],
  ['past quota day', { user: { windowStartInMillis: 0 } }], ['future quota day', { project: { windowStartInMillis: utcBudgetDay() + SPARK_PREPARATION_DAY_MS } }],
  ['hidden project UID', { project: { actorId: 'exposed' } }], ['extra private field', { user: { unlimited: true } }],
] as const) test(`preparation Rules reject ${label} without partial charge`, async () => {
  const proof = await exhaustedLease(); const quota = (await getDoc(preparationUserRef())).data()!;
  await denied((await rawPreparationGrant(proof, options)).commit());
  assert.deepEqual((await getDoc(preparationUserRef())).data(), quota);
  assert.equal((await getDoc(proofRef(preparationInput().clientActionId))).data()!.leaseRevision, 1);
});

test('unused lease cannot be renewed, refunded, deleted or spent without a new reservation', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = preparationInput();
  const proof = await startSparkHistoryProofFirebase(owner, input, undefined, 1);
  await denied((await rawPreparationGrant(proof)).commit());
  const page = await stepSparkHistoryProofFirebase(owner, input, 0);
  const next = await nextPreparationPage(page); const forged = writeBatch(owner); forged.set(proofRef(input.clientActionId), next);
  await denied(forged.commit());
  await assert.rejects(stepSparkHistoryProofFirebase(owner, input, 1), (e: unknown) => e instanceof SparkPreparationError && e.reason === 'lease-required');
  const remove = writeBatch(owner); remove.delete(preparationUserRef()); await denied(remove.commit());
  await denied(getDoc(doc(outsider, 'sparkPreparationUserQuotas', uid)));
  await denied(getDocs(collection(owner, 'sparkPreparationQuotas')));
});

for (const scope of ['user', 'project'] as const) test(`${scope} preparation exhaustion preserves progress and exposes a specific error`, async () => {
  const proof = await exhaustedLease(); await seedPreparationQuota(scope, { readUnits: scope === 'user' ? 22_000 : 24_000 });
  await assert.rejects(renewSparkHistoryBudgetFirebase(owner, preparationInput(), 1),
    (e: unknown) => e instanceof SparkPreparationError && e.reason === 'budget-exhausted');
  assert.equal((await getDoc(proofRef(preparationInput().clientActionId))).data()!.workRevision, proof.workRevision);
});

test('expired reservation is rejected by Rules and renewal resets only the daily quotas, retaining progress', async () => {
  const proof = await exhaustedLease(); const previousDay = utcBudgetDay() - SPARK_PREPARATION_DAY_MS;
  await environment.withSecurityRulesDisabled(async context => {
    await seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkHistoryProofs', preparationInput().clientActionId),
      { leaseWindowStartInMillis: previousDay, leaseEndWorkRevision: 4 });
  });
  const expiredProof = (await getDoc(proofRef(preparationInput().clientActionId))).data() as SparkHistoryProof;
  const raw = writeBatch(owner); raw.set(proofRef(preparationInput().clientActionId), await nextPreparationPage(expiredProof)); await denied(raw.commit());
  await seedPreparationQuota('user', { windowStartInMillis: previousDay, readUnits: 22_000, writeUnits: 6000 });
  await seedPreparationQuota('project', { windowStartInMillis: previousDay, readUnits: 24_000, writeUnits: 8000 });
  const renewed = await renewSparkHistoryBudgetFirebase(secondSession, preparationInput(), 1);
  assert.equal(renewed.workRevision, proof.workRevision); assert.equal(renewed.cursorRevision, proof.cursorRevision);
  assert.equal(renewed.leaseRevision, 2); assert.equal((await getDoc(preparationUserRef())).data()!.readUnits, 70);
  const done = await prepareSparkHistoryProofFirebase(owner, preparationInput()); assert.equal(done.phase, 'done');
});

test('a changed position stops preparation before reading another event or charging another lease', async () => {
  await seedHistory(3); const input = preparationInput(); await startSparkHistoryProofFirebase(owner, input);
  const quota = (await getDoc(preparationUserRef())).data(); await transferSparkFundsFirebase(owner, command());
  const metrics = createSparkPreparationMetrics();
  await assert.rejects(stepSparkHistoryProofFirebase(owner, input, 0, { metrics }),
    (e: unknown) => e instanceof SparkPreparationError && e.reason === 'stale');
  assert.equal(metrics.explicitReads, 3); assert.equal(metrics.confirmedWrites, 0);
  assert.deepEqual((await getDoc(preparationUserRef())).data(), quota);
});

test('pausing preserves durable progress and resuming a completed proof performs no writes', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = preparationInput(); const signal = new AbortController(); signal.abort();
  const metrics = createSparkPreparationMetrics();
  await assert.rejects(prepareSparkHistoryProofFirebase(owner, input, 100, { signal: signal.signal, metrics }),
    (e: unknown) => e instanceof SparkPreparationError && e.reason === 'paused');
  assert.equal(metrics.explicitReads, 0); assert.equal(metrics.confirmedWrites, 0);
  const partial = await prepareSparkHistoryProofFirebase(owner, input, 1);
  await assert.rejects(prepareSparkHistoryProofFirebase(secondSession, input, 100, { signal: signal.signal }), /pausada/);
  assert.equal((await getDoc(proofRef(input.clientActionId))).data()!.workRevision, partial.workRevision);
  const done = await prepareSparkHistoryProofFirebase(secondSession, input); assert.equal(done.phase, 'done');
  assert.equal(getSparkPreparationProgress(done).remainingPages, 0);
  await prepareSparkHistoryProofFirebase(owner, input, 100, { metrics }); assert.equal(metrics.confirmedWrites, 0);
  await assert.rejects(refreshSparkMonthlyOpeningFirebase(owner, input, 100, { signal: signal.signal }), /pausada/);
});

for (const [field, value] of [['cursorRevision', -1], ['nextOperationId', 'bootstrap_bank'], ['baselineBalanceInCents', 0],
  ['balanceInCents', 9999], ['tailDeltaInCents', 6], ['workRevision', 6], ['balanceInCents', Number.MAX_SAFE_INTEGER + 1],
  ['extra', true]] as const) {
  test(`preparation rejects forged page ${field} ${value}`, async () => {
    await seedHistory(3, true); const input = preparationInput();
    let proof = await prepareSparkHistoryProofFirebase(owner, input, 4); assert.equal(proof.phase, 'movements');
    proof = await renewSparkHistoryBudgetFirebase(owner, input, proof.leaseRevision);
    const next = await nextPreparationPage(proof);
    const batch = writeBatch(owner); batch.set(proofRef(input.clientActionId), { ...next, [field]: value }); await denied(batch.commit());
    const done = await prepareSparkHistoryProofFirebase(secondSession, input);
    assert.equal(done.balanceInCents, 9996); assert.equal(done.tailDeltaInCents, 6);
  });
}

test('direct reservation and page batches succeed with exact charges and certified arithmetic', async () => {
  const proof = await exhaustedLease(); await (await rawPreparationGrant(proof)).commit();
  const reserved = (await getDoc(proofRef(preparationInput().clientActionId))).data() as SparkHistoryProof;
  const page = writeBatch(owner); page.set(proofRef(preparationInput().clientActionId), await nextPreparationPage(reserved)); await page.commit();
  assert.equal((await getDoc(proofRef(preparationInput().clientActionId))).data()!.workRevision, 2);
  assert.equal((await getDoc(preparationProjectRef())).data()!.writeUnits, 8);
});

test('direct compound page succeeds with both dated terms and a live reservation', async () => {
  await seedHistory(3, true); const input = preparationInput();
  let proof = await prepareSparkHistoryProofFirebase(owner, input, 4);
  proof = await renewSparkHistoryBudgetFirebase(owner, input, proof.leaseRevision);
  const page = writeBatch(owner); page.set(proofRef(input.clientActionId), await nextPreparationPage(proof)); await page.commit();
  const committed = (await getDoc(proofRef(input.clientActionId))).data()!;
  assert.equal(committed.workRevision, 5); assert.equal(committed.balanceInCents, 9998); assert.equal(committed.tailDeltaInCents, 3);
});

test('another proof cannot reuse a previous reservation without charging both counters', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = preparationInput();
  await startSparkHistoryProofFirebase(owner, input, undefined, 1);
  const data = (await getDoc(proofRef(input.clientActionId))).data()!;
  const batch = writeBatch(owner); batch.set(proofRef('another_budget_123456'), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await denied(batch.commit()); assert.equal((await getDoc(preparationUserRef())).data()!.readUnits, 50);
});

for (const [scope, field, limit] of [['user', 'readUnits', 22000], ['user', 'writeUnits', 6000],
  ['project', 'readUnits', 24000], ['project', 'writeUnits', 8000]] as const) {
  test(`Rules enforce daily ${scope} ${field} independently of the client precheck`, async () => {
    const proof = await exhaustedLease(); await seedPreparationQuota(scope, { [field]: limit });
    await denied((await rawPreparationGrant(proof)).commit());
    assert.equal((await getDoc(proofRef(preparationInput().clientActionId))).data()!.leaseRevision, 1);
  });
}

test('distinct users consume a shared project reservation while keeping private counters isolated', async () => {
  const otherUid = getAuth(outsider.app).currentUser!.uid;
  await seedGroup({ members: { [uid]: 'admin', [otherUid]: 'admin' } });
  await startSparkHistoryProofFirebase(owner, preparationInput(), undefined, 1);
  await startSparkHistoryProofFirebase(outsider, { ...preparationInput('other_user_budget_123456'), actorId: otherUid }, undefined, 1);
  assert.equal((await getDoc(preparationProjectRef())).data()!.readUnits, 100);
  assert.equal((await getDoc(preparationUserRef())).data()!.readUnits, 50);
  assert.equal((await getDoc(doc(outsider, 'sparkPreparationUserQuotas', otherUid))).data()!.readUnits, 50);
  await denied(getDoc(doc(owner, 'sparkPreparationUserQuotas', otherUid)));
});

test('one user consumes the same private and project counters across different groups', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await seedSetDoc(seedDoc(db, 'financialGroups', 'second'), { status: 'active', sparkProtocol: SPARK_TRANSFER_PROOF_PROTOCOL, members: { [uid]: 'admin' } });
    await seedSetDoc(seedDoc(db, 'financialGroups', 'second', 'sparkPositions', 'bank'),
      (await seedGetDoc(seedDoc(db, 'financialGroups', 'proof', 'sparkPositions', 'bank'))).data()!);
    await seedSetDoc(seedDoc(db, 'financialGroups', 'second', 'sparkOperations', 'bootstrap_bank'),
      (await seedGetDoc(seedDoc(db, 'financialGroups', 'proof', 'sparkOperations', 'bootstrap_bank'))).data()!);
  });
  await startSparkHistoryProofFirebase(owner, preparationInput(), undefined, 1);
  await startSparkHistoryProofFirebase(owner, { ...preparationInput(), groupId: 'second' }, undefined, 1);
  assert.equal((await getDoc(preparationUserRef())).data()!.readUnits, 100);
  assert.equal((await getDoc(preparationProjectRef())).data()!.readUnits, 100);
});

test('pause during a page read prevents its write and does not refund the already reserved lease', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = preparationInput();
  await startSparkHistoryProofFirebase(owner, input); const controller = new AbortController(); const metrics = createSparkPreparationMetrics();
  let reads = 0;
  Object.defineProperty(metrics, 'explicitReads', { get: () => reads, set: value => { reads = value; if (reads === 4) controller.abort(); } });
  await assert.rejects(stepSparkHistoryProofFirebase(owner, input, 0, { metrics, signal: controller.signal }), /pausada/);
  assert.equal(metrics.confirmedWrites, 0); assert.equal((await getDoc(proofRef(input.clientActionId))).data()!.workRevision, 0);
  assert.equal((await getDoc(preparationUserRef())).data()!.writeUnits, 7);
  assert.equal((await prepareSparkHistoryProofFirebase(secondSession, input)).phase, 'done');
});

test('preparation rejects future revisions and oversized calls without consuming work', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = preparationInput();
  await startSparkHistoryProofFirebase(owner, input);
  await assert.rejects(stepSparkHistoryProofFirebase(owner, input, 1), (e: unknown) => e instanceof SparkPreparationError && e.reason === 'revision');
  await assert.rejects(renewSparkHistoryBudgetFirebase(owner, input, 2), (e: unknown) => e instanceof SparkPreparationError && e.reason === 'revision');
  await assert.rejects(prepareSparkHistoryProofFirebase(owner, input, 101), /Limite de páginas/);
  assert.equal((await getDoc(proofRef(input.clientActionId))).data()!.workRevision, 0);
});

for (const nodes of [1, 129, 1000]) test(`preparation benchmark certifies ${nodes} nodes under real Auth and Rules with Functions off`, async () => {
  await seedHistory(nodes); const input = preparationInput(); const metrics = createSparkPreparationMetrics(); const began = performance.now();
  let proof = await prepareSparkHistoryProofFirebase(owner, input, 100, { metrics });
  while (proof.phase !== 'done') proof = await prepareSparkHistoryProofFirebase(secondSession, input, 100, { metrics });
  const expected = estimateSparkPreparation(nodes - 1); const quota = (await getDoc(preparationUserRef())).data()!;
  assert.equal(proof.balanceInCents, 10_000 + nodes - 1); assert.equal(proof.workRevision, expected.pages);
  assert.equal(metrics.confirmedWrites, expected.writes); assert.equal(metrics.grants, expected.grants);
  assert.equal(quota.readUnits, expected.readUnits); assert.equal(quota.writeUnits, expected.writes);
  console.log('SPARK_PREPARATION_BENCHMARK', JSON.stringify({ nodes, durationMs: Math.round(performance.now() - began), ...metrics,
    reservedReadUnits: quota.readUnits, reservedWriteUnits: quota.writeUnits, oldSingleNodeWrites: 2 * nodes + 3 }));
}, { timeout: 180_000 });


test('segments certify paired leaves and parents with atomic admission and accelerate both passes', async () => {
  await seedHistory(8); const input = preparationInput();
  const metrics = createSparkPreparationMetrics();
  const warm = await warmSparkHistorySegmentsFirebase(owner, input, { metrics });
  assert.equal(warm.done, true); assert.equal(warm.created, 4); assert.equal(metrics.confirmedWrites, 12);
  const parent = (await getDoc(sparkSegmentRef(owner, 'proof', 'bank', '4_7'))).data()!;
  assert.equal(parent.deltaInCents, 4); assert.equal(parent.absoluteDeltaInCents, 4);
  const accelerated = await prepareSparkHistoryProofFirebase(owner, input, 100, { useSegments: true, metrics });
  assert.equal(accelerated.balanceInCents, 10007); assert.equal(accelerated.phase, 'done');
  assert.ok(accelerated.workRevision < 18); assert.ok(metrics.reusedNodes > 0);
  const again = await warmSparkHistorySegmentsFirebase(secondSession, input); assert.equal(again.created, 0);
});

test('segments certify two compound nodes without collapsing their dates', async () => {
  await seedHistory(4, true); const input = preparationInput();
  await warmSparkHistorySegmentsFirebase(owner, input);
  const segment = (await getDoc(sparkSegmentRef(owner, 'proof', 'bank', '2_3'))).data()!;
  assert.equal(segment.deltaInCents, 2); assert.equal(segment.absoluteDeltaInCents, 10);
  assert.ok(segment.minAt.isEqual(past('2026-09-10T12:00:00Z'))); assert.ok(segment.maxAt.isEqual(past('2026-09-20T12:00:00Z')));
  const metrics = createSparkPreparationMetrics();
  const result = await prepareSparkHistoryProofFirebase(owner, input, 100, { useSegments: true, metrics });
  assert.equal(result.balanceInCents, 9994); assert.equal(result.tailDeltaInCents, 9); assert.equal(result.phase, 'done');
  assert.equal(metrics.segmentPages, 1); // A janela mista permite somente o salto de checkpoints.
});


const segmentInput = (count = 2, last = 3) => ({ groupId: 'proof', actorId: uid, accountId: 'bank', nodeCount: count,
  lastRevision: last, olderOperationId: `history_${last - 1}`, newerOperationId: `history_${last}` });
function segmentData(count = 2, last = 3) {
  return { schemaVersion: 1, actorId: uid, accountId: 'bank', nodeCount: count, firstRevision: last - count + 1, lastRevision: last,
    lastOperationId: `history_${last}`, previousOperationId: `history_${last - count}`,
    leftId: count === 2 ? `history_${last - 1}` : sparkSegmentId(count / 2, last - count / 2),
    rightId: count === 2 ? `history_${last}` : sparkSegmentId(count / 2, last),
    minAt: past('2026-09-02T12:00:00Z'), maxAt: past('2026-09-02T12:00:00Z'),
    deltaInCents: count, absoluteDeltaInCents: count, createdAt: serverTimestamp() };
}
async function rawSegment(options: { data?: Record<string, unknown>; user?: Record<string, unknown>; project?: Record<string, unknown>;
  omit?: 'user' | 'project' | 'segment'; count?: number; last?: number; id?: string; client?: typeof owner } = {}) {
  const count = options.count ?? 2; const last = options.last ?? 3; const id = options.id ?? sparkSegmentId(count, last);
  const db = options.client ?? owner; const batch = writeBatch(db);
  const u = (await getDoc(preparationUserRef())).data(); const p = (await getDoc(preparationProjectRef())).data();
  const totals = (d: typeof u) => ({ schemaVersion: 1, windowStartInMillis: utcBudgetDay(),
    readUnits: (d?.windowStartInMillis === utcBudgetDay() ? d.readUnits : 0) + 20,
    writeUnits: (d?.windowStartInMillis === utcBudgetDay() ? d.writeUnits : 0) + 3, updatedAt: serverTimestamp() });
  if (options.omit !== 'segment') batch.set(sparkSegmentRef(db, 'proof', 'bank', id), { ...segmentData(count, last), ...options.data });
  if (options.omit !== 'user') batch.set(doc(db, 'sparkPreparationUserQuotas', uid), { ...totals(u), workKind: 'segment', groupId: 'proof', accountId: 'bank', segmentId: id, ...options.user });
  if (options.omit !== 'project') batch.set(doc(db, 'sparkPreparationQuotas', 'project'), { ...totals(p), ...options.project });
  return batch;
}

for (const [label, options] of [
  ['missing UID charge', { omit: 'user' }], ['missing project charge', { omit: 'project' }], ['quota alone', { omit: 'segment' }],
  ['UID refund', { user: { readUnits: 0 } }], ['project refund', { project: { writeUnits: 0 } }],
  ['wrong UID source', { user: { segmentId: '2_5' } }], ['wrong account source', { user: { accountId: 'cash' } }],
  ['wrong group source', { user: { groupId: 'another' } }], ['extra quota data', { user: { nonce: 'unlimited' } }],
  ['wrong mode', { user: { workKind: 'history' } }], ['alias ID', { id: 'alias_123456' }],
  ['forged sum', { data: { deltaInCents: 1 } }], ['understated absolute bound', { data: { absoluteDeltaInCents: 1 } }],
  ['wrong minimum date', { data: { minAt: past('2026-09-01T12:00:00Z') } }],
  ['wrong maximum date', { data: { maxAt: past('2026-09-03T12:00:00Z') } }],
  ['different account', { data: { accountId: 'cash' } }], ['different actor', { data: { actorId: 'foreign' } }],
  ['different head', { data: { lastOperationId: 'history_5' } }], ['skipped predecessor', { data: { previousOperationId: 'bootstrap_bank' } }],
  ['swapped sources', { data: { leftId: 'history_3', rightId: 'history_2' } }], ['skipped revision', { data: { firstRevision: 1 } }],
  ['fractional count', { data: { nodeCount: 2.5 } }], ['unsafe bound', { data: { absoluteDeltaInCents: Number.MAX_SAFE_INTEGER + 1 } }],
  ['extra field', { data: { mutable: true } }], ['nonserver timestamp', { data: { createdAt: past() } }],
] as const) test(`segments Rules reject ${label} before any partial certificate or charge`, async () => {
  await seedHistory(8); await denied((await rawSegment(options)).commit());
  assert.equal((await getDoc(sparkSegmentRef(owner, 'proof', 'bank', options.id ?? '2_3'))).exists(), false);
  assert.equal((await getDoc(preparationUserRef())).exists(), false);
});

test('segments direct leaf batch succeeds and immutable certificates reject edit/delete and replay charges', async () => {
  await seedHistory(8); await (await rawSegment()).commit();
  const ref = sparkSegmentRef(owner, 'proof', 'bank', '2_3');
  const change = writeBatch(owner); change.update(ref, { deltaInCents: 0 }); await denied(change.commit());
  const remove = writeBatch(owner); remove.delete(ref); await denied(remove.commit());
  await denied((await rawSegment()).commit());
  const metrics = createSparkPreparationMetrics();
  assert.equal((await certifySparkHistorySegmentFirebase(secondSession, segmentInput(), { metrics })).created, false);
  assert.equal(metrics.confirmedWrites, 0); assert.equal((await getDoc(preparationUserRef())).data()!.readUnits, 20);
});

for (const data of [{ deltaInCents: 3 }, { absoluteDeltaInCents: 3 }, { leftId: '2_3' }, { rightId: '2_5' },
  { firstRevision: 2 }, { lastOperationId: 'history_5' }, { previousOperationId: 'history_1' }]) {
  test(`segments parent rejects forged ${Object.keys(data)[0]} while its children are valid`, async () => {
    await seedHistory(8); await warmSparkHistorySegmentsFirebase(owner, preparationInput());
    await environment.withSecurityRulesDisabled(async context => {
      await seedDeleteDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkHistorySegments', 'bank', 'nodes', '4_7'));
    });
    await denied((await rawSegment({ count: 4, last: 7, data })).commit());
    await (await rawSegment({ count: 4, last: 7 })).commit(); // Mesmo setup aceita a relação exata.
  });
}

test('segments cannot be created from checkpoints or absent children and do not require fresh heads for immutable construction', async () => {
  await seedHistory(8);
  assert.equal((await certifySparkHistorySegmentFirebase(owner, { ...segmentInput(2, 1), olderOperationId: 'bootstrap_bank' })).segment, null);
  assert.equal((await certifySparkHistorySegmentFirebase(owner, segmentInput(4, 7))).segment, null);
  await transferSparkFundsFirebase(owner, command({ amountInCents: 1 }));
  assert.equal((await certifySparkHistorySegmentFirebase(owner, segmentInput())).created, true);
  await denied((await rawSegment({ count: 4, last: 7 })).commit());
});

test('segments enforce ownership, group membership, fresh login and private construction quotas', async () => {
  await seedHistory(8);
  await denied((await rawSegment({ client: outsider })).commit());
  await denied((await rawSegment({ client: anonymous })).commit());
  await denied((await rawSegment({ client: expired })).commit());
  await certifySparkHistorySegmentFirebase(owner, segmentInput());
  await denied(getDoc(sparkSegmentRef(outsider, 'proof', 'bank', '2_3')));
  await denied(getDocs(collection(owner, 'financialGroups', 'proof', 'sparkHistorySegments', 'bank', 'nodes')));
  await seedGroup({ members: {} }); await denied(getDoc(sparkSegmentRef(owner, 'proof', 'bank', '2_3')));
});

test('segments can be certified and reused by distinct active members without reading another private proof', async () => {
  await seedHistory(8); const otherUid = getAuth(outsider.app).currentUser!.uid;
  await seedGroup({ members: { [uid]: 'admin', [otherUid]: 'member' } }); await warmSparkHistorySegmentsFirebase(outsider, { ...preparationInput(), actorId: otherUid });
  const proof = await prepareSparkHistoryProofFirebase(owner, preparationInput(), 100, { useSegments: true });
  assert.equal(proof.balanceInCents, 10007);
  await denied(getDoc(doc(outsider, 'financialGroups', 'proof', 'sparkHistoryProofs', preparationInput().clientActionId)));
});

for (const [scope, field, limit] of [['user', 'readUnits', 22000], ['project', 'readUnits', 24000], ['user', 'writeUnits', 6000], ['project', 'writeUnits', 8000]] as const) {
  test(`segments enforce ${scope} ${field} through Rules and explicit exhaustion`, async () => {
    await seedHistory(8); await seedPreparationQuota(scope, { [field]: limit });
    await assert.rejects(certifySparkHistorySegmentFirebase(owner, segmentInput()), (e: unknown) => e instanceof SparkPreparationError && e.reason === 'budget-exhausted');
    await denied((await rawSegment()).commit());
  });
}

test('segments pause and daily exhaustion preserve completed certificates for restart with no repeated charges', async () => {
  await seedHistory(8); const input = preparationInput(); const controller = new AbortController(); controller.abort();
  await assert.rejects(warmSparkHistorySegmentsFirebase(owner, input, { signal: controller.signal }), /pausada/);
  await seedPreparationQuota('user', { readUnits: 21960 });
  await assert.rejects(warmSparkHistorySegmentsFirebase(owner, input), (e: unknown) => e instanceof SparkPreparationError && e.reason === 'budget-exhausted');
  assert.ok((await getDoc(sparkSegmentRef(owner, 'proof', 'bank', '2_7'))).exists());
  assert.ok((await getDoc(sparkSegmentRef(owner, 'proof', 'bank', '2_5'))).exists());
  await seedPreparationQuota('user', { windowStartInMillis: utcBudgetDay() - SPARK_PREPARATION_DAY_MS });
  await seedPreparationQuota('project', { windowStartInMillis: utcBudgetDay() - SPARK_PREPARATION_DAY_MS });
  assert.equal((await warmSparkHistorySegmentsFirebase(secondSession, input)).created, 2);
  assert.equal((await getDoc(preparationUserRef())).data()!.readUnits, 40);
});

for (const changes of [{ balanceInCents: 4 }, { tailDeltaInCents: 4 }, { cursorRevision: 1 },
  { nextOperationId: 'history_1' }, { baselineBalanceInCents: 1 }, { segmentId: '4_3' }]) {
  test(`segments reject forged proof jump ${Object.keys(changes)[0]} with a valid live lease`, async () => {
    await seedHistory(8); await warmSparkHistorySegmentsFirebase(owner, preparationInput());
    await startSparkHistoryProofFirebase(owner, preparationInput());
    const proof = (await getDoc(proofRef(preparationInput().clientActionId))).data() as SparkHistoryProof;
    const segment = (await getDoc(sparkSegmentRef(owner, 'proof', 'bank', '4_7'))).data() as any;
    const correct = { ...applySparkHistorySegment(proof, segment), workRevision: 1, updatedAt: serverTimestamp() };
    const forged = writeBatch(owner); forged.set(proofRef(preparationInput().clientActionId), { ...correct, ...changes }); await denied(forged.commit());
    const valid = writeBatch(owner); valid.set(proofRef(preparationInput().clientActionId), correct); await valid.commit();
  });
}

test('segments never skip a zero sum with dates spanning the query boundary', async () => {
  await seedHistory(4, true);
  await environment.withSecurityRulesDisabled(async context => {
    for (let revision = 1; revision <= 3; revision += 1) await seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkOperations', `history_${revision}`), { differenceInCents: 2 });
  });
  await warmSparkHistorySegmentsFirebase(owner, preparationInput());
  let proof = await prepareSparkHistoryProofFirebase(owner, preparationInput(), 5);
  proof = await renewSparkHistoryBudgetFirebase(owner, preparationInput(), proof.leaseRevision);
  const segment = (await getDoc(sparkSegmentRef(owner, 'proof', 'bank', '2_3'))).data()!; assert.equal(segment.deltaInCents, 0);
  const batch = writeBatch(owner); batch.set(proofRef(preparationInput().clientActionId), { ...proof, segmentId: '2_3', cursorRevision: 1,
    nextOperationId: 'history_1', workRevision: proof.workRevision + 1, updatedAt: serverTimestamp() }); await denied(batch.commit());
  const done = await prepareSparkHistoryProofFirebase(secondSession, preparationInput(), 100, { useSegments: true });
  assert.equal(done.balanceInCents, 9994); assert.equal(done.tailDeltaInCents, 6);
});

test('segments preserve raw fallback around later counts and appended heads', async () => {
  await seedHistory(8); await warmSparkHistorySegmentsFirebase(owner, preparationInput());
  await transferSparkFundsFirebase(owner, command({ amountInCents: 1 }));
  await countSparkAccountFirebase(owner, count({ expectedRevision: 8, targetBalanceInCents: 8000 }));
  const asOf = Timestamp.now(); const input = { ...preparationInput(), asOf };
  const raw = await prepareSparkHistoryProofFirebase(owner, input);
  const fast = await prepareSparkHistoryProofFirebase(secondSession, { ...input, clientActionId: 'after_count_fast_123456' }, 100, { useSegments: true });
  assert.equal(fast.balanceInCents, 8000); assert.equal(fast.balanceInCents, raw.balanceInCents);
  assert.ok(fast.baselineAt!.isEqual(raw.baselineAt!)); assert.equal(fast.tailDeltaInCents, raw.tailDeltaInCents);
});

test('segments benchmark includes construction and three different queries over 1000 nodes', async () => {
  await seedHistory(1000); const input = preparationInput(); const build = createSparkPreparationMetrics(); const started = performance.now();
  let warm = await warmSparkHistorySegmentsFirebase(owner, input, { metrics: build }); let created = warm.created; let calls = 1;
  while (!warm.done) { warm = await warmSparkHistorySegmentsFirebase(secondSession, { ...input, cursor: warm.cursor }, { metrics: build }); created += warm.created; calls += 1; }
  const buildDurationMs = Math.round(performance.now() - started); const runs = [];
  for (const [index, asOf] of [past('2026-09-01T12:00:00Z'), past(), Timestamp.now()].entries()) {
    const metrics = createSparkPreparationMetrics(); const began = performance.now();
    let proof = await prepareSparkHistoryProofFirebase(owner, { ...input, clientActionId: `fast_query_${index}_123456`, asOf }, 100, { useSegments: true, metrics });
    while (proof.phase !== 'done') proof = await prepareSparkHistoryProofFirebase(secondSession, { ...input, clientActionId: `fast_query_${index}_123456`, asOf }, 100, { useSegments: true, metrics });
    assert.equal(proof.balanceInCents, index === 0 ? 10000 : 10999); assert.equal(proof.tailDeltaInCents, index === 0 ? 999 : 0);
    assert.ok(metrics.reusedNodes > 1900); assert.ok(metrics.confirmedWrites < 100);
    runs.push({ durationMs: Math.round(performance.now() - began), ...metrics });
  }
  assert.equal(created, 985); assert.equal(build.confirmedWrites, 2955);
  const totalWrites = build.confirmedWrites + runs.reduce((sum, run) => sum + run.confirmedWrites, 0);
  assert.ok(totalWrites < 3 * 2098); const quota = (await getDoc(preparationUserRef())).data()!;
  console.log('SPARK_SEGMENT_BENCHMARK', JSON.stringify({ nodes: 1000, created, calls, buildDurationMs, build, runs,
    totalWrites, linearThreeQueryWrites: 3 * 2098, reservedReadUnits: quota.readUnits, reservedWriteUnits: quota.writeUnits }));
}, { timeout: 240_000 });


test('segments simultaneous certification charges once and uncertain responses reconcile by canonical ID', async () => {
  await seedHistory(8); const results = await Promise.allSettled([certifySparkHistorySegmentFirebase(owner, segmentInput()), certifySparkHistorySegmentFirebase(secondSession, segmentInput())]);
  assert.ok(results.some(result => result.status === 'fulfilled'));
  assert.equal((await getDoc(preparationUserRef())).data()!.readUnits, 20);
  assert.equal((await certifySparkHistorySegmentFirebase(secondSession, segmentInput())).created, false);
  assert.equal((await getDoc(preparationProjectRef())).data()!.writeUnits, 3);
});

for (const purpose of ['instant', 'monthly'] as const) test(`segments preserve exact upper boundary for ${purpose}`, async () => {
  await seedHistory(8); const input = { ...preparationInput(), purpose, asOf: past('2026-09-02T12:00:00Z') };
  await warmSparkHistorySegmentsFirebase(owner, input);
  const proof = await prepareSparkHistoryProofFirebase(owner, input, 100, { useSegments: true });
  assert.equal(proof.balanceInCents, purpose === 'monthly' ? 10000 : 10007); assert.equal(proof.tailDeltaInCents, purpose === 'monthly' ? 7 : 0);
});

for (const inclusive of [true, false]) test(`segments respect baseline boundary inclusive=${inclusive}`, async () => {
  await seedHistory(8); await warmSparkHistorySegmentsFirebase(owner, preparationInput());
  await environment.withSecurityRulesDisabled(async context => {
    await seedSetDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkOperations', 'boundary_count_123456'), {
      schemaVersion: 1, actorId: uid, accountId: 'bank', kind: 'imported_checkpoint', targetBalanceInCents: 8000,
      includesBoundary: inclusive, effectiveAt: new Date('2026-09-02T12:00:00Z'), createdAt: new Date('2026-09-03T12:00:00Z'),
      differenceInCents: 0, expectedRevision: 7, previousOperationId: 'history_7',
    });
    await seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkPositions', 'bank'),
      { revision: 8, lastOperationId: 'boundary_count_123456', balanceInCents: inclusive ? 8007 : 8000 });
  });
  const proof = await prepareSparkHistoryProofFirebase(owner, preparationInput(), 100, { useSegments: true });
  assert.equal(proof.balanceInCents, inclusive ? 8007 : 8000);
});

test('segments fall back near the safe integer limit without losing a cancelling compound term', async () => {
  await seedHistory(4, true);
  await environment.withSecurityRulesDisabled(async context => {
    for (const revision of [1, 2, 3]) await seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkOperations', `history_${revision}`), { differenceInCents: 2 });
  });
  const input = { ...preparationInput(), asOf: past('2026-09-25T12:00:00Z') }; await warmSparkHistorySegmentsFirebase(owner, input);
  let proof = await prepareSparkHistoryProofFirebase(owner, input, 5); proof = await renewSparkHistoryBudgetFirebase(owner, input, proof.leaseRevision);
  await environment.withSecurityRulesDisabled(async context => {
    await seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkHistoryProofs', input.clientActionId), { balanceInCents: Number.MAX_SAFE_INTEGER });
  });
  proof = (await getDoc(proofRef(input.clientActionId))).data() as SparkHistoryProof;
  const batch = writeBatch(owner); batch.set(proofRef(input.clientActionId), { ...proof, segmentId: '2_3', cursorRevision: 1,
    nextOperationId: 'history_1', workRevision: proof.workRevision + 1, updatedAt: serverTimestamp() }); await denied(batch.commit());
  const page = await stepSparkHistoryProofFirebase(secondSession, input, proof.workRevision, { useSegments: true });
  assert.equal(page.segmentId, null); assert.equal(page.cursorRevision, 2); assert.equal(page.balanceInCents, Number.MAX_SAFE_INTEGER);
});

test('segments direct jump is rejected after a new head and client detects stale before probing a certificate', async () => {
  await seedHistory(8); await warmSparkHistorySegmentsFirebase(owner, preparationInput()); await startSparkHistoryProofFirebase(owner, preparationInput());
  const proof = (await getDoc(proofRef(preparationInput().clientActionId))).data() as SparkHistoryProof;
  const node = (await getDoc(sparkSegmentRef(owner, 'proof', 'bank', '4_7'))).data() as any;
  await transferSparkFundsFirebase(owner, command({ amountInCents: 1 }));
  const batch = writeBatch(owner); batch.set(proofRef(preparationInput().clientActionId), { ...applySparkHistorySegment(proof, node), workRevision: 1, updatedAt: serverTimestamp() }); await denied(batch.commit());
  const metrics = createSparkPreparationMetrics(); await assert.rejects(stepSparkHistoryProofFirebase(owner, preparationInput(), 0, { useSegments: true, metrics }),
    (e: unknown) => e instanceof SparkPreparationError && e.reason === 'stale');
  assert.equal(metrics.explicitReads, 3);
});


test('segments retain future checkpoint selectors without applying an opening early', async () => {
  await seedHistory(8); const future = futureMonth({ expectedRevision: 7, targetBalanceInCents: 12000 });
  await preview(future); await saveSparkTemporalBalanceFirebase(owner, future); await warmSparkHistorySegmentsFirebase(owner, preparationInput());
  const input = { ...preparationInput(), asOf: Timestamp.now() };
  const current = await prepareSparkHistoryProofFirebase(owner, input, 100, { useSegments: true });
  assert.equal(current.balanceInCents, 10007); assert.ok(current.nextCheckpointAt!.isEqual(future.effectiveAt));
  const projected = await prepareSparkHistoryProofFirebase(secondSession, { ...input, clientActionId: 'future_fast_123456', asOf: future.effectiveAt, purpose: 'monthly' }, 100, { useSegments: true });
  assert.equal(projected.balanceInCents, 12000); assert.equal(projected.nextCheckpointAt, null);
  assert.equal((await balance('bank')).balanceInCents, 10007);
});

test('segments completed proofs support dated adjustment, atomic replacement and exact component reversal', async () => {
  await seedHistory(8); await warmSparkHistorySegmentsFirebase(owner, preparationInput());
  const input = temporal({ expectedRevision: 7, targetBalanceInCents: 13000 });
  await prepareSparkHistoryProofFirebase(owner, { ...input, asOf: input.effectiveAt, purpose: 'instant' }, 100, { useSegments: true });
  await saveSparkTemporalBalanceFirebase(owner, input); assert.equal((await balance('bank')).balanceInCents, 13000);
  const edit = replacement({ originalOperationId: input.clientActionId, expectedRevision: 8, targetBalanceInCents: 14000 });
  await prepareSparkHistoryProofFirebase(secondSession, { ...edit, asOf: edit.effectiveAt, purpose: 'instant' }, 100, { useSegments: true });
  await replaceSparkBalanceAdjustmentFirebase(owner, edit); assert.equal((await balance('bank')).balanceInCents, 14000);
  await reverseSparkBalanceAdjustmentFirebase(owner, { groupId: 'proof', actorId: uid, clientActionId: 'fast_reverse_123456', originalOperationId: edit.clientActionId });
  assert.equal((await balance('bank')).balanceInCents, 10007);
});


test('segments normalize real transfer directions and investment legs for each account', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const ids = ['pair_one_123456', 'pair_two_123456', 'pair_three_123456'];
  await transferSparkFundsFirebase(owner, command({ clientActionId: ids[0], amountInCents: 1000 }));
  await transferSparkFundsFirebase(owner, command({ clientActionId: ids[1], fromAccountId: 'cash', toAccountId: 'bank', amountInCents: 500 }));
  await transferSparkFundsFirebase(owner, command({ clientActionId: ids[2], amountInCents: 200 }));
  for (const accountId of ['bank', 'cash']) {
    const result = await certifySparkHistorySegmentFirebase(owner, { ...segmentInput(), accountId, olderOperationId: ids[1], newerOperationId: ids[2] });
    assert.equal(result.segment!.deltaInCents, accountId === 'bank' ? 300 : -300);
  }
  await transferSparkFundsFirebase(owner, command({ clientActionId: 'pair_deposit_123456', toAccountId: 'investment', kind: 'investment_deposit', amountInCents: 1000 }));
  await transferSparkFundsFirebase(owner, command({ clientActionId: 'pair_redemption_123456', fromAccountId: 'investment', toAccountId: 'bank', kind: 'investment_redemption', amountInCents: 200 }));
  const investmentPair = await certifySparkHistorySegmentFirebase(owner, { ...segmentInput(2, 5), olderOperationId: 'pair_deposit_123456', newerOperationId: 'pair_redemption_123456' });
  assert.equal(investmentPair.segment!.deltaInCents, -800);
  for (const [accountId, expected] of [['bank', 8500], ['cash', 10700], ['investment', 5800]] as const) {
    const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput(`account_${accountId}_123456`), accountId, asOf: Timestamp.now() }, 100, { useSegments: true });
    assert.equal(proof.balanceInCents, expected);
  }
});
