import React from "react";
import {
	ArrowDownCircle,
	ArrowLeftRight,
	ArrowUpCircle,
	CalendarDays,
	ChevronDown,
	ChevronUp,
	Eye,
	EyeOff,
	Info,
	RefreshCw,
	WalletCards,
} from "lucide-react";
import {
	Image as RNImage,
	Pressable,
	RefreshControl,
	ScrollView,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PieChart } from "react-native-gifted-charts";
import Carousel from "@/components/web/Carousel";
import AnimatedContent from "@/components/web/AnimatedContent";
import Grainient from "@/components/web/Grainient";
import StrokeText from "@/components/web/StrokeText";
import HomeExpenseChart from "@/components/uiverse/home-expense-chart";
import HomeExpenseLineChart from "@/components/uiverse/home-expense-line-chart";
import HomeActivityHeatmap from "@/components/uiverse/home-activity-heatmap";

import Navigator from "@/components/uiverse/navigator";
import {
	BankCardSurface,
	CASH_CARD_COLOR,
	buildBankCardPalette,
	type BankCardPalette,
} from "@/components/uiverse/bank-card-surface";
import {
	Popover,
	PopoverBackdrop,
	PopoverBody,
	PopoverContent,
} from "@/components/ui/popover";
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from "@/components/ui/modal";
import { Button, ButtonText } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
	HIDDEN_VALUE_PLACEHOLDER,
	useValueVisibility,
} from "@/contexts/ValueVisibilityContext";
import {
	type HomeBankBalanceCard,
	type HomeCashSummary,
	type HomeMandatoryItem,
	type HomeTimelineMovement,
} from "@/functions/HomeFirebase";
import { useHomeScreenData } from "@/hooks/useHomeScreenData";
import { TagIcon, type TagIconSelection } from "@/hooks/useTagIcons";
import {
	useScreenStyles,
	WEB_DASHBOARD_CLASS_NAMES,
	WEB_DASHBOARD_DOM_STYLES,
} from "@/hooks/useScreenStyle";
import { getUserDataFirebase } from "@/functions/RegisterUserFirebase";
import { APP_ROUTE_PATHS, navigateToRoute } from "@/utils/navigation";
import LoginWallpaper from "../assets/Background/wallpaper01.png";
import HomeScreenIllustration from "../assets/UnDraw/homeScreen.svg";

type WebBankItem =
	| ({ kind: "bank" } & HomeBankBalanceCard)
	| ({ kind: "cash" } & HomeCashSummary);

type WebDashboardPalette = {
	border: string;
	primaryText: string;
	secondaryText: string;
	surfaceMuted: string;
};

const webStyles = WEB_DASHBOARD_CLASS_NAMES;

const INVESTMENT_COLORS = [
	"#FACC15",
	"#F59E0B",
	"#FDE047",
	"#EAB308",
	"#FBBF24",
	"#CA8A04",
	"#FCD34D",
	"#D97706",
];

const formatCurrency = (valueInCents: number, hidden: boolean) => {
	if (hidden) return HIDDEN_VALUE_PLACEHOLDER;
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		minimumFractionDigits: 2,
	}).format(valueInCents / 100);
};

const firstName = (name: string | null | undefined) =>
	name?.trim().split(/\s+/)[0] || "por aqui";

const formatDate = (date: Date | null) =>
	date
		? new Intl.DateTimeFormat("pt-BR", {
			day: "2-digit",
			month: "2-digit",
		}).format(date)
		: "Sem data";

const formatMandatoryDueDate = (item: HomeMandatoryItem) => {
	if (item.isOverdue) return `Atrasado · ${formatDate(item.dueDate)}`;

	const today = new Date();
	const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const startOfDueDate = new Date(
		item.dueDate.getFullYear(),
		item.dueDate.getMonth(),
		item.dueDate.getDate(),
	);
	const daysUntilDue = Math.round(
		(startOfDueDate.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000),
	);

	if (daysUntilDue === 0) return "Hoje";
	if (daysUntilDue === 1) return "Amanhã";
	return formatDate(item.dueDate);
};

const MandatoryScheduleColumn = ({
	items,
	type,
	palette,
	hidden,
	}: {
	items: HomeMandatoryItem[];
	type: HomeMandatoryItem["type"];
	palette: WebDashboardPalette;
	hidden: boolean;
}) => {
	const isExpense = type === "expense";
	const accent = isExpense ? "#EF4444" : "#10B981";
	const Icon = isExpense ? ArrowDownCircle : ArrowUpCircle;

	return (
		<View
			className={webStyles.mandatoryColumn}
			style={{ borderColor: palette.border }}
		>
			<View className={webStyles.mandatoryColumnHeader}>
				<View
					className={webStyles.mandatoryColumnIcon}
					style={{ backgroundColor: `${accent}1A` }}
				>
					<Icon size={18} color={accent} />
				</View>
				<View className={webStyles.mandatoryColumnCopy}>
					<Text
						accessibilityRole="header"
						className={webStyles.mandatoryColumnTitle}
						style={{ color: palette.primaryText }}
					>
						{isExpense ? "Gastos obrigatórios" : "Ganhos obrigatórios"}
					</Text>
					<Text
						className={webStyles.mandatoryColumnHelper}
						style={{ color: palette.secondaryText }}
					>
						{isExpense ? "Próximas saídas" : "Próximas entradas"}
					</Text>
				</View>
			</View>

			{items.length === 0 ? (
				<Text
					className={webStyles.mandatoryEmptyText}
					style={{ color: palette.secondaryText }}
				>
					Nenhum compromisso pendente.
				</Text>
			) : (
				<View className={webStyles.mandatoryItems}>
					{items.map((item) => (
						<View key={`${item.type}:${item.id}`} className={webStyles.mandatoryItem}>
							<View
								className={webStyles.mandatoryDateChip}
								style={{ borderColor: `${accent}55` }}
							>
								<Text
									className={webStyles.mandatoryDateText}
									style={{ color: accent }}
								>
									{formatMandatoryDueDate(item)}
								</Text>
							</View>
							<View className={webStyles.mandatoryItemCopy}>
								<Text
									numberOfLines={1}
									className={`${webStyles.mandatoryItemName} truncate`}
									style={{ color: palette.primaryText }}
								>
									{item.name}
								</Text>
								<View className={webStyles.mandatoryItemMeta}>
									<Text
										className={webStyles.mandatoryItemInstallment}
										style={{ color: palette.secondaryText }}
									>
										{item.installmentLabel ?? "Ciclo mensal"}
									</Text>
									<Text
										className={webStyles.mandatoryItemAmount}
										style={{ color: accent }}
									>
										{formatCurrency(item.valueInCents, hidden)}
									</Text>
								</View>
							</View>
						</View>
					))}
				</View>
			)}
		</View>
	);
};

