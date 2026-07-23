import React from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, StatusBar, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import {
	Tabs,
	TabsIndicator,
	TabsList,
	TabsTrigger,
	TabsTriggerText,
} from '@/components/ui/tabs';
import { Input, InputField } from '@/components/ui/input';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { Group } from '@mantine/core';
import {
	Button,
	ButtonIcon,
	ButtonSpinner,
	ButtonText,
} from '@/components/ui/button';
import {
	AddIcon,
	ArrowDownIcon,
	CalendarDaysIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	EditIcon,
	Icon,
	RepeatIcon,
	SettingsIcon,
	TrashIcon,
} from '@/components/ui/icon';
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
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from '@/components/ui/modal';

import { showNotifierAlert, type NotifierAlertType } from '@/components/uiverse/notifier-alert';
import DatePickerField from '@/components/uiverse/date-picker';
import InvestmentEvolutionChart from '@/components/uiverse/investment-evolution-chart';
import Navigator from '@/components/uiverse/navigator';
import {
	useValueVisibility,
	HIDDEN_VALUE_PLACEHOLDER,
} from '@/contexts/ValueVisibilityContext';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import FinancialListIllustration from '../assets/UnDraw/financialListScreen.svg';

import { auth } from '@/FirebaseConfig';
import {
	deleteFinanceInvestmentFirebase,
	getFinanceInvestmentsWithRelationsFirebase,
	getFinanceInvestmentPortfolioActivityWithRelationsFirebase,
	updateFinanceInvestmentFirebase,
	syncFinanceInvestmentValueFirebase,
	type FinanceInvestmentPortfolioActivity,
} from '@/functions/FinancesFirebase';
import {
	getInvestmentCdiRatesWithRelationsFirebase,
	upsertInvestmentCdiRateFirebase,
} from '@/functions/InvestmentCdiRateFirebase';
import { getBanksWithUsersByPersonFirebase } from '@/functions/BankFirebase';
import { redemptionTermLabels, RedemptionTerm } from '@/utils/finance';
import {
	buildInvestmentPortfolioAnalytics,
	formatBasisPointsAsPercentage,
	getActiveCdiRateForPerson,
	getInvestmentAssetType,
	getInvestmentValuationMethod,
	investmentAssetTypeLabels,
	normalizeCdiPercentageInBasisPoints,
	parsePercentageToBasisPoints,
	type InvestmentAssetType,
	type InvestmentCdiRate,
	type InvestmentPerformanceItem,
	type InvestmentPerformancePeriod,
	type InvestmentValuationMethod,
} from '@/utils/investmentPortfolio';
import { addTagFirebase, getAllTagsFirebase } from '@/functions/TagFirebase';
import { tagSupportsUsage } from '@/utils/tagUsage';
import { addExpenseFirebase } from '@/functions/ExpenseFirebase';
import { addGainFirebase } from '@/functions/GainFirebase';
import { serializeTagIconSelection } from '@/hooks/useTagIcons';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { APP_ROUTE_PATHS, navigateToHomeDashboard, navigateToRoute } from '@/utils/navigation';

type FinanceInvestment = {
	id: string;
	personId: string;
	name: string;
	initialValueInCents: number;
	currentValueInCents: number;
	cdiPercentage: number;
	cdiPercentageInBasisPoints: number;
	assetType: InvestmentAssetType;
	valuationMethod: InvestmentValuationMethod;
	redemptionTerm: RedemptionTerm;
	bankId: string;
	description?: string | null;
	investmentDateISO: string;
	createdAtISO: string;
	lastManualSyncValueInCents?: number | null;
	lastManualSyncAtISO?: string | null;
};

type BankMetadata = {
	id: string;
	name: string;
	colorHex?: string | null;
};

type StandardizedFinancialInputProps = {
	label: string;
	isDisabled?: boolean;
} & Omit<React.ComponentProps<typeof InputField>, 'className'>;

type InvestmentTimelineTone = {
	accentColor: string;
	amountColor: string;
	lineColor: string;
	iconGradient: [string, string];
	cardGradient: [string, string];
};

const INVESTMENT_TAG_LABEL = 'Investimento';
const INVESTMENT_TIMELINE_TONE: InvestmentTimelineTone = {
	accentColor: '#EC4899',
	amountColor: '#60A5FA',
	lineColor: 'rgba(96, 165, 250, 0.32)',
	iconGradient: ['#DB2777', '#60A5FA'],
	cardGradient: ['#BE185D', '#3B82F6'],
};

const formatCurrencyBRLRaw = (value: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(value);

const formatDateToBR = (isoDate: string) =>
	new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}).format(new Date(isoDate));

const formatSignedBasisPointsAsPercentage = (valueInBasisPoints: number) =>
	`${valueInBasisPoints < 0 ? '-' : ''}${formatBasisPointsAsPercentage(Math.abs(valueInBasisPoints))}%`;

const redemptionOptions: { value: RedemptionTerm; label: string }[] = [
	{ value: 'anytime', label: redemptionTermLabels.anytime },
	{ value: '1m', label: redemptionTermLabels['1m'] },
	{ value: '3m', label: redemptionTermLabels['3m'] },
	{ value: '6m', label: redemptionTermLabels['6m'] },
	{ value: '1y', label: redemptionTermLabels['1y'] },
	{ value: '2y', label: redemptionTermLabels['2y'] },
	{ value: '3y', label: redemptionTermLabels['3y'] },
];

const performancePeriodOptions: { value: InvestmentPerformancePeriod; label: string }[] = [
	{ value: '30d', label: '30 dias' },
	{ value: '6m', label: '6 meses' },
	{ value: '12m', label: '12 meses' },
	{ value: 'all', label: 'Total' },
];

const emptyPortfolioActivity: FinanceInvestmentPortfolioActivity = {
	cashFlows: [],
	syncs: [],
};

const convertCentsToBRL = (valueInCents: number) => valueInCents / 100;
const sanitizeNumberInput = (value: string) => value.replace(/[^\d.,]/g, '');
const extractDigits = (value: string) => value.replace(/\D/g, '');

const formatCurrencyInputValue = (value: string) => {
	const digits = extractDigits(value);
	if (!digits) {
		return { display: '', cents: null as number | null };
	}
	const cents = Number(digits);
	return {
		display: formatCurrencyBRLRaw(cents / 100),
		cents,
	};
};

const parseCurrencyInputToCents = (value: string) => {
	const digits = extractDigits(value);
	if (!digits) {
		return null;
	}
	return Number(digits);
};

