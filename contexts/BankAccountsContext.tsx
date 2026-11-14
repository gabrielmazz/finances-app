import React from 'react';
import { getFirebaseClient } from '../firebase/client';
import { readBankPage } from '../firebase/banks';
import type { BankAccount, BankScope } from '../domain/banks';
import { sumCents } from '../domain/money';
import { errorMessage } from '../application/errors';
import { useSession } from '../hooks/useSession';

type PageState = {
	items: BankAccount[];
	loading: boolean;
	error: string | null;
	loaded: boolean;
	issues: number;
	unavailable: boolean;
	contextUnverified: boolean;
	nextNew: string | null;
	nextLegacy: string | null;
	complete: boolean;
};
const empty = (): PageState => ({
	items: [],
	loading: false,
	error: null,
	loaded: false,
	issues: 0,
	unavailable: false,
	contextUnverified: false,
	nextNew: null,
	nextLegacy: null,
	complete: false,
});
type Store = {
	scope: BankScope | null;
	scopeError: string | null;
	active: PageState;
	archived: PageState;
	load(status: 'active' | 'archived', more?: boolean): Promise<void>;
	reload(): Promise<void>;
	total: number | null;
	sharedReadStatus: 'authorized' | 'group-listed' | 'unverified' | null;
};
const Context = React.createContext<Store | null>(null);
export function BankAccountsProvider({ children }: React.PropsWithChildren) {
	const session = useSession();
	const scope = React.useMemo<BankScope | null>(
		() =>
			session.user && session.context && !session.contextError
				? {
						kind: session.context.kind,
						id: session.context.kind === 'group' ? session.context.groupId : session.user.uid,
						uid: session.user.uid,
					}
				: null,
		[
			session.user?.uid,
			session.context?.kind,
			session.context?.kind === 'group' ? session.context.groupId : null,
			session.contextError,
		],
	);
	const [state, setState] = React.useState({ active: empty(), archived: empty() });
	const [stateIdentity, setStateIdentity] = React.useState<string | null>(null);
	const current = React.useRef(state);
	current.current = state;
	const generation = React.useRef(0),
		running = React.useRef(new Map<string, Promise<void>>());
	const identity = scope ? `${scope.uid}:${scope.kind}:${scope.id}` : null;
	const identityRef = React.useRef(identity);
	identityRef.current = identity;
	const load = React.useCallback(
		async (status: 'active' | 'archived', more = false) => {
			if (!scope) return;
			const requestKey = identity + ':' + status;
			if (running.current.has(requestKey)) return running.current.get(requestKey)!;
			const version = generation.current,
				owner = identity;
			const promise = (async () => {
				const before = current.current[status];
				if (more && before.complete) return;
				setState((value) => ({ ...value, [status]: { ...value[status], loading: true, error: null } }));
				try {
					const client = getFirebaseClient(),
						legacySource = scope.kind === 'personal' ? 'legacy' : 'group-legacy';
					const [fresh, legacy] = await Promise.all([
						!more || before.nextNew
							? readBankPage(client, scope, 'new', status, more ? before.nextNew : null)
							: Promise.resolve({ banks: [], nextCursor: null, issues: 0, unavailable: false, contextUnverified: false }),
						!more || before.nextLegacy
							? readBankPage(client, scope, legacySource, status, more ? before.nextLegacy : null)
							: Promise.resolve({ banks: [], nextCursor: null, issues: 0, unavailable: false, contextUnverified: false }),
					]);
					if (generation.current !== version || identityRef.current !== owner) return;
					const items = [...(more ? before.items : []), ...fresh.banks, ...legacy.banks];
					setState((value) => ({
						...value,
						[status]: {
							items: [...new Map(items.map((item) => [item.source + ':' + item.id, item])).values()],
							loading: false,
							error: null,
							loaded: true,
							issues: (more ? before.issues : 0) + fresh.issues + legacy.issues,
							unavailable: (more && before.unavailable) || fresh.unavailable || legacy.unavailable,
							contextUnverified: (more && before.contextUnverified) || fresh.contextUnverified || legacy.contextUnverified,
							nextNew: fresh.nextCursor,
							nextLegacy: legacy.nextCursor,
							complete: !fresh.nextCursor && !legacy.nextCursor,
						},
					}));
				} catch (error) {
					if (generation.current === version && identityRef.current === owner)
						setState((value) => ({
							...value,
							[status]: { ...value[status], loading: false, error: errorMessage(error) },
						}));
				}
			})();
			running.current.set(requestKey, promise);
			try {
				await promise;
			} finally {
				if (running.current.get(requestKey) === promise) running.current.delete(requestKey);
			}
		},
		[identity],
	);
	React.useEffect(() => {
		generation.current++;
		running.current.clear();
		const initial = { active: empty(), archived: empty() };
		current.current = initial;
		setState(initial);
		setStateIdentity(identity);
		if (scope) void load('active');
	}, [identity]);
	const reload = React.useCallback(async () => {
		// A pre-commit page in flight cannot satisfy a post-commit refresh.
		const pending = running.current.get(identity + ':active');
		if (pending) await pending;
		await load('active');
		if (current.current.archived.loaded) {
			const archived = running.current.get(identity + ':archived');
			if (archived) await archived;
			await load('archived');
		}
	}, [load, identity]);
	const visible = stateIdentity === identity ? state : { active: empty(), archived: empty() };
	let total: number | null = null;
	if (
		visible.active.loaded &&
		!visible.active.loading &&
		!visible.active.error &&
		visible.active.complete &&
		!visible.active.issues &&
		!visible.active.unavailable &&
		visible.active.items.every((item) => item.balanceInCents !== null)
	) {
		try {
			total = sumCents(visible.active.items.map((item) => item.balanceInCents!));
		} catch {
			total = null;
		}
	}
	return (
		<Context.Provider
			value={{
				scope,
				scopeError:
					session.contextError ||
					session.error ||
					(!session.user
						? 'Entre para acessar suas contas.'
						: !scope
							? 'Aguardando o contexto financeiro.'
							: null),
				...visible,
				load,
				reload,
				total,
				sharedReadStatus: session.context?.kind === 'personal' ? session.context.sharedReadStatus ?? null : null,
			}}
		>
			{children}
		</Context.Provider>
	);
}
export function useBankAccounts() {
	const value = React.useContext(Context);
	if (!value) throw Error('BankAccountsProvider missing');
	return value;
}
