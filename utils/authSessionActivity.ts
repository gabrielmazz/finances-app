import { Platform } from 'react-native';

// Somente metadados de atividade; credenciais continuam sob controle do SDK Firebase.
const activityBySession = new Map<string, number>();
const activityKey = (uid: string, authenticatedAt: number) => `@lumus/auth-activity/v1/${uid}/${authenticatedAt}`;

export function readAuthSessionActivity(uid: string, authenticatedAt: number): number {
  const key = activityKey(uid, authenticatedAt);
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) return Number(stored);
    }
  } catch { /* Storage indisponível conserva o limite em memória. */ }
  return activityBySession.get(key) ?? authenticatedAt;
}

export function recordAuthSessionActivity(uid: string, authenticatedAt: number, now = Date.now()) {
  const key = activityKey(uid, authenticatedAt);
  activityBySession.set(key, now);
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.localStorage.setItem(key, String(now));
  } catch { /* Sem storage, uma recarga volta ao prazo conservador de auth_time. */ }
}

export function clearAuthSessionActivity(uid: string, authenticatedAt: number) {
  const key = activityKey(uid, authenticatedAt);
  activityBySession.delete(key);
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.localStorage.removeItem(key);
  } catch { /* O timestamp antigo nunca estende o limite absoluto. */ }
}
