import BankMovementsScreen from './BankMovementsScreen.web';
import React from "react";
import { ArrowDownCircle, ArrowUpCircle, Info } from "lucide-react";
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
import Carousel from "@/components/web/visuals/Carousel";
import AnimatedContent from "@/components/web/motion/AnimatedContent";
import Grainient from "@/components/web/visuals/Grainient";
import StrokeText from "@/components/web/visuals/StrokeText";
import HomeExpenseChart from "@/components/uiverse/dashboard/home-expense-chart";
import HomeExpenseLineChart from "@/components/uiverse/dashboard/home-expense-line-chart";
import HomeActivityHeatmap from "@/components/uiverse/dashboard/home-activity-heatmap";
import HomeInvestmentChart from "@/components/uiverse/dashboard/home-investment-chart";

import Navigator from "@/components/uiverse/navigation/navigator";
import {
	BankCardSurface,
	CASH_CARD_COLOR,
	buildBankCardPalette,
	type BankCardPalette,
} from "@/components/uiverse/banks/bank-card-surface";
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
import { HIDDEN_VALUE_PLACEHOLDER, useValueVisibility } from "@/contexts/ValueVisibilityContext";
import { type HomeBankBalanceCard, type HomeCashSummary } from "@/functions/HomeFirebase";
import { type HomeMandatoryItem } from "@/utils/homeMandatorySchedule";
import { useHomeScreenData } from "@/hooks/useHomeScreenData";

import { LUMUS_CHART_COLORS } from "@/design-system/tokens";
import { WEB_DASHBOARD_CLASS_NAMES, WEB_DASHBOARD_DOM_STYLES } from "@/design-system/web-dashboard";
import { useScreenStyles } from "@/hooks/useScreenStyle";
import { getUserDataFirebase } from "@/functions/RegisterUserFirebase";
import { APP_ROUTE_PATHS, navigateToRoute } from "@/utils/navigation";
import LoginWallpaper from "../../assets/Background/wallpaper01.png";
import HomeScreenIllustration from "../../assets/UnDraw/homeScreen.svg";

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

const INVESTMENT_COLORS = [...LUMUS_CHART_COLORS];

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
	const [bankSectionWidth, setBankSectionWidth] = React.useState<number | null>(null);
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
	const homeReadError = overview.error || movements.error || investments.error;
	const isHomeLoading = overview.loading || movements.loading || investments.loading;
	const [isRefreshing, setIsRefreshing] = React.useState(false);

	const [isMonthlyBalanceModalOpen, setIsMonthlyBalanceModalOpen] =
		React.useState(false);
	const [dismissedPrompt, setDismissedPrompt] = React.useState<string | null>(
		null,
	);
	const compact = width < 720;
	const desktop = width >= 1024;
	const requestedBankCarouselWidth = compact ? width : 610;
	const bankCarouselWidth = Math.max(
		Math.min(bankSectionWidth ?? requestedBankCarouselWidth, requestedBankCarouselWidth),
		1,
	);
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
		(month) => Object.values(month.dailyExpensesInCents).some(value => value !== 0),
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
	return (
		<SafeAreaView
			className={webDashboardClassNames.screen}
			style={{ backgroundColor: surfaceBackground }}
			edges={["left", "right", "bottom"]}
		>
			<ScrollView
				className={`${webDashboardClassNames.fill} h-screen overflow-y-auto`}
				contentContainerStyle={{ flexGrow: 1 }}
				showsVerticalScrollIndicator
				refreshControl={
					<RefreshControl
						refreshing={isRefreshing}
						onRefresh={handleRefresh}
						tintColor="#FACC15"
					/>
				}
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
							className="pointer-events-none"
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
						<View className={webDashboardClassNames.sheetInner}>
							<View className={webDashboardClassNames.scrollContent}>
								<View className="mb-4 gap-2">
									{homeReadError ? <Text accessibilityRole="alert" className="text-sm text-error-600 dark:text-error-400">{homeReadError}</Text> : null}
									<Button className="min-h-touch self-end rounded-control lumus-focus" action="primary" isDisabled={isHomeLoading || isRefreshing} onPress={() => void handleRefresh()}>
										<ButtonText className="text-lumus-on-accent">{isHomeLoading || isRefreshing ? 'Atualizando…' : homeReadError ? 'Tentar novamente' : 'Atualizar saldos'}</ButtonText>
									</Button>
								</View>
								<View
									className={`${webStyles.topColumns} ${desktop ? webStyles.topColumnsDesktop : ''} ${desktop && !shouldShowInvestmentSection ? webStyles.topColumnsDesktopCentered : ''}`}
								>
									<View
										className={`${webStyles.section} ${desktop ? webStyles.columnSection : ''} ${desktop ? webStyles.bankSection : ''} ${desktop && !shouldShowInvestmentSection ? webStyles.bankSectionCentered : ''}`}
										onLayout={(event) => {
											const nextWidth = Math.round(event.nativeEvent.layout.width);
											setBankSectionWidth((current) =>
												current === nextWidth ? current : nextWidth,
											);
										}}
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
												baseWidth={bankCarouselWidth}
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
													{investments.data.projectionStatus === 'confirmed_only' ? ' Os valores são confirmados, sem projeção adicional de rendimento.' : ''}
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
											) : distributionItems.length === 0 ? (
												<Text className={webStyles.emptyText} style={{ color: webDashboardPalette.primaryText }}>
													Os investimentos ainda não possuem valor atual/base para
													exibir a distribuição.
												</Text>
											) : (
												<View className={webStyles.investmentVisual}>
													<HomeInvestmentChart
														items={distributionItems.map((item, index) => ({
															name: item.name,
															valueInCents: item.currentBaseValueInCents,
															color: INVESTMENT_COLORS[index % INVESTMENT_COLORS.length],
														}))}
														investmentCount={portfolio.investmentCount}
														isDarkMode={isDarkMode}
														shouldHideValues={shouldHideValues}
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
																{investments.data.projectionStatus === 'confirmed_only' ? 'Confirmado' : 'Simulado'}
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
													{overview.loading ? 'Carregando…' : overview.error ? 'Indisponível' : formatCurrency(monthlyTotals.gainsInCents, shouldHideValues)}
												</Text>
												<Text
													className={webStyles.monthlySummaryHelper} style={{ color: webDashboardPalette.secondaryText }}
												>
													Entradas no mês atual
												</Text>
											</View>
											<HomeExpenseChart
												data={shouldHideValues || overview.loading || overview.error ? neutralTrendData : gainTrendData}
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
													{overview.loading ? 'Carregando…' : overview.error ? 'Indisponível' : formatCurrency(monthlyTotals.expensesInCents, shouldHideValues)}
												</Text>
												<Text
													className={webStyles.monthlySummaryHelper} style={{ color: webDashboardPalette.secondaryText }}
												>
													Saídas no mês atual
												</Text>
											</View>
											<HomeExpenseChart
												data={shouldHideValues || overview.loading || overview.error ? neutralTrendData : expenseTrendData}
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
									className={webStyles.expenseChartSection}
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
									className={webStyles.activityHeatmapSection}
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
									className={webStyles.mandatorySection}
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

								<BankMovementsScreen
									recentMovements={{
										items: movements.data.timelineMovements,
										banks: overview.data.bankBalances,
										loading: movements.loading,
										error: movements.error,
										reload,
									}}
								/>
							</View>
						</View>
					</View>
				</View>
			</ScrollView>
			<Navigator defaultValue={0} />
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
