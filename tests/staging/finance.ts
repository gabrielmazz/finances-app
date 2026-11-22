import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, getDocFromServer, getDocsFromServer, getFirestore, limit, query, updateDoc } from 'firebase/firestore';
import { createBank, newBankOperationId, prepareLegacyReference, readBank, readBankPage, updateBank, archiveBank } from '../../firebase/banks';
import { createCategory, newCategoryId, readCategoryPage } from '../../firebase/categories';
import { cancelBankOperation, confirmMandatoryCycle, cancelMandatoryCycle, createBankTransfer, createCashWithdrawal, createMovement, hasCashHistory, newMovementId, readMovementTimeline, updateMovement } from '../../firebase/movements';
import { newMandatoryId, readMandatoryPage, readMandatoryTemplate, saveMandatoryTemplate } from '../../firebase/mandatory';
import { readFirebaseConfig, STAGING_PROJECT_ID } from '../../firebase/config';
import { loadProfile, saveProfileName } from '../../firebase/profiles';
import { watchFinancialGroup } from '../../firebase/financialContext';
import type { BankScope } from '../../domain/banks';
import { CASH_HISTORY_ID, type MovementInput } from '../../domain/movements';

const code = (error: unknown) => error instanceof Error ? error.message : '';
const denied = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'permission-denied';

async function stagingAdmin() {
  const auth = require('firebase-tools/lib/auth');
  auth.setActiveAccount({ project: STAGING_PROJECT_ID }, auth.getGlobalDefaultAccount());
  const token = await require('firebase-tools/lib/apiv2').getAccessToken();
  const base = 'https://firestore.googleapis.com/v1/projects/' + STAGING_PROJECT_ID + '/databases/(default)/documents/';
  const identity = 'https://identitytoolkit.googleapis.com/v1/projects/' + STAGING_PROJECT_ID + '/accounts:update';
  async function request(url: string, method: string, payload: object) {
    const response = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw Error('Synthetic staging setup HTTP ' + response.status);
  }
  return {
    grant: (uid: string, claims: { lumusAccess: string }) => request(identity, 'POST', { localId: uid, customAttributes: JSON.stringify(claims) }),
    set: (name: string, fields: object) => request(base + name, 'PATCH', { fields }),
  };
}

