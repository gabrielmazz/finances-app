import React from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, TouchableOpacity, View, useColorScheme } from 'react-native';

// Importações relacionadas ao Gluestack UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Divider } from '@/components/ui/divider';
import { getMonthlyBalanceFirebaseRelatedToUser } from '@/functions/MonthlyBalanceFirebase';

import { auth } from '@/FirebaseConfig';
import {
	getCurrentMonthSummaryByBankFirebaseExpanses,
	getCurrentMonthSummaryByBankFirebaseGains,
	getBanksWithUsersByPersonFirebase,
	getCurrentYearMovementsFirebase,
} from '@/functions/BankFirebase';
import { getLimitedExpensesFirebase, getLimitedExpensesWithPeopleFirebase } from '@/functions/ExpenseFirebase';
import { getLimitedGainsFirebase, getLimitedGainsWithPeopleFirebase } from '@/functions/GainFirebase';
import { getFinanceInvestmentsWithRelationsFirebase } from '@/functions/FinancesFirebase';

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { VStack } from '@/components/ui/vstack';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';

import HomeScreenIllustration from '../assets/UnDraw/homeScreen.svg';

type YearlyMonthStats = {
	monthIndex: number;
	expensesInCents: number;
	gainsInCents: number;
};

type BankMonthlyTotal = {
	bankId: string;
	totalInCents: number;
};

type PieLegendEntry = {
	key: string;
	name: string;
	color: string;
	totalInCents: number;
};

type InvestmentHighlight = {
	id: string;
	name: string;
	bankId: string | null;
	appliedValueInCents: number;
	simulatedValueInCents: number;
};

type NormalizedInvestmentSummary = {
	id: string;
	name: string;
	initialValueInCents: number;
	cdiPercentage: number;
	bankId: string | null;
	lastManualSyncValueInCents: number | null;
	lastManualSyncAt: Date | null;
	createdAt: Date | null;
};

const DAYS_IN_YEAR = 365;
const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;
const BASE_CDI_ANNUAL_RATE = 0.1375;

const BAR_CHART_COLORS = {
	expenses: '#F97316',
	gains: '#10B981',
};

const PIE_COLOR_PALETTE = ['#6366F1', '#F97316', '#22D3EE', '#F43F5E', '#10B981', '#FACC15', '#A855F7', '#0EA5E9'];

const createEmptyYearlyStats = (): YearlyMonthStats[] =>
	Array.from({ length: 12 }, (_, monthIndex) => ({
		monthIndex,
		expensesInCents: 0,
		gainsInCents: 0,
	}));

