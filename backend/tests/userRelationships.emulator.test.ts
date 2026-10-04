import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, type User } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const projectId = 'demo-lumus-financas';
const prefix = `relationship-${randomUUID()}`;
const apps: ReturnType<typeof initializeApp>[] = [];
const environmentPromise = initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080 } });

async function makeUser(label: string): Promise<User> {
	const app = initializeApp({ apiKey: 'test-key', projectId }, `${prefix}-${label}`);
	apps.push(app);
	connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
	connectFunctionsEmulator(getFunctions(app, 'southamerica-east1'), '127.0.0.1', 5001);
	return (await signInAnonymously(getAuth(app))).user;
}
async function call(user: User, data: Record<string, unknown>) {
	return (await httpsCallable<Record<string, unknown>, { fingerprint: string; changed: boolean; idempotent: boolean }>(getFunctions(user.auth.app, 'southamerica-east1'), 'userRelationship')(data)).data;
}
async function run() {
	const environment = await environmentPromise;
	try {
		const [owner, target] = await Promise.all([makeUser('owner'), makeUser('target')]);
		await environment.withSecurityRulesDisabled(async context => {
			const firestore = context.firestore();
			await setDoc(doc(firestore, 'users', owner.uid), { name: 'Ana', relatedIdUsers: [], financialGroupId: 'group-owner', financialGroupRole: 'member' });
			await setDoc(doc(firestore, 'users', target.uid), { name: 'Maria', relatedIdUsers: [], financialGroupId: 'group-target', financialGroupRole: 'admin' });
		});
		const preview = await call(owner, { action: 'preview', relatedUserId: target.uid });
		const command = { action: 'link', relatedUserId: target.uid, clientActionId: `${prefix}-link`, expectedFingerprint: preview.fingerprint };
		const result = await call(owner, command);
		assert.equal(result.changed, true);
		const repeated = await call(owner, command);
		assert.equal(repeated.idempotent, true);
		await environment.withSecurityRulesDisabled(async context => {
			const firestore = context.firestore();
			const ownerData = (await getDoc(doc(firestore, 'users', owner.uid))).data()!;
			const targetData = (await getDoc(doc(firestore, 'users', target.uid))).data()!;
			assert.deepEqual(ownerData.relatedIdUsers, [target.uid]);
			assert.deepEqual(targetData.relatedIdUsers, [owner.uid]);
			assert.equal(ownerData.financialGroupId, 'group-owner');
			assert.equal(ownerData.financialGroupRole, 'member');
			assert.equal(targetData.financialGroupId, 'group-target');
			assert.equal(targetData.financialGroupRole, 'admin');
		});
		await assert.rejects(call(owner, { ...command, clientActionId: `${prefix}-stale`, action: 'unlink' }), (error: any) => error.code === 'functions/failed-precondition');
		await assert.rejects(call(owner, { ...command, action: 'unlink' }), (error: any) => error.code === 'functions/failed-precondition');
		const unlinkPreview = await call(owner, { action: 'preview', relatedUserId: target.uid });
		const unlink = { action: 'unlink', relatedUserId: target.uid, clientActionId: `${prefix}-unlink`, expectedFingerprint: unlinkPreview.fingerprint };
		assert.equal((await call(owner, unlink)).changed, true);
		assert.equal((await call(owner, unlink)).idempotent, true);
		await environment.withSecurityRulesDisabled(async context => {
			const firestore = context.firestore();
			assert.deepEqual((await getDoc(doc(firestore, 'users', owner.uid))).data()!.relatedIdUsers, []);
			assert.deepEqual((await getDoc(doc(firestore, 'users', target.uid))).data()!.relatedIdUsers, []);
		});
		await assert.rejects(call(owner, { action: 'preview', relatedUserId: owner.uid }), (error: any) => error.code === 'functions/invalid-argument');
		await assert.rejects(call(owner, { action: 'preview', relatedUserId: `${prefix}-missing` }), (error: any) => error.code === 'functions/not-found');
		await assertFails(getDoc(doc(environment.authenticatedContext(owner.uid).firestore(), 'users', target.uid)));
		const secondTarget = await makeUser('second-target');
		await environment.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), 'users', secondTarget.uid), { name: 'Pedro', relatedIdUsers: [] });
		});
		// Independent pairs share an owner, but do not invalidate each other's prepared snapshot.
		const [firstPair, secondPair] = await Promise.all([
			call(owner, { action: 'preview', relatedUserId: target.uid }),
			call(owner, { action: 'preview', relatedUserId: secondTarget.uid }),
		]);
		await call(owner, { action: 'link', relatedUserId: target.uid, clientActionId: `${prefix}-batch-one`, expectedFingerprint: firstPair.fingerprint });
		await call(owner, { action: 'link', relatedUserId: secondTarget.uid, clientActionId: `${prefix}-batch-two`, expectedFingerprint: secondPair.fingerprint });
		await environment.withSecurityRulesDisabled(async context => {
			const data = (await getDoc(doc(context.firestore(), 'users', owner.uid))).data()!;
			assert.deepEqual(new Set(data.relatedIdUsers), new Set([target.uid, secondTarget.uid]));
			assert.equal(data.financialGroupRole, 'member');
		});
		console.log('User relationships: passed (bidirectional, idempotency, stale, independent batch pairs, account fields preserved, scope).');
	} finally {
		await environment.cleanup();
		await Promise.all(apps.map(deleteApp));
	}
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
