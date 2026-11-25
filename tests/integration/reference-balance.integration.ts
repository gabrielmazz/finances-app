import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, startAfter, updateDoc, where, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { createBank, prepareLegacyReference, previewLegacyReference, readBank, readBankPage, readBoundLegacyBankPage } from '../../firebase/banks';
import { createCategory } from '../../firebase/categories';
import { cancelBankOperation, cancelMandatoryCycle, confirmMandatoryCycle, createBankTransfer, createCashWithdrawal, createMovement, readMovementTimeline, readTransferCounterpartyName, updateMovement } from '../../firebase/movements';
import { readMandatoryTemplate, saveMandatoryTemplate } from '../../firebase/mandatory';

let env: RulesTestEnvironment;
const uid = 'reference-owner', scope = { kind: 'personal' as const, id: uid, uid }, id = 'referenceLegacy00001';
const metadata = { name: 'Conta antiga', institutionKey: 'outro-banco', institutionName: 'Banco', accountType: 'checking' as const, colorHex: null };
const input = { ...metadata, initialBalanceCents: 100000, referenceAt: new Date('2025-01-01T12:00:00Z'), reason: '', confirmed: true as const, pendingReviewed: true as const };
before(async () => {
	env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
	await env.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), 'banks', id), { personId: uid, groupId: null, financialGroupId: null, ledgerGroupId: null, name: 'Conta antiga' }));
});
after(async () => env.cleanup());

test('explicitly confirmed reference keeps the legacy document and is idempotent', async () => {
	const db = env.authenticatedContext(uid).firestore();
	const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof prepareLegacyReference>[0];
	const before = (await getDoc(doc(db, 'banks', id))).data();
	const preview = await previewLegacyReference(client, scope, id, input);
	assert.equal(preview.amountCents, 100000);
	assert.equal((await getDoc(doc(db, 'financialContexts', `personal:${uid}`, 'bankAccounts', id))).exists(), false);
	await prepareLegacyReference(client, scope, id, input);
	await prepareLegacyReference(client, scope, id, input);
	await assert.rejects(prepareLegacyReference(client, scope, id, { ...input, institutionName: 'Outro banco' }), /operation-conflict/);
	await assert.rejects(prepareLegacyReference(client, scope, id, { ...input, accountType: 'savings' }), /operation-conflict/);
	await assert.rejects(prepareLegacyReference(client, scope, id, { ...input, colorHex: '#112233' }), /operation-conflict/);
	assert.equal((await readBank(client, scope, { id, source: 'new' })).balanceInCents, 100000);
	assert.deepEqual((await getDoc(doc(db, 'banks', id))).data(), before);
});

