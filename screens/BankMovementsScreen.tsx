import React from 'react';
import { ScrollView, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';

import { Menu } from '@/components/uiverse/menu';
import { auth } from '@/FirebaseConfig';
import { getBankMovementsByPeriodFirebase } from '@/functions/BankFirebase';

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

const formatCurrencyBRL = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
		minimumFractionDigits: 2,
	}).format((valueInCents ?? 0) / 100);

const formatMovementDate = (value: Date | null) => {
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
};

const formatDateToBR = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${day}/${month}/${year}`;
};

const sanitizeDateInput = (value: string) => value.replace(/\D/g, '').slice(0, 8);

const formatDateInput = (value: string) => {
	if (value.length <= 2) {
		return value;
	}
	if (value.length <= 4) {
		return `${value.slice(0, 2)}/${value.slice(2)}`;
	}
	return `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
};

const parseDateFromBR = (value: string) => {
	const [day, month, year] = value.split('/');
	if (!day || !month || !year) {
		return null;
	}

	const parsedDay = Number(day);
	const parsedMonth = Number(month);
	const parsedYear = Number(year);

	if (
		Number.isNaN(parsedDay) ||
		Number.isNaN(parsedMonth) ||
		Number.isNaN(parsedYear) ||
		parsedDay <= 0 ||
		parsedMonth <= 0 ||
		parsedMonth > 12 ||
		parsedYear < 1900
	) {
		return null;
	}

	const dateInstance = new Date(parsedYear, parsedMonth - 1, parsedDay);

	if (
		dateInstance.getDate() !== parsedDay ||
		dateInstance.getMonth() + 1 !== parsedMonth ||
		dateInstance.getFullYear() !== parsedYear
	) {
		return null;
	}

	return dateInstance;
};

const normalizeDate = (value: unknown): Date | null => {
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
};

const getCurrentMonthBounds = () => {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), 1);
	const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	return {
		start,
		end,
	};
};

