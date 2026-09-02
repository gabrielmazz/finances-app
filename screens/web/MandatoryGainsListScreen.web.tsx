import React from 'react';
import { Pressable, RefreshControl, ScrollView, View, StatusBar, Text as RNText } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';

import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import { AddIcon, DownloadIcon, EditIcon, RepeatIcon, TrashIcon, Icon } from '@/components/ui/icon';
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
import Navigator from '@/components/uiverse/navigation/navigator';
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';
import AnimatedContent from '@/components/web/motion/AnimatedContent';
import Grainient from '@/components/web/visuals/Grainient';

import { auth } from '@/FirebaseConfig';
import {
	clearMandatoryGainReceiptFirebase,
	deleteMandatoryGainFirebase,
	getMandatoryGainsWithRelationsFirebase,
} from '@/functions/MandatoryGainFirebase';
import { getAllTagsFirebase } from '@/functions/TagFirebase';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import {
	cancelMandatoryGainNotification,
	syncMandatoryGainNotifications,
} from '@/utils/mandatoryGainNotifications';
import { isMandatoryReminderConfigured } from '@/utils/mandatoryReminderConfig';
import { buildMandatoryGainReminderSyncItems } from '@/utils/mandatoryReminderAccountSync';
import { APP_ROUTE_PATHS, navigateToRoute } from '@/utils/navigation';
import { isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import { deleteGainFirebase } from '@/functions/GainFirebase';
import {
	formatConfiguredMonthlyDueLabel,
	formatResolvedMonthDateLabel,
	formatResolvedMonthDayLabel,
	resolveMonthlyOccurrence,
} from '@/utils/businessCalendar';
import {
	formatMandatoryInstallmentDateLabel,
	formatMandatoryInstallmentLabel,
	isMandatoryInstallmentPlanComplete,
	normalizeMandatoryInstallmentDate,
	normalizeMandatoryInstallmentTotal,
	normalizeMandatoryInstallmentsCompleted,
	resolveMandatoryInstallmentsCompleted,
} from '@/utils/mandatoryInstallments';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';

import MandatoryGainListIllustration from '../../assets/UnDraw/mandatoryGainsListScreen.svg';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';
import DateCalendar, { DateCalendarItem } from '@/components/uiverse/recurring/date-calendar';
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
import MandatoryExpensePaymentBulletChart from '@/components/uiverse/recurring/mandatory-expense-payment-bullet-chart';
import MandatoryExpensesRadarChart from '@/components/uiverse/recurring/mandatory-expenses-radar-chart';
import MandatoryExpensesScatterChart from '@/components/uiverse/recurring/mandatory-expenses-scatter-chart';

type MandatoryGainItem = DateCalendarItem & {
	usesBusinessDays?: boolean;
	resolvedDueDate?: Date | null;
	holidayName?: string | null;
	lastReceiptGainId?: string | null;
	lastReceiptCycle?: string | null;
	lastReceiptDate?: Date | null;
	lastReceiptValueInCents?: number | null;
	isReceivedForCurrentCycle?: boolean;
	installmentTotal?: number | null;
	installmentsCompleted?: number;
	installmentStartDate?: Date | null;
	installmentEndDate?: Date | null;
	installmentLabel?: string | null;
	isInstallmentComplete?: boolean;
};

type PendingGainAction =
	| { type: 'register'; gain: MandatoryGainItem }
	| { type: 'edit'; gain: MandatoryGainItem }
	| { type: 'delete'; gain: MandatoryGainItem }
	| { type: 'reclaim'; gain: MandatoryGainItem };

type TagMetadata = {
	name: string;
	iconFamily?: TagIconFamily | null;
	iconName?: string | null;
	iconStyle?: TagIconStyle | null;
};

type MandatoryItemTone = {
	accentColor: string;
	amountColor: string;
	lineColor: string;
	gradient: [string, string];
};

const MANDATORY_GAIN_PENDING_TONE: MandatoryItemTone = {
	accentColor: '#0EA5E9',
	amountColor: '#0EA5E9',
	lineColor: 'rgba(14, 165, 233, 0.3)',
	gradient: ['#075985', '#38BDF8'],
};

const MANDATORY_GAIN_COMPLETED_TONE: MandatoryItemTone = {
	accentColor: '#10B981',
	amountColor: '#10B981',
	lineColor: 'rgba(16, 185, 129, 0.28)',
	gradient: ['#047857', '#34D399'],
};

const formatCurrencyBRLBase = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(valueInCents / 100);

const getDueDayColorClass = (dueDay: number, isReceivedForCurrentCycle?: boolean) => {
	const today = new Date().getDate();
	const difference = dueDay - today;

	if (isReceivedForCurrentCycle) {
		return 'text-emerald-600 dark:text-emerald-400';
	}

	if (difference < 0) {
		return 'text-red-600 dark:text-red-400';
	}

	if (difference <= 3) {
		return 'text-emerald-600 dark:text-emerald-400';
	}

	if (difference <= 7) {
		return 'text-yellow-600 dark:text-yellow-400';
	}

	return 'text-gray-600 dark:text-gray-300';
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

const formatReceiptDate = (value: Date | null) => {
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

const formatGainScheduleLabel = (gain: MandatoryGainItem) => {
	const configuredLabel = formatConfiguredMonthlyDueLabel(gain.dueDay, gain.usesBusinessDays);
	const resolvedDate = gain.resolvedDueDate ?? null;

	if (!resolvedDate) {
		return configuredLabel;
	}

	if (gain.usesBusinessDays) {
		return `${configuredLabel} • ${formatResolvedMonthDayLabel(resolvedDate)}`;
	}

	return configuredLabel;
};

const formatGainResolvedDateLabel = (gain: MandatoryGainItem) => {
	const resolvedDate = gain.resolvedDueDate ?? null;
	if (!resolvedDate) {
		return 'data não disponível';
	}

	const holidaySuffix = gain.holidayName ? ` • ${gain.holidayName}` : '';
	return `${formatResolvedMonthDateLabel(resolvedDate)}${holidaySuffix}`;
};

function MandatoryGainsTimelineSkeleton({
	compactCardClassName,
	skeletonBaseColor,
	skeletonHighlightColor,
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
				<HStack key={`mandatory-gain-skeleton-${index}`} className="items-start gap-3">
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

export default function MandatoryGainsListScreen() {
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
	const [isLoading, setIsLoading] = React.useState(false);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [gains, setGains] = React.useState<MandatoryGainItem[]>([]);
	const [tagsMap, setTagsMap] = React.useState<Record<string, string>>({});
	const [tagMetadataMap, setTagMetadataMap] = React.useState<Record<string, TagMetadata>>({});
	const [pendingAction, setPendingAction] = React.useState<PendingGainAction | null>(null);
	const [isActionProcessing, setIsActionProcessing] = React.useState(false);
	const { shouldHideValues } = useValueVisibility();
	const [expandedGainIds, setExpandedGainIds] = React.useState<string[]>([]);
	const [renderedGainIds, setRenderedGainIds] = React.useState<string[]>([]);
	const [isExportingPdf, setIsExportingPdf] = React.useState(false);

	const formatCurrencyBRL = React.useCallback(
		(valueInCents: number) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}
			return formatCurrencyBRLBase(valueInCents);
		},
		[shouldHideValues],
	);

	const calendarGains = React.useMemo(
		() =>
			gains.map(gain => ({
				...gain,
				// A quitação antecipada é exclusiva de despesas; ganhos não expõem essa ação.
				installmentTotal: null,
				isCompletedForCurrentCycle: gain.isReceivedForCurrentCycle || gain.isInstallmentComplete,
				canReclaimCurrentCycle: gain.isReceivedForCurrentCycle,
				lastStatusDate: gain.lastReceiptDate ?? null,
			})),
		[gains],
	);

	const getGainStatusText = React.useCallback(
		(gain: DateCalendarItem & { lastStatusDate?: Date | null; isCompletedForCurrentCycle?: boolean }) => {
			if ((gain as MandatoryGainItem).isInstallmentComplete) {
				return 'Parcelamento concluído.';
			}
			if (gain.isCompletedForCurrentCycle) {
				return `Recebido em ${formatReceiptDate(gain.lastStatusDate ?? null)}.`;
			}
			const installmentLabel = (gain as MandatoryGainItem).installmentLabel;
			return installmentLabel
				? `Aguardando registro da ${installmentLabel.toLowerCase()} como ganho neste mês.`
				: 'Aguardando registro como ganho neste mês.';
		},
		[],
	);

	const getGainStatusClassName = React.useCallback(
		(gain: DateCalendarItem & { isCompletedForCurrentCycle?: boolean }) =>
			gain.isCompletedForCurrentCycle ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400',
		[],
	);

	const monthlySummaryPalette = React.useMemo(
		() => ({
			title: isDarkMode ? '#F8FAFC' : '#0F172A',
			subtitle: isDarkMode ? '#94A3B8' : '#64748B',
			border: isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(226, 232, 240, 1)',
			gainText: '#10B981',
			pendingText: '#0EA5E9',
			cardBaseColor: '#047857',
			cardGlowColor: 'rgba(16, 185, 129, 0.38)',
			cardHighlightColor: 'rgba(103, 232, 249, 0.42)',
		}),
		[isDarkMode],
	);

	const referenceMonthLabel = React.useMemo(() => formatReferenceMonthLabel(new Date()), []);

	const monthlySummary = React.useMemo(() => {
		// Resumo mensal segue a chave de ciclo documentada em [[Receitas Fixas]].
		const receivedItems = gains.filter(gain => gain.isReceivedForCurrentCycle);
		const pendingItems = gains.filter(gain => !gain.isReceivedForCurrentCycle && !gain.isInstallmentComplete);
		const completedPlanItems = gains.filter(gain => gain.isInstallmentComplete && !gain.isReceivedForCurrentCycle);
		const totalReferenceInCents = [...receivedItems, ...pendingItems].reduce(
			(total, gain) => total + getMandatoryDisplayValueInCents(gain),
			0,
		);
		const receivedTotalInCents = receivedItems.reduce(
			(total, gain) => total + getMandatoryDisplayValueInCents(gain),
			0,
		);
		const pendingTotalInCents = pendingItems.reduce(
			(total, gain) => total + getMandatoryDisplayValueInCents(gain),
			0,
		);

		return {
			receivedItems,
			pendingItems,
			completedPlanItems,
			totalReferenceInCents,
			receivedTotalInCents,
			pendingTotalInCents,
		};
	}, [gains]);

	const mandatoryGainsRadarData = React.useMemo(() => {
		const totalsByCategory = new Map<string, number>();

		gains.forEach(gain => {
			const category = tagMetadataMap[gain.tagId]?.name ?? tagsMap[gain.tagId] ?? 'Sem categoria';
			const currentTotal = totalsByCategory.get(category) ?? 0;
			const valueInCents = Math.max(0, getMandatoryDisplayValueInCents(gain));
			totalsByCategory.set(category, currentTotal + valueInCents);
		});

		return Array.from(totalsByCategory.entries())
			.sort(([, firstValue], [, secondValue]) => secondValue - firstValue)
			.map(([category, valueInCents]) => ({
				category: category.length > 18 ? `${category.slice(0, 17)}…` : category,
				valueInCents,
			}));
	}, [gains, tagMetadataMap, tagsMap]);

	const mandatoryGainsScatterData = React.useMemo(() => {
		const series = new Map<string, { name: string; color: string; data: Array<{ weekday: number; dayOfMonth: number }> }>([
			['pending', { name: 'Pendentes', color: '#F59E0B', data: [] }],
			['completed', { name: 'Recebidos/concluídos', color: '#10B981', data: [] }],
		]);

		gains.forEach(gain => {
			const dueDate = gain.resolvedDueDate ?? null;
			if (!dueDate || Number.isNaN(dueDate.getTime())) {
				return;
			}

			const status = gain.isReceivedForCurrentCycle || gain.isInstallmentComplete ? 'completed' : 'pending';
			series.get(status)?.data.push({
				weekday: dueDate.getDay(),
				dayOfMonth: dueDate.getDate(),
			});
		});

		return Array.from(series.values());
	}, [gains]);

	React.useEffect(() => {
		const visibleIds = new Set(gains.map(gain => gain.id));
		setExpandedGainIds(previousState => previousState.filter(id => visibleIds.has(id)));
		setRenderedGainIds(previousState => previousState.filter(id => visibleIds.has(id)));
	}, [gains]);

	const getGainDueDayColorClass = React.useCallback(
		(dueDay: number, gain?: DateCalendarItem) =>
			getDueDayColorClass(dueDay, (gain as MandatoryGainItem | undefined)?.isCompletedForCurrentCycle),
		[],
	);

	const loadData = React.useCallback(
		async (asRefresh = false) => {
			const currentUser = auth.currentUser;
			if (!currentUser) {
				showNotifierAlert({
					description: 'Usuário não autenticado. Faça login novamente.',
					type: 'error',
					isDarkMode,
				});
				return;
			}

			if (asRefresh) {
				setIsRefreshing(true);
			} else {
				setIsLoading(true);
			}

			try {
				// Ganhos obrigatórios usam lastReceipt* e o loader de ganhos; não reutilizar o fluxo lastPayment* de despesas.
				const [gainsResult, tagsResult, relatedUsersResult] = await Promise.all([
					getMandatoryGainsWithRelationsFirebase(currentUser.uid),
					getAllTagsFirebase(),
					getRelatedUsersIDsFirebase(currentUser.uid),
				]);

				if (!gainsResult.success || !Array.isArray(gainsResult.data)) {
					throw new Error('Erro ao obter os ganhos obrigatórios.');
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
									iconFamily: typeof tag['iconFamily'] === 'string' ? (tag['iconFamily'] as TagIconFamily) : null,
									iconName: typeof tag['iconName'] === 'string' ? tag['iconName'] : null,
									iconStyle: typeof tag['iconStyle'] === 'string' ? (tag['iconStyle'] as TagIconStyle) : null,
								};
							}
						});
				}

				const referenceDate = new Date();
				const formattedGains: MandatoryGainItem[] = gainsResult.data.map((gain: any) => {
					const dueDay = typeof gain?.dueDay === 'number' ? gain.dueDay : 1;
					const usesBusinessDays = gain?.usesBusinessDays === true;
					const installmentTotal = normalizeMandatoryInstallmentTotal(gain?.installmentTotal);
					const installmentsCompleted = normalizeMandatoryInstallmentsCompleted(
						gain?.installmentsCompleted,
						installmentTotal,
					);
					const installmentStartDate = normalizeMandatoryInstallmentDate(gain?.installmentStartDate);
					const installmentEndDate = normalizeMandatoryInstallmentDate(gain?.installmentEndDate);
					const resolvedOccurrence = resolveMonthlyOccurrence({
						referenceDate,
						dueDay,
						usesBusinessDays,
					});

					return {
						id: gain.id,
						name: typeof gain?.name === 'string' ? gain.name : 'Ganho sem nome',
						valueInCents: typeof gain?.valueInCents === 'number' ? gain.valueInCents : 0,
						dueDay,
						usesBusinessDays,
						resolvedDueDate: resolvedOccurrence.date,
						holidayName: resolvedOccurrence.holiday?.name ?? null,
						tagId: typeof gain?.tagId === 'string' ? gain.tagId : '',
						description: typeof gain?.description === 'string' ? gain.description : null,
						reminderEnabled: isMandatoryReminderConfigured(gain),
						lastReceiptGainId: typeof gain?.lastReceiptGainId === 'string' ? gain.lastReceiptGainId : null,
						lastReceiptCycle: typeof gain?.lastReceiptCycle === 'string' ? gain.lastReceiptCycle : null,
						lastReceiptDate: normalizeDateValue(gain?.lastReceiptDate ?? null),
						lastReceiptValueInCents:
							typeof gain?.lastReceiptValueInCents === 'number' ? gain.lastReceiptValueInCents : null,
						installmentTotal,
						installmentsCompleted,
						installmentStartDate,
						installmentEndDate,
					};
				});

				const gainsWithStatus = formattedGains.map(gain => {
					const isReceivedForCurrentCycle = isCycleKeyCurrent(gain.lastReceiptCycle ?? undefined);
					const resolvedInstallmentsCompleted = resolveMandatoryInstallmentsCompleted({
						storedCompleted: gain.installmentsCompleted ?? 0,
						installmentTotal: gain.installmentTotal ?? null,
						startDate: gain.installmentStartDate ?? null,
						isCurrentCycleCompleted: isReceivedForCurrentCycle,
						referenceDate,
					});
					const isInstallmentComplete = isMandatoryInstallmentPlanComplete(
						gain.installmentTotal ?? null,
						resolvedInstallmentsCompleted,
					);
					const installmentLabel = formatMandatoryInstallmentLabel(
						gain.installmentTotal ?? null,
						resolvedInstallmentsCompleted,
						isReceivedForCurrentCycle,
					);
					const displayValueInCents =
						isReceivedForCurrentCycle &&
						typeof gain.lastReceiptValueInCents === 'number' &&
						!Number.isNaN(gain.lastReceiptValueInCents)
							? gain.lastReceiptValueInCents
							: gain.valueInCents;

					return {
						...gain,
						installmentsCompleted: resolvedInstallmentsCompleted,
						isReceivedForCurrentCycle,
						isInstallmentComplete,
						installmentLabel,
						displayValueInCents,
					};
				});

				if (auth.currentUser?.uid !== currentUser.uid) {
					return;
				}
				setTagsMap(tagsRecord);
				setTagMetadataMap(tagMetadataRecord);
				setGains(gainsWithStatus);
				await syncMandatoryGainNotifications(
					currentUser.uid,
					buildMandatoryGainReminderSyncItems(gainsResult.data, referenceDate),
				);
			} catch (error) {
				console.error('Erro ao carregar ganhos obrigatórios:', error);
				showNotifierAlert({
					description: 'Não foi possível carregar os ganhos obrigatórios.',
					type: 'error',
					isDarkMode,
				});
			} finally {
				setIsLoading(false);
				setIsRefreshing(false);
			}
		},
		[isDarkMode],
	);

	const handleRefresh = React.useCallback(async () => {
		await loadData(true);
	}, [loadData]);

	useFocusEffect(
		React.useCallback(() => {
			void loadData();
			return () => undefined;
		}, [loadData]),
	);

	const handleOpenCreate = React.useCallback(() => {
		navigateToRoute(APP_ROUTE_PATHS.addMandatoryGains);
	}, []);

	const handleEdit = React.useCallback((gainTemplateId: string) => {
		navigateToRoute(APP_ROUTE_PATHS.addMandatoryGains, { gainTemplateId });
	}, []);

	const handleRegisterGain = React.useCallback(
		(gain: MandatoryGainItem) => {
			if (gain.isReceivedForCurrentCycle) {
				showNotifierAlert({
					description: 'Este ganho já foi registrado como recebido neste mês.',
					type: 'warn',
					isDarkMode,
				});
				return;
			}

			if (gain.isInstallmentComplete) {
				showNotifierAlert({
					description: 'Todas as parcelas deste ganho obrigatório já foram registradas.',
					type: 'warn',
					isDarkMode,
				});
				return;
			}

			navigateToRoute(APP_ROUTE_PATHS.addRegisterGain, {
				templateName: encodeURIComponent(gain.name),
				templateValueInCents: String(gain.valueInCents),
				templateTagId: gain.tagId,
				templateDueDay: String(gain.dueDay),
				templateUsesBusinessDays: gain.usesBusinessDays ? '1' : undefined,
				templateDescription: gain.description ? encodeURIComponent(gain.description) : undefined,
				templateMandatoryGainId: gain.id,
				templateTagName: tagMetadataMap[gain.tagId]?.name
					? encodeURIComponent(tagMetadataMap[gain.tagId].name)
					: undefined,
				templateTagIconFamily: tagMetadataMap[gain.tagId]?.iconFamily
					? encodeURIComponent(tagMetadataMap[gain.tagId].iconFamily as string)
					: undefined,
				templateTagIconName: tagMetadataMap[gain.tagId]?.iconName
					? encodeURIComponent(tagMetadataMap[gain.tagId].iconName as string)
					: undefined,
				templateTagIconStyle: tagMetadataMap[gain.tagId]?.iconStyle
					? encodeURIComponent(tagMetadataMap[gain.tagId].iconStyle as string)
					: undefined,
			});
		},
		[isDarkMode, tagMetadataMap],
	);

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
			handleRegisterGain(pendingAction.gain);
			setPendingAction(null);
			return;
		}

		if (pendingAction.type === 'edit') {
			handleEdit(pendingAction.gain.id);
			setPendingAction(null);
			return;
		}

		setIsActionProcessing(true);
		try {
			if (pendingAction.type === 'delete') {
				const accountId = auth.currentUser?.uid;
				if (!accountId) {
					showNotifierAlert({
						description: 'Usuário não autenticado. Faça login novamente.',
						type: 'error',
						isDarkMode,
					});
					return;
				}

				const result = await deleteMandatoryGainFirebase(pendingAction.gain.id);
				if (result.success) {
					let reminderCleanupFailed = false;
					try {
						await cancelMandatoryGainNotification(accountId, pendingAction.gain.id);
					} catch (notificationError) {
						reminderCleanupFailed = true;
						console.error('Erro ao remover a agenda do ganho obrigatório excluído:', notificationError);
					}
					showNotifierAlert({
						description: reminderCleanupFailed
							? 'Ganho removido, mas a agenda local será limpa na próxima reconciliação.'
							: 'Ganho obrigatório removido com sucesso.',
						type: reminderCleanupFailed ? 'warn' : 'success',
						isDarkMode,
					});
					await loadData();
				} else {
					showNotifierAlert({
						description: 'Não foi possível remover o ganho obrigatório.',
						type: 'error',
						isDarkMode,
					});
				}
				return;
			}

			if (pendingAction.type === 'reclaim') {
				const linkedGainId = pendingAction.gain.lastReceiptGainId;

				if (linkedGainId) {
					const deleteResult = await deleteGainFirebase(linkedGainId);
					if (!deleteResult.success) {
						showNotifierAlert({
							description: 'Não foi possível remover o ganho registrado.',
							type: 'error',
							isDarkMode,
						});
						return;
					}
				}

				const clearResult = await clearMandatoryGainReceiptFirebase(pendingAction.gain.id);
				if (!clearResult.success) {
					showNotifierAlert({
						description: 'Não foi possível reivindicar o recebimento.',
						type: 'error',
						isDarkMode,
					});
					return;
				}

				showNotifierAlert({
					description: 'Recebimento reivindicado. Registre novamente quando necessário.',
					type: 'success',
					isDarkMode,
				});
				await loadData();
			}
		} catch (error) {
			console.error('Erro ao processar ação do ganho obrigatório:', error);
			showNotifierAlert({
				description: 'Erro inesperado ao processar a ação selecionada.',
				type: 'error',
				isDarkMode,
			});
		} finally {
			setIsActionProcessing(false);
			setPendingAction(null);
		}
	}, [handleEdit, handleRegisterGain, isDarkMode, loadData, pendingAction]);

	const handleExportMonthlySummaryPdf = React.useCallback(async () => {
		if (isExportingPdf || isLoading) {
			return;
		}

		const generatedAtLabel = formatGeneratedAtLabel(new Date());
		const metrics: MandatoryPeriodSummaryPdfMetric[] = [
			{
				label: 'Total do mês',
				value: formatCurrencyBRL(monthlySummary.totalReferenceInCents),
				helper: 'Recebidos do ciclo atual somados aos pendentes previstos.',
				tone: 'gain',
			},
			{
				label: 'Recebido',
				value: formatCurrencyBRL(monthlySummary.receivedTotalInCents),
				helper: `${monthlySummary.receivedItems.length} item(ns) recebido(s).`,
				tone: 'gain',
			},
			{
				label: 'Pendente',
				value: formatCurrencyBRL(monthlySummary.pendingTotalInCents),
				helper: `${monthlySummary.pendingItems.length} item(ns) aguardando registro.`,
				tone: 'neutral',
			},
			{
				label: 'Itens do ciclo',
				value: String(monthlySummary.receivedItems.length + monthlySummary.pendingItems.length),
				helper: 'Receitas recebidas ou ainda pendentes neste mês.',
			},
			{
				label: 'Parcelamentos concluídos',
				value: String(monthlySummary.completedPlanItems.length),
				helper: 'Itens finitos já encerrados antes deste ciclo.',
			},
			{
				label: 'Cadastros totais',
				value: String(gains.length),
				helper: 'Todos os ganhos obrigatórios carregados na tela.',
			},
		];

		const pdfItems: MandatoryPeriodSummaryPdfItem[] = gains.map(gain => {
			const isCycleReceived = gain.isReceivedForCurrentCycle === true;
			const isCompletedBeforeCycle = gain.isInstallmentComplete === true && !isCycleReceived;
			const statusLabel = isCompletedBeforeCycle
				? 'Parcelamento concluído'
				: isCycleReceived
					? 'Recebido no mês'
					: 'Pendente no mês';
			const description = gain.description?.trim()
				? gain.description.trim()
				: isCompletedBeforeCycle
					? 'Este ganho obrigatório parcelado já foi concluído.'
					: isCycleReceived
						? `Recebido em ${formatReceiptDate(gain.lastReceiptDate ?? null)}.`
						: 'Aguardando registro como ganho neste mês.';

			return {
				id: gain.id,
				name: gain.name,
				statusLabel,
				dateLabel: formatGainResolvedDateLabel(gain),
				tagLabel: tagMetadataMap[gain.tagId]?.name ?? tagsMap[gain.tagId] ?? 'Sem tag',
				scheduleLabel: formatGainScheduleLabel(gain),
				description,
				amountLabel: isCompletedBeforeCycle
					? 'Fora do ciclo'
					: formatCurrencyBRL(getMandatoryDisplayValueInCents(gain)),
				amountTone: isCompletedBeforeCycle ? 'neutral' : 'gain',
			};
		});

		const pdfHtml = buildMandatoryPeriodSummaryPdfHtml({
			reportKindLabel: 'Receitas fixas',
			title: 'Resumo de ganhos obrigatórios',
			monthLabel: referenceMonthLabel,
			generatedAtLabel,
			primaryMetricLabel: 'Total do mês',
			primaryMetricValue: formatCurrencyBRL(monthlySummary.totalReferenceInCents),
			primaryMetricHelper: `${monthlySummary.receivedItems.length} recebidos · ${monthlySummary.pendingItems.length} pendentes`,
			metrics,
			items: pdfItems,
			cardBaseColor: monthlySummaryPalette.cardBaseColor,
			cardGlowColor: monthlySummaryPalette.cardGlowColor,
			cardHighlightColor: monthlySummaryPalette.cardHighlightColor,
			emptyStateLabel: 'Nenhum ganho obrigatório foi cadastrado para o mês.',
			privacyNotice: shouldHideValues
				? 'Os valores foram ocultados porque a preferência de privacidade está ativa.'
				: null,
		});

		setIsExportingPdf(true);
		try {
			// Exporta o resumo mensal seguindo [[Receitas Fixas]] e [[Privacidade de Valores]].
			const pdfFileName = buildPdfFileName(['Receitas Fixas', referenceMonthLabel]);
			const exportResult = await exportHtmlReport({
				html: pdfHtml,
				fileName: pdfFileName,
				dialogTitle: 'Baixar resumo de ganhos obrigatórios',
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
			console.error('Erro ao gerar resumo mensal de ganhos obrigatórios:', error);
			showNotifierAlert({
				description: 'Não foi possível gerar o PDF do resumo agora.',
				type: 'error',
				isDarkMode,
			});
		} finally {
			setIsExportingPdf(false);
		}
	}, [
		formatCurrencyBRL,
		gains,
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
		(action: 'register' | 'settle' | 'edit' | 'delete' | 'reclaim', gain: DateCalendarItem) => {
			if (action === 'settle') {
				return;
			}
			setPendingAction({ type: action, gain: gain as MandatoryGainItem });
		},
		[],
	);

	const handleToggleGainCard = React.useCallback((gainId: string) => {
		setExpandedGainIds(previousState => {
			if (previousState.includes(gainId)) {
				return previousState.filter(id => id !== gainId);
			}

			setRenderedGainIds(rendered => (rendered.includes(gainId) ? rendered : [...rendered, gainId]));
			return [...previousState, gainId];
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

		const gainName = pendingAction.gain.name || 'ganho obrigatório selecionado';

		if (pendingAction.type === 'register') {
			return {
				title: 'Registrar ganho',
				message: `Deseja registrar “${gainName}” como um novo ganho?`,
				confirmLabel: 'Registrar',
				action: 'primary' as const,
			};
		}

		if (pendingAction.type === 'edit') {
			return {
				title: 'Editar ganho obrigatório',
				message: `Deseja editar o ganho obrigatório “${gainName}”?`,
				confirmLabel: 'Editar',
				action: 'primary' as const,
			};
		}

		if (pendingAction.type === 'reclaim') {
			return {
				title: 'Reivindicar recebimento',
				message: `Deseja cancelar o recebimento registrado para “${gainName}”? O ganho vinculado será removido.`,
				confirmLabel: 'Reivindicar',
				action: 'secondary' as const,
			};
		}

		return {
			title: 'Excluir ganho obrigatório',
			message: `Tem certeza de que deseja excluir “${gainName}”? Essa ação não pode ser desfeita.`,
			confirmLabel: 'Excluir',
			action: 'negative' as const,
		};
	}, [pendingAction]);

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
	const visibleHeroHeight = heroHeight - 64;

	return (
		<SafeAreaView className="flex-1 web:w-screen" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<View className="flex-1 web:w-screen" style={{ backgroundColor: surfaceBackground }}>
				<View className="flex-1 web:w-screen" style={{ backgroundColor: surfaceBackground }}>
					<View
						className={webStyles.hero}
						style={{ height: visibleHeroHeight, backgroundColor: surfaceBackground }}
					>
						<Image
							source={LoginWallpaper}
							alt="Background da tela de ganhos obrigatórios"
							className={webStyles.heroImage}
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
							title="Ganhos obrigatórios"
							Illustration={MandatoryGainListIllustration}
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
								{isLoading ? (
									<MandatoryGainsTimelineSkeleton
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
											items={calendarGains}
											tagsMap={tagsMap}
											tagMetadataMap={tagMetadataMap}
											formatCurrency={formatCurrencyBRL}
											getStatusText={getGainStatusText}
											getStatusClassName={getGainStatusClassName}
											getDueDayColorClass={getGainDueDayColorClass}
											onAction={handleCalendarAction}
											valueLabel="Previsto"
											dueLabel="Recebimento"
											completedLabel="receb."
											pendingLabel="pend."
											valueTone="gain"
											modalSize="lg"
										/>

										<View className="py-2">
											<VStack className="gap-4">
												<HStack className="items-start justify-between gap-4">
													<VStack className="flex-1 gap-1">
														<Text className="text-xs uppercase tracking-wide" style={{ color: monthlySummaryPalette.subtitle }}>
															Resumo do mês
														</Text>
														<Heading size="lg" style={{ color: monthlySummaryPalette.title }}>
															{referenceMonthLabel}
														</Heading>
													</VStack>
													<VStack className="items-end gap-1">
														<Text className="text-xs uppercase tracking-wide" style={{ color: monthlySummaryPalette.subtitle }}>
															Total do mês
														</Text>
														<Heading size="md" style={{ color: monthlySummaryPalette.gainText }}>
															{formatCurrencyBRL(monthlySummary.totalReferenceInCents)}
														</Heading>
													</VStack>
												</HStack>

												<HStack className="flex-wrap gap-3">
													{[
														{ label: 'Recebido', total: monthlySummary.receivedTotalInCents, count: monthlySummary.receivedItems.length, color: monthlySummaryPalette.gainText },
														{ label: 'Pendente', total: monthlySummary.pendingTotalInCents, count: monthlySummary.pendingItems.length, color: monthlySummaryPalette.pendingText },
													].map(item => (
														<View
															key={item.label}
															className="min-h-[96px] min-w-[220px] flex-1 rounded-[22px] border px-[14px] py-3"
															style={{ borderColor: monthlySummaryPalette.border }}
														>
															<VStack className="flex-1 justify-between">
																<Text className="text-xs uppercase tracking-wide" style={{ color: monthlySummaryPalette.subtitle }}>
																	{item.label}
																</Text>
																<Heading size="sm" style={{ color: item.color }}>
																	{formatCurrencyBRL(item.total)}
																</Heading>
																<Text className="text-xs" style={{ color: monthlySummaryPalette.subtitle }}>
																	{item.count} item(ns)
																</Text>
															</VStack>
														</View>
													))}
															</HStack>
															</VStack>
														</View>

														{monthlySummary.totalReferenceInCents > 0 ? (
															<View className={`${compactCardClassName} px-4 py-4`}>
																<VStack className="gap-3">
																	<MandatoryExpensePaymentBulletChart
																		valueInCents={shouldHideValues ? 0 : monthlySummary.receivedTotalInCents}
																		targetInCents={shouldHideValues ? 1 : monthlySummary.totalReferenceInCents}
																		isDarkMode={isDarkMode}
																		shouldHideValues={shouldHideValues}
																		subjectLabel="recebimentos de ganhos obrigatórios"
																	/>
																</VStack>
															</View>
														) : null}

														{gains.length > 0 ? (
															<HStack className="gap-4 web:flex-row web:flex-wrap">
																<View className={`${compactCardClassName} min-w-0 flex-1 px-4 py-4 web:w-[calc(50%-8px)] web:min-w-[320px]`}>
																	<VStack className="gap-2">
																		<Text className="text-slate-500 dark:text-slate-400 uppercase mt-1" style={{ color: monthlySummaryPalette.subtitle }}>
																			Ganhos por categoria
																		</Text>
																		<View style={{ height: 300 }}>
																			<MandatoryExpensesRadarChart
																				data={mandatoryGainsRadarData}
																				isDarkMode={isDarkMode}
																				shouldHideValues={shouldHideValues}
																				subjectLabel="ganhos obrigatórios"
																				valueLabel="Ganho obrigatório"
																				dom={{ focusable: false, scrollEnabled: false, style: { height: 300, backgroundColor: 'transparent' } }}
																			/>
																		</View>
																	</VStack>
																</View>

																<View className={`${compactCardClassName} min-w-0 flex-1 px-4 py-4 web:w-[calc(50%-8px)] web:min-w-[320px]`}>
																	<VStack className="gap-2">
																		<Text className="text-slate-500 dark:text-slate-400 uppercase mt-1" style={{ color: monthlySummaryPalette.subtitle }}>
																			Dias de recebimento
																		</Text>
																		<View style={{ height: 320 }}>
																			<MandatoryExpensesScatterChart
																				data={mandatoryGainsScatterData}
																				isDarkMode={isDarkMode}
																				subjectLabel="recebimentos de ganhos obrigatórios"
																				dom={{ focusable: false, scrollEnabled: false, style: { height: 320, backgroundColor: 'transparent' } }}
																			/>
																		</View>
																	</VStack>
																</View>
															</HStack>
														) : null}

														<HStack className="flex-wrap gap-3">
											<Button
												className={`${submitButtonClassName} min-w-[220px] flex-1`}
												onPress={() => void handleExportMonthlySummaryPdf()}
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
											<Button className={`${submitButtonClassName} min-w-[220px] flex-1`} onPress={handleOpenCreate}>
												<ButtonIcon as={AddIcon} size="sm" />
												<ButtonText>Adicionar ganho</ButtonText>
												{isLoading && <ButtonSpinner />}
											</Button>
										</HStack>

										{gains.length === 0 ? (
											<Box className={`${compactCardClassName} px-5 py-6`}>
												<Text className={`text-center ${helperText}`}>
													Nenhum ganho obrigatório cadastrado até o momento.
												</Text>
											</Box>
										) : (
											<VStack className="gap-2">
												<View className={webStyles.timeline}>
													{gains.map((gain, index) => {
														const isExpanded = expandedGainIds.includes(gain.id);
														const tagMetadata = tagMetadataMap[gain.tagId];
														const isCompletedDisplay = gain.isReceivedForCurrentCycle || gain.isInstallmentComplete;
														const tone = isCompletedDisplay ? MANDATORY_GAIN_COMPLETED_TONE : MANDATORY_GAIN_PENDING_TONE;
														const summaryText = gain.isInstallmentComplete
															? 'Parcelamento concluído.'
															: gain.isReceivedForCurrentCycle
																? `Recebido em ${formatReceiptDate(gain.lastReceiptDate ?? null)}.`
																: gain.installmentLabel
																	? `Registre a ${gain.installmentLabel.toLowerCase()} para concluir este item.`
																	: 'Registre o ganho do mês para concluir este item.';
														const tagLabel = tagMetadata?.name ?? tagsMap[gain.tagId] ?? 'Tag não encontrada';
														const isGainCompleted = gain.isReceivedForCurrentCycle || gain.isInstallmentComplete;

														return (
															<View key={gain.id} className={webStyles.timelineRow}>
																<View className={webStyles.timelineRail}>
																	<View className={webStyles.timelineDot} style={{ backgroundColor: tone.accentColor }} />
																	{index < gains.length - 1 ? (
																		<View className={webStyles.timelineLine} style={{ backgroundColor: tone.lineColor }} />
																	) : null}
																</View>

																<View className={webStyles.timelineBody}>
																	<Pressable
																		onPress={() => handleToggleGainCard(gain.id)}
																		accessibilityRole="button"
																		accessibilityLabel={`${isExpanded ? 'Recolher' : 'Expandir'} detalhes de ${gain.name}`}
																		accessibilityState={{ expanded: isExpanded }}
																		className={`${webStyles.movementHeader} min-h-[52px] cursor-pointer rounded-2xl py-1 focus-visible:ring-2 focus-visible:ring-yellow-300`}
																	>
																		<View className={webStyles.movementIdentity}>
																			<View className={`${webStyles.movementIcon} border border-white/10`} style={{ backgroundColor: tone.gradient[0] }}>
																				<TagIcon
																					iconFamily={tagMetadata?.iconFamily}
																					iconName={tagMetadata?.iconName}
																					iconStyle={tagMetadata?.iconStyle}
																					size={18}
																					color="#FFFFFF"
																				/>
																			</View>
																			<View className={webStyles.movementCopy}>
																			<RNText numberOfLines={1} className={webStyles.movementName} style={{ color: webDashboardPalette.primaryText }}>
																			{gain.name}
																		</RNText>
																			<RNText numberOfLines={1} className={webStyles.movementSubtitle} style={{ color: webDashboardPalette.primaryText }}>
																			{tagLabel}
																		</RNText>
																			{gain.installmentLabel ? (
																				<RNText numberOfLines={1} className="mt-0.5 text-[11px] font-bold leading-4" style={{ color: tone.accentColor }}>
																					{gain.installmentLabel}
																				</RNText>
																			) : null}
																		</View>
																	</View>

																		<View className={webStyles.movementAmount}>
																			<RNText className={`${webStyles.amount} tabular-nums`} style={{ color: tone.amountColor }}>
																				{formatCurrencyBRL(gain.displayValueInCents ?? gain.valueInCents)}
																			</RNText>
																			<View className={webStyles.movementDate}>
																				<CalendarDays size={12} color="#94A3B8" />
																				<RNText numberOfLines={1} className={webStyles.dateText}>
																					{formatGainScheduleLabel(gain)}
																				</RNText>
																				{isExpanded ? <ChevronUp size={14} color="#94A3B8" /> : <ChevronDown size={14} color="#94A3B8" />}
																			</View>
																		</View>
																	</Pressable>

																	{renderedGainIds.includes(gain.id) ? (
																		<AnimatedContent
																			key={`${gain.id}:detail`}
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
																				setRenderedGainIds(rendered => rendered.filter(item => item !== gain.id))
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
																					<RNText className={webStyles.detailLabel}>RESUMO</RNText>
																					<RNText className={webStyles.detailText}>{summaryText}</RNText>
																					<View className={webStyles.detailGrid}>
																						{[
																							{ label: 'Tipo', value: 'Ganho obrigatório' },
																							{ label: 'Recebimento', value: formatConfiguredMonthlyDueLabel(gain.dueDay, gain.usesBusinessDays) },
																							{ label: 'Neste mês', value: formatGainResolvedDateLabel(gain) },
																							{ label: 'Tag', value: tagLabel },
																							{ label: 'Lembrete', value: gain.reminderEnabled ? 'Ativado' : 'Desativado' },
																							...(gain.installmentLabel ? [{ label: 'Parcelas', value: gain.installmentLabel }] : []),
																							...(gain.installmentLabel ? [{ label: 'Início', value: formatMandatoryInstallmentDateLabel(gain.installmentStartDate ?? null) }] : []),
																							...(gain.installmentLabel ? [{ label: 'Fim', value: formatMandatoryInstallmentDateLabel(gain.installmentEndDate ?? null) }] : []),
																						].map(detail => (
																							<View key={`${gain.id}-${detail.label}`} className={webStyles.detailItem}>
																							<RNText className={webStyles.detailLabel}>{detail.label}</RNText>
																							<RNText className={webStyles.detailText}>{detail.value}</RNText>
																						</View>
																						))}
																					</View>

																					{gain.description ? (
																						<View className="mt-3">
																							<RNText className={webStyles.detailLabel}>DESCRIÇÃO</RNText>
																							<RNText className={webStyles.detailText}>{gain.description}</RNText>
																						</View>
																					) : null}

																					<View className="mt-3 flex-row flex-wrap gap-4">
																						<Pressable
																							onPress={() => setPendingAction({ type: 'register', gain })}
																							disabled={isGainCompleted}
																							accessibilityRole="button"
																							accessibilityLabel={`Registrar recebimento de ${gain.name}`}
																							className="min-h-[40px] flex-row items-center gap-2 rounded-xl px-2 text-white focus-visible:ring-2 focus-visible:ring-yellow-300"
																							style={{ opacity: isGainCompleted ? 0.45 : 1 }}
																						>
																							<Icon as={AddIcon} size="sm" className="text-white" />
																							<RNText className="text-xs font-semibold text-white">Registrar</RNText>
																						</Pressable>

																						<Pressable
																							onPress={() => setPendingAction({ type: 'edit', gain })}
																							accessibilityRole="button"
																							accessibilityLabel={`Editar ${gain.name}`}
																							className="min-h-[40px] flex-row items-center gap-2 rounded-xl px-2 text-white focus-visible:ring-2 focus-visible:ring-yellow-300"
																						>
																							<Icon as={EditIcon} size="sm" className="text-white" />
																							<RNText className="text-xs font-semibold text-white">Editar</RNText>
																						</Pressable>

																						{gain.isReceivedForCurrentCycle ? (
																							<Pressable
																								onPress={() => setPendingAction({ type: 'reclaim', gain })}
																								accessibilityRole="button"
																								accessibilityLabel={`Desfazer recebimento de ${gain.name}`}
																								className="min-h-[40px] flex-row items-center gap-2 rounded-xl px-2 text-white focus-visible:ring-2 focus-visible:ring-yellow-300"
																							>
																								<Icon as={RepeatIcon} size="sm" className="text-white" />
																								<RNText className="text-xs font-semibold text-white">Reivindicar</RNText>
																							</Pressable>
																						) : null}

																						<Pressable
																							onPress={() => setPendingAction({ type: 'delete', gain })}
																							accessibilityRole="button"
																							accessibilityLabel={`Excluir ${gain.name}`}
																							className="min-h-[40px] flex-row items-center gap-2 rounded-xl px-2 text-white focus-visible:ring-2 focus-visible:ring-white/80"
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

				<View style={{ marginHorizontal: -18, paddingBottom: 0, flexShrink: 0 }}>
					<Navigator defaultValue={1} />
				</View>

				<Modal size="lg" isOpen={isModalOpen} onClose={handleCloseActionModal}>
					<ModalBackdrop />
					<ModalContent className={`web:w-[calc(100%-32px)] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>{actionModalCopy.title}</ModalTitle>
							<ModalCloseButton accessibilityLabel={`Fechar ${actionModalCopy.title}`} onPress={handleCloseActionModal} />
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
									<ButtonText className={actionConfirmButtonTextClassName}>{actionModalCopy.confirmLabel}</ButtonText>
								)}
							</Button>
						</ModalFooter>
					</ModalContent>
				</Modal>
			</View>
		</SafeAreaView>
	);
}