test('reference reconciles historical and current movements without changing the opening', async () => {
	const db = env.authenticatedContext(uid).firestore();
	const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof prepareLegacyReference>[0];
	const second = 'referenceNewBank0001', gainTag = 'referenceGainTag0001', costTag = 'referenceCostTag0001';
	await createBank(client, scope, second, { ...metadata, name: 'Outra', initialBalanceCents: 0, openingDate: '2025-01-01', reason: '' });
	const cat = { name: 'Categoria', isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null };
	await createCategory(client, scope, gainTag, { ...cat, usageType: 'gain' });
	await createCategory(client, scope, costTag, { ...cat, usageType: 'expense' });
	const gain = { name: 'Receita', type: 'gain' as const, amountCents: 50000, accountId: id, categoryId: gainTag, categorySource: 'new' as const, date: '2025-01-02', explanation: '', paymentFormats: [] };
	const cost = { ...gain, name: 'Despesa', type: 'expense' as const, amountCents: 20000, categoryId: costTag };
	await assert.rejects(createMovement(client, scope, 'referenceOldDate0001', { ...gain, date: '2025-01-01' }), /reference-confirmation-required/);
	const retroactive = { ...gain, date: '2024-12-31' };
	const saved = await createMovement(client, scope, 'referenceRetro000001', retroactive);
	assert.equal((await createMovement(client, scope, saved.id, retroactive)).id, saved.id);
	assert.equal((await readBank(client, scope, { id, source: 'new' })).balanceInCents, 100000);
	await updateMovement(client, scope, saved, null);
	assert.equal((await readBank(client, scope, { id, source: 'new' })).balanceInCents, 100000);
	await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), 'gains', 'referenceHistory0001'), { personId: uid, groupId: null, financialGroupId: null, ledgerGroupId: null, bankId: id, valueInCents: 50000 }));
	await assert.rejects(createMovement(client, scope, 'referenceHistory0001', gain));
	const first = await createMovement(client, scope, 'referenceMoveGain001', gain);
	assert.equal((await createMovement(client, scope, first.id, gain)).id, first.id);
	const expense = await createMovement(client, scope, 'referenceMoveCost001', cost);
	assert.equal((await readBank(client, scope, { id, source: 'new' })).balanceInCents, 130000);
	const malicious = writeBatch(db), context = `personal:${uid}`;
	const account = doc(db, 'financialContexts', context, 'bankAccounts', id);
	const revision = (await getDoc(account)).data()!.balanceRevision;
	malicious.update(doc(db, 'financialContexts', context, 'movements', expense.id), { date: Timestamp.fromDate(new Date('2025-01-01T00:00:00Z')), revision: 1, updatedBy: uid, updatedAt: serverTimestamp() });
	malicious.update(account, { balanceCents: 130000, balanceRevision: revision + 1, lastMovementId: expense.id });
	await assertFails(malicious.commit());
	const forgedId = 'referenceForged00001', forged = writeBatch(db);
	forged.set(doc(db, 'financialContexts', context, 'movements', forgedId), { schemaVersion: 1, scopeKind: 'personal', scopeId: uid, ...gain, amountCents: 100, date: Timestamp.fromDate(new Date('2025-01-01T00:00:00Z')), status: 'posted', revision: 0, createdBy: uid, updatedBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
	forged.update(account, { balanceCents: 130100, balanceRevision: revision + 1, lastMovementId: forgedId });
	await assertFails(forged.commit());
	const historicalEdit = await updateMovement(client, scope, expense, { ...cost, date: '2024-12-31' });
	assert.equal(historicalEdit.referenceTreatment, 'historical');
	assert.equal((await getDoc(account)).data()?.balanceCents, 150000);
	const edit = await updateMovement(client, scope, historicalEdit, { ...cost, amountCents: 30000 });
	assert.equal((await readBank(client, scope, { id, source: 'new' })).balanceInCents, 120000);
	await updateMovement(client, scope, first, null);
	assert.equal((await readBank(client, scope, { id, source: 'new' })).balanceInCents, 70000);
	await updateMovement(client, scope, edit, { ...cost, amountCents: 30000, accountId: second });
	assert.equal((await readBank(client, scope, { id, source: 'new' })).balanceInCents, 100000);
	assert.equal((await readBank(client, scope, { id: second, source: 'new' })).balanceInCents, -30000);
	const other = await createMovement(client, scope, 'referenceHistory0001', { ...gain, accountId: second });
	await assert.rejects(updateMovement(client, scope, other, gain));
	const pair = await Promise.all([createMovement(client, scope, 'referenceConcurrent1', { ...cost, amountCents: 100 }), createMovement(client, scope, 'referenceConcurrent2', { ...cost, amountCents: 100 })]);
	assert.equal(pair.length, 2);
	assert.equal((await readBank(client, scope, { id, source: 'new' })).balanceInCents, 99800);
	await assertFails(updateDoc(doc(db, 'financialContexts', `personal:${uid}`, 'bankAccounts', id), { legacyBankId: 'other', balanceCents: 1 }));
	await assertFails(updateDoc(doc(db, 'financialContexts', `personal:${uid}`, 'accountOpenings', id), { amountCents: 1 }));
	const historical = await getDoc(doc(db, 'gains', 'referenceHistory0001'));
	assert.equal(historical.data()?.valueInCents, 50000);
});

