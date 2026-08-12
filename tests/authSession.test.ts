import { isTerminalFirebaseSessionError } from '@/utils/authSession';

describe('Firebase authentication session classification', () => {
	it.each([
		'auth/user-token-expired',
		'auth/invalid-user-token',
		'auth/id-token-expired',
		'auth/user-disabled',
		'auth/user-not-found',
	])('recognizes %s as a terminal session failure', code => {
		expect(isTerminalFirebaseSessionError({ code })).toBe(true);
	});

	it.each([
		{ code: 'auth/network-request-failed' },
		{ code: 'ai/fetch-error', customErrorData: { status: 401 } },
		new Error('offline'),
	])('keeps a session on a transient or non-Auth failure: %p', error => {
		expect(isTerminalFirebaseSessionError(error)).toBe(false);
	});
});
