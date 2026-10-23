import { useQuery } from '@tanstack/react-query';
import { getHomeSnapshotFirebase, type HomeSnapshot } from '@/functions/HomeFirebase';
import { FINANCE_STALE_TIME_MS, financeCachePolicy, financeQueryKey, recordFinanceRead } from '@/utils/financeQueryCache';
import { getHomeSnapshotFreshness } from '@/utils/homeSnapshotFreshness';

export function useHomeQuery(personId: string | null | undefined) {
	return useQuery<HomeSnapshot>({
		queryKey: personId ? financeQueryKey.home(personId) : ['finance', 'anonymous', 'home'],
		enabled: Boolean(personId),
		staleTime: query => query.state.data?.financialSource === 'spark' ? 0 : FINANCE_STALE_TIME_MS,
		refetchOnMount: query => query.state.data?.financialSource === 'spark' ? 'always' : false,
		refetchOnWindowFocus: query => query.state.data?.financialSource === 'spark' ? 'always' : false,
		refetchOnReconnect: query => query.state.data?.financialSource === 'spark',
		refetchInterval: query => query.state.error ? false : getHomeSnapshotFreshness(query.state.data).refreshAfterMs,
		meta: { persistence: financeCachePolicy.financial.persistence },
		queryFn: async () => {
			const start = Date.now();
			const result = await getHomeSnapshotFirebase(personId!);
			recordFinanceRead({ key: financeQueryKey.home(personId!), origin: 'firestore', trigger: 'mount', durationMs: Date.now() - start, at: Date.now() });
			if (!result.success) throw new Error('Não foi possível carregar os dados da Home.');
			return result.data;
		},
	});
}
