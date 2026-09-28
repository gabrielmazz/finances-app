import React from 'react';
import { Pressable, RefreshControl, ScrollView, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronDown, ChevronUp, Info, TrendingDown, TrendingUp, WalletCards } from 'lucide-react-native';

import FinancialForecastChart from '@/components/uiverse/reports/financial-forecast-chart';
import { Accordion, AccordionContent, AccordionHeader, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Navigator from '@/components/uiverse/navigation/navigator';
import { Box } from '@/components/ui/box';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsIndicator, TabsList, TabsTrigger, TabsTriggerText } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HIDDEN_VALUE_PLACEHOLDER, useValueVisibility } from '@/contexts/ValueVisibilityContext';
import { useAuth } from '@/contexts/AuthContext';
import { getFinancialForecastFirebase } from '@/functions/FinancialForecastFirebase';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { LUMUS_CLASS_NAMES, LUMUS_FINANCIAL_GRADIENTS, LUMUS_RUNTIME_COLORS } from '@/design-system/tokens';
import {
	FINANCIAL_FORECAST_PERIOD_OPTIONS,
	type FinancialForecastCommitment,
	type FinancialForecastCommitmentKind,
	type FinancialForecastData,
	type FinancialForecastPeriod,
} from '@/utils/financialForecast';
import { APP_ROUTE_PATHS, navigateToRoute } from '@/utils/navigation';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import FinancialForecastIllustration from '../../assets/UnDraw/financialForecast.svg';

const formatCurrencyBRLBase = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
		minimumFractionDigits: 2,
	}).format(valueInCents / 100);

const formatCompactDate = (value: Date) =>
	new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: '2-digit',
	}).format(value);

const formatChartMonthLabel = (value: Date) => new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(value).replace('.', '');

const getCommitmentKindLabel = (kind: FinancialForecastCommitmentKind) => {
	switch (kind) {
		case 'fixed-expense':
		case 'fixed-gain':
			return 'Fixo';
		case 'variable-expense':
		case 'variable-gain':
			return 'Média recorrente';
		case 'scheduled-expense':
		case 'scheduled-gain':
			return 'Lançamento agendado';
		case 'investment-outflow':
			return 'Aporte em investimento';
		case 'investment-inflow':
			return 'Resgate de investimento';
		case 'investment-liquidity':
			return 'Liquidez';
	}
};

const getCommitmentDetail = (commitment: FinancialForecastCommitment) => {
	if (commitment.isOverdue) {
		return `Pendente desde ${formatCompactDate(commitment.date)}`;
	}

	if (commitment.kind === 'investment-liquidity') {
		return 'Informativo: não entra como resgate automático';
	}

	if (commitment.kind === 'variable-expense' || commitment.kind === 'variable-gain') {
		const recurrence = commitment.historicalOccurrenceMonths
			? `Recorrente em ${commitment.historicalOccurrenceMonths} meses recentes`
			: 'Estimativa de categoria recorrente';
		return commitment.tagName ? `${commitment.tagName} · ${recurrence}` : recurrence;
	}

	return commitment.tagName ? `${formatCompactDate(commitment.date)} · ${commitment.tagName}` : formatCompactDate(commitment.date);
};

const isIncomingCommitment = (kind: FinancialForecastCommitmentKind) =>
	kind === 'fixed-gain' || kind === 'variable-gain' || kind === 'scheduled-gain' || kind === 'investment-inflow';

const getCommitmentToneClassNames = (kind: FinancialForecastCommitmentKind) => {
	if (kind === 'investment-liquidity') {
		return {
			text: 'text-violet-600 dark:text-violet-300',
			background: 'bg-violet-600 dark:bg-violet-300',
		};
	}

	return isIncomingCommitment(kind)
		? {
				text: LUMUS_CLASS_NAMES.incomeText,
				background: 'bg-lumus-income-light dark:bg-lumus-income-dark',
			}
		: {
				text: LUMUS_CLASS_NAMES.expenseText,
				background: 'bg-lumus-expense-light dark:bg-lumus-expense-dark',
			};
};

