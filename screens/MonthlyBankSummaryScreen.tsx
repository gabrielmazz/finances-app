import React from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

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

type BankSummary = {
	id: string;
	name: string;
	totalExpensesInCents: number;
	totalGainsInCents: number;
	totalMovements: number;
};

function formatCurrencyBRL(valueInCents: number): string {
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

	const handleOpenBankMovements = React.useCallback((bankId: string, bankName: string) => {
		if (!bankId) {
			return;
		}

		router.push({
			pathname: '/bank-movements',
			params: {
				bankId,
				bankName,
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

						const totalMovements = bankExpenses.length + bankGains.length;

						return {
							id: bankId,
							name: bankName,
							totalExpensesInCents,
							totalGainsInCents,
							totalMovements,
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
							return (
								<TouchableOpacity
									key={bank.id || bank.name}
									activeOpacity={0.9}
									onPress={() => handleOpenBankMovements(bank.id, bank.name)}
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
											<Text className="text-sm text-emerald-600 dark:text-emerald-400">
												Ver período
											</Text>
										</HStack>

										<Text className="mt-3 text-gray-700 dark:text-gray-300">
											Ganhos: {formatCurrencyBRL(bank.totalGainsInCents)}
										</Text>
										<Text className="mt-1 text-gray-700 dark:text-gray-300">
											Despesas: {formatCurrencyBRL(bank.totalExpensesInCents)}
										</Text>
										<Text className="mt-1 text-gray-700 dark:text-gray-300">
											Movimentações no mês: {bank.totalMovements}
										</Text>

										<Text className="mt-3 text-sm text-gray-500 dark:text-gray-400">
											Toque para selecionar um período personalizado e ver todas as
											movimentações desse banco.
										</Text>
									</Box>
								</TouchableOpacity>
							);
						})
					)}
				</View>
			</ScrollView>

			<Menu defaultValue={0} />
		</View>
	);
}
