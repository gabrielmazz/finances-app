import { DEMO_FIREBASE_PROJECT_ID, resolveFirebaseRuntimeConfig } from '@/utils/firebaseRuntime';

const productionEnvironment = {
	EXPO_PUBLIC_FIREBASE_TARGET: 'production',
	EXPO_PUBLIC_FIREBASE_API_KEY: 'key', EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'finances-app-e8685.firebaseapp.com',
	EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'finances-app-e8685', EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'bucket',
	EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'sender', EXPO_PUBLIC_FIREBASE_APP_ID: 'app',
};

describe('Firebase runtime isolation', () => {
	it('accepts development only with the demo emulator', () => {
		const runtime = resolveFirebaseRuntimeConfig({ EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_FIREBASE_TARGET: 'emulator' });
		expect(runtime.projectId).toBe(DEMO_FIREBASE_PROJECT_ID);
	});
	it('rejects a production target in development and preview', () => {
		expect(() => resolveFirebaseRuntimeConfig({ ...productionEnvironment, EXPO_PUBLIC_APP_ENV: 'development' })).toThrow('Development');
		expect(() => resolveFirebaseRuntimeConfig({ ...productionEnvironment, EXPO_PUBLIC_APP_ENV: 'preview' })).toThrow('Development');
	});
	it('rejects emulator in production and missing production credentials', () => {
		expect(() => resolveFirebaseRuntimeConfig({ EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_FIREBASE_TARGET: 'emulator' })).toThrow('Production');
		expect(() => resolveFirebaseRuntimeConfig({ EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_FIREBASE_TARGET: 'production' })).toThrow('Missing');
	});
});
