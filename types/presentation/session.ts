export type UserSummary = {
	uid: string;
	displayName: string | null;
	email: string | null;
	photoURL: string | null;
};
export const unavailableUser: UserSummary | null = null;
