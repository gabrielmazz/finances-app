// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

/**
 * Reads environment variables prefixed with EXPO_PUBLIC_ and fails fast if any is missing.
 */
const getEnvVar = (key: string): string => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return value;
};

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig: FirebaseOptions = {
    apiKey: getEnvVar("EXPO_PUBLIC_FIREBASE_API_KEY"),
    authDomain: getEnvVar("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: getEnvVar("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: getEnvVar("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getEnvVar("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: getEnvVar("EXPO_PUBLIC_FIREBASE_APP_ID"),
    measurementId: getEnvVar("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID")
};

// Initialize Firebase
const appInstance: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
let authInstance;
try {
    authInstance = initializeAuth(appInstance, {
        persistence: getReactNativePersistence(AsyncStorage)
    });
} catch (_error) {
    authInstance = getAuth(appInstance);
}

const secondaryAppInstance: FirebaseApp =
    getApps().some(existingApp => existingApp.name === 'SECONDARY')
        ? getApp('SECONDARY')
        : initializeApp(firebaseConfig, 'SECONDARY');
let secondaryAuthInstance;
try {
    secondaryAuthInstance = initializeAuth(secondaryAppInstance, {
        persistence: getReactNativePersistence(AsyncStorage)
    });
} catch (_error) {
    secondaryAuthInstance = getAuth(secondaryAppInstance);
}

export const app = appInstance;
export const auth = authInstance;
export const db = getFirestore(appInstance);
export const secondaryApp = secondaryAppInstance;
export const secondaryAuth = secondaryAuthInstance;
