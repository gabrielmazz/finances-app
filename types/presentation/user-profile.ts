export type UserProfile = {
	uid: string;
	name: string;
	email: string;
	createdAt: Date | null;
	adminUser: boolean;
};
