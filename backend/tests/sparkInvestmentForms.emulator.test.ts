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
import { submitSparkInvestmentFormFirebase, type SparkInvestmentFormState, type SparkInvestmentFormDraft } from '../../functions/SparkInvestmentFormFirebase';
import { readSparkInvestmentPortfolioFirebase } from '../../functions/SparkInvestmentReadFirebase';
import { readSparkAccountFirebase } from '../../functions/SparkAccountReadFirebase';
import { readSparkStatementFirebase } from '../../functions/SparkStatementFirebase';
import { prepareSparkPairReversalFirebase, executeSparkPairReversalFirebase } from '../../functions/SparkPairFormFirebase';
import { transferSparkDatedFundsFirebase } from '../../functions/SparkTransferFirebase';
import { buildInvestmentPortfolioAnalytics } from '../../utils/investmentPortfolio';
import { createSparkCivilMonthCalendar } from '../../utils/sparkFinancialReconciliation';
import { toFinancialCivilDate } from '../../utils/financialCivilDate';

assertSparkDemoEnvironment();
const requireClient = createRequire(resolve(process.cwd(), '..', 'package.json'));
const { initializeApp, deleteApp } = requireClient('firebase/app') as typeof import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = requireClient('firebase/auth') as typeof import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, terminate, Timestamp, doc, getDocFromServer, writeBatch, serverTimestamp } = requireClient('firebase/firestore') as typeof import('firebase/firestore');
const suffix = randomUUID().replaceAll('-', ''), uid = `investment-test-${suffix}`, groupId = uid;
const admin = adminApp({ projectId: SPARK_DEMO.projectId }, uid), server = adminDb(admin);
const app = initializeApp({ projectId: SPARK_DEMO.projectId, apiKey: 'fake-api-key' }, uid), auth = getAuth(app), firestore = getFirestore(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
let sequence = 0;
const nextId = () => `investment_action_${++sequence}_123456`;
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
  await server.doc(`financialGroups/${groupId}`).create({ status: 'active', sparkProtocol: SPARK_TRANSFER_PROOF_PROTOCOL, members: { [uid]: 'admin' }, investmentTest: suffix });
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
  const group = server.doc(`financialGroups/${groupId}`); assert.equal((await group.get()).data()?.investmentTest, suffix);
  // Caminho fixo da fixture criada neste teste; sem limpar a demonstração ou outros usuários.
  await server.recursiveDelete(group); await server.doc(`users/${uid}`).delete(); await server.doc(`sparkTransferQuotas/${uid}`).delete();
  await server.recursiveDelete(server.doc(`sparkOperationRecovery/${uid}`)); await server.doc(`sparkOperationIntentQuotas/${uid}`).delete();
  await server.doc(`sparkPreparationUserQuotas/${uid}`).delete(); await adminAuth(admin).deleteUser(uid); await deleteAdminApp(admin);
});



let investmentId: string, firstBank: string, secondBank: string;
const metadata = { name: 'Investimento Spark', bankId: '', cdiPercentageInBasisPoints: 10000, assetType: 'fixed_income' as const,
  valuationMethod: 'cdi' as const, redemptionTerm: 'anytime', description: 'Carteira sem Functions' };
