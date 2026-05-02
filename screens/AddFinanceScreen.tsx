import React from 'react';
import {
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	View,
	StatusBar,
	Keyboard,
	TextInput,
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

import { showNotifierAlert, type NotifierAlertType } from '@/components/uiverse/notifier-alert';
import Navigator from '@/components/uiverse/navigator';
import BankActionsheetSelector, { type BankActionsheetOption } from '@/components/uiverse/bank-actionsheet-selector';

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
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { navigateToHomeDashboard } from '@/utils/navigation';
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
		topSummaryCardClassName,
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
	const [bankOptions, setBankOptions] = React.useState<BankActionsheetOption[]>([]);
	const [isLoadingBanks, setIsLoadingBanks] = React.useState(false);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);
	const [currentBankBalanceInCents, setCurrentBankBalanceInCents] = React.useState<number | null>(null);
	const [isLoadingBankBalance, setIsLoadingBankBalance] = React.useState(false);
	const investmentNameInputRef = React.useRef<TextInput | null>(null);
	const initialValueInputRef = React.useRef<TextInput | null>(null);
	const cdiInputRef = React.useRef<TextInput | null>(null);
	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => (key === 'cdi' ? 140 : 120),
		[],
	);

	// Feedback in-app unificado conforme [[Notificações]].
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
	const parsedCdi = React.useMemo(() => parseStringToNumber(cdiInput), [cdiInput]);
	const hasInvestmentName = investmentName.trim().length > 0;
	const hasInitialValue = typeof initialValueInCents === 'number' && initialValueInCents > 0;
	const hasValidInvestmentDate = Boolean(parsedInvestmentDate);
	const hasValidCdi = Number.isFinite(parsedCdi) && parsedCdi > 0;
	const isFormBusy = isSaving;
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
	const isBankBalanceNegative = typeof currentBankBalanceInCents === 'number' && currentBankBalanceInCents < 0;
	const isInitialValueAboveCurrentBalance =
		typeof currentBankBalanceInCents === 'number' &&
		typeof initialValueInCents === 'number' &&
		initialValueInCents > currentBankBalanceInCents;
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

		return true;
	}, [currentBankBalanceInCents, initialValueInCents, isLoadingBankBalance, selectedBankId]);

	// Segue [[Investimentos]]: a tela libera cada etapa do cadastro apenas quando a anterior estiver válida.
	const progressHelperMessage = React.useMemo(() => {
		if (isFormBusy) {
			return 'Salvando investimento. Aguarde a conclusao da operacao atual.';
		}

		if (!hasInvestmentName) {
			return 'Comece informando o nome do investimento.';
		}

		if (!hasInitialValue) {
			return 'Agora informe o valor inicial que sera aplicado.';
		}

		if (!hasValidInvestmentDate) {
			return 'Defina a data do investimento para liberar as configuracoes financeiras.';
		}

		if (!hasValidCdi) {
			return 'Informe um percentual de CDI valido para continuar.';
		}

		if (!selectedBankId) {
			return bankOptions.length === 0
				? 'Cadastre um banco antes de concluir este investimento.'
				: 'Selecione o banco de origem para validar o saldo disponivel.';
		}

		if (isLoadingBankBalance) {
			return 'Consultando o saldo atual do banco selecionado.';
		}

		if (isBankBalanceNegative) {
			return 'O banco selecionado esta com saldo negativo. Regularize antes de salvar.';
		}

		if (isInitialValueAboveCurrentBalance) {
			return 'Ajuste o valor investido ou escolha outro banco com saldo suficiente.';
		}

		return 'Tudo pronto. Revise os dados e salve o investimento.';
	}, [
		bankOptions.length,
		hasInitialValue,
		hasInvestmentName,
		hasValidCdi,
		hasValidInvestmentDate,
		isBankBalanceNegative,
		isFormBusy,
		isInitialValueAboveCurrentBalance,
		isLoadingBankBalance,
		selectedBankId,
	]);

	const bankSelectionHelperMessage = React.useMemo(() => {
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
	}, [bankOptions.length, isBankSelectionDisabled, isFormBusy, isLoadingBanks]);

	const bankBalanceHelperMessage = React.useMemo(() => {
		if (!selectedBankId) {
			return 'O saldo disponivel aparece depois que um banco e selecionado.';
		}

		if (isLoadingBankBalance) {
			return 'Buscando saldo atualizado do banco.';
		}

		if (isBankBalanceNegative) {
			return 'Este banco esta negativo e nao pode receber um novo aporte agora.';
		}

		if (isInitialValueAboveCurrentBalance) {
			return 'O valor inicial nao pode ultrapassar o saldo disponivel deste banco.';
		}

		if (typeof currentBankBalanceInCents === 'number') {
			return 'Saldo carregado. O investimento sera validado com base nesse valor.';
		}

		return 'Saldo indisponivel no momento. Confira o extrato do banco antes de concluir, se necessario.';
	}, [
		currentBankBalanceInCents,
		isBankBalanceNegative,
		isInitialValueAboveCurrentBalance,
		isLoadingBankBalance,
		selectedBankId,
	]);

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
		setCurrentBankBalanceInCents(null);
		setIsLoadingBankBalance(false);
	}, []);

	const loadBanks = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showScreenAlert('Usuário não autenticado. Faça login novamente.', 'error');
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
				iconKey: typeof bank.iconKey === 'string' ? bank.iconKey : null,
				colorHex: typeof bank.colorHex === 'string' ? bank.colorHex : null,
			}));
			setBankOptions(formatted);
			setSelectedBankId(current => (current && formatted.some(bank => bank.id === current) ? current : null));

			if (formatted.length === 0) {
				showScreenAlert('Cadastre um banco antes de registrar investimentos.', 'warn');
			}
		} catch (error) {
			console.error('Erro ao carregar bancos:', error);
			showScreenAlert('Não foi possível carregar os bancos.', 'error');
		} finally {
			setIsLoadingBanks(false);
		}
	}, [showScreenAlert]);

	useFocusEffect(
		React.useCallback(() => {
			void loadBanks();
		}, [loadBanks]),
	);

	const handleBackToHome = React.useCallback(() => {
		navigateToHomeDashboard();
		return true;
	}, []);

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
					showScreenAlert('Usuário não autenticado. Faça login novamente.', 'error');
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
					showScreenAlert('Não foi possível carregar o saldo atual do banco.', 'error');
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
	}, [selectedBankId, showScreenAlert]);

	// Função responsável por salvar o investimento simples no Firebase.
	const handleSaveInvestment = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showScreenAlert('Usuário não autenticado. Faça login novamente.', 'error');
			return;
		}

		if (!isFormValid || isSaving || !selectedBankId) {
			return;
		}

		if (isLoadingBankBalance) {
			showScreenAlert('Aguarde o saldo do banco terminar de carregar.', 'warn');
			return;
		}

		const parsedInitial = typeof initialValueInCents === 'number' ? initialValueInCents / 100 : NaN;
		const initialInCents = typeof initialValueInCents === 'number' ? initialValueInCents : Math.round(parsedInitial * 100);

		if (!Number.isFinite(parsedInitial) || parsedInitial <= 0 || !Number.isFinite(initialInCents) || initialInCents <= 0) {
			showScreenAlert('Informe um valor inicial válido.', 'warn');
			return;
		}

		if (typeof currentBankBalanceInCents === 'number') {
			if (currentBankBalanceInCents < 0) {
				showScreenAlert('O saldo do banco está negativo. Regularize antes de investir.', 'warn');
				return;
			}

			if (initialInCents > currentBankBalanceInCents) {
				showScreenAlert('Saldo insuficiente para registrar este investimento.', 'warn');
				return;
			}
		}

		if (!Number.isFinite(parsedCdi) || parsedCdi <= 0) {
			showScreenAlert('Informe um CDI válido.', 'warn');
			return;
		}

		const parsedDate = parsedInvestmentDate;
		if (!parsedDate) {
			showScreenAlert('Informe uma data válida (DD/MM/AAAA).', 'warn');
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
			showScreenAlert('Investimento salvo com sucesso!', 'success');
			resetForm();
			navigateToHomeDashboard();
		} catch (error) {
			console.error(error);
			showScreenAlert('Não foi possível salvar o investimento agora. Tente novamente.', 'error');
		} finally {
			setIsSaving(false);
		}
	}, [
		isFormValid,
		isSaving,
		investmentName,
		selectedRedemptionTerm,
		resetForm,
		bankOptions,
		selectedBankId,
		initialValueInCents,
		currentBankBalanceInCents,
		isLoadingBankBalance,
		parsedCdi,
		parsedInvestmentDate,
		showScreenAlert,
	]);
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
		<HStack className="ml-1 items-center gap-2">
			<Text className={`${bodyText} text-sm`}>{label}</Text>
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
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
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
							className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
							style={{ marginTop: heroHeight - 64 }}
							contentContainerStyle={{ paddingBottom: contentBottomPadding }}
							onScroll={handleScroll}
							scrollEventThrottle={scrollEventThrottle}
						>
							<VStack className="justify-between">
								<VStack className="mt-4 gap-4">
									<VStack className="gap-2">
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
