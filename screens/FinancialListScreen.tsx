import React from 'react';
import { ScrollView, View, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { AddIcon, EditIcon, TrashIcon, ArrowDownIcon } from '@/components/ui/icon';
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

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import FinancialListIllustration from '../assets/UnDraw/financialListScreen.svg';

import { auth } from '@/FirebaseConfig';
import {
	deleteFinanceInvestmentFirebase,
	getFinanceInvestmentsWithRelationsFirebase,
	updateFinanceInvestmentFirebase,
	syncFinanceInvestmentValueFirebase,
} from '@/functions/FinancesFirebase';
import { getBanksWithUsersByPersonFirebase } from '@/functions/BankFirebase';
import { redemptionTermLabels, RedemptionTerm } from '@/utils/finance';
import { addTagFirebase, getAllTagsFirebase } from '@/functions/TagFirebase';
import { addExpenseFirebase } from '@/functions/ExpenseFirebase';
import { addGainFirebase } from '@/functions/GainFirebase';
import { serializeTagIconSelection } from '@/hooks/useTagIcons';
import { useScreenStyles } from '@/hooks/useScreenStyle';

type FinanceInvestment = {
	id: string;
	name: string;
	initialValueInCents: number;
	currentValueInCents: number;
	cdiPercentage: number;
	redemptionTerm: RedemptionTerm;
	bankId: string;
	description?: string | null;
	createdAtISO: string;
	lastManualSyncValueInCents?: number | null;
	lastManualSyncAtISO?: string | null;
};

type BankMetadata = {
	id: string;
	name: string;
	colorHex?: string | null;
};

const INVESTMENT_TAG_LABEL = 'Investimento';

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

const redemptionOptions: { value: RedemptionTerm; label: string }[] = [
	{ value: 'anytime', label: redemptionTermLabels.anytime },
	{ value: '1m', label: redemptionTermLabels['1m'] },
	{ value: '3m', label: redemptionTermLabels['3m'] },
	{ value: '6m', label: redemptionTermLabels['6m'] },
	{ value: '1y', label: redemptionTermLabels['1y'] },
	{ value: '2y', label: redemptionTermLabels['2y'] },
	{ value: '3y', label: redemptionTermLabels['3y'] },
];

const DAYS_IN_YEAR = 365;
const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;
const BASE_CDI_ANNUAL_RATE = 0.1375;

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

const parseStringToNumber = (value: string) => {
	if (!value.trim()) {
		return NaN;
	}
	const normalized = value.replace(/\./g, '').replace(',', '.');
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : NaN;
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
		return (value as { toDate?: () => Date }).toDate?.()?.toISOString() ?? new Date().toISOString();
	}
	if (typeof value === 'string') {
		return value;
	}
	return new Date().toISOString();
};