test('Firebase Spark real: operações, saldos, consultas e revogação com usuários sintéticos', { timeout: 240_000 }, async t => {
  assert.equal(process.env.EXPO_PUBLIC_FIREBASE_MODE, 'staging');
  assert(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const config = readFirebaseConfig({ mode: 'staging', apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY });
  assert.equal(config.options.projectId, STAGING_PROJECT_ID);
  const run = randomBytes(8).toString('hex');
  const a = initializeApp(config.options, 'staging-owner-' + run);
  const b = initializeApp(config.options, 'staging-member-' + run);
  const owner = { auth: getAuth(a), db: getFirestore(a) };
  const other = { auth: getAuth(b), db: getFirestore(b) };
  t.after(async () => { await Promise.all([deleteApp(a), deleteApp(b)]); });
  const user = (name: string) => 'mvp160-' + name + '-' + run + '@example.invalid';
  const password = 'A1-' + randomBytes(24).toString('base64url');
  const ownerUid = (await createUserWithEmailAndPassword(owner.auth, user('owner'), password)).user.uid;
  const otherUid = (await createUserWithEmailAndPassword(other.auth, user('member'), password)).user.uid;
  const scope: BankScope = { kind: 'personal', id: ownerUid, uid: ownerUid };
  const otherScope: BankScope = { kind: 'personal', id: otherUid, uid: otherUid };
  await saveProfileName(owner, ownerUid, 'Pessoa sintética', null);
  assert.equal((await loadProfile(owner, ownerUid))?.profile.name, 'Pessoa sintética');
  const day = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const accountA = newBankOperationId(owner, scope), accountB = newBankOperationId(owner, scope);
  const metadata = { institutionKey: 'outro-banco', institutionName: 'Banco fictício', accountType: 'checking' as const, colorHex: null };
  const opening = (name: string, initialBalanceCents: number) => ({ ...metadata, name, initialBalanceCents, openingDate: day, reason: '' });
  await createBank(owner, scope, accountA, opening('Banco A', 100_000));
  await createBank(owner, scope, accountB, opening('Banco B', 50_000));
  const balance = async (expectedA: number, expectedB: number) => {
    const result = await Promise.all([accountA, accountB].map(id => readBank(owner, scope, { id, source: 'new' })));
    assert.deepEqual(result.map(account => account.balanceInCents), [expectedA, expectedB]);
  };
  await balance(100_000, 50_000);
  const categoryData = { usageType: 'both' as const, name: 'Categoria sintética', isMandatoryExpense: true, isMandatoryGain: true,
    showInBothLists: true, iconFamily: null, iconName: null, iconStyle: null };
  const category = newCategoryId(owner, scope);
  await createCategory(owner, scope, category, categoryData);
  const operation = (type: MovementInput['type'], amountCents: number, name: string): MovementInput => ({ type, amountCents, name,
    accountId: accountA, categoryId: category, categorySource: 'new', date: day, explanation: '', paymentFormats: [] });
  const gain = operation('gain', 50_000, 'Receita de teste'), expense = operation('expense', 20_000, 'Despesa de teste');
  const gainId = newMovementId(owner, scope), expenseId = newMovementId(owner, scope), transferId = newMovementId(owner, scope);
  const withdrawalId = newMovementId(owner, scope);
  await t.test('receita, despesa, transferência e saque com saldo conferido após cada operação', async () => {
    await createMovement(owner, scope, gainId, gain); await balance(150_000, 50_000);
    await createMovement(owner, scope, expenseId, expense); await balance(130_000, 50_000);
    await createBankTransfer(owner, scope, transferId, { accountId: accountA, destinationAccountId: accountB, amountCents: 30_000, date: day, explanation: '' });
    await balance(100_000, 80_000);
    await createCashWithdrawal(owner, scope, withdrawalId, { accountId: accountB, amountCents: 10_000, date: day, explanation: '' });
    await balance(100_000, 70_000);
  });
  await t.test('reenvio, edição concorrente e cancelamento preservam o saldo', async () => {
    const oldGain = await createMovement(owner, scope, gainId, gain);
    const oldExpense = await createMovement(owner, scope, expenseId, expense);
    await balance(100_000, 70_000);
    await assert.rejects(createMovement(owner, scope, gainId, { ...gain, amountCents: 49_999 }), error => code(error).includes('operation-conflict'));
    const outcomes = await Promise.allSettled([
      updateMovement(owner, scope, oldGain, { ...gain, amountCents: 55_000 }),
      updateMovement(owner, scope, oldGain, { ...gain, amountCents: 55_000, name: 'Receita concorrente' }),
    ]);
    const accepted = outcomes.filter(result => result.status === 'fulfilled');
    assert.equal(accepted.length, 1);
    await balance(105_000, 70_000);
    const editedExpense = await updateMovement(owner, scope, oldExpense, { ...expense, amountCents: 19_000 });
    await balance(106_000, 70_000);
    await updateMovement(owner, scope, accepted[0].value, null);
    await balance(51_000, 70_000);
    await updateMovement(owner, scope, editedExpense, null);
    await balance(70_000, 70_000);
    await updateMovement(owner, scope, editedExpense, null);
    await balance(70_000, 70_000);
    const additions = [100, 200].map(amount => createMovement(owner, scope, newMovementId(owner, scope), operation('gain', amount, 'Receita paralela ' + amount)));
    await Promise.all(additions); await balance(70_300, 70_000);
  });
  await t.test('modelos obrigatórios de ganho e gasto, confirmação e estorno manual', async () => {
    for (const type of ['gain', 'expense'] as const) {
      const name = type === 'gain' ? 'Ganho obrigatório' : 'Gasto obrigatório';
      const id = newMandatoryId(owner, scope), input = operation(type, 500, name);
      await saveMandatoryTemplate(owner, scope, id, { type, name, valueInCents: 500, categoryId: category, categorySource: 'new',
        description: '', dueDay: 10, usesBusinessDays: false, installmentTotal: null, installmentStartDate: null, installmentTotalValueInCents: null }, null);
      assert((await readMandatoryPage(owner, scope, type)).items.some(item => item.id === id));
      await confirmMandatoryCycle(owner, scope, id, input);
      await balance(type === 'gain' ? 70_800 : 69_800, 70_000);
      const template = await readMandatoryTemplate(owner, scope, id);
      await cancelMandatoryCycle(owner, scope, id, template.lastCycle!, template.revision);
      await balance(70_300, 70_000);
    }
  });
  await t.test('Home, extrato, paginação e nova sessão no SDK cliente', async () => {
    for (let index = 0; index < 21; index++) await createMovement(owner, scope, newMovementId(owner, scope), operation('gain', 1, 'Página ' + index));
    await balance(70_321, 70_000);
    const from = new Date(day + 'T00:00:00Z'), to = new Date(from.getTime() + 86_400_000);
    const page = await readMovementTimeline(owner, scope, null, from, to, null, [accountA, accountB]);
    assert.equal(page.items.length, 20);
    const next = await readMovementTimeline(owner, scope, null, from, to, page.cursor, [accountA, accountB]);
    assert.equal(new Set([...page.items, ...next.items].map(item => item.id)).size, 26);
    assert([...page.items, ...next.items].some(item => item.isCashRescue));
    assert.equal((await readMovementTimeline(owner, scope, accountB, from, to)).items.length, 2);
    assert.equal((await readBankPage(owner, scope, 'new', 'active')).banks.length, 2);
    assert.equal((await readCategoryPage(owner, scope, 'new')).items.length, 1);
    await signOut(owner.auth);
    await assert.rejects(readBank(owner, scope, { id: accountA, source: 'new' }), error => code(error) === 'session/changed');
    assert.equal((await signInWithEmailAndPassword(owner.auth, user('owner'), password)).user.uid, ownerUid);
    await balance(70_321, 70_000);
  });
  await t.test('entradas inválidas, fronteiras de acesso e saldo direto são recusados', async () => {
    const root = 'financialContexts/personal:' + ownerUid;
    const ref = doc(owner.db, root, 'bankAccounts', accountA);
    await assert.rejects(updateDoc(ref, { balanceCents: 1 }), denied);
    await assert.rejects(updateDoc(ref, { scopeId: otherUid }), denied);
    await assert.rejects(updateDoc(ref, { createdBy: otherUid }), denied);
    await assert.rejects(getDocsFromServer(query(collection(other.db, root, 'movements'), limit(20))), denied);
    for (const values of [{ amountCents: 0 }, { accountId: newBankOperationId(owner, scope) }, { categoryId: newCategoryId(other, otherScope) }])
      await assert.rejects(createMovement(owner, scope, newMovementId(owner, scope), { ...gain, ...values }));
    await assert.rejects(createBankTransfer(owner, scope, newMovementId(owner, scope), { accountId: accountA, destinationAccountId: accountA, amountCents: 1, date: day, explanation: '' }));
    const foreignBank = newBankOperationId(other, otherScope);
    await createBank(other, otherScope, foreignBank, opening('Conta de outro contexto', 0));
    await assert.rejects(createBankTransfer(owner, scope, newMovementId(owner, scope), { accountId: accountA, destinationAccountId: foreignBank, amountCents: 1, date: day, explanation: '' }));
    const scratch = newBankOperationId(owner, scope);
    const opened = await createBank(owner, scope, scratch, opening('Conta sem saldo', 0));
    const edited = await updateBank(owner, scope, opened, opened.revision, { ...metadata, name: 'Edição de banco' });
    await archiveBank(owner, scope, edited, edited.revision);
    await balance(70_321, 70_000);
  });
  await t.test('compartilhamento e revogação no Firebase real', async () => {
    const admin = await stagingAdmin();
    const projectGroup = 'staging-group-' + run;
    const generation = 'staging-' + run;
    const s = (stringValue: string) => ({ stringValue });
    const grant = (role: 'admin' | 'member', enabled = true) => ({ generation: s(generation), enabled: { booleanValue: enabled },
      groups: { mapValue: { fields: { [projectGroup]: s(role) } } }, readOwners: { arrayValue: { values: [] } } });
    await admin.set('financialGroups/' + projectGroup, { status: s('active') });
    await Promise.all([
      admin.set('_authorizations/' + ownerUid, grant('admin')), admin.set('_authorizations/' + otherUid, grant('member')),
      admin.grant(ownerUid, { lumusAccess: generation }), admin.grant(otherUid, { lumusAccess: generation }),
    ]);
    await Promise.all([owner.auth.currentUser!.getIdToken(true), other.auth.currentUser!.getIdToken(true)]);
    const group: BankScope = { kind: 'group', id: projectGroup, uid: ownerUid }, member = { ...group, uid: otherUid };
    const groupId = newBankOperationId(owner, group);
    await createBank(owner, group, groupId, opening('Conta compartilhada', 777));
    assert.equal((await readBank(other, member, { source: 'new', id: groupId })).balanceInCents, 777);
    await assert.rejects(createBank(other, member, newBankOperationId(other, member), opening('Sem permissão de edição', 0)), denied);
    const observed = Promise.withResolvers<'admin' | 'member'>();
    const revoked = Promise.withResolvers<void>();
    const stop = watchFinancialGroup(other, otherUid, projectGroup, observed.resolve, revoked.resolve);
    const deadline = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(Error('A atualização do grupo não chegou pelo listener.')), 15_000);
      t.after(() => clearTimeout(timer));
    });
    t.after(stop);
    assert.equal(await Promise.race([observed.promise, deadline]), 'member');
    await admin.set('_authorizations/' + otherUid, grant('member', false));
    await Promise.race([revoked.promise, deadline]);
    stop();
    await assert.rejects(readBank(other, member, { id: groupId, source: 'new' }), denied);
    await assert.rejects(getDocFromServer(doc(other.db, 'financialContexts', 'group:' + projectGroup, 'bankAccounts', groupId)), denied);
  });

  await t.test('saldo de referência com minuto confirmado e lançamento no mesmo dia', async () => {
    const admin = await stagingAdmin();
    const id = newBankOperationId(owner, scope);
    const s = (stringValue: string) => ({ stringValue });
    const referenceAt = new Date(new Date(day + 'T00:00:00Z').getTime() + 25 * 3_600_000 + 15 * 60_000);
    const date = { timestampValue: day + 'T12:00:00Z' };
    const bank = { ...metadata, name: 'Conta migrada sintética' };
    const root = 'financialContexts/personal:' + ownerUid;
    await admin.set(root + '/bankAccounts/' + id, {
      schemaVersion: { integerValue: '1' }, scopeKind: s('personal'), scopeId: s(ownerUid),
      name: s(bank.name), institutionKey: s(bank.institutionKey), institutionName: s(bank.institutionName),
      accountType: s(bank.accountType), colorHex: { nullValue: null }, status: s('active'), revision: { integerValue: '0' },
      createdBy: s(ownerUid), updatedBy: s(ownerUid), createdAt: date, updatedAt: date,
      historicalSourcePath: s('banks/' + id), referenceNotBefore: date,
    });
    const reference = { ...bank, initialBalanceCents: 10_000, referenceAt, reason: '', confirmed: true, pendingReviewed: true };
    assert.equal((await readBank(owner, scope, { source: 'new', id })).balanceInCents, null);
    assert.equal((await prepareLegacyReference(owner, scope, id, reference)).balanceInCents, 10_000);
    assert.equal((await prepareLegacyReference(owner, scope, id, reference)).balanceInCents, 10_000);
    const movementId = newMovementId(owner, scope);
    const input = { ...expense, accountId: id, amountCents: 999 };
    await assert.rejects(createMovement(owner, scope, movementId, input), /reference-time-required/);
    await assert.rejects(createMovement(owner, scope, movementId, { ...input, time: '22:15' }), /before-reference/);
    const movement = await createMovement(owner, scope, movementId, { ...input, time: '22:16' });
    assert.deepEqual(await createMovement(owner, scope, movementId, { ...input, time: '22:16' }), movement);
    const from = new Date(day + 'T00:00:00Z'), to = new Date(from.getTime() + 86_400_000);
    const statement = await readMovementTimeline(owner, scope, id, from, to);
    assert.deepEqual(statement.items.map(item => [item.id, item.valueInCents, item.date?.getHours()]), [[movementId, 999, 22]]);
    assert.equal((await readBank(owner, scope, { source: 'new', id })).balanceInCents, 9001);
    await assert.rejects(readBank(other, otherScope, { source: 'new', id }), /not-found/);
  });
  await t.test('estorna o saque e as duas pontas da transferência com reenvio', async () => {
    await cancelBankOperation(owner, scope, transferId + '-credit');
    await cancelBankOperation(owner, scope, transferId);
    await balance(100_321, 40_000);
    await cancelBankOperation(owner, scope, withdrawalId);
    await cancelBankOperation(owner, scope, withdrawalId);
    await balance(100_321, 50_000);
  });

  await t.test('extrato em dinheiro consulta o histórico sem banco pelo índice publicado', async () => {
    assert.equal(await hasCashHistory(owner, scope), false);
    const admin = await stagingAdmin();
    const s = (stringValue: string) => ({ stringValue });
    const root = 'financialContexts/personal:' + ownerUid;
    const date = { timestampValue: day + 'T12:00:00Z' };
    await admin.set(root + '/movements/HistoricalCash000001', {
      schemaVersion: { integerValue: '1' }, scopeKind: s('personal'), scopeId: s(ownerUid),
      name: s('Dinheiro em espécie'), type: s('expense'), amountCents: { integerValue: '987' },
      accountId: { nullValue: null }, categoryId: s(category), categorySource: s('new'), date,
      status: s('posted'), revision: { integerValue: '0' }, explanation: s(''), paymentFormats: { arrayValue: {} },
      createdBy: s(ownerUid), updatedBy: s(ownerUid), createdAt: date, updatedAt: date, historicalSourcePath: s('expenses/synthetic-cash'),
      moneyFormat: { booleanValue: true },
    });
    const from = new Date(day + 'T00:00:00Z'), to = new Date(from.getTime() + 86_400_000);
    assert.equal(await hasCashHistory(owner, scope), true);
    const page = await readMovementTimeline(owner, scope, CASH_HISTORY_ID, from, to);
    assert.deepEqual(page.items.map(item => [item.type, item.valueInCents, item.bankId]), [['expense', 987, null]]);
    assert.equal(await hasCashHistory(other, otherScope), false);
    await balance(100_321, 50_000);
  });

  await t.test('segundo login opera e conserva histórico próprio', async () => {
    await saveProfileName(other, otherUid, 'Segunda pessoa sintética', null);
    assert.equal((await loadProfile(other, otherUid))?.profile.name, 'Segunda pessoa sintética');
    const first = newBankOperationId(other, otherScope), second = newBankOperationId(other, otherScope);
    await createBank(other, otherScope, first, opening('Banco A da segunda conta', 100_000));
    await createBank(other, otherScope, second, opening('Banco B da segunda conta', 50_000));
    const tag = newCategoryId(other, otherScope);
    await createCategory(other, otherScope, tag, categoryData);
    const firstGain = { ...gain, accountId: first, categoryId: tag };
    const firstExpense = { ...expense, accountId: first, categoryId: tag };
    const postedGain = await createMovement(other, otherScope, newMovementId(other, otherScope), firstGain);
    const postedExpense = await createMovement(other, otherScope, newMovementId(other, otherScope), firstExpense);
    await createBankTransfer(other, otherScope, newMovementId(other, otherScope), {
      accountId: first, destinationAccountId: second, amountCents: 30_000, date: day, explanation: '',
    });
    await createCashWithdrawal(other, otherScope, newMovementId(other, otherScope), {
      accountId: second, amountCents: 10_000, date: day, explanation: '',
    });
    const otherBalance = async (accountId: string) => (await readBank(other, otherScope, { source: 'new', id: accountId })).balanceInCents;
    assert.deepEqual(await Promise.all([otherBalance(first), otherBalance(second)]), [100_000, 70_000]);
    const id = newMandatoryId(other, otherScope);
    await saveMandatoryTemplate(other, otherScope, id, { type: 'expense', name: 'Compromisso próprio', valueInCents: 500,
      categoryId: tag, categorySource: 'new', description: '', dueDay: 10, usesBusinessDays: false,
      installmentTotal: null, installmentStartDate: null, installmentTotalValueInCents: null }, null);
    await confirmMandatoryCycle(other, otherScope, id, { ...firstExpense, name: 'Compromisso próprio', amountCents: 500 });
    assert.equal(await otherBalance(first), 99_500);
    await updateMovement(other, otherScope, postedGain, { ...firstGain, amountCents: 51_000 });
    await updateMovement(other, otherScope, postedExpense, null);
    assert.equal(await otherBalance(first), 120_500);
    assert((await readCategoryPage(other, otherScope, 'new')).items.some(item => item.id === tag));
    const from = new Date(day + 'T00:00:00Z'), to = new Date(from.getTime() + 86_400_000);
    assert.equal((await readMovementTimeline(other, otherScope, first, from, to)).items.length, 3);
    await signOut(other.auth);
    await assert.rejects(readBank(other, otherScope, { id: first, source: 'new' }), error => code(error) === 'session/changed');
    assert.equal((await signInWithEmailAndPassword(other.auth, user('member'), password)).user.uid, otherUid);
    assert.equal(await otherBalance(first), 120_500);
    await signOut(other.auth);
    await signOut(owner.auth);
  });
});
