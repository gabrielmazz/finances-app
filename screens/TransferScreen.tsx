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
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { Textarea, TextareaInput } from '@/components/ui/textarea';

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import Navigator from '@/components/uiverse/navigator';

import {
	getBanksWithUsersByPersonFirebase,
	getCurrentMonthSummaryByBankFirebaseExpanses,
	getCurrentMonthSummaryByBankFirebaseGains,
	transferBetweenBanksFirebase,
} from '@/functions/BankFirebase';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { getMonthlyBalanceFirebaseRelatedToUser } from '@/functions/MonthlyBalanceFirebase';
import { getFinanceInvestmentsByPeriodFirebase } from '@/functions/FinancesFirebase';
import { useAppTheme } from '@/contexts/ThemeContext';
import DatePickerField from '@/components/uiverse/date-picker';

import TransferIllustration from '../assets/UnDraw/transferScreen.svg';

type BankOption = {
	id: string;
	name: string;
};
type FocusableInputKey = 'transfer-value' | 'transfer-description';

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
	const insets = useSafeAreaInsets();
	const { height: windowHeight } = useWindowDimensions();

	const surfaceBackground = isDarkMode ? '#020617' : '#FFFFFF';
	const cardBackground = isDarkMode ? 'bg-slate-950' : 'bg-white';
	const bodyText = isDarkMode ? 'text-slate-300' : 'text-slate-700';
	const helperText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
	const inputField = isDarkMode
		? 'text-slate-100 placeholder:text-slate-500'
		: 'text-slate-900 placeholder:text-slate-500';
	const focusFieldClassName =
		'data-[focus=true]:border-[#FFE000] dark:data-[focus=true]:border-yellow-300';
	const fieldContainerClassName = `h-10 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const fieldContainerCardClassName = `rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const textareaContainerClassName =
		`h-24 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const submitButtonClassName = isDarkMode
		? 'bg-yellow-300/80 text-slate-900 hover:bg-yellow-300 rounded-2xl'
		: 'bg-yellow-400 text-white hover:bg-yellow-500 rounded-2xl';
	const heroHeight = Math.max(windowHeight * 0.28, 250) + insets.top;

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
	const scrollViewRef = React.useRef<ScrollView | null>(null);
	const transferValueInputRef = React.useRef<TextInput | null>(null);
	const transferDescriptionInputRef = React.useRef<TextInput | null>(null);
	const lastFocusedInputKey = React.useRef<FocusableInputKey | null>(null);
	const [keyboardHeight, setKeyboardHeight] = React.useState(0);
	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => (key === 'transfer-description' ? 180 : 120),
		[],
	);

	const getInputRef = React.useCallback(
		(key: FocusableInputKey) => {
			switch (key) {
				case 'transfer-value':
					return transferValueInputRef;
				case 'transfer-description':
					return transferDescriptionInputRef;
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
	const screenTitle = 'Transferência entre bancos';

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

			<FloatingAlertViewport />

			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<KeyboardAvoidingView
					behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
					keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
					className="flex-1"
				>
					<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
						<View
							className={`absolute top-0 left-0 right-0 ${cardBackground}`}
							style={{ height: heroHeight }}
						>
							<Image
								source={LoginWallpaper}
								alt="Background da tela de transferência entre bancos"
								className="w-full h-full rounded-b-3xl absolute"
								resizeMode="cover"
							/>

							<VStack
								className="w-full h-full items-center justify-start px-6 gap-4"
								style={{ paddingTop: insets.top + 24 }}
							>
								<Heading size="xl" className="text-white text-center">
									{screenTitle}
								</Heading>
								<TransferIllustration width="40%" height="40%" className="opacity-90" />
							</VStack>
						</View>

						<ScrollView
							ref={scrollViewRef}
							keyboardShouldPersistTaps="handled"
							keyboardDismissMode="on-drag"
							className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
							style={{ marginTop: heroHeight - 64 }}
							contentContainerStyle={{ paddingBottom: Math.max(32, contentBottomPadding - 108) }}
						>
							<VStack className="justify-between mt-4">
								<View className={`${fieldContainerCardClassName} px-4 py-4 mb-4`}>
									<Text className={`${bodyText} text-sm leading-6`}>
										Mova valores de um banco para outro com segurança. O saldo disponível do banco
										de origem é validado antes da transferência e a movimentação fica registrada
										nos dois bancos.
									</Text>
								</View>

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Banco de origem</Text>
									<Select
										selectedValue={selectedSourceBankId ?? undefined}
										onValueChange={value => setSelectedSourceBankId(value)}
										isDisabled={isLoadingBanks || banks.length === 0}
									>
										<SelectTrigger variant="outline" size="md" className={fieldContainerClassName}>
											<SelectInput
												placeholder="Selecione de onde o valor sairá"
												className={inputField}
											/>
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
														label="Nenhum banco disponível"
														value="no-bank"
														isDisabled
													/>
												)}
											</SelectContent>
										</SelectPortal>
									</Select>
									<Text className={`${helperText} mt-2 text-sm`}>
										{isLoadingBanks
											? 'Carregando bancos disponíveis...'
											: 'Selecione o banco que enviará o valor.'}
									</Text>
								</VStack>

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Banco de destino</Text>
									<Select
										selectedValue={selectedTargetBankId ?? undefined}
										onValueChange={value => setSelectedTargetBankId(value)}
										isDisabled={isLoadingBanks || banks.length === 0 || !selectedSourceBankId}
									>
										<SelectTrigger variant="outline" size="md" className={fieldContainerClassName}>
											<SelectInput
												placeholder={
													selectedSourceBankId
														? 'Selecione para onde o valor chegará'
														: 'Selecione primeiro o banco de origem'
												}
												className={inputField}
											/>
											<SelectIcon />
										</SelectTrigger>
										<SelectPortal>
											<SelectBackdrop />
											<SelectContent>
												<SelectDragIndicatorWrapper>
													<SelectDragIndicator />
												</SelectDragIndicatorWrapper>
												{targetBankOptions.length > 0 ? (
													targetBankOptions.map(bank => (
														<SelectItem key={bank.id} label={bank.name} value={bank.id} />
													))
												) : (
													<SelectItem
														label="Nenhum banco disponível"
														value="no-target-bank"
														isDisabled
													/>
												)}
											</SelectContent>
										</SelectPortal>
									</Select>
									<Text className={`${helperText} mt-2 text-sm`}>
										{selectedSourceBankId
											? 'Escolha o banco que receberá a transferência.'
											: 'Defina o banco de origem para liberar este campo.'}
									</Text>
									{selectedSourceBankId &&
										selectedTargetBankId &&
										selectedSourceBankId === selectedTargetBankId && (
											<Text className="mt-1 text-xs text-red-600 dark:text-red-400">
												Escolha bancos diferentes para completar a transferência.
											</Text>
										)}
								</VStack>

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Valor</Text>
									<Input className={fieldContainerClassName}>
										<InputField
											ref={transferValueInputRef as any}
											value={transferValueDisplay}
											onChangeText={handleValueChange}
											placeholder="R$ 0,00"
											keyboardType="numeric"
											returnKeyType="next"
											className={inputField}
											onFocus={() => handleInputFocus('transfer-value')}
										/>
									</Input>
									{typeof originBalanceInCents === 'number' && (
										<Text
											className={`mt-2 text-sm ${
												hasInsufficientBalance
													? 'text-red-600 dark:text-red-400'
													: helperText
											}`}
										>
											Saldo disponível no banco de origem:{' '}
											{isLoadingBalance ? 'carregando...' : formatCurrencyBRL(originBalanceInCents)}
										</Text>
									)}
									{isLoadingBalance && typeof originBalanceInCents !== 'number' && (
										<Text className={`${helperText} mt-2 text-sm`}>
											Carregando saldo do banco de origem...
										</Text>
									)}
									{selectedSourceBankId &&
										!isLoadingBalance &&
										typeof originBalanceInCents !== 'number' && (
											<Text className="mt-2 text-sm text-amber-600 dark:text-amber-400">
												Saldo não registrado para este mês. Registre o saldo mensal para validar
												a transferência.
											</Text>
										)}
									{hasInsufficientBalance && (
										<Text className="mt-1 text-xs text-red-600 dark:text-red-400">
											Saldo insuficiente para o valor informado.
										</Text>
									)}
								</VStack>

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Data da transferência</Text>
									<DatePickerField
										value={transferDate}
										onChange={handleDateSelect}
										triggerClassName={fieldContainerClassName}
										inputClassName={inputField}
										placeholder="Selecione a data da transferência"
										isDisabled={isLoadingBanks || isSubmitting}
									/>
								</VStack>

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Descrição (opcional)</Text>
									<Textarea className={textareaContainerClassName}>
										<TextareaInput
											ref={transferDescriptionInputRef as any}
											value={transferDescription ?? ''}
											onChangeText={value => setTransferDescription(value)}
											placeholder="Adicione detalhes da transferência"
											className={`${inputField} pt-2`}
											multiline
											onFocus={() => handleInputFocus('transfer-description')}
										/>
									</Textarea>
								</VStack>

								<Button
									className={submitButtonClassName}
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
											<ButtonSpinner />
											<ButtonText>Registrando transferência</ButtonText>
										</>
									) : (
										<ButtonText>Confirmar transferência</ButtonText>
									)}
								</Button>
							</VStack>
						</ScrollView>
					</View>
				</KeyboardAvoidingView>

				<View
					style={{
						marginHorizontal: -18,
						paddingBottom: 0,
						flexShrink: 0,
					}}
				>
					<Navigator defaultValue={1} />
				</View>
			</View>
		</SafeAreaView>
	);
}
