import {
	createUserWithEmailAndPassword,
	sendPasswordResetEmail,
	signInWithEmailAndPassword,
	signOut,
} from 'firebase/auth';
import { saveProfileName, type AccountClient } from '../firebase/profiles';
import { validateProfileName } from '../domain/profile';

export async function login(client: AccountClient, email: string, password: string) {
	return signInWithEmailAndPassword(client.auth, email.trim().toLowerCase(), password);
}
export async function register(client: AccountClient, name: string, email: string, password: string) {
	if (client.auth.currentUser) throw new Error('auth/already-signed-in');
	const invalid = validateProfileName(name);
	if (invalid) throw new Error(invalid);
	const { user } = await createUserWithEmailAndPassword(client.auth, email.trim().toLowerCase(), password);
	// Auth creation cannot be atomic with Firestore. Keep the account if profile completion fails.
	try {
		await saveProfileName(client, user.uid, name, null);
	} catch (cause) {
		throw Object.assign(new Error('account/profile-incomplete'), {
			code: 'account/profile-incomplete',
			cause,
		});
	}
	return user;
}
export async function requestPasswordReset(client: AccountClient, email: string) {
	try {
		await sendPasswordResetEmail(client.auth, email.trim().toLowerCase());
	} catch (error) {
		if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
	}
}
export async function logout(client: AccountClient) {
	await signOut(client.auth);
}
