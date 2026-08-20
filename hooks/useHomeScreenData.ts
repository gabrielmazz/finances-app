import React from 'react';

import {
	EMPTY_HOME_MOVEMENTS_DATA,
	EMPTY_HOME_OVERVIEW_DATA,
	type HomeInvestmentsData,
	type HomeMovementsData,
	type HomeOverviewData,
	createEmptyInvestmentPortfolio,
} from '@/functions/HomeFirebase';
import { useHomeQuery } from '@/hooks/useFinanceQueries';

type HomeSectionState<T> = {
	data: T;
	loading: boolean;
	error: string | null;
};

export type HomeOverviewState = HomeSectionState<HomeOverviewData>;
export type HomeMovementsState = HomeSectionState<HomeMovementsData>;
export type HomeInvestmentsState = HomeSectionState<HomeInvestmentsData>;

const EMPTY_INVESTMENTS_DATA: HomeInvestmentsData = {
	portfolio: createEmptyInvestmentPortfolio(),
};

export function useHomeScreenData(personId: string | null | undefined) {
	const query = useHomeQuery(personId);
	const snapshot = query.data;
	const loading = query.isLoading || query.isFetching;
	const message = !personId ? 'Nenhum usuário autenticado foi identificado.' : query.error ? 'Não foi possível carregar os dados da Home.' : null;
	const reload = React.useCallback(async () => { await query.refetch({ cancelRefetch: false }); }, [query]);
	const overviewResult = snapshot?.overview;
	const movementsResult = snapshot?.movements;
	const investmentsResult = snapshot?.investments;
	const overview = {
		data: overviewResult?.success ? overviewResult.data : EMPTY_HOME_OVERVIEW_DATA,
		loading,
		error: overviewResult ? (overviewResult.success ? null : overviewResult.error) : message,
	};
	const movements = {
		data: movementsResult?.success ? movementsResult.data : EMPTY_HOME_MOVEMENTS_DATA,
		loading,
		error: movementsResult ? (movementsResult.success ? null : movementsResult.error) : message,
	};
	const investments = {
		data: investmentsResult?.success ? investmentsResult.data : EMPTY_INVESTMENTS_DATA,
		loading,
		error: investmentsResult ? (investmentsResult.success ? null : investmentsResult.error) : message,
	};

	return {
		overview,
		movements,
		investments,
		reload,
	};
}
