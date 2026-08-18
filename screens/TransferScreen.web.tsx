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
	Pressable,
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
import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';

import Navigator from '@/components/uiverse/navigator';
import WebScreenHero from '@/components/uiverse/web-screen-hero';
import { showNotifierAlert, type NotifierAlertType } from '@/components/uiverse/notifier-alert';
import BankActionsheetSelector, { type BankActionsheetOption } from '@/components/uiverse/bank-actionsheet-selector';
import { HStack } from '@/components/ui/hstack';
import { navigateToHomeDashboard } from '@/utils/navigation';

import {
	getBanksWithUsersByPersonFirebase,
	getLegacyBankBalanceInCentsFirebase,
	transferBetweenBanksFirebase,
} from '@/functions/BankFirebase';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import DatePickerField from '@/components/uiverse/date-picker';

import TransferIllustration from '../assets/UnDraw/transferScreen.svg';

import { Info } from 'lucide-react-native';

import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';

type BankOption = {
	id: string;
	name: string;
	iconKey?: string | null;
	colorHex?: string | null;
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
		fieldBankContainerClassName,
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
	const submitLockRef = React.useRef(false);
	const transferValueInputRef = React.useRef<TextInput | null>(null);
	const transferDescriptionInputRef = React.useRef<TextInput | null>(null);
	const previousUnavailableBalanceRef = React.useRef(false);
	const applyPostSubmitBehavior = usePostSubmitBehavior('transferScreen');
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
		setTransferDate(formatDateToBR(new Date()));
		setTransferDescription(null);
		setOriginBalanceInCents(null);
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

			const balanceResult = await getLegacyBankBalanceInCentsFirebase({
				personId: currentUser.uid,
				bankId,
			});
			if (!balanceResult.success) {
				throw balanceResult.error;
			}
			setOriginBalanceInCents(balanceResult.data);
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
							iconKey: typeof bank?.iconKey === 'string' ? bank.iconKey : null,
							colorHex: typeof bank?.colorHex === 'string' ? bank.colorHex : null,
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
		if (submitLockRef.current || isSubmitting) {
			return;
		}

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

		submitLockRef.current = true;
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
			applyPostSubmitBehavior({ resetForm: resetTransferForm });
		} catch (error) {
			console.error('Erro ao registrar transferência:', error);
			showScreenAlert('Erro inesperado ao registrar a transferência.', 'error');
		} finally {
			submitLockRef.current = false;
			setIsSubmitting(false);
		}
	}, [
		banks,
		isSubmitting,
		originBalanceInCents,
		showScreenAlert,
		showSuccessfulTransferNotification,
		showUnavailableBalanceNotification,
		applyPostSubmitBehavior,
		resetTransferForm,
		selectedSourceBankId,
		selectedTargetBankId,
		parsedTransferDate,
		transferDescription,
		transferValueInCents,
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
							className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1 web:w-full web:px-8 web:relative web:z-[3]`}
							style={{ marginTop: heroHeight - 64 }}
							contentContainerStyle={{ paddingBottom: Math.max(32, contentBottomPadding - 108) }}
							onScroll={handleScroll}
							scrollEventThrottle={scrollEventThrottle}
						>
							<VStack className="h-full mt-4 web:w-full web:max-w-[1180px] web:self-center web:rounded-[28px] web:p-8">

								<HStack className="w-full web:flex-wrap" space="md">

									<VStack className="mb-4 flex-1 web:min-w-[280px]">
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
											triggerClassName={`${fieldBankContainerClassName} w-full`}
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
									</VStack>

									<VStack className="mb-4 flex-1 web:min-w-[280px]">
										<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Banco de destino</Text>
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
											triggerClassName={`${fieldBankContainerClassName} w-full`}
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
