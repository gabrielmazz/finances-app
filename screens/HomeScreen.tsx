import React from 'react';
import { useFocusEffect } from 'expo-router';
import { Keyboard, ScrollView, TouchableWithoutFeedback, View } from 'react-native';

// Importações relacionadas ao Gluestack UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';

import { auth } from '@/FirebaseConfig';
import { getCurrentMonthSummaryByBankFirebaseExpanses } from '@/functions/BankFirebase';

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';

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

	// Estado para armazenar o total de despesas
	const [totalExpensesInCents, setTotalExpensesInCents] = React.useState(0);
	const [expenseCount, setExpenseCount] = React.useState(0);

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

	// Carrega o resumo mensal sempre que a tela ganha foco
	useFocusEffect(

		React.useCallback(() => {

			let isMounted = true;

			const loadMonthlySummary = async () => {

				setIsLoadingSummary(true);
				setSummaryError(null);

				const currentUser = auth.currentUser;

				if (!currentUser) {
					if (isMounted) {
						setSummaryError('Nenhum usuário autenticado foi identificado.');
						setIsLoadingSummary(false);
					}
					return;
				}

				try {

					// Consulta a função que busca o resumo mensal por banco
					const resultExpanses = await getCurrentMonthSummaryByBankFirebaseExpanses(currentUser.uid);

					// Separa os valores (valueInCents) num array para seja somado posteriormente
					const resultExpansesValues = (resultExpanses?.data ?? []).map((item: any) => item?.valueInCents ?? 0);

					if (resultExpanses) {
						const summaryTotals = calculateMonthlyExpansesSummaryTotals(resultExpansesValues);
						setTotalExpensesInCents(summaryTotals.totalExpensesInCents);
						setExpenseCount(summaryTotals.expenseCount);
					}

				} catch (error) {

					console.error('Erro ao carregar o resumo mensal:', error);

					if (isMounted) {
						setSummaryError('Erro ao carregar o resumo mensal.');
					}

				} finally {
					if (isMounted) {
						setIsLoadingSummary(false);
					}
				}

			};

			loadMonthlySummary();

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
							pb-6
							relative
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

						{/* Box para mostrar a soma dos gastos e ganhos */}
						<Box
							className="
								w-full
								bg-white dark:bg-gray-800
								rounded-lg
								p-4
								mb-6
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

								<Text className="mt-4 text-gray-700 dark:text-gray-300">
									Total de despesas: {formatCurrencyBRL(totalExpensesInCents)}
								</Text>

							)}

						</Box>

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

						</Box>

					</View>

				</ScrollView>

			</View>

		</TouchableWithoutFeedback>

	);
}