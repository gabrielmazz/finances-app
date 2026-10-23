import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection as seedCollection, getDocs as seedGetDocs, deleteDoc as seedDeleteDoc, doc as seedDoc, getDoc as seedGetDoc, setDoc as seedSetDoc, updateDoc as seedUpdateDoc, writeBatch as seedWriteBatch } from 'firebase/firestore';
import { transferSparkFundsFirebase, reverseSparkTransferFirebase, transferSparkDatedFundsFirebase, reverseSparkDatedTransferFirebase, SPARK_TRANSFER_PROOF_PROTOCOL, type SparkTransferInput, type SparkDatedTransferInput } from '../../functions/SparkTransferFirebase';
import { openSparkAccountFirebase, openSparkBankFirebase, type SparkOpeningInput, type SparkBankOpeningInput } from '../../functions/SparkAccountFirebase';
import { countSparkAccountFirebase, reverseSparkBalanceAdjustmentFirebase, type SparkCountInput } from '../../functions/SparkBalanceFirebase';
import { calculateAccountBalanceInCents, type LedgerTransaction } from '../../utils/financialLedger';
import { prepareSparkHistoryProofFirebase, startSparkHistoryProofFirebase, stepSparkHistoryProofFirebase, renewSparkHistoryBudgetFirebase, SparkPreparationError, advanceSparkHistory, getSparkPreparationProgress, type SparkHistoryProof } from '../../functions/SparkHistoryFirebase';
import { saveSparkTemporalBalanceFirebase, type SparkTemporalBalanceInput } from '../../functions/SparkTemporalBalanceFirebase';
import { activateSparkMonthlyOpeningFirebase, readCurrentSparkPositionFirebase, refreshSparkMonthlyOpeningFirebase } from '../../functions/SparkMonthlyActivationFirebase';
import { replaceSparkBalanceAdjustmentFirebase, type SparkAdjustmentReplacementInput } from '../../functions/SparkAdjustmentReplacementFirebase';
import { postSparkMovementFirebase, reverseSparkMovementFirebase, correctSparkMovementFirebase, type SparkMovementInput } from '../../functions/SparkMovementFirebase';
import { runSparkOperation } from '../../functions/sparkFinancialProtocol';
import { acknowledgeSparkRecoveryFirebase, cancelSparkRecoveryFirebase, readSparkRecoveryFirebase, reserveSparkRecoveryInTransaction,
  sparkRecoveryRefs, sparkRecoveryIsVisible } from '../../functions/SparkOperationRecoveryFirebase';
import { createSparkRecurringPlanFirebase, updateSparkRecurringPlanFirebase, settleSparkRecurringFirebase, undoSparkRecurringFirebase, type SparkRecurringPlanInput } from '../../functions/SparkRecurringFirebase';
import { saveSparkRecurringMetadataFirebase } from '../../functions/SparkRecurringMetadataFirebase';
import { replanSparkRecurringFirebase, undoSparkRecurringReplanFirebase, type SparkRecurringReplanInput } from '../../functions/SparkRecurringReplanFirebase';
import { toFinancialCivilDate } from '../../utils/financialCivilDate';
import { saveSparkAccountCatalogFirebase, type SparkAccountCatalogInput } from '../../functions/SparkAccountCatalogFirebase';
import type { SparkAccountCatalog } from '../../utils/sparkAccountCatalog';
import { prepareSparkInvestmentSyncFirebase, synchronizeSparkInvestmentFirebase, readSparkInvestmentStateFirebase, type SparkInvestmentSyncInput } from '../../functions/SparkInvestmentFirebase';
import { prepareSparkInvestmentValuationReversalFirebase, reverseSparkInvestmentValuationFirebase, type SparkInvestmentValuationReversalInput } from '../../functions/SparkInvestmentValuationReversalFirebase';
import { openFundedSparkInvestmentFirebase, openDatedFundedSparkInvestmentFirebase, type SparkInvestmentOpeningInput, type SparkDatedInvestmentOpeningInput } from '../../functions/SparkInvestmentOpeningFirebase';
import { updateSparkInvestmentPrincipalFirebase, type SparkInvestmentPrincipalInput } from '../../functions/SparkInvestmentPrincipalFirebase';
import { changeSparkInvestmentFundingFirebase, type SparkInvestmentFundingInput } from '../../functions/SparkInvestmentFundingFirebase';
import { saveSparkCdiRateFirebase, type SparkCdiRateInput } from '../../functions/SparkCdiRateFirebase';
import { getSparkContextFirebase } from '../../functions/SparkContextFirebase';
import { saveSparkCategoryFirebase, deleteSparkCategoryFirebase, type SparkCategoryInput } from '../../functions/SparkCategoryFirebase';
import { executeSparkMetadataCommandFirebase } from '../../functions/SparkMetadataCommandFirebase';
import { executeSparkMovementCommandFirebase, type SparkMovementCommand } from '../../functions/SparkMovementCommandFirebase';
import { readSparkBankSelectionFirebase } from '../../functions/SparkBankSelectionFirebase';
import { submitSparkMovementFormFirebase, prepareSparkMovementReversalFirebase, type SparkMovementFormState } from '../../functions/SparkMovementFormFirebase';
import { readSparkOrdinaryForEditFirebase, sparkEditableMovementRecord } from '../../functions/SparkOrdinaryReadFirebase';
import { readSparkMovementListFirebase } from '../../functions/SparkMovementListFirebase';
import { createAssistantRecordFingerprint } from '../../utils/assistantRecordFingerprint';
import { getSparkCategoryReferencesFirebase } from '../../functions/SparkCategoryReferencesFirebase';
import { setSparkAccountLifecycleFirebase, type SparkAccountLifecycleInput } from '../../functions/SparkAccountLifecycleFirebase';
import { readSparkSharedChangesFirebase } from '../../functions/SparkSharedChangesFirebase';
import { readSparkAccountFirebase, readSparkAccountsFirebase } from '../../functions/SparkAccountReadFirebase';
import { readSparkFinancialEventsFirebase } from '../../functions/SparkFinancialReadFirebase';
import { readSparkRecurringPlansFirebase } from '../../functions/SparkRecurringReadFirebase';
import { buildSparkUpcomingMandatoryItems } from '../../utils/sparkRecurringReadModel';
import { readSparkStatementFirebase } from '../../functions/SparkStatementFirebase';
import { createSparkPreparationMetrics, estimateSparkPreparation, SPARK_PREPARATION_DAY_MS } from '../../utils/sparkPreparationBudget';
import { createSparkCivilMonthCalendar, reconcileSparkLedgerSnapshot } from '../../utils/sparkFinancialReconciliation';

import { certifySparkHistorySegmentFirebase, warmSparkHistorySegmentsFirebase, sparkSegmentRef, sparkSegmentId, applySparkHistorySegment } from '../../functions/sparkHistorySegments';

// O serviço compartilhado resolve o SDK da raiz; os clientes devem usar a mesma instância.
const clientRequire = createRequire(resolve(process.cwd(), '..', 'package.json'));
const { initializeApp, deleteApp } = clientRequire('firebase/app') as typeof import('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously } = clientRequire('firebase/auth') as typeof import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection, runTransaction, writeBatch, serverTimestamp, deleteField, deleteDoc, Timestamp, terminate } = clientRequire('firebase/firestore') as typeof import('firebase/firestore');

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
async function financialRejection(promise: Promise<unknown>, expected?: any) {
  await assert.rejects(promise, expected);
  // Isolar os controles de domínio seguintes da barreira adicional de recuperação.
  // Somente fixture sintética/Admin: cliente não pode apagar esses tombstones.
  // Os testes "Spark recovery" não usam esta função e exercitam a proteção completa.
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore(), indexRef = seedDoc(firestore, 'sparkOperationRecovery', uid), index = await seedGetDoc(indexRef);
    const intents = await seedGetDocs(seedCollection(indexRef, 'intents'));
    for (const intent of intents.docs) {
      if (intent.data().status !== 'cancelled') continue;
      assert.equal((await seedGetDoc(seedDoc(firestore, 'financialGroups', intent.data().groupId, 'sparkOperations', intent.id))).exists(), false);
      await seedDeleteDoc(intent.ref);
      if (index.data()?.operationId === intent.id) await seedDeleteDoc(indexRef);
    }
  });
}
async function balance(accountId: string) {
  return (await getDoc(positionRef(owner, accountId))).data()!;
}
async function confirmedNow(accountId = 'bank') {
  const updated = (await balance(accountId)).updatedAt as InstanceType<typeof Timestamp>, now = Timestamp.now();
  return updated.seconds > now.seconds || updated.seconds === now.seconds && updated.nanoseconds > now.nanoseconds ? updated : now;
}

async function waitForSparkServerTime(boundary: InstanceType<typeof Timestamp>) {
  await new Promise(resolve => setTimeout(resolve, Math.max(0, boundary.toMillis() - Date.now() + 250)));
  let observedServerTime = 0;
  for (let probe = 0; probe < 8 && observedServerTime < boundary.toMillis(); probe += 1) {
    const clockId = `server_clock_${probe}_123456`, position = await balance('third');
    await countSparkAccountFirebase(owner, count({ accountId: 'third', expectedRevision: position.revision,
      targetBalanceInCents: position.balanceInCents, clientActionId: clockId }));
    observedServerTime = (await getDoc(operationRef(owner, clockId))).data()!.createdAt.toMillis();
    if (observedServerTime < boundary.toMillis()) await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(observedServerTime >= boundary.toMillis(), 'O servidor precisa ter alcançado a fronteira antes de exigir recusa.');
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
    schemaVersion: 1, actorId: uid, kind: 'transfer', dated: false, fromAccountId: from, toAccountId: to,
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
  // Controles de batch bruto não possuem recuperação de cota. Os ensaios de fronteira
  // abaixo injetam o relógio explicitamente e continuam exercitando essa condição.
  const phase = Date.now() % 60000;
  if (phase < 1000) await new Promise(resolve => setTimeout(resolve, 1000 - phase));
  else if (phase > 58000) await new Promise(resolve => setTimeout(resolve, 61000 - phase));
});

after(async () => {
  await Promise.all(databases.map(database => terminate(database)));
  await Promise.all(apps.map(app => deleteApp(app)));
  await environment?.cleanup();
});

function recurringPlan(overrides: Partial<SparkRecurringPlanInput> = {}): SparkRecurringPlanInput {
  return { groupId: 'proof', actorId: uid, clientActionId: 'create_recurring_123456', planId: 'rent', recurringType: 'expense',
    name: 'Aluguel', categoryId: null, startCycle: '2026-07', valueInCents: 1000, ...overrides };
}

const recoveryIdentity = (id = 'recovery_action_123456') => ({ actorId: uid, groupId: 'proof', clientActionId: id });
const reserveRecovery = (id = 'recovery_action_123456', firestore = owner) => runTransaction(firestore,
  transaction => reserveSparkRecoveryInTransaction(transaction, firestore, recoveryIdentity(id), 'transfer'));
async function acknowledgePriorSend() {
  const entry = await readSparkRecoveryFirebase(owner, uid);
  if (entry?.status === 'committed') await acknowledgeSparkRecoveryFirebase(owner, { actorId: uid, groupId: entry.groupId, clientActionId: entry.operationId });
}

test('Spark recovery records only private metadata and reload requires acknowledgment before a different operation', async () => {
  const identity = recoveryIdentity(); await transferSparkFundsFirebase(owner, command(identity));
  const entry = await readSparkRecoveryFirebase(secondSession, uid);
  assert.equal(entry?.status, 'committed'); assert.equal(entry?.operationId, identity.clientActionId);
  assert.deepEqual(Object.keys(entry!).sort(), ['schemaVersion', 'groupId', 'kind', 'status', 'createdAt', 'updatedAt', 'operationId'].sort());
  assert.equal(sparkRecoveryIsVisible(owner, identity, 'committed'), false);
  assert.equal(sparkRecoveryIsVisible(secondSession, identity, 'committed'), true);
  await assert.rejects(transferSparkFundsFirebase(secondSession, command({ clientActionId: 'recovery_new_123456' })), { code: 'spark/recovery-required' });
  assert.equal((await balance('bank')).balanceInCents, 9000);
  await acknowledgeSparkRecoveryFirebase(secondSession, identity);
  await transferSparkFundsFirebase(secondSession, command({ clientActionId: 'recovery_new_123456' }));
  assert.equal((await balance('bank')).balanceInCents, 8000);
});
test('Spark recovery uninterrupted confirmed operations advance the index without another confirmation', async () => {
  await transferSparkFundsFirebase(owner, command(recoveryIdentity()));
  await transferSparkFundsFirebase(owner, command(recoveryIdentity('recovery_next_123456')));
  const previous = await getDoc(sparkRecoveryRefs(owner, recoveryIdentity()).intent);
  assert.equal(previous.data()?.status, 'resolved');
  assert.equal((await readSparkRecoveryFirebase(owner, uid))?.operationId, 'recovery_next_123456');
});
test('Spark recovery pending survives another session and blocks an unrelated raw financial batch', async () => {
  await reserveRecovery(); assert.equal((await readSparkRecoveryFirebase(secondSession, uid))?.status, 'pending');
  await denied(rawBatch(owner, { id: 'unrelated_money_123456' }).commit());
  await assert.rejects(transferSparkFundsFirebase(secondSession, command({ clientActionId: 'unrelated_money_123456' })), { code: 'spark/recovery-required' });
  assert.equal((await balance('bank')).balanceInCents, 10000);
});
test('Spark recovery cancelled ID cannot be reopened, deleted or committed by a delayed sender', async () => {
  const identity = recoveryIdentity(); await reserveRecovery();
  assert.equal(await cancelSparkRecoveryFirebase(secondSession, identity), 'cancelled');
  await assert.rejects(transferSparkFundsFirebase(owner, command(identity)), { sparkIntentCancelled: true });
  await denied(rawBatch(owner, { id: identity.clientActionId }).commit());
  const refs = sparkRecoveryRefs(owner, identity), batch = writeBatch(owner);
  batch.update(refs.intent, { status: 'pending', updatedAt: serverTimestamp() }); await denied(batch.commit());
  await denied(deleteDoc(refs.intent)); await denied(deleteDoc(refs.index));
  assert.equal((await balance('bank')).balanceInCents, 10000);
  await transferSparkFundsFirebase(owner, command({ clientActionId: 'after_cancel_123456' }));
});
test('Spark recovery cancellation racing a financial commit has one authoritative outcome', async () => {
  const identity = recoveryIdentity(); await reserveRecovery();
  const batch = rawBatch(owner, { id: identity.clientActionId });
  batch.update(sparkRecoveryRefs(owner, identity).intent, { status: 'committed', updatedAt: serverTimestamp() });
  const [cancelled, written] = await Promise.allSettled([cancelSparkRecoveryFirebase(secondSession, identity), batch.commit()]);
  const entry = await readSparkRecoveryFirebase(owner, uid), receipt = await getDoc(operationRef(owner, identity.clientActionId));
  assert.equal(cancelled.status, 'fulfilled');
  if (receipt.exists()) {
    assert.equal(entry?.status, 'committed'); assert.equal(written.status, 'fulfilled');
    assert.equal((await balance('bank')).balanceInCents, 9000);
  } else {
    assert.equal(entry?.status, 'cancelled'); assert.equal(written.status, 'rejected');
    assert.doesNotMatch((written as PromiseRejectedResult).reason.message, /maximum of|too many/i);
    assert.equal((await balance('bank')).balanceInCents, 10000);
  }
});
test('Spark recovery status cannot claim confirmation without the matching atomic receipt', async () => {
  await reserveRecovery(); const batch = writeBatch(owner);
  batch.update(sparkRecoveryRefs(owner, recoveryIdentity()).intent, { status: 'committed', updatedAt: serverTimestamp() });
  await denied(batch.commit());
});
test('Spark recovery pending cannot be dismissed as resolved or have its material identity changed', async () => {
  await reserveRecovery();
  for (const fields of [{ status: 'resolved' }, { groupId: 'other' }, { kind: 'income' }, { amountInCents: 1000 }]) {
    const batch = writeBatch(owner); batch.update(sparkRecoveryRefs(owner, recoveryIdentity()).intent, { ...fields, updatedAt: serverTimestamp() });
    await denied(batch.commit());
  }
});
test('Spark recovery metadata is private to the UID including expired and unauthenticated sessions', async () => {
  await reserveRecovery();
  for (const firestore of [outsider, expired, anonymous]) {
    const refs = sparkRecoveryRefs(firestore, recoveryIdentity());
    await denied(getDoc(refs.index)); await denied(getDoc(refs.intent));
    const batch = writeBatch(firestore); batch.update(refs.intent, { status: 'cancelled', updatedAt: serverTimestamp() }); await denied(batch.commit());
  }
  await denied(getDocs(collection(owner, 'sparkOperationRecovery')));
});
test('Spark recovery revoked actor may cancel a private pending send but cannot move money', async () => {
  await reserveRecovery(); await seedGroup({ members: {} });
  assert.equal(await cancelSparkRecoveryFirebase(secondSession, recoveryIdentity()), 'cancelled');
  await denied(rawBatch(owner, { id: 'revoked_recovery_123456' }).commit());
});
test('Spark recovery replay after another confirmation returns the original receipt without shifting its index', async () => {
  const original = command(recoveryIdentity()); await transferSparkFundsFirebase(owner, original);
  await transferSparkFundsFirebase(owner, command({ clientActionId: 'recovery_later_123456' }));
  assert.equal((await transferSparkFundsFirebase(secondSession, original)).idempotent, true);
  assert.equal((await readSparkRecoveryFirebase(owner, uid))?.operationId, 'recovery_later_123456');
  assert.equal((await balance('bank')).balanceInCents, 8000);
});
function rawRecoveryReservation(options: { intent?: Record<string, unknown>; quota?: Record<string, unknown>; omit?: 'intent' | 'index' | 'quota' } = {}) {
  const identity = recoveryIdentity(), refs = sparkRecoveryRefs(owner, identity), batch = writeBatch(owner);
  if (options.omit !== 'index') batch.set(refs.index, { schemaVersion: 1, groupId: 'proof', operationId: identity.clientActionId, updatedAt: serverTimestamp() });
  if (options.omit !== 'intent') batch.set(refs.intent, { schemaVersion: 1, groupId: 'proof', kind: 'transfer', status: 'pending',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...options.intent });
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkOperationIntentQuotas', uid), { groupId: 'proof', operationId: identity.clientActionId,
    windowStartInMillis: Math.floor(Date.now() / 60000) * 60000, count: 1, updatedAt: serverTimestamp(), ...options.quota });
  return batch;
}
test('Spark recovery raw reservation and raw financial commit enforce the two distinct atomic phases', async () => {
  await rawRecoveryReservation().commit();
  await denied(rawBatch(owner, { id: recoveryIdentity().clientActionId }).commit());
  const batch = rawBatch(owner, { id: recoveryIdentity().clientActionId });
  batch.update(sparkRecoveryRefs(owner, recoveryIdentity()).intent, { status: 'committed', updatedAt: serverTimestamp() });
  await batch.commit();
  assert.equal((await readSparkRecoveryFirebase(secondSession, uid))?.status, 'committed');
  assert.equal(await cancelSparkRecoveryFirebase(secondSession, recoveryIdentity()), 'committed');
  assert.equal((await balance('bank')).balanceInCents, 9000);
});
test('Spark recovery reservation cannot be created together with a financial receipt', async () => {
  const identity = recoveryIdentity(), refs = sparkRecoveryRefs(owner, identity), batch = rawBatch(owner, { id: identity.clientActionId });
  batch.set(refs.index, { schemaVersion: 1, groupId: 'proof', operationId: identity.clientActionId, updatedAt: serverTimestamp() });
  batch.set(refs.intent, { schemaVersion: 1, groupId: 'proof', kind: 'transfer', status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(doc(owner, 'sparkOperationIntentQuotas', uid), { groupId: 'proof', operationId: identity.clientActionId,
    windowStartInMillis: Math.floor(Date.now() / 60000) * 60000, count: 1, updatedAt: serverTimestamp() });
  await denied(batch.commit()); assert.equal((await balance('bank')).balanceInCents, 10000);
});
for (const [label, changes] of Object.entries({
  'missing index': { omit: 'index' }, 'missing quota': { omit: 'quota' }, 'missing intent': { omit: 'intent' },
  'financial payload': { intent: { amountInCents: 1000 } }, 'chat payload': { intent: { conversation: 'não persistir' } },
  'invalid status': { intent: { status: 'committed' } }, 'invalid kind': { intent: { kind: 'x'.repeat(65) } },
  'unprotected group': { intent: { groupId: 'other' } }, 'fake timestamp': { intent: { createdAt: Timestamp.fromMillis(0) } },
  'quota overflow': { quota: { count: 121 } }, 'quota zero': { quota: { count: 0 } },
  'quota extras': { quota: { content: 'não persistir' } }, 'stale quota window': { quota: { windowStartInMillis: 0 } },
})) test(`Spark recovery Rules refuse ${label}`, async () => {
  await denied(rawRecoveryReservation(changes as Parameters<typeof rawRecoveryReservation>[0]).commit());
  assert.equal((await readSparkRecoveryFirebase(owner, uid)), null);
});
test('Spark recovery intent quota increments after cancellation and cannot reset in the same minute', async () => {
  await reserveRecovery(); await cancelSparkRecoveryFirebase(owner, recoveryIdentity());
  await reserveRecovery('recovery_next_quota_123456');
  const quota = await getDoc(doc(owner, 'sparkOperationIntentQuotas', uid)); assert.equal(quota.data()?.count, 2);
  const batch = writeBatch(owner); batch.update(quota.ref, { count: 1, updatedAt: serverTimestamp() }); await denied(batch.commit());
});
test('Spark recovery known failed financial validation cancels its ID and leaves no financial effect', async () => {
  const input = command({ ...recoveryIdentity(), amountInCents: 11000 });
  await assert.rejects(transferSparkFundsFirebase(owner, input), error => {
    assert.match((error as Error).message, /justificativa/); assert.equal((error as { sparkIntentCancelled?: boolean }).sparkIntentCancelled, true); return true;
  });
  assert.equal((await readSparkRecoveryFirebase(owner, uid))?.status, 'cancelled');
  assert.equal((await getDoc(operationRef(owner, input.clientActionId))).exists(), false);
  assert.equal((await balance('bank')).balanceInCents, 10000);
});
function recurringSettlement(overrides: Record<string, any> = {}) {
  return { groupId: 'proof', actorId: uid, clientActionId: 'settle_recurring_123456', planId: 'rent', cycle: '2026-07',
    expectedPlanRevision: 0, effectiveAt: Timestamp.fromDate(new Date('2026-07-15T12:00:00Z')), accountId: 'bank', ...overrides };
}
function recurringUndo(overrides: Record<string, any> = {}) {
  return { ...recurringSettlement(), clientActionId: 'undo_recurring_123456', expectedPlanRevision: 1,
    settlementOperationId: 'settle_recurring_123456', ...overrides };
}
const recurringPlanRef = () => doc(owner, 'financialGroups/proof/sparkRecurringPlans/rent');
const recurringCycleRef = (cycle = '2026-07') => doc(recurringPlanRef(), 'cycles', cycle);
test('Spark recurring creates definition with zero counters, stable identity and immutable contract', async () => {
  const input = recurringPlan(); await createSparkRecurringPlanFirebase(owner, input);
  assert.equal((await createSparkRecurringPlanFirebase(secondSession, input)).idempotent, true);
  assert.equal((await getDoc(recurringPlanRef())).data()!.installmentsCompleted, 0);
  await financialRejection(createSparkRecurringPlanFirebase(owner, { ...input, name: 'Alterado' }), /outros argumentos/);
  await financialRejection(createSparkRecurringPlanFirebase(owner, { ...input, clientActionId: 'same_plan_123456' }), /já cadastrada/);
  const mutate = writeBatch(owner); mutate.update(recurringPlanRef(), { valueInCents: 1 }); await denied(mutate.commit());
});
for (const type of ['expense', 'gain'] as const) test(`Spark recurring ${type} creates real movement, cycle and replay-safe balance`, async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ recurringType: type }));
  const input = recurringSettlement({ amountInCents: 700 }); await settleSparkRecurringFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, type === 'gain' ? 10700 : 9300);
  assert.equal((await getDoc(recurringCycleRef())).data()!.amountInCents, 700);
  assert.equal((await settleSparkRecurringFirebase(secondSession, input)).idempotent, true);
  await financialRejection(reverseSparkMovementFirebase(owner, resolution({ originalOperationId: input.clientActionId })), /fluxo específico/);
  await undoSparkRecurringFirebase(owner, recurringUndo()); assert.equal((await balance('bank')).balanceInCents, 10000);
  assert.equal((await getDoc(recurringCycleRef())).data()!.active, false);
  assert.equal((await undoSparkRecurringFirebase(secondSession, recurringUndo())).idempotent, true);
  await settleSparkRecurringFirebase(owner, { ...input, expectedPlanRevision: 2, clientActionId: 'resettle_recurring_123456' });
  await financialRejection(undoSparkRecurringFirebase(owner, recurringUndo({ expectedPlanRevision: 3, clientActionId: 'stale_undo_123456' })), /substituído/);
});
test('Spark recurring installments preserve 333 + 333 + 334 and require reverse order on undo', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ valueInCents: 333, installmentTotal: 3, contractTotalInCents: 1000 }));
  for (const [index, month] of ['07', '08', '09'].entries()) {
    await settleSparkRecurringFirebase(owner, recurringSettlement({ cycle: `2026-${month}`, expectedPlanRevision: index,
      effectiveAt: Timestamp.fromDate(new Date(`2026-${month}-15T12:00:00Z`)), clientActionId: `installment_${month}_123456` }));
    assert.equal((await getDoc(recurringCycleRef(`2026-${month}`))).data()!.amountInCents, index === 2 ? 334 : 333);
  }
  assert.equal((await balance('bank')).balanceInCents, 9000);
  await financialRejection(undoSparkRecurringFirebase(owner, recurringUndo({ settlementOperationId: 'installment_07_123456', expectedPlanRevision: 3 })), /primeiro as parcelas/);
  for (const [offset, month] of ['09', '08'].entries()) await undoSparkRecurringFirebase(owner, recurringUndo({ cycle: `2026-${month}`,
    settlementOperationId: `installment_${month}_123456`, expectedPlanRevision: 3 + offset, clientActionId: `undo_installment_${month}_123456` }));
  await settleSparkRecurringFirebase(owner, recurringSettlement({ cycle: '2026-09', effectiveAt: Timestamp.fromDate(new Date('2026-09-16Z')),
    expectedPlanRevision: 5, installmentsCount: 2, clientActionId: 'settle_last_two_123456' }));
  assert.equal((await getDoc(recurringCycleRef('2026-09'))).data()!.amountInCents, 667);
  assert.equal((await balance('bank')).balanceInCents, 9000);
});
test('Spark recurring multiple installments settle/undo exactly and retain historical proof', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ valueInCents: 333, installmentTotal: 3, contractTotalInCents: 1000 }));
  await settleSparkRecurringFirebase(owner, recurringSettlement({ installmentsCount: 3 }));
  await financialRejection(settleSparkRecurringFirebase(owner, recurringSettlement({ expectedPlanRevision: 1, cycle: '2026-08',
    effectiveAt: Timestamp.fromDate(new Date('2026-08-01T12:00:00Z')), clientActionId: 'excess_installment_123456' })), /restantes/);
  await undoSparkRecurringFirebase(owner, recurringUndo({ effectiveAt: Timestamp.fromDate(new Date('2026-08-10Z')) }));
  await seedGroup({ members: { [uid]: 'admin' } });
  for (const [cycle, expected] of [['07', 9000], ['08', 10000]] as const) {
    const proof = await prepareSparkHistoryProofFirebase(owner, { groupId: 'proof', actorId: uid, accountId: 'bank',
      clientActionId: `recurring_history_${cycle}_123456`, asOf: Timestamp.fromDate(new Date(`2026-${cycle}-20Z`)), purpose: 'instant' });
    assert.equal(proof.balanceInCents, expected);
  }
});
test('Spark recurring two sessions settle once and changed preview requires new confirmation', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan());
  await acknowledgePriorSend();
  const results = await Promise.all([settleSparkRecurringFirebase(owner, recurringSettlement()), settleSparkRecurringFirebase(secondSession, recurringSettlement())]);
  assert.deepEqual(results.map(result => result.idempotent).sort(), [false, true]);
  await financialRejection(settleSparkRecurringFirebase(owner, recurringSettlement({ clientActionId: 'another_settle_123456' })), /mudou/);
  await financialRejection(settleSparkRecurringFirebase(owner, recurringSettlement({ expectedPlanRevision: 1, clientActionId: 'duplicate_cycle_123456' })), /já efetivado/);
  assert.equal((await balance('bank')).balanceInCents, 9000);
});
test('Spark recurring civil cycle is Sao Paulo, not UTC month', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan());
  await settleSparkRecurringFirebase(owner, recurringSettlement({ effectiveAt: Timestamp.fromDate(new Date('2026-08-01T01:00:00Z')) }));
  assert.equal((await getDoc(recurringCycleRef())).data()!.active, true);
  await financialRejection(settleSparkRecurringFirebase(owner, recurringSettlement({ cycle: '2026-08', effectiveAt: Timestamp.fromDate(new Date('2026-08-01T01:00:00Z')) })), /fora do ciclo/);
});
test('Spark recurring later checkpoint covers settlement; undo retains selected date', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan());
  await seedOrdinaryCheckpoint('bank', '2026-08-01T12:00:00Z', false);
  await settleSparkRecurringFirebase(owner, recurringSettlement()); assert.equal((await balance('bank')).balanceInCents, 10000);
  await undoSparkRecurringFirebase(owner, recurringUndo({ effectiveAt: Timestamp.fromDate(new Date('2026-09-01Z')) }));
  assert.equal((await balance('bank')).balanceInCents, 11000);
});
for (const [label, changes] of [
  ['invalid cycle', { cycle: '2026-13' }], ['before start', { cycle: '2026-06', effectiveAt: Timestamp.fromDate(new Date('2026-06-15Z')) }],
  ['future', { cycle: '2099-07', effectiveAt: Timestamp.fromDate(new Date('2099-07-15Z')) }], ['fractional quantity', { installmentsCount: 1.5 }],
  ['negative money', { amountInCents: -1 }], ['investment', { accountId: 'investment' }], ['foreign actor', { actorId: 'other-user' }],
  ['multiple unbounded installments', { installmentsCount: 2 }], ['stale revision', { expectedPlanRevision: 99 }],
] as const) test(`Spark recurring refuses ${label}`, async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan()); await financialRejection(settleSparkRecurringFirebase(owner, recurringSettlement(changes)));
});
test('Spark recurring contract rejects fractional/ambiguous principal and changed installment amount', async () => {
  for (const changes of [{ installmentTotal: 3, contractTotalInCents: 1000 }, { installmentTotal: 3 }, { installmentTotal: 361 },
    { contractTotalInCents: 1000 }, { installmentTotal: 2.5 }, { valueInCents: 0.5 }]) await financialRejection(createSparkRecurringPlanFirebase(owner, recurringPlan(changes)));
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ installmentTotal: 3, contractTotalInCents: 1000, valueInCents: 333 }));
  await financialRejection(settleSparkRecurringFirebase(owner, recurringSettlement({ amountInCents: 332 })), /soma contratual/);
});
async function rawRecurring(options: { undo?: boolean; omit?: 'position' | 'operation' | 'plan' | 'cycle' | 'quota';
  operation?: Record<string, any>; plan?: Record<string, any>; cycle?: Record<string, any>; position?: Record<string, any> } = {}) {
  const id = options.undo ? 'raw_undo_recurring_123456' : 'raw_recurring_123456', plan = (await getDoc(recurringPlanRef())).data()!, previousCycle = (await getDoc(recurringCycleRef())).data();
  const original = options.undo ? (await getDoc(operationRef(owner, previousCycle!.settlementOperationId))).data()! : null;
  const before = await balance('bank'), quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!;
  const amount = original?.amountInCents ?? plan.valueInCents;
  const body = { schemaVersion: 1, actorId: uid, kind: options.undo ? 'recurring_reversal' : 'recurring_settlement',
    planId: 'rent', cycle: '2026-07', expectedPlanRevision: plan.revision, effectiveAt: recurringSettlement().effectiveAt,
    note: null, overdraftReason: null, accountId: 'bank', amountInCents: amount, installmentsCount: 1, recurringType: plan.recurringType,
    differenceInCents: (options.undo ? -1 : 1) * (plan.recurringType === 'gain' ? 1 : -1) * amount,
    currentEffectInCents: (options.undo ? -1 : 1) * (plan.recurringType === 'gain' ? 1 : -1) * amount,
    expectedRevision: before.revision, previousOperationId: before.lastOperationId, installmentsBefore: plan.installmentsCompleted,
    installmentsAfter: options.undo ? previousCycle!.installmentsBefore : plan.installmentTotal === null ? 0 : plan.installmentsCompleted + 1,
    createdAt: serverTimestamp(), ...(options.undo ? { settlementOperationId: previousCycle!.settlementOperationId }
      : { categoryId: plan.categoryId, requestedAmountInCents: null }), ...options.operation };
  const batch = writeBatch(owner);
  if (options.omit !== 'operation') batch.set(operationRef(owner, id), body);
  if (options.omit !== 'position') batch.update(positionRef(owner), { balanceInCents: before.balanceInCents + body.currentEffectInCents,
    revision: before.revision + 1, lastOperationId: id, updatedAt: serverTimestamp(), ...options.position });
  if (options.omit !== 'plan') batch.update(recurringPlanRef(), { revision: plan.revision + 1, installmentsCompleted: body.installmentsAfter,
    lastOperationId: id, updatedAt: serverTimestamp(), ...options.plan });
  if (options.omit !== 'cycle') batch.set(recurringCycleRef(), options.undo ? { ...previousCycle, active: false,
    revision: previousCycle!.revision + 1, lastOperationId: id, updatedAt: serverTimestamp(), ...options.cycle }
    : { schemaVersion: 1, active: true, revision: (previousCycle?.revision ?? -1) + 1, settlementOperationId: id, lastOperationId: id,
      accountId: body.accountId, amountInCents: body.amountInCents, installmentsCount: body.installmentsCount,
      installmentsBefore: body.installmentsBefore, installmentsAfter: body.installmentsAfter, effectiveAt: body.effectiveAt,
      updatedAt: serverTimestamp(), ...options.cycle });
  const windowStart = Math.floor(Date.now() / 60_000) * 60_000;
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', lastOperationId: id, windowStartInMillis: windowStart,
    count: quota.windowStartInMillis === windowStart ? quota.count + 1 : 1, updatedAt: serverTimestamp() });
  return batch.commit();
}
test('Spark recurring raw control confirms settle and undo without trusting the service', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan()); await rawRecurring();
  assert.equal((await balance('bank')).balanceInCents, 9000);
  await rawRecurring({ undo: true, operation: { note: 'Undo control' } });
  assert.equal((await balance('bank')).balanceInCents, 10000);
});

const negotiatedRecurring = () => ({ operation: { settlementMode: 'negotiated', contractAmountInCents: 333,
  requestedAmountInCents: 300, amountInCents: 300, differenceInCents: -300, currentEffectInCents: -300, note: 'Desconto acordado' },
  cycle: { settlementMode: 'negotiated', contractAmountInCents: 333 } });
const currentReplanCycle = () => { const at = toFinancialCivilDate(new Date()); return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`; };
const replanInput = (overrides: Partial<SparkRecurringReplanInput> = {}): SparkRecurringReplanInput => ({
  groupId: 'proof', actorId: uid, clientActionId: 'replan_contract_123456', planId: 'rent', replacementPlanId: 'replacement',
  expectedPlanRevision: 0, expectedMetadataRevision: null, name: 'Contrato renegociado', categoryId: null, startCycle: currentReplanCycle(),
  installmentTotal: 2, contractTotalInCents: 701, reason: 'Renegociação do saldo remanescente',
  metadata: { dueDay: 10, usesBusinessDays: false, description: 'Condições negociadas', reminderConfigVersion: 1, reminderEnabled: true,
    reminderDaysBefore: 1, reminderOnDueDate: true, reminderHour: 9, reminderMinute: 0 }, ...overrides });
const finiteRecurring = () => createSparkRecurringPlanFirebase(owner, recurringPlan({ valueInCents: 333, installmentTotal: 3, contractTotalInCents: 1000 }));
const replanUndo = (fields: Record<string, any> = {}) => ({ groupId: 'proof', actorId: uid, clientActionId: 'undo_replan_contract_123456', planId: 'rent',
  replacementPlanId: 'replacement', replanOperationId: 'replan_contract_123456', expectedPlanRevision: 1, expectedReplacementRevision: 0, reason: 'Cancelar a negociação', ...fields });

test('Spark recurring replan preserves original history, writes successor/config atomically and replays', async () => {
  await finiteRecurring();
  await settleSparkRecurringFirebase(owner, recurringSettlement({ amountInCents: 333 }));
  const input = replanInput({ expectedPlanRevision: 1 });
  await replanSparkRecurringFirebase(owner, input);
  assert.equal((await replanSparkRecurringFirebase(secondSession, input)).idempotent, true);
  assert.equal((await balance('bank')).balanceInCents, 9667);
  const old = (await getDoc(recurringPlanRef())).data()!;
  assert.equal(old.installmentsCompleted, 1); assert.equal(old.contractTotalInCents, 1000); assert.equal(old.successorPlanId, 'replacement');
  assert.equal((await getDoc(recurringCycleRef())).data()!.active, true);
  const next = (await getDoc(doc(owner, 'financialGroups', 'proof', 'sparkRecurringPlans', 'replacement'))).data()!;
  assert.equal(next.installmentsCompleted, 0); assert.equal(next.valueInCents, 350); assert.equal(next.predecessorPlanId, 'rent');
  assert.equal((await getDoc(doc(owner, 'financialGroups', 'proof', 'sparkRecurringMetadata', 'replacement'))).data()!.dueDay, 10);
  await financialRejection(undoSparkRecurringFirebase(owner, recurringUndo({ expectedPlanRevision: 2, clientActionId: 'blocked_undo_123456' })), /replanejamento/);
  await undoSparkRecurringReplanFirebase(owner, replanUndo({ expectedPlanRevision: 2 }));
  assert.equal((await undoSparkRecurringReplanFirebase(owner, replanUndo({ expectedPlanRevision: 2 }))).idempotent, true);
  assert.equal((await getDoc(recurringPlanRef())).data()!.active, true);
  await undoSparkRecurringFirebase(owner, recurringUndo({ expectedPlanRevision: 3 }));
  assert.equal((await balance('bank')).balanceInCents, 10000);
});
test('Spark recurring replan undo requires reversing successor payments and prevents restoring cancelled successor', async () => {
  await finiteRecurring(); await replanSparkRecurringFirebase(owner, replanInput());
  const cycle = currentReplanCycle(), date = Timestamp.now();
  await settleSparkRecurringFirebase(owner, recurringSettlement({ planId: 'replacement', cycle, effectiveAt: date, amountInCents: 350 }));
  await financialRejection(undoSparkRecurringReplanFirebase(owner, replanUndo({ expectedReplacementRevision: 1, clientActionId: 'blocked_replan_undo_123456' })), /pagamentos/);
  await undoSparkRecurringFirebase(owner, recurringUndo({ planId: 'replacement', cycle, expectedPlanRevision: 1, effectiveAt: date }));
  await undoSparkRecurringReplanFirebase(owner, replanUndo({ expectedReplacementRevision: 2 }));
  await financialRejection(updateSparkRecurringPlanFirebase(owner, { ...replanUndo(), clientActionId: 'restore_cancelled_123456', planId: 'replacement',
    expectedPlanRevision: 3, name: 'Restaurar', categoryId: null, valueInCents: 350, active: true }), /substituído/);
  assert.equal((await balance('bank')).balanceInCents, 10000);
});
async function rawReplan(options: { omit?: 'operation' | 'old' | 'next' | 'metadata' | 'quota'; operation?: Record<string, any>;
  old?: Record<string, any>; next?: Record<string, any>; metadata?: Record<string, any> } = {}) {
  const input = replanInput(), id = input.clientActionId, [year, month] = input.startCycle.split('-').map(Number), end = new Date(Date.UTC(year, month, 1));
  const endCycle = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}`;
  const { groupId: _, clientActionId: __, metadata, ...fields } = input;
  const operation = { ...fields, ...metadata, schemaVersion: 1, kind: 'recurring_replan', recurringType: 'expense', endCycle, valueInCents: 350,
    originalContractTotalInCents: 1000, originalInstallmentTotal: 3, originalInstallmentsCompleted: 0, createdAt: serverTimestamp(), ...options.operation };
  const old = (await getDoc(recurringPlanRef())).data()!, quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!;
  const batch = writeBatch(owner), group = doc(owner, 'financialGroups', 'proof');
  if (options.omit !== 'operation') batch.set(operationRef(owner, id), operation);
  if (options.omit !== 'old') batch.update(recurringPlanRef(), { active: false, revision: old.revision + 1, successorPlanId: 'replacement', replanOperationId: id,
    lastOperationId: id, updatedAt: serverTimestamp(), ...options.old });
  if (options.omit !== 'next') batch.set(doc(group, 'sparkRecurringPlans', 'replacement'), { schemaVersion: 1, actorId: uid, recurringType: 'expense', name: input.name,
    categoryId: null, startCycle: input.startCycle, endCycle, historyFromCycle: input.startCycle, valueInCents: 350, installmentTotal: 2, contractTotalInCents: 701,
    installmentsCompleted: 0, active: true, revision: 0, predecessorPlanId: 'rent', replanOriginOperationId: id, lastOperationId: id,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...options.next });
  if (options.omit !== 'metadata') batch.set(doc(group, 'sparkRecurringMetadata', 'replacement'), { schemaVersion: 1, actorId: uid, ...metadata,
    revision: 0, lastOperationId: id, updatedAt: serverTimestamp(), ...options.metadata });
  const window = Math.floor(Date.now() / 60000) * 60000;
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', windowStartInMillis: window,
    count: quota.windowStartInMillis === window ? quota.count + 1 : 1, lastOperationId: id, updatedAt: serverTimestamp() });
  return batch.commit();
}
test('Spark recurring raw replan control validates the SDK independent protocol', async () => { await finiteRecurring(); await rawReplan(); });
for (const omit of ['operation', 'old', 'next', 'metadata', 'quota'] as const) test(`Spark recurring replan Rules refuse missing ${omit}`, async () => {
  await finiteRecurring(); await denied(rawReplan({ omit })); assert.equal((await getDoc(recurringPlanRef())).data()!.active, true);
});
for (const [label, options] of [
  ['old counter', { old: { installmentsCompleted: 1 } }], ['old contract', { old: { contractTotalInCents: 701 } }],
  ['active predecessor', { old: { active: true } }], ['foreign successor', { next: { actorId: 'foreign' } }],
  ['forged predecessor', { next: { predecessorPlanId: 'another' } }], ['successor counter', { next: { installmentsCompleted: 1 } }],
  ['wrong remainder', { next: { valueInCents: 351 } }], ['forged origin', { next: { replanOriginOperationId: 'another_123456' } }],
  ['mismatched type', { next: { recurringType: 'gain' } }], ['metadata mismatch', { metadata: { dueDay: 11 } }],
  ['empty reason', { operation: { reason: '' } }], ['forged original amount', { operation: { originalContractTotalInCents: 701 } }],
  ['unknown receipt field', { operation: { unrestricted: true } }], ['stale metadata', { operation: { expectedMetadataRevision: 3 } }],
] as const) test(`Spark recurring replan Rules refuse ${label}`, async () => { await finiteRecurring(); await denied(rawReplan(options)); });

test('Spark recurring late control preserves remainder and reverses only actual late payment', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ startCycle: '2026-06', valueInCents: 333, installmentTotal: 1, contractTotalInCents: 333 }));
  await rawRecurring({ operation: { lateSettlement: true, note: 'Liquidação atrasada' }, cycle: { lateSettlement: true } });
  assert.equal((await balance('bank')).balanceInCents, 9667);
  await rawRecurring({ undo: true }); assert.equal((await balance('bank')).balanceInCents, 10000);
});
for (const [label, options] of [
  ['missing explicit mode', {}], ['missing reason', { operation: { lateSettlement: true }, cycle: { lateSettlement: true } }],
  ['missing cycle mode', { operation: { lateSettlement: true, note: 'Atraso' } }],
  ['wrong cycle mode', { operation: { lateSettlement: true, note: 'Atraso' }, cycle: { lateSettlement: false } }],
] as const) test(`Spark recurring late Rules refuse ${label}`, async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ startCycle: '2026-06', valueInCents: 333, installmentTotal: 1, contractTotalInCents: 333 }));
  await denied(rawRecurring(options)); assert.equal((await balance('bank')).balanceInCents, 10000);
});
test('Spark recurring negotiated raw control preserves contract and reverses only actual cash', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ valueInCents: 333, installmentTotal: 3, contractTotalInCents: 1000 }));
  await rawRecurring(negotiatedRecurring());
  assert.equal((await balance('bank')).balanceInCents, 9700);
  assert.equal((await getDoc(recurringCycleRef())).data()!.contractAmountInCents, 333);
  await rawRecurring({ undo: true }); assert.equal((await balance('bank')).balanceInCents, 10000);
  assert.equal((await getDoc(recurringPlanRef())).data()!.installmentsCompleted, 0);
});
for (const [label, changes] of [
  ['forged nominal', { operation: { contractAmountInCents: 332 }, cycle: { contractAmountInCents: 332 } }],
  ['missing reason', { operation: { note: null } }], ['empty reason', { operation: { note: '' } }],
  ['missing actual amount', { operation: { requestedAmountInCents: null } }],
  ['different actual amount', { operation: { requestedAmountInCents: 301 } }],
  ['unknown mode', { operation: { settlementMode: 'automatic' } }],
  ['cycle nominal mismatch', { cycle: { contractAmountInCents: 334 } }],
  ['cycle mode mismatch', { cycle: { settlementMode: 'automatic' } }],
  ['missing cycle nominal', { cycle: { contractAmountInCents: null } }],
] as const) test(`Spark recurring negotiated Rules reject ${label} without partial changes`, async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ valueInCents: 333, installmentTotal: 3, contractTotalInCents: 1000 }));
  const control = negotiatedRecurring();
  await denied(rawRecurring({ operation: { ...control.operation, ...changes.operation }, cycle: { ...control.cycle, ...changes.cycle } }));
  assert.equal((await balance('bank')).balanceInCents, 10000);
  assert.equal((await getDoc(recurringPlanRef())).data()!.installmentsCompleted, 0);
});
for (const type of ['expense', 'gain'] as const) test(`Spark recurring negotiated Rules refuse unbounded ${type}`, async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ recurringType: type }));
  await denied(rawRecurring(negotiatedRecurring()));
});
test('Spark recurring negotiated Rules refuse finite gains', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ recurringType: 'gain', valueInCents: 333, installmentTotal: 3, contractTotalInCents: 1000 }));
  const control = negotiatedRecurring();
  await denied(rawRecurring({ ...control, operation: { ...control.operation, differenceInCents: 300, currentEffectInCents: 300 } }));
});
for (const omit of ['position', 'operation', 'plan', 'cycle', 'quota'] as const) test(`Spark recurring Rules reject undo missing ${omit}`, async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan()); await settleSparkRecurringFirebase(owner, recurringSettlement());
  await denied(rawRecurring({ undo: true, omit })); assert.equal((await balance('bank')).balanceInCents, 9000);
  assert.equal((await getDoc(recurringCycleRef())).data()!.active, true);
});
test('Spark recurring Rules enforce reverse order without client validation', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ valueInCents: 333, installmentTotal: 3, contractTotalInCents: 1000 }));
  await settleSparkRecurringFirebase(owner, recurringSettlement());
  await settleSparkRecurringFirebase(owner, recurringSettlement({ cycle: '2026-08', effectiveAt: Timestamp.fromDate(new Date('2026-08-15Z')),
    expectedPlanRevision: 1, clientActionId: 'next_recurring_123456' }));
  await denied(rawRecurring({ undo: true })); assert.equal((await getDoc(recurringPlanRef())).data()!.installmentsCompleted, 2);
});
test('Spark recurring definition edit and archive preserve history and permit a later undo', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan()); await settleSparkRecurringFirebase(owner, recurringSettlement());
  const edit = { groupId: 'proof', actorId: uid, planId: 'rent', clientActionId: 'edit_recurring_123456', expectedPlanRevision: 1,
    name: 'Novo aluguel', categoryId: null, valueInCents: 1500, active: false };
  await updateSparkRecurringPlanFirebase(owner, edit);
  assert.equal((await updateSparkRecurringPlanFirebase(secondSession, edit)).idempotent, true);
  assert.equal((await getDoc(recurringCycleRef())).data()!.amountInCents, 1000);
  await financialRejection(settleSparkRecurringFirebase(owner, recurringSettlement({ expectedPlanRevision: 2, cycle: '2026-08',
    effectiveAt: Timestamp.fromDate(new Date('2026-08-15Z')), clientActionId: 'inactive_recurring_123456' })), /indisponível/);
  await undoSparkRecurringFirebase(owner, recurringUndo({ expectedPlanRevision: 2 }));
  assert.equal((await balance('bank')).balanceInCents, 10000);
  await updateSparkRecurringPlanFirebase(owner, { ...edit, expectedPlanRevision: 3, active: true, clientActionId: 'restore_recurring_123456' });
  await settleSparkRecurringFirebase(owner, recurringSettlement({ expectedPlanRevision: 4, clientActionId: 'edited_value_123456' }));
  assert.equal((await balance('bank')).balanceInCents, 8500);
});
for (const omit of ['position', 'operation', 'plan', 'cycle', 'quota'] as const) test(`Spark recurring Rules reject missing ${omit} atomically`, async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan()); await denied(rawRecurring({ omit }));
  assert.equal((await balance('bank')).balanceInCents, 10000);
  assert.equal((await getDoc(recurringPlanRef())).data()!.revision, 0); assert.equal((await getDoc(recurringCycleRef())).exists(), false);
});
for (const [label, options] of [
  ['invented amount', { operation: { amountInCents: 1001, differenceInCents: -1001, currentEffectInCents: -1001 } }],
  ['wrong direction', { operation: { differenceInCents: 1000, currentEffectInCents: 1000 } }],
  ['invented effect', { operation: { currentEffectInCents: -999 } }],
  ['fake quantity', { operation: { installmentsCount: 2 } }],
  ['fake installments', { operation: { installmentsAfter: 1 } }],
  ['stale preview', { operation: { expectedPlanRevision: 99 } }],
  ['wrong civil cycle', { operation: { effectiveAt: Timestamp.fromDate(new Date('2026-08-01T03:00:00Z')) } }],
  ['source namespace', { operation: { sourceReferences: [] } }],
  ['extra category', { operation: { categoryId: 'unknown' } }],
  ['changed principal', { plan: { contractTotalInCents: 1 } }],
  ['changed actor', { plan: { actorId: 'other' } }],
  ['counter without increment', { plan: { revision: 0 } }],
  ['fake cycle revision', { cycle: { revision: 99 } }],
  ['foreign cycle account', { cycle: { accountId: 'third' } }],
  ['wrong predecessor', { operation: { previousOperationId: 'foreign_123456' } }],
  ['floating cents', { operation: { amountInCents: 1.5 } }],
] as const) test(`Spark recurring Rules reject ${label}`, async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan()); await denied(rawRecurring(options));
});
test('Spark recurring Rules enforce contractual remainder and owner even for an admin', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ valueInCents: 333, installmentTotal: 3, contractTotalInCents: 1000 }));
  await denied(rawRecurring({ operation: { amountInCents: 334, differenceInCents: -334, currentEffectInCents: -334 } }));
  await seedGroup({ members: { [uid]: 'admin' } });
  await environment.withSecurityRulesDisabled(async context => seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups/proof/sparkRecurringPlans/rent'), { actorId: 'another-owner' }));
  await denied(rawRecurring());
  await financialRejection(settleSparkRecurringFirebase(owner, recurringSettlement()), /proprietário/);
});
test('Spark recurring definition and cycle cannot be deleted or reset for a second charge', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan()); await settleSparkRecurringFirebase(owner, recurringSettlement());
  for (const ref of [recurringPlanRef(), recurringCycleRef()]) { const batch = writeBatch(owner); batch.delete(ref); await denied(batch.commit()); }
  const reset = writeBatch(owner); reset.update(recurringCycleRef(), { active: false, revision: 0 }); await denied(reset.commit());
  await denied(rawRecurring()); assert.equal((await balance('bank')).balanceInCents, 9000);
});
test('Spark recurring category, quota, overdraft and currentness use existing financial guards', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    await seedSetDoc(seedDoc(context.firestore(), 'users', uid), { financialGroupId: 'proof', relatedIdUsers: [] });
    await seedSetDoc(seedDoc(context.firestore(), 'tags', 'rent_category'), { personId: uid, groupId: 'proof', usageType: 'expense' });
  });
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ categoryId: 'rent_category' }));
  await financialRejection(settleSparkRecurringFirebase(owner, recurringSettlement({ amountInCents: 11000, clientActionId: 'unjustified_recurring_123456' })), /justificativa/);
  await settleSparkRecurringFirebase(owner, recurringSettlement({ amountInCents: 11000, overdraftReason: 'Confirmado' }));
  assert.equal((await balance('bank')).balanceInCents, -1000);
  await environment.withSecurityRulesDisabled(async context => seedDeleteDoc(seedDoc(context.firestore(), 'tags', 'rent_category')));
  await undoSparkRecurringFirebase(owner, recurringUndo()); assert.equal((await balance('bank')).balanceInCents, 10000);
});
test('Spark recurring rejects expired opening deadline in service and direct Rules', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan());
  await seedPosition('bank', { nextActivationAt: Timestamp.fromMillis(Date.now() - 1000) });
  await financialRejection(settleSparkRecurringFirebase(owner, recurringSettlement()), /aberturas mensais vencidas/);
  await denied(rawRecurring()); assert.equal((await getDoc(recurringPlanRef())).data()!.revision, 0);
});
test('Spark recurring quota is obligatory at the limit without partial cycle updates', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan());
  await environment.withSecurityRulesDisabled(async context => seedUpdateDoc(seedDoc(context.firestore(), 'sparkTransferQuotas', uid), {
    count: 120, windowStartInMillis: Math.floor(Date.now() / 60_000) * 60_000,
  }));
  await financialRejection(settleSparkRecurringFirebase(owner, recurringSettlement()), /Limite temporário/);
  await denied(rawRecurring()); assert.equal((await getDoc(recurringCycleRef())).exists(), false);
});
test('Spark recurring changed category usage cannot bypass server validation', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    await seedSetDoc(seedDoc(context.firestore(), 'users', uid), { financialGroupId: 'proof', relatedIdUsers: [] });
    await seedSetDoc(seedDoc(context.firestore(), 'tags', 'rent_category'), { personId: uid, usageType: 'expense' });
  });
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ categoryId: 'rent_category' }));
  await environment.withSecurityRulesDisabled(async context => seedUpdateDoc(seedDoc(context.firestore(), 'tags', 'rent_category'), { usageType: 'gain' }));
  await denied(rawRecurring()); assert.equal((await balance('bank')).balanceInCents, 10000);
});
const recurringMetadata = () => ({ dueDay: 10, usesBusinessDays: true, description: 'Descrição', reminderConfigVersion: 1 as const,
  reminderEnabled: true, reminderDaysBefore: 2, reminderOnDueDate: true, reminderHour: 9, reminderMinute: 30 });
const metadataInput = () => ({ groupId: 'proof', actorId: uid, clientActionId: 'metadata_recurring_123456', planId: 'rent', expectedMetadataRevision: null,
  metadata: recurringMetadata() });
test('Spark recurring metadata saves due date/business days/reminders without changing money or plan revision', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan()); const input = metadataInput();
  await saveSparkRecurringMetadataFirebase(owner, input);
  assert.equal((await saveSparkRecurringMetadataFirebase(secondSession, input)).idempotent, true);
  const metadataRef = doc(owner, 'financialGroups/proof/sparkRecurringMetadata/rent');
  assert.equal((await getDoc(metadataRef)).data()!.usesBusinessDays, true);
  assert.equal((await getDoc(recurringPlanRef())).data()!.revision, 0); assert.equal((await balance('bank')).balanceInCents, 10000);
  await saveSparkRecurringMetadataFirebase(owner, { ...input, clientActionId: 'edit_metadata_123456', expectedMetadataRevision: 0, metadata: { ...input.metadata, dueDay: 15 } });
  await financialRejection(saveSparkRecurringMetadataFirebase(owner, { ...input, clientActionId: 'stale_metadata_123456', expectedMetadataRevision: 0 }), /alterados/);
  const del = writeBatch(owner); del.delete(metadataRef); await denied(del.commit());
});
async function rawRecurringMetadata(changes: Record<string, any> = {}, omit?: 'metadata' | 'operation' | 'quota') {
  const id = 'raw_metadata_123456', batch = writeBatch(owner), values = { ...recurringMetadata(), ...changes };
  const data = { schemaVersion: 1, actorId: uid, ...values, revision: 0, lastOperationId: id, updatedAt: serverTimestamp() };
  if (omit !== 'metadata') batch.set(doc(owner, 'financialGroups/proof/sparkRecurringMetadata/rent'), data);
  if (omit !== 'operation') batch.set(operationRef(owner, id), { schemaVersion: 1, actorId: uid, kind: 'recurring_metadata_update', planId: 'rent',
    expectedMetadataRevision: null, ...values, createdAt: serverTimestamp() });
  if (omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', count: 2,
    windowStartInMillis: Math.floor(Date.now() / 60_000) * 60_000, lastOperationId: id, updatedAt: serverTimestamp() });
  return batch.commit();
}
for (const [label, changes] of [
  ['due day', { dueDay: 32 }], ['hour', { reminderHour: 24 }], ['minute', { reminderMinute: -1 }],
  ['days before', { reminderDaysBefore: 4 }], ['unversioned opt in', { reminderConfigVersion: 0 }],
  ['empty schedule', { reminderDaysBefore: 0, reminderOnDueDate: false }], ['no due date with enabled reminder', { dueDay: null }],
  ['business days type', { usesBusinessDays: 'true' }], ['description limit', { description: 'x'.repeat(2001) }],
  ['unknown data', { contractTotalInCents: 1 }],
] as const) test(`Spark recurring metadata Rules and service reject ${label}`, async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan()); await denied(rawRecurringMetadata(changes));
  await financialRejection(saveSparkRecurringMetadataFirebase(owner, { ...metadataInput(), metadata: { ...recurringMetadata(), ...changes } as any }));
});
for (const omit of ['metadata', 'operation', 'quota'] as const) test(`Spark recurring metadata rejects missing ${omit}`, async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan()); await denied(rawRecurringMetadata({}, omit));
});
test('Spark recurring metadata raw control succeeds and admin cannot edit another owner', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan()); await rawRecurringMetadata();
  await seedGroup({ members: { [uid]: 'admin' } });
  await environment.withSecurityRulesDisabled(async context => seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups/proof/sparkRecurringPlans/rent'), { actorId: 'another-owner' }));
  await financialRejection(saveSparkRecurringMetadataFirebase(owner, { ...metadataInput(), clientActionId: 'foreign_metadata_123456', expectedMetadataRevision: 0 }), /proprietário/);
});
test('Spark recurring history coverage blocks unknown cycles in service and direct Rules', async () => {
  await createSparkRecurringPlanFirebase(owner, recurringPlan());
  await environment.withSecurityRulesDisabled(async context => seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups/proof/sparkRecurringPlans/rent'), { historyFromCycle: '2026-09' }));
  await financialRejection(settleSparkRecurringFirebase(owner, recurringSettlement()), /Histórico indisponível/);
  await denied(rawRecurring());
  await denied(rawRecurring({ plan: { historyFromCycle: '2026-07' } }));
});
function ordinaryCommand(overrides: Partial<SparkMovementInput> = {}): SparkMovementInput {
  return { groupId: 'proof', actorId: uid, clientActionId: 'ordinary_123456', accountId: 'bank',
    kind: 'income', amountInCents: 1000, effectiveAt: Timestamp.fromDate(new Date('2026-09-10T12:00:00Z')), ...overrides };
}
test('Spark ordinary quota minute boundary retries once after authenticated absence check', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const clock = Date.now, input = { groupId: 'proof', actorId: uid, clientActionId: 'minute_boundary_123456' };
  let preparations = 0, writes = 0;
  try {
    const result = await runSparkOperation(owner, input, () => {
      if (++preparations === 2) Date.now = () => clock() - 60_000;
      return { kind: 'account_opening', accountId: 'clockbank', accountKind: 'bank', openingBalanceInCents: 0, note: null };
    }, async transaction => {
      Date.now = clock; writes++;
      transaction.set(positionRef(owner, 'clockbank'), { schemaVersion: 1, kind: 'bank', active: true, balanceInCents: 0,
        revision: 0, lastOperationId: input.clientActionId, nextActivationAt: null, updatedAt: serverTimestamp() });
    });
    assert.equal(result.idempotent, false); assert.equal(writes, 2); assert.equal(preparations, 4);
    assert.equal((await balance('clockbank')).revision, 0);
    assert.equal((await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!.count, 1);
  } finally { Date.now = clock; }
});
test('Spark ordinary quota waits across a near-minute clock difference after checking authenticated absence', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const clock = Date.now, phase = clock() % 60000;
  if (phase > 58000) await new Promise(resolve => setTimeout(resolve, 60100 - phase));
  const anchor = clock(), offset = Math.floor(anchor / 60000) * 60000 - 900 - anchor;
  let writes = 0;
  try {
    Date.now = () => clock() + offset;
    const input = { groupId: 'proof', actorId: uid, clientActionId: 'near_minute_boundary_123456' };
    const result = await runSparkOperation(owner, input, () => ({ kind: 'account_opening', accountId: 'clockbank', accountKind: 'bank', openingBalanceInCents: 0, note: null }),
      async transaction => {
        writes += 1;
        transaction.set(positionRef(owner, 'clockbank'), { schemaVersion: 1, kind: 'bank', active: true, balanceInCents: 0,
          revision: 0, lastOperationId: input.clientActionId, nextActivationAt: null, updatedAt: serverTimestamp() });
      });
    // A borda é resolvida na admissão, antes de tentar gravar o efeito financeiro.
    assert.equal(result.idempotent, false); assert.equal(writes, 1); assert.equal((await balance('clockbank')).revision, 0);
    assert.equal((await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!.count, 1);
  } finally { Date.now = clock; }
});
test('Spark ordinary quota recovery does not retry an unrelated denied write in the middle of a minute', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); let writes = 0;
  const input = { groupId: 'proof', actorId: uid, clientActionId: 'invalid_opening_boundary_123456' };
  await denied(runSparkOperation(owner, input, () => ({ kind: 'account_opening', accountId: 'clockbank', accountKind: 'bank', openingBalanceInCents: 1, note: null }),
    async transaction => {
      writes += 1;
      transaction.set(positionRef(owner, 'clockbank'), { schemaVersion: 1, kind: 'bank', active: true, balanceInCents: 0,
        revision: 0, lastOperationId: input.clientActionId, nextActivationAt: null, updatedAt: serverTimestamp() });
    }));
  assert.equal(writes, 1); assert.equal((await getDoc(operationRef(owner, input.clientActionId))).exists(), false);
});
function resolution(overrides: Record<string, any> = {}) {
  return { groupId: 'proof', actorId: uid, clientActionId: 'resolve_123456', originalOperationId: 'ordinary_123456',
    effectiveAt: Timestamp.fromDate(new Date('2026-09-12T12:00:00Z')), ...overrides };
}
async function seedOrdinaryCheckpoint(accountId: string, at: string, includesBoundary: boolean) {
  await environment.withSecurityRulesDisabled(async context => seedSetDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkCheckpoints', accountId), {
    operationId: `bootstrap_${accountId}`, countedBalanceInCents: fixtures[accountId as keyof typeof fixtures].balanceInCents,
    effectiveAt: new Date(at), includesBoundary,
  }));
}
async function rawOrdinary(changes: Record<string, any> = {}, options: { omit?: 'position' | 'quota' | 'claim'; position?: Record<string, unknown> } = {}) {
  const id = 'forged_ordinary_123456', before = await balance('bank');
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data();
  const start = Math.floor(Date.now() / 60_000) * 60_000;
  const data = { schemaVersion: 1, actorId: uid, kind: 'income', accountId: 'bank', amountInCents: 1000,
    effectiveAt: ordinaryCommand().effectiveAt, categoryId: null, note: null, overdraftReason: null,
    differenceInCents: 1000, currentEffectInCents: 1000, expectedRevision: before.revision, previousOperationId: before.lastOperationId,
    createdAt: serverTimestamp(), ...changes };
  const batch = writeBatch(owner); batch.set(operationRef(owner, id), Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
  if (options.omit !== 'position') batch.update(positionRef(owner), { balanceInCents: before.balanceInCents + data.currentEffectInCents,
    revision: before.revision + 1, lastOperationId: id, updatedAt: serverTimestamp(), ...options.position });
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof',
    windowStartInMillis: start, count: quota?.windowStartInMillis === start ? quota.count + 1 : 1, lastOperationId: id, updatedAt: serverTimestamp() });
  if (data.kind === 'movement_reversal' && options.omit !== 'claim') batch.set(doc(owner, 'financialGroups', 'proof',
    data.originalSource === 'imported' ? 'sparkImportedClaims' : 'sparkMovementClaims', data.originalOperationId), {
    schemaVersion: 1, actorId: uid, reversalOperationId: id, createdAt: serverTimestamp(),
  });
  return batch.commit();
}

test('Spark ordinary income/expense commit, replay and immutable receipts', async () => {
  for (const [kind, expected] of [['income', 11000], ['expense', 10000]] as const) {
    const input = ordinaryCommand({ kind, clientActionId: `ordinary_${kind}_123456` });
    assert.equal((await postSparkMovementFirebase(owner, input)).idempotent, false);
    assert.equal((await postSparkMovementFirebase(secondSession, input)).idempotent, true);
    assert.equal((await balance('bank')).balanceInCents, expected);
    await financialRejection(postSparkMovementFirebase(owner, { ...input, amountInCents: 999 }), /outros argumentos/);
    await denied(rawBatch(owner, { id: input.clientActionId }).commit());
  }
});
test('Spark ordinary concurrent action commits once; distinct expenses cannot overdraw cash', async () => {
  const input = ordinaryCommand();
  await acknowledgePriorSend();
  const results = await Promise.all([postSparkMovementFirebase(owner, input), postSparkMovementFirebase(secondSession, input)]);
  assert.deepEqual(results.map(result => result.idempotent).sort(), [false, true]);
  const expense = ordinaryCommand({ kind: 'expense', accountId: 'cash', amountInCents: 7000 });
  await acknowledgePriorSend();
  const race = await Promise.allSettled([postSparkMovementFirebase(owner, { ...expense, clientActionId: 'cash_expense_a_123456' }),
    postSparkMovementFirebase(secondSession, { ...expense, clientActionId: 'cash_expense_b_123456' })]);
  assert.equal(race.filter(result => result.status === 'fulfilled').length, 1); assert.equal((await balance('cash')).balanceInCents, 3000);
});
for (const [name, changes] of [
  ['fraction', { amountInCents: 0.5 }], ['zero', { amountInCents: 0 }], ['overflow', { amountInCents: 1e12 + 1 }],
  ['future', { effectiveAt: Timestamp.fromDate(new Date('2099-01-01Z')) }], ['investment', { accountId: 'investment' }],
  ['actor', { actorId: 'not-current-user' }], ['unknown direction', { kind: 'transfer' }],
] as const) test(`Spark ordinary rejects ${name}`, async () => { await financialRejection(postSparkMovementFirebase(owner, ordinaryCommand(changes as any))); });
for (const inclusive of [false, true]) test(`Spark ordinary checkpoint boundary inclusive=${inclusive}`, async () => {
  await seedOrdinaryCheckpoint('bank', '2026-09-10T12:00:00Z', inclusive);
  await postSparkMovementFirebase(owner, ordinaryCommand());
  assert.equal((await balance('bank')).balanceInCents, inclusive ? 11000 : 10000);
  await reverseSparkMovementFirebase(owner, resolution({ effectiveAt: ordinaryCommand().effectiveAt }));
  assert.equal((await balance('bank')).balanceInCents, 10000);
});
test('Spark ordinary backdated movement covered by later count has zero current effect', async () => {
  await seedOrdinaryCheckpoint('bank', '2026-09-11T12:00:00Z', true);
  await postSparkMovementFirebase(owner, ordinaryCommand()); assert.equal((await balance('bank')).balanceInCents, 10000);
  await reverseSparkMovementFirebase(owner, resolution()); assert.equal((await balance('bank')).balanceInCents, 9000);
  assert.equal((await balance('bank')).revision, 2);
});
test('Spark ordinary correction same account validates net, repeated corrections resolve only replacement', async () => {
  await postSparkMovementFirebase(owner, ordinaryCommand({ accountId: 'cash' }));
  await postSparkMovementFirebase(owner, ordinaryCommand({ accountId: 'cash', kind: 'expense', amountInCents: 11000, clientActionId: 'spend_all_123456' }));
  const correction = { ...resolution(), accountId: 'cash', amountInCents: 1500 };
  await correctSparkMovementFirebase(owner, correction); assert.equal((await balance('cash')).balanceInCents, 500);
  assert.equal((await correctSparkMovementFirebase(secondSession, correction)).idempotent, true);
  await financialRejection(reverseSparkMovementFirebase(owner, resolution({ clientActionId: 'again_123456' })), /já estornado/);
  await correctSparkMovementFirebase(owner, { ...correction, originalOperationId: correction.clientActionId, clientActionId: 'correct_again_123456', amountInCents: 2000 });
  assert.equal((await balance('cash')).balanceInCents, 1000);
  await financialRejection(reverseSparkMovementFirebase(owner, resolution({ originalOperationId: 'correct_again_123456', accountId: 'cash', clientActionId: 'reverse_new_123456' })), /insuficiente/);
});
test('Spark ordinary correction changes account atomically and projects the new date', async () => {
  await postSparkMovementFirebase(owner, ordinaryCommand());
  await correctSparkMovementFirebase(owner, { ...resolution(), accountId: 'third', amountInCents: 700 });
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('third')).balanceInCents, 800);
  await seedGroup({ members: { [uid]: 'admin' } });
  for (const [accountId, time, expected] of [['bank', '2026-09-11Z', 11000], ['bank', '2026-09-13Z', 10000],
    ['third', '2026-09-11Z', 100], ['third', '2026-09-13Z', 800]] as const) {
    const proof = await prepareSparkHistoryProofFirebase(owner, { groupId: 'proof', actorId: uid, accountId,
      clientActionId: `ordinary_proof_${accountId}_${expected}`, purpose: 'instant', asOf: Timestamp.fromDate(new Date(time)) });
    assert.equal(proof.balanceInCents, expected);
  }
  await reverseSparkMovementFirebase(owner, resolution({ originalOperationId: 'resolve_123456', clientActionId: 'reverse_substitute_123456' }));
  assert.equal((await balance('third')).balanceInCents, 100);
});
test('Spark ordinary correction uses checkpoint of each account', async () => {
  await postSparkMovementFirebase(owner, ordinaryCommand());
  await seedOrdinaryCheckpoint('third', '2026-09-13T12:00:00Z', false);
  await correctSparkMovementFirebase(owner, { ...resolution(), accountId: 'third', amountInCents: 700 });
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('third')).balanceInCents, 100);
});
test('Spark ordinary correction/reversal race shares single claim', async () => {
  await postSparkMovementFirebase(owner, ordinaryCommand());
  await acknowledgePriorSend();
  const results = await Promise.allSettled([correctSparkMovementFirebase(owner, { ...resolution(), accountId: 'bank', amountInCents: 700 }),
    reverseSparkMovementFirebase(secondSession, resolution({ clientActionId: 'competing_reverse_123456' }))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await balance('bank')).revision, 2);
});
test('Spark ordinary author or admin resolves, other member and revoked session cannot', async () => {
  await postSparkMovementFirebase(owner, ordinaryCommand());
  await environment.withSecurityRulesDisabled(async context => seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkOperations', 'ordinary_123456'), { actorId: 'another-member' }));
  await financialRejection(reverseSparkMovementFirebase(owner, resolution()), /próprios/);
  await seedGroup({ members: { [uid]: 'admin' } }); await reverseSparkMovementFirebase(owner, resolution());
  await seedGroup({ members: {} }); await financialRejection(reverseSparkMovementFirebase(owner, resolution()));
});
test('Spark ordinary category usage/scope validated and old missing category does not block reversal', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    await seedSetDoc(seedDoc(context.firestore(), 'tags', 'ordinary_tag'), { personId: uid, usageType: 'gain' });
    await seedSetDoc(seedDoc(context.firestore(), 'users', uid), { financialGroupId: 'proof', relatedIdUsers: [] });
  });
  await postSparkMovementFirebase(owner, ordinaryCommand({ categoryId: 'ordinary_tag' }));
  await financialRejection(postSparkMovementFirebase(owner, ordinaryCommand({ clientActionId: 'wrong_category_123456', kind: 'expense', categoryId: 'ordinary_tag' })), /Categoria/);
  await environment.withSecurityRulesDisabled(async context => seedDeleteDoc(seedDoc(context.firestore(), 'tags', 'ordinary_tag')));
  await reverseSparkMovementFirebase(owner, resolution()); assert.equal((await balance('bank')).balanceInCents, 10000);
});
test('Spark ordinary correction with category across two accounts stays within Rules access budget', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    await seedSetDoc(seedDoc(context.firestore(), 'tags', 'ordinary_tag'), { groupId: 'proof', personId: uid, usageType: 'both' });
    await seedSetDoc(seedDoc(context.firestore(), 'users', uid), { financialGroupId: 'proof', relatedIdUsers: [] });
  });
  await postSparkMovementFirebase(owner, ordinaryCommand());
  await correctSparkMovementFirebase(owner, { ...resolution(), accountId: 'third', amountInCents: 700, categoryId: 'ordinary_tag' });
  assert.equal((await balance('third')).balanceInCents, 800);
});
test('Spark ordinary history segments preserve net terms of successive same-account corrections', async () => {
  await postSparkMovementFirebase(owner, ordinaryCommand());
  await correctSparkMovementFirebase(owner, { ...resolution(), accountId: 'bank', amountInCents: 700 });
  await correctSparkMovementFirebase(owner, { ...resolution({ clientActionId: 'correct_second_123456', originalOperationId: 'resolve_123456' }), accountId: 'bank', amountInCents: 900 });
  await seedGroup({ members: { [uid]: 'admin' } });
  const segment = await certifySparkHistorySegmentFirebase(owner, { groupId: 'proof', actorId: uid, accountId: 'bank',
    nodeCount: 2, lastRevision: 3, olderOperationId: 'resolve_123456', newerOperationId: 'correct_second_123456' });
  assert.equal(segment.segment!.deltaInCents, -100);
  const proof = await prepareSparkHistoryProofFirebase(owner, { groupId: 'proof', actorId: uid, accountId: 'bank',
    clientActionId: 'ordinary_segment_proof_123456', purpose: 'instant', asOf: Timestamp.fromDate(new Date('2026-09-13Z')) }, 100, { useSegments: true });
  assert.equal(proof.balanceInCents, 10900);
});
test('Spark ordinary bank overdraft requires reason; cash remains nonnegative', async () => {
  await financialRejection(postSparkMovementFirebase(owner, ordinaryCommand({ kind: 'expense', amountInCents: 11000, clientActionId: 'unjustified_movement_123456' })), /justificativa/);
  await postSparkMovementFirebase(owner, ordinaryCommand({ kind: 'expense', amountInCents: 11000, overdraftReason: 'Confirmado' }));
  assert.equal((await balance('bank')).balanceInCents, -1000);
  await financialRejection(postSparkMovementFirebase(owner, ordinaryCommand({ clientActionId: 'cash_negative_123456', accountId: 'cash', kind: 'expense', amountInCents: 11000, overdraftReason: 'Confirmado' })), /insuficiente/);
});
async function rawOrdinaryCorrection(changes: Record<string, any> = {}, omit?: 'from' | 'to' | 'claim' | 'quota') {
  const id = 'forged_correction_123456', from = await balance('bank'), to = await balance('third');
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!;
  const data = { schemaVersion: 1, actorId: uid, kind: 'movement_correction', originalSource: 'live', originalOperationId: 'ordinary_123456',
    movementKind: 'income', originalDeltaInCents: 1000, fromAccountId: 'bank', toAccountId: 'third', amountInCents: 700, differenceInCents: 700,
    effectiveAt: resolution().effectiveAt, categoryId: null, note: null, overdraftReason: null, fromRevision: from.revision, toRevision: to.revision,
    fromPreviousOperationId: from.lastOperationId, toPreviousOperationId: to.lastOperationId, fromCurrentEffectInCents: -1000,
    toCurrentEffectInCents: 700, createdAt: serverTimestamp(), ...changes };
  const batch = writeBatch(owner); batch.set(operationRef(owner, id), data);
  for (const [side, before, effect, accountId] of [['from', from, data.fromCurrentEffectInCents, 'bank'], ['to', to, data.toCurrentEffectInCents, 'third']] as const) {
    if (side !== omit) batch.update(positionRef(owner, accountId), { balanceInCents: before.balanceInCents + effect,
      revision: before.revision + 1, lastOperationId: id, updatedAt: serverTimestamp() });
  }
  if (omit !== 'claim') batch.set(doc(owner, 'financialGroups', 'proof', 'sparkMovementClaims', data.originalOperationId), {
    schemaVersion: 1, actorId: uid, reversalOperationId: id, createdAt: serverTimestamp(),
  });
  if (omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { ...quota, count: quota.count + 1, lastOperationId: id, updatedAt: serverTimestamp() });
  return batch.commit();
}
test('Spark ordinary raw correction valid control commits both positions', async () => {
  await postSparkMovementFirebase(owner, ordinaryCommand()); await rawOrdinaryCorrection();
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('third')).balanceInCents, 800);
});
for (const [name, changes, omit] of [
  ['incomplete debit', {}, 'from'], ['incomplete credit', {}, 'to'], ['missing claim', {}, 'claim'], ['missing quota', {}, 'quota'],
  ['invented original', { originalOperationId: 'not_found_123456' }, undefined],
  ['inflated inverse', { originalDeltaInCents: 2000, fromCurrentEffectInCents: -2000 }, undefined],
  ['wrong source account', { fromAccountId: 'cash' }, undefined], ['swapped direction', { movementKind: 'expense', differenceInCents: -700 }, undefined],
  ['invented credit', { toCurrentEffectInCents: 999 }, undefined], ['wrong predecessor', { toPreviousOperationId: 'foreign_123456' }, undefined],
  ['changed source namespace', { originalSource: 'imported' }, undefined], ['unknown fields', { includesBoundary: true }, undefined],
] as const) test(`Spark ordinary Rules reject correction ${name}`, async () => {
  await postSparkMovementFirebase(owner, ordinaryCommand()); await denied(rawOrdinaryCorrection(changes, omit));
});
test('Spark ordinary Rules reject foreign category and unadapted recurring identity', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    await seedSetDoc(seedDoc(context.firestore(), 'tags', 'foreign_tag'), { groupId: 'other', personId: 'other', usageType: 'both' });
    await seedSetDoc(seedDoc(context.firestore(), 'users', 'other'), { financialGroupId: 'other' });
    await seedSetDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkImportedIdentities', 'imported_recurring_123456'), {
      kind: 'income', actorId: uid, accountId: 'bank', amountInCents: 1000, ordinaryResolutionAllowed: false,
    });
  });
  await denied(rawOrdinary({ categoryId: 'foreign_tag' }));
  await denied(rawOrdinary({ kind: 'movement_reversal', amountInCents: undefined, categoryId: undefined, originalSource: 'imported',
    originalOperationId: 'imported_recurring_123456', movementKind: 'income', fromAccountId: 'bank', originalDeltaInCents: 1000,
    differenceInCents: -1000, currentEffectInCents: -1000 }));
});
for (const [name, changes, options] of [
  ['signed amount', { differenceInCents: -1000 }, {}], ['invented effect', { currentEffectInCents: 9999 }, {}],
  ['future date', { effectiveAt: Timestamp.fromDate(new Date('2099-01-01Z')) }, {}], ['missing position', {}, { omit: 'position' }],
  ['missing quota', {}, { omit: 'quota' }], ['wrong revision', { expectedRevision: 99 }, {}],
  ['wrong predecessor', { previousOperationId: 'foreign_123456' }, {}], ['unrecognized data', { sourceReferences: [] }, {}],
  ['spoof actor', { actorId: 'another-member' }, {}], ['fake receipt time', { createdAt: Timestamp.fromMillis(0) }, {}],
  ['negative cash', { accountId: 'cash', kind: 'expense', differenceInCents: -11000, amountInCents: 11000 }, {}],
] as const) test(`Spark ordinary Rules reject ${name}`, async () => { await denied(rawOrdinary(changes, options as any)); });
for (const change of [{ originalDeltaInCents: 2000, differenceInCents: -2000, currentEffectInCents: -2000 },
  { originalSource: 'imported' }, { fromAccountId: 'third' }, { movementKind: 'expense' }]) test(`Spark ordinary Rules bind reversal to exact original ${JSON.stringify(change)}`, async () => {
  await postSparkMovementFirebase(owner, ordinaryCommand());
  await denied(rawOrdinary({ kind: 'movement_reversal', amountInCents: undefined, categoryId: undefined, originalSource: 'live',
    originalOperationId: 'ordinary_123456', movementKind: 'income', fromAccountId: 'bank', originalDeltaInCents: 1000,
    differenceInCents: -1000, currentEffectInCents: -1000, ...change }));
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
    await financialRejection(transferSparkFundsFirebase(secondSession, command(changes)), /outros argumentos/);
  }
});

test('two sessions submitting the same action commit once', async () => {
  await acknowledgePriorSend();
  const results = await Promise.all([transferSparkFundsFirebase(owner, command()), transferSparkFundsFirebase(secondSession, command())]);
  assert.deepEqual(results.map(result => result.idempotent).sort(), [false, true]);
  assert.equal((await balance('bank')).revision, 1);
});

test('concurrent reuse of an action with different arguments cannot return two successes', async () => {
  await acknowledgePriorSend();
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
  await acknowledgePriorSend();
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
  await financialRejection(transferSparkFundsFirebase(owner, command({ amountInCents: 11_000, clientActionId: 'unjustified_transfer_123456' })), /justificativa/);
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
  await financialRejection(transferSparkFundsFirebase(owner, command({ clientActionId: 'overflow_123456',
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
    await financialRejection(transferSparkFundsFirebase(owner, command({ clientActionId: 'over_quota_123456' })), /Limite temporário/);
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
  await financialRejection(transferSparkFundsFirebase(outsider, command()), /sessão autenticada mudou/);
  await financialRejection(transferSparkFundsFirebase(outsider, command({ actorId: otherUid })), /outros argumentos/);
  assert.equal((await balance('bank')).revision, 1);
});

test('revocation invalidates a prepared write and receipt reads', async () => {
  const prepared = rawBatch();
  await seedGroup({ members: {} });
  await denied(prepared.commit());
  await denied(getDoc(positionRef(owner)));
  await denied(getDoc(operationRef(owner)));
  await financialRejection(transferSparkFundsFirebase(owner, command()));
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
    await financialRejection(transferSparkFundsFirebase(firestore, command()));
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
    await financialRejection(transferSparkFundsFirebase(owner, command(changes)));
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
  await financialRejection(openSparkAccountFirebase(owner, opening({ accountId: 'other-bank' })), /outros argumentos/);
});

test('two different opening action IDs for the same account produce one position and one receipt', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await acknowledgePriorSend();
  const results = await Promise.allSettled([openSparkAccountFirebase(owner, opening()),
    openSparkAccountFirebase(secondSession, opening({ clientActionId: 'opening_other_123456' }))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await getDocs(collection(owner, 'financialGroups', 'proof', 'sparkOperations'))).size, 5);
  assert.equal((await balance('new-bank')).revision, 0);
});

test('concurrent identical opening is idempotent', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await acknowledgePriorSend();
  const results = await Promise.all([openSparkAccountFirebase(owner, opening()), openSparkAccountFirebase(secondSession, opening())]);
  assert.deepEqual(results.map(result => result.idempotent).sort(), [false, true]);
});

test('member cannot create an opening, including bypassing the client service', async () => {
  await financialRejection(openSparkAccountFirebase(owner, opening()), /administrador/);
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
  ['unfunded nonzero investment opening', { operation: { accountKind: 'investment', openingBalanceInCents: 1000 }, position: { kind: 'investment', balanceInCents: 1000 } }],
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
  await financialRejection(reverseSparkTransferFirebase(owner, reversal({ clientActionId: 'reverse_again_123456' })), /já foi estornada/);
  await financialRejection(reverseSparkTransferFirebase(owner, reversal({ note: 'changed' })), /outros argumentos/);
});

test('concurrent reversal requests with different action IDs cannot reverse twice', async () => {
  await transferSparkFundsFirebase(owner, command());
  await acknowledgePriorSend();
  const results = await Promise.allSettled([reverseSparkTransferFirebase(owner, reversal()),
    reverseSparkTransferFirebase(secondSession, reversal({ clientActionId: 'reverse_other_123456' }))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await balance('bank')).balanceInCents, 10_000);
  assert.equal((await balance('bank')).revision, 2);
});

test('simultaneous identical reversal returns one commit and one idempotent result', async () => {
  await transferSparkFundsFirebase(owner, command());
  await acknowledgePriorSend();
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
  await financialRejection(reverseSparkTransferFirebase(owner, reversal()), /próprias operações/);
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
  await financialRejection(reverseSparkTransferFirebase(owner, reversal({ originalOperationId: 'reverse_123456', clientActionId: 'nested_123456' })), /não permite/);
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
  await financialRejection(countSparkAccountFirebase(owner, count({ targetBalanceInCents: 13_000 })), /outros argumentos/);
});

test('member cannot count a balance through either client service or a direct batch', async () => {
  await financialRejection(countSparkAccountFirebase(owner, count()), /administrador/);
  await denied(rawCount().commit());
});

test('two counts from the same preview revision cannot both overwrite the balance', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await acknowledgePriorSend();
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
  await financialRejection(reverseSparkBalanceAdjustmentFirebase(owner, { ...input, clientActionId: 'another_undo_123456' }), /já foi estornado/);
  await financialRejection(reverseSparkTransferFirebase(owner, reversal({ originalOperationId: 'count_123456' })), /não permite/);
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
  await acknowledgePriorSend();
  const [countResult, inverseResult] = await Promise.allSettled([
    countSparkAccountFirebase(owner, count({ clientActionId: 'new_reference_123456', expectedRevision: 1, targetBalanceInCents: 8000 })),
    reverseSparkBalanceAdjustmentFirebase(secondSession, { groupId: 'proof', actorId: uid,
      originalOperationId: 'count_123456', clientActionId: 'undo_adjustment_123456' }),
  ]);
  assert.ok(countResult.status === 'fulfilled' || inverseResult.status === 'fulfilled');
  if (inverseResult.status === 'rejected') {
    assert.equal(countResult.status, 'fulfilled');
    assert.ok(['permission-denied', 'spark/recovery-required'].includes(inverseResult.reason.code), String(inverseResult.reason));
    assert.doesNotMatch(inverseResult.reason.message, /maximum of|too many (?:document|access|expression)/i);
    assert.equal((await balance('bank')).balanceInCents, 8000);
    assert.equal((await getDoc(operationRef(owner, 'undo_adjustment_123456'))).exists(), false);
    // Simula o aviso de conferência; cancelamento confirmado exige uma nova identificação.
    await acknowledgePriorSend();
    await reverseSparkBalanceAdjustmentFirebase(secondSession, { groupId: 'proof', actorId: uid,
      originalOperationId: 'count_123456', clientActionId: inverseResult.reason.sparkIntentCancelled ? 'retry_undo_adjustment_123456' : 'undo_adjustment_123456' });
  }
  const current = await balance('bank');
  if (countResult.status === 'fulfilled') {
    assert.equal(current.balanceInCents, 8000); assert.equal(current.revision, 3);
  } else {
    assert.ok(countResult.status === 'rejected');
    assert.ok(['permission-denied', 'spark/recovery-required'].includes(countResult.reason.code) || /prévia ficou desatualizada/.test(String(countResult.reason)), String(countResult.reason));
    assert.doesNotMatch(String(countResult.reason), /maximum of|too many (?:document|access|expression)/i);
    assert.equal((await getDoc(operationRef(owner, 'new_reference_123456'))).exists(), false);
    assert.equal(current.balanceInCents, 10_000); assert.equal(current.revision, 2);
  }
});

test('two different reversals of the same adjustment produce one inverse', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count({ kind: 'balance_adjustment' }));
  const input = { groupId: 'proof', actorId: uid, originalOperationId: 'count_123456', clientActionId: 'undo_adjustment_123456' };
  await acknowledgePriorSend();
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
  await financialRejection(reverseSparkBalanceAdjustmentFirebase(owner, { groupId: 'proof', actorId: uid,
    originalOperationId: 'count_123456', clientActionId: 'undo_adjustment_123456' }), /autor do ajuste/);
  await denied((await rawAdjustmentReversal()).commit());
});

test('counting cannot fund an investment by bypassing a debit from its funding account', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await seedPosition('bank', { kind: 'investment' });
  await financialRejection(countSparkAccountFirebase(owner, count()), /incompatível/);
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
  await financialRejection(openSparkAccountFirebase(owner, opening({ accountId: 'cash', kind: 'cash', clientActionId: 'another_cash_123456' })), /já possui abertura/);
});

test('services explicitly reject unsupported effective dates instead of dropping them', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const unsupported = { effectiveAt: new Date('2026-01-01T00:00:00Z') };
  await financialRejection(transferSparkFundsFirebase(owner, { ...command(), ...unsupported }), /não aceita data efetiva/);
  await financialRejection(openSparkAccountFirebase(owner, { ...opening(), ...unsupported }), /não aceita data efetiva/);
  await financialRejection(countSparkAccountFirebase(owner, { ...count(), ...unsupported }), /não aceita data efetiva/);
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
  await financialRejection(saveSparkTemporalBalanceFirebase(owner, temporal({ targetBalanceInCents: 13_000 })), /outros argumentos/);
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
  await financialRejection(saveSparkTemporalBalanceFirebase(owner, input), /fim do dia civil/);
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
  await financialRejection(saveSparkTemporalBalanceFirebase(owner, input), /posterior à abertura/);
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
  await financialRejection(saveSparkTemporalBalanceFirebase(owner, temporal()), /prévia ficou desatualizada/);
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
  await financialRejection(stepSparkHistoryProofFirebase(owner, temporal(), 0), /administrador/);
  await financialRejection(saveSparkTemporalBalanceFirebase(owner, temporal()), /administrador/);
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
  await financialRejection(preview(), /bootstrap/);
  await seedPosition('bank', { lastOperationId: 'bootstrap_bank' });
  await preview(temporal(), 0);
  await financialRejection(saveSparkTemporalBalanceFirebase(owner, temporal()), /Conclua a projeção/);
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
  await financialRejection(saveSparkTemporalBalanceFirebase(owner, input), /Atualize a prévia de hoje/);
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
  await acknowledgePriorSend();
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
  await acknowledgePriorSend();
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
  await financialRejection(transferSparkFundsFirebase(owner, command({ fromAccountId: from, toAccountId: from === 'bank' ? 'cash' : 'bank' })), /aberturas mensais vencidas/);
});

test('Rules block current count and retroactive adjustment on an overdue position', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await preview();
  await seedPosition('bank', { nextActivationAt: Timestamp.fromMillis(Date.now() - 60_000) });
  await denied(rawCount().commit()); await denied((await rawTemporal()).commit());
  await financialRejection(countSparkAccountFirebase(owner, count()), /aberturas mensais vencidas/);
  await financialRejection(saveSparkTemporalBalanceFirebase(owner, temporal()), /aberturas mensais vencidas/);
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
  await financialRejection(readCurrentSparkPositionFirebase(owner, { ...input, actorId: 'other' }), /sessão/);
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
  await seedDueMonths({ future: true }); await acknowledgePriorSend(); const input = activation();
  const first = await refreshSparkMonthlyOpeningFirebase(owner, input, 1); assert.equal(first.status, 'preparing');
  const result = await refreshSparkMonthlyOpeningFirebase(secondSession, input); assert.equal(result.status, 'current');
  assert.equal((await balance('bank')).balanceInCents, 8000); assert.ok((await balance('bank')).nextActivationAt.isEqual(futureMonth().effectiveAt));
  const checkpoint = (await getDoc(doc(owner, 'financialGroups', 'proof', 'sparkCheckpoints', 'bank'))).data()!;
  assert.equal(checkpoint.operationId, 'scheduled_2026-07'); assert.equal(checkpoint.activationOperationId, input.clientActionId);
  assert.ok(checkpoint.effectiveAt.isEqual(past('2026-07-01T03:00:00Z')));
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  assert.equal(receipt.differenceInCents, 0); assert.equal(receipt.currentEffectInCents, -2000);
  await acknowledgePriorSend(); await transferSparkFundsFirebase(owner, command()); assert.equal((await balance('bank')).balanceInCents, 7000);
  await seedGroup({ members: { [uid]: 'admin' } });
  const history = await preview(temporal({ clientActionId: 'after_activation_123456', effectiveAt: await confirmedNow() }));
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
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data(), windowStartInMillis = Math.floor(Date.now() / 60000) * 60000;
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
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', count: quota?.windowStartInMillis === windowStartInMillis ? quota.count + 1 : 1,
    windowStartInMillis, lastOperationId: id, updatedAt: serverTimestamp() });
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
  await acknowledgePriorSend();
  const result = await Promise.all([activateSparkMonthlyOpeningFirebase(owner, input), activateSparkMonthlyOpeningFirebase(secondSession, input)]);
  assert.deepEqual(result.map(item => item.idempotent).sort(), [false, true]);
  assert.equal((await balance('bank')).balanceInCents, 8000); assert.equal((await balance('bank')).revision, 3);
});

test('different concurrent activation IDs cannot materialize the same overdue position twice', async () => {
  await seedDueMonths(); const first = await preparedActivation(), second = await preparedActivation('activate_other_123456');
  await acknowledgePriorSend();
  const result = await Promise.allSettled([
    activateSparkMonthlyOpeningFirebase(owner, { ...activation(), asOf: first.asOf, expectedRevision: first.headRevision }),
    activateSparkMonthlyOpeningFirebase(secondSession, { ...activation(), clientActionId: 'activate_other_123456', asOf: second.asOf, expectedRevision: second.headRevision }),
  ]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1); assert.equal((await balance('bank')).revision, 3);
});

test('next opening becoming due between preparation and confirmation invalidates activation', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const boundary = Timestamp.fromMillis(Date.now() + 1500);
  await seedDueMonths({ future: true, futureAt: boundary });
  assert.ok((await preparedActivation()).nextCheckpointAt?.isEqual(boundary), 'A preparação deve terminar antes da próxima abertura.');
  await waitForSparkServerTime(boundary);
  await seedGroup({ members: { [uid]: 'member' } });
  await denied((await rawActivation()).commit());
  assert.equal((await balance('bank')).balanceInCents, 10_000);
});

test('revoked membership invalidates prepared activation and member cannot prepare arbitrary historical corrections', async () => {
  await seedDueMonths(); const proof = await preparedActivation();
  await financialRejection(preview(), /administrador/);
  await seedGroup({ members: {} });
  await denied(activateSparkMonthlyOpeningFirebase(owner, { ...activation(), asOf: proof.asOf, expectedRevision: proof.headRevision }));
});

test('member cannot schedule a future counted value even with a completed administrator proof', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await preview(futureMonth());
  await seedGroup({ members: { [uid]: 'member' } });
  await financialRejection(saveSparkTemporalBalanceFirebase(owner, futureMonth()), /administrador/);
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
  await financialRejection(transferSparkFundsFirebase(owner, command()), /Posição financeira inválida/);
});

test('activation cannot consume an instant-purpose proof or a date preceding the latest known revision', async () => {
  await seedDueMonths(); await seedGroup({ members: { [uid]: 'admin' } });
  await prepareSparkHistoryProofFirebase(owner, { ...activation(), purpose: 'instant' });
  await denied((await rawActivation()).commit());
  const tooOld = { ...activation(), clientActionId: 'old_activation_123456', asOf: past('2026-05-19T12:00:00Z'), purpose: 'activation' as const };
  const proof = await prepareSparkHistoryProofFirebase(owner, tooOld);
  await financialRejection(activateSparkMonthlyOpeningFirebase(owner, { ...tooOld, expectedRevision: proof.headRevision }), /não cobre/);
});

test('real server time crosses a scheduled boundary, blocks spending, and certified refresh activates the original opening', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  // Calendário sintético protegido somente no Emulator para ensaiar a passagem do tempo sem esperar um mês.
  const boundary = Timestamp.fromMillis(Date.now() + 5000);
  await calendar('2026-11', boundary.toDate().toISOString());
  const input = futureMonth({ effectiveAt: boundary }); await preview(input); await saveSparkTemporalBalanceFirebase(owner, input);
  await transferSparkFundsFirebase(owner, command()); assert.equal((await balance('bank')).balanceInCents, 9000);
  assert.equal((await readCurrentSparkPositionFirebase(owner, activation())).balanceInCents, 9000);
  // Sincronizar com request.time observado, sem alterar a posição/deadline do banco ensaiado.
  await waitForSparkServerTime(boundary);
  await denied(readCurrentSparkPositionFirebase(owner, activation()));
  await financialRejection(transferSparkFundsFirebase(owner, command({ clientActionId: 'after_boundary_123456' })), /aberturas mensais vencidas/);
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
    await financialRejection(replaceSparkBalanceAdjustmentFirebase(secondSession, { ...input, ...changes }), /outros argumentos/);
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
  await acknowledgePriorSend();
  const result = await Promise.all([replaceSparkBalanceAdjustmentFirebase(owner, input), replaceSparkBalanceAdjustmentFirebase(secondSession, input)]);
  assert.deepEqual(result.map(item => item.idempotent).sort(), [false, true]); assert.equal((await balance('bank')).revision, 2);
});

test('replacement and reversal share one claim so only one can resolve the original', async () => {
  await sourceAdjustment(); const input = replacement(); await replacementPreview(input);
  await acknowledgePriorSend();
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
  await acknowledgePriorSend();
  const result = await Promise.allSettled([replaceSparkBalanceAdjustmentFirebase(owner, first), replaceSparkBalanceAdjustmentFirebase(secondSession, second)]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1); assert.equal((await balance('bank')).revision, 2);
});

test('replacing a resolved original, changing bank or replacing an inverse fails explicitly', async () => {
  await sourceAdjustment(); const input = replacement(); await replacementPreview(input); await replaceSparkBalanceAdjustmentFirebase(owner, input);
  await financialRejection(replaceSparkBalanceAdjustmentFirebase(owner, { ...input, clientActionId: 'reuse_original_123456' }), /já foi substituído/);
  await financialRejection(replaceSparkBalanceAdjustmentFirebase(owner, { ...input, accountId: 'third' }), /mesmo banco/);
  await reverseSparkBalanceAdjustmentFirebase(owner, { groupId: 'proof', actorId: uid, clientActionId: 'inverse_new_123456', originalOperationId: input.clientActionId });
  await financialRejection(replaceSparkBalanceAdjustmentFirebase(owner, { ...input, originalOperationId: 'inverse_new_123456' }), /não um estorno/);
});

test('new movement, revoked role or overdue opening invalidates replacement without partial effects', async () => {
  await sourceAdjustment(); await replacementPreview(); await transferSparkFundsFirebase(owner, command());
  await financialRejection(replaceSparkBalanceAdjustmentFirebase(owner, replacement()), /desatualizada/);
  await seedGroup({ members: { [uid]: 'member' } });
  await financialRejection(replaceSparkBalanceAdjustmentFirebase(owner, replacement()), /administrador/);
  await denied((await rawReplacement()).commit());
  await seedGroup({ members: { [uid]: 'admin' } });
  await seedPosition('bank', { nextActivationAt: Timestamp.fromMillis(Date.now() - 1000) });
  await financialRejection(replaceSparkBalanceAdjustmentFirebase(owner, replacement({ clientActionId: 'overdue_replacement_123456' })), /aberturas mensais vencidas/);
  assert.equal((await balance('bank')).balanceInCents, 11_000);
});

test('replacement dated today preserves requested preview and uses server commit for the new component', async () => {
  await sourceAdjustment(); const input = replacement({ effectiveAt: await confirmedNow() }); await replacementPreview(input);
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
  await sourceAdjustment(); const input = replacement({ targetBalanceInCents: -1000 });
  const rejected = { ...input, clientActionId: 'unjustified_replacement_123456' }; await replacementPreview(rejected);
  await financialRejection(replaceSparkBalanceAdjustmentFirebase(owner, rejected), /justificativa/);
  await replacementPreview(input);
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
  await financialRejection(replaceSparkBalanceAdjustmentFirebase(owner, replacement()), /autor administrador/);
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
  const input = replacement({ effectiveAt: await confirmedNow(), expectedRevision: 3, targetBalanceInCents: -1_000_000_000_000,
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
  await acknowledgePriorSend();
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
  await financialRejection(stepSparkHistoryProofFirebase(owner, input, 1), (e: unknown) => e instanceof SparkPreparationError && e.reason === 'lease-required');
  const remove = writeBatch(owner); remove.delete(preparationUserRef()); await denied(remove.commit());
  await denied(getDoc(doc(outsider, 'sparkPreparationUserQuotas', uid)));
  await denied(getDocs(collection(owner, 'sparkPreparationQuotas')));
});

for (const scope of ['user', 'project'] as const) test(`${scope} preparation exhaustion preserves progress and exposes a specific error`, async () => {
  const proof = await exhaustedLease(); await seedPreparationQuota(scope, { readUnits: scope === 'user' ? 22_000 : 24_000 });
  await financialRejection(renewSparkHistoryBudgetFirebase(owner, preparationInput(), 1),
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
  await financialRejection(stepSparkHistoryProofFirebase(owner, input, 0, { metrics }),
    (e: unknown) => e instanceof SparkPreparationError && e.reason === 'stale');
  assert.equal(metrics.explicitReads, 3); assert.equal(metrics.confirmedWrites, 0);
  assert.deepEqual((await getDoc(preparationUserRef())).data(), quota);
});

test('pausing preserves durable progress and resuming a completed proof performs no writes', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = preparationInput(); const signal = new AbortController(); signal.abort();
  const metrics = createSparkPreparationMetrics();
  await financialRejection(prepareSparkHistoryProofFirebase(owner, input, 100, { signal: signal.signal, metrics }),
    (e: unknown) => e instanceof SparkPreparationError && e.reason === 'paused');
  assert.equal(metrics.explicitReads, 0); assert.equal(metrics.confirmedWrites, 0);
  const partial = await prepareSparkHistoryProofFirebase(owner, input, 1);
  await financialRejection(prepareSparkHistoryProofFirebase(secondSession, input, 100, { signal: signal.signal }), /pausada/);
  assert.equal((await getDoc(proofRef(input.clientActionId))).data()!.workRevision, partial.workRevision);
  const done = await prepareSparkHistoryProofFirebase(secondSession, input); assert.equal(done.phase, 'done');
  assert.equal(getSparkPreparationProgress(done).remainingPages, 0);
  await prepareSparkHistoryProofFirebase(owner, input, 100, { metrics }); assert.equal(metrics.confirmedWrites, 0);
  await financialRejection(refreshSparkMonthlyOpeningFirebase(owner, input, 100, { signal: signal.signal }), /pausada/);
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
  await financialRejection(stepSparkHistoryProofFirebase(owner, input, 0, { metrics, signal: controller.signal }), /pausada/);
  assert.equal(metrics.confirmedWrites, 0); assert.equal((await getDoc(proofRef(input.clientActionId))).data()!.workRevision, 0);
  assert.equal((await getDoc(preparationUserRef())).data()!.writeUnits, 7);
  assert.equal((await prepareSparkHistoryProofFirebase(secondSession, input)).phase, 'done');
});

test('preparation rejects future revisions and oversized calls without consuming work', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = preparationInput();
  await startSparkHistoryProofFirebase(owner, input);
  await financialRejection(stepSparkHistoryProofFirebase(owner, input, 1), (e: unknown) => e instanceof SparkPreparationError && e.reason === 'revision');
  await financialRejection(renewSparkHistoryBudgetFirebase(owner, input, 2), (e: unknown) => e instanceof SparkPreparationError && e.reason === 'revision');
  await financialRejection(prepareSparkHistoryProofFirebase(owner, input, 101), /Limite de páginas/);
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
  omit?: 'user' | 'project' | 'segment'; count?: number; last?: number; id?: string; accountId?: string; client?: typeof owner } = {}) {
  const count = options.count ?? 2; const last = options.last ?? 3; const id = options.id ?? sparkSegmentId(count, last);
  const db = options.client ?? owner; const batch = writeBatch(db);
  const accountId = options.accountId ?? 'bank';
  const u = (await getDoc(preparationUserRef())).data(); const p = (await getDoc(preparationProjectRef())).data();
  const totals = (d: typeof u) => ({ schemaVersion: 1, windowStartInMillis: utcBudgetDay(),
    readUnits: (d?.windowStartInMillis === utcBudgetDay() ? d.readUnits : 0) + 20,
    writeUnits: (d?.windowStartInMillis === utcBudgetDay() ? d.writeUnits : 0) + 3, updatedAt: serverTimestamp() });
  if (options.omit !== 'segment') batch.set(sparkSegmentRef(db, 'proof', accountId, id), { ...segmentData(count, last), accountId, ...options.data });
  if (options.omit !== 'user') batch.set(doc(db, 'sparkPreparationUserQuotas', uid), { ...totals(u), workKind: 'segment', groupId: 'proof', accountId, segmentId: id, ...options.user });
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
    await financialRejection(certifySparkHistorySegmentFirebase(owner, segmentInput()), (e: unknown) => e instanceof SparkPreparationError && e.reason === 'budget-exhausted');
    await denied((await rawSegment()).commit());
  });
}

test('segments pause and daily exhaustion preserve completed certificates for restart with no repeated charges', async () => {
  await seedHistory(8); const input = preparationInput(); const controller = new AbortController(); controller.abort();
  await financialRejection(warmSparkHistorySegmentsFirebase(owner, input, { signal: controller.signal }), /pausada/);
  await seedPreparationQuota('user', { readUnits: 21960 });
  await financialRejection(warmSparkHistorySegmentsFirebase(owner, input), (e: unknown) => e instanceof SparkPreparationError && e.reason === 'budget-exhausted');
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
  const asOf = (await getDoc(operationRef(owner, count().clientActionId))).data()!.createdAt as InstanceType<typeof Timestamp>;
  const input = { ...preparationInput(), asOf };
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
  const metrics = createSparkPreparationMetrics(); await financialRejection(stepSparkHistoryProofFirebase(owner, preparationInput(), 0, { useSegments: true, metrics }),
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
    const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput(`account_${accountId}_123456`), accountId, asOf: await confirmedNow(accountId) }, 100, { useSegments: true });
    assert.equal(proof.balanceInCents, expected);
  }
});

function accountCatalog(investment = true): SparkAccountCatalog {
  return { name: investment ? 'Reserva' : 'Banco', colorHex: '#Ab12eF', iconKey: 'bank', bankAccountId: investment ? 'bank' : null,
    assetType: investment ? 'fixed_income' : null, valuationMethod: investment ? 'cdi' : null,
    cdiPercentageInBasisPoints: investment ? 10250 : null, redemptionTerm: investment ? 'D+1' : null, description: investment ? 'Reserva de emergência' : null };
}
function accountCatalogInput(overrides: Partial<SparkAccountCatalogInput> = {}): SparkAccountCatalogInput {
  return { groupId: 'proof', actorId: uid, clientActionId: 'catalog_123456', accountId: 'investment', accountKind: 'investment',
    expectedCatalogRevision: null, catalog: accountCatalog(), ...overrides };
}
function catalogRef(firestore = owner, accountId = 'investment') { return doc(firestore, 'financialGroups/proof/sparkAccountCatalog', accountId); }
function rawAccountCatalog(options: { values?: Record<string, unknown>; document?: Record<string, unknown>; receipt?: Record<string, unknown>;
  omit?: 'catalog' | 'receipt' | 'quota'; beforeRevision?: number | null; accountId?: string; accountKind?: 'bank' | 'investment'; firestore?: ReturnType<typeof getFirestore> } = {}) {
  const firestore = options.firestore ?? owner, batch = writeBatch(firestore), id = 'catalog_123456';
  const accountId = options.accountId ?? 'investment', accountKind = options.accountKind ?? 'investment';
  const values = { ...accountCatalog(), ...options.values }, revision = options.beforeRevision ?? null;
  if (options.omit !== 'catalog') batch.set(catalogRef(firestore, accountId), { schemaVersion: 1, actorId: uid, accountKind, ...values,
    revision: (revision ?? -1) + 1, lastOperationId: id, updatedAt: serverTimestamp(), ...options.document }, { merge: true });
  if (options.omit !== 'receipt') batch.set(operationRef(firestore, id), { schemaVersion: 1, actorId: uid, kind: 'account_catalog_update',
    accountId, accountKind, expectedCatalogRevision: revision, ...values, createdAt: serverTimestamp(), ...options.receipt });
  if (options.omit !== 'quota') batch.set(doc(firestore, 'sparkTransferQuotas', uid), { groupId: 'proof', count: revision === null ? 1 : 2,
    windowStartInMillis: Math.floor(Date.now() / 60_000) * 60_000, lastOperationId: id, updatedAt: serverTimestamp() });
  return batch;
}

test('Spark accounts catalog creates and edits investment metadata without changing the financial chain', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const before = await balance('investment'), input = accountCatalogInput();
  assert.equal((await saveSparkAccountCatalogFirebase(owner, input)).idempotent, false);
  assert.equal((await saveSparkAccountCatalogFirebase(secondSession, input)).idempotent, true);
  await saveSparkAccountCatalogFirebase(secondSession, { ...input, clientActionId: 'catalog_edit_123456', expectedCatalogRevision: 0,
    catalog: { ...input.catalog, name: 'Tesouro', assetType: 'treasury', valuationMethod: 'manual', bankAccountId: null } });
  const result = (await getDoc(catalogRef())).data()!;
  assert.equal(result.revision, 1); assert.equal(result.name, 'Tesouro'); assert.equal(result.bankAccountId, null);
  assert.deepEqual(await balance('investment'), before);
  await financialRejection(saveSparkAccountCatalogFirebase(owner, { ...input, catalog: { ...input.catalog, name: 'Outro' } }), /outros argumentos/);
  await acknowledgePriorSend();
  await financialRejection(saveSparkAccountCatalogFirebase(owner, { ...input, clientActionId: 'catalog_stale_123456', expectedCatalogRevision: 0 }), /alterado/);
  const batch = writeBatch(owner); batch.delete(catalogRef()); await denied(batch.commit());
});
for (const kind of ['bank', 'cash'] as const) test(`Spark accounts catalog supports ${kind} without investment fields`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await saveSparkAccountCatalogFirebase(owner, accountCatalogInput({ accountId: kind, accountKind: kind, catalog: accountCatalog(false) }));
  assert.equal((await getDoc(catalogRef(owner, kind))).data()!.accountKind, kind);
});
for (const kind of ['bank', 'investment'] as const) test(`Spark accounts atomic opening and catalog for ${kind} supports exact replay`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const input = opening({ kind, catalog: accountCatalog(kind === 'investment') });
  await openSparkAccountFirebase(owner, input); assert.equal((await balance('new-bank')).balanceInCents, 0);
  const catalog = (await getDoc(catalogRef(owner, 'new-bank'))).data()!;
  assert.equal(catalog.lastOperationId, input.clientActionId); assert.equal(catalog.revision, 0);
  assert.equal((await openSparkAccountFirebase(secondSession, input)).idempotent, true);
  await financialRejection(openSparkAccountFirebase(owner, { ...input, catalog: { ...input.catalog!, name: 'Changed' } }), /outros argumentos/);
  if (kind === 'investment') {
    await transferSparkFundsFirebase(owner, command({ kind: 'investment_deposit', toAccountId: 'new-bank', amountInCents: 1000 }));
    assert.equal((await balance('new-bank')).balanceInCents, 1000); assert.equal((await balance('bank')).balanceInCents, 9000);
    await reverseSparkTransferFirebase(owner, { groupId: 'proof', actorId: uid, clientActionId: 'catalog_reverse_123456', originalOperationId: 'action_123456' });
    assert.equal((await balance('new-bank')).balanceInCents, 0); assert.equal((await balance('bank')).balanceInCents, 10000);
  }
});
test('Spark accounts zero investment opening remains a valid history root', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await openSparkAccountFirebase(owner, opening({ kind: 'investment' }));
  const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput(), accountId: 'new-bank', asOf: await confirmedNow('new-bank') });
  assert.equal(proof.balanceInCents, 0);
});
test('Spark accounts raw catalog control succeeds', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await rawAccountCatalog().commit();
  assert.equal((await getDoc(catalogRef())).data()!.cdiPercentageInBasisPoints, 10250);
});
const invalidAccountCatalog: [string, Record<string, unknown>][] = [
  ['empty name', { name: '' }], ['untrimmed name', { name: ' Banco ' }], ['long name', { name: 'x'.repeat(161) }],
  ['name type', { name: 7 }], ['color', { colorHex: 'yellow' }], ['icon size', { iconKey: 'x'.repeat(161) }],
  ['description size', { description: 'x'.repeat(2001) }], ['liquidity size', { redemptionTerm: 'x'.repeat(301) }],
  ['fractional rate', { cdiPercentageInBasisPoints: 102.5 }], ['negative rate', { cdiPercentageInBasisPoints: -1 }],
  ['excessive rate', { cdiPercentageInBasisPoints: 1000001 }], ['null rate', { cdiPercentageInBasisPoints: null }],
  ['unknown asset', { assetType: 'crypto' }], ['valuation method', { valuationMethod: 'automatic' }],
  ['CDI stock', { assetType: 'stock', valuationMethod: 'cdi' }], ['bank path', { bankAccountId: 'group/bank' }],
  ['empty bank ID', { bankAccountId: '' }], ['foreign bank', { bankAccountId: 'foreign-bank' }],
  ['self linked bank', { bankAccountId: 'investment' }], ['cash linked bank', { bankAccountId: 'cash' }],
  ['forged balance', { balanceInCents: 100000 }], ['forged activity', { isActive: false }],
];
for (const [label, values] of invalidAccountCatalog) test(`Spark accounts catalog service and Rules reject ${label}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await financialRejection(saveSparkAccountCatalogFirebase(owner, { ...accountCatalogInput(), catalog: { ...accountCatalog(), ...values } as any }));
  await denied(rawAccountCatalog({ values }).commit()); assert.equal((await getDoc(catalogRef())).exists(), false);
  assert.equal((await balance('investment')).balanceInCents, 5000);
});
for (const omit of ['catalog', 'receipt', 'quota'] as const) test(`Spark accounts catalog requires atomic ${omit}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await denied(rawAccountCatalog({ omit }).commit());
});
for (const [label, options] of [
  ['actor', { document: { actorId: 'forged' } }], ['kind', { document: { accountKind: 'bank' } }],
  ['revision', { document: { revision: 8 } }], ['head', { document: { lastOperationId: 'unrelated_123456' } }],
  ['receipt mismatch', { receipt: { name: 'Other name' } }], ['stale revision', { receipt: { expectedCatalogRevision: 0 } }],
  ['missing required field', { document: { colorHex: deleteField() } }], ['unknown receipt field', { receipt: { initialValueInCents: 100 } }],
] as const) test(`Spark accounts raw catalog rejects ${label}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await denied(rawAccountCatalog(options).commit());
});
test('Spark accounts catalog cannot be used as a financial event', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const batch = rawAccountCatalog(); batch.update(positionRef(owner, 'investment'), { balanceInCents: 1000000, revision: 1, lastOperationId: 'catalog_123456', updatedAt: serverTimestamp() });
  await denied(batch.commit()); assert.equal((await balance('investment')).balanceInCents, 5000);
});
test('Spark accounts member, outsider and expired sessions cannot write catalog', async () => {
  await financialRejection(saveSparkAccountCatalogFirebase(owner, accountCatalogInput()), /administrador/); await denied(rawAccountCatalog().commit());
  await seedGroup({ members: { [uid]: 'admin' } });
  await denied(rawAccountCatalog({ firestore: outsider }).commit()); await denied(rawAccountCatalog({ firestore: expired }).commit());
  await denied(getDoc(catalogRef(outsider)));
});
test('Spark accounts catalog duplicate request is idempotent across sessions and conflicting edits require a new preview', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = accountCatalogInput();
  await acknowledgePriorSend();
  const results = await Promise.all([saveSparkAccountCatalogFirebase(owner, input), saveSparkAccountCatalogFirebase(secondSession, input)]);
  assert.deepEqual(results.map(item => item.idempotent).sort(), [false, true]);
  await acknowledgePriorSend();
  const edits = await Promise.allSettled([saveSparkAccountCatalogFirebase(owner, { ...input, clientActionId: 'catalog_left_123456', expectedCatalogRevision: 0,
    catalog: { ...input.catalog, name: 'Left' } }), saveSparkAccountCatalogFirebase(secondSession, { ...input, clientActionId: 'catalog_right_123456', expectedCatalogRevision: 0,
    catalog: { ...input.catalog, name: 'Right' } })]);
  assert.equal(edits.filter(item => item.status === 'fulfilled').length, 1); assert.equal((await getDoc(catalogRef())).data()!.revision, 1);
});
test('Spark accounts catalog replay requires current authorization and active proof group', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = accountCatalogInput(); await saveSparkAccountCatalogFirebase(owner, input);
  await seedGroup({ members: { [uid]: 'member' } }); await financialRejection(saveSparkAccountCatalogFirebase(owner, input), /administrador/);
  await seedGroup({ status: 'spark_importing', members: { [uid]: 'admin' } }); await denied(saveSparkAccountCatalogFirebase(owner, input));
  await denied(rawAccountCatalog().commit());
});
test('Spark accounts opening cannot omit or forge its catalog', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const values = accountCatalog(false);
  await denied(rawOpening({ operation: values }).commit());
  const batch = rawOpening({ operation: values });
  batch.set(catalogRef(owner, 'new-bank'), { schemaVersion: 1, actorId: uid, accountKind: 'bank', ...values, name: 'Forged',
    revision: 0, lastOperationId: 'opening_123456', updatedAt: serverTimestamp() }); await denied(batch.commit());
  await denied(rawOpening({ operation: { colorHex: '#000000' } }).commit());
  assert.equal((await getDoc(positionRef(owner, 'new-bank'))).exists(), false);
});

for (const [assetType, valuationMethod, rate] of [
  ['fixed_income', 'cdi', 0], ['fixed_income', 'cdi', 1000000], ['stock', 'manual', 0], ['fund', 'manual', 0],
] as const) test(`Spark accounts accepts ${assetType}/${valuationMethod} and integer rate ${rate}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await saveSparkAccountCatalogFirebase(owner, { ...accountCatalogInput(), catalog: { ...accountCatalog(), assetType, valuationMethod, cdiPercentageInBasisPoints: rate } });
  assert.equal((await getDoc(catalogRef())).data()!.cdiPercentageInBasisPoints, rate);
});
test('Spark accounts rejects investment fields on bank catalogs in client and raw writes', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await financialRejection(saveSparkAccountCatalogFirebase(owner, accountCatalogInput({ accountId: 'bank', accountKind: 'bank' })), /não se aplicam/);
  const batch = rawAccountCatalog({ accountId: 'bank', accountKind: 'bank' });
  await denied(batch.commit());
});
test('Spark accounts rejects inactive linked bank without partial opening or catalog', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await seedPosition('bank', { active: false });
  await financialRejection(openSparkAccountFirebase(owner, opening({ kind: 'investment', catalog: accountCatalog() })), /Banco vinculado indisponível/);
  await financialRejection(saveSparkAccountCatalogFirebase(owner, accountCatalogInput()), /Banco vinculado indisponível/);
  await denied(rawAccountCatalog().commit()); assert.equal((await getDoc(positionRef(owner, 'new-bank'))).exists(), false);
});
test('Spark accounts raw update must preserve closed schema and expected catalog revision', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await saveSparkAccountCatalogFirebase(owner, accountCatalogInput({ clientActionId: 'previous_catalog_123456' }));
  await denied(rawAccountCatalog({ beforeRevision: 0, document: { currentBalanceInCents: 42 } }).commit());
  await denied(rawAccountCatalog({ beforeRevision: 0, receipt: { expectedCatalogRevision: null } }).commit());
  await rawAccountCatalog({ beforeRevision: 0, values: { name: 'Revisão confirmada', colorHex: '#FFFFFF' } }).commit();
  assert.equal((await getDoc(catalogRef())).data()!.revision, 1);
});

function investmentSync(overrides: Partial<SparkInvestmentSyncInput> = {}): SparkInvestmentSyncInput {
  return { groupId: 'proof', actorId: uid, clientActionId: 'sync_investment_123456', accountId: 'investment',
    observedAt: past(), observedValueInCents: 6000, expectedRevision: 0, ...overrides };
}
async function rawInvestmentSync(options: { input?: SparkInvestmentSyncInput; operation?: Record<string, unknown>; position?: Record<string, unknown>;
  checkpoint?: Record<string, unknown>; omit?: 'position' | 'operation' | 'checkpoint' | 'quota' } = {}) {
  const input = options.input ?? investmentSync(), id = input.clientActionId, batch = writeBatch(owner);
  const current = await balance(input.accountId), proof = (await getDoc(proofRef(id))).data()!;
  const delta = input.observedValueInCents - proof.balanceInCents;
  const covered = proof.latestCheckpointAt && (proof.latestCheckpointAt.seconds > input.observedAt.seconds
    || proof.latestCheckpointAt.seconds === input.observedAt.seconds && proof.latestCheckpointAt.nanoseconds > input.observedAt.nanoseconds);
  const effect = covered ? 0 : input.observedValueInCents + proof.tailDeltaInCents - current.balanceInCents;
  if (options.omit !== 'operation') batch.set(operationRef(owner, id), { schemaVersion: 1, actorId: uid, kind: 'investment_sync', accountId: input.accountId,
    proofId: id, expectedRevision: input.expectedRevision, previousOperationId: current.lastOperationId,
    requestedEffectiveAt: input.observedAt, effectiveAt: input.observedAt, effectiveMode: 'instant', civilDay: null, cycle: null,
    expectedOpeningOperationId: null, targetBalanceInCents: input.observedValueInCents, previousBalanceInCents: proof.balanceInCents,
    differenceInCents: delta, currentEffectInCents: effect, note: null, overdraftReason: null, createdAt: serverTimestamp(), ...options.operation }, { merge: true });
  if (options.omit !== 'position') batch.update(positionRef(owner, input.accountId), { balanceInCents: current.balanceInCents + effect,
    revision: current.revision + 1, lastOperationId: id, updatedAt: serverTimestamp(), ...options.position });
  if (options.omit !== 'checkpoint' && !covered) batch.set(doc(owner, 'financialGroups/proof/sparkCheckpoints', input.accountId), {
    operationId: id, effectiveAt: input.observedAt, countedBalanceInCents: input.observedValueInCents, includesBoundary: false, ...options.checkpoint });
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data(), window = Math.floor(Date.now() / 60000) * 60000;
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', count: quota?.windowStartInMillis === window ? quota.count + 1 : 1,
    windowStartInMillis: window, lastOperationId: id, updatedAt: serverTimestamp() });
  return batch;
}
const readInvestment = (firestore = owner) => readSparkInvestmentStateFirebase(firestore, { groupId: 'proof', actorId: uid, accountId: 'investment' });

test('Spark investment sync records observed value/date with no bank movement, exact replay and historical checkpoint', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = investmentSync(), bank = await balance('bank');
  assert.equal((await readInvestment()).reference, null);
  await prepareSparkInvestmentSyncFirebase(owner, input); await synchronizeSparkInvestmentFirebase(owner, input);
  assert.equal((await synchronizeSparkInvestmentFirebase(secondSession, { ...input, observedAt: new Timestamp(input.observedAt.seconds, input.observedAt.nanoseconds) })).idempotent, true);
  const state = await readInvestment(), op = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  assert.equal(state.currentBalanceInCents, 6000); assert.equal(state.reference!.observedValueInCents, 6000);
  assert.ok(state.reference!.observedAt.isEqual(input.observedAt)); assert.equal(state.reference!.includesBoundary, false);
  assert.equal(op.kind, 'investment_sync'); assert.equal(op.differenceInCents, 1000); assert.deepEqual(await balance('bank'), bank);
  const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput('sync_history_123456'), accountId: 'investment', asOf: await confirmedNow('investment') });
  assert.equal(proof.balanceInCents, 6000); assert.equal(proof.baselineOperationId, input.clientActionId);
  await financialRejection(synchronizeSparkInvestmentFirebase(owner, { ...input, observedValueInCents: 6200 }), /outros argumentos/);
  await financialRejection(synchronizeSparkInvestmentFirebase(owner, { ...input, observedAt: past('2026-09-16T12:00:00Z') }), /outros argumentos/);
});
for (const value of [0, 4000, 5000, 1_000_000_000_000]) test(`Spark investment sync accepts observed value ${value} without treating it as principal`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = investmentSync({ observedValueInCents: value });
  await prepareSparkInvestmentSyncFirebase(owner, input); await synchronizeSparkInvestmentFirebase(owner, input);
  assert.equal((await readInvestment()).currentBalanceInCents, value); assert.equal((await balance('investment')).revision, 1);
  assert.equal((await balance('bank')).balanceInCents, 10000);
});
test('Spark investment sync preserves later deposit and keeps observed reference separate from current balance', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await transferSparkFundsFirebase(owner, command({ kind: 'investment_deposit', toAccountId: 'investment', amountInCents: 1000 }));
  const input = investmentSync({ observedValueInCents: 6200, expectedRevision: 1 });
  await prepareSparkInvestmentSyncFirebase(owner, input); await synchronizeSparkInvestmentFirebase(owner, input);
  const state = await readInvestment(); assert.equal(state.currentBalanceInCents, 7200); assert.equal(state.reference!.observedValueInCents, 6200);
  assert.equal((await balance('bank')).balanceInCents, 9000);
  const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput('after_sync_123456'), accountId: 'investment', asOf: await confirmedNow('investment') });
  assert.equal(proof.balanceInCents, 7200);
});
test('Spark investment sync preserves later redemption and rejects a negative resulting current balance', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await transferSparkFundsFirebase(owner, command({ kind: 'investment_redemption', fromAccountId: 'investment', toAccountId: 'bank', amountInCents: 4500 }));
  const input = investmentSync({ observedValueInCents: 1000, expectedRevision: 1 });
  await prepareSparkInvestmentSyncFirebase(owner, input); await financialRejection(synchronizeSparkInvestmentFirebase(owner, input), /Saldo insuficiente/);
  await denied((await rawInvestmentSync({ input })).commit()); assert.equal((await readInvestment()).currentBalanceInCents, 500);
  assert.equal((await balance('bank')).balanceInCents, 14500); assert.equal((await getDoc(operationRef(owner, input.clientActionId))).exists(), false);
  const valid = investmentSync({ clientActionId: 'valid_redemption_sync_123456', observedValueInCents: 6000, expectedRevision: 1 });
  await prepareSparkInvestmentSyncFirebase(owner, valid); await synchronizeSparkInvestmentFirebase(owner, valid);
  assert.equal((await readInvestment()).currentBalanceInCents, 1500); assert.equal((await readInvestment()).reference!.observedValueInCents, 6000);
});
test('Spark investment sync retroactive value cannot replace a later observed reference', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const later = investmentSync();
  await prepareSparkInvestmentSyncFirebase(owner, later); await synchronizeSparkInvestmentFirebase(owner, later);
  await transferSparkFundsFirebase(owner, command({ kind: 'investment_deposit', toAccountId: 'investment', amountInCents: 500 }));
  const earlier = investmentSync({ clientActionId: 'earlier_sync_123456', observedAt: past('2026-09-10T12:00:00Z'), observedValueInCents: 8000, expectedRevision: 2 });
  await prepareSparkInvestmentSyncFirebase(secondSession, earlier); await synchronizeSparkInvestmentFirebase(owner, earlier);
  const state = await readInvestment(); assert.equal(state.currentBalanceInCents, 6500); assert.equal(state.reference!.operationId, later.clientActionId);
  assert.equal((await getDoc(operationRef(owner, earlier.clientActionId))).data()!.currentEffectInCents, 0);
  for (const [asOf, expected] of [['2026-09-12T12:00:00Z', 8000], ['2026-09-20T12:00:00Z', 6000]] as const) {
    const input = { ...preparationInput(`history_${expected}_123456`), accountId: 'investment', asOf: past(asOf) };
    const proof = await prepareSparkHistoryProofFirebase(owner, input, 100, { useSegments: true }); assert.equal(proof.balanceInCents, expected);
  }
});
test('Spark investment sync at the same instant uses the latest revision and exact checkpoint boundary', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = investmentSync();
  await prepareSparkInvestmentSyncFirebase(owner, input); await synchronizeSparkInvestmentFirebase(owner, input);
  const second = investmentSync({ clientActionId: 'same_date_sync_123456', observedValueInCents: 6500, expectedRevision: 1 });
  await prepareSparkInvestmentSyncFirebase(owner, second); await synchronizeSparkInvestmentFirebase(owner, second);
  const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput(), accountId: 'investment', asOf: input.observedAt }, 100, { useSegments: true });
  assert.equal(proof.balanceInCents, 6500); assert.equal(proof.baselineOperationId, second.clientActionId);
});
test('Spark investment sync requires complete proof and rejects stale confirmation after a deposit', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = investmentSync();
  await financialRejection(synchronizeSparkInvestmentFirebase(owner, input), /Conclua a projeção/);
  const partial = await prepareSparkInvestmentSyncFirebase(owner, input, 1); assert.notEqual(partial.phase, 'done');
  await financialRejection(synchronizeSparkInvestmentFirebase(owner, input), /Conclua a projeção/); await denied((await rawInvestmentSync()).commit());
  await prepareSparkInvestmentSyncFirebase(secondSession, input);
  await transferSparkFundsFirebase(owner, command({ kind: 'investment_deposit', toAccountId: 'investment' }));
  await financialRejection(synchronizeSparkInvestmentFirebase(owner, input), /desatualizada/); await denied((await rawInvestmentSync()).commit());
  assert.equal((await readInvestment()).currentBalanceInCents, 6000);
});
test('Spark investment sync raw control requires the same authenticated proof and atomic reference', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await prepareSparkInvestmentSyncFirebase(owner, investmentSync());
  await (await rawInvestmentSync()).commit(); assert.equal((await readInvestment()).currentBalanceInCents, 6000);
});
for (const omit of ['position', 'operation', 'checkpoint', 'quota'] as const) test(`Spark investment sync rejects missing ${omit}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await prepareSparkInvestmentSyncFirebase(owner, investmentSync());
  await denied((await rawInvestmentSync({ omit })).commit()); assert.equal((await readInvestment()).currentBalanceInCents, 5000);
});
for (const [label, options] of [
  ['forged projected value', { operation: { previousBalanceInCents: 4000, differenceInCents: 2000 } }],
  ['forged difference', { operation: { differenceInCents: 5000 } }],
  ['forged current effect', { operation: { currentEffectInCents: 5000 }, position: { balanceInCents: 10000 } }],
  ['wrong previous head', { operation: { previousOperationId: 'bootstrap_bank' } }],
  ['wrong revision', { operation: { expectedRevision: 1 }, position: { revision: 2 } }],
  ['changed observed date', { operation: { effectiveAt: past('2026-09-13T12:00:00Z') } }],
  ['missing observed date', { operation: { requestedEffectiveAt: deleteField() } }],
  ['forged actor', { operation: { actorId: 'another' } }],
  ['bank reconciliation kind', { operation: { kind: 'dated_reconciliation' } }],
  ['principal field', { operation: { initialValueInCents: 6000 } }],
  ['forged reference value', { checkpoint: { countedBalanceInCents: 9999 } }],
  ['inclusive reference', { checkpoint: { includesBoundary: true } }],
  ['commit time replacing observed time', { operation: { effectiveMode: 'commit', effectiveAt: serverTimestamp() } }],
  ['monthly cycle on manual value', { operation: { cycle: '2026-09' } }],
] as const) test(`Spark investment sync Rules reject ${label}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await prepareSparkInvestmentSyncFirebase(owner, investmentSync());
  await denied((await rawInvestmentSync(options)).commit());
});
for (const value of [-1, 0.5, 1_000_000_000_001, NaN, Infinity]) test(`Spark investment sync rejects invalid observed value ${value} in client and Rules`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await financialRejection(synchronizeSparkInvestmentFirebase(owner, investmentSync({ observedValueInCents: value })), /inválidos/);
  await prepareSparkInvestmentSyncFirebase(owner, investmentSync());
  await denied((await rawInvestmentSync({ input: investmentSync({ observedValueInCents: value }) })).commit());
});
for (const accountId of ['bank', 'cash'] as const) test(`Spark investment sync rejects a ${accountId} account even with a valid history proof`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = investmentSync({ accountId });
  await prepareSparkInvestmentSyncFirebase(owner, input); await financialRejection(synchronizeSparkInvestmentFirebase(owner, input), /incompatível/);
  await denied((await rawInvestmentSync({ input })).commit());
  await financialRejection(readSparkInvestmentStateFirebase(owner, { groupId: 'proof', actorId: uid, accountId }), /conta de investimento/);
});
test('Spark investment sync requires admin at confirmation and fresh authorized reads', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = investmentSync(); await prepareSparkInvestmentSyncFirebase(owner, input);
  await seedGroup({ members: { [uid]: 'member' } }); await financialRejection(synchronizeSparkInvestmentFirebase(owner, input), /administrador/);
  await denied((await rawInvestmentSync()).commit()); assert.equal((await readInvestment()).currentBalanceInCents, 5000);
  await financialRejection(readInvestment(expired), /sessão autenticada mudou/); await denied(getDoc(positionRef(expired, 'investment')));
  await financialRejection(readInvestment(outsider), /sessão autenticada mudou/);
  await denied(getDoc(positionRef(outsider, 'investment')));
});
test('Spark investment sync cannot debit a bank or reuse an old receipt for another effect', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = investmentSync(); await prepareSparkInvestmentSyncFirebase(owner, input);
  const forged = await rawInvestmentSync(); forged.update(positionRef(owner, 'bank'), { balanceInCents: 9000, revision: 1,
    lastOperationId: input.clientActionId, updatedAt: serverTimestamp() }); await denied(forged.commit());
  await synchronizeSparkInvestmentFirebase(owner, input);
  const replay = writeBatch(owner); replay.update(positionRef(owner, 'investment'), { balanceInCents: 7000, revision: 2,
    lastOperationId: input.clientActionId, updatedAt: serverTimestamp() }); await denied(replay.commit());
});
test('Spark investment sync refuses future observed time and expired position deadline', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = investmentSync(); await prepareSparkInvestmentSyncFirebase(owner, input);
  await denied((await rawInvestmentSync({ operation: { effectiveAt: past('2099-01-01T12:00:00Z'), requestedEffectiveAt: past('2099-01-01T12:00:00Z') } })).commit());
  await financialRejection(prepareSparkInvestmentSyncFirebase(owner, { ...input, clientActionId: 'future_sync_123456', observedAt: past('2099-01-01T12:00:00Z') }));
  await seedPosition('investment', { nextActivationAt: past('2026-09-01T12:00:00Z') });
  await financialRejection(synchronizeSparkInvestmentFirebase(owner, input), /aberturas mensais vencidas/); await denied(readInvestment());
});
test('Spark investment sync refuses groups from the preceding protocol', async () => {
  await seedGroup({ members: { [uid]: 'admin' }, sparkProtocol: 'financial-proof-v9' });
  await financialRejection(synchronizeSparkInvestmentFirebase(owner, investmentSync()), /não habilitado/);
  await denied(getDoc(positionRef(owner, 'investment')));
});

test('Spark investment sync identical concurrent confirmations create one reference and one quota charge', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = investmentSync(); await prepareSparkInvestmentSyncFirebase(owner, input);
  await acknowledgePriorSend();
  const results = await Promise.all([synchronizeSparkInvestmentFirebase(owner, input), synchronizeSparkInvestmentFirebase(secondSession, input)]);
  assert.deepEqual(results.map(result => result.idempotent).sort(), [false, true]); assert.equal((await readInvestment()).revision, 1);
  assert.equal((await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!.count, 1);
});
test('Spark investment sync conflicting confirmed previews cannot both change the same position', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const first = investmentSync(), second = investmentSync({ clientActionId: 'competing_sync_123456', observedValueInCents: 7000 });
  await prepareSparkInvestmentSyncFirebase(owner, first); await prepareSparkInvestmentSyncFirebase(secondSession, second);
  await acknowledgePriorSend();
  const results = await Promise.allSettled([synchronizeSparkInvestmentFirebase(owner, first), synchronizeSparkInvestmentFirebase(secondSession, second)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const state = await readInvestment(), winner = results[0].status === 'fulfilled' ? first : second, loser = winner === first ? second : first;
  assert.equal(state.revision, 1); assert.equal(state.currentBalanceInCents, winner.observedValueInCents); assert.equal(state.reference!.operationId, winner.clientActionId);
  assert.equal((await getDoc(operationRef(owner, loser.clientActionId))).exists(), false); assert.equal((await balance('bank')).balanceInCents, 10000);
});

test('Spark investment sync cannot be certified as an ordinary movement to skip its checkpoint', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const firstId = 'before_sync_deposit_123456', afterId = 'after_sync_deposit_123456';
  await transferSparkFundsFirebase(owner, command({ clientActionId: firstId, kind: 'investment_deposit', toAccountId: 'investment' }));
  const input = investmentSync({ expectedRevision: 1 }); await prepareSparkInvestmentSyncFirebase(owner, input); await synchronizeSparkInvestmentFirebase(owner, input);
  await transferSparkFundsFirebase(owner, command({ clientActionId: afterId, kind: 'investment_deposit', toAccountId: 'investment', amountInCents: 500 }));
  const result = await certifySparkHistorySegmentFirebase(owner, { ...segmentInput(), accountId: 'investment', olderOperationId: input.clientActionId, newerOperationId: afterId });
  assert.equal(result.segment, null); assert.equal(result.created, false);
  const after = (await getDoc(operationRef(owner, afterId))).data()!;
  await denied((await rawSegment({ accountId: 'investment', data: { leftId: input.clientActionId, rightId: afterId,
    lastOperationId: afterId, previousOperationId: firstId, minAt: input.observedAt, maxAt: after.createdAt, deltaInCents: 1500, absoluteDeltaInCents: 1500 } })).commit());
});

function fundedOpening(overrides: Partial<SparkInvestmentOpeningInput> = {}): SparkInvestmentOpeningInput {
  return { groupId: 'proof', actorId: uid, clientActionId: 'funded_opening_123456', accountId: 'new-investment', fundingAccountId: 'bank',
    expectedFundingRevision: 0, principalInCents: 1000, observedValueInCents: 1200, catalog: accountCatalog(), ...overrides };
}
const capitalRef = (id = 'new-investment', firestore = owner) => doc(firestore, 'financialGroups/proof/sparkInvestmentCapital', id);
const fundedState = (id = 'new-investment', firestore = owner) => readSparkInvestmentStateFirebase(firestore, { groupId: 'proof', actorId: uid, accountId: id });
async function rawFundedOpening(options: { input?: SparkInvestmentOpeningInput | SparkDatedInvestmentOpeningInput; operation?: Record<string, unknown>; bank?: Record<string, unknown>;
  position?: Record<string, unknown>; catalog?: Record<string, unknown>; capital?: Record<string, unknown>; checkpoint?: Record<string, unknown>;
  omit?: 'bank' | 'position' | 'operation' | 'catalog' | 'capital' | 'checkpoint' | 'quota'; firestore?: typeof owner } = {}) {
  const input = options.input ?? fundedOpening(), firestore = options.firestore ?? owner, id = input.clientActionId, batch = writeBatch(firestore);
  const bank = (await getDoc(positionRef(owner, input.fundingAccountId))).data()!;
  const at = 'effectiveAt' in input ? input.effectiveAt : undefined;
  const checkpoint = at ? (await getDoc(doc(owner, 'financialGroups/proof/sparkCheckpoints', input.fundingAccountId))).data() : null;
  const bankEffect = at && checkpoint && (at.seconds < checkpoint.effectiveAt.seconds
    || at.seconds === checkpoint.effectiveAt.seconds && (at.nanoseconds < checkpoint.effectiveAt.nanoseconds
      || at.nanoseconds === checkpoint.effectiveAt.nanoseconds && !checkpoint.includesBoundary)) ? 0 : -input.principalInCents;
  if (options.omit !== 'operation') batch.set(operationRef(firestore, id), { schemaVersion: 1, actorId: uid, kind: 'investment_opening', dated: false, accountKind: 'investment',
    fromAccountId: input.fundingAccountId, toAccountId: input.accountId, fromRevision: input.expectedFundingRevision, fromPreviousOperationId: bank.lastOperationId,
    amountInCents: input.principalInCents, openingBalanceInCents: input.observedValueInCents,
    valuationDifferenceInCents: input.observedValueInCents - input.principalInCents, ...input.catalog, note: null, createdAt: serverTimestamp(),
    ...(at ? { dated: true, effectiveAt: at, fromCurrentEffectInCents: bankEffect } : {}), ...options.operation }, { merge: true });
  if (options.omit !== 'bank') batch.update(positionRef(firestore, input.fundingAccountId), { balanceInCents: bank.balanceInCents + bankEffect,
    revision: bank.revision + 1, lastOperationId: id, updatedAt: serverTimestamp(), ...options.bank });
  if (options.omit !== 'position') batch.set(positionRef(firestore, input.accountId), { schemaVersion: 1, kind: 'investment', active: true,
    balanceInCents: input.observedValueInCents, revision: 0, lastOperationId: id, nextActivationAt: null, updatedAt: serverTimestamp(), ...options.position });
  if (options.omit !== 'catalog') batch.set(catalogRef(firestore, input.accountId), { schemaVersion: 1, actorId: uid, accountKind: 'investment', ...input.catalog,
    revision: 0, lastOperationId: id, updatedAt: serverTimestamp(), ...options.catalog });
  if (options.omit !== 'capital') batch.set(capitalRef(input.accountId, firestore), { schemaVersion: 1, actorId: uid, initialValueInCents: input.principalInCents,
    fundingAccountId: input.fundingAccountId, openingOperationId: id, revision: 0, lastOperationId: id, updatedAt: serverTimestamp(), ...options.capital });
  if (options.omit !== 'checkpoint') batch.set(doc(firestore, 'financialGroups/proof/sparkCheckpoints', input.accountId), {
    operationId: id, countedBalanceInCents: input.observedValueInCents, effectiveAt: at ?? serverTimestamp(), includesBoundary: false, ...options.checkpoint });
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data(), window = Math.floor(Date.now() / 60000) * 60000;
  if (options.omit !== 'quota') batch.set(doc(firestore, 'sparkTransferQuotas', uid), { groupId: 'proof', count: quota?.windowStartInMillis === window ? quota.count + 1 : 1,
    windowStartInMillis: window, lastOperationId: id, updatedAt: serverTimestamp() });
  return batch;
}
test('Spark funded opening atomically debits principal and registers observed value, catalog and original principal', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = fundedOpening();
  await openFundedSparkInvestmentFirebase(owner, input); const state = await fundedState();
  assert.equal((await balance('bank')).balanceInCents, 9000); assert.equal(state.currentBalanceInCents, 1200); assert.equal(state.revision, 0);
  assert.equal(state.principal!.initialValueInCents, 1000); assert.equal(state.principal!.openingOperationId, input.clientActionId);
  assert.equal(state.reference!.observedValueInCents, 1200); assert.equal((await getDoc(catalogRef(owner, input.accountId))).data()!.name, 'Reserva');
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!; assert.equal(receipt.valuationDifferenceInCents, 200);
  assert.equal((await openFundedSparkInvestmentFirebase(secondSession, { ...input, catalog: { ...input.catalog } })).idempotent, true);
  assert.equal((await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!.count, 1);
  await financialRejection(openFundedSparkInvestmentFirebase(owner, { ...input, principalInCents: 1100 }), /outros argumentos/);
  await financialRejection(openFundedSparkInvestmentFirebase(owner, { ...input, catalog: { ...input.catalog, name: 'Changed' } }), /outros argumentos/);
});
for (const value of [0, 800, 1000, 1_000_000_000_000]) test(`Spark funded opening accepts initial observed value ${value} independently of principal`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await openFundedSparkInvestmentFirebase(owner, fundedOpening({ observedValueInCents: value }));
  const state = await fundedState(); assert.equal(state.currentBalanceInCents, value); assert.equal(state.principal!.initialValueInCents, 1000);
  assert.equal((await balance('bank')).balanceInCents, 9000);
});
test('Spark funded opening proves bank debit and investment root on both sides of the creation instant', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = fundedOpening(); await openFundedSparkInvestmentFirebase(owner, input);
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!, at = receipt.createdAt as InstanceType<typeof Timestamp>;
  const before = new Timestamp(at.seconds, at.nanoseconds === 0 ? 0 : at.nanoseconds - 1);
  const earlier = at.nanoseconds === 0 ? new Timestamp(at.seconds - 1, 999999999) : before;
  for (const [accountId, asOf, expected] of [['bank', earlier, 10000], ['bank', at, 9000], [input.accountId, earlier, 0], [input.accountId, at, 1200]] as const) {
    const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput(`funded_${accountId}_${expected}_123456`), accountId, asOf }, 100, { useSegments: true });
    assert.equal(proof.balanceInCents, expected);
  }
});
test('Spark funded opening remains coherent after deposit, redemption and dated synchronization', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = fundedOpening(); await openFundedSparkInvestmentFirebase(owner, input);
  await transferSparkFundsFirebase(owner, command({ kind: 'investment_deposit', toAccountId: input.accountId, amountInCents: 500 }));
  const sync = investmentSync({ accountId: input.accountId, expectedRevision: 1, observedAt: await confirmedNow(input.accountId), observedValueInCents: 1800 });
  await prepareSparkInvestmentSyncFirebase(owner, sync); await synchronizeSparkInvestmentFirebase(owner, sync);
  await transferSparkFundsFirebase(owner, command({ clientActionId: 'funded_redemption_123456', kind: 'investment_redemption', fromAccountId: input.accountId, toAccountId: 'bank', amountInCents: 200 }));
  // Reprodução determinística: commits distintos podem compartilhar o instante; a revisão conserva a ordem.
  await environment.withSecurityRulesDisabled(async context => {
    await seedUpdateDoc(seedDoc(context.firestore(), 'financialGroups', 'proof', 'sparkOperations', 'funded_redemption_123456'), { createdAt: sync.observedAt.toDate() });
  });
  const state = await fundedState(); assert.equal(state.currentBalanceInCents, 1600); assert.equal(state.reference!.observedValueInCents, 1800);
  assert.equal(state.principal!.initialValueInCents, 1000); assert.equal((await balance('bank')).balanceInCents, 8700);
  const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput('funded_later_history_123456'), accountId: input.accountId, asOf: await confirmedNow(input.accountId) });
  assert.equal(proof.balanceInCents, 1600);
});
test('Spark funded opening raw control creates the exact same atomic effects', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await (await rawFundedOpening()).commit();
  assert.equal((await fundedState()).currentBalanceInCents, 1200); assert.equal((await balance('bank')).balanceInCents, 9000);
});
for (const omit of ['bank', 'position', 'operation', 'catalog', 'capital', 'checkpoint', 'quota'] as const) test(`Spark funded opening rejects missing ${omit}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await denied((await rawFundedOpening({ omit })).commit());
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await getDoc(positionRef(owner, 'new-investment'))).exists(), false);
});
for (const [label, options] of [
  ['bank debit based on valuation', { bank: { balanceInCents: 8800 } }],
  ['missing principal debit', { bank: { balanceInCents: 10000 } }], ['invented valuation difference', { operation: { valuationDifferenceInCents: 999 } }],
  ['wrong opening value', { position: { balanceInCents: 1000 } }], ['wrong investment kind', { position: { kind: 'bank' } }],
  ['nonroot revision', { position: { revision: 1 } }], ['inactive investment', { position: { active: false } }],
  ['forged bank predecessor', { operation: { fromPreviousOperationId: 'bootstrap_cash' } }],
  ['skipped bank revision', { operation: { fromRevision: 1 }, bank: { revision: 2 } }],
  ['catalog mismatch', { catalog: { name: 'Other' } }], ['forged principal', { capital: { initialValueInCents: 1200 } }],
  ['principal funding bank', { capital: { fundingAccountId: 'third' } }], ['mutable principal revision', { capital: { revision: 1 } }],
  ['principal extra field', { capital: { administrator: true } }], ['forged principal actor', { capital: { actorId: 'other' } }],
  ['wrong principal source', { capital: { openingOperationId: 'unrelated_123456' } }],
  ['forged observed reference', { checkpoint: { countedBalanceInCents: 1000 } }], ['inclusive initial reference', { checkpoint: { includesBoundary: true } }],
  ['forged actor', { operation: { actorId: 'other' } }], ['retroactive field', { operation: { effectiveAt: past() } }],
  ['unknown field', { operation: { overdraftReason: 'authorize' } }], ['missing material field', { operation: { amountInCents: deleteField() } }],
] as const) test(`Spark funded opening Rules reject ${label}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await denied((await rawFundedOpening(options)).commit());
});
for (const [label, changes] of [
  ['zero principal', { principalInCents: 0 }], ['negative principal', { principalInCents: -1 }], ['fractional principal', { principalInCents: 0.5 }],
  ['excessive principal', { principalInCents: 1_000_000_000_001 }], ['negative valuation', { observedValueInCents: -1 }],
  ['fractional valuation', { observedValueInCents: 0.5 }], ['excessive valuation', { observedValueInCents: 1_000_000_000_001 }],
] as const) test(`Spark funded opening rejects ${label} in service and Rules`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = fundedOpening(changes);
  await financialRejection(openFundedSparkInvestmentFirebase(owner, input), /inválidos/); await denied((await rawFundedOpening({ input })).commit());
});
test('Spark funded opening cannot overdraw funding even with sufficient observed investment value', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = fundedOpening({ principalInCents: 10001, observedValueInCents: 20000 });
  await financialRejection(openFundedSparkInvestmentFirebase(owner, input), /insuficiente/); await denied((await rawFundedOpening({ input })).commit());
  assert.equal((await balance('bank')).balanceInCents, 10000);
});
for (const source of ['cash', 'investment'] as const) test(`Spark funded opening rejects ${source} funding source`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = fundedOpening({ fundingAccountId: source, catalog: { ...accountCatalog(), bankAccountId: source } });
  await financialRejection(openFundedSparkInvestmentFirebase(owner, input), /conta bancária/); await denied((await rawFundedOpening({ input })).commit());
});
test('Spark funded opening requires admin and current group protocol', async () => {
  await financialRejection(openFundedSparkInvestmentFirebase(owner, fundedOpening()), /administrador/); await denied((await rawFundedOpening()).commit());
  await seedGroup({ members: { [uid]: 'admin' }, sparkProtocol: 'financial-proof-v10' });
  await financialRejection(openFundedSparkInvestmentFirebase(owner, fundedOpening()), /não habilitado/);
  await seedGroup({ members: { [uid]: 'admin' }, sparkProtocol: SPARK_TRANSFER_PROOF_PROTOCOL });
  await denied((await rawFundedOpening({ firestore: outsider })).commit()); await denied((await rawFundedOpening({ firestore: expired })).commit());
});
test('Spark funded opening requires current funding revision, active bank and unexpired monthly deadline', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await transferSparkFundsFirebase(owner, command());
  await financialRejection(openFundedSparkInvestmentFirebase(owner, fundedOpening()), /banco mudou/); await denied((await rawFundedOpening()).commit());
  const input = fundedOpening({ expectedFundingRevision: 1 }); await seedPosition('bank', { nextActivationAt: past() });
  await financialRejection(openFundedSparkInvestmentFirebase(owner, input), /aberturas mensais vencidas/); await denied((await rawFundedOpening({ input })).commit());
  await seedPosition('bank', { nextActivationAt: null, active: false }); await financialRejection(openFundedSparkInvestmentFirebase(owner, input), /inválida ou inativa/);
  await denied((await rawFundedOpening({ input })).commit());
});
test('Spark funded opening cannot overwrite an existing position or orphaned catalog', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const existing = fundedOpening({ accountId: 'investment' });
  await financialRejection(openFundedSparkInvestmentFirebase(owner, existing), /já existe/); await denied((await rawFundedOpening({ input: existing })).commit());
  await environment.withSecurityRulesDisabled(async context => seedSetDoc(seedDoc(context.firestore(), 'financialGroups/proof/sparkAccountCatalog/new-investment'), { legacy: true }));
  await financialRejection(openFundedSparkInvestmentFirebase(owner, fundedOpening()), /já existe/); await denied((await rawFundedOpening()).commit());
});
test('Spark funded opening stable identity supports concurrent replay and rejects duplicate account creation', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = fundedOpening();
  await acknowledgePriorSend();
  const results = await Promise.all([openFundedSparkInvestmentFirebase(owner, input), openFundedSparkInvestmentFirebase(secondSession, input)]);
  assert.deepEqual(results.map(result => result.idempotent).sort(), [false, true]); assert.equal((await balance('bank')).balanceInCents, 9000);
  await financialRejection(openFundedSparkInvestmentFirebase(owner, { ...input, clientActionId: 'duplicate_funded_123456', expectedFundingRevision: 1 }), /já existe/);
  for (const operation of ['update', 'delete'] as const) {
    const batch = writeBatch(owner); if (operation === 'update') batch.update(capitalRef(), { initialValueInCents: 42 }); else batch.delete(capitalRef());
    await denied(batch.commit());
  }
});
test('Spark funded opening independent concurrent creations cannot both consume the same confirmed bank revision', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const first = fundedOpening(), second = fundedOpening({ accountId: 'another-investment', clientActionId: 'another_funded_123456' });
  await acknowledgePriorSend();
  const results = await Promise.allSettled([openFundedSparkInvestmentFirebase(owner, first), openFundedSparkInvestmentFirebase(secondSession, second)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal((await balance('bank')).balanceInCents, 9000);
  const loser = results[0].status === 'fulfilled' ? second : first;
  assert.equal((await getDoc(positionRef(owner, loser.accountId))).exists(), false); assert.equal((await getDoc(capitalRef(loser.accountId))).exists(), false);
});
test('Spark funded opening refuses ambiguous dates and mismatched linked bank', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  for (const key of ['date', 'effectiveAt', 'observedAt']) await financialRejection(openFundedSparkInvestmentFirebase(owner, { ...fundedOpening(), [key]: past() } as any), /não aceita data/);
  await financialRejection(openFundedSparkInvestmentFirebase(owner, fundedOpening({ catalog: { ...accountCatalog(), bankAccountId: 'third' } })), /banco vinculado/);
  await denied((await rawFundedOpening({ operation: { bankAccountId: 'third' }, catalog: { bankAccountId: 'third' } })).commit());
});

test('Spark funded opening certificates on the bank side sum principal without treating valuations as cash flows', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const ids = ['funding_first_123456', 'funding_second_123456', 'funding_third_123456'];
  for (let index = 0; index < ids.length; index++) await openFundedSparkInvestmentFirebase(owner, fundedOpening({ accountId: `new-investment-${index}`,
    clientActionId: ids[index], expectedFundingRevision: index }));
  const result = await certifySparkHistorySegmentFirebase(owner, { ...segmentInput(), olderOperationId: ids[1], newerOperationId: ids[2] });
  assert.equal(result.segment!.deltaInCents, -2000); assert.equal(result.segment!.absoluteDeltaInCents, 2000);
  const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput(), asOf: await confirmedNow() }, 100, { useSegments: true });
  assert.equal(proof.balanceInCents, 7000); assert.equal((await fundedState('new-investment-2')).currentBalanceInCents, 1200);
});
test('Spark funded opening principal stays private to current members and replay needs current admin', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = fundedOpening(); await openFundedSparkInvestmentFirebase(owner, input);
  await denied(getDoc(capitalRef(input.accountId, outsider))); await denied(getDoc(capitalRef(input.accountId, expired)));
  await seedGroup({ members: { [uid]: 'member' } }); await financialRejection(openFundedSparkInvestmentFirebase(owner, input), /administrador/);
  assert.equal((await fundedState()).principal!.initialValueInCents, 1000); assert.equal((await balance('bank')).balanceInCents, 9000);
});

function datedPair(overrides: Partial<SparkDatedTransferInput> = {}): SparkDatedTransferInput {
  return { ...command({ clientActionId: 'dated_pair_123456', kind: 'investment_deposit', toAccountId: 'investment' }), effectiveAt: past('2026-09-05T12:00:00Z'), ...overrides };
}
function datedUndo(originalOperationId = 'dated_pair_123456', clientActionId = 'dated_undo_123456') {
  return { groupId: 'proof', actorId: uid, originalOperationId, clientActionId, effectiveAt: past('2026-09-08T12:00:00Z') };
}
async function rawDatedPair(options: { input?: SparkDatedTransferInput; operation?: Record<string, unknown>; fromEffect?: number; toEffect?: number;
  omit?: 'from' | 'to' | 'operation' | 'quota'; originalOperationId?: string; originalSource?: 'live' | 'imported'; claim?: Record<string, unknown> } = {}) {
  const input = options.input ?? datedPair(), batch = writeBatch(owner), id = input.clientActionId;
  const from = await balance(input.fromAccountId), to = await balance(input.toAccountId);
  const effect = async (accountId: string, delta: number) => {
    const checkpoint = (await getDoc(doc(owner, 'financialGroups/proof/sparkCheckpoints', accountId))).data();
    return !checkpoint || input.effectiveAt.seconds > checkpoint.effectiveAt.seconds || input.effectiveAt.seconds === checkpoint.effectiveAt.seconds
      && (input.effectiveAt.nanoseconds > checkpoint.effectiveAt.nanoseconds || input.effectiveAt.nanoseconds === checkpoint.effectiveAt.nanoseconds && checkpoint.includesBoundary) ? delta : 0;
  };
  const fromEffect = options.fromEffect ?? await effect(input.fromAccountId, -input.amountInCents), toEffect = options.toEffect ?? await effect(input.toAccountId, input.amountInCents);
  if (options.omit !== 'operation') batch.set(operationRef(owner, id), { schemaVersion: 1, actorId: uid, kind: options.originalOperationId ? 'transfer_reversal' : input.kind,
    dated: true, fromAccountId: input.fromAccountId, toAccountId: input.toAccountId, amountInCents: input.amountInCents,
    fromRevision: from.revision, toRevision: to.revision, fromPreviousOperationId: from.lastOperationId, toPreviousOperationId: to.lastOperationId,
    effectiveAt: input.effectiveAt, fromCurrentEffectInCents: fromEffect, toCurrentEffectInCents: toEffect, note: null, overdraftReason: input.overdraftReason ?? null,
    ...(options.originalOperationId ? { reversesOperationId: options.originalOperationId, ...(options.originalSource === 'imported' ? { originalSource: 'imported' } : {}) } : {}),
    createdAt: serverTimestamp(), ...options.operation }, { merge: true });
  if (options.omit !== 'from') batch.update(positionRef(owner, input.fromAccountId), { balanceInCents: from.balanceInCents + fromEffect, revision: from.revision + 1,
    lastOperationId: id, updatedAt: serverTimestamp() });
  if (options.omit !== 'to') batch.update(positionRef(owner, input.toAccountId), { balanceInCents: to.balanceInCents + toEffect, revision: to.revision + 1,
    lastOperationId: id, updatedAt: serverTimestamp() });
  if (options.originalOperationId) batch.set(doc(owner, 'financialGroups/proof', options.originalSource === 'imported' ? 'sparkImportedClaims' : 'sparkReversals', options.originalOperationId), {
    schemaVersion: 1, actorId: uid, reversalOperationId: id, createdAt: serverTimestamp(), ...options.claim });
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data(), window = Math.floor(Date.now() / 60000) * 60000;
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', count: quota?.windowStartInMillis === window ? quota.count + 1 : 1,
    windowStartInMillis: window, lastOperationId: id, updatedAt: serverTimestamp() });
  return batch;
}
async function historicalPairBalance(accountId: string, asOf: string, expected: number, id: string) {
  const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput(id), accountId, asOf: past(asOf) }, 100, { useSegments: true });
  assert.equal(proof.balanceInCents, expected);
}
test('Spark dated pairs deposit at the selected historical date and distinguish commit/date replay identities', async () => {
  const input = datedPair(); await transferSparkDatedFundsFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, 9000); assert.equal((await balance('investment')).balanceInCents, 6000);
  assert.equal((await transferSparkDatedFundsFirebase(secondSession, { ...input, effectiveAt: new Timestamp(input.effectiveAt.seconds, input.effectiveAt.nanoseconds) })).idempotent, true);
  await financialRejection(transferSparkFundsFirebase(owner, command({ clientActionId: input.clientActionId, kind: input.kind, toAccountId: input.toAccountId })), /outros argumentos/);
  await financialRejection(transferSparkDatedFundsFirebase(owner, { ...input, effectiveAt: past('2026-09-06T12:00:00Z') }), /outros argumentos/);
  await seedGroup({ members: { [uid]: 'admin' } });
  await historicalPairBalance('bank', '2026-09-04T12:00:00Z', 10000, 'before_dated_bank_123456');
  await historicalPairBalance('investment', '2026-09-06T12:00:00Z', 6000, 'after_dated_asset_123456');
});
test('Spark dated pairs do not let a dated retry adopt an earlier commit-only receipt', async () => {
  const input = datedPair(); const { effectiveAt, ...commit } = input; await transferSparkFundsFirebase(owner, commit);
  await financialRejection(transferSparkDatedFundsFirebase(owner, input), /outros argumentos/);
});
for (const covered of ['bank', 'investment', 'both'] as const) test(`Spark dated pairs respect independent ${covered} references in deposit and reversal`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  if (covered !== 'investment') await countSparkAccountFirebase(owner, count({ targetBalanceInCents: 12000 }));
  if (covered !== 'bank') { const sync = investmentSync({ observedAt: past('2026-09-10T12:00:00Z'), observedValueInCents: 8000 });
    await prepareSparkInvestmentSyncFirebase(owner, sync); await synchronizeSparkInvestmentFirebase(owner, sync); }
  await transferSparkDatedFundsFirebase(owner, datedPair());
  const expectedBank = covered === 'investment' ? 9000 : 12000, expectedAsset = covered === 'bank' ? 6000 : 8000;
  assert.equal((await balance('bank')).balanceInCents, expectedBank); assert.equal((await balance('investment')).balanceInCents, expectedAsset);
  await reverseSparkDatedTransferFirebase(owner, datedUndo());
  assert.equal((await balance('bank')).balanceInCents, covered === 'investment' ? 10000 : 12000);
  assert.equal((await balance('investment')).balanceInCents, covered === 'bank' ? 5000 : 8000);
  const receipt = (await getDoc(operationRef(owner, 'dated_pair_123456'))).data()!;
  assert.equal(receipt.fromCurrentEffectInCents, covered === 'investment' ? -1000 : 0);
  assert.equal(receipt.toCurrentEffectInCents, covered === 'bank' ? 1000 : 0);
  await historicalPairBalance('investment', '2026-09-06T12:00:00Z', 6000, `dated_history_${covered}_123456`);
});
test('Spark dated pairs keep synchronization and movement dates independent at the same timestamp boundary', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const sync = investmentSync({ observedValueInCents: 8000 });
  await prepareSparkInvestmentSyncFirebase(owner, sync); await synchronizeSparkInvestmentFirebase(owner, sync);
  await transferSparkDatedFundsFirebase(owner, datedPair({ effectiveAt: sync.observedAt }));
  assert.equal((await balance('bank')).balanceInCents, 9000); assert.equal((await readInvestment()).currentBalanceInCents, 8000);
  assert.ok((await readInvestment()).reference!.observedAt.isEqual(sync.observedAt));
  const receipt = (await getDoc(operationRef(owner, 'dated_pair_123456'))).data()!; assert.equal(receipt.toCurrentEffectInCents, 0);
});
test('Spark dated pairs include the monthly opening boundary instead of treating it as an exact count', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const opening = temporal({ kind: 'monthly_opening', cycle: '2026-09', effectiveAt: past('2026-09-01T03:00:00Z'), targetBalanceInCents: 12000 });
  await preview(opening); await saveSparkTemporalBalanceFirebase(owner, opening);
  await transferSparkDatedFundsFirebase(owner, datedPair({ effectiveAt: opening.effectiveAt }));
  assert.equal((await balance('bank')).balanceInCents, 11000); assert.equal((await balance('investment')).balanceInCents, 6000);
});
test('Spark dated pairs support redemption and preserve both dates in historical reversal', async () => {
  const input = datedPair({ kind: 'investment_redemption', fromAccountId: 'investment', toAccountId: 'bank' });
  await transferSparkDatedFundsFirebase(owner, input); assert.equal((await balance('investment')).balanceInCents, 4000);
  await reverseSparkDatedTransferFirebase(owner, datedUndo()); assert.equal((await balance('investment')).balanceInCents, 5000);
  await seedGroup({ members: { [uid]: 'admin' } });
  await historicalPairBalance('investment', '2026-09-06T12:00:00Z', 4000, 'redemption_history_123456');
  await historicalPairBalance('investment', '2026-09-09T12:00:00Z', 5000, 'reversed_history_123456');
});
test('Spark dated pairs support bank/cash transfers without investment fields', async () => {
  await transferSparkDatedFundsFirebase(owner, datedPair({ kind: 'transfer', toAccountId: 'cash' }));
  assert.equal((await balance('bank')).balanceInCents, 9000); assert.equal((await balance('cash')).balanceInCents, 11000);
});
test('Spark dated pairs share one reversal claim with commit-only reversal and require the exact retry mode', async () => {
  await transferSparkDatedFundsFirebase(owner, datedPair()); const input = datedUndo(); await reverseSparkDatedTransferFirebase(owner, input);
  assert.equal((await reverseSparkDatedTransferFirebase(secondSession, input)).idempotent, true);
  await financialRejection(reverseSparkDatedTransferFirebase(owner, { ...input, effectiveAt: past('2026-09-09T12:00:00Z') }), /outros argumentos/);
  const { effectiveAt, ...commit } = input; await financialRejection(reverseSparkTransferFirebase(owner, commit), /outros argumentos/);
  await financialRejection(reverseSparkTransferFirebase(owner, { ...commit, clientActionId: 'another_undo_123456' }), /já foi estornada/);
});
test('Spark dated pairs raw control and raw reversal both fit Rules access budgets with two references', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await countSparkAccountFirebase(owner, count({ targetBalanceInCents: 12000 }));
  const sync = investmentSync(); await prepareSparkInvestmentSyncFirebase(owner, sync); await synchronizeSparkInvestmentFirebase(owner, sync);
  await (await rawDatedPair()).commit();
  await (await rawDatedPair({ input: datedPair({ clientActionId: 'raw_dated_undo_123456', fromAccountId: 'investment', toAccountId: 'bank' }), originalOperationId: 'dated_pair_123456' })).commit();
  assert.equal((await balance('bank')).balanceInCents, 12000); assert.equal((await balance('investment')).balanceInCents, 6000);
});
for (const omit of ['from', 'to', 'operation', 'quota'] as const) test(`Spark dated pairs reject missing ${omit}`, async () => {
  await denied((await rawDatedPair({ omit })).commit()); assert.equal((await balance('bank')).balanceInCents, 10000);
});
for (const [label, options] of [
  ['skipped source debit', { fromEffect: 0 }], ['skipped destination credit', { toEffect: 0 }],
  ['wrong source sign', { fromEffect: 1000 }], ['wrong destination sign', { toEffect: -1000 }],
  ['excessive source effect', { fromEffect: -2000 }], ['fractional destination effect', { toEffect: 0.5 }],
  ['missing date', { operation: { effectiveAt: deleteField() } }], ['missing source effect', { operation: { fromCurrentEffectInCents: deleteField() } }],
  ['missing destination effect', { operation: { toCurrentEffectInCents: deleteField() } }], ['missing mode', { operation: { dated: deleteField() } }],
  ['wrong mode type', { operation: { dated: 1 } }], ['date in commit mode', { operation: { dated: false } }],
  ['future date', { operation: { effectiveAt: past('2099-01-01Z') } }], ['date type', { operation: { effectiveAt: '2026-09-05' } }],
  ['negative date', { operation: { effectiveAt: new Timestamp(-1, 0) } }], ['actor spoofing', { operation: { actorId: 'another' } }],
  ['wrong source link', { operation: { fromPreviousOperationId: 'bootstrap_cash' } }], ['unknown field', { operation: { observedAt: past() } }],
] as const) test(`Spark dated pairs Rules reject ${label}`, async () => { await denied((await rawDatedPair(options)).commit()); });
test('Spark dated pairs cannot force current effects already covered by bank and investment counts', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await countSparkAccountFirebase(owner, count());
  const sync = investmentSync(); await prepareSparkInvestmentSyncFirebase(owner, sync); await synchronizeSparkInvestmentFirebase(owner, sync);
  await denied((await rawDatedPair({ fromEffect: -1000, toEffect: 1000 })).commit());
});
test('Spark dated pairs enforce current solvency and existing bank overdraft policy', async () => {
  const invalid = datedPair({ kind: 'investment_redemption', fromAccountId: 'investment', toAccountId: 'bank', amountInCents: 6000 });
  await financialRejection(transferSparkDatedFundsFirebase(owner, invalid), /Saldo insuficiente/); await denied((await rawDatedPair({ input: invalid })).commit());
  const debit = datedPair({ amountInCents: 11000 }); await financialRejection(transferSparkDatedFundsFirebase(owner, debit), /justificativa/);
  await transferSparkDatedFundsFirebase(owner, { ...debit, overdraftReason: 'Cheque especial autorizado' }); assert.equal((await balance('bank')).balanceInCents, -1000);
});
test('Spark dated pairs reject invalid dates and keep the commit-only API date guard', async () => {
  for (const value of [null, '2026-09-05', new Timestamp(-1, 0), past('2099-01-01Z')]) {
    await financialRejection(transferSparkDatedFundsFirebase(owner, { ...datedPair(), effectiveAt: value } as any), /data efetiva/);
  }
  await financialRejection(transferSparkDatedFundsFirebase(owner, { ...datedPair(), observedAt: past() } as any), /data efetiva/);
  await financialRejection(transferSparkFundsFirebase(owner, datedPair()), /não aceita data/);
});
test('Spark dated pairs one reversal wins across concurrent commit and dated commands', async () => {
  await transferSparkDatedFundsFirebase(owner, datedPair()); const input = datedUndo();
  const { effectiveAt, ...commit } = input;
  await acknowledgePriorSend();
  const results = await Promise.allSettled([reverseSparkDatedTransferFirebase(owner, input), reverseSparkTransferFirebase(secondSession, { ...commit, clientActionId: 'commit_racing_undo_123456' })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('investment')).balanceInCents, 5000);
});
test('Spark dated pairs exact concurrent commands debit only once', async () => {
  const input = datedPair(); const results = await Promise.all([transferSparkDatedFundsFirebase(owner, input), transferSparkDatedFundsFirebase(secondSession, input)]);
  assert.deepEqual(results.map(result => result.idempotent).sort(), [false, true]); assert.equal((await balance('bank')).balanceInCents, 9000);
});
test('Spark dated pairs reject previous protocol and refuse writes after access or deadline revocation', async () => {
  await seedGroup({ sparkProtocol: 'financial-proof-v11' }); await financialRejection(transferSparkDatedFundsFirebase(owner, datedPair()), /não habilitado/);
  await seedGroup({ sparkProtocol: SPARK_TRANSFER_PROOF_PROTOCOL }); await seedPosition('bank', { nextActivationAt: past() });
  await financialRejection(transferSparkDatedFundsFirebase(owner, datedPair()), /aberturas mensais vencidas/); await denied((await rawDatedPair()).commit());
  await seedPosition('bank', { nextActivationAt: null }); await transferSparkDatedFundsFirebase(owner, datedPair());
  await seedGroup({ members: {} }); await denied(transferSparkDatedFundsFirebase(owner, datedPair()));
});

test('Spark dated pairs certificates retain historical amounts even when current bank effects are zero', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await countSparkAccountFirebase(owner, count({ targetBalanceInCents: 12000 }));
  const ids = ['dated_cert_first_123456', 'dated_cert_second_123456', 'dated_cert_third_123456'];
  for (const [index, date] of ['2026-09-03T12:00:00Z', '2026-09-05T12:00:00Z', '2026-09-07T12:00:00Z'].entries()) {
    await transferSparkDatedFundsFirebase(owner, datedPair({ clientActionId: ids[index], effectiveAt: past(date) }));
  }
  const segment = await certifySparkHistorySegmentFirebase(owner, { ...segmentInput(), olderOperationId: ids[0], newerOperationId: ids[1] });
  assert.equal(segment.segment!.deltaInCents, -2000); assert.equal((await balance('bank')).balanceInCents, 12000);
  await historicalPairBalance('bank', '2026-09-06T12:00:00Z', 8000, 'dated_cert_bank_history_123456');
  await historicalPairBalance('investment', '2026-09-06T12:00:00Z', 7000, 'dated_cert_asset_history_123456');
});
test('Spark dated pairs preserve reversal authorship/admin policy and reject expired tokens', async () => {
  await denied(rawBatch(expired, { operation: { dated: true, effectiveAt: past(), fromCurrentEffectInCents: -1000, toCurrentEffectInCents: 1000 } }).commit());
  const otherUid = getAuth(outsider.app).currentUser!.uid;
  await seedGroup({ members: { [uid]: 'member', [otherUid]: 'member' } });
  await transferSparkDatedFundsFirebase(outsider, datedPair({ actorId: otherUid }));
  await financialRejection(reverseSparkDatedTransferFirebase(owner, datedUndo()), /próprias operações/);
  await denied((await rawDatedPair({ input: datedPair({ clientActionId: 'forged_dated_undo_123456', fromAccountId: 'investment', toAccountId: 'bank' }), originalOperationId: 'dated_pair_123456' })).commit());
  await seedGroup({ members: { [uid]: 'admin', [otherUid]: 'member' } }); await reverseSparkDatedTransferFirebase(owner, datedUndo());
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('investment')).balanceInCents, 5000);
});

function principalInput(overrides: Partial<SparkInvestmentPrincipalInput> = {}): SparkInvestmentPrincipalInput {
  return { groupId: 'proof', actorId: uid, clientActionId: 'principal_update_123456', accountId: 'new-investment', fundingAccountId: 'bank',
    openingOperationId: 'funded_opening_123456', expectedFundingRevision: 1, expectedInvestmentRevision: 0,
    expectedCapitalRevision: 0, expectedCapitalOperationId: 'funded_opening_123456', principalInCents: 1500, ...overrides };
}
async function setupPrincipal() {
  await seedGroup({ members: { [uid]: 'admin' } }); await openFundedSparkInvestmentFirebase(owner, fundedOpening());
}
const editValuation = () => ({ operationId: 'edit_valuation_123456', observedValueInCents: 1700 });
const valuationUndoInput = (): SparkInvestmentValuationReversalInput => ({ groupId: 'proof', actorId: uid, accountId: 'new-investment',
  clientActionId: 'valuation_undo_123456', originalOperationId: 'valuation_to_undo_123456', expectedRevision: 1, reason: 'Valor observado informado incorretamente' });
async function valuationToUndo() {
  await setupPrincipal();
  const sync = { groupId: 'proof', actorId: uid, accountId: 'new-investment', clientActionId: 'valuation_to_undo_123456', expectedRevision: 0,
    observedAt: Timestamp.now(), observedValueInCents: 1700, note: 'Avaliação de teste' };
  await prepareSparkInvestmentSyncFirebase(owner, sync); await synchronizeSparkInvestmentFirebase(owner, sync); return sync;
}
test('Spark valuation undo recalculates history without deleting the observation and replays once', async () => {
  await valuationToUndo(); const input = valuationUndoInput();
  const proof = await prepareSparkInvestmentValuationReversalFirebase(owner, input, 100);
  assert.equal(proof.balanceInCents, 1200); assert.equal(proof.purpose, 'valuation_undo');
  await reverseSparkInvestmentValuationFirebase(owner, input);
  assert.equal((await reverseSparkInvestmentValuationFirebase(secondSession, input)).idempotent, true);
  assert.equal((await balance(input.accountId)).balanceInCents, 1200); assert.equal((await balance('bank')).balanceInCents, 9000);
  assert.equal((await getDoc(operationRef(owner, input.originalOperationId))).exists(), true);
  const confirmation = await prepareSparkHistoryProofFirebase(owner, { ...input, clientActionId: 'valuation_after_undo_123456',
    asOf: Timestamp.now(), purpose: 'instant' });
  assert.equal(confirmation.balanceInCents, 1200);
});
test('Spark valuation undo includes later backfilled boundary movement and preserves later tail', async () => {
  const sync = await valuationToUndo();
  await transferSparkDatedFundsFirebase(owner, datedPair({ clientActionId: 'backfill_valuation_123456', fromAccountId: 'bank', toAccountId: 'new-investment',
    amountInCents: 100, effectiveAt: sync.observedAt, kind: 'investment_deposit' }));
  await transferSparkDatedFundsFirebase(owner, datedPair({ clientActionId: 'tail_valuation_123456', fromAccountId: 'bank', toAccountId: 'new-investment',
    amountInCents: 200, effectiveAt: Timestamp.now(), kind: 'investment_deposit' }));
  assert.equal((await balance('new-investment')).balanceInCents, 1900);
  const input = { ...valuationUndoInput(), expectedRevision: 3 };
  const proof = await prepareSparkInvestmentValuationReversalFirebase(owner, input, 100);
  assert.equal(proof.balanceInCents, 1300); assert.equal(proof.tailDeltaInCents, 200);
  await reverseSparkInvestmentValuationFirebase(owner, input);
  assert.equal((await balance('new-investment')).balanceInCents, 1500); assert.equal((await balance('bank')).balanceInCents, 8700);
});
test('Spark valuation undo rejects stale/currently replaced observations and ordinary proof reuse', async () => {
  const sync = await valuationToUndo(), input = valuationUndoInput();
  const proof = await prepareSparkInvestmentValuationReversalFirebase(owner, input, 100);
  await financialRejection(saveSparkTemporalBalanceFirebase(owner, { groupId: 'proof', actorId: uid, accountId: input.accountId, clientActionId: input.clientActionId,
    kind: 'investment_sync', expectedRevision: 1, effectiveAt: proof.asOf, targetBalanceInCents: 1200 }), /projeção correspondente/);
  await transferSparkDatedFundsFirebase(owner, datedPair({ clientActionId: 'stale_valuation_123456', fromAccountId: 'bank', toAccountId: 'new-investment',
    amountInCents: 200, effectiveAt: Timestamp.now(), kind: 'investment_deposit' }));
  await financialRejection(reverseSparkInvestmentValuationFirebase(owner, input), /preparação/);
  const second = { ...sync, clientActionId: 'newer_valuation_123456', expectedRevision: 2, observedAt: Timestamp.now(), observedValueInCents: 1900 };
  await prepareSparkInvestmentSyncFirebase(owner, second); await synchronizeSparkInvestmentFirebase(owner, second);
  await financialRejection(prepareSparkInvestmentValuationReversalFirebase(owner, { ...input, clientActionId: 'old_valuation_undo_123456', expectedRevision: 3 }, 100), /vigente/);
});
async function rawValuationUndo(options: { omit?: 'operation' | 'position' | 'checkpoint' | 'claim' | 'quota'; operation?: Record<string, any>;
  position?: Record<string, any>; checkpoint?: Record<string, any> } = {}) {
  const input = valuationUndoInput(), before = await balance(input.accountId);
  const proof = await prepareSparkInvestmentValuationReversalFirebase(owner, input, 100);
  const group = doc(owner, 'financialGroups', 'proof'), batch = writeBatch(owner), id = input.clientActionId;
  const operation = { schemaVersion: 1, kind: 'investment_valuation_reversal', actorId: uid, accountId: input.accountId, reversesOperationId: input.originalOperationId,
    expectedRevision: input.expectedRevision, proofId: id, effectiveAt: proof.asOf, note: input.reason, previousOperationId: before.lastOperationId,
    targetBalanceInCents: 1200, previousBalanceInCents: 1700, differenceInCents: -500, currentEffectInCents: -500, createdAt: serverTimestamp(), ...options.operation };
  if (options.omit !== 'operation') batch.set(operationRef(owner, id), operation);
  if (options.omit !== 'position') batch.update(positionRef(owner, input.accountId), { balanceInCents: 1200, revision: 2, lastOperationId: id, updatedAt: serverTimestamp(), ...options.position });
  if (options.omit !== 'checkpoint') batch.set(doc(group, 'sparkCheckpoints', input.accountId), { operationId: id, effectiveAt: proof.asOf, countedBalanceInCents: 1200, includesBoundary: false, ...options.checkpoint });
  if (options.omit !== 'claim') batch.set(doc(group, 'sparkInvestmentValuationReversals', input.originalOperationId), { schemaVersion: 1, actorId: uid, reversalOperationId: id, createdAt: serverTimestamp() });
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!, window = Math.floor(Date.now() / 60000) * 60000;
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', windowStartInMillis: window,
    count: quota.windowStartInMillis === window ? quota.count + 1 : 1, lastOperationId: id, updatedAt: serverTimestamp() });
  return batch.commit();
}
test('Spark valuation undo raw control requires certified counterfactual and retains historical node', async () => {
  await valuationToUndo(); await rawValuationUndo(); assert.equal((await balance('new-investment')).balanceInCents, 1200);
});
for (const omit of ['operation', 'position', 'checkpoint', 'claim', 'quota'] as const) test(`Spark valuation undo Rules refuse missing ${omit}`, async () => {
  await valuationToUndo(); await denied(rawValuationUndo({ omit })); assert.equal((await balance('new-investment')).balanceInCents, 1700);
});
for (const [label, options] of [
  ['invented target', { operation: { targetBalanceInCents: 1201 } }], ['invented effect', { operation: { currentEffectInCents: -499 } }],
  ['wrong observation', { operation: { reversesOperationId: 'funded_opening_123456' } }], ['stale revision', { operation: { expectedRevision: 0 } }],
  ['missing proof', { operation: { proofId: 'another_proof_123456' } }], ['wrong instant', { operation: { effectiveAt: past() } }],
  ['empty reason', { operation: { note: '' } }], ['foreign actor', { operation: { actorId: 'foreign' } }],
  ['inclusive reference', { checkpoint: { includesBoundary: true } }], ['negative target', { operation: { targetBalanceInCents: -1 }, position: { balanceInCents: -1 } }],
] as const) test(`Spark valuation undo Rules refuse ${label}`, async () => { await valuationToUndo(); await denied(rawValuationUndo(options)); });
test('Spark compound principal and valuation commit once with two consecutive investment history nodes', async () => {
  await setupPrincipal(); const input = principalInput({ valuation: editValuation() });
  await updateSparkInvestmentPrincipalFirebase(owner, input);
  assert.equal((await updateSparkInvestmentPrincipalFirebase(secondSession, input)).idempotent, true);
  const position = await balance(input.accountId), parent = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  const child = (await getDoc(operationRef(owner, editValuation().operationId))).data()!;
  assert.equal(position.revision, 2); assert.equal(position.balanceInCents, 1700); assert.equal(position.lastOperationId, editValuation().operationId);
  assert.equal(child.previousOperationId, input.clientActionId); assert.equal(child.expectedRevision, 1); assert.equal(child.effectiveAt.isEqual(child.createdAt), true);
  assert.equal((await balance('bank')).balanceInCents, 8500); assert.equal((await getDoc(capitalRef(input.accountId))).data()!.initialValueInCents, 1500);
  for (const [index, at, expected] of [[0, parent.effectiveAt, 1200], [1, child.effectiveAt, 1700]] as const) {
    const proof = await prepareSparkHistoryProofFirebase(owner, { groupId: 'proof', actorId: uid, accountId: input.accountId,
      clientActionId: `compound_exact_time_${index}_123456`, asOf: at, purpose: 'instant' });
    assert.equal(proof.balanceInCents, expected);
  }
});
test('Spark compound funding updates both banks, capital and observed value atomically', async () => {
  await setupFunding(); const input = fundingInput({ valuation: editValuation() });
  await changeSparkInvestmentFundingFirebase(owner, input);
  assert.equal((await changeSparkInvestmentFundingFirebase(secondSession, input)).idempotent, true);
  assert.equal((await balance(input.accountId)).balanceInCents, 1700); assert.equal((await balance(input.accountId)).revision, 2);
  assert.equal((await balance('bank')).balanceInCents, 10000);
  assert.equal((await getDoc(capitalRef(input.accountId))).data()!.fundingAccountId, input.newFundingAccountId);
});
async function rawCompound(options: { omit?: 'bank' | 'investment' | 'capital' | 'operation' | 'quota' | 'valuation' | 'checkpoint';
  operation?: Record<string, any>; valuation?: Record<string, any>; investment?: Record<string, any>; checkpoint?: Record<string, any> } = {}) {
  const input = principalInput(), observation = editValuation(), old = await balance(input.accountId);
  const batch = await rawPrincipal({ input, ...(['bank', 'investment', 'capital', 'operation', 'quota'].includes(options.omit ?? '') ? { omit: options.omit as 'bank' } : {}),
    operation: { valuationOperationId: observation.operationId, observedValueInCents: observation.observedValueInCents, ...options.operation },
    investment: { balanceInCents: observation.observedValueInCents, revision: 2, lastOperationId: observation.operationId, ...options.investment } });
  if (options.omit !== 'valuation') batch.set(operationRef(owner, observation.operationId), { schemaVersion: 1, kind: 'investment_edit_valuation', actorId: uid, accountId: input.accountId,
    parentOperationId: input.clientActionId, previousOperationId: input.clientActionId, expectedRevision: 1, targetBalanceInCents: observation.observedValueInCents,
    previousBalanceInCents: old.balanceInCents, differenceInCents: observation.observedValueInCents - old.balanceInCents,
    currentEffectInCents: observation.observedValueInCents - old.balanceInCents, effectiveAt: serverTimestamp(), createdAt: serverTimestamp(), ...options.valuation });
  if (options.omit !== 'checkpoint') batch.set(doc(owner, 'financialGroups/proof/sparkCheckpoints', input.accountId), {
    operationId: observation.operationId, effectiveAt: serverTimestamp(), countedBalanceInCents: observation.observedValueInCents, includesBoundary: false, ...options.checkpoint });
  return batch.commit();
}
test('Spark compound raw control proves two nodes belong to the same atomic edit', async () => { await setupPrincipal(); await rawCompound(); });
for (const omit of ['bank', 'investment', 'capital', 'operation', 'quota', 'valuation', 'checkpoint'] as const) test(`Spark compound Rules refuse missing ${omit}`, async () => {
  await setupPrincipal(); await denied(rawCompound({ omit })); assert.equal((await balance('new-investment')).revision, 0);
});
for (const [label, options] of [
  ['old head', { valuation: { previousOperationId: 'funded_opening_123456' } }], ['skipped revision', { investment: { revision: 1 } }],
  ['child revision', { valuation: { expectedRevision: 0 } }], ['unrelated parent', { valuation: { parentOperationId: 'unrelated_123456' } }],
  ['foreign actor', { valuation: { actorId: 'foreign' } }], ['different account', { valuation: { accountId: 'investment' } }],
  ['backdated observation', { valuation: { effectiveAt: past() } }], ['forged prior balance', { valuation: { previousBalanceInCents: 0 } }],
  ['forged delta', { valuation: { differenceInCents: 1, currentEffectInCents: 1 } }], ['unknown field', { valuation: { unrestricted: true } }],
  ['missing parent target', { operation: { observedValueInCents: null } }], ['parent target mismatch', { operation: { observedValueInCents: 1701 } }],
  ['capital effect mismatch', { operation: { toCurrentEffectInCents: 1 } }], ['checkpoint mismatch', { checkpoint: { countedBalanceInCents: 1701 } }],
] as const) test(`Spark compound Rules refuse ${label}`, async () => { await setupPrincipal(); await denied(rawCompound(options)); });
async function rawPrincipal(options: { input?: SparkInvestmentPrincipalInput; operation?: Record<string, unknown>; capital?: Record<string, unknown>;
  bank?: Record<string, unknown>; investment?: Record<string, unknown>; quota?: Record<string, unknown>;
  omit?: 'bank' | 'investment' | 'capital' | 'operation' | 'quota'; firestore?: typeof owner; extra?: boolean; checkpoint?: boolean } = {}) {
  const input = options.input ?? principalInput(), firestore = options.firestore ?? owner, id = input.clientActionId;
  const bank = await balance(input.fundingAccountId), investment = await balance(input.accountId), capital = (await getDoc(capitalRef(input.accountId))).data()!;
  const opening = (await getDoc(operationRef(owner, input.openingOperationId))).data()!, delta = input.principalInCents - capital.initialValueInCents;
  const at = opening.effectiveAt ?? opening.createdAt;
  const bankCheckpoint = (await getDoc(doc(owner, 'financialGroups/proof/sparkCheckpoints', input.fundingAccountId))).data();
  const bankEffect = !bankCheckpoint || at.seconds > bankCheckpoint.effectiveAt.seconds
    || at.seconds === bankCheckpoint.effectiveAt.seconds && at.nanoseconds > bankCheckpoint.effectiveAt.nanoseconds
    || at.isEqual(bankCheckpoint.effectiveAt) && bankCheckpoint.includesBoundary ? -delta || 0 : 0;
  const batch = writeBatch(firestore);
  if (options.omit !== 'operation') batch.set(operationRef(firestore, id), { schemaVersion: 1, actorId: uid, kind: 'investment_principal_update',
    fromAccountId: input.fundingAccountId, toAccountId: input.accountId, openingOperationId: input.openingOperationId,
    expectedCapitalRevision: input.expectedCapitalRevision, expectedCapitalOperationId: input.expectedCapitalOperationId,
    fromRevision: input.expectedFundingRevision, toRevision: input.expectedInvestmentRevision, principalInCents: input.principalInCents,
    previousPrincipalInCents: capital.initialValueInCents, amountInCents: delta, effectiveAt: at,
    fromCurrentEffectInCents: bankEffect, toCurrentEffectInCents: 0, fromPreviousOperationId: bank.lastOperationId, toPreviousOperationId: investment.lastOperationId,
    note: input.note?.trim() || null, overdraftReason: input.overdraftReason?.trim() || null, createdAt: serverTimestamp(), ...options.operation });
  if (options.omit !== 'bank') batch.update(positionRef(firestore, input.fundingAccountId), { balanceInCents: bank.balanceInCents + bankEffect,
    revision: bank.revision + 1, lastOperationId: id, updatedAt: serverTimestamp(), ...options.bank });
  if (options.omit !== 'investment') batch.update(positionRef(firestore, input.accountId), { balanceInCents: investment.balanceInCents,
    revision: investment.revision + 1, lastOperationId: id, updatedAt: serverTimestamp(), ...options.investment });
  if (options.omit !== 'capital') batch.update(capitalRef(input.accountId, firestore), { initialValueInCents: input.principalInCents,
    revision: capital.revision + 1, lastOperationId: id, updatedAt: serverTimestamp(), ...options.capital });
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data(), window = Math.floor(Date.now() / 60000) * 60000;
  if (options.omit !== 'quota') batch.set(doc(firestore, 'sparkTransferQuotas', uid), { groupId: 'proof', count: quota?.windowStartInMillis === window ? quota.count + 1 : 1,
    windowStartInMillis: window, lastOperationId: id, updatedAt: serverTimestamp(), ...options.quota });
  if (options.extra) batch.update(positionRef(firestore, 'third'), { balanceInCents: 600, revision: 1, lastOperationId: id, updatedAt: serverTimestamp() });
  if (options.checkpoint) batch.update(doc(firestore, 'financialGroups/proof/sparkCheckpoints', input.accountId), { countedBalanceInCents: 2000, operationId: id });
  return batch;
}
for (const value of [0, 500, 1000, 1500]) test(`Spark principal corrects funding to ${value} while preserving observed value and original receipt`, async () => {
  await setupPrincipal(); const input = principalInput({ principalInCents: value });
  const original = (await getDoc(operationRef(owner, input.openingOperationId))).data()!;
  await updateSparkInvestmentPrincipalFirebase(owner, input);
  const state = await fundedState(); assert.equal(state.currentBalanceInCents, 1200); assert.equal(state.reference!.observedValueInCents, 1200);
  assert.equal(state.principal!.initialValueInCents, value); assert.equal(state.principal!.revision, 1);
  assert.equal(state.principal!.openingOperationId, input.openingOperationId); assert.equal(state.principal!.lastOperationId, input.clientActionId);
  assert.equal((await balance('bank')).balanceInCents, 10000 - value);
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  assert.equal(receipt.amountInCents, value - 1000); assert.ok(receipt.effectiveAt.isEqual(original.createdAt));
  assert.equal(receipt.toCurrentEffectInCents, 0); assert.deepEqual((await getDoc(operationRef(owner, input.openingOperationId))).data(), original);
  const before = new Timestamp(original.createdAt.seconds, 0);
  if (before.toMillis() < original.createdAt.toMillis()) {
    const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput('principal_before_123456'), asOf: before }, 100);
    assert.equal(proof.balanceInCents, 10000);
  }
  for (const [accountId, expected] of [['bank', 10000 - value], ['new-investment', 1200]] as const) {
    const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput(`principal_exact_${accountId}_123456`), accountId, asOf: original.createdAt }, 100);
    assert.equal(proof.balanceInCents, expected);
  }
});
test('Spark principal exact replay works across sessions and after later corrections, without consuming quota', async () => {
  await setupPrincipal(); const input = principalInput(); await updateSparkInvestmentPrincipalFirebase(owner, input);
  await updateSparkInvestmentPrincipalFirebase(owner, principalInput({ clientActionId: 'principal_again_123456', principalInCents: 800,
    expectedFundingRevision: 2, expectedInvestmentRevision: 1, expectedCapitalRevision: 1, expectedCapitalOperationId: input.clientActionId }));
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!;
  assert.equal((await updateSparkInvestmentPrincipalFirebase(secondSession, { ...input })).idempotent, true);
  assert.equal((await fundedState()).principal!.initialValueInCents, 800); assert.equal((await balance('bank')).balanceInCents, 9200);
  assert.deepEqual((await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data(), quota);
  await financialRejection(updateSparkInvestmentPrincipalFirebase(owner, { ...input, principalInCents: 1600 }), /outros argumentos/);
  await financialRejection(updateSparkInvestmentPrincipalFirebase(owner, { ...input, expectedCapitalRevision: 1 }), /outros argumentos/);
});
test('Spark principal zero keeps the opening anchor and supports a later positive principal', async () => {
  await setupPrincipal(); await updateSparkInvestmentPrincipalFirebase(owner, principalInput({ principalInCents: 0 }));
  await updateSparkInvestmentPrincipalFirebase(owner, principalInput({ clientActionId: 'principal_restore_123456', principalInCents: 700,
    expectedFundingRevision: 2, expectedInvestmentRevision: 1, expectedCapitalRevision: 1, expectedCapitalOperationId: 'principal_update_123456' }));
  assert.equal((await balance('bank')).balanceInCents, 9300); assert.equal((await fundedState()).currentBalanceInCents, 1200);
});
test('Spark principal raw positive control enforces an atomic capital, pair, receipt and quota', async () => {
  await setupPrincipal(); await (await rawPrincipal()).commit(); assert.equal((await balance('bank')).balanceInCents, 8500);
  assert.equal((await fundedState()).principal!.initialValueInCents, 1500);
});
for (const omit of ['bank', 'investment', 'capital', 'operation', 'quota'] as const) test(`Spark principal refuses partial commit without ${omit}`, async () => {
  await setupPrincipal(); await denied((await rawPrincipal({ omit })).commit());
  assert.equal((await balance('bank')).balanceInCents, 9000); assert.equal((await fundedState()).principal!.initialValueInCents, 1000);
});
for (const [name, options] of Object.entries({
  'invented delta': { operation: { amountInCents: 600 } }, 'invented old principal': { operation: { previousPrincipalInCents: 900, amountInCents: 600 } },
  'bank effect': { operation: { fromCurrentEffectInCents: 0 }, bank: { balanceInCents: 9000 } },
  'investment credit': { operation: { toCurrentEffectInCents: 500 }, investment: { balanceInCents: 1700 } },
  'capital value': { capital: { initialValueInCents: 1600 } }, 'capital revision': { capital: { revision: 2 } },
  'capital anchor': { capital: { openingOperationId: 'bootstrap_bank' } }, 'capital author': { capital: { actorId: 'foreign' } },
  'capital bank': { capital: { fundingAccountId: 'third' } }, 'capital extra field': { capital: { role: 'admin' } },
  'old capital head': { operation: { expectedCapitalOperationId: 'another_receipt_123456' } },
  'opening date': { operation: { effectiveAt: past() } }, 'future date': { operation: { effectiveAt: Timestamp.fromMillis(Date.now() + 86400000) } },
  'old bank head': { operation: { fromPreviousOperationId: 'bootstrap_bank' } }, 'old investment head': { operation: { toPreviousOperationId: 'bootstrap_investment' } },
  'receipt extra field': { operation: { observedValueInCents: 1700 } }, 'receipt author': { operation: { actorId: 'foreign' } },
  'bank revision': { bank: { revision: 3 } }, 'capital missing new head': { capital: { lastOperationId: 'funded_opening_123456' } },
  'quota missing head': { quota: { lastOperationId: 'funded_opening_123456' } }, 'extra account': { extra: true }, 'checkpoint overwrite': { checkpoint: true },
})) test(`Spark principal rejects direct forgery: ${name}`, async () => {
  await setupPrincipal(); await denied((await rawPrincipal(options)).commit());
  assert.equal((await fundedState()).principal!.initialValueInCents, 1000);
});
for (const value of [-1, 0.5, 1_000_000_000_001]) test(`Spark principal refuses invalid principal ${value} in service and Rules`, async () => {
  await setupPrincipal(); const input = principalInput({ principalInCents: value });
  await financialRejection(updateSparkInvestmentPrincipalFirebase(owner, input), /inválidos/); await denied((await rawPrincipal({ input })).commit());
});
test('Spark principal respects a later bank checkpoint without erasing funding history', async () => {
  await setupPrincipal();
  const original = (await getDoc(operationRef(owner, principalInput().openingOperationId))).data()!;
  // O emulador pode confirmar duas operações no mesmo milissegundo; este cenário exige uma referência estritamente posterior.
  await waitForSparkServerTime(Timestamp.fromMillis(original.createdAt.toMillis() + 1));
  await countSparkAccountFirebase(owner, count({ expectedRevision: 1, targetBalanceInCents: 7000 }));
  const input = principalInput({ expectedFundingRevision: 2 }); await (await rawPrincipal({ input })).commit();
  assert.equal((await balance('bank')).balanceInCents, 7000); assert.equal((await fundedState()).currentBalanceInCents, 1200);
  const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput('principal_before_count_123456'), asOf: original.createdAt }, 100);
  assert.equal(proof.balanceInCents, 8500);
});
test('Spark principal preserves a later investment observation and later contributions/redemptions', async () => {
  await setupPrincipal(); const observedAt = await confirmedNow('new-investment');
  const sync = investmentSync({ accountId: 'new-investment', observedAt, observedValueInCents: 1800 });
  await prepareSparkInvestmentSyncFirebase(owner, sync); await synchronizeSparkInvestmentFirebase(owner, sync);
  await transferSparkFundsFirebase(owner, command({ toAccountId: 'new-investment', kind: 'investment_deposit', amountInCents: 500 }));
  await updateSparkInvestmentPrincipalFirebase(owner, principalInput({ expectedFundingRevision: 2, expectedInvestmentRevision: 2 }));
  const state = await fundedState(); assert.equal(state.currentBalanceInCents, 2300); assert.equal(state.reference!.observedValueInCents, 1800);
  assert.equal((await balance('bank')).balanceInCents, 8000);
});
test('Spark principal concurrent different intentions cannot both use the same confirmed revisions', async () => {
  await setupPrincipal(); const outcomes = await Promise.allSettled([updateSparkInvestmentPrincipalFirebase(owner, principalInput()),
    updateSparkInvestmentPrincipalFirebase(secondSession, principalInput({ clientActionId: 'principal_competing_123456', principalInCents: 700 }))]);
  assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
  const state = await fundedState(); assert.equal(state.principal!.revision, 1); assert.equal((await balance('bank')).balanceInCents, 10000 - state.principal!.initialValueInCents);
});
test('Spark principal concurrent exact intentions recover a single receipt', async () => {
  await setupPrincipal(); const results = await Promise.all([updateSparkInvestmentPrincipalFirebase(owner, principalInput()), updateSparkInvestmentPrincipalFirebase(secondSession, principalInput())]);
  assert.equal(results.filter(result => !result.idempotent).length, 1); assert.equal((await fundedState()).principal!.revision, 1);
});
test('Spark principal rejects stale bank, investment and capital revisions without silent recalculation', async () => {
  await setupPrincipal();
  for (const input of [principalInput({ expectedFundingRevision: 0 }), principalInput({ expectedInvestmentRevision: 1 }), principalInput({ expectedCapitalRevision: 1 })]) {
    await financialRejection(updateSparkInvestmentPrincipalFirebase(owner, input), /mudou/); await denied((await rawPrincipal({ input })).commit());
  }
});
test('Spark principal requires current admin on execution and replay and refuses outsider or expired tokens', async () => {
  await setupPrincipal(); await seedGroup({ members: { [uid]: 'member' } });
  await financialRejection(updateSparkInvestmentPrincipalFirebase(owner, principalInput()), /administrador/); await denied((await rawPrincipal()).commit());
  await seedGroup({ members: { [uid]: 'admin' } }); await denied((await rawPrincipal({ firestore: outsider })).commit()); await denied((await rawPrincipal({ firestore: expired })).commit());
  await updateSparkInvestmentPrincipalFirebase(owner, principalInput()); await seedGroup({ members: { [uid]: 'member' } });
  await financialRejection(updateSparkInvestmentPrincipalFirebase(owner, principalInput()), /administrador/);
  await seedGroup({ members: {} }); await denied(updateSparkInvestmentPrincipalFirebase(owner, principalInput()));
});
test('Spark principal rejects previous protocol, date aliases, absent capital and a different funding bank', async () => {
  await setupPrincipal();
  for (const key of ['date', 'effectiveAt', 'observedAt']) await financialRejection(updateSparkInvestmentPrincipalFirebase(owner, { ...principalInput(), [key]: past() } as any), /data original/);
  await financialRejection(updateSparkInvestmentPrincipalFirebase(owner, principalInput({ accountId: 'investment' })), /ausente/);
  await financialRejection(updateSparkInvestmentPrincipalFirebase(owner, principalInput({ fundingAccountId: 'third', expectedFundingRevision: 0 })), /incompatível/);
  await denied((await rawPrincipal({ input: principalInput({ fundingAccountId: 'third', expectedFundingRevision: 0 }) })).commit());
  const raw = await rawPrincipal(); await seedGroup({ sparkProtocol: 'financial-proof-v12' });
  await financialRejection(updateSparkInvestmentPrincipalFirebase(owner, principalInput()), /não habilitado/); await denied(raw.commit());
});
test('Spark principal enforces bank overdraft policy and the cents limit', async () => {
  await setupPrincipal(); const input = principalInput({ principalInCents: 11000 });
  await financialRejection(updateSparkInvestmentPrincipalFirebase(owner, input), /justificativa/); await denied((await rawPrincipal({ input })).commit());
  await updateSparkInvestmentPrincipalFirebase(owner, { ...input, overdraftReason: 'Limite bancário confirmado' });
  assert.equal((await balance('bank')).balanceInCents, -1000); assert.equal((await fundedState()).currentBalanceInCents, 1200);
});
test('Spark principal supports the maximum principal without changing the observed investment limit', async () => {
  await setupPrincipal(); await updateSparkInvestmentPrincipalFirebase(owner, principalInput({ principalInCents: 1_000_000_000_000, overdraftReason: 'Limite confirmado' }));
  assert.equal((await fundedState()).principal!.initialValueInCents, 1_000_000_000_000); assert.equal((await fundedState()).currentBalanceInCents, 1200);
});
test('Spark principal refuses overdue positions and never permits receipt or capital deletion', async () => {
  await setupPrincipal(); await seedPosition('bank', { nextActivationAt: past() });
  await financialRejection(updateSparkInvestmentPrincipalFirebase(owner, principalInput()), /aberturas mensais vencidas/); await denied((await rawPrincipal()).commit());
  await seedPosition('bank', { nextActivationAt: null }); await updateSparkInvestmentPrincipalFirebase(owner, principalInput());
  await denied(deleteDoc(capitalRef())); await denied(deleteDoc(operationRef(owner, 'principal_update_123456')));
  await financialRejection(reverseSparkTransferFirebase(owner, { groupId: 'proof', actorId: uid, clientActionId: 'principal_forbidden_undo_123456', originalOperationId: 'principal_update_123456' }), /estorn/);
});
test('Spark principal history certificates retain signed correction deltas', async () => {
  await setupPrincipal(); const ids = ['principal_up_123456', 'principal_down_123456', 'principal_zero_123456'];
  let principal = 1000;
  for (const [index, value] of [1500, 700, 700].entries()) {
    await updateSparkInvestmentPrincipalFirebase(owner, principalInput({ clientActionId: ids[index], principalInCents: value,
      expectedFundingRevision: 1 + index, expectedInvestmentRevision: index, expectedCapitalRevision: index,
      expectedCapitalOperationId: index ? ids[index - 1] : 'funded_opening_123456' })); principal = value;
  }
  const bankSegment = await certifySparkHistorySegmentFirebase(owner, { ...segmentInput(2, 3), olderOperationId: ids[0], newerOperationId: ids[1] });
  assert.equal(bankSegment.segment!.deltaInCents, 300); assert.equal(bankSegment.segment!.absoluteDeltaInCents, 1300);
  const investmentSegment = await certifySparkHistorySegmentFirebase(owner, { ...segmentInput(2, 3), accountId: 'new-investment', olderOperationId: ids[1], newerOperationId: ids[2] });
  assert.equal(investmentSegment.segment!.deltaInCents, -800);
  const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput('principal_cert_history_123456'), asOf: await confirmedNow() }, 100, { useSegments: true });
  assert.equal(proof.balanceInCents, 10000 - principal);
});
test('Spark principal no-op raw commit preserves integer zero effects', async () => {
  await setupPrincipal(); await (await rawPrincipal({ input: principalInput({ principalInCents: 1000 }) })).commit();
  const receipt = (await getDoc(operationRef(owner, 'principal_update_123456'))).data()!;
  assert.equal(Object.is(receipt.fromCurrentEffectInCents, -0), false); assert.equal((await balance('bank')).revision, 2);
});
test('Spark principal canonicalizes a negative zero requested value as integer cents', async () => {
  await setupPrincipal(); await updateSparkInvestmentPrincipalFirebase(owner, principalInput({ principalInCents: -0 }));
  assert.equal((await balance('bank')).balanceInCents, 10000);
  assert.equal(Object.is((await fundedState()).principal!.initialValueInCents, -0), false);
  assert.equal((await updateSparkInvestmentPrincipalFirebase(secondSession, principalInput({ principalInCents: 0 }))).idempotent, true);
});
test('Spark principal service accepts a covered bank reference without recalculating the confirmed balance', async () => {
  await setupPrincipal(); await countSparkAccountFirebase(owner, count({ expectedRevision: 1, targetBalanceInCents: 7000 }));
  await updateSparkInvestmentPrincipalFirebase(owner, principalInput({ expectedFundingRevision: 2 }));
  assert.equal((await balance('bank')).balanceInCents, 7000); assert.equal((await fundedState()).principal!.initialValueInCents, 1500);
});
test('Spark principal correction uses original funding even after descriptive bank metadata changes', async () => {
  await setupPrincipal(); await saveSparkAccountCatalogFirebase(owner, { groupId: 'proof', actorId: uid, clientActionId: 'principal_catalog_123456',
    accountId: 'new-investment', accountKind: 'investment', expectedCatalogRevision: 0, catalog: { ...accountCatalog(), bankAccountId: 'third' } });
  await updateSparkInvestmentPrincipalFirebase(owner, principalInput());
  assert.equal((await balance('bank')).balanceInCents, 8500); assert.equal((await balance('third')).balanceInCents, 100);
  assert.equal((await fundedState()).principal!.fundingAccountId, 'bank');
});
test('Spark principal another authorized admin can correct without rewriting the capital creator', async () => {
  await setupPrincipal(); const otherUid = getAuth(outsider.app).currentUser!.uid;
  await seedGroup({ members: { [uid]: 'admin', [otherUid]: 'admin' } });
  await updateSparkInvestmentPrincipalFirebase(outsider, principalInput({ actorId: otherUid }));
  assert.equal((await getDoc(capitalRef())).data()!.actorId, uid);
  assert.equal((await getDoc(operationRef(owner, 'principal_update_123456'))).data()!.actorId, otherUid);
  assert.equal((await balance('bank')).balanceInCents, 8500);
});
test('Spark principal refund cannot overflow the bank cents limit', async () => {
  await setupPrincipal(); await seedPosition('bank', { balanceInCents: 1_000_000_000_000 }); const input = principalInput({ principalInCents: 0 });
  await financialRejection(updateSparkInvestmentPrincipalFirebase(owner, input), /limite/); await denied((await rawPrincipal({ input })).commit());
});
test('Spark principal rejects a forged zero bank effect after an earlier reference', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const reference = temporal({ kind: 'dated_reconciliation', effectiveAt: past('2026-09-01T12:00Z'), targetBalanceInCents: 12000 });
  await preview(reference); await saveSparkTemporalBalanceFirebase(owner, reference);
  await openFundedSparkInvestmentFirebase(owner, fundedOpening({ expectedFundingRevision: 1 }));
  const openingAt = (await getDoc(operationRef(owner, 'funded_opening_123456'))).data()!.createdAt as InstanceType<typeof Timestamp>;
  const checkpointAt = (await getDoc(doc(owner, 'financialGroups/proof/sparkCheckpoints/bank'))).data()!.effectiveAt as InstanceType<typeof Timestamp>;
  assert.ok(openingAt.seconds > checkpointAt.seconds || openingAt.seconds === checkpointAt.seconds && openingAt.nanoseconds > checkpointAt.nanoseconds,
    `The confirmed opening must follow the bank count: opening=${openingAt.seconds}:${openingAt.nanoseconds}, checkpoint=${checkpointAt.seconds}:${checkpointAt.nanoseconds}`);
  const input = principalInput({ expectedFundingRevision: 2 });
  await denied((await rawPrincipal({ input, operation: { fromCurrentEffectInCents: 0 }, bank: { balanceInCents: 11000 } })).commit());
  await updateSparkInvestmentPrincipalFirebase(owner, input); assert.equal((await balance('bank')).balanceInCents, 10500);
});

test('Spark principal validates adjacent commit references using exact timestamps instead of assumed clock ordering', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await countSparkAccountFirebase(owner, count({ targetBalanceInCents: 12000 }));
  await openFundedSparkInvestmentFirebase(owner, fundedOpening({ expectedFundingRevision: 1 }));
  const at = (await getDoc(operationRef(owner, 'funded_opening_123456'))).data()!.createdAt as InstanceType<typeof Timestamp>;
  const checkpoint = (await getDoc(doc(owner, 'financialGroups/proof/sparkCheckpoints/bank'))).data()!;
  const uncovered = at.seconds > checkpoint.effectiveAt.seconds || at.seconds === checkpoint.effectiveAt.seconds && at.nanoseconds > checkpoint.effectiveAt.nanoseconds;
  const effect = uncovered ? -500 : 0, forgedEffect = uncovered ? 0 : -500;
  const input = principalInput({ expectedFundingRevision: 2 });
  await denied((await rawPrincipal({ input, operation: { fromCurrentEffectInCents: forgedEffect }, bank: { balanceInCents: 11000 + forgedEffect } })).commit());
  await updateSparkInvestmentPrincipalFirebase(owner, input); assert.equal((await balance('bank')).balanceInCents, 11000 + effect);
});

function fundingInput(overrides: Partial<SparkInvestmentFundingInput> = {}): SparkInvestmentFundingInput {
  return { ...principalInput(), clientActionId: 'funding_change_123456', newFundingAccountId: 'third', expectedNewFundingRevision: 1, ...overrides };
}
async function setupFunding() {
  await setupPrincipal();
  await postSparkMovementFirebase(owner, { groupId: 'proof', actorId: uid, clientActionId: 'funding_seed_income_123456',
    kind: 'income', accountId: 'third', amountInCents: 9900, effectiveAt: past('2026-09-01T12:00:00Z') });
}
async function rawFunding(options: { input?: SparkInvestmentFundingInput; operation?: Record<string, unknown>; capital?: Record<string, unknown>;
  from?: Record<string, unknown>; to?: Record<string, unknown>; refund?: Record<string, unknown>; quota?: Record<string, unknown>;
  omit?: 'from' | 'to' | 'refund' | 'capital' | 'operation' | 'quota'; firestore?: typeof owner; extra?: boolean } = {}) {
  const input = options.input ?? fundingInput(), firestore = options.firestore ?? owner, id = input.clientActionId;
  const capital = (await getDoc(capitalRef(input.accountId))).data()!, original = (await getDoc(operationRef(owner, input.openingOperationId))).data()!;
  const ids = [input.newFundingAccountId, input.accountId, input.fundingAccountId], positions = [], effects: number[] = [];
  const deltas = [-input.principalInCents, input.principalInCents - capital.initialValueInCents, capital.initialValueInCents];
  for (const [index, accountId] of ids.entries()) {
    positions.push(await balance(accountId));
    const checkpoint = (await getDoc(doc(owner, 'financialGroups/proof/sparkCheckpoints', accountId))).data();
    const at = original.effectiveAt ?? original.createdAt, ref = checkpoint?.effectiveAt;
    effects.push(!ref || at.seconds > ref.seconds || at.seconds === ref.seconds && at.nanoseconds > ref.nanoseconds
      || at.isEqual(ref) && checkpoint!.includesBoundary ? deltas[index] || 0 : 0);
  }
  const batch = writeBatch(firestore);
  if (options.omit !== 'operation') batch.set(operationRef(firestore, id), {
    schemaVersion: 1, actorId: uid, kind: 'investment_funding_change', fromAccountId: ids[0], toAccountId: ids[1], refundAccountId: ids[2],
    fromRevision: input.expectedNewFundingRevision, toRevision: input.expectedInvestmentRevision, refundRevision: input.expectedFundingRevision,
    openingOperationId: input.openingOperationId, expectedCapitalRevision: input.expectedCapitalRevision, expectedCapitalOperationId: input.expectedCapitalOperationId,
    principalInCents: input.principalInCents, previousPrincipalInCents: capital.initialValueInCents, amountInCents: input.principalInCents,
    differenceInCents: deltas[1], effectiveAt: original.effectiveAt ?? original.createdAt, fromCurrentEffectInCents: effects[0], toCurrentEffectInCents: effects[1], refundCurrentEffectInCents: effects[2],
    fromPreviousOperationId: positions[0].lastOperationId, toPreviousOperationId: positions[1].lastOperationId, refundPreviousOperationId: positions[2].lastOperationId,
    note: input.note?.trim() || null, overdraftReason: input.overdraftReason?.trim() || null, createdAt: serverTimestamp(), ...options.operation });
  for (const [index, side] of (['from', 'to', 'refund'] as const).entries()) if (options.omit !== side) batch.update(positionRef(firestore, ids[index]), {
    balanceInCents: positions[index].balanceInCents + effects[index], revision: positions[index].revision + 1, lastOperationId: id, updatedAt: serverTimestamp(), ...options[side] });
  if (options.omit !== 'capital') batch.update(capitalRef(input.accountId, firestore), { initialValueInCents: input.principalInCents, fundingAccountId: input.newFundingAccountId,
    revision: capital.revision + 1, lastOperationId: id, updatedAt: serverTimestamp(), ...options.capital });
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data(), window = Math.floor(Date.now() / 60000) * 60000;
  if (options.omit !== 'quota') batch.set(doc(firestore, 'sparkTransferQuotas', uid), { groupId: 'proof', count: quota?.windowStartInMillis === window ? quota.count + 1 : 1,
    windowStartInMillis: window, lastOperationId: id, updatedAt: serverTimestamp(), ...options.quota });
  if (options.extra) batch.update(positionRef(firestore, 'cash'), { balanceInCents: 11000, revision: 1, lastOperationId: id, updatedAt: serverTimestamp() });
  return batch;
}
for (const value of [0, 500, 1000, 1500]) test(`Spark funding atomically changes bank and principal to ${value} with three historical legs`, async () => {
  await setupFunding(); const input = fundingInput({ principalInCents: value }), original = (await getDoc(operationRef(owner, input.openingOperationId))).data()!;
  await changeSparkInvestmentFundingFirebase(owner, input); const state = await fundedState();
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('third')).balanceInCents, 10000 - value);
  assert.equal(state.currentBalanceInCents, 1200); assert.equal(state.reference!.observedValueInCents, 1200);
  assert.equal(state.principal!.initialValueInCents, value); assert.equal(state.principal!.fundingAccountId, 'third'); assert.equal(state.principal!.revision, 1);
  assert.equal(state.principal!.openingOperationId, input.openingOperationId); assert.deepEqual((await getDoc(operationRef(owner, input.openingOperationId))).data(), original);
  for (const [accountId, expected] of [['bank', 10000], ['third', 10000 - value], ['new-investment', 1200]] as const) {
    const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput(`funding_history_${accountId}_123456`), accountId, asOf: original.createdAt }, 100);
    assert.equal(proof.balanceInCents, expected);
  }
  await historicalPairBalance('bank', '2026-09-02T12:00:00Z', 10000, 'funding_before_old_123456');
  await historicalPairBalance('third', '2026-09-02T12:00:00Z', 10000, 'funding_before_new_123456');
});
test('Spark funding raw positive control stays within Rules access budget', async () => {
  await setupFunding(); await (await rawFunding()).commit(); assert.equal((await fundedState()).principal!.fundingAccountId, 'third');
});
for (const omit of ['from', 'to', 'refund', 'capital', 'operation', 'quota'] as const) test(`Spark funding rejects partial commit without ${omit}`, async () => {
  await setupFunding(); await denied((await rawFunding({ omit })).commit());
  assert.equal((await balance('bank')).balanceInCents, 9000); assert.equal((await balance('third')).balanceInCents, 10000); assert.equal((await fundedState()).principal!.fundingAccountId, 'bank');
});
for (const [name, options] of Object.entries({
  'invented old principal': { operation: { previousPrincipalInCents: 2000, differenceInCents: -500, refundCurrentEffectInCents: 2000 }, refund: { balanceInCents: 11000 } },
  'invented difference': { operation: { differenceInCents: 600 } }, 'amount differs from principal': { operation: { amountInCents: 1000 } },
  'new bank credited': { operation: { fromCurrentEffectInCents: 1500 }, from: { balanceInCents: 11500 } },
  'old bank not refunded': { operation: { refundCurrentEffectInCents: 0 }, refund: { balanceInCents: 9000 } },
  'investment credited': { operation: { toCurrentEffectInCents: 500 }, to: { balanceInCents: 1700 } },
  'wrong capital bank': { capital: { fundingAccountId: 'bank' } }, 'wrong capital value': { capital: { initialValueInCents: 1000 } },
  'opening anchor changed': { capital: { openingOperationId: 'bootstrap_bank' } }, 'capital creator changed': { capital: { actorId: 'foreign' } },
  'capital field injection': { capital: { role: 'admin' } }, 'capital stale head': { operation: { expectedCapitalOperationId: 'unrelated_receipt_123456' } },
  'refund stale head': { operation: { refundPreviousOperationId: 'bootstrap_bank' } },
  'new bank stale head': { operation: { fromPreviousOperationId: 'bootstrap_third' } },
  'investment stale head': { operation: { toPreviousOperationId: 'bootstrap_investment' } },
  'date changed': { operation: { effectiveAt: past() } }, 'field injection': { operation: { observedValueInCents: 2000 } },
  'receipt author': { operation: { actorId: 'foreign' } }, 'quota detached': { quota: { lastOperationId: 'funded_opening_123456' } },
  'refund revision jump': { refund: { revision: 3 } }, 'extra cash leg': { extra: true },
})) test(`Spark funding rejects direct forgery: ${name}`, async () => {
  await setupFunding(); await denied((await rawFunding(options)).commit()); assert.equal((await fundedState()).principal!.fundingAccountId, 'bank');
});
test('Spark funding replay after a later principal edit does not charge again and preserves current authorization', async () => {
  await setupFunding(); const input = fundingInput(); await changeSparkInvestmentFundingFirebase(owner, input);
  await updateSparkInvestmentPrincipalFirebase(owner, principalInput({ clientActionId: 'funding_later_principal_123456', fundingAccountId: 'third', principalInCents: 1700,
    expectedFundingRevision: 2, expectedInvestmentRevision: 1, expectedCapitalRevision: 1, expectedCapitalOperationId: input.clientActionId }));
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!;
  assert.equal((await changeSparkInvestmentFundingFirebase(secondSession, { ...input })).idempotent, true);
  assert.equal((await balance('third')).balanceInCents, 8300); assert.deepEqual((await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data(), quota);
  await financialRejection(changeSparkInvestmentFundingFirebase(owner, { ...input, principalInCents: 1400 }), /outros argumentos/);
  await seedGroup({ members: { [uid]: 'member' } }); await financialRejection(changeSparkInvestmentFundingFirebase(owner, input), /administrador/);
});
test('Spark funding successive bank changes including zero preserve the immutable opening anchor', async () => {
  await setupFunding(); const first = fundingInput({ principalInCents: 0 }); await changeSparkInvestmentFundingFirebase(owner, first);
  await changeSparkInvestmentFundingFirebase(owner, fundingInput({ clientActionId: 'funding_back_123456', fundingAccountId: 'third', newFundingAccountId: 'bank',
    expectedFundingRevision: 2, expectedNewFundingRevision: 2, expectedInvestmentRevision: 1, expectedCapitalRevision: 1,
    expectedCapitalOperationId: first.clientActionId, principalInCents: 700 }));
  assert.equal((await balance('bank')).balanceInCents, 9300); assert.equal((await balance('third')).balanceInCents, 10000);
  assert.equal((await fundedState()).principal!.fundingAccountId, 'bank'); assert.equal((await fundedState()).principal!.openingOperationId, first.openingOperationId);
});
test('Spark funding concurrent identical requests debit once while distinct stale requests cannot both commit', async () => {
  await setupFunding(); const input = fundingInput();
  await acknowledgePriorSend();
  const results = await Promise.all([changeSparkInvestmentFundingFirebase(owner, input), changeSparkInvestmentFundingFirebase(secondSession, input)]);
  assert.equal(results.filter(result => !result.idempotent).length, 1);
  await financialRejection(changeSparkInvestmentFundingFirebase(owner, { ...input, clientActionId: 'funding_stale_other_123456' }), /incompatível|mudou/);
  assert.equal((await fundedState()).principal!.revision, 1);
});
for (const changes of [{ expectedFundingRevision: 0 }, { expectedNewFundingRevision: 0 }, { expectedInvestmentRevision: 1 }, { expectedCapitalRevision: 1 }]) {
  test(`Spark funding refuses confirmed stale revision ${Object.keys(changes)[0]}`, async () => {
    await setupFunding(); const input = fundingInput(changes); await financialRejection(changeSparkInvestmentFundingFirebase(owner, input), /mudou/);
    await denied((await rawFunding({ input })).commit());
  });
}
test('Spark funding all references can cover current effects while historical legs remain complete', async () => {
  await setupFunding(); await countSparkAccountFirebase(owner, count({ accountId: 'bank', expectedRevision: 1, targetBalanceInCents: 7000 }));
  await countSparkAccountFirebase(owner, count({ accountId: 'third', expectedRevision: 1, targetBalanceInCents: 8000, clientActionId: 'funding_count_new_123456' }));
  const input = fundingInput({ expectedFundingRevision: 2, expectedNewFundingRevision: 2 }); await (await rawFunding({ input })).commit();
  assert.equal((await balance('bank')).balanceInCents, 7000); assert.equal((await balance('third')).balanceInCents, 8000);
  const at = (await getDoc(operationRef(owner, input.openingOperationId))).data()!.createdAt;
  for (const [accountId, expected] of [['bank', 10000], ['third', 8500], ['new-investment', 1200]] as const) {
    const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput(`funding_covered_${accountId}_123456`), accountId, asOf: at }, 100);
    assert.equal(proof.balanceInCents, expected);
  }
});
test('Spark funding rejects unauthorized, outsider and expired-token writes', async () => {
  await setupFunding(); const outsiderBatch = await rawFunding({ firestore: outsider }), expiredBatch = await rawFunding({ firestore: expired });
  await seedGroup({ members: { [uid]: 'member' } }); await financialRejection(changeSparkInvestmentFundingFirebase(owner, fundingInput()), /administrador/);
  await denied((await rawFunding()).commit()); await denied(outsiderBatch.commit()); await denied(expiredBatch.commit());
});
for (const value of [-1, 0.5, 1_000_000_000_001]) test(`Spark funding rejects invalid principal ${value}`, async () => {
  await setupFunding(); const input = fundingInput({ principalInCents: value });
  await financialRejection(changeSparkInvestmentFundingFirebase(owner, input), /inválidos/); await denied((await rawFunding({ input })).commit());
});
test('Spark funding requires overdraft reason for the new bank and prevents refund overflow', async () => {
  await setupFunding(); const input = fundingInput({ principalInCents: 11000 });
  await financialRejection(changeSparkInvestmentFundingFirebase(owner, input), /justificativa/); await denied((await rawFunding({ input })).commit());
  await changeSparkInvestmentFundingFirebase(owner, { ...input, overdraftReason: 'Financiamento confirmado' });
  assert.equal((await balance('third')).balanceInCents, -1000);
});
test('Spark funding refund cannot overflow cents and overdue bank cannot be used', async () => {
  await setupFunding(); await seedPosition('bank', { balanceInCents: 1_000_000_000_000 });
  await financialRejection(changeSparkInvestmentFundingFirebase(owner, fundingInput()), /limite/); await denied((await rawFunding()).commit());
  await seedPosition('bank', { balanceInCents: 9000 }); await seedPosition('third', { nextActivationAt: past() });
  await financialRejection(changeSparkInvestmentFundingFirebase(owner, fundingInput()), /aberturas mensais vencidas/); await denied((await rawFunding()).commit());
});
test('Spark funding rejects date aliases, same-bank change, cash and old protocol', async () => {
  await setupFunding();
  for (const key of ['date', 'effectiveAt', 'observedAt']) await financialRejection(changeSparkInvestmentFundingFirebase(owner, { ...fundingInput(), [key]: past() } as any), /data original/);
  await financialRejection(changeSparkInvestmentFundingFirebase(owner, fundingInput({ newFundingAccountId: 'bank' })), /inválidos/);
  const cashInput = fundingInput({ newFundingAccountId: 'cash', expectedNewFundingRevision: 0 });
  await financialRejection(changeSparkInvestmentFundingFirebase(owner, cashInput), /dois bancos/); await denied((await rawFunding({ input: cashInput })).commit());
  const raw = await rawFunding(); await seedGroup({ sparkProtocol: 'financial-proof-v13' });
  await financialRejection(changeSparkInvestmentFundingFirebase(owner, fundingInput()), /não habilitado/); await denied(raw.commit());
});
test('Spark funding certificates recognize the refund bank as a third linked history', async () => {
  await setupFunding(); const first = fundingInput(); await changeSparkInvestmentFundingFirebase(owner, first);
  const back = fundingInput({ clientActionId: 'funding_cert_back_123456', fundingAccountId: 'third', newFundingAccountId: 'bank', principalInCents: 700,
    expectedFundingRevision: 2, expectedNewFundingRevision: 2, expectedInvestmentRevision: 1, expectedCapitalRevision: 1, expectedCapitalOperationId: first.clientActionId });
  await changeSparkInvestmentFundingFirebase(owner, back);
  const bankSegment = await certifySparkHistorySegmentFirebase(owner, { ...segmentInput(2, 3), olderOperationId: first.clientActionId, newerOperationId: back.clientActionId });
  assert.equal(bankSegment.segment!.deltaInCents, 300); assert.equal(bankSegment.segment!.absoluteDeltaInCents, 1700);
  const thirdSegment = await certifySparkHistorySegmentFirebase(owner, { ...segmentInput(2, 3), accountId: 'third', olderOperationId: first.clientActionId, newerOperationId: back.clientActionId });
  assert.equal(thirdSegment.segment!.deltaInCents, 0); assert.equal(thirdSegment.segment!.absoluteDeltaInCents, 3000);
  for (const [accountId, expected] of [['bank', 9300], ['third', 10000], ['new-investment', 1200]] as const) {
    const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput(`funding_cert_${accountId}_123456`), accountId, asOf: await confirmedNow(accountId) }, 100, { useSegments: true });
    assert.equal(proof.balanceInCents, expected);
  }
});
test('Spark funding refunds the revised principal rather than the original opening amount', async () => {
  await setupFunding(); await updateSparkInvestmentPrincipalFirebase(owner, principalInput());
  await changeSparkInvestmentFundingFirebase(owner, fundingInput({ principalInCents: 900, expectedFundingRevision: 2,
    expectedInvestmentRevision: 1, expectedCapitalRevision: 1, expectedCapitalOperationId: 'principal_update_123456' }));
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('third')).balanceInCents, 9100);
  assert.equal((await getDoc(operationRef(owner, 'funding_change_123456'))).data()!.previousPrincipalInCents, 1500);
});
test('Spark funding both principals zero still serialize bank identity and integer-zero effects', async () => {
  await setupFunding(); await updateSparkInvestmentPrincipalFirebase(owner, principalInput({ principalInCents: 0 }));
  await changeSparkInvestmentFundingFirebase(owner, fundingInput({ principalInCents: -0, expectedFundingRevision: 2,
    expectedInvestmentRevision: 1, expectedCapitalRevision: 1, expectedCapitalOperationId: 'principal_update_123456' }));
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('third')).balanceInCents, 10000);
  assert.equal((await fundedState()).principal!.fundingAccountId, 'third');
  const receipt = (await getDoc(operationRef(owner, 'funding_change_123456'))).data()!;
  for (const key of ['amountInCents', 'differenceInCents', 'fromCurrentEffectInCents', 'refundCurrentEffectInCents']) assert.equal(Object.is(receipt[key], -0), false);
});
test('Spark funding distinct concurrent intentions have one capital-revision winner', async () => {
  await setupFunding(); const results = await Promise.allSettled([changeSparkInvestmentFundingFirebase(owner, fundingInput()),
    changeSparkInvestmentFundingFirebase(secondSession, fundingInput({ clientActionId: 'funding_competing_123456', principalInCents: 500 }))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const state = await fundedState(); assert.equal(state.principal!.revision, 1);
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('third')).balanceInCents, 10000 - state.principal!.initialValueInCents);
});
test('Spark funding another admin preserves capital creator and cannot reuse generic reversal', async () => {
  await setupFunding(); const otherUid = getAuth(outsider.app).currentUser!.uid;
  await seedGroup({ members: { [uid]: 'admin', [otherUid]: 'admin' } });
  await changeSparkInvestmentFundingFirebase(outsider, fundingInput({ actorId: otherUid }));
  assert.equal((await getDoc(capitalRef())).data()!.actorId, uid);
  await financialRejection(reverseSparkTransferFirebase(owner, { groupId: 'proof', actorId: uid, clientActionId: 'funding_forbidden_undo_123456', originalOperationId: 'funding_change_123456' }), /estorn/);
  await denied(deleteDoc(capitalRef())); await denied(deleteDoc(operationRef(owner, 'funding_change_123456')));
});
test('Spark funding maximum principal respects bank limit and does not overwrite a later investment observation', async () => {
  await setupFunding(); const sync = investmentSync({ accountId: 'new-investment', observedAt: await confirmedNow('new-investment'), observedValueInCents: 1800 });
  await prepareSparkInvestmentSyncFirebase(owner, sync); await synchronizeSparkInvestmentFirebase(owner, sync);
  await changeSparkInvestmentFundingFirebase(owner, fundingInput({ expectedInvestmentRevision: 1, principalInCents: 1_000_000_000_000, overdraftReason: 'Financiamento confirmado' }));
  const state = await fundedState(); assert.equal(state.currentBalanceInCents, 1800); assert.equal(state.reference!.observedValueInCents, 1800);
  assert.equal(state.principal!.initialValueInCents, 1_000_000_000_000);
});

function retroOpening(overrides: Partial<SparkDatedInvestmentOpeningInput> = {}): SparkDatedInvestmentOpeningInput {
  return { ...fundedOpening({ clientActionId: 'retro_opening_123456' }), effectiveAt: past('2026-09-05T12:00:00Z'), ...overrides };
}
test('Spark retro opening atomically records the chosen application date and distinct observed value', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = retroOpening();
  await openDatedFundedSparkInvestmentFirebase(owner, input); const state = await fundedState();
  assert.equal((await balance('bank')).balanceInCents, 9000); assert.equal(state.currentBalanceInCents, 1200);
  assert.equal(state.principal!.initialValueInCents, 1000); assert.equal(state.reference!.observedAt.isEqual(input.effectiveAt), true);
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  assert.equal(receipt.dated, true); assert.equal(receipt.effectiveAt.isEqual(input.effectiveAt), true);
  assert.equal(receipt.fromCurrentEffectInCents, -1000); assert.equal(receipt.createdAt.seconds > input.effectiveAt.seconds, true);
  for (const [accountId, asOf, expected] of [
    ['bank', '2026-09-05T11:59:59Z', 10000], ['bank', '2026-09-05T12:00:00Z', 9000],
    [input.accountId, '2026-09-05T11:59:59Z', 0], [input.accountId, '2026-09-05T12:00:00Z', 1200],
  ] as const) await historicalPairBalance(accountId, asOf, expected, `retro_history_${accountId}_${expected}_123456`);
});
test('Spark retro opening raw positive control is permitted by Rules', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await (await rawFundedOpening({ input: retroOpening() })).commit();
  assert.equal((await balance('bank')).balanceInCents, 9000); assert.equal((await fundedState()).currentBalanceInCents, 1200);
});
test('Spark retro opening keeps a later bank count and retains the full historical debit', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await countSparkAccountFirebase(owner, count({ targetBalanceInCents: 300 }));
  const input = retroOpening({ expectedFundingRevision: 1 }); await openDatedFundedSparkInvestmentFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, 300); assert.equal((await balance('bank')).revision, 2);
  assert.equal((await getDoc(operationRef(owner, input.clientActionId))).data()!.fromCurrentEffectInCents, 0);
  await historicalPairBalance('bank', '2026-09-06T12:00:00Z', 9000, 'retro_count_history_123456');
  const proof = await prepareSparkHistoryProofFirebase(owner, { ...preparationInput('retro_count_now_123456'), asOf: await confirmedNow() });
  assert.equal(proof.balanceInCents, 300);
});
for (const inclusive of [false, true]) test(`Spark retro opening respects equal bank reference boundary inclusive=${inclusive}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = retroOpening();
  await seedOrdinaryCheckpoint('bank', '2026-09-05T12:00:00Z', inclusive);
  await openDatedFundedSparkInvestmentFirebase(owner, input);
  assert.equal((await balance('bank')).balanceInCents, inclusive ? 9000 : 10000);
  assert.equal((await getDoc(operationRef(owner, input.clientActionId))).data()!.fromCurrentEffectInCents, inclusive ? -1000 : 0);
});
test('Spark retro opening keeps microsecond precision at reference and idempotency boundaries', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await seedOrdinaryCheckpoint('bank', '2026-09-05T12:00:00Z', false);
  const input = retroOpening({ effectiveAt: new Timestamp(past('2026-09-05T12:00:00Z').seconds, 1000) });
  await openDatedFundedSparkInvestmentFirebase(owner, input); assert.equal((await balance('bank')).balanceInCents, 9000);
  assert.equal((await openDatedFundedSparkInvestmentFirebase(owner, input)).idempotent, true);
  await financialRejection(openDatedFundedSparkInvestmentFirebase(owner, { ...input, effectiveAt: new Timestamp(input.effectiveAt.seconds, 2000) }), /outros argumentos/);
});
for (const nanos of [1, 999, 1001, 999999999]) test(`Spark retro opening rejects submicrosecond input ${nanos} before writing`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await financialRejection(openDatedFundedSparkInvestmentFirebase(owner, retroOpening({ effectiveAt: new Timestamp(past().seconds, nanos) })), /microssegundos/);
  assert.equal((await balance('bank')).revision, 0); assert.equal((await getDoc(capitalRef())).exists(), false);
});
for (const omit of ['bank', 'position', 'operation', 'catalog', 'capital', 'checkpoint', 'quota'] as const) test(`Spark retro opening rejects missing ${omit} atomically`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await denied((await rawFundedOpening({ input: retroOpening(), omit })).commit());
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await getDoc(positionRef(owner, 'new-investment'))).exists(), false);
});
for (const [label, options] of [
  ['future date', { operation: { effectiveAt: new Timestamp(4_000_000_000, 0) }, checkpoint: { effectiveAt: new Timestamp(4_000_000_000, 0) } }],
  ['pre-epoch date', { operation: { effectiveAt: new Timestamp(-1, 0) }, checkpoint: { effectiveAt: new Timestamp(-1, 0) } }],
  ['untyped date', { operation: { effectiveAt: '2026-09-05' }, checkpoint: { effectiveAt: '2026-09-05' } }],
  ['missing date', { operation: { effectiveAt: deleteField() } }],
  ['missing discriminator', { operation: { dated: deleteField() } }], ['untyped discriminator', { operation: { dated: 'yes' } }],
  ['commit discriminator with dated arguments', { operation: { dated: false } }],
  ['missing current effect', { operation: { fromCurrentEffectInCents: deleteField() } }],
  ['forged zero current effect', { operation: { fromCurrentEffectInCents: 0 }, bank: { balanceInCents: 10000 } }],
  ['forged positive current effect', { operation: { fromCurrentEffectInCents: 1000 }, bank: { balanceInCents: 11000 } }],
  ['fractional current effect', { operation: { fromCurrentEffectInCents: -0.5 }, bank: { balanceInCents: 9999.5 } }],
  ['commit reference instead of application date', { checkpoint: { effectiveAt: serverTimestamp() } }],
  ['inclusive investment reference', { checkpoint: { includesBoundary: true } }],
  ['valuation used as principal', { bank: { balanceInCents: 8800 }, operation: { fromCurrentEffectInCents: -1200 } }],
  ['forged actor', { operation: { actorId: 'other' } }], ['forged predecessor', { operation: { fromPreviousOperationId: 'bootstrap_cash' } }],
  ['unknown date alias', { operation: { observedAt: past() } }], ['unknown authority', { capital: { isAdmin: true } }],
] as const) test(`Spark retro opening Rules reject ${label}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await denied((await rawFundedOpening({ input: retroOpening(), ...options })).commit());
});
test('Spark retro opening Rules reject a second debit already covered by a later count', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await countSparkAccountFirebase(owner, count());
  await denied((await rawFundedOpening({ input: retroOpening({ expectedFundingRevision: 1 }),
    bank: { balanceInCents: 11000 }, operation: { fromCurrentEffectInCents: -1000 } })).commit());
  assert.equal((await balance('bank')).balanceInCents, 12000);
});
for (const effectiveAt of [new Timestamp(-1, 0), new Timestamp(4_000_000_000, 0), '2026-09-05', null]) test(`Spark retro opening service rejects invalid date ${String(effectiveAt)}`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await financialRejection(openDatedFundedSparkInvestmentFirebase(owner, retroOpening({ effectiveAt: effectiveAt as any })), /data efetiva válida/);
});
test('Spark retro opening service rejects date aliases and commit replay under another mode', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = retroOpening();
  for (const key of ['date', 'observedAt']) await financialRejection(openDatedFundedSparkInvestmentFirebase(owner, { ...input, [key]: input.effectiveAt } as any), /única data/);
  await openFundedSparkInvestmentFirebase(owner, fundedOpening({ clientActionId: input.clientActionId }));
  await financialRejection(openDatedFundedSparkInvestmentFirebase(owner, input), /outros argumentos/);
});
test('Spark retro opening replay checks exact data and current admin without a second debit or quota', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = retroOpening(); await openDatedFundedSparkInvestmentFirebase(owner, input);
  assert.equal((await openDatedFundedSparkInvestmentFirebase(secondSession, input)).idempotent, true);
  assert.equal((await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!.count, 1);
  await financialRejection(openDatedFundedSparkInvestmentFirebase(owner, { ...input, principalInCents: 1100 }), /outros argumentos/);
  await financialRejection(openFundedSparkInvestmentFirebase(owner, fundedOpening({ clientActionId: input.clientActionId })), /outros argumentos/);
  await seedGroup({ members: { [uid]: 'member' } }); await financialRejection(openDatedFundedSparkInvestmentFirebase(owner, input), /administrador/);
});
test('Spark retro opening rejects members, outsiders, expired sessions and preceding protocol', async () => {
  await financialRejection(openDatedFundedSparkInvestmentFirebase(owner, retroOpening()), /administrador/);
  await denied((await rawFundedOpening({ input: retroOpening() })).commit());
  await seedGroup({ members: { [uid]: 'admin' } });
  await denied((await rawFundedOpening({ input: retroOpening(), firestore: outsider })).commit());
  await denied((await rawFundedOpening({ input: retroOpening(), firestore: expired })).commit());
  await denied((await rawFundedOpening({ input: retroOpening(), firestore: anonymous })).commit());
  await seedGroup({ sparkProtocol: 'financial-proof-v14' }); await financialRejection(openDatedFundedSparkInvestmentFirebase(owner, retroOpening()), /não habilitado/);
});
test('Spark retro opening rejects stale revision, inactive bank and expired monthly deadline', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await transferSparkFundsFirebase(owner, command());
  await financialRejection(openDatedFundedSparkInvestmentFirebase(owner, retroOpening()), /banco mudou/);
  await denied((await rawFundedOpening({ input: retroOpening() })).commit());
  const input = retroOpening({ expectedFundingRevision: 1 }); await seedPosition('bank', { nextActivationAt: past() });
  await financialRejection(openDatedFundedSparkInvestmentFirebase(owner, input), /aberturas mensais vencidas/);
  await denied((await rawFundedOpening({ input })).commit());
  await seedPosition('bank', { nextActivationAt: null, active: false }); await denied((await rawFundedOpening({ input })).commit());
});
test('Spark retro opening cannot overdraw an uncovered current balance or use cash funding', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = retroOpening({ principalInCents: 10001 });
  await financialRejection(openDatedFundedSparkInvestmentFirebase(owner, input), /insuficiente/); await denied((await rawFundedOpening({ input })).commit());
  const cash = retroOpening({ fundingAccountId: 'cash', catalog: { ...accountCatalog(), bankAccountId: 'cash' } });
  await financialRejection(openDatedFundedSparkInvestmentFirebase(owner, cash), /bancária/); await denied((await rawFundedOpening({ input: cash })).commit());
});
test('Spark retro opening concurrent exact replay creates one root and independent commands require a fresh revision', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = retroOpening();
  const replay = await Promise.all([openDatedFundedSparkInvestmentFirebase(owner, input), openDatedFundedSparkInvestmentFirebase(secondSession, input)]);
  assert.deepEqual(replay.map(result => result.idempotent).sort(), [false, true]);
  const alternatives = ['a', 'b'].map(suffix => retroOpening({ accountId: `retro-${suffix}`, clientActionId: `retro_independent_${suffix}_123456`, expectedFundingRevision: 1 }));
  await acknowledgePriorSend();
  const results = await Promise.allSettled(alternatives.map((value, index) => openDatedFundedSparkInvestmentFirebase(index ? secondSession : owner, value)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal((await balance('bank')).balanceInCents, 8000);
  await acknowledgePriorSend();
  await financialRejection(openDatedFundedSparkInvestmentFirebase(owner, { ...input, clientActionId: 'retro_duplicate_123456', expectedFundingRevision: 2 }), /já existe/);
});
test('Spark retro opening principal correction and funding change preserve the application date', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = retroOpening(); await openDatedFundedSparkInvestmentFirebase(owner, input);
  const principal = principalInput({ openingOperationId: input.clientActionId, expectedCapitalOperationId: input.clientActionId });
  await updateSparkInvestmentPrincipalFirebase(owner, principal); assert.equal((await balance('bank')).balanceInCents, 8500);
  const change = fundingInput({ openingOperationId: input.clientActionId, expectedCapitalOperationId: principal.clientActionId,
    expectedCapitalRevision: 1, expectedFundingRevision: 2, expectedInvestmentRevision: 1, expectedNewFundingRevision: 0, principalInCents: 75 });
  await changeSparkInvestmentFundingFirebase(owner, change);
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('third')).balanceInCents, 25);
  assert.equal((await fundedState()).currentBalanceInCents, 1200);
  for (const operationId of [principal.clientActionId, change.clientActionId]) assert.equal((await getDoc(operationRef(owner, operationId))).data()!.effectiveAt.isEqual(input.effectiveAt), true);
  await historicalPairBalance('bank', '2026-09-06T12:00:00Z', 10000, 'retro_edit_old_bank_123456');
  await historicalPairBalance('third', '2026-09-06T12:00:00Z', 25, 'retro_edit_new_bank_123456');
  await historicalPairBalance(input.accountId, '2026-09-06T12:00:00Z', 1200, 'retro_edit_investment_123456');
});
test('Spark retro opening capital guards reject corrections moved to administrative creation time', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = retroOpening(); await openDatedFundedSparkInvestmentFirebase(owner, input);
  const createdAt = (await getDoc(operationRef(owner, input.clientActionId))).data()!.createdAt;
  await denied((await rawPrincipal({ input: principalInput({ openingOperationId: input.clientActionId, expectedCapitalOperationId: input.clientActionId }),
    operation: { effectiveAt: createdAt } })).commit());
  await denied((await rawFunding({ input: fundingInput({ openingOperationId: input.clientActionId,
    expectedCapitalOperationId: input.clientActionId, expectedNewFundingRevision: 0, principalInCents: 75 }), operation: { effectiveAt: createdAt } })).commit());
});
test('Spark retro opening raw principal and funding updates have valid positive controls on the original date', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = retroOpening(); await openDatedFundedSparkInvestmentFirebase(owner, input);
  const principal = principalInput({ openingOperationId: input.clientActionId, expectedCapitalOperationId: input.clientActionId });
  await (await rawPrincipal({ input: principal })).commit(); assert.equal((await balance('bank')).balanceInCents, 8500);
  await (await rawFunding({ input: fundingInput({ openingOperationId: input.clientActionId, expectedCapitalOperationId: principal.clientActionId,
    expectedCapitalRevision: 1, expectedFundingRevision: 2, expectedInvestmentRevision: 1, expectedNewFundingRevision: 0, principalInCents: 75 }) })).commit();
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('third')).balanceInCents, 25);
});
test('Spark retro opening later observations preserve earlier deposits and exclusive same-date coverage', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = retroOpening(); await openDatedFundedSparkInvestmentFirebase(owner, input);
  const sync = investmentSync({ accountId: input.accountId, expectedRevision: 0, observedAt: past('2026-09-10T12:00:00Z'), observedValueInCents: 2000 });
  await prepareSparkInvestmentSyncFirebase(owner, sync); await synchronizeSparkInvestmentFirebase(owner, sync);
  await transferSparkDatedFundsFirebase(owner, datedPair({ toAccountId: input.accountId, amountInCents: 200, effectiveAt: past('2026-09-07T12:00:00Z') }));
  await transferSparkDatedFundsFirebase(owner, datedPair({ clientActionId: 'retro_equal_deposit_123456', toAccountId: input.accountId,
    amountInCents: 100, effectiveAt: input.effectiveAt }));
  assert.equal((await fundedState()).currentBalanceInCents, 2000); assert.equal((await balance('bank')).balanceInCents, 8700);
  await historicalPairBalance(input.accountId, '2026-09-05T12:00:00Z', 1200, 'retro_equal_reference_123456');
  await historicalPairBalance(input.accountId, '2026-09-08T12:00:00Z', 1400, 'retro_before_sync_123456');
  await historicalPairBalance(input.accountId, '2026-09-11T12:00:00Z', 2000, 'retro_after_sync_123456');
});
test('Spark retro opening bank certificates retain historical principal despite zero current effects', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await countSparkAccountFirebase(owner, count({ targetBalanceInCents: 300 }));
  const ids = ['retro_cert_a_123456', 'retro_cert_b_123456'];
  for (const [index, id] of ids.entries()) await openDatedFundedSparkInvestmentFirebase(owner, retroOpening({ accountId: `retro-cert-${index}`,
    clientActionId: id, expectedFundingRevision: index + 1, effectiveAt: past(`2026-09-0${index + 5}T12:00:00Z`) }));
  const segment = await certifySparkHistorySegmentFirebase(owner, { ...segmentInput(), olderOperationId: ids[0], newerOperationId: ids[1] });
  assert.equal(segment.segment!.deltaInCents, -2000); assert.equal(segment.segment!.absoluteDeltaInCents, 2000);
  await historicalPairBalance('bank', '2026-09-07T12:00:00Z', 8000, 'retro_certificate_history_123456');
  assert.equal((await balance('bank')).balanceInCents, 300);
  await financialRejection(certifySparkHistorySegmentFirebase(owner, { ...segmentInput(), accountId: 'retro-cert-0', olderOperationId: ids[0], newerOperationId: ids[1] }));
});
test('Spark retro opening zero observed value remains integer and root cannot be generically reversed', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = retroOpening({ observedValueInCents: -0 });
  await openDatedFundedSparkInvestmentFirebase(owner, input); assert.equal((await fundedState()).currentBalanceInCents, 0);
  await financialRejection(reverseSparkDatedTransferFirebase(owner, { ...datedUndo(input.clientActionId) }), /estorn/);
  await denied(deleteDoc(operationRef(owner, input.clientActionId))); await denied(deleteDoc(capitalRef()));
});
test('Spark retro opening corrections preserve later counts in both banks and a later investment valuation', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await countSparkAccountFirebase(owner, count({ targetBalanceInCents: 300 }));
  await countSparkAccountFirebase(owner, count({ accountId: 'third', targetBalanceInCents: 200, clientActionId: 'retro_third_count_123456' }));
  const input = retroOpening({ expectedFundingRevision: 1 }); await openDatedFundedSparkInvestmentFirebase(owner, input);
  const sync = investmentSync({ accountId: input.accountId, observedAt: past('2026-09-10T12:00:00Z'), observedValueInCents: 2000 });
  await prepareSparkInvestmentSyncFirebase(owner, sync); await synchronizeSparkInvestmentFirebase(owner, sync);
  const principal = principalInput({ openingOperationId: input.clientActionId, expectedCapitalOperationId: input.clientActionId,
    expectedFundingRevision: 2, expectedInvestmentRevision: 1 });
  await updateSparkInvestmentPrincipalFirebase(owner, principal);
  const change = fundingInput({ openingOperationId: input.clientActionId, expectedCapitalOperationId: principal.clientActionId,
    expectedCapitalRevision: 1, expectedFundingRevision: 3, expectedInvestmentRevision: 2, expectedNewFundingRevision: 1, principalInCents: 75 });
  await changeSparkInvestmentFundingFirebase(owner, change);
  assert.equal((await balance('bank')).balanceInCents, 300); assert.equal((await balance('third')).balanceInCents, 200);
  assert.equal((await fundedState()).currentBalanceInCents, 2000);
  const receipt = (await getDoc(operationRef(owner, change.clientActionId))).data()!;
  assert.deepEqual([receipt.fromCurrentEffectInCents, receipt.toCurrentEffectInCents, receipt.refundCurrentEffectInCents], [0, 0, 0]);
  await historicalPairBalance('bank', '2026-09-06T12:00:00Z', 10000, 'retro_covered_old_bank_123456');
  await historicalPairBalance('third', '2026-09-06T12:00:00Z', 25, 'retro_covered_new_bank_123456');
  await historicalPairBalance(input.accountId, '2026-09-06T12:00:00Z', 1200, 'retro_covered_asset_123456');
});

function cdiInput(overrides: Partial<SparkCdiRateInput> = {}): SparkCdiRateInput {
  return { groupId: 'proof', actorId: uid, clientActionId: 'cdi_update_123456', effectiveDay: '2026-09-05', annualRateInBasisPoints: 1475, expectedRevision: null, ...overrides };
}
const cdiRef = (firestore = owner) => doc(firestore, 'investmentCdiRates', `${uid}_20260905`);
async function rawCdi(options: { omit?: 'rate' | 'operation' | 'quota'; operation?: Record<string, unknown>; rate?: Record<string, unknown>; firestore?: typeof owner } = {}) {
  const firestore = options.firestore ?? owner, batch = writeBatch(firestore), input = cdiInput();
  if (options.omit !== 'rate') batch.set(cdiRef(firestore), { schemaVersion: 1, personId: uid, groupId: 'proof', annualRateInBasisPoints: 1475,
    effectiveFrom: past('2026-09-05T03:00:00Z'), revision: 0, lastOperationId: input.clientActionId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...options.rate });
  if (options.omit !== 'operation') batch.set(operationRef(firestore, input.clientActionId), { schemaVersion: 1, actorId: uid, kind: 'investment_cdi_update',
    rateId: `${uid}_20260905`, cycle: '2026-09', day: 5, effectiveFrom: past('2026-09-05T03:00:00Z'), annualRateInBasisPoints: 1475, expectedRevision: null,
    createdAt: serverTimestamp(), ...options.operation });
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data(), window = Math.floor(Date.now() / 60000) * 60000;
  if (options.omit !== 'quota') batch.set(doc(firestore, 'sparkTransferQuotas', uid), { groupId: 'proof', count: quota?.windowStartInMillis === window ? quota.count + 1 : 1,
    windowStartInMillis: window, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
  return batch;
}
test('Spark CDI creates and edits a personal civil-day rate atomically without touching positions', async () => {
  const first = cdiInput(); await saveSparkCdiRateFirebase(owner, first); const original = (await getDoc(cdiRef())).data()!;
  assert.equal(original.effectiveFrom.isEqual(past('2026-09-05T03:00:00Z')), true); assert.equal(original.revision, 0);
  const second = cdiInput({ clientActionId: 'cdi_second_123456', annualRateInBasisPoints: 0, expectedRevision: 0 });
  await saveSparkCdiRateFirebase(owner, second); const updated = (await getDoc(cdiRef())).data()!;
  assert.equal(updated.annualRateInBasisPoints, 0); assert.equal(updated.revision, 1); assert.equal(updated.createdAt.isEqual(original.createdAt), true);
  assert.equal((await saveSparkCdiRateFirebase(secondSession, first)).idempotent, true);
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('bank')).revision, 0);
  await financialRejection(saveSparkCdiRateFirebase(owner, { ...first, annualRateInBasisPoints: 1500 }), /outros argumentos/);
  await financialRejection(saveSparkCdiRateFirebase(owner, { ...first, clientActionId: 'cdi_stale_123456' }), /mudou/);
});
test('Spark CDI raw positive control and owner-only overwrite rules', async () => {
  await (await rawCdi()).commit(); assert.equal((await getDoc(cdiRef())).data()!.annualRateInBasisPoints, 1475);
  const batch = writeBatch(owner); batch.set(cdiRef(), { personId: uid, annualRateInBasisPoints: 2000, effectiveFrom: past('2026-09-05T03:00:00Z') });
  await denied(batch.commit()); await denied(deleteDoc(cdiRef()));
});
for (const omit of ['rate', 'operation', 'quota'] as const) test(`Spark CDI rejects missing ${omit}`, async () => { await denied((await rawCdi({ omit })).commit()); });
for (const [label, options] of [
  ['wrong person', { rate: { personId: 'other' } }], ['wrong group', { rate: { groupId: 'other' } }],
  ['untyped rate', { rate: { annualRateInBasisPoints: '1475' } }], ['rate mismatch', { rate: { annualRateInBasisPoints: 1476 } }],
  ['wrong day', { operation: { day: 6 } }], ['unknown calendar day', { operation: { day: 31 } }],
  ['wrong midnight', { operation: { effectiveFrom: past('2026-09-05T00:00:00Z') }, rate: { effectiveFrom: past('2026-09-05T00:00:00Z') } }],
  ['wrong deterministic id', { operation: { rateId: 'arbitrary' } }], ['skipped revision', { rate: { revision: 1 } }],
  ['extra authority', { rate: { admin: true } }], ['extra receipt field', { operation: { confirmed: true } }], ['forged actor', { operation: { actorId: 'other' } }],
] as const) test(`Spark CDI Rules reject ${label}`, async () => { await denied((await rawCdi(options)).commit()); });
for (const annualRateInBasisPoints of [-1, 0.5, 100001, NaN]) test(`Spark CDI rejects invalid annual rate ${annualRateInBasisPoints}`, async () => {
  await financialRejection(saveSparkCdiRateFirebase(owner, cdiInput({ annualRateInBasisPoints })), /inválida/);
  await denied((await rawCdi({ operation: { annualRateInBasisPoints }, rate: { annualRateInBasisPoints } })).commit());
});
for (const effectiveDay of ['2026-02-29', '2026-09-31', '2026-9-05', '1969-12-31', '2101-01-01']) test(`Spark CDI refuses invalid civil date ${effectiveDay}`, async () => {
  await financialRejection(saveSparkCdiRateFirebase(owner, cdiInput({ effectiveDay })), /inválido/);
});
test('Spark CDI canonical day is unique under two sessions and independent updates conflict', async () => {
  const first = cdiInput(), other = cdiInput({ clientActionId: 'cdi_independent_123456', annualRateInBasisPoints: 1500 });
  await acknowledgePriorSend();
  const results = await Promise.allSettled([saveSparkCdiRateFirebase(owner, first), saveSparkCdiRateFirebase(secondSession, other)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const winner = results[0].status === 'fulfilled' ? first : other; assert.equal((await saveSparkCdiRateFirebase(owner, winner)).idempotent, true);
  assert.equal((await getDoc(cdiRef())).data()!.revision, 0);
});
test('Spark CDI upgrades owned legacy rate without changing its civil date or creation time', async () => {
  const createdAt = past('2026-09-01T12:00:00Z');
  await environment.withSecurityRulesDisabled(async context => seedSetDoc(seedDoc(context.firestore(), 'investmentCdiRates', `${uid}_20260905`), {
    personId: uid, annualRateInBasisPoints: 1200, effectiveFrom: past('2026-09-05T03:00:00Z').toDate(), createdAt: createdAt.toDate(),
  }));
  await saveSparkCdiRateFirebase(owner, cdiInput()); const rate = (await getDoc(cdiRef())).data()!;
  assert.equal(rate.schemaVersion, 1); assert.equal(rate.revision, 0); assert.equal(rate.createdAt.isEqual(createdAt), true);
});
test('Spark CDI refuses outsiders, expired sessions and previous group protocol', async () => {
  await denied((await rawCdi({ firestore: outsider })).commit()); await denied((await rawCdi({ firestore: expired })).commit());
  await seedGroup({ sparkProtocol: 'financial-proof-v15' }); await financialRejection(saveSparkCdiRateFirebase(owner, cdiInput()), /não habilitado/);
});
test('Spark context uses protected group role and never falls back when blocked, revoked or out of date', async () => {
  await environment.withSecurityRulesDisabled(async context => seedSetDoc(seedDoc(context.firestore(), 'users', uid), { financialGroupId: 'proof', financialGroupRole: 'admin' }));
  assert.equal((await getSparkContextFirebase(owner, uid))!.role, 'member');
  await seedGroup({ sparkProtocol: 'financial-proof-v15' }); await financialRejection(getSparkContextFirebase(owner, uid), /atualizado/);
  await seedGroup({ sparkProtocol: SPARK_TRANSFER_PROOF_PROTOCOL, status: 'spark_importing' }); await denied(getSparkContextFirebase(owner, uid));
  await seedGroup({ status: 'active', members: {} }); await denied(getSparkContextFirebase(owner, uid));
  await financialRejection(getSparkContextFirebase(owner, 'other'), /sessão/);
});

function categoryInput(overrides: Partial<SparkCategoryInput> = {}): SparkCategoryInput {
  return { groupId: 'proof', actorId: uid, clientActionId: 'category_save_123456', categoryId: 'spark-category', expectedRevision: null,
    category: { name: 'Casa', usageType: 'both', isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null }, ...overrides };
}
const nativeCategoryRef = (firestore = owner) => doc(firestore, 'tags', 'spark-category');
const categoryUseRef = () => doc(owner, 'sparkCategoryReferences', 'spark-category');
async function rawCategory(options: { action?: 'save' | 'delete'; omit?: 'category' | 'operation' | 'quota'; category?: Record<string, unknown>; operation?: Record<string, unknown>; firestore?: typeof owner } = {}) {
  const input = categoryInput(), firestore = options.firestore ?? owner, previous = (await getDoc(nativeCategoryRef())).data();
  const action = options.action ?? 'save', id = action === 'save' ? input.clientActionId : 'category_delete_123456', revision = previous?.revision ?? null;
  const batch = writeBatch(firestore);
  if (options.omit !== 'category') batch.set(nativeCategoryRef(firestore), { ...(previous ?? { schemaVersion: 1, personId: uid, groupId: 'proof',
    ...input.category, historyKnown: true, createdAt: serverTimestamp() }), deleted: action === 'delete', revision: (revision ?? -1) + 1,
    lastOperationId: id, updatedAt: serverTimestamp(), ...options.category });
  if (options.omit !== 'operation') batch.set(operationRef(firestore, id), { schemaVersion: 1, actorId: uid, kind: `category_${action}`,
    categoryId: input.categoryId, expectedRevision: revision, ...(action === 'save' ? input.category : {}), createdAt: serverTimestamp(), ...options.operation });
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data(), window = Math.floor(Date.now() / 60000) * 60000;
  if (options.omit !== 'quota') batch.set(doc(firestore, 'sparkTransferQuotas', uid), { groupId: 'proof', count: quota?.windowStartInMillis === window ? quota.count + 1 : 1,
    windowStartInMillis: window, lastOperationId: id, updatedAt: serverTimestamp() });
  return batch;
}
test('Spark categories save, update and delete unused metadata without changing money or permitting identity reuse', async () => {
  const input = categoryInput(); await saveSparkCategoryFirebase(owner, input); const original = (await getDoc(nativeCategoryRef())).data()!;
  await saveSparkCategoryFirebase(owner, categoryInput({ clientActionId: 'category_edit_123456', expectedRevision: 0, category: { ...input.category, name: 'Casa nova' } }));
  assert.equal((await saveSparkCategoryFirebase(secondSession, input)).idempotent, true);
  await deleteSparkCategoryFirebase(owner, { ...input, clientActionId: 'category_delete_123456', expectedRevision: 1 });
  const deleted = (await getDoc(nativeCategoryRef())).data()!; assert.equal(deleted.deleted, true); assert.equal(deleted.revision, 2);
  assert.equal(deleted.createdAt.isEqual(original.createdAt), true); assert.equal((await balance('bank')).revision, 0);
  await denied(deleteDoc(nativeCategoryRef()));
  await financialRejection(saveSparkCategoryFirebase(owner, { ...input, clientActionId: 'category_resurrect_123456', expectedRevision: 2 }), /indisponível/);
  await financialRejection(postSparkMovementFirebase(owner, ordinaryCommand({ categoryId: input.categoryId })), /Categoria incompatível/);
});
test('Spark categories raw positive controls cover create and unused deletion', async () => {
  await (await rawCategory()).commit(); await (await rawCategory({ action: 'delete' })).commit(); assert.equal((await getDoc(nativeCategoryRef())).data()!.deleted, true);
});
for (const omit of ['category', 'operation', 'quota'] as const) test(`Spark categories reject missing ${omit}`, async () => { await denied((await rawCategory({ omit })).commit()); });
for (const [label, options] of [
  ['foreign owner', { category: { personId: 'other' } }], ['foreign group', { category: { groupId: 'other' } }],
  ['unknown field', { category: { admin: true } }], ['untyped flag', { category: { isMandatoryExpense: 'yes' } }],
  ['incompatible mandatory flag', { category: { usageType: 'gain', isMandatoryExpense: true }, operation: { usageType: 'gain', isMandatoryExpense: true } }],
  ['empty name', { category: { name: '' }, operation: { name: '' } }], ['oversized name', { category: { name: 'x'.repeat(161) }, operation: { name: 'x'.repeat(161) } }],
  ['unknown usage', { category: { usageType: 'all' }, operation: { usageType: 'all' } }], ['invented history', { category: { historyKnown: false } }],
  ['receipt mismatch', { category: { name: 'Outra' } }], ['extra receipt field', { operation: { authority: true } }], ['skipped revision', { category: { revision: 1 } }],
] as const) test(`Spark categories Rules reject ${label}`, async () => { await denied((await rawCategory(options)).commit()); });
test('Spark categories lock the first real use atomically and retain protection after reversal', async () => {
  const input = categoryInput(); await saveSparkCategoryFirebase(owner, input);
  await denied(rawOrdinary({ categoryId: input.categoryId })); assert.equal((await balance('bank')).revision, 0);
  const movement = ordinaryCommand({ categoryId: input.categoryId }); await postSparkMovementFirebase(owner, movement);
  assert.equal((await getDoc(categoryUseRef())).data()!.operationId, movement.clientActionId);
  await financialRejection(deleteSparkCategoryFirebase(owner, { ...input, clientActionId: 'category_delete_123456', expectedRevision: 0 }), /vinculados/);
  await denied((await rawCategory({ action: 'delete' })).commit()); await denied(deleteDoc(categoryUseRef()));
  await reverseSparkMovementFirebase(owner, resolution({ originalOperationId: movement.clientActionId }));
  await financialRejection(deleteSparkCategoryFirebase(owner, { ...input, clientActionId: 'category_after_undo_123456', expectedRevision: 0 }), /vinculados/);
  assert.equal((await balance('bank')).balanceInCents, 10000);
});
test('Spark categories protect recurring definitions and their real settlements with the same permanent usage lock', async () => {
  const input = categoryInput(); await saveSparkCategoryFirebase(owner, input);
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ categoryId: input.categoryId }));
  assert.equal((await getDoc(categoryUseRef())).exists(), true);
  await settleSparkRecurringFirebase(owner, recurringSettlement()); assert.equal((await balance('bank')).balanceInCents, 9000);
  await financialRejection(deleteSparkCategoryFirebase(owner, { ...input, clientActionId: 'category_recurring_delete_123456', expectedRevision: 0 }), /vinculados/);
});
test('Spark categories use and deletion cannot both win a concurrent race', async () => {
  const input = categoryInput(); await saveSparkCategoryFirebase(owner, input);
  await acknowledgePriorSend();
  const results = await Promise.allSettled([postSparkMovementFirebase(owner, ordinaryCommand({ categoryId: input.categoryId })),
    deleteSparkCategoryFirebase(secondSession, { ...input, clientActionId: 'category_delete_123456', expectedRevision: 0 })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await balance('bank')).balanceInCents, (await getDoc(nativeCategoryRef())).data()!.deleted ? 10000 : 11000);
});
test('Spark categories cannot mark themselves unused, forge a use lock or escape to legacy mutation', async () => {
  const input = categoryInput(); await saveSparkCategoryFirebase(owner, input);
  const batch = writeBatch(owner); batch.set(categoryUseRef(), { schemaVersion: 1, groupId: 'proof', categoryId: input.categoryId,
    operationId: input.clientActionId, createdAt: serverTimestamp() }); await denied(batch.commit());
  const overwrite = writeBatch(owner); overwrite.set(nativeCategoryRef(), { personId: uid, name: 'Escape', usageType: 'both' }); await denied(overwrite.commit());
  await denied((await rawCategory({ operation: { kind: 'category_delete' }, category: { deleted: true, historyKnown: false } })).commit());
});
test('Spark categories preserve a complete legacy source and block deletion until its old references are inventoried', async () => {
  await environment.withSecurityRulesDisabled(async context => seedSetDoc(seedDoc(context.firestore(), 'tags', 'spark-category'), {
    personId: uid, name: 'Antiga', usageType: 'both', description: 'Conservar este campo antigo', createdAt: new Date('2026-09-01Z'),
  }));
  await saveSparkCategoryFirebase(owner, categoryInput()); const category = (await getDoc(nativeCategoryRef())).data()!;
  assert.equal(category.historyKnown, false);
  const originRef = doc(owner, 'financialGroups/proof/sparkMetadataOrigins/category_spark-category');
  assert.equal((await getDoc(originRef)).data()!.source.description, 'Conservar este campo antigo'); await denied(deleteDoc(originRef));
  await financialRejection(deleteSparkCategoryFirebase(owner, { ...categoryInput(), clientActionId: 'category_legacy_delete_123456', expectedRevision: 0 }), /inventário/);
  await denied((await rawCategory({ category: { historyKnown: true } })).commit());
});
test('Spark categories require ownership even for another group administrator and refuse stale confirmations', async () => {
  const input = categoryInput(); await saveSparkCategoryFirebase(owner, input);
  const otherUid = getAuth(outsider.app).currentUser!.uid; await seedGroup({ members: { [uid]: 'member', [otherUid]: 'admin' } });
  await financialRejection(saveSparkCategoryFirebase(outsider, { ...input, actorId: otherUid, clientActionId: 'category_admin_edit_123456', expectedRevision: 0 }), /proprietário/);
  await financialRejection(saveSparkCategoryFirebase(owner, { ...input, clientActionId: 'category_stale_123456', expectedRevision: 0, expectedFingerprint: 'changed' }), /mudou/);
  await denied((await rawCategory({ firestore: outsider })).commit()); await denied((await rawCategory({ firestore: expired })).commit());
});
async function enableSparkProfile() {
  await environment.withSecurityRulesDisabled(async context => seedSetDoc(seedDoc(context.firestore(), 'users', uid), { financialGroupId: 'proof', financialGroupRole: 'member' }));
}
test('Spark metadata command creates and edits a category through the shared form/chat contract and replays after later edits', async () => {
  await enableSparkProfile();
  const command = { groupId: 'proof', actorId: uid, clientActionId: 'metadata_command_123456', domain: 'category' as const, action: 'create' as const,
    fields: { name: 'Moradia', usageType: 'both' }, assistantRequestFingerprint: 'confirmed-version' };
  const first = await executeSparkMetadataCommandFirebase(owner, command), ref = doc(owner, 'tags', first.recordId), previous = (await getDoc(ref)).data()!;
  await executeSparkMetadataCommandFirebase(owner, { ...command, action: 'update', clientActionId: 'metadata_edit_123456', recordId: first.recordId,
    fields: { name: 'Casa' }, expectedFingerprint: createAssistantRecordFingerprint(previous) });
  assert.equal((await executeSparkMetadataCommandFirebase(secondSession, command)).idempotent, true);
  assert.equal((await getDoc(ref)).data()!.name, 'Casa');
  await financialRejection(executeSparkMetadataCommandFirebase(owner, { ...command, fields: { name: 'Outro' } }), /outros argumentos/);
  await financialRejection(executeSparkMetadataCommandFirebase(owner, { ...command, assistantRequestFingerprint: 'other-version' }), /outros argumentos/);
  await financialRejection(executeSparkMetadataCommandFirebase(owner, { ...command, action: 'update', recordId: first.recordId, clientActionId: 'metadata_stale_123456',
    expectedFingerprint: createAssistantRecordFingerprint(previous) }), /mudou/);
});
test('Spark metadata command saves CDI by the confirmed Sao Paulo day and recovers the exact command', async () => {
  await enableSparkProfile(); const command = { groupId: 'proof', actorId: uid, clientActionId: 'metadata_cdi_command_123456',
    domain: 'cdi' as const, action: 'upsert' as const, recordId: `${uid}_20260905`, fields: { annualRateInBasisPoints: 1400, effectiveFrom: past('2026-09-05T15:00:00Z').toDate() }, assistantRequestFingerprint: 'confirmed-cdi' };
  await executeSparkMetadataCommandFirebase(owner, command); assert.equal((await executeSparkMetadataCommandFirebase(secondSession, command)).idempotent, true);
  assert.equal((await getDoc(cdiRef())).data()!.effectiveFrom.isEqual(past('2026-09-05T03:00:00Z')), true);
  await financialRejection(executeSparkMetadataCommandFirebase(owner, { ...command, recordId: `${uid}_20260906` }), /divergente/);
});
test('Spark metadata command accepts a maximum-length operation identity and retains deterministic creation', async () => {
  await enableSparkProfile();
  const command = { groupId: 'proof', actorId: uid, clientActionId: 'x'.repeat(160), domain: 'category' as const, action: 'create' as const, fields: { name: 'Casa' } };
  const first = await executeSparkMetadataCommandFirebase(owner, command);
  assert.ok(first.recordId.length <= 160); assert.equal((await executeSparkMetadataCommandFirebase(secondSession, command)).recordId, first.recordId);
});
test('Spark categories correction across two accounts creates a native reference within the Rules budget', async () => {
  await postSparkMovementFirebase(owner, ordinaryCommand());
  const category = categoryInput(); await saveSparkCategoryFirebase(owner, category);
  await correctSparkMovementFirebase(owner, { ...resolution(), accountId: 'cash', categoryId: category.categoryId, amountInCents: 1500 });
  const summary = await getSparkCategoryReferencesFirebase(owner, 'proof', category.categoryId);
  assert.equal(summary.permanentHistory, true); assert.equal(summary.gains, 1); assert.equal(summary.total, 1);
});
test('Spark categories preserve the permanent reference after recurring reclassification', async () => {
  const category = categoryInput(); await saveSparkCategoryFirebase(owner, category);
  const plan = recurringPlan({ categoryId: category.categoryId }); await createSparkRecurringPlanFirebase(owner, plan);
  await updateSparkRecurringPlanFirebase(owner, { ...plan, clientActionId: 'reclassify_plan_123456', expectedPlanRevision: 0, name: 'Nova', categoryId: null, active: true });
  const summary = await getSparkCategoryReferencesFirebase(owner, 'proof', category.categoryId);
  assert.equal(summary.total, 0); assert.equal(summary.permanentHistory, true);
});
for (const domain of ['category', 'cdi'] as const) test(`Spark ${domain === 'category' ? 'categories' : 'CDI'} refuse unknown v1 fields without discarding their source`, async () => {
  if (domain === 'category') await saveSparkCategoryFirebase(owner, categoryInput()); else await saveSparkCdiRateFirebase(owner, cdiInput());
  const collectionName = domain === 'category' ? 'tags' : 'investmentCdiRates', id = domain === 'category' ? 'spark-category' : `${uid}_20260905`;
  await environment.withSecurityRulesDisabled(async context => seedUpdateDoc(seedDoc(context.firestore(), collectionName, id), { importedUnknownField: 'preservar' }));
  const action = domain === 'category' ? saveSparkCategoryFirebase(owner, categoryInput({ clientActionId: 'unknown_v1_123456', expectedRevision: 0 }))
    : saveSparkCdiRateFirebase(owner, cdiInput({ clientActionId: 'unknown_v1_123456', expectedRevision: 0 }));
  await financialRejection(action, /inventário/); assert.equal((await getDoc(doc(owner, collectionName, id))).data()!.importedUnknownField, 'preservar');
});

function lifecycleInput(overrides: Partial<SparkAccountLifecycleInput> = {}): SparkAccountLifecycleInput {
  return { groupId: 'proof', actorId: uid, clientActionId: 'lifecycle_123456', accountId: 'bank', expectedPositionRevision: 0,
    expectedLifecycleRevision: null, isActive: true, archived: true, ...overrides };
}
const lifecycleRef = (accountId = 'bank') => doc(owner, 'financialGroups/proof/sparkAccountStates', accountId);
async function rawLifecycle(options: { omit?: 'position' | 'state' | 'operation' | 'quota'; state?: Record<string, unknown>; position?: Record<string, unknown>; operation?: Record<string, unknown> } = {}) {
  await seedGroup({ members: { [uid]: 'admin' } });
  const input = lifecycleInput(), quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data(), start = Math.floor(Date.now() / 60000) * 60000;
  const batch = writeBatch(owner);
  if (options.omit !== 'position') batch.update(positionRef(owner), { active: false, ...options.position });
  if (options.omit !== 'state') batch.set(lifecycleRef(), { schemaVersion: 1, accountId: 'bank', isActive: true, archived: true,
    archivedAt: serverTimestamp(), revision: 0, lastOperationId: input.clientActionId, updatedAt: serverTimestamp(), ...options.state });
  if (options.omit !== 'operation') batch.set(operationRef(owner, input.clientActionId), { schemaVersion: 1, actorId: uid, kind: 'account_lifecycle_update',
    accountId: 'bank', expectedPositionRevision: 0, expectedLifecycleRevision: null, isActive: true, archived: true, createdAt: serverTimestamp(), ...options.operation });
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', windowStartInMillis: start,
    count: quota?.windowStartInMillis === start ? quota.count + 1 : 1, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
  return batch;
}
test('Spark account lifecycle archives and restores a funded account without modifying financial history', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const before = (await getDoc(positionRef(owner))).data()!;
  const input = lifecycleInput(); await setSparkAccountLifecycleFirebase(owner, input);
  const archived = (await getDoc(positionRef(owner))).data()!;
  assert.deepEqual({ ...archived, active: true }, before); assert.equal(archived.active, false);
  assert.equal((await setSparkAccountLifecycleFirebase(secondSession, input)).idempotent, true);
  await financialRejection(postSparkMovementFirebase(owner, ordinaryCommand()), /inativa/);
  await denied(rawOrdinary());
  await setSparkAccountLifecycleFirebase(owner, lifecycleInput({ clientActionId: 'restore_123456', expectedLifecycleRevision: 0, archived: false }));
  assert.equal((await getDoc(lifecycleRef())).data()!.archivedAt, null);
  await postSparkMovementFirebase(owner, ordinaryCommand()); assert.equal((await balance('bank')).balanceInCents, 11000);
  const proof = await prepareSparkHistoryProofFirebase(owner, { groupId: 'proof', actorId: uid, accountId: 'bank', clientActionId: 'history_after_restore_123456', purpose: 'instant', asOf: Timestamp.now() });
  assert.equal(proof.balanceInCents, 11000);
});
test('Spark account lifecycle deactivation is independent from archive and both conditions must permit activity', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const first = lifecycleInput({ archived: false, isActive: false }); await setSparkAccountLifecycleFirebase(owner, first);
  await financialRejection(transferSparkFundsFirebase(owner, command()), /inativa/);
  await setSparkAccountLifecycleFirebase(owner, { ...first, clientActionId: 'archive_inactive_123456', expectedLifecycleRevision: 0, archived: true });
  const at = (await getDoc(lifecycleRef())).data()!.archivedAt;
  await setSparkAccountLifecycleFirebase(owner, { ...first, clientActionId: 'activate_still_archived_123456', expectedLifecycleRevision: 1, archived: true, isActive: true });
  assert.equal((await getDoc(lifecycleRef())).data()!.archivedAt.isEqual(at), true); assert.equal((await getDoc(positionRef(owner))).data()!.active, false);
  await setSparkAccountLifecycleFirebase(owner, { ...first, clientActionId: 'unarchive_still_inactive_123456', expectedLifecycleRevision: 2, archived: false });
  assert.equal((await getDoc(positionRef(owner))).data()!.active, false);
});
test('Spark account lifecycle accepts investments but keeps the canonical cash permanently active', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await setSparkAccountLifecycleFirebase(owner, lifecycleInput({ accountId: 'investment' }));
  assert.equal((await getDoc(positionRef(owner, 'investment'))).data()!.active, false);
  await financialRejection(setSparkAccountLifecycleFirebase(owner, lifecycleInput({ accountId: 'cash', clientActionId: 'archive_cash_123456' })), /Caixa/);
});
test('Spark account lifecycle refuses stale financial or state previews and changed replay arguments', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const first = lifecycleInput(); await setSparkAccountLifecycleFirebase(owner, first);
  await financialRejection(setSparkAccountLifecycleFirebase(owner, { ...first, archived: false }), /outros argumentos/);
  await financialRejection(setSparkAccountLifecycleFirebase(owner, { ...first, clientActionId: 'stale_lifecycle_123456' }), /mudou/);
  await financialRejection(setSparkAccountLifecycleFirebase(owner, { ...first, clientActionId: 'stale_position_123456', expectedLifecycleRevision: 0, expectedPositionRevision: 1 }), /mudou/);
});
test('Spark account lifecycle and a concurrent movement cannot commit against the same financial preview', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  await acknowledgePriorSend();
  const results = await Promise.allSettled([setSparkAccountLifecycleFirebase(owner, lifecycleInput()), postSparkMovementFirebase(secondSession, ordinaryCommand())]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const position = (await getDoc(positionRef(owner))).data()!; assert.equal(position.balanceInCents, position.active ? 11000 : 10000);
});
test('Spark account lifecycle requires current administrator, session, group and ownership of the submitted actor', async () => {
  await seedGroup({ members: { [uid]: 'member' } }); await financialRejection(setSparkAccountLifecycleFirebase(owner, lifecycleInput()), /administrador/);
  await seedGroup({ members: { [uid]: 'admin' } });
  await financialRejection(setSparkAccountLifecycleFirebase(outsider, lifecycleInput())); await financialRejection(setSparkAccountLifecycleFirebase(expired, lifecycleInput()));
  await seedGroup({ status: 'blocked' }); await financialRejection(setSparkAccountLifecycleFirebase(owner, lifecycleInput()));
});
test('Spark account lifecycle raw positive control and immutable receipts/states', async () => {
  await (await rawLifecycle()).commit(); await denied(deleteDoc(lifecycleRef())); await denied(deleteDoc(operationRef(owner, lifecycleInput().clientActionId)));
  await denied((await rawLifecycle()).commit());
});
for (const omit of ['position', 'state', 'operation', 'quota'] as const) test(`Spark account lifecycle rejects missing ${omit}`, async () => { await denied((await rawLifecycle({ omit })).commit()); });
for (const [name, options] of [
  ['balance change', { position: { balanceInCents: 12000 } }], ['financial revision change', { position: { revision: 1 } }],
  ['financial head change', { position: { lastOperationId: 'lifecycle_123456' } }], ['type change', { position: { kind: 'investment' } }],
  ['activity mismatch', { position: { active: true } }], ['untyped state', { state: { isActive: 'yes' } }],
  ['other account', { state: { accountId: 'third' } }], ['extra state authority', { state: { owner: 'forged' } }],
  ['invented archive time', { state: { archivedAt: past('2026-01-01Z') } }], ['skipped state revision', { state: { revision: 1 } }],
  ['receipt mismatch', { operation: { archived: false } }], ['stale position', { operation: { expectedPositionRevision: 1 } }],
] as const) test(`Spark account lifecycle Rules reject ${name}`, async () => { await denied((await rawLifecycle(options)).commit()); });

const bankOpeningInput = (overrides: Partial<SparkBankOpeningInput> = {}): SparkBankOpeningInput => ({
  groupId: 'proof', actorId: uid, clientActionId: 'opening_123456', accountId: 'new-bank', openingBalanceInCents: 25000,
  catalog: accountCatalog(false), ...overrides,
});
async function rawBankOpening(options: { omit?: 'catalog' | 'checkpoint' | 'position' | 'operation' | 'quota'; operation?: Record<string, unknown>; position?: Record<string, unknown>; checkpoint?: Record<string, unknown>; catalog?: Record<string, unknown> } = {}) {
  await seedGroup({ members: { [uid]: 'admin' } });
  const input = bankOpeningInput(), batch = rawOpening({ omit: ['position', 'operation', 'quota'].includes(options.omit!) ? options.omit as 'position' | 'operation' | 'quota' : undefined,
    operation: { kind: 'bank_opening', openingBalanceInCents: input.openingBalanceInCents, overdraftReason: null, ...input.catalog, ...options.operation },
    position: { balanceInCents: input.openingBalanceInCents, ...options.position } });
  if (options.omit !== 'catalog') batch.set(catalogRef(owner, input.accountId), { schemaVersion: 1, actorId: uid, accountKind: 'bank', ...input.catalog,
    revision: 0, lastOperationId: input.clientActionId, updatedAt: serverTimestamp(), ...options.catalog });
  if (options.omit !== 'checkpoint') batch.set(checkpointRef(), { operationId: input.clientActionId, countedBalanceInCents: input.openingBalanceInCents,
    effectiveAt: serverTimestamp(), includesBoundary: false, ...options.checkpoint });
  return batch;
  function checkpointRef() { return doc(owner, 'financialGroups/proof/sparkCheckpoints', input.accountId); }
}
test('Spark bank opening declares an initial bank balance with catalog, checkpoint, receipt and quota atomically', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = bankOpeningInput(); await openSparkBankFirebase(owner, input);
  assert.equal((await balance(input.accountId)).balanceInCents, 25000);
  assert.equal((await getDoc(catalogRef(owner, input.accountId))).data()!.name, 'Banco');
  assert.equal((await openSparkBankFirebase(secondSession, input)).idempotent, true);
  await postSparkMovementFirebase(owner, ordinaryCommand({ accountId: input.accountId }));
  assert.equal((await balance(input.accountId)).balanceInCents, 25000);
  const proof = await prepareSparkHistoryProofFirebase(owner, { groupId: 'proof', actorId: uid, accountId: input.accountId, clientActionId: 'bank_opening_proof_123456', purpose: 'instant', asOf: Timestamp.now() });
  assert.equal(proof.balanceInCents, 25000);
  await financialRejection(openSparkBankFirebase(owner, { ...input, openingBalanceInCents: 26000 }), /outros argumentos/);
  await financialRejection(openSparkBankFirebase(owner, { ...input, clientActionId: 'another_opening_123456' }), /já possui/);
});
for (const openingBalanceInCents of [0, -500, 1000000000000]) test(`Spark bank opening supports the declared amount ${openingBalanceInCents} without treating it as ordinary income`, async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = bankOpeningInput({ openingBalanceInCents, overdraftReason: openingBalanceInCents < 0 ? 'Limite utilizado' : null });
  await openSparkBankFirebase(owner, input); assert.equal((await balance(input.accountId)).balanceInCents, openingBalanceInCents);
  const proof = await prepareSparkHistoryProofFirebase(owner, { groupId: 'proof', actorId: uid, accountId: input.accountId, clientActionId: 'bank_initial_proof_123456', purpose: 'instant', asOf: Timestamp.now() });
  assert.equal(proof.balanceInCents, openingBalanceInCents);
});
test('Spark bank opening has a zero historical value before its declared initial reference and preserves later movements', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const input = bankOpeningInput(); await openSparkBankFirebase(owner, input);
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  const before = await prepareSparkHistoryProofFirebase(owner, { groupId: 'proof', actorId: uid, accountId: input.accountId, clientActionId: 'before_bank_opening_123456', purpose: 'instant', asOf: Timestamp.fromMillis(receipt.createdAt.toMillis() - 1) });
  assert.equal(before.balanceInCents, 0);
  await postSparkMovementFirebase(owner, ordinaryCommand({ accountId: input.accountId, effectiveAt: Timestamp.now() }));
  assert.equal((await balance(input.accountId)).balanceInCents, 26000);
});
test('Spark bank opening concurrent distinct identities cannot initialize the same bank twice', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  const input = bankOpeningInput(); const results = await Promise.allSettled([openSparkBankFirebase(owner, input), openSparkBankFirebase(secondSession, { ...input, clientActionId: 'racing_opening_123456' })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal((await balance(input.accountId)).balanceInCents, 25000);
});
test('Spark bank opening requires administrator and valid integer cents, reason and bank identity', async () => {
  await financialRejection(openSparkBankFirebase(owner, bankOpeningInput()), /administrador/);
  await seedGroup({ members: { [uid]: 'admin' } });
  for (const fields of [{ openingBalanceInCents: 0.5 }, { openingBalanceInCents: 1000000000001 }, { openingBalanceInCents: -1 }, { accountId: 'cash' }]) await financialRejection(openSparkBankFirebase(owner, bankOpeningInput(fields)));
  await financialRejection(openSparkBankFirebase(expired, bankOpeningInput())); await financialRejection(openSparkBankFirebase(outsider, bankOpeningInput()));
});
test('Spark bank opening raw positive control', async () => { await (await rawBankOpening()).commit(); assert.equal((await balance('new-bank')).balanceInCents, 25000); });
for (const omit of ['position', 'operation', 'quota', 'catalog', 'checkpoint'] as const) test(`Spark bank opening rejects missing ${omit}`, async () => { await denied((await rawBankOpening({ omit })).commit()); });
for (const [name, fields] of [
  ['position balance mismatch', { position: { balanceInCents: 1 } }], ['checkpoint balance mismatch', { checkpoint: { countedBalanceInCents: 1 } }],
  ['checkpoint boundary mismatch', { checkpoint: { includesBoundary: true } }], ['catalog mismatch', { catalog: { name: 'Outra' } }],
  ['investment impersonation', { operation: { accountKind: 'investment' }, position: { kind: 'investment' } }],
  ['unjustified overdraft', { operation: { openingBalanceInCents: -1 }, position: { balanceInCents: -1 }, checkpoint: { countedBalanceInCents: -1 } }],
  ['unknown receipt authority', { operation: { role: 'admin' } }], ['inactive initial position', { position: { active: false } }],
] as const) test(`Spark bank opening Rules reject ${name}`, async () => { await denied((await rawBankOpening(fields)).commit()); });

test('Spark shared changes establish a local baseline and return only later recurring changes from other actors', async () => {
  await enableSparkProfile(); const baseline = await readSparkSharedChangesFirebase(owner, uid, 'proof', null);
  assert.equal(baseline.changedCount, 0); assert.ok(baseline.cursor);
  await createSparkRecurringPlanFirebase(owner, recurringPlan());
  const otherUid = getAuth(outsider.app).currentUser!.uid;
  await seedGroup({ members: { [uid]: 'member', [otherUid]: 'member' } });
  await environment.withSecurityRulesDisabled(async context => seedSetDoc(seedDoc(context.firestore(), 'users', otherUid), { financialGroupId: 'proof' }));
  await createSparkRecurringPlanFirebase(outsider, { ...recurringPlan(), actorId: otherUid, planId: 'other-plan', clientActionId: 'other_plan_123456' });
  const page = await readSparkSharedChangesFirebase(owner, uid, 'proof', baseline.cursor);
  assert.equal(page.changedCount, 1); assert.equal(page.hasMore, false);
  assert.equal((await readSparkSharedChangesFirebase(owner, uid, 'proof', page.cursor)).changedCount, 0);
  await seedGroup({ members: { [otherUid]: 'member' } });
  await financialRejection(readSparkSharedChangesFirebase(owner, uid, 'proof', page.cursor));
});
test('Spark shared changes paginate equal timestamps by immutable receipt identity without losing the boundary', async () => {
  await enableSparkProfile(); const at = new Date('2026-09-05T15:00Z');
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore(), batch = seedWriteBatch(firestore);
    for (let index = 0; index < 105; index += 1) batch.set(seedDoc(firestore, 'financialGroups/proof/sparkOperations', `notice_${String(index).padStart(8, '0')}`),
      { kind: 'recurring_plan_update', actorId: 'other', createdAt: at });
    await batch.commit();
  });
  const initial = { seconds: Math.floor(at.getTime() / 1000) - 1, nanoseconds: 0, id: 'initial_00000000' };
  const first = await readSparkSharedChangesFirebase(owner, uid, 'proof', initial);
  const second = await readSparkSharedChangesFirebase(owner, uid, 'proof', first.cursor);
  assert.equal(first.changedCount, 100); assert.equal(first.hasMore, true); assert.equal(second.changedCount, 5); assert.equal(second.hasMore, false);
});
test('Spark shared changes reject wrong group, expired sessions and malformed local cursors', async () => {
  await enableSparkProfile(); await financialRejection(readSparkSharedChangesFirebase(owner, uid, 'other', null));
  await financialRejection(readSparkSharedChangesFirebase(expired, uid, 'proof', null));
  await financialRejection(readSparkSharedChangesFirebase(owner, uid, 'proof', { seconds: NaN, nanoseconds: 0, id: 'bad/id' }), /inválido/);
});
test('Spark bank opening rejects extra dates and normalizes negative zero before persistence', async () => {
  await seedGroup({ members: { [uid]: 'admin' } });
  for (const field of ['date', 'effectiveAt', 'observedAt']) await financialRejection(openSparkBankFirebase(owner, { ...bankOpeningInput(), [field]: Timestamp.now() }), /datas extras/);
  await openSparkBankFirebase(owner, bankOpeningInput({ openingBalanceInCents: -0 }));
  assert.equal(Object.is((await balance('new-bank')).balanceInCents, -0), false);
});
test('Spark account reads distinguish principal, observed reference and current position after a contribution', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); const opening = fundedOpening(); await openFundedSparkInvestmentFirebase(owner, opening);
  await transferSparkFundsFirebase(owner, command({ toAccountId: opening.accountId, kind: 'investment_deposit', amountInCents: 100 }));
  const read = await readSparkAccountFirebase(owner, uid, 'proof', opening.accountId);
  assert.equal(read.positionStatus, 'current'); assert.equal(read.principal!.initialValueInCents, opening.principalInCents);
  assert.equal(read.reference!.countedBalanceInCents, opening.observedValueInCents); assert.equal(read.position.balanceInCents, opening.observedValueInCents + 100);
  assert.equal(read.catalog!.name, opening.catalog.name); assert.equal(read.catalogRevision, 0);
});
test('Spark account reads preserve archived accounts as retained balances without promising current value after a monthly deadline', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await enableSparkProfile();
  await setSparkAccountLifecycleFirebase(owner, lifecycleInput()); await seedPosition('bank', { nextActivationAt: past() });
  const list = await readSparkAccountsFirebase(owner, uid, 'proof'), bank = list.find(account => account.accountId === 'bank')!;
  assert.equal(bank.position.balanceInCents, 10000); assert.equal(bank.positionStatus, 'retained'); assert.equal(bank.lifecycle.archived, true);
  assert.equal(list.length, Object.keys(fixtures).length);
  await financialRejection(readCurrentSparkPositionFirebase(owner, { groupId: 'proof', actorId: uid, accountId: 'bank' }), /inativa/);
});
test('Spark account reads keep unknown catalog absent and reject stale active positions through the server guard', async () => {
  const empty = await readSparkAccountFirebase(owner, uid, 'proof', 'bank'); assert.equal(empty.catalog, null); assert.equal(empty.principal, null);
  await seedPosition('bank', { nextActivationAt: past() });
  const realNow = Date.now; Date.now = () => new Date('2026-09-01Z').valueOf();
  try { await denied(readSparkAccountFirebase(owner, uid, 'proof', 'bank')); } finally { Date.now = realNow; }
  await financialRejection(readSparkAccountFirebase(outsider, uid, 'proof', 'bank'));
});
test('Spark account reads paginate beyond two hundred positions without truncating the catalog', async () => {
  await enableSparkProfile();
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore(), batch = seedWriteBatch(firestore);
    for (let index = 0; index < 201; index += 1) batch.set(seedDoc(firestore, 'financialGroups/proof/sparkPositions', `read-bank-${String(index).padStart(3, '0')}`),
      { schemaVersion: 1, kind: 'bank', active: true, balanceInCents: index, revision: 0, lastOperationId: 'bootstrap_read_123456', nextActivationAt: null, updatedAt: new Date() });
    await batch.commit();
  });
  const rows = await readSparkAccountsFirebase(owner, uid, 'proof'); assert.equal(rows.length, Object.keys(fixtures).length + 201);
  assert.equal(new Set(rows.map(row => row.accountId)).size, rows.length); assert.equal(rows.find(row => row.accountId === 'read-bank-200')!.position.balanceInCents, 200);
});
test('Spark financial reads keep correction components, pairs and archived account history in a shared statement', async () => {
  await seedGroup({ members: { [uid]: 'admin' } }); await enableSparkProfile();
  await postSparkMovementFirebase(owner, ordinaryCommand());
  await correctSparkMovementFirebase(owner, { ...resolution(), accountId: 'cash', amountInCents: 1500 });
  await transferSparkDatedFundsFirebase(owner, { ...command({ clientActionId: 'read_pair_123456', amountInCents: 300 }), effectiveAt: past('2026-09-12T12:00Z') });
  await setSparkAccountLifecycleFirebase(owner, lifecycleInput({ expectedPositionRevision: 3 }));
  const events = await readSparkFinancialEventsFirebase(owner, uid, 'proof');
  assert.equal(events.filter(event => event.economicKind === 'income').reduce((sum, event) => sum + event.deltaInCents, 0), 1500);
  const statement = await readSparkStatementFirebase(owner, uid, 'proof', 'bank', new Date(2026, 8, 1), new Date(2026, 8, 30));
  assert.equal(statement.isSparkSource, true); assert.equal(statement.expenses.length, 2); assert.equal(statement.gains.length, 1);
  assert.equal(statement.expenses.some(item => item.isCashRescue && item.valueInCents === 300), true);
  const cash = await readSparkStatementFirebase(owner, uid, 'proof', 'cash', new Date(2026, 8, 1), new Date(2026, 8, 30));
  assert.equal(cash.gains.reduce((sum, item) => sum + item.valueInCents, 0), 1800);
  await seedGroup({ members: {} }); await financialRejection(readSparkFinancialEventsFirebase(owner, uid, 'proof'));
});

const movementDetails = () => ({ name: 'Salário', explanation: 'Crédito confirmado', paymentFormats: ['Pix', 'Dinheiro'], moneyFormat: false });
test('Spark recurring Home reader uses real metadata/cycles and keeps contractual remainder without inferring elapsed payments', async () => {
  await enableSparkProfile();
  await createSparkRecurringPlanFirebase(owner, recurringPlan({ startCycle: '2026-07', valueInCents: 333, installmentTotal: 3, contractTotalInCents: 1000 }));
  await saveSparkRecurringMetadataFirebase(owner, metadataInput());
  await settleSparkRecurringFirebase(owner, recurringSettlement({ installmentsCount: 2 }));
  const rows = await readSparkRecurringPlansFirebase(owner, uid, 'proof', new Date('2026-07-20T12:00:00-03:00'));
  assert.equal(rows.length, 1); assert.deepEqual(rows[0].completedCycles, ['2026-07']); assert.equal(rows[0].installmentsCompleted, 2);
  const next = buildSparkUpcomingMandatoryItems(rows, new Date('2026-07-20T12:00:00-03:00'))[0];
  assert.equal(next.valueInCents, 334); assert.equal(next.installmentLabel, 'Parcela 3 de 3');
  await seedGroup({ members: {} }); await denied(readSparkRecurringPlansFirebase(owner, uid, 'proof', new Date()));
});
test('Spark recurring Home reader paginates 201 plans and configurations through authenticated group Rules', async () => {
  await enableSparkProfile();
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore(), batch = seedWriteBatch(firestore);
    for (let index = 0; index < 201; index += 1) {
      const id = `read-plan-${String(index).padStart(3, '0')}`;
      batch.set(seedDoc(firestore, 'financialGroups/proof/sparkRecurringPlans', id), { schemaVersion: 1, actorId: uid, recurringType: 'expense', name: id,
        categoryId: null, startCycle: '2026-07', endCycle: null, historyFromCycle: '2026-07', valueInCents: 1000, installmentTotal: null, contractTotalInCents: null,
        active: true, revision: 0, installmentsCompleted: 0, lastOperationId: 'seed_read_123456', createdAt: new Date(), updatedAt: new Date() });
      batch.set(seedDoc(firestore, 'financialGroups/proof/sparkRecurringMetadata', id), { schemaVersion: 1, actorId: uid, ...recurringMetadata(),
        revision: 0, lastOperationId: 'seed_metadata_123456', updatedAt: new Date() });
    }
    await batch.commit();
  });
  const rows = await readSparkRecurringPlansFirebase(owner, uid, 'proof', new Date('2026-07-20T12:00:00-03:00'));
  assert.equal(rows.length, 201); assert.equal(rows.at(-1)!.id, 'read-plan-200'); assert.equal(rows.at(-1)!.metadata!.dueDay, 10);
  await financialRejection(readSparkRecurringPlansFirebase(outsider, uid, 'proof', new Date()));
});

test('Spark recurring Home reader refuses an incomplete active flag instead of hiding an unpaid commitment', async () => {
  await enableSparkProfile(); await createSparkRecurringPlanFirebase(owner, recurringPlan());
  await environment.withSecurityRulesDisabled(async context => seedSetDoc(seedDoc(context.firestore(), 'financialGroups/proof/sparkRecurringPlans/rent/cycles/2026-07'), { schemaVersion: 1, active: true }));
  await financialRejection(readSparkRecurringPlansFirebase(owner, uid, 'proof', new Date('2026-07-20T12:00:00-03:00')), /Estado do ciclo/);
});

test('Spark movement details persist atomically and replay nested material exactly across sessions', async () => {
  const input = ordinaryCommand({ details: movementDetails() });
  await postSparkMovementFirebase(owner, input);
  assert.equal((await postSparkMovementFirebase(secondSession, { ...input, details: { ...input.details! } })).idempotent, true);
  const ref = doc(owner, 'financialGroups/proof/sparkMovementDetails', input.clientActionId), stored = (await getDoc(ref)).data()!;
  assert.equal(stored.name, input.details!.name); assert.deepEqual(stored.paymentFormats, input.details!.paymentFormats);
  await financialRejection(postSparkMovementFirebase(owner, { ...input, details: { ...input.details!, name: 'Outro' } }), /outros argumentos/);
  await financialRejection(postSparkMovementFirebase(owner, { ...input, details: { ...input.details!, paymentFormats: ['Dinheiro', 'Pix'] } }), /outros argumentos/);
  await denied(deleteDoc(ref)); const batch = writeBatch(owner); batch.update(ref, { name: 'Reescrito' }); await denied(batch.commit());
});
test('Spark movement details correction across accounts and a first native category use fits Rules and keeps both names', async () => {
  await enableSparkProfile(); const original = ordinaryCommand({ details: movementDetails() }); await postSparkMovementFirebase(owner, original);
  const category = categoryInput(); await saveSparkCategoryFirebase(owner, category);
  const details = { ...movementDetails(), name: 'Salário corrigido', paymentFormats: Array.from({ length: 8 }, (_, index) => `Forma ${index}`) };
  const correction = { ...resolution(), accountId: 'cash', amountInCents: 1500, categoryId: category.categoryId, details };
  await correctSparkMovementFirebase(owner, correction);
  assert.equal((await correctSparkMovementFirebase(secondSession, { ...correction, details: { ...details } })).idempotent, true);
  const events = await readSparkFinancialEventsFirebase(owner, uid, 'proof'), components = events.filter(event => event.operationId === correction.clientActionId);
  assert.equal(components.find(event => event.component === 'inverse')!.details!.name, original.details!.name);
  assert.equal(components.find(event => event.component === 'replacement')!.details!.name, details.name);
});
test('Spark movement details cannot be orphaned or attached to a receipt that did not request them', async () => {
  const input = ordinaryCommand();
  const metadata = () => ({ schemaVersion: 1, actorId: uid, operationId: input.clientActionId, ...movementDetails(), createdAt: serverTimestamp() });
  const ref = doc(owner, 'financialGroups/proof/sparkMovementDetails', input.clientActionId);
  let batch = writeBatch(owner); batch.set(ref, metadata()); await denied(batch.commit());
  await denied(rawOrdinary({ hasDetails: true, details: movementDetails() }));
  await postSparkMovementFirebase(owner, input); batch = writeBatch(owner); batch.set(ref, metadata()); await denied(batch.commit());
});
for (const [label, value] of [
  ['empty name', { name: '' }], ['oversized name', { name: 'x'.repeat(161) }], ['oversized explanation', { explanation: 'x'.repeat(2001) }],
  ['unknown field', { authority: true }], ['untyped format', { paymentFormats: [1] }], ['too many formats', { paymentFormats: Array.from({ length: 9 }, () => 'Pix') }],
  ['empty format', { paymentFormats: [''] }], ['untyped cash flag', { moneyFormat: 'yes' }],
] as const) test(`Spark movement details service rejects ${label}`, async () => {
  await financialRejection(postSparkMovementFirebase(owner, ordinaryCommand({ details: { ...movementDetails(), ...value } as any })), /inválidos/);
});
async function rawDetailedMovement(options: { omit?: 'details' | 'operation' | 'position' | 'quota'; fields?: Record<string, unknown>; document?: Record<string, unknown>; operation?: Record<string, unknown> } = {}) {
  const input = ordinaryCommand(), details = { ...movementDetails(), ...options.fields }, before = (await getDoc(positionRef(owner))).data()!;
  const quota = (await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data(), start = Math.floor(Date.now() / 60000) * 60000, batch = writeBatch(owner);
  if (options.omit !== 'details') batch.set(doc(owner, 'financialGroups/proof/sparkMovementDetails', input.clientActionId), {
    schemaVersion: 1, actorId: uid, operationId: input.clientActionId, ...details, createdAt: serverTimestamp(), ...options.document });
  if (options.omit !== 'operation') batch.set(operationRef(owner, input.clientActionId), { schemaVersion: 1, actorId: uid, kind: input.kind,
    accountId: input.accountId, amountInCents: input.amountInCents, categoryId: null, note: null, overdraftReason: null,
    differenceInCents: input.amountInCents, currentEffectInCents: input.amountInCents, effectiveAt: input.effectiveAt,
    expectedRevision: before.revision, previousOperationId: before.lastOperationId, hasDetails: true, details, createdAt: serverTimestamp(), ...options.operation });
  if (options.omit !== 'position') batch.update(positionRef(owner), { balanceInCents: before.balanceInCents + input.amountInCents,
    revision: before.revision + 1, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
  if (options.omit !== 'quota') batch.set(doc(owner, 'sparkTransferQuotas', uid), { groupId: 'proof', windowStartInMillis: start,
    count: quota?.windowStartInMillis === start ? quota.count + 1 : 1, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
  return batch;
}
test('Spark movement details raw positive control validates presentation independently from financial effects', async () => {
  await (await rawDetailedMovement()).commit(); assert.equal((await balance('bank')).balanceInCents, 11000);
});

test('Spark movement details Unicode limits agree between service, Rules, stored receipt and reader', async () => {
  await enableSparkProfile();
  // O Emulator mede unidades UTF-16: os limites precisam coincidir com os do formulário e leitor.
  const details = { name: '🪙'.repeat(80), explanation: '💬'.repeat(1000), paymentFormats: ['💰'.repeat(60)], moneyFormat: false };
  const input = ordinaryCommand({ details }); await postSparkMovementFirebase(owner, input);
  assert.equal((await postSparkMovementFirebase(secondSession, { ...input, details: { ...details } })).idempotent, true);
  const event = (await readSparkFinancialEventsFirebase(owner, uid, 'proof')).find(event => event.operationId === input.clientActionId)!;
  assert.deepEqual(event.details, details);
  await financialRejection(postSparkMovementFirebase(owner, ordinaryCommand({ clientActionId: 'unicode_overflow_123456', details: { ...details, name: details.name + '🪙' } })), /inválidos/);
});
for (const [label, fields] of [
  ['name', { name: '🪙'.repeat(81) }], ['explanation', { explanation: '💬'.repeat(1001) }], ['format', { paymentFormats: ['💰'.repeat(61)] }],
] as const) test(`Spark movement details Unicode Rules reject overflow in ${label}`, async () => {
  await denied((await rawDetailedMovement({ fields })).commit());
});
for (const omit of ['details', 'operation', 'position', 'quota'] as const) test(`Spark movement details raw reject missing ${omit}`, async () => { await denied((await rawDetailedMovement({ omit })).commit()); });
for (const [label, options] of [
  ['empty name', { fields: { name: '' } }], ['blank name', { fields: { name: '   ' } }], ['long name', { fields: { name: 'x'.repeat(161) } }],
  ['long explanation', { fields: { explanation: 'x'.repeat(2001) } }], ['numeric format', { fields: { paymentFormats: [1] } }],
  ['long format', { fields: { paymentFormats: ['x'.repeat(121)] } }], ['blank format', { fields: { paymentFormats: ['   '] } }],
  ['ninth format', { fields: { paymentFormats: Array.from({ length: 9 }, () => 'Pix') } }], ['untyped cash', { fields: { moneyFormat: 'yes' } }],
  ['unknown field', { document: { admin: true } }], ['foreign actor', { document: { actorId: 'other' } }],
  ['different name in receipt', { operation: { details: { ...movementDetails(), name: 'Outro' } } }],
  ['extra nested receipt field', { operation: { details: { ...movementDetails(), authority: true } } }],
  ['false details flag', { operation: { hasDetails: false } }],
] as const) test(`Spark movement details Rules reject ${label}`, async () => { await denied((await rawDetailedMovement(options)).commit()); });

function sharedMovementCommand(overrides: Record<string, unknown> = {}): SparkMovementCommand {
  return { groupId: 'proof', actorId: uid, clientActionId: 'shared_movement_123456', action: 'create', movementKind: 'income',
    accountId: 'bank', amountInCents: 1000, categoryId: null, effectiveAt: Timestamp.fromDate(new Date('2026-09-10T12:00Z')),
    details: movementDetails(), assistantRequestFingerprint: 'confirmed-proposal', ...overrides } as SparkMovementCommand;
}

function movementFormDraft(kind: 'income' | 'expense' = 'expense') {
  return { actorId: uid, movementKind: kind, name: 'Lançamento do formulário', amountInCents: 1200, selectedDate: new Date(2026, 8, 10),
    bankId: 'bank' as string | null, moneyFormat: false, categoryId: null, explanation: 'Descrição mantida', paymentFormats: ['Pix'], isEditing: false, specialSource: false };
}
for (const kind of ['income', 'expense'] as const) test(`Spark form ${kind} writes one operation visible in current list and journal without Functions`, async () => {
  await enableSparkProfile(); const state: SparkMovementFormState = {}, fields = movementFormDraft(kind);
  await submitSparkMovementFormFirebase(owner, state, fields, () => `form_${kind}_123456`, new Date('2026-10-19T15:42:31.457Z'));
  await submitSparkMovementFormFirebase(owner, state, fields, () => 'unused_new_id_123456');
  assert.equal((await balance('bank')).balanceInCents, kind === 'income' ? 11200 : 8800);
  assert.equal((await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!.count, 1);
  const list = await readSparkMovementListFirebase(owner, uid, 'proof', kind);
  assert.equal(list.length, 1); assert.equal(list[0].valueInCents, 1200); assert.equal(list[0].name, fields.name);
  assert.deepEqual(list[0].sparkExecutionReference, { source: 'live', operationId: state.intent!.command.clientActionId, family: 'ordinary' });
  const journal = await readSparkStatementFirebase(owner, uid, 'proof', 'bank', new Date(2026, 8, 1), new Date(2026, 8, 30));
  assert.equal((kind === 'income' ? journal.gains : journal.expenses).filter(row => row.isSparkMovement && row.name === fields.name).length, 1);
});

test('Spark form editor preserves original Timestamp, changes accounts and rebases a second intentional edit onto the replacement', async () => {
  await enableSparkProfile(); const createState: SparkMovementFormState = {}, fields = movementFormDraft();
  await submitSparkMovementFormFirebase(owner, createState, fields, () => 'form_original_123456', new Date('2026-10-19T15:42:31.457Z'));
  const reference = { source: 'live' as const, operationId: 'form_original_123456', family: 'ordinary' as const };
  const target = await readSparkOrdinaryForEditFirebase(owner, uid, 'proof', reference);
  assert.equal(sparkEditableMovementRecord(target).date.getDate(), 10);
  const state: SparkMovementFormState = { target, entryReference: reference };
  const edit = { ...fields, isEditing: true, editingReference: reference, bankId: null, moneyFormat: true, amountInCents: 1500 };
  await submitSparkMovementFormFirebase(owner, state, edit, () => 'form_edit_123456');
  assert.equal(state.intent!.command.effectiveAt.isEqual(target.effectiveAt), true);
  await submitSparkMovementFormFirebase(owner, state, edit, () => 'unused_id_123456');
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('cash')).balanceInCents, 8500);
  await financialRejection(readSparkOrdinaryForEditFirebase(owner, uid, 'proof', reference), /já foi estornado ou substituído/);
  await submitSparkMovementFormFirebase(owner, state, { ...edit, amountInCents: 500, name: 'Segunda edição' }, () => 'form_second_edit_123456');
  assert.equal((await balance('cash')).balanceInCents, 9500);
  const list = await readSparkMovementListFirebase(owner, uid, 'proof', 'expense');
  assert.equal(list.length, 1); assert.equal(list[0].valueInCents, 500); assert.equal(list[0].moneyFormat, true);
  assert.equal(list[0].sparkExecutionReference!.operationId, 'form_second_edit_123456');
});

test('Spark form reversal confirmation preserves one intent across sessions and retains the journal', async () => {
  await enableSparkProfile(); const state: SparkMovementFormState = {};
  await submitSparkMovementFormFirebase(owner, state, movementFormDraft(), () => 'form_to_reverse_123456');
  const command = await prepareSparkMovementReversalFirebase(owner, uid, { source: 'live', operationId: 'form_to_reverse_123456', family: 'ordinary' }, 'form_reversal_123456');
  await executeSparkMovementCommandFirebase(owner, command);
  assert.equal((await executeSparkMovementCommandFirebase(secondSession, command)).idempotent, true);
  assert.equal((await balance('bank')).balanceInCents, 10000);
  assert.equal((await readSparkMovementListFirebase(owner, uid, 'proof', 'expense')).length, 0);
  const journal = await readSparkFinancialEventsFirebase(owner, uid, 'proof');
  assert.ok(journal.some(event => event.operationId === 'form_to_reverse_123456'));
  assert.ok(journal.some(event => event.operationId === 'form_reversal_123456' && event.deltaInCents === 1200));
});

test('Spark form uncertain result recovers the preserved committed command rather than a new id or date', async () => {
  await enableSparkProfile(); const state: SparkMovementFormState = {}, fields = movementFormDraft();
  await submitSparkMovementFormFirebase(owner, state, fields, () => 'form_lost_response_123456', new Date('2026-10-19T15:42Z'));
  // Representar uma resposta perdida após commit: a intenção original permanece disponível, sem novo envio de argumentos.
  state.intent!.status = 'uncertain';
  await financialRejection(submitSparkMovementFormFirebase(secondSession, state, { ...fields, amountInCents: 999 }, () => 'must_not_write_123456'), /mesmos dados/);
  await submitSparkMovementFormFirebase(secondSession, state, fields, () => 'must_not_write_123456', new Date('2026-10-20T15:42Z'));
  assert.equal(state.intent!.command.clientActionId, 'form_lost_response_123456');
  assert.equal((await balance('bank')).balanceInCents, 8800);
  assert.equal((await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!.count, 1);
});

test('Spark form special source or revoked context never creates a partial ordinary movement', async () => {
  await enableSparkProfile(); const state: SparkMovementFormState = {};
  await financialRejection(submitSparkMovementFormFirebase(owner, state, { ...movementFormDraft(), specialSource: true }, () => 'special_partial_123456'), /Nenhum valor/);
  assert.equal((await balance('bank')).balanceInCents, 10000);
  assert.equal((await getDoc(operationRef(owner, 'special_partial_123456'))).exists(), false);
  await seedGroup({ members: {} }); await financialRejection(submitSparkMovementFormFirebase(owner, state, movementFormDraft(), () => 'revoked_form_123456'));
});

test('Spark form reader refuses presentation ids and keeps imported namespace separate', async () => {
  await enableSparkProfile(); await postSparkMovementFirebase(owner, ordinaryCommand({ details: movementDetails() }));
  await financialRejection(readSparkOrdinaryForEditFirebase(owner, uid, 'proof', { source: 'live', operationId: 'ordinary_123456:movement', family: 'ordinary' }), /fluxo específico/);
  await financialRejection(readSparkOrdinaryForEditFirebase(owner, uid, 'proof', { source: 'imported', operationId: 'ordinary_123456', family: 'ordinary' }), /fluxo específico/);
  await environment.withSecurityRulesDisabled(async context => seedSetDoc(seedDoc(context.firestore(), 'financialGroups/proof/sparkImportedIdentities/imported_form_123456'), {
    schemaVersion: 1, actorId: uid, kind: 'income', accountId: 'bank', amountInCents: 100, ordinaryResolutionAllowed: true,
    readModel: { effectiveAt: new Date('2026-09-10T12:00Z'), categoryId: null, note: 'Origem importada' } }));
  const imported = await readSparkOrdinaryForEditFirebase(owner, uid, 'proof', { source: 'imported', operationId: 'imported_form_123456', family: 'ordinary' });
  assert.equal(imported.reference.source, 'imported'); assert.equal(imported.effectiveAt.toDate().toISOString(), '2026-09-10T12:00:00.000Z');
});

test('Spark movement list includes only current recurring settlements and never grants them ordinary edit references', async () => {
  await enableSparkProfile(); await createSparkRecurringPlanFirebase(owner, recurringPlan());
  await settleSparkRecurringFirebase(owner, recurringSettlement());
  let list = await readSparkMovementListFirebase(owner, uid, 'proof', 'expense');
  assert.equal(list.length, 1); assert.equal(list[0].isFromMandatory, true); assert.equal(list[0].sparkExecutionReference, null);
  await financialRejection(readSparkOrdinaryForEditFirebase(owner, uid, 'proof', { source: 'live', operationId: recurringSettlement().clientActionId, family: 'ordinary' }), /fluxo específico/);
  await undoSparkRecurringFirebase(owner, recurringUndo());
  list = await readSparkMovementListFirebase(owner, uid, 'proof', 'expense'); assert.equal(list.length, 0);
});

test('Spark bank selection uses canonical active accounts and includes archived accounts only on explicit request', async () => {
  await enableSparkProfile(); await seedGroup({ members: { [uid]: 'admin' } });
  for (const accountId of ['bank', 'third']) await saveSparkAccountCatalogFirebase(owner, accountCatalogInput({ accountId, accountKind: 'bank',
    clientActionId: `selection_catalog_${accountId}_123456`, catalog: { ...accountCatalog(false), name: accountId === 'bank' ? 'Banco ativo' : 'Banco arquivado' } }));
  await setSparkAccountLifecycleFirebase(owner, { groupId: 'proof', actorId: uid, clientActionId: 'selection_archive_123456', accountId: 'third',
    expectedPositionRevision: 0, expectedLifecycleRevision: null, isActive: true, archived: true });
  const active = await readSparkBankSelectionFirebase(owner, uid, 'proof');
  assert.deepEqual(active.map(account => account.id), ['bank']); assert.equal(Object.hasOwn(active[0], 'personId'), false);
  assert.equal(active[0].financialSource, 'spark');
  const all = await readSparkBankSelectionFirebase(owner, uid, 'proof', true);
  assert.equal(all.length, 2); assert.equal(all.find(account => account.id === 'third')!.archived, true);
  await seedGroup({ members: {} }); await financialRejection(readSparkBankSelectionFirebase(owner, uid, 'proof'));
});

test('Spark bank selection refuses missing catalog instead of inventing account ownership or an empty successful list', async () => {
  await enableSparkProfile(); await financialRejection(readSparkBankSelectionFirebase(owner, uid, 'proof'), /reconciliação/);
});
async function sharedCorrection(overrides: Record<string, unknown> = {}): Promise<SparkMovementCommand> {
  return sharedMovementCommand({ action: 'correct', clientActionId: 'shared_correction_123456', accountId: 'cash', amountInCents: 1500,
    target: { source: 'live', operationId: 'shared_movement_123456', family: 'ordinary' },
    expectedFingerprint: createAssistantRecordFingerprint((await getDoc(operationRef(owner, 'shared_movement_123456'))).data()!), ...overrides });
}

test('Spark movement command commits full confirmation atomically and recovers the same result in a second session', async () => {
  await enableSparkProfile(); const input = sharedMovementCommand();
  assert.equal((await executeSparkMovementCommandFirebase(owner, input)).idempotent, false);
  assert.equal((await executeSparkMovementCommandFirebase(secondSession, input)).idempotent, true);
  const receipt = (await getDoc(operationRef(owner, input.clientActionId))).data()!;
  assert.equal(receipt.assistantRequestFingerprint, 'confirmed-proposal'); assert.equal(receipt.expectedFingerprint, null);
  assert.equal(JSON.parse(receipt.commandMaterial).fields.details.name, movementDetails().name);
  assert.equal((await balance('bank')).balanceInCents, 11000);
  assert.equal((await getDoc(doc(owner, 'sparkTransferQuotas', uid))).data()!.count, 1);
});

for (const [label, changes] of [
  ['proposal', { assistantRequestFingerprint: 'different-proposal' }], ['amount', { amountInCents: 999 }], ['account', { accountId: 'cash' }],
  ['description', { details: { ...movementDetails(), name: 'Outro' } }], ['format order', { details: { ...movementDetails(), paymentFormats: [...movementDetails().paymentFormats].reverse() } }],
  ['note', { note: 'Outra nota' }], ['reason', { overdraftReason: 'Outra confirmação' }],
  ['nanoseconds', { effectiveAt: new Timestamp(1789041600, 1) }],
] as const) test(`Spark movement command replay refuses changed ${label}`, async () => {
  await enableSparkProfile(); const input = sharedMovementCommand(); await executeSparkMovementCommandFirebase(owner, input);
  await financialRejection(executeSparkMovementCommandFirebase(secondSession, { ...input, ...changes } as SparkMovementCommand), /outros argumentos/);
  assert.equal((await balance('bank')).balanceInCents, 11000);
});

test('Spark movement command correction binds the confirmed source and replays after the replacement was itself corrected', async () => {
  await enableSparkProfile(); await executeSparkMovementCommandFirebase(owner, sharedMovementCommand());
  const correction = await sharedCorrection(); await executeSparkMovementCommandFirebase(owner, correction);
  const replacement = (await getDoc(operationRef(owner, correction.clientActionId))).data()!;
  await executeSparkMovementCommandFirebase(owner, { ...correction, clientActionId: 'next_correction_123456', amountInCents: 1200,
    target: { source: 'live', operationId: correction.clientActionId, family: 'ordinary' }, expectedFingerprint: createAssistantRecordFingerprint(replacement) } as SparkMovementCommand);
  assert.equal((await executeSparkMovementCommandFirebase(secondSession, correction)).idempotent, true);
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('cash')).balanceInCents, 11200);
  const events = await readSparkFinancialEventsFirebase(owner, uid, 'proof');
  assert.equal(events.filter(event => event.operationId === correction.clientActionId).length, 2);
});

test('Spark movement command wrong fingerprint or economic kind never claims the source or changes balance', async () => {
  await enableSparkProfile(); await executeSparkMovementCommandFirebase(owner, sharedMovementCommand());
  const correction = await sharedCorrection();
  await financialRejection(executeSparkMovementCommandFirebase(owner, { ...correction, expectedFingerprint: 'stale-record' } as SparkMovementCommand), /confirmação/);
  await financialRejection(executeSparkMovementCommandFirebase(owner, { ...correction, movementKind: 'expense' } as SparkMovementCommand), /confirmação/);
  assert.equal((await getDoc(doc(owner, 'financialGroups/proof/sparkMovementClaims/shared_movement_123456'))).exists(), false);
  assert.equal((await balance('bank')).balanceInCents, 11000); assert.equal((await balance('cash')).balanceInCents, 10000);
});

test('Spark movement command correction with first category use and eight full formats stays within Rules budget', async () => {
  await enableSparkProfile(); await executeSparkMovementCommandFirebase(owner, sharedMovementCommand());
  const category = categoryInput(); await saveSparkCategoryFirebase(owner, category);
  const correction = await sharedCorrection({ categoryId: category.categoryId, details: { name: '🪙'.repeat(80), explanation: '💬'.repeat(1000),
    paymentFormats: Array.from({ length: 8 }, (_, index) => String(index) + 'x'.repeat(119)), moneyFormat: true }, assistantRequestFingerprint: 'x'.repeat(160) });
  await executeSparkMovementCommandFirebase(owner, correction);
  assert.equal((await executeSparkMovementCommandFirebase(secondSession, correction)).idempotent, true);
  assert.equal((await balance('bank')).balanceInCents, 10000); assert.equal((await balance('cash')).balanceInCents, 11500);
  assert.equal((await getDoc(doc(owner, 'sparkCategoryReferences', category.categoryId))).exists(), true);
});

test('Spark movement command reverses exactly once and does not revive a resolved source', async () => {
  await enableSparkProfile(); const input = sharedMovementCommand(); await executeSparkMovementCommandFirebase(owner, input);
  const { groupId, actorId, effectiveAt } = input;
  const reverse: SparkMovementCommand = { groupId, actorId, effectiveAt, movementKind: 'income', clientActionId: 'shared_reverse_123456', action: 'reverse',
    target: { source: 'live', operationId: input.clientActionId, family: 'ordinary' }, expectedFingerprint: createAssistantRecordFingerprint((await getDoc(operationRef(owner, input.clientActionId))).data()!) };
  await executeSparkMovementCommandFirebase(owner, reverse);
  assert.equal((await executeSparkMovementCommandFirebase(secondSession, reverse)).idempotent, true);
  await financialRejection(executeSparkMovementCommandFirebase(owner, { ...reverse, clientActionId: 'another_reverse_123456' }), /já estornado/);
  assert.equal((await balance('bank')).balanceInCents, 10000);
});

test('Spark movement command keeps imported and live identities separate and refuses special imported sources', async () => {
  await enableSparkProfile(); const input = sharedMovementCommand(); await executeSparkMovementCommandFirebase(owner, input);
  await environment.withSecurityRulesDisabled(async context => {
    await seedSetDoc(seedDoc(context.firestore(), 'financialGroups/proof/sparkImportedIdentities', input.clientActionId), {
      schemaVersion: 1, actorId: uid, kind: 'income', accountId: 'third', amountInCents: 100, ordinaryResolutionAllowed: true });
  });
  const importedRef = doc(owner, 'financialGroups/proof/sparkImportedIdentities', input.clientActionId);
  const correction = await sharedCorrection({ target: { source: 'imported', operationId: input.clientActionId, family: 'ordinary' },
    expectedFingerprint: createAssistantRecordFingerprint((await getDoc(importedRef)).data()!) });
  await executeSparkMovementCommandFirebase(owner, correction);
  assert.equal((await getDoc(doc(owner, 'financialGroups/proof/sparkImportedClaims', input.clientActionId))).exists(), true);
  assert.equal((await getDoc(doc(owner, 'financialGroups/proof/sparkMovementClaims', input.clientActionId))).exists(), false);
  assert.equal((await balance('bank')).balanceInCents, 11000); assert.equal((await balance('third')).balanceInCents, 0);
  await environment.withSecurityRulesDisabled(async context => seedUpdateDoc(seedDoc(context.firestore(), importedRef.path), { ordinaryResolutionAllowed: false }));
  await financialRejection(executeSparkMovementCommandFirebase(owner, { ...correction, clientActionId: 'special_refuse_123456' } as SparkMovementCommand), /fluxo específico/);
});

test('Spark movement command rejects mismatched group and revoked membership without Functions', async () => {
  await enableSparkProfile(); await financialRejection(executeSparkMovementCommandFirebase(owner, sharedMovementCommand({ groupId: 'other' })), /grupo/);
  await seedGroup({ members: {} }); await financialRejection(executeSparkMovementCommandFirebase(owner, sharedMovementCommand()));
});

test('Spark movement command raw confirmation positive control fits the closed schema and existing financial guards', async () => {
  await (await rawDetailedMovement({ operation: { expectedFingerprint: null, assistantRequestFingerprint: 'x'.repeat(160), commandMaterial: 'x'.repeat(16000) } })).commit();
  assert.equal((await balance('bank')).balanceInCents, 11000);
});
for (const [label, changes] of [
  ['nontext fingerprint', { expectedFingerprint: 1 }], ['oversized proposal', { assistantRequestFingerprint: 'x'.repeat(161) }],
  ['oversized command', { commandMaterial: 'x'.repeat(16001) }], ['nontext command', { commandMaterial: {} }],
] as const) test(`Spark movement command raw Rules reject ${label} without exhausting expressions`, async () => {
  await denied((await rawDetailedMovement({ operation: changes })).commit());
});
