import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { initializeApp as adminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminDb, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { assertSparkDemoEnvironment, SPARK_DEMO } from '../scripts/lib/sparkDemo';
import { SPARK_TRANSFER_PROOF_PROTOCOL } from '../../functions/sparkFinancialProtocol';
import { submitSparkPairFormFirebase, prepareSparkPairReversalFirebase, executeSparkPairReversalFirebase, type SparkPairFormState, type SparkPairFormDraft } from '../../functions/SparkPairFormFirebase';
import { readSparkAccountFirebase } from '../../functions/SparkAccountReadFirebase';
import { readSparkFinancialEventsFirebase } from '../../functions/SparkFinancialReadFirebase';
import { projectSparkEconomicMovements } from '../../utils/sparkEconomicMovements';
import { readSparkStatementFirebase } from '../../functions/SparkStatementFirebase';
import { postSparkMovementFirebase } from '../../functions/SparkMovementFirebase';
import { toFinancialCivilDate } from '../../utils/financialCivilDate';

assertSparkDemoEnvironment();
const clientRequire = createRequire(resolve(process.cwd(), '..', 'package.json'));
const { initializeApp, deleteApp } = clientRequire('firebase/app') as typeof import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } = clientRequire('firebase/auth') as typeof import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, terminate, Timestamp } = clientRequire('firebase/firestore') as typeof import('firebase/firestore');
const suffix = randomUUID().replaceAll('-', ''), uid = `pair-test-${suffix}`, groupId = `pair-test-${suffix}`;
const admin = adminApp({ projectId: SPARK_DEMO.projectId }, uid), server = adminDb(admin);
const app = initializeApp({ projectId: SPARK_DEMO.projectId, apiKey: 'fake-api-key' }, uid), auth = getAuth(app), firestore = getFirestore(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
let sequence = 0;
const nextId = () => `pair_action_${++sequence}_123456`;
const pair = (fields: Partial<SparkPairFormDraft> = {}): SparkPairFormDraft => ({ actorId: uid, mode: 'transfer', fromAccountId: 'bank-a', toAccountId: 'bank-b', amountInCents: 1000,
  selectedDate: toFinancialCivilDate(new Date()), note: 'Ensaio isolado de par', ...fields });
const balance = async (id: string) => (await readSparkAccountFirebase(firestore, uid, groupId, id)).position.balanceInCents;
let originalId: string;
before(async () => {
  await adminAuth(admin).createUser({ uid, email: `${uid}@demo.lumus.local`, password: SPARK_DEMO.password });
  const group = server.doc(`financialGroups/${groupId}`), batch = server.batch(), now = AdminTimestamp.now();
  batch.create(group, { status: 'active', sparkProtocol: SPARK_TRANSFER_PROOF_PROTOCOL, members: { [uid]: 'admin' }, pairTest: suffix });
  batch.create(server.doc(`users/${uid}`), { financialGroupId: groupId, financialLegacyCutoverAt: now });
  for (const [id, kind, amount] of [['bank-a', 'bank', 50000], ['bank-b', 'bank', 10000], ['cash', 'cash', 10000]] as const) {
    const op = `bootstrap_${id}`;
    batch.create(group.collection('sparkPositions').doc(id), { schemaVersion: 1, kind, active: true, balanceInCents: amount, revision: 0, lastOperationId: op, nextActivationAt: null, updatedAt: now });
    batch.create(group.collection('sparkOperations').doc(op), { schemaVersion: 1, kind: 'account_bootstrap', actorId: uid, accountId: id, openingBalanceInCents: amount, createdAt: AdminTimestamp.fromMillis(0) });
  }
  await batch.commit(); await signInWithEmailAndPassword(auth, `${uid}@demo.lumus.local`, SPARK_DEMO.password);
});
after(async () => {
  await terminate(firestore); await deleteApp(app);
  // Limpeza apenas da fixture criada acima, sem clearFirestore ou conta de demonstração do usuário.
  assertSparkDemoEnvironment(); const group = server.doc(`financialGroups/${groupId}`);
  assert.equal((await group.get()).data()?.pairTest, suffix);
  for (const child of await group.listCollections()) for (const record of (await child.get()).docs) await record.ref.delete();
  await group.delete(); await server.doc(`users/${uid}`).delete(); await server.doc(`sparkTransferQuotas/${uid}`).delete();
  await server.recursiveDelete(server.doc(`sparkOperationRecovery/${uid}`)); await server.doc(`sparkOperationIntentQuotas/${uid}`).delete();
  await adminAuth(admin).deleteUser(uid); await deleteAdminApp(admin);
});

test('bank transfer commits both legs and exact replay has no second effect', async () => {
  const state: SparkPairFormState = {};
  const browserClock = new Date(Date.now() + 1500), draft = pair({ selectedDate: toFinancialCivilDate(browserClock) });
  await submitSparkPairFormFirebase(firestore, state, draft, nextId, browserClock); originalId = state.intent!.command.clientActionId;
  assert.equal('effectiveAt' in state.intent!.command, false);
  state.intent!.status = 'uncertain'; await submitSparkPairFormFirebase(firestore, state, draft, nextId, browserClock);
  assert.equal(await balance('bank-a'), 49000); assert.equal(await balance('bank-b'), 11000);
});
test('uncertain form rejects changed amount or date without partial effects', async () => {
  const state: SparkPairFormState = {}; await submitSparkPairFormFirebase(firestore, state, pair(), nextId);
  state.intent!.status = 'uncertain'; const before = await balance('bank-a');
  await assert.rejects(submitSparkPairFormFirebase(firestore, state, pair({ amountInCents: 3000 }), nextId), /mesmos dados/);
  await assert.rejects(submitSparkPairFormFirebase(firestore, state, pair({ selectedDate: new Date(2020, 0, 1) }), nextId), /mesmos dados/);
  assert.equal(await balance('bank-a'), before);
});
test('withdrawal transfers bank to canonical cash, excluding economic totals', async () => {
  await submitSparkPairFormFirebase(firestore, {}, pair({ mode: 'withdrawal', toAccountId: undefined, amountInCents: 2500 }), nextId);
  assert.equal(await balance('bank-a'), 45500); assert.equal(await balance('cash'), 12500);
  assert.deepEqual(projectSparkEconomicMovements(await readSparkFinancialEventsFirebase(firestore, uid, groupId)), []);
});
test('insufficient balance rejects the whole pair without crediting the destination', async () => {
  await assert.rejects(submitSparkPairFormFirebase(firestore, {}, pair({ amountInCents: 999999 }), nextId));
  assert.equal(await balance('bank-a'), 45500); assert.equal(await balance('bank-b'), 12000);
});
test('live reversal from either statement leg resolves both accounts once', async () => {
  const command = await prepareSparkPairReversalFirebase(firestore, uid, { source: 'live', operationId: originalId, family: 'pair' }, nextId());
  await executeSparkPairReversalFirebase(firestore, command); await executeSparkPairReversalFirebase(firestore, command);
  assert.equal(await balance('bank-a'), 46500); assert.equal(await balance('bank-b'), 11000);
  const today = toFinancialCivilDate(new Date());
  for (const id of ['bank-a', 'bank-b']) {
    const rows = await readSparkStatementFirebase(firestore, uid, groupId, id, today, today);
    const original = [...rows.expenses, ...rows.gains].find(row => row.sparkOperationId === originalId);
    assert.equal(original?.sparkResolvedByOperationId, command.clientActionId);
  }
  await assert.rejects(prepareSparkPairReversalFirebase(firestore, uid, { source: 'live', operationId: originalId, family: 'pair' }, nextId()), /disponível para estorno/);
});
test('withdrawal reversal restores cash and bank; imported or special targets stay refused', async () => {
  const state: SparkPairFormState = {}; await submitSparkPairFormFirebase(firestore, state, pair({ mode: 'withdrawal', toAccountId: undefined }), nextId);
  const command = await prepareSparkPairReversalFirebase(firestore, uid, { source: 'live', operationId: state.intent!.command.clientActionId, family: 'pair' }, nextId());
  await executeSparkPairReversalFirebase(firestore, command);
  assert.equal(await balance('bank-a'), 46500); assert.equal(await balance('cash'), 12500);
  await assert.rejects(prepareSparkPairReversalFirebase(firestore, uid, { source: 'imported', operationId: originalId, family: 'pair' }, nextId()), /disponível para estorno/);
  await assert.rejects(prepareSparkPairReversalFirebase(firestore, uid, { source: 'live', operationId: 'bootstrap_bank-a', family: 'pair' }, nextId()), /disponível para estorno/);
});
test('two concurrent transfers cannot spend the same available bank balance', async () => {
  const left: SparkPairFormState = {}, right: SparkPairFormState = {};
  const results = await Promise.allSettled([submitSparkPairFormFirebase(firestore, left, pair({ amountInCents: 40000 }), nextId),
    submitSparkPairFormFirebase(firestore, right, pair({ amountInCents: 40000 }), nextId)]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(await balance('bank-a'), 6500); assert.equal(await balance('bank-b'), 51000);
  const winner = results[0].status === 'fulfilled' ? left : right;
  await executeSparkPairReversalFirebase(firestore, await prepareSparkPairReversalFirebase(firestore, uid,
    { source: 'live', operationId: winner.intent!.command.clientActionId, family: 'pair' }, nextId()));
  assert.equal(await balance('bank-a'), 46500); assert.equal(await balance('bank-b'), 11000);
});
test('reversal refuses spent cash atomically and succeeds after the cash is replenished', async () => {
  const state: SparkPairFormState = {}; await submitSparkPairFormFirebase(firestore, state, pair({ mode: 'withdrawal', toAccountId: undefined }), nextId);
  const command = await prepareSparkPairReversalFirebase(firestore, uid, { source: 'live', operationId: state.intent!.command.clientActionId, family: 'pair' }, nextId());
  const amount = await balance('cash');
  const movement = { groupId, actorId: uid, accountId: 'cash', amountInCents: amount, effectiveAt: Timestamp.now() };
  await postSparkMovementFirebase(firestore, { ...movement, kind: 'expense', clientActionId: nextId() });
  await assert.rejects(executeSparkPairReversalFirebase(firestore, command), error => {
    assert.equal((error as { sparkIntentCancelled?: boolean }).sparkIntentCancelled, true); return true;
  });
  assert.equal(await balance('cash'), 0); assert.equal(await balance('bank-a'), 45500);
  await postSparkMovementFirebase(firestore, { ...movement, kind: 'income', clientActionId: nextId() });
  const retried = await prepareSparkPairReversalFirebase(firestore, uid, { source: 'live', operationId: state.intent!.command.clientActionId, family: 'pair' }, nextId());
  await executeSparkPairReversalFirebase(firestore, retried);
  assert.equal(await balance('bank-a'), 46500); assert.equal(await balance('cash'), 12500);
});
test('dated pair respects independent bank checkpoint, retaining its historical two legs', async () => {
  await server.doc(`financialGroups/${groupId}/sparkCheckpoints/bank-a`).set({ operationId: 'bootstrap_bank-a', countedBalanceInCents: 46500,
    effectiveAt: AdminTimestamp.fromMillis(Date.now() - 86400000), includesBoundary: false });
  const state: SparkPairFormState = {}, date = toFinancialCivilDate(new Date(Date.now() - 3 * 86400000));
  await submitSparkPairFormFirebase(firestore, state, pair({ selectedDate: date }), nextId);
  assert.equal(await balance('bank-a'), 46500); assert.equal(await balance('bank-b'), 12000);
  const events = (await readSparkFinancialEventsFirebase(firestore, uid, groupId)).filter(row => row.operationId === state.intent!.command.clientActionId);
  assert.deepEqual(events.map(row => row.deltaInCents).sort((a, b) => a - b), [-1000, 1000]);
});
test('revocation blocks confirmed replay and active session is still mandatory', async () => {
  const state: SparkPairFormState = {}; await submitSparkPairFormFirebase(firestore, state, pair(), nextId);
  await server.doc(`financialGroups/${groupId}`).update({ members: {} });
  await assert.rejects(submitSparkPairFormFirebase(firestore, state, pair(), nextId));
  await signOut(auth); await assert.rejects(submitSparkPairFormFirebase(firestore, {}, pair(), nextId), /sessão autenticada mudou/);
});
