import type {
	AssistantReport,
	AssistantReportRequest,
	AssistantReportService,
	AssistantResolvedCatalog,
} from '@/types/lumusAssistant';
import { getHomeSnapshotFirebase, type HomeTimelineMovement } from '@/functions/HomeFirebase';
import { getCategoryAnalysisFirebase } from '@/functions/CategoryAnalysisFirebase';
import { getFinancialForecastFirebase } from '@/functions/FinancialForecastFirebase';
import { getMandatoryExpensesWithRelationsFirebase } from '@/functions/MandatoryExpenseFirebase';
import { getMandatoryGainsWithRelationsFirebase } from '@/functions/MandatoryGainFirebase';
import { findAssistantCatalogItem } from '@/services/lumusAssistant/assistantCatalogService';
import { createAssistantId, formatCycleKey, formatCents } from '@/utils/lumusAssistant';

const getMonthLabel = (date: Date) =>
	new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);

const createBaseReport = (
	request: AssistantReportRequest,
	title: string,
	periodLabel: string,
	scopeLabel = 'Minha conta e dados relacionados em modo leitura',
): AssistantReport => ({
	id: createAssistantId('report'),
	kind: request.kind,
	title,
	periodLabel,
	scopeLabel,
	updatedAt: new Date().toISOString(),
	metrics: [],
	deterministicSummary: '',
	notes: [],
});

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const groupMovementsByDay = (movements: HomeTimelineMovement[]) => {
	const grouped = new Map<string, number>();
	movements.forEach(movement => {
		if (!movement.date) return;
		const key = `${String(movement.date.getDate()).padStart(2, '0')}/${String(movement.date.getMonth() + 1).padStart(2, '0')}`;
		const signedValue = movement.type === 'expense' ? -movement.valueInCents : movement.type === 'gain' ? movement.valueInCents : 0;
		grouped.set(key, (grouped.get(key) ?? 0) + signedValue);
	});
	return Array.from(grouped.entries()).slice(-12).map(([label, value]) => ({ label, value }));
};

const createMonthlyOverview = async (
	personId: string,
	request: AssistantReportRequest,
): Promise<AssistantReport> => {
	const now = new Date();
	const report = createBaseReport(request, 'Visão do mês', getMonthLabel(now));
	const result = await getHomeSnapshotFirebase(personId);
	if (!result.success || !result.data.overview.success) {
		throw new Error('Não foi possível carregar a visão mensal.');
	}
	const overview = result.data.overview.data;
	const expenses = sum(Object.values(overview.currentMonthExpensesByBankId)) + (overview.cashSummary?.currentMonthExpensesInCents ?? 0);
	const gains = sum(Object.values(overview.currentMonthGainsByBankId)) + (overview.cashSummary?.currentMonthGainsInCents ?? 0);
	const knownBalances = overview.bankBalances
		.map(bank => bank.balanceInCents)
		.filter((value): value is number => typeof value === 'number');
	const cashBalance = overview.cashSummary?.balanceInCents ?? 0;
	const totalBalance = sum(knownBalances) + cashBalance;
	report.metrics = [
		{ label: 'Ganhos', valueInCents: gains, tone: 'positive' },
		{ label: 'Despesas', valueInCents: expenses, tone: 'negative' },
		{ label: 'Resultado', valueInCents: gains - expenses, tone: gains >= expenses ? 'positive' : 'warning' },
		{ label: 'Saldo conhecido', valueInCents: totalBalance, tone: 'neutral' },
	];
	report.chart = {
		kind: 'bar',
		points: [
			{ label: 'Ganhos', value: gains, color: '#22c55e' },
			{ label: 'Despesas', value: expenses, color: '#ef4444' },
		],
	};
	report.deterministicSummary = gains >= expenses
		? `Neste mês, os ganhos superam as despesas em ${formatCents(gains - expenses)}.`
		: `Neste mês, as despesas superam os ganhos em ${formatCents(expenses - gains)}.`;
	if (knownBalances.length < overview.bankBalances.length) {
		report.notes.push('Algum banco não possui saldo mensal carregado; o saldo conhecido pode estar incompleto.');
	}
	return report;
};

