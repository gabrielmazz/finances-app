import { createUserWithEmailAndPassword, deleteUser, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { setDoc } from 'firebase/firestore';
import { auth, secondaryAuth, secondaryDb } from '@/FirebaseConfig';
import { registerUserFirebase, requestPasswordResetFirebase } from '@/functions/RegisterUserFirebase';

jest.mock('@/FirebaseConfig', () => ({
	auth: { currentUser: { uid: 'primary-user' }, languageCode: null },
	db: { app: 'primary' }, secondaryAuth: { app: 'secondary' }, secondaryDb: { app: 'secondary' },
}));
jest.mock('firebase/auth', () => ({
	createUserWithEmailAndPassword: jest.fn(), deleteUser: jest.fn(), signOut: jest.fn(), sendPasswordResetEmail: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
	doc: jest.fn((database, collection, id) => ({ database, collection, id })), setDoc: jest.fn(),
}));

const newUser = { uid: 'new-user' };
beforeEach(() => {
	jest.clearAllMocks();
	jest.mocked(createUserWithEmailAndPassword).mockResolvedValue({ user: newUser } as never);
	jest.mocked(setDoc).mockResolvedValue(undefined);
	jest.mocked(deleteUser).mockResolvedValue(undefined);
	jest.mocked(signOut).mockResolvedValue(undefined);
	jest.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);
});

it('creates a standard profile under the secondary session without altering the primary user or storing the password', async () => {
	const result = await registerUserFirebase({ name: '  Ana  ', email: 'ana@example.com', password: 'secret123' });
	expect(result.success).toBe(true);
	expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(secondaryAuth, 'ana@example.com', 'secret123');
	expect(setDoc).toHaveBeenCalledWith({ database: secondaryDb, collection: 'users', id: 'new-user' }, {
		name: 'Ana', email: 'ana@example.com', adminUser: false, createdAt: expect.any(Date),
	});
	expect(auth.currentUser?.uid).toBe('primary-user');
	expect(signOut).toHaveBeenCalledWith(secondaryAuth);
	expect(deleteUser).not.toHaveBeenCalled();
});

it('does not write or delete anything if the email is already registered', async () => {
	const error = { code: 'auth/email-already-in-use' };
	jest.mocked(createUserWithEmailAndPassword).mockRejectedValueOnce(error);
	expect(await registerUserFirebase({ email: 'ana@example.com', password: 'secret123' })).toEqual({ success: false, error });
	expect(setDoc).not.toHaveBeenCalled();
	expect(deleteUser).not.toHaveBeenCalled();
	expect(signOut).not.toHaveBeenCalled();
});

it('removes the just-created Auth account when its profile is rejected and clears the secondary session', async () => {
	const error = { code: 'permission-denied' };
	jest.mocked(setDoc).mockRejectedValueOnce(error);
	expect(await registerUserFirebase({ email: 'ana@example.com', password: 'secret123' })).toEqual({ success: false, error });
	expect(deleteUser).toHaveBeenCalledWith(newUser);
	expect(signOut).toHaveBeenCalledWith(secondaryAuth);
});

it('reports an incomplete account if compensating deletion also fails', async () => {
	jest.mocked(setDoc).mockRejectedValueOnce({ code: 'permission-denied' });
	jest.mocked(deleteUser).mockRejectedValueOnce({ code: 'auth/network-request-failed' });
	expect(await registerUserFirebase({ email: 'ana@example.com', password: 'secret123' })).toEqual({ success: false, error: { code: 'auth/profile-creation-incomplete' } });
	expect(signOut).toHaveBeenCalledWith(secondaryAuth);
});

it('requests password recovery with a normalized email and Portuguese template', async () => {
	await requestPasswordResetFirebase(' ANA@EXAMPLE.COM ');
	expect(sendPasswordResetEmail).toHaveBeenCalledWith(auth, 'ana@example.com');
	expect(auth.languageCode).toBe('pt-BR');
});

it('does not disclose that an account is missing', async () => {
	jest.mocked(sendPasswordResetEmail).mockRejectedValueOnce({ code: 'auth/user-not-found' });
	await expect(requestPasswordResetFirebase('missing@example.com')).resolves.toBeUndefined();
});

it.each(['auth/network-request-failed', 'auth/too-many-requests'])('preserves %s so the form can offer recovery', async code => {
	jest.mocked(sendPasswordResetEmail).mockRejectedValueOnce({ code });
	await expect(requestPasswordResetFirebase('ana@example.com')).rejects.toEqual({ code });
});
