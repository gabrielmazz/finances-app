import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { createBank, readBank } from '../../firebase/banks';
import { archiveCategory, createCategory } from '../../firebase/categories';
import { createBankTransfer, createCashWithdrawal, createMovement, readMovement, readMovementPage, readMovementTimeline, readHistoricalMovement, readTransferCounterpartyName, updateMovement } from '../../firebase/movements';
import { isIncomeOrExpenseTotal } from '../../domain/movements';

let env: RulesTestEnvironment;
const uid = 'movement-owner', scope = { kind: 'personal' as const, id: uid, uid };
const bank1 = 'movementBank00000001', bank2 = 'movementBank00000002', gainTag = 'movementGainTag00001', expenseTag = 'movementCostTag00001';
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } }); });
after(async () => { await env.cleanup(); });

test('posted gains, expenses, edits, account changes and cancellation update balances atomically', async () => {
  const db = env.authenticatedContext(uid).firestore();
  const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof createMovement>[0];
  const bankInput = { name: 'Conta', institutionKey: 'outro-banco', institutionName: 'Banco', accountType: 'checking' as const, colorHex: null, initialBalanceCents: 100000, openingDate: '2025-01-01', reason: '' };
  const category = { name: 'Tipo', isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null };
  await createBank(client, scope, bank1, bankInput);
  await createBank(client, scope, bank2, { ...bankInput, name: 'Segunda', initialBalanceCents: 0 });
  await createCategory(client, scope, gainTag, { ...category, usageType: 'gain' });
  await createCategory(client, scope, expenseTag, { ...category, usageType: 'expense' });
  const input = { name: 'Pagamento', type: 'expense' as const, amountCents: 20000, accountId: bank1, categoryId: expenseTag, categorySource: 'new' as const, date: '2025-03-10', explanation: '', paymentFormats: [] };
  const gain = await createMovement(client, scope, 'movementGain00000001', { ...input, name: 'Receita', type: 'gain', amountCents: 50000, categoryId: gainTag });
  const expense = await createMovement(client, scope, 'movementCost00000001', input);
  assert.equal((await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents, 130000);
  assert.equal((await createMovement(client, scope, expense.id, input)).id, expense.id);
  assert.equal((await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents, 130000);
  const edited = await updateMovement(client, scope, expense, { ...input, amountCents: 30000 });
  assert.equal((await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents, 120000);
  await updateMovement(client, scope, gain, null);
  assert.equal((await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents, 70000);
  const moved = await updateMovement(client, scope, edited, { ...input, amountCents: 30000, accountId: bank2 });
  assert.equal(moved.id, expense.id);
  assert.equal((await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents, 100000);
  assert.equal((await readBank(client, scope, { id: bank2, source: 'new' })).balanceInCents, -30000);
  assert.equal((await readMovement(client, scope, gain.id)).status, 'cancelled');
  assert.ok((await readMovementPage(client, scope, { accountId: bank2 })).items.some(item => item.id === expense.id));
  await assert.rejects(createMovement(client, scope, 'movementWrong0000001', { ...input, categoryId: gainTag }));
  await assertFails(updateDoc(doc(db, 'financialContexts', `personal:${uid}`, 'bankAccounts', bank1), { balanceCents: 999999, balanceRevision: 20, lastMovementId: expense.id }));
  const other = env.authenticatedContext('movement-other').firestore();
  await assertFails(getDoc(doc(other, 'financialContexts', `personal:${uid}`, 'movements', expense.id)));
  await assertFails(updateDoc(doc(other, 'financialContexts', `personal:${uid}`, 'movements', expense.id), { status: 'cancelled', revision: 4, updatedBy: 'movement-other', updatedAt: serverTimestamp() }));
  const mandatoryId = 'mandatoryCostTag0001';
  await createCategory(client, scope, mandatoryId, { ...category, usageType: 'expense', isMandatoryExpense: true, showInBothLists: true });
  const mandatory = await createMovement(client, scope, 'mandatoryMovement001', { ...input, categoryId: mandatoryId, amountCents: 1, isFromMandatory: true });
  assert.equal(mandatory.type, 'expense');
  assert.equal(mandatory.isFromMandatory, true);
  assert.equal((await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents, 99999);
  await updateMovement(client, scope, mandatory, null);
  assert.equal((await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents, 100000);
  const mandatoryGainId = 'mandatoryGainTag0001';
  const mandatoryGainCategory = await createCategory(client, scope, mandatoryGainId, { ...category, usageType: 'gain', isMandatoryGain: true });
  const mandatoryGain = await createMovement(client, scope, 'mandatoryMovement002', { ...input, type: 'gain', categoryId: mandatoryGainId, amountCents: 10 });
  assert.equal(mandatoryGain.isFromMandatory, true);
  await assert.rejects(createMovement(client, scope, 'mandatoryMovement003', { ...input, type: 'gain', categoryId: mandatoryId }));
  assert.equal((await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents, 100010);
  await archiveCategory(client, scope, mandatoryGainCategory);
  assert.equal((await createMovement(client, scope, mandatoryGain.id, { ...input, type: 'gain', categoryId: mandatoryGainId, amountCents: 10 })).id, mandatoryGain.id);
  await updateMovement(client, scope, mandatoryGain, null);
});

test('concurrent independent movements do not lose updates and Rules reject forged balance writes', async () => {
  const db = env.authenticatedContext(uid).firestore();
  const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof createMovement>[0];
  const input = { name: 'Extra', type: 'gain' as const, amountCents: 100, accountId: bank1, categoryId: gainTag, categorySource: 'new' as const, date: '2025-03-10', explanation: '', paymentFormats: [] };
  await Promise.all([
    createMovement(client, scope, 'movementRace00000001', input),
    createMovement(client, scope, 'movementRace00000002', input),
  ]);
  assert.equal((await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents, 100200);
  const key = `personal:${uid}`;
  const target = doc(db, 'financialContexts', key, 'bankAccounts', bank1);
  const movementId = 'movementFake00000001';
  const forged = { schemaVersion: 1, scopeKind: 'personal', scopeId: uid, ...input, date: Timestamp.fromDate(new Date('2025-03-10T00:00:00Z')), status: 'posted', revision: 0, createdBy: uid, updatedBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await assertFails(setDoc(doc(db, 'financialContexts', key, 'movements', movementId), forged));
  const bank = (await getDoc(target)).data()!;
  const batch = writeBatch(db);
  batch.set(doc(db, 'financialContexts', key, 'movements', movementId), forged);
  batch.update(target, { balanceCents: bank.balanceCents + 9999, balanceRevision: bank.balanceRevision + 1, lastMovementId: movementId });
  await assertFails(batch.commit());
  assert.equal((await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents, 100200);
  const mismatch = writeBatch(db);
  mismatch.set(doc(db, 'financialContexts', key, 'movements', movementId), { ...forged, categoryId: expenseTag });
  mismatch.update(target, { balanceCents: bank.balanceCents + 100, balanceRevision: bank.balanceRevision + 1, lastMovementId: movementId });
  await assertFails(mismatch.commit());
  assert.equal((await getDoc(doc(db, 'financialContexts', key, 'movements', movementId))).exists(), false);
  const foreignAccount = writeBatch(db);
  foreignAccount.set(doc(db, 'financialContexts', key, 'movements', movementId), { ...forged, accountId: 'foreignBank000000001' });
  foreignAccount.update(target, { balanceCents: bank.balanceCents + 100, balanceRevision: bank.balanceRevision + 1, lastMovementId: movementId });
  await assertFails(foreignAccount.commit());
  const foreignCategory = writeBatch(db);
  foreignCategory.set(doc(db, 'financialContexts', key, 'movements', movementId), { ...forged, categoryId: 'otherContextTag00001' });
  foreignCategory.update(target, { balanceCents: bank.balanceCents + 100, balanceRevision: bank.balanceRevision + 1, lastMovementId: movementId });
  await assertFails(foreignCategory.commit());
  const archiveAndUse = writeBatch(db);
  archiveAndUse.update(doc(db, 'financialContexts', key, 'categories', gainTag), { status: 'archived', revision: 1, updatedBy: uid, updatedAt: serverTimestamp() });
  archiveAndUse.set(doc(db, 'financialContexts', key, 'movements', movementId), forged);
  archiveAndUse.update(target, { balanceCents: bank.balanceCents + 100, balanceRevision: bank.balanceRevision + 1, lastMovementId: movementId });
  await assertFails(archiveAndUse.commit());
  await assertFails(updateDoc(doc(db, 'financialContexts', key, 'movements', 'movementRace00000001'), { createdBy: 'someone-else', revision: 1, updatedBy: uid, updatedAt: serverTimestamp() }));
  const anonymous = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anonymous, 'financialContexts', key, 'movements', 'movementRace00000001')));
  assert.equal((await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents, 100200);
});

test('group authorization and compatible legacy categories are enforced by Rules', async () => {
  const groupId = 'movement-group', adminId = 'movement-admin', memberId = 'movement-member';
  const generation = 'testMovementAccess2026';
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'financialGroups', groupId), { status: 'active' });
    for (const [id, role] of [[adminId, 'admin'], [memberId, 'member']])
      await setDoc(doc(db, '_authorizations', id), { generation, enabled: true, readOwners: [], groups: { [groupId]: role } });
    await setDoc(doc(db, 'financialGroups', groupId, 'tags', 'legacy-both'), { name: 'Compartilhada', usageType: 'both' });
    await setDoc(doc(db, 'financialGroups', groupId, 'tags', 'legacy-untyped'), { name: 'Sem tipo' });
  });
  const db = env.authenticatedContext(adminId, { lumusAccess: generation }).firestore();
  const client = { db, auth: { currentUser: { uid: adminId } } } as unknown as Parameters<typeof createMovement>[0];
  const groupScope = { kind: 'group' as const, id: groupId, uid: adminId };
  const account = 'groupMovementBank001';
  await createBank(client, groupScope, account, { name: 'Grupo', institutionKey: 'outro-banco', institutionName: 'Banco', accountType: 'checking', colorHex: null, initialBalanceCents: 1000, openingDate: '2025-01-01', reason: '' });
  const input = { name: 'Conta compartilhada', type: 'expense' as const, amountCents: 125, accountId: account, categoryId: 'legacy-both', categorySource: 'group-legacy' as const, date: '2025-03-10', explanation: '', paymentFormats: [] };
  const created = await createMovement(client, groupScope, 'groupMovementItem001', input);
  assert.equal(created.type, 'expense');
  assert.equal((await readBank(client, groupScope, { id: account, source: 'new' })).balanceInCents, 875);
  await assert.rejects(createMovement(client, groupScope, 'groupMovementItem002', { ...input, categoryId: 'legacy-untyped' }));
  const member = env.authenticatedContext(memberId, { lumusAccess: generation }).firestore();
  const path = doc(member, 'financialContexts', `group:${groupId}`, 'movements', created.id);
  assert.equal((await getDoc(path)).exists(), true);
  await assertFails(updateDoc(path, { status: 'cancelled', revision: 1, updatedBy: memberId, updatedAt: serverTimestamp() }));
  const outsider = env.authenticatedContext('movement-outsider').firestore();
  await assertFails(getDoc(doc(outsider, 'financialContexts', `group:${groupId}`, 'movements', created.id)));
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), '_authorizations', memberId), { groups: {} });
  });
  await assertFails(getDoc(path));
});

