import React from 'react';
import { useIsFocused } from 'expo-router';
import { Platform } from 'react-native';
import { errorMessage } from '@/application/errors';
import { useBankAccounts } from '@/contexts/BankAccountsContext';
import type { BankScope } from '@/domain/banks';
import { civilDate, mandatoryAmount, type MandatoryTemplate } from '@/domain/mandatory';
import { sumCents } from '@/domain/money';
import { CASH_HISTORY_ID, isIncomeOrExpenseTotal } from '@/domain/movements';
import { getFirebaseClient } from '@/firebase/client';
import { LOCAL_PROJECT_ID, selectedFinancialProject, usesCanonicalFinance } from '@/firebase/config';
import { readMandatoryPage } from '@/firebase/mandatory';
import { hasCashHistory, readMovementTimeline, type TimelineCursor } from '@/firebase/movements';
import type { HomeInvestmentsData, HomeMovementsData, HomeOverviewData } from '@/types/presentation/home';
import type { HomeMandatoryItem } from '@/types/presentation/home-mandatory-schedule';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import { toFinancialCivilDate } from '@/utils/financialCivilDate';
import { useRecentMovements } from './useRecentMovements';

async function readCurrentMonth(scope: BankScope) {
	const today = toFinancialCivilDate(new Date());
	const month = Date.UTC(today.getFullYear(), today.getMonth(), 1);
	const nextMonth = Date.UTC(today.getFullYear(), today.getMonth() + 1, 1);
	const client = getFirebaseClient();
	const gain = new Map<string | null, number>(), expense = new Map<string | null, number>();
	let cursor: TimelineCursor | null = null;
	for (let page = 0; page < 8; page++) {
		const result = await readMovementTimeline(client, scope, null, new Date(month), new Date(nextMonth), cursor, []);
		if (result.issues || result.cashIncomplete) return null;
		for (const item of result.items) {
			if ((item.type !== 'gain' && item.type !== 'expense') || !isIncomeOrExpenseTotal(item)) continue;
			const amounts = item.type === 'gain' ? gain : expense;
			const id = item.bankId ?? null;
			amounts.set(id, sumCents([amounts.get(id) ?? 0, item.valueInCents]));
		}
		cursor = result.cursor;
		if (!cursor) {
			return {
				expensesByBank: Object.fromEntries([...expense].filter(([id]) => id !== null)),
				gainsByBank: Object.fromEntries([...gain].filter(([id]) => id !== null)),
				expenses: sumCents([...expense.values()]), gains: sumCents([...gain.values()]),
				cashExpenses: expense.get(null) ?? 0, cashGains: gain.get(null) ?? 0,
			};
		}
	}
	return null;
}

function nextMandatory(template: MandatoryTemplate, today: Date): HomeMandatoryItem | null {
	if (template.installmentTotal !== null && template.installmentsCompleted >= template.installmentTotal) return null;
	const month = new Date(today.getFullYear(), today.getMonth(), 1);
	const last = template.lastCycle ? civilDate(template.lastCycle + '-01') : month;
	if (template.lastMovementDate) last.setMonth(last.getMonth() + 1);
	const start = template.installmentStartDate ? civilDate(template.installmentStartDate.slice(0, 7) + '-01') : month;
	const referenceDate = new Date(Math.max(month.getTime(), last.getTime(), start.getTime()));
	const dueDate = resolveMonthlyOccurrence({ referenceDate, dueDay: template.dueDay, usesBusinessDays: template.usesBusinessDays }).date;
	return {
		id: template.id, name: template.name, type: template.type, valueInCents: mandatoryAmount(template, 1), dueDate,
		isOverdue: dueDate < new Date(today.getFullYear(), today.getMonth(), today.getDate()),
		installmentLabel: template.installmentTotal === null ? null : `${template.installmentsCompleted + 1} de ${template.installmentTotal} parcelas`,
	};
}

