import React from 'react';
import { BackHandler, ScrollView, View, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import {
	Select,
	SelectBackdrop,
	SelectContent,
	SelectDragIndicator,
	SelectDragIndicatorWrapper,
	SelectIcon,
	SelectInput,
	SelectItem,
	SelectPortal,
	SelectTrigger,
} from '@/components/ui/select';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { Box } from '@/components/ui/box';
import { Divider } from '@/components/ui/divider';

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

import {
	getBanksWithUsersByPersonFirebase,
	getCurrentMonthSummaryByBankFirebaseExpanses,
	getCurrentMonthSummaryByBankFirebaseGains,
	transferBetweenBanksFirebase,
} from '@/functions/BankFirebase';
import { auth } from '@/FirebaseConfig';
import { getMonthlyBalanceFirebaseRelatedToUser } from '@/functions/MonthlyBalanceFirebase';
import { getFinanceInvestmentsByPeriodFirebase } from '@/functions/FinancesFirebase';
import { useAppTheme } from '@/contexts/ThemeContext';
import DatePickerField from '@/components/uiverse/date-picker';

import TransferIllustration from '../assets/UnDraw/transferScreen.svg';

type BankOption = {
	id: string;
	name: string;
};

const formatCurrencyBRL = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(valueInCents / 100);

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

const formatDateToBR = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${day}/${month}/${year}`;
};

const mergeDateWithCurrentTime = (date: Date) => {
	const now = new Date();
	const dateWithTime = new Date(date);
	dateWithTime.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
	return dateWithTime;
};

export default function TransferScreen() {
	const { isDarkMode } = useAppTheme();
	const pageBackground = isDarkMode ? '#0b1220' : '#f4f5f7';

	const [banks, setBanks] = React.useState<BankOption[]>([]);
	const [selectedSourceBankId, setSelectedSourceBankId] = React.useState<string | null>(null);
	const [selectedTargetBankId, setSelectedTargetBankId] = React.useState<string | null>(null);
	const [transferValueDisplay, setTransferValueDisplay] = React.useState('');
	const [transferValueInCents, setTransferValueInCents] = React.useState<number | null>(null);
	const [transferDate, setTransferDate] = React.useState(formatDateToBR(new Date()));
	const [transferDescription, setTransferDescription] = React.useState<string | null>(null);
	const [isLoadingBanks, setIsLoadingBanks] = React.useState(false);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [originBalanceInCents, setOriginBalanceInCents] = React.useState<number | null>(null);
	const [isLoadingBalance, setIsLoadingBalance] = React.useState(false);

	useFocusEffect(
		React.useCallback(() => {
			const handleBackPress = () => {
				router.replace('/home?tab=0');
				return true;
			};
			const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
			return () => {
				subscription.remove();
			};
		}, []),
	);

	const handleValueChange = React.useCallback((input: string) => {
		const digitsOnly = input.replace(/\D/g, '');
		if (!digitsOnly) {
			setTransferValueDisplay('');
			setTransferValueInCents(null);
			return;
		}

		const centsValue = parseInt(digitsOnly, 10);
		setTransferValueDisplay(formatCurrencyBRL(centsValue));
		setTransferValueInCents(centsValue);
	}, []);

	const handleDateSelect = React.useCallback((formatted: string) => {
		setTransferDate(formatted);
	}, []);

	const loadOriginBalance = React.useCallback(async (bankId: string) => {
		setIsLoadingBalance(true);
		setOriginBalanceInCents(null);

		try {
			const currentUser = auth.currentUser;
			if (!currentUser) {
				showFloatingAlert({
					message: 'Nenhum usuário autenticado foi identificado.',
					action: 'error',
					position: 'bottom',
				});
				return;
			}

			const now = new Date();
			const currentYear = now.getFullYear();
			const currentMonth = now.getMonth() + 1;
			const startOfMonth = new Date(currentYear, currentMonth - 1, 1);
			const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

			const [expensesResult, gainsResult, balanceResponse, investmentsResponse] = await Promise.all([
				getCurrentMonthSummaryByBankFirebaseExpanses(currentUser.uid),
				getCurrentMonthSummaryByBankFirebaseGains(currentUser.uid),
				getMonthlyBalanceFirebaseRelatedToUser({
					personId: currentUser.uid,
					bankId,
					year: currentYear,
					month: currentMonth,
				}),
				getFinanceInvestmentsByPeriodFirebase({
					personId: currentUser.uid,
					bankId,
					startDate: startOfMonth,
					endDate: endOfMonth,
				}),
			]);

			const expensesArray: any[] =
				expensesResult?.success && Array.isArray(expensesResult.data) ? expensesResult.data : [];
			const gainsArray: any[] =
				gainsResult?.success && Array.isArray(gainsResult.data) ? gainsResult.data : [];
			const investmentsArray: any[] =
				investmentsResponse?.success && Array.isArray(investmentsResponse.data) ? investmentsResponse.data : [];

			const resolveBankId = (rawBankId: unknown) => {
				if (typeof rawBankId === 'string') {
					return rawBankId;
				}
				if (
					rawBankId &&
					typeof rawBankId === 'object' &&
					'id' in rawBankId &&
					typeof (rawBankId as { id?: unknown }).id === 'string'
				) {
					return (rawBankId as { id: string }).id;
				}
				return '';
			};

			const sumByBank = (items: any[]) =>
				items.reduce<Record<string, number>>((acc, item) => {
					const bankKey = resolveBankId(item?.bankId);
					if (!bankKey) {
						return acc;
					}

					const value =
						typeof item?.valueInCents === 'number' && !Number.isNaN(item.valueInCents) ? item.valueInCents : 0;

					acc[bankKey] = (acc[bankKey] ?? 0) + Math.max(value, 0);
					return acc;
				}, {});

			const expensesByBank = sumByBank(expensesArray);
			const gainsByBank = sumByBank(gainsArray);

			const totalExpensesInCents = expensesByBank[bankId] ?? 0;
			const totalGainsInCents = gainsByBank[bankId] ?? 0;
			const totalInvestmentsInCents = investmentsArray.reduce((acc, investment) => {
				const value =
					typeof investment?.currentValueInCents === 'number'
						? investment.currentValueInCents
						: typeof investment?.lastManualSyncValueInCents === 'number'
							? investment.lastManualSyncValueInCents
							: typeof investment?.initialValueInCents === 'number'
								? investment.initialValueInCents
								: 0;
				return acc + value;
			}, 0);

			const initialBalance =
				balanceResponse?.success && balanceResponse.data && typeof balanceResponse.data.valueInCents === 'number'
					? balanceResponse.data.valueInCents
					: null;

			const currentBalance =
				typeof initialBalance === 'number'
					? initialBalance + (totalGainsInCents - (totalExpensesInCents + totalInvestmentsInCents))
					: null;

			setOriginBalanceInCents(currentBalance);
		} catch (error) {
			console.error('Erro ao carregar saldo do banco:', error);
			showFloatingAlert({
				message: 'Não foi possível carregar o saldo atual do banco de origem.',
				action: 'error',
				position: 'bottom',
			});
			setOriginBalanceInCents(null);
		} finally {
			setIsLoadingBalance(false);
		}
	}, []);

	React.useEffect(() => {
		let isMounted = true;
		setIsLoadingBanks(true);

		const loadBanks = async () => {
			try {
				const currentUser = auth.currentUser;
				if (!currentUser) {
					showFloatingAlert({
						message: 'Nenhum usuário autenticado foi identificado.',
						action: 'error',
						position: 'bottom',
					});
					return;
				}

				const banksResult = await getBanksWithUsersByPersonFirebase(currentUser.uid);
				if (!isMounted) {
					return;
				}

				if (banksResult.success && Array.isArray(banksResult.data)) {
					const formattedBanks = banksResult.data.map((bank: any) => ({
						id: bank.id,
						name:
							typeof bank?.name === 'string' && bank.name.trim().length > 0
								? bank.name.trim()
								: 'Banco sem nome',
					}));
					setBanks(formattedBanks);
				} else {
					showFloatingAlert({
						message: 'Não foi possível carregar os bancos disponíveis.',
						action: 'error',
						position: 'bottom',
					});
				}
			} catch (error) {
				console.error('Erro ao carregar bancos para transferência:', error);
				if (isMounted) {
					showFloatingAlert({
						message: 'Erro inesperado ao carregar bancos.',
						action: 'error',
						position: 'bottom',
					});
				}
			} finally {
				if (isMounted) {
					setIsLoadingBanks(false);
				}
			}
		};

		void loadBanks();

		return () => {
			isMounted = false;
		};
	}, []);

	React.useEffect(() => {
		if (!selectedSourceBankId) {
			setOriginBalanceInCents(null);
			return;
		}
		void loadOriginBalance(selectedSourceBankId);
	}, [selectedSourceBankId, loadOriginBalance]);

	const hasInsufficientBalance =
		typeof originBalanceInCents === 'number' &&
		typeof transferValueInCents === 'number' &&
		transferValueInCents > originBalanceInCents;

	const targetBankOptions = React.useMemo(
		() => banks.filter(bank => bank.id !== selectedSourceBankId),
		[banks, selectedSourceBankId],
	);

	React.useEffect(() => {
		// Ao trocar banco de origem, limpamos o destino para evitar duplicidade
		setSelectedTargetBankId(null);
	}, [selectedSourceBankId]);

	const handleSubmit = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showFloatingAlert({
				message: 'Nenhum usuário autenticado foi identificado.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (!selectedSourceBankId) {
			showFloatingAlert({
				message: 'Selecione o banco de origem.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (!selectedTargetBankId) {
			showFloatingAlert({
				message: 'Selecione o banco de destino.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (selectedSourceBankId === selectedTargetBankId) {
			showFloatingAlert({
				message: 'Escolha bancos diferentes para realizar a transferência.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		if (transferValueInCents === null || transferValueInCents <= 0) {
			showFloatingAlert({
				message: 'Informe o valor a ser transferido.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (typeof originBalanceInCents === 'number') {
			if (originBalanceInCents <= 0) {
				showFloatingAlert({
					message: 'O banco de origem está sem saldo disponível.',
					action: 'warning',
					position: 'bottom',
				});
				return;
			}
			if (transferValueInCents > originBalanceInCents) {
				showFloatingAlert({
					message: 'Saldo insuficiente para completar a transferência.',
					action: 'warning',
					position: 'bottom',
				});
				return;
			}
		} else {
			showFloatingAlert({
				message: 'Registre ou carregue o saldo do banco de origem antes de transferir.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		const parsedDate = parseDateFromBR(transferDate);
		if (!parsedDate) {
			showFloatingAlert({
				message: 'Informe uma data válida (DD/MM/AAAA).',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		const dateWithCurrentTime = mergeDateWithCurrentTime(parsedDate);
		const sourceBankName =
			banks.find(bank => bank.id === selectedSourceBankId)?.name ?? 'Banco de origem não identificado';
		const targetBankName =
			banks.find(bank => bank.id === selectedTargetBankId)?.name ?? 'Banco de destino não identificado';

		setIsSubmitting(true);

		try {
			const result = await transferBetweenBanksFirebase({
				personId: currentUser.uid,
				sourceBankId: selectedSourceBankId,
				targetBankId: selectedTargetBankId,
				valueInCents: transferValueInCents,
				date: dateWithCurrentTime,
				description: transferDescription?.trim() ? transferDescription.trim() : null,
				sourceBankNameSnapshot: sourceBankName,
				targetBankNameSnapshot: targetBankName,
			});

			if (!result.success) {
				showFloatingAlert({
					message: 'Não foi possível registrar a transferência. Tente novamente.',
					action: 'error',
					position: 'bottom',
				});
				return;
			}

			showFloatingAlert({
				message: 'Transferência registrada com sucesso!',
				action: 'success',
				position: 'bottom',
			});

			setTransferValueDisplay('');
			setTransferValueInCents(null);
			setTransferDescription(null);
			setTransferDate(formatDateToBR(new Date()));
			setSelectedTargetBankId(null);
			void loadOriginBalance(selectedSourceBankId);
		} catch (error) {
			console.error('Erro ao registrar transferência:', error);
			showFloatingAlert({
				message: 'Erro inesperado ao registrar a transferência.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSubmitting(false);
		}
	}, [
		banks,
		loadOriginBalance,
		originBalanceInCents,
		selectedSourceBankId,
		selectedTargetBankId,
		transferDate,
		transferDescription,
		transferValueInCents,
	]);

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: pageBackground }}>
			<StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={pageBackground} />
			<View
				className="
					flex-1 w-full h-full
					mt-[64px]
					items-center
					justify-between
					pb-6
					relative
				"
				style={{ backgroundColor: pageBackground }}
			>
				<FloatingAlertViewport />

				<ScrollView
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					style={{ backgroundColor: pageBackground }}
					contentContainerStyle={{
						flexGrow: 1,
						paddingBottom: 48,
						backgroundColor: pageBackground,
					}}
				>
					<View className="w-full px-6">
						<Heading size="3xl" className="text-center mb-4">
							Transferência entre bancos
						</Heading>

						<Box className="w-full items-center mb-4">
							<TransferIllustration width={170} height={170} />
						</Box>

						<Text className="text-justify mb-6 text-gray-600 dark:text-gray-400">
							Mova valores de um banco para outro com segurança. Validamos o saldo disponível no banco de
							origem antes de concluir a transferência e registramos automaticamente a saída e a entrada para
							as movimentações de cada banco.
						</Text>

						<Divider className="mb-6" />

						<VStack className="gap-4">
							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Banco de origem
								</Text>
								<Select
									selectedValue={selectedSourceBankId ?? undefined}
									onValueChange={value => setSelectedSourceBankId(value)}
									isDisabled={isLoadingBanks || banks.length === 0}
								>
									<SelectTrigger>
										<SelectInput placeholder="Selecione de onde o valor sairá" />
										<SelectIcon />
									</SelectTrigger>
									<SelectPortal>
										<SelectBackdrop />
										<SelectContent>
											<SelectDragIndicatorWrapper>
												<SelectDragIndicator />
											</SelectDragIndicatorWrapper>
											{banks.map(bank => (
												<SelectItem key={bank.id} label={bank.name} value={bank.id} />
											))}
										</SelectContent>
									</SelectPortal>
								</Select>
							</Box>

							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Banco de destino
								</Text>
								<Select
									selectedValue={selectedTargetBankId ?? undefined}
									onValueChange={value => setSelectedTargetBankId(value)}
									isDisabled={isLoadingBanks || banks.length === 0 || !selectedSourceBankId}
								>
									<SelectTrigger>
										<SelectInput
											placeholder={
												selectedSourceBankId
													? 'Selecione para onde o valor chegará'
													: 'Selecione primeiro o banco de origem'
											}
										/>
										<SelectIcon />
									</SelectTrigger>
									<SelectPortal>
										<SelectBackdrop />
										<SelectContent>
											<SelectDragIndicatorWrapper>
												<SelectDragIndicator />
											</SelectDragIndicatorWrapper>
											{targetBankOptions.map(bank => (
												<SelectItem key={bank.id} label={bank.name} value={bank.id} />
											))}
										</SelectContent>
									</SelectPortal>
								</Select>
								{selectedSourceBankId && selectedTargetBankId && selectedSourceBankId === selectedTargetBankId && (
									<Text className="mt-2 text-xs text-red-600 dark:text-red-400">
										Escolha bancos diferentes para completar a transferência.
									</Text>
								)}
							</Box>

							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">Valor</Text>
								<Input>
									<InputField
										value={transferValueDisplay}
										onChangeText={handleValueChange}
										placeholder="R$ 0,00"
										keyboardType="numeric"
										returnKeyType="next"
									/>
								</Input>
								{typeof originBalanceInCents === 'number' && (
									<Text
										className={`mt-2 text-sm ${
											hasInsufficientBalance
												? 'text-red-600 dark:text-red-400'
												: 'text-gray-600 dark:text-gray-400'
										}`}
									>
										Saldo disponível no banco de origem:{' '}
										{isLoadingBalance ? 'carregando...' : formatCurrencyBRL(originBalanceInCents)}
									</Text>
								)}
								{isLoadingBalance && typeof originBalanceInCents !== 'number' && (
									<Text className="mt-2 text-sm text-gray-600 dark:text-gray-400">
										Carregando saldo do banco de origem...
									</Text>
								)}
								{selectedSourceBankId &&
									!isLoadingBalance &&
									typeof originBalanceInCents !== 'number' && (
										<Text className="mt-2 text-sm text-amber-600 dark:text-amber-400">
											Saldo não registrado para este mês. Registre o saldo mensal para validar a transferência.
										</Text>
									)}
								{hasInsufficientBalance && (
									<Text className="mt-1 text-xs text-red-600 dark:text-red-400">
										Saldo insuficiente para o valor informado.
									</Text>
								)}
							</Box>

							<DatePickerField
								label="Data"
								value={transferDate}
								onChange={handleDateSelect}
								isDisabled={isLoadingBanks || isSubmitting}
							/>

							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Descrição (opcional)
								</Text>
								<Textarea size="md" className="h-24">
									<TextareaInput
										value={transferDescription ?? ''}
										onChangeText={value => setTransferDescription(value)}
										placeholder="Adicione detalhes da transferência"
										multiline
									/>
								</Textarea>
							</Box>

							<Button
								size="md"
								variant="outline"
								onPress={() => {
									if (!isSubmitting) {
										void handleSubmit();
									}
								}}
								isDisabled={
									isSubmitting ||
									isLoadingBanks ||
									isLoadingBalance ||
									!selectedSourceBankId ||
									!selectedTargetBankId ||
									!transferValueDisplay
								}
							>
								{isSubmitting ? (
									<>
										<ButtonSpinner color="white" />
										<ButtonText>Registrando transferência</ButtonText>
									</>
								) : (
									<ButtonText>Confirmar transferência</ButtonText>
								)}
							</Button>
						</VStack>
					</View>
				</ScrollView>

				<Menu defaultValue={1} />
			</View>
		</SafeAreaView>
	);
}
