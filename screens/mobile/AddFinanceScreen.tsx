import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import MovementFormStatus from '@/components/uiverse/transactions/movement-form-status';
import { useBankMovementsRequest } from '@/hooks/useBankMovementsRequest';
import { useTransferFormData } from '@/hooks/useTransferFormData';

import { useFocusEffect } from 'expo-router';
import React from 'react';
import {
KeyboardAvoidingView,
Platform,
Pressable,
ScrollView,
StatusBar,
TextInput,
View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Box } from '@/components/ui/box';
import { Button,ButtonSpinner,ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import { Input,InputField } from '@/components/ui/input';
import {
Popover,
PopoverBackdrop,
PopoverBody,
PopoverContent,
} from '@/components/ui/popover';
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
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';

import BankActionsheetSelector from '@/components/uiverse/banks/bank-actionsheet-selector';
import Navigator from '@/components/uiverse/navigation/navigator';

import AddFinancialIllustration from '../../assets/UnDraw/addFinancialScreen.svg';

import { RedemptionTerm,redemptionTermLabels } from '@/utils/finance';
import { parsePercentageToBasisPoints } from '@/utils/investmentPortfolio';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import DatePickerField from '@/components/uiverse/shared/date-picker';
import { LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { APP_ROUTE_PATHS,navigateToHomeDashboard,navigateToRoute } from '@/utils/navigation';
import { Info } from 'lucide-react-native';

// Lista fixa com todas as opções de prazo descritas na solicitação.
const redemptionOptions: { value: RedemptionTerm; label: string }[] = [
	{ value: 'anytime', label: redemptionTermLabels.anytime },
	{ value: '1m', label: redemptionTermLabels['1m'] },
	{ value: '3m', label: redemptionTermLabels['3m'] },
	{ value: '6m', label: redemptionTermLabels['6m'] },
	{ value: '1y', label: redemptionTermLabels['1y'] },
	{ value: '2y', label: redemptionTermLabels['2y'] },
	{ value: '3y', label: redemptionTermLabels['3y'] },
];

const sanitizeNumberInput = (value: string) => value.replace(/[^\d.,]/g, '');

const formatDateToBR = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${day}/${month}/${year}`;
};

const parseDateFromBR = (value: string) => {
	const [day, month, year] = value.split('/');
	if (!day || !month || !year) {
		return null;
	}

	const dayNumber = Number(day);
	const monthNumber = Number(month);
	const yearNumber = Number(year);

	if (
		Number.isNaN(dayNumber) ||
		Number.isNaN(monthNumber) ||
		Number.isNaN(yearNumber) ||
		dayNumber <= 0 ||
		monthNumber <= 0 ||
		monthNumber > 12 ||
		yearNumber < 1900
	) {
		return null;
	}

	const dateInstance = new Date(yearNumber, monthNumber - 1, dayNumber);

	if (
		dateInstance.getDate() !== dayNumber ||
		dateInstance.getMonth() + 1 !== monthNumber ||
		dateInstance.getFullYear() !== yearNumber
	) {
		return null;
	}

	return dateInstance;
};

type FocusableInputKey = 'investment-name' | 'initial-value' | 'cdi';

const formatCurrencyBRL = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(valueInCents / 100);

export default function AddFinanceScreen() {

	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		fieldBankContainerClassName,
		fieldContainerClassName,
		submitButtonClassName,
		heroHeight,
		infoCardStyle,
		insets,
		compactCardClassName,
		notTintedCardClassName,
		webDashboardClassNames,
	} = useScreenStyles();
	// Estado para guardar o nome do investimento que o usuário está digitando.
	const [investmentName, setInvestmentName] = React.useState('');
	// Guardamos o valor inicial como string formatada e em centavos.
	const [initialValueInput, setInitialValueInput] = React.useState('');
	const [initialValueInCents, setInitialValueInCents] = React.useState<number | null>(null);
	// Guardamos o percentual do CDI informado pelo usuário.
	const [cdiInput, setCdiInput] = React.useState('');
	// Data informada para o investimento, sempre no formato brasileiro.
	const [investmentDate, setInvestmentDate] = React.useState(formatDateToBR(new Date()));
	// Estado que guarda o prazo selecionado dentre as opções fixas.
	const [selectedRedemptionTerm, setSelectedRedemptionTerm] = React.useState<RedemptionTerm>('anytime');
	// Flag simples para saber se estamos salvando e evitar envio duplicado.
	const [isSaving, setIsSaving] = React.useState(false);
	// Flag que exibimos depois de um salvamento bem sucedido para mostrar o texto de confirmação.
	const [hasSavedOnce, setHasSavedOnce] = React.useState(false);
	const submitLockRef = React.useRef<object | null>(null);
	React.useEffect(() => () => { submitLockRef.current = null; }, []);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);
	const bankData = useTransferFormData(selectedBankId, null);
	const { banks: bankOptions, isLoadingBanks, originBalanceInCents: currentBankBalanceInCents, isLoadingBalance: isLoadingBankBalance, reload: loadBanks } = bankData;
	const { personId, cancelRequest: cancelSubmit } = useBankMovementsRequest('investment-create');
	const [submitError, setSubmitError] = React.useState<string | null>(null);

	const investmentNameInputRef = React.useRef<import('react').ComponentRef<typeof TextInput> | null>(null);
	const initialValueInputRef = React.useRef<import('react').ComponentRef<typeof TextInput> | null>(null);
	const cdiInputRef = React.useRef<import('react').ComponentRef<typeof TextInput> | null>(null);
	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => (key === 'cdi' ? 140 : 120),
		[],
	);

	// Feedback in-app unificado conforme [[Notificações]].

	const handleInitialValueChange = React.useCallback((value: string) => {
		const digitsOnly = value.replace(/\D/g, '');
		if (!digitsOnly) {
			setInitialValueInput('');
			setInitialValueInCents(null);
			setHasSavedOnce(false);
			return;
		}

		const centsValue = parseInt(digitsOnly, 10);
		setInitialValueInCents(centsValue);
		setInitialValueInput(formatCurrencyBRL(centsValue));
		setHasSavedOnce(false);
	}, []);

	const getInputRef = React.useCallback(
		(key: FocusableInputKey) => {
			switch (key) {
				case 'investment-name':
					return investmentNameInputRef;
				case 'initial-value':
					return initialValueInputRef;
				case 'cdi':
					return cdiInputRef;
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
	const parsedInvestmentDate = React.useMemo(() => parseDateFromBR(investmentDate), [investmentDate]);
	const parsedCdiInBasisPoints = React.useMemo(
		() => parsePercentageToBasisPoints(cdiInput),
		[cdiInput],
	);
	const hasInvestmentName = investmentName.trim().length > 0;
	const hasInitialValue = typeof initialValueInCents === 'number' && Number.isSafeInteger(initialValueInCents) && initialValueInCents > 0;
	const hasValidInvestmentDate = Boolean(parsedInvestmentDate);
	const hasValidCdi =
		typeof parsedCdiInBasisPoints === 'number' && parsedCdiInBasisPoints > 0;
	const isFormBusy = isSaving || isLoadingBanks;
	const isInitialValueDisabled = !hasInvestmentName || isFormBusy;
	const isInvestmentDateDisabled = !hasInvestmentName || !hasInitialValue || isFormBusy;
	const isCdiDisabled = !hasInvestmentName || !hasInitialValue || !hasValidInvestmentDate || isFormBusy;
	const isRedemptionTermDisabled =
		!hasInvestmentName || !hasInitialValue || !hasValidInvestmentDate || !hasValidCdi || isFormBusy;
	const isBankSelectionDisabled =
		isLoadingBanks ||
		bankOptions.length === 0 ||
		!hasInvestmentName ||
		!hasInitialValue ||
		!hasValidInvestmentDate ||
		!hasValidCdi ||
		isFormBusy;
	const hasValidBalance = React.useMemo(() => {
		const initialCents = typeof initialValueInCents === 'number' ? initialValueInCents : 0;
		if (initialCents <= 0) {
			return false;
		}

		if (selectedBankId && isLoadingBankBalance) {
			return false;
		}

		if (typeof currentBankBalanceInCents === 'number') {
			return currentBankBalanceInCents >= 0 && initialCents <= currentBankBalanceInCents;
		}

		return false;
	}, [currentBankBalanceInCents, initialValueInCents, isLoadingBankBalance, selectedBankId]);

	// Segue [[Investimentos]]: a tela libera cada etapa do cadastro apenas quando a anterior estiver válida.

	const bankSelectionHelperMessage = React.useMemo(() => {
 if (bankData.banksError) return bankData.banksError;
		if (isFormBusy) {
			return 'Aguarde a conclusao da operacao atual.';
		}

		if (isLoadingBanks) {
			return 'Carregando bancos disponiveis...';
		}

		if (bankOptions.length === 0) {
			return 'Cadastre um banco para vincular o investimento.';
		}

		if (isBankSelectionDisabled) {
			return 'Preencha nome, valor, data e CDI para liberar a escolha do banco.';
		}

		return 'Escolha o banco de onde saira o aporte inicial.';
	}, [bankOptions.length, isBankSelectionDisabled, bankData.banksError, isFormBusy, isLoadingBanks]);

	// Verificamos se todos os campos obrigatorios foram preenchidos e se o saldo do banco ja foi validado.
	const isFormValid = React.useMemo(() => {
		const initialCents = typeof initialValueInCents === 'number' ? initialValueInCents : 0;
		return (
			hasInvestmentName &&
			initialCents > 0 &&
			hasValidCdi &&
			Boolean(selectedBankId) &&
			hasValidInvestmentDate &&
			hasValidBalance
		);
	}, [hasInvestmentName, initialValueInCents, hasValidCdi, selectedBankId, hasValidInvestmentDate, hasValidBalance]);

	// Função utilitária para limpar o formulário após o salvamento.
	const resetForm = React.useCallback(() => {
setInvestmentName('');
setInitialValueInput('');
setInitialValueInCents(null);
setCdiInput('');
setInvestmentDate(formatDateToBR(new Date()));
setSelectedRedemptionTerm('anytime');
setSelectedBankId(null);
setSubmitError(null);
}, []);

	useFocusEffect(React.useCallback(() => { loadBanks(); return cancelSubmit; }, [loadBanks, cancelSubmit]));
	React.useEffect(() => { submitLockRef.current = null; setIsSaving(false); resetForm(); setHasSavedOnce(false); setSubmitError(null); }, [personId, resetForm]);

	const handleBackToHome = React.useCallback(() => {
		navigateToHomeDashboard();
		return true;
	}, []);

	const handleDateSelect = React.useCallback((formatted: string) => {
		setInvestmentDate(formatted);
		setHasSavedOnce(false);
	}, []);

	const handleSaveInvestment = React.useCallback(async () => { showFeatureUnavailable(); }, []);

	const selectedBankLabel = selectedBankId ? bankOptions.find(bank => bank.id === selectedBankId)?.name ?? '' : '';
	const selectedBankOption = selectedBankId
		? bankOptions.find(bank => bank.id === selectedBankId) ?? null
		: null;
	const bankBalanceDisplayValue = !selectedBankId
		? 'Selecione um banco para visualizar o saldo'
		: isLoadingBankBalance
			? 'Carregando saldo atual do banco...'
			: typeof currentBankBalanceInCents === 'number'
				? formatCurrencyBRL(currentBankBalanceInCents)
				: 'Saldo indisponível';
	const renderFieldLabelWithPopover = (
		label: string,
		accessibilityLabel: string,
		description: string,
	) => (
		<HStack className="mb-2 ml-1 items-center gap-2">
			<Text className={LUMUS_FORM_CLASS_NAMES.inlineLabel}>{label}</Text>
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
						accessibilityLabel={accessibilityLabel}
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
						<Text className={`${bodyText} text-xs leading-5`}>{description}</Text>
					</PopoverBody>
				</PopoverContent>
			</Popover>
		</HStack>
	);

	return (
		<SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<KeyboardAvoidingView
					behavior={Platform.OS === 'ios' ? 'padding' : undefined}
					className="flex-1 w-full"
				>
					<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
						<View className={`absolute top-0 left-0 right-0 ${cardBackground}`} style={{ height: heroHeight }}>
							<Image
								source={LoginWallpaper}
								alt="Background da tela de investimento"
								className="w-full h-full rounded-b-3xl absolute"
								resizeMode="cover"
							/>

							<VStack
								className="w-full h-full items-center justify-start px-6 gap-4"
								style={{ paddingTop: insets.top + 24 }}
							>
								<Heading size="xl" className="text-white text-center">
									Registrar investimento
								</Heading>
								<AddFinancialIllustration width="40%" height="40%" className="opacity-90" />
							</VStack>
						</View>

						<ScrollView
							ref={scrollViewRef}
							keyboardShouldPersistTaps="handled"
							keyboardDismissMode="interactive"
							className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1 ${webDashboardClassNames.webSheet}`}
							style={{ marginTop: heroHeight - 64 }}
							contentContainerStyle={{ paddingBottom: contentBottomPadding }}
							onScroll={handleScroll}
							scrollEventThrottle={scrollEventThrottle}
						>
							<VStack className={`justify-between ${webDashboardClassNames.webContentFrame} ${webDashboardClassNames.webContentPadding}`}>
								<VStack className="mt-4 gap-4">
									<VStack className="gap-2">
										<MovementFormStatus loading={isLoadingBanks || isLoadingBankBalance} error={bankData.error} onRetry={loadBanks} />
										{!isLoadingBanks && !bankData.banksError && bankOptions.length === 0 ? <Text className={helperText}>Cadastre um banco para registrar investimentos.</Text> : null}
										{submitError ? <Text className="text-error-600 dark:text-error-400" accessibilityRole="alert">{submitError}</Text> : null}
										{null}
										{renderFieldLabelWithPopover(
											'Nome do investimento',
											'Informações sobre o nome do investimento',
											'Use um nome fácil de identificar na lista, combinando o tipo do produto com a instituição, como "CDB Banco X".',
										)}
										<Input className={fieldContainerClassName} isDisabled={isFormBusy}>
											<InputField
												ref={investmentNameInputRef}
												value={investmentName}
												onChangeText={text => {
													setInvestmentName(text);
													setHasSavedOnce(false);
												}}
												placeholder="Ex: CDB Banco X"
												autoCapitalize="sentences"
												returnKeyType="next"
												className={inputField}
												onFocus={() => handleInputFocus('investment-name')}
												onSubmitEditing={() => initialValueInputRef.current?.focus?.()}
											/>
										</Input>
									</VStack>

									<VStack className="gap-2">
										{renderFieldLabelWithPopover(
											'Valor inicial investido',
											'Informações sobre o valor inicial investido',
											'O valor informado representa o aporte inicial do investimento. Ele sai do banco selecionado e vira a base do cadastro.',
										)}
										<Input className={fieldContainerClassName} isDisabled={isInitialValueDisabled}>
											<InputField
												ref={initialValueInputRef}
												value={initialValueInput}
												onChangeText={handleInitialValueChange}
												placeholder="Ex: R$ 1.500,00"
												keyboardType="numeric"
												className={inputField}
												onFocus={() => handleInputFocus('initial-value')}
												returnKeyType="done"
											/>
										</Input>
									</VStack>

									<VStack className="gap-2">
										{renderFieldLabelWithPopover(
											'Dia do investimento',
											'Informações sobre a data do investimento',
											'Essa data marca o início do investimento e serve de referência para o acompanhamento e para os cálculos do período.',
										)}
										<DatePickerField
											accessibilityLabel="Selecionar dia do investimento"
											value={investmentDate}
											onChange={formatted => handleDateSelect(formatted)}
											triggerClassName={fieldContainerClassName}
											inputClassName={inputField}
											isDisabled={isInvestmentDateDisabled}
										/>
									</VStack>

									<VStack className="gap-2">
										{renderFieldLabelWithPopover(
											'CDI (%)',
											'Informações sobre o CDI do investimento',
											'Informe o percentual contratado em relação ao CDI. Exemplo: 100 equivale a 100% do CDI e 110 equivale a 110% do CDI.',
										)}
										<Input className={fieldContainerClassName} isDisabled={isCdiDisabled}>
											<InputField
												ref={cdiInputRef}
												value={cdiInput}
												onChangeText={text => {
													setCdiInput(sanitizeNumberInput(text));
													setHasSavedOnce(false);
												}}
												placeholder="Ex: 110"
												keyboardType="decimal-pad"
												className={inputField}
												onFocus={() => handleInputFocus('cdi')}
												returnKeyType="done"
											/>
										</Input>
									</VStack>

									<VStack className="gap-2">
										{renderFieldLabelWithPopover(
											'Prazo para resgate',
											'Informações sobre o prazo para resgate',
											'Escolha a liquidez estimada do investimento, ou seja, em quanto tempo o valor costuma ficar disponível após pedir o resgate.',
										)}
										<Select
											selectedValue={selectedRedemptionTerm}
											onValueChange={value => {
												setSelectedRedemptionTerm(value as RedemptionTerm);
												setHasSavedOnce(false);
											}}
											isDisabled={isRedemptionTermDisabled}
										>
											<SelectTrigger variant="outline" size="md" className={fieldContainerClassName}>
												<SelectInput
													placeholder="Escolha uma opção"
													value={redemptionTermLabels[selectedRedemptionTerm]}
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
													{redemptionOptions.map(option => (
														<SelectItem key={option.value} label={option.label} value={option.value} />
													))}
												</SelectContent>
											</SelectPortal>
										</Select>
									</VStack>

									<VStack className="gap-2">
										{renderFieldLabelWithPopover(
											'Banco vinculado',
											'Informações sobre o banco vinculado ao investimento',
											'Selecione o banco de origem do aporte inicial. O sistema consulta o saldo atual dessa conta antes de liberar o salvamento.',
										)}
										<BankActionsheetSelector
											options={bankOptions}
											selectedId={selectedBankId}
											selectedLabel={selectedBankLabel}
											selectedOption={selectedBankOption}
											onSelect={bank => {
												setSelectedBankId(bank.id);
												setHasSavedOnce(false);
											}}
											isDisabled={isBankSelectionDisabled}
											isDarkMode={isDarkMode}
											bodyTextClassName={bodyText}
											helperTextClassName={helperText}
											triggerClassName={fieldBankContainerClassName}
											placeholder={isLoadingBanks ? 'Carregando bancos disponíveis...' : 'Selecione o banco do investimento'}
											sheetTitle="Escolha o banco do investimento"
											emptyMessage="Nenhum banco disponível."
											triggerHint={bankSelectionHelperMessage}
											disabledHint={bankSelectionHelperMessage}
											accessibilityLabel="Selecionar banco do investimento"
										/>
									</VStack>

									<Box className={`${notTintedCardClassName} px-4 py-4`}>
										<VStack className="gap-2">
											{renderFieldLabelWithPopover(
												'Saldo disponível do banco',
												'Informações sobre o saldo disponível do banco',
												'Esse saldo é usado para validar se existe valor suficiente para o aporte inicial. Se ele estiver indisponível ou negativo, o envio fica bloqueado.',
											)}
											<Input className={fieldContainerClassName} isDisabled>
												<InputField value={bankBalanceDisplayValue} className={inputField} />
											</Input>
										</VStack>
									</Box>

									<Button className={submitButtonClassName} onPress={handleSaveInvestment} isDisabled={isSaving || ((!isFormValid || Boolean(bankData.error) || isLoadingBanks))}>
										{isSaving ? (
											<>
												<ButtonSpinner />
												<ButtonText>Salvando</ButtonText>
											</>
										) : (
											<ButtonText>{'Salvar investimento'}</ButtonText>
										)}
									</Button>

									{hasSavedOnce ? (
										<Box className={`${compactCardClassName} px-4 py-4`}>
											<HStack className="items-center justify-between gap-3">
												<Text className="flex-1 text-sm text-emerald-600 dark:text-emerald-400">
													Pronto. O investimento já está disponível na lista dedicada.
												</Text>
												<Button variant="link" action="primary" onPress={() => navigateToRoute(APP_ROUTE_PATHS.financialList)}>
													<ButtonText>Ver lista</ButtonText>
												</Button>
											</HStack>
										</Box>
									) : null}
								</VStack>
							</VStack>
						</ScrollView>
					</View>
				</KeyboardAvoidingView>

				<View style={{ marginHorizontal: -18, paddingBottom: 0, flexShrink: 0 }}>
					<Navigator defaultValue={1} onHardwareBack={handleBackToHome} />
				</View>
			</View>
		</SafeAreaView>
	);
}
