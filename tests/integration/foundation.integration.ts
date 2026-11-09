import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http2';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, onAuthStateChanged, confirmPasswordReset } from 'firebase/auth';
import {
	connectFirestoreEmulator,
	getFirestore,
	doc,
	getDocFromServer,
	collection,
	query,
	where,
	limit,
	getDocsFromServer,
	setDoc,
	updateDoc,
	deleteDoc,
	serverTimestamp,
	deleteField,
	setLogLevel,
	terminate,
	disableNetwork,
	enableNetwork,
} from 'firebase/firestore';
import {
	initializeTestEnvironment,
	assertFails,
	assertSucceeds,
	type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { seedEmulatorFixtures, LOCAL_PROJECT, DEMO_PASSWORD } from '../../script/emulator-fixtures';
import { login, logout, register, requestPasswordReset } from '../../application/account';
import { loadProfile, saveProfileName } from '../../firebase/profiles';
import { loadFinancialContext, readOwnBankPage } from '../../firebase/financialContext';
import { getFirebaseDiagnostics } from '../../firebase/diagnostics';
import { errorMessage } from '../../application/errors';

let rules: RulesTestEnvironment;
let users: Record<string, string>;
const apps: FirebaseApp[] = [];
function client(name: string, firestorePort = 8089) {
	const app = initializeApp({ apiKey: 'demo-api-key', projectId: LOCAL_PROJECT }, name);
	apps.push(app);
	const auth = getAuth(app);
	connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
	const db = getFirestore(app);
	connectFirestoreEmulator(db, '127.0.0.1', firestorePort);
	return { auth, db };
}
before(async () => {
	assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8089');
	assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9098');
	setLogLevel('silent');
	rules = await initializeTestEnvironment({
		projectId: LOCAL_PROJECT,
		firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') },
	});
	users = await seedEmulatorFixtures();
});
after(async () => {
	for (const app of apps) {
		await terminate(getFirestore(app));
		await deleteApp(app);
	}
	await rules?.cleanup();
});

test('real Auth emulator: login existing UID, profile compatibility, logout and observer', async () => {
	const c = client('existing');
	let observed: string | null | undefined;
	const unsubscribe = onAuthStateChanged(c.auth, (user) => {
		observed = user?.uid ?? null;
	});
	try {
		await login(c, ' LEGACY@lumus.test ', DEMO_PASSWORD);
		assert.equal(c.auth.currentUser?.uid, users.legacy);
		const result = await loadProfile(c, users.legacy);
		assert.equal(result?.profile.name, 'Pessoa Legada');
		assert.equal(result?.profile.createdAt?.toISOString(), '2025-01-01T00:00:00.000Z');
		assert.equal(result?.profile.adminUser, false);
		assert.deepEqual(await loadFinancialContext(c, users.legacy, result?.groupId), { kind: 'personal' });
		await logout(c);
		await new Promise((resolve) => setTimeout(resolve, 0));
		assert.equal(observed, null);
		await assert.rejects(loadProfile(c, users.legacy), /session\/changed/);
	} finally {
		unsubscribe();
	}
});

test('registration creates a single bounded profile with same UID; retries preserve fields', async () => {
	const c = client('registration');
	const user = await register(c, 'Nova Pessoa', 'new@lumus.test', DEMO_PASSWORD);
	const first = await getDocFromServer(doc(c.db, 'users', user.uid));
	assert.equal(first.data()?.name, 'Nova Pessoa');
	assert.equal(first.data()?.adminUser, false);
	const createdAt = first.data()?.createdAt.toMillis();
	await Promise.all([
		saveProfileName(c, user.uid, 'Nova Pessoa', null),
		saveProfileName(c, user.uid, 'Nova Pessoa', null),
	]);
	assert.equal(
		(await getDocFromServer(doc(c.db, 'users', user.uid))).data()?.createdAt.toMillis(),
		createdAt,
	);
	await assert.rejects(register(c, 'Duplicate', 'new@lumus.test', DEMO_PASSWORD), /auth\/already-signed-in/);
	await logout(c);
	await assert.rejects(
		register(c, 'Duplicate', 'new@lumus.test', DEMO_PASSWORD),
		(e: any) => e.code === 'auth/email-already-in-use',
	);
});

test('missing profile stays missing after login; explicit completion creates it', async () => {
	const c = client('missing');
	await login(c, 'missing@lumus.test', DEMO_PASSWORD);
	assert.equal(await loadProfile(c, users.missing), null);
	await saveProfileName(c, users.missing, 'Perfil concluído', null);
	assert.equal((await loadProfile(c, users.missing))?.profile.name, 'Perfil concluído');
});

test('incomplete legacy profile, protected group membership and name-only transaction', async () => {
	const c = client('incomplete');
	await login(c, 'incomplete@lumus.test', DEMO_PASSWORD);
	const account = await loadProfile(c, users.incomplete);
	assert.equal(account?.profile.name, '');
	assert.equal(account?.profile.createdAt?.getUTCFullYear(), 2024);
	assert.deepEqual(await loadFinancialContext(c, users.incomplete, account?.groupId), {
		kind: 'group',
		groupId: 'fixture-group',
		role: 'member',
	});
	await saveProfileName(c, users.incomplete, 'Nome recuperado', '');
	const saved = (await getDocFromServer(doc(c.db, 'users', users.incomplete))).data()!;
	assert.deepEqual(saved.relatedIdUsers, []);
	assert.equal(saved.financialGroupId, 'fixture-group');
	assert.equal(saved.createdAt, '2024-01-01T00:00:00Z');
});

test('concurrent profile transactions detect stale edits and preserve legacy permission fields', async () => {
	const c = client('conflict');
	await login(c, 'legacy@lumus.test', DEMO_PASSWORD);
	const results = await Promise.allSettled([
		saveProfileName(c, users.legacy, 'Nome A', 'Pessoa Legada'),
		saveProfileName(c, users.legacy, 'Nome B', 'Pessoa Legada'),
	]);
	assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
	assert.match(
		String((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason),
		/profile\/conflict/,
	);
	const saved = (await getDocFromServer(doc(c.db, 'users', users.legacy))).data()!;
	assert.equal(saved.adminUser, true);
	assert.equal(saved.untouchedLegacyField, 'preserve');
	assert.deepEqual(saved.relatedIdUsers, [users.outsider]);
});

test('bounded own-bank query reads legacy documents; no foreign records or financial mutation', async () => {
	const c = client('bank-page');
	await login(c, 'legacy@lumus.test', DEMO_PASSWORD);
	const page = await readOwnBankPage(c, users.legacy);
	assert.deepEqual(
		page.banks.map((bank) => bank.id),
		['fixture-legacy-bank'],
	);
	assert.equal(page.nextCursor, null);
	await assertFails(getDocFromServer(doc(c.db, 'banks', 'fixture-other-bank')));
	await assertFails(setDoc(doc(c.db, 'banks', 'new-bank'), { personId: users.legacy, name: 'Bank' }));
	await assertFails(
		setDoc(doc(c.db, 'expenses', 'new-expense'), { personId: users.legacy, valueInCents: 1 }),
	);
	assert.ok(getFirebaseDiagnostics().operations['banks.page'].documents >= 1);
	assert.equal(getFirebaseDiagnostics().firestoreListeners, 0);
});

test('Auth invalid credentials and reset flow stay isolated and do not expose account existence', async () => {
	const c = client('errors');
	await assert.rejects(login(c, 'legacy@lumus.test', 'wrong-password'), (error: any) =>
		/Confira/.test(errorMessage(error)),
	);
	await requestPasswordReset(c, 'legacy@lumus.test');
	await requestPasswordReset(c, 'absent@lumus.test');
	const result = (await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${LOCAL_PROJECT}/oobCodes`).then(
		(r) => r.json(),
	)) as { oobCodes: any[] };
	const code = result.oobCodes.find((item) => item.email === 'legacy@lumus.test');
	assert.equal(code?.requestType, 'PASSWORD_RESET');
});

test('offline reads fail explicitly, keep identity and preserve stored data', async () => {
	const c = client('offline');
	await login(c, 'outsider@lumus.test', DEMO_PASSWORD);
	await disableNetwork(c.db);
	await assert.rejects(loadProfile(c, users.outsider));
	assert.equal(c.auth.currentUser?.uid, users.outsider);
	await enableNetwork(c.db);
	assert.equal((await loadProfile(c, users.outsider))?.profile.name, 'Outra Pessoa');
});

test('interrupted registration keeps the Auth account and resumes by explicit profile completion', async () => {
	// disableNetwork does not disable unary transaction RPCs. A local gRPC fault endpoint
	// exercises an actual UNAVAILABLE response without stopping the shared emulator.
	const unavailable = createServer();
	unavailable.on('stream', (stream) => {
		stream.respond({
			':status': 200,
			'content-type': 'application/grpc',
			'grpc-status': '14',
			'grpc-message': 'Isolated test outage',
		});
		stream.end();
	});
	await new Promise<void>((resolve) => unavailable.listen(0, '127.0.0.1', resolve));
	const failing = client('interrupted', (unavailable.address() as { port: number }).port);
	try {
		await assert.rejects(
			register(failing, 'Pessoa', 'interrupted@lumus.test', DEMO_PASSWORD),
			(error: any) => error.code === 'account/profile-incomplete' && error.cause instanceof Error,
		);
		const uid = failing.auth.currentUser!.uid;
		const recovered = client('recovered');
		await login(recovered, 'interrupted@lumus.test', DEMO_PASSWORD);
		assert.equal(recovered.auth.currentUser!.uid, uid);
		assert.equal(await loadProfile(recovered, uid), null);
		await saveProfileName(recovered, uid, 'Pessoa recuperada', null);
		assert.equal((await loadProfile(recovered, uid))?.profile.name, 'Pessoa recuperada');
	} finally {
		await terminate(failing.db);
		await new Promise<void>((resolve) => unavailable.close(() => resolve()));
	}
});

test('Rules: unauthenticated access, foreign PII and unbounded user enumeration denied', async () => {
	const guest = rules.unauthenticatedContext().firestore();
	const attacker = rules.authenticatedContext(users.outsider, { email: 'outsider@lumus.test' }).firestore();
	await assertFails(guest.doc(`users/${users.legacy}`).get());
	await assertFails(attacker.doc(`users/${users.legacy}`).get());
	await assertFails(attacker.collection('users').limit(1).get());
	await assertFails(
		attacker.doc(`users/${users.legacy}`).update({ name: 'Attacked', updatedAt: serverTimestamp() }),
	);
});

test('Rules: create schema, ownership, role, timestamps, PII and oversized payloads', async () => {
	for (const [name, extra] of [
		['role', { adminUser: true }],
		['group', { financialGroupId: 'fixture-group' }],
		['extra', { arbitrary: 'x' }],
		['time', { createdAt: new Date(0) }],
		['long', { name: 'x'.repeat(101) }],
		['empty', { name: '   ' }],
		['control', { name: 'bad\nname' }],
		['email', { email: 'foreign@lumus.test' }],
		['type', { name: 123 }],
	] as [string, Record<string, unknown>][]) {
		const uid = 'attack-' + name;
		const db = rules.authenticatedContext(uid, { email: `${uid}@lumus.test` }).firestore();
		await assertFails(
			db.doc(`users/${uid}`).set({
				name: 'Valid',
				email: `${uid}@lumus.test`,
				createdAt: serverTimestamp(),
				adminUser: false,
				...extra,
			}),
		);
	}
	const db = rules.authenticatedContext('create-owner', { email: 'create-owner@lumus.test' }).firestore();
	await assertFails(
		db.doc('users/foreign').set({
			name: 'Valid',
			email: 'create-owner@lumus.test',
			createdAt: serverTimestamp(),
			adminUser: false,
		}),
	);
	await assertSucceeds(
		db.doc('users/create-owner').set({
			name: 'Valid',
			email: 'create-owner@lumus.test',
			createdAt: serverTimestamp(),
			adminUser: false,
		}),
	);
});

test('Rules: update validates names and forbids roles, relationships, ownership, deletion and group escalation', async () => {
	const db = rules.authenticatedContext(users.outsider, { email: 'outsider@lumus.test' }).firestore();
	for (const changes of [
		{ adminUser: true },
		{ relatedIdUsers: [users.legacy] },
		{ financialGroupId: 'fixture-group' },
		{ email: 'x@lumus.test' },
		{ name: 'x'.repeat(101) },
		{ name: 12 },
		{ name: deleteField() },
		{ createdAt: new Date(0) },
		{ extra: 'pollution' },
	]) {
		await assertFails(db.doc(`users/${users.outsider}`).update({ ...changes, updatedAt: serverTimestamp() }));
	}
	await assertFails(db.doc(`users/${users.outsider}`).delete());
	await assertFails(db.doc('financialGroups/fixture-group').get());
	await assertFails(
		db.doc('financialGroups/fixture-group').update({ [`members.${users.outsider}`]: 'admin' }),
	);
	await assertFails(
		db.doc('financialGroups/new-group').set({ status: 'active', members: { [users.outsider]: 'admin' } }),
	);
	await assertFails(db.doc(`users/${users.outsider}/pushDevices/probe`).set({ token: 'unsafe' }));
});

test('Rules: queries enforce ownership and page limits; members cannot edit group or access foreign banks', async () => {
	const c = client('query-denials');
	await login(c, 'legacy@lumus.test', DEMO_PASSWORD);
	await assertFails(getDocsFromServer(query(collection(c.db, 'banks'), limit(20))));
	await assertFails(
		getDocsFromServer(query(collection(c.db, 'banks'), where('personId', '==', users.legacy))),
	);
	await assertFails(
		getDocsFromServer(query(collection(c.db, 'banks'), where('personId', '==', users.legacy), limit(21))),
	);
	await assertSucceeds(getDocFromServer(doc(c.db, 'financialGroups', 'fixture-group')));
	await assertFails(updateDoc(doc(c.db, 'financialGroups', 'fixture-group'), { status: 'inactive' }));
	await assertFails(deleteDoc(doc(c.db, 'banks', 'fixture-legacy-bank')));
});


test('password recovery applies the emulator code, preserves UID and rejects the previous password', async () => {
	const c = client('password-recovery');
	const email = 'reset-roundtrip@lumus.test';
	const user = await register(c, 'Recuperação sintética', email, DEMO_PASSWORD);
	const uid = user.uid;
	await logout(c);
	await requestPasswordReset(c, email);
	const codes = await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${LOCAL_PROJECT}/oobCodes`).then(result => result.json()) as {oobCodes: {email:string;oobCode:string;requestType:string}[]};
	const reset = codes.oobCodes.find(code => code.email === email && code.requestType === 'PASSWORD_RESET');
	assert(reset);
	const newPassword = 'Lumus-reset-local-2026!';
	await confirmPasswordReset(c.auth, reset.oobCode, newPassword);
	await login(c, email, newPassword);
	assert.equal(c.auth.currentUser?.uid, uid);
	assert.equal((await loadProfile(c, uid))?.profile.name, 'Recuperação sintética');
	await logout(c);
	await assert.rejects(login(c, email, DEMO_PASSWORD));
});
