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
	Pressable,
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
import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';

import Navigator from '@/components/uiverse/navigator';
import { showNotifierAlert, type NotifierAlertType } from '@/components/uiverse/notifier-alert';
import { HStack } from '@/components/ui/hstack';

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
import DatePickerField from '@/components/uiverse/date-picker';

import TransferIllustration from '../assets/UnDraw/transferScreen.svg';

import { Info } from 'lucide-react-native';

import { useScreenStyles } from '@/hooks/useScreenStyle';

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

	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		fieldContainerClassName,
		fieldContainerClassNameNotSpace,
		textareaContainerClassName,
		submitButtonClassName,
		heroHeight,
		infoCardStyle,
		insets
	} = useScreenStyles();

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
	const previousUnavailableBalanceRef = React.useRef(false);
	const [keyboardHeight, setKeyboardHeight] = React.useState(0);
	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => (key === 'transfer-description' ? 180 : 120),
		[],
	);

	const showScreenAlert = React.useCallback(
		(description: string, type: NotifierAlertType = 'error') => {
			showNotifierAlert({
				description,
				type,
				isDarkMode,
			});
		},
		[isDarkMode],
	);

	const showUnavailableBalanceNotification = React.useCallback(() => {
		showScreenAlert('O banco selecionado não tem saldo suficiente para esta transferência.', 'error');
	}, [showScreenAlert]);

	const showSuccessfulTransferNotification = React.useCallback(() => {
		showNotifierAlert({
			title: 'Transferência registrada',
			description: 'Transferência realizada com sucesso.',
			type: 'success',
			isDarkMode,
		});
	}, [isDarkMode]);

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
					() => { },
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
				showScreenAlert('Nenhum usuário autenticado foi identificado.', 'error');
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
			showScreenAlert('Não foi possível carregar o saldo atual do banco de origem.', 'error');
			setOriginBalanceInCents(null);
		} finally {
			setIsLoadingBalance(false);
		}
	}, [showScreenAlert]);

	React.useEffect(() => {
		let isMounted = true;
		setIsLoadingBanks(true);

		const loadBanks = async () => {
			try {
				const currentUser = auth.currentUser;
				if (!currentUser) {
					showScreenAlert('Nenhum usuário autenticado foi identificado.', 'error');
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
					showScreenAlert('Não foi possível carregar os bancos disponíveis.', 'error');
				}
			} catch (error) {
				console.error('Erro ao carregar bancos para transferência:', error);
				if (isMounted) {
					showScreenAlert('Erro inesperado ao carregar bancos.', 'error');
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
	}, [showScreenAlert]);

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
	const hasUnavailableBalance =
		typeof originBalanceInCents === 'number' && originBalanceInCents <= 0;
	const parsedTransferDate = React.useMemo(() => parseDateFromBR(transferDate), [transferDate]);
	const isBalanceValidationUnavailable =
		selectedSourceBankId !== null && !isLoadingBalance && typeof originBalanceInCents !== 'number';

	const targetBankOptions = React.useMemo(
		() => banks.filter(bank => bank.id !== selectedSourceBankId),
		[banks, selectedSourceBankId],
	);
	const hasTransferValue = transferValueInCents !== null && transferValueInCents > 0;
	const isSourceBankDisabled = isLoadingBanks || isSubmitting || banks.length === 0;
	const isTargetBankDisabled =
		isLoadingBanks || isSubmitting || !selectedSourceBankId || targetBankOptions.length === 0;
	const isTransferValueDisabled = isSubmitting || !selectedSourceBankId || !selectedTargetBankId;
	const isTransferDateDisabled =
		isSubmitting || !selectedSourceBankId || !selectedTargetBankId || !hasTransferValue;
	const isTransferDescriptionDisabled =
		isSubmitting ||
		!selectedSourceBankId ||
		!selectedTargetBankId ||
		!hasTransferValue ||
		!parsedTransferDate;
	const isSubmitDisabled =
		isSubmitting ||
		isLoadingBanks ||
		isLoadingBalance ||
		!selectedSourceBankId ||
		!selectedTargetBankId ||
		!hasTransferValue ||
		!parsedTransferDate ||
		hasUnavailableBalance ||
		hasInsufficientBalance ||
		isBalanceValidationUnavailable;
	const screenTitle = 'Transferência entre bancos';

	React.useEffect(() => {
		// Ao trocar banco de origem, limpamos o destino para evitar duplicidade
		setSelectedTargetBankId(null);
	}, [selectedSourceBankId]);

	React.useEffect(() => {
		if (
			!selectedSourceBankId ||
			isLoadingBalance ||
			transferValueInCents === null ||
			transferValueInCents <= 0
		) {
			previousUnavailableBalanceRef.current = false;
			return;
		}

		const shouldShowUnavailableBalanceAlert = hasUnavailableBalance || hasInsufficientBalance;

		if (shouldShowUnavailableBalanceAlert && !previousUnavailableBalanceRef.current) {
			showUnavailableBalanceNotification();
		}

		previousUnavailableBalanceRef.current = shouldShowUnavailableBalanceAlert;
	}, [
		hasInsufficientBalance,
		hasUnavailableBalance,
		isLoadingBalance,
		selectedSourceBankId,
		showUnavailableBalanceNotification,
		transferValueInCents,
	]);

	const handleSubmit = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showScreenAlert('Nenhum usuário autenticado foi identificado.', 'error');
			return;
		}

		if (!selectedSourceBankId) {
			showScreenAlert('Selecione o banco de origem.', 'error');
			return;
		}

		if (!selectedTargetBankId) {
			showScreenAlert('Selecione o banco de destino.', 'error');
			return;
		}

		if (selectedSourceBankId === selectedTargetBankId) {
			showScreenAlert('Escolha bancos diferentes para realizar a transferência.', 'warn');
			return;
		}

		if (transferValueInCents === null || transferValueInCents <= 0) {
			showScreenAlert('Informe o valor a ser transferido.', 'error');
			return;
		}

		if (typeof originBalanceInCents === 'number') {
			if (originBalanceInCents <= 0) {
				showUnavailableBalanceNotification();
				return;
			}
			if (transferValueInCents > originBalanceInCents) {
				showUnavailableBalanceNotification();
				return;
			}
		} else {
			showScreenAlert(
				'Registre ou carregue o saldo do banco de origem antes de transferir.',
				'warn',
			);
			return;
		}

		if (!parsedTransferDate) {
			showScreenAlert('Informe uma data válida (DD/MM/AAAA).', 'error');
			return;
		}

		const dateWithCurrentTime = mergeDateWithCurrentTime(parsedTransferDate);
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
				showScreenAlert('Não foi possível registrar a transferência. Tente novamente.', 'error');
				return;
			}

			showSuccessfulTransferNotification();
			router.replace({
				pathname: '/home',
				params: {
					tab: '0',
				},
			});
		} catch (error) {
			console.error('Erro ao registrar transferência:', error);
			showScreenAlert('Erro inesperado ao registrar a transferência.', 'error');
		} finally {
			setIsSubmitting(false);
		}
	}, [
		banks,
		originBalanceInCents,
		showScreenAlert,
		showSuccessfulTransferNotification,
		showUnavailableBalanceNotification,
		selectedSourceBankId,
		selectedTargetBankId,
		parsedTransferDate,
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
							<VStack className="h-full mt-4">

								<HStack className="w-full" space="md">

									<VStack className="mb-4 flex-1">
										<HStack className="mb-1 ml-1 gap-2">
											<Text className={`${bodyText} text-sm`}>Banco de Origem</Text>
											<Popover
												placement="bottom"
												size="md"
												offset={0}
												shouldFlip
												focusScope={false}
												trapFocus={false}
												trigger={triggerProps => (
													<Pressable
														{...triggerProps}
														hitSlop={8}
														accessibilityRole="button"
														accessibilityLabel="Informações sobre o banco de origem"
													>
														<Info
															size={14}
															color={isDarkMode ? '#94A3B8' : '#64748B'}
															style={{ marginLeft: 4 }}
														/>
													</Pressable>
												)}
											>
												<PopoverBackdrop className="bg-transparent" />
												<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
													<PopoverBody className="px-3 py-3">
														<Text className={`${bodyText} text-xs leading-5`}>
															Selecione o banco de origem para a transferência. O saldo disponível será
															carregado para validar se a transferência pode ser realizada. Se o banco de origem
															não tiver saldo registrado para o mês atual, a transferência não poderá ser
															realizada.
														</Text>
													</PopoverBody>
												</PopoverContent>
											</Popover>
										</HStack>
										<Select
											selectedValue={selectedSourceBankId ?? undefined}
											onValueChange={value => setSelectedSourceBankId(value)}
											isDisabled={isSourceBankDisabled}
										>
											<SelectTrigger
												variant="outline"
												size="md"
												className={`${fieldContainerClassNameNotSpace} w-full`}
											>
												<SelectInput
													placeholder="De onde o valor sairá"
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
									</VStack>

									<VStack className="mb-4 flex-1">
										<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Banco de destino</Text>
										<Select
											selectedValue={selectedTargetBankId ?? undefined}
											onValueChange={value => setSelectedTargetBankId(value)}
											isDisabled={isTargetBankDisabled}
										>
											<SelectTrigger
												variant="outline"
												size="md"
												className={`${fieldContainerClassNameNotSpace} w-full`}
											>
												<SelectInput
													placeholder={
														selectedSourceBankId
															? 'Para onde o valor irá'
															: 'Selecione a origem'
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

										{selectedSourceBankId &&
											selectedTargetBankId &&
											selectedSourceBankId === selectedTargetBankId && (
												<Text className="mt-1 text-xs text-red-600 dark:text-red-400">
													Escolha bancos diferentes para completar a transferência.
												</Text>
											)}
									</VStack>
								</HStack>

								{selectedSourceBankId && (
									<View className="mb-4 px-3 py-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
										{typeof originBalanceInCents === 'number' && (
											<Text className={`${helperText} text-sm text-center`}>
												Saldo disponível no banco de origem:{' '}
												{isLoadingBalance ? 'carregando...' : formatCurrencyBRL(originBalanceInCents)}
											</Text>
										)}
										{isLoadingBalance && typeof originBalanceInCents !== 'number' && (
											<Text className={`${helperText} text-sm text-center`}>
												Carregando saldo do banco de origem...
											</Text>
										)}
										{selectedSourceBankId &&
											!isLoadingBalance &&
											typeof originBalanceInCents !== 'number' && (
												<Text className="text-sm text-amber-600 dark:text-amber-400 text-center">
													Saldo não registrado para este mês. Registre o saldo mensal para validar
													a transferência.
												</Text>
											)}
									</View>
								)}


								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Valor</Text>
									<Input className={fieldContainerClassName} isDisabled={isTransferValueDisabled}>
										<InputField
											ref={transferValueInputRef as any}
											value={transferValueDisplay}
											onChangeText={handleValueChange}
											placeholder="R$ 0,00"
											keyboardType="numeric"
											returnKeyType="next"
											className={inputField}
											editable={!isTransferValueDisabled}
											onFocus={() => handleInputFocus('transfer-value')}
										/>
									</Input>
								</VStack>

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Data da transferência</Text>
									<DatePickerField
										value={transferDate}
										onChange={handleDateSelect}
										triggerClassName={fieldContainerClassName}
										inputClassName={inputField}
										placeholder="Selecione a data da transferência"
										isDisabled={isTransferDateDisabled}
									/>
								</VStack>

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Descrição (opcional)</Text>
									<Textarea
										className={textareaContainerClassName}
										isDisabled={isTransferDescriptionDisabled}
									>
										<TextareaInput
											ref={transferDescriptionInputRef as any}
											value={transferDescription ?? ''}
											onChangeText={value => setTransferDescription(value)}
											placeholder="Adicione detalhes da transferência bancária"
											className={`${inputField} pt-2`}
											multiline
											editable={!isTransferDescriptionDisabled}
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
									isDisabled={isSubmitDisabled}
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