test('same-day choices preserve the confirmed balance and survive editing, withdrawal, and cycle cancellation', async () => {
	const db = env.authenticatedContext(uid).firestore();
	const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof prepareLegacyReference>[0];
	const account = doc(db, 'financialContexts', `personal:${uid}`, 'bankAccounts', id);
	const opening = doc(db, 'financialContexts', `personal:${uid}`, 'accountOpenings', id);
	const openingBefore = (await getDoc(opening)).data();
	const balance = async () => (await getDoc(account)).data()!.balanceCents;
	const initial = await balance();
	const sameDay = { name: 'Receita', type: 'gain' as const, amountCents: 300, accountId: id, categoryId: 'referenceGainTag0001', categorySource: 'new' as const, date: '2025-01-01', explanation: '', paymentFormats: [] };
	const included = await createMovement(client, scope, 'referenceIncluded001', { ...sameDay, referenceTreatment: 'included' });
	assert.deepEqual(await createMovement(client, scope, included.id, sameDay), included);
	await assert.rejects(createMovement(client, scope, included.id, { ...sameDay, referenceTreatment: 'after' }), /operation-conflict/);
	const edited = await updateMovement(client, scope, included, { ...sameDay, explanation: 'Conferida', amountCents: 500 });
	assert.equal(edited.referenceTreatment, 'included');
	assert.equal(await balance(), initial);
	const added = await createMovement(client, scope, 'referenceAfter000001', { ...sameDay, referenceTreatment: 'after' });
	assert.equal(await balance(), initial + 300);
	await updateMovement(client, scope, added, null);
	await updateMovement(client, scope, edited, null);
	const withdrawal = await createCashWithdrawal(client, scope, 'referenceWithdraw001', { ...sameDay, amountCents: initial + 1, referenceTreatment: 'included' });
	await cancelBankOperation(client, scope, withdrawal);
	await assert.rejects(createCashWithdrawal(client, scope, 'referenceWithdraw002', { ...sameDay, amountCents: initial + 1, referenceTreatment: 'after' }), /insufficient-balance/);
	assert.equal(await balance(), initial);
	const templateId = 'referenceCycle000001', categoryId = 'referenceFixed000001';
	await createCategory(client, scope, categoryId, { name: 'Fixa', usageType: 'expense', isMandatoryGain: false, isMandatoryExpense: true, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null });
	await saveMandatoryTemplate(client, scope, templateId, { name: 'Despesa fixa', type: 'expense', valueInCents: 200, categoryId,
		categorySource: 'new', description: '', dueDay: 1, usesBusinessDays: false, installmentTotal: null, installmentTotalValueInCents: null, installmentStartDate: null }, null);
	const cycle = { ...sameDay, name: 'Despesa fixa', type: 'expense' as const, categoryId, amountCents: 200 };
	await assert.rejects(confirmMandatoryCycle(client, scope, templateId, cycle), /reference-confirmation-required/);
	await confirmMandatoryCycle(client, scope, templateId, { ...cycle, referenceTreatment: 'included' });
	await cancelMandatoryCycle(client, scope, templateId, '2025-01', (await readMandatoryTemplate(client, scope, templateId)).revision);
	assert.equal(await balance(), initial);
	await confirmMandatoryCycle(client, scope, templateId, { ...cycle, referenceTreatment: 'after' });
	assert.equal(await balance(), initial - 200);
	assert.deepEqual((await getDoc(opening)).data(), openingBefore);
});

