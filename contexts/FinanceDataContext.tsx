import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider, dehydrate, hydrate, focusManager } from '@tanstack/react-query';
import React from 'react';
import { AppState, Platform } from 'react-native';
import SuperJSON from 'superjson';

import { useAuth } from '@/contexts/AuthContext';
import { FINANCE_STALE_TIME_MS, type TrustedDeviceCachePreference } from '@/utils/financeQueryCache';
import { resumeLocalAnnotationsAfterFailedLogout } from '@/utils/localAnnotations';

const preferenceKey = (uid: string) => `@lumus/trusted-finance-cache/v1/${uid}`;
const metadataKey = (uid: string) => `@lumus/finance-query-metadata/v1/${uid}`;
const financialKey = (uid: string) => `@lumus/finance-query-financial/v1/${uid}`;
const cacheGenerations = new Map<string, number>();
const pendingPersists = new Map<string, Set<Promise<void>>>();
const retiredCacheAccounts = new Set<string>();

export async function clearFinancePersistedDataForLogout(uid: string) {
	retiredCacheAccounts.add(uid);
	cacheGenerations.set(uid, (cacheGenerations.get(uid) ?? 0) + 1);
	await Promise.all(pendingPersists.get(uid) ?? []);
	await AsyncStorage.multiRemove([metadataKey(uid), financialKey(uid), preferenceKey(uid)]);
}

export function resumeFinancePersistedDataAfterFailedLogout(uid: string) {
	retiredCacheAccounts.delete(uid);
}

const isFinancial = (query: { meta?: Record<string, unknown> }) => query.meta?.persistence === 'financial';

async function restore(client: QueryClient, uid: string, allowFinancial: boolean) {
	const raw = await AsyncStorage.multiGet([metadataKey(uid), financialKey(uid)]);
	for (const [key, value] of raw) {
		if (!value || (key === financialKey(uid) && !allowFinancial)) continue;
		try { hydrate(client, SuperJSON.parse(value)); } catch { await AsyncStorage.removeItem(key); }
	}
}

async function persist(client: QueryClient, uid: string, allowFinancial: boolean) {
	if (retiredCacheAccounts.has(uid)) return;
	const generation = cacheGenerations.get(uid) ?? 0;
	const dehydrated = dehydrate(client, { shouldDehydrateQuery: query => query.state.status === 'success' && query.meta?.persistence !== 'none' });
	const metadata = { ...dehydrated, queries: dehydrated.queries.filter(query => !isFinancial(query)) };
	const financial = { ...dehydrated, queries: dehydrated.queries.filter(isFinancial) };
	await AsyncStorage.setItem(metadataKey(uid), SuperJSON.stringify(metadata));
	if (retiredCacheAccounts.has(uid) || generation !== (cacheGenerations.get(uid) ?? 0)) return;
	if (allowFinancial) await AsyncStorage.setItem(financialKey(uid), SuperJSON.stringify(financial));
	else await AsyncStorage.removeItem(financialKey(uid));
}

function trackCacheMutation<T>(uid: string, pending: Promise<T>): Promise<T> {
	const settled = pending.then(() => undefined, () => undefined);
	const writes = pendingPersists.get(uid) ?? new Set<Promise<void>>();
	writes.add(settled);
	pendingPersists.set(uid, writes);
	void settled.then(() => {
		writes.delete(settled);
		if (writes.size === 0) pendingPersists.delete(uid);
	});
	return pending;
}

function trackPersist(client: QueryClient, uid: string, allowFinancial: boolean) {
	void trackCacheMutation(uid, persist(client, uid, allowFinancial)).catch(() => undefined);
}

