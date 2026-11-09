import { initializeApp, deleteApp } from 'firebase/app';
import {
	connectAuthEmulator,
	getAuth,
	signInWithEmailAndPassword,
	createUserWithEmailAndPassword,
	signOut,
} from 'firebase/auth';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

export const LOCAL_PROJECT = 'demo-lumus-foundation';
export const DEMO_PASSWORD = 'Lumus-local-2026!';
export const FIXTURE_AUTHORIZATION_GENERATION = 'synthetic-authority-stage03';
export async function setEmulatorClaims(uid: string, claims: Record<string, unknown>, project = LOCAL_PROJECT) {
	if (!project.startsWith('demo-') || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw Error('Synthetic emulator identity required');
	const response = await fetch(`http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:update`, {
		method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(claims) }),
	});
	if (!response.ok) throw Error('Emulator claim setup failed');
}
export async function seedEmulatorFixtures() {
	if (process.env.FIRESTORE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089')
		throw Error('Local emulator required');
	const app = initializeApp({ apiKey: 'demo-api-key', projectId: LOCAL_PROJECT }, 'seed-' + Date.now());
	const auth = getAuth(app);
	connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
	const users: Record<string, string> = {};
	const environment = await initializeTestEnvironment({
		projectId: LOCAL_PROJECT,
		firestore: { host: '127.0.0.1', port: 8089 },
	});
	try {
		for (const key of ['legacy', 'incomplete', 'outsider', 'missing']) {
			const email = `${key}@lumus.test`;
			const user = await createUserWithEmailAndPassword(auth, email, DEMO_PASSWORD).catch(async (error) => {
				if (error.code !== 'auth/email-already-in-use') throw error;
				return signInWithEmailAndPassword(auth, email, DEMO_PASSWORD);
			});
			users[key] = user.user.uid;
		}
		await setEmulatorClaims(users.incomplete, { lumusAccess: FIXTURE_AUTHORIZATION_GENERATION });
		await setEmulatorClaims(users.legacy, { lumusAccess: FIXTURE_AUTHORIZATION_GENERATION });
		await environment.withSecurityRulesDisabled(async (context) => {
			const db = context.firestore();
			const create = async (collection: string, id: string, data: Record<string, unknown>) => {
				const reference = doc(db, collection, id);
				if (!(await getDoc(reference)).exists()) await setDoc(reference, data);
			};
			await create('users', users.legacy, {
				name: 'Pessoa Legada',
				email: 'legacy@lumus.test',
				adminUser: true,
				relatedIdUsers: [users.outsider],
				createdAt: Timestamp.fromDate(new Date('2025-01-01')),
				untouchedLegacyField: 'preserve',
			});
			await create('users', users.incomplete, {
				relatedIdUsers: [],
				financialGroupId: 'fixture-group',
				createdAt: '2024-01-01T00:00:00Z',
			});
			await create('users', users.outsider, {
				name: 'Outra Pessoa',
				email: 'outsider@lumus.test',
				adminUser: false,
				createdAt: Timestamp.now(),
			});
			await create('financialGroups', 'fixture-group', {
				status: 'active',
				members: { [users.incomplete]: 'member', [users.legacy]: 'admin' },
			});
			await create('_authorizations', users.legacy, { generation: FIXTURE_AUTHORIZATION_GENERATION, enabled: true, readOwners: [], groups: { 'fixture-group': 'admin' } });
			await create('_authorizations', users.incomplete, { generation: FIXTURE_AUTHORIZATION_GENERATION, enabled: true, readOwners: [], groups: { 'fixture-group': 'member' } });
			await create('banks', 'fixture-legacy-bank', {
				personId: users.legacy,
				name: 'Banco legado',
				createdAt: Timestamp.now(),
			});
			await create('banks', 'fixture-other-bank', {
				personId: users.outsider,
				name: 'Banco de outra pessoa',
			});
			await create('expenses', 'fixture-expense', {
				personId: users.legacy,
				name: 'Histórico sintético',
				valueInCents: 1234,
				date: Timestamp.now(),
				bankId: null,
			});
		});
		await signOut(auth);
		return users;
	} finally {
		await environment.cleanup();
		await deleteApp(app);
	}
}
if (process.argv[1]?.endsWith('emulator-fixtures.ts')) {
	seedEmulatorFixtures()
		.then(() =>
			console.log(
				'Synthetic fixtures ready: legacy/incomplete/outsider/missing@lumus.test; password in the local development guide.',
			),
		)
		.catch((error) => {
			console.error(error.code || error.message);
			process.exitCode = 1;
		});
}
