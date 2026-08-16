import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, initializeAuth, getReactNativePersistence, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import type { ReactNativeAsyncStorage } from "firebase/auth";

import { firebaseAuthStorage } from "@/utils/firebaseAuthStorage";
import { firebaseRuntime } from "@/utils/firebaseRuntime";

const appInstance: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseRuntime.firebaseOptions) : getApp();

// Sessão apenas em memória — ao fechar o app, a sessão é encerrada e o usuário
// volta para a tela de login na próxima abertura. Conforme [[Autenticação]].
const memoryOnlyAuthStorage: ReactNativeAsyncStorage = {
  async setItem() {},
  async getItem() { return null; },
  async removeItem() {},
};

const createPrimaryAuthInstance = (firebaseApp: FirebaseApp): Auth => {
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(memoryOnlyAuthStorage),
    });
  } catch {
    return getAuth(firebaseApp);
  }
};

const createSecondaryAuthInstance = (firebaseApp: FirebaseApp): Auth => {
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(firebaseAuthStorage),
    });
  } catch {
    return getAuth(firebaseApp);
  }
};

const authInstance = createPrimaryAuthInstance(appInstance);

const secondaryAppInstance: FirebaseApp =
  getApps().some(a => a.name === "SECONDARY")
    ? getApp("SECONDARY")
    : initializeApp(firebaseRuntime.firebaseOptions, "SECONDARY");

const secondaryAuthInstance = createSecondaryAuthInstance(secondaryAppInstance);

export const app = appInstance;
export const auth = authInstance;
export const db = getFirestore(appInstance);
export const secondaryApp = secondaryAppInstance;
export const secondaryAuth = secondaryAuthInstance;
export const firebaseFunctions = getFunctions(appInstance, "southamerica-east1");

if (firebaseRuntime.target === 'emulator') {
  const host = firebaseRuntime.emulatorHost!;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectAuthEmulator(secondaryAuth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(firebaseFunctions, host, 5001);
}
