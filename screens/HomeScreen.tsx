import React from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, TouchableOpacity, View, StatusBar, useWindowDimensions } from 'react-native';
import Carousel, { Pagination, type ICarouselInstance } from 'react-native-reanimated-carousel';
import { useSharedValue } from 'react-native-reanimated';

// Importações relacionadas ao Gluestack UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Divider } from '@/components/ui/divider';
import { Image } from '@/components/ui/image';
import { Button, ButtonText } from '@/components/ui/button';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
} from '@/components/ui/modal';
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
import { getFinanceInvestmentsByPeriodFirebase, getFinanceInvestmentsWithRelationsFirebase } from '@/functions/FinancesFirebase';
import { computeMonthlyBankBalances } from '@/utils/monthlyBalance';

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { VStack } from '@/components/ui/vstack';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';
import { useAppTheme } from '@/contexts/ThemeContext';

import HomeScreenIllustration from '../assets/UnDraw/homeScreen.svg';
import { SvgProps } from 'react-native-svg';
import LoginWallpaper from '@/assets/Background/wallpaper01.jpg';

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
	investedValueInCents: number;
	appliedValueInCents: number;
	simulatedValueInCents: number;
};

type NormalizedInvestmentSummary = {
	id: string;
	name: string;
	initialValueInCents: number;
	currentValueInCents: number;
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

const normalizeHexColor = (value: string | null | undefined) => {
	if (!value) {
		return null;
	}

	const trimmedValue = value.trim();
	if (!trimmedValue) {
		return null;
	}

	const prefixedValue = trimmedValue.startsWith('#') ? trimmedValue : `#${trimmedValue}`;
	const isShortHex = /^#([0-9a-fA-F]{3})$/.test(prefixedValue);
	const isLongHex = /^#([0-9a-fA-F]{6})$/.test(prefixedValue);

	if (isLongHex) {
		return prefixedValue;
	}

	if (!isShortHex) {
		return null;
	}

	const [, shortHex] = prefixedValue.match(/^#([0-9a-fA-F]{3})$/) ?? [];
	if (!shortHex) {
		return null;
	}

	return `#${shortHex
		.split('')
		.map(char => `${char}${char}`)
		.join('')}`;
};

const hexToRgba = (hexColor: string, alpha: number) => {
	const normalizedHex = normalizeHexColor(hexColor);
	if (!normalizedHex) {
		return null;
	}

	const red = Number.parseInt(normalizedHex.slice(1, 3), 16);
	const green = Number.parseInt(normalizedHex.slice(3, 5), 16);
	const blue = Number.parseInt(normalizedHex.slice(5, 7), 16);
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

export default function HomeScreen() {

	const { isDarkMode } = useAppTheme();
	const { width: windowWidth, height: windowHeight } = useWindowDimensions();
	const pageBackground = isDarkMode ? '#0b1220' : '#f4f5f7';
	const surfaceBackground = isDarkMode ? '#020617' : '#ffffff';
	const cardBackground = isDarkMode ? 'bg-slate-950' : 'bg-white';
	const axisColor = isDarkMode ? '#CBD5F5' : '#475569';
	const legendBorderColor = isDarkMode ? '#374151' : '#E5E7EB';
	const currentYear = React.useMemo(() => new Date().getFullYear(), []);
	const bankCarouselRef = React.useRef<ICarouselInstance>(null);
	const bankCarouselProgress = useSharedValue(0);
	const { shouldHideValues } = useValueVisibility();
	const searchParams = useLocalSearchParams<{ balanceReminder?: string | string[] }>();
	const bankCarouselWidth = Math.max(windowWidth - 48, 1);
	const bankCarouselHeight = 176;
	const heroHeight = Math.max(windowHeight * 0.28, 250);

	const [isLoadingSummary, setIsLoadingSummary] = React.useState(false);
	const [summaryError, setSummaryError] = React.useState<string | null>(null);
	const [isBalanceReminderOpen, setIsBalanceReminderOpen] = React.useState(false);
	const [banksMissingBalance, setBanksMissingBalance] = React.useState<Array<{ id: string; name: string }>>([]);

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
	const handleCloseBalanceReminder = React.useCallback(() => {
		setIsBalanceReminderOpen(false);
	}, []);
	const handleOpenBalanceRegistration = React.useCallback(() => {
		setIsBalanceReminderOpen(false);
		router.push('/register-monthly-balance');
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
	const [recentInvestments, setRecentInvestments] = React.useState<any[]>([]);

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
		totalInitialInvestedInCents: number;
		totalSimulatedInCents: number;
		investmentCount: number;
		highlights: InvestmentHighlight[];
	}>({
		totalInvestedInCents: 0,
		totalInitialInvestedInCents: 0,
		totalSimulatedInCents: 0,
		investmentCount: 0,
		highlights: [],
	});
	const [isLoadingInvestments, setIsLoadingInvestments] = React.useState(false);
	const [investmentsError, setInvestmentsError] = React.useState<string | null>(null);

	const currentMonthExpensesByBankId = React.useMemo(
		() =>
			currentMonthExpensesByBank.reduce<Record<string, number>>((acc, item) => {
				if (item.bankId) {
					acc[item.bankId] = item.totalInCents;
				}
				return acc;
			}, {}),
		[currentMonthExpensesByBank],
	);

	const currentMonthGainsByBankId = React.useMemo(
		() =>
			currentMonthGainsByBank.reduce<Record<string, number>>((acc, item) => {
				if (item.bankId) {
					acc[item.bankId] = item.totalInCents;
				}
				return acc;
			}, {}),
		[currentMonthGainsByBank],
	);

	const shouldForceBalanceReminder = React.useMemo(() => {
		const value = Array.isArray(searchParams.balanceReminder)
			? searchParams.balanceReminder[0]
			: searchParams.balanceReminder;
		if (!value) {
			return false;
		}
		const normalized = String(value).toLowerCase();
		return ['1', 'true', 'yes', 'sim'].includes(normalized);
	}, [searchParams.balanceReminder]);

	React.useEffect(() => {
		if (shouldForceBalanceReminder && banksMissingBalance.length > 0) {
			setIsBalanceReminderOpen(true);
		}
	}, [banksMissingBalance, shouldForceBalanceReminder]);

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
		if (typeof investment.currentValueInCents === 'number') {
			return investment.currentValueInCents;
		}
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
				setRecentInvestments([]);
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
						totalInitialInvestedInCents: 0,
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
						let monthlyExpensesData: any[] = [];
						let monthlyGainsData: any[] = [];

						if (expensesSummary.status === 'fulfilled' && expensesSummary.value?.success !== false) {
							monthlyExpensesData = Array.isArray(expensesSummary.value?.data) ? expensesSummary.value.data : [];
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
							monthlyGainsData = Array.isArray(gainsSummary.value?.data) ? gainsSummary.value.data : [];
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
							const currentYearNumber = now.getFullYear();
							const currentMonthNumber = now.getMonth() + 1;
							const startOfMonth = new Date(currentYearNumber, currentMonthNumber - 1, 1);
							const endOfMonth = new Date(currentYearNumber, currentMonthNumber, 0, 23, 59, 59, 999);
							const banksResult = await getBanksWithUsersByPersonFirebase(currentUser.uid);

							if (banksResult?.success && Array.isArray(banksResult.data)) {
								const banksArray: any[] = Array.isArray(banksResult.data) ? banksResult.data : [];

								const [balancesResult, investmentsResult] = await Promise.all([
									Promise.all(
										banksArray.map(async (bank: any) => {
											const bankId = typeof bank?.id === 'string' ? bank.id : '';

											if (!bankId) {
												return { bankId, valueInCents: null };
											}

											const balanceResponse = await getMonthlyBalanceFirebaseRelatedToUser({
												personId: currentUser.uid,
												bankId,
												year: currentYearNumber,
												month: currentMonthNumber,
											});

											if (
												balanceResponse?.success &&
												balanceResponse.data &&
												typeof balanceResponse.data.valueInCents === 'number'
											) {
												return { bankId, valueInCents: balanceResponse.data.valueInCents };
											}

											return { bankId, valueInCents: null };
										}),
									),
									Promise.all(
										banksArray.map(async (bank: any) => {
											const bankId = typeof bank?.id === 'string' ? bank.id : '';

											if (!bankId) {
												return { bankId, investments: [] as any[] };
											}

											const investmentsResponse = await getFinanceInvestmentsByPeriodFirebase({
												personId: currentUser.uid,
												bankId,
												startDate: startOfMonth,
												endDate: endOfMonth,
											});

											const investments =
												investmentsResponse?.success && Array.isArray(investmentsResponse.data)
													? investmentsResponse.data
													: [];

											return { bankId, investments };
										}),
									),
								]);

								const initialBalancesByBank = balancesResult.reduce<Record<string, number | null>>((acc, item) => {
									if (item.bankId) {
										acc[item.bankId] = typeof item.valueInCents === 'number' ? item.valueInCents : null;
									}
									return acc;
								}, {});

								const investmentsByBank = investmentsResult.reduce<Record<string, any[]>>((acc, item) => {
									if (item.bankId) {
										const normalized =
											Array.isArray(item.investments)
												? item.investments.map((inv: any) => ({
													...inv,
													initialValueInCents:
														typeof inv?.initialValueInCents === 'number'
															? inv.initialValueInCents
															: typeof inv?.initialInvestedInCents === 'number'
																? inv.initialInvestedInCents
																: undefined,
													initialInvestedInCents:
														typeof inv?.initialInvestedInCents === 'number'
															? inv.initialInvestedInCents
															: undefined,
													currentValueInCents:
														typeof inv?.currentValueInCents === 'number'
															? inv.currentValueInCents
															: typeof inv?.lastManualSyncValueInCents === 'number'
																? inv.lastManualSyncValueInCents
																: typeof inv?.initialValueInCents === 'number'
																	? inv.initialValueInCents
																	: undefined,
												}))
												: [];
										acc[item.bankId] = normalized;
									}
									return acc;
								}, {});

								const bankSummaries = computeMonthlyBankBalances({
									banks: banksArray
										.map((bank: any) => ({
											id: typeof bank?.id === 'string' ? bank.id : '',
											name:
												typeof bank?.name === 'string' && bank.name.trim().length > 0
													? bank.name.trim()
													: 'Banco sem nome',
											colorHex:
												typeof bank?.colorHex === 'string' && bank.colorHex.trim().length > 0
													? bank.colorHex.trim()
													: null,
										}))
										.filter((bank: { id: string }) => bank.id),
									initialBalancesByBank,
									expenses: monthlyExpensesData,
									gains: monthlyGainsData,
									investmentsByBank,
								});

								const balancesPayload = bankSummaries.map(bank => ({
									id: bank.id,
									name: bank.name,
									balanceInCents: bank.currentBalanceInCents,
								}));

								if (isMounted) {
									setBankBalances(balancesPayload);

									const banksNeedingBalance = banksArray
										.map((bank: any) => ({
											id: typeof bank?.id === 'string' ? bank.id : '',
											name:
												typeof bank?.name === 'string' && bank.name.trim().length > 0
													? bank.name.trim()
													: 'Banco sem nome',
										}))
										.filter(
											(bank: { id: string }) =>
												bank.id &&
												(initialBalancesByBank[bank.id] === null ||
													initialBalancesByBank[bank.id] === undefined),
										);

									setBanksMissingBalance(banksNeedingBalance);

								}
							} else {
								setBankBalances([]);
								setBanksMissingBalance([]);
							}
						} catch (error) {
							console.error('Erro ao carregar saldos de bancos:', error);
							setBankBalances([]);
							setBanksMissingBalance([]);
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

						const [expensesResult, gainsResult, banksResult, investmentsResult] = await Promise.all([
							getLimitedExpensesWithPeopleFirebase({ limit: 3, personId: currentUser.uid }),
							getLimitedGainsWithPeopleFirebase({ limit: 3, personId: currentUser.uid }),
							getBanksWithUsersByPersonFirebase(currentUser.uid),
							getFinanceInvestmentsWithRelationsFirebase(currentUser.uid),
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

						if (investmentsResult?.success && Array.isArray(investmentsResult.data)) {
							const normalizedInvestments = (investmentsResult.data as any[]).map(investment => {
								const id =
									typeof investment?.id === 'string'
										? investment.id
										: `investment-${Math.random().toString(36).slice(2)}`;
								const name =
									typeof investment?.name === 'string' && investment.name.trim().length > 0
										? investment.name.trim()
										: 'Investimento';
								const initialValue =
									typeof investment?.initialValueInCents === 'number'
										? investment.initialValueInCents
										: typeof investment?.initialInvestedInCents === 'number'
											? investment.initialInvestedInCents
											: 0;
								const syncedValue =
									typeof investment?.currentValueInCents === 'number'
										? investment.currentValueInCents
										: typeof investment?.lastManualSyncValueInCents === 'number'
											? investment.lastManualSyncValueInCents
											: initialValue;

								const createdAt = parseToDate(
									investment?.date ??
									investment?.createdAt ??
									investment?.createdAtISO ??
									investment?.createdAtUtc,
								);

								return {
									id,
									name,
									valueInCents: syncedValue,
									bankId: typeof investment?.bankId === 'string' ? investment.bankId : null,
									createdAt,
								};
							});

							const sortedInvestments = normalizedInvestments
								.slice()
								.sort((a, b) => {
									const timeA = a.createdAt ? a.createdAt.getTime() : 0;
									const timeB = b.createdAt ? b.createdAt.getTime() : 0;
									return timeB - timeA;
								})
								.slice(0, 3);

							setRecentInvestments(sortedInvestments);
						} else {
							setRecentInvestments([]);
							hasIssues = true;
						}

					} catch (error) {
						console.error('Erro ao carregar os últimos movimentos:', error);

						if (isMounted) {
							setMovementsError('Erro ao carregar os últimos movimentos.');
							setRecentExpenses([]);
							setRecentGains([]);
							setRecentInvestments([]);
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
								totalInitialInvestedInCents: 0,
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
									: typeof investment.initialInvestedInCents === 'number'
										? investment.initialInvestedInCents
										: 0;
							const currentValueInCents =
								typeof investment.currentValueInCents === 'number'
									? investment.currentValueInCents
									: typeof investment.lastManualSyncValueInCents === 'number'
										? investment.lastManualSyncValueInCents
										: initialValueInCents;
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
								currentValueInCents,
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
							(acc, investment) => acc + resolveInvestmentBaseValueInCents(investment),
							0,
						);
						const totalInitialInvestedInCents = normalizedInvestments.reduce(
							(acc, investment) => acc + investment.initialValueInCents,
							0,
						);

						const simulatedInvestments = normalizedInvestments.map(investment => ({
							...investment,
							investedValueInCents: investment.initialValueInCents,
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
								investedValueInCents: item.investedValueInCents,
								appliedValueInCents: item.appliedValueInCents,
								simulatedValueInCents: item.simulatedValueInCents,
							}));

						setInvestmentSummary({
							totalInvestedInCents,
							totalInitialInvestedInCents,
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
								totalInitialInvestedInCents: 0,
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
		<View className="flex-1" style={{ backgroundColor: pageBackground }}>
			<StatusBar
				translucent
				backgroundColor="transparent"
				barStyle={isDarkMode ? 'light-content' : 'dark-content'}
			/>

			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<View
					className={`absolute top-0 left-0 right-0 ${cardBackground}`}
					style={{ height: heroHeight }}
				>
					<Image
						source={LoginWallpaper}
						alt="Background da tela inicial"
						className="w-full h-full rounded-b-3xl absolute"
						resizeMode="cover"
					/>

					<VStack className="w-full h-full items-center justify-start px-6 pt-10 gap-4">
						<Heading size="xl" className="text-white text-center">
							Olá, {auth.currentUser?.displayName?.split(' ')[0] ?? 'Usuário'}! Esse é seu resumo financeiro.
						</Heading>
						<HomeScreenIllustration
							width="40%"
							height="40%"
							className="opacity-90"
						/>
					</VStack>
				</View>

				<View
					className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pt-10 pb-6`}
					style={{ marginTop: heroHeight - 64 }}
				>
					<View className="flex-1 w-full">

						<ScrollView
							className="flex-1"
							contentContainerStyle={{ paddingBottom: 24 }}
							showsVerticalScrollIndicator={false}
						>
							{/* Bank Carousel */}
							<View className="mb-6">
								<Heading size="lg" className="mb-4">
									Meus Bancos
								</Heading>

								{bankBalances.length > 0 ? (
									<View>
										<Carousel
											ref={bankCarouselRef}
											width={bankCarouselWidth}
											height={bankCarouselHeight}
											data={bankBalances}
											loop={bankBalances.length > 1}
											enabled={bankBalances.length > 1}
											pagingEnabled
											snapEnabled
											onProgressChange={bankCarouselProgress}
											renderItem={({ item }) => {
												const monthlyExpenseInCents = currentMonthExpensesByBankId[item.id] ?? 0;
												const monthlyGainInCents = currentMonthGainsByBankId[item.id] ?? 0;
												const bankAccentColor = normalizeHexColor(bankColorsById[item.id]);
												const cardBackgroundColor = bankAccentColor
													? isDarkMode
														? hexToRgba(bankAccentColor, 0.42) ?? '#1e293b'
														: hexToRgba(bankAccentColor, 0.24) ?? '#f8fafc'
													: isDarkMode
														? '#172033'
														: '#ffffff';
												const borderColor =
													hexToRgba(bankAccentColor ?? '', isDarkMode ? 0.45 : 0.22) ??
													(isDarkMode ? 'rgba(148, 163, 184, 0.20)' : 'rgba(148, 163, 184, 0.24)');

												return (
													<View
														style={{
															flex: 1,
															marginHorizontal: 8,
															paddingHorizontal: 16,
															paddingVertical: 16,
															borderRadius: 16,
															borderWidth: 1,
															backgroundColor: cardBackgroundColor,
															borderColor,
															overflow: 'hidden',
															justifyContent: 'space-between',
														}}
													>
														<VStack className="gap-1">
															<Text className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
																Banco
															</Text>
															<Heading size="lg" className="text-slate-900 dark:text-white">
																{item.name}
															</Heading>
														</VStack>

														<VStack className="gap-1 mt-4">
															<Text className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
																Saldo atual
															</Text>
															<Heading size="md" className="text-slate-900 dark:text-white">
																{item.balanceInCents === null
																	? 'Saldo indisponível'
																	: formatCurrencyBRL(item.balanceInCents)}
															</Heading>
															{item.balanceInCents === null ? (
																<Text className="text-yellow-600 dark:text-yellow-400 text-xs">
																	Sem saldo registrado para este mes.
																</Text>
															) : null}
														</VStack>

														<HStack className="mt-4 justify-between items-end gap-4">
															<VStack className="flex-1 gap-1">
																<Text className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
																	Gastos
																</Text>
																<Text className="text-red-600 dark:text-red-400 font-semibold">
																	{formatCurrencyBRL(monthlyExpenseInCents)}
																</Text>
															</VStack>

															<VStack className="flex-1 gap-1 items-end">
																<Text className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
																	Ganhos
																</Text>
																<Text className="text-emerald-600 dark:text-emerald-400 font-semibold">
																	{formatCurrencyBRL(monthlyGainInCents)}
																</Text>
															</VStack>
														</HStack>
													</View>
												);
											}}
										/>

										<Pagination.Basic
											progress={bankCarouselProgress}
											data={bankBalances}
											onPress={(index) =>
												bankCarouselRef.current?.scrollTo({ index, animated: true })
											}
											dotStyle={{
												backgroundColor: isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.18)',
												borderRadius: 50,
											}}
											activeDotStyle={{
												backgroundColor: isDarkMode ? '#ffffff' : '#0f172a',
											}}
											containerStyle={{ gap: 5, marginTop: 10 }}
										/>
									</View>
								) : (
									<Text className="text-slate-500 dark:text-slate-400">
										Nenhum banco registrado
									</Text>
								)}
							</View>
						</ScrollView>

					</View>

				</View>
			</View>
		</View>
	);
}
