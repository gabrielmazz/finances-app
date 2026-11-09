export const LOCAL_PROJECT_ID = 'demo-lumus-foundation';
import productionReadiness from './production-readiness.json';
type ProductionReadiness = {status:string;projectId:string;appId:string;authDomain:string;rulesSHA256:string;verifiedAt:string|null};

export function readFirebaseConfig(env: { mode?: string; host?: string; apiKey?: string }, readiness: ProductionReadiness = productionReadiness) {
	if(env.mode==='production') {
		if(readiness.status!=='published-verified'||readiness.projectId!=='finances-app-e8685'||!readiness.verifiedAt||!/^[a-f0-9]{64}$/.test(readiness.rulesSHA256))throw new Error('config/production-not-verified');
		if(!env.apiKey?.trim())throw new Error('config/missing-production-options');
		return {mode:'production' as const, options:{apiKey:env.apiKey,projectId:readiness.projectId,appId:readiness.appId,authDomain:readiness.authDomain}};
	}
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
		mode: 'emulator' as const,
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
