import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { AUTH_SESSION_IDLE_TIMEOUT_MS, AUTH_SESSION_MAX_AGE_MS } from '@/utils/authSessionPolicy';

let mockAuthListener: (user: any) => void;
let mockTokenListener: (user: any) => void;
const mockAuth = { currentUser: null as any, signOut: jest.fn() };
jest.mock('@/FirebaseConfig', () => ({ get auth() { return mockAuth; } }));
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, listener: (user: any) => void) => { mockAuthListener = listener; return jest.fn(); },
  onIdTokenChanged: (_auth: unknown, listener: (user: any) => void) => { mockTokenListener = listener; return jest.fn(); },
}));
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { recordAuthSessionActivity } from '@/utils/authSessionActivity';

const now = Date.parse('2026-10-15T15:00:00Z');
let sequence = 0;
const createUser = (authenticatedAt = now) => ({
  uid: `user-${++sequence}`,
  getIdTokenResult: jest.fn(async () => ({ claims: { auth_time: authenticatedAt / 1000 } })),
  getIdToken: jest.fn(async () => 'token'),
  reload: jest.fn(async (): Promise<void> => undefined),
});
const emit = async (candidate: any) => {
  await act(async () => { mockAuth.currentUser = candidate; mockAuthListener(candidate); });
};
const mockCleanup = jest.fn(async (_user: any): Promise<void> => undefined);
const wrapper = ({ children }: React.PropsWithChildren) => React.createElement(AuthProvider, { onSessionExpired: mockCleanup }, children);

beforeEach(() => {
  jest.clearAllMocks(); jest.useFakeTimers(); jest.setSystemTime(now);
  mockAuth.currentUser = null;
  mockCleanup.mockResolvedValue(undefined);
  mockAuth.signOut.mockImplementation(async () => { mockAuth.currentUser = null; mockAuthListener(null); });
});
afterEach(() => {
  jest.useRealTimers();
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  (globalThis as any).__resetNotificationMockState();
});

