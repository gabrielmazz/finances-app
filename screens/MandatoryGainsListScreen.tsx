import React from 'react';
import { ScrollView, View, StatusBar, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
import { AddIcon, CalendarDaysIcon, EditIcon, RepeatIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon, Icon } from '@/components/ui/icon';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
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
import { isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import { deleteGainFirebase } from '@/functions/GainFirebase';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';

// Importação do SVG
import MandatoryGainListIllustration from '../assets/UnDraw/mandatoryGainsListScreen.svg';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';
import DateCalendar, { DateCalendarItem } from '@/components/uiverse/date-calendar';
import { TagIcon } from '@/hooks/useTagIcons';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
import { useScreenStyles } from '@/hooks/useScreenStyle';

type MandatoryGainItem = DateCalendarItem & {
	lastReceiptGainId?: string | null;
	lastReceiptCycle?: string | null;
	lastReceiptDate?: Date | null;
	isReceivedForCurrentCycle?: boolean;
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
	} = useScreenStyles();
	const [isLoading, setIsLoading] = React.useState(false);
	const [gains, setGains] = React.useState<MandatoryGainItem[]>([]);
	const [tagsMap, setTagsMap] = React.useState<Record<string, string>>({});
	const [tagMetadataMap, setTagMetadataMap] = React.useState<Record<string, TagMetadata>>({});
	const [pendingAction, setPendingAction] = React.useState<PendingGainAction | null>(null);
	const [isActionProcessing, setIsActionProcessing] = React.useState(false);
	const { shouldHideValues } = useValueVisibility();
	const [expandedGainIds, setExpandedGainIds] = React.useState<string[]>([]);

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
				isCompletedForCurrentCycle: gain.isReceivedForCurrentCycle,
				lastStatusDate: gain.lastReceiptDate ?? null,
			})),
		[gains],
	);

	const getGainStatusText = React.useCallback(
		(gain: DateCalendarItem & { lastStatusDate?: Date | null; isCompletedForCurrentCycle?: boolean }) => {
			if (gain.isCompletedForCurrentCycle) {
				return `Recebido em ${formatReceiptDate(gain.lastStatusDate ?? null)}.`;
			}
			return 'Aguardando registro como ganho neste mês.';
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

			const formattedGains: MandatoryGainItem[] = gainsResult.data.map((gain: any) => ({
				id: gain.id,
				name: typeof gain?.name === 'string' ? gain.name : 'Ganho sem nome',
				valueInCents: typeof gain?.valueInCents === 'number' ? gain.valueInCents : 0,
				dueDay: typeof gain?.dueDay === 'number' ? gain.dueDay : 1,
				tagId: typeof gain?.tagId === 'string' ? gain.tagId : '',
				description: typeof gain?.description === 'string' ? gain.description : null,
				reminderEnabled: gain?.reminderEnabled !== false,
				lastReceiptGainId: typeof gain?.lastReceiptGainId === 'string' ? gain.lastReceiptGainId : null,
				lastReceiptCycle: typeof gain?.lastReceiptCycle === 'string' ? gain.lastReceiptCycle : null,
				lastReceiptDate: normalizeDateValue(gain?.lastReceiptDate ?? null),
			}));

			const gainsWithStatus = formattedGains.map(gain => ({
				...gain,
				isReceivedForCurrentCycle: isCycleKeyCurrent(gain.lastReceiptCycle ?? undefined),
			}));

			setTagsMap(tagsRecord);
			setTagMetadataMap(tagMetadataRecord);
			setGains(gainsWithStatus);
			await syncMandatoryGainNotifications(
				gainsWithStatus.map(gain => ({
					id: gain.id,
					name: gain.name,
					dueDay: gain.dueDay,
					reminderEnabled: gain.reminderEnabled,
					reminderHour: 9,
					reminderMinute: 0,
					description: gain.description,
				})),
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

		router.push({
			pathname: '/add-register-gain',
			params: {
				templateName: encodeURIComponent(gain.name),
				templateValueInCents: String(gain.valueInCents),
				templateTagId: gain.tagId,
				templateDueDay: String(gain.dueDay),
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

	const handleBackToHome = React.useCallback(() => {
		router.replace('/home?tab=0');
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

									<Button
										className={`${submitButtonClassName}`}
										onPress={handleOpenCreate}
									>
										<ButtonIcon as={AddIcon} size="sm" />
										<ButtonText>Adicionar ganho obrigatório</ButtonText>
										{isLoading && <ButtonSpinner />}
									</Button>

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
													const tone = gain.isReceivedForCurrentCycle
														? MANDATORY_GAIN_COMPLETED_TONE
														: MANDATORY_GAIN_PENDING_TONE;
													const summaryText = gain.isReceivedForCurrentCycle
														? `Recebido em ${formatReceiptDate(gain.lastReceiptDate ?? null)}.`
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
																					{formatCurrencyBRL(gain.valueInCents)}
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
																						dia {String(gain.dueDay).padStart(2, '0')}
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
																						{formatCurrencyBRL(gain.valueInCents)}
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
																					{ label: 'Recebimento', value: `dia ${String(gain.dueDay).padStart(2, '0')}` },
																					{ label: 'Tag', value: tagMetadata?.name ?? tagsMap[gain.tagId] ?? 'Sem tag' },
																					{ label: 'Lembrete', value: gain.reminderEnabled === false ? 'Desativado' : 'Ativado' },
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
																					disabled={gain.isReceivedForCurrentCycle}
																					style={{
																						flexDirection: 'row',
																						alignItems: 'center',
																						gap: 8,
																						paddingVertical: 8,
																						opacity: gain.isReceivedForCurrentCycle ? 0.45 : 1,
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
						<Heading size="lg">{actionModalCopy.title}</Heading>
						<ModalCloseButton onPress={handleCloseActionModal} />
					</ModalHeader>
					<ModalBody>
						<Text className="text-gray-700 dark:text-gray-300">{actionModalCopy.message}</Text>
					</ModalBody>
					<ModalFooter className="gap-3">
						<Button variant="outline" onPress={handleCloseActionModal} isDisabled={isActionProcessing}>
							<ButtonText>Cancelar</ButtonText>
						</Button>
						<Button
							variant="solid"
							action={actionModalCopy.action}
							onPress={handleConfirmAction}
							isDisabled={isActionProcessing}
						>
							{isActionProcessing ? (
								<>
									<ButtonSpinner color="white" />
									<ButtonText>Processando</ButtonText>
								</>
							) : (
								<ButtonText>{actionModalCopy.confirmLabel}</ButtonText>
							)}
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
			</View>
		</SafeAreaView>
	);
}
