// Optional synthetic account for the physical-device flow. Never contacts production.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, terminate } from 'firebase/firestore';
import { register, login } from '../application/account';
const app = initializeApp(
	{ projectId: 'demo-lumus-foundation', apiKey: 'demo-api-key' },
	'stage04-device-seed',
);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8089);
(async () => {
	try {
		await register({ auth, db }, 'Pessoa Android Bancos', 'banks-mobile@lumus.test', 'Lumus-local-2026!');
	} catch (error) {
		if ((error as { code?: string }).code !== 'auth/email-already-in-use') throw error;
		await login({ auth, db }, 'banks-mobile@lumus.test', 'Lumus-local-2026!');
	}
	console.log('Synthetic Android account ready in demo emulator.');
})()
	.catch((error) => {
		console.error((error as { code?: string }).code || 'Synthetic seed failed');
		process.exitCode = 1;
	})
	.finally(async () => {
		await terminate(db);
		await deleteApp(app);
	});
