export const LOCAL_PROJECT_ID = 'demo-lumus-foundation';

export function readFirebaseConfig(env: { mode?: string; host?: string }) {
	// Production is deliberately closed until the published permissive Rules are reviewed.
	if (env.mode !== 'emulator') {
		throw new Error('config/isolated-environment-required');
	}
	const host = env.host || '127.0.0.1';
	if (
		!/^(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.test(
			host,
		)
	) {
		throw new Error('config/invalid-emulator-host');
	}
	return {
		options: {
			apiKey: 'demo-api-key',
			projectId: LOCAL_PROJECT_ID,
			authDomain: `${LOCAL_PROJECT_ID}.firebaseapp.com`,
			appId: '1:123456789:web:local-foundation',
		},
		host,
		authPort: 9098,
		firestorePort: 8089,
	};
}
