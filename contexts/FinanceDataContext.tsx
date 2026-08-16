import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider, dehydrate, hydrate } from '@tanstack/react-query';
import React from 'react';
import SuperJSON from 'superjson';

import { useAuth } from '@/contexts/AuthContext';
import { FINANCE_STALE_TIME_MS, type TrustedDeviceCachePreference } from '@/utils/financeQueryCache';

const preferenceKey = (uid: string) => `@lumus/trusted-finance-cache/v1/${uid}`;
const metadataKey = (uid: string) => `@lumus/finance-query-metadata/v1/${uid}`;
const financialKey = (uid: string) => `@lumus/finance-query-financial/v1/${uid}`;

const isFinancial = (query: { meta?: Record<string, unknown> }) => query.meta?.persistence === 'financial';

async function restore(client: QueryClient, uid: string, allowFinancial: boolean) {
	const raw = await AsyncStorage.multiGet([metadataKey(uid), financialKey(uid)]);
	for (const [key, value] of raw) {
		if (!value || (key === financialKey(uid) && !allowFinancial)) continue;
		try { hydrate(client, SuperJSON.parse(value)); } catch { await AsyncStorage.removeItem(key); }
	}
}

async function persist(client: QueryClient, uid: string, allowFinancial: boolean) {
	const dehydrated = dehydrate(client, { shouldDehydrateQuery: query => query.state.status === 'success' && query.meta?.persistence !== 'none' });
	const metadata = { ...dehydrated, queries: dehydrated.queries.filter(query => !isFinancial(query)) };
	const financial = { ...dehydrated, queries: dehydrated.queries.filter(isFinancial) };
	await AsyncStorage.setItem(metadataKey(uid), SuperJSON.stringify(metadata));
	if (allowFinancial) await AsyncStorage.setItem(financialKey(uid), SuperJSON.stringify(financial));
	else await AsyncStorage.removeItem(financialKey(uid));
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
		const nextClient = new QueryClient({ defaultOptions: { queries: { staleTime: FINANCE_STALE_TIME_MS, refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: 1 } } });
		setClient(nextClient); setPreference(null); setIsCacheHydrated(!uid);
		if (!uid) return;
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
			timeout = setTimeout(() => void persist(client, uid, preference?.enabled === true), 250);
		});
		return () => { unsubscribe(); if (timeout) clearTimeout(timeout); };
	}, [client, isCacheHydrated, preference?.enabled, uid]);

	const setTrustedDeviceCache = React.useCallback(async (enabled: boolean) => {
		if (!uid) return;
		const next = { uid, enabled, updatedAt: Date.now() };
		await AsyncStorage.setItem(preferenceKey(uid), JSON.stringify(next));
		if (!enabled) await AsyncStorage.removeItem(financialKey(uid));
		setPreference(next);
	}, [uid]);
	const clearFinancialPersistedCache = React.useCallback(async () => { if (uid) await AsyncStorage.removeItem(financialKey(uid)); }, [uid]);

	return <QueryClientProvider client={client}><FinanceDataContext.Provider value={{ trustedDeviceCache: preference, isCacheHydrated, setTrustedDeviceCache, clearFinancialPersistedCache }}>{children}</FinanceDataContext.Provider></QueryClientProvider>;
}

export function useFinanceData() {
	const value = React.useContext(FinanceDataContext);
	if (!value) throw new Error('useFinanceData deve ser utilizado dentro de FinanceDataProvider.');
	return value;
}
