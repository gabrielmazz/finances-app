import { getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, initializeAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { authPersistence } from './authPersistence';
import { readFirebaseConfig } from './config';

function createClient() {
	const config = readFirebaseConfig({
		mode: process.env.EXPO_PUBLIC_FIREBASE_MODE,
		host: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,
	});
	const app = getApps().find((app) => app.name === '[DEFAULT]') || initializeApp(config.options);
	if (app.options.projectId !== config.options.projectId) throw new Error('config/project-mismatch');
	const auth = initializeAuth(app, { persistence: authPersistence });
	const db = getFirestore(app);
	connectAuthEmulator(auth, `http://${config.host}:${config.authPort}`, { disableWarnings: true });
	connectFirestoreEmulator(db, config.host, config.firestorePort);
	return { auth, db };
}

let client: ReturnType<typeof createClient> | undefined;
export function getFirebaseClient() {
	return (client ??= createClient());
}