export default function HomeScreen() {

	const colorScheme = useColorScheme();
	const isDarkMode = colorScheme === 'dark';
	const axisColor = isDarkMode ? '#CBD5F5' : '#475569';
	const legendBorderColor = isDarkMode ? '#374151' : '#E5E7EB';
	const currentYear = React.useMemo(() => new Date().getFullYear(), []);
	const { shouldHideValues } = useValueVisibility();

	const [isLoadingSummary, setIsLoadingSummary] = React.useState(false);
	const [summaryError, setSummaryError] = React.useState<string | null>(null);

	const monthLabel = React.useMemo(() => {
		const formatted = new Intl.DateTimeFormat('pt-BR', {
			month: 'long',
			year: 'numeric',
		}).format(new Date());

		return formatted.charAt(0).toUpperCase() + formatted.slice(1);
	}, []);

	const formatCurrencyBRL = React.useCallback(
		(valueInCents: number) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}
			return new Intl.NumberFormat('pt-BR', {
				style: 'currency',
				currency: 'BRL',
				minimumFractionDigits: 2,
			}).format(valueInCents / 100);
		},
		[shouldHideValues],
	);

	const formatMovementDate = React.useCallback((value: unknown) => {
		if (!value) {
			return 'Data indisponível';
		}

		let date: Date | null = null;

		if (value instanceof Date) {
			date = value;
		} else if (
			typeof value === 'object' &&
			value !== null &&
			'toDate' in value &&
			typeof (value as { toDate?: () => Date }).toDate === 'function'
		) {
			date = (value as { toDate?: () => Date }).toDate?.() ?? null;
		} else if (typeof value === 'string' || typeof value === 'number') {
			const parsedDate = new Date(value);
			if (!Number.isNaN(parsedDate.getTime())) {
				date = parsedDate;
			}
		}

		if (!date) {
			return 'Data indisponível';
		}

		return new Intl.DateTimeFormat('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		}).format(date);
	}, []);

	const handleOpenMonthlySummary = React.useCallback(() => {
		router.push('/bank-summary');
	}, []);
	const handleOpenInvestmentsList = React.useCallback(() => {
		router.push('/financial-list');
	}, []);

	// Estado para armazenar o total de despesas
	const [totalExpensesInCents, setTotalExpensesInCents] = React.useState(0);
	const [expenseCount, setExpenseCount] = React.useState(0);

	// Estado para armazenar o total de ganhos
	const [totalGainsInCents, setTotalGainsInCents] = React.useState(0);
	const [gainCount, setGainCount] = React.useState(0);
	const [bankBalances, setBankBalances] = React.useState<
		{ id: string; name: string; balanceInCents: number | null }[]
	>([]);

	// Estado para armazenar os movimentos mais recentes de ganhos e despesas
	const [recentExpenses, setRecentExpenses] = React.useState<any[]>([]);
	const [recentGains, setRecentGains] = React.useState<any[]>([]);

	// Estados relacionados ao carregamento dos movimentos e erros
	const [isLoadingMovements, setIsLoadingMovements] = React.useState(false);

	// Estados relacionados ao erro ao carregar os movimentos
	const [movementsError, setMovementsError] = React.useState<string | null>(null);

	// Estados relacionados aos nomes e cores dos bancos
	const [bankNamesById, setBankNamesById] = React.useState<Record<string, string>>({});
	const [bankColorsById, setBankColorsById] = React.useState<Record<string, string | null>>({});

	// Estados relacionados aos gráficos e estatísticas
	const [isMovementsExpanded, setIsMovementsExpanded] = React.useState(false);

	// Estatísticas anuais
	const [yearlyStats, setYearlyStats] = React.useState<YearlyMonthStats[]>(() => createEmptyYearlyStats());

	// Estatísticas mensais por banco para gráficos
	const [currentMonthExpensesByBank, setCurrentMonthExpensesByBank] = React.useState<BankMonthlyTotal[]>([]);
	const [currentMonthGainsByBank, setCurrentMonthGainsByBank] = React.useState<BankMonthlyTotal[]>([]);

	// Estados relacionados a erros dos gráficos
	const [chartsError, setChartsError] = React.useState<string | null>(null);

	// Estados para controlar a expansão dos gráficos e totais
	const [isChartsExpanded, setIsChartsExpanded] = React.useState(false);

	// Estado para controlar a aba selecionada nos gráficos
	const [chartTab, setChartTab] = React.useState<'bar' | 'pie'>('bar');

	// Estado para controlar a expansão dos totais
	const [isTotalsExpanded, setIsTotalsExpanded] = React.useState(false);

	const [investmentSummary, setInvestmentSummary] = React.useState<{
		totalInvestedInCents: number;
		totalSimulatedInCents: number;
		investmentCount: number;
		highlights: InvestmentHighlight[];
	}>({
		totalInvestedInCents: 0,
		totalSimulatedInCents: 0,
		investmentCount: 0,
		highlights: [],
	});
	const [isLoadingInvestments, setIsLoadingInvestments] = React.useState(false);
	const [investmentsError, setInvestmentsError] = React.useState<string | null>(null);

	const getBankName = React.useCallback(
		(bankId: unknown) => {
			if (!bankId || typeof bankId !== 'string') {
				return 'Banco não identificado';
			}

			return bankNamesById[bankId] ?? 'Banco não identificado';
		},
		[bankNamesById],
	);

const parseToDate = React.useCallback((value: unknown) => {
	if (!value) {
		return null;
	}

		if (value instanceof Date) {
			return value;
		}

		if (typeof value === 'object' && value !== null) {
			if ('toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
				const parsedFromTimestamp = (value as { toDate?: () => Date }).toDate?.();
				if (parsedFromTimestamp instanceof Date && !Number.isNaN(parsedFromTimestamp.getTime())) {
					return parsedFromTimestamp;
				}
			}

			if ('seconds' in value && typeof (value as { seconds?: number }).seconds === 'number') {
				const secondsValue = (value as { seconds?: number }).seconds ?? 0;
				const dateFromSeconds = new Date(secondsValue * 1000);
				if (!Number.isNaN(dateFromSeconds.getTime())) {
					return dateFromSeconds;
				}
			}
		}

		if (typeof value === 'string' || typeof value === 'number') {
			const parsedDate = new Date(value);
			if (!Number.isNaN(parsedDate.getTime())) {
				return parsedDate;
			}
		}

		return null;
}, []);

const calculateInvestmentDailyRate = (cdiPercentage: number) => {
	if (!Number.isFinite(cdiPercentage) || cdiPercentage <= 0) {
		return 0;
	}
	const normalizedAnnualRate = BASE_CDI_ANNUAL_RATE * (cdiPercentage / 100);
	return normalizedAnnualRate / DAYS_IN_YEAR;
};

const resolveInvestmentBaseValueInCents = (investment: NormalizedInvestmentSummary) => {
	if (typeof investment.lastManualSyncValueInCents === 'number') {
		return investment.lastManualSyncValueInCents;
	}
	return investment.initialValueInCents;
};

const resolveInvestmentBaseDate = (investment: NormalizedInvestmentSummary) => {
	return investment.lastManualSyncAt ?? investment.createdAt ?? new Date();
};

const simulateInvestmentValueInCents = (investment: NormalizedInvestmentSummary) => {
	const baseValueInCents = resolveInvestmentBaseValueInCents(investment);
	const dailyRate = calculateInvestmentDailyRate(investment.cdiPercentage);
	if (dailyRate <= 0) {
		return baseValueInCents;
	}

	const baseDate = resolveInvestmentBaseDate(investment);
	const diff = Date.now() - baseDate.getTime();
	const days = diff > 0 ? Math.floor(diff / MILLISECONDS_IN_DAY) : 0;
	const simulatedBRL = (baseValueInCents / 100) * Math.pow(1 + dailyRate, days);
	return Math.round(simulatedBRL * 100);
};

	const buildYearlyStats = React.useCallback(
		(expenses: any[], gains: any[]) => {
			const stats = createEmptyYearlyStats();
			const targetYear = new Date().getFullYear();

			const accumulate = (items: any[], key: 'expensesInCents' | 'gainsInCents') => {
				items?.forEach((item) => {
					const timestamp = item?.date ?? item?.createdAt;
					const parsedDate = parseToDate(timestamp);

					if (!parsedDate || parsedDate.getFullYear() !== targetYear) {
						return;
					}

					const monthIndex = parsedDate.getMonth();
					const rawValue =
						typeof item?.valueInCents === 'number' && !Number.isNaN(item.valueInCents)
							? item.valueInCents
							: 0;

					stats[monthIndex][key] += Math.max(rawValue, 0);
				});
			};

			accumulate(expenses ?? [], 'expensesInCents');
			accumulate(gains ?? [], 'gainsInCents');

			return stats;
		},
		[parseToDate],
	);

	const aggregateMonthlyValuesByBank = React.useCallback((items: any[]) => {
		const totals: Record<string, number> = {};

		items?.forEach((item) => {
			const bankId =
				typeof item?.bankId === 'string' && item.bankId.length > 0
					? item.bankId
					: 'banco-desconhecido';
			const value =
				typeof item?.valueInCents === 'number' && !Number.isNaN(item.valueInCents)
					? item.valueInCents
					: 0;

			totals[bankId] = (totals[bankId] ?? 0) + Math.max(value, 0);
		});

		return Object.entries(totals).map(([bankId, totalInCents]) => ({
			bankId,
			totalInCents,
		}));
	}, []);

	const buildPieSlices = React.useCallback(
		(totals: BankMonthlyTotal[]) => {
			const slices = totals
				.filter(item => item.totalInCents > 0)
				.map((item, index) => {
					const fallbackColor = PIE_COLOR_PALETTE[index % PIE_COLOR_PALETTE.length];
					const customColor =
						item.bankId && typeof bankColorsById[item.bankId] === 'string'
							? bankColorsById[item.bankId]
							: null;
					const color = customColor ?? fallbackColor;
					const name = bankNamesById[item.bankId] ?? 'Banco não identificado';

					return {
						chartSlice: {
							value: Number((item.totalInCents / 100).toFixed(2)),
							color,
							text: name,
						},
						legendSlice: {
							key: item.bankId || `bank-${index}`,
							name,
							color,
							totalInCents: item.totalInCents,
						} satisfies PieLegendEntry,
					};
				});

			return {
				chartData: slices.map(slice => slice.chartSlice),
				legendData: slices.map(slice => slice.legendSlice),
			};
		},
		[bankColorsById, bankNamesById],
	);

	const formatYAxisLabel = React.useCallback((label: string) => {
		const numericValue = Number(label);
		if (Number.isNaN(numericValue)) {
			return label;
		}

		if (Math.abs(numericValue) >= 1000) {
			return `${(numericValue / 1000).toFixed(1).replace('.0', '')}k`;
		}

		return numericValue.toFixed(0);
	}, []);

	const barChartStackData = React.useMemo(() => {
		const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'short' });

		return yearlyStats.map((item) => {
			const label = formatter.format(new Date(currentYear, item.monthIndex, 1));
			const normalizedLabel = label.replace('.', '').slice(0, 3).toUpperCase();
			const expensesValue = Number((item.expensesInCents / 100).toFixed(2));
			const gainsValue = Number((item.gainsInCents / 100).toFixed(2));

			return {
				label: normalizedLabel,
				stacks: [
					{ value: expensesValue, color: BAR_CHART_COLORS.expenses },
					{ value: gainsValue, color: BAR_CHART_COLORS.gains },
				],
			};
		});
	}, [yearlyStats, currentYear]);

	const hasYearlyActivity = React.useMemo(
		() => yearlyStats.some((item) => item.expensesInCents > 0 || item.gainsInCents > 0),
		[yearlyStats],
	);

	const expensesPieSlices = React.useMemo(
		() => buildPieSlices(currentMonthExpensesByBank),
		[currentMonthExpensesByBank, buildPieSlices],
	);
	const gainsPieSlices = React.useMemo(
		() => buildPieSlices(currentMonthGainsByBank),
		[currentMonthGainsByBank, buildPieSlices],
	);

	const expensePieChartData = expensesPieSlices.chartData;
	const expensePieLegendData = expensesPieSlices.legendData;
	const hasExpensePieData = expensePieChartData.length > 0;

	const gainPieChartData = gainsPieSlices.chartData;
	const gainPieLegendData = gainsPieSlices.legendData;
	const hasGainPieData = gainPieChartData.length > 0;

	// Função para receber os valores do resumo mensal (despesas) e assim soma-los para mostrar na tela
	function calculateMonthlyExpansesSummaryTotals(expanses: any[]) {

		// Inicializa as variáveis para armazenar o total e a contagem
		let totalExpensesInCents = 0;
		let expenseCount = 0;

		// Itera sobre cada valor nas despesas e soma-os
		expanses.forEach((valueInCents) => {

			// Verifica se o valor é um número válido antes de somar
			if (typeof valueInCents === 'number' && !isNaN(valueInCents)) {

				// Adiciona o valor ao total
				totalExpensesInCents += valueInCents;

				// Incrementa a contagem de despesas
				expenseCount += 1;
			} else {

				// Exibe um alerta se um valor inválido for encontrado
				showFloatingAlert({
					message: 'Valor inválido encontrado nas despesas.',
					action: 'error',
					position: 'bottom',

				});
			}
		});

		return {
			totalExpensesInCents,
			expenseCount,
		};
	}

	// Função para receber os valores do resumo mensal (ganhos) e assim soma-los para mostrar na tela
	function calculateMonthlyGainsSummaryTotals(gains: any[]) {

		// Inicializa as variáveis para armazenar o total e a contagem
		let totalGainsInCents = 0;
		let gainCount = 0;

		// Itera sobre cada valor nas receitas e soma-os
		gains.forEach((valueInCents) => {

			// Verifica se o valor é um número válido antes de somar
			if (typeof valueInCents === 'number' && !isNaN(valueInCents)) {

				// Adiciona o valor ao total
				totalGainsInCents += valueInCents;

				// Incrementa a contagem de receitas
				gainCount += 1;
			} else {

				// Exibe um alerta se um valor inválido for encontrado
				showFloatingAlert({
					message: 'Valor inválido encontrado nos ganhos.',
					action: 'error',
					position: 'bottom',

				});
			}
		});

		return {
			totalGainsInCents,
			gainCount,
		};
	}

	// Carrega todos os serviços e dados necessários que serão exibidos na tela inicial
	useFocusEffect(

		React.useCallback(() => {

			let isMounted = true;

			const loadHomeData = async () => {

				// Reseta os estados de carregamento e erro antes de iniciar o carregamento
				// dos serviços
				setIsLoadingSummary(true);
				setSummaryError(null);
				setIsLoadingMovements(true);
				setMovementsError(null);
				setRecentExpenses([]);
				setRecentGains([]);
				setBankNamesById({});
				setBankColorsById({});
				setChartsError(null);
				setYearlyStats(createEmptyYearlyStats());
				setCurrentMonthExpensesByBank([]);
				setCurrentMonthGainsByBank([]);

				// Obtém o usuário atualmente autenticado
				const currentUser = auth.currentUser;

				// Se nenhum usuário autenticado for encontrado, define os erros e encerra o carregamento
				if (!currentUser) {
					if (isMounted) {
						const message = 'Nenhum usuário autenticado foi identificado.';
						setSummaryError(message);
						setMovementsError(message);
						setInvestmentsError(message);
						setRecentExpenses([]);
						setRecentGains([]);
						setBankColorsById({});
						setIsLoadingSummary(false);
						setIsLoadingMovements(false);
						setIsLoadingInvestments(false);
					}
					return;
				}

				if (isMounted) {
					setIsLoadingInvestments(true);
					setInvestmentsError(null);
					setInvestmentSummary({
						totalInvestedInCents: 0,
						totalSimulatedInCents: 0,
						investmentCount: 0,
						highlights: [],
					});
				}

				const loadSummariesPromise = (async () => {

					try {

						const [expensesSummary, gainsSummary, yearlySummary] = await Promise.allSettled([
							getCurrentMonthSummaryByBankFirebaseExpanses(currentUser.uid),
							getCurrentMonthSummaryByBankFirebaseGains(currentUser.uid),
							getCurrentYearMovementsFirebase({ personId: currentUser.uid }),
						]);

						if (!isMounted) {
							return;
						}

						const summaryErrors: string[] = [];
						const chartIssues: string[] = [];

						if (expensesSummary.status === 'fulfilled' && expensesSummary.value?.success !== false) {
							const monthlyExpensesData = Array.isArray(expensesSummary.value?.data)
								? expensesSummary.value.data
								: [];
							const resultExpansesValues = monthlyExpensesData.map((item: any) => item?.valueInCents ?? 0);
							const summaryTotals = calculateMonthlyExpansesSummaryTotals(resultExpansesValues);
							setTotalExpensesInCents(summaryTotals.totalExpensesInCents);
							setExpenseCount(summaryTotals.expenseCount);
							setCurrentMonthExpensesByBank(aggregateMonthlyValuesByBank(monthlyExpensesData));
						} else {
							console.error(
								'Erro ao carregar o resumo mensal de despesas:',
								expensesSummary.status === 'rejected' ? expensesSummary.reason : expensesSummary.value?.error ?? 'Retorno inválido',
							);
							summaryErrors.push('Erro ao carregar o resumo mensal de despesas.');
							chartIssues.push('Não foi possível carregar as despesas do mês para o gráfico por banco.');
							setCurrentMonthExpensesByBank([]);
						}

						if (gainsSummary.status === 'fulfilled' && gainsSummary.value?.success !== false) {
							const monthlyGainsData = Array.isArray(gainsSummary.value?.data) ? gainsSummary.value.data : [];
							const resultGainsValues = monthlyGainsData.map((item: any) => item?.valueInCents ?? 0);
							const summaryTotals = calculateMonthlyGainsSummaryTotals(resultGainsValues);
							setTotalGainsInCents(summaryTotals.totalGainsInCents);
							setGainCount(summaryTotals.gainCount);
							setCurrentMonthGainsByBank(aggregateMonthlyValuesByBank(monthlyGainsData));
						} else {
							console.error(
								'Erro ao carregar o resumo mensal de ganhos:',
								gainsSummary.status === 'rejected' ? gainsSummary.reason : gainsSummary.value?.error ?? 'Retorno inválido',
							);
							summaryErrors.push('Erro ao carregar o resumo mensal de ganhos.');
							chartIssues.push('Não foi possível carregar os ganhos do mês para o gráfico por banco.');
							setCurrentMonthGainsByBank([]);
						}

						if (yearlySummary.status === 'fulfilled' && yearlySummary.value?.success) {
							const yearlyExpenses = yearlySummary.value?.data?.expenses ?? [];
							const yearlyGains = yearlySummary.value?.data?.gains ?? [];
							setYearlyStats(buildYearlyStats(yearlyExpenses, yearlyGains));
						} else {
							console.error(
								'Erro ao carregar o resumo anual:',
								yearlySummary.status === 'rejected' ? yearlySummary.reason : yearlySummary.value?.error ?? 'Retorno inválido',
							);
							setYearlyStats(createEmptyYearlyStats());
							chartIssues.push('Não foi possível carregar o histórico anual dos gráficos.');
						}

						if (summaryErrors.length > 0) {
							setSummaryError(summaryErrors.join(' '));
						}

						// Carrega saldos atuais por banco
						try {
							const now = new Date();
							const currentYear = now.getFullYear();
							const currentMonth = now.getMonth() + 1;
							const banksResult = await getBanksWithUsersByPersonFirebase(currentUser.uid);

							if (banksResult?.success && Array.isArray(banksResult.data)) {
								const balances = await Promise.all(
									banksResult.data.map(async (bank: any) => {
										const bankId = typeof bank?.id === 'string' ? bank.id : '';
										if (!bankId) {
											return null;
										}
										const balanceRes = await getMonthlyBalanceFirebaseRelatedToUser({
											personId: currentUser.uid,
											bankId,
											year: currentYear,
											month: currentMonth,
										});
										const balance =
											balanceRes?.success && balanceRes.data && typeof balanceRes.data.valueInCents === 'number'
												? balanceRes.data.valueInCents
												: null;
										const name =
											typeof bank?.name === 'string' && bank.name.trim().length > 0
												? bank.name.trim()
												: 'Banco sem nome';
										return { id: bankId, name, balanceInCents: balance };
									}),
								);
								setBankBalances(balances.filter(Boolean) as { id: string; name: string; balanceInCents: number | null }[]);
							} else {
								setBankBalances([]);
							}
						} catch (error) {
							console.error('Erro ao carregar saldos de bancos:', error);
							setBankBalances([]);
						}

						if (chartIssues.length > 0) {
							setChartsError(chartIssues.join(' '));
						} else {
							setChartsError(null);
						}

					} catch (error) {
						console.error('Erro geral ao carregar o resumo mensal:', error);

						if (isMounted) {
							setSummaryError('Erro ao carregar o resumo mensal.');
							setChartsError('Erro ao carregar os gráficos.');
							setYearlyStats(createEmptyYearlyStats());
							setCurrentMonthExpensesByBank([]);
							setCurrentMonthGainsByBank([]);
						}

					} finally {
						if (isMounted) {
							setIsLoadingSummary(false);
						}
					}

				})();

				const loadMovementsPromise = (async () => {

					try {

						const [expensesResult, gainsResult, banksResult] = await Promise.all([
							getLimitedExpensesWithPeopleFirebase({ limit: 3, personId: currentUser.uid }),
							getLimitedGainsWithPeopleFirebase({ limit: 3, personId: currentUser.uid }),
							getBanksWithUsersByPersonFirebase(currentUser.uid),
						]);

						if (!isMounted) {
							return;
						}

						let hasIssues = false;

						if (banksResult?.success) {
							const { nameMap, colorMap } = Array.isArray(banksResult.data)
								? banksResult.data.reduce(
									(
										acc: { nameMap: Record<string, string>; colorMap: Record<string, string | null> },
										bank: any,
									) => {
										if (bank && typeof bank.id === 'string') {
											const rawName = typeof bank.name === 'string' ? bank.name.trim() : '';
											const rawColor =
												typeof bank.colorHex === 'string' ? bank.colorHex.trim() : null;
											acc.nameMap[bank.id] = rawName.length > 0 ? rawName : 'Banco sem nome';
											acc.colorMap[bank.id] =
												rawColor && rawColor.length > 0 ? rawColor : null;
										}
										return acc;
									},
									{ nameMap: {}, colorMap: {} },
								)
								: { nameMap: {}, colorMap: {} };

							setBankNamesById(nameMap);
							setBankColorsById(colorMap);
						} else {
							setBankNamesById({});
							setBankColorsById({});
							hasIssues = true;
						}

						// Verifica se os resultados do carregamento relacionados às despesas e ganhos foram bem-sucedidos
						if (expensesResult?.success) {
							setRecentExpenses(expensesResult.data ?? []);
						} else {
							setRecentExpenses([]);
							hasIssues = true;
						}

						// Verifica se os resultados do carregamento relacionados às despesas e ganhos foram bem-sucedidos
						if (gainsResult?.success) {
							setRecentGains(gainsResult.data ?? []);
						} else {
							setRecentGains([]);
							hasIssues = true;
						}


						if (hasIssues) {
							setMovementsError('Não foi possível carregar alguns movimentos recentes.');
						} else {
							setMovementsError(null);
						}

					} catch (error) {
						console.error('Erro ao carregar os últimos movimentos:', error);

						if (isMounted) {
							setMovementsError('Erro ao carregar os últimos movimentos.');
							setRecentExpenses([]);
							setRecentGains([]);
							setBankNamesById({});
							setBankColorsById({});
						}

					} finally {

						if (isMounted) {
							setIsLoadingMovements(false);
						}

					}

				})();

				const loadInvestmentsPromise = (async () => {
					try {
						const investmentsResult = await getFinanceInvestmentsWithRelationsFirebase(currentUser.uid);

						if (!isMounted) {
							return;
						}

						if (!investmentsResult?.success || !Array.isArray(investmentsResult.data)) {
							setInvestmentSummary({
								totalInvestedInCents: 0,
								totalSimulatedInCents: 0,
								investmentCount: 0,
								highlights: [],
							});
							setInvestmentsError('Não foi possível carregar os investimentos.');
							return;
						}

						const normalizedInvestments: NormalizedInvestmentSummary[] = (
							investmentsResult.data as Array<Record<string, any>>
						).map(investment => {
							const id =
								typeof investment.id === 'string'
									? investment.id
									: String(investment.id ?? Math.random().toString());
							const name =
								typeof investment.name === 'string' && investment.name.trim().length > 0
									? investment.name.trim()
									: 'Investimento sem nome';
							const initialValueInCents =
								typeof investment.initialValueInCents === 'number'
									? investment.initialValueInCents
									: 0;
							const lastManualValue =
								typeof investment.lastManualSyncValueInCents === 'number'
									? investment.lastManualSyncValueInCents
									: null;
							const bankId = typeof investment.bankId === 'string' ? investment.bankId : null;
							const cdiPercentage =
								typeof investment.cdiPercentage === 'number' ? investment.cdiPercentage : 0;

							return {
								id,
								name,
								initialValueInCents,
								cdiPercentage,
								bankId,
								lastManualSyncValueInCents: lastManualValue,
								lastManualSyncAt: parseToDate(investment.lastManualSyncAt),
								createdAt: parseToDate(
									investment.createdAt ?? investment.createdAtISO ?? investment.createdAtUtc,
								),
							};
						});

						const totalInvestedInCents = normalizedInvestments.reduce(
							(acc, investment) => acc + investment.initialValueInCents,
							0,
						);

						const simulatedInvestments = normalizedInvestments.map(investment => ({
							...investment,
							appliedValueInCents: resolveInvestmentBaseValueInCents(investment),
							simulatedValueInCents: simulateInvestmentValueInCents(investment),
						}));

						const totalSimulatedInCents = simulatedInvestments.reduce(
							(acc, investment) => acc + investment.simulatedValueInCents,
							0,
						);

						const highlights = simulatedInvestments
							.slice()
							.sort((a, b) => b.simulatedValueInCents - a.simulatedValueInCents)
							.slice(0, 3)
							.map(item => ({
								id: item.id,
								name: item.name,
								bankId: item.bankId,
								appliedValueInCents: item.appliedValueInCents,
								simulatedValueInCents: item.simulatedValueInCents,
							}));

						setInvestmentSummary({
							totalInvestedInCents,
							totalSimulatedInCents,
							investmentCount: normalizedInvestments.length,
							highlights,
						});
						setInvestmentsError(null);
					} catch (error) {
						console.error('Erro ao carregar investimentos na Home:', error);
						if (isMounted) {
							setInvestmentSummary({
								totalInvestedInCents: 0,
								totalSimulatedInCents: 0,
								investmentCount: 0,
								highlights: [],
							});
							setInvestmentsError('Erro ao carregar os investimentos.');
						}
					} finally {
						if (isMounted) {
							setIsLoadingInvestments(false);
						}
					}
				})();

				await Promise.all([loadSummariesPromise, loadMovementsPromise, loadInvestmentsPromise]);
			};

			loadHomeData();

			return () => {
				isMounted = false;
			};
		}, []),
	);

	return (
		<View className="
				flex-1 w-full h-full
				mt-[64px]
				items-center
				justify-between
				pb-6
				relative
			"
		>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
				style={{
					flex: 1,
					width: '100%',
				}}
				contentContainerStyle={{
					flexGrow: 1,
					width: '100%',
					paddingBottom: 48,
				}}
			>
				<View className="w-full px-6">

					<Heading size="3xl" className="text-center">
						Resumo financeiro
					</Heading>

					<Box className="w-full items-center ">
						<HomeScreenIllustration width={180} height={180} />
					</Box>

					<Text className="text-justify text-gray-600 dark:text-gray-400">
						Veja uma visão geral dos seus ganhos e despesas deste mês. Contando com o resumo do mês atual, visualizações gráficas e os movimentos mais recentes registrados no aplicativo.
					</Text>

					<Divider className="my-6 mb-6" />

					<VStack className="gap-4 w-full">

						<View className="w-full">

							<TouchableOpacity
								activeOpacity={0.85}
								onPress={handleOpenMonthlySummary}
								disabled={isLoadingSummary}
							>
								{/* Box para mostrar a soma dos gastos e ganhos */}
								<Box
									className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 w-full mb-6"
									style={isLoadingSummary ? { opacity: 0.6 } : undefined}
								>

									<HStack
										className="
											justify-between
											items-center
										"
									>

										<Heading size="md" className="text-gray-800 dark:text-gray-200">
											Resumo de {monthLabel}
										</Heading>

									</HStack>

									{isLoadingSummary ? (

										<Text className="mt-4 text-gray-600 dark:text-gray-400">
											Carregando resumo...
										</Text>

									) : summaryError ? (

										<Text className="text-red-600 dark:text-red-400">
											{summaryError}
										</Text>

									) : (

										<>
											<Text className="pt-4 text-gray-700 dark:text-gray-300">
												Total de ganhos:{' '}
												<Text className="text-emerald-600 dark:text-emerald-400 font-semibold">
													{formatCurrencyBRL(totalGainsInCents)}
												</Text>
											</Text>

											<Text className="mt-2 text-gray-700 dark:text-gray-300">
												Total de despesas:{' '}
												<Text className="text-red-600 dark:text-red-400 font-semibold">
													{formatCurrencyBRL(totalExpensesInCents)}
												</Text>
											</Text>

											{bankBalances.length > 0 && (
												<>
													<Divider className="my-3" />
													<Text className="text-gray-700 dark:text-gray-300 mb-2">
														Saldos atuais por banco
													</Text>
													{bankBalances.map(bank => (
														<Text key={bank.id} className="text-gray-700 dark:text-gray-300 mb-1">
															{bank.name}:{' '}
															<Text
																className={
																	typeof bank.balanceInCents === 'number'
																		? bank.balanceInCents >= 0
																			? 'text-emerald-600 dark:text-emerald-400 font-semibold'
																			: 'text-red-600 dark:text-red-400 font-semibold'
																		: 'text-gray-500 dark:text-gray-400'
																}
															>
																{typeof bank.balanceInCents === 'number'
																	? formatCurrencyBRL(bank.balanceInCents)
																	: 'Saldo indisponível'}
															</Text>
														</Text>
													))}
												</>
											)}
										</>

									)}

									<Text className="mt-4 text-sm text-gray-500 dark:text-emerald-400">
										Toque para ver o resumo detalhado por banco
									</Text>

								</Box>
							</TouchableOpacity>

							<TouchableOpacity activeOpacity={0.85} onPress={handleOpenInvestmentsList}>
								<Box
									className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 w-full mb-6"
								>
									<HStack className="justify-between items-center">
										<Heading size="md" className="text-gray-800 dark:text-gray-200">
											Investimentos
										</Heading>
									</HStack>

									{isLoadingInvestments ? (
										<Text className="mt-4 text-gray-600 dark:text-gray-400">
											Carregando dados de investimentos...
										</Text>
									) : investmentsError ? (
										<Text className="mt-4 text-red-600 dark:text-red-400">{investmentsError}</Text>
									) : investmentSummary.investmentCount === 0 ? (
										<Text className="mt-4 text-gray-700 dark:text-gray-300">
											Nenhum investimento registrado até o momento.
										</Text>
									) : (
										<>
											<Text className="pt-4 text-gray-700 dark:text-gray-300">
												Investimentos ativos:{' '}
												<Text className="text-gray-900 dark:text-gray-100 font-semibold">
													{investmentSummary.investmentCount}
												</Text>
											</Text>
											<Text className="mt-2 text-gray-700 dark:text-gray-300">
												Valor aplicado:{' '}
												<Text className="text-orange-600 dark:text-orange-300 font-semibold">
													{formatCurrencyBRL(investmentSummary.totalInvestedInCents)}
												</Text>
											</Text>
											<Text className="mt-2 text-gray-700 dark:text-gray-300">
												Valor simulado acumulado:{' '}
												<Text className="text-violet-600 dark:text-violet-400 font-semibold">
													{formatCurrencyBRL(investmentSummary.totalSimulatedInCents)}
												</Text>
											</Text>

											<Divider className="my-3 mt-3" />

											{investmentSummary.highlights.length > 0 && (
												<View className="">
													<Text className="text-sm text-gray-500 dark:text-gray-400 mb-2">
														Principais investimentos
													</Text>
													{investmentSummary.highlights.map(item => (
														<View key={item.id} className="py-2 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
															<Text className="font-semibold text-gray-800 dark:text-gray-200">
																{item.name}
															</Text>
															<Text className="text-xs text-gray-500 dark:text-gray-400">
																{getBankName(item.bankId)}
															</Text>
															<HStack className="justify-between items-center mt-1">
																<Text className="text-sm text-gray-700 dark:text-gray-300">
																	Aplicado:{' '}
																	<Text className="font-semibold text-orange-600 dark:text-orange-300">
																		{formatCurrencyBRL(item.appliedValueInCents)}
																	</Text>
																</Text>
																<Text className="text-sm text-gray-700 dark:text-gray-300 text-right">
																	Simulado hoje:{' '}
																	<Text className="font-semibold text-emerald-600 dark:text-emerald-400">
																		{formatCurrencyBRL(item.simulatedValueInCents)}
																	</Text>
																</Text>
															</HStack>
														</View>
													))}
												</View>
											)}

											<Text className="mt-4 text-sm text-gray-500 dark:text-emerald-400">
												Toque para gerenciar a lista completa de investimentos.
											</Text>
										</>
									)}
								</Box>
							</TouchableOpacity>

							<View className="w-full relative">
								{!isChartsExpanded && !isLoadingSummary && (
									<Pressable
										className="absolute inset-0 z-10"
										onPress={() => setIsChartsExpanded(true)}
									/>
								)}
								<Box
									className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 w-full mb-6"						
								>

									<HStack className="justify-between items-center">

										<Heading size="md" className="text-gray-800 dark:text-gray-200">
											Visualização gráfica
										</Heading>

										<TouchableOpacity activeOpacity={0.85} onPress={() => setIsChartsExpanded((prev) => !prev)}>
											<Text className="text-sm text-gray-500 dark:text-emerald-400">
												{isChartsExpanded ? 'Ocultar' : 'Expandir'}
											</Text>
										</TouchableOpacity>

									</HStack>

									{isChartsExpanded ? (
										isLoadingSummary ? (
											<Text className="mt-4 text-gray-600 dark:text-gray-400">Carregando gráficos...</Text>
										) : chartsError ? (
											<Text className="mt-4 text-red-600 dark:text-red-400">{chartsError}</Text>
										) : (
											<>
												<View className="mt-4">
													<HStack className="bg-gray-100 dark:bg-gray-900 rounded-full p-1">
														{[
															{ key: 'bar', label: 'Valores Totais do ano' },
															{ key: 'pie', label: 'Ganhos | Despesas por banco' },
														].map((tab) => {
															const active = chartTab === (tab.key as 'bar' | 'pie');
															return (
																<TouchableOpacity
																	key={tab.key}
																	style={{ flex: 1 }}
																	activeOpacity={0.9}
																	onPress={() => setChartTab(tab.key as 'bar' | 'pie')}
																>
																	<View className={`py-2 rounded-full ${active ? 'bg-white dark:bg-gray-800' : ''}`}>
																		<Text
																			className={`text-center text-sm ${active
																				? 'text-emerald-600 dark:text-emerald-400 font-semibold'
																				: 'text-gray-500'
																				}`}
																		>
																			{tab.label}
																		</Text>
																	</View>
																</TouchableOpacity>
															);
														})}
													</HStack>

													{chartTab === 'bar' ? (
														<View>
															<Text className="mt-4 text-gray-700 dark:text-gray-300 font-semibold">
																Totais por mês ({currentYear})
															</Text>

															<View className="mt-3">
																<BarChart
																	stackData={barChartStackData}
																	height={220}
																	spacing={14}
																	barWidth={16}
																	isAnimated
																	animationDuration={800}
																	yAxisThickness={0}
																	xAxisThickness={0}
																	formatYLabel={formatYAxisLabel}
																	yAxisLabelPrefix="R$ "
																	yAxisTextStyle={{ color: axisColor, fontSize: 10 }}
																	xAxisLabelTextStyle={{ color: axisColor, fontSize: 10 }}
																	showYAxisIndices={false}
																	hideRules={false}
																	noOfSections={4}
																	activeOpacity={1}
																/>
															</View>

															{!hasYearlyActivity && (
																<Text className="mt-2 text-xs text-gray-500 dark:text-gray-400">
																	Ainda não há movimentações registradas neste ano.
																</Text>
															)}

															<HStack className="mt-3 flex-wrap gap-4">
																<View className="flex-row items-center">
																	<View
																		style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: BAR_CHART_COLORS.expenses }}
																	/>
																	<Text className="ml-2 text-sm text-gray-600 dark:text-gray-300">Despesas</Text>
																</View>

																<View className="flex-row items-center">
																	<View
																		style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: BAR_CHART_COLORS.gains }}
																	/>
																	<Text className="ml-2 text-sm text-gray-600 dark:text-gray-300">Ganhos</Text>
																</View>
															</HStack>
														</View>
													) : (
														<View>

															<Text className="mt-4 text-gray-700 dark:text-gray-300 font-semibold">
																Ganhos por banco ({monthLabel})
															</Text>

															{hasGainPieData ? (
																<>
																	<View className="mt-4 items-center">
																		<PieChart data={gainPieChartData} radius={80} showText={false} isAnimated />
																	</View>

																	<View className="mt-4 gap-3">
																		{gainPieLegendData.map((slice) => (
																			<HStack
																				key={slice.key}
																				className="justify-between items-center rounded-lg px-3 py-2"
																				style={{ borderWidth: 1, borderColor: legendBorderColor }}
																			>
																				<HStack className="items-center">
																					<View
																						style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: slice.color }}
																					/>
																					<Text className="ml-2 text-gray-700 dark:text-gray-200">
																						{slice.name}
																					</Text>
																				</HStack>

																				<Text className="text-gray-900 dark:text-gray-100 font-semibold">
																					{formatCurrencyBRL(slice.totalInCents)}
																				</Text>
																			</HStack>
																		))}
																	</View>
																</>
															) : (
																<Text className="mt-3 text-sm text-gray-600 dark:text-gray-400">
																	Ainda não há ganhos registrados neste mês.
																</Text>
															)}

															<Divider className="my-4" />

															<Text className="mt-4 text-gray-700 dark:text-gray-300 font-semibold">
																Despesas por banco ({monthLabel})
															</Text>

															{hasExpensePieData ? (
																<>
																	<View className="mt-4 items-center">
																		<PieChart data={expensePieChartData} radius={80} showText={false} isAnimated />
																	</View>

																	<View className="mt-4 gap-3">
																		{expensePieLegendData.map((slice) => (
																			<HStack
																				key={slice.key}
																				className="justify-between items-center rounded-lg px-3 py-2"
																				style={{ borderWidth: 1, borderColor: legendBorderColor }}
																			>
																				<HStack className="items-center">
																					<View
																						style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: slice.color }}
																					/>
																					<Text className="ml-2 text-gray-700 dark:text-gray-200">
																						{slice.name}
																					</Text>
																				</HStack>

																				<Text className="text-gray-900 dark:text-gray-100 font-semibold">
																					{formatCurrencyBRL(slice.totalInCents)}
																				</Text>
																			</HStack>
																		))}
																	</View>
																</>
															) : (
																<Text className="mt-3 text-sm text-gray-600 dark:text-gray-400">
																	Ainda não há despesas registradas neste mês.
																</Text>
															)}

														</View>
													)}
												</View>
											</>
										)
									) : (
										<Text className="mt-4 text-gray-600 dark:text-gray-400">
											Toque em "Expandir" para visualizar os gráficos anuais e do mês atual.
										</Text>
									)}

								</Box>
							</View>

							{/* Card para mostrar os últimos movimentos de cada banco */}
							<Box
								className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 w-full mb-6"
							>

								<HStack className="justify-between items-center">

									<Heading
										size="md"
										className="text-gray-800 dark:text-gray-200"
									>
										Últimos movimentos
									</Heading>

									<TouchableOpacity
										activeOpacity={0.85}
										onPress={() => setIsMovementsExpanded((prev) => !prev)}
									>
										<Text className="text-sm text-gray-500 dark:text-emerald-400">
											{isMovementsExpanded ? 'Ocultar' : 'Expandir'}
										</Text>
									</TouchableOpacity>

								</HStack>

								{isMovementsExpanded ? (

									isLoadingMovements ? (

										<Text className="mt-4 text-gray-600 dark:text-gray-400">
											Carregando movimentos...
										</Text>

									) : movementsError ? (

										<Text className="mt-4 text-red-600 dark:text-red-400">
											{movementsError}
										</Text>

									) : (

										<>

											<Box className="mt-4">

												<Text className="text-gray-700 dark:text-gray-300 font-semibold">
													Ganhos
												</Text>

												{recentGains.length === 0 ? (

													<Text className="mt-2 text-gray-600 dark:text-gray-400 text-sm">
														Nenhum ganho recente registrado.
													</Text>

												) : (

													recentGains.map((gain, index) => (

														<Box key={gain?.id ?? `gain-${index}`} className="mt-3">

															<HStack className="justify-between items-center">

																<Text className="text-gray-800 dark:text-gray-200">
																	{gain?.name ?? 'Ganho sem nome'}
																</Text>

																<Text className="text-emerald-600 dark:text-emerald-400 font-semibold">
																	{formatCurrencyBRL(gain?.valueInCents ?? 0)}
																</Text>

															</HStack>

															<Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
																{`Banco: ${getBankName(gain?.bankId)}`}
															</Text>

															<Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
																{formatMovementDate(gain?.createdAt ?? gain?.date)}
															</Text>

														</Box>

													))

												)}

											</Box>

											<Divider className="mt-6" />

											<Box className="mt-6">

												<Text className="text-gray-700 dark:text-gray-300 font-semibold">
													Despesas
												</Text>

												{recentExpenses.length === 0 ? (

													<Text className="mt-2 text-gray-600 dark:text-gray-400 text-sm">
														Nenhuma despesa recente registrada.
													</Text>

												) : (

													recentExpenses.map((expense, index) => (

														<Box key={expense?.id ?? `expense-${index}`} className="mt-3">

															<HStack className="justify-between items-center">

																<Text className="text-gray-800 dark:text-gray-200">
																	{expense?.name ?? 'Despesa sem nome'}
																</Text>

																<Text className="text-red-600 dark:text-red-400 font-semibold">
																	{formatCurrencyBRL(expense?.valueInCents ?? 0)}
																</Text>

															</HStack>

															<Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
																{`Banco: ${getBankName(expense?.bankId)}`}
															</Text>

															<Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
																{formatMovementDate(expense?.createdAt ?? expense?.date)}
															</Text>

														</Box>

													))

												)}

											</Box>

										</>

									)
								) : (
									<Text
										className={
											movementsError
												? 'mt-4 text-red-600 dark:text-red-400'
												: 'mt-4 text-gray-600 dark:text-gray-400'
										}
									>
										{movementsError ?? 'Toque em "Expandir" para ver os últimos movimentos.'}
									</Text>
								)}

							</Box>

						</View>

					</VStack>

				</View>
			</ScrollView>
			<FloatingAlertViewport />
		</View>

	);
}
