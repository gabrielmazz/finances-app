import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { readBank, readBankPage } from '../../firebase/banks';
import { readCategory, readCategoryPage, readCategorySlice } from '../../firebase/categories';
import { readHistoricalMovement, readMovementTimeline } from '../../firebase/movements';
import { OFFICIAL_PROJECT_ID } from '../../firebase/config';

let env: RulesTestEnvironment;
const project = 'demo-lumus-homologation';
const uid = 'synthetic-owner';
const scope = { kind: 'personal' as const, id: uid, uid };
before(async () => {
  env = await initializeTestEnvironment({ projectId: project, firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('security/stage03-published.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const personal = { personId: uid, groupId: null, financialGroupId: null, ledgerGroupId: null };
    await setDoc(doc(db, 'banks', 'verified'), { ...personal, name: 'Synthetic bank' });
    await setDoc(doc(db, 'banks', 'missing-context'), { personId: uid, name: 'Ambiguous bank' });
    await setDoc(doc(db, 'banks', 'other-owner'), { ...personal, personId: 'other', name: 'Other bank' });
    await setDoc(doc(db, 'banks', 'explicit-group'), { personId: uid, groupId: 'group', name: 'Group bank' });
    await setDoc(doc(db, 'tags', 'verified'), { ...personal, name: 'Synthetic category' });
    await setDoc(doc(db, 'tags', 'missing-context'), { personId: uid, name: 'Ambiguous category' });
    await setDoc(doc(db, 'tags', 'explicit-group'), { personId: uid, ledgerGroupId: 'group', name: 'Group category' });
    const movement = { personId: uid, bankId: 'missing-context', tagId: 'missing-context', name: 'History', valueInCents: 100, date: Timestamp.fromDate(new Date('2025-03-10T12:00:00Z')) };
    await setDoc(doc(db, 'gains', 'legacy-gain'), movement);
    await setDoc(doc(db, 'expenses', 'legacy-expense'), movement);
    await setDoc(doc(db, 'expenses', 'explicit-group'), { ...movement, groupId: 'group' });
    await setDoc(doc(db, 'expenses', 'legacy-transfer'), { ...movement, tagId: null, isBankTransfer: true, bankTransferDirection: 'outgoing' });
    await setDoc(doc(db, 'expenses', 'invalid-transfer'), { ...movement, isBankTransfer: true, bankTransferDirection: 'incoming' });
    await setDoc(doc(db, 'expenses', 'invalid-flag'), { ...movement, isBankTransfer: 'true' });
    await setDoc(doc(db, 'expenses', 'orphan-transfer'), { ...movement, bankTransferDirection: 'outgoing' });
    await setDoc(doc(db, 'gains', 'without-category'), { ...movement, tagId: null });
    await setDoc(doc(db, 'expenses', 'legacy-investment-deposit'), { ...movement, tagId: null, isInvestmentDeposit: true });
    await setDoc(doc(db, 'gains', 'legacy-investment-redemption'), { ...movement, tagId: null, isInvestmentRedemption: true });
    await setDoc(doc(db, 'gains', 'invalid-investment'), { ...movement, isInvestmentDeposit: true });
    await setDoc(doc(db, 'cashRescues', 'legacy-cash'), { personId: uid, bankId: 'missing-context', valueInCents: 500, date: movement.date });
    await setDoc(doc(db, 'cashRescues', 'group-cash'), { personId: uid, groupId: 'group', bankId: 'missing-context', valueInCents: 500, date: movement.date });
    await setDoc(doc(db, 'mandatoryExpenses', 'mandatory'), { personId: uid, lastPaymentExpenseId: 'legacy-expense' });
  });
});
after(async () => env.cleanup());

test('official read-only policy displays own legacy records without group fields and excludes explicit groups', async () => {
  const db = env.authenticatedContext(uid).firestore();
  // The SDK is already bound to the isolated demo emulator. Only the app-option
  // discriminator is changed to exercise the official read-only policy.
  const options = db.app.options as { projectId: string };
  assert.equal(options.projectId, project);
  options.projectId = OFFICIAL_PROJECT_ID;
  const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof readBankPage>[0];
  // Published rules permit this owner; the user explicitly accepted the
  // ambiguity of group fields absent on these legacy documents.
  await assertSucceeds(getDoc(doc(db, 'banks', 'missing-context')));
  const fresh = await readBankPage(client, scope, 'new', 'active');
  assert.deepEqual({ unavailable: fresh.unavailable, issues: fresh.issues }, { unavailable: true, issues: 0 });
  const legacy = await readBankPage(client, scope, 'legacy', 'active');
  assert.deepEqual(legacy.banks.map(bank => bank.id), ['missing-context', 'verified']);
  assert.equal(legacy.banks[0].balanceInCents, null);
  assert.equal(legacy.issues, 1);
  assert.equal(legacy.contextUnverified, true);
  assert.equal(legacy.unavailable, false);
  const categories = await readCategoryPage(client, scope, 'legacy');
  assert.deepEqual(categories.items.map(category => category.id), ['missing-context', 'verified']);
  assert.equal(categories.items[0].usageType, null);
  assert.equal(categories.issues, 1);
  const slice = await readCategorySlice(client, scope, null, 'all');
  assert.equal(slice.unavailable, true);
  assert.equal(slice.issues, 1);
  await assert.rejects(readBank(client, scope, { source: 'legacy', id: 'explicit-group' }));
  await assert.rejects(readCategory(client, scope, { source: 'legacy', id: 'explicit-group' }));
  assert.equal((await readBank(client, scope, { source: 'legacy', id: 'missing-context' })).balanceInCents, null);
});

test('official legacy timeline reads own historical records without classifying a typeless category or changing the bank', async () => {
  const db = env.authenticatedContext(uid).firestore();
  (db.app.options as { projectId: string }).projectId = OFFICIAL_PROJECT_ID;
  const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof readBankPage>[0];
  const before = (await getDoc(doc(db, 'banks', 'missing-context'))).data();
  const page = await readMovementTimeline(client, scope, 'missing-context', new Date('2025-03-01T00:00:00Z'), new Date('2025-04-01T00:00:00Z'));
  assert.deepEqual(page.items.map(item => item.id).sort(), ['legacy-cash', 'legacy-expense', 'legacy-gain', 'legacy-investment-deposit', 'legacy-investment-redemption', 'legacy-transfer', 'without-category']);
  assert.equal(page.items.find(item => item.id === 'legacy-expense')?.isFromMandatory, true);
  assert.equal(page.items.find(item => item.id === 'legacy-transfer')?.isBankTransfer, true);
  assert.equal(page.items.find(item => item.id === 'legacy-transfer')?.bankTransferDirection, 'outgoing');
  assert.equal(page.items.find(item => item.id === 'legacy-cash')?.isCashRescue, true);
  assert.equal(page.items.find(item => item.id === 'legacy-cash')?.type, 'expense');
  assert.equal(page.items.find(item => item.id === 'without-category')?.tagId, null);
  assert.equal(page.items.find(item => item.id === 'legacy-investment-deposit')?.isInvestmentDeposit, true);
  assert.equal(page.items.find(item => item.id === 'legacy-investment-redemption')?.isInvestmentRedemption, true);
  assert.equal(page.items.find(item => item.id === 'legacy-gain')?.tagId, 'legacy:missing-context');
  assert.equal((await readCategory(client, scope, { source: 'legacy', id: 'missing-context' })).usageType, null);
  assert.equal((await readHistoricalMovement(client, scope, 'gain', 'legacy-gain')).id, 'legacy-gain');
  await assert.rejects(readHistoricalMovement(client, scope, 'expense', 'explicit-group'));
  assert.deepEqual((await getDoc(doc(db, 'banks', 'missing-context'))).data(), before);
  const recent = await readMovementTimeline(client, scope, null, new Date('2025-03-01T00:00:00Z'), new Date('2025-04-01T00:00:00Z'), null, ['missing-context']);
  assert.deepEqual(recent.items.map(item => item.id).sort(), page.items.map(item => item.id).sort());
  const restricted = await readMovementTimeline(client, scope, null, new Date('2025-03-01T00:00:00Z'), new Date('2025-04-01T00:00:00Z'), null, ['another-bank']);
  assert.equal(restricted.items.length, 0);
});

test('official timeline pages newest first using the existing owner and date index', async () => {
  const pageUid = 'synthetic-page-owner';
  await env.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await setDoc(doc(store, 'tags', 'page-tag'), { personId: pageUid, name: 'Category' });
    await Promise.all(Array.from({ length: 45 }, (_, i) => setDoc(doc(store, i % 2 ? 'gains' : 'expenses', `page-${String(i).padStart(2, '0')}`), {
      personId: pageUid, bankId: 'page-bank', tagId: 'page-tag', name: 'History', valueInCents: 100,
      date: Timestamp.fromDate(new Date(Date.UTC(2025, 2, 1 + Math.floor(i / 3), 12))),
    })));
    await Promise.all(Array.from({ length: 22 }, (_, i) => setDoc(doc(store, 'gains', `other-bank-${String(i).padStart(2, '0')}`), {
      personId: pageUid, bankId: 'other-bank', tagId: 'page-tag', name: 'Other account', valueInCents: 100,
      date: Timestamp.fromDate(new Date('2025-03-25T12:00:00Z')),
    })));
  });
  const db = env.authenticatedContext(pageUid).firestore();
  (db.app.options as { projectId: string }).projectId = OFFICIAL_PROJECT_ID;
  const pageScope = { kind: 'personal' as const, id: pageUid, uid: pageUid };
  const client = { db, auth: { currentUser: { uid: pageUid } } } as unknown as Parameters<typeof readBankPage>[0];
  const items: Awaited<ReturnType<typeof readMovementTimeline>>['items'] = [];
  let cursor: Awaited<ReturnType<typeof readMovementTimeline>>['cursor'] = null;
  let pages = 0;
  do {
    const page = await readMovementTimeline(client, pageScope, 'page-bank', new Date('2025-03-01T00:00:00Z'), new Date('2025-04-01T00:00:00Z'), cursor);
    assert.ok(page.items.length <= 20);
    items.push(...page.items); cursor = page.cursor; pages++;
    assert.ok(pages <= 6);
  } while (cursor);
  assert.equal(items.length, 45);
  assert.equal(new Set(items.map(item => `${item.storageSource}:${item.id}`)).size, 45);
  assert.ok(items.every((item, i) => i === 0 || items[i - 1].date!.getTime() >= item.date!.getTime()));
});

