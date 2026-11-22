import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { main } from '../../script/financial-migration';
import { createBank, readBank } from '../../firebase/banks';
import { createCategory } from '../../firebase/categories';
import { readMandatoryTemplate } from '../../firebase/mandatory';
import { cancelBankOperation, confirmMandatoryCycle, createBankTransfer, createCashWithdrawal, createMovement, newMovementId, readMovementPage, updateMovement } from '../../firebase/movements';
import type { AccountClient } from '../../firebase/profiles';
import { readEncryptedPayload } from '../../script/snapshot-encryption.cjs';
import { financialReleaseRules } from '../../script/financial-release-rules.cjs';
import type { reviewExceptions } from '../../script/financial-migration/review';
import { digest, type MigrationDocument } from '../../script/financial-migration/records';

const project = 'demo-lumus-foundation';
const bankId = 'ABCDEFGHIJ1234567890';
const date = Timestamp.fromDate(new Date('2026-01-14T02:03:04.123Z'));

test('a transição permite a leitura canônica e legada com gravação financeira fechada', async t => {
  const env = await initializeTestEnvironment({
    projectId: project, firestore: { host: '127.0.0.1', port: 8089, rules: financialReleaseRules().canary },
  });
  t.after(() => env.cleanup());
  await env.clearFirestore();
  const uid = 'canary-owner', scope = { kind: 'personal', id: uid, uid } as const;
  const root = 'financialContexts/personal:' + uid;
  await env.withSecurityRulesDisabled(async context => {
    await context.firestore().doc('banks/' + bankId).set({ personId: uid, name: 'Banco R' });
    await context.firestore().doc(root + '/bankAccounts/' + bankId).set({ name: 'Banco R' });
  });
  const db = env.authenticatedContext(uid).firestore();
  const foreign = env.authenticatedContext('canary-other').firestore();
  const client = { auth: { currentUser: { uid } }, db } as unknown as AccountClient;
  await assertSucceeds(db.collection('banks').where('personId', '==', uid).limit(20).get());
  await assertSucceeds(db.collection(root + '/bankAccounts').limit(20).get());
  await assertFails(foreign.doc(root + '/bankAccounts/' + bankId).get());
  await assertFails(db.doc('banks/' + bankId).update({ name: 'Alteração bloqueada' }));
  await assertFails(createBank(client, scope, 'LMNOPQRSTU1234567890', { name: 'Conta', institutionKey: 'outro-banco',
    institutionName: 'Banco', accountType: 'checking', colorHex: null, initialBalanceCents: 0, openingDate: '2026-01-14', reason: '' }));
});

test('estorna a transferência pelas duas pontas e o saque uma única vez', async t => {
  const env = await initializeTestEnvironment({
    projectId: project, firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync('security/financial-canonical.rules', 'utf8') },
  });
  t.after(() => env.cleanup());
  await env.clearFirestore();
  const uid = 'reversal-owner';
  const client = { auth: { currentUser: { uid } }, db: env.authenticatedContext(uid).firestore() } as unknown as AccountClient;
  const scope = { kind: 'personal', id: uid, uid } as const;
  const credit = 'QRSTUVWXYZ1234567890';
  const opening = { name: 'Conta', institutionName: 'Banco', institutionKey: 'outro-banco', accountType: 'checking' as const,
    colorHex: null, openingDate: '2026-01-14', reason: '' };
  await createBank(client, scope, bankId, { ...opening, initialBalanceCents: 100_000 });
  await createBank(client, scope, credit, { ...opening, initialBalanceCents: 50_000 });
  const transfer = newMovementId(client, scope), withdrawal = newMovementId(client, scope);
  const readBalances = async () => Promise.all([bankId, credit].map(async id =>
    (await readBank(client, scope, { source: 'new', id })).balanceInCents));
  await assert.rejects(createCashWithdrawal(client, scope, withdrawal, {
    accountId: credit, date: '2026-01-13', amountCents: 10_000, explanation: '',
  }), /movements\/before-opening/);
  await createBankTransfer(client, scope, transfer, {
    accountId: bankId, destinationAccountId: credit, date: opening.openingDate, amountCents: 30_000, explanation: '',
  });
  await createCashWithdrawal(client, scope, withdrawal, { accountId: credit, date: opening.openingDate, amountCents: 10_000, explanation: '' });
  assert.deepEqual(await readBalances(), [70_000, 70_000]);
  await cancelBankOperation(client, scope, transfer + '-credit');
  await cancelBankOperation(client, scope, transfer);
  assert.deepEqual(await readBalances(), [100_000, 40_000]);
  await cancelBankOperation(client, scope, withdrawal);
  await cancelBankOperation(client, scope, withdrawal);
  assert.deepEqual(await readBalances(), [100_000, 50_000]);
});

