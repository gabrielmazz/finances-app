import React from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Menu } from '@/components/uiverse/menu';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';

import { auth } from '@/FirebaseConfig';
import {
	getBanksWithUsersByPersonFirebase,
	getCurrentMonthSummaryByBankFirebaseExpanses,
	getCurrentMonthSummaryByBankFirebaseGains,
	getCurrentMonthCashExpensesFirebase,
	getCurrentMonthCashGainsFirebase,
} from '@/functions/BankFirebase';
import { getMonthlyBalanceFirebase, getMonthlyBalanceFirebaseRelatedToUser } from '@/functions/MonthlyBalanceFirebase';

// Importação do SVG de ilustração
import MonthlyBankMovementsIllustration from '../assets/UnDraw/monthlyBankSummaryScreen.svg';
import { Divider } from '@/components/ui/divider';

type BankSummary = {
	id: string;
	name: string;
	colorHex?: string | null;
	totalExpensesInCents: number;
	totalGainsInCents: number;
	totalMovements: number;
	initialBalanceInCents: number | null;
	currentBalanceInCents: number | null;
	isCashSummary?: boolean;
};

function formatCurrencyBRLBase(valueInCents: number): string {
	return new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
		minimumFractionDigits: 2,
	}).format((valueInCents ?? 0) / 100);
}