test('abertura financia o principal e conserva a avaliação separada; reenvio não duplica', async () => {
  firstBank = await bank(); secondBank = await bank();
  const state: SparkInvestmentFormState = {}, input: SparkInvestmentFormDraft = { ...metadata, bankId: firstBank, actorId: uid, action: 'create',
    principalInCents: 10000, observedValueInCents: 11000, selectedDate: civil };
  const result = await submitSparkInvestmentFormFirebase(firestore, state, input, nextId); assert.ok(result?.success); investmentId = result.investmentId;
  state.intent!.status = 'uncertain'; state.intent!.financialConfirmed = false;
  assert.equal((await submitSparkInvestmentFormFirebase(firestore, state, input, nextId))?.success, true);
  assert.equal(await balance(firstBank), 90000); assert.equal(await balance(investmentId), 11000);
});
test('editar principal conserva referência e pode trocar o banco sem perder histórico', async () => {
  const input: SparkInvestmentFormDraft = { ...metadata, bankId: firstBank, actorId: uid, action: 'edit', accountId: investmentId, principalInCents: 12000 };
  const state: SparkInvestmentFormState = {};
  await submitSparkInvestmentFormFirebase(firestore, state, input, nextId);
  assert.equal(await balance(firstBank), 88000); assert.equal(await balance(investmentId), 11000);
  state.intent!.status = 'uncertain'; state.intent!.financialConfirmed = false;
  await submitSparkInvestmentFormFirebase(firestore, state, input, nextId);
  assert.equal(await balance(firstBank), 88000);
  await submitSparkInvestmentFormFirebase(firestore, {}, { ...input, bankId: secondBank }, nextId);
  assert.equal(await balance(firstBank), 100000); assert.equal(await balance(secondBank), 88000);
  assert.equal((await readSparkAccountFirebase(firestore, uid, groupId, investmentId)).principal?.fundingAccountId, secondBank);
});
test('sincronização e aporte mantêm saldo confirmado e contraparte na mesma operação', async () => {
  const sync: SparkInvestmentFormDraft = { actorId: uid, action: 'sync', accountId: investmentId, selectedDate: civil, observedValueInCents: 15000, reason: 'deposit' };
  const result = await submitSparkInvestmentFormFirebase(firestore, {}, sync, nextId); assert.ok(result?.success);
  assert.equal(result.currentValueInCents, 15000);
  const state: SparkInvestmentFormState = {}, input: SparkInvestmentFormDraft = { actorId: uid, action: 'move', accountId: investmentId,
    bankId: secondBank, selectedDate: civil, amountInCents: 3000, movement: 'deposit', expectedCurrentValueInCents: 15000 };
  await submitSparkInvestmentFormFirebase(firestore, state, input, nextId);
  state.intent!.status = 'uncertain'; state.intent!.financialConfirmed = false;
  await submitSparkInvestmentFormFirebase(firestore, state, input, nextId);
  assert.equal(await balance(investmentId), 18000); assert.equal(await balance(secondBank), 85000);
  await assert.rejects(submitSparkInvestmentFormFirebase(firestore, {}, { ...input, movement: 'redemption' }, nextId), /mudou/);
});
test('confirmação em revisão antiga é recusada dentro da transação do par', async () => {
  const revision = (await readSparkAccountFirebase(firestore, uid, groupId, investmentId)).position.revision;
  await assert.rejects(transferSparkDatedFundsFirebase(firestore, { actorId: uid, groupId, clientActionId: nextId(), kind: 'investment_redemption',
    fromAccountId: investmentId, toAccountId: secondBank, effectiveAt: Timestamp.now(), amountInCents: 100, expectedFromRevision: revision - 1 }), /mudou/);
  assert.equal(await balance(investmentId), 18000);
});
test('leitor identifica titular pela abertura e curva intradiária não perde aporte após conferência', async () => {
  const snapshot = await readSparkInvestmentPortfolioFirebase(firestore, uid, groupId), item = snapshot.investments.find(item => item.id === investmentId)!;
  assert.equal(item.personId, uid); assert.equal(item.currentValueInCents, 18000); assert.equal(item.initialValueInCents, 12000);
  const analytics = buildInvestmentPortfolioAnalytics({ investments: [{ ...item, bankId: item.bankId, redemptionTerm: undefined,
    timelinePrecision: 'instant', investmentDate: item.date, assetType: item.assetType as 'fixed_income', valuationMethod: item.valuationMethod as 'cdi' } as any],
    ...snapshot.activity, rates: [], period: 'all', asOfDate: civil });
  assert.equal(analytics.projectedValueInCents, 18000);
});
test('resgate e arquivamento preservam o investimento para restauração', async () => {
  await submitSparkInvestmentFormFirebase(firestore, {}, { actorId: uid, action: 'move', accountId: investmentId, bankId: secondBank,
    selectedDate: civil, amountInCents: 2000, movement: 'redemption', expectedCurrentValueInCents: 18000 }, nextId);
  assert.equal(await balance(investmentId), 16000); assert.equal(await balance(secondBank), 87000);
  await submitSparkInvestmentFormFirebase(firestore, {}, { actorId: uid, action: 'archive', accountId: investmentId }, nextId);
  assert.equal((await readSparkInvestmentPortfolioFirebase(firestore, uid, groupId)).investments.length, 0);
  const archived = await readSparkInvestmentPortfolioFirebase(firestore, uid, groupId, new Date(), true);
  assert.equal(archived.investments[0].archived, true); assert.equal(archived.investments[0].currentValueInCents, 16000);
  await submitSparkInvestmentFormFirebase(firestore, {}, { actorId: uid, action: 'restore', accountId: investmentId }, nextId);
  assert.equal((await readSparkInvestmentPortfolioFirebase(firestore, uid, groupId)).investments[0].id, investmentId);
});

