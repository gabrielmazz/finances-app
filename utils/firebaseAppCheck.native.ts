import type { FirebaseApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type { FirebaseAppCheckTypes } from '@react-native-firebase/app-check';
import { firebaseRuntime } from '@/utils/firebaseRuntime';
import { nativeAppCheckToken } from '@/utils/firebaseAppCheckToken';

let initialization: Promise<FirebaseAppCheckTypes.Module> | null = null;
const businessApps = new WeakSet<FirebaseApp>();

export async function ensureNativeAppCheck(): Promise<FirebaseAppCheckTypes.Module> {
  if (!initialization) initialization = (async () => {
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      throw new Error('App Check remoto exige um build nativo do Lumus.');
    }
    const nativeApp = require('@react-native-firebase/app').getApp();
    if (firebaseRuntime.target !== 'emulator' && nativeApp.options.projectId !== firebaseRuntime.projectId) {
      throw new Error('O Firebase nativo não corresponde ao ambiente financeiro.');
    }
    const module = require('@react-native-firebase/app-check').default(nativeApp) as FirebaseAppCheckTypes.Module;
    const provider = module.newReactNativeFirebaseAppCheckProvider();
    const debug = firebaseRuntime.target === 'emulator' ||
      (firebaseRuntime.target === 'preview' && process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_ANDROID_PROVIDER === 'debug');
    const extra = Constants.expoConfig?.extra as { lumusAssistantAppCheckDebugToken?: unknown } | undefined;
    const debugToken = typeof extra?.lumusAssistantAppCheckDebugToken === 'string'
      ? extra.lumusAssistantAppCheckDebugToken : undefined;
    provider.configure({
      android: { provider: debug ? 'debug' : 'playIntegrity', ...(debug && debugToken ? { debugToken } : {}) },
      apple: { provider: debug ? 'debug' : 'appAttestWithDeviceCheckFallback', ...(debug && debugToken ? { debugToken } : {}) },
    });
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw new Error('Plataforma App Check não suportada.');
    await module.initializeAppCheck({ provider, isTokenAutoRefreshEnabled: true });
    return module;
  })();
  try { return await initialization; }
  catch (error) { initialization = null; throw error; }
}

export function initializeBusinessAppCheck(app: FirebaseApp) {
  if (firebaseRuntime.target === 'emulator' || businessApps.has(app)) return;
  initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: async () => nativeAppCheckToken((await (await ensureNativeAppCheck()).getToken()).token),
    }),
    isTokenAutoRefreshEnabled: true,
  });
  businessApps.add(app);
}
