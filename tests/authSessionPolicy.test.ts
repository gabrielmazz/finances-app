import { AUTH_SESSION_MAX_AGE_MS, AUTH_SESSION_IDLE_TIMEOUT_MS, isAuthSessionExpired } from '@/utils/authSessionPolicy';

const now = Date.parse('2026-10-15T15:00:00Z');
it('expires at exactly 15 minutes idle', () => {
  expect(AUTH_SESSION_IDLE_TIMEOUT_MS).toBe(15 * 60_000);
  expect(isAuthSessionExpired(now - 60 * 60_000, now - 15 * 60_000, now)).toBe(true);
  expect(isAuthSessionExpired(now - 60 * 60_000, now - 15 * 60_000 + 1, now)).toBe(false);
});
it('expires at 8 hours even with recent activity or a renewed ID token', () => {
  expect(AUTH_SESSION_MAX_AGE_MS).toBe(8 * 60 * 60_000);
  expect(isAuthSessionExpired(now - AUTH_SESSION_MAX_AGE_MS, now, now)).toBe(true);
});
it.each([NaN, Infinity, 0, now + 1])('rejects invalid or future login timestamps: %p', authenticatedAt => {
  expect(isAuthSessionExpired(authenticatedAt, now, now)).toBe(true);
});
it('rejects invalid activity and clock rollback', () => {
  expect(isAuthSessionExpired(now - 1000, NaN, now)).toBe(true);
  expect(isAuthSessionExpired(now - 1000, now + 1, now)).toBe(true);
});