const getDaysSinceDate = (isoDate: string) => {
	const createdAt = new Date(isoDate);
	if (Number.isNaN(createdAt.getTime())) {
		return 0;
	}
	const diff = Date.now() - createdAt.getTime();
	return diff > 0 ? Math.floor(diff / MILLISECONDS_IN_DAY) : 0;
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

const resolveBaseDateISO = (investment: FinanceInvestment) =>
	investment.lastManualSyncAtISO ?? investment.createdAtISO;

const calculateDailyRate = (cdiPercentage: number) => {
	if (!Number.isFinite(cdiPercentage) || cdiPercentage <= 0) {
		return 0;
	}
	const normalizedAnnualRate = BASE_CDI_ANNUAL_RATE * (cdiPercentage / 100);
	return normalizedAnnualRate / DAYS_IN_YEAR;
};

const simulateCurrentValue = (investment: FinanceInvestment) => {
	const baseValue = convertCentsToBRL(resolveBaseValueInCents(investment));
	const dailyRate = calculateDailyRate(investment.cdiPercentage);
	if (dailyRate <= 0) {
		return baseValue;
	}
	const days = getDaysSinceDate(resolveBaseDateISO(investment));
	return baseValue * Math.pow(1 + dailyRate, days);
};

const simulateDailyYield = (investment: FinanceInvestment) => {
	const dailyRate = calculateDailyRate(investment.cdiPercentage);
	const baseValue = convertCentsToBRL(resolveBaseValueInCents(investment));
	return dailyRate > 0 ? baseValue * dailyRate : 0;
};

function FinancialListSkeleton({
	compactCardClassName,
	skeletonBaseColor,
	skeletonHighlightColor,
}: {
	compactCardClassName: string;
	skeletonBaseColor: string;
	skeletonHighlightColor: string;
}) {
	return (
		<VStack className="mt-4 gap-4">
			{Array.from({ length: 3 }).map((_, index) => (
				<Box key={`financial-list-skeleton-${index}`} className={`${compactCardClassName} px-4 py-4`}>
					<VStack className="gap-3">
						<HStack className="items-start justify-between gap-3">
							<VStack className="flex-1 gap-2">
								<Skeleton className="h-5 w-40" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
								<Skeleton className="h-3 w-28" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
							</VStack>
							<Skeleton className="h-5 w-20" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
						</HStack>
						<SkeletonText _lines={2} className="h-3" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
						<HStack className="gap-3">
							<Skeleton className="h-9 flex-1 rounded-2xl" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
							<Skeleton className="h-9 flex-1 rounded-2xl" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
						</HStack>
					</VStack>
				</Box>
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
		submitButtonClassName,
		heroHeight,
		insets,
		compactCardClassName,
		tintedCardClassName,
		topSummaryCardClassName,
		modalContentClassName,
		skeletonBaseColor,
		skeletonHighlightColor,
		skeletonMutedBaseColor,
		skeletonMutedHighlightColor,
	} = useScreenStyles();
	const [investments, setInvestments] = React.useState<FinanceInvestment[]>([]);
	const [banksMap, setBanksMap] = React.useState<Record<string, BankMetadata>>({});
	const bankOptions = React.useMemo(() => Object.values(banksMap), [banksMap]);

	const [isLoading, setIsLoading] = React.useState(false);
	const [editingInvestment, setEditingInvestment] = React.useState<FinanceInvestment | null>(null);
	const [editName, setEditName] = React.useState('');
	const [editInitialInput, setEditInitialInput] = React.useState('');
	const [editCdiInput, setEditCdiInput] = React.useState('');
	const [editTerm, setEditTerm] = React.useState<RedemptionTerm>('anytime');
	const [editBankId, setEditBankId] = React.useState<string | null>(null);
	const [isSavingEdit, setIsSavingEdit] = React.useState(false);
	const [investmentPendingDeletion, setInvestmentPendingDeletion] = React.useState<FinanceInvestment | null>(null);
	const [isDeleting, setIsDeleting] = React.useState(false);
	const [investmentForWithdrawal, setInvestmentForWithdrawal] = React.useState<FinanceInvestment | null>(null);
	const [investmentForWithdrawalSync, setInvestmentForWithdrawalSync] = React.useState<FinanceInvestment | null>(null);
	const [withdrawSyncInput, setWithdrawSyncInput] = React.useState('');
	const [isSavingWithdrawalSync, setIsSavingWithdrawalSync] = React.useState(false);
	const [syncedWithdrawalValueInCents, setSyncedWithdrawalValueInCents] = React.useState<number | null>(null);
	const [withdrawInput, setWithdrawInput] = React.useState('');
	const [isSavingWithdrawal, setIsSavingWithdrawal] = React.useState(false);
	const [investmentForDeposit, setInvestmentForDeposit] = React.useState<FinanceInvestment | null>(null);
	const [investmentForDepositSync, setInvestmentForDepositSync] = React.useState<FinanceInvestment | null>(null);
	const [depositSyncInput, setDepositSyncInput] = React.useState('');
	const [isSavingDepositSync, setIsSavingDepositSync] = React.useState(false);
	const [syncedDepositValueInCents, setSyncedDepositValueInCents] = React.useState<number | null>(null);
	const [depositInput, setDepositInput] = React.useState('');
	const [isSavingDeposit, setIsSavingDeposit] = React.useState(false);
	const [investmentForSync, setInvestmentForSync] = React.useState<FinanceInvestment | null>(null);
	const [syncInput, setSyncInput] = React.useState('');
	const [isSavingSync, setIsSavingSync] = React.useState(false);
	const { shouldHideValues } = useValueVisibility();

	const formatCurrencyBRL = React.useCallback(
		(value: number) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}
			return formatCurrencyBRLRaw(value);
		},
		[shouldHideValues],
	);

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

	const loadData = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showFloatingAlert({
				message: 'Usuário não autenticado. Faça login novamente.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		setIsLoading(true);
		try {
			const [investmentsResponse, banksResponse] = await Promise.all([
				getFinanceInvestmentsWithRelationsFirebase(currentUser.uid),
				getBanksWithUsersByPersonFirebase(currentUser.uid),
			]);

			if (!investmentsResponse.success || !Array.isArray(investmentsResponse.data)) {
				throw new Error('Erro ao carregar investimentos.');
			}
			if (!banksResponse.success || !Array.isArray(banksResponse.data)) {
				throw new Error('Erro ao carregar bancos.');
			}

			const normalizedBanks: BankMetadata[] = (banksResponse.data as Array<Record<string, any>>).map(bank => ({
				id: String(bank.id),
				name:
					typeof bank.name === 'string' && bank.name.trim().length > 0
						? bank.name.trim()
						: 'Banco sem nome',
				colorHex: typeof bank.colorHex === 'string' ? bank.colorHex : null,
			}));

			const normalizedInvestments: FinanceInvestment[] = (investmentsResponse.data as Array<Record<string, any>>).map(
				investment => ({
					id: String(investment.id),
					name:
						typeof investment.name === 'string' && investment.name.trim().length > 0
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
					cdiPercentage: typeof investment.cdiPercentage === 'number' ? investment.cdiPercentage : 0,
					redemptionTerm: (investment.redemptionTerm as RedemptionTerm) ?? 'anytime',
					bankId: typeof investment.bankId === 'string' ? investment.bankId : '',
					description:
						typeof investment.description === 'string' && investment.description.trim().length > 0
							? investment.description.trim()
							: null,
					createdAtISO: normalizeDate(investment.createdAt),
					lastManualSyncValueInCents:
						typeof investment.lastManualSyncValueInCents === 'number'
							? investment.lastManualSyncValueInCents
							: null,
					lastManualSyncAtISO: investment.lastManualSyncAt ? normalizeDate(investment.lastManualSyncAt) : null,
				}),
			);

			setBanksMap(
				normalizedBanks.reduce<Record<string, BankMetadata>>((acc, bank) => {
					acc[bank.id] = bank;
					return acc;
				}, {}),
			);
			setInvestments(normalizedInvestments);
		} catch (error) {
			console.error('Erro ao carregar dados de investimentos:', error);
			showFloatingAlert({
				message: 'Não foi possível carregar os investimentos.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsLoading(false);
		}
	}, []);

	useFocusEffect(
		React.useCallback(() => {
			void loadData();
		}, [loadData]),
	);

	const ensureInvestmentTag = React.useCallback(async (usageType: 'expense' | 'gain') => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			throw new Error('Usuário não autenticado.');
		}

		try {
			const tagsResult = await getAllTagsFirebase();
			if (tagsResult.success && Array.isArray(tagsResult.data)) {
				const existing = (tagsResult.data as Array<Record<string, any>>).find(tag => {
					const rawName = typeof tag?.name === 'string' ? tag.name.trim() : '';
					const normalizedName = rawName.toLowerCase();
					const tagUsage = typeof tag?.usageType === 'string' ? tag.usageType : undefined;
					const resolvedUsage = tagUsage ?? usageType;
					return (
						normalizedName === INVESTMENT_TAG_LABEL.toLowerCase() &&
						resolvedUsage === usageType &&
						String(tag?.personId) === currentUser.uid
					);
				});

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
	}, []);

	const totalInvested = React.useMemo(
		() => convertCentsToBRL(investments.reduce((total, current) => total + resolveBaseValueInCents(current), 0)),
		[investments],
	);

	const totalSimulatedAmount = React.useMemo(
		() => investments.reduce((total, investment) => total + simulateCurrentValue(investment), 0),
		[investments],
	);

	const totalDailyYield = React.useMemo(
		() => investments.reduce((total, investment) => total + simulateDailyYield(investment), 0),
		[investments],
	);

	const bankSummaries = React.useMemo(() => {
		const summaries: Record<
			string,
			{
				bankId: string;
				bankName: string;
				colorHex?: string | null;
				totalInvested: number;
				totalSimulated: number;
				totalDailyYield: number;
				investmentCount: number;
			}
		> = {};

		investments.forEach(investment => {
			const meta = banksMap[investment.bankId];
			const bankKey = investment.bankId || 'unknown';
			if (!summaries[bankKey]) {
				summaries[bankKey] = {
					bankId: bankKey,
					bankName: meta?.name ?? 'Banco não vinculado',
					colorHex: meta?.colorHex,
					totalInvested: 0,
					totalSimulated: 0,
					totalDailyYield: 0,
					investmentCount: 0,
				};
			}

			summaries[bankKey].totalInvested += convertCentsToBRL(resolveBaseValueInCents(investment));
			summaries[bankKey].totalSimulated += simulateCurrentValue(investment);
			summaries[bankKey].totalDailyYield += simulateDailyYield(investment);
			summaries[bankKey].investmentCount += 1;
		});

		return Object.values(summaries).sort((a, b) => b.totalInvested - a.totalInvested);
	}, [banksMap, investments]);

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

	const handleNavigateToAdd = React.useCallback(() => {
		router.push('/add-finance');
	}, []);

	const handleBackToHome = React.useCallback(() => {
		router.replace('/home?tab=0');
		return true;
	}, []);

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
	}, [isSavingEdit]);

	const handleOpenEditModal = React.useCallback((investment: FinanceInvestment) => {
		setEditingInvestment(investment);
		setEditName(investment.name);
		setEditInitialInput(formatCurrencyBRLRaw(convertCentsToBRL(investment.initialValueInCents)));
		setEditCdiInput(investment.cdiPercentage.toString());
		setEditTerm(investment.redemptionTerm);
		setEditBankId(investment.bankId);
	}, []);

	const handleSubmitEdit = React.useCallback(async () => {
		if (!editingInvestment || !editBankId) {
			return;
		}

		const parsedInitialCents = parseCurrencyInputToCents(editInitialInput);
		const parsedCdi = parseStringToNumber(editCdiInput);

		if (editName.trim().length === 0 || parsedInitialCents === null || parsedInitialCents <= 0) {
			showFloatingAlert({
				message: 'Informe um nome e um valor inicial válidos.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		if (!Number.isFinite(parsedCdi) || parsedCdi <= 0) {
			showFloatingAlert({
				message: 'Informe um CDI válido para editar.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		setIsSavingEdit(true);
		try {
			const result = await updateFinanceInvestmentFirebase({
				investmentId: editingInvestment.id,
				name: editName.trim(),
				initialValueInCents: parsedInitialCents,
				cdiPercentage: parsedCdi,
				redemptionTerm: editTerm,
				bankId: editBankId,
			});

			if (!result.success) {
				throw new Error('Erro ao atualizar investimento.');
			}

			await loadData();
			showFloatingAlert({
				message: 'Investimento atualizado com sucesso!',
				action: 'success',
				position: 'bottom',
			});
			closeEditModal();
		} catch (error) {
			console.error(error);
			showFloatingAlert({
				message: 'Não foi possível salvar a edição agora.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSavingEdit(false);
		}
	}, [closeEditModal, editBankId, editCdiInput, editInitialInput, editName, editTerm, editingInvestment, loadData]);

	const handleRequestDelete = React.useCallback((investment: FinanceInvestment) => {
		setInvestmentPendingDeletion(investment);
	}, []);

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
			const result = await deleteFinanceInvestmentFirebase(investmentPendingDeletion.id);
			if (!result.success) {
				throw new Error('Erro ao excluir investimento.');
			}
			await loadData();
			showFloatingAlert({
				message: 'Investimento removido.',
				action: 'success',
				position: 'bottom',
			});
			setInvestmentPendingDeletion(null);
		} catch (error) {
			console.error(error);
			showFloatingAlert({
				message: 'Não foi possível remover agora.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsDeleting(false);
		}
	}, [investmentPendingDeletion, loadData]);

	const handleOpenDepositModal = React.useCallback((investment: FinanceInvestment) => {
		const baseValue = convertCentsToBRL(resolveBaseValueInCents(investment));
		setInvestmentForDeposit(null);
		setSyncedDepositValueInCents(null);
		setDepositInput('');
		setInvestmentForDepositSync(investment);
		setDepositSyncInput(baseValue > 0 ? formatCurrencyBRLRaw(baseValue) : '');
	}, []);

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
			showFloatingAlert({
				message: 'Sincronize o valor de hoje antes de adicionar.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		const parsedCents = parseCurrencyInputToCents(depositInput);
		if (parsedCents === null || parsedCents <= 0) {
			showFloatingAlert({
				message: 'Informe um valor válido para adicionar.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		const targetInvestment = investmentForDeposit;
		const personId = auth.currentUser?.uid;
		if (!personId) {
			showFloatingAlert({
				message: 'Usuário não autenticado.',
				action: 'error',
				position: 'bottom',
			});
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
			setInvestmentForDeposit(null);
			setDepositInput('');
			setSyncedDepositValueInCents(null);
			showFloatingAlert({
				message: 'Aporte registrado e investimento atualizado.',
				action: 'success',
				position: 'bottom',
			});
		} catch (error) {
			console.error(error);
			showFloatingAlert({
				message: 'Não foi possível registrar o aporte agora.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSavingDeposit(false);
		}
	}, [depositInput, ensureInvestmentTag, investmentForDeposit, loadData, syncedDepositValueInCents]);

	const handleConfirmDepositSync = React.useCallback(async () => {
		if (!investmentForDepositSync) {
			return;
		}

		const parsedCents = parseCurrencyInputToCents(depositSyncInput);
		if (parsedCents === null || parsedCents <= 0) {
			showFloatingAlert({
				message: 'Informe um valor válido para sincronizar.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		setIsSavingDepositSync(true);
		try {
			const result = await syncFinanceInvestmentValueFirebase({
				investmentId: investmentForDepositSync.id,
				syncedValueInCents: parsedCents,
			});

			if (!result.success) {
				throw new Error('Erro ao sincronizar investimento.');
			}

			await loadData();
			setSyncedDepositValueInCents(parsedCents);
			setInvestmentForDeposit(investmentForDepositSync);
			setInvestmentForDepositSync(null);
			setDepositInput('');
			showFloatingAlert({
				message: 'Valor sincronizado! Agora informe o aporte.',
				action: 'success',
				position: 'bottom',
			});
		} catch (error) {
			console.error(error);
			showFloatingAlert({
				message: 'Não foi possível sincronizar agora.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSavingDepositSync(false);
		}
	}, [depositSyncInput, investmentForDepositSync, loadData]);

	const handleOpenWithdrawalModal = React.useCallback((investment: FinanceInvestment) => {
		const baseValue = convertCentsToBRL(resolveBaseValueInCents(investment));
		setInvestmentForWithdrawal(null);
		setSyncedWithdrawalValueInCents(null);
		setWithdrawInput('');
		setInvestmentForWithdrawalSync(investment);
		setWithdrawSyncInput(baseValue > 0 ? formatCurrencyBRLRaw(baseValue) : '');
	}, []);

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
			showFloatingAlert({
				message: 'Informe um valor válido para sincronizar.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		setIsSavingWithdrawalSync(true);
		try {
			const syncedCents = parsedCents;
			const result = await syncFinanceInvestmentValueFirebase({
				investmentId: investmentForWithdrawalSync.id,
				syncedValueInCents: syncedCents,
			});

			if (!result.success) {
				throw new Error('Erro ao sincronizar investimento.');
			}

			await loadData();
			setSyncedWithdrawalValueInCents(syncedCents);
			setInvestmentForWithdrawal(investmentForWithdrawalSync);
			setInvestmentForWithdrawalSync(null);
			setWithdrawInput('');
			showFloatingAlert({
				message: 'Valor sincronizado! Agora informe quanto deseja resgatar.',
				action: 'success',
				position: 'bottom',
			});
		} catch (error) {
			console.error(error);
			showFloatingAlert({
				message: 'Não foi possível sincronizar agora.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSavingWithdrawalSync(false);
		}
	}, [investmentForWithdrawalSync, loadData, withdrawSyncInput]);

	const handleConfirmWithdrawal = React.useCallback(async () => {
		if (!investmentForWithdrawal) {
			return;
		}

		const parsedCents = parseCurrencyInputToCents(withdrawInput);
		if (parsedCents === null || parsedCents <= 0) {
			showFloatingAlert({
				message: 'Informe um valor válido para resgatar.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		if (syncedWithdrawalValueInCents === null) {
			showFloatingAlert({
				message: 'Sincronize o valor de hoje antes de continuar o resgate.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		const withdrawCents = parsedCents;
		const availableCents = syncedWithdrawalValueInCents ?? resolveBaseValueInCents(investmentForWithdrawal);
		if (withdrawCents > availableCents) {
			showFloatingAlert({
				message: 'O valor de resgate não pode ser maior que o valor sincronizado.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		const targetInvestment = investmentForWithdrawal;
		const originalSyncedValue = availableCents;
		const personId = auth.currentUser?.uid;
		if (!personId) {
			showFloatingAlert({
				message: 'Usuário não autenticado.',
				action: 'error',
				position: 'bottom',
			});
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
			setInvestmentForWithdrawal(null);
			setWithdrawInput('');
			setSyncedWithdrawalValueInCents(null);
			showFloatingAlert({
				message: 'Resgate registrado e investimento atualizado.',
				action: 'success',
				position: 'bottom',
			});
		} catch (error) {
			console.error(error);
			showFloatingAlert({
				message: 'Não foi possível preparar o resgate agora.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSavingWithdrawal(false);
		}
	}, [ensureInvestmentTag, investmentForWithdrawal, loadData, syncedWithdrawalValueInCents, withdrawInput]);

	const handleOpenManualSyncModal = React.useCallback((investment: FinanceInvestment) => {
		const baseValue = convertCentsToBRL(resolveBaseValueInCents(investment));
		setInvestmentForSync(investment);
		setSyncInput(baseValue > 0 ? formatCurrencyBRLRaw(baseValue) : '');
	}, []);

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
			showFloatingAlert({
				message: 'Informe um valor válido para sincronizar.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		setIsSavingSync(true);
		try {
			const result = await syncFinanceInvestmentValueFirebase({
				investmentId: investmentForSync.id,
				syncedValueInCents: parsedCents,
			});

			if (!result.success) {
				throw new Error('Erro ao sincronizar investimento.');
			}

			await loadData();
			showFloatingAlert({
				message: 'Valor sincronizado com sucesso!',
				action: 'success',
				position: 'bottom',
			});
			setInvestmentForSync(null);
			setSyncInput('');
		} catch (error) {
			console.error(error);
			showFloatingAlert({
				message: 'Não foi possível sincronizar agora.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSavingSync(false);
		}
	}, [investmentForSync, loadData, syncInput]);

	const isInitialLoading = isLoading && investments.length === 0;

	return (
		<SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<FloatingAlertViewport />

				<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
					<View className={`absolute top-0 left-0 right-0 ${cardBackground}`} style={{ height: heroHeight }}>
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
							<FinancialListIllustration width="38%" height="38%" className="opacity-90" />
						</VStack>
					</View>

					<ScrollView
						keyboardShouldPersistTaps="handled"
						className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
						style={{ marginTop: heroHeight - 64 }}
						contentContainerStyle={{ paddingBottom: 48 }}
					>
						<VStack className="mt-4 gap-4">
							<Box className={`${topSummaryCardClassName} px-5 py-5`}>
								{isInitialLoading ? (
									<VStack className="gap-4">
										<Skeleton
											className="h-3 w-28"
											baseColor={skeletonMutedBaseColor}
											highlightColor={skeletonMutedHighlightColor}
										/>
										<Skeleton
											className="h-8 w-56"
											baseColor={skeletonMutedBaseColor}
											highlightColor={skeletonMutedHighlightColor}
										/>
										<SkeletonText
											_lines={2}
											className="h-3"
											baseColor={skeletonMutedBaseColor}
											highlightColor={skeletonMutedHighlightColor}
										/>
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
										<VStack className="gap-2">
											<Text className={`${helperText} text-xs uppercase tracking-[0.18em]`}>
												Resumo consolidado
											</Text>
											<Heading size="md">Acompanhe crescimento, liquidez e sincronização manual da sua carteira</Heading>
											<Text className={`${bodyText} text-sm`}>
												A simulação usa o CDI salvo em cada item e serve como referência visual até a próxima atualização real.
											</Text>
										</VStack>

										<View className="flex-row flex-wrap gap-3">
											<Box className={`${tintedCardClassName} min-w-[145px] flex-1 px-4 py-4`}>
												<Text className={`${helperText} text-xs uppercase tracking-wide`}>Total investido</Text>
												<Text className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
													{formatCurrencyBRL(totalInvested)}
												</Text>
											</Box>
											<Box className={`${tintedCardClassName} min-w-[145px] flex-1 px-4 py-4`}>
												<Text className={`${helperText} text-xs uppercase tracking-wide`}>Simulado hoje</Text>
												<Text className="mt-2 text-2xl font-bold text-violet-600 dark:text-violet-400">
													{formatCurrencyBRL(totalSimulatedAmount)}
												</Text>
											</Box>
											<Box className={`${tintedCardClassName} min-w-[145px] flex-1 px-4 py-4`}>
												<Text className={`${helperText} text-xs uppercase tracking-wide`}>Rendimento diário</Text>
												<Text className="mt-2 text-2xl font-bold text-sky-600 dark:text-sky-400">
													{formatCurrencyBRL(totalDailyYield)}
												</Text>
											</Box>
										</View>

										<Box className={`${compactCardClassName} px-4 py-4`}>
											<VStack className="gap-3">
												<HStack className="items-center justify-between gap-3">
													<VStack className="flex-1 gap-1">
														<Text className="font-semibold">Carteira ativa</Text>
														<Text className={`${helperText} text-sm`}>
															{investments.length} investimento(s) distribuídos em {bankSummaries.length} banco(s).
														</Text>
													</VStack>
													<Button className={submitButtonClassName} onPress={handleNavigateToAdd}>
														<ButtonIcon as={AddIcon} />
														<ButtonText>Novo investimento</ButtonText>
													</Button>
												</HStack>

												{bankSummaries.length > 0 ? (
													<View className="flex-row flex-wrap gap-2">
														{bankSummaries.slice(0, 3).map(summary => (
															<Box key={summary.bankId} className={`${tintedCardClassName} min-w-[120px] px-3 py-3`}>
																<VStack className="gap-1">
																	<HStack className="items-center gap-2">
																		<View
																			className="h-2.5 w-2.5 rounded-full"
																			style={{
																				backgroundColor: summary.colorHex || (isDarkMode ? '#FACC15' : '#F59E0B'),
																			}}
																		/>
																		<Text className="font-medium" numberOfLines={1}>
																			{summary.bankName}
																		</Text>
																	</HStack>
																	<Text className={`${helperText} text-xs`}>
																		{summary.investmentCount} item(s)
																	</Text>
																	<Text className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
																		{formatCurrencyBRL(summary.totalInvested)}
																	</Text>
																</VStack>
															</Box>
														))}
													</View>
												) : null}
											</VStack>
										</Box>
									</VStack>
								)}
							</Box>

							{isInitialLoading ? (
								<FinancialListSkeleton
									compactCardClassName={compactCardClassName}
									skeletonBaseColor={skeletonBaseColor}
									skeletonHighlightColor={skeletonHighlightColor}
								/>
							) : investments.length === 0 ? (
								<Box className={`${compactCardClassName} items-center px-5 py-6`}>
									<Text className={`text-center ${helperText}`}>
										Você ainda não salvou nenhum investimento.
									</Text>
									<Button variant="link" action="primary" onPress={handleNavigateToAdd} className="mt-2">
										<ButtonText>Registrar agora</ButtonText>
									</Button>
								</Box>
							) : (
								<VStack className="gap-4">
									{investments.map(investment => {
										const simulatedValue = simulateCurrentValue(investment);
										const dailyYield = simulateDailyYield(investment);
										const bankInfo = banksMap[investment.bankId];
										const lastSyncLabel =
											typeof investment.lastManualSyncValueInCents === 'number' && investment.lastManualSyncAtISO
												? `${formatCurrencyBRL(convertCentsToBRL(investment.lastManualSyncValueInCents))} em ${formatDateToBR(investment.lastManualSyncAtISO)}`
												: 'Nunca sincronizado';

										return (
											<Box key={investment.id} className={`${compactCardClassName} px-4 py-4`}>
												<VStack className="gap-4">
													<HStack className="items-start justify-between gap-3">
														<VStack className="flex-1 gap-1">
															<Text className="text-base font-semibold">{investment.name}</Text>
															<Text className={`${helperText} text-sm`}>
																{bankInfo?.name ?? 'Banco não informado'} • {redemptionTermLabels[investment.redemptionTerm]}
															</Text>
														</VStack>
														<Text className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
															{formatCurrencyBRL(convertCentsToBRL(resolveBaseValueInCents(investment)))}
														</Text>
													</HStack>

													<View className="flex-row flex-wrap gap-2">
														<Box className={`${tintedCardClassName} min-w-[132px] px-3 py-2`}>
															<Text className={`${helperText} text-xs uppercase tracking-wide`}>Valor inicial</Text>
															<Text className={`${bodyText} mt-1 text-sm`}>
																{formatCurrencyBRL(convertCentsToBRL(investment.initialValueInCents))}
															</Text>
														</Box>
														<Box className={`${tintedCardClassName} min-w-[132px] px-3 py-2`}>
															<Text className={`${helperText} text-xs uppercase tracking-wide`}>Simulado hoje</Text>
															<Text className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">
																{formatCurrencyBRL(simulatedValue)}
															</Text>
														</Box>
														<Box className={`${tintedCardClassName} min-w-[132px] px-3 py-2`}>
															<Text className={`${helperText} text-xs uppercase tracking-wide`}>Rendimento diário</Text>
															<Text className="mt-1 text-sm text-sky-600 dark:text-sky-400">
																{formatCurrencyBRL(dailyYield)}
															</Text>
														</Box>
														<Box className={`${tintedCardClassName} min-w-[132px] px-3 py-2`}>
															<Text className={`${helperText} text-xs uppercase tracking-wide`}>CDI</Text>
															<Text className={`${bodyText} mt-1 text-sm`}>{investment.cdiPercentage}%</Text>
														</Box>
													</View>

													<Box className={`${tintedCardClassName} px-3 py-3`}>
														<VStack className="gap-1">
															<Text className={`${helperText} text-xs uppercase tracking-wide`}>Sincronização manual</Text>
															<Text className={`${bodyText} text-sm`}>{lastSyncLabel}</Text>
															<Text className={`${helperText} text-xs`}>
																Cadastrado em {formatDateToBR(investment.createdAtISO)}
															</Text>
														</VStack>
													</Box>

													{investment.description ? (
														<Text className={`${helperText} text-sm`}>{investment.description}</Text>
													) : null}

													<HStack className="flex-wrap gap-3">
														<Button size="sm" variant="outline" action="primary" onPress={() => handleOpenDepositModal(investment)}>
															<ButtonIcon as={AddIcon} />
															<ButtonText>Aportar</ButtonText>
														</Button>
														<Button size="sm" variant="outline" action="primary" onPress={() => handleOpenWithdrawalModal(investment)}>
															<ButtonIcon as={ArrowDownIcon} />
															<ButtonText>Resgatar</ButtonText>
														</Button>
														<Button size="sm" variant="outline" action="primary" onPress={() => handleOpenManualSyncModal(investment)}>
															<ButtonText>Sincronizar</ButtonText>
														</Button>
														<Button size="sm" variant="outline" action="primary" onPress={() => handleOpenEditModal(investment)}>
															<ButtonIcon as={EditIcon} />
															<ButtonText>Editar</ButtonText>
														</Button>
														<Button size="sm" variant="outline" action="negative" onPress={() => handleRequestDelete(investment)}>
															<ButtonIcon as={TrashIcon} />
															<ButtonText>Excluir</ButtonText>
														</Button>
													</HStack>
												</VStack>
											</Box>
										);
									})}
								</VStack>
							)}
						</VStack>
					</ScrollView>
				</View>

				<Menu defaultValue={1} onHardwareBack={handleBackToHome} />

				<Modal isOpen={Boolean(editingInvestment)} onClose={closeEditModal}>
					<ModalBackdrop />
					<ModalContent className={`max-w-[380px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>Editar investimento</ModalTitle>
							<ModalCloseButton onPress={closeEditModal} />
						</ModalHeader>
						<ModalBody>
							<Text className={`${bodyText} mb-4 text-sm`}>
								Ajuste nome, valor base, CDI e banco do investimento.
							</Text>
							<VStack className="gap-4">
								<VStack className="gap-2">
									<Text className={`${bodyText} ml-1 text-sm`}>Nome</Text>
									<Input className={fieldContainerClassName}>
										<InputField
											value={editName}
											onChangeText={text => setEditName(text)}
											autoCapitalize="sentences"
											className={inputField}
										/>
									</Input>
								</VStack>
								<VStack className="gap-2">
									<Text className={`${bodyText} ml-1 text-sm`}>Valor inicial</Text>
									<Input className={fieldContainerClassName}>
										<InputField
											value={editInitialInput}
											onChangeText={handleEditInitialInputChange}
											keyboardType="numeric"
											className={inputField}
										/>
									</Input>
								</VStack>
								<VStack className="gap-2">
									<Text className={`${bodyText} ml-1 text-sm`}>CDI (%)</Text>
									<Input className={fieldContainerClassName}>
										<InputField
											value={editCdiInput}
											onChangeText={text => setEditCdiInput(sanitizeNumberInput(text))}
											keyboardType="decimal-pad"
											className={inputField}
										/>
									</Input>
								</VStack>
								<VStack className="gap-2">
									<Text className={`${bodyText} ml-1 text-sm`}>Prazo de resgate</Text>
									<Select selectedValue={editTerm} onValueChange={value => setEditTerm(value as RedemptionTerm)}>
										<SelectTrigger variant="outline" size="md" className={fieldContainerClassName}>
											<SelectInput value={redemptionTermLabels[editTerm]} className={inputField} />
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
									<Text className={`${bodyText} ml-1 text-sm`}>Banco</Text>
									<Select
										selectedValue={editBankId ?? undefined}
										onValueChange={value => setEditBankId(value)}
										isDisabled={bankOptions.length === 0}
									>
										<SelectTrigger variant="outline" size="md" className={fieldContainerClassName}>
											<SelectInput
												placeholder="Selecione o banco"
												value={editBankId ? bankOptions.find(bank => bank.id === editBankId)?.name ?? '' : ''}
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
													bankOptions.map(bank => (
														<SelectItem key={bank.id} label={bank.name} value={bank.id} />
													))
												) : (
													<SelectItem label="Nenhum banco disponível" value="no-bank" isDisabled />
												)}
											</SelectContent>
										</SelectPortal>
									</Select>
								</VStack>
							</VStack>
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button variant="outline" onPress={closeEditModal} isDisabled={isSavingEdit}>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button onPress={handleSubmitEdit} isDisabled={isSavingEdit} className={submitButtonClassName}>
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
				</Modal>

				<Modal isOpen={Boolean(investmentForDepositSync)} onClose={handleCloseDepositSyncModal}>
					<ModalBackdrop />
					<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>Sincronizar antes de aportar</ModalTitle>
							<ModalCloseButton onPress={handleCloseDepositSyncModal} />
						</ModalHeader>
						<ModalBody>
							<Text className={`${bodyText} mb-3 text-sm`}>
								Confirme o valor disponível hoje em{' '}
								<Text className="font-semibold">{investmentForDepositSync?.name ?? 'seu investimento'}</Text>.
							</Text>
							<Input className={fieldContainerClassName}>
								<InputField
									value={depositSyncInput}
									onChangeText={handleDepositSyncInputChange}
									keyboardType="numeric"
									placeholder="Ex: 1.000,00"
									className={inputField}
								/>
							</Input>
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button variant="outline" onPress={handleCloseDepositSyncModal} isDisabled={isSavingDepositSync}>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button onPress={handleConfirmDepositSync} isDisabled={isSavingDepositSync} className={submitButtonClassName}>
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

				<Modal isOpen={Boolean(investmentForDeposit)} onClose={handleCloseDepositModal}>
					<ModalBackdrop />
					<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>Adicionar ao investimento</ModalTitle>
							<ModalCloseButton onPress={handleCloseDepositModal} />
						</ModalHeader>
						<ModalBody>
							<Box className={`${tintedCardClassName} mb-4 px-4 py-4`}>
								<VStack className="gap-1">
									<Text className={`${helperText} text-xs uppercase tracking-wide`}>Valor base</Text>
									<Text className="text-lg font-semibold">{syncedDepositDisplayValue}</Text>
								</VStack>
							</Box>
							<Text className={`${bodyText} mb-3 text-sm`}>
								Informe o valor que deseja acrescentar em{' '}
								<Text className="font-semibold">{investmentForDeposit?.name ?? 'seu investimento'}</Text>.
							</Text>
							<Input className={fieldContainerClassName}>
								<InputField
									value={depositInput}
									onChangeText={handleDepositInputChange}
									keyboardType="numeric"
									placeholder="Ex: 500,00"
									className={inputField}
								/>
							</Input>
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button variant="outline" onPress={handleCloseDepositModal} isDisabled={isSavingDeposit}>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button onPress={handleConfirmDeposit} isDisabled={isSavingDeposit} className={submitButtonClassName}>
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

				<Modal isOpen={Boolean(investmentForWithdrawalSync)} onClose={handleCloseWithdrawalSyncModal}>
					<ModalBackdrop />
					<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>Sincronizar antes de resgatar</ModalTitle>
							<ModalCloseButton onPress={handleCloseWithdrawalSyncModal} />
						</ModalHeader>
						<ModalBody>
							<Text className={`${bodyText} mb-3 text-sm`}>
								Confirme o valor disponível hoje em{' '}
								<Text className="font-semibold">{investmentForWithdrawalSync?.name ?? 'seu investimento'}</Text>.
							</Text>
							<Input className={fieldContainerClassName}>
								<InputField
									value={withdrawSyncInput}
									onChangeText={handleWithdrawSyncInputChange}
									keyboardType="numeric"
									placeholder="Ex: 1.000,00"
									className={inputField}
								/>
							</Input>
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button variant="outline" onPress={handleCloseWithdrawalSyncModal} isDisabled={isSavingWithdrawalSync}>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button onPress={handleConfirmWithdrawalSync} isDisabled={isSavingWithdrawalSync} className={submitButtonClassName}>
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

				<Modal isOpen={Boolean(investmentForWithdrawal)} onClose={handleCloseWithdrawalModal}>
					<ModalBackdrop />
					<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>Resgatar investimento</ModalTitle>
							<ModalCloseButton onPress={handleCloseWithdrawalModal} />
						</ModalHeader>
						<ModalBody>
							<Box className={`${tintedCardClassName} mb-4 px-4 py-4`}>
								<VStack className="gap-1">
									<Text className={`${helperText} text-xs uppercase tracking-wide`}>Valor base</Text>
									<Text className="text-lg font-semibold">{syncedWithdrawalDisplayValue}</Text>
								</VStack>
							</Box>
							<Text className={`${bodyText} mb-3 text-sm`}>
								Quanto você deseja resgatar de{' '}
								<Text className="font-semibold">{investmentForWithdrawal?.name ?? 'seu investimento'}</Text>?
							</Text>
							<Input className={fieldContainerClassName}>
								<InputField
									value={withdrawInput}
									onChangeText={handleWithdrawInputChange}
									keyboardType="numeric"
									placeholder="Ex: 250,00"
									className={inputField}
								/>
							</Input>
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button variant="outline" onPress={handleCloseWithdrawalModal} isDisabled={isSavingWithdrawal}>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button onPress={handleConfirmWithdrawal} isDisabled={isSavingWithdrawal} className={submitButtonClassName}>
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

				<Modal isOpen={Boolean(investmentForSync)} onClose={handleCloseManualSyncModal}>
					<ModalBackdrop />
					<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>Sincronizar valor real</ModalTitle>
							<ModalCloseButton onPress={handleCloseManualSyncModal} />
						</ModalHeader>
						<ModalBody>
							<Text className={`${bodyText} mb-3 text-sm`}>
								Informe o valor atual disponível em{' '}
								<Text className="font-semibold">{investmentForSync?.name ?? 'seu investimento'}</Text>.
							</Text>
							<Input className={fieldContainerClassName}>
								<InputField
									value={syncInput}
									onChangeText={handleManualSyncInputChange}
									keyboardType="numeric"
									placeholder="Ex: 1.250,45"
									className={inputField}
								/>
							</Input>
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button variant="outline" onPress={handleCloseManualSyncModal} isDisabled={isSavingSync}>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button onPress={handleConfirmManualSync} isDisabled={isSavingSync} className={submitButtonClassName}>
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

				<Modal isOpen={Boolean(investmentPendingDeletion)} onClose={handleCloseDeleteModal}>
					<ModalBackdrop />
					<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>Excluir investimento</ModalTitle>
							<ModalCloseButton onPress={handleCloseDeleteModal} />
						</ModalHeader>
						<ModalBody>
							<Text className={`${bodyText} text-sm`}>
								Tem certeza de que deseja remover{' '}
								<Text className="font-semibold">{investmentPendingDeletion?.name ?? 'este investimento'}</Text>
								? Essa ação não pode ser desfeita.
							</Text>
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button variant="outline" onPress={handleCloseDeleteModal} isDisabled={isDeleting}>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button variant="solid" action="negative" onPress={handleConfirmDelete} isDisabled={isDeleting}>
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
