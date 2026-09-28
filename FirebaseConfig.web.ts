import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, getAuth, initializeAuth, inMemoryPersistence, type Auth, type Persistence } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { firebaseRuntime } from '@/utils/firebaseRuntime';

const appInstance: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseRuntime.firebaseOptions) : getApp();

// [[Autenticação]]: a sessão principal Web é compartilhada entre abas até o logout.
// O Auth secundário do cadastro permanece apenas em memória.
const createWebAuthInstance = (firebaseApp: FirebaseApp, persistence: Persistence): Auth => {
	try {
		return initializeAuth(firebaseApp, { persistence });
	} catch {
		return getAuth(firebaseApp);
	}
};

const authInstance = createWebAuthInstance(appInstance, browserLocalPersistence);

const secondaryAppInstance: FirebaseApp =
	getApps().some(app => app.name === 'SECONDARY')
		? getApp('SECONDARY')
		: initializeApp(firebaseRuntime.firebaseOptions, 'SECONDARY');

const secondaryAuthInstance = createWebAuthInstance(secondaryAppInstance, inMemoryPersistence);

export const app = appInstance;
export const auth = authInstance;
export const db = getFirestore(appInstance);
export const secondaryApp = secondaryAppInstance;
export const secondaryAuth = secondaryAuthInstance;
export const secondaryDb = getFirestore(secondaryAppInstance);
export const firebaseFunctions = getFunctions(appInstance, 'southamerica-east1');

if (firebaseRuntime.target === 'emulator') {
	const host = firebaseRuntime.emulatorHost!;
	connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
	connectAuthEmulator(secondaryAuth, `http://${host}:9099`, { disableWarnings: true });
	connectFirestoreEmulator(db, host, 8080);
	connectFirestoreEmulator(secondaryDb, host, 8080);
	connectFunctionsEmulator(firebaseFunctions, host, 5001);
}
