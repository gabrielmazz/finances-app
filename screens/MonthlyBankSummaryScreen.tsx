import React from 'react';
import { Keyboard, ScrollView, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Menu } from '@/components/uiverse/menu';

import { auth } from '@/FirebaseConfig';
import {
	getBanksWithUsersByPersonFirebase,
	getCurrentMonthSummaryByBankFirebaseExpanses,
	getCurrentMonthSummaryByBankFirebaseGains,
} from '@/functions/BankFirebase';

type FirestoreLikeTimestamp = {
	toDate?: () => Date;
};

type MovementRecord = {
	id: string;
	name: string;
	valueInCents: number;
	type: 'expense' | 'gain';
	date: Date | null;
};

type BankSummary = {
	id: string;
	name: string;
	totalExpensesInCents: number;
	totalGainsInCents: number;
	movements: MovementRecord[];
};

function normalizeDate(value: unknown): Date | null {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value;
	}

	if (typeof value === 'object' && value !== null) {
		const timestamp = value as FirestoreLikeTimestamp;
		if (typeof timestamp.toDate === 'function') {
			return timestamp.toDate() ?? null;
		}
	}

	if (typeof value === 'string' || typeof value === 'number') {
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) {
			return parsed;
		}
	}

	return null;
}

function formatCurrencyBRL(valueInCents: number): string {
	return new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
		minimumFractionDigits: 2,
	}).format((valueInCents ?? 0) / 100);
}

function formatMovementDate(value: Date | null): string {
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
}

