import React from 'react';
import {
	BackHandler,
	Keyboard,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StatusBar,
	TextInput,
	TouchableWithoutFeedback,
	View,
	Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';

import Navigator from '@/components/uiverse/navigator';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import BankActionsheetSelector, { type BankActionsheetOption } from '@/components/uiverse/bank-actionsheet-selector';
import { navigateToHomeDashboard } from '@/utils/navigation';

import { getAllBanksFirebase } from '@/functions/BankFirebase';
import {
	getMonthlyBalanceFirebaseRelatedToUser,
	upsertMonthlyBalanceFirebase,
} from '@/functions/MonthlyBalanceFirebase';
import { auth } from '@/FirebaseConfig';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { Info } from 'lucide-react-native';

import AddRegisterMonthlyBalanceScreenIllustration from '../assets/UnDraw/addRegisterMonthlyBalanceScreen.svg';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';

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
		labelText,

	} = useScreenStyles();

	const [banks, setBanks] = React.useState<OptionItem[]>([]);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);
	const [isLoadingBanks, setIsLoadingBanks] = React.useState(false);

	const [monthReference, setMonthReference] = React.useState(() => formatMonthReference(new Date()));
	const [balanceDisplay, setBalanceDisplay] = React.useState('');
	const [balanceValueInCents, setBalanceValueInCents] = React.useState<number | null>(null);

	const [existingBalanceId, setExistingBalanceId] = React.useState<string | null>(null);
	const [isLoadingExisting, setIsLoadingExisting] = React.useState(false);
	const [isSubmitting, setIsSubmitting] = React.useState(false);

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
	const lastLookupNotificationKeyRef = React.useRef<string | null>(null);

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

	useFocusEffect(
		React.useCallback(() => {
			let isMounted = true;

			const loadBanks = async () => {
				setIsLoadingBanks(true);

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
							iconKey: typeof bank?.iconKey === 'string' ? bank.iconKey : null,
							colorHex: typeof bank?.colorHex === 'string' ? bank.colorHex : null,
						}));

						setBanks(formattedBanks);
						setSelectedBankId(current =>
							current && formattedBanks.some(bank => bank.id === current) ? current : null,
						);
					} else {
						showNotifierAlert({
							title: 'Não foi possível carregar os bancos disponíveis.',
							description: 'Tente novamente mais tarde.',
							type: 'error',
							duration: 4000,
							isDarkMode,
						});
					}
				} catch (error) {
					console.error('Erro ao carregar bancos:', error);

					if (isMounted) {
						showNotifierAlert({
							title: 'Erro inesperado ao carregar os bancos.',
							description: 'Tente novamente mais tarde.',
							type: 'error',
							duration: 4000,
							isDarkMode,
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
		}, [isDarkMode]),
	);

	const handleBalanceChange = React.useCallback((input: string) => {
		const digitsOnly = input.replace(/\D/g, '');
		if (!digitsOnly) {
			setBalanceDisplay('');
			setBalanceValueInCents(null);
			return;
		}

		const centsValue = Number.parseInt(digitsOnly, 10);
		setBalanceDisplay(formatCurrencyBRL(centsValue));
		setBalanceValueInCents(centsValue);
	}, []);

	const getBankDisplayName = React.useCallback(
		(bankId?: string | null) =>
			banks.find(bank => bank.id === bankId)?.name ?? 'o banco selecionado',
		[banks],
	);

	const showExistingBalanceNotification = React.useCallback(
		(bankId: string, reference: string) => {
			showNotifierAlert({
				title: 'Saldo já registrado',
				description: `Já existe um saldo registrado para ${getBankDisplayName(bankId)} em ${reference}.`,
				type: 'info',
				isDarkMode,
				duration: 4000,
				backgroundColor: '#38BDF8',
				statusBarColor: '#0284C7',
				textColor: '#082F49',
			});
		},
		[getBankDisplayName, isDarkMode],
	);

	const showMissingBalanceNotification = React.useCallback(
		(bankId: string, reference: string) => {
			showNotifierAlert({
				title: 'Saldo não registrado',
				description: `Nenhum saldo foi encontrado para ${getBankDisplayName(bankId)} em ${reference}.`,
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
		},
		[getBankDisplayName, isDarkMode],
	);

	const showSuccessfulBalanceNotification = React.useCallback(
		(bankId: string, reference: string, isUpdating: boolean) => {
			showNotifierAlert({
				title: isUpdating ? 'Saldo atualizado' : 'Saldo registrado',
				description: `O saldo de ${getBankDisplayName(bankId)} para ${reference} foi salvo com sucesso.`,
				type: 'success',
				isDarkMode,
				duration: 4000,
			});
		},
		[getBankDisplayName, isDarkMode],
	);

	const fetchExistingBalance = React.useCallback(
		async (options?: { targetBankId?: string | null; targetMonthReference?: string }) => {
			const bankIdToUse = options?.targetBankId ?? selectedBankId;

			if (!bankIdToUse) {
				setExistingBalanceId(null);
				lastLookupNotificationKeyRef.current = null;
				return;
			}

			const monthReferenceToUse = options?.targetMonthReference ?? monthReference;
			const parsedMonth = parseMonthReference(monthReferenceToUse);

			if (!parsedMonth) {
				setExistingBalanceId(null);
				lastLookupNotificationKeyRef.current = null;
				return;
			}

			const currentUser = auth.currentUser;
			if (!currentUser) {
				showNotifierAlert({
					title: 'Usuário não autenticado.',
					description: 'Faça login novamente.',
					type: 'error',
					duration: 4000,
					isDarkMode,
				});
				return;
			}

			setIsLoadingExisting(true);

			try {
				const response = await getMonthlyBalanceFirebaseRelatedToUser({
					personId: currentUser.uid,
					bankId: bankIdToUse,
					year: parsedMonth.year,
					month: parsedMonth.month,
				});

				if (response.success && response.data) {
					const value =
						typeof response.data.valueInCents === 'number' ? response.data.valueInCents : 0;
					setExistingBalanceId(response.data.id);
					setBalanceDisplay(formatCurrencyBRL(value));
					setBalanceValueInCents(value);
					const notificationKey = `${bankIdToUse}:${monthReferenceToUse}:registered`;

					if (lastLookupNotificationKeyRef.current !== notificationKey) {
						showExistingBalanceNotification(bankIdToUse, monthReferenceToUse);
						lastLookupNotificationKeyRef.current = notificationKey;
					}
				} else {
					setExistingBalanceId(null);
					setBalanceDisplay('');
					setBalanceValueInCents(null);
					const notificationKey = `${bankIdToUse}:${monthReferenceToUse}:missing`;

					if (lastLookupNotificationKeyRef.current !== notificationKey) {
						showMissingBalanceNotification(bankIdToUse, monthReferenceToUse);
						lastLookupNotificationKeyRef.current = notificationKey;
					}
				}
			} catch (error) {
				console.error('Erro ao obter saldo mensal:', error);
				showNotifierAlert({
					title: 'Erro ao buscar saldo',
					description: 'Erro ao buscar o saldo registrado para este mês.',
					type: 'error',
					duration: 4000,
					isDarkMode,
				});
			} finally {
				setIsLoadingExisting(false);
			}
		},
		[
			isDarkMode,
			monthReference,
			selectedBankId,
			showExistingBalanceNotification,
			showMissingBalanceNotification,
		],
	);

	const handleMonthChange = React.useCallback(
		(value: string) => {
			const sanitized = sanitizeMonthInput(value);
			const formatted = formatMonthInput(sanitized);
			setMonthReference(formatted);

			if (parseMonthReference(formatted)) {
				void fetchExistingBalance({ targetMonthReference: formatted });
			} else {
				setExistingBalanceId(null);
			}
		},
		[fetchExistingBalance],
	);

	React.useEffect(() => {
		void fetchExistingBalance();
	}, [fetchExistingBalance]);

	const handleSubmit = React.useCallback(async () => {
		if (!selectedBankId) {
			showNotifierAlert({
				title: 'Erro ao registrar saldo',
				description: 'Selecione um banco para registrar o saldo.',
				type: 'error',
				duration: 4000,
				isDarkMode,
			});
			return;
		}

		const parsedMonth = parseMonthReference(monthReference);
		if (!parsedMonth) {
			showNotifierAlert({
				title: 'Erro ao registrar saldo',
				description: 'Informe um mês válido no formato MM/AAAA.',
				type: 'error',
				duration: 4000,
				isDarkMode,
			});
			return;
		}

		if (balanceValueInCents === null) {
			showNotifierAlert({
				title: 'Erro ao registrar saldo',
				description: 'Informe o saldo disponível no início do mês.',
				type: 'error',
				duration: 4000,
				isDarkMode,
			});
			return;
		}

		const currentUser = auth.currentUser;
		if (!currentUser) {
			showNotifierAlert({
				title: 'Usuário não autenticado',
				description: 'Faça login novamente.',
				type: 'error',
				duration: 4000,
				isDarkMode,
			});
			return;
		}

		const isUpdating = Boolean(existingBalanceId);
		setIsSubmitting(true);

		try {
			const response = await upsertMonthlyBalanceFirebase({
				personId: currentUser.uid,
				bankId: selectedBankId,
				year: parsedMonth.year,
				month: parsedMonth.month,
				valueInCents: balanceValueInCents,
			});

			if (!response.success) {
				throw new Error('Erro ao salvar saldo.');
			}

			setExistingBalanceId(response.id);
			lastLookupNotificationKeyRef.current = `${selectedBankId}:${monthReference}:registered`;
			showSuccessfulBalanceNotification(selectedBankId, monthReference, isUpdating);
			navigateToHomeDashboard();
		} catch (error) {
			console.error('Erro ao registrar saldo mensal:', error);
			showNotifierAlert({
				title: 'Erro ao registrar saldo',
				description: 'Não foi possível registrar o saldo. Tente novamente.',
				type: 'error',
				duration: 4000,
				isDarkMode,
			});
		} finally {
			setIsSubmitting(false);
		}
	}, [
		balanceValueInCents,
		existingBalanceId,
		isDarkMode,
		monthReference,
		selectedBankId,
		showSuccessfulBalanceNotification,
	]);

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
		isSubmitting;
	const balanceStatusClassName = isLoadingExisting
		? helperText
		: existingBalanceId
			? 'text-sky-600 dark:text-sky-300'
			: selectedBankId && hasValidMonthReference
				? 'text-red-600 dark:text-red-400'
				: helperText;
	const screenTitle = 'Saldo mensal por banco';

	return (
		<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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
						className="flex-1"
						behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
						keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
					>
						<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
							<View
								className={`absolute top-0 left-0 right-0 ${cardBackground}`}
								style={{ height: heroHeight }}
							>
								<Image
									source={LoginWallpaper}
									alt="Background da tela de saldo mensal"
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
									<AddRegisterMonthlyBalanceScreenIllustration
										width="40%"
										height="40%"
										className="opacity-90"
									/>
								</VStack>
							</View>

							<ScrollView
								ref={scrollViewRef}
								keyboardShouldPersistTaps="handled"
								keyboardDismissMode="on-drag"
								className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
								style={{ marginTop: heroHeight - 64 }}
								contentContainerStyle={{
									paddingBottom: Math.max(32, contentBottomPadding - 108),
								}}
								onScroll={handleScroll}
								scrollEventThrottle={scrollEventThrottle}
							>
								<VStack className="justify-between mt-4">
									<VStack className="mb-4">

										<HStack className="mb-1 ml-1 gap-2">
											<Text className={`${bodyText} text-sm`}>Banco</Text>
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
														accessibilityLabel="Informações sobre a observação da despesa"
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
											onSelect={(bank: BankActionsheetOption) => setSelectedBankId(bank.id)}
											isDisabled={isLoadingBanks || banks.length === 0}
											isDarkMode={isDarkMode}
											bodyTextClassName={bodyText}
											helperTextClassName={helperText}
											triggerClassName={fieldBankContainerClassName}
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
									</VStack>

									<VStack className="mb-4">
										<HStack className="mb-1 ml-1 gap-2">
											<Text className={`${bodyText} text-sm`}>Mês de referência</Text>
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
														accessibilityLabel="Informações sobre a observação da despesa"
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
										<Input className={fieldContainerClassName}>
											<InputField
												ref={monthReferenceInputRef as any}
												placeholder="MM/AAAA"
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
										<Text className={`${labelText} mb-1 ml-1 text-sm`}>
											Saldo disponível
										</Text>
										<Input
											className={fieldContainerClassName}
											isDisabled={isBalanceInputDisabled}
										>
											<InputField
												ref={balanceInputRef as any}
												placeholder="Digite o saldo disponível"
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

									<Button
										className={submitButtonClassName}
										size="md"
										onPress={handleSubmit}
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
							marginHorizontal: -18,
							paddingBottom: 0,
							flexShrink: 0,
						}}
					>
						<Navigator defaultValue={1} />
					</View>
				</View>
			</SafeAreaView>
		</TouchableWithoutFeedback>
	);
}