const movementTone = (movement: HomeTimelineMovement) => {
	if (movement.isFinanceInvestmentSync)
		return {
			accent: "#14B8A6",
			gradient: ["#0F766E", "#2DD4BF"] as [string, string],
			prefix: "",
		};
	if (movement.isBankTransfer)
		return {
			accent: "#F59E0B",
			gradient: ["#92400E", "#F59E0B"] as [string, string],
			prefix: "",
		};
	if (movement.isInvestmentRedemption)
		return {
			accent: "#38BDF8",
			gradient: ["#0C4A6E", "#38BDF8"] as [string, string],
			prefix: "-",
		};
	if (movement.isInvestmentDeposit)
		return {
			accent: "#7C3AED",
			gradient: ["#312E81", "#7C3AED"] as [string, string],
			prefix: "+",
		};
	if (movement.isFromMandatory)
		return {
			accent: "#10B981",
			gradient: ["#047857", "#34D399"] as [string, string],
			prefix: movement.type === "gain" ? "+" : "-",
		};
	return movement.type === "gain"
		? {
			accent: "#10B981",
			gradient: ["#047857", "#34D399"] as [string, string],
			prefix: "+",
		}
		: {
			accent: "#EF4444",
			gradient: ["#B91C1C", "#EF4444"] as [string, string],
			prefix: "-",
		};
};

const movementIcon = (movement: HomeTimelineMovement): TagIconSelection => {
	if (movement.tagIconFamily && movement.tagIconName)
		return {
			iconFamily: movement.tagIconFamily,
			iconName: movement.tagIconName,
			iconStyle: movement.tagIconStyle,
		};
	if (movement.isFinanceInvestmentSync)
		return { iconFamily: "ionicons", iconName: "sync-outline" };
	if (movement.isBankTransfer)
		return { iconFamily: "ionicons", iconName: "swap-horizontal-outline" };
	if (movement.isInvestmentRedemption)
		return { iconFamily: "ionicons", iconName: "arrow-down-circle-outline" };
	if (movement.isInvestmentDeposit)
		return { iconFamily: "ionicons", iconName: "arrow-up-circle-outline" };
	if (movement.isFromMandatory)
		return { iconFamily: "ionicons", iconName: "shield-checkmark-outline" };
	if (movement.moneyFormat)
		return { iconFamily: "ionicons", iconName: "cash-outline" };
	return movement.type === "gain"
		? { iconFamily: "ionicons", iconName: "trending-up-outline" }
		: { iconFamily: "ionicons", iconName: "trending-down-outline" };
};

const movementLabel = (movement: HomeTimelineMovement) => {
	if (movement.isBankTransfer)
		return movement.bankTransferDirection === "outgoing"
			? "Transferência enviada"
			: "Transferência recebida";
	if (movement.isFinanceInvestmentSync) return "Sincronização de investimento";
	if (movement.isInvestmentDeposit) return "Aporte de investimento";
	if (movement.isInvestmentRedemption) return "Resgate de investimento";
	return movement.type === "gain" ? "Ganho" : "Despesa";
};

const movementSubtitle = (movement: HomeTimelineMovement) => {
	if (movement.isFinanceInvestmentSync)
		return movement.investmentNameSnapshot
			? `Sincronização em ${movement.investmentNameSnapshot}`
			: "Sincronização manual";
	if (movement.isBankTransfer)
		return movement.bankTransferDirection === "outgoing"
			? `Transferência para ${movement.bankTransferTargetBankNameSnapshot ?? "banco de destino"}`
			: `Transferência de ${movement.bankTransferSourceBankNameSnapshot ?? "banco de origem"}`;
	if (movement.isInvestmentRedemption)
		return movement.investmentNameSnapshot
			? `Resgate de ${movement.investmentNameSnapshot}`
			: "Resgate de investimento";
	if (movement.isInvestmentDeposit)
		return movement.investmentNameSnapshot
			? `Aporte em ${movement.investmentNameSnapshot}`
			: "Aporte de investimento";
	if (movement.isFromMandatory)
		return movement.type === "gain"
			? "Recebimento obrigatório concluído"
			: "Pagamento obrigatório concluído";
	return movement.tagName?.trim() || movementLabel(movement);
};

const movementDetail = (movement: HomeTimelineMovement) => {
	if (movement.isFinanceInvestmentSync)
		return `Sincronização registrada para "${movement.investmentNameSnapshot ?? "este investimento"}".`;
	if (movement.isBankTransfer)
		return movement.bankTransferDirection === "outgoing"
			? `Transferência enviada para ${movement.bankTransferTargetBankNameSnapshot ?? "o banco de destino"}.`
			: `Transferência recebida de ${movement.bankTransferSourceBankNameSnapshot ?? "o banco de origem"}.`;
	if (movement.isFromMandatory)
		return movement.type === "gain"
			? "Este lançamento marcou como recebido o ganho obrigatório do ciclo atual."
			: "Este lançamento marcou como pago o gasto obrigatório do ciclo atual.";
	if (movement.explanation?.trim()) return movement.explanation.trim();
	if (movement.tagName?.trim())
		return `Lançamento classificado na tag "${movement.tagName.trim()}".`;
	return movement.moneyFormat
		? "Lançamento recente registrado em dinheiro."
		: "Lançamento recente registrado na timeline da Home.";
};