const createMovementReport = async (
	personId: string,
	request: AssistantReportRequest,
	catalog: AssistantResolvedCatalog,
): Promise<AssistantReport> => {
	const result = await getHomeSnapshotFirebase(personId);
	if (!result.success || !result.data.movements.success) {
		throw new Error('Não foi possível carregar os movimentos.');
	}
	let movements = result.data.movements.data.timelineMovements;
	let scope = 'Todos os movimentos recentes';
	if (request.kind === 'bank_movements') {
		const bank = findAssistantCatalogItem(catalog, 'banks', request.bankRef);
		if (request.bankRef && (!bank || !bank.realId)) {
			throw new Error('Selecione um banco válido para o relatório.');
		}
		if (bank?.realId) {
			movements = movements.filter(movement => movement.bankId === bank.realId);
			scope = bank.label;
		}
	}
	if (request.kind === 'cash_movements') {
		movements = movements.filter(movement => movement.bankId === null);
		scope = 'Dinheiro em espécie';
	}
	if (request.kind === 'transaction_search') {
		const normalizedQuery = request.query?.trim().toLocaleLowerCase('pt-BR') ?? '';
		if (normalizedQuery) {
			movements = movements.filter(movement =>
				[movement.name, movement.explanation, movement.tagName, movement.bankName]
					.filter((value): value is string => typeof value === 'string')
					.some(value => value.toLocaleLowerCase('pt-BR').includes(normalizedQuery)),
			);
			scope = `Busca por “${request.query?.trim()}”`;
		}
	}
	const expenses = sum(movements.filter(item => item.type === 'expense').map(item => item.valueInCents));
	const gains = sum(movements.filter(item => item.type === 'gain').map(item => item.valueInCents));
	const report = createBaseReport(
		request,
		request.kind === 'transaction_search' ? 'Pesquisa de transações' : 'Movimentos financeiros',
		'Registros recentes',
		scope,
	);
	report.metrics = [
		{ label: 'Registros encontrados', value: movements.length, displayValue: String(movements.length) },
		{ label: 'Ganhos', valueInCents: gains, tone: 'positive' },
		{ label: 'Despesas', valueInCents: expenses, tone: 'negative' },
	];
	report.chart = { kind: 'line', points: groupMovementsByDay(movements) };
	report.deterministicSummary = movements.length === 0
		? 'Nenhum movimento foi encontrado nesse escopo.'
		: `${movements.length} movimento(s) encontrado(s), com resultado líquido de ${formatCents(gains - expenses)}.`;
	return report;
};

const createCategoryReport = async (
	personId: string,
	request: AssistantReportRequest,
	catalog: AssistantResolvedCatalog,
): Promise<AssistantReport> => {
	const result = await getCategoryAnalysisFirebase(personId, 3);
	if (!result.success) throw new Error('Não foi possível carregar a análise por categoria.');
	const category = request.categoryRef
		? findAssistantCatalogItem(catalog, 'categories', request.categoryRef)
		: null;
	const tagId = category?.realId ?? result.data.defaultTagId;
	const analysis = tagId ? result.data.reportsByTagId[tagId] : null;
	const report = createBaseReport(
		request,
		analysis ? `Categoria: ${analysis.tagName}` : 'Análise por categoria',
		analysis?.currentMonthLabel ?? getMonthLabel(new Date()),
		analysis ? 'Minha conta e dados relacionados em modo leitura' : 'Nenhuma categoria selecionada',
	);
	if (!analysis) {
		report.deterministicSummary = 'Ainda não há dados suficientes para montar esta análise.';
		return report;
	}
	report.metrics = [
		{ label: 'Despesas no mês', valueInCents: analysis.expense.currentInCents, tone: 'negative' },
		{ label: 'Ganhos no mês', valueInCents: analysis.gain.currentInCents, tone: 'positive' },
		{ label: 'Movimentos no mês', value: analysis.expense.currentCount + analysis.gain.currentCount, displayValue: String(analysis.expense.currentCount + analysis.gain.currentCount) },
	];
	report.chart = {
		kind: 'bar',
		points: analysis.months.flatMap(month => [
			{ label: `${month.label} D`, value: month.expenseInCents, color: '#ef4444' },
			{ label: `${month.label} G`, value: month.gainInCents, color: '#22c55e' },
		]),
	};
	report.deterministicSummary = `Em ${analysis.tagName}, o mês tem ${formatCents(analysis.expense.currentInCents)} em despesas e ${formatCents(analysis.gain.currentInCents)} em ganhos.`;
	return report;
};

const createForecastReport = async (
	personId: string,
	request: AssistantReportRequest,
): Promise<AssistantReport> => {
	const requestedMonths = Number.parseInt(request.period ?? '', 10);
	const period = requestedMonths === 6 || requestedMonths === 12 ? requestedMonths : 3;
	const result = await getFinancialForecastFirebase(personId, period);
	if (!result.success) throw new Error(result.error);
	const forecast = result.data;
	const report = createBaseReport(request, 'Previsão de fluxo', `Próximos ${period} meses`);
	report.metrics = [
		{ label: 'Saldo de abertura', valueInCents: forecast.openingBalanceInCents },
		{ label: 'Saldo projetado', valueInCents: forecast.finalBalanceInCents, tone: forecast.finalBalanceInCents >= 0 ? 'positive' : 'warning' },
		{ label: 'Ganhos previstos', valueInCents: forecast.totalGainsInCents, tone: 'positive' },
		{ label: 'Despesas previstas', valueInCents: forecast.totalExpensesInCents, tone: 'negative' },
	];
	report.chart = {
		kind: 'line',
		points: forecast.months.map(month => ({
			label: month.label,
			value: month.closingBalanceInCents,
			color: month.closingBalanceInCents >= 0 ? '#22c55e' : '#ef4444',
		})),
	};
	report.deterministicSummary = `Mantidas as premissas atuais, o saldo ao fim do período é ${formatCents(forecast.finalBalanceInCents)}.`;
	report.notes.push('Previsão baseada nos registros, recorrências e médias existentes; não é garantia de resultado.');
	if (forecast.missingSnapshotBankNames.length > 0) {
		report.notes.push(`Saldo mensal ausente em: ${forecast.missingSnapshotBankNames.join(', ')}.`);
	}
	return report;
};

