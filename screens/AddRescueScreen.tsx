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

import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { Textarea, TextareaInput } from '@/components/ui/textarea';

import Navigator from '@/components/uiverse/navigator';
import { showNotifierAlert, type NotifierAlertType } from '@/components/uiverse/notifier-alert';
import BankActionsheetSelector, { type BankActionsheetOption } from '@/components/uiverse/bank-actionsheet-selector';
import { navigateToHomeDashboard } from '@/utils/navigation';

import {
	addCashRescueFirebase,
	getBanksWithUsersByPersonFirebase,
	getLegacyBankBalanceInCentsFirebase,
} from '@/functions/BankFirebase';
import {
	createFinancialClientActionId,
	getFinancialLedgerAccountsFirebase,
	getFinancialLedgerContextFirebase,
	transferFundsFinancialLedgerFirebase,
	type FinancialLedgerContext,
} from '@/functions/FinancialLedgerFirebase';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import DatePickerField from '@/components/uiverse/date-picker';

import AddRescueIllustration from '../assets/UnDraw/addRescue.svg';

import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';

type BankOption = {
	id: string;
	name: string;
	iconKey?: string | null;
	colorHex?: string | null;
	currentBalanceInCents?: number | null;
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
		fieldBankContainerClassName,
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
	const [financialLedgerContext, setFinancialLedgerContext] = React.useState<FinancialLedgerContext | null>(null);
	const [cashAccountId, setCashAccountId] = React.useState<string | null>(null);
	const [isLoadingBankBalance, setIsLoadingBankBalance] = React.useState(false);
	const submitLockRef = React.useRef(false);
	const rescueValueInputRef = React.useRef<TextInput | null>(null);
	const rescueDescriptionInputRef = React.useRef<TextInput | null>(null);
	const previousUnavailableBalanceRef = React.useRef(false);
	const applyPostSubmitBehavior = usePostSubmitBehavior('addRescue');
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

	const resetRescueForm = React.useCallback(() => {
		setSelectedBankId(null);
		setRescueValueDisplay('');
		setRescueValueInCents(null);
		setRescueDate(formatDateToBR(new Date()));
		setRescueDescription(null);
		setCurrentBankBalanceInCents(null);
	}, []);

	React.useEffect(() => {
		if (!selectedBankId) {
			setCurrentBankBalanceInCents(null);
			setIsLoadingBankBalance(false);
			return;
		}

		if (financialLedgerContext) {
			const selectedLedgerBank = banks.find(bank => bank.id === selectedBankId);
			setIsLoadingBankBalance(false);
			setCurrentBankBalanceInCents(
				typeof selectedLedgerBank?.currentBalanceInCents === 'number'
					? selectedLedgerBank.currentBalanceInCents
					: null,
			);
			return;
		}

		let isMounted = true;
		setIsLoadingBankBalance(true);
		setCurrentBankBalanceInCents(null);

		const loadBankBalance = async () => {
			try {
					const currentUser = auth.currentUser;
				if (!currentUser) {
					showScreenAlert('Nenhum usuário autenticado foi identificado.', 'error');
					return;
				}

					const balanceResult = await getLegacyBankBalanceInCentsFirebase({
						personId: currentUser.uid,
						bankId: selectedBankId,
					});
					if (!isMounted) {
						return;
					}
					if (!balanceResult.success) {
						throw balanceResult.error;
					}
					setCurrentBankBalanceInCents(balanceResult.data);
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
	}, [banks, financialLedgerContext, selectedBankId, showScreenAlert]);

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

		const shouldShowUnavailableBalanceAlert =
			!financialLedgerContext && (hasUnavailableBalance || hasInsufficientBalance);

		if (shouldShowUnavailableBalanceAlert && !previousUnavailableBalanceRef.current) {
			showUnavailableBalanceNotification();
		}

		previousUnavailableBalanceRef.current = shouldShowUnavailableBalanceAlert;
	}, [
		hasInsufficientBalance,
		hasUnavailableBalance,
		financialLedgerContext,
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

				const ledgerContext = await getFinancialLedgerContextFirebase(currentUser.uid);
				if (ledgerContext) {
					const ledgerAccounts = await getFinancialLedgerAccountsFirebase(ledgerContext.groupId);
					if (!isMounted) {
						return;
					}
					const cashAccount = ledgerAccounts.find(account => account.kind === 'cash') ?? null;
					const formattedBanks = ledgerAccounts
						.filter(account => account.kind === 'bank')
						.map(account => ({
							id: account.id,
							name: account.name,
							iconKey: account.iconKey ?? null,
							colorHex: account.colorHex ?? null,
							currentBalanceInCents: account.currentBalanceInCents,
						}));
					setFinancialLedgerContext(ledgerContext);
					setCashAccountId(cashAccount?.id ?? null);
					setBanks(formattedBanks);
					if (!cashAccount) {
						showScreenAlert('O grupo financeiro não possui uma conta Caixa configurada.', 'error');
					}
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
							iconKey: typeof bank?.iconKey === 'string' ? bank.iconKey : null,
							colorHex: typeof bank?.colorHex === 'string' ? bank.colorHex : null,
						}));
					setBanks(formattedBanks);
					setFinancialLedgerContext(null);
					setCashAccountId(null);
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
	}, [showScreenAlert]);

	const parsedRescueDate = React.useMemo(() => parseDateFromBR(rescueDate), [rescueDate]);
	const selectedBankLabel = React.useMemo(
		() => banks.find(bank => bank.id === selectedBankId)?.name ?? null,
		[banks, selectedBankId],
	);
	const selectedBankOption = React.useMemo(
		() => banks.find(bank => bank.id === selectedBankId) ?? null,
		[banks, selectedBankId],
	);
	const hasRescueValue = rescueValueInCents !== null && rescueValueInCents > 0;
	const requiresOverdraftReason =
		financialLedgerContext !== null &&
		typeof currentBankBalanceInCents === 'number' &&
		typeof rescueValueInCents === 'number' &&
		rescueValueInCents > currentBankBalanceInCents;
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
		(financialLedgerContext !== null && !cashAccountId) ||
		(!financialLedgerContext && (hasUnavailableBalance || hasInsufficientBalance)) ||
		isBalanceValidationUnavailable;

	const handleSubmit = React.useCallback(async () => {
		if (submitLockRef.current || isSubmitting) {
			return;
		}

		if (!selectedBankId) {
			showScreenAlert('Selecione o banco de origem do saque.', 'error');
			return;
		}

		if (rescueValueInCents === null || rescueValueInCents === 0) {
			showScreenAlert('Informe o valor sacado.', 'error');
			return;
		}

		if (!financialLedgerContext && typeof currentBankBalanceInCents === 'number') {
			if (currentBankBalanceInCents <= 0) {
				showUnavailableBalanceNotification();
				return;
			}

			if (rescueValueInCents > currentBankBalanceInCents) {
				showUnavailableBalanceNotification();
				return;
			}
		} else {
			if (typeof currentBankBalanceInCents !== 'number') {
				showScreenAlert(
					'Registre ou carregue o saldo do banco de origem antes de registrar o saque.',
					'warn',
				);
				return;
			}
		}

		if (requiresOverdraftReason && !(rescueDescription && rescueDescription.trim().length >= 3)) {
			showScreenAlert(
				'Informe uma justificativa de pelo menos 3 caracteres para deixar o banco negativo.',
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

		submitLockRef.current = true;
		setIsSubmitting(true);

		try {
			if (financialLedgerContext) {
				if (!cashAccountId) {
					showScreenAlert('A conta Caixa do grupo não está disponível.', 'error');
					return;
				}
				await transferFundsFinancialLedgerFirebase({
					groupId: financialLedgerContext.groupId,
					fromAccountId: selectedBankId,
					toAccountId: cashAccountId,
					amountInCents: rescueValueInCents,
					effectiveAt: dateWithCurrentTime,
					clientActionId: createFinancialClientActionId('cash_rescue'),
					note: rescueDescription?.trim() ? rescueDescription.trim() : null,
					overdraftReason: requiresOverdraftReason ? rescueDescription?.trim() ?? null : null,
				});
			} else {
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
			}

			showSuccessfulRescueNotification();
			applyPostSubmitBehavior({ resetForm: resetRescueForm });
		} catch (error) {
			console.error('Erro ao registrar saque em dinheiro:', error);
			showScreenAlert('Erro inesperado ao registrar o saque.', 'error');
		} finally {
			submitLockRef.current = false;
			setIsSubmitting(false);
		}
	}, [
		selectedBankId,
		rescueValueInCents,
		currentBankBalanceInCents,
		financialLedgerContext,
		cashAccountId,
		requiresOverdraftReason,
		parsedRescueDate,
		rescueDescription,
		isSubmitting,
		banks,
		showScreenAlert,
		showUnavailableBalanceNotification,
		showSuccessfulRescueNotification,
		applyPostSubmitBehavior,
		resetRescueForm,
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
									<BankActionsheetSelector
										options={banks}
										selectedId={selectedBankId}
										selectedLabel={selectedBankLabel}
										selectedOption={selectedBankOption}
										onSelect={(bank: BankActionsheetOption) => setSelectedBankId(bank.id)}
										isDisabled={isBankSelectDisabled}
										isDarkMode={isDarkMode}
										bodyTextClassName={bodyText}
										helperTextClassName={helperText}
										triggerClassName={fieldBankContainerClassName}
										placeholder="Selecione o banco do qual o valor foi retirado"
										sheetTitle="Escolha o banco de origem"
										emptyMessage="Nenhum banco disponível."
										triggerHint="Escolha de onde o dinheiro saiu."
										disabledHint={
											isLoadingBanks
												? 'Carregando bancos disponíveis...'
												: banks.length === 0
													? 'Cadastre um banco para registrar o saque.'
													: 'Banco indisponível no momento.'
										}
										accessibilityLabel="Selecionar banco de origem do saque"
									/>
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
													{financialLedgerContext
														? 'Não foi possível verificar o saldo materializado desta conta.'
														: 'Saldo não registrado para este mês. Registre o saldo mensal para validar o saque.'}
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
