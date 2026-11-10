import { readFirebaseConfig, LOCAL_PROJECT_ID } from '../firebase/config';
import { parseProfile, validateProfileName } from '../domain/profile';
import { errorMessage } from '../application/errors';

describe('isolated Firebase foundation', () => {
	it('requires a session for workspace routes and preserves platform/visibility guards', () => {
		jest.doMock('expo-router', () => ({ router: {} }));
		const { APP_ROUTE_GUARD_ENTRIES, isAppRouteAllowed } =
			require('../utils/appRouteGuards') as typeof import('../utils/appRouteGuards');
		const profile = APP_ROUTE_GUARD_ENTRIES.find(
			(entry) => entry.isActivePlatform && entry.pathname.endsWith('/profile'),
		)!;
		const inactive = APP_ROUTE_GUARD_ENTRIES.find((entry) => !entry.isActivePlatform)!;
		expect(isAppRouteAllowed(profile, () => true, false)).toBe(false);
		expect(isAppRouteAllowed(profile, () => true, true)).toBe(true);
		expect(isAppRouteAllowed(profile, () => false, true)).toBe(false);
		expect(isAppRouteAllowed(inactive, () => true, true)).toBe(false);
	});
	it('requires explicit emulator mode and never falls back to a real project', () => {
		for (const mode of [undefined, '', 'test'])
			expect(() => readFirebaseConfig({ mode })).toThrow('config/isolated-environment-required');
		expect(() => readFirebaseConfig({mode:'production',apiKey:'demo-api-key'},{status:'awaiting-publication',projectId:'finances-app-e8685',appId:'existing-app',authDomain:'finances-app-e8685.firebaseapp.com',rulesSHA256:'',verifiedAt:null})).toThrow('config/production-not-verified');
		expect(readFirebaseConfig({ mode: 'emulator' }).options.projectId).toBe(LOCAL_PROJECT_ID);
		for (const host of ['example.com', '127.0.0.1/evil', 'https://localhost', '169.254.169.254'])
			expect(() => readFirebaseConfig({ mode: 'emulator', host })).toThrow();
		expect(readFirebaseConfig({ mode: 'emulator', host: '10.0.2.2' }).host).toBe('10.0.2.2');
	});
	it('prepares the existing production SDK only after a verified publication record',()=>{
		const readiness={status:'published-verified',projectId:'finances-app-e8685',appId:'existing-app',authDomain:'finances-app-e8685.firebaseapp.com',rulesSHA256:'a'.repeat(64),verifiedAt:new Date().toISOString()};
		expect(readFirebaseConfig({mode:'production',apiKey:'public-sdk-key'},readiness).options.projectId).toBe('finances-app-e8685');
		expect(()=>readFirebaseConfig({mode:'production',apiKey:'public-sdk-key'},{...readiness,projectId:'another-project'})).toThrow();
		expect(()=>readFirebaseConfig({mode:'production'},readiness)).toThrow('missing-production-options');
	});
	it('reads incomplete and legacy profiles without trusting permission flags or stored email', () => {
		for (const createdAt of [
			new Date('2025-01-01'),
			'2025-01-01',
			{ seconds: 1735689600 },
			{ toDate: () => new Date('2025-01-01') },
		]) {
			const parsed = parseProfile(
				'existing-uid',
				{ createdAt, adminUser: true, email: 'untrusted@x.test' },
				'auth@x.test',
			);
			expect(parsed).toMatchObject({ uid: 'existing-uid', name: '', adminUser: false, email: 'auth@x.test' });
			expect(parsed.createdAt?.getUTCFullYear()).toBe(2025);
		}
		expect(parseProfile('uid', { createdAt: 'invalid' }, null).createdAt).toBeNull();
	});
	it('validates bounded names and maps failures without exposing raw messages', () => {
		for (const name of ['', '   ', 'x'.repeat(101), 'bad\nname'])
			expect(validateProfileName(name)).not.toBeNull();
		expect(validateProfileName(' Pessoa ')).toBeNull();
		expect(errorMessage({ code: 'permission-denied', message: 'sensitive data' })).not.toContain('sensitive');
		expect(errorMessage({ code: 'unavailable' })).toContain('conexão');
		expect(errorMessage({ code: 'resource-exhausted' })).toContain('cota');
	});
});
