import React from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';

import { auth } from '@/FirebaseConfig';

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
        console.warn('Erro ao atualizar sessão autenticada:', error);
      }

      if (!isMounted || resolutionVersion !== authResolutionVersion) {
        return;
      }

      const currentUser = auth.currentUser;

      setUser(currentUser?.uid === candidate.uid ? currentUser : null);
      setIsAuthReady(true);
    };

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
