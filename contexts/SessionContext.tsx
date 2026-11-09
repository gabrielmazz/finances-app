import React from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { getFirebaseClient } from '../firebase/client';
import { loadProfile } from '../firebase/profiles';
import { loadFinancialContext, type FinancialContext } from '../firebase/financialContext';
import { trackAuthObserver } from '../firebase/diagnostics';
import { errorMessage } from '../application/errors';
import type { UserSummary } from '../types/presentation/session';
import type { UserProfile } from '../types/presentation/user-profile';

type SessionState = {
	user: UserSummary | null;
	profile: UserProfile | null;
	context: FinancialContext | null;
	initializing: boolean;
	profileLoading: boolean;
	error: string | null;
	contextError: string | null;
};
const initial: SessionState = {
	user: null,
	profile: null,
	context: null,
	initializing: true,
	profileLoading: false,
	error: null,
	contextError: null,
};
const SessionContext = React.createContext<(SessionState & { reload(): Promise<void> }) | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
	const [state, setState] = React.useState<SessionState>(initial);
	const generation = React.useRef(0);
	const reload = React.useCallback(async () => {
		const current = ++generation.current;
		try {
			const client = getFirebaseClient();
			const user = client.auth.currentUser;
			setState((previous) => ({
				...initial,
				profile: user && previous.user?.uid === user.uid ? previous.profile : null,
				initializing: false,
				profileLoading: !!user,
				user: user
					? { uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL }
					: null,
			}));
			if (!user) return;
			const account = await loadProfile(client, user.uid);
			if (generation.current !== current) return;
			setState((value) => ({ ...value, profile: account?.profile ?? null, profileLoading: false }));
			try {
				const context = await loadFinancialContext(client, user.uid, account?.groupId);
				if (generation.current === current) setState((value) => ({ ...value, context }));
			} catch (error) {
				if (generation.current === current)
					setState((value) => ({ ...value, contextError: errorMessage(error) }));
			}
		} catch (error) {
			if (generation.current === current)
				setState((value) => ({
					...value,
					initializing: false,
					profileLoading: false,
					error: errorMessage(error),
				}));
		}
	}, []);
	React.useEffect(() => {
		try {
			const client = getFirebaseClient();
			const stopTracking = trackAuthObserver();
			const unsubscribe = onIdTokenChanged(
				client.auth,
				() => {
					void reload();
				},
				(error) => {
					generation.current++;
					setState({ ...initial, initializing: false, error: errorMessage(error) });
				},
			);
			return () => {
				generation.current++;
				unsubscribe();
				stopTracking();
			};
		} catch (error) {
			setState({ ...initial, initializing: false, error: errorMessage(error) });
		}
	}, [reload]);
	return <SessionContext.Provider value={{ ...state, reload }}>{children}</SessionContext.Provider>;
}

export function useSessionState() {
	const state = React.useContext(SessionContext);
	if (!state) throw new Error('SessionProvider ausente');
	return state;
}
