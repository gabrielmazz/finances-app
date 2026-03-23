import AsyncStorage from '@react-native-async-storage/async-storage';

const LOGIN_ATTEMPTS_STORAGE_KEY = '@finances/login-attempts-v1';
const VERIFICATION_COOLDOWN_STORAGE_KEY = '@finances/login-verification-v1';
const VERIFICATION_COOLDOWN_MS = 60_000;
const LOGIN_BACKOFF_STEPS_MS = [30_000, 60_000, 120_000, 300_000, 900_000] as const;
const LOGIN_ENTRY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const MAX_EMAIL_LENGTH = 254;
export const MAX_PASSWORD_LENGTH = 128;

type StoredAttemptEntry = {
  failureCount: number;
  blockedUntil: number;
  lastFailureAt: number;
};

type StoredAttemptMap = Record<string, StoredAttemptEntry>;
type StoredVerificationMap = Record<string, number>;

export type LoginErrorCategory =
  | 'credentials'
  | 'rate_limit'
  | 'network'
  | 'verification'
  | 'unknown';

export type LoginThrottleStatus = {
  failureCount: number;
  blockedUntil: number | null;
  remainingMs: number;
  isBlocked: boolean;
};

type LoginErrorDescriptor = {
  category: LoginErrorCategory;
  message: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const readJsonRecord = async <T extends Record<string, unknown>>(storageKey: string): Promise<T> => {
  try {
    const rawValue = await AsyncStorage.getItem(storageKey);
    if (!rawValue) {
      return {} as T;
    }

    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === 'object') {
      return parsed as T;
    }
  } catch (error) {
    console.warn(`Erro ao ler ${storageKey}:`, error);
  }

  return {} as T;
};

const writeJsonRecord = async <T extends Record<string, unknown>>(
  storageKey: string,
  value: T
) => {
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(value));
  } catch (error) {
    console.warn(`Erro ao salvar ${storageKey}:`, error);
  }
};

const pruneAttempts = (entries: StoredAttemptMap, now: number) =>
  Object.fromEntries(
    Object.entries(entries).filter(([, entry]) => now - entry.lastFailureAt <= LOGIN_ENTRY_TTL_MS)
  ) as StoredAttemptMap;

const buildThrottleStatus = (
  entry?: StoredAttemptEntry | null,
  now = Date.now()
): LoginThrottleStatus => {
  if (!entry) {
    return {
      failureCount: 0,
      blockedUntil: null,
      remainingMs: 0,
      isBlocked: false,
    };
  }

  const remainingMs = Math.max(0, entry.blockedUntil - now);

  return {
    failureCount: entry.failureCount,
    blockedUntil: entry.blockedUntil > 0 ? entry.blockedUntil : null,
    remainingMs,
    isBlocked: remainingMs > 0,
  };
};

export const normalizeEmailForAuth = (value: string) =>
  value.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH);

export const clampEmailInput = (value: string) => value.slice(0, MAX_EMAIL_LENGTH);

export const clampPasswordInput = (value: string) => value.slice(0, MAX_PASSWORD_LENGTH);

export const isEmailFormatValid = (value: string) => EMAIL_REGEX.test(value);

export const formatRemainingTime = (remainingMs: number) => {
  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  if (seconds === 0) {
    return `${minutes}min`;
  }

  return `${minutes}min ${seconds}s`;
};

export const getLoginThrottleStatus = async (normalizedEmail: string) => {
  if (!normalizedEmail) {
    return buildThrottleStatus();
  }

  const entries = pruneAttempts(await readJsonRecord<StoredAttemptMap>(LOGIN_ATTEMPTS_STORAGE_KEY), Date.now());
  const currentEntry = entries[normalizedEmail];

  return buildThrottleStatus(currentEntry);
};

export const registerFailedLoginAttempt = async (normalizedEmail: string) => {
  if (!normalizedEmail) {
    return buildThrottleStatus();
  }

  const now = Date.now();
  const entries = pruneAttempts(await readJsonRecord<StoredAttemptMap>(LOGIN_ATTEMPTS_STORAGE_KEY), now);
  const currentEntry = entries[normalizedEmail];
  const failureCount = (currentEntry?.failureCount ?? 0) + 1;
  const backoffIndex = Math.min(
    Math.max(0, failureCount - 5),
    LOGIN_BACKOFF_STEPS_MS.length - 1
  );
  const blockedUntil =
    failureCount >= 5 ? now + LOGIN_BACKOFF_STEPS_MS[backoffIndex] : 0;

  entries[normalizedEmail] = {
    failureCount,
    blockedUntil,
    lastFailureAt: now,
  };

  await writeJsonRecord(LOGIN_ATTEMPTS_STORAGE_KEY, entries);

  return buildThrottleStatus(entries[normalizedEmail], now);
};

export const clearFailedLoginAttempts = async (normalizedEmail: string) => {
  if (!normalizedEmail) {
    return;
  }

  const entries = await readJsonRecord<StoredAttemptMap>(LOGIN_ATTEMPTS_STORAGE_KEY);

  if (entries[normalizedEmail]) {
    delete entries[normalizedEmail];
    await writeJsonRecord(LOGIN_ATTEMPTS_STORAGE_KEY, entries);
  }
};

export const getVerificationCooldownRemainingMs = async (normalizedEmail: string) => {
  if (!normalizedEmail) {
    return 0;
  }

  const entries = await readJsonRecord<StoredVerificationMap>(VERIFICATION_COOLDOWN_STORAGE_KEY);
  const lastSentAt = entries[normalizedEmail] ?? 0;
  const remainingMs = Math.max(0, lastSentAt + VERIFICATION_COOLDOWN_MS - Date.now());

  return remainingMs;
};

export const markVerificationEmailSent = async (normalizedEmail: string) => {
  if (!normalizedEmail) {
    return;
  }

  const entries = await readJsonRecord<StoredVerificationMap>(VERIFICATION_COOLDOWN_STORAGE_KEY);
  entries[normalizedEmail] = Date.now();
  await writeJsonRecord(VERIFICATION_COOLDOWN_STORAGE_KEY, entries);
};

export const mapLoginError = (error: unknown): LoginErrorDescriptor => {
  const code =
    typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/invalid-email':
      return {
        category: 'credentials',
        message: 'Email ou senha inválidos.',
      };

    case 'auth/too-many-requests':
      return {
        category: 'rate_limit',
        message: 'Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.',
      };

    case 'auth/network-request-failed':
      return {
        category: 'network',
        message: 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.',
      };

    default:
      if (code.includes('network') || code.includes('timeout')) {
        return {
          category: 'network',
          message: 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.',
        };
      }

      return {
        category: 'unknown',
        message: 'Não foi possível concluir o login agora. Tente novamente em instantes.',
      };
  }
};
