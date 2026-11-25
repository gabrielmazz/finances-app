import React from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { getFirebaseClient } from '../firebase/client';
import { loadProfile } from '../firebase/profiles';
import { loadFinancialContext, watchFinancialGroup, type FinancialContext } from '../firebase/financialContext';
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
	contextNotice: string | null;
};
const initial: SessionState = {
	user: null,
	profile: null,
	context: null,
	initializing: true,
	profileLoading: false,
	error: null,
	contextError: null,
	contextNotice: null,
};
const accessEnded = 'O acesso ao grupo terminou. Você voltou às suas contas pessoais.';
const SessionContext = React.createContext<(SessionState & {
	reload(): Promise<void>;
	selectFinancialGroup(groupId: string | null): Promise<void>;
}) | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
	const [state, setState] = React.useState<SessionState>(initial);
	const generation = React.useRef(0);
	const requestedContext = React.useRef(0);
	const selected = React.useRef<{ uid: string; groupId: string | null } | null>(null);
	const reload = React.useCallback(async () => {
		const current = ++generation.current;
		try {
			const client = getFirebaseClient();
			const user = client.auth.currentUser;
			if (selected.current?.uid !== user?.uid) selected.current = null;
			setState((previous) => ({
				...initial,
				profile: user && previous.user?.uid === user.uid ? previous.profile : null,
				context: user && previous.user?.uid === user.uid ? previous.context : null,
				contextNotice: user && previous.user?.uid === user.uid ? previous.contextNotice : null,
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
			const preferred = selected.current;
			const group = preferred ? preferred.groupId : account?.groupId;
			try {
				const context = await loadFinancialContext(client, user.uid, group);
				if (generation.current === current && selected.current === preferred) setState((value) => ({ ...value, context }));
			} catch (error) {
				if (generation.current !== current || selected.current !== preferred) return;
				if (group == null) {
					setState((value) => ({ ...value, context: null, contextError: errorMessage(error) }));
					return;
				}
				selected.current = { uid: user.uid, groupId: null };
				setState((value) => ({ ...value, context: { kind: 'personal' }, contextNotice: errorMessage(error) }));
			}
		} catch (error) {
			if (generation.current === current)
				setState((value) => ({
					...value,
					initializing: false,
					profileLoading: false,
					context: null,
					error: errorMessage(error),
				}));
		}
	}, []);
	const selectFinancialGroup = React.useCallback(async (groupId: string | null) => {
		const client = getFirebaseClient(), uid = client.auth.currentUser?.uid;
		if (!uid) throw Error('session/changed');
		const session = generation.current, request = ++requestedContext.current;
		const context = groupId === null ? { kind: 'personal' as const } : await loadFinancialContext(client, uid, groupId);
		if (session !== generation.current || request !== requestedContext.current || uid !== client.auth.currentUser?.uid)
			throw Error('session/changed');
		selected.current = { uid, groupId };
		setState(value => value.user?.uid === uid ? { ...value, context, contextError: null, contextNotice: null } : value);
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
	const groupId = state.context?.kind === 'group' ? state.context.groupId : null;
	const uid = state.user?.uid;
	React.useEffect(() => {
		if (!uid || !groupId) return;
		let listening = true;
		const revoke = () => {
			if (!listening || (selected.current && (selected.current.uid !== uid || selected.current.groupId !== groupId))) return;
			selected.current = { uid, groupId: null };
			setState(current => current.user?.uid === uid && current.context?.kind === 'group' && current.context.groupId === groupId
				? { ...current, context: { kind: 'personal' }, contextNotice: accessEnded } : current);
		};
		const stop = watchFinancialGroup(getFirebaseClient(), uid, groupId, role => {
			if (!listening) return;
			setState(current => current.user?.uid === uid && current.context?.kind === 'group' &&
				current.context.groupId === groupId && current.context.role !== role
				? { ...current, context: { kind: 'group', groupId, role } } : current);
		}, revoke);
		return () => { listening = false; stop(); };
	}, [uid, groupId]);
	return <SessionContext.Provider value={{ ...state, reload, selectFinancialGroup }}>{children}</SessionContext.Provider>;
}

export function useSessionState() {
	const state = React.useContext(SessionContext);
	if (!state) throw new Error('SessionProvider ausente');
	return state;
}
