import React, { act, useState } from 'react';
import { createRoot, type Root } from 'test-renderer';
import { useAccountAccess } from '@/hooks/useAccountAccess';
import { registerUserFirebase, requestPasswordResetFirebase } from '@/functions/RegisterUserFirebase';

jest.mock('@/functions/RegisterUserFirebase', () => ({ registerUserFirebase: jest.fn(), requestPasswordResetFirebase: jest.fn() }));

let access: ReturnType<typeof useAccountAccess>;
let updateEmail: (value: string) => void;
let updatePassword: (value: string) => void;
let currentPassword: string;
let root: Root;
const focusField = jest.fn();
const setEmailError = jest.fn();
const setPasswordError = jest.fn();
function Harness() {
	const [email, setEmail] = useState('ana@example.com');
	const [password, setPassword] = useState('');
	updateEmail = setEmail;
	updatePassword = setPassword;
	currentPassword = password;
	access = useAccountAccess({ email, password, setPassword, setEmailError, setPasswordError, focusField });
	return null;
}

beforeEach(async () => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	jest.clearAllMocks();
	jest.mocked(registerUserFirebase).mockResolvedValue({ success: true, user: { uid: 'new-user' } } as never);
	jest.mocked(requestPasswordResetFirebase).mockResolvedValue(undefined);
	root = createRoot();
	await act(() => root.render(React.createElement(Harness)));
});
afterEach(async () => { await act(() => root.unmount()); });

it('clears passwords when switching forms and validates the first incomplete field before contacting Firebase', async () => {
	await act(() => updatePassword('existing-secret'));
	await act(() => access.changeMode('register'));
	expect(currentPassword).toBe('');
	await act(() => access.submit());
	expect(focusField).toHaveBeenCalledWith('name');
	expect(registerUserFirebase).not.toHaveBeenCalled();
});

it('creates only one standard account on double submit, then returns to login without keeping the password', async () => {
	let finish!: (value: never) => void;
	jest.mocked(registerUserFirebase).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
	await act(() => access.changeMode('register'));
	await act(() => { access.setName(' Ana '); updatePassword('secret123'); });
	let submission!: Promise<void>;
	await act(() => { submission = access.submit(); void access.submit(); access.changeMode('reset'); });
	expect(registerUserFirebase).toHaveBeenCalledTimes(1);
	expect(registerUserFirebase).toHaveBeenCalledWith({ name: 'Ana', email: 'ana@example.com', password: 'secret123' });
	expect(access.mode).toBe('register');
	await act(async () => { finish({ success: true } as never); await submission; });
	expect(access.mode).toBe('login');
	expect(access.feedback?.type).toBe('success');
	expect(currentPassword).toBe('');
});

it('recovers the submit controls after a Firebase failure and keeps form values for retry', async () => {
	jest.mocked(registerUserFirebase).mockResolvedValueOnce({ success: false, error: { code: 'auth/network-request-failed' } });
	await act(() => access.changeMode('register'));
	await act(() => { access.setName('Ana'); updatePassword('secret123'); });
	await act(() => access.submit());
	expect(access.isSubmitting).toBe(false);
	expect(access.mode).toBe('register');
	expect(access.feedback?.message).toContain('Verifique sua internet');
	await act(() => access.submit());
	expect(access.mode).toBe('login');
});

it('requests reset without a password and prevents repeated sends to the same address, including after changing modes', async () => {
	await act(() => access.changeMode('reset'));
	await act(() => access.submit());
	expect(requestPasswordResetFirebase).toHaveBeenCalledWith('ana@example.com');
	expect(access.isResetSent).toBe(true);
	await act(() => access.changeMode('login'));
	await act(() => access.changeMode('reset'));
	await act(() => access.submit());
	expect(requestPasswordResetFirebase).toHaveBeenCalledTimes(1);
	expect(access.feedback?.message).toContain('Se houver uma conta');
	await act(() => updateEmail('outra@example.com'));
	expect(access.feedback).toBeNull();
	expect(access.isResetSent).toBe(false);
});