test('missing confirmations, other owners and ambiguous contexts do not create a reference', async () => {
	const db = env.authenticatedContext(uid).firestore();
	const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof prepareLegacyReference>[0];
	await assert.rejects(prepareLegacyReference(client, scope, 'referenceNoConfirm01', { ...input, confirmed: false }), /confirmation-required/);
	await assert.rejects(prepareLegacyReference(client, scope, id, { ...input, initialBalanceCents: 999 }), /operation-conflict/);
	await env.withSecurityRulesDisabled(async context => {
		const db = context.firestore();
		await setDoc(doc(db, 'banks', 'referenceBypass00001'), { personId: uid, groupId: null, financialGroupId: null, ledgerGroupId: null, name: metadata.name });
		await setDoc(doc(db, 'banks', 'referenceMissing0001'), { personId: uid, name: metadata.name });
		await setDoc(doc(db, 'banks', 'referencePartial0001'), { personId: uid, groupId: null, financialGroupId: null, ledgerGroupId: null, name: metadata.name });
	});
	await assert.rejects(createBank(client, scope, 'referenceBypass00001', { ...metadata, initialBalanceCents: 100000, openingDate: '2025-01-01', reason: '' }));
	await assert.rejects(prepareLegacyReference(client, scope, 'referenceMissing0001', input));
	assert.equal((await getDoc(doc(db, 'financialContexts', `personal:${uid}`, 'bankAccounts', 'referenceBypass00001'))).exists(), false);
	const outsider = env.authenticatedContext('reference-outsider').firestore();
	await assertFails(getDoc(doc(outsider, 'financialContexts', `personal:${uid}`, 'bankAccounts', id)));
	const partial = writeBatch(db);
	partial.set(doc(db, 'financialContexts', `personal:${uid}`, 'accountOpenings', 'referencePartial0001'), { schemaVersion: 1, accountId: 'referencePartial0001', scopeKind: 'personal', scopeId: uid, type: 'reference', amountCents: 500, date: Timestamp.fromDate(input.referenceAt), reason: '', confirmed: true, pendingReviewed: true, createdBy: uid, createdAt: serverTimestamp() });
	await assertFails(partial.commit());
	assert.equal((await getDoc(doc(db, 'financialContexts', `personal:${uid}`, 'accountOpenings', 'referencePartial0001'))).exists(), false);
	assert.equal((await prepareLegacyReference(client, scope, 'referencePartial0001', input)).balanceInCents, 100000);
});

test('simultaneous identical preparations converge on the same opening', async () => {
	const concurrent = 'refPrep' + randomUUID().replace(/-/g, '').slice(0, 13);
	await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), 'banks', concurrent), { personId: uid, groupId: null, financialGroupId: null, ledgerGroupId: null, name: metadata.name }));
	const db = env.authenticatedContext(uid).firestore();
	const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof prepareLegacyReference>[0];
	const results = await Promise.all([prepareLegacyReference(client, scope, concurrent, input), prepareLegacyReference(client, scope, concurrent, input)]);
	assert.equal(results[0].id, concurrent);
	assert.equal(results[1].balanceInCents, 100000);
});

test('legacy category and transfer of a movement between two reference accounts remain usable', async () => {
	const db = env.authenticatedContext(uid).firestore();
	const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof prepareLegacyReference>[0];
	const target = 'referenceLegacy00002', tag = 'referenceLegacyTag01';
	await env.withSecurityRulesDisabled(async c => {
		const store = c.firestore();
		await setDoc(doc(store, 'banks', target), { personId: uid, groupId: null, financialGroupId: null, ledgerGroupId: null, name: metadata.name });
		await setDoc(doc(store, '_categoryScopes', tag), { scopeKind: 'personal', scopeId: uid });
		await setDoc(doc(store, 'tags', tag), { personId: uid, name: 'Histórico', usageType: 'expense' });
	});
	await prepareLegacyReference(client, scope, target, { ...input, initialBalanceCents: 0 });
	const value = { name: 'Despesa', type: 'expense' as const, amountCents: 100, accountId: id, categoryId: tag, categorySource: 'legacy' as const, date: '2025-01-02', explanation: '', paymentFormats: [] };
	const movement = await createMovement(client, scope, 'referenceLegacyCat01', value);
	await updateMovement(client, scope, movement, { ...value, accountId: target });
	assert.equal((await readBank(client, scope, { id: target, source: 'new' })).balanceInCents, -100);
});

