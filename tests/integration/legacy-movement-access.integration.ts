import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, serverTimestamp, Timestamp, where } from 'firebase/firestore';

let env: RulesTestEnvironment;
const generation = 'legacy-movement-access-2026';
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'financialGroups', 'legacy-group'), { status: 'active' });
    await setDoc(doc(db, '_authorizations', 'legacy-member'), { generation, enabled: true, readOwners: [], groups: { 'legacy-group': 'member' } });
    const record = { name: 'Histórico', valueInCents: 100, personId: 'legacy-creator', bankId: 'legacy-bank', tagId: 'legacy-tag', date: Timestamp.fromDate(new Date('2025-01-01T12:00:00Z')) };
    await setDoc(doc(db, 'expenses', 'legacy-personal'), { ...record, groupId: null, financialGroupId: null, ledgerGroupId: null });
    await setDoc(doc(db, 'expenses', 'legacy-missing'), record);
    await setDoc(doc(db, 'expenses', 'legacy-shared'), { ...record, groupId: 'legacy-group', financialGroupId: 'legacy-group', ledgerGroupId: 'legacy-group' });
    await setDoc(doc(db, 'financialGroups', 'legacy-group', 'movements', 'verified-movement'), { ...record, type: 'expense', categorySource: 'group-legacy' });
    await setDoc(doc(db, 'financialGroups', 'legacy-group', 'movements', 'verified-no-source'), { ...record, type: 'expense' });
    await setDoc(doc(db, 'financialGroups', 'legacy-group', 'tags', 'legacy-tag'), { name: 'Categoria do grupo', usageType: 'expense' });
  });
});
after(async () => env.cleanup());

test('legacy group movements require current participation even for their creator', async () => {
  const creator = env.authenticatedContext('legacy-creator').firestore();
  const member = env.authenticatedContext('legacy-member', { lumusAccess: generation }).firestore();
  const anonymous = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(creator, 'expenses', 'legacy-personal')));
  await assertFails(getDoc(doc(creator, 'expenses', 'legacy-missing')));
  await assertFails(getDoc(doc(creator, 'expenses', 'legacy-shared')));
  await assertFails(getDoc(doc(member, 'expenses', 'legacy-shared')));
  await assertSucceeds(getDoc(doc(member, 'financialGroups', 'legacy-group', 'movements', 'verified-movement')));
  await assertFails(getDoc(doc(anonymous, 'expenses', 'legacy-personal')));
});

test('legacy personal listing is bounded and proves absence of group association', async () => {
  const db = env.authenticatedContext('legacy-creator').firestore();
  const base = collection(db, 'expenses');
  await assertFails(getDocs(query(base, where('personId', '==', 'legacy-creator'), limit(20))));
  const allowed = query(base, where('personId', '==', 'legacy-creator'), where('groupId', '==', null), where('financialGroupId', '==', null), where('ledgerGroupId', '==', null), limit(20));
  const visible = await assertSucceeds(getDocs(allowed));
  assert.deepEqual(visible.docs.map(item => item.id), ['legacy-personal']);
});

