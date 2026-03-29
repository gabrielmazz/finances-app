import React from 'react';
import { ScrollView, View, TouchableOpacity, StatusBar, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { GestureHandlerRootView, TapGestureHandler } from 'react-native-gesture-handler';

// Componentes de UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Divider } from '@/components/ui/divider';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
} from '@/components/ui/modal';
import {
	Drawer,
	DrawerBackdrop,
	DrawerContent,
	DrawerHeader,
	DrawerCloseButton,
	DrawerBody,
	DrawerFooter,
} from '@/components/ui/drawer';
import { EditIcon, TrashIcon } from '@/components/ui/icon';
import { Textarea, TextareaInput } from '@/components/ui/textarea';

import Navigator from '@/components/uiverse/navigator';
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { auth } from '@/FirebaseConfig';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';

// Gráfico de pizza
import { PieChart } from 'react-native-gifted-charts';

// Funções para buscar gastos/ganhos obrigatórios no firebase
import { getMandatoryExpensesWithRelationsFirebase } from '@/functions/MandatoryExpenseFirebase';
import { getMandatoryGainsWithRelationsFirebase } from '@/functions/MandatoryGainFirebase';
import { isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import {
	getBankMovementsByPeriodFirebase,
	getBankDataFirebase,
	getCashMovementsByPeriodFirebase,
	deleteCashRescueFirebase,
} from '@/functions/BankFirebase';
import { getMonthlyBalanceFirebaseRelatedToUser } from '@/functions/MonthlyBalanceFirebase';
import { deleteExpenseFirebase } from '@/functions/ExpenseFirebase';
import { deleteGainFirebase } from '@/functions/GainFirebase';
import { getTagDataFirebase } from '@/functions/TagFirebase';
import { getFinanceInvestmentsByPeriodFirebase } from '@/functions/FinancesFirebase';
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
import DatePickerField from '@/components/uiverse/date-picker';

// Importação do SVG de ilustração
import BankMovementsIllustration from '../assets/UnDraw/bankMovementsScreen.svg';


type FirestoreLikeTimestamp = {
	toDate?: () => Date;
};

type MovementRecord = {
	id: string;
	name: string;
	valueInCents: number;
	type: 'expense' | 'gain';
	date: Date | null;
	tagId?: string | null;
	bankId?: string | null;
	personId?: string | null;
	explanation?: string | null;
	paymentFormats?: string[] | null;
	moneyFormat?: boolean | null;
	// true se esta movimentação for a ligada a um Gasto/Ganho Obrigatório do ciclo atual
	isFromMandatory?: boolean;
	isCashRescue?: boolean;
	cashRescueSourceBankName?: string | null;
	isBankTransfer?: boolean;
	bankTransferPairId?: string | null;
	bankTransferDirection?: 'incoming' | 'outgoing' | null;
	bankTransferSourceBankId?: string | null;
	bankTransferTargetBankId?: string | null;
	bankTransferSourceBankNameSnapshot?: string | null;
	bankTransferTargetBankNameSnapshot?: string | null;
	bankTransferExpenseId?: string | null;
	bankTransferGainId?: string | null;
	isFinanceInvestment?: boolean;
	investmentId?: string | null;
	investmentBankNameSnapshot?: string | null;
	isInvestmentRedemption?: boolean;
	isInvestmentDeposit?: boolean;
	investmentNameSnapshot?: string | null;
};

type PendingMovementAction =
	| { type: 'edit'; movement: MovementRecord }
	| { type: 'delete'; movement: MovementRecord }
	| { type: 'revert-cash-rescue'; movement: MovementRecord };

const formatCurrencyBRLBase = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
		minimumFractionDigits: 2,
	}).format((valueInCents ?? 0) / 100);

const formatMovementDate = (value: Date | null) => {
	if (!value) {
		return 'Data indisponível';
	}

	return new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(value);
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

const normalizeDate = (value: unknown): Date | null => {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value;
	}

	if (typeof value === 'object' && value !== null) {
		const timestamp = value as FirestoreLikeTimestamp;
		if (typeof timestamp.toDate === 'function') {
			return timestamp.toDate() ?? null;
		}
	}

	if (typeof value === 'string' || typeof value === 'number') {
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) {
			return parsed;
		}
	}

	return null;
};

const normalizeTransferDirection = (value: unknown): 'incoming' | 'outgoing' | null => {
	if (value === 'incoming' || value === 'outgoing') {
		return value;
	}
	return null;
};

const getCurrentMonthBounds = () => {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), 1);
	const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	return {
		start,
		end,
	};
};

const PIE_TOTAL_COLORS = {
	expenses: '#F43F5E',
	gains: '#10B981',
};

