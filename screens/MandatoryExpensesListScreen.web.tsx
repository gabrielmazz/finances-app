import React from 'react';
import { Pressable, RefreshControl, ScrollView, View, StatusBar, TouchableOpacity, Text as RNText } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';

import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import { AddIcon, CheckCircleIcon, DownloadIcon, EditIcon, RepeatIcon, TrashIcon, Icon } from '@/components/ui/icon';
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
import Navigator from '@/components/uiverse/navigator';
import WebScreenHero from '@/components/uiverse/web-screen-hero';
import AnimatedContent from '@/components/web/AnimatedContent';
import Grainient from '@/components/web/Grainient';

import { auth } from '@/FirebaseConfig';
import {
	clearMandatoryExpensePaymentFirebase,
	deleteMandatoryExpenseFirebase,
	getMandatoryExpensesWithRelationsFirebase,
} from '@/functions/MandatoryExpenseFirebase';
import { getAllTagsFirebase } from '@/functions/TagFirebase';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import {
	cancelMandatoryExpenseNotification,
	syncMandatoryExpenseNotifications,
} from '@/utils/mandatoryExpenseNotifications';
import { isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import { deleteExpenseFirebase } from '@/functions/ExpenseFirebase';
import {
	formatConfiguredMonthlyDueLabel,
	formatResolvedMonthDateLabel,
	formatResolvedMonthDayLabel,
	resolveMonthlyOccurrence,
} from '@/utils/businessCalendar';
import {
	formatMandatoryInstallmentDateLabel,
	formatMandatoryInstallmentLabel,
	getMandatoryInstallmentRemainingValueInCents,
	isMandatoryInstallmentPlanComplete,
	normalizeMandatoryInstallmentDate,
	normalizeMandatoryInstallmentTotal,
	normalizeMandatoryInstallmentsCompleted,
	resolveMandatoryInstallmentsCompleted,
} from '@/utils/mandatoryInstallments';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';

// Importação do SVG
import MandatoryExpensesListIllustration from '../assets/UnDraw/mandatoryExpensesListScreen.svg';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';
import DateCalendar, { DateCalendarItem } from '@/components/uiverse/date-calendar';
import { TagIcon } from '@/hooks/useTagIcons';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import {
	buildMandatoryPeriodSummaryPdfHtml,
	type MandatoryPeriodSummaryPdfItem,
	type MandatoryPeriodSummaryPdfMetric,
} from '@/utils/mandatoryPeriodSummaryPdf';
import { buildPdfFileName } from '@/utils/pdfFileName';
import { exportHtmlReport } from '@/utils/reportExport';
import { APP_ROUTE_PATHS, navigateToRoute } from '@/utils/navigation';
import {
	formatMandatoryReminderSummary,
	isMandatoryReminderConfigured,
	normalizeMandatoryReminderDaysBefore,
} from '@/utils/mandatoryReminderConfig';
import {
	DEFAULT_MANDATORY_REMINDER_HOUR,
	DEFAULT_MANDATORY_REMINDER_MINUTE,
} from '@/utils/mandatoryReminderTime';
import { buildMandatoryExpenseReminderSyncItems } from '@/utils/mandatoryReminderAccountSync';
import { findMandatoryExpenseRegistrationTarget } from '@/utils/mandatoryExpenseSuggestions';

type PendingExpenseAction =
	| { type: 'register'; expense: MandatoryExpenseItem }
	| { type: 'settle'; expense: MandatoryExpenseItem }
	| { type: 'edit'; expense: MandatoryExpenseItem }
	| { type: 'delete'; expense: MandatoryExpenseItem }
	| { type: 'reclaim'; expense: MandatoryExpenseItem };

type MandatoryExpenseItem = DateCalendarItem & {
	usesBusinessDays?: boolean;
	resolvedDueDate?: Date | null;
	holidayName?: string | null;
	lastPaymentExpenseId?: string | null;
	lastPaymentCycle?: string | null;
	lastPaymentDate?: Date | null;
	lastPaymentValueInCents?: number | null;
	isPaidForCurrentCycle?: boolean;
	installmentTotal?: number | null;
	installmentsCompleted?: number;
	installmentStartDate?: Date | null;
	installmentEndDate?: Date | null;
	installmentLabel?: string | null;
	remainingInstallments?: number;
	remainingValueInCents?: number | null;
	isInstallmentComplete?: boolean;
	reminderDaysBefore?: 1 | 2 | 3;
	reminderOnDueDate?: boolean;
	reminderHour?: number;
	reminderMinute?: number;
};

type TagMetadata = {
	name: string;
	iconFamily?: TagIconFamily | null;
	iconName?: string | null;
	iconStyle?: TagIconStyle | null;
};

const formatCurrencyBRLBase = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(valueInCents / 100);

const getDueDayColorClass = (dueDay: number, isPaidForCurrentCycle?: boolean) => {
	const today = new Date().getDate();
	const difference = dueDay - today;

	if (isPaidForCurrentCycle) {
		return 'text-emerald-600 dark:text-emerald-400';
	}

	if (difference <= 3) {
		return 'text-red-600 dark:text-red-400';
	}

	if (difference <= 7) {
		return 'text-yellow-600 dark:text-yellow-400';
	}

	return 'text-emerald-600 dark:text-emerald-400';
};

const normalizeDateValue = (value: unknown): Date | null => {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value;
	}

	if (typeof value === 'object' && value !== null) {
		const candidate = value as { toDate?: () => Date };
		if (typeof candidate.toDate === 'function') {
			return candidate.toDate() ?? null;
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

const normalizeExpenseReminderConfiguration = (source: Record<string, unknown>) => {
	const reminderEnabled = isMandatoryReminderConfigured(source);
	const reminderDaysBefore = normalizeMandatoryReminderDaysBefore(source.reminderDaysBefore);
	const reminderOnDueDate = source.reminderOnDueDate === true;
	const reminderHour =
		typeof source.reminderHour === 'number' ? source.reminderHour : DEFAULT_MANDATORY_REMINDER_HOUR;
	const reminderMinute =
		typeof source.reminderMinute === 'number' ? source.reminderMinute : DEFAULT_MANDATORY_REMINDER_MINUTE;

	return {
		reminderEnabled,
		reminderDaysBefore,
		reminderOnDueDate,
		reminderHour,
		reminderMinute,
		reminderSummary: formatMandatoryReminderSummary({
			enabled: reminderEnabled,
			daysBefore: reminderDaysBefore,
			onDueDate: reminderOnDueDate,
			hour: reminderHour,
			minute: reminderMinute,
		}),
	};
};

const formatPaymentDate = (value: Date | null) => {
	if (!value) {
		return 'data não disponível';
	}

	return new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}).format(value);
};

const formatReferenceMonthLabel = (value: Date) =>
	new Intl.DateTimeFormat('pt-BR', {
		month: 'long',
		year: 'numeric',
	}).format(value);

const formatGeneratedAtLabel = (value: Date) =>
	new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(value);

const getMandatoryDisplayValueInCents = (item: DateCalendarItem) =>
	typeof item.displayValueInCents === 'number' && !Number.isNaN(item.displayValueInCents)
		? item.displayValueInCents
		: item.valueInCents;

const formatExpenseScheduleLabel = (expense: MandatoryExpenseItem) => {
	const configuredLabel = formatConfiguredMonthlyDueLabel(expense.dueDay, expense.usesBusinessDays);
	const resolvedDate = expense.resolvedDueDate ?? null;

	if (!resolvedDate) {
		return configuredLabel;
	}

	if (expense.usesBusinessDays) {
		return `${configuredLabel} • ${formatResolvedMonthDayLabel(resolvedDate)}`;
	}

	return configuredLabel;
};

const formatExpenseResolvedDateLabel = (expense: MandatoryExpenseItem) => {
	const resolvedDate = expense.resolvedDueDate ?? null;
	if (!resolvedDate) {
		return 'data não disponível';
	}

	const holidaySuffix = expense.holidayName ? ` • ${expense.holidayName}` : '';
	return `${formatResolvedMonthDateLabel(resolvedDate)}${holidaySuffix}`;
};

type MandatoryItemTone = {
	accentColor: string;
	amountColor: string;
	lineColor: string;
	gradient: [string, string];
};

const MANDATORY_EXPENSE_PENDING_TONE: MandatoryItemTone = {
	accentColor: '#F97316',
	amountColor: '#D97706',
	lineColor: 'rgba(249, 115, 22, 0.3)',
	gradient: ['#B91C1C', '#EF4444'],
};

const MANDATORY_EXPENSE_COMPLETED_TONE: MandatoryItemTone = {
	accentColor: '#10B981',
	amountColor: '#10B981',
	lineColor: 'rgba(16, 185, 129, 0.28)',
	gradient: ['#047857', '#34D399'],
};

function MandatoryExpensesTimelineSkeleton({
	compactCardClassName,
	tintedCardClassName,
	skeletonBaseColor,
	skeletonHighlightColor,
	skeletonMutedBaseColor,
	skeletonMutedHighlightColor,
}: {
	compactCardClassName: string;
	tintedCardClassName: string;
	skeletonBaseColor: string;
	skeletonHighlightColor: string;
	skeletonMutedBaseColor: string;
	skeletonMutedHighlightColor: string;
}) {
	return (
		<VStack className="mt-4 gap-4">

			<Skeleton className="h-[320px] rounded-3xl" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />

			{Array.from({ length: 2 }).map((_, index) => (
				<HStack key={`mandatory-expense-skeleton-${index}`} className="items-start gap-3">
					<VStack className="items-center pt-2" style={{ width: '7%' }}>
						<Skeleton variant="circular" style={{ width: 14, height: 14 }} />
						<Skeleton
							style={{ width: 3, height: 124, marginTop: 6, borderRadius: 999 }}
							baseColor={skeletonBaseColor}
							highlightColor={skeletonHighlightColor}
						/>
					</VStack>
					<Box className={`${compactCardClassName} flex-1 px-4 py-4`}>
						<VStack className="gap-3">
							<HStack className="items-start justify-between gap-3">
								<Skeleton className="h-11 w-11 rounded-2xl" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
								<VStack className="flex-1 gap-2">
									<Skeleton className="h-5 w-40" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
									<Skeleton className="h-3 w-28" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
								</VStack>
								<Skeleton className="h-5 w-20" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
							</HStack>
							<SkeletonText _lines={2} className="h-3" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
						</VStack>
					</Box>
				</HStack>
			))}
		</VStack>
	);
}

export default function MandatoryExpensesListScreen() {
	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
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
		submitButtonClassName,
		submitButtonCancelClassName,
		webDashboardPalette,
		webDashboardClassNames,
	} = useScreenStyles();
	const webStyles = webDashboardClassNames;
	const params = useLocalSearchParams<{
		focusMandatoryExpenseId?: string | string[];
	}>();
	const focusMandatoryExpenseId = React.useMemo(() => {
		const value = Array.isArray(params.focusMandatoryExpenseId)
			? params.focusMandatoryExpenseId[0]
			: params.focusMandatoryExpenseId;
		return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
	}, [params.focusMandatoryExpenseId]);
	const [isLoading, setIsLoading] = React.useState(false);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [expenses, setExpenses] = React.useState<MandatoryExpenseItem[]>([]);
	const [tagsMap, setTagsMap] = React.useState<Record<string, string>>({});
	const [tagMetadataMap, setTagMetadataMap] = React.useState<Record<string, TagMetadata>>({});
	const [pendingAction, setPendingAction] = React.useState<PendingExpenseAction | null>(null);
	const [isActionProcessing, setIsActionProcessing] = React.useState(false);
	const { shouldHideValues } = useValueVisibility();
	const [expandedExpenseIds, setExpandedExpenseIds] = React.useState<string[]>([]);
	const [renderedExpenseIds, setRenderedExpenseIds] = React.useState<string[]>([]);
	const [isExportingPdf, setIsExportingPdf] = React.useState(false);
	const [hasLoadedData, setHasLoadedData] = React.useState(false);
	const handledFocusedExpenseIdRef = React.useRef<string | null>(null);

	const formatCurrencyBRL = React.useCallback(
		(valueInCents: number) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}
			return formatCurrencyBRLBase(valueInCents);
		},
		[shouldHideValues],
	);

	const calendarExpenses = React.useMemo(
		() =>
			expenses.map(expense => ({
				...expense,
				isCompletedForCurrentCycle: expense.isPaidForCurrentCycle || expense.isInstallmentComplete,
				canReclaimCurrentCycle: expense.isPaidForCurrentCycle,
				lastStatusDate: expense.lastPaymentDate ?? null,
			})),
		[expenses],
	);

	const getExpenseStatusText = React.useCallback(
		(expense: DateCalendarItem & { lastStatusDate?: Date | null; isCompletedForCurrentCycle?: boolean }) => {
			if ((expense as MandatoryExpenseItem).isInstallmentComplete) {
				return 'Parcelamento concluído.';
			}
			if (expense.isCompletedForCurrentCycle) {
				return `Pagamento registrado em ${formatPaymentDate(expense.lastStatusDate ?? null)}.`;
			}
			const installmentLabel = (expense as MandatoryExpenseItem).installmentLabel;
			return installmentLabel
				? `Aguardando registro da ${installmentLabel.toLowerCase()} como despesa neste mês.`
				: 'Aguardando registro como despesa neste mês.';
		},
		[],
	);

	const getExpenseStatusClassName = React.useCallback(
		(expense: DateCalendarItem & { isCompletedForCurrentCycle?: boolean }) =>
			expense.isCompletedForCurrentCycle
				? 'text-emerald-600 dark:text-emerald-400'
				: 'text-gray-500 dark:text-gray-400',
		[],
	);

	const monthlySummaryPalette = React.useMemo(
		() => ({
			title: isDarkMode ? '#F8FAFC' : '#0F172A',
			subtitle: isDarkMode ? '#94A3B8' : '#64748B',
			border: isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(226, 232, 240, 1)',
			surface: isDarkMode ? 'rgba(15, 23, 42, 0.92)' : '#F8FAFC',
			expenseText: '#EF4444',
			pendingText: '#F97316',
			cardBaseColor: '#991B1B',
			cardGlowColor: 'rgba(249, 115, 22, 0.36)',
			cardHighlightColor: 'rgba(250, 204, 21, 0.42)',
		}),
		[isDarkMode],
	);

	const referenceMonthLabel = React.useMemo(() => formatReferenceMonthLabel(new Date()), []);

	const monthlySummary = React.useMemo(() => {
		// Resumo mensal segue a chave de ciclo documentada em [[Despesas Fixas]].
		const paidItems = expenses.filter(expense => expense.isPaidForCurrentCycle);
		const pendingItems = expenses.filter(expense => !expense.isPaidForCurrentCycle && !expense.isInstallmentComplete);
		const completedPlanItems = expenses.filter(expense => expense.isInstallmentComplete && !expense.isPaidForCurrentCycle);
		const totalReferenceInCents = [...paidItems, ...pendingItems].reduce(
			(total, expense) => total + getMandatoryDisplayValueInCents(expense),
			0,
		);
		const paidTotalInCents = paidItems.reduce(
			(total, expense) => total + getMandatoryDisplayValueInCents(expense),
			0,
		);
		const pendingTotalInCents = pendingItems.reduce(
			(total, expense) => total + getMandatoryDisplayValueInCents(expense),
			0,
		);

		return {
			paidItems,
			pendingItems,
			completedPlanItems,
			totalReferenceInCents,
			paidTotalInCents,
			pendingTotalInCents,
		};
	}, [expenses]);

	React.useEffect(() => {
		const visibleIds = new Set(expenses.map(expense => expense.id));
		setExpandedExpenseIds(previousState => previousState.filter(id => visibleIds.has(id)));
		setRenderedExpenseIds(previousState => previousState.filter(id => visibleIds.has(id)));
	}, [expenses]);

	React.useEffect(() => {
		if (
			!focusMandatoryExpenseId ||
			!hasLoadedData ||
			handledFocusedExpenseIdRef.current === focusMandatoryExpenseId
		) {
			return;
		}

		handledFocusedExpenseIdRef.current = focusMandatoryExpenseId;
		const matchingExpense = expenses.find(expense => expense.id === focusMandatoryExpenseId) ?? null;
		const targetExpense = findMandatoryExpenseRegistrationTarget(focusMandatoryExpenseId, expenses);

		if (!targetExpense) {
			if (matchingExpense) {
				showNotifierAlert({
					description: 'Este gasto obrigatório não está mais pendente neste ciclo.',
					type: 'info',
					isDarkMode,
				});
			}
			return;
		}

		setExpandedExpenseIds(previousState =>
			previousState.includes(targetExpense.id) ? previousState : [...previousState, targetExpense.id],
		);
		setPendingAction({ type: 'register', expense: targetExpense });
	}, [expenses, focusMandatoryExpenseId, hasLoadedData, isDarkMode]);

	const loadData = React.useCallback(async (asRefresh = false) => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showNotifierAlert({
				description: 'Usuário não autenticado. Faça login novamente.',
				type: 'error',
				isDarkMode,
			});
			return;
		}

		setHasLoadedData(false);

		if (asRefresh) {
			setIsRefreshing(true);
		} else {
			setIsLoading(true);
		}

		try {
			const [expensesResult, tagsResult, relatedUsersResult] = await Promise.all([
				getMandatoryExpensesWithRelationsFirebase(currentUser.uid),
				getAllTagsFirebase(),
				getRelatedUsersIDsFirebase(currentUser.uid),
			]);

			if (!expensesResult.success || !Array.isArray(expensesResult.data)) {
				throw new Error('Erro ao obter os gastos obrigatórios.');
			}

			const relatedIds =
				relatedUsersResult.success && Array.isArray(relatedUsersResult.data) ? relatedUsersResult.data : [];
			const allowedIds = new Set<string>([currentUser.uid, ...relatedIds.filter(id => typeof id === 'string')]);

			const tagsRecord: Record<string, string> = {};
			const tagMetadataRecord: Record<string, TagMetadata> = {};
			if (tagsResult.success && Array.isArray(tagsResult.data)) {
				(tagsResult.data as Array<Record<string, unknown>>)
					.filter(tag => {
						const personIdValue = tag['personId'];
						const personId = typeof personIdValue === 'string' ? personIdValue : '';
						return allowedIds.has(personId);
					})
					.forEach(tag => {
						const tagIdValue = tag['id'];
						if (typeof tagIdValue === 'string') {
							const tagNameValue = tag['name'];
							const label =
								typeof tagNameValue === 'string' && tagNameValue.trim().length > 0
									? tagNameValue.trim()
									: 'Tag sem nome';
							tagsRecord[tagIdValue] = label;
							tagMetadataRecord[tagIdValue] = {
								name: label,
								iconFamily: typeof tag['iconFamily'] === 'string' ? tag['iconFamily'] as TagIconFamily : null,
								iconName: typeof tag['iconName'] === 'string' ? tag['iconName'] as string : null,
								iconStyle: typeof tag['iconStyle'] === 'string' ? tag['iconStyle'] as TagIconStyle : null,
							};
						}
					});
			}

			const referenceDate = new Date();
			const formattedExpenses: MandatoryExpenseItem[] = expensesResult.data.map((expense: any) => {
				const dueDay = typeof expense?.dueDay === 'number' ? expense.dueDay : 1;
				const usesBusinessDays = expense?.usesBusinessDays === true;
				const installmentTotal = normalizeMandatoryInstallmentTotal(expense?.installmentTotal);
				const installmentsCompleted = normalizeMandatoryInstallmentsCompleted(
					expense?.installmentsCompleted,
					installmentTotal,
				);
				const installmentStartDate = normalizeMandatoryInstallmentDate(expense?.installmentStartDate);
				const installmentEndDate = normalizeMandatoryInstallmentDate(expense?.installmentEndDate);
				const resolvedOccurrence = resolveMonthlyOccurrence({
					referenceDate,
					dueDay,
					usesBusinessDays,
				});
				const reminderConfiguration = normalizeExpenseReminderConfiguration(expense);
				const hasLinkedPaymentExpense = expense?.hasLinkedPaymentExpense === true;

				return {
					id: expense.id,
					name: typeof expense?.name === 'string' ? expense.name : 'Gasto sem nome',
					valueInCents: typeof expense?.valueInCents === 'number' ? expense.valueInCents : 0,
					dueDay,
					usesBusinessDays,
					resolvedDueDate: resolvedOccurrence.date,
					holidayName: resolvedOccurrence.holiday?.name ?? null,
					tagId: typeof expense?.tagId === 'string' ? expense.tagId : '',
					description: typeof expense?.description === 'string' ? expense.description : null,
					...reminderConfiguration,
					lastPaymentExpenseId:
						hasLinkedPaymentExpense && typeof expense?.lastPaymentExpenseId === 'string'
							? expense.lastPaymentExpenseId
							: null,
					lastPaymentCycle:
						hasLinkedPaymentExpense && typeof expense?.lastPaymentCycle === 'string'
							? expense.lastPaymentCycle
							: null,
					lastPaymentDate: hasLinkedPaymentExpense
						? normalizeDateValue(expense?.lastPaymentDate ?? null)
						: null,
					lastPaymentValueInCents:
						hasLinkedPaymentExpense && typeof expense?.lastPaymentValueInCents === 'number'
							? expense.lastPaymentValueInCents
							: null,
					installmentTotal,
					installmentsCompleted,
					installmentStartDate,
					installmentEndDate,
				};
			});

			const expensesWithStatus = formattedExpenses.map(expense => {
				const isPaidForCurrentCycle = isCycleKeyCurrent(expense.lastPaymentCycle ?? undefined);
				const resolvedInstallmentsCompleted = resolveMandatoryInstallmentsCompleted({
					storedCompleted: expense.installmentsCompleted ?? 0,
					installmentTotal: expense.installmentTotal ?? null,
					startDate: expense.installmentStartDate ?? null,
					isCurrentCycleCompleted: isPaidForCurrentCycle,
					referenceDate,
				});
				const isInstallmentComplete = isMandatoryInstallmentPlanComplete(
					expense.installmentTotal ?? null,
					resolvedInstallmentsCompleted,
				);
				const installmentLabel = formatMandatoryInstallmentLabel(
					expense.installmentTotal ?? null,
					resolvedInstallmentsCompleted,
					isPaidForCurrentCycle,
				);
				const remainingValueInCents = getMandatoryInstallmentRemainingValueInCents({
					installmentTotal: expense.installmentTotal,
					installmentsCompleted: resolvedInstallmentsCompleted,
					installmentValueInCents: expense.valueInCents,
				});
				const displayValueInCents =
					isPaidForCurrentCycle &&
						typeof expense.lastPaymentValueInCents === 'number' &&
						!Number.isNaN(expense.lastPaymentValueInCents)
						? expense.lastPaymentValueInCents
						: expense.valueInCents;

				return {
					...expense,
					installmentsCompleted: resolvedInstallmentsCompleted,
					isPaidForCurrentCycle,
					isInstallmentComplete,
					installmentLabel,
					remainingInstallments:
						typeof expense.installmentTotal === 'number'
							? Math.max(0, expense.installmentTotal - resolvedInstallmentsCompleted)
							: 0,
					remainingValueInCents,
					displayValueInCents,
				};
			});

			if (auth.currentUser?.uid !== currentUser.uid) {
				return;
			}
			setTagsMap(tagsRecord);
			setTagMetadataMap(tagMetadataRecord);
			setExpenses(expensesWithStatus);
			await syncMandatoryExpenseNotifications(
				currentUser.uid,
				buildMandatoryExpenseReminderSyncItems(expensesResult.data, referenceDate),
			);
		} catch (error) {
			console.error('Erro ao carregar gastos obrigatórios:', error);
			showNotifierAlert({
				description: 'Não foi possível carregar os gastos obrigatórios.',
				type: 'error',
				isDarkMode,
			});
		} finally {
			setHasLoadedData(true);
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, []);

	const handleRefresh = React.useCallback(async () => {
		await loadData(true);
	}, [loadData]);

	useFocusEffect(
		React.useCallback(() => {
			let isMounted = true;

			const fetch = async () => {
				await loadData();
			};

			void fetch();

			return () => {
				isMounted = false;
			};
		}, [loadData]),
	);

	const handleOpenCreate = React.useCallback(() => {
		navigateToRoute(APP_ROUTE_PATHS.addMandatoryExpenses);
	}, []);

	const handleEdit = React.useCallback((expenseId: string) => {
		navigateToRoute(APP_ROUTE_PATHS.addMandatoryExpenses, { expenseId });
	}, []);

	const handleRegisterExpense = React.useCallback((expense: MandatoryExpenseItem) => {
		if (expense.isPaidForCurrentCycle) {
			showNotifierAlert({
				description: 'Este gasto já foi registrado como pago neste mês.',
				type: 'warn',
				isDarkMode,
			});
			return;
		}

		if (expense.isInstallmentComplete) {
			showNotifierAlert({
				description: 'Todas as parcelas deste gasto obrigatório já foram registradas.',
				type: 'warn',
				isDarkMode,
			});
			return;
		}

		navigateToRoute(APP_ROUTE_PATHS.addRegisterExpenses, {
			templateName: encodeURIComponent(expense.name),
			templateValueInCents: String(expense.valueInCents),
			templateTagId: expense.tagId,
			templateDueDay: String(expense.dueDay),
			templateUsesBusinessDays: expense.usesBusinessDays ? '1' : undefined,
			templateDescription: expense.description ? encodeURIComponent(expense.description) : undefined,
			templateMandatoryExpenseId: expense.id,
			templateTagName: tagMetadataMap[expense.tagId]?.name
				? encodeURIComponent(tagMetadataMap[expense.tagId].name)
				: undefined,
			templateTagIconFamily: tagMetadataMap[expense.tagId]?.iconFamily
				? encodeURIComponent(tagMetadataMap[expense.tagId].iconFamily as string)
				: undefined,
			templateTagIconName: tagMetadataMap[expense.tagId]?.iconName
				? encodeURIComponent(tagMetadataMap[expense.tagId].iconName as string)
				: undefined,
			templateTagIconStyle: tagMetadataMap[expense.tagId]?.iconStyle
				? encodeURIComponent(tagMetadataMap[expense.tagId].iconStyle as string)
				: undefined,
		});
	}, [tagMetadataMap]);

	const handleSettleExpense = React.useCallback((expense: MandatoryExpenseItem) => {
		if (typeof expense.installmentTotal !== 'number' || expense.isInstallmentComplete) {
			showNotifierAlert({
				description: 'A quitação antecipada só está disponível para parcelamentos ativos.',
				type: 'warn',
				isDarkMode,
			});
			return;
		}

		if (!expense.remainingValueInCents || expense.remainingValueInCents <= 0) {
			showNotifierAlert({
				description: 'Não há parcelas restantes para quitar neste gasto.',
				type: 'warn',
				isDarkMode,
			});
			return;
		}

		navigateToRoute(APP_ROUTE_PATHS.addRegisterExpenses, {
			templateName: encodeURIComponent(expense.name),
			templateValueInCents: String(expense.remainingValueInCents),
			templateTagId: expense.tagId,
			templateDueDay: String(expense.dueDay),
			templateUsesBusinessDays: expense.usesBusinessDays ? '1' : undefined,
			templateDescription: encodeURIComponent(
				[expense.description, `Quitação antecipada de ${expense.remainingInstallments ?? 0} parcela(s) restantes.`]
					.filter(Boolean)
					.join('\n'),
			),
			templateMandatoryExpenseId: expense.id,
			templateMandatoryExpenseSettlement: '1',
			templateTagName: tagMetadataMap[expense.tagId]?.name
				? encodeURIComponent(tagMetadataMap[expense.tagId].name)
				: undefined,
			templateTagIconFamily: tagMetadataMap[expense.tagId]?.iconFamily
				? encodeURIComponent(tagMetadataMap[expense.tagId].iconFamily as string)
				: undefined,
			templateTagIconName: tagMetadataMap[expense.tagId]?.iconName
				? encodeURIComponent(tagMetadataMap[expense.tagId].iconName as string)
				: undefined,
			templateTagIconStyle: tagMetadataMap[expense.tagId]?.iconStyle
				? encodeURIComponent(tagMetadataMap[expense.tagId].iconStyle as string)
				: undefined,
		});
	}, [isDarkMode, tagMetadataMap]);

	const handleCloseActionModal = React.useCallback(() => {
		if (isActionProcessing) {
			return;
		}
		setPendingAction(null);
	}, [isActionProcessing]);

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) {
			return;
		}

		if (pendingAction.type === 'register') {
			handleRegisterExpense(pendingAction.expense);
			setPendingAction(null);
			return;
		}

		if (pendingAction.type === 'settle') {
			handleSettleExpense(pendingAction.expense);
			setPendingAction(null);
			return;
		}

		if (pendingAction.type === 'edit') {
			handleEdit(pendingAction.expense.id);
			setPendingAction(null);
			return;
		}

		setIsActionProcessing(true);
		try {
			if (pendingAction.type === 'delete') {
				const result = await deleteMandatoryExpenseFirebase(pendingAction.expense.id);
				if (result.success) {
					const accountId = auth.currentUser?.uid;
					let reminderCleanupFailed = false;
					if (accountId) {
						try {
							await cancelMandatoryExpenseNotification(accountId, pendingAction.expense.id);
						} catch (notificationError) {
							reminderCleanupFailed = true;
							console.error('Erro ao remover a agenda do gasto obrigatório excluído:', notificationError);
						}
					}
					showNotifierAlert({
						description: reminderCleanupFailed
							? 'Gasto removido, mas a agenda local será limpa na próxima reconciliação.'
							: 'Gasto obrigatório removido com sucesso.',
						type: reminderCleanupFailed ? 'warn' : 'success',
						isDarkMode,
					});
					await loadData();
				} else {
					showNotifierAlert({
						description: 'Não foi possível remover o gasto obrigatório.',
						type: 'error',
						isDarkMode,
					});
				}
				return;
			}

			if (pendingAction.type === 'reclaim') {
				const linkedExpenseId = pendingAction.expense.lastPaymentExpenseId;

				if (linkedExpenseId) {
					const deleteResult = await deleteExpenseFirebase(linkedExpenseId);
					if (!deleteResult.success) {
						showNotifierAlert({
							description: 'Não foi possível remover a despesa vinculada.',
							type: 'error',
							isDarkMode,
						});
						return;
					}
				}

				const clearResult = await clearMandatoryExpensePaymentFirebase(pendingAction.expense.id);
				if (!clearResult.success) {
					showNotifierAlert({
						description: 'Não foi possível reivindicar o pagamento.',
						type: 'error',
						isDarkMode,
					});
					return;
				}

				showNotifierAlert({
					description: 'Pagamento reivindicado. Registre novamente quando necessário.',
					type: 'success',
					isDarkMode,
				});
				await loadData();
				return;
			}
		} catch (error) {
			console.error('Erro ao processar a ação do gasto obrigatório:', error);
			showNotifierAlert({
				description: 'Erro inesperado ao processar a ação selecionada.',
				type: 'error',
				isDarkMode,
			});
		} finally {
			setIsActionProcessing(false);
			setPendingAction(null);
		}
	}, [handleEdit, handleRegisterExpense, handleSettleExpense, loadData, pendingAction]);

	const handleExportMonthlySummaryPdf = React.useCallback(async () => {
		if (isExportingPdf || isLoading) {
			return;
		}

		const generatedAtLabel = formatGeneratedAtLabel(new Date());
		const metrics: MandatoryPeriodSummaryPdfMetric[] = [
			{
				label: 'Total do mês',
				value: formatCurrencyBRL(monthlySummary.totalReferenceInCents),
				helper: 'Pagos do ciclo atual somados aos pendentes previstos.',
				tone: 'expense',
			},
			{
				label: 'Pago',
				value: formatCurrencyBRL(monthlySummary.paidTotalInCents),
				helper: `${monthlySummary.paidItems.length} item(ns) pago(s).`,
				tone: 'expense',
			},
			{
				label: 'Pendente',
				value: formatCurrencyBRL(monthlySummary.pendingTotalInCents),
				helper: `${monthlySummary.pendingItems.length} item(ns) aguardando registro.`,
				tone: 'neutral',
			},
			{
				label: 'Itens do ciclo',
				value: String(monthlySummary.paidItems.length + monthlySummary.pendingItems.length),
				helper: 'Despesas pagas ou ainda pendentes neste mês.',
			},
			{
				label: 'Parcelamentos concluídos',
				value: String(monthlySummary.completedPlanItems.length),
				helper: 'Itens finitos já encerrados antes deste ciclo.',
			},
			{
				label: 'Cadastros totais',
				value: String(expenses.length),
				helper: 'Todos os gastos obrigatórios carregados na tela.',
			},
		];

		const pdfItems: MandatoryPeriodSummaryPdfItem[] = expenses.map(expense => {
			const isCyclePaid = expense.isPaidForCurrentCycle === true;
			const isCompletedBeforeCycle = expense.isInstallmentComplete === true && !isCyclePaid;
			const statusLabel = isCompletedBeforeCycle
				? 'Parcelamento concluído'
				: isCyclePaid
					? 'Pago no mês'
					: 'Pendente no mês';
			const description = expense.description?.trim()
				? expense.description.trim()
				: isCompletedBeforeCycle
					? 'Este gasto obrigatório parcelado já foi concluído.'
					: isCyclePaid
						? `Pagamento registrado em ${formatPaymentDate(expense.lastPaymentDate ?? null)}.`
						: 'Aguardando registro como despesa neste mês.';

			return {
				id: expense.id,
				name: expense.name,
				statusLabel,
				dateLabel: formatExpenseResolvedDateLabel(expense),
				tagLabel: tagMetadataMap[expense.tagId]?.name ?? tagsMap[expense.tagId] ?? 'Sem tag',
				scheduleLabel: formatExpenseScheduleLabel(expense),
				description,
				amountLabel: isCompletedBeforeCycle
					? 'Fora do ciclo'
					: formatCurrencyBRL(getMandatoryDisplayValueInCents(expense)),
				amountTone: isCompletedBeforeCycle ? 'neutral' : 'expense',
			};
		});

		const pdfHtml = buildMandatoryPeriodSummaryPdfHtml({
			reportKindLabel: 'Despesas fixas',
			title: 'Resumo de gastos obrigatórios',
			monthLabel: referenceMonthLabel,
			generatedAtLabel,
			primaryMetricLabel: 'Total do mês',
			primaryMetricValue: formatCurrencyBRL(monthlySummary.totalReferenceInCents),
			primaryMetricHelper: `${monthlySummary.paidItems.length} pagos · ${monthlySummary.pendingItems.length} pendentes`,
			metrics,
			items: pdfItems,
			cardBaseColor: monthlySummaryPalette.cardBaseColor,
			cardGlowColor: monthlySummaryPalette.cardGlowColor,
			cardHighlightColor: monthlySummaryPalette.cardHighlightColor,
			emptyStateLabel: 'Nenhum gasto obrigatório foi cadastrado para o mês.',
			privacyNotice: shouldHideValues
				? 'Os valores foram ocultados porque a preferência de privacidade está ativa.'
				: null,
		});

		setIsExportingPdf(true);
		try {
			// Exporta o resumo mensal seguindo [[Despesas Fixas]] e [[Privacidade de Valores]].
			const pdfFileName = buildPdfFileName(['Despesas Fixas', referenceMonthLabel]);
			const exportResult = await exportHtmlReport({
				html: pdfHtml,
				fileName: pdfFileName,
				dialogTitle: 'Baixar resumo de gastos obrigatórios',
			});

			if (exportResult.status === 'popup-blocked') {
				showNotifierAlert({
					title: 'Permita pop-ups',
					description: 'O navegador bloqueou a nova aba do relatório. Permita pop-ups para este site e tente novamente.',
					type: 'error',
					isDarkMode,
				});
				return;
			}

			if (exportResult.status === 'printed') {
				showNotifierAlert({
					title: 'Resumo pronto',
					description: 'O resumo foi aberto para impressão. Use a opção de salvar como PDF.',
					type: 'info',
					isDarkMode,
				});
				return;
			}

			showNotifierAlert({
				title: 'PDF pronto',
				description: 'Resumo em PDF gerado com sucesso.',
				type: 'success',
				isDarkMode,
			});
		} catch (error) {
			console.error('Erro ao gerar resumo mensal de gastos obrigatórios:', error);
			showNotifierAlert({
				description: 'Não foi possível gerar o PDF do resumo agora.',
				type: 'error',
				isDarkMode,
			});
		} finally {
			setIsExportingPdf(false);
		}
	}, [
		expenses,
		formatCurrencyBRL,
		isDarkMode,
		isExportingPdf,
		isLoading,
		monthlySummary,
		monthlySummaryPalette.cardBaseColor,
		monthlySummaryPalette.cardGlowColor,
		monthlySummaryPalette.cardHighlightColor,
		referenceMonthLabel,
		shouldHideValues,
		tagMetadataMap,
		tagsMap,
	]);

	const handleCalendarAction = React.useCallback(
		(action: PendingExpenseAction['type'], expense: MandatoryExpenseItem) => {
			setPendingAction({ type: action, expense });
		},
		[],
	);
	const handleToggleExpenseCard = React.useCallback((expenseId: string) => {
		setExpandedExpenseIds(previousState => {
			if (previousState.includes(expenseId)) {
				return previousState.filter(id => id !== expenseId);
			}

			setRenderedExpenseIds(rendered =>
				rendered.includes(expenseId) ? rendered : [...rendered, expenseId],
			);
			return [...previousState, expenseId];
		});
	}, []);

	const actionModalCopy = React.useMemo(() => {
		if (!pendingAction) {
			return {
				title: '',
				message: '',
				confirmLabel: 'Confirmar',
				action: 'primary' as const,
			};
		}

		const expenseName = pendingAction.expense.name || 'gasto obrigatório selecionado';

		if (pendingAction.type === 'register') {
			return {
				title: 'Registrar despesa',
				message: `Deseja registrar "${expenseName}" como uma nova despesa?`,
				confirmLabel: 'Registrar',
				action: 'primary' as const,
			};
		}

		if (pendingAction.type === 'settle') {
			return {
				title: 'Quitar parcelas',
				message: `Registrar ${pendingAction.expense.remainingInstallments ?? 0} parcela(s) restantes de "${expenseName}" em uma única despesa no valor de ${formatCurrencyBRL(pendingAction.expense.remainingValueInCents ?? 0)}? O parcelamento será encerrado após o lançamento.`,
				confirmLabel: 'Continuar',
				action: 'primary' as const,
			};
		}

		if (pendingAction.type === 'edit') {
			return {
				title: 'Editar gasto obrigatório',
				message: `Deseja editar o gasto obrigatório "${expenseName}"?`,
				confirmLabel: 'Editar',
				action: 'primary' as const,
			};
		}

		if (pendingAction.type === 'reclaim') {
			return {
				title: 'Reivindicar pagamento',
				message: `Deseja cancelar o pagamento registrado para "${expenseName}"? A despesa vinculada será removida.`,
				confirmLabel: 'Reivindicar',
				action: 'secondary' as const,
			};
		}

		return {
			title: 'Excluir gasto obrigatório',
			message: `Tem certeza de que deseja excluir "${expenseName}"? Essa ação não pode ser desfeita.`,
			confirmLabel: 'Excluir',
			action: 'negative' as const,
		};
	}, [formatCurrencyBRL, pendingAction]);
	const actionConfirmButtonClassName = React.useMemo(() => {
		if (actionModalCopy.action === 'negative') {
			return isDarkMode ? 'rounded-2xl bg-rose-500' : 'rounded-2xl bg-rose-600';
		}

		if (actionModalCopy.action === 'secondary') {
			return 'rounded-2xl bg-slate-700';
		}

		return submitButtonClassName;
	}, [actionModalCopy.action, isDarkMode, submitButtonClassName]);
	const actionConfirmButtonTextClassName = React.useMemo(() => {
		if (actionModalCopy.action === 'primary') {
			return isDarkMode ? 'text-slate-900' : 'text-white';
		}

		return 'text-white';
	}, [actionModalCopy.action, isDarkMode]);
	const actionSpinnerColor = actionModalCopy.action === 'primary' && isDarkMode ? '#0F172A' : '#FFFFFF';

	const isModalOpen = Boolean(pendingAction);
	// As telas Web com sheet sobreposto ocultam os 64 px finais do hero; a lista mantém a mesma altura visual.
	const visibleHeroHeight = heroHeight - 64;

	return (
		<SafeAreaView className="flex-1 web:w-screen" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<View className="flex-1 web:w-screen" style={{ backgroundColor: surfaceBackground }}>
				<View className="flex-1 web:w-screen" style={{ backgroundColor: surfaceBackground }}>
					<View
						className={webDashboardClassNames.hero}
						style={{ height: visibleHeroHeight, backgroundColor: surfaceBackground }}
					>
						<Image
							source={LoginWallpaper}
							alt="Background da tela de gastos obrigatórios"
							className={webDashboardClassNames.heroImage}
							style={{
								position: 'absolute',
								top: 0,
								left: 0,
								right: 0,
								bottom: 0,
								width: '100%',
								height: '100%',
							}}
							resizeMode="cover"
						/>
						<WebScreenHero
							title="Gastos obrigatórios"
							Illustration={MandatoryExpensesListIllustration}
							isDarkMode={isDarkMode}
							topPadding={insets.top + 24}
						/>
					</View>

					<View style={{ flex: 1, marginTop: visibleHeroHeight + 16, position: 'relative', zIndex: 3 }}>
						<ScrollView
							keyboardShouldPersistTaps="handled"
							keyboardDismissMode="on-drag"
							className={`flex-1 rounded-t-3xl ${cardBackground} pb-1 web:w-full web:relative web:z-[3]`}
							style={{ flex: 1 }}
							contentContainerStyle={{ paddingBottom: 48 }}
							showsVerticalScrollIndicator={false}
							refreshControl={
								<RefreshControl
									refreshing={isRefreshing}
									onRefresh={() => void handleRefresh()}
									tintColor="#FACC15"
								/>
							}
						>
							<VStack className="justify-between web:w-full web:max-w-[1180px] web:self-center web:px-2 web:pb-8">

								{isLoading ? (
									<MandatoryExpensesTimelineSkeleton
										compactCardClassName={compactCardClassName}
										tintedCardClassName={tintedCardClassName}
										skeletonBaseColor={skeletonBaseColor}
										skeletonHighlightColor={skeletonHighlightColor}
										skeletonMutedBaseColor={skeletonMutedBaseColor}
										skeletonMutedHighlightColor={skeletonMutedHighlightColor}
									/>
								) : (
									<VStack className="gap-4">
										<DateCalendar
											items={calendarExpenses}
											tagsMap={tagsMap}
											tagMetadataMap={tagMetadataMap}
											formatCurrency={formatCurrencyBRL}
											getStatusText={getExpenseStatusText}
											getStatusClassName={getExpenseStatusClassName}
											getDueDayColorClass={(dueDay: number, expense?: DateCalendarItem) =>
												getDueDayColorClass(
													dueDay,
													(expense as MandatoryExpenseItem | undefined)?.isCompletedForCurrentCycle,
												)}
											onAction={handleCalendarAction}
											valueLabel="Previsto"
											dueLabel="Vencimento"
											completedLabel="pagos"
											pendingLabel="pend."
											valueTone="expense"
											modalSize="lg"
										/>

										<View className={`py-2`}>
											<VStack className="gap-4">
												<HStack className="items-start justify-between gap-4">
													<VStack className="flex-1 gap-1">
														<Text
															className="text-xs uppercase tracking-wide"
															style={{ color: monthlySummaryPalette.subtitle }}
														>
															Resumo do mês
														</Text>
														<Heading size="lg" style={{ color: monthlySummaryPalette.title }}>
															{referenceMonthLabel}
														</Heading>
													</VStack>

													<VStack className="items-end gap-1">
														<Text
															className="text-xs uppercase tracking-wide"
															style={{ color: monthlySummaryPalette.subtitle }}
														>
															Total do mês
														</Text>
														<Heading size="md" style={{ color: monthlySummaryPalette.expenseText }}>
															{formatCurrencyBRL(monthlySummary.totalReferenceInCents)}
														</Heading>
													</VStack>
												</HStack>

												<HStack className="flex-wrap gap-3">
													<View
														style={{
															flex: 1,
															minHeight: 96,
															borderRadius: 22,
															borderWidth: 1,
															borderColor: monthlySummaryPalette.border,
															paddingHorizontal: 14,
															paddingVertical: 12,
														}}
													>
														<VStack className="flex-1 justify-between">
															<Text
																className="text-xs uppercase tracking-wide"
																style={{ color: monthlySummaryPalette.subtitle }}
															>
																Pago
															</Text>
															<Heading size="sm" style={{ color: monthlySummaryPalette.expenseText }}>
																{formatCurrencyBRL(monthlySummary.paidTotalInCents)}
															</Heading>
															<Text className="text-xs" style={{ color: monthlySummaryPalette.subtitle }}>
																{monthlySummary.paidItems.length} item(ns)
															</Text>
														</VStack>
													</View>

													<View
														style={{
															flex: 1,
															minHeight: 96,
															borderRadius: 22,
															borderWidth: 1,
															borderColor: monthlySummaryPalette.border,
															paddingHorizontal: 14,
															paddingVertical: 12,
														}}
													>
														<VStack className="flex-1 justify-between">
															<Text
																className="text-xs uppercase tracking-wide"
																style={{ color: monthlySummaryPalette.subtitle }}
															>
																Pendente
															</Text>
															<Heading size="sm" style={{ color: monthlySummaryPalette.pendingText }}>
																{formatCurrencyBRL(monthlySummary.pendingTotalInCents)}
															</Heading>
															<Text className="text-xs" style={{ color: monthlySummaryPalette.subtitle }}>
																{monthlySummary.pendingItems.length} item(ns)
															</Text>
														</VStack>
													</View>
												</HStack>

											</VStack>
										</View>

										<HStack className="gap-3">
											<Button
												className={`${submitButtonClassName} flex-1`}
												onPress={() => {
													void handleExportMonthlySummaryPdf();
												}}
												isDisabled={isLoading || isExportingPdf}
											>
												{isExportingPdf ? (
													<>
														<ButtonSpinner />
														<ButtonText>Gerando PDF</ButtonText>
													</>
												) : (
													<>
														<ButtonIcon as={DownloadIcon} size="sm" />
														<ButtonText>Baixar resumo em PDF</ButtonText>
													</>
												)}
											</Button>

											<Button
												className={`${submitButtonClassName} flex-1`}
												onPress={handleOpenCreate}
											>
												<ButtonIcon as={AddIcon} size="sm" />
												<ButtonText>Adicionar gasto</ButtonText>
												{isLoading && <ButtonSpinner />}
											</Button>
										</HStack>

										{expenses.length === 0 ? (
											<Box className={`${compactCardClassName} px-5 py-6`}>
												<Text className={`text-center ${helperText}`}>
													Nenhum gasto obrigatório cadastrado até o momento.
												</Text>
											</Box>
										) : (
											<VStack className="gap-2">
												<View className={webStyles.timeline}>
													{expenses.map((expense, index) => {
														const isExpanded = expandedExpenseIds.includes(expense.id);
														const tagMetadata = tagMetadataMap[expense.tagId];
														const isCompletedDisplay = expense.isPaidForCurrentCycle || expense.isInstallmentComplete;
														const tone = isCompletedDisplay
															? MANDATORY_EXPENSE_COMPLETED_TONE
															: MANDATORY_EXPENSE_PENDING_TONE;
														const summaryText = expense.isInstallmentComplete
															? 'Parcelamento concluído.'
															: expense.isPaidForCurrentCycle
																? `Pagamento registrado em ${formatPaymentDate(expense.lastPaymentDate ?? null)}.`
																: expense.installmentLabel
																	? `Registre a ${expense.installmentLabel.toLowerCase()} para concluir este item.`
																	: 'Registre a despesa do mês para concluir este item.';

														return (
															<View key={expense.id} className={webStyles.timelineRow}>
																<View className={webStyles.timelineRail}>
																	<View
																		className={webStyles.timelineDot}
																		style={{ backgroundColor: tone.accentColor }}
																	/>
																	{index < expenses.length - 1 ? (
																		<View
																			className={webStyles.timelineLine}
																			style={{ backgroundColor: tone.lineColor }}
																		/>
																	) : null}
																</View>

																<View className={webStyles.timelineBody}>
																	<Pressable
																		onPress={() => handleToggleExpenseCard(expense.id)}
																		accessibilityRole="button"
																		accessibilityLabel={`${isExpanded ? 'Recolher' : 'Expandir'} detalhes de ${expense.name}`}
																		accessibilityState={{ expanded: isExpanded }}
																		className={`${webStyles.movementHeader} min-h-[44px]`}
																	>
																		<View className={webStyles.movementIdentity}>
																			<View className={webStyles.movementIcon} style={{ backgroundColor: tone.gradient[0] }}>
																				<TagIcon
																					iconFamily={tagMetadata?.iconFamily}
																					iconName={tagMetadata?.iconName}
																					iconStyle={tagMetadata?.iconStyle}
																					size={18}
																					color="#FFFFFF"
																				/>
																			</View>

																			<View className={webStyles.movementCopy}>
																				<RNText
																					numberOfLines={1}
																					className={webStyles.movementName}
																					style={{ color: webDashboardPalette.primaryText }}
																				>
																					{expense.name}
																				</RNText>
																				<RNText
																					numberOfLines={1}
																					className={webStyles.movementSubtitle}
																					style={{ color: webDashboardPalette.primaryText }}
																				>
																					{tagMetadata?.name ?? tagsMap[expense.tagId] ?? 'Tag não encontrada'}
																				</RNText>
																				{expense.installmentLabel ? (
																					<RNText
																						numberOfLines={1}
																						className="mt-0.5 text-[11px] font-bold leading-4"
																						style={{ color: tone.accentColor }}
																					>
																						{expense.installmentLabel}
																					</RNText>
																				) : null}
																			</View>
																		</View>

																		<View className={webStyles.movementAmount}>
																			<RNText className={webStyles.amount} style={{ color: tone.amountColor }}>
																				{formatCurrencyBRL(expense.displayValueInCents ?? expense.valueInCents)}
																			</RNText>
																			<View className={webStyles.movementDate}>
																				<CalendarDays size={12} color="#94A3B8" />
																				<RNText className={webStyles.dateText}>
																					{formatExpenseScheduleLabel(expense)}
																				</RNText>
																				{isExpanded ? <ChevronUp size={14} color="#94A3B8" /> : <ChevronDown size={14} color="#94A3B8" />}
																			</View>
																		</View>
																	</Pressable>

																	{renderedExpenseIds.includes(expense.id) ? (
																		<AnimatedContent
																			key={`${expense.id}:detail`}
																			trigger="mount"
																			visible={isExpanded}
																			distance={18}
																			duration={0.36}
																			disappearDuration={0.28}
																			disappearScale={1}
																			ease="power3.out"
																			initialOpacity={0}
																			animateOpacity
																			scale={1}
																			className={webStyles.movementDetailAnimation}
																			onDisappearanceComplete={() =>
																				setRenderedExpenseIds(rendered =>
																					rendered.filter(item => item !== expense.id),
																				)
																			}
																		>
																			<View className={webStyles.movementDetail}>
																				<View pointerEvents="none" className={webStyles.movementDetailGrainient}>
																					<Grainient
																						className="movement-detail-grainient"
																						timeSpeed={0.1}
																						warpStrength={0.8}
																						warpFrequency={3.5}
																						warpSpeed={1.6}
																						warpAmplitude={90}
																						blendSoftness={0.2}
																						grainAmount={0.06}
																						grainScale={3}
																						grainAnimated
																						contrast={1.12}
																						zoom={1.05}
																						color1={tone.gradient[0]}
																						color2={tone.accentColor}
																						color3={tone.gradient[1]}
																					/>
																				</View>
																				<View className={webStyles.movementDetailContent}>
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
																									}}
																								>
																									{summaryText}
																								</Text>
																							</VStack>

																							<VStack className="items-end">
																								<Text
																									style={{
																										fontSize: 10,
																										fontWeight: '700',
																										letterSpacing: 0.4,
																										color: 'rgba(255,255,255,0.74)',
																										textTransform: 'uppercase',
																									}}
																								>
																									Valor
																								</Text>
																								<Heading size="sm" style={{ color: '#FFFFFF' }}>
																									{formatCurrencyBRL(expense.displayValueInCents ?? expense.valueInCents)}
																								</Heading>
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
																								{ label: 'Tipo', value: 'Gasto obrigatório' },
																								{ label: 'Vencimento', value: formatConfiguredMonthlyDueLabel(expense.dueDay, expense.usesBusinessDays) },
																								{ label: 'Neste mês', value: formatExpenseResolvedDateLabel(expense) },
																								{ label: 'Tag', value: tagMetadata?.name ?? tagsMap[expense.tagId] ?? 'Sem tag' },
																								{ label: 'Lembrete', value: expense.reminderSummary ?? 'Desativado' },
																								...(expense.installmentLabel ? [{ label: 'Parcelas', value: expense.installmentLabel }] : []),
																								...(expense.installmentLabel ? [{ label: 'Início', value: formatMandatoryInstallmentDateLabel(expense.installmentStartDate ?? null) }] : []),
																								...(expense.installmentLabel ? [{ label: 'Fim', value: formatMandatoryInstallmentDateLabel(expense.installmentEndDate ?? null) }] : []),
																							].map(item => (
																								<View
																									key={`${expense.id}-${item.label}`}
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

																						{expense.description ? (
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
																									{expense.description}
																								</Text>
																							</View>
																						) : null}

																						<HStack className="flex-wrap gap-4" style={{ paddingTop: 2 }}>
																							<TouchableOpacity
																								activeOpacity={0.85}
																								onPress={() => setPendingAction({ type: 'register', expense })}
																								disabled={expense.isPaidForCurrentCycle || expense.isInstallmentComplete}
																								accessibilityRole="button"
																								accessibilityLabel={`Registrar pagamento de ${expense.name}`}
																								style={{
																									flexDirection: 'row',
																									alignItems: 'center',
																									gap: 8,
																									paddingVertical: 8,
																									opacity: expense.isPaidForCurrentCycle || expense.isInstallmentComplete ? 0.45 : 1,
																								}}
																							>
																								<Icon as={AddIcon} size="sm" className="text-white" />
																								<Text className="text-xs font-semibold text-white">Registrar</Text>
																							</TouchableOpacity>

																							<TouchableOpacity
																								activeOpacity={0.85}
																								onPress={() => setPendingAction({ type: 'edit', expense })}
																								accessibilityRole="button"
																								accessibilityLabel={`Editar ${expense.name}`}
																								style={{
																									flexDirection: 'row',
																									alignItems: 'center',
																									gap: 8,
																									paddingVertical: 8,
																								}}
																							>
																								<Icon as={EditIcon} size="sm" className="text-white" />
																								<Text className="text-xs font-semibold text-white">Editar</Text>
																							</TouchableOpacity>

																							{typeof expense.installmentTotal === 'number' && !expense.isInstallmentComplete ? (
																								<TouchableOpacity
																									activeOpacity={0.85}
																									onPress={() => setPendingAction({ type: 'settle', expense })}
																									accessibilityRole="button"
																									accessibilityLabel={`Quitar parcelas restantes de ${expense.name}`}
																									style={{
																										flexDirection: 'row',
																										alignItems: 'center',
																										gap: 8,
																										paddingVertical: 8,
																									}}
																								>
																									<Icon as={CheckCircleIcon} size="sm" className="text-white" />
																									<Text className="text-xs font-semibold text-white">Quitar parcelas</Text>
																								</TouchableOpacity>
																							) : null}

																							{expense.isPaidForCurrentCycle ? (
																								<TouchableOpacity
																									activeOpacity={0.85}
																									onPress={() => setPendingAction({ type: 'reclaim', expense })}
																									accessibilityRole="button"
																									accessibilityLabel={`Desfazer pagamento de ${expense.name}`}
																									style={{
																										flexDirection: 'row',
																										alignItems: 'center',
																										gap: 8,
																										paddingVertical: 8,
																									}}
																								>
																									<Icon as={RepeatIcon} size="sm" className="text-white" />
																									<Text className="text-xs font-semibold text-white">Reivindicar</Text>
																								</TouchableOpacity>
																							) : null}

																							<TouchableOpacity
																								activeOpacity={0.85}
																								onPress={() => setPendingAction({ type: 'delete', expense })}
																								accessibilityRole="button"
																								accessibilityLabel={`Excluir ${expense.name}`}
																								style={{
																									flexDirection: 'row',
																									alignItems: 'center',
																									gap: 8,
																									paddingVertical: 8,
																								}}
																							>
																								<Icon as={TrashIcon} size="sm" className="text-white" />
																								<Text className="text-xs font-semibold text-white">Excluir</Text>
																							</TouchableOpacity>
																						</HStack>
																					</VStack>
																				</View>
																			</View>
																		</AnimatedContent>
																	) : null}
																</View>
															</View>
														);
													})}
												</View>

											</VStack>
										)}
									</VStack>
								)}
							</VStack>
						</ScrollView>
					</View>
				</View>

				<View
					style={{
						marginHorizontal: -18,
						paddingBottom: 0,
						flexShrink: 0,
					}}
				>
					<Navigator defaultValue={1} />
				</View>

				<Modal size="lg" isOpen={isModalOpen} onClose={handleCloseActionModal}>
					<ModalBackdrop />
					<ModalContent className={`web:w-[calc(100%-32px)] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>{actionModalCopy.title}</ModalTitle>
							<ModalCloseButton
								accessibilityLabel={`Fechar ${actionModalCopy.title}`}
								onPress={handleCloseActionModal}
							/>
						</ModalHeader>
						<ModalBody>
							<Text className={bodyText}>{actionModalCopy.message}</Text>
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button
								variant="outline"
								onPress={handleCloseActionModal}
								isDisabled={isActionProcessing}
								className={submitButtonCancelClassName}
							>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button
								variant="solid"
								action={actionModalCopy.action}
								onPress={handleConfirmAction}
								isDisabled={isActionProcessing}
								className={actionConfirmButtonClassName}
							>
								{isActionProcessing ? (
									<>
										<ButtonSpinner color={actionSpinnerColor} />
										<ButtonText className={actionConfirmButtonTextClassName}>Processando</ButtonText>
									</>
								) : (
									<ButtonText className={actionConfirmButtonTextClassName}>
										{actionModalCopy.confirmLabel}
									</ButtonText>
								)}
							</Button>
						</ModalFooter>
					</ModalContent>
				</Modal>
			</View>
		</SafeAreaView>
	);
}
