import React from 'react';
import { ScrollView, TouchableOpacity, View, StatusBar, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { VStack } from '@/components/ui/vstack';
import Navigator from '@/components/uiverse/navigator';
import { Grid, GridItem } from '@/components/ui/grid';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';

import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import {
	getBanksWithUsersByPersonFirebase,
	getCurrentMonthSummaryByBankFirebaseExpanses,
	getCurrentMonthSummaryByBankFirebaseGains,
	getCurrentMonthCashExpensesFirebase,
	getCurrentMonthCashGainsFirebase,
} from '@/functions/BankFirebase';
import { getMonthlyBalanceFirebaseRelatedToUser } from '@/functions/MonthlyBalanceFirebase';
import { getFinanceInvestmentsByPeriodFirebase } from '@/functions/FinancesFirebase';
import { computeMonthlyBankBalances, MonthlyBankBalance } from '@/utils/monthlyBalance';

import MonthlyBankMovementsIllustration from '../assets/UnDraw/monthlyBankSummaryScreen.svg';
import { useAppTheme } from '@/contexts/ThemeContext';

type BankSummary = {
	isCashSummary?: boolean;
} & MonthlyBankBalance;

function formatCurrencyBRLBase(valueInCents: number): string {
	return new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
		minimumFractionDigits: 2,
	}).format((valueInCents ?? 0) / 100);
}

