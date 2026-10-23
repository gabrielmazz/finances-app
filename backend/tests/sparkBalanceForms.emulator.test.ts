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
import { prepareSparkBalanceFormFirebase, submitSparkBalanceFormFirebase, prepareSparkAdjustmentReversalFormFirebase, executeSparkAdjustmentReversalFormFirebase,
  type SparkBalanceFormState, type SparkBalanceDraft, type SparkBalanceSelection } from '../../functions/SparkBalanceFormFirebase';
import { readSparkAccountFirebase } from '../../functions/SparkAccountReadFirebase';
import { readSparkPendingActivationsFirebase, advanceSparkPendingActivationFirebase } from '../../functions/SparkActivationQueueFirebase';
import { readSparkStatementFirebase } from '../../functions/SparkStatementFirebase';
import { postSparkMovementFirebase } from '../../functions/SparkMovementFirebase';
import { createSparkCivilMonthCalendar } from '../../utils/sparkFinancialReconciliation';
import { toFinancialCivilDate } from '../../utils/financialCivilDate';
import { shouldIncludeMovementInGainExpenseTotals } from '../../utils/monthlyBalance';

assertSparkDemoEnvironment();
const requireClient = createRequire(resolve(process.cwd(), '..', 'package.json'));
const { initializeApp, deleteApp } = requireClient('firebase/app') as typeof import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = requireClient('firebase/auth') as typeof import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, terminate, Timestamp, doc, getDocFromServer } = requireClient('firebase/firestore') as typeof import('firebase/firestore');
const suffix = randomUUID().replaceAll('-', ''), uid = `balance-test-${suffix}`, groupId = uid;
const admin = adminApp({ projectId: SPARK_DEMO.projectId }, uid), server = adminDb(admin);
const app = initializeApp({ projectId: SPARK_DEMO.projectId, apiKey: 'fake-api-key' }, uid), auth = getAuth(app), firestore = getFirestore(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
let sequence = 0;
const nextId = () => `balance_action_${++sequence}_123456`;
const civil = toFinancialCivilDate(new Date());
const dateString = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const today = dateString(civil), cycle = today.slice(0, 7), yesterday = dateString(new Date(civil.getFullYear(), civil.getMonth(), civil.getDate() - 1));
const balance = async (id: string) => (await readSparkAccountFirebase(firestore, uid, groupId, id)).position.balanceInCents;
const selection = (accountId: string, fields: Partial<SparkBalanceSelection> = {}): SparkBalanceSelection => ({ actorId: uid, accountId, mode: 'adjustment', date: today, ...fields });
const draft = (value: SparkBalanceSelection, targetBalanceInCents: number): SparkBalanceDraft => ({ ...value, targetBalanceInCents, note: 'Ensaio de saldo' });
async function bank() {
  const id = `bank-${++sequence}`, operationId = `bootstrap_${id}`, group = server.doc(`financialGroups/${groupId}`);
  const start = AdminTimestamp.fromDate(new Date(civil.getFullYear(), civil.getMonth() - 3, 1, 12));
  await group.collection('sparkOperations').doc(operationId).create({ schemaVersion: 1, kind: 'account_bootstrap', actorId: uid, accountId: id, openingBalanceInCents: 10000, createdAt: start });
  await group.collection('sparkPositions').doc(id).create({ schemaVersion: 1, kind: 'bank', active: true, balanceInCents: 10000, revision: 0, lastOperationId: operationId, nextActivationAt: null, updatedAt: AdminTimestamp.now() });
  return id;
}
before(async () => {
  await adminAuth(admin).createUser({ uid, email: `${uid}@demo.lumus.local`, password: SPARK_DEMO.password });
  await server.doc(`financialGroups/${groupId}`).create({ status: 'active', sparkProtocol: SPARK_TRANSFER_PROOF_PROTOCOL, members: { [uid]: 'admin' }, balanceTest: suffix });
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
  const group = server.doc(`financialGroups/${groupId}`); assert.equal((await group.get()).data()?.balanceTest, suffix);
  // Caminho fixo da fixture criada neste teste; sem limpar a demonstração ou outros usuários.
  await server.recursiveDelete(group); await server.doc(`users/${uid}`).delete(); await server.doc(`sparkTransferQuotas/${uid}`).delete();
  await server.recursiveDelete(server.doc(`sparkOperationRecovery/${uid}`)); await server.doc(`sparkOperationIntentQuotas/${uid}`).delete();
  await server.doc(`sparkPreparationUserQuotas/${uid}`).delete(); await adminAuth(admin).deleteUser(uid); await deleteAdminApp(admin);
});

test('ajuste de hoje confirma a revisão corrente no commit e replay não duplica diferença', async () => {
  const id = await bank(), state: SparkBalanceFormState = {}, input = selection(id);
  assert.equal((await prepareSparkBalanceFormFirebase(firestore, state, input, nextId))?.base, 10000);
  await submitSparkBalanceFormFirebase(firestore, state, draft(input, 15000));
  state.intent!.status = 'uncertain'; await submitSparkBalanceFormFirebase(firestore, state, draft(input, 15000));
  assert.equal(await balance(id), 15000);
  await assert.rejects(submitSparkBalanceFormFirebase(firestore, state, draft(input, 17000)), /mesmos dados/);
});

test('movimento concorrente invalida prévia sem sobrescrever seu efeito', async () => {
  const id = await bank(), state: SparkBalanceFormState = {}, input = selection(id);
  await prepareSparkBalanceFormFirebase(firestore, state, input, nextId);
  await postSparkMovementFirebase(firestore, { actorId: uid, groupId, accountId: id, clientActionId: nextId(), kind: 'income', amountInCents: 2000, effectiveAt: Timestamp.now() });
  await assert.rejects(submitSparkBalanceFormFirebase(firestore, state, draft(input, 15000)), /desatualizada/);
  assert.equal(await balance(id), 12000);
});

test('abertura mensal preserva movimentos posteriores e fica fora dos totais econômicos', async () => {
  const id = await bank(), state: SparkBalanceFormState = {}, input = selection(id, { mode: 'monthly', date: cycle });
  await postSparkMovementFirebase(firestore, { actorId: uid, groupId, accountId: id, clientActionId: nextId(), kind: 'income', amountInCents: 2000, effectiveAt: Timestamp.now() });
  assert.equal((await prepareSparkBalanceFormFirebase(firestore, state, input, nextId))?.base, 10000);
  const result = await submitSparkBalanceFormFirebase(firestore, state, draft(input, 15000));
  assert.equal(await balance(id), 17000);
  const stored = await getDocFromServer(doc(firestore, 'financialGroups', groupId, 'sparkMonthlyOpenings', id, 'cycles', cycle));
  assert.equal(stored.data()?.operationId, result.id);
  const rows = await readSparkStatementFirebase(firestore, uid, groupId, id, new Date(civil.getFullYear(), civil.getMonth(), 1), civil);
  assert.equal([...rows.expenses, ...rows.gains].filter(shouldIncludeMovementInGainExpenseTotals).length, 1);
});

test('duas confirmações mensais da mesma revisão não sobrescrevem uma à outra', async () => {
  const id = await bank(), left: SparkBalanceFormState = {}, right: SparkBalanceFormState = {}, input = selection(id, { mode: 'monthly', date: cycle });
  await prepareSparkBalanceFormFirebase(firestore, left, input, nextId); await prepareSparkBalanceFormFirebase(firestore, right, input, nextId);
  await submitSparkBalanceFormFirebase(firestore, left, draft(input, 12000));
  await assert.rejects(submitSparkBalanceFormFirebase(firestore, right, draft(input, 14000)));
  assert.equal(await balance(id), 12000);
});

test('preparação parcial retoma a mesma identidade e pausa não confirma saldo', async () => {
  const id = await bank(), state: SparkBalanceFormState = {}, input = selection(id, { mode: 'monthly', date: cycle });
  const partial = await prepareSparkBalanceFormFirebase(firestore, state, input, nextId, undefined, 0), actionId = partial!.clientActionId;
  assert.equal(partial!.base, null); await assert.rejects(submitSparkBalanceFormFirebase(firestore, state, draft(input, 20000)), /prévia completa/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(prepareSparkBalanceFormFirebase(firestore, state, input, nextId, { signal: abort.signal }));
  const ready = await prepareSparkBalanceFormFirebase(firestore, state, input, nextId);
  assert.equal(ready!.clientActionId, actionId); assert.equal(ready!.base, 10000); assert.equal(await balance(id), 10000);
});

test('abertura futura conserva saldo atual e registra ativação para sua fronteira', async () => {
  const id = await bank(), state: SparkBalanceFormState = {}, next = new Date(civil.getFullYear(), civil.getMonth() + 1, 1);
  const input = selection(id, { mode: 'monthly', date: dateString(next).slice(0, 7) });
  await prepareSparkBalanceFormFirebase(firestore, state, input, nextId); await submitSparkBalanceFormFirebase(firestore, state, draft(input, 18000));
  const account = await readSparkAccountFirebase(firestore, uid, groupId, id);
  assert.equal(account.position.balanceInCents, 10000); assert.ok(account.position.nextActivationAt);
});

test('ajuste retroativo permite substituição e estorno sem apagar movimentos posteriores', async () => {
  const id = await bank(), state: SparkBalanceFormState = {}, input = selection(id, { date: yesterday });
  await prepareSparkBalanceFormFirebase(firestore, state, input, nextId); const original = await submitSparkBalanceFormFirebase(firestore, state, draft(input, 13000));
  await postSparkMovementFirebase(firestore, { actorId: uid, groupId, accountId: id, clientActionId: nextId(), kind: 'income', amountInCents: 500, effectiveAt: Timestamp.now() });
  const replacement: SparkBalanceFormState = {}, edit = { ...input, adjustmentId: original.id };
  assert.equal((await prepareSparkBalanceFormFirebase(firestore, replacement, edit, nextId))?.base, 10000);
  const updated = await submitSparkBalanceFormFirebase(firestore, replacement, draft(edit, 14000));
  assert.equal(await balance(id), 14500);
  const activeRows = await readSparkStatementFirebase(firestore, uid, groupId, id, new Date(civil.getFullYear(), civil.getMonth(), civil.getDate() - 1), civil);
  const activeAdjustment = [...activeRows.expenses, ...activeRows.gains].find(row => row.sparkAdjustmentOperationId === updated.id);
  assert.ok(activeAdjustment); assert.equal(activeAdjustment.sparkAdjustmentResolved, false); assert.notEqual(activeAdjustment.id, updated.id);
  await assert.rejects(prepareSparkAdjustmentReversalFormFirebase(firestore, uid, original.id, nextId), /disponível/);
  const command = await prepareSparkAdjustmentReversalFormFirebase(firestore, uid, updated.id, nextId);
  await executeSparkAdjustmentReversalFormFirebase(firestore, command); await executeSparkAdjustmentReversalFormFirebase(firestore, command);
  assert.equal(await balance(id), 10500);
  const rows = await readSparkStatementFirebase(firestore, uid, groupId, id, new Date(civil.getFullYear(), civil.getMonth(), civil.getDate() - 1), civil);
  const adjustable = [...rows.expenses, ...rows.gains].filter(row => row.sparkAdjustmentOperationId && !row.sparkAdjustmentResolved);
  assert.equal(adjustable.length, 0);
});

test('membro sem papel administrativo e sessão revogada não confirmam ajustes', async () => {
  const id = await bank(), state: SparkBalanceFormState = {}, input = selection(id);
  await prepareSparkBalanceFormFirebase(firestore, state, input, nextId);
  await server.doc(`financialGroups/${groupId}`).update({ members: { [uid]: 'member' } });
  await assert.rejects(submitSparkBalanceFormFirebase(firestore, state, draft(input, 16000)), /administrador/);
  await server.doc(`financialGroups/${groupId}`).update({ members: {} });
  try {
    await assert.rejects(submitSparkBalanceFormFirebase(firestore, state, draft(input, 16000)), (error: unknown) =>
      (error as { code?: string }).code === 'permission-denied' || error instanceof Error && /revogado/.test(error.message));
  } finally { await server.doc(`financialGroups/${groupId}`).update({ members: { [uid]: 'admin' } }); }
  assert.equal(await balance(id), 10000);
});

test('contagem negativa sem justificativa e data civil impossível são recusadas', async () => {
  const id = await bank(), state: SparkBalanceFormState = {}, input = selection(id);
  await prepareSparkBalanceFormFirebase(firestore, state, input, nextId);
  await assert.rejects(submitSparkBalanceFormFirebase(firestore, state, { ...draft(input, -100), note: null }), /Justifique/);
  await assert.rejects(prepareSparkBalanceFormFirebase(firestore, {}, selection(id, { date: `${civil.getFullYear()}-02-31` }), nextId));
  assert.equal(await balance(id), 10000);
});

test('edição do ajuste de hoje substitui seu efeito usando instante certificado da posição', async () => {
  const id = await bank(), state: SparkBalanceFormState = {}, input = selection(id);
  await prepareSparkBalanceFormFirebase(firestore, state, input, nextId); const original = await submitSparkBalanceFormFirebase(firestore, state, draft(input, 13000));
  const edit: SparkBalanceFormState = {}, selectionEdit = { ...input, adjustmentId: original.id };
  assert.equal((await prepareSparkBalanceFormFirebase(firestore, edit, selectionEdit, nextId))?.base, 10000);
  await submitSparkBalanceFormFirebase(firestore, edit, draft(selectionEdit, 16000));
  assert.equal(await balance(id), 16000);
});

test('abertura vencida é ativada pela preparação mensal antes de apresentar novo saldo', async () => {
  const id = await bank(), state: SparkBalanceFormState = {}, input = selection(id, { mode: 'monthly', date: cycle });
  await prepareSparkBalanceFormFirebase(firestore, state, input, nextId); const original = await submitSparkBalanceFormFirebase(firestore, state, draft(input, 18000));
  // Simula somente nesta fixture a passagem da fronteira de uma abertura antes agendada.
  const op = (await server.doc(`financialGroups/${groupId}/sparkOperations/${original.id}`).get()).data()!;
  await server.doc(`financialGroups/${groupId}/sparkPositions/${id}`).update({ balanceInCents: 10000, nextActivationAt: op.requestedEffectiveAt });
  await server.doc(`financialGroups/${groupId}/sparkCheckpoints/${id}`).delete();
  const next: SparkBalanceFormState = {}, preview = await prepareSparkBalanceFormFirebase(firestore, next, input, nextId);
  assert.notEqual(preview?.base, null); assert.equal(await balance(id), 18000);
  await submitSparkBalanceFormFirebase(firestore, next, draft(input, 19000));
  assert.equal(await balance(id), 19000);
});

test('fila mensal retoma prova privada após recarregar e não lança contagem nova', async () => {
  const id = await bank(), input = selection(id, { mode: 'monthly', date: cycle }), state: SparkBalanceFormState = {};
  await prepareSparkBalanceFormFirebase(firestore, state, input, nextId);
  const saved = await submitSparkBalanceFormFirebase(firestore, state, draft(input, 18000));
  const group = server.doc(`financialGroups/${groupId}`), opening = (await group.collection('sparkOperations').doc(saved.id).get()).data()!;
  await group.collection('sparkPositions').doc(id).update({ balanceInCents: 10000, nextActivationAt: opening.requestedEffectiveAt });
  await group.collection('sparkCheckpoints').doc(id).delete();
  assert.ok((await readSparkPendingActivationsFirebase(firestore, uid)).some(row => row.accountId === id));
  const partial = await advanceSparkPendingActivationFirebase(firestore, uid, id, nextId, undefined, 0);
  assert.equal(partial.status, 'preparing');
  assert.equal((await readSparkAccountFirebase(firestore, uid, groupId, id, { requireCurrent: false })).position.balanceInCents, 10000);
  const pause = new AbortController(); pause.abort();
  await assert.rejects(advanceSparkPendingActivationFirebase(firestore, uid, id, () => { throw new Error('Não deve criar identidade ao pausar.'); }, { signal: pause.signal }));
  // Nenhum estado do formulário é enviado: a identidade vem exclusivamente da prova privada no servidor.
  assert.equal((await advanceSparkPendingActivationFirebase(firestore, uid, id, () => { throw new Error('Reiniciou uma prova válida.'); })).status, 'current');
  assert.equal(await balance(id), 18000);
  assert.equal((await readSparkPendingActivationsFirebase(firestore, uid)).some(row => row.accountId === id), false);
  const activations = await group.collection('sparkOperations').where('kind', '==', 'monthly_activation').where('accountId', '==', id).get();
  assert.equal(activations.size, 1); assert.equal(activations.docs[0].id, partial.status === 'preparing' ? partial.proofId : null);
  assert.equal(activations.docs[0].data().differenceInCents, 0);
  assert.equal((await advanceSparkPendingActivationFirebase(firestore, uid, id, nextId)).status, 'current');
});

test('membro materializa abertura já autorizada, mas acesso revogado impede fila e ativação', async () => {
  const id = await bank(), input = selection(id, { mode: 'monthly', date: cycle }), state: SparkBalanceFormState = {};
  await prepareSparkBalanceFormFirebase(firestore, state, input, nextId);
  const saved = await submitSparkBalanceFormFirebase(firestore, state, draft(input, 15000));
  const group = server.doc(`financialGroups/${groupId}`), opening = (await group.collection('sparkOperations').doc(saved.id).get()).data()!;
  await group.collection('sparkPositions').doc(id).update({ balanceInCents: 10000, nextActivationAt: opening.requestedEffectiveAt });
  await group.collection('sparkCheckpoints').doc(id).delete();
  try {
    await group.update({ members: { [uid]: 'member' } });
    assert.equal((await advanceSparkPendingActivationFirebase(firestore, uid, id, nextId)).status, 'current');
    assert.equal(await balance(id), 15000);
    await group.update({ members: {} });
    await assert.rejects(readSparkPendingActivationsFirebase(firestore, uid));
    await assert.rejects(advanceSparkPendingActivationFirebase(firestore, uid, id, nextId));
  } finally { await group.update({ members: { [uid]: 'admin' } }); }
});

test('ajuste retroativo pode justificar saldo atual negativo mesmo com alvo passado positivo', async () => {
  const id = await bank(), state: SparkBalanceFormState = {}, input = selection(id, { date: yesterday });
  await postSparkMovementFirebase(firestore, { actorId: uid, groupId, accountId: id, clientActionId: nextId(), kind: 'expense', amountInCents: 9500, effectiveAt: Timestamp.now() });
  assert.equal((await prepareSparkBalanceFormFirebase(firestore, state, input, nextId))?.base, 10000);
  await submitSparkBalanceFormFirebase(firestore, state, draft(input, 1000));
  assert.equal(await balance(id), -8500);
});

test('edição de hoje aceita alvo negativo com motivo, dentro do orçamento de Rules', async () => {
  const id = await bank(), state: SparkBalanceFormState = {}, input = selection(id);
  await prepareSparkBalanceFormFirebase(firestore, state, input, nextId); const original = await submitSparkBalanceFormFirebase(firestore, state, draft(input, 13000));
  const edit: SparkBalanceFormState = {}, selectionEdit = { ...input, adjustmentId: original.id };
  await prepareSparkBalanceFormFirebase(firestore, edit, selectionEdit, nextId);
  await submitSparkBalanceFormFirebase(firestore, edit, draft(selectionEdit, -1000));
  assert.equal(await balance(id), -1000);
});
