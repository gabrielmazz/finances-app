import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { readBank } from '../../firebase/banks';
import { readCategory } from '../../firebase/categories';
import { readHistoricalMovement } from '../../firebase/movements';

test('legacy owner IDs remain readable while unsafe broad queries remain denied', async () => {
	const uid = 'compatibility-owner';
	const sources = ['banks', 'gains', 'expenses', 'tags', 'cashRescues', 'bankTransfers', 'mandatoryExpenses', 'mandatoryGains', 'monthlyBalances', 'financeInvestments', 'financeInvestmentSyncs', 'investmentCdiRates'];
	for (const [projectId, rulesFile, published] of [
		['demo-mvp12-published', 'security/stage03-published.rules', true],
		['demo-mvp12-candidate', 'firestore.rules', false],
	] as const) {
		const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync(rulesFile, 'utf8') } });
		try {
			await env.withSecurityRulesDisabled(async context => {
				for (const source of sources) await setDoc(doc(context.firestore(), source, 'example'), { personId: uid, name: 'Example' });
			});
			const db = env.authenticatedContext(uid).firestore();
			for (const source of sources) {
				const request = getDocs(query(collection(db, source), where('personId', '==', uid), limit(20)));
				if (published) await assertSucceeds(request); else await assertFails(request);
			}
			// Single-document reads can safely check the actual fields. This
			// compatibility does not make the broader query safe.
			for (const source of sources) await assertSucceeds(getDoc(doc(db, source, 'example')));
			if (!published) {
				await assertFails(getDocs(query(collection(db, 'financialContexts', `personal:${uid}`, 'legacyCategoryIndex'), limit(20))));
				const foreign = env.authenticatedContext('another-user').firestore();
				const anonymous = env.unauthenticatedContext().firestore();
				for (const source of sources) {
					await assertFails(getDoc(doc(foreign, source, 'example')));
					await assertFails(getDoc(doc(anonymous, source, 'example')));
					await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), source, 'group-example'), { personId: uid, groupId: 'other-group', name: 'Example' }));
					await assertFails(getDoc(doc(db, source, 'group-example')));
				}
				const generation = 'legacy-group-generation';
				await env.withSecurityRulesDisabled(async c => {
					await setDoc(doc(c.firestore(), 'financialGroups', 'other-group'), { status: 'active' });
					await setDoc(doc(c.firestore(), '_authorizations', uid), { generation, enabled: true, readOwners: [], groups: { 'other-group': 'member' } });
					await setDoc(doc(c.firestore(), '_categoryScopes', 'group-example'), { scopeKind: 'group', scopeId: 'other-group' });
				});
				const member = env.authenticatedContext(uid, { lumusAccess: generation }).firestore();
				for (const source of sources) await assertSucceeds(getDoc(doc(member, source, 'group-example')));
				await env.withSecurityRulesDisabled(async c => {
					for (const source of sources) await updateDoc(doc(c.firestore(), source, 'group-example'), { ledgerGroupId: 'conflicting-group' });
				});
				for (const source of sources) await assertFails(getDoc(doc(member, source, 'group-example')));
				await env.withSecurityRulesDisabled(async c => {
					for (const source of sources) await updateDoc(doc(c.firestore(), source, 'group-example'), { ledgerGroupId: null });
				});
				await env.withSecurityRulesDisabled(async c => updateDoc(doc(c.firestore(), '_authorizations', uid), { groups: {} }));
				for (const source of sources) await assertFails(getDoc(doc(member, source, 'group-example')));
			}
		} finally { await env.cleanup(); }
	}
});

test('known personal legacy IDs resolve without a binding or a fabricated category type', async () => {
	const env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
	const uid = 'legacy-direct-owner', scope = { kind: 'personal' as const, id: uid, uid };
	try {
		await env.withSecurityRulesDisabled(async c => {
			const db = c.firestore();
			await setDoc(doc(db, 'banks', 'old-bank'), { personId: uid, name: 'Synthetic bank' });
			await setDoc(doc(db, 'tags', 'old-tag'), { personId: uid, name: 'Synthetic category' });
			for (const kind of ['gains', 'expenses']) await setDoc(doc(db, kind, `old-${kind}`), { personId: uid, name: 'Synthetic movement', valueInCents: 100, bankId: 'old-bank', tagId: 'old-tag', date: Timestamp.fromDate(new Date('2025-01-01T00:00:00Z')) });
		});
		const db = env.authenticatedContext(uid).firestore();
		const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof readBank>[0];
		assert.equal((await readBank(client, scope, { id: 'old-bank', source: 'legacy' })).id, 'old-bank');
		assert.equal((await readCategory(client, scope, { id: 'old-tag', source: 'legacy' })).usageType, null);
		assert.equal((await readHistoricalMovement(client, scope, 'gain', 'old-gains')).id, 'old-gains');
		assert.equal((await readHistoricalMovement(client, scope, 'expense', 'old-expenses')).id, 'old-expenses');
	} finally { await env.cleanup(); }
});
