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
	TouchableWithoutFeedback,
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
import { HStack } from '@/components/ui/hstack';
import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import Navigator from '@/components/uiverse/navigator';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import { useAppTheme } from '@/contexts/ThemeContext';

import { getAllBanksFirebase } from '@/functions/BankFirebase';
import {
	getMonthlyBalanceFirebaseRelatedToUser,
	upsertMonthlyBalanceFirebase,
} from '@/functions/MonthlyBalanceFirebase';
import { auth } from '@/FirebaseConfig';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { Info, Tags as TagsIcon } from 'lucide-react-native';

import AddRegisterMonthlyBalanceScreenIllustration from '../assets/UnDraw/addRegisterMonthlyBalanceScreen.svg';

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
};

type FocusableInputKey = 'month-reference' | 'balance';

export default function AddRegisterMonthlyBalanceScreen() {
	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { height: windowHeight } = useWindowDimensions();

	const surfaceBackground = isDarkMode ? '#020617' : '#FFFFFF';
	const cardBackground = isDarkMode ? 'bg-slate-950' : 'bg-white';
	const bodyText = isDarkMode ? 'text-slate-300' : 'text-slate-700';
	const labelText = isDarkMode ? 'text-slate-300' : 'text-slate-700';
	const helperText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
	const inputField = isDarkMode
		? 'text-slate-100 placeholder:text-slate-500'
		: 'text-slate-900 placeholder:text-slate-500';
	const focusFieldClassName =
		'data-[focus=true]:border-[#FFE000] dark:data-[focus=true]:border-yellow-300';
	const fieldContainerClassName = `h-10 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const fieldContainerCardClassName = `rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const submitButtonClassName = isDarkMode
		? 'bg-yellow-300/80 text-slate-900 hover:bg-yellow-300 rounded-2xl'
		: 'bg-yellow-400 text-white hover:bg-yellow-500 rounded-2xl';
	const heroHeight = Math.max(windowHeight * 0.28, 250) + insets.top;
	const infoCardStyle = React.useMemo(
		() => ({
			borderRadius: 20,
			borderWidth: 1,
			borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.14)' : 'rgba(226, 232, 240, 1)',
			backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.78)' : '#FFFFFF',
		}),
		[isDarkMode],
	);		

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

	const scrollViewRef = React.useRef<ScrollView | null>(null);
	const monthReferenceInputRef = React.useRef<TextInput | null>(null);
	const balanceInputRef = React.useRef<TextInput | null>(null);
	const lastFocusedInputKey = React.useRef<FocusableInputKey | null>(null);
	const lastLookupNotificationKeyRef = React.useRef<string | null>(null);
	const [keyboardHeight, setKeyboardHeight] = React.useState(0);

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

	const contentBottomPadding = React.useMemo(
		() => Math.max(140, keyboardHeight + 120),
		[keyboardHeight],
	);

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
						}));

						setBanks(formattedBanks);
						setSelectedBankId(current =>
							current && formattedBanks.some(bank => bank.id === current) ? current : null,
						);
					} else {
						showFloatingAlert({
							message: 'Não foi possível carregar os bancos disponíveis.',
							action: 'error',
							position: 'bottom',
							offset: 40,
						});
					}
				} catch (error) {
					console.error('Erro ao carregar bancos:', error);

					if (isMounted) {
						showFloatingAlert({
							message: 'Erro inesperado ao carregar os bancos.',
							action: 'error',
							position: 'bottom',
							offset: 40,
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
		}, []),
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
				showFloatingAlert({
					message: 'Usuário não autenticado. Faça login novamente.',
					action: 'error',
					position: 'bottom',
					offset: 40,
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
				showFloatingAlert({
					message: 'Erro ao buscar o saldo registrado para este mês.',
					action: 'error',
					position: 'bottom',
					offset: 40,
				});
			} finally {
				setIsLoadingExisting(false);
			}
		},
		[
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
			showFloatingAlert({
				message: 'Selecione um banco para registrar o saldo.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
			return;
		}

		const parsedMonth = parseMonthReference(monthReference);
		if (!parsedMonth) {
			showFloatingAlert({
				message: 'Informe um mês válido no formato MM/AAAA.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
			return;
		}

		if (balanceValueInCents === null) {
			showFloatingAlert({
				message: 'Informe o saldo disponível no início do mês.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
			return;
		}

		const currentUser = auth.currentUser;
		if (!currentUser) {
			showFloatingAlert({
				message: 'Usuário não autenticado. Faça login novamente.',
				action: 'error',
				position: 'bottom',
				offset: 40,
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

			if (isUpdating) {
				router.replace('/home?tab=0');
			}
		} catch (error) {
			console.error('Erro ao registrar saldo mensal:', error);
			showFloatingAlert({
				message: 'Não foi possível registrar o saldo. Tente novamente.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
		} finally {
			setIsSubmitting(false);
		}
	}, [
		balanceValueInCents,
		existingBalanceId,
		monthReference,
		selectedBankId,
		showSuccessfulBalanceNotification,
	]);

	const hasValidMonthReference = parseMonthReference(monthReference) !== null;
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
					<FloatingAlertViewport />

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

										<Select
											selectedValue={selectedBankId ?? undefined}
											onValueChange={value => setSelectedBankId(value)}
											isDisabled={isLoadingBanks || banks.length === 0}
										>
											<SelectTrigger variant="outline" size="md" className={fieldContainerClassName}>
												<SelectInput
													placeholder="Selecione o banco vinculado"
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
														[...banks]
															.sort((a, b) =>
																a.name.localeCompare(b.name, 'pt-BR', {
																	sensitivity: 'base',
																}),
															)
															.map(bank => (
																<SelectItem
																	key={bank.id}
																	label={bank.name}
																	value={bank.id}
																/>
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
