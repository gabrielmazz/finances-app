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
	hasIncomingInvite?: boolean;
	status?: 'invited' | 'linked' | 'unlinked';
	fingerprint?: string;
	changed?: boolean;
	idempotent?: boolean;
};

export async function listIncomingRelationshipInvitesFirebase(uid: string): Promise<Array<{ id: string; name: string }>> {
	if (!uid || auth.currentUser?.uid !== uid) throw new Error('A conta mudou.');
	const result = await httpsCallable<{ action: 'list-invites' }, { invites: Array<{ id: string; name: string }> }>(firebaseFunctions, 'userRelationship')({ action: 'list-invites' });
	if (auth.currentUser?.uid !== uid) throw new Error('A conta mudou.');
	return result.data.invites;
}

export async function runUserRelationshipFirebase(uid: string, command: UserRelationshipCommand): Promise<UserRelationshipResult> {
	if (!uid || auth.currentUser?.uid !== uid) throw new Error('A conta mudou. Envie o pedido novamente na conta atual.');
	const result = await httpsCallable<UserRelationshipCommand, UserRelationshipResult>(firebaseFunctions, 'userRelationship')(command);
	if (auth.currentUser?.uid !== uid) throw new Error('A conta mudou. Confira o resultado do vínculo na conta original.');
	return result.data;
}