test('cash withdrawals keep descending order across pages and match the Home reader', async () => {
  const pageUid = 'synthetic-cash-owner';
  await env.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await Promise.all(Array.from({ length: 45 }, (_, i) => setDoc(doc(store, 'cashRescues', `cash-${String(i).padStart(2, '0')}`), {
      personId: pageUid, bankId: 'cash-bank', valueInCents: 100, date: Timestamp.fromDate(new Date(Date.UTC(2025, 2, 1 + Math.floor(i / 3), 12))),
    })));
  });
  const db = env.authenticatedContext(pageUid).firestore();
  (db.app.options as { projectId: string }).projectId = OFFICIAL_PROJECT_ID;
  const client = { db, auth: { currentUser: { uid: pageUid } } } as unknown as Parameters<typeof readBankPage>[0];
  const pageScope = { kind: 'personal' as const, id: pageUid, uid: pageUid };
  const from = new Date('2025-03-01T00:00:00Z'), to = new Date('2025-04-01T00:00:00Z');
  const first = await readMovementTimeline(client, pageScope, 'cash-bank', from, to);
  const home = await readMovementTimeline(client, pageScope, null, from, to, null, ['cash-bank']);
  assert.deepEqual(home.items.map(item => item.id), first.items.map(item => item.id));
  assert.equal(first.cashIncomplete, false);
  assert.equal(first.items.length, 20);
  assert.ok(first.cursor);
  const second = await readMovementTimeline(client, pageScope, 'cash-bank', from, to, first.cursor);
  assert.equal(second.items.length, 20);
  assert.ok(second.cursor);
  const last = await readMovementTimeline(client, pageScope, 'cash-bank', from, to, second.cursor);
  assert.equal(last.items.length, 5);
  assert.equal(last.cursor, null);
  const all = [...first.items, ...second.items, ...last.items];
  assert.equal(new Set(all.map(item => item.id)).size, 45);
  assert.ok(all.every(item => item.isCashRescue && item.type === 'expense'));
  assert.deepEqual(all.map(item => item.id), Array.from({ length: 45 }, (_, i) => `cash-${String(44 - i).padStart(2, '0')}`));
  await assertFails(updateDoc(doc(db, 'cashRescues', 'cash-00'), { valueInCents: 1 }));
  await assertFails(deleteDoc(doc(db, 'cashRescues', 'cash-00')));
  await assertFails(setDoc(doc(db, 'cashRescues', 'unapproved-write'), { personId: pageUid }));
  for (const context of [env.authenticatedContext('other'), env.unauthenticatedContext()]) {
    const foreignDb = context.firestore();
    await assertFails(getDocs(query(collection(foreignDb, 'cashRescues'), where('personId', '==', pageUid), limit(20))));
  }
});

