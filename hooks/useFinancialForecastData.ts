import React from 'react';
import { useFocusEffect } from 'expo-router';
import { auth } from '@/FirebaseConfig';
import { useBankMovementsRequest } from '@/hooks/useBankMovementsRequest';
import { getFinancialForecastFirebase } from '@/functions/FinancialForecastFirebase';
import type { FinancialForecastData, FinancialForecastPeriod } from '@/utils/financialForecast';

type ReadState = { key: string; forecast: FinancialForecastData | null; isLoading: boolean; isRefreshing: boolean; errorMessage: string | null };

/** [[Previsão de Fluxo de Caixa]]: cada horizonte usa somente a fotografia confirmada da sessão e consulta atuais. */
export function useFinancialForecastData(personId: string | null, periodInMonths: FinancialForecastPeriod) {
	const requestKey = JSON.stringify([personId, periodInMonths]);
	const { personId: sessionId, beginRequest, cancelRequest } = useBankMovementsRequest(`financial-forecast:${requestKey}`);
	const sessionMatches = !!personId && personId === sessionId && auth.currentUser?.uid === personId;
	const empty: ReadState = { key: requestKey, forecast: null, isLoading: sessionMatches, isRefreshing: false, errorMessage: null };
	const [state, setState] = React.useState<ReadState>(empty);
	const loadForecast = React.useCallback(async (asRefresh = false) => {
		const isCurrent = beginRequest();
		setState({ key: requestKey, forecast: null, isLoading: !asRefresh, isRefreshing: asRefresh, errorMessage: null });
		if (!personId || personId !== sessionId || auth.currentUser?.uid !== personId) {
			setState({ key: requestKey, forecast: null, isLoading: false, isRefreshing: false,
				errorMessage: !personId ? 'Nenhum usuário autenticado foi identificado.' : 'A sessão mudou. Entre novamente para carregar a previsão.' });
			return;
		}
		try {
			const result = await getFinancialForecastFirebase(personId, periodInMonths);
			if (!isCurrent()) return;
			if (!result.success) throw new Error(result.error);
			setState({ key: requestKey, forecast: result.data, isLoading: false, isRefreshing: false, errorMessage: null });
		} catch (error) {
			if (isCurrent()) setState({ key: requestKey, forecast: null, isLoading: false, isRefreshing: false,
				errorMessage: error instanceof Error ? error.message : 'Não foi possível carregar a previsão financeira. Tente novamente.' });
		}
	}, [personId, sessionId, periodInMonths, requestKey, beginRequest]);
	useFocusEffect(React.useCallback(() => { void loadForecast(); return cancelRequest; }, [loadForecast, cancelRequest]));
	const current = state.key === requestKey && sessionMatches ? state : { ...empty, errorMessage: state.key === requestKey ? state.errorMessage : null };
	return { ...current, loadForecast };
}