export function persistTrustedDeviceCachePreference(uid: string, enabled: boolean) {
	if (retiredCacheAccounts.has(uid)) return Promise.resolve(null);
	const generation = cacheGenerations.get(uid) ?? 0;
	return trackCacheMutation(uid, (async () => {
		const next = { uid, enabled, updatedAt: Date.now() };
		await AsyncStorage.setItem(preferenceKey(uid), JSON.stringify(next));
		if (retiredCacheAccounts.has(uid) || generation !== (cacheGenerations.get(uid) ?? 0)) return null;
		if (!enabled) await AsyncStorage.removeItem(financialKey(uid));
		return next;
	})());
}

type FinanceDataContextValue = {
	trustedDeviceCache: TrustedDeviceCachePreference | null;
	isCacheHydrated: boolean;
	setTrustedDeviceCache: (enabled: boolean) => Promise<void>;
	clearFinancialPersistedCache: () => Promise<void>;
};
const FinanceDataContext = React.createContext<FinanceDataContextValue | undefined>(undefined);

export function FinanceDataProvider({ children }: React.PropsWithChildren) {
	const { user } = useAuth();
	const uid = user?.uid ?? null;
	const [client, setClient] = React.useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: FINANCE_STALE_TIME_MS, refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: 1 } } }));
	const [preference, setPreference] = React.useState<TrustedDeviceCachePreference | null>(null);
	const [isCacheHydrated, setIsCacheHydrated] = React.useState(false);
	React.useEffect(() => {
		if (Platform.OS === 'web') return;
		// [[Dashboard Home]]: React Query nativo precisa receber o retorno ao primeiro plano.
		if (AppState.currentState) focusManager.setFocused(AppState.currentState === 'active');
		const subscription = AppState.addEventListener('change', state => focusManager.setFocused(state === 'active'));
		return () => { subscription.remove(); focusManager.setFocused(undefined); };
	}, []);

	React.useEffect(() => {
		const nextClient = new QueryClient({ defaultOptions: { queries: { staleTime: FINANCE_STALE_TIME_MS, refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: 1 } } });
		setClient(nextClient); setPreference(null); setIsCacheHydrated(!uid);
		if (!uid) return;
		retiredCacheAccounts.delete(uid);
		resumeLocalAnnotationsAfterFailedLogout(uid);
		let active = true;
		void (async () => {
			const stored = await AsyncStorage.getItem(preferenceKey(uid));
			const parsed = stored ? (JSON.parse(stored) as TrustedDeviceCachePreference) : { uid, enabled: false, updatedAt: Date.now() };
			await restore(nextClient, uid, parsed.enabled);
			if (active) { setPreference(parsed); setIsCacheHydrated(true); }
		})();
		return () => {
			active = false;
			// Logout/troca de conta nunca deixa valores financeiros persistidos para a próxima sessão.
			void AsyncStorage.removeItem(financialKey(uid));
		};
	}, [uid]);

	React.useEffect(() => {
		if (!uid || !isCacheHydrated) return;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const unsubscribe = client.getQueryCache().subscribe(() => {
			if (timeout) clearTimeout(timeout);
			timeout = setTimeout(() => trackPersist(client, uid, preference?.enabled === true), 250);
		});
		return () => { unsubscribe(); if (timeout) clearTimeout(timeout); };
	}, [client, isCacheHydrated, preference?.enabled, uid]);

	const setTrustedDeviceCache = React.useCallback(async (enabled: boolean) => {
		if (!uid) return;
		const next = await persistTrustedDeviceCachePreference(uid, enabled);
		if (next) setPreference(next);
	}, [uid]);
	const clearFinancialPersistedCache = React.useCallback(async () => { if (uid) await AsyncStorage.removeItem(financialKey(uid)); }, [uid]);

	return <QueryClientProvider client={client}><FinanceDataContext.Provider value={{ trustedDeviceCache: preference, isCacheHydrated, setTrustedDeviceCache, clearFinancialPersistedCache }}>{children}</FinanceDataContext.Provider></QueryClientProvider>;
}

export function useFinanceData() {
	const value = React.useContext(FinanceDataContext);
	if (!value) throw new Error('useFinanceData deve ser utilizado dentro de FinanceDataProvider.');
	return value;
}
