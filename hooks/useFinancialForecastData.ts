import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
import type { FinancialForecastData, FinancialForecastPeriod } from '@/utils/financialForecast';
export function useFinancialForecastData(_personId: string | null, _period: FinancialForecastPeriod) {
	return {
		forecast: null as FinancialForecastData | null,
		isLoading: false,
		isRefreshing: false,
		errorMessage: FEATURE_UNAVAILABLE_MESSAGE,
		loadForecast: async (_asRefresh = false) => showFeatureUnavailable(),
	};
}
