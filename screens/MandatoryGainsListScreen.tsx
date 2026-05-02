import React from 'react';
import { ScrollView, View, StatusBar, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import Navigator from '@/components/uiverse/navigator';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import { AddIcon, CalendarDaysIcon, DownloadIcon, EditIcon, RepeatIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon, Icon } from '@/components/ui/icon';
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
import { navigateToHomeDashboard } from '@/utils/navigation';
import { isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import { deleteGainFirebase } from '@/functions/GainFirebase';
import {
	formatConfiguredMonthlyDueLabel,
	formatResolvedMonthDateLabel,
	formatResolvedMonthDayLabel,
	resolveMonthlyOccurrence,
} from '@/utils/businessCalendar';
import {
	formatMandatoryInstallmentLabel,
	isMandatoryInstallmentPlanComplete,
	normalizeMandatoryInstallmentTotal,
	normalizeMandatoryInstallmentsCompleted,
} from '@/utils/mandatoryInstallments';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';

// Importação do SVG
import MandatoryGainListIllustration from '../assets/UnDraw/mandatoryGainsListScreen.svg';
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
import { buildPdfFileName, copyPdfToNamedCacheFile } from '@/utils/pdfFileName';

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
	iconGradient: [string, string];
	cardGradient: [string, string];
};

const MANDATORY_GAIN_PENDING_TONE: MandatoryItemTone = {
	accentColor: '#0EA5E9',
	amountColor: '#0EA5E9',
	lineColor: 'rgba(14, 165, 233, 0.3)',
	iconGradient: ['#0C4A6E', '#38BDF8'],
	cardGradient: ['#075985', '#67E8F9'],
};

const MANDATORY_GAIN_COMPLETED_TONE: MandatoryItemTone = {
	accentColor: '#10B981',
	amountColor: '#10B981',
	lineColor: 'rgba(16, 185, 129, 0.28)',
	iconGradient: ['#047857', '#34D399'],
	cardGradient: ['#065F46', '#10B981'],
};

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

			<Skeleton className="h-[320px]" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />

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
		topSummaryCardClassName,
		modalContentClassName,
		skeletonBaseColor,
		skeletonHighlightColor,
		skeletonMutedBaseColor,
		skeletonMutedHighlightColor,
		submitButtonClassName,
		submitButtonCancelClassName,
	} = useScreenStyles();
	const [isLoading, setIsLoading] = React.useState(false);
	const [gains, setGains] = React.useState<MandatoryGainItem[]>([]);
	const [tagsMap, setTagsMap] = React.useState<Record<string, string>>({});
	const [tagMetadataMap, setTagMetadataMap] = React.useState<Record<string, TagMetadata>>({});
	const [pendingAction, setPendingAction] = React.useState<PendingGainAction | null>(null);
	const [isActionProcessing, setIsActionProcessing] = React.useState(false);
	const { shouldHideValues } = useValueVisibility();
	const [expandedGainIds, setExpandedGainIds] = React.useState<string[]>([]);
	const [isExportingPdf, setIsExportingPdf] = React.useState(false);

	const formatCurrencyBRL = React.useCallback(
		(valueInCents: number) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}
			return new Intl.NumberFormat('pt-BR', {
				style: 'currency',
				currency: 'BRL',
			}).format(valueInCents / 100);
		},
		[shouldHideValues],
	);

	const calendarGains = React.useMemo(
		() =>
			gains.map(gain => ({
				...gain,
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
	const timelinePalette = React.useMemo(
		() => ({
			title: isDarkMode ? '#F8FAFC' : '#0F172A',
			subtitle: isDarkMode ? '#94A3B8' : '#64748B',
		}),
		[isDarkMode],
	);

	const monthlySummaryPalette = React.useMemo(
		() => ({
			title: isDarkMode ? '#F8FAFC' : '#0F172A',
			subtitle: isDarkMode ? '#94A3B8' : '#64748B',
			border: isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(226, 232, 240, 1)',
			surface: isDarkMode ? 'rgba(15, 23, 42, 0.92)' : '#F8FAFC',
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

	React.useEffect(() => {
		const visibleIds = new Set(gains.map(gain => gain.id));
		setExpandedGainIds(previousState => previousState.filter(id => visibleIds.has(id)));
	}, [gains]);

	const getGainDueDayColorClass = React.useCallback(
		(dueDay: number, gain?: DateCalendarItem) =>
			getDueDayColorClass(dueDay, (gain as MandatoryGainItem | undefined)?.isCompletedForCurrentCycle),
		[],
	);

	const loadData = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showNotifierAlert({
				description: 'Usuário não autenticado. Faça login novamente.',
				type: 'error',
				isDarkMode,
			});
			return;
		}

		setIsLoading(true);

		try {
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
								iconFamily: typeof tag['iconFamily'] === 'string' ? tag['iconFamily'] as TagIconFamily : null,
								iconName: typeof tag['iconName'] === 'string' ? tag['iconName'] as string : null,
								iconStyle: typeof tag['iconStyle'] === 'string' ? tag['iconStyle'] as TagIconStyle : null,
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
					reminderEnabled: gain?.reminderEnabled !== false,
					lastReceiptGainId: typeof gain?.lastReceiptGainId === 'string' ? gain.lastReceiptGainId : null,
					lastReceiptCycle: typeof gain?.lastReceiptCycle === 'string' ? gain.lastReceiptCycle : null,
					lastReceiptDate: normalizeDateValue(gain?.lastReceiptDate ?? null),
					lastReceiptValueInCents:
						typeof gain?.lastReceiptValueInCents === 'number' ? gain.lastReceiptValueInCents : null,
					installmentTotal,
					installmentsCompleted,
				};
			});

			const gainsWithStatus = formattedGains.map(gain => {
				const isReceivedForCurrentCycle = isCycleKeyCurrent(gain.lastReceiptCycle ?? undefined);
				const isInstallmentComplete = isMandatoryInstallmentPlanComplete(
					gain.installmentTotal ?? null,
					gain.installmentsCompleted ?? 0,
				);
				const installmentLabel = formatMandatoryInstallmentLabel(
					gain.installmentTotal ?? null,
					gain.installmentsCompleted ?? 0,
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
					isReceivedForCurrentCycle,
					isInstallmentComplete,
					installmentLabel,
					displayValueInCents,
				};
			});

			setTagsMap(tagsRecord);
			setTagMetadataMap(tagMetadataRecord);
			setGains(gainsWithStatus);
			await syncMandatoryGainNotifications(
				gainsResult.data.map((gain: any) => {
					const installmentTotal = normalizeMandatoryInstallmentTotal(gain?.installmentTotal);
					const installmentsCompleted = normalizeMandatoryInstallmentsCompleted(
						gain?.installmentsCompleted,
						installmentTotal,
					);
					const isInstallmentComplete = isMandatoryInstallmentPlanComplete(installmentTotal, installmentsCompleted);

					return {
						id: typeof gain?.id === 'string' ? gain.id : '',
						name: typeof gain?.name === 'string' ? gain.name : 'Ganho sem nome',
						dueDay: typeof gain?.dueDay === 'number' ? gain.dueDay : 1,
						usesBusinessDays: gain?.usesBusinessDays === true,
						reminderEnabled: isInstallmentComplete ? false : gain?.reminderEnabled !== false,
						reminderHour: typeof gain?.reminderHour === 'number' ? gain.reminderHour : 9,
						reminderMinute: typeof gain?.reminderMinute === 'number' ? gain.reminderMinute : 0,
						description: typeof gain?.description === 'string' ? gain.description : null,
					};
				}),
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
		}
	}, []);

	useFocusEffect(
		React.useCallback(() => {
			const fetch = async () => {
				await loadData();
			};

			void fetch();
			return () => { };
		}, [loadData]),
	);

	const handleOpenCreate = React.useCallback(() => {
		router.push('/add-mandatory-gains');
	}, []);

	const handleEdit = React.useCallback((gainTemplateId: string) => {
		router.push({
			pathname: '/add-mandatory-gains',
			params: { gainTemplateId },
		});
	}, []);

	const handleRegisterGain = React.useCallback((gain: MandatoryGainItem) => {
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

		router.push({
			pathname: '/add-register-gain',
			params: {
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
			},
		});
	}, [tagMetadataMap]);

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
				const result = await deleteMandatoryGainFirebase(pendingAction.gain.id);
				if (result.success) {
					await cancelMandatoryGainNotification(pendingAction.gain.id);
					showNotifierAlert({
						description: 'Ganho obrigatório removido com sucesso.',
						type: 'success',
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
				return;
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
	}, [handleEdit, handleRegisterGain, loadData, pendingAction]);

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
			const { uri } = await Print.printToFileAsync({ html: pdfHtml });
			const pdfFileName = buildPdfFileName(['Receitas Fixas', referenceMonthLabel]);
			const namedPdfUri = await copyPdfToNamedCacheFile(uri, pdfFileName);
			const canShare = await Sharing.isAvailableAsync();

			if (!canShare) {
				await Print.printAsync({ html: pdfHtml });
				showNotifierAlert({
					title: 'Resumo pronto',
					description: 'O resumo foi aberto na impressão do dispositivo. Use a opção de salvar como PDF.',
					type: 'info',
					isDarkMode,
				});
				return;
			}

			await Sharing.shareAsync(namedPdfUri, {
				dialogTitle: 'Baixar resumo de ganhos obrigatórios',
				mimeType: 'application/pdf',
				UTI: 'com.adobe.pdf',
			});

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

	const handleBackToHome = React.useCallback(() => {
		navigateToHomeDashboard();
		return true;
	}, []);

	const handleCalendarAction = React.useCallback(
		(action: PendingGainAction['type'], gain: MandatoryGainItem) => {
			setPendingAction({ type: action, gain });
		},
		[],
	);
	const handleToggleGainCard = React.useCallback((gainId: string) => {
		setExpandedGainIds(previousState =>
			previousState.includes(gainId)
				? previousState.filter(id => id !== gainId)
				: [...previousState, gainId],
		);
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
				message: `Deseja registrar "${gainName}" como um novo ganho?`,
				confirmLabel: 'Registrar',
				action: 'primary' as const,
			};
		}

		if (pendingAction.type === 'edit') {
			return {
				title: 'Editar ganho obrigatório',
				message: `Deseja editar o ganho obrigatório "${gainName}"?`,
				confirmLabel: 'Editar',
				action: 'primary' as const,
			};
		}

		if (pendingAction.type === 'reclaim') {
			return {
				title: 'Reivindicar recebimento',
				message: `Deseja cancelar o recebimento registrado para "${gainName}"? O ganho vinculado será removido.`,
				confirmLabel: 'Reivindicar',
				action: 'secondary' as const,
			};
		}

		return {
			title: 'Excluir ganho obrigatório',
			message: `Tem certeza de que deseja excluir "${gainName}"? Essa ação não pode ser desfeita.`,
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

	return (
		<SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
					<View className={`absolute top-0 left-0 right-0 ${cardBackground}`} style={{ height: heroHeight }}>
						<Image
							source={LoginWallpaper}
							alt="Background da tela de ganhos obrigatórios"
							className="w-full h-full rounded-b-3xl absolute"
							resizeMode="cover"
						/>

						<VStack
							className="w-full h-full items-center justify-start px-6 gap-4"
							style={{ paddingTop: insets.top + 24 }}
						>
							<Heading size="xl" className="text-white text-center">
								Ganhos obrigatórios
							</Heading>
							<MandatoryGainListIllustration width="38%" height="38%" className="opacity-90" />
						</VStack>
					</View>

					<ScrollView
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="on-drag"
						className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
						style={{ marginTop: heroHeight - 64 }}
						contentContainerStyle={{ paddingBottom: 48 }}
					>
						<VStack className="justify-between mt-4">

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
								<VStack className="mt-4 gap-4">
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
													<Heading size="md" style={{ color: monthlySummaryPalette.gainText }}>
														{formatCurrencyBRL(monthlySummary.totalReferenceInCents)}
													</Heading>
												</VStack>
											</HStack>

											<HStack className="gap-3">
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
															Recebido
														</Text>
														<Heading size="sm" style={{ color: monthlySummaryPalette.gainText }}>
															{formatCurrencyBRL(monthlySummary.receivedTotalInCents)}
														</Heading>
														<Text className="text-xs" style={{ color: monthlySummaryPalette.subtitle }}>
															{monthlySummary.receivedItems.length} item(ns)
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
											<View style={{ marginTop: 10 }}>
												{gains.map((gain, index) => {
													const isExpanded = expandedGainIds.includes(gain.id);
													const tagMetadata = tagMetadataMap[gain.tagId];
													const isCompletedDisplay = gain.isReceivedForCurrentCycle || gain.isInstallmentComplete;
													const tone = isCompletedDisplay
														? MANDATORY_GAIN_COMPLETED_TONE
														: MANDATORY_GAIN_PENDING_TONE;
													const summaryText = gain.isInstallmentComplete
														? 'Parcelamento concluído.'
														: gain.isReceivedForCurrentCycle
															? `Recebido em ${formatReceiptDate(gain.lastReceiptDate ?? null)}.`
															: gain.installmentLabel
																? `Registre a ${gain.installmentLabel.toLowerCase()} para concluir este item.`
																: 'Registre o ganho do mês para concluir este item.';

													return (
														<View key={gain.id} style={{ flexDirection: 'row' }}>
															<View
																style={{
																	alignItems: 'center',
																	width: '7%',
																	paddingTop: 6,
																}}
															>
																<View
																	style={{
																		width: 14,
																		height: 14,
																		borderRadius: 999,
																		backgroundColor: tone.accentColor,
																		borderWidth: 2,
																		borderColor: isDarkMode ? '#020617' : '#FFFFFF',
																		shadowColor: tone.accentColor,
																		shadowOpacity: isDarkMode ? 0.26 : 0.14,
																		shadowRadius: 8,
																		shadowOffset: { width: 0, height: 4 },
																		elevation: 2,
																	}}
																/>
																{index < gains.length - 1 ? (
																	<View
																		style={{
																			flex: 1,
																			width: 3,
																			borderRadius: 999,
																			marginVertical: 2,
																			backgroundColor: tone.lineColor,
																		}}
																	/>
																) : (
																	<View />
																)}
															</View>

															<View style={{ width: '93%', paddingBottom: 14 }}>
																<TouchableOpacity
																	activeOpacity={0.85}
																	onPress={() => handleToggleGainCard(gain.id)}
																	style={{ width: '100%' }}
																>
																	<HStack className="items-center justify-between gap-3">
																		<HStack className="items-center gap-3" style={{ flex: 1 }}>
																			<LinearGradient
																				colors={tone.iconGradient}
																				start={{ x: 0, y: 0 }}
																				end={{ x: 1, y: 1 }}
																				style={{
																					width: 44,
																					height: 44,
																					borderRadius: 16,
																					alignItems: 'center',
																					justifyContent: 'center',
																					flexShrink: 0,
																				}}
																			>
																				<TagIcon
																					iconFamily={tagMetadata?.iconFamily}
																					iconName={tagMetadata?.iconName}
																					iconStyle={tagMetadata?.iconStyle}
																					size={18}
																					color="#FFFFFF"
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
																					{gain.name}
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
																					{tagMetadata?.name ?? tagsMap[gain.tagId] ?? 'Tag não encontrada'}
																				</Text>
																				{gain.installmentLabel ? (
																					<Text
																						numberOfLines={1}
																						style={{
																							marginTop: 1,
																							color: tone.accentColor,
																							fontSize: 11,
																							lineHeight: 16,
																							fontWeight: '700',
																						}}
																					>
																						{gain.installmentLabel}
																					</Text>
																				) : null}
																			</View>
																		</HStack>

																		<HStack className="items-center gap-2">
																			<VStack className="items-end">
																				<Text
																					style={{
																						color: tone.amountColor,
																						fontSize: 15,
																						fontWeight: '700',
																					}}
																				>
																					{formatCurrencyBRL(gain.displayValueInCents ?? gain.valueInCents)}
																				</Text>
																				<HStack className="mt-1 items-center gap-1">
																					<Icon
																						as={CalendarDaysIcon}
																						size="xs"
																						className={isDarkMode ? 'text-slate-500' : 'text-slate-400'}
																					/>
																					<Text
																					style={{
																						color: timelinePalette.subtitle,
																						fontSize: 11,
																					}}
																				>
																					{formatGainScheduleLabel(gain)}
																				</Text>
																			</HStack>
																			</VStack>

																			<Icon
																				as={isExpanded ? ChevronUpIcon : ChevronDownIcon}
																				size="sm"
																				className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}
																			/>
																		</HStack>
																	</HStack>
																</TouchableOpacity>

																{isExpanded ? (
																	<LinearGradient
																		colors={tone.cardGradient}
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
																						{formatCurrencyBRL(gain.displayValueInCents ?? gain.valueInCents)}
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
																					{ label: 'Tipo', value: 'Ganho obrigatório' },
																					{ label: 'Recebimento', value: formatConfiguredMonthlyDueLabel(gain.dueDay, gain.usesBusinessDays) },
																					{ label: 'Neste mês', value: formatGainResolvedDateLabel(gain) },
																					{ label: 'Tag', value: tagMetadata?.name ?? tagsMap[gain.tagId] ?? 'Sem tag' },
																					{ label: 'Lembrete', value: gain.reminderEnabled === false ? 'Desativado' : 'Ativado' },
																					...(gain.installmentLabel ? [{ label: 'Parcelas', value: gain.installmentLabel }] : []),
																				].map(item => (
																					<View
																						key={`${gain.id}-${item.label}`}
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

																			{gain.description ? (
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
																						{gain.description}
																					</Text>
																				</View>
																			) : null}

																			<HStack className="flex-wrap gap-4" style={{ paddingTop: 2 }}>
																				<TouchableOpacity
																					activeOpacity={0.85}
																					onPress={() => setPendingAction({ type: 'register', gain })}
																					disabled={gain.isReceivedForCurrentCycle || gain.isInstallmentComplete}
																					style={{
																						flexDirection: 'row',
																						alignItems: 'center',
																						gap: 8,
																						paddingVertical: 8,
																						opacity: gain.isReceivedForCurrentCycle || gain.isInstallmentComplete ? 0.45 : 1,
																					}}
																				>
																					<Icon as={AddIcon} size="sm" className="text-white" />
																					<Text className="text-xs font-semibold text-white">Registrar</Text>
																				</TouchableOpacity>

																				<TouchableOpacity
																					activeOpacity={0.85}
																					onPress={() => setPendingAction({ type: 'edit', gain })}
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

																				{gain.isReceivedForCurrentCycle ? (
																					<TouchableOpacity
																						activeOpacity={0.85}
																						onPress={() => setPendingAction({ type: 'reclaim', gain })}
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
																					onPress={() => setPendingAction({ type: 'delete', gain })}
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
							)}
						</VStack>
					</ScrollView>
				</View>

				<View style={{ marginHorizontal: -18, paddingBottom: 0, flexShrink: 0 }}>
					<Navigator defaultValue={1} />
				</View>

				<Modal isOpen={isModalOpen} onClose={handleCloseActionModal}>
					<ModalBackdrop />
					<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>{actionModalCopy.title}</ModalTitle>
							<ModalCloseButton onPress={handleCloseActionModal} />
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
