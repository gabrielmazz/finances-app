import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, type User } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, where, Timestamp } from 'firebase/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID ?? 'demo-lumus-financas';
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const [functionsEmulatorHost, functionsEmulatorPort] = (process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001').split(':');
const prefix = `adjustment-${randomUUID()}`;
let environment: RulesTestEnvironment;
const apps: ReturnType<typeof initializeApp>[] = [];
async function user(label: string) {
	const app = initializeApp({ apiKey: 'test-key', authDomain: `${projectId}.firebaseapp.com`, projectId }, `${prefix}-${label}`);
	apps.push(app);
	const auth = getAuth(app);
	connectAuthEmulator(auth, `http://${authEmulatorHost}`, { disableWarnings: true });
	connectFunctionsEmulator(getFunctions(app, 'southamerica-east1'), functionsEmulatorHost, Number(functionsEmulatorPort));
	return (await signInAnonymously(auth)).user;
}
async function call(actor: User, data: Record<string, unknown>) {
	return (await httpsCallable<Record<string, unknown>, { adjustmentId: string; previousBalanceInCents: number; differenceInCents: number }>(getFunctions(actor.auth.app, 'southamerica-east1'), 'bankBalanceAdjustment')(data)).data;
}
async function seed(records: Record<string, Record<string, unknown>>) {
	await environment.withSecurityRulesDisabled(async context => {
		const firestore = context.firestore();
		await Promise.all(Object.entries(records).map(([path, data]) => setDoc(doc(firestore, path), data)));
	});
}
async function read(path: string) {
	let data: Record<string, any> | undefined;
	await environment.withSecurityRulesDisabled(async context => { data = (await getDoc(doc(context.firestore(), path))).data(); });
	assert.ok(data, `Missing document: ${path}`);
	return data;
}
async function denied(actor: User, data: Record<string, unknown>, code: string) {
	await assert.rejects(call(actor, data), (error: unknown) => (error as { code: string }).code === `functions/${code}`);
}
async function run() {
	environment = await initializeTestEnvironment({ projectId });
	const unauthenticatedApp = initializeApp({ apiKey: 'test-key', projectId }, `${prefix}-unauthenticated`);
	apps.push(unauthenticatedApp);
	const unauthenticatedFunctions = getFunctions(unauthenticatedApp, 'southamerica-east1');
	connectFunctionsEmulator(unauthenticatedFunctions, functionsEmulatorHost, Number(functionsEmulatorPort));
	await assert.rejects(httpsCallable(unauthenticatedFunctions, 'bankBalanceAdjustment')({ action: 'preview', bankId: 'unknown', date: '2026-09-10' }), (error: unknown) => (error as { code: string }).code === 'functions/unauthenticated');
	const [owner, related, outsider, admin, member] = await Promise.all(['owner', 'related', 'outsider', 'admin', 'member'].map(user));
	const bankId = `${prefix}-bank`;
	await seed({
		[`users/${owner.uid}`]: { relatedIdUsers: [related.uid] }, [`users/${related.uid}`]: { relatedIdUsers: [owner.uid] }, [`users/${outsider.uid}`]: { relatedIdUsers: [] },
		[`banks/${bankId}`]: { personId: owner.uid, name: 'Banco de teste', isActive: true },
		[`monthlyBalances/${prefix}-opening`]: { personId: owner.uid, bankId, year: 2026, month: 9, valueInCents: 10_000 },
		[`gains/${prefix}-gain`]: { personId: owner.uid, bankId, valueInCents: 500, date: Timestamp.fromDate(new Date('2026-09-11T12:00:00-03:00')) },
	});
	const command = { action: 'save', bankId, date: '2026-09-10', targetBalanceInCents: 12_000, expectedPreviousBalanceInCents: 10_000, clientActionId: `${prefix}-save`, description: 'Conferência do extrato' };
	assert.equal((await call(owner, { action: 'preview', bankId, date: command.date })).previousBalanceInCents, 10_000);
	const saved = await call(owner, command);
	assert.equal(saved.differenceInCents, 2_000);
	assert.deepEqual(await call(owner, command), saved, 'Repeated submissions must return the same receipt.');
	await denied(owner, { ...command, targetBalanceInCents: 12_001 }, 'failed-precondition');
	await denied(owner, { ...command, expectedActorId: related.uid }, 'unauthenticated');
	assert.equal((await call(owner, { action: 'preview', bankId, date: '2026-09-12' })).previousBalanceInCents, 12_500, 'Later movements remain effective.');
	await denied(owner, { ...command, clientActionId: `${prefix}-stale`, targetBalanceInCents: 13_000 }, 'failed-precondition');
	await denied(owner, { ...command, clientActionId: `${prefix}-fraction`, targetBalanceInCents: 1.5 }, 'invalid-argument');
	await denied(owner, { ...command, clientActionId: `${prefix}-future`, date: '2099-01-01' }, 'failed-precondition');
	await denied(outsider, { ...command, clientActionId: `${prefix}-outsider` }, 'permission-denied');
	const edited = await call(owner, { ...command, adjustmentId: saved.adjustmentId, targetBalanceInCents: 11_000, clientActionId: `${prefix}-edit` });
	assert.equal(edited.differenceInCents, 1_000);
	assert.equal((await read(`bankBalanceAdjustments/${saved.adjustmentId}`)).status, 'replaced');
	assert.equal((await call(owner, { action: 'preview', bankId, date: '2026-09-12' })).previousBalanceInCents, 11_500);
	await denied(owner, { action: 'revert', bankId, adjustmentId: saved.adjustmentId, clientActionId: `${prefix}-old-revert` }, 'permission-denied');
	const reverse = { action: 'revert', bankId, adjustmentId: edited.adjustmentId, clientActionId: `${prefix}-reverse` };
	const inverse = await call(owner, reverse);
	assert.deepEqual(await call(owner, reverse), inverse);
	assert.equal((await call(owner, { action: 'preview', bankId, date: '2026-09-12' })).previousBalanceInCents, 10_500);
	assert.equal((await read(`bankBalanceAdjustments/${inverse.adjustmentId}`)).date.toMillis(), (await read(`bankBalanceAdjustments/${edited.adjustmentId}`)).date.toMillis(), 'An inverse belongs to the original effective date.');
	await denied(owner, { ...command, date: '2026-09-12', targetBalanceInCents: -100, description: '', clientActionId: `${prefix}-negative-invalid` }, 'failed-precondition');
	const negative = await call(owner, { ...command, date: '2026-09-12', targetBalanceInCents: -100, expectedPreviousBalanceInCents: 10_500, clientActionId: `${prefix}-negative` });
	assert.equal(negative.differenceInCents, -10_600);
	assert.equal((await call(owner, { action: 'preview', bankId, date: '2026-09-12' })).previousBalanceInCents, -100);
	await call(owner, { action: 'revert', bankId, adjustmentId: negative.adjustmentId, clientActionId: `${prefix}-negative-reverse` });
	const ownDb = environment.authenticatedContext(owner.uid).firestore();
	await assertSucceeds(getDoc(doc(ownDb, 'bankBalanceAdjustments', saved.adjustmentId)));
	await assertSucceeds(getDoc(doc(environment.authenticatedContext(related.uid).firestore(), 'bankBalanceAdjustments', saved.adjustmentId)));
	await assertFails(getDoc(doc(environment.authenticatedContext(outsider.uid).firestore(), 'bankBalanceAdjustments', saved.adjustmentId)));
	await assertFails(setDoc(doc(ownDb, 'bankBalanceAdjustments', `${prefix}-client-write`), { personId: owner.uid, bankId, differenceInCents: 999 }));
	await assertFails(setDoc(doc(ownDb, 'bankBalanceAdjustments', saved.adjustmentId), { status: 'active' }, { merge: true }));
	await assertFails(getDoc(doc(ownDb, 'bankBalanceAdjustmentOperations', `${owner.uid}_${command.clientActionId}`)));
	const groupId = `${prefix}-group`; const accountId = `${prefix}-account`;
	await seed({
		[`users/${admin.uid}`]: { financialGroupId: groupId, financialGroupRole: 'admin', relatedIdUsers: [] },
		[`users/${member.uid}`]: { financialGroupId: groupId, financialGroupRole: 'member', relatedIdUsers: [] },
		[`financialGroups/${groupId}`]: { status: 'active', members: { [admin.uid]: 'admin', [member.uid]: 'member' } },
		[`financialAccounts/${accountId}`]: { groupId, kind: 'bank', name: 'Banco do grupo', currentBalanceInCents: 10_500, archivedAt: null },
		[`accountReconciliations/${prefix}-recon`]: { groupId, accountId, effectiveAt: Timestamp.fromDate(new Date('2026-09-01T00:00:00-03:00')), countedBalanceInCents: 10_000 },
		[`ledgerTransactions/${prefix}-income`]: { groupId, kind: 'income', effectiveAt: Timestamp.fromDate(new Date('2026-09-11T12:00:00-03:00')), legs: [{ accountId, deltaInCents: 500 }, { accountId: null, deltaInCents: -500 }] },
	});
	const ledgerCommand = { ...command, bankId: accountId, clientActionId: `${prefix}-ledger` };
	await denied(member, ledgerCommand, 'permission-denied');
	await denied(admin, { ...ledgerCommand, date: '2026-08-31' }, 'failed-precondition');
	await seed({ [`financialAccounts/${accountId}`]: { groupId, kind: 'bank', name: 'Banco do grupo', currentBalanceInCents: 10_500, archivedAt: null, isActive: false } });
	await denied(admin, { ...ledgerCommand, clientActionId: `${prefix}-inactive` }, 'failed-precondition');
	await seed({ [`financialAccounts/${accountId}`]: { groupId, kind: 'bank', name: 'Banco do grupo', currentBalanceInCents: 10_500, archivedAt: null, isActive: true } });
	const ledgerSaved = await call(admin, ledgerCommand);
	assert.equal((await read(`financialAccounts/${accountId}`)).currentBalanceInCents, 12_500);
	const event = await read(`ledgerTransactions/bank-adjustment-${ledgerSaved.adjustmentId}`);
	assert.equal(event.kind, 'reconciliation_adjustment');
	assert.equal(event.legs.reduce((sum: number, leg: { deltaInCents: number }) => sum + leg.deltaInCents, 0), 0);
	await assert.rejects(httpsCallable(getFunctions(admin.auth.app, 'southamerica-east1'), 'reverseTransaction')({ groupId, transactionId: `bank-adjustment-${ledgerSaved.adjustmentId}`, clientActionId: `${prefix}-alternate-reversal` }), (error: unknown) => (error as { code: string }).code === 'functions/failed-precondition');
	assert.equal((await read(`financeMonthlySummaries/${groupId}-2026-09`)).transactionCount, 1);
	assert.equal((await read(`financeMonthlySummaries/${groupId}-2026-09`)).bankDeltaInCents[accountId], 2_000);
	await assertSucceeds(getDoc(doc(environment.authenticatedContext(member.uid).firestore(), 'bankBalanceAdjustments', ledgerSaved.adjustmentId)));
	const ledgerEdit = await call(admin, { ...ledgerCommand, adjustmentId: ledgerSaved.adjustmentId, targetBalanceInCents: 9_000, clientActionId: `${prefix}-ledger-edit` });
	assert.equal((await read(`financialAccounts/${accountId}`)).currentBalanceInCents, 9_500);
	const reverseLedger = { action: 'revert', bankId: accountId, adjustmentId: ledgerEdit.adjustmentId, clientActionId: `${prefix}-ledger-reverse` };
	await Promise.all([call(admin, reverseLedger), call(admin, reverseLedger)]);
	assert.equal((await read(`financialAccounts/${accountId}`)).currentBalanceInCents, 10_500);
	assert.equal((await read(`financeMonthlySummaries/${groupId}-2026-09`)).bankDeltaInCents[accountId], 0);
	await environment.withSecurityRulesDisabled(async context => {
		const events = await getDocs(query(collection(context.firestore(), 'bankBalanceAdjustments'), where('groupId', '==', groupId)));
		assert.equal(events.size, 4, 'Save + replacement inverse + replacement + single reversal.');
	});
	console.log('Balance adjustment emulator checks passed: deltas, dates, idempotency, edit, reversal, ledger and permissions.');
}
void run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
	await environment?.cleanup(); await Promise.all(apps.map(deleteApp));
});
