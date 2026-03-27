import React from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
	ScrollView,
	View,
	StatusBar,
	TouchableOpacity,
	Image as RNImage,
	StyleSheet,
	useWindowDimensions,
	Pressable,
	type GestureResponderEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Carousel, { Pagination, type ICarouselInstance } from 'react-native-reanimated-carousel';
import { useSharedValue } from 'react-native-reanimated';

// Importações relacionadas ao Gluestack UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Badge, BadgeText } from '@/components/ui/badge';
import { HStack } from '@/components/ui/hstack';
import { Divider } from '@/components/ui/divider';
import { Image } from '@/components/ui/image';
import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';
import { getMonthlyBalanceFirebaseRelatedToUser } from '@/functions/MonthlyBalanceFirebase';

import { auth } from '@/FirebaseConfig';
import {
	getCurrentMonthSummaryByBankFirebaseExpanses,
	getCurrentMonthSummaryByBankFirebaseGains,
	getBanksWithUsersByPersonFirebase,
	getCurrentYearMovementsFirebase,
} from '@/functions/BankFirebase';
import { getLimitedExpensesWithPeopleFirebase } from '@/functions/ExpenseFirebase';
import { getLimitedGainsWithPeopleFirebase } from '@/functions/GainFirebase';
import { getFinanceInvestmentsByPeriodFirebase, getFinanceInvestmentsWithRelationsFirebase } from '@/functions/FinancesFirebase';
import { computeMonthlyBankBalances } from '@/utils/monthlyBalance';
import Navigator from '@/components/uiverse/navigator';

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { VStack } from '@/components/ui/vstack';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';
import { useAppTheme } from '@/contexts/ThemeContext';

import HomeScreenIllustration from '../assets/UnDraw/homeScreen.svg';
import Svg, {
	Circle,
	Defs,
	LinearGradient as SvgLinearGradient,
	Polygon,
	RadialGradient as SvgRadialGradient,
	Rect,
	Stop,
} from 'react-native-svg';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';

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

type HomeInvestmentItem = {
	id: string;
	name: string;
	bankId: string | null;
	bankNameSnapshot: string | null;
	initialValueInCents: number;
	currentBaseValueInCents: number;
	simulatedValueInCents: number;
	estimatedGainInCents: number;
	cdiPercentage: number;
	lastManualSyncValueInCents: number | null;
	lastManualSyncAt: Date | null;
	createdAt: Date | null;
};

type HomeInvestmentPortfolio = {
	items: HomeInvestmentItem[];
	totalCurrentBaseInCents: number;
	totalInitialInCents: number;
	totalSimulatedInCents: number;
	totalEstimatedGainInCents: number;
	investmentCount: number;
};

type NormalizedInvestmentSummary = {
	id: string;
	name: string;
	initialValueInCents: number;
	currentValueInCents: number;
	cdiPercentage: number;
	bankId: string | null;
	bankNameSnapshot: string | null;
	lastManualSyncValueInCents: number | null;
	lastManualSyncAt: Date | null;
	createdAt: Date | null;
};

type HomeTimelineMovement = {
	id: string;
	type: 'expense' | 'gain';
	name: string;
	valueInCents: number;
	date: Date | null;
	bankId: string | null;
	bankName: string | null;
	personName: string | null;
	explanation: string | null;
	moneyFormat: boolean | null;
	isBankTransfer: boolean;
	bankTransferDirection: 'incoming' | 'outgoing' | null;
	bankTransferSourceBankNameSnapshot: string | null;
	bankTransferTargetBankNameSnapshot: string | null;
	isInvestmentDeposit: boolean;
	isInvestmentRedemption: boolean;
	investmentNameSnapshot: string | null;
};

type HomeTimelineStatus = {
	title: string;
	subtitle: string;
	status: string;
	renderContent?: React.ReactNode;
	movement: HomeTimelineMovement;
};

type HomeBankBalanceCard = {
	id: string;
	name: string;
	balanceInCents: number | null;
	colorHex: string | null;
};

type BankCardPalette = {
	baseColor: string;
	glowColor: string;
	highlightColor: string;
	textPrimary: string;
	textSecondary: string;
	expenseColor: string;
	gainColor: string;
	shadowColor: string;
};

type TimelineMovementCardPalette = {
	baseColor: string;
	gradientEndColor: string;
	overlayColor: string;
	labelColor: string;
	bodyColor: string;
	amountColor: string;
	shadowColor: string;
};

const DAYS_IN_YEAR = 365;
const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;
const BASE_CDI_ANNUAL_RATE = 0.1375;
const TIMELINE_CHEVRON_DOWN = require('react-native-vertical-status-progress/lib/commonjs/assets/chevron-down.png');
const TIMELINE_CHEVRON_UP = require('react-native-vertical-status-progress/lib/commonjs/assets/chevron-up.png');

const BAR_CHART_COLORS = {
	expenses: '#F97316',
	gains: '#10B981',
};

const PIE_COLOR_PALETTE = ['#6366F1', '#F97316', '#22D3EE', '#F43F5E', '#10B981', '#FACC15', '#A855F7', '#0EA5E9'];
const INVESTMENT_PIE_COLOR_PALETTE = ['#FACC15', '#F59E0B', '#FDE047', '#EAB308', '#FBBF24', '#CA8A04', '#FCD34D', '#D97706'];
const INVESTMENT_CHART_INITIAL_ANGLE = -Math.PI / 2;
const INVESTMENT_CHART_PADDING_HORIZONTAL = 28;
const INVESTMENT_CHART_PADDING_VERTICAL = 12;
const INVESTMENT_CHART_TOUCH_OUTER_TOLERANCE = 8;
const INVESTMENT_CHART_TOUCH_INNER_TOLERANCE = 6;

const createEmptyYearlyStats = (): YearlyMonthStats[] =>
	Array.from({ length: 12 }, (_, monthIndex) => ({
		monthIndex,
		expensesInCents: 0,
		gainsInCents: 0,
	}));

const createEmptyInvestmentPortfolio = (): HomeInvestmentPortfolio => ({
	items: [],
	totalCurrentBaseInCents: 0,
	totalInitialInCents: 0,
	totalSimulatedInCents: 0,
	totalEstimatedGainInCents: 0,
	investmentCount: 0,
});

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

const hexToRgb = (hexColor: string) => {
	const normalizedHex = normalizeHexColor(hexColor);
	if (!normalizedHex) {
		return null;
	}

	return {
		red: Number.parseInt(normalizedHex.slice(1, 3), 16),
		green: Number.parseInt(normalizedHex.slice(3, 5), 16),
		blue: Number.parseInt(normalizedHex.slice(5, 7), 16),
	};
};

const rgbToHex = (red: number, green: number, blue: number) =>
	`#${[red, green, blue]
		.map(value => Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, '0'))
		.join('')}`;

