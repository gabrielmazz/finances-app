import React from 'react';
import { ScrollView, View, StatusBar } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { AddIcon, EditIcon, TrashIcon, ArrowDownIcon } from '@/components/ui/icon';
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
} from '@/components/ui/modal';

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';

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
import { Divider } from '@/components/ui/divider';
import { useAppTheme } from '@/contexts/ThemeContext';

type FinanceInvestment = {
	id: string;
	name: string;
	initialValueInCents: number;
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

export default function FinancialListScreen() {
	const { isDarkMode } = useAppTheme();
	const pageBackground = isDarkMode ? '#0b1220' : '#f4f5f7';
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
	const [withdrawInput, setWithdrawInput] = React.useState('');
	const [isSavingWithdrawal, setIsSavingWithdrawal] = React.useState(false);
	const [investmentForDeposit, setInvestmentForDeposit] = React.useState<FinanceInvestment | null>(null);
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
						typeof investment.initialValueInCents === 'number' ? investment.initialValueInCents : 0,
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
		() => convertCentsToBRL(investments.reduce((total, current) => total + current.initialValueInCents, 0)),
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

			summaries[bankKey].totalInvested += convertCentsToBRL(investment.initialValueInCents);
			summaries[bankKey].totalSimulated += simulateCurrentValue(investment);
			summaries[bankKey].totalDailyYield += simulateDailyYield(investment);
			summaries[bankKey].investmentCount += 1;
		});

		return Object.values(summaries).sort((a, b) => b.totalInvested - a.totalInvested);
	}, [banksMap, investments]);

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
		setEditInitialInput((convertCentsToBRL(investment.initialValueInCents)).toString().replace('.', ','));
		setEditCdiInput(investment.cdiPercentage.toString());
		setEditTerm(investment.redemptionTerm);
		setEditBankId(investment.bankId);
	}, []);

	const handleSubmitEdit = React.useCallback(async () => {
		if (!editingInvestment || !editBankId) {
			return;
		}

		const parsedInitial = parseStringToNumber(editInitialInput);
		const parsedCdi = parseStringToNumber(editCdiInput);

		if (editName.trim().length === 0 || !Number.isFinite(parsedInitial) || parsedInitial <= 0) {
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
				initialValueInCents: Math.round(parsedInitial * 100),
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
		setInvestmentForDeposit(investment);
		setDepositInput('');
	}, []);

	const handleCloseDepositModal = React.useCallback(() => {
		if (isSavingDeposit) {
			return;
		}
		setInvestmentForDeposit(null);
		setDepositInput('');
	}, [isSavingDeposit]);

	const handleConfirmDeposit = React.useCallback(async () => {
		if (!investmentForDeposit) {
			return;
		}
		const parsedValue = parseStringToNumber(depositInput);
		if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
			showFloatingAlert({
				message: 'Informe um valor válido para adicionar.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		const targetInvestment = investmentForDeposit;
		setIsSavingDeposit(true);
		try {
			const addedCents = Math.round(parsedValue * 100);
			const tagInfo = await ensureInvestmentTag('expense');

			setInvestmentForDeposit(null);
			setDepositInput('');
			showFloatingAlert({
				message: 'Finalize o aporte registrando a despesa.',
				action: 'info',
				position: 'bottom',
			});
			router.push({
				pathname: '/add-register-expenses',
				params: {
					templateName: `Investimento - ${targetInvestment?.name ?? 'Investimento'}`,
					templateValueInCents: String(addedCents),
					templateTagId: tagInfo.id,
					templateTagName: tagInfo.name,
					templateLockTag: '1',
					investmentIdForAdjustment: targetInvestment?.id ?? '',
					investmentDeltaInCents: String(addedCents),
				},
			});
		} catch (error) {
			console.error(error);
			showFloatingAlert({
				message: 'Não foi possível preparar o aporte agora.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSavingDeposit(false);
		}
	}, [depositInput, ensureInvestmentTag, investmentForDeposit]);

	const handleOpenWithdrawalModal = React.useCallback((investment: FinanceInvestment) => {
		setInvestmentForWithdrawal(investment);
		setWithdrawInput('');
	}, []);

	const handleCloseWithdrawalModal = React.useCallback(() => {
		if (isSavingWithdrawal) {
			return;
		}
		setInvestmentForWithdrawal(null);
		setWithdrawInput('');
	}, [isSavingWithdrawal]);

	const handleConfirmWithdrawal = React.useCallback(async () => {
		if (!investmentForWithdrawal) {
			return;
		}

		const parsedValue = parseStringToNumber(withdrawInput);
		if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
			showFloatingAlert({
				message: 'Informe um valor válido para resgatar.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		const withdrawCents = Math.round(parsedValue * 100);
		if (withdrawCents > investmentForWithdrawal.initialValueInCents) {
			showFloatingAlert({
				message: 'O valor de resgate não pode ser maior que o total investido.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		const targetInvestment = investmentForWithdrawal;
		const bankInfo = targetInvestment?.bankId ? banksMap[targetInvestment.bankId] : undefined;
		setIsSavingWithdrawal(true);
		try {
			const tagInfo = await ensureInvestmentTag('gain');

			setInvestmentForWithdrawal(null);
			setWithdrawInput('');
			showFloatingAlert({
				message: 'Finalize o resgate registrando o ganho.',
				action: 'info',
				position: 'bottom',
			});
			router.push({
				pathname: '/add-register-gain',
				params: {
					templateName: `Resgate - ${targetInvestment?.name ?? 'Investimento'}`,
					templateValueInCents: String(withdrawCents),
					templateTagId: tagInfo.id,
					templateTagName: tagInfo.name,
					templateLockTag: '1',
					investmentIdForAdjustment: targetInvestment?.id ?? '',
					investmentDeltaInCents: String(-withdrawCents),
					templateBankId: targetInvestment?.bankId ?? '',
					templateBankName: bankInfo?.name ?? '',
					templateLockBank: '1',
					templateInvestmentName: targetInvestment?.name ?? '',
				},
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
	}, [banksMap, ensureInvestmentTag, investmentForWithdrawal, withdrawInput]);

	const handleOpenManualSyncModal = React.useCallback((investment: FinanceInvestment) => {
		const baseValue = convertCentsToBRL(resolveBaseValueInCents(investment));
		setInvestmentForSync(investment);
		setSyncInput(baseValue > 0 ? baseValue.toFixed(2).replace('.', ',') : '');
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

		const parsedValue = parseStringToNumber(syncInput);
		if (!Number.isFinite(parsedValue) || parsedValue < 0) {
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
				syncedValueInCents: Math.round(parsedValue * 100),
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

	return (
		<View
			className="
				flex-1 w-full h-full
				mt-[64px]
				items-center
				justify-between
				pb-6
				relative
			"
			style={{ backgroundColor: pageBackground }}
		>
			<StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={pageBackground} />
			<FloatingAlertViewport />

			<ScrollView
				keyboardShouldPersistTaps="handled"
				style={{ backgroundColor: pageBackground }}
				contentContainerStyle={{
					flexGrow: 1,
					paddingBottom: 48,
					backgroundColor: pageBackground,
				}}
			>
				<View className="w-full px-6">
					<Heading size="3xl" className="text-center">
						Meus investimentos
					</Heading>

					<Box className="w-full items-center mt-4 mb-2">
						<FinancialListIllustration width={180} height={180} />
					</Box>

					<Text className="text-justify text-gray-600 dark:text-gray-400">
						Acompanhe como cada banco está fazendo seu dinheiro render. Veja o total investido, o rendimento
						{" "}
						<Text className="font-semibold text-red-500 dark:text-red-400">
							Lembrando que isso se baseia em uma estimativa e não reflete valores reais de mercado e nem os rendimentos, portanto exige incosistências em relação à realidade.
						</Text>
					</Text>

					<Divider className="my-6 mb-6" />

					<Box className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 w-full mb-4">
						<VStack className="gap-2">
							<Text className="text-gray-800 dark:text-gray-200 font-semibold">
								Total investido nessa lista
							</Text>
							<Text className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
								{formatCurrencyBRL(totalInvested)}
							</Text>
							<Button variant="outline" onPress={handleNavigateToAdd} className="mt-2">
								<ButtonIcon as={AddIcon} />
								<ButtonText>Novo investimento</ButtonText>
							</Button>
						</VStack>
					</Box>

					<Box className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 w-full mb-6">
						<Text className="text-gray-800 dark:text-gray-200 font-semibold">
							Total rendendo por dia
						</Text>
						<Text className="text-xl font-bold text-sky-600 dark:text-sky-400">
							{formatCurrencyBRL(totalDailyYield)}
						</Text>
						<Text className="text-sm text-gray-500 dark:text-gray-400 mt-2">
							Base calculada individualmente por investimento de acordo com o CDI informado e o banco
							selecionado.
						</Text>
						<Text className="text-gray-800 dark:text-gray-200 font-semibold mt-4">
							Valor simulado acumulado
						</Text>
						<Text className="text-xl font-bold text-violet-600 dark:text-violet-400">
							{formatCurrencyBRL(totalSimulatedAmount)}
						</Text>
					</Box>

					{isLoading ? (
						<Text className="text-center text-gray-500">Carregando investimentos salvos…</Text>
					) : investments.length === 0 ? (
						<Box className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 items-center">
							<Text className="text-center text-gray-600 dark:text-gray-400">
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
								return (
									<Box
										key={investment.id}
										className="
											w-full
											bg-white dark:bg-gray-900
											border border-gray-200 dark:border-gray-700
											rounded-xl
											p-4
										"
									>
										<HStack className="justify-between items-start mb-2">
											<View className="flex-1 pr-3">
												<Text className="text-lg font-semibold mb-1">{investment.name}</Text>
												<Text className="text-gray-700 dark:text-gray-300">
													Banco:{' '}
													<Text className="font-semibold">{bankInfo?.name ?? 'Não informado'}</Text>
												</Text>
												<Text className="text-gray-700 dark:text-gray-300">
													Valor investido:{' '}
													<Text className="font-bold text-orange-600 dark:text-orange-300">
														{formatCurrencyBRL(convertCentsToBRL(investment.initialValueInCents))}
													</Text>
												</Text>
												<Text className="text-gray-700 dark:text-gray-300">
													CDI informado:{' '}
													<Text className="font-semibold">{investment.cdiPercentage}%</Text>
												</Text>
												<Text className="text-gray-700 dark:text-gray-300">
													Prazo de resgate:{' '}
													<Text className="font-semibold">
														{redemptionTermLabels[investment.redemptionTerm]}
													</Text>
												</Text>
												<Text className="text-gray-700 dark:text-gray-300">
													Última sincronização manual:{' '}
													{typeof investment.lastManualSyncValueInCents === 'number' &&
													investment.lastManualSyncAtISO ? (
														<Text className="font-semibold">
															{formatCurrencyBRL(
																convertCentsToBRL(investment.lastManualSyncValueInCents),
															)}{' '}
															em {formatDateToBR(investment.lastManualSyncAtISO)}
														</Text>
													) : (
														<Text className="font-semibold">Nunca sincronizado</Text>
													)}
												</Text>
												<Text className="text-gray-700 dark:text-gray-300">
													Valor simulado hoje:{' '}
													<Text className="font-semibold text-emerald-600 dark:text-emerald-400">
														{formatCurrencyBRL(simulatedValue)}
													</Text>
												</Text>
												<Text className="text-gray-700 dark:text-gray-300">
													Rendimento diário estimado:{' '}
													<Text className="font-semibold text-sky-600 dark:text-sky-400">
														{formatCurrencyBRL(dailyYield)}
													</Text>
												</Text>
												<Text className="text-gray-600 dark:text-gray-400">
													Registrado em {formatDateToBR(investment.createdAtISO)}
												</Text>
											</View>
											</HStack>

											<Divider className="my-4" />

											<HStack className="gap-3 flex-wrap justify-end">
											<Button
												size="md"
												variant="link"
												action="primary"
												onPress={() => handleOpenDepositModal(investment)}
											>
												<ButtonIcon as={AddIcon} />
											</Button>
											<Button
												size="md"
												variant="link"
												action="primary"
												onPress={() => handleOpenWithdrawalModal(investment)}
											>
												<ButtonIcon as={ArrowDownIcon} />
											</Button>
											<Button
												size="md"
												variant="link"
												action="primary"
												onPress={() => handleOpenManualSyncModal(investment)}
											>
												<ButtonText>Sincronizar</ButtonText>
											</Button>
											<Button
												size="md"
												variant="link"
												action="primary"
												onPress={() => handleOpenEditModal(investment)}
											>
												<ButtonIcon as={EditIcon} />
											</Button>
											<Button
												size="md"
												variant="link"
												action="negative"
												onPress={() => handleRequestDelete(investment)}
											>
												<ButtonIcon as={TrashIcon} />
											</Button>
										</HStack>
									</Box>
								);
							})}
						</VStack>
					)}
				</View>
			</ScrollView>

			<Menu defaultValue={1} onHardwareBack={handleBackToHome} />

			<Modal isOpen={Boolean(editingInvestment)} onClose={closeEditModal}>
				<ModalBackdrop />
				<ModalContent className="max-w-[380px]">
					<ModalHeader>
						<Heading size="lg">Editar investimento</Heading>
						<ModalCloseButton onPress={closeEditModal} />
					</ModalHeader>
					<ModalBody>
						<Text className="text-gray-600 dark:text-gray-300 mb-4">
							Ajuste valores, CDI ou banco e acompanhe a simulação atualizada.
						</Text>
						<VStack className="gap-4">
							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">Nome</Text>
								<Input>
									<InputField
										value={editName}
										onChangeText={text => setEditName(text)}
										autoCapitalize="sentences"
									/>
								</Input>
							</Box>
							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Valor inicial
								</Text>
								<Input>
									<InputField
										value={editInitialInput}
										onChangeText={text => setEditInitialInput(sanitizeNumberInput(text))}
										keyboardType="decimal-pad"
									/>
								</Input>
							</Box>
							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">CDI (%)</Text>
								<Input>
									<InputField
										value={editCdiInput}
										onChangeText={text => setEditCdiInput(sanitizeNumberInput(text))}
										keyboardType="decimal-pad"
									/>
								</Input>
							</Box>
							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Prazo de resgate
								</Text>
								<Select selectedValue={editTerm} onValueChange={value => setEditTerm(value as RedemptionTerm)}>
									<SelectTrigger>
										<SelectInput value={redemptionTermLabels[editTerm]} />
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
							</Box>
							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">Banco</Text>
								<Select
									selectedValue={editBankId ?? undefined}
									onValueChange={value => setEditBankId(value)}
									isDisabled={bankOptions.length === 0}
								>
									<SelectTrigger>
										<SelectInput
											placeholder="Selecione o banco"
											value={editBankId ? bankOptions.find(bank => bank.id === editBankId)?.name ?? '' : ''}
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
							</Box>
						</VStack>
					</ModalBody>
					<ModalFooter className="gap-3">
						<Button variant="outline" onPress={closeEditModal} isDisabled={isSavingEdit}>
							<ButtonText>Cancelar</ButtonText>
						</Button>
						<Button onPress={handleSubmitEdit} isDisabled={isSavingEdit}>
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

			<Modal isOpen={Boolean(investmentForDeposit)} onClose={handleCloseDepositModal}>
				<ModalBackdrop />
				<ModalContent className="max-w-[360px]">
					<ModalHeader>
						<Heading size="lg">Adicionar ao investimento</Heading>
						<ModalCloseButton onPress={handleCloseDepositModal} />
					</ModalHeader>
					<ModalBody>
						<Text className="text-gray-600 dark:text-gray-300 mb-3">
							Informe o valor que deseja acrescentar em{' '}
							<Text className="font-semibold">
								{investmentForDeposit?.name ?? 'seu investimento'}
							</Text>
							.
						</Text>
						<Input>
							<InputField
								value={depositInput}
								onChangeText={text => setDepositInput(sanitizeNumberInput(text))}
								keyboardType="decimal-pad"
								placeholder="Ex: 500,00"
							/>
						</Input>
					</ModalBody>
					<ModalFooter className="gap-3">
						<Button variant="outline" onPress={handleCloseDepositModal} isDisabled={isSavingDeposit}>
							<ButtonText>Cancelar</ButtonText>
						</Button>
						<Button onPress={handleConfirmDeposit} isDisabled={isSavingDeposit}>
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

				<Modal isOpen={Boolean(investmentForWithdrawal)} onClose={handleCloseWithdrawalModal}>
					<ModalBackdrop />
					<ModalContent className="max-w-[360px]">
					<ModalHeader>
						<Heading size="lg">Resgatar investimento</Heading>
						<ModalCloseButton onPress={handleCloseWithdrawalModal} />
					</ModalHeader>
					<ModalBody>
						<Text className="text-gray-600 dark:text-gray-300 mb-3">
							Quanto você deseja resgatar de{' '}
							<Text className="font-semibold">
								{investmentForWithdrawal?.name ?? 'seu investimento'}
							</Text>
							?
						</Text>
						<Input>
							<InputField
								value={withdrawInput}
								onChangeText={text => setWithdrawInput(sanitizeNumberInput(text))}
								keyboardType="decimal-pad"
								placeholder="Ex: 250,00"
							/>
						</Input>
					</ModalBody>
					<ModalFooter className="gap-3">
						<Button variant="outline" onPress={handleCloseWithdrawalModal} isDisabled={isSavingWithdrawal}>
							<ButtonText>Cancelar</ButtonText>
						</Button>
						<Button onPress={handleConfirmWithdrawal} isDisabled={isSavingWithdrawal}>
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
					<ModalContent className="max-w-[360px]">
						<ModalHeader>
							<Heading size="lg">Sincronizar valor real</Heading>
							<ModalCloseButton onPress={handleCloseManualSyncModal} />
						</ModalHeader>
						<ModalBody>
							<Text className="text-gray-600 dark:text-gray-300 mb-3">
								Informe o valor atual disponível em{' '}
								<Text className="font-semibold">{investmentForSync?.name ?? 'seu investimento'}</Text>. Esse
								valor passará a ser a base para o cálculo simulado até a próxima atualização manual.
							</Text>
							<Input>
								<InputField
									value={syncInput}
									onChangeText={text => setSyncInput(sanitizeNumberInput(text))}
									keyboardType="decimal-pad"
									placeholder="Ex: 1.250,45"
								/>
							</Input>
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button variant="outline" onPress={handleCloseManualSyncModal} isDisabled={isSavingSync}>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button onPress={handleConfirmManualSync} isDisabled={isSavingSync}>
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
				<ModalContent className="max-w-[360px]">
					<ModalHeader>
						<Heading size="lg">Excluir investimento</Heading>
						<ModalCloseButton onPress={handleCloseDeleteModal} />
					</ModalHeader>
					<ModalBody>
						<Text className="text-gray-700 dark:text-gray-300">
							Tem certeza de que deseja remover{' '}
							<Text className="font-semibold">
								{investmentPendingDeletion?.name ?? 'este investimento'}
							</Text>
							? Essa ação não pode ser desfeita.
						</Text>
					</ModalBody>
					<ModalFooter className="gap-3">
						<Button variant="outline" onPress={handleCloseDeleteModal} isDisabled={isDeleting}>
							<ButtonText>Cancelar</ButtonText>
						</Button>
						<Button
							variant="solid"
							action="negative"
							onPress={handleConfirmDelete}
							isDisabled={isDeleting}
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
	);
}
