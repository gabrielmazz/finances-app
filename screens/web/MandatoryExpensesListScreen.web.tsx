import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import MovementFormStatus from '@/components/uiverse/transactions/movement-form-status';
import { useBankMovementsRequest } from '@/hooks/useBankMovementsRequest';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';

import RecurringContracts from '@/components/uiverse/recurring/recurring-contracts';
import RetainedRecurringPlans,{ type RetainedRecurringPlan } from '@/components/uiverse/recurring/retained-recurring-plans';

import { useLocalSearchParams } from 'expo-router';
import { CalendarDays,ChevronDown,ChevronUp } from 'lucide-react';
import React from 'react';
import { Pressable,Text as RNText,RefreshControl,ScrollView,StatusBar,TextInput,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Box } from '@/components/ui/box';
import { Button,ButtonIcon,ButtonSpinner,ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { AddIcon,CheckCircleIcon,DownloadIcon,EditIcon,Icon,RepeatIcon,TrashIcon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
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
import { Skeleton,SkeletonText } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import Navigator from '@/components/uiverse/navigation/navigator';
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';
import AnimatedContent from '@/components/web/motion/AnimatedContent';
import Grainient from '@/components/web/visuals/Grainient';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import {
formatConfiguredMonthlyDueLabel,
formatResolvedMonthDateLabel,
formatResolvedMonthDayLabel
} from '@/utils/businessCalendar';
import {
formatMandatoryInstallmentDateLabel
} from '@/utils/mandatoryInstallments';

// Importação do SVG
import DateCalendar,{ DateCalendarItem } from '@/components/uiverse/recurring/date-calendar';
import MandatoryExpensePaymentBulletChart from '@/components/uiverse/recurring/mandatory-expense-payment-bullet-chart';
import MandatoryExpensesRadarChart from '@/components/uiverse/recurring/mandatory-expenses-radar-chart';
import MandatoryExpensesScatterChart from '@/components/uiverse/recurring/mandatory-expenses-scatter-chart';
import { HIDDEN_VALUE_PLACEHOLDER,useValueVisibility } from '@/contexts/ValueVisibilityContext';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import type { TagIconFamily,TagIconStyle } from '@/hooks/useTagIcons';
import { TagIcon } from '@/hooks/useTagIcons';
import {
buildMandatoryPeriodSummaryPdfHtml,
type MandatoryPeriodSummaryPdfItem,
type MandatoryPeriodSummaryPdfMetric,
} from '@/utils/mandatoryPeriodSummaryPdf';
import { APP_ROUTE_PATHS,navigateToRoute } from '@/utils/navigation';
import { buildPdfFileName } from '@/utils/pdfFileName';
import { exportHtmlReport } from '@/utils/reportExport';
import MandatoryExpensesListIllustration from '../../assets/UnDraw/mandatoryExpensesListScreen.svg';

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
	installmentTotalValueInCents?: number | null;
	installmentsCompleted?: number;
	installmentStartDate?: Date | null;
	installmentEndDate?: Date | null;
	installmentLabel?: string | null;
	remainingInstallments?: number;
	remainingValueInCents?: number | null;
	isInstallmentComplete?: boolean;
	reminderDaysBefore?: 0 | 1 | 2 | 3;
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
	gradient: ['#B45309', '#FACC15'],
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

	const { personId, cancelRequest } = useBankMovementsRequest('mandatory-expense-list');
	const { cancelRequest: cancelActionRequest } = useBankMovementsRequest('mandatory-expense-action');
	const actionLock = React.useRef<object | null>(null);
	React.useEffect(() => () => { actionLock.current = null; }, []);
	const [loadError] = React.useState<string | null>(FEATURE_UNAVAILABLE_MESSAGE);
	const [actionError, setActionError] = React.useState<string | null>(null);
	const [reminderWarning] = React.useState<string | null>(null);
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
	const [isLoading] = React.useState(false);
	const [retainedPlans] = React.useState<RetainedRecurringPlan[]>([]);
	const [isRefreshing] = React.useState(false);
	const [expenses] = React.useState<MandatoryExpenseItem[]>([]);
	const [tagsMap] = React.useState<Record<string, string>>({});
	const [tagMetadataMap] = React.useState<Record<string, TagMetadata>>({});
	const [pendingAction, setPendingAction] = React.useState<PendingExpenseAction | null>(null);
	const [settlementInstallmentCount, setSettlementInstallmentCount] = React.useState('1');
	const [isActionProcessing, setIsActionProcessing] = React.useState(false);
	const { shouldHideValues } = useValueVisibility();
	const [expandedExpenseIds, setExpandedExpenseIds] = React.useState<string[]>([]);
	const [renderedExpenseIds, setRenderedExpenseIds] = React.useState<string[]>([]);
	const [isExportingPdf, setIsExportingPdf] = React.useState(false);
	const [hasLoadedData] = React.useState(false);
	const handledFocusedExpenseIdRef = React.useRef<string | null>(null);

	React.useEffect(() => { actionLock.current = null; setPendingAction(null); setIsActionProcessing(false); setActionError(null); handledFocusedExpenseIdRef.current = null; }, [personId]);

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

	const mandatoryExpensesRadarData = React.useMemo(() => {
		const totalsByCategory = new Map<string, number>();

		expenses.forEach(expense => {
			const category = tagMetadataMap[expense.tagId]?.name ?? tagsMap[expense.tagId] ?? 'Sem categoria';
			const currentTotal = totalsByCategory.get(category) ?? 0;
			const valueInCents = Math.max(0, getMandatoryDisplayValueInCents(expense));
			totalsByCategory.set(category, currentTotal + valueInCents);
		});

		return Array.from(totalsByCategory.entries())
			.sort(([, firstValue], [, secondValue]) => secondValue - firstValue)
			.map(([category, valueInCents]) => ({
				category: category.length > 18 ? `${category.slice(0, 17)}…` : category,
				valueInCents,
			}));
	}, [expenses, tagMetadataMap, tagsMap]);

	const mandatoryExpensesScatterData = React.useMemo(() => {
		const series = new Map<string, { name: string; color: string; data: Array<{ weekday: number; dayOfMonth: number }> }>([
			['pending', { name: 'Pendentes', color: '#F59E0B', data: [] }],
			['completed', { name: 'Pagos/concluídos', color: '#10B981', data: [] }],
		]);

		expenses.forEach(expense => {
			const dueDate = expense.resolvedDueDate ?? null;
			if (!dueDate || Number.isNaN(dueDate.getTime())) {
				return;
			}

			const duePoint = {
				weekday: dueDate.getDay(),
				dayOfMonth: dueDate.getDate(),
			};

			const status = expense.isPaidForCurrentCycle || expense.isInstallmentComplete ? 'completed' : 'pending';
			series.get(status)?.data.push(duePoint);
		});

		return Array.from(series.values());
	}, [expenses]);

	React.useEffect(() => {
		const visibleIds = new Set(expenses.map(expense => expense.id));
		setExpandedExpenseIds(previousState => previousState.filter(id => visibleIds.has(id)));
		setRenderedExpenseIds(previousState => previousState.filter(id => visibleIds.has(id)));
	}, [expenses]);

	const loadData = React.useCallback(async (asRefresh = false) => { showFeatureUnavailable(); }, []);

	const handleRefresh = React.useCallback(async () => {
		await loadData(true);
	}, [loadData]);

	const handleOpenCreate = React.useCallback(() => {
		navigateToRoute(APP_ROUTE_PATHS.addMandatoryExpenses);
	}, []);

	const handleCloseActionModal = React.useCallback(() => {
setPendingAction(null);
}, []);

	const selectedSettlementInstallments = React.useMemo(() => {
		if (pendingAction?.type !== 'settle') {
			return 0;
		}

		const requestedInstallments = Number(settlementInstallmentCount);
		const remainingInstallments = pendingAction.expense.remainingInstallments ?? 0;
		return Number.isInteger(requestedInstallments) && requestedInstallments >= 1 && requestedInstallments <= remainingInstallments
			? requestedInstallments
			: 0;
	}, [pendingAction, settlementInstallmentCount]);

	const selectedSettlementValueInCents = React.useMemo<number | null>(() => null, []);

	const handleConfirmAction = React.useCallback(async () => { showFeatureUnavailable(); }, []);

	const handleExportMonthlySummaryPdf = React.useCallback(async () => {
		if (isExportingPdf || isLoading || loadError || !hasLoadedData) {
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
		loadError, hasLoadedData,
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
			if (action === 'settle') {
				setSettlementInstallmentCount('1');
			}
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
			const isFinalSettlement = selectedSettlementInstallments === (pendingAction.expense.remainingInstallments ?? 0);
			return {
				title: 'Quitar parcelas',
				message: selectedSettlementInstallments > 0 && selectedSettlementValueInCents
					? `Registrar ${selectedSettlementInstallments} parcela(s) de "${expenseName}" em uma única despesa no valor de ${formatCurrencyBRL(selectedSettlementValueInCents)}?${isFinalSettlement ? ' O parcelamento será encerrado após o lançamento.' : ' As demais parcelas continuarão programadas.'}`
					: `Informe de 1 a ${pendingAction.expense.remainingInstallments ?? 0} parcela(s) para quitar.`,
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
	}, [formatCurrencyBRL, pendingAction, selectedSettlementInstallments, selectedSettlementValueInCents]);

	const actionConfirmButtonClassName = React.useMemo(() => {
		if (actionModalCopy.action === 'negative') {
			return isDarkMode ? 'rounded-2xl bg-rose-500' : 'rounded-2xl bg-rose-600';
		}

		if (actionModalCopy.action === 'secondary') {
			return 'rounded-2xl bg-slate-700';
		}

		return submitButtonClassName;
	}, [actionModalCopy.action, isDarkMode, submitButtonClassName]);
	const actionConfirmButtonTextClassName = 'text-white';
	const actionSpinnerColor = '#FFFFFF';

	const isModalOpen = Boolean(pendingAction);
	// As telas Web com sheet sobreposto ocultam os 64 px finais do hero; a lista mantém a mesma altura visual.
	const visibleHeroHeight = heroHeight - 64;

	return (
		<SafeAreaView className="flex-1 web:w-screen" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
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
							className={`${webStyles.sheet} ${cardBackground} web:relative web:z-[3]`}
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
							<VStack className={`${webStyles.contentFrame} ${webStyles.contentPadding} justify-between pb-8`}>

								<MovementFormStatus loading={false} error={loadError} onRetry={handleRefresh} />
{reminderWarning ? <Text className={helperText} accessibilityRole="alert">{reminderWarning}</Text> : null}
<Button variant="outline" onPress={handleRefresh} isDisabled={isLoading || isRefreshing || isActionProcessing || false}><ButtonText>Atualizar despesas recorrentes</ButtonText></Button>
{!isLoading && !loadError && <RetainedRecurringPlans plans={retainedPlans} recurringType="expense" onChanged={async () => { await loadData(); }} />}
								{!isLoading && !loadError && <RecurringContracts recurringType="expense" onChanged={async () => { await loadData(); }} />}
                            {loadError ? null : isLoading ? (
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

												{monthlySummary.totalReferenceInCents > 0 ? (
													<View className={`${compactCardClassName} px-4 py-4`}>
														<VStack className="gap-3">
															<MandatoryExpensePaymentBulletChart
																valueInCents={shouldHideValues ? 0 : monthlySummary.paidTotalInCents}
																targetInCents={shouldHideValues ? 1 : monthlySummary.totalReferenceInCents}
																isDarkMode={isDarkMode}
																shouldHideValues={shouldHideValues}
															/>
														</VStack>
													</View>
												) : null}

												{expenses.length > 0 ? (
													<HStack className="gap-4 web:flex-row web:flex-wrap">
														<View className={`${compactCardClassName} min-w-0 flex-1 px-4 py-4 w-full md:w-[calc(50%-8px)] md:min-w-0`}>
															<VStack className="gap-2">
																<VStack className="gap-1">
																	<Text
																		className="text-slate-500 dark:text-slate-400 uppercase mt-1"
																		style={{ color: monthlySummaryPalette.subtitle }}
																	>
																		Gastos por categoria
																	</Text>
																</VStack>
																<View style={{ height: 300 }}>
																	<MandatoryExpensesRadarChart
																		data={mandatoryExpensesRadarData}
																		isDarkMode={isDarkMode}
																		shouldHideValues={shouldHideValues}
																		dom={{ focusable: false, scrollEnabled: false, style: { height: 300, backgroundColor: 'transparent' } }}
																	/>
																</View>
															</VStack>
														</View>

														<View className={`${compactCardClassName} min-w-0 flex-1 px-4 py-4 w-full md:w-[calc(50%-8px)] md:min-w-0`}>
															<VStack className="gap-2">
																<VStack className="gap-1">
																	<Text
																		className="text-slate-500 dark:text-slate-400 uppercase mt-1"
																		style={{ color: monthlySummaryPalette.subtitle }}
																	>
																		Dias de vencimento
																	</Text>
																</VStack>
																<View style={{ height: 320 }}>
																	<MandatoryExpensesScatterChart
																		data={mandatoryExpensesScatterData}
																		isDarkMode={isDarkMode}
																		dom={{ focusable: false, scrollEnabled: false, style: { height: 320, backgroundColor: 'transparent' } }}
																	/>
																</View>
															</VStack>
														</View>
													</HStack>
												) : null}

											</VStack>
										</View>

										<HStack className="gap-3">
											<Button
												className={`${submitButtonClassName} flex-1`}
												onPress={() => {
													void handleExportMonthlySummaryPdf();
												}}
												isDisabled={isLoading || isExportingPdf || Boolean(loadError) || !hasLoadedData}
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
														const tagLabel = tagMetadata?.name ?? tagsMap[expense.tagId] ?? 'Tag não encontrada';
														const isExpenseCompleted = expense.isPaidForCurrentCycle || expense.isInstallmentComplete;

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
																		className={`${webStyles.movementHeader} min-h-[52px] cursor-pointer rounded-2xl py-1 focus-visible:ring-2 focus-visible:ring-yellow-300`}
																	>
																		<View className={webStyles.movementIdentity}>
																			<View
																				className={`${webStyles.movementIcon} border border-white/10`}
																				style={{ backgroundColor: tone.gradient[0] }}
																			>
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
																					{tagLabel}
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
																			<RNText
																				className={`${webStyles.amount} tabular-nums`}
																				style={{ color: tone.amountColor }}
																			>
																				{formatCurrencyBRL(expense.displayValueInCents ?? expense.valueInCents)}
																			</RNText>
																			<View className={webStyles.movementDate}>
																				<CalendarDays size={12} color="#94A3B8" />
																				<RNText numberOfLines={1} className={webStyles.dateText}>
																					{formatExpenseScheduleLabel(expense)}
																				</RNText>
																				{isExpanded ? (
																					<ChevronUp size={14} color="#94A3B8" />
																				) : (
																					<ChevronDown size={14} color="#94A3B8" />
																				)}
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
																				<View
																					pointerEvents="none"
																					className={webStyles.movementDetailGrainient}
																				>
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
																					<RNText className={webStyles.detailLabel}>RESUMO</RNText>
																					<RNText className={webStyles.detailText}>{summaryText}</RNText>
																					<View className={webStyles.detailGrid}>
																						{[
																							{ label: 'Tipo', value: 'Gasto obrigatório' },
																							{ label: 'Vencimento', value: formatConfiguredMonthlyDueLabel(expense.dueDay, expense.usesBusinessDays) },
																							{ label: 'Neste mês', value: formatExpenseResolvedDateLabel(expense) },
																							{ label: 'Tag', value: tagLabel },
																							{ label: 'Lembrete', value: expense.reminderSummary ?? 'Desativado' },
																							...(expense.installmentLabel
																								? [{ label: 'Parcelas', value: expense.installmentLabel }]
																								: []),
																							...(expense.installmentLabel
																								? [{ label: 'Início', value: formatMandatoryInstallmentDateLabel(expense.installmentStartDate ?? null) }]
																								: []),
																							...(expense.installmentLabel
																								? [{ label: 'Fim', value: formatMandatoryInstallmentDateLabel(expense.installmentEndDate ?? null) }]
																								: []),
																						].map(detail => (
																							<View key={`${expense.id}-${detail.label}`} className={webStyles.detailItem}>
																								<RNText className={webStyles.detailLabel}>{detail.label}</RNText>
																								<RNText className={webStyles.detailText}>{detail.value}</RNText>
																							</View>
																						))}
																					</View>

																					{expense.description ? (
																						<View className="mt-3">
																							<RNText className={webStyles.detailLabel}>DESCRIÇÃO</RNText>
																							<RNText className={webStyles.detailText}>{expense.description}</RNText>
																						</View>
																					) : null}

																					<View className="mt-3 flex-row flex-wrap gap-4">
																						<Pressable
																							onPress={() => setPendingAction({ type: 'register', expense })}
																							disabled={isExpenseCompleted}
																							accessibilityRole="button"
																							accessibilityLabel={`Registrar pagamento de ${expense.name}`}
																							className="min-h-touch flex-row items-center gap-2 rounded-xl px-2 text-white focus-visible:ring-2 focus-visible:ring-yellow-300"
																							style={{ opacity: isExpenseCompleted ? 0.45 : 1 }}
																						>
																							<Icon as={AddIcon} size="sm" className="text-white" />
																							<RNText className="text-xs font-semibold text-white">Registrar</RNText>
																						</Pressable>

																						<Pressable
																							onPress={() => setPendingAction({ type: 'edit', expense })}
																							accessibilityRole="button"
																							accessibilityLabel={`Editar ${expense.name}`}
																							className="min-h-touch flex-row items-center gap-2 rounded-xl px-2 text-white focus-visible:ring-2 focus-visible:ring-yellow-300"
																						>
																							<Icon as={EditIcon} size="sm" className="text-white" />
																							<RNText className="text-xs font-semibold text-white">Editar</RNText>
																						</Pressable>

																						{typeof expense.installmentTotal === 'number' && !expense.isInstallmentComplete ? (
																							<Pressable
																								onPress={() => handleCalendarAction('settle', expense)}
																								accessibilityRole="button"
																								accessibilityLabel={`Quitar parcelas restantes de ${expense.name}`}
																								className="min-h-touch flex-row items-center gap-2 rounded-xl px-2 text-white focus-visible:ring-2 focus-visible:ring-yellow-300"
																							>
																								<Icon as={CheckCircleIcon} size="sm" className="text-white" />
																								<RNText className="text-xs font-semibold text-white">Quitar parcelas</RNText>
																							</Pressable>
																						) : null}

																						{expense.isPaidForCurrentCycle ? (
																							<Pressable
																								onPress={() => setPendingAction({ type: 'reclaim', expense })}
																								accessibilityRole="button"
																								accessibilityLabel={`Desfazer pagamento de ${expense.name}`}
																								className="min-h-touch flex-row items-center gap-2 rounded-xl px-2 text-white focus-visible:ring-2 focus-visible:ring-yellow-300"
																							>
																								<Icon as={RepeatIcon} size="sm" className="text-white" />
																								<RNText className="text-xs font-semibold text-white">Reivindicar</RNText>
																							</Pressable>
																						) : null}

																						<Pressable
																							onPress={() => setPendingAction({ type: 'delete', expense })}
																							accessibilityRole="button"
																							accessibilityLabel={`Excluir ${expense.name}`}
																							className="min-h-touch flex-row items-center gap-2 rounded-xl px-2 text-white focus-visible:ring-2 focus-visible:ring-white/80"
																						>
																							<Icon as={TrashIcon} size="sm" className="text-white" />
																							<RNText className="text-xs font-semibold text-white">Excluir</RNText>
																						</Pressable>
																					</View>
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
						marginHorizontal: 0,
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
{actionError ? <Text className="text-error-600 dark:text-error-400" accessibilityRole="alert">{actionError}</Text> : null}
{null}
							{pendingAction?.type === 'settle' ? (
								<VStack className="mt-4 gap-2">
									<Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">Quantidade de parcelas</Text>
									<TextInput
										value={settlementInstallmentCount}
										onChangeText={value => setSettlementInstallmentCount(value.replace(/\D/g, '').slice(0, 3))}
										keyboardType="number-pad"
										accessibilityLabel="Quantidade de parcelas a quitar"
										className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
									/>
									<Text className={helperText}>
										Restam {pendingAction.expense.remainingInstallments ?? 0} parcela(s).
									</Text>
								</VStack>
							) : null}
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
								isDisabled={isActionProcessing || (pendingAction?.type === 'settle' && (!selectedSettlementValueInCents || selectedSettlementInstallments <= 0))}
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
