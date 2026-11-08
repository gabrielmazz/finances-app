import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import type { HomeInvestmentsData, HomeMovementsData, HomeOverviewData } from '@/types/presentation/home';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
export function useHomeScreenData(_personId?: string | null) {
	return {
		overview: {
			data: {
				bankBalances: [],
				cashSummary: null,
				currentMonthExpensesByBankId: {},
				currentMonthGainsByBankId: {},
				expenseHistoryLastThreeMonths: [],
				activityHeatmap: { startDate: '', endDate: '', dailyActionCounts: {}, totalActions: 0 },
				upcomingMandatoryItems: [],
			} as HomeOverviewData,
			loading: false,
			error: FEATURE_UNAVAILABLE_MESSAGE,
		},
		movements: {
			data: { timelineMovements: [], bankColorsById: {} } as HomeMovementsData,
			loading: false,
			error: FEATURE_UNAVAILABLE_MESSAGE,
		},
		investments: {
			data: {
				portfolio: {
					items: [],
					totalCurrentBaseInCents: 0,
					totalInitialInCents: 0,
					totalSimulatedInCents: 0,
					totalEstimatedGainInCents: 0,
					investmentCount: 0,
				},
			} as HomeInvestmentsData,
			loading: false,
			error: FEATURE_UNAVAILABLE_MESSAGE,
		},
		reload: async () => showFeatureUnavailable(),
	};
}
