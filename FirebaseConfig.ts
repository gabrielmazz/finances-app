// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCy5RN7g0rcR__TSeo-s-LVeDZs1xKpe6M",
    authDomain: "finances-app-e8685.firebaseapp.com",
    projectId: "finances-app-e8685",
    storageBucket: "finances-app-e8685.firebasestorage.app",
    messagingSenderId: "909478123750",
    appId: "1:909478123750:web:bfe59f4e4d9682d20a4327",
    measurementId: "G-TMN75L3YNW"
};

// Initialize Firebase
const appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
let authInstance;
try {
    authInstance = initializeAuth(appInstance, {
        persistence: getReactNativePersistence(AsyncStorage)
    });
} catch (_error) {
    authInstance = getAuth(appInstance);
}
export const app = appInstance;
export const auth = authInstance;
export const db = getFirestore(appInstance);