test('SDK direto não pode forjar a revisão apresentada em uma confirmação de resgate', async () => {
  const group = doc(firestore, 'financialGroups', groupId), fromRef = doc(group, 'sparkPositions', investmentId), toRef = doc(group, 'sparkPositions', secondBank);
  const from = (await getDocFromServer(fromRef)).data()!, to = (await getDocFromServer(toRef)).data()!;
  const quotaRef = doc(firestore, 'sparkTransferQuotas', uid), quota = (await getDocFromServer(quotaRef)).data()!;
  const id = nextId(), window = Math.floor(Date.now() / 60000) * 60000, batch = writeBatch(firestore);
  batch.set(doc(group, 'sparkOperations', id), { schemaVersion: 1, actorId: uid, kind: 'investment_redemption', dated: false,
    fromAccountId: investmentId, toAccountId: secondBank, amountInCents: 100, fromRevision: from.revision, toRevision: to.revision,
    fromPreviousOperationId: from.lastOperationId, toPreviousOperationId: to.lastOperationId,
    expectedFromRevision: from.revision - 1, note: null, overdraftReason: null, createdAt: serverTimestamp() });
  batch.update(fromRef, { balanceInCents: from.balanceInCents - 100, revision: from.revision + 1, lastOperationId: id, updatedAt: serverTimestamp() });
  batch.update(toRef, { balanceInCents: to.balanceInCents + 100, revision: to.revision + 1, lastOperationId: id, updatedAt: serverTimestamp() });
  batch.set(quotaRef, { groupId, windowStartInMillis: window, count: quota.windowStartInMillis === window ? quota.count + 1 : 1, lastOperationId: id, updatedAt: serverTimestamp() });
  await assert.rejects(batch.commit(), error => (error as { code?: string }).code === 'permission-denied');
  assert.equal(await balance(investmentId), from.balanceInCents); assert.equal(await balance(secondBank), to.balanceInCents);
});

