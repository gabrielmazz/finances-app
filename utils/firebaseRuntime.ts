import type { FirebaseOptions } from 'firebase/app';

export const DEMO_FIREBASE_PROJECT_ID = 'demo-lumus-financas';
export const PRODUCTION_FIREBASE_PROJECT_ID = 'finances-app-e8685';

export type FirebaseTarget = 'emulator' | 'production';

export type FirebaseRuntimeConfig = Readonly<{
	target: FirebaseTarget;
	projectId: string;
	emulatorHost?: string;
	firebaseOptions: FirebaseOptions;
}>;

type RuntimeEnvironment = Record<string, string | undefined>;

const requiredProductionKeys = [
	'EXPO_PUBLIC_FIREBASE_API_KEY',
	'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
	'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
	'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
	'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
	'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

const isDevelopmentBuild = (environment: RuntimeEnvironment) =>
	environment.EXPO_PUBLIC_APP_ENV === 'development' ||
	environment.EXPO_PUBLIC_APP_ENV === 'preview' ||
	Boolean(environment.JEST_WORKER_ID) ||
	// Expo defines __DEV__ at runtime; local Metro intentionally defaults to the emulator.
	(typeof __DEV__ !== 'undefined' && __DEV__);

export const resolveFirebaseRuntimeConfig = (
	environment: RuntimeEnvironment = process.env,
): FirebaseRuntimeConfig => {
	const requestedTarget = environment.EXPO_PUBLIC_FIREBASE_TARGET;
	const target: FirebaseTarget = requestedTarget === 'emulator' || requestedTarget === 'production'
		? requestedTarget
		: isDevelopmentBuild(environment)
			? 'emulator'
			: (() => { throw new Error('EXPO_PUBLIC_FIREBASE_TARGET must be emulator or production.'); })();

	if (target === 'emulator') {
		if (environment.EXPO_PUBLIC_APP_ENV === 'production') {
			throw new Error('Production builds must use the production Firebase target.');
		}

		const emulatorHost = environment.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ?? '127.0.0.1';
		if (emulatorHost !== '127.0.0.1' && emulatorHost !== 'localhost') {
			throw new Error('Firebase Emulator host must be a local host.');
		}

		return Object.freeze({
			target,
			projectId: DEMO_FIREBASE_PROJECT_ID,
			emulatorHost,
			firebaseOptions: {
				apiKey: 'demo-lumus-financas-api-key',
				authDomain: `${DEMO_FIREBASE_PROJECT_ID}.local`,
				projectId: DEMO_FIREBASE_PROJECT_ID,
				storageBucket: `${DEMO_FIREBASE_PROJECT_ID}.local`,
				messagingSenderId: '000000000000',
				appId: '1:000000000000:web:demo-lumus-financas',
			},
		});
	}

	if (isDevelopmentBuild(environment)) {
		throw new Error('Development and preview builds must use the Firebase Emulator target.');
	}

	for (const key of requiredProductionKeys) {
		if (!environment[key]) throw new Error(`Missing environment variable: ${key}`);
	}
	if (environment.EXPO_PUBLIC_FIREBASE_PROJECT_ID !== PRODUCTION_FIREBASE_PROJECT_ID) {
		throw new Error('Production Firebase project ID is invalid.');
	}

	return Object.freeze({
		target,
		projectId: PRODUCTION_FIREBASE_PROJECT_ID,
		firebaseOptions: {
			apiKey: environment.EXPO_PUBLIC_FIREBASE_API_KEY!,
			authDomain: environment.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
			projectId: environment.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
			storageBucket: environment.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
			messagingSenderId: environment.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
			appId: environment.EXPO_PUBLIC_FIREBASE_APP_ID!,
			measurementId: environment.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
		},
	});
};

export const firebaseRuntime = resolveFirebaseRuntimeConfig();
export const isFirebaseEmulatorRuntime = () => firebaseRuntime.target === 'emulator';