export default function MonthlyBankSummaryScreen() {
	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { height: windowHeight } = useWindowDimensions();

	const surfaceBackground = isDarkMode ? '#020617' : '#FFFFFF';
	const cardBackground = isDarkMode ? 'bg-slate-950' : 'bg-white';
	const headingText = isDarkMode ? 'text-slate-100' : 'text-slate-900';
	const bodyText = isDarkMode ? 'text-slate-300' : 'text-slate-700';
	const labelText = isDarkMode ? 'text-slate-300' : 'text-slate-700';
	const helperText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
	const focusFieldClassName =
		'data-[focus=true]:border-[#FFE000] dark:data-[focus=true]:border-yellow-300';
	const fieldContainerClassName = `h-10 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const fieldContainerCardClassName = `rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const heroHeight = Math.max(windowHeight * 0.28, 250) + insets.top;
	const [isLoading, setIsLoading] = React.useState(false);
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
	const [bankSummaries, setBankSummaries] = React.useState<BankSummary[]>([]);
	const { shouldHideValues } = useValueVisibility();

	const formatCurrencyBRL = React.useCallback(
		(valueInCents: number) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}
			return formatCurrencyBRLBase(valueInCents);
		},
		[shouldHideValues],
	);

	const formatMovementsCount = React.useCallback(
		(totalMovements: number) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}
			return String(totalMovements);
		},
		[shouldHideValues],
	);

	const handleOpenBankMovements = React.useCallback((bankId: string, bankName: string, colorHex?: string | null) => {
		if (!bankId) {
			return;
		}

		router.push({
			pathname: '/bank-movements',
			params: {
				bankId,
				bankName: encodeURIComponent(bankName),
				...(colorHex ? { bankColor: encodeURIComponent(colorHex) } : {}),
			},
		});
	}, []);

	const handleOpenCashMovements = React.useCallback(() => {
		router.push({
			pathname: '/bank-movements',
			params: {
				cashView: 'true',
				bankName: encodeURIComponent('Transações em dinheiro'),
			},
		});
	}, []);

	useFocusEffect(
		React.useCallback(() => {
			let isMounted = true;

			const loadData = async () => {
				setIsLoading(true);
				setErrorMessage(null);
				setBankSummaries([]);

				const currentUser = auth.currentUser;

				if (!currentUser) {
					if (isMounted) {
						setErrorMessage('Nenhum usuário autenticado foi identificado.');
						setIsLoading(false);
					}
					return;
				}

				try {
					const now = new Date();
					const currentYear = now.getFullYear();
					const currentMonth = now.getMonth() + 1;
					const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
					const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

					const [
						banksResult,
						expensesResult,
						gainsResult,
						cashExpensesResult,
						cashGainsResult,
					] = await Promise.all([
						getBanksWithUsersByPersonFirebase(currentUser.uid),
						getCurrentMonthSummaryByBankFirebaseExpanses(currentUser.uid),
						getCurrentMonthSummaryByBankFirebaseGains(currentUser.uid),
						getCurrentMonthCashExpensesFirebase(currentUser.uid),
						getCurrentMonthCashGainsFirebase(currentUser.uid),
					]);

					if (!isMounted) {
						return;
					}

					if (!banksResult?.success) {
						setErrorMessage('Erro ao carregar os bancos vinculados.');
						return;
					}

					const banksArray: any[] = Array.isArray(banksResult.data) ? banksResult.data : [];
					const expensesArray: any[] =
						expensesResult?.success && Array.isArray(expensesResult.data)
							? expensesResult.data
							: [];
					const gainsArray: any[] =
						gainsResult?.success && Array.isArray(gainsResult.data) ? gainsResult.data : [];

					const cashExpensesArray =
						cashExpensesResult?.success && Array.isArray(cashExpensesResult.data)
							? cashExpensesResult.data
							: [];
					const cashGainsArray =
						cashGainsResult?.success && Array.isArray(cashGainsResult.data)
							? cashGainsResult.data
							: [];

					const [balanceResults, investmentResults] = await Promise.all([
						Promise.all(
							banksArray.map(async bank => {
								const bankId = typeof bank?.id === 'string' ? bank.id : '';

								if (!bankId) {
									return { bankId, valueInCents: null };
								}

								try {
									const balanceResponse = await getMonthlyBalanceFirebaseRelatedToUser({
										personId: currentUser.uid,
										bankId,
										year: currentYear,
										month: currentMonth,
									});

									if (
										balanceResponse?.success &&
										balanceResponse.data &&
										typeof balanceResponse.data.valueInCents === 'number'
									) {
										return { bankId, valueInCents: balanceResponse.data.valueInCents };
									}

									return { bankId, valueInCents: null };
								} catch (error) {
									console.error(`Erro ao obter saldo mensal para o banco ${bankId}:`, error);
									return { bankId, valueInCents: null };
								}
							}),
						),
						Promise.all(
							banksArray.map(async bank => {
								const bankId = typeof bank?.id === 'string' ? bank.id : '';

								if (!bankId) {
									return { bankId, investments: [] as any[] };
								}

								const response = await getFinanceInvestmentsByPeriodFirebase({
									personId: currentUser.uid,
									bankId,
									startDate: startOfMonth,
									endDate: endOfMonth,
								});

								if (response?.success && Array.isArray(response.data)) {
									const normalizedInvestments = (response.data as any[]).map(raw => ({
										...raw,
										bankId,
										initialValueInCents:
											typeof raw?.initialValueInCents === 'number'
												? raw.initialValueInCents
												: typeof raw?.initialInvestedInCents === 'number'
													? raw.initialInvestedInCents
													: undefined,
										initialInvestedInCents:
											typeof raw?.initialInvestedInCents === 'number'
												? raw.initialInvestedInCents
												: undefined,
										currentValueInCents:
											typeof raw?.currentValueInCents === 'number'
												? raw.currentValueInCents
												: typeof raw?.lastManualSyncValueInCents === 'number'
													? raw.lastManualSyncValueInCents
													: typeof raw?.initialValueInCents === 'number'
														? raw.initialValueInCents
														: undefined,
										valueInCents: typeof raw?.valueInCents === 'number' ? raw.valueInCents : undefined,
										lastManualSyncValueInCents:
											typeof raw?.lastManualSyncValueInCents === 'number'
												? raw.lastManualSyncValueInCents
												: null,
									}));
									return { bankId, investments: normalizedInvestments };
								}

								return { bankId, investments: [] as any[] };
							}),
						),
					]);

					const balancesByBank = balanceResults.reduce<Record<string, number | null>>((acc, result) => {
						if (result.bankId) {
							acc[result.bankId] = typeof result.valueInCents === 'number' ? result.valueInCents : null;
						}
						return acc;
					}, {});

					const investmentsByBank = investmentResults.reduce<Record<string, any[]>>((acc, item) => {
						if (item.bankId) {
							acc[item.bankId] = Array.isArray(item.investments) ? item.investments : [];
						}
						return acc;
					}, {});

					const summaries: BankSummary[] = computeMonthlyBankBalances({
						banks: banksArray
							.map(bank => ({
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
							.filter(bank => bank.id),
						initialBalancesByBank: balancesByBank,
						expenses: expensesArray,
						gains: gainsArray,
						investmentsByBank,
					});

					const sumValues = (items: any[]) =>
						items.reduce((acc, item) => {
							const value =
								typeof item?.valueInCents === 'number' && !Number.isNaN(item.valueInCents)
									? item.valueInCents
									: 0;
							return acc + value;
						}, 0);

					const totalCashExpensesInCents = sumValues(cashExpensesArray);
					const totalCashGainsInCents = sumValues(cashGainsArray);
					const totalCashMovements = cashExpensesArray.length + cashGainsArray.length;

					const hasCashTransactions =
						totalCashMovements > 0 || totalCashExpensesInCents > 0 || totalCashGainsInCents > 0;

					const combinedSummaries = hasCashTransactions
						? [
								...summaries,
								{
									id: 'cash-transactions',
									name: 'Transações em dinheiro',
									colorHex: '#525252',
									totalExpensesInCents: totalCashExpensesInCents,
									totalGainsInCents: totalCashGainsInCents,
									totalInvestedInCents: 0,
									totalInvestmentRedemptionsInCents: 0,
									totalMovements: totalCashMovements,
									initialBalanceInCents: null,
									currentBalanceInCents: totalCashGainsInCents - totalCashExpensesInCents,
									isCashSummary: true,
								} as BankSummary,
						  ]
						: summaries;

					setBankSummaries(combinedSummaries);
				} catch (error) {
					console.error('Erro ao carregar os resumos por banco:', error);
					if (isMounted) {
						setErrorMessage('Erro ao carregar os resumos por banco.');
					}
				} finally {
					if (isMounted) {
						setIsLoading(false);
					}
				}
			};

			loadData();

			return () => {
				isMounted = false;
			};
		}, []),
	);

	const hasSummaries = bankSummaries.length > 0;
	const hasBankEntries = bankSummaries.some(summary => !summary.isCashSummary);
	const shouldShowEmptyState = !isLoading && !errorMessage && !hasSummaries;
	const shouldShowNoBanksMessage = !isLoading && !errorMessage && !hasBankEntries;

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
				<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
					<View
						className={`absolute top-0 left-0 right-0 ${cardBackground}`}
						style={{ height: heroHeight }}
					>
						<Image
							source={LoginWallpaper}
							alt="Background da tela de saldo mensal do banco"
							className="w-full h-full rounded-b-3xl absolute"
							resizeMode="cover"
						/>

						<VStack
							className="w-full h-full items-center justify-start px-6 gap-4"
							style={{ paddingTop: insets.top + 24 }}
						>
							<Heading size="xl" className="text-white text-center">
								Saldo mensal do banco
							</Heading>
							<MonthlyBankMovementsIllustration width="40%" height="40%" className="opacity-90" />
						</VStack>
					</View>

					<ScrollView
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="on-drag"
						className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
						style={{ marginTop: heroHeight - 64 }}
						contentContainerStyle={{ paddingBottom: 32 }}
					>
						<VStack className="justify-between mt-4">

							{isLoading ? (
								<View className={`${fieldContainerCardClassName} px-4 py-4`}>
									<Text className={`${bodyText} text-sm`}>Carregando dados...</Text>
								</View>
							) : errorMessage ? (
								<View className={`${fieldContainerCardClassName} px-4 py-4`}>
									<Text className="text-sm text-red-600 dark:text-red-400">{errorMessage}</Text>
								</View>
							) : shouldShowEmptyState ? (
								<View className={`${fieldContainerCardClassName} px-4 py-4`}>
									<Text className={`${bodyText} text-sm`}>
										Nenhum banco vinculado foi encontrado para o usuário atual.
									</Text>
								</View>
							) : (
								<>
									{shouldShowNoBanksMessage && (
										<View className={`${fieldContainerCardClassName} px-4 py-4 mb-4`}>
											<Text className={`${bodyText} text-sm`}>
												Nenhum banco vinculado foi encontrado. Exibindo apenas movimentações em
												dinheiro.
											</Text>
										</View>
									)}

									{bankSummaries.map(bank => {
										const isCashSummary = Boolean(bank.isCashSummary);
										const initialBalanceClassName =
											typeof bank.initialBalanceInCents === 'number'
												? bank.initialBalanceInCents >= 0
													? 'text-emerald-600 dark:text-emerald-400'
													: 'text-red-600 dark:text-red-400'
												: bodyText;
										const currentBalanceClassName =
											typeof bank.currentBalanceInCents === 'number'
												? bank.currentBalanceInCents >= 0
													? 'text-emerald-600 dark:text-emerald-400'
													: 'text-red-600 dark:text-red-400'
												: bodyText;
										const initialBalanceLabel =
											typeof bank.initialBalanceInCents === 'number'
												? formatCurrencyBRL(bank.initialBalanceInCents)
												: isCashSummary
													? 'Não aplicável'
													: 'Não registrado';
										const currentBalanceLabel =
											typeof bank.currentBalanceInCents === 'number'
												? formatCurrencyBRL(bank.currentBalanceInCents)
												: 'Indisponível';

										return (
											<TouchableOpacity
												key={bank.id || bank.name}
												activeOpacity={0.92}
												onPress={() =>
													isCashSummary
														? handleOpenCashMovements()
														: handleOpenBankMovements(bank.id, bank.name, bank.colorHex)
												}
											>
												<VStack className={`${fieldContainerCardClassName} px-4 py-4 mb-4`}>

													<HStack className="items-start justify-between gap-3">
														<VStack className="flex-1">
															<Text
																className={`${headingText} text-lg font-semibold`}
																style={bank.colorHex ? { color: bank.colorHex } : undefined}
															>
																{bank.name}
															</Text>
														</VStack>
														<Text className={`${helperText} pt-1 text-xs`}>Ver período</Text>
													</HStack>

													<VStack className="mt-4 gap-4">
														<HStack className="justify-between gap-4">
															<VStack className="flex-1 h-full">
																<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
																	Ganhos do mês
																</Text>
																<View className={`${fieldContainerClassName} px-4 justify-center`}>
																	<Text className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
																		{formatCurrencyBRL(bank.totalGainsInCents)}
																	</Text>
																</View>
															</VStack>

															<VStack className="flex-1 h-full">
																<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
																	Despesas do mês
																</Text>
																<View className={`${fieldContainerClassName} px-4 justify-center`}>
																	<Text className="text-sm font-semibold text-red-600 dark:text-red-400">
																		{formatCurrencyBRL(bank.totalExpensesInCents)}
																	</Text>
																</View>
															</VStack>
														</HStack>

														{!isCashSummary && bank.totalInitialInvestedInCents > 0 && (
															<VStack className="flex-1 h-full">
																<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
																	Valor investido
																</Text>
																<View className={`${fieldContainerClassName} px-4 justify-center`}>
																	<Text className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">
																		{formatCurrencyBRL(bank.totalInitialInvestedInCents)}
																	</Text>
																</View>
															</VStack>
														)}

														<HStack className="justify-between gap-4">
															<VStack className="flex-1 h-full">
																<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
																	Saldo inicial
																</Text>
																<View className={`${fieldContainerClassName} px-4 justify-center`}>
																	<Text className={`${initialBalanceClassName} text-sm font-semibold`}>
																		{initialBalanceLabel}
																	</Text>
																</View>
															</VStack>
															
															<VStack className="flex-1 h-full">
																<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
																	Saldo atual
																</Text>
																<View className={`${fieldContainerClassName} px-4 justify-center`}>
																	<Text className={`${currentBalanceClassName} text-sm font-semibold`}>
																		{currentBalanceLabel}
																	</Text>
																</View>
															</VStack>
														</HStack>

														<VStack className="flex-1 h-full">
															<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
																Movimentações no mês
															</Text>
															<View className={`${fieldContainerClassName} px-4 justify-center`}>
																<Text className="text-sm font-semibold text-yellow-500 dark:text-yellow-300">
																	{formatMovementsCount(bank.totalMovements)}
																</Text>
															</View>
														</VStack>
													</VStack>
												</VStack>
											</TouchableOpacity>
										);
									})}
								</>
							)}
						</VStack>
					</ScrollView>
				</View>

				<View
					style={{
						marginHorizontal: -18,
						paddingBottom: 0,
						flexShrink: 0,
					}}
				>
					<Navigator defaultValue={0} />
				</View>
			</View>
		</SafeAreaView>
	);
}
