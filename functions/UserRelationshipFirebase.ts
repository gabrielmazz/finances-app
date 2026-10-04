import { auth, firebaseFunctions } from '@/FirebaseConfig';
import { httpsCallable } from 'firebase/functions';

export type UserRelationshipCommand = {
	action: 'preview' | 'link' | 'unlink';
	relatedUserId: string;
	clientActionId?: string;
	expectedFingerprint?: string;
};
export type UserRelationshipResult = {
	relatedUserName: string;
	isLinked?: boolean;
	fingerprint?: string;
	changed?: boolean;
	idempotent?: boolean;
};

export async function runUserRelationshipFirebase(uid: string, command: UserRelationshipCommand): Promise<UserRelationshipResult> {
	if (!uid || auth.currentUser?.uid !== uid) throw new Error('A conta mudou. Envie o pedido novamente na conta atual.');
	const result = await httpsCallable<UserRelationshipCommand, UserRelationshipResult>(firebaseFunctions, 'userRelationship')(command);
	if (auth.currentUser?.uid !== uid) throw new Error('A conta mudou. Confira o resultado do vínculo na conta original.');
	return result.data;
}