const createPendingReport = async (
	personId: string,
	request: AssistantReportRequest,
): Promise<AssistantReport> => {
	const [expensesResult, gainsResult] = await Promise.all([
		getMandatoryExpensesWithRelationsFirebase(personId),
		getMandatoryGainsWithRelationsFirebase(personId),
	]);
	if (!expensesResult.success || !gainsResult.success) {
		throw new Error('Não foi possível carregar as obrigações.');
	}
	const cycle = formatCycleKey(new Date());
	const expenses = Array.isArray(expensesResult.data) ? expensesResult.data as Array<Record<string, unknown>> : [];
	const gains = Array.isArray(gainsResult.data) ? gainsResult.data as Array<Record<string, unknown>> : [];
	const pendingExpenses = expenses.filter(item => item.lastPaymentCycle !== cycle);
	const pendingGains = gains.filter(item => item.lastReceiptCycle !== cycle);
	const expenseTotal = sum(pendingExpenses.map(item => typeof item.valueInCents === 'number' ? item.valueInCents : 0));
	const gainTotal = sum(pendingGains.map(item => typeof item.valueInCents === 'number' ? item.valueInCents : 0));
	const report = createBaseReport(request, 'Obrigações pendentes', getMonthLabel(new Date()));
	report.metrics = [
		{ label: 'Gastos pendentes', valueInCents: expenseTotal, tone: 'negative' },
		{ label: 'Ganhos pendentes', valueInCents: gainTotal, tone: 'positive' },
		{ label: 'Itens pendentes', value: pendingExpenses.length + pendingGains.length, displayValue: String(pendingExpenses.length + pendingGains.length) },
	];
	report.chart = {
		kind: 'donut',
		points: [
			{ label: 'Gastos', value: expenseTotal, color: '#ef4444' },
			{ label: 'Ganhos', value: gainTotal, color: '#22c55e' },
		],
	};
	report.deterministicSummary = `${pendingExpenses.length} gasto(s) e ${pendingGains.length} ganho(s) ainda aparecem como pendentes neste ciclo.`;
	return report;
};

const createInvestmentReport = async (
	personId: string,
	request: AssistantReportRequest,
): Promise<AssistantReport> => {
	const result = await getHomeSnapshotFirebase(personId);
	if (!result.success || !result.data.investments.success) {
		throw new Error('Não foi possível carregar a carteira.');
	}
	const portfolio = result.data.investments.data.portfolio;
	const report = createBaseReport(request, 'Carteira de investimentos', 'Posição atual');
	report.metrics = [
		{ label: 'Valor base atual', valueInCents: portfolio.totalCurrentBaseInCents },
		{ label: 'Valor simulado', valueInCents: portfolio.totalSimulatedInCents },
		{ label: 'Ganho estimado', valueInCents: portfolio.totalEstimatedGainInCents, tone: portfolio.totalEstimatedGainInCents >= 0 ? 'positive' : 'warning' },
		{ label: 'Investimentos', value: portfolio.investmentCount, displayValue: String(portfolio.investmentCount) },
	];
	report.chart = {
		kind: 'donut',
		points: portfolio.items.slice(0, 8).map((item, index) => ({
			label: item.name,
			value: item.simulatedValueInCents,
			color: ['#facc15', '#38bdf8', '#a78bfa', '#22c55e', '#fb7185', '#f97316', '#2dd4bf', '#94a3b8'][index],
		})),
	};
	report.deterministicSummary = portfolio.investmentCount === 0
		? 'Nenhum investimento foi encontrado.'
		: `A carteira tem ${portfolio.investmentCount} investimento(s) e valor simulado de ${formatCents(portfolio.totalSimulatedInCents)}.`;
	report.notes.push('Valores simulados não são recomendação nem garantia de rentabilidade.');
	return report;
};

export const assistantReportService: AssistantReportService = {
	async createReport(personId, request, catalog) {
		switch (request.kind) {
			case 'monthly_overview':
				return createMonthlyOverview(personId, request);
			case 'bank_movements':
			case 'cash_movements':
			case 'transaction_search':
				return createMovementReport(personId, request, catalog);
			case 'category_analysis':
				return createCategoryReport(personId, request, catalog);
			case 'cash_flow_forecast':
				return createForecastReport(personId, request);
			case 'pending_obligations':
				return createPendingReport(personId, request);
			case 'investment_portfolio':
				return createInvestmentReport(personId, request);
		}
	},
};