export default function BankMovementsScreen() {
	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { height: windowHeight } = useWindowDimensions();

	const surfaceBackground = isDarkMode ? '#020617' : '#FFFFFF';
	const cardBackground = isDarkMode ? 'bg-slate-950' : 'bg-white';
	const headingText = isDarkMode ? 'text-slate-100' : 'text-slate-900';
	const bodyText = isDarkMode ? 'text-slate-300' : 'text-slate-700';
	const helperText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
	const inputField = isDarkMode
		? 'text-slate-100 placeholder:text-slate-500'
		: 'text-slate-900 placeholder:text-slate-500';
	const focusFieldClassName =
		'data-[focus=true]:border-[#FFE000] dark:data-[focus=true]:border-yellow-300';
	const fieldContainerClassName = `h-10 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const fieldContainerCardClassName = `rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const textareaContainerClassName =
		`h-32 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const submitButtonClassName = isDarkMode
		? 'bg-yellow-300/80 text-slate-900 hover:bg-yellow-300 rounded-2xl'
		: 'bg-yellow-400 text-white hover:bg-yellow-500 rounded-2xl';
	const heroHeight = Math.max(windowHeight * 0.28, 250) + insets.top;
	const legendBorderColor = isDarkMode ? '#374151' : '#E5E7EB';
	const searchParams = useLocalSearchParams<{
		bankId?: string | string[];
		bankName?: string | string[];
		cashView?: string | string[];
	}>();

	const bankId = React.useMemo(() => {
		const value = searchParams.bankId;
		if (Array.isArray(value)) {
			return value[0] ?? '';
		}
		return value ?? '';
	}, [searchParams.bankId]);

	const cashViewParam = React.useMemo(() => {
		const value = searchParams.cashView;
		if (Array.isArray(value)) {
			return value[0] ?? '';
		}
		return value ?? '';
	}, [searchParams.cashView]);

	const isCashView = React.useMemo(() => {
		const normalized = typeof cashViewParam === 'string' ? cashViewParam.toLowerCase() : '';
		if (normalized) {
			return ['true', '1', 'cash', 'yes'].includes(normalized);
		}
		return bankId === 'cash' || bankId === 'cash-transactions';
	}, [bankId, cashViewParam]);

	const bankName = React.useMemo(() => {
		if (isCashView) {
			return 'Transações em dinheiro';
		}
		const value = Array.isArray(searchParams.bankName) ? searchParams.bankName[0] : searchParams.bankName;
		if (!value) {
			return 'Banco selecionado';
		}

		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}, [searchParams.bankName, isCashView]);

	const { start, end } = React.useMemo(() => getCurrentMonthBounds(), []);

	const [startDateInput, setStartDateInput] = React.useState(formatDateToBR(start));
	const [endDateInput, setEndDateInput] = React.useState(formatDateToBR(end));

	const [movements, setMovements] = React.useState<MovementRecord[]>([]);
	const [isLoading, setIsLoading] = React.useState(false);
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
	const [isTotalsExpanded, setIsTotalsExpanded] = React.useState(false);
	const [pendingAction, setPendingAction] = React.useState<PendingMovementAction | null>(null);
	const [isProcessingAction, setIsProcessingAction] = React.useState(false);
	const { shouldHideValues } = useValueVisibility();
	const [movementFilter, setMovementFilter] = React.useState<'all' | 'expense' | 'gain'>('all');
	const [monthlyInitialBalanceInCents, setMonthlyInitialBalanceInCents] = React.useState<number | null>(null);
	const movementFilterLabels: Record<typeof movementFilter, string> = {
		all: 'Todos',
		expense: 'Despesas',
		gain: 'Ganhos',
	};

	const formatCurrencyBRL = React.useCallback(
		(valueInCents: number) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}
			return formatCurrencyBRLBase(valueInCents);
		},
		[shouldHideValues],
	);

	// Controla qual movimentação deve aparecer no Drawer e quando ele está aberto
	const [selectedMovement, setSelectedMovement] = React.useState<MovementRecord | null>(null);
	const [isMovementDrawerOpen, setIsMovementDrawerOpen] = React.useState(false);

	// Controla no nome da tag depois de buscado dentro do Firebase
	const [selectedMovementTagName, setSelectedMovementTagName] = React.useState<string | null>(null);

	// Controla no nome do banco depois de buscado dentro do Firebase
	const [selectedMovementBankName, setSelectedMovementBankName] = React.useState<string | null>(null);

	const resolveMovementTypeLabel = React.useCallback((movement?: MovementRecord | null) => {
		if (!movement) {
			return '';
		}
		if (movement.isBankTransfer) {
			if (movement.bankTransferDirection === 'outgoing') {
				return 'Transferência enviada';
			}
			if (movement.bankTransferDirection === 'incoming') {
				return 'Transferência recebida';
			}
			return 'Transferência entre bancos';
		}
		if (movement.isFinanceInvestment) {
			return 'Investimento';
		}
		if (movement.isInvestmentDeposit) {
			return 'Aporte de investimento';
		}
		if (movement.isInvestmentRedemption) {
			return 'Resgate de investimento';
		}
		return movement.type === 'gain' ? 'Ganho' : 'Despesa';
	}, []);

	const handleDateSelect = React.useCallback((formatted: string, type: 'start' | 'end') => {
		if (type === 'start') {
			setStartDateInput(formatted);
		} else {
			setEndDateInput(formatted);
		}
	}, []);

	const fetchMovements = React.useCallback(async () => {
		if (!bankId && !isCashView) {
			setErrorMessage('Nenhum banco foi informado.');
			setMovements([]);
			return;
		}

		const parsedStart = parseDateFromBR(startDateInput);
		const parsedEnd = parseDateFromBR(endDateInput);

		if (!parsedStart || !parsedEnd) {
			setErrorMessage('Informe datas válidas para o período.');
			setMovements([]);
			return;
		}

		const normalizedStart = new Date(parsedStart);
		normalizedStart.setHours(0, 0, 0, 0);

		const normalizedEnd = new Date(parsedEnd);
		normalizedEnd.setHours(23, 59, 59, 999);

		if (normalizedEnd < normalizedStart) {
			setErrorMessage('A data final deve ser maior ou igual à data inicial.');
			setMovements([]);
			return;
		}

		const currentUser = auth.currentUser;
		if (!currentUser) {
			setErrorMessage('Nenhum usuário autenticado foi identificado.');
			setMovements([]);
			return;
		}

		setIsLoading(true);
		setErrorMessage(null);

		try {
			// Buscamos em paralelo as movimentações do banco e os obrigatórios
			const movementsPromise = isCashView
				? getCashMovementsByPeriodFirebase({
						personId: currentUser.uid,
						startDate: normalizedStart,
						endDate: normalizedEnd,
				  })
				: getBankMovementsByPeriodFirebase({
						personId: currentUser.uid,
						bankId,
						startDate: normalizedStart,
						endDate: normalizedEnd,
				  });

			const investmentsPromise = isCashView
				? Promise.resolve(null)
				: getFinanceInvestmentsByPeriodFirebase({
						personId: currentUser.uid,
						bankId,
						startDate: normalizedStart,
						endDate: normalizedEnd,
				  });

			const now = new Date();
			const balancePromise = isCashView
				? Promise.resolve(null)
				: getMonthlyBalanceFirebaseRelatedToUser({
						personId: currentUser.uid,
						bankId,
						year: now.getFullYear(),
						month: now.getMonth() + 1,
				  });

			const [result, investmentsRes, mandatoryExpensesRes, mandatoryGainsRes, monthlyBalanceRes] = await Promise.all([
				movementsPromise,
				investmentsPromise,
				getMandatoryExpensesWithRelationsFirebase(currentUser.uid),
				getMandatoryGainsWithRelationsFirebase(currentUser.uid),
				balancePromise,
			]);
			if (!result?.success || !result.data) {
				setMovements([]);
				setErrorMessage(
					typeof result?.error === 'string'
						? result.error
						: 'Erro ao carregar as movimentações do período selecionado.',
				);
				return;
			}

			const expensesArray: any[] = Array.isArray(result.data.expenses) ? result.data.expenses : [];
			const gainsArray: any[] = Array.isArray(result.data.gains) ? result.data.gains : [];
			const investmentsArray: any[] =
				!isCashView && investmentsRes?.success && Array.isArray(investmentsRes.data)
					? investmentsRes.data
					: [];

			// Mapeia os IDs de despesas/ganhos que estão vinculados a obrigatórios no ciclo atual
			const lockedExpenseIds = new Set<string>(
				mandatoryExpensesRes?.success && Array.isArray(mandatoryExpensesRes.data)
					? (mandatoryExpensesRes.data as Array<Record<string, any>>)
						.filter(item =>
							item &&
							typeof item.lastPaymentExpenseId === 'string' &&
							isCycleKeyCurrent(typeof item.lastPaymentCycle === 'string' ? item.lastPaymentCycle : undefined),
						)
						.map(item => item.lastPaymentExpenseId as string)
					: [],
			);

			const lockedGainIds = new Set<string>(
				mandatoryGainsRes?.success && Array.isArray(mandatoryGainsRes.data)
					? (mandatoryGainsRes.data as Array<Record<string, any>>)
						.filter(item =>
							item &&
							typeof item.lastReceiptGainId === 'string' &&
							isCycleKeyCurrent(typeof item.lastReceiptCycle === 'string' ? item.lastReceiptCycle : undefined),
						)
						.map(item => item.lastReceiptGainId as string)
					: [],
			);

			const expenseMovements: MovementRecord[] = expensesArray.map(expense => ({
				id: typeof expense?.id === 'string' ? expense.id : `expense-${Math.random()}`,
				name:
					typeof expense?.name === 'string' && expense.name.trim().length > 0
						? expense.name.trim()
						: 'Despesa sem nome',
				valueInCents: typeof expense?.valueInCents === 'number' ? expense.valueInCents : 0,
				type: 'expense',
				date: normalizeDate(expense?.date ?? expense?.createdAt ?? null),
				tagId: typeof expense?.tagId === 'string' ? expense.tagId : null,
				bankId: typeof expense?.bankId === 'string' ? expense.bankId : null,
				personId: typeof expense?.personId === 'string' ? expense.personId : null,
				explanation: typeof expense?.explanation === 'string' ? expense.explanation : null,
				moneyFormat: typeof expense?.moneyFormat === 'boolean' ? expense.moneyFormat : null,
				isFromMandatory: typeof expense?.id === 'string' ? lockedExpenseIds.has(expense.id) : false,
				isCashRescue: Boolean(expense?.isCashRescue),
				cashRescueSourceBankName:
					typeof expense?.bankNameSnapshot === 'string' ? expense.bankNameSnapshot : null,
				isBankTransfer: Boolean(expense?.isBankTransfer),
				bankTransferPairId:
					typeof expense?.bankTransferPairId === 'string' ? expense.bankTransferPairId : null,
				bankTransferDirection: normalizeTransferDirection(expense?.bankTransferDirection),
				bankTransferSourceBankId:
					typeof expense?.bankTransferSourceBankId === 'string' ? expense.bankTransferSourceBankId : null,
				bankTransferTargetBankId:
					typeof expense?.bankTransferTargetBankId === 'string' ? expense.bankTransferTargetBankId : null,
				bankTransferSourceBankNameSnapshot:
					typeof expense?.bankTransferSourceBankNameSnapshot === 'string'
						? expense.bankTransferSourceBankNameSnapshot
						: null,
				bankTransferTargetBankNameSnapshot:
					typeof expense?.bankTransferTargetBankNameSnapshot === 'string'
						? expense.bankTransferTargetBankNameSnapshot
						: null,
				bankTransferExpenseId:
					typeof expense?.bankTransferExpenseId === 'string' ? expense.bankTransferExpenseId : null,
				bankTransferGainId:
					typeof expense?.bankTransferGainId === 'string' ? expense.bankTransferGainId : null,
				isInvestmentDeposit: Boolean(expense?.isInvestmentDeposit),
				investmentId: typeof expense?.investmentId === 'string' ? expense.investmentId : null,
				investmentNameSnapshot:
					typeof expense?.investmentNameSnapshot === 'string' ? expense.investmentNameSnapshot : null,
			}));

			const gainMovements: MovementRecord[] = gainsArray.map(gain => ({
				id: typeof gain?.id === 'string' ? gain.id : `gain-${Math.random()}`,
				name:
					typeof gain?.name === 'string' && gain.name.trim().length > 0
						? gain.name.trim()
						: 'Ganho sem nome',
				valueInCents: typeof gain?.valueInCents === 'number' ? gain.valueInCents : 0,
				type: 'gain',
				date: normalizeDate(gain?.date ?? gain?.createdAt ?? null),
				tagId: typeof gain?.tagId === 'string' ? gain.tagId : null,
				bankId: typeof gain?.bankId === 'string' ? gain.bankId : null,
				personId: typeof gain?.personId === 'string' ? gain.personId : null,
				explanation: typeof gain?.explanation === 'string' ? gain.explanation : null,
				paymentFormats: Array.isArray(gain?.paymentFormats)
					? (gain?.paymentFormats as unknown[]).filter(item => typeof item === 'string') as string[]
					: null,
				moneyFormat: typeof gain?.moneyFormat === 'boolean' ? gain.moneyFormat : null,
				isFromMandatory: typeof gain?.id === 'string' ? lockedGainIds.has(gain.id) : false,
				isCashRescue: Boolean(gain?.isCashRescue),
				cashRescueSourceBankName:
					typeof gain?.bankNameSnapshot === 'string' ? gain.bankNameSnapshot : null,
				isBankTransfer: Boolean(gain?.isBankTransfer),
				bankTransferPairId: typeof gain?.bankTransferPairId === 'string' ? gain.bankTransferPairId : null,
				bankTransferDirection: normalizeTransferDirection(gain?.bankTransferDirection),
				bankTransferSourceBankId:
					typeof gain?.bankTransferSourceBankId === 'string' ? gain.bankTransferSourceBankId : null,
				bankTransferTargetBankId:
					typeof gain?.bankTransferTargetBankId === 'string' ? gain.bankTransferTargetBankId : null,
				bankTransferSourceBankNameSnapshot:
					typeof gain?.bankTransferSourceBankNameSnapshot === 'string'
						? gain.bankTransferSourceBankNameSnapshot
						: null,
				bankTransferTargetBankNameSnapshot:
					typeof gain?.bankTransferTargetBankNameSnapshot === 'string'
						? gain.bankTransferTargetBankNameSnapshot
						: null,
				bankTransferExpenseId:
					typeof gain?.bankTransferExpenseId === 'string' ? gain.bankTransferExpenseId : null,
				bankTransferGainId: typeof gain?.bankTransferGainId === 'string' ? gain.bankTransferGainId : null,
				isInvestmentRedemption: Boolean(gain?.isInvestmentRedemption),
				investmentNameSnapshot:
					typeof gain?.investmentNameSnapshot === 'string' ? gain.investmentNameSnapshot : null,
				investmentId: typeof gain?.investmentId === 'string' ? gain.investmentId : null,
			}));

			const investmentMovements: MovementRecord[] = investmentsArray.map(investment => ({
				id: typeof investment?.id === 'string' ? investment.id : `investment-${Math.random()}`,
				name:
					typeof investment?.name === 'string' && investment.name.trim().length > 0
						? investment.name.trim()
						: 'Investimento registrado',
				valueInCents:
					typeof investment?.initialValueInCents === 'number' ? investment.initialValueInCents : 0,
				type: 'expense',
				date: normalizeDate(investment?.date ?? investment?.createdAt ?? null),
				tagId: null,
				bankId: typeof investment?.bankId === 'string' ? investment.bankId : null,
				personId: typeof investment?.personId === 'string' ? investment.personId : null,
				explanation:
					typeof investment?.description === 'string' && investment.description.trim().length > 0
						? investment.description
						: null,
				moneyFormat: null,
				isFromMandatory: false,
				isCashRescue: false,
				cashRescueSourceBankName: null,
				isFinanceInvestment: true,
				investmentId: typeof investment?.id === 'string' ? investment.id : null,
				investmentBankNameSnapshot:
					typeof investment?.bankNameSnapshot === 'string' ? investment.bankNameSnapshot : null,
			}));

			const combinedMovements = [...expenseMovements, ...gainMovements, ...investmentMovements].sort((a, b) => {
				const dateA = a.date ? a.date.getTime() : 0;
				const dateB = b.date ? b.date.getTime() : 0;
				return dateB - dateA;
			});

			setMovements(combinedMovements);
			if (!isCashView) {
				const initialBalanceValue =
					monthlyBalanceRes && monthlyBalanceRes.success && monthlyBalanceRes.data
						? monthlyBalanceRes.data.valueInCents
						: null;
				setMonthlyInitialBalanceInCents(
					typeof initialBalanceValue === 'number' ? initialBalanceValue : null,
				);
			} else {
				setMonthlyInitialBalanceInCents(null);
			}
		} catch (error) {
			console.error('Erro ao buscar movimentações do banco:', error);
			setErrorMessage('Erro inesperado ao carregar as movimentações.');
			setMovements([]);
			setMonthlyInitialBalanceInCents(null);
		} finally {
			setIsLoading(false);
		}
	}, [bankId, endDateInput, isCashView, startDateInput]);

	useFocusEffect(
		React.useCallback(() => {
			void fetchMovements();
		}, [fetchMovements]),
	);

	// UseFocusEffect visualizando o componente da tag dentro do Drawer, para
	// assim buscar pelo ID da tag e mostrar o nome correto, consultando no
	// Firebase a função getTagDataFirebase
	React.useEffect(() => {

		// Verifica se há uma movimentação selecionada e se ela possui tagId
		if (!selectedMovement || !selectedMovement.tagId) {
			return;
		} else {
			const fetchTagName = async () => {
				try {

					// Busca os dados da tag pelo ID
					const tagResult = await getTagDataFirebase(selectedMovement.tagId!);

					if (tagResult.success && tagResult.data) {

						// Atualiza o nome da tag com o valor buscado se houver
						// um sucesso na busca
						setSelectedMovementTagName(tagResult.data.name);

					} else {

						setSelectedMovementTagName(null);

					}
				} catch (error) {
					console.error('Erro ao buscar dados da tag:', error);
					setSelectedMovementTagName(null);
				};
			};
			void fetchTagName();
		}
	}, [selectedMovement, setSelectedMovementTagName]);

	// Da mesma forma que o useEffect da tag, é feito para o banco, sempre
	// visualizando o componente do Drawer e buscando o nome do banco pelo ID
	React.useEffect(() => {

		// Verifica se há uma movimentação selecionada e se ela possui bankId
		if (!selectedMovement || !selectedMovement.bankId) {
			return;
		} else {

			const fetchBankName = async () => {

				try {

					// Busca os dados do banco pelo ID
					const bankResult = await getBankDataFirebase(selectedMovement.bankId!);

					if (bankResult.success && bankResult.data) {

						// Atualiza o nome do banco com o valor buscado se houver
						// um sucesso na busca
						setSelectedMovementBankName(bankResult.data.name);
					} else {

						setSelectedMovementBankName(null);

					}

				} catch (error) {
					console.error('Erro ao buscar dados do banco:', error);
					setSelectedMovementBankName(null);
				};
			}
			void fetchBankName();
		}
	}, [selectedMovement, setSelectedMovementBankName]);


	const visibleMovements = React.useMemo(() => {
		if (movementFilter === 'all') {
			return movements;
		}
		return movements.filter(movement => movement.type === movementFilter);
	}, [movementFilter, movements]);

	const totals = React.useMemo(() => {
		return visibleMovements.reduce(
			(acc, movement) => {
				if (movement.type === 'gain') {
					acc.totalGains += movement.valueInCents;
				} else {
					acc.totalExpenses += movement.valueInCents;
				}
				return acc;
			},
			{ totalExpenses: 0, totalGains: 0 },
		);
	}, [visibleMovements]);

	const balanceInCents = totals.totalGains - totals.totalExpenses;

	const totalDeltaAllMovementsInCents = React.useMemo(() => {
		return movements.reduce((acc, movement) => {
			return movement.type === 'gain' ? acc + movement.valueInCents : acc - movement.valueInCents;
		}, 0);
	}, [movements]);

	const bankCurrentBalanceInCents = React.useMemo(() => {
		if (typeof monthlyInitialBalanceInCents !== 'number') {
			return null;
		}
		return monthlyInitialBalanceInCents + totalDeltaAllMovementsInCents;
	}, [monthlyInitialBalanceInCents, totalDeltaAllMovementsInCents]);

	const totalsPieSlices = React.useMemo(() => {
		const slices: Array<{
			key: string;
			label: string;
			color: string;
			value: number;
			rawInCents: number;
		}> = [];

		if (totals.totalGains > 0) {
			slices.push({
				key: 'gains',
				label: 'Ganhos',
				color: PIE_TOTAL_COLORS.gains,
				value: Number((totals.totalGains / 100).toFixed(2)),
				rawInCents: totals.totalGains,
			});
		}

		if (totals.totalExpenses > 0) {
			slices.push({
				key: 'expenses',
				label: 'Despesas',
				color: PIE_TOTAL_COLORS.expenses,
				value: Number((totals.totalExpenses / 100).toFixed(2)),
				rawInCents: totals.totalExpenses,
			});
		}

		return slices;
	}, [totals.totalExpenses, totals.totalGains]);

	const totalsPieChartData = React.useMemo(
		() =>
			totalsPieSlices.map(slice => ({
				value: slice.value,
				color: slice.color,
				text: slice.label,
			})),
		[totalsPieSlices],
	);

	const hasTotalsPieData = totalsPieChartData.length > 0;

	const handleCloseActionModal = React.useCallback(() => {
		if (isProcessingAction) {
			return;
		}
		setPendingAction(null);
	}, [isProcessingAction]);

	// Abre o Drawer com os detalhes da movimentação tocada duas vezes
	const handleMovementDoubleTap = React.useCallback((movement: MovementRecord) => {
		setSelectedMovement(movement);
		setIsMovementDrawerOpen(true);
	}, []);

	// Fecha o Drawer e limpa a movimentação para evitar dados antigos
	const handleCloseMovementDrawer = React.useCallback(() => {
		setIsMovementDrawerOpen(false);
		setSelectedMovement(null);
	}, []);

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) {
			return;
		}

		if (pendingAction.movement.isBankTransfer) {
			showFloatingAlert({
				message:
					'Transferências entre bancos são criadas automaticamente e não podem ser editadas ou excluídas manualmente.',
				action: 'warning',
				position: 'bottom',
			});
			setPendingAction(null);
			return;
		}

		if (pendingAction.type === 'edit') {
			// Impede edição de movimentações originadas de obrigatórios
			if (pendingAction.movement.isFromMandatory) {
				showFloatingAlert({
					message:
						pendingAction.movement.type === 'gain'
							? 'Este ganho está vinculado a um ganho obrigatório deste mês. Edite/reivindique pela tela de Ganhos obrigatórios.'
							: 'Esta despesa está vinculada a um gasto obrigatório deste mês. Edite/reivindique pela tela de Gastos obrigatórios.',
					action: 'warning',
					position: 'bottom',
				});
				setPendingAction(null);
				return;
			}
			if (pendingAction.movement.isCashRescue) {
				showFloatingAlert({
					message: 'Saques em dinheiro não podem ser editados manualmente.',
					action: 'warning',
					position: 'bottom',
				});
				setPendingAction(null);
				return;
			}
			if (pendingAction.movement.isFinanceInvestment) {
				showFloatingAlert({
					message: 'Edite este investimento pela tela de investimentos.',
					action: 'warning',
					position: 'bottom',
				});
				setPendingAction(null);
				return;
			}
			if (pendingAction.movement.isInvestmentRedemption) {
				showFloatingAlert({
					message: 'Resgates de investimento são controlados pela tela de investimentos.',
					action: 'warning',
					position: 'bottom',
				});
				setPendingAction(null);
				return;
			}
			const encodedId = encodeURIComponent(pendingAction.movement.id);
			if (pendingAction.movement.type === 'gain') {
				router.push({
					pathname: '/add-register-gain',
					params: { gainId: encodedId },
				});
			} else {
				router.push({
					pathname: '/add-register-expenses',
					params: { expenseId: encodedId },
				});
			}
			setPendingAction(null);
			return;
		}

		if (pendingAction.type === 'revert-cash-rescue') {
			setIsProcessingAction(true);
			try {
				const result = await deleteCashRescueFirebase(pendingAction.movement.id);
				if (!result.success) {
					showFloatingAlert({
						message: 'Não foi possível reivindicar o saque. Tente novamente.',
						action: 'error',
						position: 'bottom',
					});
					return;
				}

				showFloatingAlert({
					message: 'Saque reivindicado e removido com sucesso!',
					action: 'success',
					position: 'bottom',
				});
				await fetchMovements();
			} catch (error) {
				console.error('Erro ao reivindicar saque em dinheiro:', error);
				showFloatingAlert({
					message: 'Erro inesperado ao reivindicar o saque.',
					action: 'error',
					position: 'bottom',
				});
			} finally {
				setIsProcessingAction(false);
				setPendingAction(null);
			}
			return;
		}

		setIsProcessingAction(true);

		try {
			// Evita exclusão direta de lançamentos vinculados a obrigatórios (para não quebrar o vínculo)
			if (pendingAction.movement.isFromMandatory && pendingAction.type === 'delete') {
				showFloatingAlert({
					message:
						pendingAction.movement.type === 'gain'
							? 'Exclusão bloqueada: este ganho pertence a um ganho obrigatório deste mês. Use a ação "Reivindicar" na tela de Ganhos obrigatórios.'
							: 'Exclusão bloqueada: esta despesa pertence a um gasto obrigatório deste mês. Use a ação "Reivindicar" na tela de Gastos obrigatórios.',
					action: 'warning',
					position: 'bottom',
				});
				return;
			}
			if (pendingAction.movement.isCashRescue) {
				showFloatingAlert({
					message: 'Saques em dinheiro não podem ser excluídos manualmente.',
					action: 'warning',
					position: 'bottom',
				});
				return;
			}
			if (pendingAction.movement.isFinanceInvestment) {
				showFloatingAlert({
					message: 'Use a tela de investimentos para remover ou ajustar este valor.',
					action: 'warning',
					position: 'bottom',
				});
				return;
			}
			if (pendingAction.movement.isInvestmentRedemption) {
				showFloatingAlert({
					message: 'Use a tela de investimentos para remover ou ajustar este resgate.',
					action: 'warning',
					position: 'bottom',
				});
				return;
			}
			let result: { success: boolean } | undefined;
			if (pendingAction.movement.type === 'gain') {
				result = await deleteGainFirebase(pendingAction.movement.id);
			} else {
				result = await deleteExpenseFirebase(pendingAction.movement.id);
			}

			if (!result?.success) {
				showFloatingAlert({
					message: 'Não foi possível excluir a movimentação. Tente novamente.',
					action: 'error',
					position: 'bottom',
				});
				return;
			}

			showFloatingAlert({
				message: 'Movimentação excluída com sucesso!',
				action: 'success',
				position: 'bottom',
			});
			await fetchMovements();
		} catch (error) {
			console.error('Erro ao remover movimentação:', error);
			showFloatingAlert({
				message: 'Erro inesperado ao excluir a movimentação.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsProcessingAction(false);
			setPendingAction(null);
		}
	}, [fetchMovements, pendingAction]);

	const actionModalCopy = React.useMemo(() => {
		if (!pendingAction) {
			return {
				title: '',
				message: '',
				confirmLabel: 'Confirmar',
				confirmAction: 'primary' as 'primary' | 'negative',
			};
		}

		const movementName = pendingAction.movement.name || 'movimentação selecionada';
		const movementTypeLabel = pendingAction.movement.isBankTransfer
			? 'transferência'
			: pendingAction.movement.type === 'gain'
				? 'ganho'
				: 'despesa';

		if (pendingAction.type === 'edit') {
			return {
				title: 'Editar movimentação',
				message: `Deseja editar o ${movementTypeLabel} "${movementName}"?`,
				confirmLabel: 'Editar',
				confirmAction: 'primary' as const,
			};
		}

		if (pendingAction.type === 'revert-cash-rescue') {
			const bankName = pendingAction.movement.cashRescueSourceBankName ?? 'não identificado';
			return {
				title: 'Reivindicar saque',
				message: `Deseja reivindicar o saque realizado no banco ${bankName}?`,
				confirmLabel: 'Reivindicar',
				confirmAction: 'primary' as const,
			};
		}

		return {
			title: 'Excluir movimentação',
			message: `Tem certeza de que deseja excluir o ${movementTypeLabel} "${movementName}"? Essa ação não pode ser desfeita.`,
			confirmLabel: 'Excluir',
			confirmAction: 'negative' as const,
		};
	}, [pendingAction]);

	const isModalOpen = Boolean(pendingAction);
	const confirmButtonAction = actionModalCopy.confirmAction;
	const screenTitle = isCashView ? 'Movimentações em dinheiro' : 'Movimentações do banco';

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
			<GestureHandlerRootView style={{ flex: 1, width: '100%', backgroundColor: surfaceBackground }}>
				<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
					<FloatingAlertViewport />

					<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
						<View
							className={`absolute top-0 left-0 right-0 ${cardBackground}`}
							style={{ height: heroHeight }}
						>
							<Image
								source={LoginWallpaper}
								alt="Background da tela de movimentações do banco"
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
								<BankMovementsIllustration width="40%" height="40%" className="opacity-90" />
							</VStack>
						</View>

						<ScrollView
							keyboardShouldPersistTaps="handled"
							keyboardDismissMode="on-drag"
							className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
							style={{ marginTop: heroHeight - 64 }}
							contentContainerStyle={{ paddingBottom: 32 }}
						>
							<VStack className="justify-between mt-4">
								<View className={`${fieldContainerCardClassName} px-4 py-4 mb-4`}>
									<Text className={`${bodyText} text-sm leading-6`}>
										Selecione um período para visualizar todas as movimentações de {bankName}. Aqui
										você pode verificar ganhos, despesas e o saldo geral do período escolhido.
									</Text>
								</View>

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Filtros do período</Text>
									<View className={`${fieldContainerCardClassName} px-4 py-4`}>
										<VStack className="gap-4">
											<VStack>
												<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Data inicial</Text>
												<DatePickerField
													value={startDateInput}
													onChange={formatted => handleDateSelect(formatted, 'start')}
													triggerClassName={fieldContainerClassName}
													inputClassName={inputField}
													placeholder="Selecione a data inicial"
													isDisabled={isLoading}
												/>
											</VStack>

											<VStack>
												<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Data final</Text>
												<DatePickerField
													value={endDateInput}
													onChange={formatted => handleDateSelect(formatted, 'end')}
													triggerClassName={fieldContainerClassName}
													inputClassName={inputField}
													placeholder="Selecione a data final"
													isDisabled={isLoading}
												/>
											</VStack>

											<VStack>
												<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
													Tipo de movimentação
												</Text>
												<Select
													selectedValue={movementFilter}
													onValueChange={value =>
														setMovementFilter(
															(value as 'all' | 'expense' | 'gain') ?? 'all',
														)
													}
												>
													<SelectTrigger
														variant="outline"
														size="md"
														className={fieldContainerClassName}
													>
														<SelectInput
															placeholder="Selecione o tipo"
															value={movementFilterLabels[movementFilter]}
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
															<SelectItem label="Todos" value="all" />
															<SelectItem label="Despesas" value="expense" />
															<SelectItem label="Ganhos" value="gain" />
														</SelectContent>
													</SelectPortal>
												</Select>
											</VStack>

											<Button
												className={submitButtonClassName}
												onPress={() => {
													if (!isLoading) {
														void fetchMovements();
													}
												}}
												isDisabled={
													isLoading ||
													!parseDateFromBR(startDateInput) ||
													!parseDateFromBR(endDateInput)
												}
											>
												{isLoading ? (
													<>
														<ButtonSpinner />
														<ButtonText>Carregando movimentações</ButtonText>
													</>
												) : (
													<ButtonText>Buscar movimentações</ButtonText>
												)}
											</Button>
										</VStack>
									</View>
								</VStack>

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Resumo do período</Text>
									<View className={`${fieldContainerCardClassName} px-4 py-4`}>
										<VStack className="gap-3">
											<HStack className="justify-between">
												<Text className={bodyText}>Ganhos</Text>
												<Text className="font-semibold text-emerald-600 dark:text-emerald-400">
													{formatCurrencyBRL(totals.totalGains)}
												</Text>
											</HStack>
											<HStack className="justify-between">
												<Text className={bodyText}>Despesas</Text>
												<Text className="font-semibold text-red-600 dark:text-red-400">
													{formatCurrencyBRL(totals.totalExpenses)}
												</Text>
											</HStack>
											<HStack className="justify-between">
												<Text className={bodyText}>Saldo</Text>
												<Text
													className={
														balanceInCents >= 0
															? 'font-semibold text-emerald-600 dark:text-emerald-400'
															: 'font-semibold text-red-600 dark:text-red-400'
													}
												>
													{formatCurrencyBRL(balanceInCents)}
												</Text>
											</HStack>
											{!isCashView && (
												<HStack className="justify-between">
													<Text className={bodyText}>Saldo atual do banco</Text>
													<Text
														className={
															typeof bankCurrentBalanceInCents === 'number'
																? bankCurrentBalanceInCents >= 0
																	? 'font-semibold text-emerald-600 dark:text-emerald-400'
																	: 'font-semibold text-red-600 dark:text-red-400'
																: bodyText
														}
													>
														{typeof bankCurrentBalanceInCents === 'number'
															? formatCurrencyBRL(bankCurrentBalanceInCents)
															: 'Saldo não registrado'}
													</Text>
												</HStack>
											)}
										</VStack>
									</View>
								</VStack>

								{errorMessage && (
									<View className={`${fieldContainerCardClassName} px-4 py-4 mb-4`}>
										<Text className="text-sm text-red-600 dark:text-red-400">{errorMessage}</Text>
									</View>
								)}

								<VStack className="mb-4">
									<View className={`${fieldContainerCardClassName} px-4 py-4`}>
										<HStack className="items-center justify-between">
											<Text className={`${headingText} text-lg font-semibold`}>
												Comparativo de totais
											</Text>
											<TouchableOpacity
												activeOpacity={0.85}
												onPress={() => setIsTotalsExpanded(prev => !prev)}
											>
												<Text className={`${helperText} text-sm`}>
													{isTotalsExpanded ? 'Ocultar' : 'Expandir'}
												</Text>
											</TouchableOpacity>
										</HStack>

										<Text className={`${helperText} mt-1 text-sm`}>
											Baseado nos valores filtrados para {bankName}.
										</Text>

										{isTotalsExpanded ? (
											hasTotalsPieData ? (
												<>
													<View className="mt-4 items-center">
														<PieChart
															data={totalsPieChartData}
															radius={90}
															showText={false}
															isAnimated
														/>
													</View>

													<View className="mt-4 gap-3">
														{totalsPieSlices.map(slice => (
															<HStack
																key={slice.key}
																className="items-center justify-between rounded-2xl px-3 py-3"
																style={{ borderWidth: 1, borderColor: legendBorderColor }}
															>
																<HStack className="items-center">
																	<View
																		style={{
																			width: 10,
																			height: 10,
																			borderRadius: 5,
																			backgroundColor: slice.color,
																		}}
																	/>
																	<Text className={`${bodyText} ml-2`}>
																		{slice.label}
																	</Text>
																</HStack>
																<Text className={`${headingText} font-semibold`}>
																	{formatCurrencyBRL(slice.rawInCents)}
																</Text>
															</HStack>
														))}
													</View>
												</>
											) : (
												<Text className={`${helperText} mt-4 text-sm`}>
													Nenhum ganho ou despesa foi encontrado dentro do período selecionado.
												</Text>
											)
										) : (
											<Text className={`${helperText} mt-4 text-sm`}>
												Toque em &quot;Expandir&quot; para visualizar o gráfico com os totais
												do período.
											</Text>
										)}
									</View>
								</VStack>

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
										Movimentações do período
									</Text>

									{isLoading ? (
										<View className={`${fieldContainerCardClassName} px-4 py-4`}>
											<Text className={`${bodyText} text-sm`}>
												Carregando movimentações...
											</Text>
										</View>
									) : visibleMovements.length === 0 ? (
										<View className={`${fieldContainerCardClassName} px-4 py-4`}>
											<Text className={`${helperText} text-sm`}>
												Nenhuma movimentação foi registrada para o período informado.
											</Text>
										</View>
									) : (
										visibleMovements.map(movement => (
											<TapGestureHandler
												key={movement.id}
												numberOfTaps={2}
												onActivated={() => handleMovementDoubleTap(movement)}
											>
												<View>
													<VStack className={`${fieldContainerCardClassName} px-4 py-4 mb-4`}>
														<HStack className="items-center justify-between pt-1">
															<Text className={`${headingText} text-lg font-semibold`}>
																{movement.name}
															</Text>
															<Text
																className={
																	movement.type === 'gain'
																		? 'font-semibold text-emerald-600 dark:text-emerald-400'
																		: 'font-semibold text-red-600 dark:text-red-400'
																}
															>
																{formatCurrencyBRL(movement.valueInCents)}
															</Text>
														</HStack>
														<Text className={`${helperText} mt-1 text-xs`}>
															{formatMovementDate(movement.date)}
														</Text>
														<Text className={`${helperText} mt-1 text-xs`}>
															Tipo: {resolveMovementTypeLabel(movement)}
														</Text>
														{movement.isFromMandatory && (
															<>
																<Text className="mt-1 text-[11px] text-yellow-600 dark:text-yellow-400">
																	Vinculado a {movement.type === 'gain' ? 'ganho' : 'gasto'} obrigatório
																	(mês atual).
																</Text>
																<Text className={`${helperText} mt-1 text-[9px]`}>
																	Use a tela de{' '}
																	{movement.type === 'gain'
																		? 'Ganhos obrigatórios'
																		: 'Gastos obrigatórios'}
																	.
																</Text>
															</>
														)}
														{movement.isCashRescue && (
															<>
																<Text className="mt-1 text-[11px] text-sky-700 dark:text-sky-400">
																	{`${
																		isCashView
																			? 'Valor sacado do banco'
																			: 'Movimentação de saque do banco'
																	} ${movement.cashRescueSourceBankName ?? 'não identificado'}.`}
																</Text>
																<Text className={`${helperText} mt-1 text-[9px]`}>
																	Este registro não pode ser editado ou excluído manualmente.
																</Text>
															</>
														)}
														{movement.isBankTransfer && (
															<>
																<Text className="mt-1 text-[11px] text-sky-700 dark:text-sky-400">
																	{movement.bankTransferDirection === 'outgoing'
																		? `Transferência enviada para ${
																				movement.bankTransferTargetBankNameSnapshot ??
																				'banco de destino'
																			}.`
																		: `Transferência recebida de ${
																				movement.bankTransferSourceBankNameSnapshot ??
																				'banco de origem'
																			}.`}
																</Text>
																<Text className={`${helperText} mt-1 text-[9px]`}>
																	Movimentação criada automaticamente para manter os saldos entre
																	bancos.
																</Text>
															</>
														)}
														{movement.isFinanceInvestment && (
															<>
																<Text className="mt-1 text-[11px] text-indigo-700 dark:text-indigo-300">
																	Valor destinado a um investimento neste banco.
																</Text>
																<Text className={`${helperText} mt-1 text-[9px]`}>
																	Edite ou cancele o investimento na lista de investimentos.
																</Text>
															</>
														)}
														{movement.isInvestmentRedemption && (
															<>
																<Text className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
																	{movement.investmentNameSnapshot
																		? `Resgate do investimento "${movement.investmentNameSnapshot}".`
																		: 'Resgate de investimento registrado neste banco.'}
																</Text>
																<Text className={`${helperText} mt-1 text-[9px]`}>
																	O ajuste do investimento foi feito automaticamente.
																</Text>
															</>
														)}
														{movement.isInvestmentDeposit && (
															<>
																<Text className="mt-1 text-[11px] text-indigo-700 dark:text-indigo-300">
																	{movement.investmentNameSnapshot
																		? `Aporte no investimento "${movement.investmentNameSnapshot}".`
																		: 'Aporte registrado automaticamente neste banco.'}
																</Text>
																<Text className={`${helperText} mt-1 text-[9px]`}>
																	Edite ou cancele o aporte pela lista de investimentos.
																</Text>
															</>
														)}

														<Divider className="my-4" />

														<View className="flex-row items-center justify-end gap-2">
															<Button
																size="xl"
																variant="link"
																action="primary"
																isDisabled={
																	movement.isFromMandatory ||
																	movement.isCashRescue ||
																	movement.isBankTransfer ||
																	movement.isFinanceInvestment ||
																	movement.isInvestmentRedemption ||
																	movement.isInvestmentDeposit
																}
																onPress={() => {
																	if (movement.isFromMandatory) {
																		showFloatingAlert({
																			message:
																				movement.type === 'gain'
																					? 'Este ganho pertence a um ganho obrigatório deste mês. Para alterar, use a tela de Ganhos obrigatórios.'
																					: 'Esta despesa pertence a um gasto obrigatório deste mês. Para alterar, use a tela de Gastos obrigatórios.',
																			action: 'warning',
																			position: 'bottom',
																		});
																		return;
																	}
																	if (movement.isCashRescue) {
																		showFloatingAlert({
																			message:
																				'Este lançamento representa um saque em dinheiro e não pode ser editado manualmente.',
																			action: 'warning',
																			position: 'bottom',
																		});
																		return;
																	}
																	if (movement.isBankTransfer) {
																		showFloatingAlert({
																			message:
																				'Transferências são registradas automaticamente e não podem ser editadas manualmente.',
																			action: 'warning',
																			position: 'bottom',
																		});
																		return;
																	}
																	if (movement.isFinanceInvestment) {
																		showFloatingAlert({
																			message:
																				'Edite este lançamento diretamente na lista de investimentos.',
																			action: 'warning',
																			position: 'bottom',
																		});
																		return;
																	}
																	if (movement.isInvestmentRedemption) {
																		showFloatingAlert({
																			message:
																				'Resgates de investimento são controlados pela tela de investimentos.',
																			action: 'warning',
																			position: 'bottom',
																		});
																		return;
																	}
																	if (movement.isInvestmentDeposit) {
																		showFloatingAlert({
																			message:
																				'Aportes de investimento são controlados pela tela de investimentos.',
																			action: 'warning',
																			position: 'bottom',
																		});
																		return;
																	}
																	setPendingAction({ type: 'edit', movement });
																}}
															>
																<ButtonIcon as={EditIcon} />
															</Button>
															{movement.isCashRescue && (
																<Button
																	size="xl"
																	variant="link"
																	action="secondary"
																	onPress={() =>
																		setPendingAction({
																			type: 'revert-cash-rescue',
																			movement,
																		})
																	}
																>
																	<ButtonText>Reivindicar saque</ButtonText>
																</Button>
															)}
															<Button
																size="xl"
																variant="link"
																action="negative"
																isDisabled={
																	movement.isFromMandatory ||
																	movement.isCashRescue ||
																	movement.isBankTransfer ||
																	movement.isFinanceInvestment ||
																	movement.isInvestmentRedemption ||
																	movement.isInvestmentDeposit
																}
																onPress={() => {
																	if (movement.isFromMandatory) {
																		showFloatingAlert({
																			message:
																				movement.type === 'gain'
																					? 'Este ganho está vinculado a um ganho obrigatório deste mês. Use "Reivindicar" na tela de Ganhos obrigatórios para desfazer.'
																					: 'Esta despesa está vinculada a um gasto obrigatório deste mês. Use "Reivindicar" na tela de Gastos obrigatórios para desfazer.',
																			action: 'warning',
																			position: 'bottom',
																		});
																		return;
																	}
																	if (movement.isCashRescue) {
																		showFloatingAlert({
																			message:
																				'Este lançamento representa um saque em dinheiro e não pode ser removido manualmente.',
																			action: 'warning',
																			position: 'bottom',
																		});
																		return;
																	}
																	if (movement.isBankTransfer) {
																		showFloatingAlert({
																			message:
																				'Transferências não podem ser removidas manualmente para manter os saldos alinhados.',
																			action: 'warning',
																			position: 'bottom',
																		});
																		return;
																	}
																	if (movement.isFinanceInvestment) {
																		showFloatingAlert({
																			message:
																				'Remova ou ajuste este valor pela tela de investimentos.',
																			action: 'warning',
																			position: 'bottom',
																		});
																		return;
																	}
																	if (movement.isInvestmentRedemption) {
																		showFloatingAlert({
																			message:
																				'Resgates de investimento devem ser ajustados pela tela de investimentos.',
																			action: 'warning',
																			position: 'bottom',
																		});
																		return;
																	}
																	if (movement.isInvestmentDeposit) {
																		showFloatingAlert({
																			message:
																				'Aportes de investimento são controlados pela tela de investimentos.',
																			action: 'warning',
																			position: 'bottom',
																		});
																		return;
																	}
																	setPendingAction({ type: 'delete', movement });
																}}
															>
																<ButtonIcon as={TrashIcon} />
															</Button>
														</View>
													</VStack>
												</View>
											</TapGestureHandler>
										))
									)}
								</VStack>
							</VStack>
						</ScrollView>
					</View>

					<View
						style={{
							marginHorizontal: -18,
							paddingBottom: 0,
							flexShrink: 0,
						}}
					>
						<Navigator defaultValue={0} />
					</View>

					<Modal isOpen={isModalOpen} onClose={handleCloseActionModal}>
						<ModalBackdrop />
						<ModalContent className="max-w-[360px] rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
							<ModalHeader>
								<Heading size="lg" className={headingText}>
									{actionModalCopy.title}
								</Heading>
								<ModalCloseButton onPress={handleCloseActionModal} />
							</ModalHeader>
							<ModalBody>
								<Text className={bodyText}>{actionModalCopy.message}</Text>
							</ModalBody>
							<ModalFooter className="gap-3">
								<Button
									variant="outline"
									onPress={handleCloseActionModal}
									isDisabled={isProcessingAction}
								>
									<ButtonText>Cancelar</ButtonText>
								</Button>
								<Button
									variant="solid"
									action={confirmButtonAction}
									onPress={handleConfirmAction}
									isDisabled={isProcessingAction}
								>
									{isProcessingAction && pendingAction?.type === 'delete' ? (
										<>
											<ButtonSpinner />
											<ButtonText>Processando</ButtonText>
										</>
									) : (
										<ButtonText>{actionModalCopy.confirmLabel}</ButtonText>
									)}
								</Button>
							</ModalFooter>
						</ModalContent>
					</Modal>

					<Drawer
						isOpen={isMovementDrawerOpen}
						onClose={handleCloseMovementDrawer}
						size="lg"
						anchor="right"
					>
						<DrawerBackdrop onPress={handleCloseMovementDrawer} />
						<DrawerContent className={cardBackground}>
							<DrawerHeader className="items-center justify-between">
								<Box className="w-full mt-12">
									<Heading size="lg" className={headingText}>
										{selectedMovement ? selectedMovement.name : 'Movimentação selecionada'}
									</Heading>

									{selectedMovement?.isFromMandatory && (
										<Text className="mt-1 text-sm text-yellow-600 dark:text-yellow-400">
											Esta movimentação está vinculada a um gasto obrigatório deste mês.
										</Text>
									)}
									{selectedMovement?.isCashRescue && (
										<Text className="mt-1 text-sm text-sky-700 dark:text-sky-400">
											{`${
												isCashView
													? 'Valor registrado como saque do banco'
													: 'Movimentação de saque do banco'
											} ${selectedMovement.cashRescueSourceBankName ?? 'não identificado'}.`}
										</Text>
									)}
									{selectedMovement?.isBankTransfer && (
										<Text className="mt-1 text-sm text-sky-700 dark:text-sky-400">
											{selectedMovement.bankTransferDirection === 'outgoing'
												? `Transferência enviada para ${
														selectedMovement.bankTransferTargetBankNameSnapshot ??
														'banco de destino'
													}.`
												: `Transferência recebida de ${
														selectedMovement.bankTransferSourceBankNameSnapshot ??
														'banco de origem'
													}.`}
										</Text>
									)}
									{selectedMovement?.isFinanceInvestment && (
										<Text className="mt-1 text-sm text-indigo-700 dark:text-indigo-300">
											Movimentação criada a partir de um investimento.
										</Text>
									)}
									{selectedMovement?.isInvestmentDeposit && (
										<Text className="mt-1 text-sm text-indigo-700 dark:text-indigo-300">
											Aporte automático registrado para este investimento.
										</Text>
									)}
								</Box>

								<DrawerCloseButton onPress={handleCloseMovementDrawer} />
							</DrawerHeader>

							<DrawerBody>
								<VStack className="gap-4">
									<VStack space="xs">
										<Text className={`${bodyText} text-sm`}>Nome da movimentação:</Text>
										<Input className={fieldContainerClassName} isDisabled>
											<InputField
												value={selectedMovement ? selectedMovement.name : ''}
												className={inputField}
											/>
										</Input>
									</VStack>

									<VStack space="xs">
										<Text className={`${bodyText} text-sm`}>Valor da movimentação:</Text>
										<Input className={fieldContainerClassName} isDisabled>
											<InputField
												value={
													selectedMovement
														? formatCurrencyBRL(selectedMovement.valueInCents)
														: ''
												}
												className={inputField}
											/>
										</Input>
									</VStack>

									{selectedMovement?.type === 'gain' && (
										<VStack space="xs">
											<Text className={`${bodyText} text-sm`}>Pagamento em dinheiro:</Text>
											<Input className={fieldContainerClassName} isDisabled>
												<InputField
													value={
														typeof selectedMovement.moneyFormat === 'boolean'
															? selectedMovement.moneyFormat
																? 'Sim'
																: 'Não'
															: 'Não informado'
													}
													className={inputField}
												/>
											</Input>
										</VStack>
									)}

									<VStack space="xs">
										<Text className={`${bodyText} text-sm`}>Tipo da movimentação:</Text>
										<Input className={fieldContainerClassName} isDisabled>
											<InputField
												value={resolveMovementTypeLabel(selectedMovement)}
												className={inputField}
											/>
										</Input>
									</VStack>

									{selectedMovement?.isInvestmentRedemption && (
										<VStack space="xs">
											<Text className={`${bodyText} text-sm`}>Observação do resgate:</Text>
											<Textarea
												isReadOnly
												isDisabled
												className="h-20 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
											>
												<TextareaInput
													value={
														selectedMovement.investmentNameSnapshot
															? `Resgate do investimento "${selectedMovement.investmentNameSnapshot}".`
															: 'Resgate de investimento registrado para este banco.'
													}
													className={`${inputField} pt-2`}
												/>
											</Textarea>
										</VStack>
									)}

									{selectedMovement && selectedMovement.explanation && (
										<VStack space="xs">
											<Text className={`${bodyText} text-sm`}>Descrição:</Text>
											<Textarea
												isDisabled
												className={textareaContainerClassName}
											>
												<TextareaInput
													value={selectedMovement.explanation}
													className={`${inputField} pt-2`}
												/>
											</Textarea>
										</VStack>
									)}

									<VStack space="xs">
										<Text className={`${bodyText} text-sm`}>Tag selecionada:</Text>
										<Input className={fieldContainerClassName} isDisabled>
											<InputField
												value={
													selectedMovement && selectedMovement.tagId
														? `${selectedMovementTagName ?? selectedMovement.tagId}`
														: 'Sem tag associada'
												}
												className={inputField}
											/>
										</Input>
									</VStack>

									<VStack space="xs">
										<Text className={`${bodyText} text-sm`}>Banco selecionado:</Text>
										<Input className={fieldContainerClassName} isDisabled>
											<InputField
												value={
													selectedMovement && selectedMovement.bankId
														? `${selectedMovementBankName ?? selectedMovement.bankId}`
														: 'Sem banco associado'
												}
												className={inputField}
											/>
										</Input>
									</VStack>

									{selectedMovement?.isBankTransfer && (
										<VStack space="xs">
											<Text className={`${bodyText} text-sm`}>Banco de contraparte:</Text>
											<Input className={fieldContainerClassName} isDisabled>
												<InputField
													value={
														selectedMovement.bankTransferDirection === 'outgoing'
															? selectedMovement.bankTransferTargetBankNameSnapshot ??
																'Banco de destino'
															: selectedMovement.bankTransferSourceBankNameSnapshot ??
																'Banco de origem'
													}
													className={inputField}
												/>
											</Input>
										</VStack>
									)}

									<VStack space="xs">
										<Text className={`${bodyText} text-sm`}>Data da movimentação:</Text>
										<Input className={fieldContainerClassName} isDisabled>
											<InputField
												value={
													selectedMovement
														? formatMovementDate(selectedMovement.date)
														: ''
												}
												className={inputField}
											/>
										</Input>
									</VStack>
								</VStack>
							</DrawerBody>

							<DrawerFooter />
						</DrawerContent>
					</Drawer>
				</View>
			</GestureHandlerRootView>
		</SafeAreaView>
	);
}