export default function MonthlyBankSummaryScreen() {
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

					const now = new Date();
					const currentYear = now.getFullYear();
					const currentMonth = now.getMonth() + 1;

					// Obtém os saldos iniciais por banco, consultando para cada banco individualmente
					const balanceResults = await Promise.all(

						// Para cada banco, obtém o saldo mensal inicial
						banksArray.map(async bank => {

							// Extrai o ID do banco
							const bankId = typeof bank?.id === 'string' ? bank.id : '';

							// Se não houver ID do banco, retorna nulo diretamente
							if (!bankId) {
								return { bankId, valueInCents: null };
							}

							// Consulta o saldo mensal para o banco atual
							try {
								const balanceResponse = await getMonthlyBalanceFirebaseRelatedToUser({
									personId: currentUser.uid,
									bankId,
									year: currentYear,
									month: currentMonth,
								});

								if (balanceResponse.success && balanceResponse.data) {
									const value =
										typeof balanceResponse.data.valueInCents === 'number'
											? balanceResponse.data.valueInCents
											: 0;
									return { bankId, valueInCents: value };
								}

								return { bankId, valueInCents: null };
							} catch (error) {
								console.error(`Erro ao obter saldo mensal para o banco ${bankId}:`, error);
								return { bankId, valueInCents: null };
							}
						}),

					);

					const balancesByBank: Record<string, number | null> = {};
					for (const result of balanceResults) {
						if (result.bankId) {
							balancesByBank[result.bankId] = result.valueInCents;
						}
					}

					// Monta o summary por banco, passando pelo array de bancos
					const summaries: BankSummary[] = banksArray.map(bank => {

						// Extrai os dados do banco
						const bankId = typeof bank?.id === 'string' ? bank.id : '';
						const bankName =
							typeof bank?.name === 'string' && bank.name.trim().length > 0
								? bank.name.trim()
								: 'Banco sem nome';
						const colorHex =
							typeof bank?.colorHex === 'string' && bank.colorHex.trim().length > 0
								? bank.colorHex.trim()
								: null;

						// Filtra as despesas e ganhos relacionados a esse banco
						const bankExpenses = expensesArray.filter(expense => expense?.bankId === bankId);
						const bankGains = gainsArray.filter(gain => gain?.bankId === bankId);

						// Calcula os totais, saldos e movimentações
						const totalExpensesInCents = bankExpenses.reduce((acc, expense) => {
							const value = typeof expense?.valueInCents === 'number' ? expense.valueInCents : 0;
							return acc + value;
						}, 0);

						// Calcula o total de ganhos
						const totalGainsInCents = bankGains.reduce((acc, gain) => {
							const value = typeof gain?.valueInCents === 'number' ? gain.valueInCents : 0;
							return acc + value;
						}, 0);

						// Calcula o total de movimentações realizadas durante o mês
						const totalMovements = bankExpenses.length + bankGains.length;

						// Calcula os saldos inicial, registrado no início do mês na tela AddRegisterMonthlyBalanceScreen
						const initialBalanceInCents = balancesByBank[bankId] ?? null;

						// Calcula o saldo atual considerando o saldo inicial + ganhos - despesas
						const currentBalanceInCents =
							typeof initialBalanceInCents === 'number'
								? initialBalanceInCents + (totalGainsInCents - totalExpensesInCents)
								: null;

						return {
							id: bankId,
							name: bankName,
							colorHex,
							totalExpensesInCents,
							totalGainsInCents,
							totalMovements,
							initialBalanceInCents,
							currentBalanceInCents,
						};
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

					const hasCashTransactions = totalCashMovements > 0 || totalCashExpensesInCents > 0 || totalCashGainsInCents > 0;

					const combinedSummaries = hasCashTransactions
						? [
								...summaries,
								{
									id: 'cash-transactions',
									name: 'Transações em dinheiro',
									colorHex: '#525252',
									totalExpensesInCents: totalCashExpensesInCents,
									totalGainsInCents: totalCashGainsInCents,
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
		<View
			className="
					flex-1 w-full h-full
					mt-[64px]
					items-center
					justify-between
					pb-6
					relative
					bg-gray-100 dark:bg-gray-950
				"
		>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
				contentContainerStyle={{
					flexGrow: 1,
					paddingBottom: 48,
				}}
			>
				<View className="w-full px-6">

					<Heading size="3xl" className="text-center">
						Resumo mensal por banco e transações em dinheiro
					</Heading>

					<Box className="w-full items-center">
						<MonthlyBankMovementsIllustration width={180} height={180} />
					</Box>

					<Text className="text-justify text-gray-600 dark:text-gray-400">
						Visualize os ganhos, despesas e movimentações do mês corrente para cada banco. Toque em um banco para ver detalhes e selecionar períodos personalizados.
					</Text>

					<Divider className="my-6 mb-6" />

					{isLoading ? (
						<Text className="text-center text-gray-700 dark:text-gray-300">Carregando dados...</Text>
					) : errorMessage ? (
						<Text className="text-center text-red-600 dark:text-red-400">{errorMessage}</Text>
					) : shouldShowEmptyState ? (
						<Text className="text-center text-gray-700 dark:text-gray-300">
							Nenhum banco vinculado foi encontrado para o usuário atual.
						</Text>
					) : (
						<>
							{shouldShowNoBanksMessage && (
								<Text className="text-center text-gray-700 dark:text-gray-300 mb-4">
									Nenhum banco vinculado foi encontrado. Exibindo apenas movimentações em dinheiro.
								</Text>
							)}
							{bankSummaries.map(bank => {
								const isCashSummary = Boolean(bank.isCashSummary);

								const cardContent = (
									<Box
										className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 w-full mb-6"
									>
										<HStack className="justify-between items-center">
											<Text
												className="text-lg font-semibold text-gray-900 dark:text-gray-100"
												style={bank.colorHex ? { color: bank.colorHex } : undefined}
											>
												{bank.name}
											</Text>
											<Text className="text-sm text-gray-600 dark:text-emerald-400">
												Ver período
											</Text>
										</HStack>

										<Text className="mt-3 text-gray-700 dark:text-gray-300">
											Ganhos:{' '}
											<Text className="text-emerald-600 dark:text-emerald-400 font-semibold">
												{formatCurrencyBRL(bank.totalGainsInCents)}
											</Text>
										</Text>
										<Text className="mt-1 text-gray-700 dark:text-gray-300">
											Despesas:{' '}
											<Text className="text-red-600 dark:text-red-400 font-semibold">
												{formatCurrencyBRL(bank.totalExpensesInCents)}
											</Text>
										</Text>
										<Text className="mt-1 text-gray-700 dark:text-gray-300">
											Saldo inicial:{' '}
											<Text
												className={
													typeof bank.initialBalanceInCents === 'number'
														? bank.initialBalanceInCents >= 0
															? 'text-emerald-600 dark:text-emerald-400 font-semibold'
															: 'text-red-600 dark:text-red-400 font-semibold'
														: 'text-gray-700 dark:text-gray-300'
												}
											>
												{typeof bank.initialBalanceInCents === 'number'
													? formatCurrencyBRL(bank.initialBalanceInCents)
													: isCashSummary
														? 'Não aplicável'
														: 'Não registrado'}
											</Text>
										</Text>
										<Text className="mt-1 text-gray-700 dark:text-gray-300">
											Saldo atual:{' '}
											<Text
												className={
													typeof bank.currentBalanceInCents === 'number'
														? bank.currentBalanceInCents >= 0
															? 'text-emerald-600 dark:text-emerald-400 font-semibold'
															: 'text-red-600 dark:text-red-400 font-semibold'
														: 'text-gray-700 dark:text-gray-300'
												}
											>
												{typeof bank.currentBalanceInCents === 'number'
													? formatCurrencyBRL(bank.currentBalanceInCents)
													: 'Indisponível'}
											</Text>
										</Text>
										<Text className="mt-1 text-gray-700 dark:text-gray-300">
											Movimentações no mês:{' '}
											<Text className="text-yellow-500 dark:text-yellow-300 font-semibold">
												{formatMovementsCount(bank.totalMovements)}
											</Text>
										</Text>

										<Text className="mt-3 text-sm text-gray-500 dark:text-gray-400">
											{isCashSummary
												? 'Toque para visualizar apenas as movimentações realizadas em dinheiro.'
												: `Toque para selecionar um período personalizado e ver todas as movimentações do banco ${bank.name}.`}
										</Text>
									</Box>
								);

								return (
									<TouchableOpacity
										key={bank.id || bank.name}
										activeOpacity={0.9}
										onPress={() =>
											isCashSummary
												? handleOpenCashMovements()
												: handleOpenBankMovements(bank.id, bank.name, bank.colorHex)
										}
									>
										{cardContent}
									</TouchableOpacity>
								);
							})}
						</>
					)}
				</View>
			</ScrollView>

			<Menu defaultValue={0} />
		</View>
	);
}
