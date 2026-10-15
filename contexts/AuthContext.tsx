import React from 'react';
import { AppState, Platform } from 'react-native';
import { onAuthStateChanged, onIdTokenChanged, type User } from 'firebase/auth';

import { auth } from '@/FirebaseConfig';
import { isTerminalFirebaseSessionError } from '@/utils/authSession';
import { isAuthSessionExpired } from '@/utils/authSessionPolicy';
import { clearAuthSessionActivity, readAuthSessionActivity, recordAuthSessionActivity } from '@/utils/authSessionActivity';

type AuthContextValue = {
  user: User | null;
  isAuthReady: boolean;
  isAuthenticated: boolean;
  sessionExpired: boolean;
  registerActivity: () => boolean;
};

type AuthProviderProps = React.PropsWithChildren<{
  onSessionExpired?: (user: User) => Promise<void>;
}>;

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, onSessionExpired }) => {
  const [user, setUser] = React.useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = React.useState(false);
  const [sessionExpired, setSessionExpired] = React.useState(false);
  const activityHandler = React.useRef<() => boolean>(() => true);

  React.useEffect(() => {
    let isMounted = true;
    let authResolutionVersion = 0;
    let session: { candidate: User; authenticatedAt: number; validatedAt: number } | null = null;
    let expiredCandidate: User | null = null;
    let isValidating = false;
    let isExpiring = false;

    const expireSession = async (candidate: User) => {
      if (!isMounted || auth.currentUser !== candidate || expiredCandidate === candidate) return;
      expiredCandidate = candidate;
      isExpiring = true;
      if (session) clearAuthSessionActivity(candidate.uid, session.authenticatedAt);
      session = null;
      setUser(null);
      setIsAuthReady(false);
      setSessionExpired(true);
      let cleanupTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          onSessionExpired?.(candidate),
          new Promise<void>(resolve => { cleanupTimeout = setTimeout(resolve, 3000); }),
        ]);
      } catch {
        console.warn('A limpeza local da sessão expirada não pôde ser concluída.');
      } finally {
        if (cleanupTimeout) clearTimeout(cleanupTimeout);
      }
      try {
        if (auth.currentUser === candidate) await auth.signOut();
      } catch {
        console.warn('Não foi possível encerrar a sessão expirada; acesso permanece bloqueado.');
      } finally {
        isExpiring = false;
        if (isMounted && (!auth.currentUser || auth.currentUser === candidate)) setIsAuthReady(true);
      }
    };

    const resolveAuthenticatedUser = async (candidate: User | null, resolutionVersion: number) => {
      const isCurrent = () => isMounted && resolutionVersion === authResolutionVersion && auth.currentUser === candidate;
      if (!candidate) {
        session = null;
        if (isCurrent()) { setUser(null); setIsAuthReady(true); }
        return;
      }
      if (candidate === expiredCandidate) return;
      try {
        const token = await candidate.getIdTokenResult();
        if (!isCurrent()) return;
        const authenticatedAt = Number(token.claims.auth_time) * 1000;
        if (isAuthSessionExpired(authenticatedAt, readAuthSessionActivity(candidate.uid, authenticatedAt))) {
          await expireSession(candidate);
          return;
        }
        session = { candidate, authenticatedAt, validatedAt: Date.now() };
        await candidate.reload();
        await candidate.getIdToken(true);
      } catch (error) {
        if (!isCurrent()) return;
        if (isTerminalFirebaseSessionError(error) || !session) {
          await expireSession(candidate);
          return;
        }
        console.warn('Não foi possível revalidar a sessão; seu prazo original permanece.');
      }
      if (!isCurrent() || !session) return;
      // [[Segurança de Login]]: aguardar rede nunca pode estender o prazo local.
      if (isAuthSessionExpired(session.authenticatedAt, readAuthSessionActivity(candidate.uid, session.authenticatedAt))) {
        await expireSession(candidate);
        return;
      }
      setUser(candidate);
      setSessionExpired(false);
      setIsAuthReady(true);
    };

    const checkSession = (activity = false) => {
      if (!session) return true;
      if (auth.currentUser !== session.candidate) return false;
      const { candidate, authenticatedAt } = session;
      const now = Date.now();
      if (isAuthSessionExpired(authenticatedAt, readAuthSessionActivity(candidate.uid, authenticatedAt), now)) {
        void expireSession(candidate);
        return false;
      }
      if (activity) recordAuthSessionActivity(candidate.uid, authenticatedAt, now);
      return true;
    };
    activityHandler.current = () => checkSession(true);

    const validateSession = async () => {
      checkSession();
      if (!session || isValidating || auth.currentUser !== session.candidate) return;
      const currentSession = session;
      isValidating = true;
      try {
        await currentSession.candidate.reload();
        await currentSession.candidate.getIdToken(true);
      } catch (error) {
        if (session === currentSession && isTerminalFirebaseSessionError(error)) await expireSession(currentSession.candidate);
      } finally {
        if (session === currentSession) currentSession.validatedAt = Date.now();
        isValidating = false;
      }
    };

    // reload() pode emitir eventos de token; não revalidar dentro de onIdTokenChanged.
    const unsubscribe = onAuthStateChanged(auth, candidate => {
      const version = ++authResolutionVersion;
      if (session && !candidate) clearAuthSessionActivity(session.candidate.uid, session.authenticatedAt);
      session = null;
      setUser(null);
      setIsAuthReady(false);
      void resolveAuthenticatedUser(candidate, version);
    }, () => {
      authResolutionVersion += 1;
      session = null;
      setUser(null);
      setIsAuthReady(true);
    });
    // Após falha de signOut, um login no mesmo UID pode emitir só evento de token.
    // A recuperação aceita apenas uma nova instância de User, nunca o refresh da antiga.
    const unsubscribeRecovery = onIdTokenChanged(auth, candidate => {
      if (!expiredCandidate || !candidate || candidate === expiredCandidate || isExpiring) return;
      expiredCandidate = null;
      void resolveAuthenticatedUser(candidate, ++authResolutionVersion);
    });
    const timer = setInterval(() => {
      checkSession();
      if (session && Date.now() - session.validatedAt >= 5 * 60_000 && AppState.currentState !== 'background') void validateSession();
      if (!isExpiring && expiredCandidate && auth.currentUser === expiredCandidate) void auth.signOut().catch(() => undefined);
    }, 15_000);
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') void validateSession();
    });
    const onActivity = (event: Event) => {
      if (checkSession(true)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void validateSession();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('pointerdown', onActivity, true);
      document.addEventListener('keydown', onActivity, true);
      document.addEventListener('scroll', onActivity, true);
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);
    }
    return () => {
      isMounted = false;
      authResolutionVersion += 1;
      session = null;
      activityHandler.current = () => true;
      clearInterval(timer);
      unsubscribe();
      unsubscribeRecovery();
      appStateSubscription.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('pointerdown', onActivity, true);
        document.removeEventListener('keydown', onActivity, true);
        document.removeEventListener('scroll', onActivity, true);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
      }
    };
  }, [onSessionExpired]);

  const registerActivity = React.useCallback(() => activityHandler.current(), []);
  const contextValue = React.useMemo<AuthContextValue>(
    () => ({ user, isAuthReady, isAuthenticated: Boolean(user), sessionExpired, registerActivity }),
    [isAuthReady, user, sessionExpired, registerActivity]
  );
  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser utilizado dentro de um AuthProvider.');
  return context;
};