const InfoTip = ({
	children,
	label,
}: {
	children: React.ReactNode;
	label: string;
}) => (
	<Popover
		placement="bottom"
		size="md"
		offset={4}
		shouldFlip
		focusScope={false}
		trapFocus={false}
		trigger={(triggerProps) => (
			<Pressable
				{...triggerProps}
				accessibilityRole="button"
				accessibilityLabel={label}
				className={webStyles.infoButton}
			>
				<Info size={14} color="#94A3B8" />
			</Pressable>
		)}
	>
		<PopoverBackdrop className={webStyles.popoverBackdrop} />
		<PopoverContent className={webStyles.tooltip}>
			<PopoverBody>
				<Text className={webStyles.tooltipText}>{children}</Text>
			</PopoverBody>
		</PopoverContent>
	</Popover>
);

const BankCard = ({
	item,
	hidden,
	dark,
	monthlyExpenses,
	monthlyGains,
}: {
	item: WebBankItem;
	hidden: boolean;
	dark: boolean;
	monthlyExpenses: number;
	monthlyGains: number;
}) => {
	const palette = buildBankCardPalette(
		item.kind === "cash" ? CASH_CARD_COLOR : item.colorHex,
		dark,
	);
	return (
		<Pressable
			onPress={() =>
				navigateToRoute(
					APP_ROUTE_PATHS.bankMovements,
					item.kind === "cash"
						? { cashView: "true" }
						: { bankId: item.id, bankName: encodeURIComponent(item.name) },
				)
			}
			accessibilityRole="button"
			accessibilityLabel={`Abrir ${item.name}`}
			className={webStyles.bankCardPressable}
		>
			<BankCardSurface palette={palette} className={webStyles.bankCard}>
				<View className={webStyles.bankCardContent}>
					<View>
						<Text className={webStyles.cardKicker} style={{ color: palette.textSecondary }}>
							{item.kind === "cash" ? "Carteira" : "Banco"}
						</Text>
						<Text className={webStyles.bankName} style={{ color: palette.textPrimary }}>
							{item.name}
						</Text>
					</View>
					<View>
						<Text className={webStyles.cardKicker} style={{ color: palette.textSecondary }}>
							{item.kind === "cash" ? "Saldo no mês" : "Saldo atual"}
						</Text>
						<Text className={webStyles.bankBalance} style={{ color: palette.textPrimary }}>
							{item.balanceInCents === null
								? "Saldo indisponível"
								: formatCurrency(item.balanceInCents, hidden)}
						</Text>
					</View>
					<View className={webStyles.bankCardFooter}>
						<View>
							<Text className={webStyles.cardKicker} style={{ color: palette.textSecondary }}>
								Gastos
							</Text>
							<Text className={webStyles.bankFooterValue} style={{ color: palette.expenseColor }}>
								{formatCurrency(monthlyExpenses, hidden)}
							</Text>
						</View>
						<View className={webStyles.bankFooterRight}>
							<Text className={webStyles.cardKicker} style={{ color: palette.textSecondary }}>
								Ganhos
							</Text>
							<Text className={webStyles.bankFooterValue} style={{ color: palette.gainColor }}>
								{formatCurrency(monthlyGains, hidden)}
							</Text>
						</View>
					</View>
				</View>
			</BankCardSurface>
		</Pressable>
	);
};

