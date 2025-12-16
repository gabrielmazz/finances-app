import React from 'react';
import {
	BackHandler,
	findNodeHandle,
	Keyboard,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StatusBar,
	TextInput,
	View,
} from 'react-native';
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
	addCashRescueFirebase,
	getCurrentMonthSummaryByBankFirebaseExpanses,
	getCurrentMonthSummaryByBankFirebaseGains,
	getBanksWithUsersByPersonFirebase,
} from '@/functions/BankFirebase';
import { auth } from '@/FirebaseConfig';
import { getMonthlyBalanceFirebaseRelatedToUser } from '@/functions/MonthlyBalanceFirebase';
import { getFinanceInvestmentsByPeriodFirebase } from '@/functions/FinancesFirebase';
import { useAppTheme } from '@/contexts/ThemeContext';
import DatePickerField from '@/components/uiverse/date-picker';

import AddRescueIllustration from '../assets/UnDraw/addRescue.svg';

type BankOption = {
	id: string;
	name: string;
};
type FocusableInputKey = 'rescue-value' | 'rescue-description';

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

export default function AddRescueScreen() {
	const { isDarkMode } = useAppTheme();
	const pageBackground = isDarkMode ? '#0b1220' : '#f4f5f7';
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
	const scrollViewRef = React.useRef<ScrollView | null>(null);
	const rescueValueInputRef = React.useRef<TextInput | null>(null);
	const rescueDescriptionInputRef = React.useRef<TextInput | null>(null);
	const lastFocusedInputKey = React.useRef<FocusableInputKey | null>(null);
	const [keyboardHeight, setKeyboardHeight] = React.useState(0);
	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => (key === 'rescue-description' ? 180 : 120),
		[],
	);

	const getInputRef = React.useCallback(
		(key: FocusableInputKey) => {
			switch (key) {
				case 'rescue-value':
					return rescueValueInputRef;
				case 'rescue-description':
					return rescueDescriptionInputRef;
				default:
					return null;
			}
		},
		[],
	);

	const scrollToInput = React.useCallback(
		(key: FocusableInputKey) => {
			const inputRef = getInputRef(key);
			if (!inputRef?.current) {
				return;
			}

			const nodeHandle = findNodeHandle(inputRef.current);
			const scrollResponder = scrollViewRef.current?.getScrollResponder?.();
			const offset = keyboardScrollOffset(key);

			if (scrollResponder && nodeHandle) {
				scrollResponder.scrollResponderScrollNativeHandleToKeyboard(nodeHandle, offset, true);
				return;
			}

			const scrollViewNode = scrollViewRef.current;
			const innerViewNode = scrollViewNode?.getInnerViewNode?.();

			if (scrollViewNode && innerViewNode && typeof inputRef.current.measureLayout === 'function') {
				inputRef.current.measureLayout(
					innerViewNode,
					(_x, y) =>
						scrollViewNode.scrollTo({
							y: Math.max(0, y - keyboardScrollOffset(key)),
							animated: true,
						}),
					() => {},
				);
			}
		},
		[getInputRef, keyboardScrollOffset],
	);

	const handleInputFocus = React.useCallback(
		(key: FocusableInputKey) => {
			lastFocusedInputKey.current = key;
			scrollToInput(key);
		},
		[scrollToInput],
	);

	React.useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

		const showSub = Keyboard.addListener(showEvent, e => {
			setKeyboardHeight(e.endCoordinates?.height ?? 0);
			const focusedKey = lastFocusedInputKey.current;
			if (focusedKey) {
				setTimeout(() => {
					scrollToInput(focusedKey);
				}, 50);
			}
		});
		const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

		return () => {
			showSub.remove();
			hideSub.remove();
		};
	}, [scrollToInput]);

	const contentBottomPadding = React.useMemo(() => Math.max(140, keyboardHeight + 120), [keyboardHeight]);

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
						bankId: selectedBankId,
						year: currentYear,
						month: currentMonth,
					}),
					getFinanceInvestmentsByPeriodFirebase({
						personId: currentUser.uid,
						bankId: selectedBankId,
						startDate: startOfMonth,
						endDate: endOfMonth,
					}),
				]);

				if (!isMounted) {
					return;
				}

				const expensesArray: any[] =
					expensesResult?.success && Array.isArray(expensesResult.data) ? expensesResult.data : [];
				const gainsArray: any[] =
					gainsResult?.success && Array.isArray(gainsResult.data) ? gainsResult.data : [];
				const investmentsArray: any[] =
					investmentsResponse?.success && Array.isArray(investmentsResponse.data)
						? investmentsResponse.data
						: [];

				const sumByBank = (items: any[]) =>
					items.reduce<Record<string, number>>((acc, item) => {
						const bankId = resolveBankId(item?.bankId);
						if (!bankId) {
							return acc;
						}

						const value =
							typeof item?.valueInCents === 'number' && !Number.isNaN(item.valueInCents)
								? item.valueInCents
								: 0;

						acc[bankId] = (acc[bankId] ?? 0) + Math.max(value, 0);
						return acc;
					}, {});

				const expensesByBank = sumByBank(expensesArray);
				const gainsByBank = sumByBank(gainsArray);

				const totalExpensesInCents = expensesByBank[selectedBankId] ?? 0;
				const totalGainsInCents = gainsByBank[selectedBankId] ?? 0;
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

	const handleDateSelect = React.useCallback((formatted: string) => {
		setRescueDate(formatted);
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

				<KeyboardAvoidingView
					behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
					keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
					className="flex-1 w-full"
				>
					<ScrollView
						ref={scrollViewRef}
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="on-drag"
						style={{ backgroundColor: pageBackground }}
						contentContainerStyle={{
							flexGrow: 1,
							paddingBottom: contentBottomPadding,
							backgroundColor: pageBackground,
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
									ref={rescueValueInputRef}
									placeholder="Ex: R$ 150,00"
									value={rescueValueDisplay}
									onChangeText={handleValueChange}
									keyboardType="numeric"
									onFocus={() => handleInputFocus('rescue-value')}
								/>
							</Input>
						</Box>

						<DatePickerField
							label="Data"
							value={rescueDate}
							onChange={handleDateSelect}
							isDisabled={isLoadingBanks || isSubmitting}
						/>

						<Box>
							<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
								Observações
							</Text>
							<Textarea size="md" className="h-32">
								<TextareaInput
									ref={rescueDescriptionInputRef}
									placeholder="(Opcional) Informe detalhes relevantes sobre este saque..."
									value={rescueDescription ?? ''}
									onChangeText={setRescueDescription}
									onFocus={() => handleInputFocus('rescue-description')}
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
				</KeyboardAvoidingView>

				<Menu defaultValue={1} />
			</View>
		</SafeAreaView>
	);
}