test('missing legacy context needs a protected binding; clients cannot grant it', async () => {
	const legacy = 'refScope' + randomUUID().replace(/-/g, '').slice(0, 12);
	const db = env.authenticatedContext(uid).firestore();
	const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof prepareLegacyReference>[0];
	await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), 'banks', legacy), { personId: uid, name: metadata.name }));
	await assert.rejects(prepareLegacyReference(client, scope, legacy, input));
	await assertFails(setDoc(doc(db, '_bankScopes', legacy), { scopeKind: 'personal', scopeId: uid }));
	await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), '_bankScopes', legacy), { scopeKind: 'personal', scopeId: uid }));
	assert.equal((await readBoundLegacyBankPage(client, scope, 'active')).unavailable, true);
	assert.equal((await getDoc(doc(db, '_bankScopes', legacy))).exists(), true);
	await assertFails(getDocs(query(collection(db, '_bankScopes'), limit(20))));
	await assertFails(getDocs(query(collection(env.unauthenticatedContext().firestore(), '_bankScopes'), limit(20))));
	assert.equal((await previewLegacyReference(client, scope, legacy, input)).accountId, legacy);
	assert.equal((await prepareLegacyReference(client, scope, legacy, input)).balanceInCents, 100000);
	await assertFails(updateDoc(doc(db, '_bankScopes', legacy), { scopeId: 'other' }));
	await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), 'banks', legacy)));
	assert.deepEqual((await getDoc(doc(db, 'banks', legacy))).data(), { personId: uid, name: metadata.name });
	const group = 'refGroup' + randomUUID().replace(/-/g, '').slice(0, 12);
	await env.withSecurityRulesDisabled(async c => {
		await setDoc(doc(c.firestore(), 'banks', group), { personId: uid, groupId: 'another-group', name: metadata.name });
		await setDoc(doc(c.firestore(), '_bankScopes', group), { scopeKind: 'personal', scopeId: uid });
	});
	await assert.rejects(prepareLegacyReference(client, scope, group, input));
	assert.equal((await getDoc(doc(db, 'financialContexts', `personal:${uid}`, 'bankAccounts', group))).exists(), false);
	const movement = 'refBound' + randomUUID().replace(/-/g, '').slice(0, 12);
	await createMovement(client, scope, movement, { name: 'Receita', type: 'gain', amountCents: 100, accountId: legacy, categoryId: 'referenceGainTag0001', categorySource: 'new', date: '2025-01-02', explanation: '', paymentFormats: [] });
	const timelineStart = new Date('2025-01-01T00:00:00Z'), timelineEnd = new Date('2025-01-05T00:00:00Z');
	const recent = await readMovementTimeline(client, scope, null, timelineStart, timelineEnd, null, [legacy, 'referenceNewBank0001']);
	assert.ok(recent.items.some(item => item.id === movement));
	await env.withSecurityRulesDisabled(async c => {
		const batch = writeBatch(c.firestore());
		for (let i = 0; i < 21; i++) batch.set(doc(c.firestore(), 'financialContexts', `personal:${uid}`, 'movements', `revocation-page-${i}`), { accountId: legacy, status: 'posted', date: Timestamp.fromDate(new Date('2025-01-03T00:00:00Z')) });
		await batch.commit();
	});
	const movements = query(collection(db, 'financialContexts', `personal:${uid}`, 'movements'), where('accountId', '==', legacy), where('status', '==', 'posted'), limit(20));
	await assertFails(getDocs(query(collection(db, 'financialContexts', `personal:${uid}`, 'accountOpenings'), where('type', '==', 'reference'), limit(20))));
	await assertFails(getDocs(query(collection(db, 'financialContexts', `personal:${uid}`, 'accountOpenings'), limit(20))));
	const period = query(collection(db, 'financialContexts', `personal:${uid}`, 'movements'), where('accountId', '==', legacy), where('status', '==', 'posted'), where('date', '>=', Timestamp.fromDate(new Date('2025-01-01T00:00:00Z'))), orderBy('date', 'desc'), limit(20));
	const first = await getDocs(period);
	assert.equal(first.size, 20);
	assert.equal((await getDocs(query(period, startAfter(first.docs[19])))).size, 2);
	await env.withSecurityRulesDisabled(async c => deleteDoc(doc(c.firestore(), '_bankScopes', legacy)));
	await assertFails(getDoc(doc(db, 'financialContexts', `personal:${uid}`, 'bankAccounts', legacy)));
	await assertFails(getDoc(doc(db, 'financialContexts', `personal:${uid}`, 'accountOpenings', legacy)));
	await assertFails(getDoc(doc(db, 'financialContexts', `personal:${uid}`, 'movements', movement)));
	await assert.rejects(createMovement(client, scope, 'refAgain' + randomUUID().replace(/-/g, '').slice(0, 12), { name: 'Receita', type: 'gain', amountCents: 100, accountId: legacy, categoryId: 'referenceGainTag0001', categorySource: 'new', date: '2025-01-02', explanation: '', paymentFormats: [] }));
	await assertFails(getDocs(query(collection(db, 'financialContexts', `personal:${uid}`, 'bankAccounts'), where('status', '==', 'active'), limit(20))));
	await assertFails(getDocs(movements));
	await assertFails(getDocs(period));
	await assertFails(getDocs(query(period, startAfter(first.docs[19]))));
	await assert.rejects(readMovementTimeline(client, scope, null, timelineStart, timelineEnd, null, [legacy, 'referenceNewBank0001']));
});

