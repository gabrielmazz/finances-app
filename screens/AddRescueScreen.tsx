import React from 'react';
import { BackHandler, ScrollView, View } from 'react-native';
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
	getAllBanksFirebase,
	addCashRescueFirebase,
	getCurrentMonthSummaryByBankFirebaseExpanses,
	getCurrentMonthSummaryByBankFirebaseGains,
} from '@/functions/BankFirebase';
import { auth } from '@/FirebaseConfig';
import { getMonthlyBalanceFirebaseRelatedToUser } from '@/functions/MonthlyBalanceFirebase';

import AddRescueIllustration from '../assets/UnDraw/addRescue.svg';

type BankOption = {
	id: string;
	name: string;
};

const formatCurrencyBRL = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(valueInCents / 100);

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

export default function AddRescueScreen() {
	const [banks, setBanks] = React.useState<BankOption[]>([]);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);
	const [rescueValueDisplay, setRescueValueDisplay] = React.useState('');
	const [rescueValueInCents, setRescueValueInCents] = React.useState<number | null>(null);
	const [rescueDate, setRescueDate] = React.useState(formatDateToBR(new Date()));
	const [rescueDescription, setRescueDescription] = React.useState<string | null>(null);
	const [isLoadingBanks, setIsLoadingBanks] = React.useState(false);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [currentBankBalanceInCents, setCurrentBankBalanceInCents] = React.useState<number | null>(null);
	const [isLoadingBankBalance, setIsLoadingBankBalance] = React.useState(false);

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
			setRescueValueDisplay('');
			setRescueValueInCents(null);
			return;
		}

		const centsValue = parseInt(digitsOnly, 10);
		setRescueValueDisplay(formatCurrencyBRL(centsValue));
		setRescueValueInCents(centsValue);
	}, []);

	React.useEffect(() => {
		if (!selectedBankId) {
			setCurrentBankBalanceInCents(null);
			setIsLoadingBankBalance(false);
			return;
		}

		let isMounted = true;
		setIsLoadingBankBalance(true);
		setCurrentBankBalanceInCents(null);

		const loadBankBalance = async () => {
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

				const [expensesResult, gainsResult, balanceResponse] = await Promise.all([
					getCurrentMonthSummaryByBankFirebaseExpanses(currentUser.uid),
					getCurrentMonthSummaryByBankFirebaseGains(currentUser.uid),
					getMonthlyBalanceFirebaseRelatedToUser({
						personId: currentUser.uid,
						bankId: selectedBankId,
						year: currentYear,
						month: currentMonth,
					}),
				]);

				if (!isMounted) {
					return;
				}

				const expensesArray: any[] =
					expensesResult?.success && Array.isArray(expensesResult.data) ? expensesResult.data : [];
				const gainsArray: any[] =
					gainsResult?.success && Array.isArray(gainsResult.data) ? gainsResult.data : [];

				const totalExpensesInCents = expensesArray.reduce((acc, item) => {
					const bankId = typeof item?.bankId === 'string' ? item.bankId : null;
					const value =
						typeof item?.valueInCents === 'number' && !Number.isNaN(item.valueInCents)
							? item.valueInCents
							: 0;
					if (bankId === selectedBankId) {
						return acc + value;
					}
					return acc;
				}, 0);

				const totalGainsInCents = gainsArray.reduce((acc, item) => {
					const bankId = typeof item?.bankId === 'string' ? item.bankId : null;
					const value =
						typeof item?.valueInCents === 'number' && !Number.isNaN(item.valueInCents)
							? item.valueInCents
							: 0;
					if (bankId === selectedBankId) {
						return acc + value;
					}
					return acc;
				}, 0);

				const initialBalance =
					balanceResponse?.success && balanceResponse.data && typeof balanceResponse.data.valueInCents === 'number'
						? balanceResponse.data.valueInCents
						: null;

				const currentBalance =
					typeof initialBalance === 'number' ? initialBalance + (totalGainsInCents - totalExpensesInCents) : null;

				setCurrentBankBalanceInCents(currentBalance);
			} catch (error) {
				console.error('Erro ao carregar saldo do banco:', error);
				if (isMounted) {
					showFloatingAlert({
						message: 'Não foi possível carregar o saldo atual do banco.',
						action: 'error',
						position: 'bottom',
					});
				}
				setCurrentBankBalanceInCents(null);
			} finally {
				if (isMounted) {
					setIsLoadingBankBalance(false);
				}
			}
		};

		void loadBankBalance();

		return () => {
			isMounted = false;
		};
	}, [selectedBankId]);

	const handleDateChange = React.useCallback((value: string) => {
		const sanitized = sanitizeDateInput(value);
		setRescueDate(formatDateInput(sanitized));
	}, []);

	React.useEffect(() => {
		let isMounted = true;
		setIsLoadingBanks(true);

		const loadBanks = async () => {
			try {
				const banksResult = await getAllBanksFirebase();
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
				console.error('Erro ao carregar bancos para saque:', error);
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

	const handleSubmit = React.useCallback(async () => {
		if (!selectedBankId) {
			showFloatingAlert({
				message: 'Selecione o banco de origem do saque.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (rescueValueInCents === null || rescueValueInCents === 0) {
			showFloatingAlert({
				message: 'Informe o valor sacado.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (!rescueDate) {
			showFloatingAlert({
				message: 'Informe a data do saque.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		const parsedDate = parseDateFromBR(rescueDate);
		if (!parsedDate) {
			showFloatingAlert({
				message: 'Informe uma data válida (DD/MM/AAAA).',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		const currentUser = auth.currentUser;
		if (!currentUser) {
			showFloatingAlert({
				message: 'Nenhum usuário autenticado foi identificado.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		const bankSnapshotName =
			banks.find(bank => bank.id === selectedBankId)?.name ?? 'Banco não identificado';

		const dateWithCurrentTime = mergeDateWithCurrentTime(parsedDate);

		setIsSubmitting(true);

		try {
			const result = await addCashRescueFirebase({
				bankId: selectedBankId,
				bankNameSnapshot: bankSnapshotName,
				valueInCents: rescueValueInCents,
				date: dateWithCurrentTime,
				personId: currentUser.uid,
				description: rescueDescription?.trim() ? rescueDescription.trim() : null,
			});

			if (!result.success) {
				showFloatingAlert({
					message: 'Não foi possível registrar o saque. Tente novamente.',
					action: 'error',
					position: 'bottom',
				});
				return;
			}

			showFloatingAlert({
				message: 'Saque registrado com sucesso!',
				action: 'success',
				position: 'bottom',
			});

			setSelectedBankId(null);
			setRescueValueDisplay('');
			setRescueValueInCents(null);
			setRescueDate(formatDateToBR(new Date()));
			setRescueDescription(null);
			router.push({
				pathname: '/bank-movements',
				params: {
					bankId: selectedBankId,
					bankName: encodeURIComponent(bankSnapshotName),
				},
			});
		} catch (error) {
			console.error('Erro ao registrar saque em dinheiro:', error);
			showFloatingAlert({
				message: 'Erro inesperado ao registrar o saque.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSubmitting(false);
		}
	}, [selectedBankId, rescueValueInCents, rescueDate, rescueDescription, banks]);

	return (
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
			<FloatingAlertViewport />

			<ScrollView
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
				contentContainerStyle={{
					flexGrow: 1,
					paddingBottom: 48,
				}}
			>
				<View className="w-full px-6">
					<Heading size="3xl" className="text-center mb-4">
						Saque em dinheiro
					</Heading>

					<Box className="w-full items-center mb-4">
						<AddRescueIllustration width={170} height={170} />
					</Box>

					<Text className="text-justify mb-6 text-gray-600 dark:text-gray-400">
						Registre um saque efetuado de um banco para o seu dinheiro em espécie. O valor será
						movimentado automaticamente no banco selecionado e aparecerá no histórico de transações em
						dinheiro.
					</Text>

					<Divider className="mb-6" />

					<VStack className="gap-4">
						<Box>
							<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
								Banco de origem
							</Text>
							<Select
								selectedValue={selectedBankId ?? undefined}
								onValueChange={value => setSelectedBankId(value)}
								isDisabled={isLoadingBanks || banks.length === 0}
							>
								<SelectTrigger>
									<SelectInput placeholder="Selecione o banco do qual o valor foi retirado" />
									<SelectIcon />
								</SelectTrigger>

								<SelectPortal>
									<SelectBackdrop />
									<SelectContent>
										<SelectDragIndicatorWrapper>
											<SelectDragIndicator />
										</SelectDragIndicatorWrapper>

										{banks.length > 0 ? (
											banks.map(bank => (
												<SelectItem key={bank.id} label={bank.name} value={bank.id} />
											))
										) : (
											<SelectItem
												key="no-bank"
												label="Nenhum banco disponível"
												value="no-bank"
												isDisabled
											/>
										)}
									</SelectContent>
								</SelectPortal>
							</Select>
						</Box>

						<Box>
							<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
								Saldo atual do banco
							</Text>
							<Input isDisabled>
								<InputField
									value={
										!selectedBankId
											? 'Selecione um banco para visualizar o saldo'
											: isLoadingBankBalance
												? 'Carregando saldo...'
												: typeof currentBankBalanceInCents === 'number'
													? formatCurrencyBRL(currentBankBalanceInCents)
													: 'Saldo indisponível'
									}
								/>
							</Input>
						</Box>

						<Box>
							<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
								Valor do saque
							</Text>
							<Input>
								<InputField
									placeholder="Ex: R$ 150,00"
									value={rescueValueDisplay}
									onChangeText={handleValueChange}
									keyboardType="numeric"
								/>
							</Input>
						</Box>

						<Box>
							<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">Data</Text>
							<Input>
								<InputField
									placeholder="Data do saque (DD/MM/AAAA)"
									value={rescueDate}
									onChangeText={handleDateChange}
									keyboardType="numbers-and-punctuation"
								/>
							</Input>
						</Box>

						<Box>
							<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
								Observações
							</Text>
							<Textarea size="md" className="h-32">
								<TextareaInput
									placeholder="(Opcional) Informe detalhes relevantes sobre este saque..."
									value={rescueDescription ?? ''}
									onChangeText={setRescueDescription}
								/>
							</Textarea>
						</Box>

						<Button
							className="w-full mt-2"
							size="sm"
							variant="outline"
							onPress={handleSubmit}
							isDisabled={
								isSubmitting ||
								isLoadingBanks ||
								!selectedBankId ||
								rescueValueInCents === null ||
								rescueValueInCents === 0 ||
								!rescueDate
							}
						>
							{isSubmitting ? <ButtonSpinner /> : <ButtonText>Registrar saque</ButtonText>}
						</Button>
					</VStack>
				</View>
			</ScrollView>

			<Menu defaultValue={1} />
		</View>
	);
}