const mixHexColors = (sourceHex: string, targetHex: string, weight: number) => {
	const source = hexToRgb(sourceHex);
	const target = hexToRgb(targetHex);
	if (!source || !target) {
		return null;
	}

	const safeWeight = Math.min(1, Math.max(0, weight));

	return rgbToHex(
		source.red + (target.red - source.red) * safeWeight,
		source.green + (target.green - source.green) * safeWeight,
		source.blue + (target.blue - source.blue) * safeWeight,
	);
};

const getRelativeLuminance = (hexColor: string) => {
	const rgb = hexToRgb(hexColor);
	if (!rgb) {
		return 0;
	}

	const toLinear = (channel: number) => {
		const normalizedChannel = channel / 255;
		return normalizedChannel <= 0.03928
			? normalizedChannel / 12.92
			: ((normalizedChannel + 0.055) / 1.055) ** 2.4;
	};

	return (
		0.2126 * toLinear(rgb.red) +
		0.7152 * toLinear(rgb.green) +
		0.0722 * toLinear(rgb.blue)
	);
};

const buildBankCardPalette = (colorHex: string | null | undefined, isDarkMode: boolean): BankCardPalette => {
	const accentColor = normalizeHexColor(colorHex) ?? (isDarkMode ? '#1D4ED8' : '#7C3AED');
	const baseColor =
		mixHexColors(accentColor, isDarkMode ? '#020617' : '#0F172A', isDarkMode ? 0.58 : 0.5) ??
		(isDarkMode ? '#172033' : '#1E293B');
	const glowColor = mixHexColors(accentColor, '#FFFFFF', isDarkMode ? 0.22 : 0.3) ?? accentColor;
	const highlightColor = mixHexColors(accentColor, '#FDE68A', 0.38) ?? glowColor;
	const textPrimary = getRelativeLuminance(baseColor) > 0.45 ? '#0F172A' : '#FFFFFF';
	const textSecondary = textPrimary === '#FFFFFF' ? 'rgba(255,255,255,0.72)' : 'rgba(15,23,42,0.72)';
	const expenseColor = '#FFFFFF';
	const gainColor = '#FFFFFF';

	return {
		baseColor,
		glowColor,
		highlightColor,
		textPrimary,
		textSecondary,
		expenseColor,
		gainColor,
		shadowColor: hexToRgba(accentColor, isDarkMode ? 0.38 : 0.28) ?? accentColor,
	};
};

const resolveTimelineAccentColor = (movement: HomeTimelineMovement) => {
	if (movement.isBankTransfer) {
		return '#F59E0B';
	}

	return movement.type === 'expense' ? '#DC2626' : '#10B981';
};

const buildTimelineMovementCardPalette = (
	movement: HomeTimelineMovement,
	isDarkMode: boolean,
): TimelineMovementCardPalette => {
	const accentColor = resolveTimelineAccentColor(movement);
	const tone = movement.isBankTransfer
		? {
			baseColor: '#B88A4A',
			gradientEndColor: '#FFD166',
			overlayColor: '#FFF0A6',
		}
		: movement.type === 'expense'
			? {
				baseColor: '#C96B72',
				gradientEndColor: '#FF9AA2',
				overlayColor: '#FFD1DC',
			}
			: {
				baseColor: '#77AA77',
				gradientEndColor: '#44FFDD',
				overlayColor: '#CCFF88',
			};

	return {
		baseColor: isDarkMode ? mixHexColors(tone.baseColor, '#0F172A', 0.34) ?? tone.baseColor : tone.baseColor,
		gradientEndColor: isDarkMode
			? mixHexColors(tone.gradientEndColor, '#0F172A', 0.16) ?? tone.gradientEndColor
			: tone.gradientEndColor,
		overlayColor: isDarkMode ? mixHexColors(tone.overlayColor, '#FFFFFF', 0.08) ?? tone.overlayColor : tone.overlayColor,
		labelColor: 'rgba(255,255,255,0.82)',
		bodyColor: 'rgba(255,255,255,0.94)',
		amountColor: '#FFFFFF',
		shadowColor: hexToRgba(accentColor, isDarkMode ? 0.42 : 0.18) ?? accentColor,
	};
};

