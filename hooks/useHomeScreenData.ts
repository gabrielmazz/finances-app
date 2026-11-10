import { useBankAccounts } from '@/contexts/BankAccountsContext';
import type { HomeInvestmentsData, HomeMovementsData, HomeOverviewData } from '@/types/presentation/home';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
export function useHomeScreenData(_personId?: string | null) {
	const accounts = useBankAccounts();
	return {
		overview: {
			data: {
				bankBalances: accounts.active.items.map((bank) => ({
					id: bank.id,
					name: bank.name,
					balanceInCents: bank.balanceInCents,
					colorHex: bank.colorHex,
					source: bank.source,
					institutionKey: bank.institutionKey,
				})),
				cashSummary: null,
				currentMonthExpensesByBankId: {},
				currentMonthGainsByBankId: {},
				expenseHistoryLastThreeMonths: [],
				activityHeatmap: { startDate: '', endDate: '', dailyActionCounts: {}, totalActions: 0 },
				upcomingMandatoryItems: [],
			} as HomeOverviewData,
			loading: accounts.active.loading,
			error: accounts.scopeError || accounts.active.error,
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
		reload: accounts.reload,
	};
}