const normalizeDate = (value: unknown) => {
	if (!value) {
		return new Date().toISOString();
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (
		typeof value === 'object' &&
		value !== null &&
		'toDate' in value &&
		typeof (value as { toDate?: () => Date }).toDate === 'function'
	) {
		return (
			(value as { toDate?: () => Date }).toDate?.()?.toISOString() ??
			new Date().toISOString()
		);
	}
	if (typeof value === 'string') {
		return value;
	}
	return new Date().toISOString();
};

const formatDateInput = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${day}/${month}/${year}`;
};

const parseDateFromBR = (value: string) => {
	const [day, month, year] = value.split('/');
	const parsedDay = Number(day);
	const parsedMonth = Number(month);
	const parsedYear = Number(year);
	if (
		!day ||
		!month ||
		!year ||
		!Number.isInteger(parsedDay) ||
		!Number.isInteger(parsedMonth) ||
		!Number.isInteger(parsedYear) ||
		parsedDay <= 0 ||
		parsedMonth <= 0 ||
		parsedMonth > 12 ||
		parsedYear < 1900
	) {
		return null;
	}

	const parsedDate = new Date(parsedYear, parsedMonth - 1, parsedDay);
	return
		parsedDate.getDate() === parsedDay &&
		parsedDate.getMonth() + 1 === parsedMonth &&
		parsedDate.getFullYear() === parsedYear
			? parsedDate
			: null;
};

const resolveBaseValueInCents = (investment: FinanceInvestment) => {
	if (typeof investment.currentValueInCents === 'number') {
		return investment.currentValueInCents;
	}
	if (typeof investment.lastManualSyncValueInCents === 'number') {
		return investment.lastManualSyncValueInCents;
	}
	return investment.initialValueInCents;
};

const getInvestmentBadgeLabel = (value: string) => {
	const normalizedValue = value.trim();
	if (!normalizedValue) {
		return 'R$';
	}

	const firstMatch = normalizedValue.match(/[A-Za-zÀ-ÿ0-9]/u)?.[0];
	return (firstMatch ?? 'R').toUpperCase();
};

const getInvestmentManualSyncLabel = (
	investment: FinanceInvestment,
	formatCurrencyBRL: (value: number) => string,
) => {
	if (
		typeof investment.lastManualSyncValueInCents !== 'number' ||
		!investment.lastManualSyncAtISO
	) {
		return 'Nunca sincronizado';
	}

	return `${formatCurrencyBRL(convertCentsToBRL(investment.lastManualSyncValueInCents))} em ${formatDateToBR(investment.lastManualSyncAtISO)}`;
};

// A timeline mantém o acompanhamento por saldo base, projeção e sincronização manual conforme o fluxo descrito em [[Investimentos]].
const getInvestmentSummaryText = (
	investment: FinanceInvestment,
	performance: InvestmentPerformanceItem | undefined,
	formatCurrencyBRL: (value: number) => string,
) => {
	if (!performance?.hasCurrentCdiRate && investment.valuationMethod === 'cdi') {
		return 'Defina uma taxa CDI anual de referência para ativar a projeção desta renda fixa. Enquanto isso, a carteira mantém o último valor confirmado.';
	}

	const simulatedValue = formatCurrencyBRL(
		convertCentsToBRL(performance?.projectedValueInCents ?? resolveBaseValueInCents(investment)),
	);
	const periodGain = performance?.periodGainInCents ?? 0;
	const periodPrefix = periodGain >= 0 ? 'ganho estimado de' : 'variação estimada de';

	if (
		typeof investment.lastManualSyncValueInCents === 'number' &&
		investment.lastManualSyncAtISO
	) {
		return `Última sincronização manual em ${formatDateToBR(investment.lastManualSyncAtISO)}. A projeção atual é de ${simulatedValue}, com ${periodPrefix} ${formatCurrencyBRL(convertCentsToBRL(Math.abs(periodGain)))} no período selecionado.`;
	}

	return `Sem sincronização manual até agora. A carteira estima ${simulatedValue} a partir do valor salvo neste investimento.`;
};

function FinancialListSkeleton({
	skeletonBaseColor,
	skeletonHighlightColor,
}: {
	skeletonBaseColor: string;
	skeletonHighlightColor: string;
}) {
	return (
		<VStack className="mt-4 gap-1">
			{Array.from({ length: 2 }).map((_, index) => (
				<HStack
					key={`financial-list-skeleton-${index}`}
					className="items-start gap-3"
				>
					<VStack className="items-center pt-1" style={{ width: '7%' }}>
						<Skeleton
							variant="circular"
							style={{ width: 14, height: 14 }}
							baseColor={skeletonBaseColor}
							highlightColor={skeletonHighlightColor}
						/>
						{index < 1 ? (
							<Skeleton
								style={{
									width: 3,
									height: 54,
									marginTop: 4,
									borderRadius: 999,
								}}
								baseColor={skeletonBaseColor}
								highlightColor={skeletonHighlightColor}
							/>
						) : (
							<View style={{ marginTop: 6 }} />
						)}
					</VStack>

					<View style={{ width: '93%', paddingBottom: 14 }}>
						<HStack className="items-center justify-between gap-3">
							<HStack className="items-center gap-3" style={{ flex: 1 }}>
								<Skeleton
									className="h-11 w-11 rounded-2xl"
									baseColor={skeletonBaseColor}
									highlightColor={skeletonHighlightColor}
								/>
								<VStack className="flex-1 gap-2">
									<Skeleton
										className="h-5 w-36"
										baseColor={skeletonBaseColor}
										highlightColor={skeletonHighlightColor}
									/>
									<Skeleton
										className="h-3 w-24"
										baseColor={skeletonBaseColor}
										highlightColor={skeletonHighlightColor}
									/>
								</VStack>
							</HStack>
							<HStack className="items-center gap-2">
								<VStack className="items-end gap-2">
									<Skeleton
										className="h-5 w-24"
										baseColor={skeletonBaseColor}
										highlightColor={skeletonHighlightColor}
									/>
									<HStack className="items-center gap-1">
										<Skeleton
											variant="circular"
											style={{ width: 12, height: 12 }}
											baseColor={skeletonBaseColor}
											highlightColor={skeletonHighlightColor}
										/>
										<Skeleton
											className="h-3 w-20"
											baseColor={skeletonBaseColor}
											highlightColor={skeletonHighlightColor}
										/>
									</HStack>
								</VStack>
								<Skeleton
									variant="circular"
									style={{ width: 14, height: 14 }}
									baseColor={skeletonBaseColor}
									highlightColor={skeletonHighlightColor}
								/>
							</HStack>
						</HStack>
					</View>
				</HStack>
			))}
		</VStack>
	);
}

export default function FinancialListScreen() {
	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		fieldContainerClassName,
		textareaContainerClassName,
		submitButtonClassName,
		heroHeight,
		insets,
		compactCardClassName,
		tintedCardClassName,
		notTintedCardClassName,
		topSummaryCardClassName,
		modalContentClassName,
		skeletonBaseColor,
		skeletonHighlightColor,
		skeletonMutedBaseColor,
		skeletonMutedHighlightColor,
		submitButtonCancelClassName,
	} = useScreenStyles();
	const [investments, setInvestments] = React.useState<FinanceInvestment[]>([]);
	const [banksMap, setBanksMap] = React.useState<Record<string, BankMetadata>>(
		{},
	);
	const bankOptions = React.useMemo(() => Object.values(banksMap), [banksMap]);
	const [cdiRates, setCdiRates] = React.useState<InvestmentCdiRate[]>([]);
	const [portfolioActivity, setPortfolioActivity] =
		React.useState<FinanceInvestmentPortfolioActivity>(emptyPortfolioActivity);
	const [performancePeriod, setPerformancePeriod] =
		React.useState<InvestmentPerformancePeriod>('6m');
	const handlePerformancePeriodChange = React.useCallback(
		(nextPeriod: string) => {
			const selectedOption = performancePeriodOptions.find(
				option => option.value === nextPeriod,
			);

			if (selectedOption) {
				setPerformancePeriod(selectedOption.value);
			}
		},
		[],
	);
	const [isCdiSettingsOpen, setIsCdiSettingsOpen] = React.useState(false);
	const [cdiRateInput, setCdiRateInput] = React.useState('');
	const [cdiEffectiveDate, setCdiEffectiveDate] = React.useState(formatDateInput(new Date()));
	const [isSavingCdiRate, setIsSavingCdiRate] = React.useState(false);

	const [isLoading, setIsLoading] = React.useState(false);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [editingInvestment, setEditingInvestment] =
		React.useState<FinanceInvestment | null>(null);
	const [editName, setEditName] = React.useState('');
	const [editInitialInput, setEditInitialInput] = React.useState('');
	const [editCdiInput, setEditCdiInput] = React.useState('');
	const [editTerm, setEditTerm] = React.useState<RedemptionTerm>('anytime');
	const [editBankId, setEditBankId] = React.useState<string | null>(null);
	const [editDescription, setEditDescription] = React.useState('');
	const [isSavingEdit, setIsSavingEdit] = React.useState(false);
	const [investmentPendingDeletion, setInvestmentPendingDeletion] =
		React.useState<FinanceInvestment | null>(null);
	const [isDeleting, setIsDeleting] = React.useState(false);
	const [investmentForWithdrawal, setInvestmentForWithdrawal] =
		React.useState<FinanceInvestment | null>(null);
	const [investmentForWithdrawalSync, setInvestmentForWithdrawalSync] =
		React.useState<FinanceInvestment | null>(null);
	const [withdrawSyncInput, setWithdrawSyncInput] = React.useState('');
	const [isSavingWithdrawalSync, setIsSavingWithdrawalSync] =
		React.useState(false);
	const [syncedWithdrawalValueInCents, setSyncedWithdrawalValueInCents] =
		React.useState<number | null>(null);
	const [withdrawInput, setWithdrawInput] = React.useState('');
	const [isSavingWithdrawal, setIsSavingWithdrawal] = React.useState(false);
	const [investmentForDeposit, setInvestmentForDeposit] =
		React.useState<FinanceInvestment | null>(null);
	const [investmentForDepositSync, setInvestmentForDepositSync] =
		React.useState<FinanceInvestment | null>(null);
	const [depositSyncInput, setDepositSyncInput] = React.useState('');
	const [isSavingDepositSync, setIsSavingDepositSync] = React.useState(false);
	const [syncedDepositValueInCents, setSyncedDepositValueInCents] =
		React.useState<number | null>(null);
	const [depositInput, setDepositInput] = React.useState('');
	const [isSavingDeposit, setIsSavingDeposit] = React.useState(false);
	const [investmentForSync, setInvestmentForSync] =
		React.useState<FinanceInvestment | null>(null);
	const [syncInput, setSyncInput] = React.useState('');
	const [isSavingSync, setIsSavingSync] = React.useState(false);
	const [expandedInvestmentIds, setExpandedInvestmentIds] = React.useState<
		string[]
	>([]);
	const { shouldHideValues } = useValueVisibility();

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

	const formatCurrencyBRL = React.useCallback(
		(value: number) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}
			return formatCurrencyBRLRaw(value);
		},
		[shouldHideValues],
	);
	const timelinePalette = React.useMemo(
		() => ({
			title: isDarkMode ? '#F8FAFC' : '#0F172A',
			subtitle: isDarkMode ? '#94A3B8' : '#64748B',
		}),
		[isDarkMode],
	);

	React.useEffect(() => {
		const visibleIds = new Set(investments.map((investment) => investment.id));
		setExpandedInvestmentIds((previousState) =>
			previousState.filter((id) => visibleIds.has(id)),
		);
	}, [investments]);

	const handleEditInitialInputChange = React.useCallback((value: string) => {
		setEditInitialInput(formatCurrencyInputValue(value).display);
	}, []);

	const handleDepositInputChange = React.useCallback((value: string) => {
		setDepositInput(formatCurrencyInputValue(value).display);
	}, []);

	const handleDepositSyncInputChange = React.useCallback((value: string) => {
		setDepositSyncInput(formatCurrencyInputValue(value).display);
	}, []);

	const handleWithdrawInputChange = React.useCallback((value: string) => {
		setWithdrawInput(formatCurrencyInputValue(value).display);
	}, []);

	const handleWithdrawSyncInputChange = React.useCallback((value: string) => {
		setWithdrawSyncInput(formatCurrencyInputValue(value).display);
	}, []);

	const handleManualSyncInputChange = React.useCallback((value: string) => {
		setSyncInput(formatCurrencyInputValue(value).display);
	}, []);

	const renderStandardizedInput = React.useCallback(
		({
			label,
			isDisabled = false,
			autoCapitalize = 'none',
			autoCorrect = false,
			returnKeyType = 'done',
			...inputProps
		}: StandardizedFinancialInputProps) => (
			<VStack className="mb-4">
				<Text className={`${bodyText} mb-1 ml-1 text-sm`}>{label}</Text>
				<Input className={fieldContainerClassName} isDisabled={isDisabled}>
					<InputField
						{...inputProps}
						autoCapitalize={autoCapitalize}
						autoCorrect={autoCorrect}
						returnKeyType={returnKeyType}
						className={inputField}
					/>
				</Input>
			</VStack>
		),
		[bodyText, fieldContainerClassName, inputField],
	);

	const loadData = React.useCallback(async (asRefresh = false) => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showScreenAlert('Usuário não autenticado. Faça login novamente.', 'error');
			return;
		}

		if (asRefresh) {
			setIsRefreshing(true);
		} else {
			setIsLoading(true);
		}
		try {
			const [investmentsResponse, banksResponse, cdiRatesResponse, activityResponse] = await Promise.all([
				getFinanceInvestmentsWithRelationsFirebase(currentUser.uid),
				getBanksWithUsersByPersonFirebase(currentUser.uid),
				getInvestmentCdiRatesWithRelationsFirebase(currentUser.uid),
				getFinanceInvestmentPortfolioActivityWithRelationsFirebase(currentUser.uid),
			]);

			if (
				!investmentsResponse.success ||
				!Array.isArray(investmentsResponse.data)
			) {
				throw new Error('Erro ao carregar investimentos.');
			}
			if (!banksResponse.success || !Array.isArray(banksResponse.data)) {
				throw new Error('Erro ao carregar bancos.');
			}

			const normalizedBanks: BankMetadata[] = (
				banksResponse.data as Array<Record<string, any>>
			).map((bank) => ({
				id: String(bank.id),
				name:
					typeof bank.name === 'string' && bank.name.trim().length > 0
						? bank.name.trim()
						: 'Banco sem nome',
				colorHex: typeof bank.colorHex === 'string' ? bank.colorHex : null,
			}));

			const normalizedInvestments: FinanceInvestment[] = (
				investmentsResponse.data as Array<Record<string, any>>
			).map((investment) => {
				const cdiPercentageInBasisPoints =
					typeof investment.cdiPercentageInBasisPoints === 'number'
						? Math.max(0, Math.round(investment.cdiPercentageInBasisPoints))
						: normalizeCdiPercentageInBasisPoints(investment.cdiPercentage);

				const assetType = getInvestmentAssetType(investment.assetType);

				return {
					id: String(investment.id),
					personId:
						typeof investment.personId === 'string' && investment.personId.trim().length > 0
							? investment.personId.trim()
							: currentUser.uid,
					name:
						typeof investment.name === 'string' &&
							investment.name.trim().length > 0
							? investment.name.trim()
							: 'Investimento sem nome',
					initialValueInCents:
						typeof investment.initialValueInCents === 'number'
							? investment.initialValueInCents
							: typeof investment.initialInvestedInCents === 'number'
								? investment.initialInvestedInCents
								: 0,
					currentValueInCents:
						typeof investment.currentValueInCents === 'number'
							? investment.currentValueInCents
							: typeof investment.lastManualSyncValueInCents === 'number'
								? investment.lastManualSyncValueInCents
								: typeof investment.initialValueInCents === 'number'
									? investment.initialValueInCents
									: 0,
					cdiPercentage:
						typeof investment.cdiPercentage === 'number'
							? investment.cdiPercentage
							: cdiPercentageInBasisPoints / 100,
					cdiPercentageInBasisPoints,
					assetType,
					valuationMethod: getInvestmentValuationMethod(investment.valuationMethod, assetType),
					redemptionTerm:
						(investment.redemptionTerm as RedemptionTerm) ?? 'anytime',
					bankId: typeof investment.bankId === 'string' ? investment.bankId : '',
					description:
						typeof investment.description === 'string' &&
							investment.description.trim().length > 0
							? investment.description.trim()
							: null,
					investmentDateISO: normalizeDate(investment.date ?? investment.createdAt),
					createdAtISO: normalizeDate(investment.createdAt),
					lastManualSyncValueInCents:
						typeof investment.lastManualSyncValueInCents === 'number'
							? investment.lastManualSyncValueInCents
							: null,
					lastManualSyncAtISO: investment.lastManualSyncAt
						? normalizeDate(investment.lastManualSyncAt)
						: null,
				} satisfies FinanceInvestment;
			});

			setBanksMap(
				normalizedBanks.reduce<Record<string, BankMetadata>>((acc, bank) => {
					acc[bank.id] = bank;
					return acc;
				}, {}),
			);
			setInvestments(normalizedInvestments);
			setCdiRates(
				cdiRatesResponse.success && Array.isArray(cdiRatesResponse.data)
					? cdiRatesResponse.data
					: [],
			);
			setPortfolioActivity(
				activityResponse.success && activityResponse.data
					? activityResponse.data
					: emptyPortfolioActivity,
			);
		} catch (error) {
			console.error('Erro ao carregar dados de investimentos:', error);
			showScreenAlert('Não foi possível carregar os investimentos.', 'error');
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, [showScreenAlert]);

	const handleRefresh = React.useCallback(async () => {
		await loadData(true);
	}, [loadData]);

	useFocusEffect(
		React.useCallback(() => {
			void loadData();
		}, [loadData]),
	);

	const ensureInvestmentTag = React.useCallback(
		async (usageType: 'expense' | 'gain') => {
			const currentUser = auth.currentUser;
			if (!currentUser) {
				throw new Error('Usuário não autenticado.');
			}

			try {
				const tagsResult = await getAllTagsFirebase();
				if (tagsResult.success && Array.isArray(tagsResult.data)) {
					const existing = (tagsResult.data as Array<Record<string, any>>).find(
						(tag) => {
							const rawName =
								typeof tag?.name === 'string' ? tag.name.trim() : '';
							const normalizedName = rawName.toLowerCase();
							const tagUsage =
								typeof tag?.usageType === 'string' ? tag.usageType : undefined;
							return (
								normalizedName === INVESTMENT_TAG_LABEL.toLowerCase() &&
								tagSupportsUsage(tagUsage, usageType, { allowUndefined: true }) &&
								String(tag?.personId) === currentUser.uid
							);
						},
					);

					if (existing && typeof existing.id === 'string') {
						return { id: existing.id, name: INVESTMENT_TAG_LABEL };
					}
				}

				const tagResult = await addTagFirebase({
					tagName: INVESTMENT_TAG_LABEL,
					personId: currentUser.uid,
					usageType,
					...serializeTagIconSelection({
						iconFamily: 'material-community',
						iconName: 'cash-multiple',
					}),
				});

				if (tagResult.success && typeof tagResult.tagId === 'string') {
					return { id: tagResult.tagId, name: INVESTMENT_TAG_LABEL };
				}

				throw new Error('Não foi possível criar a tag Investimento.');
			} catch (error) {
				console.error('Erro ao garantir a tag Investimento:', error);
				throw error;
			}
		},
		[],
	);

	const portfolioAnalytics = React.useMemo(
		() =>
			buildInvestmentPortfolioAnalytics({
				investments: investments.map(investment => {
					const investmentDate = new Date(investment.investmentDateISO);
					const createdAt = new Date(investment.createdAtISO);
					const lastManualSyncAt = investment.lastManualSyncAtISO
						? new Date(investment.lastManualSyncAtISO)
						: null;
					return {
						id: investment.id,
						personId: investment.personId,
						name: investment.name,
						bankId: investment.bankId || null,
						initialValueInCents: investment.initialValueInCents,
						currentValueInCents: resolveBaseValueInCents(investment),
						cdiPercentageInBasisPoints: investment.cdiPercentageInBasisPoints,
						assetType: investment.assetType,
						valuationMethod: investment.valuationMethod,
						investmentDate: Number.isNaN(investmentDate.getTime()) ? null : investmentDate,
						createdAt: Number.isNaN(createdAt.getTime()) ? null : createdAt,
						lastManualSyncAt:
							lastManualSyncAt && !Number.isNaN(lastManualSyncAt.getTime())
								? lastManualSyncAt
								: null,
					};
				}),
				rates: cdiRates,
				cashFlows: portfolioActivity.cashFlows,
				syncs: portfolioActivity.syncs,
				period: performancePeriod,
			}),
		[cdiRates, investments, performancePeriod, portfolioActivity],
	);

	const currentUserId = auth.currentUser?.uid ?? '';
	const activeCdiRate = React.useMemo(
		() =>
			currentUserId
				? getActiveCdiRateForPerson(cdiRates, currentUserId, new Date())
				: null,
		[cdiRates, currentUserId],
	);
	const ownCdiRateHistory = React.useMemo(
		() =>
			cdiRates
				.filter(rate => rate.personId === currentUserId)
				.sort((left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime()),
		[cdiRates, currentUserId],
	);
	const formatCurrencyInCents = React.useCallback(
		(valueInCents: number) => formatCurrencyBRL(convertCentsToBRL(valueInCents)),
		[formatCurrencyBRL],
	);

	const syncedWithdrawalDisplayValue = React.useMemo(() => {
		if (syncedWithdrawalValueInCents === null) {
			return 'Sincronize o valor para continuar';
		}
		return formatCurrencyBRL(convertCentsToBRL(syncedWithdrawalValueInCents));
	}, [formatCurrencyBRL, syncedWithdrawalValueInCents]);

	const syncedDepositDisplayValue = React.useMemo(() => {
		if (syncedDepositValueInCents === null) {
			return 'Sincronize o valor para continuar';
		}
		return formatCurrencyBRL(convertCentsToBRL(syncedDepositValueInCents));
	}, [formatCurrencyBRL, syncedDepositValueInCents]);

	const handleOpenCdiSettings = React.useCallback(() => {
		setCdiRateInput(
			activeCdiRate
				? formatBasisPointsAsPercentage(activeCdiRate.annualRateInBasisPoints)
				: '',
		);
		setCdiEffectiveDate(formatDateInput(new Date()));
		setIsCdiSettingsOpen(true);
	}, [activeCdiRate]);

	const handleCloseCdiSettings = React.useCallback(() => {
		if (isSavingCdiRate) {
			return;
		}
		setIsCdiSettingsOpen(false);
		setCdiRateInput('');
		setCdiEffectiveDate(formatDateInput(new Date()));
	}, [isSavingCdiRate]);

	const handleSaveCdiRate = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		const annualRateInBasisPoints = parsePercentageToBasisPoints(cdiRateInput);
		const effectiveFrom = parseDateFromBR(cdiEffectiveDate);

		if (!currentUser) {
			showScreenAlert('Usuário não autenticado. Faça login novamente.', 'error');
			return;
		}
		if (
			typeof annualRateInBasisPoints !== 'number' ||
			annualRateInBasisPoints <= 0 ||
			annualRateInBasisPoints > 100_000
		) {
			showScreenAlert('Informe uma taxa CDI anual válida.', 'warn');
			return;
		}
		if (!effectiveFrom) {
			showScreenAlert('Informe a data de vigência no formato DD/MM/AAAA.', 'warn');
			return;
		}

		setIsSavingCdiRate(true);
		try {
			const result = await upsertInvestmentCdiRateFirebase({
				personId: currentUser.uid,
				annualRateInBasisPoints,
				effectiveFrom,
			});
			if (!result.success) {
				throw new Error('Não foi possível salvar a taxa CDI.');
			}

			await loadData();
			setIsCdiSettingsOpen(false);
			setCdiRateInput('');
			showScreenAlert('Taxa CDI salva e aplicada às projeções.', 'success');
		} catch (error) {
			console.error('Erro ao salvar taxa CDI:', error);
			showScreenAlert('Não foi possível salvar a taxa CDI agora.', 'error');
		} finally {
			setIsSavingCdiRate(false);
		}
	}, [cdiEffectiveDate, cdiRateInput, loadData, showScreenAlert]);

	const handleNavigateToAdd = React.useCallback(() => {
		navigateToRoute(APP_ROUTE_PATHS.addFinance);
	}, []);

	const handleBackToHome = React.useCallback(() => {
		navigateToHomeDashboard();
		return true;
	}, []);
	const handleToggleInvestmentCard = React.useCallback(
		(investmentId: string) => {
			setExpandedInvestmentIds((previousState) =>
				previousState.includes(investmentId)
					? previousState.filter((id) => id !== investmentId)
					: [...previousState, investmentId],
			);
		},
		[],
	);

	const closeEditModal = React.useCallback(() => {
		if (isSavingEdit) {
			return;
		}
		setEditingInvestment(null);
		setEditName('');
		setEditInitialInput('');
		setEditCdiInput('');
		setEditTerm('anytime');
		setEditBankId(null);
		setEditDescription('');
	}, [isSavingEdit]);

	const handleOpenEditModal = React.useCallback(
		(investment: FinanceInvestment) => {
			setEditingInvestment(investment);
			setEditName(investment.name);
			setEditInitialInput(
				formatCurrencyBRLRaw(convertCentsToBRL(investment.initialValueInCents)),
			);
			setEditCdiInput(formatBasisPointsAsPercentage(investment.cdiPercentageInBasisPoints));
			setEditTerm(investment.redemptionTerm);
			setEditBankId(investment.bankId);
			setEditDescription(investment.description ?? '');
		},
		[],
	);

	const handleSubmitEdit = React.useCallback(async () => {
		if (!editingInvestment || !editBankId) {
			return;
		}

		const parsedInitialCents = parseCurrencyInputToCents(editInitialInput);
		const parsedCdiInBasisPoints = parsePercentageToBasisPoints(editCdiInput);

		if (
			editName.trim().length === 0 ||
			parsedInitialCents === null ||
			parsedInitialCents <= 0
		) {
			showScreenAlert('Informe um nome e um valor inicial válidos.', 'warn');
			return;
		}

		if (
			typeof parsedCdiInBasisPoints !== 'number' ||
			parsedCdiInBasisPoints <= 0
		) {
			showScreenAlert('Informe um CDI válido para editar.', 'warn');
			return;
		}

		setIsSavingEdit(true);
		try {
			const resolvedBankName =
				bankOptions.find((bank) => bank.id === editBankId)?.name ?? null;
			const result = await updateFinanceInvestmentFirebase({
				investmentId: editingInvestment.id,
				name: editName.trim(),
				initialValueInCents: parsedInitialCents,
				cdiPercentage: parsedCdiInBasisPoints / 100,
				cdiPercentageInBasisPoints: parsedCdiInBasisPoints,
				redemptionTerm: editTerm,
				bankId: editBankId,
				bankNameSnapshot: resolvedBankName,
				description: editDescription.trim() ? editDescription.trim() : null,
			});

			if (!result.success) {
				throw new Error('Erro ao atualizar investimento.');
			}

			await loadData();
			showScreenAlert('Investimento atualizado com sucesso!', 'success');
		} catch (error) {
			console.error(error);
			showScreenAlert('Não foi possível salvar a edição agora.', 'error');
		} finally {
			setIsSavingEdit(false);
		}
	}, [
		bankOptions,
		editBankId,
		editCdiInput,
		editDescription,
		editInitialInput,
		editName,
		editTerm,
		editingInvestment,
		loadData,
		showScreenAlert,
	]);

	const handleRequestDelete = React.useCallback(
		(investment: FinanceInvestment) => {
			setInvestmentPendingDeletion(investment);
		},
		[],
	);

	const handleCloseDeleteModal = React.useCallback(() => {
		if (isDeleting) {
			return;
		}
		setInvestmentPendingDeletion(null);
	}, [isDeleting]);

	const handleConfirmDelete = React.useCallback(async () => {
		if (!investmentPendingDeletion) {
			return;
		}
		setIsDeleting(true);
		try {
			const result = await deleteFinanceInvestmentFirebase(
				investmentPendingDeletion.id,
			);
			if (!result.success) {
				throw new Error(
					typeof result.error === 'string'
						? result.error
						: 'Erro ao excluir investimento.',
				);
			}
			await loadData();
			showScreenAlert('Investimento removido.', 'success');
		} catch (error) {
			console.error(error);
			showScreenAlert(
				error instanceof Error && error.message
					? error.message
					: 'Não foi possível remover agora.',
				'error',
			);
		} finally {
			setIsDeleting(false);
		}
	}, [investmentPendingDeletion, loadData, showScreenAlert]);

	const handleOpenDepositModal = React.useCallback(
		(investment: FinanceInvestment) => {
			const baseValue = convertCentsToBRL(resolveBaseValueInCents(investment));
			setInvestmentForDeposit(null);
			setSyncedDepositValueInCents(null);
			setDepositInput('');
			setInvestmentForDepositSync(investment);
			setDepositSyncInput(baseValue > 0 ? formatCurrencyBRLRaw(baseValue) : '');
		},
		[],
	);

	const handleCloseDepositModal = React.useCallback(() => {
		if (isSavingDeposit) {
			return;
		}
		setInvestmentForDeposit(null);
		setDepositInput('');
		setSyncedDepositValueInCents(null);
	}, [isSavingDeposit]);

	const handleCloseDepositSyncModal = React.useCallback(() => {
		if (isSavingDepositSync) {
			return;
		}
		setInvestmentForDepositSync(null);
		setDepositSyncInput('');
		setSyncedDepositValueInCents(null);
	}, [isSavingDepositSync]);

	const handleConfirmDeposit = React.useCallback(async () => {
		if (!investmentForDeposit) {
			return;
		}
		if (syncedDepositValueInCents === null) {
			showScreenAlert('Sincronize o valor de hoje antes de adicionar.', 'warn');
			return;
		}

		const parsedCents = parseCurrencyInputToCents(depositInput);
		if (parsedCents === null || parsedCents <= 0) {
			showScreenAlert('Informe um valor válido para adicionar.', 'warn');
			return;
		}

		const targetInvestment = investmentForDeposit;
		const personId = auth.currentUser?.uid;
		if (!personId) {
			showScreenAlert('Usuário não autenticado.', 'error');
			return;
		}

		const newCurrentValue = syncedDepositValueInCents + parsedCents;
		setIsSavingDeposit(true);
		try {
			const tagInfo = await ensureInvestmentTag('expense');

			const syncResult = await syncFinanceInvestmentValueFirebase({
				investmentId: targetInvestment.id,
				syncedValueInCents: newCurrentValue,
			});

			if (!syncResult.success) {
				throw new Error('Erro ao atualizar o investimento com o novo aporte.');
			}

			const expenseResult = await addExpenseFirebase({
				name: `Aporte - ${targetInvestment?.name ?? 'Investimento'}`,
				valueInCents: parsedCents,
				tagId: tagInfo.id,
				bankId: targetInvestment.bankId || null,
				date: new Date(),
				personId,
				explanation: `Aporte automático para ${targetInvestment?.name ?? 'investimento'}.`,
				isInvestmentDeposit: true,
				investmentId: targetInvestment.id,
				investmentNameSnapshot: targetInvestment?.name ?? null,
			});

			if (!expenseResult.success) {
				await syncFinanceInvestmentValueFirebase({
					investmentId: targetInvestment.id,
					syncedValueInCents: syncedDepositValueInCents,
				});
				throw new Error('Erro ao registrar o aporte.');
			}

			await loadData();
			showScreenAlert('Aporte registrado e investimento atualizado.', 'success');
		} catch (error) {
			console.error(error);
			showScreenAlert('Não foi possível registrar o aporte agora.', 'error');
		} finally {
			setIsSavingDeposit(false);
		}
	}, [
		depositInput,
		ensureInvestmentTag,
		investmentForDeposit,
		loadData,
		showScreenAlert,
		syncedDepositValueInCents,
	]);

	const handleConfirmDepositSync = React.useCallback(async () => {
		if (!investmentForDepositSync) {
			return;
		}

		const parsedCents = parseCurrencyInputToCents(depositSyncInput);
		if (parsedCents === null || parsedCents <= 0) {
			showScreenAlert('Informe um valor válido para sincronizar.', 'warn');
			return;
		}

		setIsSavingDepositSync(true);
		try {
			const result = await syncFinanceInvestmentValueFirebase({
				investmentId: investmentForDepositSync.id,
				syncedValueInCents: parsedCents,
				recordHistory: true,
				personId: auth.currentUser?.uid ?? null,
				bankId: investmentForDepositSync.bankId,
				investmentNameSnapshot: investmentForDepositSync.name,
				bankNameSnapshot: banksMap[investmentForDepositSync.bankId]?.name ?? null,
				reason: 'deposit',
				date: new Date(),
			});

			if (!result.success) {
				throw new Error('Erro ao sincronizar investimento.');
			}

			await loadData();
			setSyncedDepositValueInCents(parsedCents);
			setInvestmentForDeposit(investmentForDepositSync);
			setInvestmentForDepositSync(null);
			setDepositInput('');
			showScreenAlert('Valor sincronizado! Agora informe o aporte.', 'success');
		} catch (error) {
			console.error(error);
			showScreenAlert('Não foi possível sincronizar agora.', 'error');
		} finally {
			setIsSavingDepositSync(false);
		}
	}, [banksMap, depositSyncInput, investmentForDepositSync, loadData, showScreenAlert]);

	const handleOpenWithdrawalModal = React.useCallback(
		(investment: FinanceInvestment) => {
			const baseValue = convertCentsToBRL(resolveBaseValueInCents(investment));
			setInvestmentForWithdrawal(null);
			setSyncedWithdrawalValueInCents(null);
			setWithdrawInput('');
			setInvestmentForWithdrawalSync(investment);
			setWithdrawSyncInput(
				baseValue > 0 ? formatCurrencyBRLRaw(baseValue) : '',
			);
		},
		[],
	);

	const handleCloseWithdrawalModal = React.useCallback(() => {
		if (isSavingWithdrawal) {
			return;
		}
		setInvestmentForWithdrawal(null);
		setWithdrawInput('');
		setSyncedWithdrawalValueInCents(null);
		setInvestmentForWithdrawalSync(null);
		setWithdrawSyncInput('');
	}, [isSavingWithdrawal]);

	const handleCloseWithdrawalSyncModal = React.useCallback(() => {
		if (isSavingWithdrawalSync) {
			return;
		}
		setInvestmentForWithdrawalSync(null);
		setWithdrawSyncInput('');
		setSyncedWithdrawalValueInCents(null);
	}, [isSavingWithdrawalSync]);

	const handleConfirmWithdrawalSync = React.useCallback(async () => {
		if (!investmentForWithdrawalSync) {
			return;
		}

		const parsedCents = parseCurrencyInputToCents(withdrawSyncInput);
		if (parsedCents === null || parsedCents <= 0) {
			showScreenAlert('Informe um valor válido para sincronizar.', 'warn');
			return;
		}

		setIsSavingWithdrawalSync(true);
		try {
			const syncedCents = parsedCents;
			const result = await syncFinanceInvestmentValueFirebase({
				investmentId: investmentForWithdrawalSync.id,
				syncedValueInCents: syncedCents,
				recordHistory: true,
				personId: auth.currentUser?.uid ?? null,
				bankId: investmentForWithdrawalSync.bankId,
				investmentNameSnapshot: investmentForWithdrawalSync.name,
				bankNameSnapshot: banksMap[investmentForWithdrawalSync.bankId]?.name ?? null,
				reason: 'withdrawal',
				date: new Date(),
			});

			if (!result.success) {
				throw new Error('Erro ao sincronizar investimento.');
			}

			await loadData();
			setSyncedWithdrawalValueInCents(syncedCents);
			setInvestmentForWithdrawal(investmentForWithdrawalSync);
			setInvestmentForWithdrawalSync(null);
			setWithdrawInput('');
			showScreenAlert('Valor sincronizado! Agora informe quanto deseja resgatar.', 'success');
		} catch (error) {
			console.error(error);
			showScreenAlert('Não foi possível sincronizar agora.', 'error');
		} finally {
			setIsSavingWithdrawalSync(false);
		}
	}, [banksMap, investmentForWithdrawalSync, loadData, showScreenAlert, withdrawSyncInput]);

	const handleConfirmWithdrawal = React.useCallback(async () => {
		if (!investmentForWithdrawal) {
			return;
		}

		const parsedCents = parseCurrencyInputToCents(withdrawInput);
		if (parsedCents === null || parsedCents <= 0) {
			showScreenAlert('Informe um valor válido para resgatar.', 'warn');
			return;
		}

		if (syncedWithdrawalValueInCents === null) {
			showScreenAlert('Sincronize o valor de hoje antes de continuar o resgate.', 'warn');
			return;
		}

		const withdrawCents = parsedCents;
		const availableCents =
			syncedWithdrawalValueInCents ??
			resolveBaseValueInCents(investmentForWithdrawal);
		if (withdrawCents > availableCents) {
			showScreenAlert('O valor de resgate não pode ser maior que o valor sincronizado.', 'warn');
			return;
		}

		const targetInvestment = investmentForWithdrawal;
		const originalSyncedValue = availableCents;
		const personId = auth.currentUser?.uid;
		if (!personId) {
			showScreenAlert('Usuário não autenticado.', 'error');
			return;
		}

		setIsSavingWithdrawal(true);
		try {
			const tagInfo = await ensureInvestmentTag('gain');
			const remainingCents = Math.max(0, availableCents - withdrawCents);
			const syncResult = await syncFinanceInvestmentValueFirebase({
				investmentId: targetInvestment.id,
				syncedValueInCents: remainingCents,
			});

			if (!syncResult.success) {
				throw new Error('Erro ao sincronizar valor após resgate.');
			}

			const gainResult = await addGainFirebase({
				name: `Resgate - ${targetInvestment?.name ?? 'Investimento'}`,
				valueInCents: withdrawCents,
				tagId: tagInfo.id,
				bankId: targetInvestment.bankId || null,
				date: new Date(),
				personId,
				isInvestmentRedemption: true,
				investmentId: targetInvestment.id,
				investmentNameSnapshot: targetInvestment?.name ?? null,
			});

			if (!gainResult.success) {
				await syncFinanceInvestmentValueFirebase({
					investmentId: targetInvestment.id,
					syncedValueInCents: originalSyncedValue,
				});
				throw new Error('Erro ao registrar o resgate.');
			}

			await loadData();
			showScreenAlert('Resgate registrado e investimento atualizado.', 'success');
		} catch (error) {
			console.error(error);
			showScreenAlert('Não foi possível preparar o resgate agora.', 'error');
		} finally {
			setIsSavingWithdrawal(false);
		}
	}, [
		ensureInvestmentTag,
		investmentForWithdrawal,
		loadData,
		showScreenAlert,
		syncedWithdrawalValueInCents,
		withdrawInput,
	]);

	const handleOpenManualSyncModal = React.useCallback(
		(investment: FinanceInvestment) => {
			const baseValue = convertCentsToBRL(resolveBaseValueInCents(investment));
			setInvestmentForSync(investment);
			setSyncInput(baseValue > 0 ? formatCurrencyBRLRaw(baseValue) : '');
		},
		[],
	);

	const handleCloseManualSyncModal = React.useCallback(() => {
		if (isSavingSync) {
			return;
		}
		setInvestmentForSync(null);
		setSyncInput('');
	}, [isSavingSync]);

	const handleConfirmManualSync = React.useCallback(async () => {
		if (!investmentForSync) {
			return;
		}

		const parsedCents = parseCurrencyInputToCents(syncInput);
		if (parsedCents === null || parsedCents < 0) {
			showScreenAlert('Informe um valor válido para sincronizar.', 'warn');
			return;
		}

		setIsSavingSync(true);
		try {
			const result = await syncFinanceInvestmentValueFirebase({
				investmentId: investmentForSync.id,
				syncedValueInCents: parsedCents,
				recordHistory: true,
				personId: auth.currentUser?.uid ?? null,
				bankId: investmentForSync.bankId,
				investmentNameSnapshot: investmentForSync.name,
				bankNameSnapshot: banksMap[investmentForSync.bankId]?.name ?? null,
				reason: 'manual',
				date: new Date(),
			});

			if (!result.success) {
				throw new Error('Erro ao sincronizar investimento.');
			}

			await loadData();
			showScreenAlert('Valor sincronizado com sucesso!', 'success');
		} catch (error) {
			console.error(error);
			showScreenAlert('Não foi possível sincronizar agora.', 'error');
		} finally {
			setIsSavingSync(false);
		}
	}, [banksMap, investmentForSync, loadData, showScreenAlert, syncInput]);

	const isInitialLoading = isLoading && investments.length === 0;

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
			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
					<View
						className={`absolute top-0 left-0 right-0 ${cardBackground}`}
						style={{ height: heroHeight }}
					>
						<Image
							source={LoginWallpaper}
							alt="Background da lista de investimentos"
							className="absolute h-full w-full rounded-b-3xl"
							resizeMode="cover"
						/>

						<VStack
							className="h-full w-full items-center justify-start gap-4 px-6"
							style={{ paddingTop: insets.top + 24 }}
						>
							<Heading size="xl" className="text-center text-white">
								Meus investimentos
							</Heading>
							<FinancialListIllustration
								width="38%"
								height="38%"
								className="opacity-90"
							/>
						</VStack>
					</View>

					<ScrollView
						keyboardShouldPersistTaps="handled"
						className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
						style={{ marginTop: heroHeight - 64 }}
						contentContainerStyle={{ paddingBottom: 48 }}
						refreshControl={
							<RefreshControl
								refreshing={isRefreshing}
								onRefresh={() => void handleRefresh()}
								tintColor="#FACC15"
							/>
						}
					>
						<VStack className="mt-4 gap-4">
							<Heading
								className="text-lg uppercase tracking-widest "
								size="lg"
							>
								Visão da carteira
							</Heading>
							{isInitialLoading ? (
								<VStack className="gap-4">
									<View className="flex-row flex-wrap gap-3">
										{Array.from({ length: 3 }).map((_, index) => (
											<Skeleton
												key={`financial-list-summary-${index}`}
												className="h-24 min-w-[145px] flex-1 rounded-2xl"
												baseColor={skeletonMutedBaseColor}
												highlightColor={skeletonMutedHighlightColor}
											/>
										))}
									</View>
									<Skeleton
										className="h-16 rounded-[24px]"
										baseColor={skeletonMutedBaseColor}
										highlightColor={skeletonMutedHighlightColor}
									/>
								</VStack>
							) : (
								<VStack className="gap-4">
									<Box className={`${topSummaryCardClassName} px-4 py-4`}>
										<VStack className="gap-3">
											<HStack className="items-start justify-between gap-3">
												<VStack className="flex-1 gap-1">
													<Text className={`${helperText} text-xs uppercase tracking-wide`}>
														CDI anual de referência
													</Text>
													<Heading size="xl" className="text-violet-600 dark:text-violet-300">
														{activeCdiRate
															? `${formatBasisPointsAsPercentage(activeCdiRate.annualRateInBasisPoints)}% a.a.`
															: 'Não configurado'}
													</Heading>
												</VStack>
												<Button variant="link" action="primary" onPress={handleOpenCdiSettings}>
													<ButtonIcon as={SettingsIcon} size="sm" />
													<ButtonText>Configurar</ButtonText>
												</Button>
											</HStack>
											<Text className={`${helperText} text-xs leading-5`}>
												{activeCdiRate
													? `Vigente desde ${formatDateInput(activeCdiRate.effectiveFrom)} • ${ownCdiRateHistory.length} taxa${ownCdiRateHistory.length === 1 ? '' : 's'} no histórico.`
													: 'Defina uma taxa de referência para ativar as projeções de renda fixa CDI.'}
											</Text>
										</VStack>
									</Box>

									{portfolioAnalytics.unconfiguredInvestmentIds.length > 0 ? (
										<Box className={`${tintedCardClassName} px-4 py-3`}>
											<HStack className="items-center justify-between gap-3">
												<Text className={`${bodyText} flex-1 text-sm leading-5`}>
													{portfolioAnalytics.unconfiguredInvestmentIds.length === 1
														? '1 investimento está sem taxa CDI vigente; a projeção usa o último valor confirmado.'
														: `${portfolioAnalytics.unconfiguredInvestmentIds.length} investimentos estão sem taxa CDI vigente; as projeções usam o último valor confirmado.`}
												</Text>
												<Button variant="link" action="primary" onPress={handleOpenCdiSettings}>
													<ButtonText>Resolver</ButtonText>
												</Button>
											</HStack>
										</Box>
									) : null}

									<View className="flex-row flex-wrap gap-3">
										<Box className={`${notTintedCardClassName} min-w-[145px] flex-1 px-4 py-4`}>
											<Text className={`${helperText} text-xs uppercase tracking-wide`}>
												Patrimônio estimado
											</Text>
											<Text className="mt-2 text-2xl font-bold text-violet-600 dark:text-violet-300">
												{formatCurrencyInCents(portfolioAnalytics.projectedValueInCents)}
											</Text>
										</Box>
										<Box className={`${notTintedCardClassName} min-w-[145px] flex-1 px-4 py-4`}>
											<Text className={`${helperText} text-xs uppercase tracking-wide`}>
												Rendimento acumulado
											</Text>
											<Text
												className={`mt-2 text-2xl font-bold ${
													portfolioAnalytics.totalGainInCents >= 0
														? 'text-emerald-600 dark:text-emerald-400'
														: 'text-rose-600 dark:text-rose-400'
												}`}
											>
												{formatCurrencyInCents(portfolioAnalytics.totalGainInCents)}
											</Text>
										</Box>
										<Box className={`${notTintedCardClassName} min-w-[145px] flex-1 px-4 py-4`}>
											<Text className={`${helperText} text-xs uppercase tracking-wide`}>
												Aplicado líquido
											</Text>
											<Text className="mt-2 text-2xl font-bold text-sky-600 dark:text-sky-300">
												{formatCurrencyInCents(portfolioAnalytics.netAppliedInCents)}
											</Text>
										</Box>
										<Box className={`${notTintedCardClassName} min-w-[145px] flex-1 px-4 py-4`}>
											<Text className={`${helperText} text-xs uppercase tracking-wide`}>
												Próximo dia
											</Text>
											<Text className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-300">
												{formatCurrencyInCents(portfolioAnalytics.dailyYieldInCents)}
											</Text>
										</Box>
									</View>

									<VStack className="gap-2">
										<Text className={`${bodyText} text-sm font-semibold`}>
											Rentabilidade por período
										</Text>
										<Box className={`${notTintedCardClassName} p-1.5`}>
											<Tabs
												value={performancePeriod}
												onValueChange={handlePerformancePeriodChange}
											>
												<TabsList>
													{performancePeriodOptions.map(option => (
														<TabsTrigger
															key={option.value}
															value={option.value}
															className="flex-1 px-1"
														>
															<TabsTriggerText className="text-xs">
																{option.label}
															</TabsTriggerText>
														</TabsTrigger>
													))}
													<TabsIndicator />
												</TabsList>
											</Tabs>
										</Box>
									</VStack>

									{investments.length > 0 ? (
										<Box className={`${notTintedCardClassName} px-4 py-4`}>
											<VStack className="gap-1">
												<HStack className="items-center gap-2">
													<Icon
														as={CalendarDaysIcon}
														size="md"
														className={isDarkMode ? 'text-yellow-300' : 'text-yellow-600'}
													/>
													<Heading size="md">Evolução da carteira</Heading>
												</HStack>
												<Text className={`${helperText} text-xs leading-5`}>
													Comparação entre capital líquido aplicado e patrimônio estimado no período selecionado.
												</Text>
											</VStack>
											<View style={{ height: 292, marginTop: 6 }}>
												<InvestmentEvolutionChart
													data={portfolioAnalytics.evolution}
													isDarkMode={isDarkMode}
													shouldHideValues={shouldHideValues}
													dom={{ focusable: false, scrollEnabled: true, style: { height: 292, backgroundColor: 'transparent' } }}
												/>
											</View>
										</Box>
									) : null}
								</VStack>
							)}

							<Button
								className={`${submitButtonClassName}`}
								onPress={handleNavigateToAdd}
							>
								<ButtonIcon as={AddIcon} size="sm" />
								<ButtonText>Adicionar um novo investimento</ButtonText>
								{isLoading && <ButtonSpinner />}
							</Button>


							{isInitialLoading ? (
								<FinancialListSkeleton
									skeletonBaseColor={skeletonBaseColor}
									skeletonHighlightColor={skeletonHighlightColor}
								/>
							) : investments.length === 0 ? (
								<Box
									className={`${compactCardClassName} items-center px-5 py-6`}
								>
									<Text className={`text-center ${helperText}`}>
										Você ainda não salvou nenhum investimento.
									</Text>
									<Button
										variant="link"
										action="primary"
										onPress={handleNavigateToAdd}
										className="mt-2"
									>
										<ButtonText>Registrar agora</ButtonText>
									</Button>
								</Box>
							) : (
								<VStack className="gap-2">
									<View style={{ marginTop: 10 }}>
										{investments.map((investment, index) => {
											const performance = portfolioAnalytics.itemsByInvestmentId[investment.id];
											const simulatedValueInCents =
												performance?.projectedValueInCents ?? resolveBaseValueInCents(investment);
											const dailyYieldInCents = performance?.dailyYieldInCents ?? 0;
											const bankInfo = banksMap[investment.bankId];
											const lastSyncLabel = getInvestmentManualSyncLabel(
												investment,
												formatCurrencyBRL,
											);
											const summaryText = getInvestmentSummaryText(
												investment,
												performance,
												formatCurrencyBRL,
											);
											const isExpanded = expandedInvestmentIds.includes(
												investment.id,
											);
											const badgeLabel = getInvestmentBadgeLabel(
												investment.name,
											);
											const primaryInvestmentActions = [
												{
													key: 'deposit',
													label: 'Aportar',
													icon: AddIcon,
													onPress: () => handleOpenDepositModal(investment),
												},
												{
													key: 'withdrawal',
													label: 'Resgatar',
													icon: ArrowDownIcon,
													onPress: () => handleOpenWithdrawalModal(investment),
												},
												{
													key: 'sync',
													label: 'Sincronizar',
													icon: RepeatIcon,
													onPress: () => handleOpenManualSyncModal(investment),
												},
											];
											const secondaryInvestmentActions = [
												{
													key: 'edit',
													label: 'Editar',
													icon: EditIcon,
													onPress: () => handleOpenEditModal(investment),
												},
												{
													key: 'delete',
													label: 'Excluir',
													icon: TrashIcon,
													onPress: () => handleRequestDelete(investment),
												},
											];
											const bankAccentColor =
												typeof bankInfo?.colorHex === 'string' &&
													bankInfo.colorHex.trim().length > 0
													? bankInfo.colorHex
													: INVESTMENT_TIMELINE_TONE.accentColor;

											return (
												<View
													key={investment.id}
													style={{ flexDirection: 'row' }}
												>
													<View
														style={{
															alignItems: 'center',
															width: '7%'
														}}
													>
														<View
															style={{
																width: 14,
																height: 14,
																borderRadius: 999,
																backgroundColor:
																	INVESTMENT_TIMELINE_TONE.accentColor,
																borderWidth: 2,
																borderColor: isDarkMode ? '#020617' : '#FFFFFF',
																shadowColor:
																	INVESTMENT_TIMELINE_TONE.accentColor,
																shadowOpacity: isDarkMode ? 0.26 : 0.14,
																shadowRadius: 8,
																shadowOffset: { width: 0, height: 4 },
																elevation: 2,
															}}
														/>
														{index < investments.length - 1 ? (
															<View
																style={{
																	flex: 1,
																	width: 3,
																	borderRadius: 999,
																	marginVertical: 2,
																	backgroundColor:
																		INVESTMENT_TIMELINE_TONE.lineColor,
																}}
															/>
														) : (
															<View />
														)}
													</View>

													<View style={{ width: '93%', paddingBottom: 14 }}>
														<TouchableOpacity
															activeOpacity={0.85}
															onPress={() =>
																handleToggleInvestmentCard(investment.id)
															}
															style={{ width: '100%' }}
														>
															<HStack className="items-center justify-between gap-3">
																<HStack
																	className="items-center gap-3"
																	style={{ flex: 1 }}
																>
																	<LinearGradient
																		colors={
																			INVESTMENT_TIMELINE_TONE.iconGradient
																		}
																		start={{ x: 0, y: 0 }}
																		end={{ x: 1, y: 1 }}
																		style={{
																			width: 44,
																			height: 44,
																			borderRadius: 16,
																			alignItems: 'center',
																			justifyContent: 'center',
																			flexShrink: 0,
																			position: 'relative',
																		}}
																	>
																		<Text
																			style={{
																				color: '#FFFFFF',
																				fontSize: 18,
																				fontWeight: '700',
																			}}
																		>
																			{badgeLabel}
																		</Text>
																		<View
																			style={{
																				position: 'absolute',
																				right: 6,
																				bottom: 6,
																				width: 8,
																				height: 8,
																				borderRadius: 999,
																				backgroundColor: bankAccentColor,
																				borderWidth: 1,
																				borderColor: 'rgba(255,255,255,0.9)',
																			}}
																		/>
																	</LinearGradient>

																	<View style={{ flex: 1 }}>
																		<Text
																			numberOfLines={1}
																			style={{
																				color: timelinePalette.title,
																				fontSize: 15,
																				fontWeight: '700',
																			}}
																		>
																			{investment.name}
																		</Text>
																		<Text
																			numberOfLines={1}
																			style={{
																				marginTop: 2,
																				color: timelinePalette.subtitle,
																				fontSize: 12,
																				lineHeight: 18,
																			}}
																		>
																			{bankInfo?.name ?? 'Banco não informado'}
																		</Text>
																	</View>
																</HStack>

																<HStack className="items-center gap-2">
																	<VStack className="items-end">
																		<Text
																			style={{
																				color:
																					INVESTMENT_TIMELINE_TONE.amountColor,
																				fontSize: 15,
																				fontWeight: '700',
																			}}
																		>
																			{formatCurrencyBRL(
																				convertCentsToBRL(
																					resolveBaseValueInCents(investment),
																				),
																			)}
																		</Text>
																		<HStack className="mt-1 items-center gap-1">
																			<Icon
																				as={CalendarDaysIcon}
																				size="xs"
																				className={
																					isDarkMode
																						? 'text-slate-500'
																						: 'text-slate-400'
																				}
																			/>
																			<Text
																				style={{
																					color: timelinePalette.subtitle,
																					fontSize: 11,
																				}}
																			>
																				{
																					redemptionTermLabels[
																					investment.redemptionTerm
																					]
																				}
																			</Text>
																		</HStack>
																	</VStack>

																	<Icon
																		as={
																			isExpanded
																				? ChevronUpIcon
																				: ChevronDownIcon
																		}
																		size="sm"
																		className={
																			isDarkMode
																				? 'text-slate-400'
																				: 'text-slate-500'
																		}
																	/>
																</HStack>
															</HStack>
														</TouchableOpacity>

														{isExpanded ? (
															<LinearGradient
																colors={INVESTMENT_TIMELINE_TONE.cardGradient}
																start={{ x: 0, y: 0 }}
																end={{ x: 1, y: 1 }}
																style={{
																	marginTop: 10,
																	marginRight: 16,
																	borderRadius: 20,
																	paddingHorizontal: 16,
																	paddingVertical: 14,
																}}
															>
																<VStack className="gap-3">
																	<HStack className="items-start justify-between gap-4">
																		<VStack className="flex-1">
																			<Text
																				style={{
																					fontSize: 10,
																					fontWeight: '700',
																					letterSpacing: 0.4,
																					color: 'rgba(255,255,255,0.74)',
																					textTransform: 'uppercase',
																				}}
																			>
																				Resumo
																			</Text>
																			<Text
																				style={{
																					fontSize: 13,
																					lineHeight: 19,
																					color: '#FFFFFF',
																					textAlign: 'justify',
																				}}
																			>
																				{summaryText}
																			</Text>
																		</VStack>


																	</HStack>

																	<View
																		style={{
																			flexDirection: 'row',
																			flexWrap: 'wrap',
																			columnGap: 14,
																			rowGap: 10,
																		}}
																	>
																		{[
																			{
																				label: 'Valor inicial',
																				value: formatCurrencyBRL(
																					convertCentsToBRL(
																						investment.initialValueInCents,
																					),
																				),
																			},
															{
																label: 'Patrimônio estimado',
																value:
																	formatCurrencyBRL(
																		convertCentsToBRL(simulatedValueInCents),
																	),
															},
															{
																label: 'Próximo dia',
																value: formatCurrencyBRL(
																	convertCentsToBRL(dailyYieldInCents),
																),
															},
															{
																label: 'Produto',
																value: investmentAssetTypeLabels[investment.assetType],
															},
															{
																label: 'Percentual CDI',
																value:
																	investment.valuationMethod === 'cdi'
																		? `${formatBasisPointsAsPercentage(investment.cdiPercentageInBasisPoints)}%`
																		: 'Atualização manual',
																			},
																			{
																				label: 'Banco',
																				value:
																					bankInfo?.name ??
																					'Banco não informado',
																			},
																			{
																				label: 'Liquidez',
																				value:
																					redemptionTermLabels[
																					investment.redemptionTerm
																					],
																			},
																		].map((item) => (
																			<View
																				key={`${investment.id}-${item.label}`}
																				style={{ width: '46%', minWidth: 128 }}
																			>
																				<Text
																					style={{
																						fontSize: 10,
																						fontWeight: '700',
																						letterSpacing: 0.4,
																						color: 'rgba(255,255,255,0.72)',
																						textTransform: 'uppercase',
																					}}
																				>
																					{item.label}
																				</Text>
																				<Text
																					style={{
																						marginTop: 3,
																						fontSize: 13,
																						lineHeight: 18,
																						color: '#FFFFFF',
																					}}
																				>
																					{item.value}
																				</Text>
																			</View>
																		))}
																	</View>

																	<View style={{ paddingTop: 2 }}>
																		<Text
																			style={{
																				fontSize: 10,
																				fontWeight: '700',
																				letterSpacing: 0.4,
																				color: 'rgba(255,255,255,0.72)',
																				textTransform: 'uppercase',
																			}}
																		>
																			Sincronização manual
																		</Text>
																		<Text
																			style={{
																				marginTop: 6,
																				fontSize: 13,
																				lineHeight: 18,
																				color: '#FFFFFF',
																			}}
																		>
																			{lastSyncLabel}
																		</Text>
																		<Text
																			style={{
																				marginTop: 4,
																				fontSize: 11,
																				lineHeight: 16,
																				color: 'rgba(255,255,255,0.72)',
																			}}
																		>
																			Cadastrado em{' '}
																			{formatDateToBR(investment.createdAtISO)}
																		</Text>
																	</View>

																	{investment.description ? (
																		<View style={{ paddingTop: 2 }}>
																			<Text
																				style={{
																					fontSize: 10,
																					fontWeight: '700',
																					letterSpacing: 0.4,
																					color: 'rgba(255,255,255,0.72)',
																					textTransform: 'uppercase',
																				}}
																			>
																				Descrição
																			</Text>
																			<Text
																				style={{
																					marginTop: 6,
																					fontSize: 13,
																					lineHeight: 18,
																					color: '#FFFFFF',
																				}}
																			>
																				{investment.description}
																			</Text>
																		</View>
																	) : null}

																	<View style={{ paddingTop: 2, gap: 2 }}>
																		<View
																			style={{
																				flexDirection: 'row',
																				columnGap: 12,
																			}}
																		>
																			{primaryInvestmentActions.map((action) => (
																				<TouchableOpacity
																					key={`${investment.id}-${action.key}`}
																					activeOpacity={0.85}
																					onPress={action.onPress}
																					style={{
																						width: '31%',
																						minHeight: 30,
																						flexDirection: 'row',
																						alignItems: 'center',
																						gap: 8,
																						paddingVertical: 4,
																					}}
																				>
																					<Icon
																						as={action.icon}
																						size="sm"
																						className="text-white"
																					/>
																					<Text
																						className="text-xs font-semibold text-white"
																						style={{ flexShrink: 1 }}
																					>
																						{action.label}
																					</Text>
																				</TouchableOpacity>
																			))}
																		</View>

																		<View
																			style={{
																				flexDirection: 'row',
																				columnGap: 12,
																			}}
																		>
																			{secondaryInvestmentActions.map((action) => (
																				<TouchableOpacity
																					key={`${investment.id}-${action.key}`}
																					activeOpacity={0.85}
																					onPress={action.onPress}
																					style={{
																						width: '31%',
																						minHeight: 30,
																						flexDirection: 'row',
																						alignItems: 'center',
																						gap: 8,
																						paddingVertical: 4,
																					}}
																				>
																					<Icon
																						as={action.icon}
																						size="sm"
																						className="text-white"
																					/>
																					<Text
																						className="text-xs font-semibold text-white"
																						style={{ flexShrink: 1 }}
																					>
																						{action.label}
																					</Text>
																				</TouchableOpacity>
																			))}
																		</View>
																	</View>
																</VStack>
															</LinearGradient>
														) : null}
													</View>
												</View>
											);
										})}
									</View>
								</VStack>
							)}
						</VStack>
					</ScrollView>
				</View>

				<View style={{ marginHorizontal: -18, paddingBottom: 0, flexShrink: 0 }}>
					<Navigator defaultValue={1} onHardwareBack={handleBackToHome} />
				</View>
				<Modal isOpen={isCdiSettingsOpen} onClose={handleCloseCdiSettings}>
					<ModalBackdrop />
					<KeyboardAvoidingView
						behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
						keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
					>
						<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
							<ModalHeader>
								<ModalTitle>Taxa CDI anual</ModalTitle>
								<ModalCloseButton onPress={handleCloseCdiSettings} />
							</ModalHeader>
							<ModalBody>
								<ScrollView
									keyboardShouldPersistTaps="handled"
									keyboardDismissMode="on-drag"
									contentContainerStyle={{ paddingBottom: 20 }}
								>
									<VStack className="gap-2">
										<Text className={`${bodyText} text-sm leading-5`}>
											Cadastre a taxa anual de referência e sua data de vigência. A carteira aplica cada alteração somente a partir da data informada, sem criar transações.
										</Text>
										{renderStandardizedInput({
											label: 'CDI anual (%)',
											value: cdiRateInput,
											onChangeText: text => setCdiRateInput(sanitizeNumberInput(text)),
											placeholder: 'Ex: 13,75',
											keyboardType: 'decimal-pad',
											isDisabled: isSavingCdiRate,
										})}
										<VStack className="mb-2 gap-1">
											<Text className={`${bodyText} ml-1 text-sm`}>Vigência da taxa</Text>
											<DatePickerField
												accessibilityLabel="Selecionar início de vigência da taxa CDI"
												value={cdiEffectiveDate}
												onChange={setCdiEffectiveDate}
												triggerClassName={fieldContainerClassName}
												inputClassName={inputField}
												isDisabled={isSavingCdiRate}
											/>
										</VStack>

										<VStack className="mt-2 gap-2">
											<Text className={`${bodyText} text-sm font-semibold`}>Histórico salvo</Text>
											{ownCdiRateHistory.length === 0 ? (
												<Box className={`${tintedCardClassName} px-3 py-3`}>
													<Text className={`${helperText} text-xs leading-5`}>
														Nenhuma taxa foi cadastrada ainda. Enquanto não houver uma taxa vigente, a projeção conserva o valor sincronizado.
													</Text>
												</Box>
											) : (
												ownCdiRateHistory.slice(0, 6).map(rate => (
													<HStack
														key={rate.id}
														className={`${notTintedCardClassName} items-center justify-between px-3 py-3`}
													>
														<VStack className="gap-1">
															<Text className={`${bodyText} text-sm font-semibold`}>
																{formatBasisPointsAsPercentage(rate.annualRateInBasisPoints)}% a.a.
															</Text>
															<Text className={`${helperText} text-xs`}>
																Vigente desde {formatDateInput(rate.effectiveFrom)}
															</Text>
														</VStack>
														{activeCdiRate?.id === rate.id ? (
															<Text className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Atual</Text>
														) : null}
													</HStack>
												))
											)}
										</VStack>
									</VStack>
								</ScrollView>
							</ModalBody>
							<ModalFooter className="gap-3">
								<Button
									variant="outline"
									onPress={handleCloseCdiSettings}
									isDisabled={isSavingCdiRate}
									className={submitButtonCancelClassName}
								>
									<ButtonText>Cancelar</ButtonText>
								</Button>
								<Button
									onPress={handleSaveCdiRate}
									isDisabled={isSavingCdiRate}
									className={submitButtonClassName}
								>
									{isSavingCdiRate ? (
										<>
											<ButtonSpinner color="white" />
											<ButtonText>Salvando</ButtonText>
										</>
									) : (
										<ButtonText>Salvar taxa</ButtonText>
									)}
								</Button>
							</ModalFooter>
						</ModalContent>
					</KeyboardAvoidingView>
				</Modal>
				<Modal isOpen={Boolean(editingInvestment)} onClose={closeEditModal}>
					<ModalBackdrop />
					<KeyboardAvoidingView
						behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
						keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
					>
						<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
							<ModalHeader>
								<ModalTitle>Editar investimento</ModalTitle>
								<ModalCloseButton onPress={closeEditModal} />
							</ModalHeader>
							<ModalBody>
								<ScrollView
									keyboardShouldPersistTaps="handled"
									keyboardDismissMode="on-drag"
									contentContainerStyle={{ paddingBottom: 24 }}
								>
									<Text className={`${bodyText} mb-4 text-sm`}>
										Ajuste nome, valor base, CDI e banco do investimento.
									</Text>
									<VStack>
								{renderStandardizedInput({
									label: 'Nome do investimento',
									value: editName,
									onChangeText: setEditName,
									placeholder: 'Digite o nome do investimento',
									keyboardType: 'default',
									autoCapitalize: 'sentences',
									returnKeyType: 'next',
									isDisabled: isSavingEdit,
								})}
								{renderStandardizedInput({
									label: 'Valor inicial',
									value: editInitialInput,
									onChangeText: handleEditInitialInputChange,
									placeholder: 'Digite o valor inicial',
									keyboardType: 'numeric',
									returnKeyType: 'next',
									isDisabled: isSavingEdit,
								})}
								{renderStandardizedInput({
									label: 'CDI (%)',
									value: editCdiInput,
									onChangeText: (text) =>
										setEditCdiInput(sanitizeNumberInput(text)),
									placeholder: 'Digite o percentual do CDI',
									keyboardType: 'decimal-pad',
									isDisabled: isSavingEdit,
								})}
								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
										Prazo de resgate
									</Text>
									<Select
										selectedValue={editTerm}
										onValueChange={(value) =>
											setEditTerm(value as RedemptionTerm)
										}
										isDisabled={isSavingEdit}
									>
										<SelectTrigger
											variant="outline"
											size="md"
											className={fieldContainerClassName}
										>
											<SelectInput
												value={redemptionTermLabels[editTerm]}
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
												{redemptionOptions.map((option) => (
													<SelectItem
														key={option.value}
														label={option.label}
														value={option.value}
													/>
												))}
											</SelectContent>
										</SelectPortal>
									</Select>
								</VStack>
								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
										Banco
									</Text>
									<Select
										selectedValue={editBankId ?? undefined}
										onValueChange={(value) => setEditBankId(value)}
										isDisabled={isSavingEdit || bankOptions.length === 0}
									>
										<SelectTrigger
											variant="outline"
											size="md"
											className={fieldContainerClassName}
										>
											<SelectInput
												placeholder="Selecione o banco"
												value={
													editBankId
														? (bankOptions.find(
															(bank) => bank.id === editBankId,
														)?.name ?? '')
														: ''
												}
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
													bankOptions.map((bank) => (
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
								<VStack className="mb-1">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
										Descrição
									</Text>
									<Textarea
										className={textareaContainerClassName}
										isDisabled={isSavingEdit}
									>
										<TextareaInput
											value={editDescription}
											onChangeText={setEditDescription}
											placeholder="Adicione um contexto para este investimento"
											className={inputField}
										/>
									</Textarea>
								</VStack>
									</VStack>
								</ScrollView>
							</ModalBody>
							<ModalFooter className="gap-3">
								<Button
									variant="outline"
									onPress={closeEditModal}
									isDisabled={isSavingEdit}
									className={submitButtonCancelClassName}
								>
									<ButtonText>Cancelar</ButtonText>
								</Button>
								<Button
									onPress={handleSubmitEdit}
									isDisabled={isSavingEdit}
									className={submitButtonClassName}
								>
									{isSavingEdit ? (
										<>
											<ButtonSpinner color="white" />
											<ButtonText>Salvando</ButtonText>
										</>
									) : (
										<ButtonText>Salvar alterações</ButtonText>
									)}
								</Button>
							</ModalFooter>
						</ModalContent>
					</KeyboardAvoidingView>
				</Modal>

				<Modal
					isOpen={Boolean(investmentForDepositSync)}
					onClose={handleCloseDepositSyncModal}
				>
					<ModalBackdrop />
					<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>Sincronização</ModalTitle>
							<ModalCloseButton onPress={handleCloseDepositSyncModal} />
						</ModalHeader>
						<ModalBody>
							<Text className={`${bodyText} mb-4 text-sm`}>
								Confirme o valor disponível hoje em{' '}
								<Text className="font-semibold">
									{investmentForDepositSync?.name ?? 'seu investimento'}
								</Text>
								.
							</Text>
							{renderStandardizedInput({
								label: 'Valor disponível hoje',
								value: depositSyncInput,
								onChangeText: handleDepositSyncInputChange,
								keyboardType: 'numeric',
								placeholder: 'Ex: 1.000,00',
								isDisabled: isSavingDepositSync,
							})}
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button
								variant="outline"
								onPress={handleCloseDepositSyncModal}
								isDisabled={isSavingDepositSync}
								className={submitButtonCancelClassName}
							>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button
								onPress={handleConfirmDepositSync}
								isDisabled={isSavingDepositSync}
								className={submitButtonClassName}
							>
								{isSavingDepositSync ? (
									<>
										<ButtonSpinner color="white" />
										<ButtonText>Sincronizando</ButtonText>
									</>
								) : (
									<ButtonText>Sincronizar e continuar</ButtonText>
								)}
							</Button>
						</ModalFooter>
					</ModalContent>
				</Modal>

				<Modal
					isOpen={Boolean(investmentForDeposit)}
					onClose={handleCloseDepositModal}
				>
					<ModalBackdrop />
					<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>Adicionar ao investimento</ModalTitle>
							<ModalCloseButton onPress={handleCloseDepositModal} />
						</ModalHeader>
						<ModalBody>
							<Box className={`${notTintedCardClassName} mb-4 px-4 py-4`}>
								<VStack className="gap-1">
									<Text
										className={`${helperText} text-xs uppercase tracking-wide`}
									>
										Valor base
									</Text>
									<Text className="text-lg font-semibold">
										{syncedDepositDisplayValue}
									</Text>
								</VStack>
							</Box>
							<Text className={`${bodyText} mb-4 text-sm`}>
								Informe o valor que deseja acrescentar em{' '}
								<Text className="font-semibold">
									{investmentForDeposit?.name ?? 'seu investimento'}
								</Text>
								.
							</Text>
							{renderStandardizedInput({
								label: 'Valor do aporte',
								value: depositInput,
								onChangeText: handleDepositInputChange,
								keyboardType: 'numeric',
								placeholder: 'Ex: 500,00',
								isDisabled: isSavingDeposit,
							})}
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button
								variant="outline"
								onPress={handleCloseDepositModal}
								isDisabled={isSavingDeposit}
								className={submitButtonCancelClassName}
							>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button
								onPress={handleConfirmDeposit}
								isDisabled={isSavingDeposit}
								className={submitButtonClassName}
							>
								{isSavingDeposit ? (
									<>
										<ButtonSpinner color="white" />
										<ButtonText>Adicionando</ButtonText>
									</>
								) : (
									<ButtonText>Adicionar valor</ButtonText>
								)}
							</Button>
						</ModalFooter>
					</ModalContent>
				</Modal>

				<Modal
					isOpen={Boolean(investmentForWithdrawalSync)}
					onClose={handleCloseWithdrawalSyncModal}
				>
					<ModalBackdrop />
					<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>Sincronizar antes de resgatar</ModalTitle>
							<ModalCloseButton onPress={handleCloseWithdrawalSyncModal} />
						</ModalHeader>
						<ModalBody>
							<Text className={`${bodyText} mb-4 text-sm`}>
								Confirme o valor disponível hoje em{' '}
								<Text className="font-semibold">
									{investmentForWithdrawalSync?.name ?? 'seu investimento'}
								</Text>
								.
							</Text>
							{renderStandardizedInput({
								label: 'Valor disponível hoje',
								value: withdrawSyncInput,
								onChangeText: handleWithdrawSyncInputChange,
								keyboardType: 'numeric',
								placeholder: 'Ex: 1.000,00',
								isDisabled: isSavingWithdrawalSync,
							})}
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button
								variant="outline"
								onPress={handleCloseWithdrawalSyncModal}
								isDisabled={isSavingWithdrawalSync}
								className={submitButtonCancelClassName}
							>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button
								onPress={handleConfirmWithdrawalSync}
								isDisabled={isSavingWithdrawalSync}
								className={submitButtonClassName}
							>
								{isSavingWithdrawalSync ? (
									<>
										<ButtonSpinner color="white" />
										<ButtonText>Sincronizando</ButtonText>
									</>
								) : (
									<ButtonText>Sincronizar e continuar</ButtonText>
								)}
							</Button>
						</ModalFooter>
					</ModalContent>
				</Modal>

				<Modal
					isOpen={Boolean(investmentForWithdrawal)}
					onClose={handleCloseWithdrawalModal}
				>
					<ModalBackdrop />
					<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>Resgatar investimento</ModalTitle>
							<ModalCloseButton onPress={handleCloseWithdrawalModal} />
						</ModalHeader>
						<ModalBody>
							<Box className={`${tintedCardClassName} mb-4 px-4 py-4`}>
								<VStack className="gap-1">
									<Text
										className={`${helperText} text-xs uppercase tracking-wide`}
									>
										Valor base
									</Text>
									<Text className="text-lg font-semibold">
										{syncedWithdrawalDisplayValue}
									</Text>
								</VStack>
							</Box>
							<Text className={`${bodyText} mb-4 text-sm`}>
								Quanto você deseja resgatar de{' '}
								<Text className="font-semibold">
									{investmentForWithdrawal?.name ?? 'seu investimento'}
								</Text>
								?
							</Text>
							{renderStandardizedInput({
								label: 'Valor do resgate',
								value: withdrawInput,
								onChangeText: handleWithdrawInputChange,
								keyboardType: 'numeric',
								placeholder: 'Ex: 250,00',
								isDisabled: isSavingWithdrawal,
							})}
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button
								variant="outline"
								onPress={handleCloseWithdrawalModal}
								isDisabled={isSavingWithdrawal}
								className={submitButtonCancelClassName}
							>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button
								onPress={handleConfirmWithdrawal}
								isDisabled={isSavingWithdrawal}
								className={submitButtonClassName}
							>
								{isSavingWithdrawal ? (
									<>
										<ButtonSpinner color="white" />
										<ButtonText>Resgatando</ButtonText>
									</>
								) : (
									<ButtonText>Confirmar resgate</ButtonText>
								)}
							</Button>
						</ModalFooter>
					</ModalContent>
				</Modal>

				<Modal
					isOpen={Boolean(investmentForSync)}
					onClose={handleCloseManualSyncModal}
				>
					<ModalBackdrop />
					<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>Sincronizar valor real</ModalTitle>
							<ModalCloseButton onPress={handleCloseManualSyncModal} />
						</ModalHeader>
						<ModalBody>
							<Text className={`${bodyText} mb-4 text-sm`}>
								Informe o valor atual disponível em{' '}
								<Text className="font-semibold">
									{investmentForSync?.name ?? 'seu investimento'}
								</Text>
								.
							</Text>
							{renderStandardizedInput({
								label: 'Valor atual disponível',
								value: syncInput,
								onChangeText: handleManualSyncInputChange,
								keyboardType: 'numeric',
								placeholder: 'Ex: 1.250,45',
								isDisabled: isSavingSync,
							})}
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button
								variant="outline"
								onPress={handleCloseManualSyncModal}
								isDisabled={isSavingSync}
								className={submitButtonCancelClassName}
							>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button
								onPress={handleConfirmManualSync}
								isDisabled={isSavingSync}
								className={submitButtonClassName}
							>
								{isSavingSync ? (
									<>
										<ButtonSpinner color="white" />
										<ButtonText>Sincronizando</ButtonText>
									</>
								) : (
									<ButtonText>Salvar valor</ButtonText>
								)}
							</Button>
						</ModalFooter>
					</ModalContent>
				</Modal>

				<Modal
					isOpen={Boolean(investmentPendingDeletion)}
					onClose={handleCloseDeleteModal}
				>
					<ModalBackdrop />
					<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>Excluir investimento</ModalTitle>
							<ModalCloseButton onPress={handleCloseDeleteModal} />
						</ModalHeader>
						<ModalBody>
							<Text className={`${bodyText} text-sm`}>
								Tem certeza de que deseja remover{' '}
								<Text className="font-semibold">
									{investmentPendingDeletion?.name ?? 'este investimento'}
								</Text>
								? Essa ação não pode ser desfeita.
							</Text>
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button
								variant="outline"
								onPress={handleCloseDeleteModal}
								isDisabled={isDeleting}
								className={submitButtonCancelClassName}
							>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button
								variant="solid"
								action="negative"
								onPress={handleConfirmDelete}
								isDisabled={isDeleting}
								className={submitButtonClassName}
							>
								{isDeleting ? (
									<>
										<ButtonSpinner color="white" />
										<ButtonText>Excluindo</ButtonText>
									</>
								) : (
									<ButtonText>Excluir</ButtonText>
								)}
							</Button>
						</ModalFooter>
					</ModalContent>
				</Modal>
			</View>
		</SafeAreaView>
	);
}
