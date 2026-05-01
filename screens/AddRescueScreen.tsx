import React from 'react';
import {
	BackHandler,
	Keyboard,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StatusBar,
	TextInput,
	View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

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

import Navigator from '@/components/uiverse/navigator';
import { showNotifierAlert, type NotifierAlertType } from '@/components/uiverse/notifier-alert';
import { navigateToHomeDashboard } from '@/utils/navigation';

import {
	addCashRescueFirebase,
	getCurrentMonthSummaryByBankFirebaseExpanses,
	getCurrentMonthSummaryByBankFirebaseGains,
	getBanksWithUsersByPersonFirebase,
} from '@/functions/BankFirebase';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { getMonthlyBalanceFirebaseRelatedToUser } from '@/functions/MonthlyBalanceFirebase';
import { getFinanceInvestmentsByPeriodFirebase } from '@/functions/FinancesFirebase';
import DatePickerField from '@/components/uiverse/date-picker';

import AddRescueIllustration from '../assets/UnDraw/addRescue.svg';

import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';

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
	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		fieldContainerClassName,
		textareaContainerClassName,
		submitButtonClassName,
		heroHeight,
		insets,
	} = useScreenStyles();

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
	const rescueValueInputRef = React.useRef<TextInput | null>(null);
	const rescueDescriptionInputRef = React.useRef<TextInput | null>(null);
	const previousUnavailableBalanceRef = React.useRef(false);
	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => (key === 'rescue-description' ? 180 : 120),
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
		showScreenAlert('O banco selecionado não tem saldo suficiente para este saque.', 'error');
	}, [showScreenAlert]);

	const showSuccessfulRescueNotification = React.useCallback(() => {
		showNotifierAlert({
			title: 'Saque registrado',
			description: 'Saque realizado com sucesso.',
			type: 'success',
			isDarkMode,
		});
	}, [isDarkMode]);

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

	const {
		scrollViewRef,
		contentBottomPadding,
		handleInputFocus,
		handleScroll,
		scrollEventThrottle,
	} = useKeyboardAwareScroll<FocusableInputKey>({
		getInputRef,
		keyboardScrollOffset,
	});

	useFocusEffect(
		React.useCallback(() => {
			const handleBackPress = () => {
				navigateToHomeDashboard();
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
					showScreenAlert('Não foi possível carregar o saldo atual do banco.', 'error');
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
	}, [selectedBankId, showScreenAlert]);

	const hasInsufficientBalance =
		typeof currentBankBalanceInCents === 'number' &&
		typeof rescueValueInCents === 'number' &&
		rescueValueInCents > currentBankBalanceInCents;
	const hasUnavailableBalance =
		typeof currentBankBalanceInCents === 'number' && currentBankBalanceInCents <= 0;
	const isBalanceValidationUnavailable =
		selectedBankId !== null && !isLoadingBankBalance && typeof currentBankBalanceInCents !== 'number';

	React.useEffect(() => {
		if (!selectedBankId || isLoadingBankBalance || rescueValueInCents === null || rescueValueInCents <= 0) {
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
		isLoadingBankBalance,
		rescueValueInCents,
		selectedBankId,
		showUnavailableBalanceNotification,
	]);

	const handleDateSelect = React.useCallback((formatted: string) => {
		setRescueDate(formatted);
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
				console.error('Erro ao carregar bancos para saque:', error);
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
	}, []);

	const parsedRescueDate = React.useMemo(() => parseDateFromBR(rescueDate), [rescueDate]);
	const hasRescueValue = rescueValueInCents !== null && rescueValueInCents > 0;
	const isBankSelectDisabled = isLoadingBanks || isSubmitting || banks.length === 0;
	const isRescueValueDisabled = isSubmitting || !selectedBankId;
	const isRescueDateDisabled = isSubmitting || !selectedBankId || !hasRescueValue;
	const isRescueDescriptionDisabled = isSubmitting || !selectedBankId || !hasRescueValue || !parsedRescueDate;
	const isSubmitDisabled =
		isSubmitting ||
		isLoadingBanks ||
		isLoadingBankBalance ||
		!selectedBankId ||
		!hasRescueValue ||
		!parsedRescueDate ||
		hasUnavailableBalance ||
		hasInsufficientBalance ||
		isBalanceValidationUnavailable;

	const handleSubmit = React.useCallback(async () => {
		if (!selectedBankId) {
			showScreenAlert('Selecione o banco de origem do saque.', 'error');
			return;
		}

		if (rescueValueInCents === null || rescueValueInCents === 0) {
			showScreenAlert('Informe o valor sacado.', 'error');
			return;
		}

		if (typeof currentBankBalanceInCents === 'number') {
			if (currentBankBalanceInCents <= 0) {
				showUnavailableBalanceNotification();
				return;
			}

			if (rescueValueInCents > currentBankBalanceInCents) {
				showUnavailableBalanceNotification();
				return;
			}
		} else {
			showScreenAlert(
				'Registre ou carregue o saldo do banco de origem antes de registrar o saque.',
				'warn',
			);
			return;
		}

		if (!parsedRescueDate) {
			showScreenAlert('Informe uma data válida (DD/MM/AAAA).', 'error');
			return;
		}

		const currentUser = auth.currentUser;
		if (!currentUser) {
			showScreenAlert('Nenhum usuário autenticado foi identificado.', 'error');
			return;
		}

		const bankSnapshotName =
			banks.find(bank => bank.id === selectedBankId)?.name ?? 'Banco não identificado';

		const dateWithCurrentTime = mergeDateWithCurrentTime(parsedRescueDate);

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
				showScreenAlert('Não foi possível registrar o saque. Tente novamente.', 'error');
				return;
			}

			showSuccessfulRescueNotification();
			navigateToHomeDashboard();
		} catch (error) {
			console.error('Erro ao registrar saque em dinheiro:', error);
			showScreenAlert('Erro inesperado ao registrar o saque.', 'error');
		} finally {
			setIsSubmitting(false);
		}
	}, [
		selectedBankId,
		rescueValueInCents,
		currentBankBalanceInCents,
		parsedRescueDate,
		rescueDescription,
		banks,
		showScreenAlert,
		showUnavailableBalanceNotification,
		showSuccessfulRescueNotification,
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
								alt="Background da tela de saque em dinheiro"
								className="w-full h-full rounded-b-3xl absolute"
								resizeMode="cover"
							/>

							<VStack
								className="w-full h-full items-center justify-start px-6 gap-4"
								style={{ paddingTop: insets.top + 24 }}
							>
								<Heading size="xl" className="text-white text-center">
									Saque em dinheiro
								</Heading>
								<AddRescueIllustration width="40%" height="40%" className="opacity-90" />
							</VStack>
						</View>

						<ScrollView
							ref={scrollViewRef}
							keyboardShouldPersistTaps="handled"
							keyboardDismissMode="on-drag"
							className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
							style={{ marginTop: heroHeight - 64 }}
							contentContainerStyle={{ paddingBottom: Math.max(32, contentBottomPadding - 108) }}
							onScroll={handleScroll}
							scrollEventThrottle={scrollEventThrottle}
						>
							<VStack className="justify-between mt-4">
								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Banco de origem</Text>
									<Select
										selectedValue={selectedBankId ?? undefined}
										onValueChange={value => setSelectedBankId(value)}
										isDisabled={isBankSelectDisabled}
									>
										<SelectTrigger variant="outline" size="md" className={fieldContainerClassName}>
											<SelectInput
												placeholder="Selecione o banco do qual o valor foi retirado"
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
														key="no-bank"
														label="Nenhum banco disponível"
														value="no-bank"
														isDisabled
													/>
												)}
											</SelectContent>
										</SelectPortal>
									</Select>
								</VStack>

								{selectedBankId && (
									<View className="mb-4 px-3 py-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
										{typeof currentBankBalanceInCents === 'number' && (
											<Text className={`${helperText} text-sm text-center`}>
												Saldo disponível no banco de origem:{' '}
												{isLoadingBankBalance
													? 'carregando...'
													: formatCurrencyBRL(currentBankBalanceInCents)}
											</Text>
										)}
										{isLoadingBankBalance && typeof currentBankBalanceInCents !== 'number' && (
											<Text className={`${helperText} text-sm text-center`}>
												Carregando saldo do banco de origem...
											</Text>
										)}
										{selectedBankId &&
											!isLoadingBankBalance &&
											typeof currentBankBalanceInCents !== 'number' && (
												<Text className="text-sm text-amber-600 dark:text-amber-400 text-center">
													Saldo não registrado para este mês. Registre o saldo mensal para validar o
													saque.
												</Text>
											)}
									</View>
								)}

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Valor do saque</Text>
									<Input className={fieldContainerClassName} isDisabled={isRescueValueDisabled}>
										<InputField
											ref={rescueValueInputRef as any}
											placeholder="Ex: R$ 150,00"
											value={rescueValueDisplay}
											onChangeText={handleValueChange}
											keyboardType="numeric"
											className={inputField}
											editable={!isRescueValueDisabled}
											onFocus={() => handleInputFocus('rescue-value')}
										/>
									</Input>
								</VStack>

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Data do saque</Text>
									<DatePickerField
										value={rescueDate}
										onChange={handleDateSelect}
										triggerClassName={fieldContainerClassName}
										inputClassName={inputField}
										placeholder="Selecione a data do saque"
										isDisabled={isRescueDateDisabled}
									/>
								</VStack>

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Observações</Text>
									<Textarea className={textareaContainerClassName} isDisabled={isRescueDescriptionDisabled}>
										<TextareaInput
											ref={rescueDescriptionInputRef as any}
											placeholder="(Opcional) Informe detalhes relevantes sobre este saque..."
											value={rescueDescription ?? ''}
											onChangeText={setRescueDescription}
											className={`${inputField} pt-2`}
											editable={!isRescueDescriptionDisabled}
											onFocus={() => handleInputFocus('rescue-description')}
										/>
									</Textarea>
								</VStack>

								<Button
									className={submitButtonClassName}
									onPress={handleSubmit}
									isDisabled={isSubmitDisabled}
								>
									{isSubmitting ? <ButtonSpinner /> : <ButtonText>Registrar saque</ButtonText>}
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