export default function HomeScreen() {
	const { width } = useWindowDimensions();
	const { user } = useAuth();
	const { shouldHideValues, toggleShouldHideValues } = useValueVisibility();
	const {
		insets,
		surfaceBackground,
		heroHeight,
		isDarkMode,
		skeletonBaseColor,
		skeletonHighlightColor,
		webDashboardPalette,
		webDashboardClassNames,
	} = useScreenStyles();
	const cardBackground = surfaceBackground;
	const currentUserId = user?.uid ?? null;
	const [userName, setUserName] = React.useState<string | null>(null);
	React.useEffect(() => {
		let isActive = true;
		const loadUserName = async () => {
			if (!user) {
				setUserName(null);
				return;
			}

			const fallbackName = user.displayName?.trim() || null;
			try {
				const userData = await getUserDataFirebase(user.uid);
				const storedName = userData.success
					? (userData.data as { name?: unknown })?.name
					: null;
				if (isActive) {
					setUserName(
						typeof storedName === "string" && storedName.trim()
							? storedName.trim()
							: fallbackName,
					);
				}
			} catch {
				if (isActive) setUserName(fallbackName);
			}
		};

		void loadUserName();
		return () => {
			isActive = false;
		};
	}, [user]);
	const { overview, movements, investments, reload } =
		useHomeScreenData(currentUserId);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [isMovementsExpanded, setIsMovementsExpanded] = React.useState(true);
	const [expandedMovements, setExpandedMovements] = React.useState<string[]>(
		[],
	);
	const [renderedMovements, setRenderedMovements] = React.useState<string[]>(
		[],
	);
	const [isMonthlyBalanceModalOpen, setIsMonthlyBalanceModalOpen] =
		React.useState(false);
	const [dismissedPrompt, setDismissedPrompt] = React.useState<string | null>(
		null,
	);
	const compact = width < 720;
	const desktop = width >= 1024;
	const monthLabel = React.useMemo(
		() =>
			new Intl.DateTimeFormat("pt-BR", {
				month: "long",
				year: "numeric",
			}).format(new Date()),
		[],
	);
	const bankItems = React.useMemo<WebBankItem[]>(
		() => [
			...overview.data.bankBalances.map((item) => ({
				...item,
				kind: "bank" as const,
			})),
			...(overview.data.cashSummary
				? [{ ...overview.data.cashSummary, kind: "cash" as const }]
				: []),
		],
		[overview.data.bankBalances, overview.data.cashSummary],
	);
	const missingBanks = overview.data.bankBalances.filter(
		(bank) => bank.balanceInCents === null,
	);
	const promptKey =
		missingBanks
			.map((bank) => bank.id)
			.sort()
			.join("|") || null;
	const portfolio = investments.data.portfolio;
	const shouldShowInvestmentSection =
		investments.loading || Boolean(investments.error) || portfolio.investmentCount > 0;
	const distributionItems = React.useMemo(
		() =>
			portfolio.items
				.filter((item) => item.currentBaseValueInCents > 0)
				.sort((a, b) => b.currentBaseValueInCents - a.currentBaseValueInCents),
		[portfolio.items],
	);
	const distributionData = React.useMemo(
		() =>
			distributionItems.map((item, index) => ({
				value: item.currentBaseValueInCents / 100,
				color: INVESTMENT_COLORS[index % INVESTMENT_COLORS.length],
				text: item.name,
			})),
		[distributionItems],
	);
	const expensesByBankId = overview.data.currentMonthExpensesByBankId;
	const gainsByBankId = overview.data.currentMonthGainsByBankId;
	const monthlyTotals = React.useMemo(
		() => ({
			expensesInCents:
				Object.values(expensesByBankId).reduce((total, value) => total + value, 0) +
				(overview.data.cashSummary?.currentMonthExpensesInCents ?? 0),
			gainsInCents:
				Object.values(gainsByBankId).reduce((total, value) => total + value, 0) +
				(overview.data.cashSummary?.currentMonthGainsInCents ?? 0),
		}),
		[
			expensesByBankId,
			gainsByBankId,
			overview.data.cashSummary?.currentMonthExpensesInCents,
			overview.data.cashSummary?.currentMonthGainsInCents,
		],
	);
	const expenseHistory = overview.data.expenseHistoryLastThreeMonths;
	const hasExpenseHistory = expenseHistory.some(
		(month) => month.totalExpensesInCents > 0,
	);
	const gainTrendData = expenseHistory.map((month) => month.totalGainsInCents);
	const expenseTrendData = expenseHistory.map((month) => month.totalExpensesInCents);
	const neutralTrendData = expenseHistory.map(() => 1);
	const upcomingMandatoryItems = overview.data.upcomingMandatoryItems;
	const upcomingMandatoryExpenses = upcomingMandatoryItems.filter((item) => item.type === "expense");
	const upcomingMandatoryGains = upcomingMandatoryItems.filter((item) => item.type === "gain");
	const activityHeatmap = overview.data.activityHeatmap;
	const renderBankCard = React.useCallback(
		({ item }: { item: WebBankItem }) => (
			<BankCard
				item={item}
				hidden={shouldHideValues}
				dark={isDarkMode}
				monthlyExpenses={
					item.kind === "cash"
						? item.currentMonthExpensesInCents
						: (expensesByBankId[item.id] ?? 0)
				}
				monthlyGains={
					item.kind === "cash"
						? item.currentMonthGainsInCents
						: (gainsByBankId[item.id] ?? 0)
				}
			/>
		),
		[expensesByBankId, gainsByBankId, isDarkMode, shouldHideValues],
	);

	React.useEffect(() => {
		if (
			!overview.loading &&
			!overview.error &&
			promptKey &&
			dismissedPrompt !== promptKey
		)
			setIsMonthlyBalanceModalOpen(true);
	}, [dismissedPrompt, overview.error, overview.loading, promptKey]);

	const handleRefresh = React.useCallback(async () => {
		setIsRefreshing(true);
		try {
			await reload();
		} finally {
			setIsRefreshing(false);
		}
	}, [reload]);
	const closeMonthlyBalance = React.useCallback(() => {
		setDismissedPrompt(promptKey);
		setIsMonthlyBalanceModalOpen(false);
	}, [promptKey]);
	const toggleMovement = (id: string) => {
		if (expandedMovements.includes(id)) {
			setExpandedMovements((current) => current.filter((item) => item !== id));
			return;
		}
		setRenderedMovements((rendered) =>
			rendered.includes(id) ? rendered : [...rendered, id],
		);
		setExpandedMovements((current) => [...current, id]);
	};
	return (
		<SafeAreaView
			className={webDashboardClassNames.screen}
			style={{ backgroundColor: surfaceBackground }}
			edges={["left", "right", "bottom"]}
		>
			<View className={webDashboardClassNames.fill} style={{ backgroundColor: surfaceBackground }}>
				<View
					className={webDashboardClassNames.hero}
					style={{ height: heroHeight, backgroundColor: surfaceBackground }}
				>
					<RNImage
						source={LoginWallpaper}
						accessibilityLabel="Background da tela inicial"
					className={webDashboardClassNames.heroImage}
					style={{ width: "100%", height: "100%" }}
						resizeMode="cover"
					/>
					<View
						pointerEvents="none"
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: "100%",
							height: heroHeight,
							opacity: 0.62,
						}}
					>
						<Grainient
							className="home-hero-grainient"
							timeSpeed={0.12}
							colorBalance={isDarkMode ? 0.08 : -0.12}
							warpStrength={0.8}
							warpFrequency={3.5}
							warpSpeed={1.8}
							warpAmplitude={100}
							blendSoftness={0.18}
							grainAmount={0.08}
							grainScale={3}
							grainAnimated
							contrast={1.08}
							zoom={0.9}
							color1={isDarkMode ? "#f8bd0c" : "#FFE58A"}
							color2={isDarkMode ? "#facc15" : "#D97706"}
							color3={isDarkMode ? "#fefe59" : "#EAB308"}
						/>
					</View>
					<View
						className={webDashboardClassNames.heroContent}
						style={{ paddingTop: insets.top + 24 }}
					>
						<StrokeText
							text={`Olá, ${firstName(userName)}! Esse é seu resumo financeiro.`}
							strokeColor="#FFFFFF"
							fillColor="#FFFFFF"
							strokeWidth={1.5}
							drawDuration={2}
							fillDelay={1}
							fontSize={40}
							fontWeight={600}
							letterSpacing={-0.5}
							fontFamily={'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'}
							ease="power3.out"
							trigger="mount"
							className={webDashboardClassNames.heroTitle}
						/>
						<AnimatedContent
							distance={100}
							direction="vertical"
							reverse={false}
							duration={2}
							ease="power3.out"
							initialOpacity={0}
							animateOpacity
							scale={1}
							threshold={0.1}
							delay={0}
							className={webDashboardClassNames.heroIllustrationAnimation}
						>
							<HomeScreenIllustration
								width="40%"
								height="100%"
								className="opacity-90"
							/>
						</AnimatedContent>
					</View>
				</View>
				<View
					className={`${webDashboardClassNames.sheet} ${compact ? webDashboardClassNames.sheetCompact : ''}`}
					style={{ marginTop: heroHeight - 64, backgroundColor: surfaceBackground }}
				>
					<View className={`${webDashboardClassNames.sheetInner} max-w-[1180px] w-full self-center`}>
						<ScrollView
							contentContainerClassName={webDashboardClassNames.scrollContent}
							showsVerticalScrollIndicator={false}
							refreshControl={
								<RefreshControl
									refreshing={isRefreshing}
									onRefresh={handleRefresh}
									tintColor="#FACC15"
								/>
							}
						>
								<View
									className={`${webStyles.topColumns} ${desktop ? webStyles.topColumnsDesktop : ''} ${desktop && !shouldShowInvestmentSection ? webStyles.topColumnsDesktopCentered : ''}`}
								>
									<View
										className={`${webStyles.section} ${desktop ? webStyles.columnSection : ''} ${desktop ? webStyles.bankSection : ''} ${desktop && !shouldShowInvestmentSection ? webStyles.bankSectionCentered : ''}`}
									>
									<View className={webStyles.sectionHeading}>
										<Text
											className={webStyles.sectionHeadingText} style={{ color: webDashboardPalette.primaryText }}
										>
											Meus Bancos e Dinheiro
										</Text>
										<InfoTip label="Informações sobre bancos e dinheiro">
											Exibimos um resumo dos seus bancos e do dinheiro em
											espécie registrado. Toque em cada cartão para ver detalhes
											e movimentações.
										</InfoTip>
									</View>
									{overview.loading && bankItems.length === 0 ? (
										<BankSkeleton
											palette={buildBankCardPalette("#334155", isDarkMode)}
											base={skeletonBaseColor}
											highlight={skeletonHighlightColor}
										/>
									) : overview.error ? (
										<Text className={`${webStyles.inlineError} ${webStyles.errorText}`}>
											{overview.error}
										</Text>
									) : bankItems.length === 0 ? (
										<Text className={webStyles.emptyText} style={{ color: webDashboardPalette.primaryText }}>
											Nenhum dado disponível no momento.
										</Text>
									) : (
										<Carousel
												items={bankItems}
												baseWidth={compact ? width : 610}
												className="bank-carousel"
												autoplay={false}
												loop={bankItems.length > 1}
												renderItem={renderBankCard}
										/>
									)}
								</View>
									{shouldShowInvestmentSection ? (
									<View className={`${webStyles.section} ${desktop ? webStyles.columnSection : ''}`}>
									<View className={webStyles.sectionHeading}>
										<Text
											className={webStyles.sectionHeadingText} style={{ color: webDashboardPalette.primaryText }}
										>
											Investimentos
										</Text>
										<InfoTip label="Informações sobre investimentos">
											O gráfico mostra a distribuição pelo valor atual/base dos
											investimentos registrados. Clique em uma fatia para ver o
											ativo.
										</InfoTip>
									</View>
										{investments.error ? (
										<Text accessibilityRole="alert" className={`${webStyles.inlineError} ${webStyles.errorText}`}>
											{investments.error}
										</Text>
									) : investments.loading && portfolio.investmentCount === 0 ? (
										<InvestmentSkeleton base={skeletonBaseColor} />
									) : portfolio.investmentCount === 0 ? (
										<Text className={webStyles.emptyText} style={{ color: webDashboardPalette.primaryText }}>
											Nenhum investimento registrado até o momento.
										</Text>
									) : distributionData.length === 0 ? (
										<Text className={webStyles.emptyText} style={{ color: webDashboardPalette.primaryText }}>
											Os investimentos ainda não possuem valor atual/base para
											exibir a distribuição.
										</Text>
									) : (
										<View className={webStyles.investmentVisual}>
											<PieChart
												data={distributionData}
												donut
												radius={compact ? 100 : 112}
												innerRadius={compact ? 62 : 70}
												innerCircleColor={cardBackground}
												strokeColor={surfaceBackground}
												strokeWidth={5}
												centerLabelComponent={() => (
													<View className={webStyles.chartCenter}>
														<Text
															className={webStyles.chartLabel} style={{ color: webDashboardPalette.primaryText }}
														>
															ATIVOS
														</Text>
														<Text
															className={webStyles.chartCount} style={{ color: webDashboardPalette.primaryText }}
														>
															{portfolio.investmentCount}
														</Text>
														<Text
															className={webStyles.chartCaption} style={{ color: webDashboardPalette.primaryText }}
														>
															{portfolio.investmentCount === 1
																? "investimento"
																: "investimentos"}
														</Text>
													</View>
												)}
											/>
											<View className={webStyles.investmentTotals}>
												<View>
													<Text
														className={webStyles.totalLabel} style={{ color: webDashboardPalette.primaryText }}
													>
														Atual/base
													</Text>
													<Text
														className={webStyles.totalValue} style={{ color: webDashboardPalette.primaryText }}
													>
														{formatCurrency(
															portfolio.totalCurrentBaseInCents,
															shouldHideValues,
														)}
													</Text>
												</View>
												<View className={webStyles.totalRight}>
													<Text
														className={webStyles.totalLabel} style={{ color: webDashboardPalette.primaryText }}
													>
														Simulado
													</Text>
													<Text
														className={`${webStyles.totalValue} ${webStyles.simulatedValue}`}
													>
														{formatCurrency(
															portfolio.totalSimulatedInCents,
																shouldHideValues,
															)}
														</Text>
									</View>
									</View>
									</View>
										)}
									</View>
									) : null}
								</View>

								<View
								className={`${webStyles.monthlySummaryCards} ${compact ? webStyles.monthlySummaryCardsCompact : ''}`}
							>
								<View
									className={webStyles.monthlySummaryCard} style={{ borderColor: webDashboardPalette.border }}
								>
									<View className={webStyles.monthlySummaryCardContent}>
										<View className={webStyles.monthlySummaryCopy}>
											<Text className={webStyles.monthlySummaryLabel} style={{ color: webDashboardPalette.primaryText }}>
												Total ganho
											</Text>
											<Text className={`${webStyles.monthlySummaryValue} ${webStyles.gainValue}`}>
												{formatCurrency(monthlyTotals.gainsInCents, shouldHideValues)}
											</Text>
											<Text
												className={webStyles.monthlySummaryHelper} style={{ color: webDashboardPalette.secondaryText }}
											>
												Entradas no mês atual
											</Text>
										</View>
										<HomeExpenseChart
											data={shouldHideValues ? neutralTrendData : gainTrendData}
											label="Tendência de ganhos nos últimos três meses"
											color="#10B981"
											isDarkMode={isDarkMode}
											dom={{
												focusable: false,
												scrollEnabled: false,
												style: WEB_DASHBOARD_DOM_STYLES.sparkline,
											}}
										/>
									</View>
								</View>

								<View
									className={webStyles.monthlySummaryCard} style={{ borderColor: webDashboardPalette.border, }}
								>
									<View className={webStyles.monthlySummaryCardContent}>
										<View className={webStyles.monthlySummaryCopy}>
											<Text className={webStyles.monthlySummaryLabel} style={{ color: webDashboardPalette.primaryText }}>
												Total gasto
											</Text>
											<Text className={`${webStyles.monthlySummaryValue} ${webStyles.expenseValue}`}>
												{formatCurrency(monthlyTotals.expensesInCents, shouldHideValues)}
											</Text>
											<Text
												className={webStyles.monthlySummaryHelper} style={{ color: webDashboardPalette.secondaryText }}
											>
												Saídas no mês atual
											</Text>
										</View>
										<HomeExpenseChart
											data={shouldHideValues ? neutralTrendData : expenseTrendData}
											label="Tendência de gastos nos últimos três meses"
											color="#EF4444"
											isDarkMode={isDarkMode}
											dom={{
												focusable: false,
												scrollEnabled: false,
												style: WEB_DASHBOARD_DOM_STYLES.sparkline,
											}}
										/>
									</View>
								</View>
							</View>



							<View
								className={webStyles.expenseChartSection} style={{ borderColor: webDashboardPalette.border }}
							>
								<View className={webStyles.sectionHeading}>
									<View className={webStyles.headingWithTip}>
										<Text className={webStyles.sectionHeadingText} style={{ color: webDashboardPalette.primaryText }}>Gastos por dia</Text>
										<InfoTip label="Informações sobre gastos por dia">
											Cada linha representa um dos últimos três meses. Os pontos aparecem somente nos dias que tiveram gastos.
										</InfoTip>
									</View>
								</View>
								{overview.loading && expenseHistory.length === 0 ? (
									<Skeleton
										className={webStyles.expenseChartSkeleton}
										baseColor={skeletonBaseColor}
										highlightColor={skeletonHighlightColor}
									/>
								) : overview.error ? (
									<Text className={`${webStyles.inlineError} ${webStyles.errorText}`}>{overview.error}</Text>
								) : !hasExpenseHistory ? (
									<Text className={webStyles.emptyText} style={{ color: webDashboardPalette.primaryText }}>Nenhum gasto registrado nos últimos três meses.</Text>
								) : (
									<HomeExpenseLineChart
										months={expenseHistory}
										isDarkMode={isDarkMode}
										shouldHideValues={shouldHideValues}
										dom={{
											focusable: false,
											scrollEnabled: false,
											style: WEB_DASHBOARD_DOM_STYLES.expenseLineChart,
										}}
									/>
								)}
							</View>

							<View
								className={webStyles.activityHeatmapSection} style={{ borderColor: webDashboardPalette.border }}
							>
								<View className={webStyles.sectionHeading}>
									<View className={webStyles.headingWithTip}>
										<Text className={webStyles.sectionHeadingText} style={{ color: webDashboardPalette.primaryText }}>
											Atividade no ano
										</Text>
										<InfoTip label="Informações sobre atividade no ano">
											Cada bloco representa um dia. A intensidade mostra quantos
											lançamentos financeiros confirmados foram feitos nele.
										</InfoTip>
									</View>
								</View>
								<Text className={webStyles.activityHeatmapHelper} style={{ color: webDashboardPalette.secondaryText }}>
									{activityHeatmap.totalActions} ações registradas em {new Date().getFullYear()}
								</Text>
								{overview.loading && activityHeatmap.totalActions === 0 ? (
									<Skeleton
										className={webStyles.activityHeatmapSkeleton}
										baseColor={skeletonBaseColor}
										highlightColor={skeletonHighlightColor}
									/>
								) : overview.error ? (
									<Text className={`${webStyles.inlineError} ${webStyles.errorText}`}>{overview.error}</Text>
								) : (
									<HomeActivityHeatmap
										data={activityHeatmap.dailyActionCounts}
										startDate={activityHeatmap.startDate}
										endDate={activityHeatmap.endDate}
										isDarkMode={isDarkMode}
										dom={{
											focusable: false,
											scrollEnabled: false,
											style: WEB_DASHBOARD_DOM_STYLES.activityHeatmap,
										}}
									/>
								)}
							</View>

								<View
									className={webStyles.mandatorySection} style={{ borderColor: webDashboardPalette.border }}
								>
									<View className={webStyles.sectionHeading}>
										<View className={webStyles.headingWithTip}>
											<Text
												accessibilityRole="header"
												className={webStyles.sectionHeadingText} style={{ color: webDashboardPalette.primaryText }}
											>
												Próximos compromissos
											</Text>
											<InfoTip label="Informações sobre próximos compromissos">
												Mostramos o próximo ciclo pendente de cada gasto ou ganho obrigatório.
											</InfoTip>
										</View>
									</View>
									{overview.loading && upcomingMandatoryItems.length === 0 ? (
										<View className={`${webStyles.mandatoryColumns} ${compact ? webStyles.mandatoryColumnsCompact : ''}`}>
											<Skeleton
												className={webStyles.mandatorySkeleton}
												baseColor={skeletonBaseColor}
												highlightColor={skeletonHighlightColor}
											/>
											<Skeleton
												className={webStyles.mandatorySkeleton}
												baseColor={skeletonBaseColor}
												highlightColor={skeletonHighlightColor}
											/>
										</View>
									) : overview.error ? (
										<Text className={`${webStyles.inlineError} ${webStyles.errorText}`}>
											{overview.error}
										</Text>
									) : (
										<View className={`${webStyles.mandatoryColumns} ${compact ? webStyles.mandatoryColumnsCompact : ''}`}>
											<MandatoryScheduleColumn
												items={upcomingMandatoryExpenses}
												type="expense"
												palette={webDashboardPalette}
												hidden={shouldHideValues}
											/>
											<MandatoryScheduleColumn
												items={upcomingMandatoryGains}
												type="gain"
												palette={webDashboardPalette}
												hidden={shouldHideValues}
											/>
										</View>
									)}
								</View>

								<View className={webStyles.section}>
								<Pressable
									onPress={() => setIsMovementsExpanded((current) => !current)}
									accessibilityRole="button"
									accessibilityLabel="Expandir ou recolher últimas movimentações"
									accessibilityState={{ expanded: isMovementsExpanded }}
								>
									<View className={webStyles.sectionHeading}>
										<View className={webStyles.headingWithTip}>
											<Text
												className={webStyles.sectionHeadingText} style={{ color: webDashboardPalette.primaryText }}
											>
												Últimas Movimentações
											</Text>
											<InfoTip label="Informações sobre últimas movimentações">
												Resumo de despesas, ganhos, transferências e
												sincronizações de investimento. Clique em uma
												movimentação para ver detalhes.
											</InfoTip>
										</View>
										{isMovementsExpanded ? (
											<ChevronUp size={19} color="#94A3B8" />
										) : (
											<ChevronDown size={19} color="#94A3B8" />
										)}
									</View>
								</Pressable>
								{isMovementsExpanded ? (
									movements.loading &&
										movements.data.timelineMovements.length === 0 ? (
										<TimelineSkeleton base={skeletonBaseColor} />
									) : movements.data.timelineMovements.length === 0 ? (
										<View
															className={webStyles.emptyMovement} style={{ borderColor: webDashboardPalette.border }}
										>
											<Text style={{ color: webDashboardPalette.primaryText }}>
												Nenhuma transação recente encontrada.
											</Text>
										</View>
									) : (
										<View className={webStyles.timeline}>
											{movements.data.timelineMovements.map(
												(movement, index) => {
													const tone = movementTone(movement);
													const key = `${movement.type}:${movement.id}`;
													const expanded = expandedMovements.includes(key);
													const icon = movementIcon(movement);
													return (
														<View key={key} className={webStyles.timelineRow}>
															<View className={webStyles.timelineRail}>
																<View
																	className={webStyles.timelineDot} style={{ backgroundColor: tone.accent }}
																/>
																{index <
																	movements.data.timelineMovements.length - 1 ? (
																	<View
																		className={webStyles.timelineLine} style={{ backgroundColor: `${tone.accent}55` }}
																	/>
																) : null}
															</View>
															<View className={webStyles.timelineBody}>
																<Pressable
																	onPress={() => toggleMovement(key)}
																							accessibilityRole="button"
																							accessibilityLabel={`Detalhes de ${movement.name}`}
																							accessibilityState={{ expanded }}
																>
																	<View className={webStyles.movementHeader}>
																		<View className={webStyles.movementIdentity}>
																			<View
																				className={webStyles.movementIcon} style={{ backgroundColor: tone.gradient[0] }}
																			>
																				<TagIcon
																					{...icon}
																					size={18}
																					color="#FFFFFF"
																				/>
																			</View>
																			<View className={webStyles.movementCopy}>
																				<Text
																					numberOfLines={1}
																					className={webStyles.movementName} style={{ color: webDashboardPalette.primaryText }}
																				>
																					{movement.name}
																				</Text>
																				<Text
																					numberOfLines={1}
																					className={webStyles.movementSubtitle} style={{ color: webDashboardPalette.primaryText }}
																				>
																					{movementSubtitle(movement)}
																				</Text>
																			</View>
																		</View>
																		<View className={webStyles.movementAmount}>
																			<Text
																				className={webStyles.amount} style={{ color: tone.accent }}
																			>
																				{tone.prefix}
																				{formatCurrency(
																					movement.valueInCents,
																					shouldHideValues,
																				)}
																			</Text>
																			<View className={webStyles.movementDate}>
																				<CalendarDays
																					size={12}
																					color="#94A3B8"
																				/>
																				<Text className={webStyles.dateText}>
																					{formatDate(movement.date)}
																				</Text>
																				{expanded ? (
																					<ChevronUp
																						size={14}
																						color="#94A3B8"
																					/>
																				) : (
																					<ChevronDown
																						size={14}
																						color="#94A3B8"
																					/>
																				)}
																			</View>
																		</View>
																	</View>
																</Pressable>
						{renderedMovements.includes(key) ? (
							<AnimatedContent
								key={`${key}:detail`}
								trigger="mount"
								visible={expanded}
								distance={18}
								duration={0.36}
								disappearDuration={0.28}
								disappearScale={1}
								ease="power3.out"
								initialOpacity={0}
								animateOpacity
								scale={1}
								className={webStyles.movementDetailAnimation}
								onDisappearanceComplete={() =>
									setRenderedMovements((rendered) =>
										rendered.filter((item) => item !== key),
									)
								}
											>
												<View className={webStyles.movementDetail}>
													<View
														pointerEvents="none"
														className={webStyles.movementDetailGrainient}
													>
															<Grainient
																className="movement-detail-grainient"
																timeSpeed={0.1}
															warpStrength={0.8}
															warpFrequency={3.5}
															warpSpeed={1.6}
															warpAmplitude={90}
															blendSoftness={0.2}
															grainAmount={0.06}
															grainScale={3}
															grainAnimated
															contrast={1.12}
															zoom={1.05}
															color1={tone.gradient[0]}
															color2={tone.accent}
															color3={tone.gradient[1]}
														/>
													</View>
													<View className={webStyles.movementDetailContent}>
														<Text className={webStyles.detailLabel}>
														RESUMO
													</Text>
													<Text className={webStyles.detailText}>
														{movementDetail(movement)}
													</Text>
													<View className={webStyles.detailGrid}>
														<DetailItem
															label="Tipo"
															value={movementLabel(movement)}
														/>
														<DetailItem
															label={
																movement.isBankTransfer
																	? "Origem"
																	: "Conta"
															}
															value={
																movement.bankName ||
																(movement.moneyFormat
																	? "Dinheiro em espécie"
																	: "Sem banco vinculado")
															}
														/>
														<DetailItem
															label="Data"
															value={formatDate(movement.date)}
														/>
														{movement.tagName ? (
															<DetailItem
																label="Tag"
																value={movement.tagName}
															/>
														) : null}
													</View>
																							</View>
																						</View>
																				</AnimatedContent>
										) : null}
															</View>
														</View>
													);
												},
											)}
										</View>
									)
								) : null}
								{movements.error ? (
									<Text className={`${webStyles.inlineError} ${webStyles.errorText}`}>
										{movements.error}
									</Text>
								) : null}
							</View>
						</ScrollView>
					</View>
				</View>
				<Navigator defaultValue={0} />
			</View>
			<Modal isOpen={isMonthlyBalanceModalOpen} onClose={closeMonthlyBalance}>
				<ModalBackdrop />
				<ModalContent>
					<ModalHeader>
						<ModalTitle>Saldo mensal pendente</ModalTitle>
						<ModalCloseButton onPress={closeMonthlyBalance} />
					</ModalHeader>
					<ModalBody>
						<Text style={{ color: webDashboardPalette.primaryText }}>
							Registre o saldo mensal de{" "}
							{missingBanks.map((bank) => bank.name).join(", ")} para manter o
							resumo confiável.
						</Text>
					</ModalBody>
					<ModalFooter>
						<Button variant="outline" onPress={closeMonthlyBalance}>
							<ButtonText>Agora não</ButtonText>
						</Button>
						<Button
							onPress={() => {
								closeMonthlyBalance();
								navigateToRoute(APP_ROUTE_PATHS.registerMonthlyBalance);
							}}
						>
							<ButtonText>Registrar saldo</ButtonText>
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</SafeAreaView>
	);
}

