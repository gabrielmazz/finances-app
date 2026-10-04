const mockGetDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockTransactionGet = jest.fn();
const mockTransactionUpdate = jest.fn();
const mockRelated = jest.fn();
const mockUsers = jest.fn();
const mockBanks = jest.fn();
const mockTags = jest.fn();
const mockAuth = { currentUser: null as { uid: string; email: string; displayName?: string } | null };
jest.mock('@/FirebaseConfig', () => ({ get auth() { return mockAuth; }, db: {} }));
jest.mock('firebase/firestore', () => ({
	doc: (_db: unknown, collection: string, uid: string) => `${collection}/${uid}`,
	getDoc: (...args: unknown[]) => mockGetDoc(...args),
	updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
	serverTimestamp: () => 'server-time',
	runTransaction: async (_db: unknown, operation: (transaction: unknown) => Promise<unknown>) => operation({ get: (...args: unknown[]) => mockTransactionGet(...args), update: (...args: unknown[]) => mockTransactionUpdate(...args) }),
}));
jest.mock('@/functions/RegisterUserFirebase', () => ({ getRelatedUsersFirebase: (...args: unknown[]) => mockRelated(...args), getAllUsersFirebase: (...args: unknown[]) => mockUsers(...args) }));
jest.mock('@/functions/BankFirebase', () => ({ getBanksWithUsersByPersonFirebase: (...args: unknown[]) => mockBanks(...args) }));
jest.mock('@/functions/TagFirebase', () => ({ getTagsWithUsersByPersonFirebase: (...args: unknown[]) => mockTags(...args) }));
import { getProfileNameError, getUserProfileFirebase, getUserProfileAccessSummaryFirebase, updateUserProfileFirebase } from '@/functions/UserProfileFirebase';

beforeEach(() => {
	jest.clearAllMocks();
	mockAuth.currentUser = { uid: 'owner', email: 'access@example.com', displayName: 'Nome legado' };
	mockUpdateDoc.mockResolvedValue(undefined);
	mockTransactionGet.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Ana' }) });
	for (const mock of [mockRelated, mockUsers, mockBanks, mockTags]) mock.mockResolvedValue({ success: true, data: [{ id: 'one' }, { id: 'two' }] });
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

it('compares the authorized name inside the transaction and refuses a concurrent rename', async () => {
	mockTransactionGet.mockResolvedValueOnce({ exists: () => true, data: () => ({ name: 'Luiza' }) });
	await expect(updateUserProfileFirebase('owner', 'Maria', { expectedName: 'Ana' })).rejects.toThrow('Seu nome mudou');
	expect(mockTransactionUpdate).not.toHaveBeenCalled();
	expect(mockUpdateDoc).not.toHaveBeenCalled();
	await expect(updateUserProfileFirebase('owner', 'Maria', { expectedName: 'Ana' })).resolves.toBe('Maria');
	expect(mockTransactionUpdate).toHaveBeenCalledWith('users/owner', { name: 'Maria', updatedAt: 'server-time' });
});

it('recognizes an already committed name and fences a UID change while reading the transaction', async () => {
	mockTransactionGet.mockResolvedValueOnce({ exists: () => true, data: () => ({ name: 'Maria' }) });
	await expect(updateUserProfileFirebase('owner', 'Maria', { expectedName: 'Ana' })).resolves.toBe('Maria');
	expect(mockTransactionUpdate).not.toHaveBeenCalled();
	mockTransactionGet.mockImplementationOnce(async () => {
		mockAuth.currentUser = { uid: 'other', email: 'other@example.com' };
		return { exists: () => true, data: () => ({ name: 'Ana' }) };
	});
	await expect(updateUserProfileFirebase('owner', 'Maria', { expectedName: 'Ana' })).rejects.toThrow('session-changed');
	expect(mockTransactionUpdate).not.toHaveBeenCalled();
});

it('stops a write when assistant consent is revoked while the transaction reads', async () => {
	let active = true;
	mockTransactionGet.mockImplementationOnce(async () => {
		active = false;
		return { exists: () => true, data: () => ({ name: 'Ana' }) };
	});
	await expect(updateUserProfileFirebase('owner', 'Maria', { expectedName: 'Ana', isCurrent: () => active })).rejects.toThrow('sessão do assistente foi encerrada');
	expect(mockTransactionUpdate).not.toHaveBeenCalled();
});

it('uses the same scoped access count for profile and conversation, and does not invent a count on query failure', async () => {
	const profile = { uid: 'owner', name: 'Ana', email: '', createdAt: null, adminUser: false };
	await expect(getUserProfileAccessSummaryFirebase('owner', profile)).resolves.toEqual({ isAdmin: false, monitoredRecordsCount: 2 });
	expect(mockBanks).not.toHaveBeenCalled();
	await expect(getUserProfileAccessSummaryFirebase('owner', { ...profile, adminUser: true })).resolves.toEqual({ isAdmin: true, monitoredRecordsCount: 6 });
	expect(mockBanks).toHaveBeenCalledWith('owner');
	mockTags.mockResolvedValueOnce({ success: false });
	await expect(getUserProfileAccessSummaryFirebase('owner', { ...profile, adminUser: true })).rejects.toThrow('access-summary');
});
