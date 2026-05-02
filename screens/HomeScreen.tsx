import React from 'react';
import {
	Pressable,
	RefreshControl,
	ScrollView,
	StatusBar,
	TouchableOpacity,
	View,
	type GestureResponderEvent,
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Carousel, { Pagination, type ICarouselInstance } from 'react-native-reanimated-carousel';
import { useSharedValue } from 'react-native-reanimated';

import { auth } from '@/FirebaseConfig';
import {
	type HomeBankBalanceCard,
	type HomeCashSummary,
	type HomeTimelineMovement,
} from '@/functions/HomeFirebase';
import { getUserDataFirebase } from '@/functions/RegisterUserFirebase';
import { useHomeScreenData } from '@/hooks/useHomeScreenData';
import Navigator from '@/components/uiverse/navigator';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { CalendarDaysIcon, ChevronDownIcon, ChevronUpIcon, Icon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from '@/components/ui/modal';
import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { Button, ButtonText } from '@/components/ui/button';
import {
	BankCardSurface,
	CASH_CARD_COLOR,
	buildBankCardPalette,
	mixHexColors,
	normalizeHexColor,
	type BankCardPalette,
} from '@/components/uiverse/bank-card-surface';
import { HIDDEN_VALUE_PLACEHOLDER, useValueVisibility } from '@/contexts/ValueVisibilityContext';
import { PieChart } from 'react-native-gifted-charts';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import HomeScreenIllustration from '../assets/UnDraw/homeScreen.svg';
import { CalendarDays, Info, Tags as TagsIcon } from 'lucide-react-native';
import { TagIcon, type TagIconSelection } from '@/hooks/useTagIcons';
import { useScreenStyles } from '@/hooks/useScreenStyle';

type HomeTimelineToneKey =
	| 'gain'
	| 'expense'
	| 'mandatoryGain'
	| 'mandatoryExpense'
	| 'bankTransfer'
	| 'investmentRedemption'
	| 'investmentDeposit'
	| 'investmentSync';

type HomeTimelineTone = {
	accentColor: string;
	amountColor: string;
	lineColor: string;
	iconGradient: [string, string];
	cardGradient: [string, string];
};

type HomeBankCarouselItem =
	| ({
		kind: 'bank';
	} & HomeBankBalanceCard)
	| ({
		kind: 'cash';
	} & HomeCashSummary);

const INVESTMENT_PIE_COLOR_PALETTE = ['#FACC15', '#F59E0B', '#FDE047', '#EAB308', '#FBBF24', '#CA8A04', '#FCD34D', '#D97706'];
const INVESTMENT_CHART_INITIAL_ANGLE = -Math.PI / 2;
const INVESTMENT_CHART_PADDING_HORIZONTAL = 28;
const INVESTMENT_CHART_PADDING_VERTICAL = 12;
const INVESTMENT_CHART_TOUCH_OUTER_TOLERANCE = 8;
const INVESTMENT_CHART_TOUCH_INNER_TOLERANCE = 6;
const HOME_BANK_OVERVIEW_SKELETON_CARD_COLOR = '#334155';
const extractFirstName = (value: unknown) => {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmedValue = value.trim();
	if (!trimmedValue) {
		return null;
	}

	return trimmedValue.split(/\s+/)[0] ?? null;
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

const MANDATORY_SETTLED_TONE: HomeTimelineTone = {
	accentColor: '#10B981',
	amountColor: '#10B981',
	lineColor: 'rgba(16, 185, 129, 0.28)',
	iconGradient: ['#047857', '#34D399'],
	cardGradient: ['#065F46', '#10B981'],
};

// Mantém a timeline da Home alinhada ao padrão visual documentado em [[Dashboard Home]].
const HOME_TIMELINE_TONES: Record<HomeTimelineToneKey, HomeTimelineTone> = {
	gain: {
		accentColor: '#10B981',
		amountColor: '#10B981',
		lineColor: 'rgba(16, 185, 129, 0.28)',
		iconGradient: ['#047857', '#34D399'],
		cardGradient: ['#065F46', '#10B981'],
	},
	expense: {
		accentColor: '#EF4444',
		amountColor: '#EF4444',
		lineColor: 'rgba(239, 68, 68, 0.28)',
		iconGradient: ['#B91C1C', '#EF4444'],
		cardGradient: ['#7F1D1D', '#EF4444'],
	},
	mandatoryExpense: MANDATORY_SETTLED_TONE,
	mandatoryGain: MANDATORY_SETTLED_TONE,
	bankTransfer: {
		accentColor: '#F59E0B',
		amountColor: '#F59E0B',
		lineColor: 'rgba(245, 158, 11, 0.3)',
		iconGradient: ['#92400E', '#F59E0B'],
		cardGradient: ['#78350F', '#F59E0B'],
	},
	investmentRedemption: {
		accentColor: '#38BDF8',
		amountColor: '#38BDF8',
		lineColor: 'rgba(56, 189, 248, 0.3)',
		iconGradient: ['#0C4A6E', '#38BDF8'],
		cardGradient: ['#075985', '#67E8F9'],
	},
	investmentDeposit: {
		accentColor: '#7C3AED',
		amountColor: '#7C3AED',
		lineColor: 'rgba(124, 58, 237, 0.3)',
		iconGradient: ['#312E81', '#7C3AED'],
		cardGradient: ['#312E81', '#7C3AED'],
	},
	investmentSync: {
		accentColor: '#14B8A6',
		amountColor: '#14B8A6',
		lineColor: 'rgba(20, 184, 166, 0.28)',
		iconGradient: ['#0F766E', '#2DD4BF'],
		cardGradient: ['#115E59', '#14B8A6'],
	},
};

const resolveHomeTimelineToneKey = (movement: HomeTimelineMovement): HomeTimelineToneKey => {
	if (movement.isFinanceInvestmentSync) {
		return 'investmentSync';
	}

	if (movement.isBankTransfer) {
		return 'bankTransfer';
	}

	if (movement.isInvestmentRedemption) {
		return 'investmentRedemption';
	}

	if (movement.isInvestmentDeposit) {
		return 'investmentDeposit';
	}

	if (movement.isFromMandatory) {
		return movement.type === 'gain' ? 'mandatoryGain' : 'mandatoryExpense';
	}

	return movement.type === 'gain' ? 'gain' : 'expense';
};

const getHomeTimelineItemKey = (movement: HomeTimelineMovement) => `${movement.type}:${movement.id}`;

const HomeBankOverviewSkeleton = ({
	bankCarouselHeight,
	cardPalette,
	skeletonBaseColor,
	skeletonHighlightColor,
	paginationBaseColor,
	paginationHighlightColor,
}: {
	bankCarouselHeight: number;
	cardPalette: BankCardPalette;
	skeletonBaseColor: string;
	skeletonHighlightColor: string;
	paginationBaseColor: string;
	paginationHighlightColor: string;
}) => (
	<View style={{ marginTop: 16 }}>
		<BankCardSurface palette={cardPalette} style={{ height: bankCarouselHeight }}>
			<VStack className="flex-1 justify-between">
				<VStack className="gap-2">
					<Skeleton
						className="h-3 w-20"
						baseColor={skeletonBaseColor}
						highlightColor={skeletonHighlightColor}
					/>
					<Skeleton
						className="h-7 w-44"
						baseColor={skeletonBaseColor}
						highlightColor={skeletonHighlightColor}
					/>
				</VStack>

				<VStack className="gap-4">
					<HStack className="items-end justify-between gap-4">
						<VStack className="flex-1 gap-2">
							<Skeleton
								className="h-3 w-24"
								baseColor={skeletonBaseColor}
								highlightColor={skeletonHighlightColor}
							/>
							<Skeleton
								className="h-8 w-36"
								baseColor={skeletonBaseColor}
								highlightColor={skeletonHighlightColor}
							/>
						</VStack>

						<VStack className="items-end gap-2">
							<Skeleton
								className="h-3 w-20"
								baseColor={skeletonBaseColor}
								highlightColor={skeletonHighlightColor}
							/>
							<Skeleton
								className="h-5 w-24"
								baseColor={skeletonBaseColor}
								highlightColor={skeletonHighlightColor}
							/>
						</VStack>
					</HStack>

					<HStack className="gap-3">
						<VStack className="flex-1 gap-2">
							<Skeleton
								className="h-3 w-16"
								baseColor={skeletonBaseColor}
								highlightColor={skeletonHighlightColor}
							/>
							<Skeleton
								className="h-5 w-24"
								baseColor={skeletonBaseColor}
								highlightColor={skeletonHighlightColor}
							/>
						</VStack>

						<VStack className="flex-1 gap-2">
							<Skeleton
								className="h-3 w-16"
								baseColor={skeletonBaseColor}
								highlightColor={skeletonHighlightColor}
							/>
							<Skeleton
								className="h-5 w-24"
								baseColor={skeletonBaseColor}
								highlightColor={skeletonHighlightColor}
							/>
						</VStack>
					</HStack>
				</VStack>
			</VStack>
		</BankCardSurface>

		<HStack className="mt-3 items-center justify-center gap-2">
			{Array.from({ length: 3 }).map((_, index) => (
				<Skeleton
					key={`bank-carousel-skeleton-dot-${index}`}
					variant="circular"
					className="h-2.5 w-2.5"
					baseColor={paginationBaseColor}
					highlightColor={paginationHighlightColor}
				/>
			))}
		</HStack>
	</View>
);

const HomeInvestmentSkeleton = ({
	investmentChartWidth,
	investmentChartHeight,
	surfaceBackground,
}: {
	investmentChartWidth: number;
	investmentChartHeight: number;
	surfaceBackground: string;
}) => {
	const donutSize = Math.max(Math.min(investmentChartWidth - 28, investmentChartHeight - 12), 120);
	const innerCircleSize = Math.max(donutSize - 72, 58);

	return (
		<View style={{ marginTop: 12 }}>
			<View className="items-center justify-center">
				<View
					style={{
						width: investmentChartWidth,
						height: investmentChartHeight,
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<Skeleton variant="circular" style={{ width: donutSize, height: donutSize }} />
					<View
						pointerEvents="none"
						style={{
							position: 'absolute',
							width: innerCircleSize,
							height: innerCircleSize,
							borderRadius: 999,
							backgroundColor: surfaceBackground,
						}}
					/>

					<VStack className="absolute items-center gap-2">
						<Skeleton className="h-3 w-14" />
						<Skeleton className="h-8 w-10" />
						<Skeleton className="h-3 w-24" />
					</VStack>
				</View>
			</View>

			<HStack className="mt-6 items-start justify-between">
				<VStack className="flex-1 gap-2" style={{ paddingRight: 12 }}>
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-7 w-28" />
				</VStack>

				<VStack className="flex-1 items-end gap-2" style={{ paddingLeft: 12 }}>
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-7 w-28" />
				</VStack>
			</HStack>
		</View>
	);
};

const HomeMovementsSkeleton = ({
	timelinePalette,
}: {
	timelinePalette: {
		timelineBase: string;
	};
}) => (
	<View style={{ marginTop: 14 }}>
		{Array.from({ length: 3 }).map((_, index, items) => (
			<View key={`timeline-skeleton-item-${index}`} style={{ flexDirection: 'row' }}>
				<View
					style={{
						alignItems: 'center',
						width: '7%',
						paddingTop: 3,
					}}
				>
					<Skeleton variant="circular" style={{ width: 18, height: 18 }} />
					{index < items.length - 1 ? (
						<Skeleton
							className="w-full"
							style={{
								width: 3,
								height: 92,
								marginVertical: 2,
								backgroundColor: timelinePalette.timelineBase,
							}}
						/>
					) : (
						<View style={{ height: 12 }} />
					)}
				</View>

				<View style={{ width: '93%', paddingBottom: 14 }}>
					<HStack className="items-center justify-between gap-3">
						<HStack className="items-center gap-3" style={{ flex: 1 }}>
							<Skeleton className="h-11 w-11 rounded-2xl" />
							<VStack className="flex-1 gap-2">
								<Skeleton className="h-5 w-36" />
								<Skeleton className="h-3 w-28" />
							</VStack>
						</HStack>

						<HStack className="items-center gap-2">
							<VStack className="items-end gap-2">
								<Skeleton className="h-5 w-20" />
								<Skeleton className="h-3 w-14" />
							</VStack>
							<Skeleton className="h-4 w-4 rounded-full" />
						</HStack>
					</HStack>
				</View>
			</View>
		))}
	</View>
);

export default function HomeScreen() {
	const { width: windowWidth } = useWindowDimensions();
	const bankCarouselRef = React.useRef<ICarouselInstance>(null);
	const bankCarouselProgress = useSharedValue(0);
	const { shouldHideValues } = useValueVisibility();
	const bankCarouselWidth = Math.max(windowWidth - 48, 1);
	const bankCarouselHeight = 176;
	const bankCarouselItemSpacing = 16;
	const currentUserId = auth.currentUser?.uid ?? null;
	const authDisplayFirstName = extractFirstName(auth.currentUser?.displayName);
	const { overview, movements, investments, reload } = useHomeScreenData(currentUserId);

	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		heroHeight,
		infoCardStyle,
		insets,
		modalContentClassName,
		submitButtonCancelClassName,
		submitButtonClassName,
		submitButtonTextClassName,
		skeletonBaseColor,
		skeletonHighlightColor,
	} = useScreenStyles();

	const [isMovementsExpanded, setIsMovementsExpanded] = React.useState(true);
	const [expandedTimelineStatuses, setExpandedTimelineStatuses] = React.useState<string[]>([]);
	const [isMonthlyBalanceModalOpen, setIsMonthlyBalanceModalOpen] = React.useState(false);
	const [dismissedMonthlyBalancePromptKey, setDismissedMonthlyBalancePromptKey] = React.useState<string | null>(null);
	const [currentUserFirstName, setCurrentUserFirstName] = React.useState<string | null>(authDisplayFirstName);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [selectedInvestmentPopoverTarget, setSelectedInvestmentPopoverTarget] = React.useState<{
		investmentId: string;
		anchorX: number;
		anchorY: number;
	} | null>(null);

	React.useEffect(() => {
		let isMounted = true;

		const loadCurrentUserFirstName = async () => {
			if (!currentUserId) {
				if (isMounted) {
					setCurrentUserFirstName(authDisplayFirstName);
				}
				return;
			}

			const result = await getUserDataFirebase(currentUserId);

			if (!isMounted) {
				return;
			}

			if (!result.success) {
				setCurrentUserFirstName(authDisplayFirstName);
				return;
			}

			const storedName = (result.data as { name?: unknown })?.name;
			setCurrentUserFirstName(extractFirstName(storedName) ?? authDisplayFirstName);
		};

		void loadCurrentUserFirstName();

		return () => {
			isMounted = false;
		};
	}, [authDisplayFirstName, currentUserId]);

	const greetingFirstName = currentUserFirstName ?? authDisplayFirstName ?? 'Usuário';

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

	const formatMovementDate = React.useCallback((value: Date | null) => {
		if (!value) {
			return 'Data indisponível';
		}

		return new Intl.DateTimeFormat('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		}).format(value);
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

	const handleDismissInvestmentPopover = React.useCallback(() => {
		setSelectedInvestmentPopoverTarget(null);
	}, []);

	const handleRefresh = React.useCallback(async () => {
		setIsRefreshing(true);
		try {
			await reload();
		} finally {
			setIsRefreshing(false);
		}
	}, [reload]);

	const bankBalances = overview.data.bankBalances;
	const cashSummary = overview.data.cashSummary;
	const currentMonthExpensesByBankId = overview.data.currentMonthExpensesByBankId;
	const currentMonthGainsByBankId = overview.data.currentMonthGainsByBankId;
	const timelineMovements = movements.data.timelineMovements;
	const investmentPortfolio = investments.data.portfolio;
	// Segue [[Balanço Mensal]]: banco sem snapshot do mês corrente não tem saldo confiável.
	const missingMonthlyBalanceBanks = React.useMemo(
		() => bankBalances.filter(bank => bank.balanceInCents === null),
		[bankBalances],
	);
	const monthlyBalancePromptKey = React.useMemo(() => {
		if (missingMonthlyBalanceBanks.length === 0) {
			return null;
		}

		return [...missingMonthlyBalanceBanks]
			.map(bank => bank.id)
			.sort((left, right) => left.localeCompare(right))
			.join('|');
	}, [missingMonthlyBalanceBanks]);
	const currentMonthReferenceLabel = React.useMemo(
		() =>
			new Intl.DateTimeFormat('pt-BR', {
				month: 'long',
				year: 'numeric',
			}).format(new Date()),
		[],
	);
	const missingMonthlyBalanceBankNamesPreview = React.useMemo(() => {
		const visibleBankNames = missingMonthlyBalanceBanks.slice(0, 3).map(bank => bank.name);
		const remainingCount = missingMonthlyBalanceBanks.length - visibleBankNames.length;

		if (remainingCount <= 0) {
			return visibleBankNames.join(', ');
		}

		return `${visibleBankNames.join(', ')} e mais ${remainingCount}`;
	}, [missingMonthlyBalanceBanks]);
	const bankCarouselItems = React.useMemo<HomeBankCarouselItem[]>(() => {
		const bankItems = bankBalances.map<HomeBankCarouselItem>(bank => ({
			...bank,
			kind: 'bank',
		}));

		if (!cashSummary) {
			return bankItems;
		}

		return [
			...bankItems,
			{
				...cashSummary,
				kind: 'cash',
			},
		];
	}, [bankBalances, cashSummary]);

	const handleOpenBankCarouselItem = React.useCallback((item: HomeBankCarouselItem) => {
		if (item.kind === 'cash') {
			router.push({
				pathname: '/bank-movements',
				params: {
					cashView: 'true',
				},
			});
			return;
		}

		router.push({
			pathname: '/bank-movements',
			params: {
				bankId: item.id,
				bankName: encodeURIComponent(item.name),
			},
		});
	}, []);

	const investmentPalette = React.useMemo(
		() => ({
			title: isDarkMode ? '#F8FAFC' : '#0F172A',
			subtitle: isDarkMode ? '#94A3B8' : '#64748B',
			chartCenterBackground: isDarkMode ? '#081120' : '#FFFFFF',
			simulatedColor: isDarkMode ? '#34D399' : '#059669',
		}),
		[isDarkMode],
	);
	const bankOverviewSkeletonPalette = React.useMemo(
		() => buildBankCardPalette(HOME_BANK_OVERVIEW_SKELETON_CARD_COLOR, isDarkMode),
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

	React.useEffect(() => {
		if (overview.loading) {
			setDismissedMonthlyBalancePromptKey(null);
			setIsMonthlyBalanceModalOpen(false);
		}
	}, [overview.loading]);

	React.useEffect(() => {
		if (
			overview.loading ||
			overview.error ||
			!monthlyBalancePromptKey ||
			dismissedMonthlyBalancePromptKey === monthlyBalancePromptKey
		) {
			return;
		}

		setIsMonthlyBalanceModalOpen(true);
	}, [
		dismissedMonthlyBalancePromptKey,
		monthlyBalancePromptKey,
		overview.error,
		overview.loading,
	]);

	const handleCloseMonthlyBalanceModal = React.useCallback(() => {
		if (monthlyBalancePromptKey) {
			setDismissedMonthlyBalancePromptKey(monthlyBalancePromptKey);
		}

		setIsMonthlyBalanceModalOpen(false);
	}, [monthlyBalancePromptKey]);

	const handleOpenMonthlyBalanceRegistration = React.useCallback(() => {
		if (monthlyBalancePromptKey) {
			setDismissedMonthlyBalancePromptKey(monthlyBalancePromptKey);
		}

		setIsMonthlyBalanceModalOpen(false);
		router.push('/register-monthly-balance');
	}, [monthlyBalancePromptKey]);

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

		return {
			backgroundColor: accentColor,
			borderColor: accentColor,
			textPrimary: '#FFFFFF',
			textSecondary: 'rgba(255,255,255,0.78)',
			shadowColor: hexToRgba(accentColor, isDarkMode ? 0.38 : 0.22) ?? accentColor,
		};
	}, [isDarkMode, selectedInvestmentPopoverColor]);
	const monthlyBalanceModalPalette = React.useMemo(
		() => ({
			iconBackground: isDarkMode ? 'rgba(250, 204, 21, 0.16)' : '#FEF9C3',
			iconColor: isDarkMode ? '#FDE047' : '#CA8A04',
			submitIconColor: isDarkMode ? '#0F172A' : '#FFFFFF',
		}),
		[isDarkMode],
	);

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
			cardBorder: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(226, 232, 240, 1)',
			emptySurface: isDarkMode ? '#020617' : '#F8FAFC',
			timelineBase: isDarkMode ? '#243041' : '#CBD5E1',
		}),
		[isDarkMode],
	);

	React.useEffect(() => {
		const visibleIds = new Set(timelineMovements.map(movement => getHomeTimelineItemKey(movement)));
		setExpandedTimelineStatuses(previousState => previousState.filter(id => visibleIds.has(id)));
	}, [timelineMovements]);

	const formatSignedCurrencyBRL = React.useCallback(
		(movement: HomeTimelineMovement) => {
			const formattedValue = formatCurrencyBRL(movement.valueInCents);
			if (formattedValue === HIDDEN_VALUE_PLACEHOLDER) {
				return formattedValue;
			}

			if (movement.type === 'sync') {
				return formattedValue;
			}

			return `${movement.type === 'gain' ? '+' : '-'}${formattedValue}`;
		},
		[formatCurrencyBRL],
	);

	const formatDeltaCurrencyBRL = React.useCallback(
		(valueInCents: number | null | undefined) => {
			const formattedValue = formatCurrencyBRL(Math.abs(valueInCents ?? 0));
			if (formattedValue === HIDDEN_VALUE_PLACEHOLDER) {
				return formattedValue;
			}

			if (typeof valueInCents !== 'number') {
				return 'Sem variação';
			}

			const prefix = valueInCents >= 0 ? '+' : '-';
			return `${prefix}${formattedValue}`;
		},
		[formatCurrencyBRL],
	);

	const getInvestmentSyncReasonLabel = React.useCallback(
		(reason: HomeTimelineMovement['investmentSyncReason']) => {
			if (reason === 'deposit') {
				return 'Sincronização antes do aporte';
			}

			if (reason === 'withdrawal') {
				return 'Sincronização antes do resgate';
			}

			return 'Sincronização manual';
		},
		[],
	);

	const formatMovementCompactDate = React.useCallback((value: Date | null) => {
		if (!value) {
			return 'Sem data';
		}

		return new Intl.DateTimeFormat('pt-BR', {
			day: '2-digit',
			month: '2-digit',
		}).format(value);
	}, []);

	const getTimelineTone = React.useCallback(
		(movement: HomeTimelineMovement) => HOME_TIMELINE_TONES[resolveHomeTimelineToneKey(movement)],
		[],
	);

	const resolveTimelineTypeLabel = React.useCallback((movement?: HomeTimelineMovement | null) => {
		if (!movement) {
			return '';
		}

		if (movement.isBankTransfer) {
			if (movement.bankTransferDirection === 'outgoing') {
				return 'Transferência enviada';
			}
			if (movement.bankTransferDirection === 'incoming') {
				return 'Transferência recebida';
			}
			return 'Transferência entre bancos';
		}

		if (movement.isFinanceInvestmentSync) {
			return 'Sincronização de investimento';
		}

		if (movement.isInvestmentDeposit) {
			return 'Aporte de investimento';
		}

		if (movement.isInvestmentRedemption) {
			return 'Resgate de investimento';
		}

		return movement.type === 'gain' ? 'Ganho' : 'Despesa';
	}, []);

	const getFallbackTimelineIcon = React.useCallback((movement: HomeTimelineMovement): TagIconSelection => {
		if (movement.isFinanceInvestmentSync) {
			return { iconFamily: 'ionicons', iconName: 'sync-outline' };
		}

		if (movement.isBankTransfer) {
			return { iconFamily: 'ionicons', iconName: 'swap-horizontal-outline' };
		}

		if (movement.isInvestmentRedemption) {
			return { iconFamily: 'ionicons', iconName: 'arrow-down-circle-outline' };
		}

		if (movement.isInvestmentDeposit) {
			return { iconFamily: 'ionicons', iconName: 'arrow-up-circle-outline' };
		}

		if (movement.isFromMandatory) {
			return { iconFamily: 'ionicons', iconName: 'shield-checkmark-outline' };
		}

		if (movement.moneyFormat) {
			return { iconFamily: 'ionicons', iconName: 'cash-outline' };
		}

		return movement.type === 'gain'
			? { iconFamily: 'ionicons', iconName: 'trending-up-outline' }
			: { iconFamily: 'ionicons', iconName: 'trending-down-outline' };
	}, []);

	const getTimelineIcon = React.useCallback(
		(movement: HomeTimelineMovement): TagIconSelection => {
			if (movement.tagIconFamily && movement.tagIconName) {
				return {
					iconFamily: movement.tagIconFamily,
					iconName: movement.tagIconName,
					iconStyle: movement.tagIconStyle,
				};
			}

			return getFallbackTimelineIcon(movement);
		},
		[getFallbackTimelineIcon],
	);

	const getTimelineSummarySubtitle = React.useCallback(
		(movement: HomeTimelineMovement) => {
			if (movement.isFinanceInvestmentSync) {
				return movement.investmentNameSnapshot
					? `${getInvestmentSyncReasonLabel(movement.investmentSyncReason)} em ${movement.investmentNameSnapshot}`
					: getInvestmentSyncReasonLabel(movement.investmentSyncReason);
			}

			if (movement.isBankTransfer) {
				return movement.bankTransferDirection === 'outgoing'
					? `Transferência para ${movement.bankTransferTargetBankNameSnapshot ?? 'banco de destino'}`
					: `Transferência de ${movement.bankTransferSourceBankNameSnapshot ?? 'banco de origem'}`;
			}

			if (movement.isInvestmentRedemption) {
				return movement.investmentNameSnapshot
					? `Resgate de ${movement.investmentNameSnapshot}`
					: 'Resgate de investimento';
			}

			if (movement.isInvestmentDeposit) {
				return movement.investmentNameSnapshot
					? `Aporte em ${movement.investmentNameSnapshot}`
					: 'Aporte de investimento';
			}

			if (movement.isFromMandatory) {
				return movement.type === 'gain'
					? 'Recebimento obrigatório concluído'
					: 'Pagamento obrigatório concluído';
			}

			if (movement.tagName?.trim()) {
				return movement.tagName.trim();
			}

			return resolveTimelineTypeLabel(movement);
		},
		[getInvestmentSyncReasonLabel, resolveTimelineTypeLabel],
	);

	const getTimelinePrimarySourceLabel = React.useCallback((movement: HomeTimelineMovement) => {
		if (movement.isFinanceInvestmentSync) {
			return movement.bankName?.trim() || 'Banco do investimento';
		}

		if (movement.isBankTransfer) {
			return movement.bankTransferSourceBankNameSnapshot?.trim() || movement.bankName || 'Banco de origem';
		}

		if (movement.moneyFormat) {
			return 'Dinheiro em espécie';
		}

		if (movement.bankName?.trim()) {
			return movement.bankName.trim();
		}

		return 'Sem banco vinculado';
	}, []);

	const getTimelineDetailMessage = React.useCallback(
		(movement: HomeTimelineMovement) => {
			if (movement.isFinanceInvestmentSync) {
				const investmentName = movement.investmentNameSnapshot ?? 'este investimento';
				if (movement.investmentSyncReason === 'deposit') {
					return `Valor real conferido antes do aporte em "${investmentName}".`;
				}

				if (movement.investmentSyncReason === 'withdrawal') {
					return `Valor real conferido antes do resgate em "${investmentName}".`;
				}

				return `Sincronização manual registrada para "${investmentName}".`;
			}

			if (movement.isFromMandatory) {
				return movement.type === 'gain'
					? 'Este lançamento marcou como recebido o ganho obrigatório do ciclo atual.'
					: 'Este lançamento marcou como pago o gasto obrigatório do ciclo atual.';
			}

			if (movement.isBankTransfer) {
				return movement.bankTransferDirection === 'outgoing'
					? `Transferência enviada para ${movement.bankTransferTargetBankNameSnapshot ?? 'o banco de destino'}.`
					: `Transferência recebida de ${movement.bankTransferSourceBankNameSnapshot ?? 'o banco de origem'}.`;
			}

			if (movement.isInvestmentRedemption) {
				return movement.investmentNameSnapshot
					? `Resgate automático do investimento "${movement.investmentNameSnapshot}".`
					: 'Resgate automático registrado para este investimento.';
			}

			if (movement.isInvestmentDeposit) {
				return movement.investmentNameSnapshot
					? `Aporte automático no investimento "${movement.investmentNameSnapshot}".`
					: 'Aporte automático registrado para este investimento.';
			}

			if (movement.explanation?.trim()) {
				return movement.explanation.trim();
			}

			if (movement.tagName?.trim()) {
				return `Lançamento classificado na tag "${movement.tagName.trim()}".`;
			}

			if (movement.moneyFormat) {
				return 'Lançamento recente registrado em dinheiro.';
			}

			if (movement.bankName?.trim()) {
				return `Lançamento recente vinculado ao banco ${movement.bankName.trim()}.`;
			}

			return 'Lançamento recente registrado na timeline da Home.';
		},
		[],
	);

	return (
		<SafeAreaView
			className="flex-1"
			edges={['left', 'right', 'bottom']}
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
							Olá, {greetingFirstName}! Esse é seu resumo financeiro.
						</Heading>
						<HomeScreenIllustration width="40%" height="40%" className="opacity-90" />
					</VStack>
				</View>

				<View
					className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
					style={{ marginTop: heroHeight - 64 }}
				>
					<View className="flex-1 w-full">
						<ScrollView
							className="flex-1 w-full"
							contentContainerStyle={{ paddingBottom: 16 }}
							showsVerticalScrollIndicator={false}
							onScrollBeginDrag={handleDismissInvestmentPopover}
							onMomentumScrollBegin={handleDismissInvestmentPopover}
							refreshControl={
								<RefreshControl
									refreshing={isRefreshing}
									onRefresh={() => void handleRefresh()}
									tintColor="#FACC15"
								/>
							}
						>
							<View className="mb-6 mt-4">
								<VStack className="px-2 pb-3">
									<HStack className="gap-1 items-center">
										<Heading
											className="text-lg uppercase tracking-widest "
											size="lg"
										>
											Meus Bancos e Dinheiro
										</Heading>

										<Popover
											placement="bottom"
											size="md"
											offset={0}
											shouldFlip
											focusScope={false}
											trapFocus={false}
											trigger={triggerProps => (
												<Pressable
													{...triggerProps}
													hitSlop={8}
													accessibilityRole="button"
													accessibilityLabel="Informações sobre o formato de pagamento"
												>
													<Info
														size={14}
														color={isDarkMode ? '#94A3B8' : '#64748B'}
														style={{ marginLeft: 4 }}
													/>
												</Pressable>
											)}
										>
											<PopoverBackdrop className="bg-transparent" />
											<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
												<PopoverBody className="px-3 py-3">
													<Text className={`${bodyText} text-xs leading-5`}>
														Exibimos aqui um resumo dos seus bancos e do dinheiro em espécie que você registrou. Toque em cada cartão para ver detalhes e movimentações específicas de cada um.
														Se você não vê um banco ou valor que espera, verifique se eles estão registrados corretamente na seção de movimentações bancárias. Os dados aqui refletem o que foi registrado lá.
													</Text>
												</PopoverBody>
											</PopoverContent>
										</Popover>
									</HStack>
								</VStack>

								{overview.loading && bankCarouselItems.length === 0 ? (
									<HomeBankOverviewSkeleton
										bankCarouselHeight={bankCarouselHeight}
										cardPalette={bankOverviewSkeletonPalette}
										skeletonBaseColor={skeletonBaseColor}
										skeletonHighlightColor={skeletonHighlightColor}
										paginationBaseColor={skeletonBaseColor}
										paginationHighlightColor={skeletonHighlightColor}
									/>
								) : overview.error ? (
									<Text className="mt-4 text-sm text-red-600 dark:text-red-400">{overview.error}</Text>
								) : bankCarouselItems.length > 0 ? (
									<View className="mt-4">
										<Carousel
											ref={bankCarouselRef}
											width={bankCarouselWidth}
											height={bankCarouselHeight}
											data={bankCarouselItems}
											loop={bankCarouselItems.length > 1}
											enabled={bankCarouselItems.length > 1}
											pagingEnabled
											snapEnabled
											onProgressChange={bankCarouselProgress}
											renderItem={({ item }) => {
												const monthlyExpenseInCents =
													item.kind === 'cash'
														? item.currentMonthExpensesInCents
														: currentMonthExpensesByBankId[item.id] ?? 0;
												const monthlyGainInCents =
													item.kind === 'cash'
														? item.currentMonthGainsInCents
														: currentMonthGainsByBankId[item.id] ?? 0;
												const cardPalette = buildBankCardPalette(
													item.kind === 'cash' ? CASH_CARD_COLOR : item.colorHex,
													isDarkMode,
												);

												return (
													<View
														style={{
															flex: 1,
															paddingHorizontal: bankCarouselItemSpacing / 2,
														}}
													>
														<TouchableOpacity
															activeOpacity={0.94}
															style={{ flex: 1 }}
															onPress={() => handleOpenBankCarouselItem(item)}
														>
															<BankCardSurface palette={cardPalette} style={{ flex: 1 }}>
																<VStack className="flex-1 justify-between">
																	<VStack className="gap-1">
																		<Text
																			className="text-xs uppercase tracking-wide"
																			style={{ color: cardPalette.textSecondary }}
																		>
																			{item.kind === 'cash' ? 'Carteira' : 'Banco'}
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
																			{item.kind === 'cash' ? 'Saldo no mês' : 'Saldo atual'}
																		</Text>
																		<Heading size="md" style={{ color: cardPalette.textPrimary }}>
																			{item.balanceInCents === null
																				? 'Saldo indisponível'
																				: formatCurrencyBRL(item.balanceInCents)}
																		</Heading>
																	</VStack>

																	<HStack className="mt-4 justify-between items-end gap-4">
																		<VStack className="flex-1 gap-1">
																			<Text
																				className="text-xs uppercase tracking-wide"
																				style={{ color: cardPalette.textSecondary }}
																			>
																				Gastos
																			</Text>
																			<Text
																				className="font-semibold"
																				style={{ color: cardPalette.expenseColor }}
																			>
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
																			<Text
																				className="font-semibold"
																				style={{ color: cardPalette.gainColor }}
																			>
																				{formatCurrencyBRL(monthlyGainInCents)}
																			</Text>
																		</VStack>
																	</HStack>
																</VStack>
															</BankCardSurface>
														</TouchableOpacity>
													</View>
												);
											}}
										/>

										<Pagination.Basic
											progress={bankCarouselProgress}
											data={bankCarouselItems}
											onPress={index =>
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
									<Text className="mt-4 text-slate-500 dark:text-slate-400">
										Nenhum dado disponível no momento.
									</Text>
								)}
							</View>

							<View className="mb-6">
								<VStack className="px-2 pb-3">
									<HStack className="gap-1 items-center">
										<Heading
											className="text-lg uppercase tracking-widest "
											size="lg"
										>
											Investimentos
										</Heading>

										<Popover
											placement="bottom"
											size="md"
											offset={0}
											shouldFlip
											focusScope={false}
											trapFocus={false}
											trigger={triggerProps => (
												<Pressable
													{...triggerProps}
													hitSlop={8}
													accessibilityRole="button"
													accessibilityLabel="Informações sobre o formato de pagamento"
												>
													<Info
														size={14}
														color={isDarkMode ? '#94A3B8' : '#64748B'}
														style={{ marginLeft: 4 }}
													/>
												</Pressable>
											)}
										>
											<PopoverBackdrop className="bg-transparent" />
											<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
												<PopoverBody className="px-3 py-3">
													<Text className={`${bodyText} text-xs leading-5`}>
														Exibimos aqui um resumo dos seus investimentos registrados. O gráfico de distribuição é baseado no valor atual/base dos investimentos, então se algum investimento não possui esse valor registrado ou ele é zero, ele não aparecerá na distribuição. Toque em cada fatia do gráfico para ver o valor atual/base de cada investimento.
														Se você não vê um investimento que espera, verifique se ele está registrado corretamente na seção de investimentos. Os dados aqui refletem o que foi registrado lá.
													</Text>
												</PopoverBody>
											</PopoverContent>
										</Popover>
									</HStack>
								</VStack>

								<View style={{ marginTop: 8 }}>
									{investments.error ? (
										<Text style={{ color: investmentPalette.subtitle }}>{investments.error}</Text>
									) : investments.loading && investmentPortfolio.investmentCount === 0 ? (
										<HomeInvestmentSkeleton
											investmentChartWidth={investmentChartWidth}
											investmentChartHeight={investmentChartHeight}
											surfaceBackground={surfaceBackground}
										/>
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

													<View style={{ position: 'absolute', top: 0, left: 0 }}>
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
												<View style={{ flex: 1, paddingRight: 12 }}>
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
									<TouchableOpacity activeOpacity={0.85} onPress={handleToggleMovements} style={{ flex: 1 }}>
										<VStack className="">
											<HStack className="gap-1 items-center">
												<Heading
													className="text-lg uppercase tracking-widest "
												>
													Últimas Movimentações
												</Heading>

												<Popover
													placement="bottom"
													size="md"
													offset={0}
													shouldFlip
													focusScope={false}
													trapFocus={false}
													trigger={triggerProps => (
														<Pressable
															{...triggerProps}
															hitSlop={8}
															accessibilityRole="button"
															accessibilityLabel="Informações sobre o formato de pagamento"
														>
															<Info
																size={14}
																color={isDarkMode ? '#94A3B8' : '#64748B'}
																style={{ marginLeft: 4 }}
															/>
														</Pressable>
													)}
												>
													<PopoverBackdrop className="bg-transparent" />
													<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
														<PopoverBody className="px-3 py-3">
															<Text className={`${bodyText} text-xs leading-5`}>
																Exibimos aqui um resumo das suas últimas movimentações financeiras, incluindo despesas, ganhos, transferências e sincronizações de investimento. Toque em cada movimentação para ver detalhes específicos como valor, data e descrição.
																Se você não vê uma movimentação que espera, verifique se ela está registrada corretamente na seção de movimentações. Os dados aqui refletem o que foi registrado lá.
															</Text>
														</PopoverBody>
													</PopoverContent>
												</Popover>
											</HStack>
										</VStack>
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
										<Icon
											as={isMovementsExpanded ? ChevronUpIcon : ChevronDownIcon}
											size="sm"
											className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}
										/>
									</TouchableOpacity>
								</HStack>

								{isMovementsExpanded ? (
									movements.loading && timelineMovements.length === 0 ? (
										<HomeMovementsSkeleton timelinePalette={timelinePalette} />
									) : timelineMovements.length > 0 ? (
										<View style={{ marginTop: 14 }}>
											{timelineMovements.map((movement, index) => {
												const tone = getTimelineTone(movement);
												const movementIcon = getTimelineIcon(movement);
												const timelineItemKey = getHomeTimelineItemKey(movement);
												const isTimelineItemExpanded = expandedTimelineStatuses.includes(timelineItemKey);
												const metadataItems = [
													{
														label: 'Tipo',
														value: resolveTimelineTypeLabel(movement),
														},
													{
														label: movement.isBankTransfer ? 'Origem' : 'Conta',
														value: getTimelinePrimarySourceLabel(movement),
													},
													{
														label: 'Data',
														value: formatMovementDate(movement.date),
													},
												];

												if (movement.isFinanceInvestmentSync) {
													metadataItems.push({
														label: 'Variação',
														value: formatDeltaCurrencyBRL(
															typeof movement.investmentSyncPreviousValueInCents === 'number'
																? movement.valueInCents - movement.investmentSyncPreviousValueInCents
																: null,
														),
													});
													metadataItems.push({
														label: 'Motivo',
														value: getInvestmentSyncReasonLabel(movement.investmentSyncReason),
													});
												}

												if (movement.isBankTransfer) {
													metadataItems.push({
														label: 'Destino',
														value:
															movement.bankTransferTargetBankNameSnapshot?.trim() ||
															movement.bankName ||
															'Banco de destino',
													});
												} else if (movement.investmentNameSnapshot?.trim()) {
													metadataItems.push({
														label: 'Investimento',
														value: movement.investmentNameSnapshot.trim(),
													});
												} else if (movement.tagName?.trim()) {
													metadataItems.push({
														label: 'Tag',
														value: movement.tagName.trim(),
													});
												}

												return (
													<View key={timelineItemKey} style={{ flexDirection: 'row' }}>
														<View
															style={{
																alignItems: 'center',
																width: '7%',
																paddingTop: 6,
															}}
														>
															<View
																style={{
																	width: 14,
																	height: 14,
																	borderRadius: 999,
																	backgroundColor: tone.accentColor,
																	borderWidth: 2,
																	borderColor: isDarkMode ? '#020617' : '#FFFFFF',
																	shadowColor: tone.accentColor,
																	shadowOpacity: isDarkMode ? 0.26 : 0.14,
																	shadowRadius: 8,
																	shadowOffset: { width: 0, height: 4 },
																	elevation: 2,
																}}
															/>
															{index < timelineMovements.length - 1 ? (
																<View
																	style={{
																		flex: 1,
																		width: 3,
																		borderRadius: 999,
																		marginVertical: 2,
																		backgroundColor: tone.lineColor,
																	}}
																/>
															) : (
																<View />
															)}
														</View>

														<View style={{ width: '93%', paddingBottom: 14 }}>
															<TouchableOpacity
																activeOpacity={0.85}
																onPress={() => handleToggleTimelineStatus(timelineItemKey)}
																style={{ width: '100%' }}
															>
																<HStack className="items-center justify-between gap-3">
																	<HStack className="items-center gap-3" style={{ flex: 1 }}>
																		<LinearGradient
																			colors={tone.iconGradient}
																			start={{ x: 0, y: 0 }}
																			end={{ x: 1, y: 1 }}
																			style={{
																				width: 44,
																				height: 44,
																				borderRadius: 16,
																				alignItems: 'center',
																				justifyContent: 'center',
																				flexShrink: 0,
																			}}
																		>
																			<TagIcon
																				iconFamily={movementIcon.iconFamily}
																				iconName={movementIcon.iconName}
																				iconStyle={movementIcon.iconStyle}
																				size={18}
																				color="#FFFFFF"
																			/>
																		</LinearGradient>

																		<View style={{ flex: 1 }}>
																			<Text
																				numberOfLines={1}
																				style={{
																					color: timelinePalette.title,
																					fontSize: 15,
																					fontWeight: '700',
																				}}
																			>
																				{movement.name}
																			</Text>
																			<Text
																				numberOfLines={1}
																				style={{
																					marginTop: 2,
																					color: timelinePalette.subtitle,
																					fontSize: 12,
																					lineHeight: 18,
																				}}
																			>
																				{getTimelineSummarySubtitle(movement)}
																			</Text>
																		</View>
																	</HStack>

																	<HStack className="items-center gap-2">
																		<VStack className="items-end">
																			<Text
																				style={{
																					color: tone.amountColor,
																					fontSize: 15,
																					fontWeight: '700',
																				}}
																			>
																				{formatSignedCurrencyBRL(movement)}
																			</Text>
																			{movement.isFinanceInvestmentSync ? (
																				<Text
																					style={{
																						marginTop: 2,
																						color: timelinePalette.subtitle,
																						fontSize: 11,
																					}}
																				>
																					{formatDeltaCurrencyBRL(
																						typeof movement.investmentSyncPreviousValueInCents === 'number'
																							? movement.valueInCents - movement.investmentSyncPreviousValueInCents
																							: null,
																					)}
																				</Text>
																			) : null}
																			<HStack className="mt-1 items-center gap-1">
																				<Icon
																					as={CalendarDaysIcon}
																					size="xs"
																					className={
																						isDarkMode ? 'text-slate-500' : 'text-slate-400'
																					}
																				/>
																				<Text
																					style={{
																						color: timelinePalette.subtitle,
																						fontSize: 11,
																					}}
																				>
																					{formatMovementCompactDate(movement.date)}
																				</Text>
																			</HStack>
																		</VStack>

																		<Icon
																			as={isTimelineItemExpanded ? ChevronUpIcon : ChevronDownIcon}
																			size="sm"
																			className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}
																		/>
																	</HStack>
																</HStack>
															</TouchableOpacity>

															{isTimelineItemExpanded ? (
																<LinearGradient
																	colors={tone.cardGradient}
																	start={{ x: 0, y: 0 }}
																	end={{ x: 1, y: 1 }}
																	style={{
																		marginTop: 10,
																		marginRight: 16,
																		borderRadius: 20,
																		paddingHorizontal: 16,
																		paddingVertical: 14,
																	}}
																>
																	<VStack className="gap-3">
																		<HStack className="items-start justify-between gap-4">
																			<VStack className="flex-1">
																				<Text
																					style={{
																						fontSize: 10,
																						fontWeight: '700',
																						letterSpacing: 0.4,
																						color: 'rgba(255,255,255,0.74)',
																						textTransform: 'uppercase',
																					}}
																				>
																					Resumo
																				</Text>
																				<Text
																					style={{
																						fontSize: 13,
																						lineHeight: 19,
																						color: '#FFFFFF',
																					}}
																				>
																					{getTimelineDetailMessage(movement)}
																				</Text>
																			</VStack>

																			<VStack className="items-end">
																				<Text
																					style={{
																						fontSize: 10,
																						fontWeight: '700',
																						letterSpacing: 0.4,
																						color: 'rgba(255,255,255,0.74)',
																						textTransform: 'uppercase',
																					}}
																				>
																					Valor
																				</Text>
																				<Heading size="sm" style={{ color: '#FFFFFF' }}>
																					{formatSignedCurrencyBRL(movement)}
																				</Heading>
																			</VStack>
																		</HStack>

																		<View
																			style={{
																				flexDirection: 'row',
																				flexWrap: 'wrap',
																				columnGap: 14,
																				rowGap: 10,
																			}}
																		>
																			{metadataItems.map(item => (
																				<View
																					key={`${movement.id}-${item.label}`}
																					style={{
																						width: '46%',
																						minWidth: 128,
																					}}
																				>
																					<Text
																						style={{
																							fontSize: 10,
																							fontWeight: '700',
																							letterSpacing: 0.4,
																							color: 'rgba(255,255,255,0.72)',
																							textTransform: 'uppercase',
																						}}
																					>
																						{item.label}
																					</Text>
																					<Text
																						style={{
																							marginTop: 3,
																							fontSize: 13,
																							lineHeight: 18,
																							color: '#FFFFFF',
																						}}
																					>
																						{item.value}
																					</Text>
																				</View>
																			))}
																		</View>

																		{movement.explanation?.trim() &&
																		getTimelineDetailMessage(movement) !== movement.explanation.trim() ? (
																			<View style={{ paddingTop: 2 }}>
																				<Text
																					style={{
																						fontSize: 10,
																						fontWeight: '700',
																						letterSpacing: 0.4,
																						color: 'rgba(255,255,255,0.72)',
																						textTransform: 'uppercase',
																					}}
																				>
																					Descrição
																				</Text>
																				<Text
																					style={{
																						marginTop: 6,
																						fontSize: 13,
																						lineHeight: 18,
																						color: '#FFFFFF',
																					}}
																				>
																					{movement.explanation.trim()}
																				</Text>
																			</View>
																		) : null}
																	</VStack>
																</LinearGradient>
															) : null}
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

								{movements.error ? (
									<Text className="mt-3 text-sm text-amber-600 dark:text-amber-400">
										{movements.error}
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

					<Modal isOpen={isMonthlyBalanceModalOpen} onClose={handleCloseMonthlyBalanceModal}>
						<ModalBackdrop />
						<ModalContent className={`max-w-[380px] ${modalContentClassName}`}>
							<ModalHeader>
								<ModalTitle>Saldo mensal pendente</ModalTitle>
								<ModalCloseButton onPress={handleCloseMonthlyBalanceModal} />
							</ModalHeader>

							<ModalBody>
								<VStack className="gap-4">
									<HStack className="items-start gap-3">
										<View
											className="h-11 w-11 items-center justify-center rounded-2xl"
											style={{
												backgroundColor: monthlyBalanceModalPalette.iconBackground,
											}}
										>
											<CalendarDays size={22} color={monthlyBalanceModalPalette.iconColor} />
										</View>

										<VStack className="flex-1 gap-1">
											<Text className={`${bodyText} text-sm leading-5`}>
												Registre o saldo mensal de {currentMonthReferenceLabel} para manter o
												resumo dos bancos correto.
											</Text>
											<Text className={`${helperText} text-xs leading-4`}>
												{missingMonthlyBalanceBanks.length === 1
													? `Conta pendente: ${missingMonthlyBalanceBankNamesPreview}.`
													: `Contas pendentes: ${missingMonthlyBalanceBankNamesPreview}.`}
											</Text>
										</VStack>
									</HStack>
								</VStack>
							</ModalBody>

							<ModalFooter className="pt-2">
								<HStack className="w-full items-center gap-3 pt-4">
									<Button
										action="secondary"
										className={`${submitButtonCancelClassName} min-w-0 flex-1 px-3`}
										onPress={handleCloseMonthlyBalanceModal}
									>
										<ButtonText
											className={`${bodyText} text-center text-sm`}
											numberOfLines={1}
											adjustsFontSizeToFit
											minimumFontScale={0.86}
										>
											Agora não
										</ButtonText>
									</Button>

									<Button
										className={`${submitButtonClassName} min-w-0 flex-1 px-3`}
										onPress={handleOpenMonthlyBalanceRegistration}
									>
										<CalendarDays size={16} color={monthlyBalanceModalPalette.submitIconColor} />
										<ButtonText
											className={`${submitButtonTextClassName} text-center text-sm`}
											numberOfLines={1}
											adjustsFontSizeToFit
											minimumFontScale={0.86}
										>
											Registrar saldo
										</ButtonText>
									</Button>
								</HStack>
							</ModalFooter>
						</ModalContent>
					</Modal>
				</View>
			</View>
		</SafeAreaView>
	);
}
