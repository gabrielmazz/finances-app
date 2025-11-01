// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
export const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
});
const analytics = getAnalytics(app);
