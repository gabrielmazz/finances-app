import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { SPARK_DEMO, assertSparkDemoEnvironment } from '../scripts/lib/sparkDemo';
import { getSparkContextFirebase } from '../../functions/SparkContextFirebase';
import { loadSparkBankFormFirebase, submitSparkBankFormFirebase, type SparkBankFormState } from '../../functions/SparkBankFormFirebase';
import { readSparkAccountFirebase } from '../../functions/SparkAccountReadFirebase';
import { readSparkAccountsFirebase } from '../../functions/SparkAccountReadFirebase';
import { readSparkFinancialEventsFirebase } from '../../functions/SparkFinancialReadFirebase';
import { projectSparkEconomicMovements } from '../../utils/sparkEconomicMovements';
import { submitSparkMovementFormFirebase, prepareSparkMovementReversalFirebase, type SparkMovementFormDraft, type SparkMovementFormState } from '../../functions/SparkMovementFormFirebase';
import { executeSparkMovementCommandFirebase } from '../../functions/SparkMovementCommandFirebase';
import { readSparkOrdinaryForEditFirebase } from '../../functions/SparkOrdinaryReadFirebase';
import { readSparkStatementFirebase } from '../../functions/SparkStatementFirebase';
import { toFinancialCivilDate } from '../../utils/financialCivilDate';

