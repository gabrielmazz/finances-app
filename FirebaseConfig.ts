// FirebaseConfig.ts
import { initializeApp, getApp, getApps, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth, type Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

import { firebaseAuthStorage } from "@/utils/firebaseAuthStorage";

const FIREBASE_ENV = {
  EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
} as const;

const getEnvVar = (key: keyof typeof FIREBASE_ENV): string => {
  const value = FIREBASE_ENV[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
};

const firebaseConfig: FirebaseOptions = {
  apiKey: getEnvVar("EXPO_PUBLIC_FIREBASE_API_KEY"),
  authDomain: getEnvVar("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: getEnvVar("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: getEnvVar("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getEnvVar("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnvVar("EXPO_PUBLIC_FIREBASE_APP_ID"),
  measurementId: getEnvVar("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID")
};

const appInstance: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const createAuthInstance = (firebaseApp: FirebaseApp): Auth => {
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(firebaseAuthStorage),
    });
  } catch {
    return getAuth(firebaseApp);
  }
};

const authInstance = createAuthInstance(appInstance);

const secondaryAppInstance: FirebaseApp =
  getApps().some(a => a.name === "SECONDARY")
    ? getApp("SECONDARY")
    : initializeApp(firebaseConfig, "SECONDARY");

const secondaryAuthInstance = createAuthInstance(secondaryAppInstance);

export const app = appInstance;
export const auth = authInstance;
export const db = getFirestore(appInstance);
export const secondaryApp = secondaryAppInstance;
export const secondaryAuth = secondaryAuthInstance;