test('migra com escrita administrativa controlada e valida consultas e retomada pelo SDK e Rules', async () => {
  const env = await initializeTestEnvironment({
    projectId: project, firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync('security/financial-canonical.rules', 'utf8') },
  });
  await env.clearFirestore();
  const app = initializeApp({ apiKey: 'demo-key', projectId: project }, 'migration-auth');
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
  const uid = (await createUserWithEmailAndPassword(auth, 'migration-' + randomBytes(6).toString('hex') + '@example.invalid', 'Synthetic-password-1')).user.uid;
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'lumus-migration-'));
  const keys = fs.mkdtempSync(path.join(os.tmpdir(), 'lumus-migration-keys-'));
  const keyFile = path.join(keys, 'key');
  fs.writeFileSync(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 });
  const run = 'integration-fixture';
  const args = ['--run', run, '--project', project, '--manifest', path.join(sandbox, 'manifest.enc'),
    '--journal', path.join(sandbox, 'journal.json'), '--key', keyFile];
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      const batch = db.batch();
      batch.set(db.doc('banks/' + bankId), { personId: uid, name: 'Banco para preparar' });
      batch.set(db.doc('_bankScopes/' + bankId), { scopeKind: 'personal', scopeId: uid });
      batch.set(db.doc('tags/expense'), { personId: uid, name: 'Despesa histórica' });
      batch.set(db.doc('_categoryScopes/expense'), { scopeKind: 'personal', scopeId: uid });
      for (let index = 1; index <= 24; index++)
        batch.set(db.doc('expenses/expense-' + index), { personId: uid, date, bankId, tagId: 'expense', name: 'Despesa ' + index, valueInCents: index * 50 });
      await batch.commit();
    });

    const simulation = await main(args);
    assert.equal(simulation.mode, 'dry-run');
    assert('pending' in simulation && 'intendedCreates' in simulation);
    assert.equal(simulation.pending, 0);
    assert.equal(simulation.intendedCreates, 26);
    const owner = env.authenticatedContext(uid).firestore();
    const outsider = env.authenticatedContext('other').firestore();
    const root = 'financialContexts/personal:' + uid;
    await assertSucceeds(owner.doc(root + '/bankAccounts/' + bankId).get()).then(snapshot => assert.equal(snapshot.exists, false));
    await assert.rejects(main(['apply', ...args]), /explicit-run-confirmation-required/);
    const partial = await main(['apply', ...args, '--confirm', project + ':' + run + ':apply', '--batch-limit', '1']);
    assert('applied' in partial);
    assert.equal(partial.applied, 20);
    const resumed = await main(['resume', ...args, '--confirm', project + ':' + run + ':resume']);
    assert('applied' in resumed);
    assert.equal(resumed.applied, 26);
    const replay = await main(['resume', ...args, '--confirm', project + ':' + run + ':resume']);
    assert('applied' in replay);
    assert.equal(replay.applied, 26);
    const verified = await main(['verify', ...args]);
    assert('complete' in verified);
    assert.equal(verified.complete, true);

    const account = await assertSucceeds(owner.doc(root + '/bankAccounts/' + bankId).get());
    assert.equal(account.data()?.initialBalanceCents, undefined);
    assert.equal((await owner.doc(root + '/accountOpenings/' + bankId).get()).exists, false);
    const query = owner.collection(root + '/movements').where('accountId', '==', bankId).where('status', '==', 'posted')
      .orderBy('date', 'desc').orderBy('__name__', 'asc').limit(20);
    const first = await assertSucceeds(query.get());
    const second = await assertSucceeds(query.startAfter(first.docs[19]).get());
    assert.equal(first.size, 20);
    assert.equal(second.size, 4);
    assert.equal(new Set([...first.docs, ...second.docs].map(doc => doc.id)).size, 24);
    await assertFails(outsider.collection(root + '/movements').limit(20).get());
    await assertFails(owner.doc('banks/' + bankId).get());
    await assertFails(owner.doc(root + '/bankAccounts/' + bankId).update({ balanceCents: 9900 }));
    await assertFails(owner.doc(root + '/movements/' + first.docs[0].id).update({ status: 'cancelled' }));

    const rollback = await main(['rollback', ...args, '--confirm', project + ':' + run + ':rollback']);
    assert('reverted' in rollback);
    assert.equal(rollback.reverted, 26);
    assert.equal((await owner.doc(root + '/bankAccounts/' + bankId).get()).exists, false);
    await env.withSecurityRulesDisabled(async c => assert.equal((await c.firestore().doc('banks/' + bankId).get()).exists, true));

    const again = await main(['apply', ...args, '--journal', path.join(sandbox, 'reference-journal.json'), '--confirm', project + ':' + run + ':apply']);
    assert('applied' in again && again.applied === 26);
    const accountRef = owner.doc(root + '/bankAccounts/' + bankId);
    const openingRef = owner.doc(root + '/accountOpenings/' + bankId);
    const reference = Timestamp.fromDate(new Date('2026-11-06T01:15:00Z'));
    const change = { accountType: 'checking', initialBalanceCents: 42000, openingDate: reference, revision: 1,
      updatedBy: uid, updatedAt: serverTimestamp() };
    const event = { schemaVersion: 1, accountId: bankId, scopeKind: 'personal', scopeId: uid,
      type: 'reference', amountCents: 42000, date: reference, reason: '', confirmed: true,
      pendingReviewed: true, createdBy: uid, createdAt: serverTimestamp() };
    const floor = Timestamp.fromDate(new Date('2026-11-05T14:00:00Z'));
    const earlier = Timestamp.fromDate(new Date('2026-11-05T13:00:00Z'));
    await env.withSecurityRulesDisabled(c => c.firestore().doc(accountRef.path).update({ referenceNotBefore: floor }));
    await assertFails(owner.runTransaction(async transaction => {
      transaction.update(accountRef, { ...change, openingDate: earlier });
      transaction.set(openingRef, { ...event, date: earlier });
    }));
    await assertFails(accountRef.update(change));
    await assertFails(openingRef.set(event));
    await assertSucceeds(owner.runTransaction(async transaction => {
      transaction.update(accountRef, change);
      transaction.set(openingRef, event);
    }));
    assert.equal((await accountRef.get()).data()?.initialBalanceCents, 42000);
    assert.equal((await query.get()).size, 20);

    const client = { auth, db: owner } as unknown as AccountClient;
    const scope = { kind: 'personal', id: uid, uid } as const;
    const categoryId = 'referenceExpensesTag';
    await createCategory(client, scope, categoryId, { name: 'Despesas', usageType: 'expense', isMandatoryExpense: false,
      isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null });
    const id = newMovementId(client, scope);
    const input = { name: 'Despesa do dia', type: 'expense' as const, amountCents: 1234, accountId: bankId,
      categoryId, categorySource: 'new' as const, date: '2026-11-05', explanation: '', paymentFormats: [] };
    await assert.rejects(createMovement(client, scope, id, input), /movements\/reference-time-required/);
    await assert.rejects(createMovement(client, scope, id, { ...input, time: '22:14' }), /movements\/before-reference/);
    await assert.rejects(createMovement(client, scope, id, { ...input, time: '22:15' }), /movements\/before-reference/);
    const movementRef = owner.doc(root + '/movements/' + id);
    for (const time of ['2026-11-06T01:15:00Z', '2026-11-06T01:16:30Z', '2026-11-06T03:00:00Z']) {
      await assertFails(owner.runTransaction(async transaction => {
        transaction.update(accountRef, { balanceCents: 40766, balanceRevision: 1, lastMovementId: id });
        transaction.set(movementRef, { ...input, schemaVersion: 1, scopeKind: 'personal', scopeId: uid, status: 'posted', revision: 0,
          date: Timestamp.fromDate(new Date('2026-11-05T00:00:00Z')), occurredAt: Timestamp.fromDate(new Date(time)),
          createdBy: uid, updatedBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }));
    }
    const [posted, retry] = await Promise.all([createMovement(client, scope, id, { ...input, time: '22:16' }),
      createMovement(client, scope, id, { ...input, time: '22:16' })]);
    assert.equal(posted.time, '22:16');
    assert.deepEqual(retry, posted);
    assert.equal((await movementRef.get()).data()?.occurredAt.toDate().toISOString(), '2026-11-06T01:16:00.000Z');
    assert.equal((await accountRef.get()).data()?.balanceCents, 40766);
    const from = new Date('2026-11-05T00:00:00Z'), to = new Date('2026-11-06T00:00:00Z');
    const timeline = await readMovementPage(client, scope, { accountId: bankId, from, to });
    assert.deepEqual(timeline.items, [posted]);
    const edited = await updateMovement(client, scope, posted, { ...input, date: '2026-11-06' });
    assert.equal(edited.time, undefined);
    assert.equal((await movementRef.get()).data()?.occurredAt, undefined);
    await updateMovement(client, scope, edited, null);
    assert.equal((await accountRef.get()).data()?.balanceCents, 42000);

    await assert.rejects(main(['rollback', ...args, '--journal', path.join(sandbox, 'reference-journal.json'),
      '--confirm', project + ':' + run + ':rollback']), /source-or-destination-changed/);
  } finally {
    await deleteApp(app);
    await env.cleanup();
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.rmSync(keys, { recursive: true, force: true });
  }
});

