import { submitSparkAccountLifecycleFormFirebase, type SparkAccountLifecycleFormState } from '../../functions/SparkAccountLifecycleFormFirebase';
import { readSparkForecastFirebase } from '../../functions/SparkForecastFirebase';
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
import { submitSparkRecurringFormFirebase, loadSparkRecurringFormFirebase, submitSparkRecurringActionFirebase, readSparkRecurringFormRowsFirebase,
  type SparkRecurringFormState, type SparkRecurringDraft, type SparkRecurringActionState } from '../../functions/SparkRecurringFormFirebase';
import { readSparkAccountFirebase } from '../../functions/SparkAccountReadFirebase';
import { createSparkCivilMonthCalendar } from '../../utils/sparkFinancialReconciliation';
import { toFinancialCivilDate } from '../../utils/financialCivilDate';
import { readSparkRecurringPlansFirebase } from '../../functions/SparkRecurringReadFirebase';
import { submitSparkRecurringReplanFormFirebase, type SparkRecurringReplanFormState } from '../../functions/SparkRecurringFormFirebase';

assertSparkDemoEnvironment();
const requireClient = createRequire(resolve(process.cwd(), '..', 'package.json'));
const { initializeApp, deleteApp } = requireClient('firebase/app') as typeof import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = requireClient('firebase/auth') as typeof import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, terminate, Timestamp, doc, getDocFromServer } = requireClient('firebase/firestore') as typeof import('firebase/firestore');
const suffix = randomUUID().replaceAll('-', ''), uid = `recurring-test-${suffix}`, groupId = uid;
const admin = adminApp({ projectId: SPARK_DEMO.projectId }, uid), server = adminDb(admin);
const app = initializeApp({ projectId: SPARK_DEMO.projectId, apiKey: 'fake-api-key' }, uid), auth = getAuth(app), firestore = getFirestore(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
let sequence = 0;
const nextId = () => `recurring_action_${++sequence}_123456`;
const civil = toFinancialCivilDate(new Date());
const dateString = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const today = dateString(civil), cycle = today.slice(0, 7), yesterday = dateString(new Date(civil.getFullYear(), civil.getMonth(), civil.getDate() - 1));
const balance = async (id: string) => (await readSparkAccountFirebase(firestore, uid, groupId, id)).position.balanceInCents;
async function bank() {
  const id = `bank-${++sequence}`, operationId = `bootstrap_${id}`, group = server.doc(`financialGroups/${groupId}`);
  const start = AdminTimestamp.fromDate(new Date(civil.getFullYear(), civil.getMonth() - 3, 1, 12));
  await group.collection('sparkOperations').doc(operationId).create({ schemaVersion: 1, kind: 'account_bootstrap', actorId: uid, accountId: id, openingBalanceInCents: 100000, createdAt: start });
  await group.collection('sparkPositions').doc(id).create({ schemaVersion: 1, kind: 'bank', active: true, balanceInCents: 100000, revision: 0, lastOperationId: operationId, nextActivationAt: null, updatedAt: AdminTimestamp.now() });
  return id;
}
before(async () => {
  await adminAuth(admin).createUser({ uid, email: `${uid}@demo.lumus.local`, password: SPARK_DEMO.password });
  await server.doc(`financialGroups/${groupId}`).create({ status: 'active', sparkProtocol: SPARK_TRANSFER_PROOF_PROTOCOL, members: { [uid]: 'admin' }, recurringTest: suffix });
  await server.doc(`users/${uid}`).create({ financialGroupId: groupId, financialLegacyCutoverAt: AdminTimestamp.now() });
  // Calendário é infraestrutura protegida comum, nunca alterado pelo SDK cliente.
  for (const row of createSparkCivilMonthCalendar(civil.getFullYear() - 1, civil.getFullYear() + 1)) {
    const ref = server.doc(`sparkCivilMonths/${row.cycle}`);
    if (!(await ref.get()).exists) await ref.create(row);
  }
  await signInWithEmailAndPassword(auth, `${uid}@demo.lumus.local`, SPARK_DEMO.password);
});
after(async () => {
  await terminate(firestore); await deleteApp(app); assertSparkDemoEnvironment();
  const group = server.doc(`financialGroups/${groupId}`); assert.equal((await group.get()).data()?.recurringTest, suffix);
  // Caminho fixo da fixture criada neste teste; sem limpar a demonstração ou outros usuários.
  await server.doc(`tags/${uid}-category`).delete(); await server.doc(`sparkCategoryReferences/${uid}-category`).delete();
  await server.recursiveDelete(group); await server.doc(`users/${uid}`).delete(); await server.doc(`sparkTransferQuotas/${uid}`).delete();
  await server.recursiveDelete(server.doc(`sparkOperationRecovery/${uid}`)); await server.doc(`sparkOperationIntentQuotas/${uid}`).delete();
  await server.doc(`sparkPreparationUserQuotas/${uid}`).delete(); await adminAuth(admin).deleteUser(uid); await deleteAdminApp(admin);
});


const definition = (fields: Partial<SparkRecurringDraft> = {}): SparkRecurringDraft => ({ actorId: uid, recurringType: 'expense', planId: null,
  name: 'Contrato de teste', valueInCents: 333, tagId: `${uid}-category`, dueDay: 10, usesBusinessDays: false, description: 'Descrição preservada',
  reminderEnabled: true, reminderDaysBefore: 2, reminderOnDueDate: true, reminderHour: 19, reminderMinute: 30,
  installmentTotal: 3, installmentTotalValueInCents: 1000, installmentsCompleted: 0, installmentStartDate: new Date(civil.getFullYear(), civil.getMonth(), 1, 12),
  installmentEndDate: new Date(civil.getFullYear(), civil.getMonth() + 3, 0, 12), ...fields });
async function create(fields: Partial<SparkRecurringDraft> = {}) {
  await server.doc(`tags/${uid}-category`).set({ schemaVersion: 1, personId: uid, groupId, name: 'Categoria', usageType: 'both',
    isMandatoryExpense: true, isMandatoryGain: true, showInBothLists: true, iconFamily: null, iconName: null, iconStyle: null,
    historyKnown: true, deleted: false, revision: 0, lastOperationId: 'fixture-category', createdAt: AdminTimestamp.now(), updatedAt: AdminTimestamp.now() });
  const state: SparkRecurringFormState = {}, input = definition(fields);
  const result = await submitSparkRecurringFormFirebase(firestore, state, input, nextId);
  assert.ok(result); return { state, input, id: result.id };
}

test('formulário cria contrato/configuração e reenvio preserva os dois receipts', async () => {
  const { state, input, id } = await create();
  state.intent!.status = 'uncertain'; state.intent!.definitionConfirmed = false;
  assert.equal((await submitSparkRecurringFormFirebase(firestore, state, input, nextId))?.id, id);
  const plans = await readSparkRecurringFormRowsFirebase(firestore, uid, 'expense');
  assert.equal(plans?.filter(plan => plan.id === id).length, 1);
  assert.equal(plans?.find(plan => plan.id === id)?.description, 'Descrição preservada');
  assert.equal(plans?.find(plan => plan.id === id)?.reminderHour, 19);
});

test('pagamento de parcelas e desfazimento alteram saldo/contador uma única vez', async () => {
  const accountId = await bank(), { id } = await create(), state: SparkRecurringActionState = {};
  const input = { actorId: uid, planId: id, recurringType: 'expense' as const, action: 'settle' as const,
    selectedDate: civil, accountId, amountInCents: 666, installmentsCount: 2, note: 'Pagamento de duas parcelas' };
  await submitSparkRecurringActionFirebase(firestore, state, input, nextId);
  state.intent!.status = 'uncertain'; await submitSparkRecurringActionFirebase(firestore, state, input, nextId);
  assert.equal(await balance(accountId), 99334);
  const rows = await readSparkRecurringFormRowsFirebase(firestore, uid, 'expense');
  assert.equal(rows?.find(row => row.id === id)?.installmentsCompleted, 2);
  assert.equal(rows?.find(row => row.id === id)?.lastPaymentValueInCents, 666);
  const reverse: SparkRecurringActionState = {}, undo = { actorId: uid, planId: id, recurringType: 'expense' as const, action: 'reverse' as const };
  await submitSparkRecurringActionFirebase(firestore, reverse, undo, nextId);
  reverse.intent!.status = 'uncertain'; await submitSparkRecurringActionFirebase(firestore, reverse, undo, nextId);
  assert.equal(await balance(accountId), 100000);
  assert.equal((await readSparkRecurringFormRowsFirebase(firestore, uid, 'expense'))?.find(row => row.id === id)?.installmentsCompleted, 0);
});

test('recebimento usa ciclo real e desfazimento elimina a entrada sem segunda gravação de ganho', async () => {
  const accountId = await bank(), { id } = await create({ recurringType: 'gain', installmentTotal: null, installmentTotalValueInCents: null,
    installmentStartDate: null, installmentEndDate: null, valueInCents: 500 });
  await submitSparkRecurringActionFirebase(firestore, {}, { actorId: uid, planId: id, recurringType: 'gain', action: 'settle',
    selectedDate: civil, accountId, amountInCents: 700, installmentsCount: 1, note: null }, nextId);
  assert.equal(await balance(accountId), 100700);
  await submitSparkRecurringActionFirebase(firestore, {}, { actorId: uid, planId: id, recurringType: 'gain', action: 'reverse' }, nextId);
  assert.equal(await balance(accountId), 100000);
});

test('quitação negociada conserva valor contratual, caixa real, replay e estorno da mesma faixa', async () => {
  const accountId = await bank(), { id } = await create(), state: SparkRecurringActionState = {};
  const input = { actorId: uid, planId: id, recurringType: 'expense' as const, action: 'settle' as const,
    selectedDate: civil, accountId, amountInCents: 900, installmentsCount: 3, note: 'Desconto de 100 centavos na quitação', settlementMode: 'negotiated' as const };
  await submitSparkRecurringActionFirebase(firestore, state, input, nextId);
  state.intent!.status = 'uncertain'; await submitSparkRecurringActionFirebase(firestore, state, input, nextId);
  assert.equal(await balance(accountId), 99100);
  const operation = (await getDocFromServer(doc(firestore, 'financialGroups', groupId, 'sparkOperations', state.intent!.input.clientActionId))).data()!;
  assert.equal(operation.contractAmountInCents, 1000); assert.equal(operation.amountInCents, 900);
  const plan = (await readSparkRecurringFormRowsFirebase(firestore, uid, 'expense'))?.find(row => row.id === id);
  assert.equal(plan?.installmentsCompleted, 3); assert.equal(plan?.lastPaymentValueInCents, 900);
  await submitSparkRecurringActionFirebase(firestore, {}, { actorId: uid, planId: id, recurringType: 'expense', action: 'reverse' }, nextId);
  assert.equal(await balance(accountId), 100000);
  assert.equal((await readSparkRecurringFormRowsFirebase(firestore, uid, 'expense'))?.find(row => row.id === id)?.installmentsCompleted, 0);
});

test('quitação sem acerto dispensa justificativa; desconto sem motivo mantém saldo e contador', async () => {
  const accountId = await bank(), { id } = await create();
  const input = { actorId: uid, planId: id, recurringType: 'expense' as const, action: 'settle' as const,
    selectedDate: civil, accountId, amountInCents: 900, installmentsCount: 3, note: null, settlementMode: 'negotiated' as const };
  await assert.rejects(submitSparkRecurringActionFirebase(firestore, {}, input, nextId), /motivo/);
  assert.equal(await balance(accountId), 100000);
  await submitSparkRecurringActionFirebase(firestore, {}, { ...input, amountInCents: 1000 }, nextId);
  assert.equal(await balance(accountId), 99000);
});

test('edição exige revisão carregada e conserva contrato/contador', async () => {
  const { id } = await create(), state: SparkRecurringFormState = {};
  await loadSparkRecurringFormFirebase(firestore, state, uid, id, 'expense');
  await submitSparkRecurringFormFirebase(firestore, state, definition({ planId: id, name: 'Nome atualizado', reminderHour: 20 }), nextId);
  assert.equal((await readSparkRecurringFormRowsFirebase(firestore, uid, 'expense'))?.find(row => row.id === id)?.name, 'Nome atualizado');
  await assert.rejects(submitSparkRecurringFormFirebase(firestore, {}, definition({ planId: id }), nextId), /Carregue/);
});

test('arquivamento não apaga ciclos nem permite novo pagamento; restauração conserva identidade', async () => {
  const accountId = await bank(), { id } = await create();
  await submitSparkRecurringActionFirebase(firestore, {}, { actorId: uid, planId: id, recurringType: 'expense', action: 'archive' }, nextId);
  assert.equal((await readSparkRecurringFormRowsFirebase(firestore, uid, 'expense'))?.some(row => row.id === id), false);
  assert.equal((await readSparkRecurringFormRowsFirebase(firestore, uid, 'expense', new Date(), true))?.find(row => row.id === id)?.sparkPlanActive, false);
  await assert.rejects(submitSparkRecurringActionFirebase(firestore, {}, { actorId: uid, planId: id, recurringType: 'expense', action: 'settle',
    selectedDate: civil, accountId, amountInCents: 333, installmentsCount: 1, note: null }, nextId), /indisponível/);
  await submitSparkRecurringActionFirebase(firestore, {}, { actorId: uid, planId: id, recurringType: 'expense', action: 'restore' }, nextId);
  assert.equal((await readSparkRecurringFormRowsFirebase(firestore, uid, 'expense'))?.some(row => row.id === id), true);
});

test('resultado incerto impede alterar material ou trocar usuário/grupo', async () => {
  const { state, input } = await create(); state.intent!.status = 'uncertain';
  await assert.rejects(submitSparkRecurringFormFirebase(firestore, state, { ...input, name: 'Outro nome' }, nextId), /mesmos dados/);
});

test('atividade/arquivo são independentes, restauram a mesma conta e conservam saldo', async () => {
  const accountId = await bank(), state: SparkAccountLifecycleFormState = {};
  const archive = { actorId: uid, accountId, action: 'archive' as const };
  await submitSparkAccountLifecycleFormFirebase(firestore, state, archive, nextId);
  state.intent!.status = 'uncertain'; await submitSparkAccountLifecycleFormFirebase(firestore, state, archive, nextId);
  let account = await readSparkAccountFirebase(firestore, uid, groupId, accountId, { requireCurrent: false });
  assert.equal(account.position.active, false); assert.equal(account.position.balanceInCents, 100000); assert.equal(account.position.revision, 0);
  await submitSparkAccountLifecycleFormFirebase(firestore, {}, { actorId: uid, accountId, action: 'set-active', isActive: false }, nextId);
  await submitSparkAccountLifecycleFormFirebase(firestore, {}, { actorId: uid, accountId, action: 'restore' }, nextId);
  account = await readSparkAccountFirebase(firestore, uid, groupId, accountId, { requireCurrent: false });
  assert.equal(account.lifecycle.archived, false); assert.equal(account.position.active, false);
  await submitSparkAccountLifecycleFormFirebase(firestore, {}, { actorId: uid, accountId, action: 'set-active', isActive: true }, nextId);
  assert.equal(await balance(accountId), 100000);
});

test('previsão lê posições e ciclos autenticados sem Functions nem reaplicar eventos', async () => {
  const group = server.doc(`financialGroups/${groupId}`), bootstrap = 'cash-fixture';
  await group.collection('sparkOperations').doc(bootstrap).create({ schemaVersion: 1, kind: 'account_bootstrap', actorId: uid, accountId: 'cash', openingBalanceInCents: 500, createdAt: AdminTimestamp.now() });
  await group.collection('sparkPositions').doc('cash').create({ schemaVersion: 1, kind: 'cash', active: true, balanceInCents: 500, revision: 0, lastOperationId: bootstrap, nextActivationAt: null, updatedAt: AdminTimestamp.now() });
  const forecast = await readSparkForecastFirebase(firestore, uid, groupId, 3);
  assert.ok(Number.isSafeInteger(forecast.finalBalanceInCents));
  assert.equal(forecast.totalGainsInCents, 1500);
  assert.equal(forecast.periodInMonths, 3);
  assert.equal((await group.collection('sparkOperations').doc(bootstrap).get()).data()?.kind, 'account_bootstrap');
});

test('renegociação do formulário conserva IDs/configuração, troca o contrato ativo e desfaz após reload', async () => {
  const { id } = await create();
  const original = (await readSparkRecurringPlansFirebase(firestore, uid, groupId, new Date())).find(plan => plan.id === id)!;
  const state: SparkRecurringReplanFormState = {}, input = { actorId: uid, plan: original, action: 'replan' as const,
    installmentTotal: 2, contractTotalInCents: 901, startCycle: cycle, reason: 'Novo acordo de parcelas' };
  const result = await submitSparkRecurringReplanFormFirebase(firestore, state, input, nextId);
  state.intent!.status = 'uncertain';
  assert.equal((await submitSparkRecurringReplanFormFirebase(firestore, state, input, nextId)).id, result.id);
  let plans = await readSparkRecurringPlansFirebase(firestore, uid, groupId, new Date());
  const old = plans.find(plan => plan.id === id)!, next = plans.find(plan => plan.id === result.id)!;
  assert.equal(old.active, false); assert.equal(old.successorPlanId, next.id); assert.equal(next.predecessorPlanId, old.id);
  assert.equal(next.valueInCents, 450); assert.equal(next.metadata?.reminderHour, 19); assert.equal(next.metadata?.description, 'Descrição preservada');
  const reloadedState: SparkRecurringReplanFormState = {};
  await submitSparkRecurringReplanFormFirebase(firestore, reloadedState, { actorId: uid, plan: old, action: 'undo', reason: 'Cancelar acordo' }, nextId);
  plans = await readSparkRecurringPlansFirebase(firestore, uid, groupId, new Date());
  assert.equal(plans.find(plan => plan.id === id)?.active, true); assert.equal(plans.find(plan => plan.id === next.id)?.replanCancelled, true);
});
test('pagamento após fim não desaparece da leitura nem da Home/previsão, sem inferir parcelas pagas', async () => {
  const accountId = await bank(), start = new Date(civil.getFullYear(), civil.getMonth() - 3, 1, 12);
  const { id } = await create({ installmentStartDate: start, installmentEndDate: new Date(civil.getFullYear(), civil.getMonth() - 1, 0, 12) });
  const before = await readSparkForecastFirebase(firestore, uid, groupId, 3);
  assert.equal(before.months[0].commitments.find(commitment => commitment.id === `spark-plan-${id}-${cycle}`)?.valueInCents, 1000);
  const state: SparkRecurringActionState = {};
  await submitSparkRecurringActionFirebase(firestore, state, { actorId: uid, planId: id, recurringType: 'expense', action: 'settle',
    selectedDate: civil, accountId, amountInCents: 333, installmentsCount: 1, note: null }, nextId);
  const read = (await readSparkRecurringPlansFirebase(firestore, uid, groupId, new Date())).find(plan => plan.id === id)!;
  assert.equal(read.installmentsCompleted, 1); assert.equal(read.cycleStates?.find(row => row.cycle === cycle)?.lateSettlement, true);
  const after = await readSparkForecastFirebase(firestore, uid, groupId, 3);
  assert.equal(after.months[0].commitments.find(commitment => commitment.id === `spark-plan-${id}-${cycle}`)?.valueInCents, 667);
  assert.equal(await balance(accountId), 99667);
  await submitSparkRecurringActionFirebase(firestore, {}, { actorId: uid, planId: id, recurringType: 'expense', action: 'reverse' }, nextId);
  assert.equal(await balance(accountId), 100000);
});
test('resultado incerto da renegociação impede mudar acordo ou revisão; ganho parcelado usa o mesmo protocolo', async () => {
  const { id } = await create({ recurringType: 'gain' });
  const plan = (await readSparkRecurringPlansFirebase(firestore, uid, groupId, new Date())).find(row => row.id === id)!;
  const state: SparkRecurringReplanFormState = {}, input = { actorId: uid, plan, action: 'replan' as const,
    installmentTotal: 2, contractTotalInCents: 701, startCycle: cycle, reason: 'Replanejamento de recebimento' };
  await submitSparkRecurringReplanFormFirebase(firestore, state, input, nextId); state.intent!.status = 'uncertain';
  await assert.rejects(submitSparkRecurringReplanFormFirebase(firestore, state, { ...input, contractTotalInCents: 702 }, nextId), /mesma confirmação/);
  const nextIdResult = (await submitSparkRecurringReplanFormFirebase(firestore, state, input, nextId)).id;
  assert.equal((await readSparkRecurringFormRowsFirebase(firestore, uid, 'gain'))?.find(row => row.id === nextIdResult)?.installmentTotalValueInCents, 701);
});