test('the statement merges new and authorized legacy pages without changing balances', async () => {
  const { createBank, readBank } = await import('../../firebase/banks');
  const { createCategory } = await import('../../firebase/categories');
  const { createMovement, readMovementTimeline } = await import('../../firebase/movements');
  const uid = 'timeline-owner', scope = { kind: 'personal' as const, id: uid, uid };
  const bank = 'timelineBank00000001', tag = 'timelineTag000000001';
  const db = env.authenticatedContext(uid).firestore();
  const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof createMovement>[0];
  await createBank(client, scope, bank, { name: 'Conta', institutionKey: 'outro-banco', institutionName: 'Banco', accountType: 'checking', colorHex: null, initialBalanceCents: 100000, openingDate: '2025-01-01', reason: '' });
  await createCategory(client, scope, tag, { name: 'Nova', usageType: 'gain', isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null });
  await createMovement(client, scope, 'timelineMovement0001', { name: 'Nova receita', type: 'gain', amountCents: 500, accountId: bank, categoryId: tag, categorySource: 'new', date: '2025-03-10', explanation: '', paymentFormats: [] });
  await env.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await setDoc(doc(store, '_categoryScopes', 'timeline-legacy-tag'), { scopeKind: 'personal', scopeId: uid });
    await setDoc(doc(store, 'tags', 'timeline-legacy-tag'), { personId: uid, name: 'Categoria histórica', usageType: 'expense', status: 'archived' });
    for (let i = 0; i < 25; i++) {
      await setDoc(doc(store, 'expenses', `timeline-legacy-${String(i).padStart(2, '0')}`), {
        personId: uid, bankId: bank, tagId: 'timeline-legacy-tag', groupId: null, financialGroupId: null, ledgerGroupId: null,
        name: `Despesa antiga ${i}`, valueInCents: 100 + i, date: Timestamp.fromDate(new Date(Date.UTC(2025, 2, 1 + i, 3))),
      });
    }
    await setDoc(doc(store, 'expenses', 'timeline-unverified-group'), { personId: uid, bankId: bank, tagId: 'timeline-legacy-tag', groupId: 'legacy-group', financialGroupId: 'legacy-group', ledgerGroupId: 'legacy-group', name: 'Alheio', valueInCents: 100, date: Timestamp.fromDate(new Date('2025-03-11T00:00:00Z')) });
    const base = { personId: uid, bankId: bank, tagId: 'timeline-legacy-tag', groupId: null, financialGroupId: null, ledgerGroupId: null, name: 'Limite', valueInCents: 1 };
    await setDoc(doc(store, 'expenses', 'timeline-before'), { ...base, date: Timestamp.fromDate(new Date('2025-03-01T02:59:59Z')) });
    await setDoc(doc(store, 'expenses', 'timeline-last'), { ...base, date: Timestamp.fromDate(new Date('2025-04-01T02:59:59Z')) });
    await setDoc(doc(store, 'expenses', 'timeline-after'), { ...base, date: Timestamp.fromDate(new Date('2025-04-01T03:00:00Z')) });
    await setDoc(doc(store, 'expenses', 'timeline-unknown-category'), { ...base, tagId: 'unverified-category', date: Timestamp.fromDate(new Date('2025-03-20T12:00:00Z')) });
    await setDoc(doc(store, 'expenses', 'timeline-unpaid'), { ...base, isPaid: false, date: Timestamp.fromDate(new Date('2025-03-20T13:00:00Z')) });
  });
  const before = (await readBank(client, scope, { id: bank, source: 'new' })).balanceInCents;
  const from = new Date('2025-03-01T00:00:00Z'), to = new Date('2025-04-01T00:00:00Z');
  let cursor = null as Awaited<ReturnType<typeof readMovementTimeline>>['cursor'];
  const records = [] as Awaited<ReturnType<typeof readMovementTimeline>>['items'];
  let pages = 0, issues = 0;
  do {
    const page: Awaited<ReturnType<typeof readMovementTimeline>> = await readMovementTimeline(client, scope, bank, from, to, cursor);
    pages++; issues += page.issues; records.push(...page.items); cursor = page.cursor;
    if (pages > 8) throw Error('Pagination did not terminate');
  } while (cursor);
  assert.ok(pages >= 2);
  assert.equal(issues, 2);
  assert.equal(records.length, 27);
  assert.equal(new Set(records.map(item => `${item.storageSource}:${item.id}`)).size, 27);
  assert.ok(records.some(item => item.id === 'timelineMovement0001' && item.storageSource === 'new'));
  assert.ok(records.some(item => item.id === 'timeline-legacy-00' && item.tagId === 'legacy:timeline-legacy-tag' && item.date?.getFullYear() === 2025 && item.date?.getMonth() === 2 && item.date?.getDate() === 1 && item.date?.getHours() === 0));
  assert.ok(records.some(item => item.id === 'timeline-last'));
  assert.ok(!records.some(item => item.id === 'timeline-before' || item.id === 'timeline-after'));
  assert.ok(records.every((item, i) => i === 0 || records[i - 1].date!.getTime() >= item.date!.getTime()));
  assert.equal((await readBank(client, scope, { id: bank, source: 'new' })).balanceInCents, before);
});


test('group members can page authorized group history; removed members cannot', async () => {
  const { readMovementTimeline } = await import('../../firebase/movements');
  const uid = 'legacy-member', scope = { kind: 'group' as const, id: 'legacy-group', uid };
  const db = env.authenticatedContext(uid, { lumusAccess: generation }).firestore();
  const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof readMovementTimeline>[0];
  const page = await readMovementTimeline(client, scope, 'legacy-bank', new Date('2024-12-01T00:00:00Z'), new Date('2025-02-01T00:00:00Z'));
  assert.ok(page.items.some(item => item.id === 'verified-movement' && item.storageSource === 'group-legacy' && item.type === 'expense'));
  assert.ok(page.items.some(item => item.id === 'verified-no-source' && item.tagId === 'group-legacy:legacy-tag'));
  await env.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), '_authorizations', uid), { generation, enabled: true, readOwners: [], groups: {} }));
  await assertFails(getDoc(doc(db, 'financialGroups', 'legacy-group', 'movements', 'verified-movement')));
});


