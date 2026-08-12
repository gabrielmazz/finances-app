import React from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';

import { auth } from '@/FirebaseConfig';
import { isTerminalFirebaseSessionError } from '@/utils/authSession';

type AuthContextValue = {
  user: User | null;
  isAuthReady: boolean;
  isAuthenticated: boolean;
};

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = React.useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    let authResolutionVersion = 0;

    const resolveAuthenticatedUser = async (candidate: User | null, resolutionVersion: number) => {
      if (!candidate) {
        if (isMounted && resolutionVersion === authResolutionVersion) {
          setUser(null);
          setIsAuthReady(true);
        }
        return;
      }

      try {
        await candidate.reload();
      } catch (error) {
        if (isTerminalFirebaseSessionError(error)) {
          console.warn('A sessão autenticada não é mais válida; encerrando-a localmente.', error);
          if (auth.currentUser?.uid === candidate.uid) {
            await auth.signOut().catch(signOutError => {
              console.warn('Não foi possível limpar a sessão inválida no Firebase:', signOutError);
            });
          }
          if (isMounted && resolutionVersion === authResolutionVersion) {
            setUser(null);
            setIsAuthReady(true);
          }
          return;
        }
        console.warn('Não foi possível atualizar a sessão autenticada; mantendo-a até uma resposta definitiva do Firebase.', error);
      }

      if (!isMounted || resolutionVersion !== authResolutionVersion) {
        return;
      }

      const currentUser = auth.currentUser;

      setUser(currentUser?.uid === candidate.uid ? currentUser : null);
      setIsAuthReady(true);
    };

    // `reload()` notifica observadores de token; usar onIdTokenChanged aqui criaria
    // uma nova validação em cadeia. onAuthStateChanged só reinicia para troca real de usuário.
    const unsubscribe = onAuthStateChanged(
      auth,
      nextUser => {
        const resolutionVersion = ++authResolutionVersion;
        void resolveAuthenticatedUser(nextUser, resolutionVersion);
      },
      error => {
        console.error('Erro ao observar a autenticação do Firebase:', error);
        authResolutionVersion += 1;
        if (isMounted) {
          setUser(null);
          setIsAuthReady(true);
        }
      }
    );

    return () => {
      isMounted = false;
      authResolutionVersion += 1;
      unsubscribe();
    };
  }, []);

  const contextValue = React.useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthReady,
      isAuthenticated: Boolean(user),
    }),
    [isAuthReady, user]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider.');
  }

  return context;
};