test('repeating the same operation concurrently applies it once', async () => {
  const db = env.authenticatedContext(uid).firestore();
  const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof createMovement>[0];
  const before = (await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents!;
  const input = { name: 'Reenvio', type: 'gain' as const, amountCents: 123, accountId: bank1, categoryId: gainTag, categorySource: 'new' as const, date: '2025-03-10', explanation: '', paymentFormats: [] };
  const [first, second] = await Promise.all([
    createMovement(client, scope, 'movementSame00000001', input),
    createMovement(client, scope, 'movementSame00000001', input),
  ]);
  assert.equal(first.id, second.id);
  assert.equal((await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents, before + 123);
});

test('movement pages use stable cursors and exclude cancelled entries', async () => {
  const owner = 'pagination-movement-owner';
  const pageScope = { kind: 'personal' as const, id: owner, uid: owner };
  const accountId = 'paginationBank000001';
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const now = Timestamp.now();
    await setDoc(doc(db, 'financialContexts', `personal:${owner}`, 'bankAccounts', accountId), { scopeKind: 'personal', scopeId: owner });
    for (let i = 0; i < 26; i++) {
      const id = `pageMovement${String(i).padStart(8, '0')}`;
      await setDoc(doc(db, 'financialContexts', `personal:${owner}`, 'movements', id), {
        schemaVersion: 1, scopeKind: 'personal', scopeId: owner, name: `Página ${i}`, type: 'expense', amountCents: 1,
        accountId, categoryId: expenseTag, categorySource: 'new', date: Timestamp.fromDate(new Date('2025-03-10T00:00:00Z')),
        explanation: '', paymentFormats: [], status: i === 0 ? 'cancelled' : 'posted', revision: i === 0 ? 1 : 0,
        createdBy: owner, updatedBy: owner, createdAt: now, updatedAt: now,
      });
    }
  });
  const db = env.authenticatedContext(owner).firestore();
  const client = { db, auth: { currentUser: { uid: owner } } } as unknown as Parameters<typeof createMovement>[0];
  const first = await readMovementPage(client, pageScope, { accountId });
  assert.equal(first.items.length, 20);
  assert.ok(first.cursor);
  const second = await readMovementPage(client, pageScope, { accountId }, first.cursor);
  assert.equal(second.items.length, 5);
  assert.equal(second.cursor, null);
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 25);
  assert.ok([...first.items, ...second.items].every(item => item.status === 'posted'));
});

