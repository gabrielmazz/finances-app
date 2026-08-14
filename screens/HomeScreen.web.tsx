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
	StyleSheet,
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
import { auth } from "@/FirebaseConfig";
import {
	HIDDEN_VALUE_PLACEHOLDER,
	useValueVisibility,
} from "@/contexts/ValueVisibilityContext";
import {
	type HomeBankBalanceCard,
	type HomeCashSummary,
	type HomeTimelineMovement,
} from "@/functions/HomeFirebase";
import { useHomeScreenData } from "@/hooks/useHomeScreenData";
import { TagIcon, type TagIconSelection } from "@/hooks/useTagIcons";
import { useScreenStyles } from "@/hooks/useScreenStyle";
import { APP_ROUTE_PATHS, navigateToRoute } from "@/utils/navigation";
import LoginWallpaper from "@/assets/Background/wallpaper01.png";
import HomeScreenIllustration from "@/assets/UnDraw/homeScreen.svg";

type WebBankItem =
	| ({ kind: "bank" } & HomeBankBalanceCard)
	| ({ kind: "cash" } & HomeCashSummary);

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
				style={styles.infoButton}
			>
				<Info size={14} color="#94A3B8" />
			</Pressable>
		)}
	>
		<PopoverBackdrop style={{ backgroundColor: "transparent" }} />
		<PopoverContent style={styles.tooltip}>
			<PopoverBody>
				<Text style={styles.tooltipText}>{children}</Text>
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
			style={[styles.bankCardPressable, { width: "100%" }]}
		>
			<BankCardSurface palette={palette} style={styles.bankCard}>
				<View style={styles.bankCardContent}>
					<View>
						<Text style={[styles.cardKicker, { color: palette.textSecondary }]}>
							{item.kind === "cash" ? "Carteira" : "Banco"}
						</Text>
						<Text style={[styles.bankName, { color: palette.textPrimary }]}>
							{item.name}
						</Text>
					</View>
					<View>
						<Text style={[styles.cardKicker, { color: palette.textSecondary }]}>
							{item.kind === "cash" ? "Saldo no mês" : "Saldo atual"}
						</Text>
						<Text style={[styles.bankBalance, { color: palette.textPrimary }]}>
							{item.balanceInCents === null
								? "Saldo indisponível"
								: formatCurrency(item.balanceInCents, hidden)}
						</Text>
					</View>
					<View style={styles.bankCardFooter}>
						<View>
							<Text
								style={[styles.cardKicker, { color: palette.textSecondary }]}
							>
								Gastos
							</Text>
							<Text
								style={[
									styles.bankFooterValue,
									{ color: palette.expenseColor },
								]}
							>
								{formatCurrency(monthlyExpenses, hidden)}
							</Text>
						</View>
						<View style={styles.bankFooterRight}>
							<Text
								style={[styles.cardKicker, { color: palette.textSecondary }]}
							>
								Ganhos
							</Text>
							<Text
								style={[styles.bankFooterValue, { color: palette.gainColor }]}
							>
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
	const { shouldHideValues, toggleShouldHideValues } = useValueVisibility();
	const {
		insets,
		surfaceBackground,
		heroHeight,
		isDarkMode,
		skeletonBaseColor,
		skeletonHighlightColor,
		webDashboardPalette,
	} = useScreenStyles();
	const bodyColor = isDarkMode ? "#CBD5E1" : "#334155";
	const bodyText = bodyColor;
	const cardBackground = surfaceBackground;
	const currentUserId = auth.currentUser?.uid ?? null;
	const { overview, movements, investments, reload } =
		useHomeScreenData(currentUserId);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [isMovementsExpanded, setIsMovementsExpanded] = React.useState(true);
	const [expandedMovements, setExpandedMovements] = React.useState<string[]>(
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
	const toggleMovement = (id: string) =>
		setExpandedMovements((current) =>
			current.includes(id)
				? current.filter((item) => item !== id)
				: [...current, id],
		);
	const contentWidth = desktop
		? { width: "100%", maxWidth: 1180, alignSelf: "center" as const }
		: undefined;

	return (
		<SafeAreaView
			style={[styles.screen, { backgroundColor: surfaceBackground }]}
			edges={["left", "right", "bottom"]}
		>
			<View style={[styles.fill, { backgroundColor: surfaceBackground }]}>
				<View
					style={[
						styles.hero,
						{ height: heroHeight, backgroundColor: surfaceBackground },
					]}
				>
					<RNImage
						source={LoginWallpaper}
						accessibilityLabel="Background da tela inicial"
						style={styles.heroImage}
						resizeMode="cover"
					/>
					<View pointerEvents="none" style={styles.heroGrainient}>
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
							contrast={1.15}
							zoom={0.9}
							color1={isDarkMode ? "#f8bd0c" : "#FFE58A"}
							color2={isDarkMode ? "#facc15" : "#D97706"}
							color3={isDarkMode ? "#fefe59" : "#7C2D12"}
						/>
					</View>
					<View style={[styles.heroContent, { paddingTop: insets.top + 24 }]}>
						<StrokeText
							text={`Olá, ${firstName(auth.currentUser?.displayName)}! Esse é seu resumo financeiro.`}
							strokeColor="#FFFFFF"
							fillColor="#FFFFFF"
							strokeWidth={1.8}
							drawDuration={1}
							fillDelay={0.5}
							fontSize={35}
							fontWeight={400}
							letterSpacing={-0.5}
							fontFamily={'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'}
							ease="power3.out"
							trigger="mount"
							style={styles.heroTitle}
						/>
						<AnimatedContent
							distance={100}
							direction="vertical"
							reverse={false}
							duration={1}
							ease="power3.out"
							initialOpacity={0}
							animateOpacity
							scale={1}
							threshold={0.1}
							delay={0}
							style={styles.heroIllustrationAnimation}
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
					style={[
						styles.sheet,
						{ marginTop: heroHeight - 64, backgroundColor: surfaceBackground },
						compact && styles.sheetCompact,
					]}
				>
					<View style={[styles.sheetInner, contentWidth]}>
						<ScrollView
							contentContainerStyle={styles.scrollContent}
							showsVerticalScrollIndicator={false}
							refreshControl={
								<RefreshControl
									refreshing={isRefreshing}
									onRefresh={handleRefresh}
									tintColor="#FACC15"
								/>
							}
						>
							<View style={[styles.topColumns, desktop && styles.topColumnsDesktop]}>
								<View style={[styles.section, desktop && styles.columnSection, desktop && styles.bankSection]}>
									<View style={styles.sectionHeading}>
										<Text
											style={[styles.sectionHeadingText, { color: bodyText }]}
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
										<Text style={[styles.inlineError, { color: "#F59E0B" }]}>
											{overview.error}
										</Text>
									) : bankItems.length === 0 ? (
										<Text style={[styles.emptyText, { color: bodyText }]}>
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
								<View style={[styles.section, desktop && styles.columnSection]}>
									<View style={styles.sectionHeading}>
										<Text
											style={[styles.sectionHeadingText, { color: bodyText }]}
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
										<Text style={[styles.inlineError, { color: "#F59E0B" }]}>
											{investments.error}
										</Text>
									) : investments.loading && portfolio.investmentCount === 0 ? (
										<InvestmentSkeleton base={skeletonBaseColor} />
									) : portfolio.investmentCount === 0 ? (
										<Text style={[styles.emptyText, { color: bodyText }]}>
											Nenhum investimento registrado até o momento.
										</Text>
									) : distributionData.length === 0 ? (
										<Text style={[styles.emptyText, { color: bodyText }]}>
											Os investimentos ainda não possuem valor atual/base para
											exibir a distribuição.
										</Text>
									) : (
										<View style={styles.investmentVisual}>
											<PieChart
												data={distributionData}
												donut
												radius={compact ? 100 : 112}
												innerRadius={compact ? 62 : 70}
												innerCircleColor={cardBackground}
												strokeColor={surfaceBackground}
												strokeWidth={5}
												centerLabelComponent={() => (
													<View style={styles.chartCenter}>
														<Text
															style={[styles.chartLabel, { color: bodyText }]}
														>
															ATIVOS
														</Text>
														<Text
															style={[styles.chartCount, { color: bodyText }]}
														>
															{portfolio.investmentCount}
														</Text>
														<Text
															style={[styles.chartCaption, { color: bodyText }]}
														>
															{portfolio.investmentCount === 1
																? "investimento"
																: "investimentos"}
														</Text>
													</View>
												)}
											/>
											<View style={styles.investmentTotals}>
												<View>
													<Text
														style={[styles.totalLabel, { color: bodyText }]}
													>
														Atual/base
													</Text>
													<Text
														style={[styles.totalValue, { color: bodyText }]}
													>
														{formatCurrency(
															portfolio.totalCurrentBaseInCents,
															shouldHideValues,
														)}
													</Text>
												</View>
												<View style={styles.totalRight}>
													<Text
														style={[styles.totalLabel, { color: bodyText }]}
													>
														Simulado
													</Text>
													<Text
														style={[styles.totalValue, { color: "#34D399" }]}
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
							</View>

							<View
								style={[
									styles.monthlySummaryCards,
									compact && styles.monthlySummaryCardsCompact,
								]}
							>
								<View
									style={[
										styles.monthlySummaryCard,
										{
											borderColor: webDashboardPalette.border
										},
									]}
								>
									<Text style={[styles.monthlySummaryLabel, { color: webDashboardPalette.primaryText }]}>
										Total ganho
									</Text>
									<Text style={[styles.monthlySummaryValue, { color: "#10B981" }]}>
										{formatCurrency(monthlyTotals.gainsInCents, shouldHideValues)}
									</Text>
									<Text
										style={[
											styles.monthlySummaryHelper,
											{ color: webDashboardPalette.secondaryText },
										]}
									>
										Entradas no mês atual
									</Text>
								</View>

								<View
									style={[
										styles.monthlySummaryCard,
										{
											borderColor: webDashboardPalette.border,
										},
									]}
								>
									<Text style={[styles.monthlySummaryLabel, { color: webDashboardPalette.primaryText }]}>
										Total gasto
									</Text>
									<Text style={[styles.monthlySummaryValue, { color: "#EF4444" }]}>
										{formatCurrency(monthlyTotals.expensesInCents, shouldHideValues)}
									</Text>
									<Text
										style={[
											styles.monthlySummaryHelper,
											{ color: webDashboardPalette.secondaryText },
										]}
									>
										Saídas no mês atual
									</Text>
								</View>
							</View>

							<View style={styles.section}>
								<Pressable
									onPress={() => setIsMovementsExpanded((current) => !current)}
									accessibilityRole="button"
									accessibilityLabel="Expandir ou recolher últimas movimentações"
								>
									<View style={styles.sectionHeading}>
										<View style={styles.headingWithTip}>
											<Text
												style={[styles.sectionHeadingText, { color: bodyText }]}
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
											style={[
												styles.emptyMovement,
												{ borderColor: isDarkMode ? "#334155" : "#E2E8F0" },
											]}
										>
											<Text style={{ color: bodyText }}>
												Nenhuma transação recente encontrada.
											</Text>
										</View>
									) : (
										<View style={styles.timeline}>
											{movements.data.timelineMovements.map(
												(movement, index) => {
													const tone = movementTone(movement);
													const key = `${movement.type}:${movement.id}`;
													const expanded = expandedMovements.includes(key);
													const icon = movementIcon(movement);
													return (
														<View key={key} style={styles.timelineRow}>
															<View style={styles.timelineRail}>
																<View
																	style={[
																		styles.timelineDot,
																		{ backgroundColor: tone.accent },
																	]}
																/>
																{index <
																	movements.data.timelineMovements.length - 1 ? (
																	<View
																		style={[
																			styles.timelineLine,
																			{ backgroundColor: `${tone.accent}55` },
																		]}
																	/>
																) : null}
															</View>
															<View style={styles.timelineBody}>
																<Pressable
																	onPress={() => toggleMovement(key)}
																	accessibilityRole="button"
																	accessibilityLabel={`Detalhes de ${movement.name}`}
																>
																	<View style={styles.movementHeader}>
																		<View style={styles.movementIdentity}>
																			<View
																				style={[
																					styles.movementIcon,
																					{ backgroundColor: tone.gradient[0] },
																				]}
																			>
																				<TagIcon
																					{...icon}
																					size={18}
																					color="#FFFFFF"
																				/>
																			</View>
																			<View style={styles.movementCopy}>
																				<Text
																					numberOfLines={1}
																					style={[
																						styles.movementName,
																						{ color: bodyText },
																					]}
																				>
																					{movement.name}
																				</Text>
																				<Text
																					numberOfLines={1}
																					style={[
																						styles.movementSubtitle,
																						{ color: bodyText },
																					]}
																				>
																					{movementSubtitle(movement)}
																				</Text>
																			</View>
																		</View>
																		<View style={styles.movementAmount}>
																			<Text
																				style={[
																					styles.amount,
																					{ color: tone.accent },
																				]}
																			>
																				{tone.prefix}
																				{formatCurrency(
																					movement.valueInCents,
																					shouldHideValues,
																				)}
																			</Text>
																			<View style={styles.movementDate}>
																				<CalendarDays
																					size={12}
																					color="#94A3B8"
																				/>
																				<Text style={styles.dateText}>
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
																{expanded ? (
																	<View
																		style={[
																			styles.movementDetail,
																			{ backgroundColor: tone.gradient[0] },
																		]}
																	>
																		<Text style={styles.detailLabel}>
																			RESUMO
																		</Text>
																		<Text style={styles.detailText}>
																			{movementDetail(movement)}
																		</Text>
																		<View style={styles.detailGrid}>
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
									<Text style={[styles.inlineError, { color: "#F59E0B" }]}>
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
						<Text style={{ color: bodyText }}>
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
	<View style={styles.detailItem}>
		<Text style={styles.detailLabel}>{label.toUpperCase()}</Text>
		<Text style={styles.detailText}>{value}</Text>
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
	<View style={styles.bankCard}>
		<BankCardSurface palette={palette} style={{ flex: 1 }}>
			<View style={styles.bankCardContent}>
				<Skeleton
					baseColor={base}
					highlightColor={highlight}
					style={styles.skeletonShort}
				/>
				<Skeleton
					baseColor={base}
					highlightColor={highlight}
					style={styles.skeletonLong}
				/>
				<Skeleton
					baseColor={base}
					highlightColor={highlight}
					style={styles.skeletonBalance}
				/>
			</View>
		</BankCardSurface>
	</View>
);
const InvestmentSkeleton = ({ base }: { base: string }) => (
	<View style={styles.investmentSkeleton}>
		<Skeleton
			variant="circular"
			style={styles.skeletonDonut}
			baseColor={base}
		/>
		<Skeleton style={styles.skeletonShort} baseColor={base} />
	</View>
);
const TimelineSkeleton = ({ base }: { base: string }) => (
	<View style={styles.timelineSkeleton}>
		{[0, 1, 2].map((index) => (
			<View key={index} style={styles.skeletonRow}>
				<Skeleton
					variant="circular"
					style={styles.skeletonDot}
					baseColor={base}
				/>
				<Skeleton style={styles.skeletonText} baseColor={base} />
			</View>
		))}
	</View>
);

const styles = StyleSheet.create({
	screen: { flex: 1 },
	fill: { flex: 1 },
	hero: { position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden" },
	heroImage: {
		...StyleSheet.absoluteFillObject,
		width: "100%",
		height: "100%",
	},
	heroGrainient: {
		...StyleSheet.absoluteFillObject,
		opacity: 0.62,
	},
	heroContent: {
		flex: 1,
		alignItems: "center",
		justifyContent: "flex-start",
		gap: 14,
		paddingHorizontal: 24,
	},
	heroIllustrationAnimation: {
		width: "100%",
		height: "40%",
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		alignSelf: "center",
		marginLeft: "auto",
		marginRight: "auto",
		marginTop: 14,
		flexShrink: 0,
	},
	heroTitle: {
		color: "#FFFFFF",
		fontSize: 25,
		fontWeight: "800",
		textAlign: "center",
		maxWidth: 620,
	},
	sheet: {
		flex: 1,
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		paddingHorizontal: 32,
		paddingBottom: 2,
	},
	sheetCompact: { paddingHorizontal: 18 },
	sheetInner: { flex: 1 },
	scrollContent: { paddingTop: 18, paddingBottom: 18, gap: 28 },
	topColumns: { gap: 26 },
	topColumnsDesktop: { flexDirection: "row", gap: 26 },
	monthlySummaryCards: { flexDirection: "row", gap: 12 },
	monthlySummaryCardsCompact: { flexDirection: "column" },
	monthlySummaryCard: {
		flex: 1,
		minHeight: 126,
		borderWidth: 1,
		borderRadius: 18,
		paddingHorizontal: 18,
		paddingVertical: 16,
	},
	monthlySummaryPeriod: {
		fontSize: 10,
		fontWeight: "800",
		letterSpacing: 0.7,
		textTransform: "uppercase",
	},
	monthlySummaryLabel: { marginTop: 10, fontSize: 13, fontWeight: "700" },
	monthlySummaryValue: { marginTop: 4, fontSize: 21, fontWeight: "800" },
	monthlySummaryHelper: { marginTop: 7, fontSize: 12 },
	section: { marginBottom: 4 },
	columnSection: { flex: 1, minWidth: 0 },
	bankSection: { flexDirection: "column" },
	sectionHeading: {
		minHeight: 34,
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		marginBottom: 12,
	},
	headingWithTip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		flex: 1,
	},
	sectionHeadingText: {
		fontSize: 17,
		fontWeight: "800",
		letterSpacing: 1.1,
		textTransform: "uppercase",
	},
	infoButton: {
		width: 24,
		height: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	tooltip: { maxWidth: 300, borderRadius: 12 },
	tooltipText: { color: "#E2E8F0", fontSize: 12, lineHeight: 19 },
	bankScroller: { gap: 12, paddingRight: 6 },
	bankCardPressable: { width: 318, minHeight: 200, flex: 1 },
	bankCard: { flex: 1, minHeight: 200 },
	bankCardContent: { flex: 1, justifyContent: "space-between", padding: 18 },
	cardKicker: {
		fontSize: 10,
		fontWeight: "700",
		letterSpacing: 0.6,
		textTransform: "uppercase",
	},
	bankName: { marginTop: 4, fontSize: 20, fontWeight: "800" },
	bankBalance: { marginTop: 4, fontSize: 22, fontWeight: "800" },
	bankCardFooter: {
		flexDirection: "row",
		justifyContent: "space-between",
		gap: 18,
	},
	bankFooterRight: { alignItems: "flex-end" },
	bankFooterValue: { marginTop: 3, fontSize: 13, fontWeight: "700" },
	investmentVisual: { alignItems: "center" },
	chartCenter: { alignItems: "center", justifyContent: "center" },
	chartLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
	chartCount: { marginTop: 3, fontSize: 30, fontWeight: "800" },
	chartCaption: { marginTop: 1, fontSize: 11 },
	investmentTotals: {
		width: "100%",
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 16,
	},
	totalRight: { alignItems: "flex-end" },
	totalLabel: {
		fontSize: 10,
		fontWeight: "700",
		letterSpacing: 0.6,
		textTransform: "uppercase",
	},
	totalValue: { marginTop: 5, fontSize: 17, fontWeight: "800" },
	timeline: { marginTop: 2 },
	timelineRow: { flexDirection: "row", minHeight: 80 },
	timelineRail: { width: 28, alignItems: "center", paddingTop: 8 },
	timelineDot: {
		width: 13,
		height: 13,
		borderRadius: 99,
		borderWidth: 2,
		borderColor: "#FFFFFF",
	},
	timelineLine: { width: 3, flex: 1, marginVertical: 2, borderRadius: 99 },
	timelineBody: { flex: 1, paddingBottom: 14 },
	movementHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 12,
	},
	movementIdentity: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minWidth: 0,
	},
	movementIcon: {
		width: 44,
		height: 44,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
	},
	movementCopy: { flex: 1, minWidth: 0 },
	movementName: { fontSize: 15, fontWeight: "700" },
	movementSubtitle: { marginTop: 2, fontSize: 12, opacity: 0.68 },
	movementAmount: { alignItems: "flex-end" },
	amount: { fontSize: 15, fontWeight: "700" },
	movementDate: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		marginTop: 4,
	},
	dateText: { color: "#94A3B8", fontSize: 11 },
	movementDetail: {
		marginTop: 10,
		marginRight: 16,
		borderRadius: 18,
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	detailGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 12,
		marginTop: 14,
	},
	detailItem: { width: "45%", minWidth: 130 },
	detailLabel: {
		color: "rgba(255,255,255,0.7)",
		fontSize: 10,
		fontWeight: "700",
		letterSpacing: 0.5,
		textTransform: "uppercase",
	},
	detailText: { marginTop: 4, color: "#FFFFFF", fontSize: 13, lineHeight: 18 },
	emptyText: { fontSize: 13, lineHeight: 20, paddingVertical: 16 },
	emptyMovement: { padding: 18, borderWidth: 1, borderRadius: 16 },
	inlineError: { marginTop: 8, fontSize: 13, lineHeight: 20 },
	skeletonShort: { width: 110, height: 12 },
	skeletonLong: { width: 180, height: 28, marginTop: 12 },
	skeletonBalance: { width: 150, height: 34, marginTop: 40 },
	investmentSkeleton: { alignItems: "center", gap: 18, paddingVertical: 20 },
	skeletonDonut: { width: 190, height: 190 },
	timelineSkeleton: { gap: 18 },
	skeletonRow: { flexDirection: "row", alignItems: "center", gap: 14 },
	skeletonDot: { width: 42, height: 42 },
	skeletonText: { flex: 1, height: 30 },
});