test('extrato permite estornar aporte e resgate nativos uma única vez sem apagar histórico', async () => {
  const beforeBank = await balance(secondBank), beforeInvestment = await balance(investmentId);
  for (const movement of ['deposit', 'redemption'] as const) {
    const state: SparkInvestmentFormState = {};
    await submitSparkInvestmentFormFirebase(firestore, state, { actorId: uid, accountId: investmentId, action: 'move', bankId: secondBank,
      selectedDate: civil, movement, amountInCents: 500 }, nextId);
    const operationId = state.intent!.command!.input.clientActionId;
    const period = [new Date(civil.getFullYear(), civil.getMonth(), 1), civil] as const;
    const statement = await readSparkStatementFirebase(firestore, uid, groupId, secondBank, ...period);
    const row = [...statement.expenses, ...statement.gains].find(row => row.sparkOperationId === operationId)!;
    assert.equal(row.sparkExecutionReference.family, 'pair');
    const command = await prepareSparkPairReversalFirebase(firestore, uid, row.sparkExecutionReference, nextId());
    await executeSparkPairReversalFirebase(firestore, command); await executeSparkPairReversalFirebase(firestore, command);
    assert.equal(await balance(secondBank), beforeBank); assert.equal(await balance(investmentId), beforeInvestment);
    const after = await readSparkStatementFirebase(firestore, uid, groupId, secondBank, ...period);
    const original = [...after.expenses, ...after.gains].find(row => row.sparkOperationId === operationId)!;
    assert.equal(original.sparkResolvedByOperationId, command.clientActionId);
    await assert.rejects(prepareSparkPairReversalFirebase(firestore, uid, row.sparkExecutionReference, nextId()), /disponível/);
  }
  const opening = (await readSparkAccountFirebase(firestore, uid, groupId, investmentId)).principal!.openingOperationId;
  await assert.rejects(prepareSparkPairReversalFirebase(firestore, uid, { source: 'live', family: 'pair', operationId: opening }, nextId()), /disponível/);
});
test('edição composta corrige principal e valor observado no mesmo commit e repete sem duplicar', async () => {
  const before = await readSparkAccountFirebase(firestore, uid, groupId, investmentId), bankBefore = await balance(secondBank);
  const state: SparkInvestmentFormState = {}, input: SparkInvestmentFormDraft = { ...metadata, bankId: secondBank, actorId: uid, action: 'edit', accountId: investmentId,
    principalInCents: 13000, observedValueInCents: 17000 };
  await submitSparkInvestmentFormFirebase(firestore, state, input, nextId);
  state.intent!.financialConfirmed = false; state.intent!.status = 'uncertain'; await submitSparkInvestmentFormFirebase(firestore, state, input, nextId);
  const after = await readSparkAccountFirebase(firestore, uid, groupId, investmentId);
  assert.equal(after.position.balanceInCents, 17000); assert.equal(after.position.revision, before.position.revision + 2);
  assert.equal(after.principal?.initialValueInCents, 13000); assert.equal(after.reference?.countedBalanceInCents, 17000);
  assert.equal(await balance(secondBank), bankBefore - 1000);
  const snapshot = await readSparkInvestmentPortfolioFirebase(firestore, uid, groupId);
  assert.equal(snapshot.investments[0].lastManualSyncValueInCents, 17000);
  assert.equal(snapshot.activity.syncs.at(-1)?.syncedValueInCents, 17000, JSON.stringify(snapshot.activity.syncs));
});
test('edição composta troca financiamento, mantém origem histórica e aceita avaliação zero', async () => {
  const oldBefore = await balance(secondBank), newBefore = await balance(firstBank);
  const state: SparkInvestmentFormState = {}, input: SparkInvestmentFormDraft = { ...metadata, bankId: firstBank, actorId: uid, action: 'edit', accountId: investmentId,
    principalInCents: 14000, observedValueInCents: 0 };
  await submitSparkInvestmentFormFirebase(firestore, state, input, nextId);
  const after = await readSparkAccountFirebase(firestore, uid, groupId, investmentId);
  assert.equal(after.position.balanceInCents, 0); assert.equal(after.reference?.countedBalanceInCents, 0);
  assert.equal(after.principal?.initialValueInCents, 14000); assert.equal(after.principal?.fundingAccountId, firstBank);
  assert.equal(await balance(secondBank), oldBefore + 13000); assert.equal(await balance(firstBank), newBefore - 14000);
  const snapshot = await readSparkInvestmentPortfolioFirebase(firestore, uid, groupId);
  assert.equal(snapshot.investments[0].personId, uid); assert.equal(snapshot.investments[0].lastManualSyncValueInCents, 0);
});
test('desfazer avaliação composta conserva financiamento e reenvio confirma o receipt antes da prova', async () => {
  const account = await readSparkAccountFirebase(firestore, uid, groupId, investmentId);
  const bankBefore = await balance(firstBank), state: SparkInvestmentFormState = {}, input: SparkInvestmentFormDraft = {
    actorId: uid, action: 'undo-valuation', accountId: investmentId, reason: 'Avaliação zero incorreta', originalOperationId: account.reference!.operationId, expectedRevision: account.position.revision };
  let result;
  do { result = await submitSparkInvestmentFormFirebase(firestore, state, input, nextId); } while (result && 'preparing' in result && result.preparing);
  assert.ok(result?.success); assert.equal(await balance(investmentId), 17000);
  state.intent!.financialConfirmed = false; state.intent!.status = 'uncertain';
  assert.equal((await submitSparkInvestmentFormFirebase(firestore, state, input, nextId))?.success, true);
  assert.equal(await balance(firstBank), bankBefore);
  const snapshot = await readSparkInvestmentPortfolioFirebase(firestore, uid, groupId);
  assert.equal(snapshot.investments[0].sparkCanUndoValuation, false); assert.equal(snapshot.investments[0].lastManualSyncValueInCents, 17000);
  assert.equal(snapshot.investments[0].initialValueInCents, 14000);
});
test('sincronização com resposta perdida não reaplica avaliação nem falha na própria revisão confirmada', async () => {
  const state: SparkInvestmentFormState = {}, input: SparkInvestmentFormDraft = { actorId: uid, action: 'sync', accountId: investmentId,
    selectedDate: civil, observedValueInCents: 18000, reason: 'manual' };
  let result;
  do { result = await submitSparkInvestmentFormFirebase(firestore, state, input, nextId); } while (result && 'preparing' in result && result.preparing);
  assert.ok(result?.success); state.intent!.financialConfirmed = false; state.intent!.status = 'uncertain';
  assert.equal((await submitSparkInvestmentFormFirebase(firestore, state, input, nextId))?.success, true);
  const committed = (await getDocFromServer(doc(firestore, 'financialGroups', groupId, 'sparkOperations', state.intent!.command!.input.clientActionId))).data()!;
  const proof = (await getDocFromServer(doc(firestore, 'financialGroups', groupId, 'sparkHistoryProofs', state.intent!.command!.input.clientActionId))).data()!;
  assert.equal(await balance(investmentId), 18000, JSON.stringify({ effectiveAt: committed.effectiveAt, createdAt: committed.createdAt,
    effect: committed.currentEffectInCents, baselineAt: proof.baselineAt, latestCheckpointAt: proof.latestCheckpointAt, asOf: proof.asOf }));
});

test('sincronização de hoje não fica antes da referência confirmada quando o cliente perde nanossegundos', async () => {
  const account = await readSparkAccountFirebase(firestore, uid, groupId, investmentId), reference = account.reference!.effectiveAt;
  const state: SparkInvestmentFormState = {}, input: SparkInvestmentFormDraft = { actorId: uid, action: 'sync', accountId: investmentId,
    selectedDate: toFinancialCivilDate(reference.toDate()), observedValueInCents: 19000, reason: 'manual' };
  let result;
  do { result = await submitSparkInvestmentFormFirebase(firestore, state, input, nextId, reference.toDate()); } while (result && 'preparing' in result && result.preparing);
  assert.ok(result?.success); assert.equal(await balance(investmentId), 19000);
  assert.ok(state.intent!.command?.kind === 'sync');
  assert.equal(state.intent!.command.input.observedAt.isEqual(reference), true);
});