const DetailItem = ({ label, value }: { label: string; value: string }) => (
	<View className={webStyles.detailItem}>
		<Text className={webStyles.detailLabel}>{label.toUpperCase()}</Text>
		<Text className={webStyles.detailText}>{value}</Text>
	</View>
);

const BankSkeleton = ({
	palette,
	base,
	highlight,
}: {
	palette: BankCardPalette;
	base: string;
	highlight: string;
}) => (
	<View className={webStyles.bankCard}>
		<BankCardSurface palette={palette} className={webStyles.bankCard}>
			<View className={webStyles.bankCardContent}>
				<Skeleton
					baseColor={base}
					highlightColor={highlight}
					className={webStyles.skeletonShort}
				/>
				<Skeleton
					baseColor={base}
					highlightColor={highlight}
					className={webStyles.skeletonLong}
				/>
				<Skeleton
					baseColor={base}
					highlightColor={highlight}
					className={webStyles.skeletonBalance}
				/>
			</View>
		</BankCardSurface>
	</View>
);
const InvestmentSkeleton = ({ base }: { base: string }) => (
	<View className={webStyles.investmentSkeleton}>
		<Skeleton
			variant="circular"
			className={webStyles.skeletonDonut}
			baseColor={base}
		/>
		<Skeleton className={webStyles.skeletonShort} baseColor={base} />
	</View>
);
const TimelineSkeleton = ({ base }: { base: string }) => (
	<View className={webStyles.timelineSkeleton}>
		{[0, 1, 2].map((index) => (
			<View key={index} className={webStyles.skeletonRow}>
				<Skeleton
					variant="circular"
					className={webStyles.skeletonDot}
					baseColor={base}
				/>
				<Skeleton className={webStyles.skeletonText} baseColor={base} />
			</View>
		))}
	</View>
);
