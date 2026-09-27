import React from 'react';
import { useFocusEffect } from 'expo-router';
import { getCategoryAnalysisFirebase, type CategoryAnalysisData } from '@/functions/CategoryAnalysisFirebase';
import { getCategoryAnalysisRangeError, getDefaultCategoryAnalysisRange } from '@/utils/categoryAnalysis';

export function useCategoryAnalysisData(personId: string | null) {
	const [range, setRange] = React.useState(() => getDefaultCategoryAnalysisRange());
	const [analysis, setAnalysis] = React.useState<CategoryAnalysisData | null>(null);
	const [isLoading, setIsLoading] = React.useState(false);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
	const requestId = React.useRef(0);
	const rangeError = getCategoryAnalysisRangeError(range);
	const loadAnalysis = React.useCallback(async (asRefresh = false) => {
		const id = ++requestId.current;
		setErrorMessage(null);
		setAnalysis(null);
		if (!personId || rangeError) {
			setIsLoading(false);
			setIsRefreshing(false);
			if (!personId) setErrorMessage('Nenhum usuário autenticado foi identificado.');
			return;
		}
		setIsLoading(!asRefresh);
		setIsRefreshing(asRefresh);
		const result = await getCategoryAnalysisFirebase(personId, range);
		// Respostas de um período/UID anterior não podem substituir a consulta atual.
		if (id !== requestId.current) return;
		if (result.success) setAnalysis(result.data);
		else setErrorMessage('Não foi possível carregar a análise por categoria. Tente novamente.');
		setIsLoading(false);
		setIsRefreshing(false);
	}, [personId, range, rangeError]);

	useFocusEffect(React.useCallback(() => {
		void loadAnalysis();
		return () => { requestId.current += 1; };
	}, [loadAnalysis]));

	const setStartDate = React.useCallback((date: Date) => setRange(current => ({ ...current, startDate: date })), []);
	const setEndDate = React.useCallback((date: Date) => setRange(current => ({ ...current, endDate: date })), []);
	return { analysis, isLoading, isRefreshing, errorMessage, loadAnalysis, range, rangeError, setStartDate, setEndDate };
}
