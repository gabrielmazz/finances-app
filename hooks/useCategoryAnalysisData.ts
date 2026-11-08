import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import type { CategoryAnalysisData } from '@/types/presentation/category-analysis';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
import { getCategoryAnalysisRangeError, getDefaultCategoryAnalysisRange } from '@/utils/categoryAnalysis';
import React from 'react';
export function useCategoryAnalysisData(_personId: string | null) {
	const [range, setRange] = React.useState(getDefaultCategoryAnalysisRange);
	return {
		analysis: null as CategoryAnalysisData | null,
		isLoading: false,
		isRefreshing: false,
		errorMessage: FEATURE_UNAVAILABLE_MESSAGE,
		isReady: false,
		loadAnalysis: async (_asRefresh = false) => showFeatureUnavailable(),
		range,
		rangeError: getCategoryAnalysisRangeError(range),
		requestKey: '',
		setStartDate: (date: Date) => setRange((current) => ({ ...current, startDate: date })),
		setEndDate: (date: Date) => setRange((current) => ({ ...current, endDate: date })),
	};
}
