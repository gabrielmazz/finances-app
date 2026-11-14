import type { HomeBankBalanceCard,HomeTimelineMovement } from '@/types/presentation/home';

/** [[Dashboard Home]] reutiliza os detalhes e as ações do extrato sem outra consulta. */
export type RecentMovementsProps = {
	items: HomeTimelineMovement[];
	banks: HomeBankBalanceCard[];
	loading: boolean;
	error: string | null;
	cashIncomplete?: boolean;
	incomplete?: boolean;
	reload: () => Promise<void>;
};
