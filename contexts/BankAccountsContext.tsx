import React from 'react';
import { getFirebaseClient } from '../firebase/client';
import { readBank, readBankPage, readBoundLegacyBankPage } from '../firebase/banks';
import { LOCAL_PROJECT_ID } from '../firebase/config';
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
	nextBound: string | null;
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
	nextBound: null,
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
					const [fresh, legacy, bound] = await Promise.all([
						!more || before.nextNew
							? readBankPage(client, scope, 'new', status, more ? before.nextNew : null)
							: Promise.resolve({ banks: [], nextCursor: null, issues: 0, unavailable: false, contextUnverified: false }),
						!more || before.nextLegacy
							? readBankPage(client, scope, legacySource, status, more ? before.nextLegacy : null)
							: Promise.resolve({ banks: [], nextCursor: null, issues: 0, unavailable: false, contextUnverified: false }),
						!more || before.nextBound
							? readBoundLegacyBankPage(client, scope, status, more ? before.nextBound : null)
							: Promise.resolve({ banks: [], nextCursor: null, issues: 0, unavailable: false }),
					]);
					// Reference accounts keep their legacy IDs. Resolve them individually
					// from the already-authorized legacy/binding pages.
					const candidates = [...new Map([...legacy.banks, ...bound.banks].map(bank => [bank.id, bank])).values()];
					const references = client.db.app.options.projectId === LOCAL_PROJECT_ID && status === 'active'
						? await Promise.all(candidates.map(async bank => {
							try { return await readBank(client, scope, { source: 'new', id: bank.id }); }
							catch (error) {
								const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error ? error.message : '';
								if (['permission-denied', 'banks/not-found', 'banks/incompatible'].includes(code)) return null;
								throw error;
							}
						})) : [];
					if (generation.current !== version || identityRef.current !== owner) return;
					const items = [...(more ? before.items : []), ...fresh.banks, ...references.filter((bank): bank is BankAccount => bank !== null), ...legacy.banks, ...bound.banks];
					const linked = new Set(items.filter(item => item.source === 'new' && item.legacyBankId === item.id).map(item => item.id));
					setState((value) => ({
						...value,
						[status]: {
							items: [...new Map(items.filter(item => item.source !== 'legacy' || !linked.has(item.id)).map((item) => [item.source + ':' + item.id, item])).values()],
							loading: false,
							error: null,
							loaded: true,
							issues: (more ? before.issues : 0) + fresh.issues + legacy.issues + bound.issues,
							unavailable: (more && before.unavailable) || fresh.unavailable || legacy.unavailable || bound.unavailable,
							contextUnverified: (more && before.contextUnverified) || fresh.contextUnverified || legacy.contextUnverified,
							nextNew: fresh.nextCursor,
							nextLegacy: legacy.nextCursor,
							nextBound: bound.nextCursor,
							complete: !fresh.nextCursor && !legacy.nextCursor && !bound.nextCursor,
						},
					}));
				} catch (error) {
					if (generation.current === version && identityRef.current === owner)
						setState((value) => ({
							...value,
							[status]: { ...empty(), loading: false, error: errorMessage(error) },
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
