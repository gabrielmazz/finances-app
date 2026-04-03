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
	ModalTitle,
} from '@/components/ui/modal';
import Navigator from '@/components/uiverse/navigator';

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
import LoginWallpaper from '@/assets/Background/wallpaper01.png';

// Importação do SVG
import MandatoryExpensesListIllustration from '../assets/UnDraw/mandatoryExpensesListScreen.svg';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';
import DateCalendar, { DateCalendarItem } from '@/components/uiverse/date-calendar';
import { TagIcon } from '@/hooks/useTagIcons';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
import { useScreenStyles } from '@/hooks/useScreenStyle';

type PendingExpenseAction =
	| { type: 'register'; expense: MandatoryExpenseItem }
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
	isPaidForCurrentCycle?: boolean;
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
	iconGradient: [string, string];
	cardGradient: [string, string];
};

const MANDATORY_EXPENSE_PENDING_TONE: MandatoryItemTone = {
	accentColor: '#F97316',
	amountColor: '#D97706',
	lineColor: 'rgba(249, 115, 22, 0.3)',
	iconGradient: ['#B91C1C', '#FACC15'],
	cardGradient: ['#991B1B', '#FACC15'],
};

const MANDATORY_EXPENSE_COMPLETED_TONE: MandatoryItemTone = {
	accentColor: '#10B981',
	amountColor: '#10B981',
	lineColor: 'rgba(16, 185, 129, 0.28)',
	iconGradient: ['#047857', '#34D399'],
	cardGradient: ['#065F46', '#10B981'],
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
		modalContentClassName,
		skeletonBaseColor,
		skeletonHighlightColor,
		skeletonMutedBaseColor,
		skeletonMutedHighlightColor,
		submitButtonClassName,
		submitButtonCancelClassName,
	} = useScreenStyles();
	const [isLoading, setIsLoading] = React.useState(false);
	const [expenses, setExpenses] = React.useState<MandatoryExpenseItem[]>([]);
	const [tagsMap, setTagsMap] = React.useState<Record<string, string>>({});
	const [tagMetadataMap, setTagMetadataMap] = React.useState<Record<string, TagMetadata>>({});
	const [pendingAction, setPendingAction] = React.useState<PendingExpenseAction | null>(null);
	const [isActionProcessing, setIsActionProcessing] = React.useState(false);
	const { shouldHideValues } = useValueVisibility();
	const [expandedExpenseIds, setExpandedExpenseIds] = React.useState<string[]>([]);

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
				isCompletedForCurrentCycle: expense.isPaidForCurrentCycle,
				lastStatusDate: expense.lastPaymentDate ?? null,
			})),
		[expenses],
	);

	const getExpenseStatusText = React.useCallback(
		(expense: DateCalendarItem & { lastStatusDate?: Date | null; isCompletedForCurrentCycle?: boolean }) => {
			if (expense.isCompletedForCurrentCycle) {
				return `Pagamento registrado em ${formatPaymentDate(expense.lastStatusDate ?? null)}.`;
			}
			return 'Aguardando registro como despesa neste mês.';
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

	const timelinePalette = React.useMemo(
		() => ({
			title: isDarkMode ? '#F8FAFC' : '#0F172A',
			subtitle: isDarkMode ? '#94A3B8' : '#64748B',
		}),
		[isDarkMode],
	);

	React.useEffect(() => {
		const visibleIds = new Set(expenses.map(expense => expense.id));
		setExpandedExpenseIds(previousState => previousState.filter(id => visibleIds.has(id)));
	}, [expenses]);

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
				const resolvedOccurrence = resolveMonthlyOccurrence({
					referenceDate,
					dueDay,
					usesBusinessDays,
				});

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
					reminderEnabled: expense?.reminderEnabled !== false,
					lastPaymentExpenseId:
						typeof expense?.lastPaymentExpenseId === 'string' ? expense.lastPaymentExpenseId : null,
					lastPaymentCycle:
						typeof expense?.lastPaymentCycle === 'string' ? expense.lastPaymentCycle : null,
					lastPaymentDate: normalizeDateValue(expense?.lastPaymentDate ?? null),
				};
			});

			const expensesWithStatus = formattedExpenses.map(expense => ({
				...expense,
				isPaidForCurrentCycle: isCycleKeyCurrent(expense.lastPaymentCycle ?? undefined),
			}));

			setTagsMap(tagsRecord);
			setTagMetadataMap(tagMetadataRecord);
			setExpenses(expensesWithStatus);
			await syncMandatoryExpenseNotifications(
				expensesResult.data.map((expense: any) => ({
					id: typeof expense?.id === 'string' ? expense.id : '',
					name: typeof expense?.name === 'string' ? expense.name : 'Gasto sem nome',
					dueDay: typeof expense?.dueDay === 'number' ? expense.dueDay : 1,
					usesBusinessDays: expense?.usesBusinessDays === true,
					reminderEnabled: expense?.reminderEnabled !== false,
					reminderHour: typeof expense?.reminderHour === 'number' ? expense.reminderHour : 9,
					reminderMinute: typeof expense?.reminderMinute === 'number' ? expense.reminderMinute : 0,
					description: typeof expense?.description === 'string' ? expense.description : null,
				})),
			);
		} catch (error) {
			console.error('Erro ao carregar gastos obrigatórios:', error);
			showNotifierAlert({
				description: 'Não foi possível carregar os gastos obrigatórios.',
				type: 'error',
				isDarkMode,
			});
		} finally {
			setIsLoading(false);
		}
	}, []);

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
		router.push('/add-mandatory-expenses');
	}, []);

	const handleEdit = React.useCallback((expenseId: string) => {
		router.push({
			pathname: '/add-mandatory-expenses',
			params: { expenseId },
		});
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

		router.push({
			pathname: '/add-register-expenses',
			params: {
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
			handleRegisterExpense(pendingAction.expense);
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
					await cancelMandatoryExpenseNotification(pendingAction.expense.id);
					showNotifierAlert({
						description: 'Gasto obrigatório removido com sucesso.',
						type: 'success',
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
	}, [handleEdit, handleRegisterExpense, loadData, pendingAction]);

	const handleCalendarAction = React.useCallback(
		(action: PendingExpenseAction['type'], expense: MandatoryExpenseItem) => {
			setPendingAction({ type: action, expense });
		},
		[],
	);
	const handleToggleExpenseCard = React.useCallback((expenseId: string) => {
		setExpandedExpenseIds(previousState =>
			previousState.includes(expenseId)
				? previousState.filter(id => id !== expenseId)
				: [...previousState, expenseId],
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

		const expenseName = pendingAction.expense.name || 'gasto obrigatório selecionado';

		if (pendingAction.type === 'register') {
			return {
				title: 'Registrar despesa',
				message: `Deseja registrar "${expenseName}" como uma nova despesa?`,
				confirmLabel: 'Registrar',
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
							alt="Background da tela de gastos obrigatórios"
							className="w-full h-full rounded-b-3xl absolute"
							resizeMode="cover"
						/>

						<VStack
							className="w-full h-full items-center justify-start px-6 gap-4"
							style={{ paddingTop: insets.top + 24 }}
						>
							<Heading size="xl" className="text-white text-center">
								Gastos obrigatórios
							</Heading>
							<MandatoryExpensesListIllustration width="38%" height="38%" className="opacity-90" />
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
								<MandatoryExpensesTimelineSkeleton
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
									/>


									<Button
										className={`${submitButtonClassName}`}
										onPress={handleOpenCreate}
									>
										<ButtonIcon as={AddIcon} size="sm" />
										<ButtonText>Adicionar gasto obrigatório</ButtonText>
										{isLoading && <ButtonSpinner />}
									</Button>

									{expenses.length === 0 ? (
										<Box className={`${compactCardClassName} px-5 py-6`}>
											<Text className={`text-center ${helperText}`}>
												Nenhum gasto obrigatório cadastrado até o momento.
											</Text>
										</Box>
									) : (
										<VStack className="gap-2">
											<View style={{ marginTop: 10 }}>
												{expenses.map((expense, index) => {
													const isExpanded = expandedExpenseIds.includes(expense.id);
													const tagMetadata = tagMetadataMap[expense.tagId];
													const tone = expense.isPaidForCurrentCycle
														? MANDATORY_EXPENSE_COMPLETED_TONE
														: MANDATORY_EXPENSE_PENDING_TONE;
													const summaryText = expense.isPaidForCurrentCycle
														? `Pagamento registrado em ${formatPaymentDate(expense.lastPaymentDate ?? null)}.`
														: 'Registre a despesa do mês para concluir este item.';

													return (
														<View key={expense.id} style={{ flexDirection: 'row' }}>
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
																{index < expenses.length - 1 ? (
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
																	onPress={() => handleToggleExpenseCard(expense.id)}
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
																					{expense.name}
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
																					{tagMetadata?.name ?? tagsMap[expense.tagId] ?? 'Tag não encontrada'}
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
																					{formatCurrencyBRL(expense.valueInCents)}
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
																					{formatExpenseScheduleLabel(expense)}
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
																						{formatCurrencyBRL(expense.valueInCents)}
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
																					{ label: 'Lembrete', value: expense.reminderEnabled === false ? 'Desativado' : 'Ativado' },
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
																					disabled={expense.isPaidForCurrentCycle}
																					style={{
																						flexDirection: 'row',
																						alignItems: 'center',
																						gap: 8,
																						paddingVertical: 8,
																						opacity: expense.isPaidForCurrentCycle ? 0.45 : 1,
																					}}
																				>
																					<Icon as={AddIcon} size="sm" className="text-white" />
																					<Text className="text-xs font-semibold text-white">Registrar</Text>
																				</TouchableOpacity>

																				<TouchableOpacity
																					activeOpacity={0.85}
																					onPress={() => setPendingAction({ type: 'edit', expense })}
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

																				{expense.isPaidForCurrentCycle ? (
																					<TouchableOpacity
																						activeOpacity={0.85}
																						onPress={() => setPendingAction({ type: 'reclaim', expense })}
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

				<View
					style={{
						marginHorizontal: -18,
						paddingBottom: 0,
						flexShrink: 0,
					}}
				>
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
