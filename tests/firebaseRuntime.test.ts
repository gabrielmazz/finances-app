import {
	DEMO_FIREBASE_PROJECT_ID,
	PRODUCTION_FIREBASE_PROJECT_ID,
	readEmbeddedFirebaseEnvironment,
	resolveFirebaseRuntimeConfig,
} from '@/utils/firebaseRuntime';

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
	it('rejects a production target in development', () => {
		expect(() => resolveFirebaseRuntimeConfig({ ...productionEnvironment, EXPO_PUBLIC_APP_ENV: 'development' })).toThrow('Development');
	});
	it('uses production in preview and in a local release with complete credentials', () => {
		expect(resolveFirebaseRuntimeConfig({ ...productionEnvironment, EXPO_PUBLIC_APP_ENV: 'preview' }).projectId).toBe(PRODUCTION_FIREBASE_PROJECT_ID);
		expect(resolveFirebaseRuntimeConfig({ ...productionEnvironment, EXPO_PUBLIC_FIREBASE_TARGET: undefined }).projectId).toBe(PRODUCTION_FIREBASE_PROJECT_ID);
	});
	it('rejects emulator in preview/production and missing production credentials', () => {
		expect(() => resolveFirebaseRuntimeConfig({ EXPO_PUBLIC_APP_ENV: 'preview', EXPO_PUBLIC_FIREBASE_TARGET: 'emulator' })).toThrow('Preview');
		expect(() => resolveFirebaseRuntimeConfig({ EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_FIREBASE_TARGET: 'emulator' })).toThrow('production');
		expect(() => resolveFirebaseRuntimeConfig({ EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_FIREBASE_TARGET: 'production' })).toThrow('Missing');
	});
	it('reads every Expo public variable through a direct property access', () => {
		const embeddedEnvironment = readEmbeddedFirebaseEnvironment();
		expect(embeddedEnvironment).toHaveProperty('EXPO_PUBLIC_FIREBASE_TARGET');
		expect(embeddedEnvironment).toHaveProperty('EXPO_PUBLIC_FIREBASE_API_KEY');
		expect(embeddedEnvironment).toHaveProperty('EXPO_PUBLIC_FIREBASE_APP_ID');
	});
});
