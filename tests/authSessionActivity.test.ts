import { clearAuthSessionActivity, readAuthSessionActivity, recordAuthSessionActivity } from '@/utils/authSessionActivity';

afterEach(() => { delete (globalThis as any).window; (globalThis as any).__resetNotificationMockState(); });
it('shares activity metadata between tabs and retains it when the module reloads', () => {
  (globalThis as any).__mockNotificationState.platformOS = 'web';
  const storage = new Map<string, string>();
  Object.assign(globalThis, { window: { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } } });
  recordAuthSessionActivity('web-owner', 1000, 1500);
  jest.isolateModules(() => {
    const otherTab = require('@/utils/authSessionActivity') as typeof import('@/utils/authSessionActivity');
    expect(otherTab.readAuthSessionActivity('web-owner', 1000)).toBe(1500);
    otherTab.recordAuthSessionActivity('web-owner', 1000, 2000);
  });
  expect(readAuthSessionActivity('web-owner', 1000)).toBe(2000);
  expect(readAuthSessionActivity('another-user', 1000)).toBe(1000);
  expect(readAuthSessionActivity('web-owner', 3000)).toBe(3000);
  clearAuthSessionActivity('web-owner', 1000);
  expect(readAuthSessionActivity('web-owner', 1000)).toBe(1000);
});
it('falls back to memory when browser storage is denied', () => {
  (globalThis as any).__mockNotificationState.platformOS = 'web';
  Object.assign(globalThis, { window: { get localStorage() { throw new Error('denied'); } } });
  recordAuthSessionActivity('storage-denied', 1000, 2000);
  expect(readAuthSessionActivity('storage-denied', 1000)).toBe(2000);
});
