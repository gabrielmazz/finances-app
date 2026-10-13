import type { FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import Constants from 'expo-constants';
import { firebaseRuntime } from '@/utils/firebaseRuntime';

const instances = new WeakMap<FirebaseApp, AppCheck>();

export function ensureWebAppCheck(app: FirebaseApp): AppCheck {
  const existing = instances.get(app);
  if (existing) return existing;
  const siteKey = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_KEY?.trim();
  if (!siteKey) throw new Error('Firebase App Check reCAPTCHA Enterprise não configurado.');
  const extra = Constants.expoConfig?.extra as { lumusAssistantAppCheckDebugToken?: unknown } | undefined;
  if (firebaseRuntime.target === 'emulator') {
    const token = typeof extra?.lumusAssistantAppCheckDebugToken === 'string'
      ? extra.lumusAssistantAppCheckDebugToken.trim() : undefined;
    (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string })
      .FIREBASE_APPCHECK_DEBUG_TOKEN = token && token.toLowerCase() !== 'true' ? token : true;
  }
  const instance = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true,
  });
  instances.set(app, instance);
  return instance;
}

export function initializeBusinessAppCheck(app: FirebaseApp) {
  if (firebaseRuntime.target !== 'emulator') ensureWebAppCheck(app);
}