test('reconcilia uma migração isolada com todas as operações, histórico e revogação de grupo', async t => {
  const env = await initializeTestEnvironment({
    projectId: project, firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync('security/financial-canonical.rules', 'utf8') },
  });
  t.after(() => env.cleanup());
  await env.clearFirestore();
  const app = initializeApp({ apiKey: 'demo-key', projectId: project }, 'migration-complete-auth');
  t.after(() => deleteApp(app));
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
  const uid = (await createUserWithEmailAndPassword(auth, 'complete-migration@example.invalid', 'Synthetic-password-1')).user.uid;
  const generation = 'synthetic-generation', group = 'migration-group';
  const grant = await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/projects/' + project + '/accounts:update', {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify({ lumusAccess: generation }) }),
  });
  assert.equal(grant.status, 200);
  const secondUid = (await createUserWithEmailAndPassword(auth, 'complete-migration-second@example.invalid', 'Synthetic-password-1')).user.uid;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lumus-migration-complete-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const run = 'full-rehearsal';
  const key = path.join(directory, 'key'), manifest = path.join(directory, 'manifest.enc');
  fs.writeFileSync(key, randomBytes(32), { mode: 0o600, flag: 'wx' });
  const baseArgs = ['--run', run, '--project', project, '--journal', path.join(directory, 'journal.json'), '--key', key];
  const accountB = 'KLMNOPQRST1234567890', groupAccount = 'UVWXABCDEFGHIJ123456';
  const secondAccount = 'J'.repeat(20);
  const recurringGain = 'A'.repeat(20), recurringExpense = 'B'.repeat(20);
  const recurringCash = 'H'.repeat(20);
  const gainOfCycle = 'C'.repeat(20), expenseOfCycle = 'D'.repeat(20);
  const transferOut = 'E'.repeat(20), transferIn = 'F'.repeat(20);
  const operation = { personId: uid, date, bankId, tagId: 'historical' };
  const pair = { personId: uid, date, valueInCents: 800, expenseId: transferOut, gainId: transferIn, sourceBankId: bankId, targetBankId: accountB };
  const leg = { ...operation, valueInCents: pair.valueInCents, isBankTransfer: true, bankTransferPairId: 'transfer',
    bankTransferSourceBankId: bankId, bankTransferTargetBankId: accountB, bankTransferExpenseId: transferOut, bankTransferGainId: transferIn };
  const cycle = { personId: uid, tagId: operation.tagId, valueInCents: 250, dueDay: 14 };
  const original = {
    ['banks/' + bankId]: { personId: uid, name: 'Conta A' },
    ['banks/' + accountB]: { personId: uid, name: 'Conta B' },
    ['banks/' + secondAccount]: { personId: secondUid, name: 'Conta do segundo login' },
    'tags/historical': { personId: uid, name: 'Categoria histórica', usageType: 'both', isMandatoryGain: true, isMandatoryExpense: true },
    'tags/second-login': { personId: secondUid, name: 'Categoria do segundo login', usageType: 'expense' },
    '_categoryScopes/second-login': { scopeKind: 'personal', scopeId: secondUid },
    'gains/income': { ...operation, name: 'Receita', valueInCents: 4000 },
    'expenses/bill': { ...operation, name: 'Despesa', valueInCents: 1200 },
    'expenses/second-bank': { ...operation, bankId: secondAccount, name: 'Despesa de conta confirmada', valueInCents: 350 },
    'expenses/crossed': { ...operation, tagId: 'second-login', name: 'Despesa conciliada', valueInCents: 150, explanation: 'Linha 1\nLinha 2' },
    'expenses/crossed-cash': { ...operation, bankId: null, moneyFormat: true, tagId: 'second-login',
      name: 'Dinheiro confirmado', valueInCents: 100 },
    'expenses/cash': { ...operation, bankId: null, moneyFormat: true, name: 'Despesa em dinheiro', valueInCents: 300 },
    ['gains/' + gainOfCycle]: { ...operation, name: 'Ganho obrigatório', valueInCents: 250, isFromMandatory: true },
    ['expenses/' + expenseOfCycle]: { ...operation, name: 'Gasto obrigatório', valueInCents: 250, isFromMandatory: true },
    ['mandatoryGains/' + recurringGain]: { ...cycle, name: 'Ganho obrigatório', lastReceiptCycle: '2026-01', lastReceiptGainId: gainOfCycle, lastReceiptDate: date },
    ['mandatoryExpenses/' + recurringExpense]: { ...cycle, name: 'Gasto obrigatório', lastPaymentCycle: '2026-01', lastPaymentExpenseId: expenseOfCycle, lastPaymentDate: date },
    ['mandatoryExpenses/' + recurringCash]: { ...cycle, tagId: 'second-login', name: 'Dinheiro confirmado', valueInCents: 100,
      lastPaymentCycle: '2026-01', lastPaymentExpenseId: 'crossed-cash', lastPaymentDate: date },
    'bankTransfers/transfer': pair,
    ['expenses/' + transferOut]: { ...leg, name: 'Transferência enviada', bankTransferDirection: 'outgoing' },
    ['gains/' + transferIn]: { ...leg, name: 'Transferência recebida', bankId: accountB, bankTransferDirection: 'incoming' },
    'cashRescues/withdrawal': { personId: uid, date, bankId: accountB, name: 'Saque', valueInCents: 400 },
    'monthlyBalances/reference': { personId: uid, bankId, month: 12, year: 2025, valueInCents: 47000 },
    ['financialGroups/' + group + '/accounts/' + groupAccount]: { personId: uid, name: 'Conta compartilhada' },
    ['financialGroups/' + group]: { status: 'active' },
    ['_authorizations/' + uid]: { enabled: true, generation, groups: { [group]: 'admin' }, readOwners: [] },
    ['_bankScopes/' + bankId]: { scopeKind: 'personal', scopeId: uid },
    ['_bankScopes/' + accountB]: { scopeKind: 'personal', scopeId: uid },
    ['_bankScopes/' + secondAccount]: { scopeKind: 'personal', scopeId: secondUid },
  };
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore(), batch = db.batch();
    for (const [path, fields] of Object.entries(original)) batch.set(db.doc(path), fields);
    await batch.commit();
  });
  const reviewFile = path.join(directory, 'review.enc');
  const draft = [...baseArgs, '--manifest', path.join(directory, 'draft.enc'), '--review-report', reviewFile];
  const blocked = await main(draft);
  assert('pending' in blocked && blocked.pending > 1);
  await assert.rejects(main(['apply', ...draft, '--confirm', project + ':' + run + ':apply']), /resolve-migration-pending-records/);
  const { report } = readEncryptedPayload(reviewFile, key, 'lumus-migration-encrypted-v1') as { report: ReturnType<typeof reviewExceptions> };
  assert.equal(report.decisions.length, 1);
  const [decision] = report.decisions;
  assert.equal(decision.path, 'tags/historical');
  const reviews = path.join(directory, 'approved-review.json');
  fs.writeFileSync(reviews, JSON.stringify([{ path: decision.path, sourceHash: decision.sourceHash,
    scope: { kind: 'personal', id: uid }, ownerUid: uid, evidence: 'Categoria criada pelo próprio titular na massa sintética' }]), { mode: 0o600 });
  const { baseline } = readEncryptedPayload(path.join(directory, 'draft.enc'), key, 'lumus-migration-encrypted-v1') as { baseline: MigrationDocument[] };
  const bankPath = 'banks/' + bankId, categoryPath = 'tags/second-login';
  const categoryReviews = path.join(directory, 'category-reviews.json');
  const categoryHash = digest(baseline.find(doc => doc.path === categoryPath));
  const cashPath = 'expenses/crossed-cash';
  const templatePath = 'mandatoryExpenses/' + recurringCash;
  const secondBankPath = 'banks/' + secondAccount, reviewedMovementPath = 'expenses/second-bank';
  fs.writeFileSync(categoryReviews, JSON.stringify([
    { bankPath, bankHash: digest(baseline.find(doc => doc.path === bankPath)), categoryPath, categoryHash,
      evidence: 'Conciliação sintética por conta e categoria' },
    { cashOwnerUid: uid, cashMovements: [{ path: cashPath, sourceHash: digest(baseline.find(doc => doc.path === cashPath)) }],
      categoryPath, categoryHash, evidence: 'Confirmação sintética do dinheiro sem conta' },
    { templatePath, templateHash: digest(baseline.find(doc => doc.path === templatePath)), categoryPath: decision.path,
      categoryHash: decision.sourceHash, evidence: 'Escolha sintética da categoria ativa para os próximos ciclos' },
    { bankPath: secondBankPath, bankHash: digest(baseline.find(doc => doc.path === secondBankPath)), categoryPath: decision.path,
      categoryHash: decision.sourceHash, evidence: 'Confirmação sintética da conta com autoria do primeiro login',
      bankMovements: [{ path: reviewedMovementPath, sourceHash: digest(baseline.find(doc => doc.path === reviewedMovementPath)) }] },
  ]), { mode: 0o600 });
  const args = [...baseArgs, '--manifest', manifest, '--reviews', reviews, '--category-reviews', categoryReviews];
  const simulation = await main(args);
  assert('pending' in simulation && 'intendedCreates' in simulation);
  assert.equal(simulation.pending, 0, JSON.stringify(simulation.byReason));
  assert.equal(simulation.intendedCreates, 22);
  assert.equal(simulation.historyBalanceAdjustmentCents, '0');
  const applied = await main(['apply', ...args, '--confirm', project + ':' + run + ':apply']);
  assert('applied' in applied && applied.applied === 22);
  const replay = await main(['resume', ...args, '--confirm', project + ':' + run + ':resume']);
  assert('applied' in replay && replay.applied === 22);
  const verification = await main(['verify', ...args]);
  assert('complete' in verification && verification.complete);

  const owner = env.authenticatedContext(uid, { lumusAccess: generation }).firestore();
  const scope = { kind: 'personal' as const, uid, id: uid };
  const root = 'financialContexts/personal:' + uid;
  const client = { auth: { currentUser: { uid } }, db: owner } as unknown as AccountClient;
  const movements = await assertSucceeds(owner.collection(root + '/movements').limit(20).get());
  const history = new Map(movements.docs.map(item => [item.data().historicalSourcePath, item]));
  assert.equal(movements.size, 10);
  assert.equal(history.get('expenses/' + transferOut)?.id, transferOut);
  assert.equal(history.get('gains/' + transferIn)?.id, transferOut + '-credit');
  assert.equal(history.get('cashRescues/withdrawal')?.data().operation, 'cash-withdrawal');
  assert.equal(history.get('expenses/cash')?.data().accountId, null);
  assert.equal(history.get('expenses/cash')?.data().moneyFormat, true);
  assert.equal(history.get('expenses/crossed')?.data().categoryId, 'second-login');
  assert.equal(history.get('expenses/crossed')?.data().historicalExplanation, 'Linha 1\nLinha 2');
  assert.equal(history.get(cashPath)?.data().categoryId, 'second-login');
  assert.equal(history.get(cashPath)?.data().accountId, null);
  assert.equal(history.get(cashPath)?.data().moneyFormat, true);
  assert.equal(history.get(cashPath)?.id, recurringCash + '-2026-01');
  const cashTemplate = await readMandatoryTemplate(client, scope, recurringCash);
  assert.equal(cashTemplate.categoryId, 'historical');
  assert.equal(cashTemplate.lastCycle, '2026-01');
  const archived = owner.doc(root + '/categories/second-login');
  assert.equal((await assertSucceeds(archived.get())).data()?.status, 'archived');
  const originalCategory = 'financialContexts/personal:' + secondUid + '/categories/second-login';
  await assertFails(owner.doc(originalCategory).get());
  const second = env.authenticatedContext(secondUid).firestore();
  assert.equal((await assertSucceeds(second.doc(originalCategory).get())).data()?.status, 'active');
  await assertFails(second.doc(archived.path).get());
  const secondRoot = 'financialContexts/personal:' + secondUid;
  const secondMoves = await assertSucceeds(second.collection(secondRoot + '/movements').limit(20).get());
  assert.equal(secondMoves.size, 1);
  assert.equal(secondMoves.docs[0].data().historicalSourcePath, reviewedMovementPath);
  assert.equal(secondMoves.docs[0].data().scopeId, secondUid);
  assert.equal(secondMoves.docs[0].data().accountId, secondAccount);
  assert.equal(secondMoves.docs[0].data().createdBy, uid);
  await assertFails(owner.doc(secondMoves.docs[0].ref.path).get());
  assert.equal((await assertSucceeds(second.doc(secondRoot + '/categories/historical').get())).data()?.status, 'archived');
  assert.equal((await assertSucceeds(second.doc(secondRoot + '/bankAccounts/' + secondAccount).get())).data()?.balanceCents, undefined);
  const ordinary = movements.docs.map(item => item.data()).filter(item => !item.operation);
  assert.equal(ordinary.filter(item => item.type === 'gain').reduce((sum, item) => sum + item.amountCents, 0), 4250);
  assert.equal(ordinary.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amountCents, 0), 2000);
  assert.equal((await readMandatoryTemplate(client, scope, recurringGain)).lastAmountCents, 250);
  assert.equal((await readMandatoryTemplate(client, scope, recurringExpense)).lastCycle, '2026-01');
  assert.equal((await readBank(client, scope, { source: 'new', id: bankId })).balanceInCents, null);
  assert.equal((await readBank(client, scope, { source: 'new', id: accountB })).balanceInCents, null);
  assert.equal((await owner.collection(root + '/accountOpenings').limit(20).get()).size, 0);
  await assertFails(owner.doc(root + '/bankAccounts/' + bankId).update({ balanceCents: 47000 }));
  await assertFails(owner.doc('gains/income').get());
  const grouped = 'financialContexts/group:' + group + '/bankAccounts/' + groupAccount;
  await assertSucceeds(owner.doc(grouped).get()).then(snapshot => assert.equal(snapshot.exists, true));
  await assertFails(env.authenticatedContext('outsider').firestore().doc(grouped).get());
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const path of Object.keys(original)) assert.equal((await db.doc(path).get()).exists, true);
    await db.doc('_authorizations/' + uid).update({ enabled: false });
  });
  await assertFails(owner.doc(grouped).get());
  await assertSucceeds(owner.doc(root + '/bankAccounts/' + bankId).get());
  const newBank = 'G'.repeat(20);
  await createBank(client, scope, newBank, { name: 'Conta para o próximo ciclo', institutionKey: 'outro-banco',
    institutionName: 'Banco de teste', accountType: 'checking', colorHex: null, initialBalanceCents: 1000, openingDate: '2026-01-01', reason: '' });
  const input = { type: 'expense' as const, accountId: newBank, categoryId: 'historical', categorySource: 'new' as const,
    name: cashTemplate.name, date: '2026-02-14', amountCents: 100, explanation: '', paymentFormats: [] };
  await assert.rejects(confirmMandatoryCycle(client, scope, recurringCash, { ...input, date: '2026-01-14' }), /unsupported-edit|cycle-already-confirmed/);
  assert.equal((await readBank(client, scope, { source: 'new', id: newBank })).balanceInCents, 1000);
  await confirmMandatoryCycle(client, scope, recurringCash, input);
  assert.equal((await readMandatoryTemplate(client, scope, recurringCash)).lastCycle, '2026-02');
  assert.equal((await readBank(client, scope, { source: 'new', id: newBank })).balanceInCents, 900);
});
