// [[Segurança de Login]]: renovação de ID token não renova auth_time.
export const AUTH_SESSION_MAX_AGE_MS = 8 * 60 * 60_000;
export const AUTH_SESSION_IDLE_TIMEOUT_MS = 15 * 60_000;

export const isAuthSessionExpired = (authenticatedAt: number, lastActivityAt: number, now = Date.now()) =>
  !Number.isFinite(authenticatedAt) || authenticatedAt <= 0 || authenticatedAt > now ||
  !Number.isFinite(lastActivityAt) || lastActivityAt > now ||
  now - authenticatedAt >= AUTH_SESSION_MAX_AGE_MS ||
  now - lastActivityAt >= AUTH_SESSION_IDLE_TIMEOUT_MS;
