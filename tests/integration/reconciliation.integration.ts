import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { createBank } from '../../firebase/banks';
import { readReconciliationPage } from '../../firebase/reconciliation';

let env: RulesTestEnvironment;
const uid = 'reconciliation-test-owner';
const scope = { kind: 'personal' as const, id: uid, uid };
before(async () => {
	env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
	await env.withSecurityRulesDisabled(async context => {
		const db = context.firestore();
		await setDoc(doc(db, 'banks', 'reconciliation-legacy'), { personId: uid, groupId: null, financialGroupId: null, ledgerGroupId: null, name: 'Conta' });
		await setDoc(doc(db, 'monthlyBalances', 'reconciliation-snapshot'), { personId: uid, bankId: 'reconciliation-legacy', year: 2025, month: 1, valueInCents: 10000 });
	});
});
after(async () => env.cleanup());

test('legacy inventory remains pending, repeatable and read only; other users are denied', async () => {
	const db = env.authenticatedContext(uid).firestore();
	const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof readReconciliationPage>[0];
	const before = (await getDoc(doc(db, 'banks', 'reconciliation-legacy'))).data();
	const first = await readReconciliationPage(client, scope, { source: 'legacy', id: 'reconciliation-legacy' });
	assert.equal(first.status, 'pending');
	assert.equal(first.bank.balanceInCents, null);
	// Missing context fields cannot be queried safely as null; the known
	// historical document is still readable by its owner and is not modified.
	assert.equal(first.snapshots.length, 0);
	assert.equal((await getDoc(doc(db, 'monthlyBalances', 'reconciliation-snapshot'))).data()?.valueInCents, 10000);
	assert.deepEqual(await readReconciliationPage(client, scope, { source: 'legacy', id: 'reconciliation-legacy' }), first);
	assert.deepEqual((await getDoc(doc(db, 'banks', 'reconciliation-legacy'))).data(), before);
	await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), 'banks', 'reconciliation-legacy')));
});

test('an existing new account is read through its atomic opening without new financial writes', async () => {
	const db = env.authenticatedContext(uid).firestore();
	const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof readReconciliationPage>[0];
	const id = 'reconcileNewBank0001';
	await createBank(client, scope, id, { name: 'Conta nova', institutionKey: 'outro-banco', institutionName: 'Banco', accountType: 'checking', colorHex: null, initialBalanceCents: 7500, openingDate: '2025-01-01', reason: '' });
	const result = await readReconciliationPage(client, scope, { source: 'new', id });
	assert.equal(result.status, 'reconciled');
	assert.equal(result.bank.balanceInCents, 7500);
});

test('snapshot inventory follows cursors without inferring completeness', async () => {
	const owner = 'reconciliation-page-owner';
	const pageScope = { kind: 'personal' as const, id: owner, uid: owner };
	await env.withSecurityRulesDisabled(async context => {
		const db = context.firestore(), batch = writeBatch(db);
		batch.set(doc(db, 'banks', 'page-bank'), { personId: owner, groupId: null, financialGroupId: null, ledgerGroupId: null, name: 'Conta' });
		for (let i = 0; i < 25; i++) batch.set(doc(db, 'monthlyBalances', `page-${String(i).padStart(2, '0')}`), { personId: owner, groupId: null, financialGroupId: null, ledgerGroupId: null, bankId: 'page-bank', year: 2025, month: 1, valueInCents: 500 });
		await batch.commit();
	});
	const db = env.authenticatedContext(owner).firestore();
	const client = { db, auth: { currentUser: { uid: owner } } } as unknown as Parameters<typeof readReconciliationPage>[0];
	const first = await readReconciliationPage(client, pageScope, { source: 'legacy', id: 'page-bank' });
	assert.equal(first.snapshots.length, 20);
	assert.ok(first.nextCursor);
	const second = await readReconciliationPage(client, pageScope, { source: 'legacy', id: 'page-bank' }, first.nextCursor);
	assert.equal(second.snapshots.length, 5);
	assert.equal(second.nextCursor, null);
	assert.equal(new Set([...first.snapshots, ...second.snapshots].map(snapshot => snapshot.id)).size, 25);
	assert.equal(second.status, 'pending');
});
