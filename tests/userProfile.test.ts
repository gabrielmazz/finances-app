import { act, renderHook } from '@testing-library/react-native';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { UserProfile } from '@/functions/UserProfileFirebase';

const mockLoad = jest.fn();
const mockSave = jest.fn();
const mockCopy = jest.fn();
const mockAuth = { currentUser: { uid: 'owner' } as { uid: string } | null };
jest.mock('@/FirebaseConfig', () => ({ get auth() { return mockAuth; } }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockAuth.currentUser }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: (...args: unknown[]) => mockCopy(...args) }));
jest.mock('@/functions/UserProfileFirebase', () => ({
	getUserProfileFirebase: (...args: unknown[]) => mockLoad(...args),
	updateUserProfileFirebase: (...args: unknown[]) => mockSave(...args),
	getProfileNameError: (name: string) => name.trim() ? null : 'Informe seu nome.',
}));
const profile: UserProfile = { uid: 'owner', name: 'Maria', email: 'maria@example.com', createdAt: null };
const deferred = <T,>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(fulfill => { resolve = fulfill; });
	return { promise, resolve };
};
beforeEach(() => {
	mockAuth.currentUser = { uid: 'owner' };
	mockLoad.mockReset().mockResolvedValue(profile);
	mockSave.mockReset().mockImplementation(async (_uid: string, name: string) => name.trim());
	mockCopy.mockReset().mockResolvedValue(true);
});

it('keeps edits after a failed save and allows retry', async () => {
	mockSave.mockRejectedValueOnce(new Error('offline'));
	const { result, unmount } = await renderHook(() => useUserProfile());
	await act(async () => result.current.changeName('Maria Silva'));
	await act(async () => { await result.current.save(); });
	expect(result.current.name).toBe('Maria Silva');
	expect(result.current.dirty).toBe(true);
	expect(result.current.feedback?.error).toBe(true);
	await act(async () => { await result.current.save(); });
	expect(result.current.profile?.name).toBe('Maria Silva');
	expect(result.current.dirty).toBe(false);
	expect(result.current.feedback?.text).toBe('Perfil atualizado.');
	await unmount();
});

it('serializes repeated submits before React renders the pending state', async () => {
	const pending = deferred<string>();
	mockSave.mockReturnValueOnce(pending.promise);
	const { result, unmount } = await renderHook(() => useUserProfile());
	await act(async () => result.current.changeName('Maria Silva'));
	let saving!: Promise<boolean>;
	await act(async () => { saving = result.current.save(); void result.current.save(); });
	expect(mockSave).toHaveBeenCalledTimes(1);
	expect(result.current.saving).toBe(true);
	await act(async () => { pending.resolve('Maria Silva'); await saving; });
	expect(result.current.saving).toBe(false);
	await unmount();
});

it('validates before saving and resets a discarded draft', async () => {
	const { result, unmount } = await renderHook(() => useUserProfile());
	await act(async () => result.current.changeName('  '));
	await act(async () => { await result.current.save(); });
	expect(result.current.nameError).toBe('Informe seu nome.');
	expect(mockSave).not.toHaveBeenCalled();
	await act(async () => result.current.reset());
	expect(result.current.name).toBe('Maria');
	expect(result.current.nameError).toBeNull();
	await unmount();
});

it('recovers after a profile load failure', async () => {
	mockLoad.mockRejectedValueOnce(new Error('offline'));
	const { result, unmount } = await renderHook(() => useUserProfile());
	expect(result.current.loadError).toContain('Tente novamente');
	await act(async () => result.current.reload());
	expect(result.current.profile).toEqual(profile);
	expect(result.current.loadError).toBe('');
	await unmount();
});

it('does not expose an obsolete save after account switching', async () => {
	const oldSave = deferred<string>();
	mockSave.mockReturnValueOnce(oldSave.promise);
	const { result, rerender, unmount } = await renderHook(() => useUserProfile());
	await act(async () => result.current.changeName('Old edit'));
	let saving!: Promise<boolean>;
	await act(async () => { saving = result.current.save(); });
	mockAuth.currentUser = { uid: 'new-user' };
	mockLoad.mockResolvedValueOnce({ ...profile, uid: 'new-user', name: 'Nova pessoa' });
	await rerender({});
	await act(async () => { oldSave.resolve('Old edit'); await saving; });
	expect(result.current.profile?.uid).toBe('new-user');
	expect(result.current.name).toBe('Nova pessoa');
	expect(result.current.feedback).toBeNull();
	await unmount();
});

it('ignores an old account read that finishes after the new account loads', async () => {
	const pending = deferred<UserProfile>();
	mockLoad.mockReturnValueOnce(pending.promise);
	const { result, rerender, unmount } = await renderHook(() => useUserProfile());
	mockAuth.currentUser = { uid: 'new-user' };
	mockLoad.mockResolvedValueOnce({ ...profile, uid: 'new-user', name: 'Nova pessoa' });
	await rerender({});
	await act(async () => pending.resolve(profile));
	expect(result.current.profile?.uid).toBe('new-user');
	expect(result.current.name).toBe('Nova pessoa');
	await unmount();
});

it('reports clipboard failure without claiming the ID was copied', async () => {
	mockCopy.mockResolvedValueOnce(false);
	const { result, unmount } = await renderHook(() => useUserProfile());
	await act(async () => { await result.current.copyId(); });
	expect(result.current.feedback?.error).toBe(true);
	await act(async () => { await result.current.copyId(); });
	expect(mockCopy).toHaveBeenCalledWith('owner');
	expect(result.current.feedback?.text).toBe('ID copiado.');
	await unmount();
});