export default function BankMovementsScreen() {
	const searchParams = useLocalSearchParams<{ bankId?: string | string[]; bankName?: string | string[] }>();

	const bankId = React.useMemo(() => {
		const value = searchParams.bankId;
		if (Array.isArray(value)) {
			return value[0] ?? '';
		}
		return value ?? '';
	}, [searchParams.bankId]);

	const bankName = React.useMemo(() => {
		const value = Array.isArray(searchParams.bankName) ? searchParams.bankName[0] : searchParams.bankName;
		if (!value) {
			return 'Banco selecionado';
		}

		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}, [searchParams.bankName]);

	const { start, end } = React.useMemo(() => getCurrentMonthBounds(), []);

	const [startDateInput, setStartDateInput] = React.useState(formatDateToBR(start));
	const [endDateInput, setEndDateInput] = React.useState(formatDateToBR(end));

	const [movements, setMovements] = React.useState<MovementRecord[]>([]);
	const [isLoading, setIsLoading] = React.useState(false);
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

	const handleDateChange = React.useCallback((value: string, type: 'start' | 'end') => {
		const sanitized = sanitizeDateInput(value);
		const formatted = formatDateInput(sanitized);
		if (type === 'start') {
			setStartDateInput(formatted);
		} else {
			setEndDateInput(formatted);
		}
	}, []);

	const fetchMovements = React.useCallback(async () => {
		if (!bankId) {
			setErrorMessage('Nenhum banco foi informado.');
			setMovements([]);
			return;
		}

		const parsedStart = parseDateFromBR(startDateInput);
		const parsedEnd = parseDateFromBR(endDateInput);

		if (!parsedStart || !parsedEnd) {
			setErrorMessage('Informe datas válidas para o período.');
			setMovements([]);
			return;
		}

		const normalizedStart = new Date(parsedStart);
		normalizedStart.setHours(0, 0, 0, 0);

		const normalizedEnd = new Date(parsedEnd);
		normalizedEnd.setHours(23, 59, 59, 999);

		if (normalizedEnd < normalizedStart) {
			setErrorMessage('A data final deve ser maior ou igual à data inicial.');
			setMovements([]);
			return;
		}

		const currentUser = auth.currentUser;
		if (!currentUser) {
			setErrorMessage('Nenhum usuário autenticado foi identificado.');
			setMovements([]);
			return;
		}

		setIsLoading(true);
		setErrorMessage(null);

		try {
			const result = await getBankMovementsByPeriodFirebase({
				personId: currentUser.uid,
				bankId,
				startDate: normalizedStart,
				endDate: normalizedEnd,
			});

			if (!result?.success || !result.data) {
				setMovements([]);
				setErrorMessage(
					typeof result?.error === 'string'
						? result.error
						: 'Erro ao carregar as movimentações do período selecionado.',
				);
				return;
			}

			const expensesArray: any[] = Array.isArray(result.data.expenses) ? result.data.expenses : [];
			const gainsArray: any[] = Array.isArray(result.data.gains) ? result.data.gains : [];

			const expenseMovements: MovementRecord[] = expensesArray.map(expense => ({
				id: typeof expense?.id === 'string' ? expense.id : `expense-${Math.random()}`,
				name:
					typeof expense?.name === 'string' && expense.name.trim().length > 0
						? expense.name.trim()
						: 'Despesa sem nome',
				valueInCents: typeof expense?.valueInCents === 'number' ? expense.valueInCents : 0,
				type: 'expense',
				date: normalizeDate(expense?.date ?? expense?.createdAt ?? null),
			}));

			const gainMovements: MovementRecord[] = gainsArray.map(gain => ({
				id: typeof gain?.id === 'string' ? gain.id : `gain-${Math.random()}`,
				name:
					typeof gain?.name === 'string' && gain.name.trim().length > 0
						? gain.name.trim()
						: 'Ganho sem nome',
				valueInCents: typeof gain?.valueInCents === 'number' ? gain.valueInCents : 0,
				type: 'gain',
				date: normalizeDate(gain?.date ?? gain?.createdAt ?? null),
			}));

			const combinedMovements = [...expenseMovements, ...gainMovements].sort((a, b) => {
				const dateA = a.date ? a.date.getTime() : 0;
				const dateB = b.date ? b.date.getTime() : 0;
				return dateB - dateA;
			});

			setMovements(combinedMovements);
		} catch (error) {
			console.error('Erro ao buscar movimentações do banco:', error);
			setErrorMessage('Erro inesperado ao carregar as movimentações.');
			setMovements([]);
		} finally {
			setIsLoading(false);
		}
	}, [bankId, startDateInput, endDateInput]);

	useFocusEffect(
		React.useCallback(() => {
			void fetchMovements();
		}, [fetchMovements]),
	);

	const totals = React.useMemo(() => {
		return movements.reduce(
			(acc, movement) => {
				if (movement.type === 'gain') {
					acc.totalGains += movement.valueInCents;
				} else {
					acc.totalExpenses += movement.valueInCents;
				}
				return acc;
			},
			{ totalExpenses: 0, totalGains: 0 },
		);
	}, [movements]);

	const balanceInCents = totals.totalGains - totals.totalExpenses;

	return (
		<View
				className="
					flex-1 w-full h-full
					mt-[64px]
					items-center
					bg-gray-100 dark:bg-gray-950
				"
			>
				<ScrollView
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					style={{
						flex: 1,
						width: '100%',
					}}
					contentContainerStyle={{
						flexGrow: 1,
						width: '100%',
						paddingBottom: 48,
					}}
				>
					<View className="w-full px-6">
						<Heading size="3xl" className="text-center mb-6">
							Movimentações do banco
						</Heading>
						<Text className="text-center text-gray-600 dark:text-gray-400 mb-6">
							Selecione um período para visualizar todas as movimentações de {bankName}.
						</Text>

						<Box
							className="
								bg-white dark:bg-gray-800
								rounded-lg
								p-4
								mb-6
								shadow-sm
							"
						>
							<Text className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
								Filtros do período
							</Text>
							<VStack space="md">
								<HStack space="md" className="flex-wrap">
									<VStack className="flex-1 min-w-[140px]">
										<Text className="mb-2 text-sm text-gray-600 dark:text-gray-300">
											Data inicial
										</Text>
										<Input>
											<InputField
												value={startDateInput}
												onChangeText={value => handleDateChange(value, 'start')}
												placeholder="dd/mm/aaaa"
												keyboardType="numeric"
												returnKeyType="next"
											/>
										</Input>
									</VStack>

									<VStack className="flex-1 min-w-[140px]">
										<Text className="mb-2 text-sm text-gray-600 dark:text-gray-300">
											Data final
										</Text>
										<Input>
											<InputField
												value={endDateInput}
												onChangeText={value => handleDateChange(value, 'end')}
												placeholder="dd/mm/aaaa"
												keyboardType="numeric"
												returnKeyType="done"
											/>
										</Input>
									</VStack>
								</HStack>

								<Button
									size="md"
									variant="solid"
									onPress={() => {
										if (!isLoading) {
											void fetchMovements();
										}
									}}
									disabled={isLoading}
								>
									{isLoading ? (
										<>
											<ButtonSpinner color="white" />
											<ButtonText>Carregando movimentações</ButtonText>
										</>
									) : (
										<ButtonText>Buscar movimentações</ButtonText>
									)}
								</Button>
							</VStack>
						</Box>

						<Box
							className="
								bg-white dark:bg-gray-800
								rounded-lg
								p-4
								mb-6
								shadow-sm
							"
						>
							<Text className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
								Resumo do período
							</Text>
							<VStack space="md">
								<HStack className="justify-between">
									<Text className="text-gray-700 dark:text-gray-300">Ganhos</Text>
									<Text className="text-emerald-600 dark:text-emerald-400 font-semibold">
										{formatCurrencyBRL(totals.totalGains)}
									</Text>
								</HStack>
								<HStack className="justify-between">
									<Text className="text-gray-700 dark:text-gray-300">Despesas</Text>
									<Text className="text-red-600 dark:text-red-400 font-semibold">
										{formatCurrencyBRL(totals.totalExpenses)}
									</Text>
								</HStack>
								<HStack className="justify-between">
									<Text className="text-gray-700 dark:text-gray-300">Saldo</Text>
									<Text
										className={
											balanceInCents >= 0
												? 'text-emerald-600 dark:text-emerald-400 font-semibold'
												: 'text-red-600 dark:text-red-400 font-semibold'
										}
									>
										{formatCurrencyBRL(balanceInCents)}
									</Text>
								</HStack>
							</VStack>
						</Box>

						{errorMessage && (
							<Text className="text-center text-red-600 dark:text-red-400 mb-4">{errorMessage}</Text>
						)}

						<Box
							className="
								bg-white dark:bg-gray-800
								rounded-lg
								p-4
								shadow-sm
							"
						>
							<Text className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
								Movimentações encontradas
							</Text>

							{isLoading ? (
								<Text className="text-center text-gray-700 dark:text-gray-300">
									Carregando movimentações...
								</Text>
							) : movements.length === 0 ? (
								<Text className="text-center text-gray-600 dark:text-gray-400">
									Nenhuma movimentação foi registrada para o período informado.
								</Text>
							) : (
								movements.map(movement => (
									<Box
										key={movement.id}
										className="
											mb-4
											border-b border-gray-200 dark:border-gray-700
											pb-3
										"
									>
										<HStack className="justify-between items-center">
											<Text className="text-gray-900 dark:text-gray-100 font-semibold">
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
							)}
						</Box>
					</View>
				</ScrollView>

			<View className="w-full">
				<Menu defaultValue={0} />
			</View>
		</View>
	);
}
