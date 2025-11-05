import React from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Keyboard, ScrollView, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

// Importações relacionadas ao Gluestack UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';

import { auth } from '@/FirebaseConfig';
import {
	getCurrentMonthSummaryByBankFirebaseExpanses,
	getCurrentMonthSummaryByBankFirebaseGains,
	getBanksWithUsersByPersonFirebase,
} from '@/functions/BankFirebase';
import { getLimitedExpensesFirebase } from '@/functions/ExpenseFirebase';
import { getLimitedGainsFirebase } from '@/functions/GainFirebase';

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { VStack } from '@/components/ui/vstack';

export default function HomeScreen() {

	const [isLoadingSummary, setIsLoadingSummary] = React.useState(false);
	const [summaryError, setSummaryError] = React.useState<string | null>(null);

	const monthLabel = React.useMemo(() => {
		const formatted = new Intl.DateTimeFormat('pt-BR', {
			month: 'long',
			year: 'numeric',
		}).format(new Date());

		return formatted.charAt(0).toUpperCase() + formatted.slice(1);
	}, []);

	const formatCurrencyBRL = React.useCallback((valueInCents: number) => {
		return new Intl.NumberFormat('pt-BR', {
			style: 'currency',
			currency: 'BRL',
			minimumFractionDigits: 2,
		}).format(valueInCents / 100);
	}, []);

	const formatMovementDate = React.useCallback((value: unknown) => {
		if (!value) {
			return 'Data indisponível';
		}

		let date: Date | null = null;

		if (value instanceof Date) {
			date = value;
		} else if (
			typeof value === 'object' &&
			value !== null &&
			'toDate' in value &&
			typeof (value as { toDate?: () => Date }).toDate === 'function'
		) {
			date = (value as { toDate?: () => Date }).toDate?.() ?? null;
		} else if (typeof value === 'string' || typeof value === 'number') {
			const parsedDate = new Date(value);
			if (!Number.isNaN(parsedDate.getTime())) {
				date = parsedDate;
			}
		}

		if (!date) {
			return 'Data indisponível';
		}

		return new Intl.DateTimeFormat('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		}).format(date);
	}, []);

	const handleOpenMonthlySummary = React.useCallback(() => {
		router.push('/bank-summary');
	}, []);

	// Estado para armazenar o total de despesas
	const [totalExpensesInCents, setTotalExpensesInCents] = React.useState(0);
	const [expenseCount, setExpenseCount] = React.useState(0);

	// Estado para armazenar o total de ganhos
	const [totalGainsInCents, setTotalGainsInCents] = React.useState(0);
	const [gainCount, setGainCount] = React.useState(0);

	// Estado para armazenar os movimentos mais recentes de ganhos e despesas
	const [recentExpenses, setRecentExpenses] = React.useState<any[]>([]);
	const [recentGains, setRecentGains] = React.useState<any[]>([]);
	const [isLoadingMovements, setIsLoadingMovements] = React.useState(false);
	const [movementsError, setMovementsError] = React.useState<string | null>(null);
	const [bankNamesById, setBankNamesById] = React.useState<Record<string, string>>({});

	const getBankName = React.useCallback(
		(bankId: unknown) => {
			if (!bankId || typeof bankId !== 'string') {
				return 'Banco não identificado';
			}

			return bankNamesById[bankId] ?? 'Banco não identificado';
		},
		[bankNamesById],
	);

	// Função para receber os valores do resumo mensal (despesas) e assim soma-los para mostrar na tela
	function calculateMonthlyExpansesSummaryTotals(expanses: any[]) {

		// Inicializa as variáveis para armazenar o total e a contagem
		let totalExpensesInCents = 0;
		let expenseCount = 0;

		// Itera sobre cada valor nas despesas e soma-os
		expanses.forEach((valueInCents) => {

			// Verifica se o valor é um número válido antes de somar
			if (typeof valueInCents === 'number' && !isNaN(valueInCents)) {

				// Adiciona o valor ao total
				totalExpensesInCents += valueInCents;

				// Incrementa a contagem de despesas
				expenseCount += 1;
			} else {

				// Exibe um alerta se um valor inválido for encontrado
				showFloatingAlert({
					message: 'Valor inválido encontrado nas despesas.',
					action: 'error',
					position: 'bottom',

				});
			}
		});

		return {
			totalExpensesInCents,
			expenseCount,
		};
	}

	// Função para receber os valores do resumo mensal (ganhos) e assim soma-los para mostrar na tela
	function calculateMonthlyGainsSummaryTotals(gains: any[]) {

		// Inicializa as variáveis para armazenar o total e a contagem
		let totalGainsInCents = 0;
		let gainCount = 0;

		// Itera sobre cada valor nas receitas e soma-os
		gains.forEach((valueInCents) => {

			// Verifica se o valor é um número válido antes de somar
			if (typeof valueInCents === 'number' && !isNaN(valueInCents)) {

				// Adiciona o valor ao total
				totalGainsInCents += valueInCents;

				// Incrementa a contagem de receitas
				gainCount += 1;
			} else {

				// Exibe um alerta se um valor inválido for encontrado
				showFloatingAlert({
					message: 'Valor inválido encontrado nos ganhos.',
					action: 'error',
					position: 'bottom',

				});
			}
		});

		return {
			totalGainsInCents,
			gainCount,
		};
	}

	// Carrega todos os serviços e dados necessários que serão exibidos na tela inicial
	useFocusEffect(

		React.useCallback(() => {

			let isMounted = true;

			const loadHomeData = async () => {

				// Reseta os estados de carregamento e erro antes de iniciar o carregamento
				// dos serviços
				setIsLoadingSummary(true);
				setSummaryError(null);
				setIsLoadingMovements(true);
				setMovementsError(null);
				setRecentExpenses([]);
				setRecentGains([]);
				setBankNamesById({});

				// Obtém o usuário atualmente autenticado
				const currentUser = auth.currentUser;

				// Se nenhum usuário autenticado for encontrado, define os erros e encerra o carregamento
				if (!currentUser) {
					if (isMounted) {
						const message = 'Nenhum usuário autenticado foi identificado.';
						setSummaryError(message);
						setMovementsError(message);
						setRecentExpenses([]);
						setRecentGains([]);
						setIsLoadingSummary(false);
						setIsLoadingMovements(false);
					}
					return;
				}

				// Carrega e consulta para a busca do resumo semanal por banco (Despesas)
				try {

					// Chama a função para obter o resumo mensal de despesas por banco
					const resultExpanses = await getCurrentMonthSummaryByBankFirebaseExpanses(currentUser.uid);

					// Verifica se o componente ainda está montado antes de atualizar o estado
					if (!isMounted) {
						return;
					}

					// Separa os valores (valueInCents) num array para seja somado posteriormente
					const resultExpansesValues = (resultExpanses?.data ?? []).map((item: any) => item?.valueInCents ?? 0);

					// Calcula os totais do resumo mensal de despesas, chamando a função em tela mesmo
					if (resultExpanses) {
						const summaryTotals = calculateMonthlyExpansesSummaryTotals(resultExpansesValues);
						setTotalExpensesInCents(summaryTotals.totalExpensesInCents);
						setExpenseCount(summaryTotals.expenseCount);
					}

				} catch (error) {
					console.error('Erro ao carregar o resumo mensal de despesas:', error);

					if (isMounted) {
						setSummaryError('Erro ao carregar o resumo mensal de despesas.');
					}

				} finally {
					if (isMounted) {
						setIsLoadingSummary(false);
					}
				}

				// Carrega e consulta para a busca do resumo semanal por banco (Ganhos)
				try {

					// Chama a função para obter o resumo mensal de ganhos por banco
					const resultGains = await getCurrentMonthSummaryByBankFirebaseGains(currentUser.uid);

					// Verifica se o componente ainda está montado antes de atualizar o estado
					if (!isMounted) {
						return;
					}

					// Separa os valores (valueInCents) num array para seja somado posteriormente
					const resultGainsValues = (resultGains?.data ?? []).map((item: any) => item?.valueInCents ?? 0);

					// Calcula os totais do resumo mensal de ganhos, chamando a função em tela mesmo
					if (resultGains) {
						const summaryTotals = calculateMonthlyGainsSummaryTotals(resultGainsValues);
						setTotalGainsInCents(summaryTotals.totalGainsInCents);
						setGainCount(summaryTotals.gainCount);
					}

				} catch (error) {
					console.error('Erro ao carregar o resumo mensal de ganhos:', error);

					if (isMounted) {
						setSummaryError('Erro ao carregar o resumo mensal de ganhos.');
					}

				} finally {
					if (isMounted) {
						setIsLoadingSummary(false);
					}
				}

				// Carrega os movimentos mais recentes (despesas e ganhos)
				// para exibir na tela inicial
				try {

					const [expensesResult, gainsResult, banksResult] = await Promise.all([
						getLimitedExpensesFirebase({ limit: 3, personId: currentUser.uid }),
						getLimitedGainsFirebase({ limit: 3, personId: currentUser.uid }),
						getBanksWithUsersByPersonFirebase(currentUser.uid),
					]);

					if (!isMounted) {
						return;
					}

					let hasIssues = false;

					if (banksResult?.success) {
						const banksMap = Array.isArray(banksResult.data)
							? banksResult.data.reduce((acc: Record<string, string>, bank: any) => {
								if (bank && typeof bank.id === 'string') {
									const rawName = typeof bank.name === 'string' ? bank.name.trim() : '';
									acc[bank.id] = rawName.length > 0 ? rawName : 'Banco sem nome';
								}
								return acc;
							}, {})
							: {};

						setBankNamesById(banksMap);
					} else {
						setBankNamesById({});
						hasIssues = true;
					}

					// Verifica se os resultados do carregamento relacionados às despesas e ganhos foram bem-sucedidos
					if (expensesResult?.success) {
						setRecentExpenses(expensesResult.data ?? []);
					} else {
						setRecentExpenses([]);
						hasIssues = true;
					}

					// Verifica se os resultados do carregamento relacionados às despesas e ganhos foram bem-sucedidos
					if (gainsResult?.success) {
						setRecentGains(gainsResult.data ?? []);
					} else {
						setRecentGains([]);
						hasIssues = true;
					}


					if (hasIssues) {
						setMovementsError('Não foi possível carregar alguns movimentos recentes.');
					} else {
						setMovementsError(null);
					}

				} catch (error) {
					console.error('Erro ao carregar os últimos movimentos:', error);

					if (isMounted) {
						setMovementsError('Erro ao carregar os últimos movimentos.');
						setRecentExpenses([]);
						setRecentGains([]);
					}

				} finally {

					if (isMounted) {
						setIsLoadingMovements(false);
					}

				}
			};

			loadHomeData();

			return () => {
				isMounted = false;
			};
		}, []),
	);

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
                "
			>

				<View className="w-full px-6 gap-4">

					<Heading size="3xl" className="text-center mb-6">
						Resumo financeiro
					</Heading>

					<VStack className="gap-4">

						<View className="w-full">

							<TouchableOpacity
								activeOpacity={0.85}
								onPress={handleOpenMonthlySummary}
								disabled={isLoadingSummary}
							>
								{/* Box para mostrar a soma dos gastos e ganhos */}
								<Box
									className="
									w-full
									bg-white dark:bg-gray-800
									rounded-lg
									p-4
									mb-6
								"
									style={isLoadingSummary ? { opacity: 0.6 } : undefined}
								>

									<HStack
										className="
										justify-between
										items-center
									"
									>

										<Heading
											size="md"
											className="text-gray-800 dark:text-gray-200"
										>
											Resumo de {monthLabel}
										</Heading>

									</HStack>

									{isLoadingSummary ? (

										<Text className="mt-4 text-gray-600 dark:text-gray-400">
											Carregando resumo...
										</Text>

									) : summaryError ? (

										<Text className="mt-4 text-red-600 dark:text-red-400">
											{summaryError}
										</Text>

									) : (

										<>
											<Text className="mt-4 text-gray-700 dark:text-gray-300">
												Total de ganhos: {formatCurrencyBRL(totalGainsInCents)}
											</Text>

											<Text className="mt-4 text-gray-700 dark:text-gray-300">
												Total de despesas: {formatCurrencyBRL(totalExpensesInCents)}
											</Text>
										</>

									)}

									<Text className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">
										Toque para ver o resumo detalhado por banco
									</Text>

								</Box>
							</TouchableOpacity>

							{/* Card para mostrar os últimos movimentos de cada banco */}
							<Box
								className="
										w-full
										bg-white dark:bg-gray-800
										rounded-lg
										p-4
										mb-6
										shadow-sm
									"
							>

								<HStack
									className="
											justify-between
											items-center
										"
								>

									<Heading
										size="md"
										className="text-gray-800 dark:text-gray-200"
									>
										Últimos movimentos
									</Heading>

								</HStack>

								{isLoadingMovements ? (

									<Text className="mt-4 text-gray-600 dark:text-gray-400">
										Carregando movimentos...
									</Text>

								) : movementsError ? (

									<Text className="mt-4 text-red-600 dark:text-red-400">
										{movementsError}
									</Text>

								) : (

									<>

										<Box className="mt-4">

											<Text className="text-gray-700 dark:text-gray-300 font-semibold">
												Ganhos
											</Text>

											{recentGains.length === 0 ? (

												<Text className="mt-2 text-gray-600 dark:text-gray-400 text-sm">
													Nenhum ganho recente registrado.
												</Text>

											) : (

												recentGains.map((gain, index) => (

													<Box key={gain?.id ?? `gain-${index}`} className="mt-3">

														<HStack className="justify-between items-center">

															<Text className="text-gray-800 dark:text-gray-200">
																{gain?.name ?? 'Ganho sem nome'}
															</Text>

															<Text className="text-emerald-600 dark:text-emerald-400 font-semibold">
																{formatCurrencyBRL(gain?.valueInCents ?? 0)}
															</Text>

														</HStack>

														<Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
															{`Banco: ${getBankName(gain?.bankId)}`}
														</Text>

														<Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
															{formatMovementDate(gain?.createdAt ?? gain?.date)}
														</Text>

													</Box>

												))

											)}

										</Box>

										<Box className="mt-6">

											<Text className="text-gray-700 dark:text-gray-300 font-semibold">
												Despesas
											</Text>

											{recentExpenses.length === 0 ? (

												<Text className="mt-2 text-gray-600 dark:text-gray-400 text-sm">
													Nenhuma despesa recente registrada.
												</Text>

											) : (

												recentExpenses.map((expense, index) => (

													<Box key={expense?.id ?? `expense-${index}`} className="mt-3">

														<HStack className="justify-between items-center">

															<Text className="text-gray-800 dark:text-gray-200">
																{expense?.name ?? 'Despesa sem nome'}
															</Text>

															<Text className="text-red-600 dark:text-red-400 font-semibold">
																{formatCurrencyBRL(expense?.valueInCents ?? 0)}
															</Text>

														</HStack>

														<Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
															{`Banco: ${getBankName(expense?.bankId)}`}
														</Text>

														<Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
															{formatMovementDate(expense?.createdAt ?? expense?.date)}
														</Text>

													</Box>

												))

											)}

										</Box>

									</>

								)}

							</Box>

						</View>

					</VStack>

				</View>

			</View>

		</TouchableWithoutFeedback>

	);
}
