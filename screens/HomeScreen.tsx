import React from 'react';
import {
	Image as RNImage,
	Pressable,
	ScrollView,
	StatusBar,
	StyleSheet,
	TouchableOpacity,
	View,
	type GestureResponderEvent,
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Carousel, { Pagination, type ICarouselInstance } from 'react-native-reanimated-carousel';
import { useSharedValue } from 'react-native-reanimated';

import { auth } from '@/FirebaseConfig';
import { type HomeTimelineMovement } from '@/functions/HomeFirebase';
import { getUserDataFirebase } from '@/functions/RegisterUserFirebase';
import { useHomeScreenData } from '@/hooks/useHomeScreenData';
import Navigator from '@/components/uiverse/navigator';
import { Badge, BadgeText } from '@/components/ui/badge';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useAppTheme } from '@/contexts/ThemeContext';
import { HIDDEN_VALUE_PLACEHOLDER, useValueVisibility } from '@/contexts/ValueVisibilityContext';
import { PieChart } from 'react-native-gifted-charts';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
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

type HomeTimelineStatus = {
	title: string;
	subtitle: string;
	status: string;
	renderContent?: React.ReactNode;
	movement: HomeTimelineMovement;
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

const TIMELINE_CHEVRON_DOWN = require('react-native-vertical-status-progress/lib/commonjs/assets/chevron-down.png');
const TIMELINE_CHEVRON_UP = require('react-native-vertical-status-progress/lib/commonjs/assets/chevron-up.png');

const INVESTMENT_PIE_COLOR_PALETTE = ['#FACC15', '#F59E0B', '#FDE047', '#EAB308', '#FBBF24', '#CA8A04', '#FCD34D', '#D97706'];
const INVESTMENT_CHART_INITIAL_ANGLE = -Math.PI / 2;
const INVESTMENT_CHART_PADDING_HORIZONTAL = 28;
const INVESTMENT_CHART_PADDING_VERTICAL = 12;
const INVESTMENT_CHART_TOUCH_OUTER_TOLERANCE = 8;
const INVESTMENT_CHART_TOUCH_INNER_TOLERANCE = 6;

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

	return 0.2126 * toLinear(rgb.red) + 0.7152 * toLinear(rgb.green) + 0.0722 * toLinear(rgb.blue);
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

	return {
		baseColor,
		glowColor,
		highlightColor,
		textPrimary,
		textSecondary,
		expenseColor: '#FFFFFF',
		gainColor: '#FFFFFF',
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

export default function HomeScreen() {
	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { width: windowWidth, height: windowHeight } = useWindowDimensions();
	const surfaceBackground = isDarkMode ? '#020617' : '#ffffff';
	const cardBackground = isDarkMode ? 'bg-slate-950' : 'bg-white';
	const bankCarouselRef = React.useRef<ICarouselInstance>(null);
	const bankCarouselProgress = useSharedValue(0);
	const { shouldHideValues } = useValueVisibility();
	const bankCarouselWidth = Math.max(windowWidth - 48, 1);
	const bankCarouselHeight = 176;
	const bankCarouselItemSpacing = 16;
	const heroHeight = Math.max(windowHeight * 0.28, 250) + insets.top;
	const currentUserId = auth.currentUser?.uid ?? null;
	const authDisplayFirstName = extractFirstName(auth.currentUser?.displayName);
	const { overview, movements, investments } = useHomeScreenData(currentUserId);

	const [isMovementsExpanded, setIsMovementsExpanded] = React.useState(true);
	const [expandedTimelineStatuses, setExpandedTimelineStatuses] = React.useState<string[]>([]);
	const [currentUserFirstName, setCurrentUserFirstName] = React.useState<string | null>(authDisplayFirstName);
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

	const bankBalances = overview.data.bankBalances;
	const currentMonthExpensesByBankId = overview.data.currentMonthExpensesByBankId;
	const currentMonthGainsByBankId = overview.data.currentMonthGainsByBankId;
	const bankColorsById = movements.data.bankColorsById;
	const timelineMovements = movements.data.timelineMovements;
	const investmentPortfolio = investments.data.portfolio;

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

		return {
			backgroundColor: accentColor,
			borderColor: accentColor,
			textPrimary: '#FFFFFF',
			textSecondary: 'rgba(255,255,255,0.78)',
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

	const timelineStatuses = React.useMemo<HomeTimelineStatus[]>(
		() =>
			timelineMovements.map((movement, index) => {
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
								<View style={{ marginTop: 16 }}>
									<Text style={{ color: movementCardPalette.bodyColor, fontSize: 12, lineHeight: 18 }}>
										{movement.explanation}
									</Text>
								</View>
							) : null}
						</View>
					),
					subtitle,
				};
			}),
		[
			formatCurrencyBRL,
			formatMovementDate,
			getTimelineBadgeLabel,
			getTimelineContextLabel,
			isDarkMode,
			timelineMovements,
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
			const movement = timelineMovements[index];
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
			timelineMovements,
			timelinePalette.timelineBase,
		],
	);

	const renderTimelineStick = React.useCallback(
		(_: unknown, index: number) => {
			const movement = timelineMovements[index];
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
		[getTimelineAccentColor, isDarkMode, timelineMovements, timelinePalette.timelineBase],
	);

	const renderSectionChevron = React.useCallback(
		(isOpen: boolean, tintColor: string) => (
			<RNImage
				source={isOpen ? TIMELINE_CHEVRON_UP : TIMELINE_CHEVRON_DOWN}
				style={{
					width: 18,
					height: 14,
					tintColor,
				}}
				resizeMode="contain"
			/>
		),
		[],
	);

	const renderTimelineChevron = React.useCallback(
		(isOpen: boolean) => renderSectionChevron(isOpen, timelinePalette.subtitle),
		[renderSectionChevron, timelinePalette.subtitle],
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
						>
							<View className="mb-6 mt-4">
								<Heading size="lg">Meus Bancos</Heading>
								<Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
									Visão geral dos saldos atuais por banco e seus gastos e ganhos do mês.
								</Text>

								{overview.loading && bankBalances.length === 0 ? (
									<Text className="mt-4 text-slate-500 dark:text-slate-400">Carregando bancos...</Text>
								) : bankBalances.length > 0 ? (
									<View className="mt-4">
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
										Nenhum banco registrado
									</Text>
								)}
							</View>

							<View className="mb-6">
								<Heading size="lg">Investimentos</Heading>
								<Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
									Distribuição atual da carteira.
								</Text>

								<View style={{ marginTop: 8 }}>
									{investments.error ? (
										<Text style={{ color: investmentPalette.subtitle }}>{investments.error}</Text>
									) : investments.loading && investmentPortfolio.investmentCount === 0 ? (
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
									movements.loading && timelineStatuses.length === 0 ? (
										<View style={{ marginTop: 10, paddingHorizontal: 16, paddingVertical: 18 }}>
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
													<View key={status.status} style={{ flexDirection: 'row' }}>
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

														<View style={{ width: '93%', paddingBottom: 12 }}>
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
																				<BadgeText style={{ color: bankBadgePalette.textColor }}>
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

																<View style={{ width: '12%', alignItems: 'flex-start' }}>
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
				</View>
			</View>
		</SafeAreaView>
	);
}
