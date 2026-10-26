import React from 'react';
import { useFocusEffect } from 'expo-router';
import { auth } from '@/FirebaseConfig';
import { useBankMovementsRequest } from '@/hooks/useBankMovementsRequest';
import { getCategoryAnalysisFirebase, type CategoryAnalysisData } from '@/functions/CategoryAnalysisFirebase';
import { getCategoryAnalysisRangeError, getDefaultCategoryAnalysisRange } from '@/utils/categoryAnalysis';

type ReadState = { key: string; analysis: CategoryAnalysisData | null; isLoading: boolean; isRefreshing: boolean; errorMessage: string | null };

export function useCategoryAnalysisData(personId: string | null) {
	const [range, setRange] = React.useState(() => getDefaultCategoryAnalysisRange());
	const rangeError = getCategoryAnalysisRangeError(range);
	const requestKey = JSON.stringify([personId, range.startDate.getTime(), range.endDate.getTime()]);
	const { personId: sessionId, beginRequest, cancelRequest } = useBankMovementsRequest(`category-analysis:${requestKey}`);
	const empty: ReadState = { key: requestKey, analysis: null, isLoading: !!personId && !rangeError, isRefreshing: false, errorMessage: null };
	const [state, setState] = React.useState<ReadState>(empty);
	const loadAnalysis = React.useCallback(async (asRefresh = false) => {
		const isCurrent = beginRequest();
		setState({ key: requestKey, analysis: null, isLoading: !asRefresh, isRefreshing: asRefresh, errorMessage: null });
		if (!personId || personId !== sessionId || auth.currentUser?.uid !== personId || rangeError) {
			setState({ key: requestKey, analysis: null, isLoading: false, isRefreshing: false,
				errorMessage: !personId ? 'Nenhum usuário autenticado foi identificado.' : rangeError ? null : 'A sessão mudou. Entre novamente para carregar a análise.' });
			return;
		}
		try {
			const result = await getCategoryAnalysisFirebase(personId, range);
			if (!isCurrent()) return;
			if (!result.success) throw new Error('Não foi possível carregar a análise por categoria. Tente novamente.');
			setState({ key: requestKey, analysis: result.data, isLoading: false, isRefreshing: false, errorMessage: null });
		} catch (error) {
			if (isCurrent()) setState({ key: requestKey, analysis: null, isLoading: false, isRefreshing: false,
				errorMessage: error instanceof Error ? error.message : 'Não foi possível carregar a análise por categoria. Tente novamente.' });
		}
	}, [personId, sessionId, requestKey, range, rangeError, beginRequest]);

	useFocusEffect(React.useCallback(() => {
		void loadAnalysis();
		return cancelRequest;
	}, [loadAnalysis, cancelRequest]));

	const setStartDate = React.useCallback((date: Date) => setRange(current => ({ ...current, startDate: new Date(date) })), []);
	const setEndDate = React.useCallback((date: Date) => setRange(current => ({ ...current, endDate: new Date(date) })), []);
	// [[Análise por Categoria]]: nunca exponha o snapshot de outro UID/período, nem durante a troca de efeitos.
	const current = state.key === requestKey && !rangeError && personId === sessionId && auth.currentUser?.uid === personId ? state
		: { ...empty, isLoading: !!personId && !rangeError && personId === sessionId && auth.currentUser?.uid === personId, errorMessage: state.key === requestKey ? state.errorMessage : null };
	return { ...current, isReady: !!current.analysis && !current.isLoading && !current.isRefreshing && !current.errorMessage,
		loadAnalysis, range, rangeError, requestKey, setStartDate, setEndDate };
}
