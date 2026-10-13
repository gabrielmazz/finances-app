const mockAuth = { currentUser: { uid: 'A' } as { uid: string } | null };
const mockStorage = new Map<string, string>();
const mockSet = jest.fn(async (..._args: unknown[]) => undefined);
const mockDelete = jest.fn(async (..._args: unknown[]) => undefined);
const mockToken = jest.fn(async () => ({ data: 'ExponentPushToken[synthetic]' }));
jest.mock('@/FirebaseConfig', () => ({ auth: mockAuth, db: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
}));
jest.mock('firebase/firestore', () => ({ doc: (_db: unknown, ...path: string[]) => path.join('/'),
  setDoc: (...args: unknown[]) => mockSet(...args), deleteDoc: (...args: unknown[]) => mockDelete(...args) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'synthetic-project' } } } } }));
jest.mock('@/utils/firebaseRuntime', () => ({ isFirebaseEmulatorRuntime: () => false }));
jest.mock('@/utils/platformCapabilities', () => ({ platformCapabilities: { supportsScheduledLocalNotifications: true } }));
jest.mock('@/utils/notificationsRuntime', () => ({ isNotificationsRuntimeAvailable: () => true, Notifications: { getExpoPushTokenAsync: () => mockToken() } }));
jest.mock('@/utils/localNotifications', () => ({ ensureLocalNotificationPermission: async () => ({ granted: true }) }));

beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks(); mockStorage.clear(); mockAuth.currentUser = { uid: 'A' };
  mockToken.mockResolvedValue({ data: 'ExponentPushToken[synthetic]' }); mockDelete.mockResolvedValue(undefined);
});
it('serializes concurrent registrations onto one installation and removes A before B registers', async () => {
  const service = require('@/utils/remoteNotifications') as typeof import('@/utils/remoteNotifications');
  await Promise.all([service.registerRemoteNotificationDevice('A'), service.registerRemoteNotificationDevice('A')]);
  expect(mockSet.mock.calls[0][0]).toBe(mockSet.mock.calls[1][0]);
  await service.unregisterRemoteNotificationDevice('A');
  expect(mockDelete).toHaveBeenCalledWith(mockSet.mock.calls[0][0]);
  expect(await service.registerRemoteNotificationDevice('A')).toMatchObject({ registered: false });
  service.finishRemoteNotificationLogout('A'); mockAuth.currentUser = { uid: 'B' };
  await service.registerRemoteNotificationDevice('B');
  expect(mockSet.mock.calls[2][0]).toEqual(expect.stringMatching(/^users\/B\/pushDevices\//));
});
it('waits for registration in flight and refuses its late write when logout begins', async () => {
  let complete!: (result: { data: string }) => void;
  mockToken.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const service = require('@/utils/remoteNotifications') as typeof import('@/utils/remoteNotifications');
  const registering = service.registerRemoteNotificationDevice('A');
  await Promise.resolve(); await Promise.resolve();
  const logout = service.unregisterRemoteNotificationDevice('A');
  complete({ data: 'ExponentPushToken[late]' });
  expect(await registering).toMatchObject({ registered: false }); await logout;
  expect(mockSet).not.toHaveBeenCalled();
});
it('does not attach an A token to B after the account changes', async () => {
  mockToken.mockImplementationOnce(async () => { mockAuth.currentUser = { uid: 'B' }; return { data: 'ExponentPushToken[A]' }; });
  const service = require('@/utils/remoteNotifications') as typeof import('@/utils/remoteNotifications');
  expect(await service.registerRemoteNotificationDevice('A')).toMatchObject({ registered: false });
  expect(mockSet).not.toHaveBeenCalled();
});
it('exposes revocation failure and allows a retry without pretending logout succeeded', async () => {
  const service = require('@/utils/remoteNotifications') as typeof import('@/utils/remoteNotifications');
  await service.registerRemoteNotificationDevice('A'); mockDelete.mockRejectedValueOnce(new Error('offline'));
  await expect(service.unregisterRemoteNotificationDevice('A')).rejects.toThrow('offline');
  expect(await service.registerRemoteNotificationDevice('A')).toMatchObject({ registered: true });
  await expect(service.unregisterRemoteNotificationDevice('A')).resolves.toBeUndefined();
});