const BankCardPattern = React.memo(({ palette }: { palette: BankCardPalette }) => {
	const rawGradientId = React.useId();
	const rawGlowId = React.useId();
	const gradientId = React.useMemo(
		() => `bank-card-gradient-${rawGradientId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
		[rawGradientId],
	);
	const glowId = React.useMemo(
		() => `bank-card-glow-${rawGlowId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
		[rawGlowId],
	);

	return (
		<View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
			<Svg width="100%" height="100%" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice">
				<Defs>
					<SvgRadialGradient id={gradientId} cx="396" cy="281" r="514" gradientUnits="userSpaceOnUse">
						<Stop offset="0" stopColor={palette.glowColor} />
						<Stop offset="1" stopColor={palette.baseColor} />
					</SvgRadialGradient>

					<SvgLinearGradient id={glowId} x1="400" y1="148" x2="400" y2="333" gradientUnits="userSpaceOnUse">
						<Stop offset="0" stopColor={palette.highlightColor} stopOpacity={0} />
						<Stop offset="1" stopColor={palette.highlightColor} stopOpacity={0.52} />
					</SvgLinearGradient>
				</Defs>

				<Rect width="800" height="400" fill={palette.baseColor} />
				<Rect width="800" height="400" fill={`url(#${gradientId})`} />
				<Circle fill={`url(#${glowId})`} fillOpacity={0.42} cx="267.5" cy="61" r="300" />
				<Circle fill={`url(#${glowId})`} fillOpacity={0.42} cx="532.5" cy="61" r="300" />
				<Circle fill={`url(#${glowId})`} fillOpacity={0.42} cx="400" cy="30" r="300" />
				<Rect width="800" height="400" fill="rgba(255,255,255,0.04)" />
			</Svg>
		</View>
	);
});

const TimelineMovementCardPattern = React.memo(({ palette }: { palette: TimelineMovementCardPalette }) => {
	const rawBackgroundGradientId = React.useId();
	const rawLeftOverlayId = React.useId();
	const rawRightOverlayId = React.useId();
	const backgroundGradientId = React.useMemo(
		() => `timeline-card-background-${rawBackgroundGradientId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
		[rawBackgroundGradientId],
	);
	const leftOverlayId = React.useMemo(
		() => `timeline-card-left-overlay-${rawLeftOverlayId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
		[rawLeftOverlayId],
	);
	const rightOverlayId = React.useMemo(
		() => `timeline-card-right-overlay-${rawRightOverlayId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
		[rawRightOverlayId],
	);

	return (
		<View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
			<Svg width="100%" height="100%" viewBox="0 0 800 320" preserveAspectRatio="xMidYMid slice">
				<Defs>
					<SvgLinearGradient id={backgroundGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
						<Stop offset="0" stopColor={palette.baseColor} />
						<Stop offset="1" stopColor={palette.gradientEndColor} />
					</SvgLinearGradient>

					<SvgLinearGradient id={leftOverlayId} x1="0%" y1="0%" x2="0%" y2="100%">
						<Stop offset="0" stopColor={palette.overlayColor} stopOpacity={0} />
						<Stop offset="1" stopColor={palette.overlayColor} stopOpacity={1} />
					</SvgLinearGradient>

					<SvgLinearGradient id={rightOverlayId} x1="0%" y1="0%" x2="100%" y2="100%">
						<Stop offset="0" stopColor={palette.overlayColor} stopOpacity={0} />
						<Stop offset="1" stopColor={palette.overlayColor} stopOpacity={1} />
					</SvgLinearGradient>
				</Defs>

				<Rect width="800" height="320" fill={palette.baseColor} />
				<Rect width="800" height="320" fill={`url(#${backgroundGradientId})`} />
				<Polygon fill={`url(#${leftOverlayId})`} fillOpacity={0.38} points="0,320 0,0 800,0" />
				<Polygon fill={`url(#${rightOverlayId})`} fillOpacity={0.38} points="800,320 800,0 0,0" />
			</Svg>
		</View>
	);
});

const normalizeTransferDirection = (value: unknown): 'incoming' | 'outgoing' | null => {
	if (value === 'incoming' || value === 'outgoing') {
		return value;
	}

	return null;
};

export default function HomeScreen() {

	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { width: windowWidth, height: windowHeight } = useWindowDimensions();
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
	const bankCarouselItemSpacing = 16;
	const heroHeight = Math.max(windowHeight * 0.28, 250) + insets.top;

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
	const handleToggleMovements = React.useCallback(() => {
		setIsMovementsExpanded(prev => {
			const nextValue = !prev;

			if (!nextValue) {
				setExpandedTimelineStatuses([]);
			}

			return nextValue;
		});
	}, []);
	const handleToggleTimelineStatus = React.useCallback((statusId: string) => {
		setExpandedTimelineStatuses(prev =>
			prev.includes(statusId) ? prev.filter(id => id !== statusId) : [...prev, statusId],
		);
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
	const [bankBalances, setBankBalances] = React.useState<HomeBankBalanceCard[]>([]);

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
	const [isMovementsExpanded, setIsMovementsExpanded] = React.useState(true);
	const [expandedTimelineStatuses, setExpandedTimelineStatuses] = React.useState<string[]>([]);

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

	const [investmentPortfolio, setInvestmentPortfolio] = React.useState<HomeInvestmentPortfolio>(() =>
		createEmptyInvestmentPortfolio(),
	);
	const [selectedInvestmentPopoverTarget, setSelectedInvestmentPopoverTarget] = React.useState<{
		investmentId: string;
		anchorX: number;
		anchorY: number;
	} | null>(null);
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

	const investmentPalette = React.useMemo(
		() => ({
			title: isDarkMode ? '#F8FAFC' : '#0F172A',
			subtitle: isDarkMode ? '#94A3B8' : '#64748B',
			chartCenterBackground: isDarkMode ? '#081120' : '#FFFFFF',
			simulatedColor: isDarkMode ? '#34D399' : '#059669',
		}),
		[isDarkMode],
	);

	const investmentCountLabel = investmentPortfolio.investmentCount === 1 ? 'investimento' : 'investimentos';
	const investmentDistributionItems = React.useMemo(
		() =>
			[...investmentPortfolio.items]
				.filter(investment => investment.currentBaseValueInCents > 0)
				.sort((left, right) => right.currentBaseValueInCents - left.currentBaseValueInCents),
		[investmentPortfolio.items],
	);
	const investmentChartRadius = React.useMemo(
		() => Math.max(92, Math.min(124, (windowWidth - 112) / 2)),
		[windowWidth],
	);
	const investmentChartInnerRadius = React.useMemo(
		() => Math.max(58, investmentChartRadius - 36),
		[investmentChartRadius],
	);
	const investmentChartWidth = React.useMemo(
		() => investmentChartRadius * 2 + INVESTMENT_CHART_PADDING_HORIZONTAL,
		[investmentChartRadius],
	);
	const investmentChartHeight = React.useMemo(
		() => investmentChartRadius * 2 + INVESTMENT_CHART_PADDING_VERTICAL,
		[investmentChartRadius],
	);
	const investmentDistributionTotalInCents = React.useMemo(
		() =>
			investmentDistributionItems.reduce(
				(accumulator, investment) => accumulator + investment.currentBaseValueInCents,
				0,
			),
		[investmentDistributionItems],
	);
	const investmentDonutChartData = React.useMemo(
		() =>
			investmentDistributionItems.map((investment, index) => {
				const color = INVESTMENT_PIE_COLOR_PALETTE[index % INVESTMENT_PIE_COLOR_PALETTE.length];
				return {
					value: Number((investment.currentBaseValueInCents / 100).toFixed(2)),
					color,
					gradientCenterColor:
						mixHexColors(color, investmentPalette.chartCenterBackground, isDarkMode ? 0.2 : 0.5) ?? color,
					strokeColor: surfaceBackground,
					strokeWidth: 6,
					text: investment.name,
				};
			}),
		[
			investmentDistributionItems,
			investmentPalette.chartCenterBackground,
			isDarkMode,
			surfaceBackground,
		],
	);
	const hasInvestmentDonutData = investmentDonutChartData.length > 0;
	const selectedInvestmentPopoverInvestment = React.useMemo(() => {
		if (!selectedInvestmentPopoverTarget) {
			return null;
		}

		return (
			investmentDistributionItems.find(
				investment => investment.id === selectedInvestmentPopoverTarget.investmentId,
			) ?? null
		);
	}, [investmentDistributionItems, selectedInvestmentPopoverTarget]);
	const selectedInvestmentPopoverColor = React.useMemo(() => {
		if (!selectedInvestmentPopoverInvestment) {
			return null;
		}

		const selectedIndex = investmentDistributionItems.findIndex(
			investment => investment.id === selectedInvestmentPopoverInvestment.id,
		);
		if (selectedIndex < 0) {
			return null;
		}

		return INVESTMENT_PIE_COLOR_PALETTE[selectedIndex % INVESTMENT_PIE_COLOR_PALETTE.length];
	}, [investmentDistributionItems, selectedInvestmentPopoverInvestment]);
	const selectedInvestmentPopoverPalette = React.useMemo(() => {
		const accentColor = selectedInvestmentPopoverColor ?? INVESTMENT_PIE_COLOR_PALETTE[0];
		const backgroundColor = accentColor;
		const borderColor = accentColor;
		const textPrimary = '#FFFFFF';
		const textSecondary = 'rgba(255,255,255,0.78)';

		return {
			backgroundColor,
			borderColor,
			textPrimary,
			textSecondary,
			shadowColor: hexToRgba(accentColor, isDarkMode ? 0.38 : 0.22) ?? accentColor,
		};
	}, [isDarkMode, selectedInvestmentPopoverColor]);

	React.useEffect(() => {
		if (!selectedInvestmentPopoverTarget) {
			return;
		}

		const stillExists = investmentDistributionItems.some(
			investment => investment.id === selectedInvestmentPopoverTarget.investmentId,
		);
		if (!stillExists) {
			setSelectedInvestmentPopoverTarget(null);
		}
	}, [investmentDistributionItems, selectedInvestmentPopoverTarget]);

	const handleDismissInvestmentPopover = React.useCallback(() => {
		setSelectedInvestmentPopoverTarget(null);
	}, []);

	const handlePressInvestmentChart = React.useCallback(
		(event: GestureResponderEvent) => {
			if (investmentDistributionItems.length === 0 || investmentDistributionTotalInCents <= 0) {
				return;
			}

			const centerX = investmentChartWidth / 2;
			const centerY = investmentChartHeight / 2;
			const locationX = event.nativeEvent.locationX;
			const locationY = event.nativeEvent.locationY;
			const deltaX = locationX - centerX;
			const deltaY = locationY - centerY;
			const distanceFromCenter = Math.sqrt(deltaX ** 2 + deltaY ** 2);

			if (
				distanceFromCenter > investmentChartRadius + INVESTMENT_CHART_TOUCH_OUTER_TOLERANCE ||
				distanceFromCenter < Math.max(investmentChartInnerRadius - INVESTMENT_CHART_TOUCH_INNER_TOLERANCE, 0)
			) {
				return;
			}

			const fullCircle = Math.PI * 2;
			const normalizedStartAngle =
				((INVESTMENT_CHART_INITIAL_ANGLE % fullCircle) + fullCircle) % fullCircle;
			const touchAngle = ((Math.atan2(deltaX, -deltaY) % fullCircle) + fullCircle) % fullCircle;
			const relativeAngle = (touchAngle - normalizedStartAngle + fullCircle) % fullCircle;

			let cumulativeAngle = 0;
			let selectedInvestment = investmentDistributionItems[investmentDistributionItems.length - 1] ?? null;

			for (const investment of investmentDistributionItems) {
				const sliceAngle = (investment.currentBaseValueInCents / investmentDistributionTotalInCents) * fullCircle;
				if (relativeAngle <= cumulativeAngle + sliceAngle) {
					selectedInvestment = investment;
					break;
				}
				cumulativeAngle += sliceAngle;
			}

			if (!selectedInvestment) {
				return;
			}

			setSelectedInvestmentPopoverTarget({
				investmentId: selectedInvestment.id,
				anchorX: locationX,
				anchorY: locationY,
			});
		},
		[
			investmentChartHeight,
			investmentChartInnerRadius,
			investmentChartRadius,
			investmentChartWidth,
			investmentDistributionItems,
			investmentDistributionTotalInCents,
		],
	);

	const timelinePalette = React.useMemo(
		() => ({
			title: isDarkMode ? '#F8FAFC' : '#0F172A',
			subtitle: isDarkMode ? '#94A3B8' : '#64748B',
			cardBackground: isDarkMode ? '#0F172A' : '#FFFFFF',
			cardBorder: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(226, 232, 240, 1)',
			mutedSurface: isDarkMode ? '#111827' : '#F8FAFC',
			emptySurface: isDarkMode ? '#020617' : '#F8FAFC',
			timelineBase: isDarkMode ? '#243041' : '#CBD5E1',
		}),
		[isDarkMode],
	);

	const getTimelineAccentColor = React.useCallback((movement: HomeTimelineMovement) => {
		return resolveTimelineAccentColor(movement);
	}, []);

	const getTimelineBadgeLabel = React.useCallback((movement: HomeTimelineMovement) => {
		if (movement.isBankTransfer) {
			return 'Transferência';
		}

		if (movement.isInvestmentDeposit) {
			return 'Aporte';
		}

		if (movement.isInvestmentRedemption) {
			return 'Resgate';
		}

		return movement.type === 'expense' ? 'Despesa' : 'Ganho';
	}, []);

	const getTimelineBadgeAction = React.useCallback(
		(movement: HomeTimelineMovement): 'positive' | 'negative' | 'warning' => {
			if (movement.isBankTransfer) {
				return 'warning';
			}

			return movement.type === 'expense' ? 'negative' : 'positive';
		},
		[],
	);

	const getTimelineContextLabel = React.useCallback((movement: HomeTimelineMovement) => {
		if (movement.isBankTransfer) {
			const sourceBankName =
				movement.bankTransferSourceBankNameSnapshot?.trim() || movement.bankName || 'Origem';
			const targetBankName =
				movement.bankTransferTargetBankNameSnapshot?.trim() || movement.bankName || 'Destino';

			return `${sourceBankName} -> ${targetBankName}`;
		}

		if (movement.isInvestmentDeposit || movement.isInvestmentRedemption) {
			return movement.investmentNameSnapshot?.trim() || 'Movimentação em investimento';
		}

		if (movement.moneyFormat) {
			return 'Em dinheiro';
		}

		if (movement.bankName) {
			return movement.bankName;
		}

		return 'Sem banco vinculado';
	}, []);

	const getTimelineBankBadgePalette = React.useCallback(
		(bankId: string | null) => {
			const normalizedColor = bankId ? normalizeHexColor(bankColorsById[bankId]) : null;

			if (!normalizedColor) {
				return {
					backgroundColor: timelinePalette.emptySurface,
					borderColor: timelinePalette.cardBorder,
					textColor: timelinePalette.subtitle,
				};
			}

			return {
				backgroundColor:
					hexToRgba(normalizedColor, isDarkMode ? 0.18 : 0.1) ?? timelinePalette.emptySurface,
				borderColor:
					hexToRgba(normalizedColor, isDarkMode ? 0.48 : 0.3) ?? timelinePalette.cardBorder,
				textColor: normalizedColor,
			};
		},
		[
			bankColorsById,
			isDarkMode,
			timelinePalette.cardBorder,
			timelinePalette.emptySurface,
			timelinePalette.subtitle,
		],
	);

	const recentTimelineMovements = React.useMemo<HomeTimelineMovement[]>(() => {
		const normalizeMovement = (item: any, type: 'expense' | 'gain'): HomeTimelineMovement => {
			const bankId =
				typeof item?.bankId === 'string' && item.bankId.trim().length > 0 ? item.bankId : null;
			const parsedDate = parseToDate(item?.date ?? item?.createdAt);
			const personName =
				typeof item?.person?.name === 'string' && item.person.name.trim().length > 0
					? item.person.name.trim()
					: null;
			const explanation =
				typeof item?.explanation === 'string' && item.explanation.trim().length > 0
					? item.explanation.trim()
					: null;
			const investmentNameSnapshot =
				typeof item?.investmentNameSnapshot === 'string' && item.investmentNameSnapshot.trim().length > 0
					? item.investmentNameSnapshot.trim()
					: null;
			const sourceBankName =
				typeof item?.bankTransferSourceBankNameSnapshot === 'string' &&
					item.bankTransferSourceBankNameSnapshot.trim().length > 0
					? item.bankTransferSourceBankNameSnapshot.trim()
					: null;
			const targetBankName =
				typeof item?.bankTransferTargetBankNameSnapshot === 'string' &&
					item.bankTransferTargetBankNameSnapshot.trim().length > 0
					? item.bankTransferTargetBankNameSnapshot.trim()
					: null;

			return {
				id:
					typeof item?.id === 'string' && item.id.length > 0
						? item.id
						: `${type}-${String(item?.createdAt ?? item?.date ?? Math.random())}`,
				type,
				name:
					typeof item?.name === 'string' && item.name.trim().length > 0
						? item.name.trim()
						: type === 'expense'
							? 'Despesa sem nome'
							: 'Ganho sem nome',
				valueInCents:
					typeof item?.valueInCents === 'number' && !Number.isNaN(item.valueInCents)
						? item.valueInCents
						: 0,
				date: parsedDate,
				bankId,
				bankName: bankId ? getBankName(bankId) : null,
				personName,
				explanation,
				moneyFormat: typeof item?.moneyFormat === 'boolean' ? item.moneyFormat : null,
				isBankTransfer: Boolean(item?.isBankTransfer),
				bankTransferDirection: normalizeTransferDirection(item?.bankTransferDirection),
				bankTransferSourceBankNameSnapshot: sourceBankName,
				bankTransferTargetBankNameSnapshot: targetBankName,
				isInvestmentDeposit: Boolean(item?.isInvestmentDeposit),
				isInvestmentRedemption: Boolean(item?.isInvestmentRedemption),
				investmentNameSnapshot,
			};
		};

		return [
			...recentExpenses.map(item => normalizeMovement(item, 'expense')),
			...recentGains.map(item => normalizeMovement(item, 'gain')),
		]
			.sort((left, right) => {
				const leftTime = left.date?.getTime() ?? 0;
				const rightTime = right.date?.getTime() ?? 0;

				return rightTime - leftTime;
			})
			.slice(0, 6);
	}, [getBankName, parseToDate, recentExpenses, recentGains]);

	const timelineStatuses = React.useMemo<HomeTimelineStatus[]>(
		() =>
			recentTimelineMovements.map((movement, index) => {
				const movementCardPalette = buildTimelineMovementCardPalette(movement, isDarkMode);
				const badgeLabel = getTimelineBadgeLabel(movement);
				const contextLabel = getTimelineContextLabel(movement);
				const title =
					typeof movement.name === 'string' && movement.name.trim().length > 0
						? movement.name.trim()
						: 'Movimentação';
				const subtitle = [badgeLabel, contextLabel, formatMovementDate(movement.date)]
					.filter(part => typeof part === 'string' && part.trim().length > 0)
					.join(' • ');

				return {
					title,
					subtitle,
					status: movement.id || `movement-${index}`,
					movement,
					renderContent: (
						<View
							style={{
								marginTop: 10,
								marginRight: 21,
								borderRadius: 18,
								backgroundColor: movementCardPalette.baseColor,
								overflow: 'hidden',
								position: 'relative',
								paddingHorizontal: 18,
								paddingVertical: 18,
								shadowColor: movementCardPalette.shadowColor,
								shadowOpacity: isDarkMode ? 0.24 : 0.14,
								shadowRadius: 16,
								shadowOffset: { width: 0, height: 8 },
								elevation: 4,
							}}
						>
							<TimelineMovementCardPattern palette={movementCardPalette} />

							<VStack className="gap-1">
								<Text
									style={{
										fontSize: 11,
										fontWeight: '700',
										letterSpacing: 0.4,
										color: movementCardPalette.labelColor,
										textTransform: 'uppercase',
									}}
								>
									Valor
								</Text>
								<Heading size="sm" style={{ color: movementCardPalette.amountColor }}>
									{formatCurrencyBRL(movement.valueInCents)}
								</Heading>
							</VStack>

							{movement.explanation ? (
								<View
									style={{
										marginTop: 16,
									}}
								>
									<Text style={{ color: movementCardPalette.bodyColor, fontSize: 12, lineHeight: 18 }}>
										{movement.explanation}
									</Text>
								</View>
							) : null}
						</View>
					),
				};
			}),
		[
			formatCurrencyBRL,
			formatMovementDate,
			getTimelineBadgeLabel,
			getTimelineContextLabel,
			isDarkMode,
			recentTimelineMovements,
		],
	);

	const getTimelineMarkerLabel = React.useCallback((movement: HomeTimelineMovement) => {
		if (movement.isBankTransfer) {
			return 'T';
		}

		return movement.type === 'expense' ? '-' : '+';
	}, []);

	const renderTimelineBall = React.useCallback(
		(_: unknown, index: number) => {
			const movement = recentTimelineMovements[index];
			const accentColor = movement ? getTimelineAccentColor(movement) : timelinePalette.timelineBase;
			const markerLabel = movement ? getTimelineMarkerLabel(movement) : '';

			return (
				<View
					style={{
						width: 18,
						height: 18,
						marginTop: -3,
						borderRadius: 999,
						backgroundColor: accentColor,
						alignItems: 'center',
						justifyContent: 'center',
						borderWidth: 2,
						borderColor: isDarkMode ? '#020617' : '#FFFFFF',
						shadowColor: accentColor,
						shadowOpacity: isDarkMode ? 0.3 : 0.18,
						shadowRadius: 8,
						shadowOffset: { width: 0, height: 4 },
						elevation: 2,
					}}
				>
					<Text
						style={{
							color: '#FFFFFF',
							fontSize: 10,
							lineHeight: 10,
							fontWeight: '700',
							textAlign: 'center',
							textAlignVertical: 'center',
							includeFontPadding: false,
						}}
					>
						{markerLabel}
					</Text>
				</View>
			);
		},
		[
			getTimelineAccentColor,
			getTimelineMarkerLabel,
			isDarkMode,
			recentTimelineMovements,
			timelinePalette.timelineBase,
		],
	);

	const renderTimelineStick = React.useCallback(
		(_: unknown, index: number) => {
			const movement = recentTimelineMovements[index];
			const accentColor = movement ? getTimelineAccentColor(movement) : timelinePalette.timelineBase;

			return (
				<View
					style={{
						flex: 1,
						width: 3,
						borderRadius: 999,
						marginVertical: 2,
						backgroundColor:
							hexToRgba(accentColor, isDarkMode ? 0.4 : 0.22) ?? timelinePalette.timelineBase,
					}}
				/>
			);
		},
		[getTimelineAccentColor, isDarkMode, recentTimelineMovements, timelinePalette.timelineBase],
	);

	const renderSectionChevron = React.useCallback(
		(isOpen: boolean, tintColor: string) =>
			<RNImage
				source={isOpen ? TIMELINE_CHEVRON_UP : TIMELINE_CHEVRON_DOWN}
				style={{
					width: 18,
					height: 14,
					tintColor,
				}}
				resizeMode="contain"
			/>,
		[],
	);
	const renderTimelineChevron = React.useCallback(
		(isOpen: boolean) => renderSectionChevron(isOpen, timelinePalette.subtitle),
		[renderSectionChevron, timelinePalette.subtitle],
	);

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
				setInvestmentPortfolio(createEmptyInvestmentPortfolio());

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
						setInvestmentPortfolio(createEmptyInvestmentPortfolio());
						setIsLoadingSummary(false);
						setIsLoadingMovements(false);
						setIsLoadingInvestments(false);
					}
					return;
				}

				if (isMounted) {
					setIsLoadingInvestments(true);
					setInvestmentsError(null);
					setInvestmentPortfolio(createEmptyInvestmentPortfolio());
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
									colorHex: bank.colorHex,
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

						const [expensesResult, gainsResult, banksResult] = await Promise.all([
							getLimitedExpensesWithPeopleFirebase({ limit: 6, personId: currentUser.uid }),
							getLimitedGainsWithPeopleFirebase({ limit: 6, personId: currentUser.uid }),
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
							setInvestmentPortfolio(createEmptyInvestmentPortfolio());
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
							const bankNameSnapshot =
								typeof investment.bankNameSnapshot === 'string' &&
									investment.bankNameSnapshot.trim().length > 0
									? investment.bankNameSnapshot.trim()
									: null;
							const cdiPercentage =
								typeof investment.cdiPercentage === 'number' ? investment.cdiPercentage : 0;

							return {
								id,
								name,
								initialValueInCents,
								currentValueInCents,
								cdiPercentage,
								bankId,
								bankNameSnapshot,
								lastManualSyncValueInCents: lastManualValue,
								lastManualSyncAt: parseToDate(investment.lastManualSyncAt),
								createdAt: parseToDate(
									investment.createdAt ?? investment.createdAtISO ?? investment.createdAtUtc,
								),
							};
						});

						const portfolioItems = normalizedInvestments
							.map<HomeInvestmentItem>(investment => {
								const currentBaseValueInCents = resolveInvestmentBaseValueInCents(investment);
								const simulatedValueInCents = simulateInvestmentValueInCents(investment);

								return {
									id: investment.id,
									name: investment.name,
									bankId: investment.bankId,
									bankNameSnapshot: investment.bankNameSnapshot,
									initialValueInCents: investment.initialValueInCents,
									currentBaseValueInCents,
									simulatedValueInCents,
									estimatedGainInCents: simulatedValueInCents - currentBaseValueInCents,
									cdiPercentage: investment.cdiPercentage,
									lastManualSyncValueInCents: investment.lastManualSyncValueInCents,
									lastManualSyncAt: investment.lastManualSyncAt,
									createdAt: investment.createdAt,
								};
							})
							.sort((left, right) => right.simulatedValueInCents - left.simulatedValueInCents);

						const nextPortfolio: HomeInvestmentPortfolio = {
							items: portfolioItems,
							totalCurrentBaseInCents: portfolioItems.reduce(
								(acc, investment) => acc + investment.currentBaseValueInCents,
								0,
							),
							totalInitialInCents: portfolioItems.reduce(
								(acc, investment) => acc + investment.initialValueInCents,
								0,
							),
							totalSimulatedInCents: portfolioItems.reduce(
								(acc, investment) => acc + investment.simulatedValueInCents,
								0,
							),
							totalEstimatedGainInCents: portfolioItems.reduce(
								(acc, investment) => acc + investment.estimatedGainInCents,
								0,
							),
							investmentCount: portfolioItems.length,
						};

						setInvestmentPortfolio(nextPortfolio);
						setInvestmentsError(null);
					} catch (error) {
						console.error('Erro ao carregar investimentos na Home:', error);
						if (isMounted) {
							setInvestmentPortfolio(createEmptyInvestmentPortfolio());
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
		<SafeAreaView
			className="flex-1"
			edges={['left', 'right']}
			style={{ backgroundColor: surfaceBackground }}
		>
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

					<VStack
						className="w-full h-full items-center justify-start px-6 gap-4"
						style={{ paddingTop: insets.top + 24 }}
					>
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
					className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pt-10 pb-1`}
					style={{ marginTop: heroHeight - 64 }}
				>
					<View className="flex-1 w-full">

						<ScrollView
							className="flex-1 w-full"
							contentContainerStyle={{ paddingBottom: 16 }}
							showsVerticalScrollIndicator={false}
							onScrollBeginDrag={handleDismissInvestmentPopover}
							onMomentumScrollBegin={handleDismissInvestmentPopover}
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
												const cardPalette = buildBankCardPalette(item.colorHex, isDarkMode);

												return (
													<View
														style={{
															flex: 1,
															paddingHorizontal: bankCarouselItemSpacing / 2,
														}}
													>
														<View
															style={{
																flex: 1,
																paddingHorizontal: 18,
																paddingVertical: 18,
																borderRadius: 20,
																backgroundColor: cardPalette.baseColor,
																overflow: 'hidden',
																position: 'relative',
																justifyContent: 'space-between',
																shadowColor: cardPalette.shadowColor,
																shadowOffset: { width: 0, height: 12 },
																shadowOpacity: 0.24,
																shadowRadius: 18,
																elevation: 8,
															}}
														>
															<BankCardPattern palette={cardPalette} />

															<VStack className="gap-1">
																<Text
																	className="text-xs uppercase tracking-wide"
																	style={{ color: cardPalette.textSecondary }}
																>
																	Banco
																</Text>
																<Heading size="lg" style={{ color: cardPalette.textPrimary }}>
																	{item.name}
																</Heading>
															</VStack>

															<VStack className="gap-1 mt-4">
																<Text
																	className="text-xs uppercase tracking-wide"
																	style={{ color: cardPalette.textSecondary }}
																>
																	Saldo atual
																</Text>
																<Heading size="md" style={{ color: cardPalette.textPrimary }}>
																	{item.balanceInCents === null
																		? 'Saldo indisponível'
																		: formatCurrencyBRL(item.balanceInCents)}
																</Heading>
																{item.balanceInCents === null ? (
																	<Text className="text-xs" style={{ color: cardPalette.textSecondary }}>
																		Sem saldo registrado para este mes.
																	</Text>
																) : null}
															</VStack>

															<HStack className="mt-4 justify-between items-end gap-4">
																<VStack className="flex-1 gap-1">
																	<Text
																		className="text-xs uppercase tracking-wide"
																		style={{ color: cardPalette.textSecondary }}
																	>
																		Gastos
																	</Text>
																	<Text className="font-semibold" style={{ color: cardPalette.expenseColor }}>
																		{formatCurrencyBRL(monthlyExpenseInCents)}
																	</Text>
																</VStack>

																<VStack className="flex-1 gap-1 items-end">
																	<Text
																		className="text-xs uppercase tracking-wide"
																		style={{ color: cardPalette.textSecondary }}
																	>
																		Ganhos
																	</Text>
																	<Text className="font-semibold" style={{ color: cardPalette.gainColor }}>
																		{formatCurrencyBRL(monthlyGainInCents)}
																	</Text>
																</VStack>
															</HStack>
														</View>
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

							<View className="mb-6">
								<Heading size="lg">Investimentos</Heading>
								<Text
									style={{
										marginTop: 4,
										fontSize: 14,
										lineHeight: 20,
										color: investmentPalette.subtitle,
									}}
								>
									Distribuição atual da carteira.
								</Text>

								<View
									style={{
										marginTop: 8,
									}}
								>
									{investmentsError ? (
										<Text style={{ color: investmentPalette.subtitle }}>{investmentsError}</Text>
									) : isLoadingInvestments && investmentPortfolio.investmentCount === 0 ? (
										<Text style={{ color: investmentPalette.subtitle }}>Carregando investimentos...</Text>
									) : investmentPortfolio.investmentCount === 0 ? (
										<Text style={{ color: investmentPalette.subtitle }}>
											Nenhum investimento registrado até o momento.
										</Text>
									) : !hasInvestmentDonutData ? (
										<Text style={{ color: investmentPalette.subtitle }}>
											Os investimentos cadastrados ainda não possuem valor atual/base para exibir a
											distribuição.
										</Text>
									) : (
										<>

											<View className="mt-2 items-center justify-center">
												<View
													style={{
														width: investmentChartWidth,
														height: investmentChartHeight,
														position: 'relative',
														overflow: 'visible',
													}}
												>
													{selectedInvestmentPopoverTarget && selectedInvestmentPopoverInvestment ? (
														<Popover
															isOpen
															onClose={() => setSelectedInvestmentPopoverTarget(null)}
															placement="top"
															size="sm"
															offset={-24}
															shouldFlip
															focusScope={false}
															trapFocus={false}
															trigger={triggerProps => (
																<View
																	ref={triggerProps.ref}
																	style={{
																		position: 'absolute',
																		left: selectedInvestmentPopoverTarget.anchorX,
																		top: selectedInvestmentPopoverTarget.anchorY,
																		width: 2,
																		height: 2,
																		opacity: 0,
																	}}
																/>
															)}
														>
															<PopoverBackdrop className="bg-transparent" />
															<PopoverContent
																style={{
																	borderRadius: 18,
																	borderWidth: 1,
																	borderColor: selectedInvestmentPopoverPalette.borderColor,
																	backgroundColor: selectedInvestmentPopoverPalette.backgroundColor,
																	shadowColor: selectedInvestmentPopoverPalette.shadowColor,
																	shadowOffset: { width: 0, height: 10 },
																	shadowOpacity: 0.24,
																	shadowRadius: 18,
																	elevation: 10,
																}}
															>
																<PopoverBody className="px-4 py-3">
																	<Text
																		className="text-center text-xs font-bold leading-4"
																		style={{ color: selectedInvestmentPopoverPalette.textPrimary }}
																	>
																		{selectedInvestmentPopoverInvestment.name}
																	</Text>
																	<Text
																		className="mt-2 text-center text-base font-bold"
																		style={{ color: selectedInvestmentPopoverPalette.textPrimary }}
																	>
																		{formatCurrencyBRL(
																			selectedInvestmentPopoverInvestment.currentBaseValueInCents,
																		)}
																	</Text>
																	<Text
																		className="mt-0.5 text-center text-[11px] leading-4"
																		style={{ color: selectedInvestmentPopoverPalette.textSecondary }}
																	>
																		Valor atual/base
																	</Text>
																</PopoverBody>
															</PopoverContent>
														</Popover>
													) : null}

													<View
														style={{
															position: 'absolute',
															top: 0,
															left: 0,
														}}
													>
														<PieChart
															data={investmentDonutChartData}
															donut
															showGradient
															showText={false}
															isAnimated
															focusOnPress={false}
															toggleFocusOnPress={false}
															initialAngle={INVESTMENT_CHART_INITIAL_ANGLE}
															radius={investmentChartRadius}
															innerRadius={investmentChartInnerRadius}
															paddingHorizontal={INVESTMENT_CHART_PADDING_HORIZONTAL}
															paddingVertical={INVESTMENT_CHART_PADDING_VERTICAL}
															innerCircleColor={investmentPalette.chartCenterBackground}
															strokeColor={surfaceBackground}
															strokeWidth={6}
															centerLabelComponent={() => (
																<View
																	style={{
																		alignItems: 'center',
																		justifyContent: 'center',
																		paddingHorizontal: 12,
																	}}
																>
																	<Text
																		style={{
																			fontSize: 12,
																			fontWeight: '700',
																			letterSpacing: 0.4,
																			textTransform: 'uppercase',
																			color: investmentPalette.subtitle,
																		}}
																	>
																		Ativos
																	</Text>
																	<Heading
																		size="xl"
																		style={{
																			marginTop: 4,
																			color: investmentPalette.title,
																			textAlign: 'center',
																		}}
																	>
																		{investmentPortfolio.investmentCount}
																	</Heading>
																	<Text
																		style={{
																			marginTop: 2,
																			fontSize: 13,
																			lineHeight: 18,
																			color: investmentPalette.subtitle,
																			textAlign: 'center',
																		}}
																	>
																		{investmentCountLabel}
																	</Text>
																</View>
															)}
														/>
													</View>

													<Pressable
														onPress={handlePressInvestmentChart}
														style={{
															position: 'absolute',
															top: 0,
															left: 0,
															width: investmentChartWidth,
															height: investmentChartHeight,
															backgroundColor: 'transparent',
															zIndex: 1,
														}}
													/>
												</View>
											</View>

											<HStack className="mt-6 items-start justify-between">
												<View
													style={{
														flex: 1,
														paddingRight: 12,
													}}
												>
													<Text
														style={{
															fontSize: 11,
															fontWeight: '700',
															letterSpacing: 0.3,
															color: investmentPalette.subtitle,
															textTransform: 'uppercase',
														}}
													>
														Atual/base
													</Text>
													<Text
														style={{
															marginTop: 6,
															fontSize: 18,
															fontWeight: '700',
															color: investmentPalette.title,
														}}
													>
														{formatCurrencyBRL(investmentPortfolio.totalCurrentBaseInCents)}
													</Text>
												</View>

												<View
													style={{
														flex: 1,
														alignItems: 'flex-end',
														paddingLeft: 12,
													}}
												>
													<Text
														style={{
															fontSize: 11,
															fontWeight: '700',
															letterSpacing: 0.3,
															color: investmentPalette.subtitle,
															textTransform: 'uppercase',
															textAlign: 'right',
														}}
													>
														Simulado
													</Text>
													<Text
														style={{
															marginTop: 6,
															fontSize: 18,
															fontWeight: '700',
															color: investmentPalette.simulatedColor,
															textAlign: 'right',
														}}
													>
														{formatCurrencyBRL(investmentPortfolio.totalSimulatedInCents)}
													</Text>
												</View>
											</HStack>
										</>
									)}
								</View>

							</View>

							<View className="mb-6">
								<HStack className="items-start justify-between gap-3">
									<TouchableOpacity
										activeOpacity={0.85}
										onPress={handleToggleMovements}
										style={{ flex: 1 }}
									>
										<Heading size="lg">Últimas movimentações</Heading>
										<Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
											{isMovementsExpanded
												? 'Clique para ocultar as últimas transações.'
												: 'Clique para mostrar as últimas transações.'}
										</Text>
									</TouchableOpacity>

									<TouchableOpacity
										activeOpacity={0.85}
										onPress={handleToggleMovements}
										style={{
											minWidth: 28,
											paddingLeft: 8,
											paddingVertical: 4,
											alignItems: 'center',
											justifyContent: 'center',
											flexShrink: 0,
										}}
									>
										{renderTimelineChevron(isMovementsExpanded)}
									</TouchableOpacity>
								</HStack>

								{isMovementsExpanded ? (
									isLoadingMovements ? (
										<View
											style={{
												marginTop: 10,
												paddingHorizontal: 16,
												paddingVertical: 18,
											}}
										>
											<Text style={{ color: timelinePalette.subtitle }}>
												Carregando últimas movimentações...
											</Text>
										</View>
									) : timelineStatuses.length > 0 ? (
										<View style={{ marginTop: 14 }}>
											{timelineStatuses.map((status, index) => {
												const movement = status.movement;
												const isTimelineItemExpanded = expandedTimelineStatuses.includes(status.status);
												const badgeLabel = getTimelineBadgeLabel(movement);
												const badgeAction = getTimelineBadgeAction(movement);
												const contextLabel = getTimelineContextLabel(movement);
												const dateLabel = formatMovementDate(movement.date);
												const shouldRenderCashBadge = Boolean(movement.moneyFormat);
												const shouldRenderBankBadge =
													Boolean(movement.bankId) &&
													Boolean(movement.bankName) &&
													!shouldRenderCashBadge &&
													!movement.isBankTransfer &&
													!movement.isInvestmentDeposit &&
													!movement.isInvestmentRedemption;
												const bankBadgePalette = shouldRenderBankBadge
													? getTimelineBankBadgePalette(movement.bankId)
													: null;
												const shouldRenderContextSeparator =
													Boolean(dateLabel) && (shouldRenderBankBadge || shouldRenderCashBadge);

												return (
													<View
														key={status.status}
														style={{
															flexDirection: 'row',
														}}
													>
														<View
															style={{
																alignItems: 'center',
																width: '7%',
																paddingTop: 3,
															}}
														>
															{renderTimelineBall(status, index)}
															{index < timelineStatuses.length - 1 ? renderTimelineStick(status, index) : <View />}
														</View>

														<View
															style={{
																width: '93%',
																paddingBottom: 12,
															}}
														>
															<TouchableOpacity
																activeOpacity={0.85}
																onPress={() => handleToggleTimelineStatus(status.status)}
																style={{
																	flexDirection: 'row',
																	justifyContent: 'space-between',
																	alignItems: 'center',
																	width: '100%',
																}}
															>
																<View style={{ width: '88%' }}>
																	<Text
																		style={{
																			color: timelinePalette.title,
																			fontSize: 15,
																			fontWeight: '700',
																		}}
																	>
																		{status.title}
																	</Text>

																	<HStack className="mt-1 items-center flex-wrap gap-2">
																		<Badge size="sm" variant="outline" action={badgeAction}>
																			<BadgeText className="tracking-wide">
																				{badgeLabel}
																			</BadgeText>
																		</Badge>

																		{shouldRenderBankBadge && bankBadgePalette ? (
																			<Badge
																				size="sm"
																				variant="outline"
																				action="muted"
																				style={{
																					backgroundColor: bankBadgePalette.backgroundColor,
																					borderColor: bankBadgePalette.borderColor,
																				}}
																			>
																				<BadgeText
																					style={{
																						color: bankBadgePalette.textColor,
																					}}
																				>
																					{movement.bankName}
																				</BadgeText>
																			</Badge>
																		) : shouldRenderCashBadge && contextLabel ? (
																			<Badge size="sm" variant="outline" action="muted">
																				<BadgeText>{contextLabel}</BadgeText>
																			</Badge>
																		) : contextLabel ? (
																			<Text
																				style={{
																					flexShrink: 1,
																					color: timelinePalette.subtitle,
																					fontSize: 12,
																					lineHeight: 18,
																				}}
																			>
																				{contextLabel}
																			</Text>
																		) : null}

																		{shouldRenderContextSeparator ? (
																			<Text
																				style={{
																					color: timelinePalette.subtitle,
																					fontSize: 12,
																					lineHeight: 18,
																				}}
																			>
																				•
																			</Text>
																		) : null}

																		{dateLabel ? (
																			<Text
																				style={{
																					flexShrink: 1,
																					color: timelinePalette.subtitle,
																					fontSize: 12,
																					lineHeight: 18,
																				}}
																			>
																				{dateLabel}
																			</Text>
																		) : null}
																	</HStack>
																</View>

																<View
																	style={{
																		width: '12%',
																		alignItems: 'flex-start',
																	}}
																>
																	{renderTimelineChevron(isTimelineItemExpanded)}
																</View>
															</TouchableOpacity>

															{isTimelineItemExpanded ? status.renderContent ?? null : null}
														</View>
													</View>
												);
											})}
										</View>
									) : (
										<View
											style={{
												marginTop: 10,
												borderRadius: 18,
												borderWidth: 1,
												borderColor: timelinePalette.cardBorder,
												backgroundColor: timelinePalette.emptySurface,
												paddingHorizontal: 16,
												paddingVertical: 18,
											}}
										>
											<Text style={{ color: timelinePalette.subtitle }}>
												Nenhuma transação recente encontrada.
											</Text>
										</View>
									)
								) : null}

								{movementsError ? (
									<Text className="mt-3 text-sm text-amber-600 dark:text-amber-400">
										{movementsError}
									</Text>
								) : null}

							</View>

						</ScrollView>

						<View
							style={{
								marginHorizontal: -18,
								paddingBottom: 0,
							}}
						>
							<Navigator defaultValue={0} />
						</View>

					</View>

				</View>
			</View>
		</SafeAreaView>
	);
}
