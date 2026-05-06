import React from 'react';
import {
	ScrollView,
	View,
	StatusBar,
	KeyboardAvoidingView,
	Platform,
	Keyboard,
	TextInput,
	Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';
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

import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import Navigator from '@/components/uiverse/navigator';
import TagActionsheetSelector, { type TagActionsheetOption } from '@/components/uiverse/tag-actionsheet-selector';

import { auth } from '@/FirebaseConfig';
import { getAllTagsFirebase, getTagDataFirebase } from '@/functions/TagFirebase';
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
import { clearPendingCreatedTag, peekPendingCreatedTag } from '@/utils/pendingCreatedTag';
import { isTagVisibleInMandatoryUsageList, tagSupportsUsage } from '@/utils/tagUsage';
import { navigateToHomeDashboard } from '@/utils/navigation';
import {
	formatMandatoryReminderNextTrigger,
	type MandatoryReminderScheduleResult,
} from '@/utils/mandatoryReminderNotifications';
import { getCurrentCycleKey, isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import { deleteExpenseFirebase } from '@/functions/ExpenseFirebase';
import { MAX_MONTHLY_BUSINESS_DAY, formatConfiguredMonthlyDueLabel } from '@/utils/businessCalendar';
import {
	MAX_MANDATORY_INSTALLMENTS,
	formatMandatoryInstallmentLabel,
	isMandatoryInstallmentPlanComplete,
	normalizeMandatoryInstallmentTotal,
	normalizeMandatoryInstallmentsCompleted,
	sanitizeMandatoryInstallmentInput,
} from '@/utils/mandatoryInstallments';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';

// Importação do SVG
import AddMandatoryExpensesListIllustration from '../assets/UnDraw/addMandatoryExpensesScreen.svg';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { Info } from 'lucide-react-native';
import {
	DEFAULT_MANDATORY_REMINDER_HOUR,
	DEFAULT_MANDATORY_REMINDER_MINUTE,
	DEFAULT_MANDATORY_REMINDER_TIME,
	finalizeMandatoryReminderTimeInput,
	formatMandatoryReminderTime,
	formatMandatoryReminderTimeInput,
	isMandatoryReminderTimeValid,
	parseMandatoryReminderTime,
} from '@/utils/mandatoryReminderTime';

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
	usesBusinessDays: boolean;
	tagId: string | null;
	installmentTotal: number | null;
	description: string;
	reminderTime: string;
	reminderEnabled: boolean;
};
type FocusableInputKey = 'expense-name' | 'expense-value' | 'due-day' | 'installments' | 'description' | 'reminder-time';

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

export default function AddMandatoryExpensesScreen() {
	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		fieldContainerClassName,
		fieldContainerCardClassName,
		textareaContainerClassName,
		submitButtonClassName,
		heroHeight,
		insets,
		compactCardClassName,
		notTintedCardClassName,
		topSummaryCardClassName,
		infoCardStyle,
		switchTrackColor,
		switchThumbColor,
		switchIosBackgroundColor,
	} = useScreenStyles();
	const params = useLocalSearchParams<{ expenseId?: string | string[] }>();
	const editingExpenseId = React.useMemo(() => {
		const raw = Array.isArray(params.expenseId) ? params.expenseId[0] : params.expenseId;
		return raw && raw.trim().length > 0 ? raw : null;
	}, [params.expenseId]);

	const [tagOptions, setTagOptions] = React.useState<TagOption[]>([]);
	const [selectedTagId, setSelectedTagId] = React.useState<string | null>(null);
	const [selectedTagName, setSelectedTagName] = React.useState<string | null>(null);
	const [isLoadingTags, setIsLoadingTags] = React.useState(false);

	const [expenseName, setExpenseName] = React.useState('');
	const [valueDisplay, setValueDisplay] = React.useState('');
	const [valueInCents, setValueInCents] = React.useState<number | null>(null);
	const [dueDay, setDueDay] = React.useState('');
	const [usesBusinessDays, setUsesBusinessDays] = React.useState(false);
	const [installmentsEnabled, setInstallmentsEnabled] = React.useState(false);
	const [installmentTotal, setInstallmentTotal] = React.useState('');
	const [settledInstallmentsCount, setSettledInstallmentsCount] = React.useState(0);
	const [description, setDescription] = React.useState('');
	// Segue [[Despesas Fixas]]: o lembrete só é liberado quando o template base estiver completo.
	const [reminderEnabled, setReminderEnabled] = React.useState(false);
	const [reminderTime, setReminderTime] = React.useState(DEFAULT_MANDATORY_REMINDER_TIME);
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
		return tagOptions.find(tag => tag.id === selectedTagId)?.name ?? selectedTagName ?? null;
	}, [selectedTagId, selectedTagName, tagOptions]);

	const expenseNameInputRef = React.useRef<TextInput | null>(null);
	const expenseValueInputRef = React.useRef<TextInput | null>(null);
	const dueDayInputRef = React.useRef<TextInput | null>(null);
	const installmentsInputRef = React.useRef<TextInput | null>(null);
	const descriptionInputRef = React.useRef<TextInput | null>(null);
	const reminderTimeInputRef = React.useRef<TextInput | null>(null);
	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => {
			if (key === 'description') {
				return 180;
			}

			if (key === 'reminder-time') {
				return 150;
			}

			return 120;
		},
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

	const handleInstallmentTotalChange = React.useCallback((input: string) => {
		setInstallmentTotal(sanitizeMandatoryInstallmentInput(input));
	}, []);

	const handleInstallmentsToggle = React.useCallback((value: boolean) => {
		setInstallmentsEnabled(value);
		if (value) {
			setInstallmentTotal(currentValue => currentValue || String(Math.max(1, settledInstallmentsCount)));
		}
	}, [settledInstallmentsCount]);

	const handleReminderTimeChange = React.useCallback((input: string) => {
		setReminderTime(formatMandatoryReminderTimeInput(input));
	}, []);

	const handleReminderTimeBlur = React.useCallback(() => {
		setReminderTime(currentValue => finalizeMandatoryReminderTimeInput(currentValue) ?? currentValue);
	}, []);

	const isDueDayValid = React.useMemo(() => {
		if (!dueDay) {
			return false;
		}
		const parsed = Number(dueDay);
		const maxDueDay = usesBusinessDays ? MAX_MONTHLY_BUSINESS_DAY : 31;
		return !Number.isNaN(parsed) && parsed >= 1 && parsed <= maxDueDay;
	}, [dueDay, usesBusinessDays]);

	const normalizedInstallmentTotal = React.useMemo(() => {
		if (!installmentsEnabled || installmentTotal.trim().length === 0) {
			return null;
		}

		return normalizeMandatoryInstallmentTotal(Number(installmentTotal));
	}, [installmentTotal, installmentsEnabled]);

	const isInstallmentTotalValid = !installmentsEnabled || normalizedInstallmentTotal !== null;
	const isInstallmentTotalBelowSettled =
		installmentsEnabled &&
		normalizedInstallmentTotal !== null &&
		normalizedInstallmentTotal < settledInstallmentsCount;

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
						? 'Os lembretes não funcionam no Expo Go. Gere um build de desenvolvimento ou produção para testar as notificações deste gasto.'
						: 'Ative as notificações do aplicativo nas configurações do dispositivo para receber lembretes.',
				type: 'warn',
				isDarkMode,
				duration: 4500,
			});
			return;
		}
		setReminderTime(currentValue => finalizeMandatoryReminderTimeInput(currentValue) ?? DEFAULT_MANDATORY_REMINDER_TIME);
		setReminderEnabled(value);
	}, [expenseName, isDarkMode, isDueDayValid, selectedTagId, valueInCents]);

	const isReminderTimeValid = React.useMemo(() => isMandatoryReminderTimeValid(reminderTime), [reminderTime]);
	const formattedReminderTimeLabel = React.useMemo(
		() =>
			formatMandatoryReminderTime(
				parseMandatoryReminderTime(reminderTime)?.hour ?? DEFAULT_MANDATORY_REMINDER_HOUR,
				parseMandatoryReminderTime(reminderTime)?.minute ?? DEFAULT_MANDATORY_REMINDER_MINUTE,
			),
		[reminderTime],
	);

	const getInputRef = React.useCallback(
		(key: FocusableInputKey) => {
			switch (key) {
				case 'expense-name':
					return expenseNameInputRef;
				case 'expense-value':
					return expenseValueInputRef;
				case 'due-day':
					return dueDayInputRef;
				case 'installments':
					return installmentsInputRef;
				case 'description':
					return descriptionInputRef;
				case 'reminder-time':
					return reminderTimeInputRef;
				default:
					return null;
			}
		},
		[],
	);

	const {
		scrollViewRef,
		contentBottomPadding,
		handleInputFocus,
		handleScroll,
		scrollEventThrottle,
	} = useKeyboardAwareScroll<FocusableInputKey>({
		getInputRef,
		keyboardScrollOffset,
	});

	const buildFormSnapshot = React.useCallback(
		(): MandatoryExpenseFormSnapshot => ({
			name: expenseName.trim(),
			valueInCents,
			dueDay: dueDay.trim(),
			usesBusinessDays,
			tagId: selectedTagId,
			installmentTotal: installmentsEnabled ? normalizedInstallmentTotal : null,
			description: description.trim(),
			reminderTime,
			reminderEnabled,
		}),
		[
			description,
			dueDay,
			expenseName,
			installmentsEnabled,
			normalizedInstallmentTotal,
			reminderEnabled,
			reminderTime,
			selectedTagId,
			usesBusinessDays,
			valueInCents,
		],
	);

	const hasExpenseName = expenseName.trim().length > 0;
	const hasExpenseValue = valueInCents !== null && valueInCents > 0;
	const isFormBusy = isSubmitting || isPrefilling;
	const isCoreTemplateReady = hasExpenseName && hasExpenseValue && isDueDayValid;
	const isInstallmentConfigReady = !installmentsEnabled || (isInstallmentTotalValid && !isInstallmentTotalBelowSettled);
	const isTemplateReady = isCoreTemplateReady && Boolean(selectedTagId) && isInstallmentConfigReady;
	const isValueFieldDisabled = !hasExpenseName || isFormBusy;
	const isDueDayFieldDisabled = !hasExpenseName || !hasExpenseValue || isFormBusy;
	const isInstallmentFieldDisabled = !isCoreTemplateReady || isFormBusy;
	const isTagSelectDisabled = isLoadingTags || !isCoreTemplateReady || isFormBusy;
	const isAddTagButtonDisabled = isFormBusy;
	const isDescriptionDisabled = !isTemplateReady || isFormBusy;
	const isReminderTimeFieldDisabled = !reminderEnabled || isFormBusy;
	const hasPendingTemplateChanges = React.useMemo(() => {
		if (!selectedExpenseId || !persistedFormSnapshot) {
			return false;
		}

		const currentSnapshot = buildFormSnapshot();
		return (
			currentSnapshot.name !== persistedFormSnapshot.name ||
			currentSnapshot.valueInCents !== persistedFormSnapshot.valueInCents ||
			currentSnapshot.dueDay !== persistedFormSnapshot.dueDay ||
			currentSnapshot.usesBusinessDays !== persistedFormSnapshot.usesBusinessDays ||
			currentSnapshot.tagId !== persistedFormSnapshot.tagId ||
			currentSnapshot.installmentTotal !== persistedFormSnapshot.installmentTotal ||
			currentSnapshot.description !== persistedFormSnapshot.description ||
			currentSnapshot.reminderTime !== persistedFormSnapshot.reminderTime ||
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
			? isReminderTimeValid
				? `Lembrete ativo para ${formatConfiguredMonthlyDueLabel(Number(dueDay || '1'), usesBusinessDays)} às ${formattedReminderTimeLabel}.`
				: 'Defina um horário válido no padrão 24h para agendar o lembrete.'
			: 'Ative para receber um lembrete mensal no dia configurado.';

	const dueDayFieldLabel = usesBusinessDays ? 'Número do dia útil do vencimento' : 'Dia do vencimento';
	const dueDayPlaceholder = usesBusinessDays
		? `Informe um número entre 1 e ${MAX_MONTHLY_BUSINESS_DAY}`
		: 'Informe um dia entre 1 e 31';
	const dueDayErrorMessage = usesBusinessDays
		? `Informe um dia útil válido entre 1 e ${MAX_MONTHLY_BUSINESS_DAY}.`
		: 'Informe um dia válido entre 1 e 31.';
	const dueDayHelperMessage = usesBusinessDays
		? 'Use a posição do dia útil no mês. Ex.: 5 = quinto dia útil. Fins de semana e feriados nacionais do Brasil não contam.'
		: 'Use um dia fixo do mês. Se a data coincidir com feriado nacional, o calendário destacará esse dia em roxo.';
	const businessDayToggleHelperMessage = usesBusinessDays
		? `Esta despesa será tratada como ${formatConfiguredMonthlyDueLabel(Number(dueDay || '1'), true)}. Se o mês tiver menos dias úteis, usamos o último dia útil disponível.`
		: 'Ative quando o vencimento seguir um dia útil do mês, como uma cobrança no 5º dia útil.';
	const isPaidForCurrentCycle = React.useMemo(() => isCycleKeyCurrent(currentPaymentInfo?.cycleKey), [currentPaymentInfo?.cycleKey]);
	const isInstallmentPlanCompleted = React.useMemo(
		() => isMandatoryInstallmentPlanComplete(normalizedInstallmentTotal, settledInstallmentsCount),
		[normalizedInstallmentTotal, settledInstallmentsCount],
	);
	const installmentHelperMessage = !isCoreTemplateReady
		? 'Preencha nome, valor e vencimento para liberar o parcelamento.'
		: !installmentsEnabled
			? 'Deixe desligado para uma despesa fixa mensal sem limite de parcelas.'
			: !isInstallmentTotalValid
				? `Informe uma quantidade de parcelas entre 1 e ${MAX_MANDATORY_INSTALLMENTS}.`
				: isInstallmentTotalBelowSettled
					? `Este gasto já tem ${settledInstallmentsCount} parcela(s) registrada(s). Use uma quantidade igual ou maior.`
					: normalizedInstallmentTotal
						? `A listagem exibirá ${formatMandatoryInstallmentLabel(normalizedInstallmentTotal, settledInstallmentsCount, isPaidForCurrentCycle) ?? 'o progresso das parcelas'}.`
						: 'Informe a quantidade total de parcelas.';

	const resetForm = React.useCallback((options?: { keepTag?: boolean }) => {
		setSelectedExpenseId(null);
		setExpenseName('');
		setValueDisplay('');
		setValueInCents(null);
		setDueDay('');
		setUsesBusinessDays(false);
		setInstallmentsEnabled(false);
		setInstallmentTotal('');
		setSettledInstallmentsCount(0);
		setDescription('');
		setReminderEnabled(false);
		setReminderTime(DEFAULT_MANDATORY_REMINDER_TIME);
		setSelectedTagId(current => {
			if (options?.keepTag && current) {
				return current;
			}
			return null;
		});
		setCurrentPaymentInfo(null);
		setPersistedFormSnapshot(null);
	}, []);

	// Segue [[Despesas Fixas]] e [[Gerenciamento de Tags]]: a categoria obrigatória pode ser criada inline e voltar já elegível neste filtro.
	const handleOpenAddTagScreen = React.useCallback(() => {
		if (isAddTagButtonDisabled) {
			return;
		}

		Keyboard.dismiss();
		router.push({
			pathname: '/add-register-tag',
			params: {
				usageType: 'expense',
				returnAfterCreate: '1',
				isMandatoryExpense: '1',
			},
		});
	}, [isAddTagButtonDisabled]);

	const handleSelectTag = React.useCallback((tag: TagActionsheetOption) => {
		setSelectedTagId(tag.id);
		setSelectedTagName(tag.name);
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
					const belongsToAllowedUser = allowedIds.has(String(tag?.personId));
					return isTagVisibleInMandatoryUsageList(tag, 'expense') && belongsToAllowedUser;
				})
				.map((tag: any) => ({
					id: tag.id,
					name: typeof tag?.name === 'string' && tag.name.trim().length > 0 ? tag.name.trim() : 'Tag sem nome',
					iconFamily: typeof tag?.iconFamily === 'string' ? tag.iconFamily : null,
					iconName: typeof tag?.iconName === 'string' ? tag.iconName : null,
					iconStyle: typeof tag?.iconStyle === 'string' ? tag.iconStyle : null,
				}))
				.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
			const pendingCreatedTag = peekPendingCreatedTag();
			const matchingPendingTag =
				pendingCreatedTag && tagSupportsUsage(pendingCreatedTag.usageType, 'expense')
					? formattedTags.find(tag => tag.id === pendingCreatedTag.tagId) ?? null
					: null;

			setTagOptions(formattedTags);
			if (matchingPendingTag) {
				setSelectedTagId(matchingPendingTag.id);
				setSelectedTagName(matchingPendingTag.name);
				clearPendingCreatedTag(matchingPendingTag.id);
			} else {
				setSelectedTagId(current =>
					current && formattedTags.some(tag => tag.id === current) ? current : null,
				);
			}

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
	}, [isDarkMode]);

	useFocusEffect(
		React.useCallback(() => {
			void loadTags();
			return () => { };
		}, [loadTags]),
	);

	React.useEffect(() => {
		const matchedTag = tagOptions.find(tag => tag.id === selectedTagId);
		if (matchedTag) {
			setSelectedTagName(matchedTag.name);
			return;
		}

		if (!selectedTagId) {
			setSelectedTagName(null);
			return;
		}

		let isMounted = true;

		const fetchTagData = async () => {
			try {
				const tagResult = await getTagDataFirebase(selectedTagId);

				if (!isMounted) {
					return;
				}

				if (tagResult.success && tagResult.data && typeof tagResult.data.name === 'string') {
					setSelectedTagName(tagResult.data.name);
					return;
				}

				setSelectedTagName(null);
			} catch (error) {
				console.error('Erro ao buscar dados da tag obrigatória de despesa:', error);
				if (isMounted) {
					setSelectedTagName(null);
				}
			}
		};

		void fetchTagData();

		return () => {
			isMounted = false;
		};
	}, [selectedTagId, tagOptions]);

	const navigateAfterMandatoryExpenseSubmit = React.useCallback(() => {
		navigateToHomeDashboard();
	}, []);

	const handleBackToHome = React.useCallback(() => {
		navigateToHomeDashboard();
		return true;
	}, []);

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
				const usesBusinessDaysValue = data.usesBusinessDays === true;
				const tagId = typeof data.tagId === 'string' ? data.tagId : null;
				const descriptionValue = typeof data.description === 'string' ? data.description : '';
				const installmentTotalValue = normalizeMandatoryInstallmentTotal(data.installmentTotal);
				const installmentsCompletedValue = normalizeMandatoryInstallmentsCompleted(
					data.installmentsCompleted,
					installmentTotalValue,
				);
				const reminderFlag = data.reminderEnabled !== false;
				const reminderHour =
					typeof data.reminderHour === 'number' ? data.reminderHour : DEFAULT_MANDATORY_REMINDER_HOUR;
				const reminderMinute =
					typeof data.reminderMinute === 'number' ? data.reminderMinute : DEFAULT_MANDATORY_REMINDER_MINUTE;
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
				setUsesBusinessDays(usesBusinessDaysValue);
				setInstallmentsEnabled(installmentTotalValue !== null);
				setInstallmentTotal(installmentTotalValue !== null ? String(installmentTotalValue) : '');
				setSettledInstallmentsCount(installmentsCompletedValue);
				setSelectedTagId(tagId);
				setDescription(descriptionValue);
				setReminderEnabled(reminderFlag);
				setReminderTime(formatMandatoryReminderTime(reminderHour, reminderMinute));
				setCurrentPaymentInfo({
					expenseId: lastPaymentExpenseId,
					cycleKey: lastPaymentCycle,
					paidAt: lastPaymentDate,
				});
				setPersistedFormSnapshot({
					name: name.trim(),
					valueInCents: value,
					dueDay: String(dueDayValue).padStart(2, '0'),
					usesBusinessDays: usesBusinessDaysValue,
					tagId,
					installmentTotal: installmentTotalValue,
					description: descriptionValue.trim(),
					reminderTime: formatMandatoryReminderTime(reminderHour, reminderMinute),
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
				description: usesBusinessDays
					? `Informe um número de dia útil entre 1 e ${MAX_MONTHLY_BUSINESS_DAY}.`
					: 'Informe um dia do mês entre 1 e 31.',
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

		if (installmentsEnabled && normalizedInstallmentTotal === null) {
			showNotifierAlert({
				title: 'Erro ao salvar gasto obrigatório',
				description: `Informe uma quantidade de parcelas entre 1 e ${MAX_MANDATORY_INSTALLMENTS}.`,
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (installmentsEnabled && isInstallmentTotalBelowSettled) {
			showNotifierAlert({
				title: 'Erro ao salvar gasto obrigatório',
				description: `Este gasto já tem ${settledInstallmentsCount} parcela(s) registrada(s). A quantidade total precisa ser igual ou maior.`,
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		const parsedReminderTime = parseMandatoryReminderTime(reminderTime);
		if (reminderEnabled && !parsedReminderTime) {
			showNotifierAlert({
				title: 'Erro ao salvar gasto obrigatório',
				description: 'Informe um horário válido para o lembrete no formato 24h, como 19:00.',
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
			const payloadInstallmentsCompleted =
				installmentsEnabled && normalizedInstallmentTotal !== null
					? normalizeMandatoryInstallmentsCompleted(
						Math.max(settledInstallmentsCount, isPaidForCurrentCycle ? 1 : 0),
						normalizedInstallmentTotal,
					)
					: 0;
			const payload = {
				name: trimmedName,
				valueInCents,
				dueDay: Number(dueDay),
				usesBusinessDays,
				tagId: selectedTagId,
				description: description.trim().length > 0 ? description.trim() : null,
				reminderEnabled,
				reminderHour: parsedReminderTime?.hour ?? DEFAULT_MANDATORY_REMINDER_HOUR,
				reminderMinute: parsedReminderTime?.minute ?? DEFAULT_MANDATORY_REMINDER_MINUTE,
				installmentTotal: installmentsEnabled ? normalizedInstallmentTotal : null,
				installmentsCompleted: payloadInstallmentsCompleted,
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
						usesBusinessDays: payload.usesBusinessDays,
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

			navigateAfterMandatoryExpenseSubmit();
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
		installmentsEnabled,
		isInstallmentTotalBelowSettled,
		isPaidForCurrentCycle,
		usesBusinessDays,
		normalizedInstallmentTotal,
		reminderEnabled,
		reminderTime,
		navigateAfterMandatoryExpenseSubmit,
		selectedExpenseId,
		selectedTagId,
		settledInstallmentsCount,
		valueInCents,
	]);

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

		if (isInstallmentPlanCompleted) {
			showNotifierAlert({
				title: 'Parcelamento concluído',
				description: 'Todas as parcelas deste gasto obrigatório já foram registradas.',
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
		if (usesBusinessDays) {
			params.templateUsesBusinessDays = '1';
		}

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
		isInstallmentPlanCompleted,
		isPaidForCurrentCycle,
		isTemplateReady,
		selectedExpenseId,
		selectedTagId,
		selectedTagLabel,
		usesBusinessDays,
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
		!isTemplateReady || isFormBusy || (reminderEnabled && !isReminderTimeValid);
	// Mantém o formulário visível durante o prefill, conforme o fluxo progressivo descrito em [[Despesas Fixas]].
	const isEditingMode = Boolean(editingExpenseId);
	const screenTitle = isEditingMode ? 'Editar gasto obrigatório' : 'Registrar gasto obrigatório';
	const monthlyControlMessage = isPrefilling && isEditingMode
		? 'Carregando os dados do gasto obrigatório salvo.'
		: !selectedExpenseId
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
							onScroll={handleScroll}
							scrollEventThrottle={scrollEventThrottle}
						>
							<VStack className="justify-between">
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
										<Text className={`${bodyText} ml-1 text-sm`}>{dueDayFieldLabel}</Text>
										<Input className={fieldContainerClassName} isDisabled={isDueDayFieldDisabled}>
											<InputField
												ref={dueDayInputRef}
												placeholder={dueDayPlaceholder}
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
												{dueDayErrorMessage}
											</Text>
										) : null}
									</VStack>

									<Box className={`px-4 rounded-2xl border ${notTintedCardClassName}`}>
										<VStack className="gap-3">
											<HStack className="items-center justify-between gap-4">
												<VStack className="flex-1 gap-1">
													<Text className="font-semibold">Contar por dia útil</Text>
												</VStack>
												<Switch
													value={usesBusinessDays}
													onValueChange={setUsesBusinessDays}
													disabled={isFormBusy}
													trackColor={switchTrackColor}
													thumbColor={switchThumbColor}
													ios_backgroundColor={switchIosBackgroundColor}
												/>
											</HStack>
										</VStack>
									</Box>

									<Box className={`px-4 rounded-2xl border ${notTintedCardClassName}`}>
										<VStack className="gap-3">
											<HStack className="items-center justify-between gap-4">
												<VStack className="flex-1 gap-1">
													<Text className="font-semibold">Parcelar por quantidade</Text>
												</VStack>
												<Switch
													value={installmentsEnabled}
													onValueChange={handleInstallmentsToggle}
													disabled={!isCoreTemplateReady || isFormBusy}
													trackColor={switchTrackColor}
													thumbColor={switchThumbColor}
													ios_backgroundColor={switchIosBackgroundColor}
												/>
											</HStack>

											{installmentsEnabled ? (
												<VStack className="gap-2 pb-4">
													<Text className={`${bodyText} ml-1 text-sm`}>Quantidade de parcelas</Text>
													<Input className={fieldContainerClassName} isDisabled={isInstallmentFieldDisabled}>
														<InputField
															ref={installmentsInputRef}
															placeholder="Ex: 12"
															value={installmentTotal}
															onChangeText={handleInstallmentTotalChange}
															keyboardType="numeric"
															returnKeyType="done"
															className={inputField}
															onFocus={() => handleInputFocus('installments')}
														/>
													</Input>
												</VStack>
											) : null}
										</VStack>
									</Box>

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

									<VStack className="gap-2">
										<Text className={`${bodyText} ml-1 text-sm`}>Categoria</Text>
										<TagActionsheetSelector
											options={tagOptions}
											selectedId={selectedTagId}
											selectedLabel={selectedTagLabel}
											onSelect={handleSelectTag}
											isDisabled={isTagSelectDisabled}
											isDarkMode={isDarkMode}
											bodyTextClassName={bodyText}
											helperTextClassName={helperText}
											triggerClassName={fieldContainerCardClassName}
											placeholder="Selecione a categoria da despesa"
											sheetTitle="Escolha a categoria obrigatória"
											emptyMessage="Nenhuma categoria obrigatória de despesa disponível."
											triggerHint={tagHelperMessage}
											disabledHint={tagHelperMessage}
											accessibilityLabel="Escolher categoria obrigatória de despesa"
											onCreatePress={handleOpenAddTagScreen}
											createActionLabel="Adicionar categoria obrigatória de despesa"
											isCreateDisabled={isAddTagButtonDisabled}
										/>
									</VStack>

									<Box className={`${compactCardClassName} px-4 rounded-2xl border ${notTintedCardClassName}`}>
										<VStack className="gap-3">
											<HStack className="items-center justify-between gap-4">
												<VStack className="flex-1 gap-1">
													<Text className="font-semibold">Lembrete do vencimento</Text>
												</VStack>
												<Switch
													value={reminderEnabled}
													onValueChange={handleReminderToggle}
													disabled={!isTemplateReady || isFormBusy}
													trackColor={switchTrackColor}
													thumbColor={switchThumbColor}
													ios_backgroundColor={switchIosBackgroundColor}
												/>
											</HStack>

											{reminderEnabled ? (
												<VStack className="gap-2">
													<HStack className="items-center gap-1">
														<Text className={`${bodyText} ml-1 text-sm`}>Horário do lembrete</Text>
														<Popover
															placement="bottom"
															size="md"
															offset={0}
															shouldFlip
															focusScope={false}
															trapFocus={false}
															trigger={triggerProps => (
																<Pressable
																	{...triggerProps}
																	hitSlop={8}
																	accessibilityRole="button"
																	accessibilityLabel="Informações sobre o formato do horário do lembrete"
																>
																	<Info
																		size={14}
																		color={isDarkMode ? '#94A3B8' : '#64748B'}
																		style={{ marginLeft: 4 }}
																	/>
																</Pressable>
															)}
														>
															<PopoverBackdrop className="bg-transparent" />
															<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
																<PopoverBody className="px-3 py-3">
																	<Text className={`${bodyText} text-xs leading-5`}>
																		Use o padrão 24h. Você pode digitar `1900` ou `19:00` e o campo completa para `19:00` automaticamente.
																	</Text>
																</PopoverBody>
															</PopoverContent>
														</Popover>
													</HStack>

													<Input className={fieldContainerClassName} isDisabled={isReminderTimeFieldDisabled}>
														<InputField
															ref={reminderTimeInputRef}
															placeholder="Ex: 19:00"
															value={reminderTime}
															onChangeText={handleReminderTimeChange}
															onBlur={handleReminderTimeBlur}
															keyboardType="numeric"
															returnKeyType="done"
															maxLength={5}
															className={inputField}
															onFocus={() => handleInputFocus('reminder-time')}
														/>
													</Input>

													<Text className={`${helperText} ml-1 text-sm`}>
														Digite no formato `HH:MM` ou apenas os números que o campo aplica a máscara sozinho.
													</Text>

													{!isReminderTimeValid ? (
														<Text className="ml-1 text-sm text-red-500 dark:text-red-400">
															Informe um horário válido entre 00:00 e 23:59.
														</Text>
													) : null}
												</VStack>
											) : null}
										</VStack>
									</Box>

									<Button className={submitButtonClassName} onPress={handleSubmit} isDisabled={isSaveDisabled}>
										{isSubmitting ? (
											<>
												<ButtonSpinner />
												<ButtonText>{isEditingMode ? 'Atualizando' : 'Registrando'}</ButtonText>
											</>
										) : (
											<ButtonText>{isEditingMode ? 'Atualizar gasto' : 'Registrar gasto'}</ButtonText>
										)}
									</Button>
								</VStack>
							</VStack>
						</ScrollView>
					</View>
				</KeyboardAvoidingView>

				<View style={{ marginHorizontal: -18, paddingBottom: 0, flexShrink: 0 }}>
					<Navigator defaultValue={1} onHardwareBack={handleBackToHome} />
				</View>
			</View>
		</SafeAreaView>
	);
}
