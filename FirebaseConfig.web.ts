import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, initializeAuth, inMemoryPersistence, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { firebaseRuntime } from '@/utils/firebaseRuntime';

const appInstance: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseRuntime.firebaseOptions) : getApp();

// [[Autenticação]]: o navegador não deve restaurar a sessão em localStorage,
// IndexedDB ou cookies. A instância secundária também é descartada após o registro.
const createMemoryOnlyAuthInstance = (firebaseApp: FirebaseApp): Auth => {
	try {
		return initializeAuth(firebaseApp, { persistence: inMemoryPersistence });
	} catch {
		return getAuth(firebaseApp);
	}
};

const authInstance = createMemoryOnlyAuthInstance(appInstance);

const secondaryAppInstance: FirebaseApp =
	getApps().some(app => app.name === 'SECONDARY')
		? getApp('SECONDARY')
		: initializeApp(firebaseRuntime.firebaseOptions, 'SECONDARY');

const secondaryAuthInstance = createMemoryOnlyAuthInstance(secondaryAppInstance);

export const app = appInstance;
export const auth = authInstance;
export const db = getFirestore(appInstance);
export const secondaryApp = secondaryAppInstance;
export const secondaryAuth = secondaryAuthInstance;
export const firebaseFunctions = getFunctions(appInstance, 'southamerica-east1');

if (firebaseRuntime.target === 'emulator') {
	const host = firebaseRuntime.emulatorHost!;
	connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
	connectAuthEmulator(secondaryAuth, `http://${host}:9099`, { disableWarnings: true });
	connectFirestoreEmulator(db, host, 8080);
	connectFunctionsEmulator(firebaseFunctions, host, 5001);
}
