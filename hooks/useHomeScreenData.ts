import { useBankAccounts } from '@/contexts/BankAccountsContext';
import { useRecentMovements } from './useRecentMovements';
import type { HomeInvestmentsData, HomeMovementsData, HomeOverviewData } from '@/types/presentation/home';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
export function useHomeScreenData(_personId?: string | null) {
	const accounts = useBankAccounts();
	const recent = useRecentMovements(accounts.scope, accounts.active.items, accounts.active.loaded && !accounts.active.loading);
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
			warning: accounts.active.loaded && accounts.active.contextUnverified
				? 'Encontramos contas antigas, mas não foi possível confirmar a qual contexto elas pertencem. Nenhum dado foi alterado.'
				: accounts.active.loaded && accounts.active.issues > 0
				? 'Alguns registros de contas não puderam ser verificados. Os dados existentes não foram alterados.'
				: accounts.active.loaded && accounts.sharedReadStatus === 'authorized'
					? 'Há acesso compartilhado autorizado que ainda não é consultado nesta versão.'
				: accounts.active.loaded && accounts.sharedReadStatus === 'group-listed'
					? 'Sua autorização contém vínculos de grupo, mas esta versão está consultando o contexto pessoal.'
				: accounts.active.loaded && accounts.sharedReadStatus === 'unverified'
					? 'Não foi possível verificar o acesso compartilhado. As contas pessoais continuam disponíveis para consulta.'
				: accounts.active.loaded && accounts.active.unavailable
					? accounts.active.items.length
						? 'A fonte de contas novas está indisponível nesta versão.'
						: accounts.scope?.kind === 'group'
							? 'Nenhuma conta antiga ativa foi encontrada no grupo atual nesta página. A fonte de contas novas está indisponível nesta versão.'
							: 'Nenhuma conta pessoal antiga ativa foi encontrada nesta página. A fonte de contas novas está indisponível nesta versão.'
					: null,
			historyError: 'Histórico indisponível no momento.',
		},
		movements: {
			data: { timelineMovements: recent.items, bankColorsById: {} } as HomeMovementsData,
			loading: recent.loading,
			error: recent.error,
			cashIncomplete: recent.cashIncomplete,
			incomplete: recent.incomplete || (accounts.active.loaded && !accounts.active.complete),
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
		reload: async () => { await accounts.reload(); recent.refresh(); },
	};
}