test('legacy transfers keep their type while paginating through the statement', async () => {
  const pageUid = 'synthetic-transfer-owner';
  await env.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await Promise.all(Array.from({ length: 25 }, (_, i) => setDoc(doc(store, 'expenses', `transfer-${String(i).padStart(2, '0')}`), {
      personId: pageUid, bankId: 'transfer-bank', name: 'Transferência', valueInCents: 100,
      date: Timestamp.fromDate(new Date(Date.UTC(2025, 2, 1 + Math.floor(i / 3), 12))),
      isBankTransfer: true, bankTransferDirection: 'outgoing',
    })));
  });
  const db = env.authenticatedContext(pageUid).firestore();
  (db.app.options as { projectId: string }).projectId = OFFICIAL_PROJECT_ID;
  const client = { db, auth: { currentUser: { uid: pageUid } } } as unknown as Parameters<typeof readBankPage>[0];
  const pageScope = { kind: 'personal' as const, id: pageUid, uid: pageUid };
  const from = new Date('2025-03-01T00:00:00Z'), to = new Date('2025-04-01T00:00:00Z');
  const first = await readMovementTimeline(client, pageScope, 'transfer-bank', from, to);
  assert.equal(first.items.length, 20);
  assert.ok(first.cursor);
  const last = await readMovementTimeline(client, pageScope, 'transfer-bank', from, to, first.cursor);
  assert.equal(last.items.length, 5);
  assert.equal(last.cursor, null);
  const all = [...first.items, ...last.items];
  assert.equal(new Set(all.map(item => item.id)).size, 25);
  assert.ok(all.every(item => item.isBankTransfer && item.bankTransferDirection === 'outgoing' && item.type === 'expense'));
  assert.deepEqual(all.map(item => item.id), Array.from({ length: 25 }, (_, i) => `transfer-${String(24 - i).padStart(2, '0')}`));
});