test('protected bindings require exact IDs and deny listing and foreign reads', async () => {
	const owner = 'reference-page-owner', localScope = { kind: 'personal' as const, id: owner, uid: owner };
	await env.withSecurityRulesDisabled(async c => {
		const store = c.firestore(), batch = writeBatch(store);
		for (let i = 0; i < 21; i++) {
			const bank = 'page' + String(i).padStart(16, '0');
			batch.set(doc(store, 'banks', bank), { personId: owner, name: 'Conta' });
			batch.set(doc(store, '_bankScopes', bank), { scopeKind: 'personal', scopeId: owner });
		}
		await batch.commit();
	});
	const db = env.authenticatedContext(owner).firestore();
	const client = { db, auth: { currentUser: { uid: owner } } } as unknown as Parameters<typeof readBoundLegacyBankPage>[0];
	const first = await readBoundLegacyBankPage(client, localScope, 'active');
	assert.equal(first.unavailable, true);
	assert.equal(first.banks.length, 0);
	assert.equal(first.nextCursor, null);
	const last = 'page' + String(20).padStart(16, '0');
	assert.equal((await getDoc(doc(db, '_bankScopes', last))).exists(), true);
	await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), '_bankScopes', last)));
});

test('transfers enforce both reference cutoffs and recheck a revoked counterparty on read', async () => {
	const uniqueId = () => randomUUID().replace(/-/g, '').slice(0, 20);
	const owner = 'reference-transfer-' + uniqueId(), scope = { kind: 'personal' as const, id: owner, uid: owner };
	const first = uniqueId(), second = uniqueId(), regular = uniqueId();
	const id = 'referenceTransfer001', historicalId = 'historicalTransfer01';
	const db = env.authenticatedContext(owner).firestore();
	const client = { db, auth: { currentUser: { uid: owner } } } as unknown as Parameters<typeof createBankTransfer>[0];
	await env.withSecurityRulesDisabled(async c => {
		const store = c.firestore(), batch = writeBatch(store);
		for (const bank of [first, second]) {
			batch.set(doc(store, 'banks', bank), { personId: owner, name: metadata.name });
			batch.set(doc(store, '_bankScopes', bank), { scopeKind: 'personal', scopeId: owner });
		}
		batch.set(doc(store, 'bankTransfers', historicalId), { personId: owner });
		await batch.commit();
	});
	const nextDate = new Date('2025-01-02T12:00:00Z');
	await prepareLegacyReference(client, scope, first, input);
	await prepareLegacyReference(client, scope, second, { ...input, referenceAt: nextDate, initialBalanceCents: 50000 });
	await createBank(client, scope, regular, { ...metadata, initialBalanceCents: 10000, openingDate: '2025-01-01', reason: '' });
	const transfer = { accountId: first, destinationAccountId: second, amountCents: 7000, date: '2025-01-03', explanation: '' };
	await assert.rejects(createBankTransfer(client, scope, id, { ...transfer, date: '2025-01-02' }), /reference-confirmation-required/);
	await assert.rejects(createBankTransfer(client, scope, id, { ...transfer, date: '2025-01-02', time: '09:00' }), /before-reference/);
	await assert.rejects(createBankTransfer(client, scope, historicalId, { ...transfer, accountId: regular }));
	await createBankTransfer(client, scope, id, { ...transfer, date: '2025-01-02', destinationReferenceTreatment: 'included' });
	assert.equal((await readBank(client, scope, { id: first, source: 'new' })).balanceInCents, 93000);
	assert.equal((await readBank(client, scope, { id: second, source: 'new' })).balanceInCents, 50000);
	assert.equal(await readTransferCounterpartyName(client, scope, id, 'outgoing'), metadata.name);
	const from = new Date('2025-01-01T00:00:00Z'), to = new Date('2025-01-05T00:00:00Z');
	const page = await readMovementTimeline(client, scope, null, from, to, null, [first, second]);
	assert.deepEqual(page.items.filter(item => item.bankTransferPairId === id).map(item => item.bankTransferDirection).sort(), ['incoming', 'outgoing']);
	await cancelBankOperation(client, scope, id);
	assert.equal((await readBank(client, scope, { id: first, source: 'new' })).balanceInCents, 100000);
	assert.equal((await readBank(client, scope, { id: second, source: 'new' })).balanceInCents, 50000);
	await env.withSecurityRulesDisabled(async c => deleteDoc(doc(c.firestore(), '_bankScopes', second)));
	await assert.rejects(readTransferCounterpartyName(client, scope, id, 'outgoing'));
	await assertFails(getDoc(doc(db, 'financialContexts', 'personal:' + owner, 'movements', id + '-credit')));
	assert.equal((await readBank(client, scope, { id: regular, source: 'new' })).balanceInCents, 10000);
});