it('validates Firebase before exposing a user and expires after 15 minutes idle', async () => {
  const { result, unmount } = await renderHook(useAuth, { wrapper });
  const candidate = createUser(); await emit(candidate);
  expect(candidate.reload).toHaveBeenCalled(); expect(candidate.getIdToken).toHaveBeenCalledWith(true);
  expect(result.current.isAuthenticated).toBe(true);
  await act(async () => { jest.advanceTimersByTime(AUTH_SESSION_IDLE_TIMEOUT_MS); });
  expect(result.current.isAuthenticated).toBe(false); expect(result.current.sessionExpired).toBe(true);
  expect(mockCleanup).toHaveBeenCalledWith(candidate); expect(mockAuth.signOut).toHaveBeenCalled();
  await unmount();
});
it('activity extends idle time but cannot extend the 8 hour deadline', async () => {
  const { result, unmount } = await renderHook(useAuth, { wrapper });
  const started = now - AUTH_SESSION_MAX_AGE_MS + 60_000;
  const candidate = createUser(started);
  recordAuthSessionActivity(candidate.uid, started, now);
  await emit(candidate);
  await act(async () => { jest.advanceTimersByTime(30_000); result.current.registerActivity(); });
  expect(result.current.isAuthenticated).toBe(true);
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(result.current.isAuthenticated).toBe(false);
  await unmount();
});
it('checks expiration before accepting the first interaction after timers were suspended', async () => {
  const { result, unmount } = await renderHook(useAuth, { wrapper });
  await emit(createUser());
  await act(async () => {
    jest.setSystemTime(now + AUTH_SESSION_IDLE_TIMEOUT_MS);
    expect(result.current.registerActivity()).toBe(false);
  });
  expect(result.current.isAuthenticated).toBe(false);
  await unmount();
});
it('checks expiration when returning from background without renewing idle time', async () => {
  const { result, unmount } = await renderHook(useAuth, { wrapper });
  await emit(createUser());
  const resume = (AppState.addEventListener as jest.Mock).mock.calls.at(-1)[1];
  await act(async () => { jest.setSystemTime(now + AUTH_SESSION_IDLE_TIMEOUT_MS); resume('active'); });
  expect(result.current.isAuthenticated).toBe(false);
  await unmount();
});
it('does not restore the idle deadline on remount or when auth_time is already expired', async () => {
  const candidate = createUser();
  const first = await renderHook(useAuth, { wrapper }); await emit(candidate); await first.unmount();
  jest.setSystemTime(now + AUTH_SESSION_IDLE_TIMEOUT_MS);
  const second = await renderHook(useAuth, { wrapper }); await emit(candidate);
  expect(second.result.current.isAuthenticated).toBe(false);
  await second.unmount();
});
it('never authenticates an old login even when activity was just recorded', async () => {
  const started = now - AUTH_SESSION_MAX_AGE_MS;
  const candidate = createUser(started); recordAuthSessionActivity(candidate.uid, started, now);
  const { result, unmount } = await renderHook(useAuth, { wrapper }); await emit(candidate);
  expect(result.current.isAuthenticated).toBe(false); expect(mockAuth.signOut).toHaveBeenCalled();
  await unmount();
});
it('ignores an old reload that finishes after logout', async () => {
  const candidate = createUser(); let finish!: () => void;
  candidate.reload.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const { result, unmount } = await renderHook(useAuth, { wrapper }); await emit(candidate); await emit(null);
  await act(async () => { finish(); });
  expect(result.current.isAuthenticated).toBe(false);
  await unmount();
});
it('keeps the deadline on a transient network failure but rejects a disabled user on resume', async () => {
  const candidate = createUser(); candidate.reload.mockRejectedValueOnce({ code: 'auth/network-request-failed' });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { result, unmount } = await renderHook(useAuth, { wrapper }); await emit(candidate);
  expect(result.current.isAuthenticated).toBe(true);
  candidate.reload.mockRejectedValueOnce({ code: 'auth/user-disabled' });
  const resume = (AppState.addEventListener as jest.Mock).mock.calls.at(-1)[1];
  await act(async () => { resume('active'); });
  expect(result.current.isAuthenticated).toBe(false);
  await unmount(); warn.mockRestore();
});
it('blocks access before cleanup finishes and stays blocked if cleanup and signOut fail', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const candidate = createUser(); let rejectCleanup!: (error: Error) => void;
  mockCleanup.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectCleanup = reject; }));
  mockAuth.signOut.mockRejectedValueOnce(new Error('storage unavailable'));
  const { result, unmount } = await renderHook(useAuth, { wrapper }); await emit(candidate);
  await act(async () => { jest.advanceTimersByTime(AUTH_SESSION_IDLE_TIMEOUT_MS); });
  expect(result.current.isAuthenticated).toBe(false);
  await act(async () => { rejectCleanup(new Error('cleanup failed')); });
  expect(result.current.isAuthenticated).toBe(false); expect(result.current.isAuthReady).toBe(true);
  expect(result.current.registerActivity()).toBe(true);
  await act(async () => { jest.advanceTimersByTime(15_000); });
  expect(mockAuth.signOut).toHaveBeenCalledTimes(2);
  await unmount(); warn.mockRestore();
});
it('recovers a fresh login for the same UID if signOut had failed, without accepting token refresh as login', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockAuth.signOut.mockRejectedValueOnce(new Error('storage unavailable'));
  const candidate = createUser();
  const { result, unmount } = await renderHook(useAuth, { wrapper }); await emit(candidate);
  await act(async () => { jest.advanceTimersByTime(AUTH_SESSION_IDLE_TIMEOUT_MS); });
  await act(async () => { mockTokenListener(candidate); });
  expect(result.current.isAuthenticated).toBe(false);
  const next = { ...createUser(Date.now()), uid: candidate.uid };
  await act(async () => { mockAuth.currentUser = next; mockTokenListener(next); });
  expect(result.current.user).toBe(next);
  await unmount(); warn.mockRestore();
});
it('does not sign out a new account while expiration cleanup for an earlier account is pending', async () => {
  let finish!: () => void; mockCleanup.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const { result, unmount } = await renderHook(useAuth, { wrapper }); await emit(createUser());
  await act(async () => { jest.advanceTimersByTime(AUTH_SESSION_IDLE_TIMEOUT_MS); });
  const next = createUser(Date.now()); await emit(next);
  await act(async () => { finish(); });
  expect(result.current.user).toBe(next); expect(mockAuth.signOut).not.toHaveBeenCalled();
  await unmount();
});
it('still signs out and returns to login when local cleanup never settles', async () => {
  mockCleanup.mockReturnValueOnce(new Promise(() => undefined));
  const { result, unmount } = await renderHook(useAuth, { wrapper }); await emit(createUser());
  await act(async () => { jest.advanceTimersByTime(AUTH_SESSION_IDLE_TIMEOUT_MS); });
  expect(result.current.isAuthenticated).toBe(false);
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(mockAuth.signOut).toHaveBeenCalled(); expect(result.current.isAuthReady).toBe(true);
  await unmount();
});
it('fails closed when the restored login timestamp cannot be read offline', async () => {
  const candidate = createUser(); candidate.getIdTokenResult.mockRejectedValueOnce({ code: 'auth/network-request-failed' });
  const { result, unmount } = await renderHook(useAuth, { wrapper }); await emit(candidate);
  expect(result.current.isAuthenticated).toBe(false); expect(mockAuth.signOut).toHaveBeenCalled();
  await unmount();
});
it('blocks the expired browser key event before a form can handle it and removes listeners on unmount', async () => {
  (globalThis as any).__mockNotificationState.platformOS = 'web';
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  Object.assign(globalThis, { document, window: new EventTarget() });
  const { result, unmount } = await renderHook(useAuth, { wrapper }); await emit(createUser());
  const inputHandler = jest.fn();
  document.addEventListener('keydown', inputHandler);
  const event = new Event('keydown', { cancelable: true });
  await act(async () => { jest.setSystemTime(now + AUTH_SESSION_IDLE_TIMEOUT_MS); document.dispatchEvent(event); });
  expect(event.defaultPrevented).toBe(true); expect(inputHandler).not.toHaveBeenCalled();
  expect(result.current.isAuthenticated).toBe(false);
  await unmount();
  document.dispatchEvent(new Event('keydown'));
  expect(inputHandler).toHaveBeenCalledTimes(1);
});