test('published Rules deny another user and anonymous queries for the owner', async () => {
  for (const context of [env.authenticatedContext('other'), env.unauthenticatedContext()]) {
    const db = context.firestore();
    await assertFails(getDocs(query(collection(db, 'banks'), where('personId', '==', uid), limit(20))));
    await assertFails(getDocs(query(collection(db, 'tags'), where('personId', '==', uid), limit(20))));
    await assertFails(getDocs(query(collection(db, 'gains'), where('personId', '==', uid), limit(20))));
    await assertFails(getDocs(query(collection(db, 'expenses'), where('personId', '==', uid), limit(20))));
  }
});

test('an empty authorized legacy page does not claim that documents were rejected', async () => {
  const emptyUid = 'synthetic-empty-owner';
  const db = env.authenticatedContext(emptyUid).firestore();
  (db.app.options as { projectId: string }).projectId = OFFICIAL_PROJECT_ID;
  const emptyScope = { kind: 'personal' as const, id: emptyUid, uid: emptyUid };
  const client = { db, auth: { currentUser: { uid: emptyUid } } } as unknown as Parameters<typeof readBankPage>[0];
  const legacy = await readBankPage(client, emptyScope, 'legacy', 'active');
  assert.equal(legacy.banks.length, 0);
  assert.equal(legacy.issues, 0);
  assert.equal(legacy.contextUnverified, false);
  assert.equal(legacy.unavailable, false);
  assert.equal((await readBankPage(client, emptyScope, 'new', 'active')).unavailable, true);
});
