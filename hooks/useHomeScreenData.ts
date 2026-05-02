import React from 'react';
import { useFocusEffect } from 'expo-router';

import {
	EMPTY_HOME_MOVEMENTS_DATA,
	EMPTY_HOME_OVERVIEW_DATA,
	type HomeInvestmentsData,
	type HomeMovementsData,
	type HomeOverviewData,
	getHomeSnapshotFirebase,
	createEmptyInvestmentPortfolio,
} from '@/functions/HomeFirebase';

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
	const [overview, setOverview] = React.useState<HomeOverviewState>({
		data: EMPTY_HOME_OVERVIEW_DATA,
		loading: false,
		error: null,
	});
	const [movements, setMovements] = React.useState<HomeMovementsState>({
		data: EMPTY_HOME_MOVEMENTS_DATA,
		loading: false,
		error: null,
	});
	const [investments, setInvestments] = React.useState<HomeInvestmentsState>({
		data: EMPTY_INVESTMENTS_DATA,
		loading: false,
		error: null,
	});

	const resetAllSections = React.useCallback((message: string) => {
		setOverview({
			data: EMPTY_HOME_OVERVIEW_DATA,
			loading: false,
			error: message,
		});
		setMovements({
			data: EMPTY_HOME_MOVEMENTS_DATA,
			loading: false,
			error: message,
		});
		setInvestments({
			data: EMPTY_INVESTMENTS_DATA,
			loading: false,
			error: message,
		});
	}, []);

	const reload = React.useCallback(async (shouldApplyResult: () => boolean = () => true) => {
		if (!personId) {
			resetAllSections('Nenhum usuário autenticado foi identificado.');
			return;
		}

		setOverview(previous => ({ ...previous, loading: true, error: null }));
		setMovements(previous => ({ ...previous, loading: true, error: null }));
		setInvestments(previous => ({ ...previous, loading: true, error: null }));

		const snapshotResult = await getHomeSnapshotFirebase(personId);

		if (!shouldApplyResult()) {
			return;
		}

		if (!snapshotResult.success) {
			resetAllSections('Não foi possível carregar os dados da Home.');
			return;
		}

		setOverview(previous => ({
			data:
				snapshotResult.data.overview.success
					? snapshotResult.data.overview.data
					: previous.data,
			loading: false,
			error: snapshotResult.data.overview.success ? null : snapshotResult.data.overview.error,
		}));
		setMovements(previous => ({
			data:
				snapshotResult.data.movements.success
					? snapshotResult.data.movements.data
					: previous.data,
			loading: false,
			error: snapshotResult.data.movements.success ? null : snapshotResult.data.movements.error,
		}));
		setInvestments(previous => ({
			data:
				snapshotResult.data.investments.success
					? snapshotResult.data.investments.data
					: previous.data,
			loading: false,
			error:
				snapshotResult.data.investments.success ? null : snapshotResult.data.investments.error,
		}));
	}, [personId, resetAllSections]);

	useFocusEffect(
		React.useCallback(() => {
			let isActive = true;

			void reload(() => isActive);

			return () => {
				isActive = false;
			};
		}, [reload]),
	);

	return {
		overview,
		movements,
		investments,
		reload,
	};
}
