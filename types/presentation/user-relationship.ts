export type UserRelationshipResult = {
	relatedUserName: string;
	isLinked?: boolean;
	hasIncomingInvite?: boolean;
	status?: 'invited' | 'linked' | 'unlinked';
	fingerprint?: string;
	changed?: boolean;
	idempotent?: boolean;
};
