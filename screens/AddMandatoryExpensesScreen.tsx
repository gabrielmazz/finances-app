import React from 'react';
import {
	ScrollView,
	View,
	StatusBar,
	KeyboardAvoidingView,
	Platform,
	Keyboard,
	ScrollView as RNScrollView,
	TextInput,
	findNodeHandle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

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
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { HStack } from '@/components/ui/hstack';
import { Switch } from '@/components/ui/switch';
import { Box } from '@/components/ui/box';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';

import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import Navigator from '@/components/uiverse/navigator';

import { auth } from '@/FirebaseConfig';
import { getAllTagsFirebase } from '@/functions/TagFirebase';
import {
	addMandatoryExpenseFirebase,
	getMandatoryExpenseFirebase,
	updateMandatoryExpenseFirebase,
	clearMandatoryExpensePaymentFirebase,
} from '@/functions/MandatoryExpenseFirebase';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import {
	cancelMandatoryExpenseNotification,
	ensureNotificationPermissionForMandatoryExpenses,
	scheduleMandatoryExpenseNotification,
} from '@/utils/mandatoryExpenseNotifications';
import {
	formatMandatoryReminderNextTrigger,
	type MandatoryReminderScheduleResult,
} from '@/utils/mandatoryReminderNotifications';
import { getCurrentCycleKey, isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import { deleteExpenseFirebase } from '@/functions/ExpenseFirebase';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';

// Importação do SVG
import AddMandatoryExpensesListIllustration from '../assets/UnDraw/addMandatoryExpensesScreen.svg';
import { TagIcon } from '@/hooks/useTagIcons';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
import { useScreenStyles } from '@/hooks/useScreenStyle';

type TagOption = {
	id: string;
	name: string;
	iconFamily?: TagIconFamily | null;
	iconName?: string | null;
	iconStyle?: TagIconStyle | null;
};
type PaymentInfo = {
	expenseId: string | null;
	paidAt: Date | null;
	cycleKey: string | null;
};
type MandatoryExpenseFormSnapshot = {
	name: string;
	valueInCents: number | null;
	dueDay: string;
	tagId: string | null;
	description: string;
	reminderEnabled: boolean;
};
type FocusableInputKey = 'expense-name' | 'expense-value' | 'due-day' | 'description';

const formatCurrencyBRL = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(valueInCents / 100);

const formatDateToBR = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${day}/${month}/${year}`;
};

const formatValueInput = (value: string) => value.replace(/\D/g, '');
const sanitizeDueDay = (value: string) => value.replace(/\D/g, '').slice(0, 2);
const normalizeDateValue = (value: unknown): Date | null => {
	if (!value) {
		return null;
	}
	if (value instanceof Date) {
		return value;
	}
	if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
		return (value as { toDate?: () => Date }).toDate?.() ?? null;
	}
	if (typeof value === 'string' || typeof value === 'number') {
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) {
			return parsed;
		}
	}
	return null;
};

function MandatoryExpenseFormSkeleton({
	bodyText,
	tintedCardClassName,
	compactCardClassName,
	fieldContainerClassName,
	skeletonBaseColor,
	skeletonHighlightColor,
	skeletonMutedBaseColor,
	skeletonMutedHighlightColor,
}: {
	bodyText: string;
	tintedCardClassName: string;
	compactCardClassName: string;
	fieldContainerClassName: string;
	skeletonBaseColor: string;
	skeletonHighlightColor: string;
	skeletonMutedBaseColor: string;
	skeletonMutedHighlightColor: string;
}) {
	return (
		<VStack className="mt-4 gap-4">
			<Box className={`${tintedCardClassName} px-5 py-5`}>
				<VStack className="gap-3">
					<Skeleton className="h-3 w-28" baseColor={skeletonMutedBaseColor} highlightColor={skeletonMutedHighlightColor} />
					<Skeleton className="h-8 w-48" baseColor={skeletonMutedBaseColor} highlightColor={skeletonMutedHighlightColor} />
					<SkeletonText
						_lines={2}
						className="h-3"
						baseColor={skeletonMutedBaseColor}
						highlightColor={skeletonMutedHighlightColor}
					/>
				</VStack>
			</Box>

			{Array.from({ length: 4 }).map((_, index) => (
				<VStack key={`mandatory-expense-form-skeleton-${index}`} className="gap-2">
					<Skeleton className="ml-1 h-3 w-32" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
					<Skeleton
						className={fieldContainerClassName}
						baseColor={skeletonBaseColor}
						highlightColor={skeletonHighlightColor}
					/>
				</VStack>
			))}

			<VStack className="gap-2">
				<Text className={`${bodyText} ml-1 text-sm`}>Observações</Text>
				<Skeleton className="h-24 rounded-2xl" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
			</VStack>

			<Box className={`${compactCardClassName} px-4 py-4`}>
				<VStack className="gap-3">
					<Skeleton className="h-4 w-32" baseColor={skeletonMutedBaseColor} highlightColor={skeletonMutedHighlightColor} />
					<SkeletonText
						_lines={2}
						className="h-3"
						baseColor={skeletonMutedBaseColor}
						highlightColor={skeletonMutedHighlightColor}
					/>
				</VStack>
			</Box>

			<Skeleton className="h-11 rounded-2xl" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
		</VStack>
	);
}

export default function AddMandatoryExpensesScreen() {
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
		topSummaryCardClassName,
		skeletonBaseColor,
		skeletonHighlightColor,
		skeletonMutedBaseColor,
		skeletonMutedHighlightColor,
	} = useScreenStyles();
	const params = useLocalSearchParams<{ expenseId?: string | string[] }>();
	const editingExpenseId = React.useMemo(() => {
		const raw = Array.isArray(params.expenseId) ? params.expenseId[0] : params.expenseId;
		return raw && raw.trim().length > 0 ? raw : null;
	}, [params.expenseId]);

	const [tagOptions, setTagOptions] = React.useState<TagOption[]>([]);
	const [selectedTagId, setSelectedTagId] = React.useState<string | null>(null);
	const [isLoadingTags, setIsLoadingTags] = React.useState(false);

	const [expenseName, setExpenseName] = React.useState('');
	const [valueDisplay, setValueDisplay] = React.useState('');
	const [valueInCents, setValueInCents] = React.useState<number | null>(null);
	const [dueDay, setDueDay] = React.useState('');
	const [description, setDescription] = React.useState('');
	const [reminderEnabled, setReminderEnabled] = React.useState(true);
	const [selectedExpenseId, setSelectedExpenseId] = React.useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isPrefilling, setIsPrefilling] = React.useState(false);
	const [currentPaymentInfo, setCurrentPaymentInfo] = React.useState<PaymentInfo | null>(null);
	const [isPaymentActionLoading, setIsPaymentActionLoading] = React.useState(false);
	const [persistedFormSnapshot, setPersistedFormSnapshot] = React.useState<MandatoryExpenseFormSnapshot | null>(null);
	const selectedTagLabel = React.useMemo(() => {
		if (!selectedTagId) {
			return null;
		}
		return tagOptions.find(tag => tag.id === selectedTagId)?.name ?? null;
	}, [selectedTagId, tagOptions]);
	const selectedTagOption = React.useMemo(() => {
		return tagOptions.find(tag => tag.id === selectedTagId) ?? null;
	}, [selectedTagId, tagOptions]);
	const selectedTagIconColor = isDarkMode ? '#FCD34D' : '#D97706';
	const selectedTagIconContainerClassName = isDarkMode
		? 'border border-slate-800 bg-slate-900'
		: 'border border-slate-200';

	const scrollViewRef = React.useRef<RNScrollView | null>(null);
	const expenseNameInputRef = React.useRef<TextInput | null>(null);
	const expenseValueInputRef = React.useRef<TextInput | null>(null);
	const dueDayInputRef = React.useRef<TextInput | null>(null);
	const descriptionInputRef = React.useRef<TextInput | null>(null);
	const lastFocusedInputKey = React.useRef<FocusableInputKey | null>(null);
	const [keyboardHeight, setKeyboardHeight] = React.useState(0);
	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => (key === 'description' ? 180 : 120),
		[],
	);

	const handleValueChange = React.useCallback((input: string) => {
		const digitsOnly = formatValueInput(input);
		if (!digitsOnly) {
			setValueDisplay('');
			setValueInCents(null);
			return;
		}

		const centsValue = parseInt(digitsOnly, 10);
		setValueInCents(centsValue);
		setValueDisplay(formatCurrencyBRL(centsValue));
	}, []);

	const handleDueDayChange = React.useCallback((input: string) => {
		setDueDay(sanitizeDueDay(input));
	}, []);

	const isDueDayValid = React.useMemo(() => {
		if (!dueDay) {
			return false;
		}
		const parsed = Number(dueDay);
		return !Number.isNaN(parsed) && parsed >= 1 && parsed <= 31;
	}, [dueDay]);

	const handleReminderToggle = React.useCallback(async (value: boolean) => {
		if (!value) {
			setReminderEnabled(false);
			return;
		}

		if (!expenseName.trim() || valueInCents === null || valueInCents <= 0 || !isDueDayValid || !selectedTagId) {
			showNotifierAlert({
				title: 'Lembrete indisponível',
				description: 'Preencha nome, valor, dia do vencimento e categoria antes de ativar o lembrete.',
				type: 'warn',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		const permissionResult = await ensureNotificationPermissionForMandatoryExpenses();
		if (!permissionResult.granted) {
			showNotifierAlert({
				title: 'Lembrete indisponível',
				description:
					permissionResult.reason === 'unavailable'
						? 'Não foi possível acessar as notificações locais neste ambiente. Se você instalou um build antigo, gere um novo build com a configuração atualizada.'
						: 'Ative as notificações do aplicativo nas configurações do dispositivo para receber lembretes.',
				type: 'warn',
				isDarkMode,
				duration: 4500,
			});
			return;
		}
		setReminderEnabled(value);
	}, [expenseName, isDarkMode, isDueDayValid, selectedTagId, valueInCents]);

	const getInputRef = React.useCallback(
		(key: FocusableInputKey) => {
			switch (key) {
				case 'expense-name':
					return expenseNameInputRef;
				case 'expense-value':
					return expenseValueInputRef;
				case 'due-day':
					return dueDayInputRef;
				case 'description':
					return descriptionInputRef;
				default:
					return null;
			}
		},
		[],
	);

	const scrollToInput = React.useCallback(
		(key: FocusableInputKey) => {
			const inputRef = getInputRef(key);
			if (!inputRef?.current) {
				return;
			}

			const nodeHandle = findNodeHandle(inputRef.current);
			const scrollResponder = scrollViewRef.current?.getScrollResponder?.();
			const offset = keyboardScrollOffset(key);

			if (scrollResponder && nodeHandle) {
				scrollResponder.scrollResponderScrollNativeHandleToKeyboard(nodeHandle, offset, true);
				return;
			}

			const scrollViewNode = scrollViewRef.current;
			const innerViewNode = scrollViewNode?.getInnerViewNode?.();

			if (scrollViewNode && innerViewNode && typeof inputRef.current.measureLayout === 'function') {
				inputRef.current.measureLayout(
					innerViewNode,
					(_x, y) =>
						scrollViewNode.scrollTo({
							y: Math.max(0, y - keyboardScrollOffset(key)),
							animated: true,
						}),
					() => { },
				);
			}
		},
		[getInputRef, keyboardScrollOffset],
	);

	const handleInputFocus = React.useCallback(
		(key: FocusableInputKey) => {
			lastFocusedInputKey.current = key;
			scrollToInput(key);
		},
		[scrollToInput],
	);

	React.useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

		const showSub = Keyboard.addListener(showEvent, e => {
			setKeyboardHeight(e.endCoordinates?.height ?? 0);
			const focusedKey = lastFocusedInputKey.current;
			if (focusedKey) {
				setTimeout(() => {
					scrollToInput(focusedKey);
				}, 50);
			}
		});
		const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

		return () => {
			showSub.remove();
			hideSub.remove();
		};
	}, [scrollToInput]);

	const contentBottomPadding = React.useMemo(() => Math.max(140, keyboardHeight + 120), [keyboardHeight]);

	const buildFormSnapshot = React.useCallback(
		(): MandatoryExpenseFormSnapshot => ({
			name: expenseName.trim(),
			valueInCents,
			dueDay: dueDay.trim(),
			tagId: selectedTagId,
			description: description.trim(),
			reminderEnabled,
		}),
		[description, dueDay, expenseName, reminderEnabled, selectedTagId, valueInCents],
	);

	const hasExpenseName = expenseName.trim().length > 0;
	const hasExpenseValue = valueInCents !== null && valueInCents > 0;
	const isFormBusy = isSubmitting || isPrefilling;
	const isCoreTemplateReady = hasExpenseName && hasExpenseValue && isDueDayValid;
	const isTemplateReady = isCoreTemplateReady && Boolean(selectedTagId);
	const isValueFieldDisabled = !hasExpenseName || isFormBusy;
	const isDueDayFieldDisabled = !hasExpenseName || !hasExpenseValue || isFormBusy;
	const isTagSelectDisabled = isLoadingTags || tagOptions.length === 0 || !isCoreTemplateReady || isFormBusy;
	const isDescriptionDisabled = !isTemplateReady || isFormBusy;
	const hasPendingTemplateChanges = React.useMemo(() => {
		if (!selectedExpenseId || !persistedFormSnapshot) {
			return false;
		}

		const currentSnapshot = buildFormSnapshot();
		return (
			currentSnapshot.name !== persistedFormSnapshot.name ||
			currentSnapshot.valueInCents !== persistedFormSnapshot.valueInCents ||
			currentSnapshot.dueDay !== persistedFormSnapshot.dueDay ||
			currentSnapshot.tagId !== persistedFormSnapshot.tagId ||
			currentSnapshot.description !== persistedFormSnapshot.description ||
			currentSnapshot.reminderEnabled !== persistedFormSnapshot.reminderEnabled
		);
	}, [buildFormSnapshot, persistedFormSnapshot, selectedExpenseId]);

	const tagHelperMessage = isLoadingTags
		? 'Carregando categorias obrigatórias...'
		: tagOptions.length === 0
			? 'Cadastre uma tag de despesa marcada como obrigatória para continuar.'
			: !isCoreTemplateReady
				? 'Preencha nome, valor e dia do vencimento para liberar a categoria.'
				: 'Selecione a categoria obrigatória que identifica este template.';

	const reminderHelperMessage = !isTemplateReady
		? 'Preencha nome, valor, vencimento e categoria antes de ativar o lembrete.'
		: reminderEnabled
			? `Lembrete mensal ativo para o dia ${dueDay.padStart(2, '0')} às 09:00.`
			: 'Ative para receber um lembrete mensal no dia configurado.';

	const resetForm = React.useCallback((options?: { keepTag?: boolean }) => {
		setSelectedExpenseId(null);
		setExpenseName('');
		setValueDisplay('');
		setValueInCents(null);
		setDueDay('');
		setDescription('');
		setReminderEnabled(true);
		setSelectedTagId(current => {
			if (options?.keepTag && current) {
				return current;
			}
			return null;
		});
		setCurrentPaymentInfo(null);
		setPersistedFormSnapshot(null);
	}, []);

	const loadTags = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showNotifierAlert({
				description: 'Usuário não autenticado. Faça login novamente.',
				type: 'error',
				isDarkMode,
			});
			return;
		}

		setIsLoadingTags(true);

		try {
			const [tagsResponse, relatedUsersResult] = await Promise.all([
				getAllTagsFirebase(),
				getRelatedUsersIDsFirebase(currentUser.uid),
			]);

			if (!tagsResponse.success || !Array.isArray(tagsResponse.data)) {
				throw new Error('Não foi possível carregar as tags.');
			}

			const relatedIds =
				relatedUsersResult.success && Array.isArray(relatedUsersResult.data) ? relatedUsersResult.data : [];
			const allowedIds = new Set<string>([currentUser.uid, ...relatedIds.filter(id => typeof id === 'string')]);

			const formattedTags: TagOption[] = tagsResponse.data
				.filter((tag: any) => {
					const usageType = typeof tag?.usageType === 'string' ? tag.usageType : undefined;
					const isMandatory = Boolean(tag?.isMandatoryExpense);
					const belongsToAllowedUser = allowedIds.has(String(tag?.personId));
					return usageType === 'expense' && isMandatory && belongsToAllowedUser;
				})
				.map((tag: any) => ({
					id: tag.id,
					name: typeof tag?.name === 'string' && tag.name.trim().length > 0 ? tag.name.trim() : 'Tag sem nome',
					iconFamily: typeof tag?.iconFamily === 'string' ? tag.iconFamily : null,
					iconName: typeof tag?.iconName === 'string' ? tag.iconName : null,
					iconStyle: typeof tag?.iconStyle === 'string' ? tag.iconStyle : null,
				}))
				.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

			setTagOptions(formattedTags);
			setSelectedTagId(current =>
				current && formattedTags.some(tag => tag.id === current) ? current : null,
			);

			if (formattedTags.length === 0) {
				showNotifierAlert({
					description: 'Cadastre uma tag de despesas marcada como obrigatória para utilizar esta tela.',
					type: 'warn',
					isDarkMode,
				});
			}
		} catch (error) {
			console.error('Erro ao carregar tags obrigatórias:', error);
			showNotifierAlert({
				description: 'Erro ao carregar tags obrigatórias.',
				type: 'error',
				isDarkMode,
			});
		} finally {
			setIsLoadingTags(false);
		}
	}, []);

	useFocusEffect(
		React.useCallback(() => {
			void loadTags();
			return () => { };
		}, [loadTags]),
	);

	React.useEffect(() => {
		let isMounted = true;

		const prefillExpense = async () => {
			if (!editingExpenseId) {
				resetForm({ keepTag: true });
				return;
			}

			setIsPrefilling(true);

			try {
				const response = await getMandatoryExpenseFirebase(editingExpenseId);

				if (!isMounted) {
					return;
				}

				if (!response.success || !response.data) {
					showNotifierAlert({
						description: 'Não foi possível carregar os dados do gasto obrigatório.',
						type: 'error',
						isDarkMode,
					});
					resetForm({ keepTag: true });
					return;
				}

				const data = response.data as Record<string, unknown>;

				const name = typeof data.name === 'string' ? data.name : '';
				const value = typeof data.valueInCents === 'number' ? data.valueInCents : 0;
				const dueDayValue = typeof data.dueDay === 'number' ? data.dueDay : 1;
				const tagId = typeof data.tagId === 'string' ? data.tagId : null;
				const descriptionValue = typeof data.description === 'string' ? data.description : '';
				const reminderFlag = data.reminderEnabled !== false;
				const lastPaymentExpenseId =
					typeof data.lastPaymentExpenseId === 'string' && data.lastPaymentExpenseId.length > 0
						? data.lastPaymentExpenseId
						: null;
				const lastPaymentCycle =
					typeof data.lastPaymentCycle === 'string' && data.lastPaymentCycle.length > 0
						? data.lastPaymentCycle
						: null;
				const lastPaymentDate = normalizeDateValue(data.lastPaymentDate ?? null);

				setSelectedExpenseId(editingExpenseId);
				setExpenseName(name);
				setValueInCents(value);
				setValueDisplay(value ? formatCurrencyBRL(value) : '');
				setDueDay(String(dueDayValue).padStart(2, '0'));
				setSelectedTagId(tagId);
				setDescription(descriptionValue);
				setReminderEnabled(reminderFlag);
				setCurrentPaymentInfo({
					expenseId: lastPaymentExpenseId,
					cycleKey: lastPaymentCycle,
					paidAt: lastPaymentDate,
				});
				setPersistedFormSnapshot({
					name: name.trim(),
					valueInCents: value,
					dueDay: String(dueDayValue).padStart(2, '0'),
					tagId,
					description: descriptionValue.trim(),
					reminderEnabled: reminderFlag,
				});
			} catch (error) {
				console.error('Erro ao carregar gasto obrigatório para edição:', error);
				if (isMounted) {
					showNotifierAlert({
						description: 'Erro ao carregar o gasto obrigatório selecionado.',
						type: 'error',
						isDarkMode,
					});
					resetForm({ keepTag: true });
				}
			} finally {
				if (isMounted) {
					setIsPrefilling(false);
				}
			}
		};

		void prefillExpense();

		return () => {
			isMounted = false;
		};
	}, [editingExpenseId, resetForm]);

	const handleSubmit = React.useCallback(async () => {
		const trimmedName = expenseName.trim();

		if (!trimmedName) {
			showNotifierAlert({
				title: 'Erro ao salvar gasto obrigatório',
				description: 'Informe o nome do gasto obrigatório.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (valueInCents === null || valueInCents <= 0) {
			showNotifierAlert({
				title: 'Erro ao salvar gasto obrigatório',
				description: 'Informe um valor válido.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (!isDueDayValid) {
			showNotifierAlert({
				title: 'Erro ao salvar gasto obrigatório',
				description: 'Informe um dia do mês entre 1 e 31.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (!selectedTagId) {
			showNotifierAlert({
				title: 'Erro ao salvar gasto obrigatório',
				description: 'Selecione uma tag obrigatória.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		const currentUser = auth.currentUser;
		if (!currentUser) {
			showNotifierAlert({
				title: 'Erro ao salvar gasto obrigatório',
				description: 'Usuário não autenticado.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		setIsSubmitting(true);

		try {
			const payload = {
				name: trimmedName,
				valueInCents,
				dueDay: Number(dueDay),
				tagId: selectedTagId,
				description: description.trim().length > 0 ? description.trim() : null,
				reminderEnabled,
				reminderHour: 9,
				reminderMinute: 0,
			};

			let persistedExpenseId = selectedExpenseId;
			const successTitle = selectedExpenseId ? 'Gasto obrigatório atualizado' : 'Gasto obrigatório registrado';

			if (selectedExpenseId) {
				const result = await updateMandatoryExpenseFirebase({
					expenseId: selectedExpenseId,
					...payload,
				});

				if (!result.success) {
					throw new Error('Erro ao atualizar o gasto obrigatório.');
				}
			} else {
				const result = await addMandatoryExpenseFirebase({
					...payload,
					personId: currentUser.uid,
				});

				if (!result.success || !result.id) {
					throw new Error('Erro ao registrar gasto obrigatório.');
				}
				persistedExpenseId = result.id;
			}

			let reminderFeedback: MandatoryReminderScheduleResult | null = null;

			if (persistedExpenseId) {
				if (reminderEnabled) {
					reminderFeedback = await scheduleMandatoryExpenseNotification({
						expenseId: persistedExpenseId,
						name: payload.name,
						dueDay: payload.dueDay,
						reminderHour: payload.reminderHour,
						reminderMinute: payload.reminderMinute,
						description: payload.description ?? undefined,
						requestPermission: true,
					});
				} else {
					await cancelMandatoryExpenseNotification(persistedExpenseId);
					reminderFeedback = null;
				}
			}

			if (reminderEnabled && reminderFeedback && !reminderFeedback.success) {
				showNotifierAlert({
					title: successTitle,
					description: `O template foi salvo, mas o lembrete não foi agendado. ${reminderFeedback.message}`,
					type: 'warn',
					isDarkMode,
					duration: 5000,
				});
			} else {
				showNotifierAlert({
					title: successTitle,
					description:
						reminderEnabled && reminderFeedback?.success
							? `Lembrete ativo. Próximo aviso em ${formatMandatoryReminderNextTrigger(reminderFeedback.nextTriggerAt)}.`
							: 'Template salvo com lembrete mensal desativado.',
					type: 'success',
					isDarkMode,
					duration: 4000,
				});
			}

			resetForm({ keepTag: true });
			router.back();
		} catch (error) {
			console.error('Erro ao salvar gasto obrigatório:', error);
			showNotifierAlert({
				title: 'Erro ao salvar gasto obrigatório',
				description: 'Não foi possível salvar o gasto obrigatório.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
		} finally {
			setIsSubmitting(false);
		}
	}, [
		description,
		dueDay,
		expenseName,
		isDarkMode,
		isDueDayValid,
		reminderEnabled,
		resetForm,
		router,
		selectedExpenseId,
		selectedTagId,
		valueInCents,
	]);

	const isPaidForCurrentCycle = React.useMemo(() => isCycleKeyCurrent(currentPaymentInfo?.cycleKey), [currentPaymentInfo?.cycleKey]);

	const handleRegisterPaymentNavigation = React.useCallback(() => {
		if (!selectedExpenseId) {
			showNotifierAlert({
				title: 'Controle mensal indisponível',
				description: 'Salve o gasto obrigatório antes de registrá-lo como despesa.',
				type: 'warn',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (isPaidForCurrentCycle) {
			showNotifierAlert({
				title: 'Pagamento já registrado',
				description: 'Este gasto já foi registrado como pago neste mês.',
				type: 'warn',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (!isTemplateReady || hasPendingTemplateChanges) {
			showNotifierAlert({
				title: 'Salve as alterações primeiro',
				description: 'Salve o template atualizado antes de registrar a despesa deste mês.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		const requiredValueInCents = valueInCents;
		const requiredTagId = selectedTagId;
		if (requiredValueInCents === null || !requiredTagId) {
			return;
		}

		const params: Record<string, string> = {
			templateName: encodeURIComponent(expenseName || 'Gasto obrigatório'),
			templateValueInCents: String(requiredValueInCents),
			templateTagId: requiredTagId,
			templateDueDay: dueDay || '1',
			templateMandatoryExpenseId: selectedExpenseId,
		};

		if (selectedTagLabel) {
			params.templateTagName = encodeURIComponent(selectedTagLabel);
		}
		if (description.trim().length > 0) {
			params.templateDescription = encodeURIComponent(description.trim());
		}

		router.push({
			pathname: '/add-register-expenses',
			params,
		});
	}, [
		description,
		dueDay,
		expenseName,
		hasPendingTemplateChanges,
		isDarkMode,
		isPaidForCurrentCycle,
		isTemplateReady,
		selectedExpenseId,
		selectedTagId,
		selectedTagLabel,
		valueInCents,
	]);

	const handleReclaimPayment = React.useCallback(async () => {
		if (!selectedExpenseId) {
			return;
		}

		setIsPaymentActionLoading(true);

		try {
			const relatedExpenseId = currentPaymentInfo?.expenseId;

			if (relatedExpenseId) {
				await deleteExpenseFirebase(relatedExpenseId);
			}

			const result = await clearMandatoryExpensePaymentFirebase(selectedExpenseId);
			if (!result.success) {
				throw new Error('Erro ao remover o registro de pagamento.');
			}

			setCurrentPaymentInfo(null);
			showNotifierAlert({
				title: 'Pagamento do mês desfeito',
				description: 'O registro mensal foi removido. Faça um novo lançamento quando necessário.',
				type: 'success',
				isDarkMode,
				duration: 4000,
			});
		} catch (error) {
			console.error('Erro ao reivindicar pagamento do gasto obrigatório:', error);
			showNotifierAlert({
				title: 'Erro ao desfazer pagamento',
				description: 'Não foi possível desfazer o pagamento. Tente novamente.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
		} finally {
			setIsPaymentActionLoading(false);
		}
	}, [currentPaymentInfo?.expenseId, isDarkMode, selectedExpenseId]);

	const isSaveDisabled =
		!isTemplateReady || isFormBusy;
	const screenTitle = selectedExpenseId ? 'Editar gasto obrigatório' : 'Registrar gasto obrigatório';
	const isInitialLoading = isLoadingTags || isPrefilling;
	const monthlyControlMessage = !selectedExpenseId
		? 'Salve este template para liberar o registro do ciclo atual.'
		: hasPendingTemplateChanges
			? 'Salve as alterações para usar os dados atualizados ao registrar o pagamento deste mês.'
			: isPaidForCurrentCycle
				? `Pagamento registrado em ${currentPaymentInfo?.paidAt ? formatDateToBR(currentPaymentInfo.paidAt) : 'data não disponível'}.`
				: `Pronto para registrar o ciclo ${getCurrentCycleKey()}. O banco e a data exata serão definidos no próximo passo.`;

	return (
		<SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<KeyboardAvoidingView
					behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
					keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
					className="flex-1 w-full"
				>
					<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
						<View className={`absolute top-0 left-0 right-0 ${cardBackground}`} style={{ height: heroHeight }}>
							<Image
								source={LoginWallpaper}
								alt="Background da tela de gasto obrigatório"
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
								<AddMandatoryExpensesListIllustration width="38%" height="38%" className="opacity-90" />
							</VStack>
						</View>

						<ScrollView
							ref={scrollViewRef}
							keyboardShouldPersistTaps="handled"
							keyboardDismissMode="on-drag"
							className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
							style={{ marginTop: heroHeight - 64 }}
							contentContainerStyle={{ paddingBottom: contentBottomPadding }}
						>
							<VStack className="justify-between">
								{isInitialLoading ? (
									<MandatoryExpenseFormSkeleton
										bodyText={bodyText}
										tintedCardClassName={tintedCardClassName}
										compactCardClassName={compactCardClassName}
										fieldContainerClassName={fieldContainerClassName}
										skeletonBaseColor={skeletonBaseColor}
										skeletonHighlightColor={skeletonHighlightColor}
										skeletonMutedBaseColor={skeletonMutedBaseColor}
										skeletonMutedHighlightColor={skeletonMutedHighlightColor}
									/>
								) : (
									<VStack className="mt-4 gap-4">
									<VStack className="gap-2">
										<Text className={`${bodyText} ml-1 text-sm`}>Nome da despesa</Text>
										<Input className={fieldContainerClassName} isDisabled={isFormBusy}>
											<InputField
												ref={expenseNameInputRef}
												placeholder="Ex: Aluguel, Luz, Internet..."
												value={expenseName}
												onChangeText={setExpenseName}
												autoCapitalize="sentences"
												returnKeyType="next"
												className={inputField}
												onFocus={() => handleInputFocus('expense-name')}
												onSubmitEditing={() => expenseValueInputRef.current?.focus?.()}
											/>
										</Input>
									</VStack>

									<VStack className="gap-2">
										<Text className={`${bodyText} ml-1 text-sm`}>Valor mensal</Text>
										<Input className={fieldContainerClassName} isDisabled={isValueFieldDisabled}>
											<InputField
												ref={expenseValueInputRef}
												placeholder="Ex: R$ 700,00"
												value={valueDisplay}
												onChangeText={handleValueChange}
												keyboardType="numeric"
												returnKeyType="next"
												className={inputField}
												onFocus={() => handleInputFocus('expense-value')}
												onSubmitEditing={() => dueDayInputRef.current?.focus?.()}
											/>
										</Input>
									</VStack>

									<VStack className="gap-2">
										<Text className={`${bodyText} ml-1 text-sm`}>Dia do vencimento</Text>
										<Input className={fieldContainerClassName} isDisabled={isDueDayFieldDisabled}>
											<InputField
												ref={dueDayInputRef}
												placeholder="Informe um dia entre 1 e 31"
												value={dueDay}
												onChangeText={handleDueDayChange}
												keyboardType="numeric"
												returnKeyType="done"
												className={inputField}
												onFocus={() => handleInputFocus('due-day')}
											/>
										</Input>
										{dueDay.length > 0 && !isDueDayValid ? (
											<Text className="ml-1 text-sm text-red-500 dark:text-red-400">
												Informe um dia válido entre 1 e 31.
											</Text>
										) : null}
									</VStack>

									<VStack className="gap-2">
										<Text className={`${bodyText} ml-1 text-sm`}>Categoria obrigatória</Text>
										<Select
											selectedValue={selectedTagId ?? undefined}
											onValueChange={setSelectedTagId}
											isDisabled={isTagSelectDisabled}
										>
											<HStack className="items-end gap-3">
												<View
													className={`h-10 w-10 items-center justify-center rounded-2xl ${selectedTagIconContainerClassName}`}
												>
													<TagIcon
														iconFamily={selectedTagOption?.iconFamily}
														iconName={selectedTagOption?.iconName}
														iconStyle={selectedTagOption?.iconStyle}
														size={18}
														color={selectedTagIconColor}
													/>
												</View>
												<View className="flex-1">
													<SelectTrigger variant="outline" size="md" className={fieldContainerClassName}>
														<SelectInput
															placeholder="Selecione a categoria da despesa"
															value={selectedTagLabel ?? ''}
															className={inputField}
														/>
														<SelectIcon />
													</SelectTrigger>
												</View>
											</HStack>
											<SelectPortal>
												<SelectBackdrop />
												<SelectContent>
													<SelectDragIndicatorWrapper>
														<SelectDragIndicator />
													</SelectDragIndicatorWrapper>
													{tagOptions.length > 0 ? (
														tagOptions.map(tag => <SelectItem key={tag.id} label={tag.name} value={tag.id} />)
													) : (
														<SelectItem label="Nenhuma tag disponível" value="no-tag" isDisabled />
													)}
												</SelectContent>
											</SelectPortal>
										</Select>
										<Text className={`${helperText} ml-1 text-sm`}>{tagHelperMessage}</Text>
									</VStack>

									<VStack className="gap-2">
										<Text className={`${bodyText} ml-1 text-sm`}>Observações</Text>
										<Textarea className={textareaContainerClassName} isDisabled={isDescriptionDisabled}>
											<TextareaInput
												ref={descriptionInputRef}
												placeholder="Adicione um contexto rápido para este gasto"
												multiline
												value={description}
												onChangeText={setDescription}
												className={`${inputField} pt-2`}
												onFocus={() => handleInputFocus('description')}
												editable={!isDescriptionDisabled}
											/>
										</Textarea>
									</VStack>

									<Box className={`${tintedCardClassName} px-4 py-4`}>
										<VStack className="gap-3">
											<VStack className="gap-1">
												<Text className="font-semibold">Controle do mês</Text>
												<Text className={`${helperText} text-sm`}>
													{monthlyControlMessage}
												</Text>
											</VStack>

											{selectedExpenseId ? (
												isPaidForCurrentCycle ? (
													<Button
														variant="outline"
														action="secondary"
														onPress={handleReclaimPayment}
														isDisabled={isPaymentActionLoading}
													>
														{isPaymentActionLoading ? (
															<>
																<ButtonSpinner />
																<ButtonText>Processando</ButtonText>
															</>
														) : (
															<ButtonText>Desfazer pagamento do mês</ButtonText>
														)}
													</Button>
												) : (
													<Button
														variant="outline"
														action="primary"
														onPress={handleRegisterPaymentNavigation}
														isDisabled={
															isFormBusy ||
															!selectedExpenseId ||
															!isTemplateReady ||
															hasPendingTemplateChanges
														}
													>
														<ButtonText>Registrar despesa do mês</ButtonText>
													</Button>
												)
											) : null}
										</VStack>
									</Box>

									<Box className={`${compactCardClassName} px-4 py-4`}>
										<HStack className="items-center justify-between gap-4">
											<VStack className="flex-1 gap-1">
												<Text className="font-semibold">Lembrete do vencimento</Text>
												<Text className={`${helperText} text-sm`}>
													{reminderHelperMessage}
												</Text>
											</VStack>
											<Switch
												value={reminderEnabled}
												onValueChange={handleReminderToggle}
												disabled={isFormBusy}
												trackColor={{ false: '#d4d4d4', true: '#525252' }}
												thumbColor="#fafafa"
												ios_backgroundColor="#d4d4d4"
											/>
										</HStack>
									</Box>

									<Button className={submitButtonClassName} onPress={handleSubmit} isDisabled={isSaveDisabled}>
										{isSubmitting ? (
											<>
												<ButtonSpinner />
												<ButtonText>{selectedExpenseId ? 'Atualizando' : 'Registrando'}</ButtonText>
											</>
										) : (
											<ButtonText>{selectedExpenseId ? 'Atualizar gasto' : 'Registrar gasto'}</ButtonText>
										)}
									</Button>
								</VStack>
								)}
							</VStack>
						</ScrollView>
					</View>
				</KeyboardAvoidingView>

				<View style={{ marginHorizontal: -18, paddingBottom: 0, flexShrink: 0 }}>
					<Navigator defaultValue={1} />
				</View>
			</View>
		</SafeAreaView>
	);
}
