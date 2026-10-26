import type { HomeBankBalanceCard, HomeTimelineMovement } from '@/functions/HomeFirebase';

/** [[Dashboard Home]] reutiliza os detalhes e as ações do extrato sem outra consulta. */
export type RecentMovementsProps = {
	items: HomeTimelineMovement[];
	banks: HomeBankBalanceCard[];
	loading: boolean;
	error: string | null;
	reload: () => Promise<void>;
};
