const mockStorage = new Map<string, string>();
const mockSet = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: (...args: unknown[]) => mockSet(...args),
  removeItem: async (key: string) => { mockStorage.delete(key); },
  multiRemove: async (keys: string[]) => { for (const key of keys) mockStorage.delete(key); },
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('superjson', () => ({ __esModule: true, default: { stringify: JSON.stringify, parse: JSON.parse } }));
import { persistTrustedDeviceCachePreference, clearFinancePersistedDataForLogout,
  resumeFinancePersistedDataAfterFailedLogout } from '@/contexts/FinanceDataContext';
beforeEach(() => {
  mockStorage.clear(); mockSet.mockReset(); resumeFinancePersistedDataAfterFailedLogout('A');
});
it('waits for pending trust preference writes and prevents them from restoring consent after logout', async () => {
  let finish!: () => void;
  mockSet.mockImplementationOnce((key: string, value: string) => new Promise<void>(resolve => {
    finish = () => { mockStorage.set(key, value); resolve(); };
  }));
  const preference = persistTrustedDeviceCachePreference('A', true);
  let cleared = false;
  const cleanup = clearFinancePersistedDataForLogout('A').then(() => { cleared = true; });
  await Promise.resolve(); expect(cleared).toBe(false);
  finish(); await expect(preference).resolves.toBeNull(); await cleanup;
  expect(mockStorage.size).toBe(0);
  await expect(persistTrustedDeviceCachePreference('A', true)).resolves.toBeNull();
  expect(mockSet).toHaveBeenCalledTimes(1);
});