test('ordinary accounts are resolved through paginated immutable openings', async () => {
	const owner = 'opening-page-owner', localScope = { kind: 'personal' as const, id: owner, uid: owner };
	await env.withSecurityRulesDisabled(async c => {
		const store = c.firestore(), batch = writeBatch(store), stamp = Timestamp.fromDate(new Date('2025-01-01T00:00:00Z'));
		for (let i = 0; i < 21; i++) {
			const bank = 'ordinary' + String(i).padStart(12, '0');
			batch.set(doc(store, 'financialContexts', `personal:${owner}`, 'bankAccounts', bank), { schemaVersion: 1, scopeKind: 'personal', scopeId: owner, ...metadata, initialBalanceCents: 100, openingDate: stamp, status: 'active', revision: 0, createdBy: owner, updatedBy: owner, createdAt: stamp, updatedAt: stamp });
			batch.set(doc(store, 'financialContexts', `personal:${owner}`, 'accountOpenings', bank), { schemaVersion: 1, scopeKind: 'personal', scopeId: owner, type: 'opening', accountId: bank, amountCents: 100, date: stamp, reason: '', createdBy: owner, createdAt: stamp });
		}
		await batch.commit();
	});
	const db = env.authenticatedContext(owner).firestore();
	const client = { db, auth: { currentUser: { uid: owner } } } as unknown as Parameters<typeof readBankPage>[0];
	const first = await readBankPage(client, localScope, 'new', 'active');
	assert.equal(first.banks.length, 20);
	assert.ok(first.nextCursor);
	const second = await readBankPage(client, localScope, 'new', 'active', first.nextCursor);
	assert.equal(second.banks.length, 1);
	assert.equal(new Set([...first.banks, ...second.banks].map(bank => bank.id)).size, 21);
	await assertFails(getDocs(query(collection(env.authenticatedContext('other').firestore(), 'financialContexts', `personal:${owner}`, 'accountOpenings'), where('type', '==', 'opening'), limit(20))));
});