test('one transfer posts both ledger entries once and a cash withdrawal only debits its bank', async () => {
  const owner = 'bank-operation-owner', scope = { kind: 'personal' as const, id: owner, uid: owner };
  const db = env.authenticatedContext(owner).firestore();
  const client = { db, auth: { currentUser: { uid: owner } } } as unknown as Parameters<typeof createMovement>[0];
  const origin = 'operationOrigin00001', destination = 'operationTarget00001';
  const bank = { name: 'Conta de teste', institutionKey: 'outro-banco', institutionName: 'Banco', accountType: 'checking' as const, colorHex: null, initialBalanceCents: 117000, openingDate: '2025-01-01', reason: '' };
  await createBank(client, scope, origin, bank);
  await createBank(client, scope, destination, { ...bank, name: 'Conta de destino', initialBalanceCents: 50000 });
  const transferId = 'movementTransfer0001', withdrawalId = 'movementWithdraw0001';
  const transfer = { accountId: origin, destinationAccountId: destination, amountCents: 30000, date: '2025-03-10', explanation: '' };
  const balance = async (id: string) => (await readBank(client, scope, { id, source: 'new' })).balanceInCents;
  const context = `personal:${owner}`;
  const debitOnly = writeBatch(db);
  debitOnly.update(doc(db, 'financialContexts', context, 'bankAccounts', origin), { balanceCents: 87000, balanceRevision: 1, lastMovementId: transferId });
  debitOnly.set(doc(db, 'financialContexts', context, 'movements', transferId), {
    schemaVersion: 1, scopeKind: 'personal', scopeId: owner, operation: 'transfer-out', transferId,
    name: 'Transferência entre bancos', type: 'expense', amountCents: 30000, accountId: origin,
    date: Timestamp.fromDate(new Date('2025-03-10T00:00:00Z')), explanation: '', paymentFormats: [],
    status: 'posted', revision: 0, createdBy: owner, updatedBy: owner, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  await assertFails(debitOnly.commit());
  assert.deepEqual(await Promise.all([balance(origin), balance(destination)]), [117000, 50000]);

  await Promise.all([createBankTransfer(client, scope, transferId, transfer), createBankTransfer(client, scope, transferId, transfer)]);
  assert.deepEqual(await Promise.all([balance(origin), balance(destination)]), [87000, 80000]);
  await assert.rejects(createBankTransfer(client, scope, transferId, { ...transfer, amountCents: 31000 }));
  await assert.rejects(createBankTransfer(client, scope, 'movementTransfer0002', { ...transfer, destinationAccountId: origin }));
  await assert.rejects(createBankTransfer(client, scope, 'movementTransfer0003', { ...transfer, destinationAccountId: 'missingAccount000001' }));
  await assert.rejects(createBankTransfer(client, scope, 'movementTransfer0004', { ...transfer, amountCents: 87001 }));

  const withdrawal = { accountId: origin, amountCents: 7000, date: transfer.date, explanation: '' };
  await createCashWithdrawal(client, scope, withdrawalId, withdrawal);
  await createCashWithdrawal(client, scope, withdrawalId, withdrawal);
  assert.deepEqual(await Promise.all([balance(origin), balance(destination)]), [80000, 80000]);

  const from = new Date('2025-03-01T00:00:00Z'), to = new Date('2025-04-01T00:00:00Z');
  const source = await readMovementTimeline(client, scope, origin, from, to);
  const target = await readMovementTimeline(client, scope, destination, from, to);
  assert.equal(source.items.find(item => item.id === transferId)?.bankTransferDirection, 'outgoing');
  assert.equal(source.items.find(item => item.id === withdrawalId)?.isCashRescue, true);
  assert.equal(target.items.find(item => item.bankTransferPairId === transferId)?.bankTransferDirection, 'incoming');
  assert.equal(await readTransferCounterpartyName(client, scope, transferId, 'outgoing'), 'Conta de destino');
  assert.equal([...source.items, ...target.items].filter(isIncomeOrExpenseTotal).length, 0);
});


test('historical personal records retain their identifiers and never change balances', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, '_categoryScopes', 'legacy-tag-id'), { scopeKind: 'personal', scopeId: uid });
    await setDoc(doc(db, 'tags', 'legacy-tag-id'), { personId: uid, name: 'Categoria antiga', usageType: 'expense', status: 'archived' });
    await setDoc(doc(db, 'expenses', 'historical-expense'), { personId: uid, groupId: null, financialGroupId: null, ledgerGroupId: null, name: 'Antiga', valueInCents: 250, bankId: 'legacy-bank-id', tagId: 'legacy-tag-id', date: Timestamp.fromDate(new Date('2025-03-10T12:00:00Z')) });
    await setDoc(doc(db, 'expenses', 'ambiguous-expense'), { personId: uid, groupId: 'another-group', name: 'Ambígua', valueInCents: 250, bankId: 'legacy-bank-id', date: Timestamp.now() });
    await setDoc(doc(db, 'gains', 'misclassified-expense'), { personId: uid, groupId: null, financialGroupId: null, ledgerGroupId: null, name: 'Despesa obrigatória', valueInCents: 250, bankId: 'legacy-bank-id', tagId: 'legacy-tag-id', date: Timestamp.now() });
  });
  const db = env.authenticatedContext(uid).firestore();
  const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof createMovement>[0];
  const before = (await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents;
  const history = await readHistoricalMovement(client, scope, 'expense', 'historical-expense');
  assert.equal(history.id, 'historical-expense');
  assert.equal(history.accountId, 'legacy-bank-id');
  assert.equal(history.categoryId, 'legacy-tag-id');
  assert.equal(history.amountCents, 250);
  await assert.rejects(readHistoricalMovement(client, scope, 'expense', 'ambiguous-expense'));
  await assert.rejects(readHistoricalMovement(client, scope, 'gain', 'misclassified-expense'));
  assert.equal((await readBank(client, scope, { id: bank1, source: 'new' })).balanceInCents, before);
  const otherDb = env.authenticatedContext('movement-other').firestore();
  const other = { db: otherDb, auth: { currentUser: { uid: 'movement-other' } } } as unknown as Parameters<typeof createMovement>[0];
  await assert.rejects(readHistoricalMovement(other, { kind: 'personal', id: 'movement-other', uid: 'movement-other' }, 'expense', 'historical-expense'));
});
