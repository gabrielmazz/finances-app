import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import { useFocusEffect } from 'expo-router';
import React from 'react';
import {
BackHandler,
KeyboardAvoidingView,
Platform,
Pressable,
ScrollView,
StatusBar,
TextInput,
View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button,ButtonSpinner,ButtonText } from '@/components/ui/button';
import { Image } from '@/components/ui/image';
import { Input,InputField } from '@/components/ui/input';
import { Popover,PopoverBackdrop,PopoverBody,PopoverContent } from '@/components/ui/popover';
import { Text } from '@/components/ui/text';
import { Textarea,TextareaInput } from '@/components/ui/textarea';
import { VStack } from '@/components/ui/vstack';

import { HStack } from '@/components/ui/hstack';
import BankActionsheetSelector,{ type BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';
import BankBalanceAttachedPanel from '@/components/uiverse/banks/bank-balance-attached-panel';
import Navigator from '@/components/uiverse/navigation/navigator';
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';
import { navigateToHomeDashboard } from '@/utils/navigation';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import DatePickerField from '@/components/uiverse/shared/date-picker';

import TransferIllustration from '../../assets/UnDraw/transferScreen.svg';

import { Info } from 'lucide-react-native';

import { LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { cn } from '@/lib/utils';

import MovementFormStatus from '@/components/uiverse/transactions/movement-form-status';
import { useTransferFormData } from '@/hooks/useTransferFormData';
import { toFinancialCivilDate } from '@/utils/financialCivilDate';

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

export default function TransferScreen() {

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
		infoCardStyle,
		insets,
		webDashboardClassNames
	} = useScreenStyles();

	const [selectedSourceBankId, setSelectedSourceBankId] = React.useState<string | null>(null);
	const [selectedTargetBankId, setSelectedTargetBankId] = React.useState<string | null>(null);
	const [transferValueDisplay, setTransferValueDisplay] = React.useState('');
	const [transferValueInCents, setTransferValueInCents] = React.useState<number | null>(null);
	const [transferDate, setTransferDate] = React.useState(formatDateToBR(toFinancialCivilDate(new Date())));
	const [transferDescription, setTransferDescription] = React.useState<string | null>(null);
	const [isSubmitting] = React.useState(false);
	const { personId, banks, isLoadingBanks, banksError, originBalanceInCents, isLoadingBalance,
		targetBalanceInCents, isLoadingTargetBalance, error: transferDataError, needsBanks, reload: reloadTransferData } = useTransferFormData(selectedSourceBankId, selectedTargetBankId);
	const mounted = React.useRef(true);
	React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
	const transferValueInputRef = React.useRef<TextInput | null>(null);
	const transferDescriptionInputRef = React.useRef<TextInput | null>(null);

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

	const resetTransferForm = React.useCallback(() => {
setSelectedSourceBankId(null);
setSelectedTargetBankId(null);
setTransferValueDisplay('');
setTransferValueInCents(null);
setTransferDate(formatDateToBR(toFinancialCivilDate(new Date())));
setTransferDescription(null);
}, []);

	React.useEffect(() => { resetTransferForm(); }, [personId, resetTransferForm]);

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
	const selectedSourceBankLabel = React.useMemo(
		() => banks.find(bank => bank.id === selectedSourceBankId)?.name ?? null,
		[banks, selectedSourceBankId],
	);
	const selectedTargetBankLabel = React.useMemo(
		() => banks.find(bank => bank.id === selectedTargetBankId)?.name ?? null,
		[banks, selectedTargetBankId],
	);
	const selectedSourceBankOption = React.useMemo(
		() => banks.find(bank => bank.id === selectedSourceBankId) ?? null,
		[banks, selectedSourceBankId],
	);
	const selectedTargetBankOption = React.useMemo(
		() => banks.find(bank => bank.id === selectedTargetBankId) ?? null,
		[banks, selectedTargetBankId],
	);
	const hasTransferValue = transferValueInCents !== null && Number.isSafeInteger(transferValueInCents) && transferValueInCents > 0;
	const isFormLocked = isSubmitting || false || isLoadingBanks || Boolean(banksError);
	const isSourceBankDisabled = isFormLocked || banks.length === 0;
	const isTargetBankDisabled =
		isFormLocked || !selectedSourceBankId || targetBankOptions.length === 0;
	const isTransferValueDisabled = isFormLocked || !selectedSourceBankId || !selectedTargetBankId;
	const isTransferDateDisabled =
		isFormLocked || !selectedSourceBankId || !selectedTargetBankId || !hasTransferValue;
	const isTransferDescriptionDisabled =
		isFormLocked ||
		!selectedSourceBankId ||
		!selectedTargetBankId ||
		!hasTransferValue ||
		!parsedTransferDate;
	const isSubmitDisabled =
		isSubmitting ||
		isLoadingBanks ||
		!selectedSourceBankId ||
		!selectedTargetBankId ||
		!hasTransferValue ||
		!parsedTransferDate ||
		((isLoadingBalance || isLoadingTargetBalance || Boolean(transferDataError) || hasUnavailableBalance || hasInsufficientBalance || isBalanceValidationUnavailable));
	const screenTitle = 'Transferência entre bancos';

	React.useEffect(() => {
		// Ao trocar banco de origem, limpamos o destino para evitar duplicidade
		setSelectedTargetBankId(null);
	}, [selectedSourceBankId]);

	const handleSubmit = React.useCallback(async () => { showFeatureUnavailable(); }, []);

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
								alt="Background da tela de transferência entre bancos"
								className="w-full h-full rounded-b-3xl absolute"
								resizeMode="cover"
							/>

							<WebScreenHero
					title={screenTitle}
					Illustration={TransferIllustration}
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
							<VStack className={`mt-4 ${webDashboardClassNames.webContentFrame} ${webDashboardClassNames.webContentPadding}`}>
								<MovementFormStatus loading={isLoadingBanks || isLoadingBalance || isLoadingTargetBalance} error={transferDataError} onRetry={reloadTransferData} />
								{needsBanks ? <VStack className="mb-4 gap-2"><Text className={helperText}>Cadastre pelo menos dois bancos ativos para transferir entre contas.</Text><Button variant="outline" onPress={reloadTransferData}><ButtonText>Atualizar bancos</ButtonText></Button></VStack> : null}
								{null}

								<HStack className="w-full flex-col gap-4 md:flex-row">

									<VStack className="mb-4 min-w-0 w-full md:w-0 md:flex-1">
										<HStack className="mb-2 ml-1 items-center gap-2">
											<Text className={LUMUS_FORM_CLASS_NAMES.inlineLabel}>Banco de Origem</Text>
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
															carregado para validar se a transferência pode ser realizada. A transferência exige saldo atual confirmado e suficiente na origem.
														</Text>
													</PopoverBody>
												</PopoverContent>
											</Popover>
										</HStack>
										<BankActionsheetSelector
											options={banks}
											selectedId={selectedSourceBankId}
											selectedLabel={selectedSourceBankLabel}
											selectedOption={selectedSourceBankOption}
											onSelect={(bank: BankActionsheetOption) => setSelectedSourceBankId(bank.id)}
											isDisabled={isSourceBankDisabled}
											isDarkMode={isDarkMode}
											bodyTextClassName={bodyText}
											helperTextClassName={helperText}
											triggerClassName={cn(fieldBankContainerClassName, 'w-full relative z-10')}
											placeholder="De onde o valor sairá"
											sheetTitle="Escolha o banco de origem"
											emptyMessage="Nenhum banco disponível."
											triggerHint="Selecione de onde o valor sairá."
											disabledHint={
												isLoadingBanks
													? 'Carregando bancos disponíveis...'
													: banks.length === 0
														? 'Cadastre um banco para transferir.'
														: 'Banco de origem indisponível.'
											}
											accessibilityLabel="Selecionar banco de origem da transferência"
										/>
										{selectedSourceBankId && (
											<BankBalanceAttachedPanel className="mx-2 px-2 md:mx-7 md:px-4">
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
												{!isLoadingBalance && typeof originBalanceInCents !== 'number' && (
													<Text className="text-sm text-amber-600 dark:text-amber-400 text-center">
														Saldo não registrado para este mês. Registre o saldo mensal para validar a transferência.
													</Text>
												)}
											</BankBalanceAttachedPanel>
										)}
									</VStack>

									<VStack className="mb-4 min-w-0 w-full md:w-0 md:flex-1">
										<Text className={LUMUS_FORM_CLASS_NAMES.label}>Banco de destino</Text>
										<BankActionsheetSelector
											options={targetBankOptions}
											selectedId={selectedTargetBankId}
											selectedLabel={selectedTargetBankLabel}
											selectedOption={selectedTargetBankOption}
											onSelect={(bank: BankActionsheetOption) => setSelectedTargetBankId(bank.id)}
											isDisabled={isTargetBankDisabled}
											isDarkMode={isDarkMode}
											bodyTextClassName={bodyText}
											helperTextClassName={helperText}
											triggerClassName={cn(fieldBankContainerClassName, 'w-full relative z-10')}
											placeholder={selectedSourceBankId ? 'Para onde o valor irá' : 'Selecione a origem'}
											sheetTitle="Escolha o banco de destino"
											emptyMessage="Nenhum banco de destino disponível."
											triggerHint="Selecione para onde o valor irá."
											disabledHint={
												!selectedSourceBankId
													? 'Selecione o banco de origem primeiro.'
													: targetBankOptions.length === 0
														? 'Nenhum banco de destino disponível.'
														: 'Banco de destino indisponível.'
											}
											accessibilityLabel="Selecionar banco de destino da transferência"
										/>
										{selectedTargetBankId && (
											<BankBalanceAttachedPanel className="mx-2 px-2 md:mx-7 md:px-4">
												{typeof targetBalanceInCents === 'number' && (
													<Text className={`${helperText} text-sm text-center`}>
														Saldo disponível no banco de destino:{' '}
														{isLoadingTargetBalance ? 'carregando...' : formatCurrencyBRL(targetBalanceInCents)}
													</Text>
												)}
												{isLoadingTargetBalance && typeof targetBalanceInCents !== 'number' && (
													<Text className={`${helperText} text-sm text-center`}>
														Carregando saldo do banco de destino...
													</Text>
												)}
												{!isLoadingTargetBalance && typeof targetBalanceInCents !== 'number' && (
													<Text className="text-sm text-amber-600 dark:text-amber-400 text-center">
														Saldo não registrado para este mês.
													</Text>
												)}
											</BankBalanceAttachedPanel>
										)}

										{selectedSourceBankId &&
											selectedTargetBankId &&
											selectedSourceBankId === selectedTargetBankId && (
												<Text className="mt-1 text-xs text-red-600 dark:text-red-400">
													Escolha bancos diferentes para completar a transferência.
												</Text>
											)}
									</VStack>
								</HStack>

								<VStack className="mb-4">
									<Text className={LUMUS_FORM_CLASS_NAMES.label}>Valor</Text>
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
									<Text className={LUMUS_FORM_CLASS_NAMES.label}>Data da transferência</Text>
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
									<Text className={LUMUS_FORM_CLASS_NAMES.label}>Descrição (opcional)</Text>
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
									className={`${submitButtonClassName} web:mt-2 web:h-12`}
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
										<ButtonText>{'Confirmar transferência'}</ButtonText>
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
