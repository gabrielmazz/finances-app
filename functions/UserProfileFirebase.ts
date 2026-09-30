import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/FirebaseConfig';

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

export async function updateUserProfileFirebase(uid: string, name: string): Promise<string> {
	requireProfileOwner(uid);
	const error = getProfileNameError(name);
	if (error) throw new Error(error);
	const normalizedName = name.trim();
	// [[Perfil do Usuário]]: Firestore é a fonte do nome; nunca regravar permissões ou vínculos.
	await updateDoc(doc(db, 'users', uid), { name: normalizedName, updatedAt: serverTimestamp() });
	return normalizedName;
}
