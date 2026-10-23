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

import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { Textarea, TextareaInput } from '@/components/ui/textarea';

import Navigator from '@/components/uiverse/navigation/navigator';
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';
import { showNotifierAlert, type NotifierAlertType } from '@/components/uiverse/feedback/notifier-alert';
import BankActionsheetSelector, { type BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';
import BankBalanceAttachedPanel from '@/components/uiverse/banks/bank-balance-attached-panel';
import { navigateToHomeDashboard } from '@/utils/navigation';

import {
	addCashRescueFirebase,
} from '@/functions/BankFirebase';
import {
	createFinancialClientActionId,
	transferFundsFinancialLedgerFirebase,
} from '@/functions/FinancialLedgerFirebase';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import DatePickerField from '@/components/uiverse/shared/date-picker';

import AddRescueIllustration from '../../assets/UnDraw/addRescue.svg';

import { LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { cn } from '@/lib/utils';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';
import { useSparkPairForm } from '@/hooks/useSparkPairForm';
import { useRescueFormData } from '@/hooks/useRescueFormData';
import MovementFormStatus from '@/components/uiverse/transactions/movement-form-status';
import { toFinancialCivilDate } from '@/utils/financialCivilDate';

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
		webDashboardClassNames,
	} = useScreenStyles();

	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);
	const [rescueValueDisplay, setRescueValueDisplay] = React.useState('');
	const [rescueValueInCents, setRescueValueInCents] = React.useState<number | null>(null);
	const [rescueDate, setRescueDate] = React.useState(formatDateToBR(toFinancialCivilDate(new Date())));
	const [rescueDescription, setRescueDescription] = React.useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const { personId, banks, isSparkMode, financialLedgerContext, cashAccountId, isLoadingBanks, banksError,
		currentBankBalanceInCents, isLoadingBankBalance, error: rescueDataError, needsBank, reload: reloadRescueData } = useRescueFormData(selectedBankId);
	const mounted = React.useRef(true);
	React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
	const submitLockRef = React.useRef(false);
	const rescueValueInputRef = React.useRef<TextInput | null>(null);
	const rescueDescriptionInputRef = React.useRef<TextInput | null>(null);
	const previousUnavailableBalanceRef = React.useRef(false);
	const applyPostSubmitBehavior = usePostSubmitBehavior('addRescue');
	const { submit: submitSparkPair, reset: resetSparkPair, isUncertain: isPairUncertain } = useSparkPairForm();
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
		resetSparkPair();
		setSelectedBankId(null);
		setRescueValueDisplay('');
		setRescueValueInCents(null);
		setRescueDate(formatDateToBR(toFinancialCivilDate(new Date())));
		setRescueDescription(null);
	}, [resetSparkPair]);

	React.useEffect(() => { resetRescueForm(); }, [personId, resetRescueForm]);

	const hasInsufficientBalance =
		typeof currentBankBalanceInCents === 'number' &&
		typeof rescueValueInCents === 'number' &&
		rescueValueInCents > currentBankBalanceInCents;
	const hasUnavailableBalance =
		typeof currentBankBalanceInCents === 'number' && currentBankBalanceInCents <= 0;
	const isBalanceValidationUnavailable =
		selectedBankId !== null && !isLoadingBankBalance && typeof currentBankBalanceInCents !== 'number';

	React.useEffect(() => {
		if (isPairUncertain || !selectedBankId || isLoadingBankBalance || rescueValueInCents === null || rescueValueInCents <= 0) {
			previousUnavailableBalanceRef.current = false;
			return;
		}

		const shouldShowUnavailableBalanceAlert =
			!financialLedgerContext && !isSparkMode && (hasUnavailableBalance || hasInsufficientBalance);

		if (shouldShowUnavailableBalanceAlert && !previousUnavailableBalanceRef.current) {
			showUnavailableBalanceNotification();
		}

		previousUnavailableBalanceRef.current = shouldShowUnavailableBalanceAlert;
	}, [
		isPairUncertain,
		hasInsufficientBalance,
		hasUnavailableBalance,
		financialLedgerContext, isSparkMode,
		isLoadingBankBalance,
		rescueValueInCents,
		selectedBankId,
		showUnavailableBalanceNotification,
	]);

	const handleDateSelect = React.useCallback((formatted: string) => {
		setRescueDate(formatted);
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
	const hasRescueValue = rescueValueInCents !== null && Number.isSafeInteger(rescueValueInCents) && rescueValueInCents > 0;
	const requiresOverdraftReason =
		(financialLedgerContext !== null || isSparkMode) &&
		typeof currentBankBalanceInCents === 'number' &&
		typeof rescueValueInCents === 'number' &&
		rescueValueInCents > currentBankBalanceInCents;
	const isFormLocked = isSubmitting || isPairUncertain || isLoadingBanks || Boolean(banksError);
	const isOverdraftReasonInvalid = requiresOverdraftReason && (!rescueDescription || rescueDescription.trim().length < 3 || (isSparkMode && rescueDescription.trim().length > 500));
	const isBankSelectDisabled = isFormLocked || banks.length === 0;
	const isRescueValueDisabled = isFormLocked || !selectedBankId;
	const isRescueDateDisabled = isFormLocked || !selectedBankId || !hasRescueValue;
	const isRescueDescriptionDisabled = isFormLocked || !selectedBankId || !hasRescueValue || !parsedRescueDate;
	const isSubmitDisabled =
		isSubmitting ||
		isLoadingBanks ||
		!selectedBankId ||
		!hasRescueValue ||
		!parsedRescueDate ||
		(!isPairUncertain && (isLoadingBankBalance || Boolean(rescueDataError) || isOverdraftReasonInvalid || ((financialLedgerContext !== null || isSparkMode) && !cashAccountId))) ||
		(!isPairUncertain && !financialLedgerContext && !isSparkMode && (hasUnavailableBalance || hasInsufficientBalance)) ||
		(!isPairUncertain && isBalanceValidationUnavailable);

	const handleSubmit = React.useCallback(async () => {
		if (submitLockRef.current || isSubmitDisabled) {
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

		if (!isPairUncertain && !financialLedgerContext && !isSparkMode && typeof currentBankBalanceInCents === 'number') {
			if (currentBankBalanceInCents <= 0) {
				showUnavailableBalanceNotification();
				return;
			}

			if (rescueValueInCents > currentBankBalanceInCents) {
				showUnavailableBalanceNotification();
				return;
			}
		} else {
			if (!isPairUncertain && typeof currentBankBalanceInCents !== 'number') {
				showScreenAlert(
					'Registre ou carregue o saldo do banco de origem antes de registrar o saque.',
					'warn',
				);
				return;
			}
		}

		if (!isPairUncertain && requiresOverdraftReason && !(rescueDescription && rescueDescription.trim().length >= 3 && (!isSparkMode || rescueDescription.trim().length <= 500))) {
			showScreenAlert(
				isSparkMode ? 'Informe uma justificativa de 3 a 500 caracteres para deixar o banco negativo.' : 'Informe uma justificativa de pelo menos 3 caracteres para deixar o banco negativo.',
				'warn',
			);
			return;
		}

		if (!parsedRescueDate) {
			showScreenAlert('Informe uma data válida (DD/MM/AAAA).', 'error');
			return;
		}

		const currentUser = auth.currentUser;
		if (!currentUser || currentUser.uid !== personId) {
			showScreenAlert('Nenhum usuário autenticado foi identificado.', 'error');
			return;
		}

		const bankSnapshotName =
			banks.find(bank => bank.id === selectedBankId)?.name ?? 'Banco não identificado';

		const dateWithCurrentTime = mergeDateWithCurrentTime(parsedRescueDate);

		submitLockRef.current = true;
		setIsSubmitting(true);

		try {
			const handled = await submitSparkPair({ actorId: currentUser.uid, mode: 'withdrawal', fromAccountId: selectedBankId,
				amountInCents: rescueValueInCents, selectedDate: parsedRescueDate, note: rescueDescription,
				overdraftReason: rescueDescription && rescueDescription.trim().length >= 3 && rescueDescription.trim().length <= 500 ? rescueDescription : null });
			if (!mounted.current || auth.currentUser?.uid !== currentUser.uid) return;
			if (handled) {
				reloadRescueData();
				showSuccessfulRescueNotification();
				applyPostSubmitBehavior({ resetForm: resetRescueForm });
				return;
			}
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

				if (!mounted.current || auth.currentUser?.uid !== currentUser.uid) return;
				if (!result.success) {
					showScreenAlert('Não foi possível registrar o saque. Tente novamente.', 'error');
					return;
				}
			}

			if (!mounted.current || auth.currentUser?.uid !== currentUser.uid) return;
			reloadRescueData();
			showSuccessfulRescueNotification();
			applyPostSubmitBehavior({ resetForm: resetRescueForm });
		} catch (error) {
			if (!mounted.current || auth.currentUser?.uid !== currentUser.uid) return;
			console.error('Erro ao registrar saque em dinheiro:', error);
			showScreenAlert(error instanceof Error ? error.message : 'Erro inesperado ao registrar o saque.', 'error');
		} finally {
			submitLockRef.current = false;
			if (mounted.current) setIsSubmitting(false);
		}
	}, [
		personId, isSubmitDisabled, reloadRescueData,
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
		resetRescueForm, submitSparkPair, isPairUncertain, isSparkMode,
	]);

	return (
		<SafeAreaView
			className="flex-1 web:w-screen"
			edges={['left', 'right', 'bottom']}
			style={{ backgroundColor: surfaceBackground }}
		>
			<StatusBar
				translucent
				backgroundColor="transparent"
				barStyle={isDarkMode ? 'light-content' : 'dark-content'}
			/>

			<View className="flex-1 web:w-screen" style={{ backgroundColor: surfaceBackground }}>
				<KeyboardAvoidingView
					behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
					keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
					className="flex-1"
				>
					<View className="flex-1 web:w-screen" style={{ backgroundColor: surfaceBackground }}>
						<View
							className={`absolute top-0 left-0 right-0 web:w-screen ${cardBackground}`}
							style={{ height: heroHeight }}
						>
							<Image
								source={LoginWallpaper}
								alt="Background da tela de saque em dinheiro"
								className="w-full h-full rounded-b-3xl absolute"
								resizeMode="cover"
							/>

							<WebScreenHero
					title="Saque em dinheiro"
					Illustration={AddRescueIllustration}
					isDarkMode={isDarkMode}
					topPadding={insets.top + 24}
				/>
						</View>

						<ScrollView
							ref={scrollViewRef}
							keyboardShouldPersistTaps="handled"
							keyboardDismissMode="on-drag"
										className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1 ${webDashboardClassNames.webSheet}`}
							style={{ marginTop: heroHeight - 64 }}
							contentContainerStyle={{ paddingBottom: Math.max(32, contentBottomPadding - 108) }}
							onScroll={handleScroll}
							scrollEventThrottle={scrollEventThrottle}
						>
									<VStack className={`justify-between mt-4 ${webDashboardClassNames.webContentFrame} ${webDashboardClassNames.webContentPadding}`}>
								<MovementFormStatus loading={isLoadingBanks || isLoadingBankBalance} error={rescueDataError} onRetry={reloadRescueData} />
								{needsBank ? <VStack className="mb-4 gap-2"><Text className={helperText}>Cadastre um banco ativo para registrar o saque.</Text><Button variant="outline" onPress={reloadRescueData}><ButtonText>Atualizar bancos</ButtonText></Button></VStack> : null}
								{isPairUncertain ? <Text className="mb-4 text-warning-600 dark:text-warning-400" accessibilityRole="alert">O saque anterior ainda precisa ser confirmado. Reenvie os mesmos dados; os campos ficam bloqueados até a confirmação.</Text> : null}
								<VStack className="mb-4">
									<Text className={LUMUS_FORM_CLASS_NAMES.label}>Banco de origem</Text>
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
										triggerClassName={cn(fieldBankContainerClassName, 'relative z-10')}
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
									{selectedBankId && (
										<BankBalanceAttachedPanel>
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
											{!isLoadingBankBalance && typeof currentBankBalanceInCents !== 'number' && (
												<Text className="text-sm text-amber-600 dark:text-amber-400 text-center">
													{(financialLedgerContext || isSparkMode)
														? 'Não foi possível verificar o saldo materializado desta conta.'
														: 'Não foi possível confirmar o saldo do banco. Tente carregar novamente.'}
												</Text>
											)}
										</BankBalanceAttachedPanel>
									)}
								</VStack>

								<VStack className="mb-4">
									<Text className={LUMUS_FORM_CLASS_NAMES.label}>Valor do saque</Text>
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
									<Text className={LUMUS_FORM_CLASS_NAMES.label}>Data do saque</Text>
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
									<Text className={LUMUS_FORM_CLASS_NAMES.label}>Observações</Text>
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
									{requiresOverdraftReason && !isPairUncertain ? <Text className="mt-2 text-sm text-warning-600 dark:text-warning-400" accessibilityLiveRegion="polite">{isSparkMode ? 'Este saque deixa o banco negativo. Informe uma justificativa de 3 a 500 caracteres nas observações.' : 'Este saque deixa o banco negativo. Justifique nas observações (mínimo de 3 caracteres).'}</Text> : null}
								</VStack>

								<Button
									className={`${submitButtonClassName} web:mt-2 web:h-12`}
									onPress={handleSubmit}
									isDisabled={isSubmitDisabled}
								>
									{isSubmitting ? <ButtonSpinner /> : <ButtonText>{isPairUncertain ? 'Confirmar saque anterior' : 'Registrar saque'}</ButtonText>}
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
