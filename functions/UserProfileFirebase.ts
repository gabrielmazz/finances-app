import { doc, getDoc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/FirebaseConfig';
import { getAllUsersFirebase, getRelatedUsersFirebase } from '@/functions/RegisterUserFirebase';
import { getBanksWithUsersByPersonFirebase } from '@/functions/BankFirebase';
import { getTagsWithUsersByPersonFirebase } from '@/functions/TagFirebase';

export type UserProfile = {
	uid: string;
	name: string;
	email: string;
	createdAt: Date | null;
	adminUser: boolean;
};

export function getProfileNameError(name: string): string | null {
	const trimmed = name.trim();
	if (!trimmed) return 'Informe seu nome.';
	if (trimmed.length > 100) return 'Use até 100 caracteres no nome.';
	if (/[\u0000-\u001f\u007f]/.test(trimmed)) return 'Use apenas texto no nome.';
	return null;
}

function requireProfileOwner(uid: string) {
	const user = auth.currentUser;
	if (!user || user.uid !== uid) throw new Error('profile/session-changed');
	return user;
}

export async function getUserProfileFirebase(uid: string): Promise<UserProfile> {
	const user = requireProfileOwner(uid);
	const snapshot = await getDoc(doc(db, 'users', uid));
	requireProfileOwner(uid);
	if (!snapshot.exists()) throw new Error('profile/not-found');
	const data = snapshot.data();
	const createdAt = data.createdAt?.toDate?.();
	return {
		uid,
		name: typeof data.name === 'string' ? data.name : user.displayName ?? '',
		email: user.email ?? '',
		createdAt: createdAt instanceof Date && Number.isFinite(createdAt.getTime()) ? createdAt : null,
		adminUser: Boolean(data.adminUser),
	};
}

/** Mesma contagem exibida no perfil; consultas continuam restritas aos dados legíveis do usuário. */
export async function getUserProfileAccessSummaryFirebase(uid: string, profile: UserProfile) {
	requireProfileOwner(uid);
	if (profile.uid !== uid) throw new Error('profile/session-changed');
	const results = profile.adminUser ? await Promise.all([
		getAllUsersFirebase(), getBanksWithUsersByPersonFirebase(uid), getTagsWithUsersByPersonFirebase(uid),
	]) : [await getRelatedUsersFirebase(uid)];
	requireProfileOwner(uid);
	if (results.some(result => !result.success)) throw new Error('profile/access-summary');
	return { isAdmin: profile.adminUser, monitoredRecordsCount: results.reduce((total, result) => total + (Array.isArray(result.data) ? result.data.length : 0), 0) };
}

export async function updateUserProfileFirebase(uid: string, name: string, options?: { expectedName: string; isCurrent?: () => boolean }): Promise<string> {
	const user = requireProfileOwner(uid);
	const error = getProfileNameError(name);
	if (error) throw new Error(error);
	const normalizedName = name.trim();
	if (options) {
		if (options.isCurrent && !options.isCurrent()) throw new Error('A sessão do assistente foi encerrada.');
		return runTransaction(db, async transaction => {
			const reference = doc(db, 'users', uid);
			const snapshot = await transaction.get(reference);
			requireProfileOwner(uid);
			if (options.isCurrent && !options.isCurrent()) throw new Error('A sessão do assistente foi encerrada.');
			if (!snapshot.exists()) throw new Error('profile/not-found');
			const value = snapshot.data().name;
			const currentName = typeof value === 'string' ? value : user.displayName ?? '';
			if (currentName === normalizedName) return currentName;
			if (currentName !== options.expectedName) throw new Error('Seu nome mudou. Confira o perfil e confirme novamente.');
			transaction.update(reference, { name: normalizedName, updatedAt: serverTimestamp() });
			return normalizedName;
		});
	}
	// [[Perfil do Usuário]]: Firestore é a fonte do nome; nunca regravar permissões ou vínculos.
	await updateDoc(doc(db, 'users', uid), { name: normalizedName, updatedAt: serverTimestamp() });
	return normalizedName;
}
