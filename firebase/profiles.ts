import { doc, getDocFromServer, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import { parseProfile, validateProfileName } from '../domain/profile';
import { measureRead } from './diagnostics';
import { LOCAL_PROJECT_ID } from './config';

export type AccountClient = { auth: Auth; db: Firestore };
function requireOwner(client: AccountClient, uid: string) {
	if (client.auth.currentUser?.uid !== uid) throw new Error('session/changed');
	return client.auth.currentUser;
}

export async function loadProfile(client: AccountClient, uid: string) {
	const user = requireOwner(client, uid);
	const snapshot = await measureRead(
		'profile.get',
		() => getDocFromServer(doc(client.db, 'users', uid)),
		() => 1,
	);
	requireOwner(client, uid);
	return snapshot.exists()
		? {
				profile: parseProfile(uid, snapshot.data(), user.email),
				groupId: snapshot.data().financialGroupId ?? null,
			}
		: null;
}

// A missing profile can be completed explicitly; existing fields and UIDs are never replaced.
export async function saveProfileName(
	client: AccountClient,
	uid: string,
	name: string,
	expectedName: string | null,
) {
	if (client.db.app.options.projectId !== LOCAL_PROJECT_ID) throw new Error('read-only/operation');
	const user = requireOwner(client, uid);
	const invalid = validateProfileName(name);
	if (invalid) throw new Error(invalid);
	const normalized = name.trim();
	await runTransaction(client.db, async (transaction) => {
		const reference = doc(client.db, 'users', uid);
		const snapshot = await measureRead(
			'profile.transaction',
			() => transaction.get(reference),
			() => 1,
		);
		requireOwner(client, uid);
		if (!snapshot.exists()) {
			transaction.set(reference, {
				name: normalized,
				email: user.email || '',
				createdAt: serverTimestamp(),
				adminUser: false,
			});
			return;
		}
		const current = typeof snapshot.data().name === 'string' ? snapshot.data().name : '';
		if (current === normalized) return;
		if (current !== expectedName) throw new Error('profile/conflict');
		transaction.update(reference, { name: normalized, updatedAt: serverTimestamp() });
	});
}
