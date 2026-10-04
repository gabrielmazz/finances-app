const mockAuth = { currentUser: { uid: 'owner' } as { uid: string } | null };
const mockRelationship = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ get auth() { return mockAuth; }, db: {}, secondaryAuth: {}, secondaryDb: {} }));
jest.mock('@/functions/UserRelationshipFirebase', () => ({ runUserRelationshipFirebase: (...args: unknown[]) => mockRelationship(...args) }));

import { deleteUserRelationFirebase, updateUserRelationsFirebase } from '@/functions/RegisterUserFirebase';

beforeEach(() => {
	jest.clearAllMocks();
	mockAuth.currentUser = { uid: 'owner' };
	mockRelationship.mockImplementation(async (_uid: string, command: { action: string }) => command.action === 'preview'
		? { relatedUserName: 'Maria', fingerprint: 'snapshot', isLinked: false }
		: { relatedUserName: 'Maria', changed: true });
});

it('preserva a API das telas e vincula pelo backend com snapshot em vez de ler/gravar outro usuário no cliente', async () => {
	await expect(updateUserRelationsFirebase('target')).resolves.toMatchObject({ success: true });
	expect(mockRelationship).toHaveBeenNthCalledWith(1, 'owner', { action: 'preview', relatedUserId: 'target' });
	expect(mockRelationship).toHaveBeenNthCalledWith(2, 'owner', expect.objectContaining({ action: 'link', relatedUserId: 'target', expectedFingerprint: 'snapshot', clientActionId: expect.any(String) }));
});

it('desvincula pelo mesmo backend e não tenta um vínculo quando a sessão muda após o preview', async () => {
	await expect(deleteUserRelationFirebase('target')).resolves.toMatchObject({ success: true });
	expect(mockRelationship).toHaveBeenLastCalledWith('owner', expect.objectContaining({ action: 'unlink', expectedFingerprint: 'snapshot' }));
	mockRelationship.mockImplementationOnce(async () => {
		mockAuth.currentUser = { uid: 'another-owner' };
		return { fingerprint: 'another-snapshot' };
	});
	const calls = mockRelationship.mock.calls.length;
	await expect(updateUserRelationsFirebase('other-target')).resolves.toMatchObject({ success: false });
	expect(mockRelationship).toHaveBeenCalledTimes(calls + 1);
});
