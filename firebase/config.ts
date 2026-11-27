export const LOCAL_PROJECT_ID = 'demo-lumus-foundation';
export const OFFICIAL_PROJECT_ID = 'finances-app-e8685';
import stagingSdk from './staging-sdk.json';
export const STAGING_PROJECT_ID = stagingSdk.projectId;
export const STAGING_APP_ID = stagingSdk.appId;
import productionReadiness from './production-readiness.json';
type ProductionReadiness = {status:string;projectId:string;appId:string;authDomain:string;rulesSHA256:string;verifiedAt:string|null};
type FinanceReadiness = ProductionReadiness & {
	financialSchemaVersion?: number;
	financialWritesEnabled: boolean;
	paymentExtensionsEnabled?: boolean;
	migrationManifestSHA256?: string;
	canonicalRulesSHA256?: string;
	releaseView?: string;
};

export const financialProjectAllowsWrites = (projectId: string | undefined) => projectId === LOCAL_PROJECT_ID || projectId === STAGING_PROJECT_ID;

export function usesCanonicalFinance(projectId: string | undefined, readiness: FinanceReadiness = productionReadiness) {
	if (projectId === STAGING_PROJECT_ID) return true;
	return projectId === OFFICIAL_PROJECT_ID && readiness.projectId === projectId && readiness.status === 'published-verified' &&
		readiness.financialSchemaVersion === 2 && Number.isFinite(Date.parse(readiness.verifiedAt ?? '')) &&
		/^[a-f0-9]{64}$/.test(readiness.migrationManifestSHA256 ?? '') &&
		/^[a-f0-9]{64}$/.test(readiness.rulesSHA256) && readiness.rulesSHA256 === readiness.canonicalRulesSHA256;
}

export function financialLedgerAllowsWrites(projectId: string | undefined, readiness: FinanceReadiness = productionReadiness) {
	return financialProjectAllowsWrites(projectId) ||
		(usesCanonicalFinance(projectId, readiness) && readiness.releaseView === 'canonical' && readiness.financialWritesEnabled);
}

export function financialMovementExtensionsEnabled(projectId: string | undefined, readiness: FinanceReadiness = productionReadiness) {
	return financialProjectAllowsWrites(projectId) ||
		(readiness.paymentExtensionsEnabled === true && financialLedgerAllowsWrites(projectId, readiness));
}

export function selectedFinancialProject() {
	const mode = process.env.EXPO_PUBLIC_FIREBASE_MODE;
	return mode === 'production' ? OFFICIAL_PROJECT_ID : mode === 'staging' ? STAGING_PROJECT_ID :
		mode === 'emulator' ? LOCAL_PROJECT_ID : undefined;
}

export function readFirebaseConfig(env: { mode?: string; host?: string; apiKey?: string }, readiness: ProductionReadiness = productionReadiness) {
	if (env.mode === 'staging') {
		if (env.host || env.apiKey !== stagingSdk.apiKey) throw Error('config/invalid-staging-options');
		return { mode: 'staging' as const, options: stagingSdk };
	}
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
