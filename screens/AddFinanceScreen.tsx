import React from 'react';
import {
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	View,
	StatusBar,
	Keyboard,
	TextInput,
	findNodeHandle,
	ScrollView as RNScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
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

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

import AddFinancialIllustration from '../assets/UnDraw/addFinancialScreen.svg';

import { redemptionTermLabels, RedemptionTerm } from '@/utils/finance';
import { auth } from '@/FirebaseConfig';
import { addFinanceInvestmentFirebase, getFinanceInvestmentsByPeriodFirebase } from '@/functions/FinancesFirebase';
import {
	getBanksWithUsersByPersonFirebase,
	getCurrentMonthSummaryByBankFirebaseExpanses,
	getCurrentMonthSummaryByBankFirebaseGains,
} from '@/functions/BankFirebase';
import { getMonthlyBalanceFirebaseRelatedToUser } from '@/functions/MonthlyBalanceFirebase';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import DatePickerField from '@/components/uiverse/date-picker';
import { useScreenStyles } from '@/hooks/useScreenStyle';

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

const parseStringToNumber = (value: string) => {
	if (!value.trim()) {
		return NaN;
	}
	const normalized = value.replace(/\./g, '').replace(',', '.');
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : NaN;
};

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

const mergeDateWithCurrentTime = (date: Date) => {
	const now = new Date();
	const dateWithTime = new Date(date);
	dateWithTime.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
	return dateWithTime;
};

const formatCurrencyBRL = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(valueInCents / 100);

function AddFinanceFormSkeleton({
	bodyText,
	tintedCardClassName,
	fieldContainerClassName,
	compactCardClassName,
	skeletonBaseColor,
	skeletonHighlightColor,
	skeletonMutedBaseColor,
	skeletonMutedHighlightColor,
}: {
	bodyText: string;
	tintedCardClassName: string;
	fieldContainerClassName: string;
	compactCardClassName: string;
	skeletonBaseColor: string;
	skeletonHighlightColor: string;
	skeletonMutedBaseColor: string;
	skeletonMutedHighlightColor: string;
}) {
	return (
		<VStack className="mt-4 gap-4">
			<Box className={`${tintedCardClassName} px-5 py-5`}>
				<VStack className="gap-3">
					<Skeleton className="h-3 w-24" baseColor={skeletonMutedBaseColor} highlightColor={skeletonMutedHighlightColor} />
					<Skeleton className="h-8 w-52" baseColor={skeletonMutedBaseColor} highlightColor={skeletonMutedHighlightColor} />
					<SkeletonText
						_lines={2}
						className="h-3"
						baseColor={skeletonMutedBaseColor}
						highlightColor={skeletonMutedHighlightColor}
					/>
				</VStack>
			</Box>

			{Array.from({ length: 5 }).map((_, index) => (
				<VStack key={`add-finance-skeleton-${index}`} className="gap-2">
					<Text className={`${bodyText} ml-1 text-sm`}>{index === 4 ? 'Banco' : 'Campo'}</Text>
					<Skeleton className={fieldContainerClassName} baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
				</VStack>
			))}

			<Box className={`${compactCardClassName} px-4 py-4`}>
				<VStack className="gap-3">
					<Skeleton className="h-4 w-28" baseColor={skeletonMutedBaseColor} highlightColor={skeletonMutedHighlightColor} />
					<SkeletonText
						_lines={2}
						className="h-3"
						baseColor={skeletonMutedBaseColor}
						highlightColor={skeletonMutedHighlightColor}
					/>
				</VStack>
			</Box>

			<Skeleton className="h-11 rounded-2xl" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
		</VStack>
	);
}

export default function AddFinanceScreen() {
	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		fieldContainerClassName,
		submitButtonClassName,
		heroHeight,
		insets,
		compactCardClassName,
		tintedCardClassName,
		topSummaryCardClassName,
		skeletonBaseColor,
		skeletonHighlightColor,
		skeletonMutedBaseColor,
		skeletonMutedHighlightColor,
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
	const [bankOptions, setBankOptions] = React.useState<{ id: string; name: string }[]>([]);
	const [isLoadingBanks, setIsLoadingBanks] = React.useState(false);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);
	const [currentBankBalanceInCents, setCurrentBankBalanceInCents] = React.useState<number | null>(null);
	const [isLoadingBankBalance, setIsLoadingBankBalance] = React.useState(false);
	const scrollViewRef = React.useRef<RNScrollView | null>(null);
	const investmentNameInputRef = React.useRef<TextInput | null>(null);
	const initialValueInputRef = React.useRef<TextInput | null>(null);
	const cdiInputRef = React.useRef<TextInput | null>(null);
	const lastFocusedInputKey = React.useRef<FocusableInputKey | null>(null);
	const [keyboardHeight, setKeyboardHeight] = React.useState(0);
	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => (key === 'cdi' ? 140 : 120),
		[],
	);

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

	const contentBottomPadding = React.useMemo(() => Math.max(140, keyboardHeight + 120), [keyboardHeight]);

	// Verificamos se todos os campos obrigatórios foram preenchidos.
	const isFormValid = React.useMemo(() => {
		const parsedCdi = parseStringToNumber(cdiInput);
		const initialCents = typeof initialValueInCents === 'number' ? initialValueInCents : 0;
		const hasValidBalance =
			typeof currentBankBalanceInCents === 'number'
				? currentBankBalanceInCents >= 0 && initialCents > 0 && initialCents <= currentBankBalanceInCents
				: initialCents > 0;
		return (
			investmentName.trim().length > 0 &&
			initialCents > 0 &&
			parsedCdi > 0 &&
			Boolean(selectedBankId) &&
			Boolean(parseDateFromBR(investmentDate)) &&
			hasValidBalance
		);
	}, [investmentName, initialValueInCents, cdiInput, selectedBankId, investmentDate, currentBankBalanceInCents]);

	// Função utilitária para limpar o formulário após o salvamento.
	const resetForm = React.useCallback(() => {
		setInvestmentName('');
		setInitialValueInput('');
		setInitialValueInCents(null);
		setCdiInput('');
		setInvestmentDate(formatDateToBR(new Date()));
		setSelectedRedemptionTerm('anytime');
		setSelectedBankId(null);
		setCurrentBankBalanceInCents(null);
		setIsLoadingBankBalance(false);
	}, []);

	const loadBanks = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showFloatingAlert({
				message: 'Usuário não autenticado. Faça login novamente.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		setIsLoadingBanks(true);
		try {
			const banksResponse = await getBanksWithUsersByPersonFirebase(currentUser.uid);
			if (!banksResponse.success || !Array.isArray(banksResponse.data)) {
				throw new Error('Erro ao carregar bancos.');
			}

			const formatted = (banksResponse.data as Array<Record<string, any>>).map(bank => ({
				id: String(bank.id),
				name:
					typeof bank.name === 'string' && bank.name.trim().length > 0
						? bank.name.trim()
						: 'Banco sem nome',
			}));
			setBankOptions(formatted);
			setSelectedBankId(current => (current && formatted.some(bank => bank.id === current) ? current : null));

			if (formatted.length === 0) {
				showFloatingAlert({
					message: 'Cadastre um banco antes de registrar investimentos.',
					action: 'warning',
					position: 'bottom',
				});
			}
		} catch (error) {
			console.error('Erro ao carregar bancos:', error);
			showFloatingAlert({
				message: 'Não foi possível carregar os bancos.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsLoadingBanks(false);
		}
	}, []);

	useFocusEffect(
		React.useCallback(() => {
			void loadBanks();
		}, [loadBanks]),
	);

	const handleDateSelect = React.useCallback((formatted: string) => {
		setInvestmentDate(formatted);
		setHasSavedOnce(false);
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
				const currentUser = auth.currentUser;
				if (!currentUser) {
					showFloatingAlert({
						message: 'Usuário não autenticado. Faça login novamente.',
						action: 'error',
						position: 'bottom',
					});
					return;
				}

				const now = new Date();
				const currentYear = now.getFullYear();
				const currentMonth = now.getMonth() + 1;
				const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
				const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

				const [expensesResult, gainsResult, balanceResponse, investmentsResult] = await Promise.all([
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
					investmentsResult?.success && Array.isArray(investmentsResult.data) ? investmentsResult.data : [];

				const totalExpensesInCents = expensesArray.reduce((acc, item) => {
					const bankId = typeof item?.bankId === 'string' ? item.bankId : null;
					const value =
						typeof item?.valueInCents === 'number' && !Number.isNaN(item.valueInCents)
							? item.valueInCents
							: 0;
					if (bankId === selectedBankId) {
						return acc + value;
					}
					return acc;
				}, 0);

				const totalInvestmentInCents = investmentsArray.reduce((acc, item) => {
					const bankId = typeof item?.bankId === 'string' ? item.bankId : null;
					const value =
						typeof item?.currentValueInCents === 'number' && !Number.isNaN(item.currentValueInCents)
							? item.currentValueInCents
							: typeof item?.lastManualSyncValueInCents === 'number' && !Number.isNaN(item.lastManualSyncValueInCents)
								? item.lastManualSyncValueInCents
								: typeof item?.initialValueInCents === 'number' && !Number.isNaN(item.initialValueInCents)
									? item.initialValueInCents
									: 0;
					if (bankId === selectedBankId) {
						return acc + value;
					}
					return acc;
				}, 0);

				const totalGainsInCents = gainsArray.reduce((acc, item) => {
					const bankId = typeof item?.bankId === 'string' ? item.bankId : null;
					const value =
						typeof item?.valueInCents === 'number' && !Number.isNaN(item.valueInCents)
							? item.valueInCents
							: 0;
					if (bankId === selectedBankId) {
						return acc + value;
					}
					return acc;
				}, 0);

				const initialBalance =
					balanceResponse?.success && balanceResponse.data && typeof balanceResponse.data.valueInCents === 'number'
						? balanceResponse.data.valueInCents
						: null;

				const currentBalance =
					typeof initialBalance === 'number'
						? initialBalance + (totalGainsInCents - (totalExpensesInCents + totalInvestmentInCents))
						: null;

				setCurrentBankBalanceInCents(currentBalance);
			} catch (error) {
				console.error('Erro ao carregar saldo do banco:', error);
				if (isMounted) {
					showFloatingAlert({
						message: 'Não foi possível carregar o saldo atual do banco.',
						action: 'error',
						position: 'bottom',
					});
					setCurrentBankBalanceInCents(null);
				}
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
	}, [selectedBankId]);

	// Função responsável por salvar o investimento simples no Firebase.
	const handleSaveInvestment = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showFloatingAlert({
				message: 'Usuário não autenticado. Faça login novamente.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (!isFormValid || isSaving || !selectedBankId) {
			return;
		}

		const parsedInitial = typeof initialValueInCents === 'number' ? initialValueInCents / 100 : NaN;
		const parsedCdi = parseStringToNumber(cdiInput);
		const initialInCents = typeof initialValueInCents === 'number' ? initialValueInCents : Math.round(parsedInitial * 100);

		if (!Number.isFinite(parsedInitial) || parsedInitial <= 0 || !Number.isFinite(initialInCents) || initialInCents <= 0) {
			showFloatingAlert({
				message: 'Informe um valor inicial válido.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		if (typeof currentBankBalanceInCents === 'number') {
			if (currentBankBalanceInCents < 0) {
				showFloatingAlert({
					message: 'O saldo do banco está negativo. Regularize antes de investir.',
					action: 'warning',
					position: 'bottom',
				});
				return;
			}

			if (initialInCents > currentBankBalanceInCents) {
				showFloatingAlert({
					message: 'Saldo insuficiente para registrar este investimento.',
					action: 'warning',
					position: 'bottom',
				});
				return;
			}
		}

		if (!Number.isFinite(parsedCdi) || parsedCdi <= 0) {
			showFloatingAlert({
				message: 'Informe um CDI válido.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		const parsedDate = parseDateFromBR(investmentDate);
		if (!parsedDate) {
			showFloatingAlert({
				message: 'Informe uma data válida (DD/MM/AAAA).',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		const dateWithCurrentTime = mergeDateWithCurrentTime(parsedDate);
		const bankSnapshotName = selectedBankId
			? bankOptions.find(bank => bank.id === selectedBankId)?.name ?? null
			: null;

		setIsSaving(true);
		try {
			const result = await addFinanceInvestmentFirebase({
				name: investmentName.trim(),
				initialValueInCents: initialInCents,
				currentValueInCents: initialInCents,
				cdiPercentage: parsedCdi,
				redemptionTerm: selectedRedemptionTerm,
				bankId: selectedBankId,
				personId: currentUser.uid,
				date: dateWithCurrentTime,
				bankNameSnapshot: bankSnapshotName,
			});

			if (!result.success) {
				throw new Error('Erro ao registrar investimento no Firebase.');
			}

			setHasSavedOnce(true);
			showFloatingAlert({
				message: 'Investimento salvo com sucesso!',
				action: 'success',
				position: 'bottom',
			});
			resetForm();

			// Após salvar conduzimos o usuário para a lista, deixando claro que tudo está separado do restante do app.
			router.push('/financial-list');
		} catch (error) {
			console.error(error);
			showFloatingAlert({
				message: 'Não foi possível salvar o investimento agora. Tente novamente.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSaving(false);
		}
	}, [
		isFormValid,
		isSaving,
		initialValueInput,
		cdiInput,
		investmentName,
		selectedRedemptionTerm,
		resetForm,
		investmentDate,
		bankOptions,
		selectedBankId,
	]);
	const selectedBankLabel = selectedBankId ? bankOptions.find(bank => bank.id === selectedBankId)?.name ?? '' : '';
	const isInitialLoading = isLoadingBanks && bankOptions.length === 0;

	return (
		<SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<FloatingAlertViewport />
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
							className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
							style={{ marginTop: heroHeight - 64 }}
							contentContainerStyle={{ paddingBottom: contentBottomPadding }}
						>
							<VStack className="justify-between mt-4">
								<Box className={`${topSummaryCardClassName} px-5 py-5`}>
									<VStack className="gap-3">
										<Text className={`${helperText} text-xs uppercase tracking-[0.18em]`}>
											Investimento separado da conta
										</Text>
										<Heading size="md">Registre um ativo e acompanhe depois na lista dedicada</Heading>
										<Text className={`${bodyText} text-sm`}>
											Defina o valor inicial, CDI, prazo e banco vinculado. O registro continua isolado da lista comum, mas segue o mesmo padrão visual do sistema.
										</Text>
									</VStack>
								</Box>

								{isInitialLoading ? (
									<AddFinanceFormSkeleton
										bodyText={bodyText}
										tintedCardClassName={tintedCardClassName}
										fieldContainerClassName={fieldContainerClassName}
										compactCardClassName={compactCardClassName}
										skeletonBaseColor={skeletonBaseColor}
										skeletonHighlightColor={skeletonHighlightColor}
										skeletonMutedBaseColor={skeletonMutedBaseColor}
										skeletonMutedHighlightColor={skeletonMutedHighlightColor}
									/>
								) : (
									<VStack className="mt-4 gap-4">
										<VStack className="gap-2">
											<Text className={`${bodyText} ml-1 text-sm`}>Nome do investimento</Text>
											<Input className={fieldContainerClassName}>
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
												/>
											</Input>
										</VStack>

										<VStack className="gap-2">
											<Text className={`${bodyText} ml-1 text-sm`}>Valor inicial investido</Text>
											<Input className={fieldContainerClassName}>
												<InputField
													ref={initialValueInputRef}
													value={initialValueInput}
													onChangeText={handleInitialValueChange}
													placeholder="Ex: R$ 1.500,00"
													keyboardType="numeric"
													className={inputField}
													onFocus={() => handleInputFocus('initial-value')}
												/>
											</Input>
										</VStack>

										<DatePickerField
											label="Dia do investimento"
											labelClassName={`${bodyText} ml-1 text-sm`}
											value={investmentDate}
											onChange={formatted => handleDateSelect(formatted)}
											triggerClassName={fieldContainerClassName}
											inputClassName={inputField}
										/>

										<VStack className="gap-2">
											<Text className={`${bodyText} ml-1 text-sm`}>CDI (%)</Text>
											<Input className={fieldContainerClassName}>
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
												/>
											</Input>
										</VStack>

										<VStack className="gap-2">
											<Text className={`${bodyText} ml-1 text-sm`}>Prazo para resgate</Text>
											<Select
												selectedValue={selectedRedemptionTerm}
												onValueChange={value => {
													setSelectedRedemptionTerm(value as RedemptionTerm);
													setHasSavedOnce(false);
												}}
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
											<Text className={`${bodyText} ml-1 text-sm`}>Banco vinculado</Text>
											<Select
												selectedValue={selectedBankId ?? undefined}
												onValueChange={value => {
													setSelectedBankId(value);
													setHasSavedOnce(false);
												}}
												isDisabled={isLoadingBanks || bankOptions.length === 0}
											>
												<SelectTrigger variant="outline" size="md" className={fieldContainerClassName}>
													<SelectInput
														placeholder="Selecione o banco do investimento"
														value={selectedBankLabel}
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
														{bankOptions.length > 0 ? (
															bankOptions.map(bank => <SelectItem key={bank.id} label={bank.name} value={bank.id} />)
														) : (
															<SelectItem label="Nenhum banco disponível" value="no-bank" isDisabled />
														)}
													</SelectContent>
												</SelectPortal>
											</Select>
										</VStack>

										<Box className={`${tintedCardClassName} px-4 py-4`}>
											<VStack className="gap-3">
												<VStack className="gap-1">
													<Text className="font-semibold">Saldo disponível do banco</Text>
													<Text className={`${helperText} text-sm`}>
														Validamos esse valor antes do cadastro para evitar lançar um investimento acima do saldo atual.
													</Text>
												</VStack>

												{selectedBankId && isLoadingBankBalance ? (
													<Skeleton
														className="h-10 rounded-2xl"
														baseColor={skeletonBaseColor}
														highlightColor={skeletonHighlightColor}
													/>
												) : (
													<Input className={fieldContainerClassName} isDisabled>
														<InputField
															value={
																!selectedBankId
																	? 'Selecione um banco para visualizar o saldo'
																	: typeof currentBankBalanceInCents === 'number'
																		? formatCurrencyBRL(currentBankBalanceInCents)
																		: 'Saldo indisponível'
															}
															className={inputField}
														/>
													</Input>
												)}
											</VStack>
										</Box>

										<Button className={submitButtonClassName} onPress={handleSaveInvestment} isDisabled={!isFormValid || isSaving}>
											{isSaving ? (
												<>
													<ButtonSpinner />
													<ButtonText>Salvando</ButtonText>
												</>
											) : (
												<ButtonText>Salvar investimento</ButtonText>
											)}
										</Button>

										{hasSavedOnce ? (
											<Box className={`${compactCardClassName} px-4 py-4`}>
												<HStack className="items-center justify-between gap-3">
													<Text className="flex-1 text-sm text-emerald-600 dark:text-emerald-400">
														Pronto. O investimento já está disponível na lista dedicada.
													</Text>
													<Button variant="link" action="primary" onPress={() => router.push('/financial-list')}>
														<ButtonText>Ver lista</ButtonText>
													</Button>
												</HStack>
											</Box>
										) : null}
									</VStack>
								)}
							</VStack>
						</ScrollView>
					</View>
				</KeyboardAvoidingView>

				<Menu defaultValue={1} />
			</View>
		</SafeAreaView>
	);
}