const clientRequire = createRequire(resolve(process.cwd(), '..', 'package.json'));
const { initializeApp, deleteApp } = clientRequire('firebase/app') as typeof import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } = clientRequire('firebase/auth') as typeof import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, terminate, doc, getDocFromServer, setDoc, updateDoc } = clientRequire('firebase/firestore') as typeof import('firebase/firestore');
assertSparkDemoEnvironment();
const app = initializeApp({ projectId: SPARK_DEMO.projectId, apiKey: 'fake-api-key' }, 'spark-demo-smoke');
const auth = getAuth(app), firestore = getFirestore(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
const actorId = SPARK_DEMO.uid, groupId = SPARK_DEMO.groupId;
const bankState: SparkBankFormState = {};
let bankId: string;
let movementState: SparkMovementFormState = {};
let action = 0;
const nextId = () => `demo_smoke_action_${++action}_123456`;
const bankDraft = { actorId, bankId: null, name: 'Banco criado no teste', colorHex: null, iconKey: 'outro-banco' };
const movement = (kind: 'income' | 'expense', amountInCents: number): SparkMovementFormDraft => ({ actorId, movementKind: kind,
  name: kind === 'income' ? 'Receita de teste' : 'Despesa de teste', amountInCents, selectedDate: toFinancialCivilDate(new Date()),
  bankId, moneyFormat: false, categoryId: 'demo-food', explanation: 'Ensaio Spark sem Functions', isEditing: false, specialSource: false });

before(async () => { await signInWithEmailAndPassword(auth, SPARK_DEMO.email, SPARK_DEMO.password); });
after(async () => { await terminate(firestore); await deleteApp(app); });

test('demo rejects real/absent projects and remote emulator hosts before Admin setup', () => {
  for (const changed of [{ FIREBASE_PROJECT_ID: 'finances-app-e8685' }, { FIRESTORE_EMULATOR_HOST: 'example.com:8080' }, { FIREBASE_AUTH_EMULATOR_HOST: '' }]) {
    assert.throws(() => assertSparkDemoEnvironment({ ...process.env, ...changed }), /demonstração exige/);
  }
});
test('login resolves protected Spark group and the three synthetic balances', async () => {
  assert.deepEqual(await getSparkContextFirebase(firestore, actorId), { actorId, groupId, role: 'admin' });
  const accounts = await readSparkAccountsFirebase(firestore, actorId, groupId);
  assert.deepEqual(accounts.filter(row => row.position.kind === 'bank').map(row => row.position.balanceInCents).sort((a, b) => a - b), [200000, 500000]);
  assert.equal(accounts.find(row => row.accountId === 'cash')?.position.balanceInCents, 30000);
});
test('bank form opens zero balance atomically and repeated uncertain-style delivery has one account', async () => {
  const result = await submitSparkBankFormFirebase(firestore, bankState, bankDraft, nextId);
  assert.ok(result); bankId = result.bankId;
  assert.equal((await submitSparkBankFormFirebase(firestore, bankState, bankDraft, nextId))?.bankId, bankId);
  const bank = await readSparkAccountFirebase(firestore, actorId, groupId, bankId);
  assert.equal(bank.position.balanceInCents, 0); assert.equal(bank.catalog?.name, bankDraft.name); assert.equal(bank.catalogRevision, 0);
});
test('bank edit loads canonical revision, supports next edit, and rejects concurrent overwrite', async () => {
  const state: SparkBankFormState = {}, competing: SparkBankFormState = {};
  const catalog = await loadSparkBankFormFirebase(firestore, state, actorId, bankId);
  assert.ok(catalog); await loadSparkBankFormFirebase(firestore, competing, actorId, bankId);
  await submitSparkBankFormFirebase(firestore, state, { ...bankDraft, bankId, name: 'Nome atualizado' }, nextId);
  await submitSparkBankFormFirebase(firestore, state, { ...bankDraft, bankId, name: 'Nome final' }, nextId);
  await assert.rejects(submitSparkBankFormFirebase(firestore, competing, { ...bankDraft, bankId, name: 'Nome concorrente' }, nextId), /Cadastro alterado/);
  assert.equal((await readSparkAccountFirebase(firestore, actorId, groupId, bankId)).catalog?.name, 'Nome final');
});
test('bank uncertain result keeps its action and refuses changes until the same material is confirmed', async () => {
  const state: SparkBankFormState = {};
  await submitSparkBankFormFirebase(firestore, state, { ...bankDraft, name: 'Banco para reenvio' }, nextId);
  state.intent!.status = 'uncertain';
  await assert.rejects(submitSparkBankFormFirebase(firestore, state, { ...bankDraft, name: 'Nome diferente' }, nextId), /mesmos dados/);
  const before = action;
  await submitSparkBankFormFirebase(firestore, state, { ...bankDraft, name: 'Banco para reenvio' }, nextId);
  assert.equal(action, before); assert.equal(state.intent!.status, 'confirmed');
});
test('income and expense forms record native category references and exact balances', async () => {
  await submitSparkMovementFormFirebase(firestore, {}, movement('income', 10000), nextId);
  await submitSparkMovementFormFirebase(firestore, movementState, movement('expense', 2500), nextId);
  assert.equal((await readSparkAccountFirebase(firestore, actorId, groupId, bankId)).position.balanceInCents, 7500);
  assert.equal((await getDocFromServer(doc(firestore, 'sparkCategoryReferences', 'demo-food'))).data()?.groupId, groupId);
});
test('edit replaces one expense and reversal restores the current balance without duplicate effects', async () => {
  const reference = { source: 'live' as const, operationId: movementState.intent!.command.clientActionId, family: 'ordinary' as const };
  const target = await readSparkOrdinaryForEditFirebase(firestore, actorId, groupId, reference);
  movementState = { target, entryReference: reference };
  await submitSparkMovementFormFirebase(firestore, movementState, { ...movement('expense', 3000), isEditing: true, editingReference: reference }, nextId);
  assert.equal((await readSparkAccountFirebase(firestore, actorId, groupId, bankId)).position.balanceInCents, 7000);
  const current = { ...reference, operationId: movementState.intent!.command.clientActionId };
  const reversal = await prepareSparkMovementReversalFirebase(firestore, actorId, current, nextId());
  await executeSparkMovementCommandFirebase(firestore, reversal); await executeSparkMovementCommandFirebase(firestore, reversal);
  assert.equal((await readSparkAccountFirebase(firestore, actorId, groupId, bankId)).position.balanceInCents, 10000);
});
test('economic projection and statement agree with committed bank balance', async () => {
  const movements = projectSparkEconomicMovements(await readSparkFinancialEventsFirebase(firestore, actorId, groupId)).filter(row => row.bankId === bankId);
  assert.equal(movements.filter(row => row.type === 'gain').reduce((sum, row) => sum + row.valueInCents, 0), 10000);
  assert.equal(movements.filter(row => row.type === 'expense').reduce((sum, row) => sum + row.valueInCents, 0), 0);
  const now = toFinancialCivilDate(new Date());
  const statement = await readSparkStatementFirebase(firestore, actorId, groupId, bankId, now, now);
  assert.equal(statement.gains.reduce((sum, row) => sum + row.valueInCents, 0) - statement.expenses.reduce((sum, row) => sum + row.valueInCents, 0), 10000);
});
test('Rules deny authority escalation, balance forgery, legacy writes and unauthenticated replay', async () => {
  const denied = (promise: Promise<unknown>) => assert.rejects(promise, (error: any) => error.code === 'permission-denied');
  await denied(updateDoc(doc(firestore, 'financialGroups', groupId), { members: { [actorId]: 'admin', attacker: 'admin' } }));
  await denied(updateDoc(doc(firestore, 'users', actorId), { financialGroupId: 'other' }));
  await denied(updateDoc(doc(firestore, 'financialGroups', groupId, 'sparkPositions', bankId), { balanceInCents: 9999999 }));
  await denied(setDoc(doc(firestore, 'banks', 'legacy-smoke'), { name: 'Bypass', personId: actorId, isActive: true }));
  await signOut(auth);
  await assert.rejects(submitSparkBankFormFirebase(firestore, bankState, bankDraft, nextId), /sessão autenticada/);
});
