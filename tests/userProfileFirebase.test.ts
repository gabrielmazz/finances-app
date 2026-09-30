const mockGetDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockAuth = { currentUser: null as { uid: string; email: string; displayName?: string } | null };
jest.mock('@/FirebaseConfig', () => ({ get auth() { return mockAuth; }, db: {} }));
jest.mock('firebase/firestore', () => ({
	doc: (_db: unknown, collection: string, uid: string) => `${collection}/${uid}`,
	getDoc: (...args: unknown[]) => mockGetDoc(...args),
	updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
	serverTimestamp: () => 'server-time',
}));
import { getProfileNameError, getUserProfileFirebase, updateUserProfileFirebase } from '@/functions/UserProfileFirebase';

beforeEach(() => {
	jest.clearAllMocks();
	mockAuth.currentUser = { uid: 'owner', email: 'access@example.com', displayName: 'Nome legado' };
	mockUpdateDoc.mockResolvedValue(undefined);
});

it('updates only the name and timestamp, preserving permissions, email and relationships', async () => {
	await expect(updateUserProfileFirebase('owner', '  Maria da Silva  ')).resolves.toBe('Maria da Silva');
	expect(mockUpdateDoc).toHaveBeenCalledWith('users/owner', { name: 'Maria da Silva', updatedAt: 'server-time' });
});

it('refuses writes for another account or without a session', async () => {
	await expect(updateUserProfileFirebase('other', 'Maria')).rejects.toThrow('session-changed');
	mockAuth.currentUser = null;
	await expect(updateUserProfileFirebase('owner', 'Maria')).rejects.toThrow('session-changed');
	expect(mockUpdateDoc).not.toHaveBeenCalled();
});

it.each(['  ', 'a'.repeat(101), 'Nome\nOutro'])('rejects invalid names before writing', async name => {
	await expect(updateUserProfileFirebase('owner', name)).rejects.toThrow();
	expect(mockUpdateDoc).not.toHaveBeenCalled();
});

it('accepts international names without requiring a surname', () => {
	for (const name of ['João', '李', "D’Ávila", 'Ana-Maria']) expect(getProfileNameError(name)).toBeNull();
});

it('reads the login email from Auth and tolerates missing legacy name/date', async () => {
	mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ email: 'obsolete@example.com', name: null }) });
	await expect(getUserProfileFirebase('owner')).resolves.toEqual({ uid: 'owner', email: 'access@example.com', name: 'Nome legado', createdAt: null, adminUser: false });
});

it('does not recreate a missing user document or hide a failed write', async () => {
	mockGetDoc.mockResolvedValue({ exists: () => false });
	await expect(getUserProfileFirebase('owner')).rejects.toThrow('not-found');
	mockUpdateDoc.mockRejectedValueOnce(new Error('offline'));
	await expect(updateUserProfileFirebase('owner', 'Maria')).rejects.toThrow('offline');
});

it('discards a read completed after the session changes', async () => {
	mockGetDoc.mockImplementationOnce(async () => {
		mockAuth.currentUser = { uid: 'other', email: 'other@example.com' };
		return { exists: () => true, data: () => ({ name: 'Old account' }) };
	});
	await expect(getUserProfileFirebase('owner')).rejects.toThrow('session-changed');
});