export default function MonthlyBankSummaryScreen() {
	const [isLoading, setIsLoading] = React.useState(false);
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
	const [bankSummaries, setBankSummaries] = React.useState<BankSummary[]>([]);
	const [expandedBankIds, setExpandedBankIds] = React.useState<Record<string, boolean>>({});

	const toggleExpandedBank = React.useCallback((bankId: string) => {
		setExpandedBankIds(prev => ({
			...prev,
			[bankId]: !prev[bankId],
		}));
	}, []);

	useFocusEffect(
		React.useCallback(() => {
			let isMounted = true;

			const loadData = async () => {
				setIsLoading(true);
				setErrorMessage(null);
				setBankSummaries([]);
				setExpandedBankIds({});

				const currentUser = auth.currentUser;

				if (!currentUser) {
					if (isMounted) {
						setErrorMessage('Nenhum usuário autenticado foi identificado.');
						setIsLoading(false);
					}
					return;
				}

				try {
					const [banksResult, expensesResult, gainsResult] = await Promise.all([
						getBanksWithUsersByPersonFirebase(currentUser.uid),
						getCurrentMonthSummaryByBankFirebaseExpanses(currentUser.uid),
						getCurrentMonthSummaryByBankFirebaseGains(currentUser.uid),
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

					const summaries: BankSummary[] = banksArray.map(bank => {
						const bankId = typeof bank?.id === 'string' ? bank.id : '';
						const bankName =
							typeof bank?.name === 'string' && bank.name.trim().length > 0
								? bank.name.trim()
								: 'Banco sem nome';

						const bankExpenses = expensesArray.filter(expense => expense?.bankId === bankId);
						const bankGains = gainsArray.filter(gain => gain?.bankId === bankId);

						const totalExpensesInCents = bankExpenses.reduce((acc, expense) => {
							const value = typeof expense?.valueInCents === 'number' ? expense.valueInCents : 0;
							return acc + value;
						}, 0);

						const totalGainsInCents = bankGains.reduce((acc, gain) => {
							const value = typeof gain?.valueInCents === 'number' ? gain.valueInCents : 0;
							return acc + value;
						}, 0);

						const expenseMovements: MovementRecord[] = bankExpenses.map(expense => ({
							id: typeof expense?.id === 'string' ? expense.id : `expense-${bankId}-${Math.random()}`,
							name: typeof expense?.name === 'string' && expense.name.trim().length > 0
								? expense.name.trim()
								: 'Despesa sem nome',
							valueInCents:
								typeof expense?.valueInCents === 'number' ? expense.valueInCents : 0,
							type: 'expense',
							date: normalizeDate(expense?.date ?? expense?.createdAt ?? null),
						}));

						const gainMovements: MovementRecord[] = bankGains.map(gain => ({
							id: typeof gain?.id === 'string' ? gain.id : `gain-${bankId}-${Math.random()}`,
							name:
								typeof gain?.name === 'string' && gain.name.trim().length > 0
									? gain.name.trim()
									: 'Ganho sem nome',
							valueInCents:
								typeof gain?.valueInCents === 'number' ? gain.valueInCents : 0,
							type: 'gain',
							date: normalizeDate(gain?.date ?? gain?.createdAt ?? null),
						}));

						const movements = [...expenseMovements, ...gainMovements].sort((a, b) => {
							const dateA = a.date ? a.date.getTime() : 0;
							const dateB = b.date ? b.date.getTime() : 0;
							return dateB - dateA;
						});

						return {
							id: bankId,
							name: bankName,
							totalExpensesInCents,
							totalGainsInCents,
							movements,
						};
					});

					setBankSummaries(summaries);
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

	const hasNoBanks = !isLoading && !errorMessage && bankSummaries.length === 0;

	return (
		<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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
					contentContainerStyle={{
						flexGrow: 1,
						paddingBottom: 48,
					}}
				>
					<View className="w-full px-6">
						<Heading size="3xl" className="text-center mb-6">
							Resumo mensal por banco
						</Heading>

						<Text className="text-center text-gray-600 dark:text-gray-400 mb-6">
							Visualize os ganhos, despesas e movimentações do mês corrente para cada banco.
						</Text>

						{isLoading ? (
							<Text className="text-center text-gray-700 dark:text-gray-300">Carregando dados...</Text>
						) : errorMessage ? (
							<Text className="text-center text-red-600 dark:text-red-400">{errorMessage}</Text>
						) : hasNoBanks ? (
							<Text className="text-center text-gray-700 dark:text-gray-300">
								Nenhum banco vinculado foi encontrado para o usuário atual.
							</Text>
						) : (
							bankSummaries.map(bank => {
								const isExpanded = !!expandedBankIds[bank.id];
								const hasMovements = bank.movements.length > 0;

								return (
									<TouchableOpacity
										key={bank.id || bank.name}
										activeOpacity={0.9}
										onPress={() => toggleExpandedBank(bank.id)}
									>
										<Box
											className="
												bg-white dark:bg-gray-800
												rounded-lg
												p-4
												mb-4
												shadow-sm
											"
										>
											<HStack className="justify-between items-center">
												<Text className="text-lg font-semibold text-gray-900 dark:text-gray-100">
													{bank.name}
												</Text>
												<Text className="text-sm text-gray-500 dark:text-emerald-400">
													{isExpanded ? 'Recolher' : 'Expandir'}
												</Text>
											</HStack>

											<Text className="mt-3 text-gray-700 dark:text-gray-300">
												Ganhos: {formatCurrencyBRL(bank.totalGainsInCents)}
											</Text>
											<Text className="mt-1 text-gray-700 dark:text-gray-300">
												Despesas: {formatCurrencyBRL(bank.totalExpensesInCents)}
											</Text>

											<Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
												Clique para ver todas as movimentações do mês.
											</Text>

											{isExpanded && (
												<Box className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
													<Text className="text-gray-700 dark:text-gray-300 font-semibold mb-2">
														Movimentações do mês
													</Text>

													{hasMovements ? (
														bank.movements.map(movement => (
															<Box key={movement.id} className="mb-3">
																<HStack className="justify-between items-center">
																	<Text className="text-gray-800 dark:text-gray-200">
																		{movement.name}
																	</Text>
																	<Text
																		className={
																			movement.type === 'gain'
																				? 'text-emerald-600 dark:text-emerald-400 font-semibold'
																				: 'text-red-600 dark:text-red-400 font-semibold'
																		}
																	>
																		{formatCurrencyBRL(movement.valueInCents)}
																	</Text>
																</HStack>
																<Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
																	{formatMovementDate(movement.date)}
																</Text>
																<Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
																	Tipo: {movement.type === 'gain' ? 'Ganho' : 'Despesa'}
																</Text>
															</Box>
														))
													) : (
														<Text className="text-sm text-gray-600 dark:text-gray-400">
															Nenhuma movimentação registrada para este banco no mês atual.
														</Text>
													)}
												</Box>
											)}
										</Box>
									</TouchableOpacity>
								);
							})
						)}
					</View>
				</ScrollView>

				<Menu defaultValue={0} />
			</View>
		</TouchableWithoutFeedback>
	);
}
