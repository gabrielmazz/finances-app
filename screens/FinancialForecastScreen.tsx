import React from 'react';
import {
	Pressable,
	RefreshControl,
	ScrollView,
	StatusBar,
	View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
	CalendarClock,
	ChevronDown,
	ChevronUp,
	Info,
	TrendingDown,
	TrendingUp,
	WalletCards,
} from 'lucide-react-native';

import { auth } from '@/FirebaseConfig';
import FinancialForecastChart from '@/components/uiverse/financial-forecast-chart';
import Navigator from '@/components/uiverse/navigator';
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
import { getFinancialForecastFirebase } from '@/functions/FinancialForecastFirebase';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import {
	FINANCIAL_FORECAST_PERIOD_OPTIONS,
	type FinancialForecastCommitment,
	type FinancialForecastCommitmentKind,
	type FinancialForecastData,
	type FinancialForecastPeriod,
} from '@/utils/financialForecast';
import { APP_ROUTE_PATHS, navigateToRoute } from '@/utils/navigation';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import FinancialForecastIllustration from '../assets/UnDraw/financialForecast.svg';

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

const formatChartMonthLabel = (value: Date) =>
	new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(value).replace('.', '');

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
	const currentUserId = auth.currentUser?.uid ?? null;
	const [periodInMonths, setPeriodInMonths] = React.useState<FinancialForecastPeriod>(3);
	const [forecast, setForecast] = React.useState<FinancialForecastData | null>(null);
	const [isLoading, setIsLoading] = React.useState(false);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
	const [expandedMonthKeys, setExpandedMonthKeys] = React.useState<string[]>([]);
	const requestSequenceRef = React.useRef(0);

	const {
		isDarkMode,
		surfaceBackground,
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
		tintedCardClassName,
		notTintedCardClassName,
	} = useScreenStyles();

	const palette = React.useMemo(
		() => ({
			title: isDarkMode ? '#F8FAFC' : '#0F172A',
			subtitle: isDarkMode ? '#94A3B8' : '#64748B',
			border: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : '#E2E8F0',
			emptySurface: isDarkMode ? '#020617' : '#F8FAFC',
			activeSurface: isDarkMode ? 'rgba(250, 204, 21, 0.14)' : '#FEF9C3',
			activeBorder: isDarkMode ? 'rgba(250, 204, 21, 0.42)' : '#FACC15',
			positive: isDarkMode ? '#34D399' : '#059669',
			negative: isDarkMode ? '#F87171' : '#DC2626',
			warning: isDarkMode ? '#FDE047' : '#CA8A04',
			investment: isDarkMode ? '#C4B5FD' : '#7C3AED',
		}),
		[isDarkMode],
	);

	const formatCurrencyBRL = React.useCallback(
		(valueInCents: number) =>
			shouldHideValues ? HIDDEN_VALUE_PLACEHOLDER : formatCurrencyBRLBase(valueInCents),
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

	const handleToggleMonth = React.useCallback((monthKey: string) => {
		setExpandedMonthKeys(current =>
			current.includes(monthKey) ? current.filter(key => key !== monthKey) : [...current, monthKey],
		);
	}, []);

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
						alt="Background da previsão financeira"
						className="w-full h-full rounded-b-3xl absolute"
						resizeMode="cover"
					/>

					<VStack
						className="w-full h-full items-center justify-start px-6 gap-4"
						style={{ paddingTop: insets.top + 24 }}
					>
						<Heading size="xl" className="text-white text-center">
							Previsão Financeira
						</Heading>
						<FinancialForecastIllustration width="42%" height="42%" className="opacity-95" />
					</VStack>
				</View>

				<View
					className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
					style={{ marginTop: heroHeight - 64 }}
				>
					<View className="flex-1 w-full">
						<ScrollView
							className="flex-1 w-full"
							contentContainerStyle={{ paddingBottom: 18 }}
							showsVerticalScrollIndicator={false}
							refreshControl={
								<RefreshControl
									refreshing={isRefreshing}
									onRefresh={() => void loadForecast(periodInMonths, true)}
									tintColor={palette.warning}
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
												hitSlop={8}
												accessibilityRole="button"
												accessibilityLabel="Informações sobre a previsão financeira"
											>
												<Info size={14} color={palette.subtitle} style={{ marginLeft: 2 }} />
											</Pressable>
										)}
									>
										<PopoverBackdrop className="bg-transparent" />
										<PopoverContent className="max-w-[278px]" style={infoCardStyle}>
											<PopoverBody className="px-3 py-3">
													<Text className={`${bodyText} text-xs leading-5`}>
														A previsão prioriza compromissos fixos e lançamentos futuros. A estimativa variável inclui somente categorias recorrentes em pelo menos 2 dos 3 últimos meses fechados, ignorando gastos pontuais. Ela é apenas uma simulação e não cria transações.
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
											<Text className={`${helperText} mb-2 text-xs font-semibold`}>
												Escolha o horizonte da previsão
											</Text>
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
														{FINANCIAL_FORECAST_PERIOD_OPTIONS.map(option => (
															<TabsTrigger key={option} value={String(option)} className="flex-1">
																<TabsTriggerText>{option} meses</TabsTriggerText>
															</TabsTrigger>
														))}
														<TabsIndicator />
													</TabsList>
												</Tabs>
											</Box>
										</View>

										<LinearGradient
											colors={['#713F12', '#EAB308']}
											start={{ x: 0, y: 0 }}
											end={{ x: 1, y: 1 }}
											style={{ borderRadius: 24, paddingHorizontal: 18, paddingVertical: 18 }}
										>
											<VStack className="gap-4">
												<HStack className="items-start justify-between gap-4">
													<HStack className="flex-1 items-center gap-3">
														<View
															style={{
																width: 46,
																height: 46,
																borderRadius: 17,
																alignItems: 'center',
																justifyContent: 'center',
																backgroundColor: 'rgba(255,255,255,0.16)',
															}}
														>
															<WalletCards size={21} color="#FFFFFF" />
														</View>
														<VStack className="flex-1">
															<Text className="text-xs font-bold uppercase text-white/70">{forecastTitle}</Text>
															<Text className="mt-1 text-2xl font-bold text-white">
																{formatCurrencyBRL(forecast.finalBalanceInCents)}
															</Text>
														</VStack>
													</HStack>
													<View
														style={{ borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 6 }}
													>
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

										<HStack className="gap-3">
											<View className={`${notTintedCardClassName} flex-1 px-4 py-4`}>
												<Text className={`${helperText} text-xs font-bold uppercase`}>Saldo hoje</Text>
												<Text className={`mt-2 text-lg font-bold ${headingText}`}>
													{formatCurrencyBRL(forecast.openingBalanceInCents)}
												</Text>
												<Text className={`${helperText} mt-1 text-xs`}>Bancos e dinheiro conhecidos</Text>
											</View>
											<View className={`${notTintedCardClassName} flex-1 px-4 py-4`}>
												<Text className={`${helperText} text-xs font-bold uppercase`}>Variação prevista</Text>
												<Text
													className="mt-2 text-lg font-bold"
													style={{ color: forecast.finalBalanceInCents - forecast.openingBalanceInCents >= 0 ? palette.positive : palette.negative }}
												>
													{formatSignedCurrencyBRL(forecast.finalBalanceInCents - forecast.openingBalanceInCents)}
												</Text>
												<Text className={`${helperText} mt-1 text-xs`}>Entradas menos saídas previstas</Text>
											</View>
										</HStack>

										{forecast.missingSnapshotBankNames.length > 0 ? (
											<View
												style={{
													borderRadius: 18,
													borderWidth: 1,
													borderColor: palette.activeBorder,
													backgroundColor: palette.activeSurface,
													paddingHorizontal: 16,
													paddingVertical: 14,
												}}
											>
												<VStack className="gap-3">
													<HStack className="items-start gap-2">
														<Info size={17} color={palette.warning} style={{ marginTop: 1 }} />
														<Text className={`${bodyText} flex-1 text-xs leading-5`}>
															O saldo inicial de {forecast.missingSnapshotBankNames.join(', ')} ainda não foi incluído porque não há um saldo mensal cadastrado.
														</Text>
													</HStack>
													<Pressable
														onPress={() => navigateToRoute(APP_ROUTE_PATHS.registerMonthlyBalance)}
														accessibilityRole="button"
													>
														<Text style={{ color: palette.warning, fontSize: 12, fontWeight: '700' }}>
															Cadastrar saldos mensais
														</Text>
													</Pressable>
												</VStack>
											</View>
										) : null}

										<View className={`${sectionCardClassName} px-5 py-5`}>
											<VStack className="gap-3">
												<HStack className="items-center justify-between gap-3">
													<HStack className="items-center gap-2">
														<CalendarClock size={18} color={palette.warning} />
														<Heading size="sm" className={headingText}>
															Evolução do saldo
														</Heading>
													</HStack>
													{isLoading ? <ButtonSpinner color={palette.warning} /> : null}
												</HStack>
												<View style={{ height: 280 }}>
													<FinancialForecastChart
														data={chartData}
														isDarkMode={isDarkMode}
														shouldHideValues={shouldHideValues}
														dom={{ focusable: false, scrollEnabled: true, style: { height: 280, backgroundColor: 'transparent' } }}
													/>
												</View>
											</VStack>
										</View>

										<VStack className="gap-3">
											<HStack className="items-center gap-2 px-1">
												<CalendarClock size={18} color={palette.warning} />
												<Heading size="sm" className={headingText}>
													Detalhamento mensal
												</Heading>
											</HStack>

											{forecast.months.map(month => {
												const isExpanded = expandedMonthKeys.includes(month.key);
												const isPositiveMonth = month.netChangeInCents >= 0;
												return (
													<View key={month.key} className={`${sectionCardClassName} overflow-hidden`}>
														<Pressable
															onPress={() => handleToggleMonth(month.key)}
															accessibilityRole="button"
															accessibilityState={{ expanded: isExpanded }}
															style={{ paddingHorizontal: 18, paddingVertical: 16 }}
														>
															<HStack className="items-center justify-between gap-3">
																<VStack className="flex-1">
																	<Text style={{ color: palette.title, fontSize: 15, fontWeight: '700' }}>{month.label}</Text>
																	<Text className={`${helperText} mt-1 text-xs`}>
																		Saldo ao fim do mês
																	</Text>
																</VStack>
																<HStack className="items-center gap-3">
																	<Text
																		style={{ color: month.closingBalanceInCents >= 0 ? palette.positive : palette.negative, fontSize: 14, fontWeight: '700' }}
																	>
																		{formatCurrencyBRL(month.closingBalanceInCents)}
																	</Text>
																	{isExpanded ? <ChevronUp size={18} color={palette.subtitle} /> : <ChevronDown size={18} color={palette.subtitle} />}
																</HStack>
															</HStack>
														</Pressable>

														{isExpanded ? (
															<VStack className="gap-4 border-t border-slate-200 px-4 py-4 dark:border-slate-800">
																<HStack className="gap-2">
																	<View className={`${notTintedCardClassName} flex-1 px-3 py-3`}>
																		<Text className={`${helperText} text-[11px] font-bold uppercase`}>Entradas</Text>
																		<Text className="mt-1 text-sm font-bold" style={{ color: palette.positive }}>
																			{formatCurrencyBRL(month.gainsInCents)}
																		</Text>
																	</View>
																	<View className={`${notTintedCardClassName} flex-1 px-3 py-3`}>
																		<Text className={`${helperText} text-[11px] font-bold uppercase`}>Saídas</Text>
																		<Text className="mt-1 text-sm font-bold" style={{ color: palette.negative }}>
																			{formatCurrencyBRL(month.expensesInCents)}
																		</Text>
																	</View>
																	<View className={`${notTintedCardClassName} flex-1 px-3 py-3`}>
																		<Text className={`${helperText} text-[11px] font-bold uppercase`}>Variação</Text>
																		<Text className="mt-1 text-sm font-bold" style={{ color: isPositiveMonth ? palette.positive : palette.negative }}>
																			{formatSignedCurrencyBRL(month.netChangeInCents)}
																		</Text>
																	</View>
																</HStack>

																{month.commitments.length > 0 ? (
																	<VStack className="gap-3">
																		<Text className={`${helperText} text-xs font-semibold`}>
																			Compromissos considerados
																		</Text>
																		{month.commitments.map(commitment => {
																			const isIncoming = isIncomingCommitment(commitment.kind);
																			const tone =
																				commitment.kind === 'investment-liquidity'
																					? palette.investment
																					: isIncoming
																						? palette.positive
																						: palette.negative;
																			return (
																				<HStack key={commitment.id} className="items-center gap-3">
																					<View
																						style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: tone }}
																					/>
																					<VStack className="flex-1">
																						<Text numberOfLines={1} style={{ color: palette.title, fontSize: 13, fontWeight: '700' }}>
																							{commitment.name}
																						</Text>
																						<Text numberOfLines={1} className={`${helperText} text-xs`}>
																							{getCommitmentKindLabel(commitment.kind)} · {getCommitmentDetail(commitment)}
																						</Text>
																					</VStack>
																					<Text style={{ color: tone, fontSize: 13, fontWeight: '700' }}>
																						{commitment.kind === 'investment-liquidity'
																							? formatCurrencyBRL(commitment.valueInCents)
																							: `${isIncoming ? '+' : '-'}${formatCurrencyBRL(commitment.valueInCents)}`}
																					</Text>
																				</HStack>
																			);
																		})}
																	</VStack>
																) : (
																	<View
																		style={{
																			borderRadius: 16,
																			borderWidth: 1,
																			borderColor: palette.border,
																			backgroundColor: palette.emptySurface,
																			paddingHorizontal: 14,
																			paddingVertical: 14,
																		}}
																	>
																		<Text className={`${helperText} text-xs leading-5`}>
																			Nenhum compromisso foi projetado para este mês com os dados disponíveis.
																		</Text>
																	</View>
																)}
															</VStack>
														) : null}
													</View>
												);
											})}
										</VStack>
									</VStack>
								) : null}
							</View>
						</ScrollView>

						<View style={{ marginHorizontal: -18, paddingBottom: 0 }}>
							<Navigator defaultValue={0} />
						</View>
					</View>
				</View>
			</View>
		</SafeAreaView>
	);
}