const setupBrowserSession = () => {
  (globalThis as any).__mockNotificationState.platformOS = 'web';
  const storage = new Map<string, string>();
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const window = Object.assign(new EventTarget(), { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  } });
  Object.assign(globalThis, { document, window });
  return { document, window };
};

it('restores an active browser session after reload even when the login is older than 15 minutes', async () => {
  setupBrowserSession();
  const authenticatedAt = now - 60 * 60_000;
  const candidate = createUser(authenticatedAt);
  recordAuthSessionActivity(candidate.uid, authenticatedAt, now - 60_000);
  const first = await renderHook(useAuth, { wrapper }); await emit(candidate);
  await act(async () => { first.result.current.registerActivity(); });
  await first.unmount();

  jest.setSystemTime(now + 2 * 60_000);
  const restored = { ...createUser(authenticatedAt), uid: candidate.uid };
  const second = await renderHook(useAuth, { wrapper }); await emit(restored);
  expect(second.result.current.isAuthReady).toBe(true);
  expect(second.result.current.isAuthenticated).toBe(true);
  expect(second.result.current.user?.uid).toBe(candidate.uid);
  expect(mockCleanup).not.toHaveBeenCalled(); expect(mockAuth.signOut).not.toHaveBeenCalled();
  await second.unmount();
});

it('preserves login when switching browser tabs or windows and returning before the idle limit', async () => {
  const { document, window } = setupBrowserSession();
  const candidate = createUser();
  const { result, unmount } = await renderHook(useAuth, { wrapper }); await emit(candidate);
  await act(async () => {
    document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
    jest.setSystemTime(now + 2 * 60_000);
    document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  expect(result.current.isAuthenticated).toBe(true);
  expect(result.current.user).toBe(candidate);
  expect(mockCleanup).not.toHaveBeenCalled(); expect(mockAuth.signOut).not.toHaveBeenCalled();
  await unmount();
});

it('keeps the original absolute deadline when restoring another browser page with recent activity', async () => {
  setupBrowserSession();
  const authenticatedAt = now - AUTH_SESSION_MAX_AGE_MS + 60_000;
  const candidate = createUser(authenticatedAt);
  recordAuthSessionActivity(candidate.uid, authenticatedAt, now);
  const first = await renderHook(useAuth, { wrapper }); await emit(candidate); await first.unmount();
  jest.setSystemTime(now + 30_000);
  const restored = { ...createUser(authenticatedAt), uid: candidate.uid };
  const second = await renderHook(useAuth, { wrapper }); await emit(restored);
  expect(second.result.current.isAuthenticated).toBe(true);
  await act(async () => { second.result.current.registerActivity(); jest.advanceTimersByTime(30_000); });
  expect(second.result.current.isAuthenticated).toBe(false);
  expect(mockAuth.signOut).toHaveBeenCalled();
  await second.unmount();
});