test('legacy balances are not inferred from snapshots or a purported complete history', async () => {
  const { createCategory } = await import('../../firebase/categories');
  const { readBank } = await import('../../firebase/banks');
  const { createMovement } = await import('../../firebase/movements');
  const uid = 'reconciliation-owner', scope = { kind: 'personal' as const, id: uid, uid };
  const db = env.authenticatedContext(uid).firestore();
  const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof createMovement>[0];
  await env.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await setDoc(doc(store, 'banks', 'legacyCompleteBank01'), { personId: uid, groupId: null, financialGroupId: null, ledgerGroupId: null, name: 'Conta antiga', valueInCents: 75000, reconciled: true });
    await setDoc(doc(store, 'banks', 'legacyMissingBank001'), { personId: uid, groupId: null, financialGroupId: null, ledgerGroupId: null, name: 'Conta incompleta' });
    await setDoc(doc(store, 'monthlyBalances', 'legacy-checkpoint'), { personId: uid, bankId: 'legacyCompleteBank01', valueInCents: 75000, year: 2025, month: 1 });
    await setDoc(doc(store, 'expenses', 'legacy-complete-record'), { personId: uid, bankId: 'legacyCompleteBank01', valueInCents: 25000, date: Timestamp.fromDate(new Date('2025-01-10T00:00:00Z')) });
  });
  const before = (await getDoc(doc(db, 'banks', 'legacyCompleteBank01'))).data();
  const complete = await readBank(client, scope, { source: 'legacy', id: 'legacyCompleteBank01' });
  const incomplete = await readBank(client, scope, { source: 'legacy', id: 'legacyMissingBank001' });
  assert.equal(complete.balanceInCents, null);
  assert.equal(incomplete.balanceInCents, null);
  await createCategory(client, scope, 'legacyCategoryTest01', { name: 'Receita', usageType: 'gain', isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null });
  await assert.rejects(createMovement(client, scope, 'legacyAttemptMove001', { name: 'Tentativa', type: 'gain', amountCents: 100, accountId: 'legacyCompleteBank01', categoryId: 'legacyCategoryTest01', categorySource: 'new', date: '2025-01-10', explanation: '', paymentFormats: [] }));
  await assertFails(updateDoc(doc(db, 'banks', 'legacyCompleteBank01'), { valueInCents: 999999 }));
  assert.deepEqual((await getDoc(doc(db, 'banks', 'legacyCompleteBank01'))).data(), before);
  assert.equal((await getDoc(doc(db, 'financialContexts', `personal:${uid}`, 'movements', 'legacyAttemptMove001'))).exists(), false);
});

test('legacy bank access cannot survive removal from a group just because of creator UID', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'banks', 'legacy-personal-bank'), { personId: 'legacy-creator', groupId: null, financialGroupId: null, ledgerGroupId: null, name: 'Pessoal' });
    await setDoc(doc(db, 'banks', 'legacy-ambiguous-bank'), { personId: 'legacy-creator', name: 'Sem contexto verificável' });
    await setDoc(doc(db, 'banks', 'legacy-group-bank'), { personId: 'legacy-creator', groupId: 'legacy-group', financialGroupId: 'legacy-group', ledgerGroupId: 'legacy-group', name: 'Grupo' });
  });
  const db = env.authenticatedContext('legacy-creator').firestore();
  await assertSucceeds(getDoc(doc(db, 'banks', 'legacy-personal-bank')));
  await assertFails(getDoc(doc(db, 'banks', 'legacy-ambiguous-bank')));
  await assertFails(getDoc(doc(db, 'banks', 'legacy-group-bank')));
  await assertFails(updateDoc(doc(db, 'banks', 'legacy-group-bank'), { name: 'Tentativa', bankIconKey: 'outro-banco', institutionName: 'Banco', accountType: 'checking', colorHex: null, metadataRevision: 1, updatedBy: 'legacy-creator', updatedAt: serverTimestamp() }));
  await assertFails(getDocs(query(collection(db, 'banks'), where('personId', '==', 'legacy-creator'), limit(20))));
  const scoped = await assertSucceeds(getDocs(query(collection(db, 'banks'), where('personId', '==', 'legacy-creator'), where('groupId', '==', null), where('financialGroupId', '==', null), where('ledgerGroupId', '==', null), limit(20))));
  assert.deepEqual(scoped.docs.map(item => item.id), ['legacy-personal-bank']);
});