const FinancialForecastSkeleton = () => (
	<VStack className="gap-5">
		<Skeleton className="h-12 w-full rounded-2xl" />
		<Skeleton className="h-44 w-full rounded-3xl" />
		<HStack className="gap-3">
			<Skeleton className="h-24 flex-1 rounded-2xl" />
			<Skeleton className="h-24 flex-1 rounded-2xl" />
		</HStack>
		<Skeleton className="h-80 w-full rounded-3xl" />
		<Skeleton className="h-32 w-full rounded-3xl" />
	</VStack>
);

export default function FinancialForecastScreen() {
	const { shouldHideValues } = useValueVisibility();
	const { user } = useAuth();
	const currentUserId = user?.uid ?? null;
	const [periodInMonths, setPeriodInMonths] = React.useState<FinancialForecastPeriod>(3);
	const [forecast, setForecast] = React.useState<FinancialForecastData | null>(null);
	const [isLoading, setIsLoading] = React.useState(false);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
	const [expandedMonthKeys, setExpandedMonthKeys] = React.useState<string[]>([]);
	const [showAllCommitmentsFor, setShowAllCommitmentsFor] = React.useState<string[]>([]);
	const requestSequenceRef = React.useRef(0);

	const {
		isDarkMode,
		cardBackground,
		bodyText,
		helperText,
		headingText,
		heroHeight,
		infoCardStyle,
		insets,
		submitButtonClassName,
		submitButtonTextClassName,
		sectionCardClassName,
		notTintedCardClassName,
		webDashboardClassNames,
	} = useScreenStyles();
	const runtimeColors = isDarkMode ? LUMUS_RUNTIME_COLORS.dark : LUMUS_RUNTIME_COLORS.light;

	const formatCurrencyBRL = React.useCallback(
		(valueInCents: number) => (shouldHideValues ? HIDDEN_VALUE_PLACEHOLDER : formatCurrencyBRLBase(valueInCents)),
		[shouldHideValues],
	);

	const formatSignedCurrencyBRL = React.useCallback(
		(valueInCents: number) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}

			return `${valueInCents >= 0 ? '+' : '-'}${formatCurrencyBRLBase(Math.abs(valueInCents))}`;
		},
		[shouldHideValues],
	);

	const loadForecast = React.useCallback(
		async (nextPeriod: FinancialForecastPeriod, asRefresh = false) => {
			const requestId = requestSequenceRef.current + 1;
			requestSequenceRef.current = requestId;

			if (!currentUserId) {
				setForecast(null);
				setErrorMessage('Nenhum usuário autenticado foi identificado.');
				setIsLoading(false);
				setIsRefreshing(false);
				return;
			}

			if (asRefresh) {
				setIsRefreshing(true);
			} else {
				setIsLoading(true);
			}
			setErrorMessage(null);

			const result = await getFinancialForecastFirebase(currentUserId, nextPeriod);
			if (requestId !== requestSequenceRef.current) {
				return;
			}

			if (!result.success) {
				setForecast(null);
				setErrorMessage(result.error);
				setIsLoading(false);
				setIsRefreshing(false);
				return;
			}

			setForecast(result.data);
			setExpandedMonthKeys(current => {
				const allowedKeys = new Set(result.data.months.map(month => month.key));
				const retainedKeys = current.filter(key => allowedKeys.has(key));
				return retainedKeys.length > 0 ? retainedKeys : result.data.months.slice(0, 1).map(month => month.key);
			});
			setIsLoading(false);
			setIsRefreshing(false);
		},
		[currentUserId],
	);

	useFocusEffect(
		React.useCallback(() => {
			void loadForecast(periodInMonths);

			return () => {
				requestSequenceRef.current += 1;
			};
		}, [loadForecast, periodInMonths]),
	);

	const handleSelectPeriod = React.useCallback(
		(nextPeriod: FinancialForecastPeriod) => {
			if (nextPeriod === periodInMonths) {
				return;
			}

			setPeriodInMonths(nextPeriod);
		},
		[periodInMonths],
	);

	const chartData = React.useMemo(() => {
		if (!forecast) {
			return [];
		}

		return [
			{ label: 'Hoje', balanceInCents: forecast.openingBalanceInCents },
			...forecast.months.map(month => ({
				label: formatChartMonthLabel(month.startDate),
				balanceInCents: month.closingBalanceInCents,
			})),
		];
	}, [forecast]);

	const finalMonth = forecast?.months[forecast.months.length - 1] ?? null;
	const forecastTitle = finalMonth ? `Saldo estimado em ${finalMonth.label}` : 'Saldo estimado';

	return (
		<SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['left', 'right', 'bottom']}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

			<View className="flex-1 bg-slate-50 dark:bg-slate-950">
				<View className={`absolute top-0 left-0 right-0 ${cardBackground}`} style={{ height: heroHeight }}>
					<Image
						source={LoginWallpaper}
						alt="Background da previsão financeira"
						className="w-full h-full rounded-b-3xl absolute"
						resizeMode="cover"
					/>

					<VStack className="w-full h-full items-center justify-start px-6 gap-4" style={{ paddingTop: insets.top + 24 }}>
						<Heading size="xl" className="text-white text-center">
							Previsão Financeira
						</Heading>
						<FinancialForecastIllustration width="42%" height="42%" className="opacity-95" />
					</VStack>
				</View>

				<View
					className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1 ${webDashboardClassNames.webSheet}`}
					style={{
						marginTop: heroHeight - 64,
					}}
				>
					<View className={`flex-1 w-full ${webDashboardClassNames.webContentFrame} ${webDashboardClassNames.webContentPadding}`}>
						<ScrollView
							className="flex-1 w-full"
							contentContainerStyle={{ paddingBottom: 18 }}
							showsVerticalScrollIndicator={false}
							refreshControl={
								<RefreshControl
									refreshing={isRefreshing}
									onRefresh={() => void loadForecast(periodInMonths, true)}
									tintColor={runtimeColors.accentStrong}
								/>
							}
						>
							<View className="mb-5 mt-4">
								<HStack className="items-center gap-2 px-2 pb-3">
									<Heading className={`text-lg uppercase tracking-widest ${headingText}`} size="lg">
										Planejamento de caixa
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
												className={LUMUS_CLASS_NAMES.iconButton}
												accessibilityRole="button"
												accessibilityLabel="Informações sobre a previsão financeira"
											>
												<Info size={14} color={runtimeColors.textMuted} />
											</Pressable>
										)}
									>
										<PopoverBackdrop className="bg-transparent" />
										<PopoverContent className="max-w-tooltip" style={infoCardStyle}>
											<PopoverBody className="px-3 py-3">
												<Text className={`${bodyText} text-xs leading-5`}>
													A previsão prioriza compromissos fixos e lançamentos futuros. A estimativa variável
													inclui somente categorias recorrentes em pelo menos 2 dos 3 últimos meses fechados,
													ignorando gastos pontuais. Ela é apenas uma simulação e não cria transações.
												</Text>
											</PopoverBody>
										</PopoverContent>
									</Popover>
								</HStack>

								{isLoading && !forecast ? (
									<FinancialForecastSkeleton />
								) : errorMessage ? (
									<View className={`${sectionCardClassName} px-5 py-5`}>
										<VStack className="gap-4">
											<Text className={`${bodyText} text-sm leading-5`}>{errorMessage}</Text>
											<Button className={submitButtonClassName} onPress={() => void loadForecast(periodInMonths)}>
												<ButtonText className={submitButtonTextClassName}>Tentar novamente</ButtonText>
											</Button>
										</VStack>
									</View>
								) : forecast ? (
									<VStack className="gap-5">
										<View>
											<Box className={`${notTintedCardClassName} p-1.5`}>
												<Tabs
													value={String(periodInMonths)}
													disabled={isLoading}
													onValueChange={nextValue => {
														const nextPeriod = Number(nextValue) as FinancialForecastPeriod;
														if (FINANCIAL_FORECAST_PERIOD_OPTIONS.includes(nextPeriod)) {
															handleSelectPeriod(nextPeriod);
														}
													}}
												>
													<TabsList>
														{FINANCIAL_FORECAST_PERIOD_OPTIONS.map(option => {
															const isSelected = periodInMonths === option;

															return (
																<TabsTrigger key={option} value={String(option)} className="flex-1">
																	<TabsTriggerText className={isSelected ? 'text-white' : undefined}>
																		{option} meses
																	</TabsTriggerText>
																</TabsTrigger>
															);
														})}
														<TabsIndicator />
													</TabsList>
												</Tabs>
											</Box>
										</View>

										<LinearGradient
											colors={
												forecast.finalBalanceInCents >= 0
													? LUMUS_FINANCIAL_GRADIENTS.positive
													: LUMUS_FINANCIAL_GRADIENTS.negative
											}
											start={{ x: 0, y: 0 }}
											end={{ x: 1, y: 1 }}
											style={{ borderRadius: 16, paddingHorizontal: 18, paddingVertical: 18 }}
										>
											<VStack className="gap-4">
												<HStack className="items-start justify-between gap-4">
													<HStack className="flex-1 items-center gap-3">
														<View className="h-11 w-11 items-center justify-center rounded-control bg-white/15">
															<WalletCards size={21} color={LUMUS_RUNTIME_COLORS.light.surface} />
														</View>
														<VStack className="flex-1">
															<Text className="text-xs font-bold uppercase text-white/70">
																{forecastTitle}
															</Text>
															<Text className="mt-1 text-2xl font-bold text-white">
																{formatCurrencyBRL(forecast.finalBalanceInCents)}
															</Text>
														</VStack>
													</HStack>
													<View className="rounded-full bg-white/15 px-3 py-1.5">
														<Text className="text-xs font-bold text-white">{periodInMonths} meses</Text>
													</View>
												</HStack>
												<Text className="text-sm leading-5 text-white">
													{forecast.finalBalanceInCents >= 0
														? 'O cenário permanece com saldo positivo ao final do período selecionado.'
														: 'O cenário indica saldo negativo em algum ponto do período selecionado.'}
												</Text>
											</VStack>
										</LinearGradient>

										<VStack className="gap-5">
											<HStack className="gap-3">
												<View className={`${notTintedCardClassName} flex-1 px-4 py-4`}>
													<Text className={`${helperText} text-xs font-bold uppercase`}>Saldo hoje</Text>
													<Text className={`mt-2 text-lg font-bold ${headingText}`}>
														{formatCurrencyBRL(forecast.openingBalanceInCents)}
													</Text>
												</View>
												<View className={`${notTintedCardClassName} flex-1 px-4 py-4`}>
													<Text className={`${helperText} text-xs font-bold uppercase`}>Variação prevista</Text>
													<Text
														className={`mt-2 text-lg font-bold ${forecast.finalBalanceInCents - forecast.openingBalanceInCents >= 0 ? LUMUS_CLASS_NAMES.incomeText : LUMUS_CLASS_NAMES.expenseText}`}
													>
														{formatSignedCurrencyBRL(
															forecast.finalBalanceInCents - forecast.openingBalanceInCents,
														)}
													</Text>
												</View>
											</HStack>

											{forecast.missingSnapshotBankNames.length > 0 ? (
												<View className="rounded-card border border-lumus-accent/60 bg-lumus-accent-soft px-4 py-3.5 dark:border-lumus-accent-dark/40 dark:bg-lumus-accent-dark/10">
													<VStack className="gap-3">
														<HStack className="items-start gap-2">
															<Info size={17} color={runtimeColors.accentStrong} className="mt-px" />
															<Text className={`${bodyText} flex-1 text-xs leading-5`}>
																O saldo inicial de {forecast.missingSnapshotBankNames.join(', ')} ainda não
																foi incluído porque não há um saldo mensal cadastrado.
															</Text>
														</HStack>
														<Pressable
															onPress={() => navigateToRoute(APP_ROUTE_PATHS.registerMonthlyBalance)}
															accessibilityRole="button"
															className="min-h-touch self-start justify-center rounded-control px-1 focus-visible:ring-2 focus-visible:ring-lumus-focus"
														>
															<Text className={`${LUMUS_CLASS_NAMES.warningText} text-xs font-bold`}>
																Cadastrar saldos mensais
															</Text>
														</Pressable>
													</VStack>
												</View>
											) : null}
											<VStack className="w-full min-w-0 gap-3">
												<HStack className="items-center justify-between gap-3">
													<HStack className="items-center gap-2">
														<Text className={`${bodyText} text-lg font-bold uppercase tracking-widest`}>
															Evolução do saldo
														</Text>
													</HStack>
													{isLoading ? <ButtonSpinner color={runtimeColors.accentStrong} /> : null}
												</HStack>
												<View style={{ height: 280 }}>
													<FinancialForecastChart
														data={chartData}
														isDarkMode={isDarkMode}
														shouldHideValues={shouldHideValues}
														dom={{
															useExpoDOMWebView: false,
															focusable: false,
															scrollEnabled: true,
															style: {
																height: 280,
																backgroundColor: 'transparent',
															},
														}}
													/>
												</View>
											</VStack>
										</VStack>

										<VStack className="gap-3">
											<HStack className="items-center gap-2 px-1">
												<Text className={`${bodyText} text-lg font-bold uppercase tracking-widest`}>
													Detalhamento mensal
												</Text>
											</HStack>

											<Accordion type="multiple" variant="unfilled" value={expandedMonthKeys} onValueChange={setExpandedMonthKeys} className="w-full gap-0">
												{forecast.months.map(month => {
												const isExpanded = expandedMonthKeys.includes(month.key);
												const isPositiveMonth = month.netChangeInCents >= 0;
												return (
														<AccordionItem key={month.key} value={month.key} className="w-full border-0 border-b border-slate-200 bg-transparent dark:border-slate-800">
															<AccordionHeader className="w-full"><AccordionTrigger className="min-h-touch w-full px-1 py-4 focus-visible:ring-2 focus-visible:ring-lumus-focus">
																<HStack className="w-full flex-1 items-center justify-between gap-3">
																<VStack className="flex-1">
																	<Text className={`${headingText} text-sm font-bold`}>
																		{month.label}
																	</Text>
																</VStack>
																<HStack className="ml-auto items-center gap-3">
																	<Text
																		className={`text-sm font-bold ${month.closingBalanceInCents >= 0 ? LUMUS_CLASS_NAMES.incomeText : LUMUS_CLASS_NAMES.expenseText}`}
																	>
																		{formatCurrencyBRL(month.closingBalanceInCents)}
																	</Text>
																	{isExpanded ? (
																		<ChevronUp size={18} color={runtimeColors.textMuted} />
																	) : (
																		<ChevronDown size={18} color={runtimeColors.textMuted} />
																	)}
																</HStack>
															</HStack>
														</AccordionTrigger></AccordionHeader>

														<AccordionContent className="px-1 pb-4 pt-1">
															<VStack className="gap-4">
																<HStack className="gap-2">
																	<View className={`${notTintedCardClassName} flex-1 px-3 py-3`}>
																		<Text className={`${helperText} text-2xs font-bold uppercase`}>
																			Entradas
																		</Text>
																		<Text
																			className={`mt-1 text-sm font-bold ${LUMUS_CLASS_NAMES.incomeText}`}
																		>
																			{formatCurrencyBRL(month.gainsInCents)}
																		</Text>
																	</View>
																	<View className={`${notTintedCardClassName} flex-1 px-3 py-3`}>
																		<Text className={`${helperText} text-2xs font-bold uppercase`}>
																			Saídas
																		</Text>
																		<Text
																			className={`mt-1 text-sm font-bold ${LUMUS_CLASS_NAMES.expenseText}`}
																		>
																			{formatCurrencyBRL(month.expensesInCents)}
																		</Text>
																	</View>
																	<View className={`${notTintedCardClassName} flex-1 px-3 py-3`}>
																		<Text className={`${helperText} text-2xs font-bold uppercase`}>
																			Variação
																		</Text>
																		<Text
																			className={`mt-1 text-sm font-bold ${isPositiveMonth ? LUMUS_CLASS_NAMES.incomeText : LUMUS_CLASS_NAMES.expenseText}`}
																		>
																			{formatSignedCurrencyBRL(month.netChangeInCents)}
																		</Text>
																	</View>
																</HStack>

																{month.commitments.length > 0 ? (
																	<VStack className="gap-3">
																		{(showAllCommitmentsFor.includes(month.key) ? month.commitments : month.commitments.slice(0, 3)).map(commitment => {
																			const isIncoming = isIncomingCommitment(commitment.kind);
																			const toneClassNames = getCommitmentToneClassNames(
																				commitment.kind,
																			);
																			return (
																				<HStack key={commitment.id} className="items-center gap-3">
																					<View
																						className={`h-2.5 w-2.5 rounded-full ${toneClassNames.background}`}
																					/>
																					<VStack className="flex-1">
																						<Text
																							numberOfLines={1}
																							className={`${headingText} text-sm font-bold`}
																						>
																							{commitment.name}
																						</Text>
																						<Text
																							numberOfLines={1}
																							className={`${helperText} text-xs`}
																						>
																							{getCommitmentKindLabel(commitment.kind)} ·{' '}
																							{getCommitmentDetail(commitment)}
																						</Text>
																					</VStack>
																					<Text
																						className={`${toneClassNames.text} text-sm font-bold`}
																					>
																						{commitment.kind === 'investment-liquidity'
																							? formatCurrencyBRL(commitment.valueInCents)
																							: `${isIncoming ? '+' : '-'}${formatCurrencyBRL(commitment.valueInCents)}`}
																					</Text>
																				</HStack>
																			);
																		})}
																									{month.commitments.length > 3 ? (
																			<Button
																				variant="link"
																				action="primary"
																				className="min-h-touch self-start"
																				onPress={() => setShowAllCommitmentsFor(current => current.includes(month.key) ? current.filter(key => key !== month.key) : [...current, month.key])}
																			>
																				<ButtonText>
																					{showAllCommitmentsFor.includes(month.key) ? 'Mostrar menos compromissos' : `Mostrar mais ${month.commitments.length - 3} compromissos`}
																				</ButtonText>
																			</Button>
																		) : null}
																	</VStack>
																) : (
																	<View className="rounded-control border border-slate-200 bg-slate-50 px-3.5 py-3.5 dark:border-slate-800 dark:bg-slate-950">
																		<Text className={`${helperText} text-xs leading-5`}>
																			Nenhum compromisso foi projetado para este mês com os dados
																			disponíveis.
																		</Text>
																	</View>
																)}
															</VStack>
														</AccordionContent>
													</AccordionItem>
												);
											})}
										</Accordion>
										</VStack>
									</VStack>
								) : null}
							</View>
						</ScrollView>

						<View className="-mx-4.5 pb-0">
							<Navigator defaultValue={0} />
						</View>
					</View>
				</View>
			</View>
		</SafeAreaView>
	);
}
