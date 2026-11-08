import { showFeatureUnavailable } from '@/components/app/feature-unavailable';

import { toFinancialCivilDate } from '@/utils/financialCivilDate';
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

import { Button,ButtonSpinner,ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import { Input,InputField } from '@/components/ui/input';
import { Popover,PopoverBackdrop,PopoverBody,PopoverContent } from '@/components/ui/popover';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';

import BankActionsheetSelector,{ type BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';
import BankCurrentBalanceAttachedPanel from '@/components/uiverse/banks/bank-current-balance-attached-panel';
import Navigator from '@/components/uiverse/navigation/navigator';
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { Info } from 'lucide-react-native';

import { ScreenDismissKeyboard } from '@/components/uiverse/shared/screen-dismiss-keyboard';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { cn } from '@/lib/utils';
import AddRegisterMonthlyBalanceScreenIllustration from '../../assets/UnDraw/addRegisterMonthlyBalanceScreen.svg';

const formatCurrencyBRL = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format((valueInCents ?? 0) / 100);

const formatMonthReference = (date: Date) => {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const year = String(date.getFullYear());
	return `${month}/${year}`;
};

const sanitizeMonthInput = (value: string) => value.replace(/\D/g, '').slice(0, 6);

const formatMonthInput = (value: string) => {
	if (value.length <= 2) {
		return value;
	}

	return `${value.slice(0, 2)}/${value.slice(2)}`;
};

const parseMonthReference = (value: string) => {
	const [monthStr, yearStr] = value.split('/');
	const month = Number(monthStr);
	const year = Number(yearStr);

	if (
		Number.isNaN(month) ||
		Number.isNaN(year) ||
		month < 1 ||
		month > 12 ||
		year < 1900
	) {
		return null;
	}

	return { month, year };
};

type OptionItem = {
	id: string;
	name: string;
	iconKey?: string | null;
	colorHex?: string | null;
};

type FocusableInputKey = 'month-reference' | 'balance';

export default function AddRegisterMonthlyBalanceScreen() {
	const {
		webDashboardClassNames,
		webExpenseClassNames,
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

	} = useScreenStyles();

	const [banks] = React.useState<OptionItem[]>([]);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);
	const [isLoadingBanks] = React.useState(false);

	const [monthReference, setMonthReference] = React.useState(() => formatMonthReference(toFinancialCivilDate(new Date())));
	const [balanceDisplay, setBalanceDisplay] = React.useState('');

	const [balanceValueInCents, setBalanceValueInCents] = React.useState<number | null>(null);

	const [existingBalanceId, setExistingBalanceId] = React.useState<string | null>(null);
	const [isLoadingExisting, setIsLoadingExisting] = React.useState(false);
	const [balanceRefreshKey] = React.useReducer(value => value + 1, 0);
	const lookupRequestRef = React.useRef(0);
	const [isSubmitting] = React.useState(false);
	const monthlyFocused = React.useRef(false);
	useFocusEffect(React.useCallback(() => { monthlyFocused.current = true; return () => { monthlyFocused.current = false; }; }, []));

	const balanceInputValue = React.useMemo(
		() =>
			balanceDisplay
				? balanceDisplay
				: balanceValueInCents !== null
					? formatCurrencyBRL(balanceValueInCents)
					: '',
		[balanceDisplay, balanceValueInCents],
	);

	const monthReferenceInputRef = React.useRef<TextInput | null>(null);
	const balanceInputRef = React.useRef<TextInput | null>(null);

	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => (key === 'balance' ? 140 : 120),
		[],
	);

	const getInputRef = React.useCallback(
		(key: FocusableInputKey) => {
			switch (key) {
				case 'month-reference':
					return monthReferenceInputRef;
				case 'balance':
					return balanceInputRef;
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

	const handleBalanceChange = React.useCallback((input: string) => {
		const digitsOnly = input.replace(/\D/g, '');
		if (!digitsOnly) {
			setBalanceDisplay('');
			setBalanceValueInCents(null);
			return;
		}

		const centsValue = Number.parseInt(digitsOnly, 10) * (input.includes('-') ? -1 : 1);
		setBalanceDisplay(formatCurrencyBRL(centsValue));
		setBalanceValueInCents(centsValue);
	}, []);

	const handleMonthChange = React.useCallback(
		(value: string) => {
			const sanitized = sanitizeMonthInput(value);
			const formatted = formatMonthInput(sanitized);
			setMonthReference(formatted);
			lookupRequestRef.current += 1;
			setIsLoadingExisting(false);
			setBalanceDisplay('');
			setBalanceValueInCents(null);
			setExistingBalanceId(null);
		},
		[],
	);

	const handleSubmit = React.useCallback(async () => { showFeatureUnavailable(); }, []);

	const hasValidMonthReference = parseMonthReference(monthReference) !== null;
	const selectedBankLabel = React.useMemo(
		() => banks.find(bank => bank.id === selectedBankId)?.name ?? null,
		[banks, selectedBankId],
	);
	const selectedBankOption = React.useMemo(
		() => banks.find(bank => bank.id === selectedBankId) ?? null,
		[banks, selectedBankId],
	);
	const isBalanceInputDisabled = !selectedBankId || !hasValidMonthReference;
	const isSaveDisabled =
		!selectedBankId ||
		!monthReference ||
		!hasValidMonthReference ||
		balanceValueInCents === null ||
		isLoadingExisting ||
		isSubmitting;
	const screenTitle = 'Saldo mensal por banco';

	return (
		<ScreenDismissKeyboard>
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
						className="flex-1"
						behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
						keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
					>
						<View className="flex-1 web:w-screen" style={{ backgroundColor: surfaceBackground }}>
							<View
								className={`absolute top-0 left-0 right-0 web:w-screen ${cardBackground}`}
								style={{ height: heroHeight }}
							>
								<Image
									source={LoginWallpaper}
									alt="Background da tela de saldo mensal"
									className="w-full h-full rounded-b-3xl absolute"
									resizeMode="cover"
								/>

								<WebScreenHero
									title={screenTitle}
									Illustration={AddRegisterMonthlyBalanceScreenIllustration}
									isDarkMode={isDarkMode}
									topPadding={insets.top + 24}
								/>
							</View>

							<ScrollView
								ref={scrollViewRef}
								keyboardShouldPersistTaps="handled"
								keyboardDismissMode="on-drag"
								className={`${webDashboardClassNames.sheet} ${cardBackground} web:relative web:z-[3]`}
								style={{ marginTop: heroHeight - 64 }}
								contentContainerStyle={{
									paddingBottom: Math.max(32, contentBottomPadding - 108),
								}}
								onScroll={handleScroll}
								scrollEventThrottle={scrollEventThrottle}
							>
								<VStack className={`${webDashboardClassNames.contentFrame} ${webDashboardClassNames.contentPadding} justify-between mt-4`}>
									<VStack className="mb-4">

										<HStack className={`${webExpenseClassNames.sectionLabel} mb-2`}>
											<Text className={`${webExpenseClassNames.fieldInlineLabel} ${bodyText}`}>Banco</Text>
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
												accessibilityLabel="Informações sobre o banco do saldo mensal"
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
															Selecione o banco para o qual deseja registrar o saldo mensal.
															Esse saldo representa o valor disponível no início do mês, sendo a base dos calculos com despesas e ganhos.
														</Text>
													</PopoverBody>
												</PopoverContent>
											</Popover>
										</HStack>

										<BankActionsheetSelector
											options={banks}
											selectedId={selectedBankId}
											selectedLabel={selectedBankLabel}
											selectedOption={selectedBankOption}
											onSelect={(bank: BankActionsheetOption) => {
												if (bank.id === selectedBankId) return;
												lookupRequestRef.current += 1;
												setSelectedBankId(bank.id);
												setIsLoadingExisting(false);
												setBalanceDisplay('');
												setBalanceValueInCents(null);
												setExistingBalanceId(null);
											}}
											isDisabled={isLoadingBanks || banks.length === 0}
											isDarkMode={isDarkMode}
											bodyTextClassName={bodyText}
											helperTextClassName={helperText}
											triggerClassName={cn(fieldBankContainerClassName, 'relative z-10')}
											placeholder="Selecione o banco vinculado"
											sheetTitle="Escolha o banco do saldo mensal"
											emptyMessage="Nenhum banco disponível."
											triggerHint="Selecione o banco para registrar o saldo."
											disabledHint={
												isLoadingBanks
													? 'Carregando bancos disponíveis...'
													: 'Cadastre um banco para registrar o saldo.'
											}
											accessibilityLabel="Selecionar banco do saldo mensal"
										/>
										{selectedBankId && (
											<BankCurrentBalanceAttachedPanel
												key={`${selectedBankId}:${balanceRefreshKey}`}
												bankId={selectedBankId}
											/>
										)}
									</VStack>

									<VStack className="mb-4">
										<HStack className={`${webExpenseClassNames.sectionLabel} mb-2`}>
											<Text className={`${webExpenseClassNames.fieldInlineLabel} ${bodyText}`}>Mês de referência</Text>
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
												accessibilityLabel="Informações sobre o mês de referência"
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
															Informe o mês e ano de referência para o saldo mensal. O formato deve ser MM/AAAA (ex: 08/2024).
															Esse campo determina o período para o qual o saldo será registrado, e deve ser preenchido corretamente para garantir que o saldo seja associado ao mês correto.
														</Text>
													</PopoverBody>
												</PopoverContent>
											</Popover>
										</HStack>
										<Input className={`${fieldContainerClassName} ${webExpenseClassNames.fieldInput}`}>
											<InputField
												ref={monthReferenceInputRef as any}
												placeholder="MM/AAAA"
												accessibilityLabel="Mês de referência, formato MM/AAAA"
												value={monthReference}
												onChangeText={handleMonthChange}
												keyboardType="numeric"
												autoCapitalize="none"
												autoCorrect={false}
												returnKeyType="next"
												className={inputField}
												onFocus={() => handleInputFocus('month-reference')}
												onSubmitEditing={() => balanceInputRef.current?.focus?.()}
											/>
										</Input>
									</VStack>

									<VStack className="mb-4">
										<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>
											Novo saldo disponível
										</Text>
										<Input
											className={`${fieldContainerClassName} ${webExpenseClassNames.fieldInput}`}
											isDisabled={isBalanceInputDisabled}
										>
											<InputField
												ref={balanceInputRef as any}
												placeholder="Digite o novo saldo disponível"
												accessibilityLabel="Novo saldo disponível para o mês de referência"
												value={balanceInputValue}
												onChangeText={handleBalanceChange}
												keyboardType="numeric"
												autoCapitalize="none"
												autoCorrect={false}
												className={inputField}
												editable={!isBalanceInputDisabled}
												onFocus={() => handleInputFocus('balance')}
											/>
										</Input>
									</VStack>

									{null}
                            {null}
                            {null}
                            {false}
                            <Button
										className={`${submitButtonClassName} web:mt-2 web:h-12`}
										size="md"
										onPress={handleSubmit}
                                accessibilityLabel={'Preparar ou salvar abertura mensal'}
										isDisabled={isSaveDisabled}
									>
										{isSubmitting ? (
											<>
												<ButtonSpinner />
												<ButtonText>
													{existingBalanceId ? 'Atualizando saldo' : 'Salvando saldo'}
												</ButtonText>
											</>
										) : (
											<ButtonText>
												{existingBalanceId ? 'Atualizar saldo' : 'Registrar saldo'}
											</ButtonText>
										)}
									</Button>
								</VStack>
							</ScrollView>
						</View>
					</KeyboardAvoidingView>

					<View
						style={{
							marginHorizontal: 0,
							paddingBottom: 0,
							flexShrink: 0,
						}}
					>
						<Navigator defaultValue={1} />
					</View>
				</View>
			</SafeAreaView>
		</ScreenDismissKeyboard>
	);
}