async function readUpcoming(scope: BankScope) {
	const client = getFirebaseClient(), today = toFinancialCivilDate(new Date());
	const pages = await Promise.all((['expense', 'gain'] as const).map(async type => {
		const first = await readMandatoryPage(client, scope, type);
		if (!first.next) return first;
		const second = await readMandatoryPage(client, scope, type, first.next);
		return { items: [...first.items, ...second.items], next: second.next };
	}));
	return {
		items: pages.flatMap(page => page.items).map(template => nextMandatory(template, today))
			.filter((item): item is HomeMandatoryItem => item !== null).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()),
		incomplete: pages.some(page => page.next !== null),
	};
}

export function useHomeScreenData(_personId?: string | null) {
	const accounts = useBankAccounts();
	const { scope } = accounts;
	const focused = useIsFocused();
	const project = selectedFinancialProject();
	const canonical = usesCanonicalFinance(project);
	const upcomingAvailable = Platform.OS === 'web' && (canonical || project === LOCAL_PROJECT_ID);
	const recent = useRecentMovements(scope, accounts.active.items, focused && accounts.active.loaded && !accounts.active.loading);
	const [refresh, setRefresh] = React.useState(0);
	const [month, setMonth] = React.useState<{ scope: BankScope; value: Awaited<ReturnType<typeof readCurrentMonth>> }>();
	const [cashHistoryScope, setCashHistoryScope] = React.useState<BankScope | null>(null);
	const [schedule, setSchedule] = React.useState<{ scope: BankScope; value?: Awaited<ReturnType<typeof readUpcoming>>; error?: string }>();
	React.useEffect(() => {
		if (!scope) {
			setMonth(undefined);
			setCashHistoryScope(null);
			setSchedule(undefined);
			return;
		}
		if (!focused) return;
		let active = true;
		if (canonical) {
			void readCurrentMonth(scope).then(value => { if (active) setMonth({ scope, value }); })
				.catch(() => { if (active) setMonth({ scope, value: null }); });
			void hasCashHistory(getFirebaseClient(), scope).then(exists => { if (active) setCashHistoryScope(exists ? scope : null); })
				.catch(() => { if (active) setCashHistoryScope(null); });
		}
		if (upcomingAvailable) {
			void readUpcoming(scope).then(value => { if (active) setSchedule({ scope, value }); })
				.catch(error => { if (active) setSchedule({ scope, error: errorMessage(error) }); });
		}
		return () => { active = false; };
	}, [scope, focused, canonical, upcomingAvailable, refresh]);
	const monthly = month && month.scope === scope ? month.value : null;
	const mandatory = schedule?.scope === scope ? schedule : null;
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
				cashSummary: scope && cashHistoryScope === scope ? {
					id: CASH_HISTORY_ID, name: 'Transações em dinheiro', balanceInCents: null,
					currentMonthExpensesInCents: monthly?.cashExpenses ?? null, currentMonthGainsInCents: monthly?.cashGains ?? null,
				} : null,
				currentMonthExpensesByBankId: monthly?.expensesByBank ?? {},
				currentMonthGainsByBankId: monthly?.gainsByBank ?? {},
				expenseHistoryLastThreeMonths: [],
				activityHeatmap: { startDate: '', endDate: '', dailyActionCounts: {}, totalActions: 0 },
				upcomingMandatoryItems: mandatory?.value?.items ?? [],
			} as HomeOverviewData,
			loading: accounts.active.loading,
			error: accounts.scopeError || accounts.active.error,
			monthly,
			mandatoryLoading: upcomingAvailable && !!scope && !mandatory,
			mandatoryError: upcomingAvailable ? mandatory?.error ?? null : 'Compromissos indisponíveis nesta versão.',
			mandatoryIncomplete: mandatory?.value?.incomplete ?? false,
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
		reload: async () => { await accounts.reload(); recent.refresh(); setRefresh(value => value + 1); },
	};
}
