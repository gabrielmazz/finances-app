import React from 'react';
import {
	ScrollView,
	Image as RNImage,
	View,
	StatusBar,
	KeyboardAvoidingView,
	Platform,
	TextInput,
	Pressable,
	Text,
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import '@mantine/core/styles.css';
import { Divider, MantineProvider, NumberInput } from '@mantine/core';

import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';
import {
	Accordion,
	AccordionContent,
	AccordionHeader,
	AccordionIcon,
	AccordionItem,
	AccordionTitleText,
	AccordionTrigger,
} from '@/components/ui/accordion';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icon';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { HStack } from '@/components/ui/hstack';
import { Switch } from '@/components/ui/switch';
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import Navigator from '@/components/uiverse/navigation/navigator';
import DatePickerField from '@/components/uiverse/shared/date-picker';
import WebSelectField from '@/components/web/shared/web-select-field';
import TagActionsheetSelector, { type TagActionsheetOption } from '@/components/uiverse/categories/tag-actionsheet-selector';
import TimePickerField from '@/components/uiverse/recurring/time-picker-field';

import { auth } from '@/FirebaseConfig';
import { getAllTagsFirebase, getTagDataFirebase } from '@/functions/TagFirebase';
import {
	addMandatoryExpenseFirebase,
	getMandatoryExpenseFirebase,
	updateMandatoryExpenseFirebase,
} from '@/functions/MandatoryExpenseFirebase';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import {
	cancelMandatoryExpenseNotification,
	scheduleMandatoryExpenseNotification,
} from '@/utils/mandatoryExpenseNotifications';
import { clearPendingCreatedTag, peekPendingCreatedTag } from '@/utils/pendingCreatedTag';
import { isTagVisibleInMandatoryUsageList, tagSupportsUsage } from '@/utils/tagUsage';
import { APP_ROUTE_PATHS, navigateToHomeDashboard, navigateToRoute } from '@/utils/navigation';
import {
	formatMandatoryReminderNextTrigger,
	type MandatoryReminderScheduleResult,
} from '@/utils/mandatoryReminderNotifications';
import { isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import { MAX_MONTHLY_BUSINESS_DAY, formatConfiguredMonthlyDueLabel } from '@/utils/businessCalendar';
import {
	MAX_MANDATORY_INSTALLMENTS,
	getMandatoryInstallmentEndDateFromTotal,
	getMandatoryInstallmentTotalFromDateRange,
	normalizeMandatoryInstallmentDate,
	normalizeMandatoryInstallmentTotal,
	resolveMandatoryInstallmentsCompleted,
	sanitizeMandatoryInstallmentInput,
} from '@/utils/mandatoryInstallments';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';

// Importação do SVG
import AddMandatoryExpensesListIllustration from '../../assets/UnDraw/addMandatoryExpensesScreen.svg';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';
import { Info } from 'lucide-react-native';
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';
import { ScreenDismissKeyboard } from '@/components/uiverse/shared/screen-dismiss-keyboard';
import {
	DEFAULT_MANDATORY_REMINDER_HOUR,
	DEFAULT_MANDATORY_REMINDER_MINUTE,
	DEFAULT_MANDATORY_REMINDER_TIME,
	formatMandatoryReminderTime,
	isMandatoryReminderTimeValid,
	parseMandatoryReminderTime,
} from '@/utils/mandatoryReminderTime';
import {
	MANDATORY_REMINDER_CONFIG_VERSION,
	formatMandatoryReminderSummary,
	isMandatoryReminderConfigured,
	normalizeMandatoryReminderDaysBefore,
} from '@/utils/mandatoryReminderConfig';

type TagOption = {
	id: string;
	name: string;
	iconFamily?: TagIconFamily | null;
	iconName?: string | null;
	iconStyle?: TagIconStyle | null;
};
type FocusableInputKey = 'expense-name' | 'expense-value' | 'due-day' | 'installments' | 'description';

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

const parseDateFromBR = (value: string) => {
	const [dayStr, monthStr, yearStr] = value.split('/');
	const day = Number(dayStr);
	const month = Number(monthStr);
	const year = Number(yearStr);

	if (!day || !month || !year) {
		return null;
	}

	const candidate = new Date(year, month - 1, day);
	if (
		candidate.getFullYear() !== year ||
		candidate.getMonth() !== month - 1 ||
		candidate.getDate() !== day
	) {
		return null;
	}

	return candidate;
};

const formatValueInput = (value: string) => value.replace(/\D/g, '');
const sanitizeDueDay = (value: string) => value.replace(/\D/g, '').slice(0, 2);
const MANDATORY_REMINDER_DAY_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: '1', label: '1 dia antes (1 aviso)' },
	{ value: '2', label: '2 dias antes (2 avisos)' },
	{ value: '3', label: '3 dias antes (3 avisos)' },
];
export default function AddMandatoryExpensesScreen() {
	const { width } = useWindowDimensions();
	const compact = width < 720;
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
		submitButtonCancelClassName,
		heroHeight,
		insets,
		infoCardStyle,
		switchTrackColor,
		switchThumbColor,
		switchActiveThumbColor,
		switchIosBackgroundColor,
		webDashboardClassNames,
		webExpenseClassNames,
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
	const [installmentTotalValueDisplay, setInstallmentTotalValueDisplay] = React.useState('');
	const [installmentTotalValueInCents, setInstallmentTotalValueInCents] = React.useState<number | null>(null);
	const [installmentStartDate, setInstallmentStartDate] = React.useState(() => formatDateToBR(new Date()));
	const [installmentEndDate, setInstallmentEndDate] = React.useState('');
	const [settledInstallmentsCount, setSettledInstallmentsCount] = React.useState(0);
	const [description, setDescription] = React.useState('');
	// Segue [[Despesas Fixas]]: o lembrete só é liberado quando o template base estiver completo.
	const [reminderEnabled, setReminderEnabled] = React.useState(false);
	const [reminderTime, setReminderTime] = React.useState(DEFAULT_MANDATORY_REMINDER_TIME);
	const [reminderDaysBefore, setReminderDaysBefore] = React.useState<1 | 2 | 3>(1);
	const [reminderOnDueDate, setReminderOnDueDate] = React.useState(false);
	const [openDueSection, setOpenDueSection] = React.useState<string | null>(null);
	const [openOptionalSection, setOpenOptionalSection] = React.useState<string | null>(null);
	const [selectedExpenseId, setSelectedExpenseId] = React.useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isPrefilling, setIsPrefilling] = React.useState(false);
	const [lastPaymentCycle, setLastPaymentCycle] = React.useState<string | null>(null);
	const submitLockRef = React.useRef(false);
	const applyPostSubmitBehavior = usePostSubmitBehavior('addMandatoryExpenses');
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
	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => {
			if (key === 'description') {
				return 180;
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
		const sanitizedValue = sanitizeMandatoryInstallmentInput(input);
		setInstallmentTotal(sanitizedValue);

		const normalizedTotal = normalizeMandatoryInstallmentTotal(Number(sanitizedValue));
		const parsedStartDate = parseDateFromBR(installmentStartDate);
		const computedEndDate = getMandatoryInstallmentEndDateFromTotal(parsedStartDate, normalizedTotal);
		setInstallmentEndDate(computedEndDate ? formatDateToBR(computedEndDate) : '');

		if (normalizedTotal !== null && installmentTotalValueInCents !== null) {
			const monthlyValueInCents = Math.floor(installmentTotalValueInCents / normalizedTotal);
			setValueInCents(monthlyValueInCents > 0 ? monthlyValueInCents : null);
			setValueDisplay(monthlyValueInCents > 0 ? formatCurrencyBRL(monthlyValueInCents) : '');
		}
	}, [installmentStartDate, installmentTotalValueInCents]);

	const handleInstallmentTotalValueChange = React.useCallback((input: string) => {
		const digitsOnly = formatValueInput(input);
		if (!digitsOnly) {
			setInstallmentTotalValueDisplay('');
			setInstallmentTotalValueInCents(null);
			return;
		}

		const totalValueInCents = parseInt(digitsOnly, 10);
		setInstallmentTotalValueInCents(totalValueInCents);
		setInstallmentTotalValueDisplay(formatCurrencyBRL(totalValueInCents));

		const normalizedTotal = normalizeMandatoryInstallmentTotal(Number(installmentTotal));
		if (normalizedTotal !== null) {
			const monthlyValueInCents = Math.floor(totalValueInCents / normalizedTotal);
			setValueInCents(monthlyValueInCents > 0 ? monthlyValueInCents : null);
			setValueDisplay(monthlyValueInCents > 0 ? formatCurrencyBRL(monthlyValueInCents) : '');
		}
	}, [installmentTotal]);

	const handleInstallmentsToggle = React.useCallback((value: boolean) => {
		setOpenOptionalSection('optional');
		setInstallmentsEnabled(value);
		if (value) {
			const todayLabel = formatDateToBR(new Date());
			const nextStartDate = installmentStartDate || todayLabel;
			const nextTotal = normalizeMandatoryInstallmentTotal(Number(installmentTotal)) ?? Math.max(1, settledInstallmentsCount);
			setInstallmentStartDate(nextStartDate);
			setInstallmentTotal(String(nextTotal));
			const nextTotalValueInCents = installmentTotalValueInCents ?? valueInCents;
			setInstallmentTotalValueInCents(nextTotalValueInCents);
			setInstallmentTotalValueDisplay(nextTotalValueInCents ? formatCurrencyBRL(nextTotalValueInCents) : '');
			if (nextTotalValueInCents !== null) {
				const monthlyValueInCents = Math.floor(nextTotalValueInCents / nextTotal);
				setValueInCents(monthlyValueInCents > 0 ? monthlyValueInCents : null);
				setValueDisplay(monthlyValueInCents > 0 ? formatCurrencyBRL(monthlyValueInCents) : '');
			}
			const computedEndDate = getMandatoryInstallmentEndDateFromTotal(parseDateFromBR(nextStartDate), nextTotal);
			setInstallmentEndDate(computedEndDate ? formatDateToBR(computedEndDate) : '');
		} else {
			setInstallmentEndDate('');
			setInstallmentTotalValueDisplay('');
			setInstallmentTotalValueInCents(null);
		}
	}, [installmentStartDate, installmentTotal, installmentTotalValueInCents, settledInstallmentsCount, valueInCents]);

	const handleInstallmentStartDateChange = React.useCallback((formattedValue: string, date: Date) => {
		setInstallmentStartDate(formattedValue);
		const normalizedTotal = normalizeMandatoryInstallmentTotal(Number(installmentTotal));
		const computedEndDate = getMandatoryInstallmentEndDateFromTotal(date, normalizedTotal);
		setInstallmentEndDate(computedEndDate ? formatDateToBR(computedEndDate) : '');
	}, [installmentTotal]);

	const handleInstallmentEndDateChange = React.useCallback((formattedValue: string, date: Date) => {
		setInstallmentEndDate(formattedValue);
		const totalFromRange = getMandatoryInstallmentTotalFromDateRange(parseDateFromBR(installmentStartDate), date);
		if (totalFromRange !== null) {
			setInstallmentTotal(String(totalFromRange));
		}
	}, [installmentStartDate]);

	const handleReminderDaysBeforeChange = React.useCallback((value: string) => {
		setReminderDaysBefore(normalizeMandatoryReminderDaysBefore(value));
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

	const parsedInstallmentStartDate = React.useMemo(
		() => parseDateFromBR(installmentStartDate),
		[installmentStartDate],
	);
	const parsedInstallmentEndDate = React.useMemo(
		() => parseDateFromBR(installmentEndDate),
		[installmentEndDate],
	);
	const isInstallmentTotalValid = !installmentsEnabled || normalizedInstallmentTotal !== null;
	const isInstallmentTotalValueValid =
		!installmentsEnabled ||
		(installmentTotalValueInCents !== null &&
			normalizedInstallmentTotal !== null &&
			installmentTotalValueInCents >= normalizedInstallmentTotal);
	const isInstallmentStartDateValid = !installmentsEnabled || parsedInstallmentStartDate !== null;
	const isInstallmentEndDateUnlocked = installmentsEnabled && normalizedInstallmentTotal !== null;
	const isInstallmentEndDateValid = !isInstallmentEndDateUnlocked || parsedInstallmentEndDate !== null;
	const resolvedSettledInstallmentsCount = React.useMemo(
		() =>
			installmentsEnabled && normalizedInstallmentTotal !== null
				? resolveMandatoryInstallmentsCompleted({
					storedCompleted: settledInstallmentsCount,
					installmentTotal: normalizedInstallmentTotal,
					startDate: parsedInstallmentStartDate,
					isCurrentCycleCompleted: false,
				})
				: 0,
		[
			installmentsEnabled,
			normalizedInstallmentTotal,
			parsedInstallmentStartDate,
			settledInstallmentsCount,
		],
	);
	const isInstallmentTotalBelowSettled =
		installmentsEnabled &&
		normalizedInstallmentTotal !== null &&
		normalizedInstallmentTotal < resolvedSettledInstallmentsCount;

	const handleReminderToggle = React.useCallback((value: boolean) => {
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

		setReminderTime(currentValue =>
			parseMandatoryReminderTime(currentValue) ? currentValue : DEFAULT_MANDATORY_REMINDER_TIME,
		);
		setOpenOptionalSection('optional');
		setReminderEnabled(true);
		showNotifierAlert({
			title: 'Lembrete salvo no cadastro',
			description: 'O navegador guarda a configuração, mas o aviso será agendado somente no aplicativo Android ou iOS instalado.',
			type: 'info',
			isDarkMode,
			duration: 5500,
		});
	}, [expenseName, isDarkMode, isDueDayValid, selectedTagId, valueInCents]);
	const isReminderTimeValid = React.useMemo(() => isMandatoryReminderTimeValid(reminderTime), [reminderTime]);
	const reminderSummary = React.useMemo(() => {
		const parsedTime = parseMandatoryReminderTime(reminderTime);
		return formatMandatoryReminderSummary({
			enabled: reminderEnabled,
			daysBefore: reminderDaysBefore,
			onDueDate: reminderOnDueDate,
			hour: parsedTime?.hour ?? DEFAULT_MANDATORY_REMINDER_HOUR,
			minute: parsedTime?.minute ?? DEFAULT_MANDATORY_REMINDER_MINUTE,
		});
	}, [reminderDaysBefore, reminderEnabled, reminderOnDueDate, reminderTime]);

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

	const hasExpenseName = expenseName.trim().length > 0;
	const hasExpenseValue = valueInCents !== null && valueInCents > 0;
	const isFormBusy = isSubmitting || isPrefilling;
	const isCoreTemplateReady = hasExpenseName && hasExpenseValue && isDueDayValid;
	const isInstallmentConfigReady =
		!installmentsEnabled ||
		(isInstallmentTotalValid &&
			isInstallmentTotalValueValid &&
			isInstallmentStartDateValid &&
			isInstallmentEndDateValid &&
			!isInstallmentTotalBelowSettled);
	const isTemplateReady = isCoreTemplateReady && Boolean(selectedTagId) && isInstallmentConfigReady;
	const isValueFieldDisabled = !hasExpenseName || isFormBusy || installmentsEnabled;
	const isDueDayFieldDisabled = !hasExpenseName || !hasExpenseValue || isFormBusy;
	const isInstallmentFieldDisabled = !hasExpenseName || !isDueDayValid || isFormBusy;
	const isTagSelectDisabled = isLoadingTags || !isCoreTemplateReady || isFormBusy;
	const isAddTagButtonDisabled = isFormBusy;
	const isDescriptionDisabled = !isCoreTemplateReady || isFormBusy;
	const isReminderTimeFieldDisabled = !reminderEnabled || isFormBusy;
	const tagHelperMessage = isLoadingTags
		? 'Carregando categorias obrigatórias...'
		: tagOptions.length === 0
			? 'Cadastre uma tag de despesa marcada como obrigatória para continuar.'
			: !isCoreTemplateReady
				? 'Preencha nome, valor e dia do vencimento para liberar a categoria.'
				: 'Selecione a categoria obrigatória que identifica este template.';

	const dueDayFieldLabel = usesBusinessDays ? 'Número do dia útil do vencimento' : 'Dia do vencimento';
	const dueDayPlaceholder = usesBusinessDays
		? `Informe um número entre 1 e ${MAX_MONTHLY_BUSINESS_DAY}`
		: 'Informe um dia entre 1 e 31';
	const dueDayErrorMessage = usesBusinessDays
		? `Informe um dia útil válido entre 1 e ${MAX_MONTHLY_BUSINESS_DAY}.`
		: 'Informe um dia válido entre 1 e 31.';
	const dueDayHelperMessage = usesBusinessDays
		? 'Informe a posição do dia útil no mês.'
		: 'Informe o dia fixo do mês.';
	const businessDayToggleHelperMessage = usesBusinessDays
		? `${formatConfiguredMonthlyDueLabel(Number(dueDay || '1'), true)}. Fins de semana e feriados não contam.`
		: 'Ative quando o vencimento seguir a contagem de dias úteis.';
	const installmentHelperMessage = React.useMemo(() => {
		if (!isCoreTemplateReady) {
			return 'Preencha nome, valor e vencimento para liberar o parcelamento.';
		}
		if (!installmentsEnabled) {
			return 'Deixe desligado para uma despesa fixa mensal sem limite de parcelas.';
		}
		if (!isInstallmentTotalValid) {
			return `Informe uma quantidade de parcelas entre 1 e ${MAX_MANDATORY_INSTALLMENTS}.`;
		}
		if (!isInstallmentTotalValueValid) {
			return 'O valor total do parcelamento precisa ser de pelo menos R$ 0,01 por parcela.';
		}
		if (!isInstallmentStartDateValid) {
			return 'Informe uma data inicial válida para calcular o progresso das parcelas.';
		}
		if (!isInstallmentEndDateValid) {
			return 'Escolha a data final das parcelas no calendário.';
		}
		if (isInstallmentTotalBelowSettled) {
			return `Este gasto já tem ${resolvedSettledInstallmentsCount} parcela(s) registrada(s). Use uma quantidade igual ou maior.`;
		}
		if (normalizedInstallmentTotal && installmentTotalValueInCents !== null && valueInCents !== null) {
			return `Total do parcelamento: ${formatCurrencyBRL(installmentTotalValueInCents)}. Valor mensal calculado: ${formatCurrencyBRL(valueInCents)}. A última parcela recebe eventuais centavos restantes.`;
		}
		return 'Informe a quantidade total de parcelas.';
	}, [
		installmentsEnabled,
		isCoreTemplateReady,
		isInstallmentEndDateValid,
		isInstallmentStartDateValid,
		isInstallmentTotalBelowSettled,
		isInstallmentTotalValid,
		installmentTotalValueInCents,
		isInstallmentTotalValueValid,
		normalizedInstallmentTotal,
		resolvedSettledInstallmentsCount,
		valueInCents,
	]);

	const resetForm = React.useCallback((options?: { keepTag?: boolean }) => {
		setSelectedExpenseId(null);
		setExpenseName('');
		setValueDisplay('');
		setValueInCents(null);
		setDueDay('');
		setUsesBusinessDays(false);
		setInstallmentsEnabled(false);
		setInstallmentTotal('');
		setInstallmentTotalValueDisplay('');
		setInstallmentTotalValueInCents(null);
		setInstallmentStartDate(formatDateToBR(new Date()));
		setInstallmentEndDate('');
		setSettledInstallmentsCount(0);
		setDescription('');
		setReminderEnabled(false);
		setReminderTime(DEFAULT_MANDATORY_REMINDER_TIME);
		setReminderDaysBefore(1);
		setReminderOnDueDate(false);
		setOpenDueSection(null);
		setOpenOptionalSection(null);
		setSelectedTagId(current => {
			if (options?.keepTag && current) {
				return current;
			}
			return null;
		});
		setLastPaymentCycle(null);
	}, []);

	// Segue [[Despesas Fixas]] e [[Gerenciamento de Tags]]: a categoria obrigatória pode ser criada inline e voltar já elegível neste filtro.
	const handleOpenAddTagScreen = React.useCallback(() => {
		if (isAddTagButtonDisabled) {
			return;
		}

		navigateToRoute(APP_ROUTE_PATHS.addRegisterTag, {
			placement: 'mandatory-expense',
			returnAfterCreate: '1',
			returnToRoute: APP_ROUTE_PATHS.addMandatoryExpenses,
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
				const installmentStartDateValue =
					installmentTotalValue !== null
						? normalizeMandatoryInstallmentDate(data.installmentStartDate) ?? new Date()
						: null;
				const installmentEndDateValue =
					installmentTotalValue !== null
						? normalizeMandatoryInstallmentDate(data.installmentEndDate) ??
						getMandatoryInstallmentEndDateFromTotal(installmentStartDateValue, installmentTotalValue)
						: null;
				const hasCurrentReminderConfig =
					data.reminderConfigVersion === MANDATORY_REMINDER_CONFIG_VERSION;
				const reminderFlag = isMandatoryReminderConfigured(data);
				const reminderDaysBeforeValue = hasCurrentReminderConfig
					? normalizeMandatoryReminderDaysBefore(data.reminderDaysBefore)
					: 1;
				const reminderOnDueDateValue = hasCurrentReminderConfig && data.reminderOnDueDate === true;
				const reminderHour =
					typeof data.reminderHour === 'number' ? data.reminderHour : DEFAULT_MANDATORY_REMINDER_HOUR;
				const reminderMinute =
					typeof data.reminderMinute === 'number' ? data.reminderMinute : DEFAULT_MANDATORY_REMINDER_MINUTE;
				const lastPaymentCycle =
					typeof data.lastPaymentCycle === 'string' && data.lastPaymentCycle.length > 0
						? data.lastPaymentCycle
						: null;
				const installmentTotalValueInCents =
					installmentTotalValue !== null
						? typeof data.installmentTotalValueInCents === 'number' &&
							Number.isSafeInteger(data.installmentTotalValueInCents) &&
							data.installmentTotalValueInCents > 0
							? data.installmentTotalValueInCents
							: value * installmentTotalValue
						: null;
				const installmentsCompletedValue = resolveMandatoryInstallmentsCompleted({
					storedCompleted: data.installmentsCompleted,
					installmentTotal: installmentTotalValue,
					startDate: installmentStartDateValue,
					isCurrentCycleCompleted: isCycleKeyCurrent(lastPaymentCycle),
				});

				setSelectedExpenseId(editingExpenseId);
				setExpenseName(name);
				setValueInCents(value);
				setValueDisplay(value ? formatCurrencyBRL(value) : '');
				setDueDay(String(dueDayValue).padStart(2, '0'));
				setUsesBusinessDays(usesBusinessDaysValue);
				setInstallmentsEnabled(installmentTotalValue !== null);
				setInstallmentTotal(installmentTotalValue !== null ? String(installmentTotalValue) : '');
				setInstallmentTotalValueInCents(installmentTotalValueInCents);
				setInstallmentTotalValueDisplay(installmentTotalValueInCents ? formatCurrencyBRL(installmentTotalValueInCents) : '');
				setInstallmentStartDate(installmentStartDateValue ? formatDateToBR(installmentStartDateValue) : formatDateToBR(new Date()));
				setInstallmentEndDate(installmentEndDateValue ? formatDateToBR(installmentEndDateValue) : '');
				setSettledInstallmentsCount(installmentsCompletedValue);
				setSelectedTagId(tagId);
				setDescription(descriptionValue);
				setReminderEnabled(reminderFlag);
				setReminderTime(formatMandatoryReminderTime(reminderHour, reminderMinute));
				setReminderDaysBefore(reminderDaysBeforeValue);
				setReminderOnDueDate(reminderOnDueDateValue);
				setOpenOptionalSection(installmentTotalValue !== null || reminderFlag ? 'optional' : null);
				setLastPaymentCycle(lastPaymentCycle);
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
		if (submitLockRef.current || isSubmitting) {
			return;
		}

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

		if (installmentsEnabled && !isInstallmentTotalValueValid) {
			showNotifierAlert({
				title: 'Erro ao salvar gasto obrigatório',
				description: 'Informe um valor total que cubra pelo menos R$ 0,01 por parcela.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (installmentsEnabled && parsedInstallmentStartDate === null) {
			showNotifierAlert({
				title: 'Erro ao salvar gasto obrigatório',
				description: 'Informe uma data inicial válida para as parcelas.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (installmentsEnabled && parsedInstallmentEndDate === null) {
			showNotifierAlert({
				title: 'Erro ao salvar gasto obrigatório',
				description: 'Informe uma data final válida para as parcelas.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (installmentsEnabled && isInstallmentTotalBelowSettled) {
			showNotifierAlert({
				title: 'Erro ao salvar gasto obrigatório',
				description: `Este gasto já tem ${resolvedSettledInstallmentsCount} parcela(s) registrada(s). A quantidade total precisa ser igual ou maior.`,
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

		submitLockRef.current = true;
		setIsSubmitting(true);

		try {
			const payloadInstallmentsCompleted =
				installmentsEnabled && normalizedInstallmentTotal !== null
					? resolvedSettledInstallmentsCount
					: 0;
			const payload = {
				name: trimmedName,
				valueInCents,
				dueDay: Number(dueDay),
				usesBusinessDays,
				tagId: selectedTagId,
				description: description.trim().length > 0 ? description.trim() : null,
				reminderEnabled,
				reminderConfigVersion: MANDATORY_REMINDER_CONFIG_VERSION,
				reminderDaysBefore,
				reminderOnDueDate,
				reminderHour: parsedReminderTime?.hour ?? DEFAULT_MANDATORY_REMINDER_HOUR,
				reminderMinute: parsedReminderTime?.minute ?? DEFAULT_MANDATORY_REMINDER_MINUTE,
				installmentTotal: installmentsEnabled ? normalizedInstallmentTotal : null,
				installmentTotalValueInCents: installmentsEnabled ? installmentTotalValueInCents : null,
				installmentsCompleted: payloadInstallmentsCompleted,
				installmentStartDate: installmentsEnabled ? parsedInstallmentStartDate : null,
				installmentEndDate: installmentsEnabled ? parsedInstallmentEndDate : null,
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
			let reminderOperationError: string | null = null;

			if (persistedExpenseId) {
				try {
					if (reminderEnabled) {
						reminderFeedback = await scheduleMandatoryExpenseNotification({
							accountId: currentUser.uid,
							expenseId: persistedExpenseId,
							name: payload.name,
							dueDay: payload.dueDay,
							usesBusinessDays: payload.usesBusinessDays,
							reminderHour: payload.reminderHour,
							reminderMinute: payload.reminderMinute,
							reminderDaysBefore: payload.reminderDaysBefore,
							reminderOnDueDate: payload.reminderOnDueDate,
							description: payload.description ?? undefined,
							lastCompletedCycle: lastPaymentCycle ?? undefined,
							activeFromDate: payload.installmentStartDate ?? undefined,
							activeThroughDate: payload.installmentEndDate ?? undefined,
							requestPermission: true,
						});
					} else {
						await cancelMandatoryExpenseNotification(currentUser.uid, persistedExpenseId);
					}
				} catch (notificationError) {
					console.error('Erro ao atualizar a agenda do gasto obrigatório salvo:', notificationError);
					reminderOperationError = 'Não foi possível atualizar a agenda local neste dispositivo.';
				}
			}

			const reminderFailureMessage =
				reminderOperationError ??
				(reminderEnabled && reminderFeedback && !reminderFeedback.success ? reminderFeedback.message : null);
			if (reminderFailureMessage) {
				showNotifierAlert({
					title: successTitle,
					description: reminderEnabled
						? `O template foi salvo, mas o lembrete não foi agendado. ${reminderFailureMessage}`
						: `O template foi salvo, mas a agenda anterior não pôde ser removida. ${reminderFailureMessage}`,
					type: 'warn',
					isDarkMode,
					duration: 5000,
				});
			} else if (reminderEnabled && reminderFeedback?.success && reminderFeedback.capacityLimited) {
				showNotifierAlert({
					title: successTitle,
					description: `O lembrete foi salvo com agenda reduzida pelo limite seguro do dispositivo (${reminderFeedback.scheduledCount} avisos mantidos). Próximo aviso em ${formatMandatoryReminderNextTrigger(reminderFeedback.nextTriggerAt)}.`,
					type: 'warn',
					isDarkMode,
					duration: 6500,
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

			applyPostSubmitBehavior({
				resetForm: !editingExpenseId ? resetForm : undefined,
				isEditing: Boolean(editingExpenseId),
			});
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
			submitLockRef.current = false;
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
		isInstallmentTotalValueValid,
		isSubmitting,
		usesBusinessDays,
		normalizedInstallmentTotal,
		parsedInstallmentEndDate,
		parsedInstallmentStartDate,
		reminderEnabled,
		reminderDaysBefore,
		reminderOnDueDate,
		reminderTime,
		installmentTotalValueInCents,
		lastPaymentCycle,
		resolvedSettledInstallmentsCount,
		applyPostSubmitBehavior,
		resetForm,
		editingExpenseId,
		selectedExpenseId,
		selectedTagId,
		valueInCents,
	]);

	const isSaveDisabled =
		!isTemplateReady || isFormBusy || (reminderEnabled && !isReminderTimeValid);
	// Mantém o formulário visível durante o prefill, conforme o fluxo progressivo descrito em [[Despesas Fixas]].
	const isEditingMode = Boolean(editingExpenseId);
	const screenTitle = isEditingMode ? 'Atualize seu gasto obrigatório' : 'Registro de gasto obrigatório';
	const dueDayOptionsSummary = usesBusinessDays
		? 'Contagem pelo dia útil ativa'
		: 'Contagem pelo dia do mês';
	const inputClassName = `${fieldContainerClassName} ${webExpenseClassNames.fieldInput}`;
	const cardClassName = `${fieldContainerCardClassName} ${webExpenseClassNames.fieldCard}`;
	return (
		<ScreenDismissKeyboard>
			<SafeAreaView
				className={webDashboardClassNames.screen}
				style={{ backgroundColor: surfaceBackground }}
				edges={['left', 'right', 'bottom']}
			>
				<StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
				<KeyboardAvoidingView className={webDashboardClassNames.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
					<ScrollView
						ref={scrollViewRef}
						className={webDashboardClassNames.fill}
						contentContainerStyle={{
							flexGrow: 1,
							paddingBottom: Math.max(110, contentBottomPadding),
						}}
						showsVerticalScrollIndicator={false}
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="on-drag"
						onScroll={handleScroll}
						scrollEventThrottle={scrollEventThrottle}
					>
						<View
							className={webDashboardClassNames.fill}
							style={{
								backgroundColor: surfaceBackground,
								position: 'relative',
							}}
						>
							<View
								className={webDashboardClassNames.hero}
								style={{
									height: heroHeight,
									backgroundColor: surfaceBackground,
								}}
							>
								<RNImage
									source={LoginWallpaper}
									accessibilityLabel="Background da tela de gasto obrigatório"
									className={webDashboardClassNames.heroImage}
									style={{
										position: 'absolute',
										top: 0,
										left: 0,
										right: 0,
										bottom: 0,
										width: '100%',
										height: '100%',
										zIndex: 0,
									}}
									resizeMode="cover"
								/>
								<WebScreenHero
									title={screenTitle}
									Illustration={AddMandatoryExpensesListIllustration}
									isDarkMode={isDarkMode}
									topPadding={insets.top + 24}
								/>
							</View>
							<View
								className={`${webDashboardClassNames.sheet} ${compact ? webDashboardClassNames.sheetCompact : ''}`}
								style={{
									marginTop: heroHeight - 64,
									backgroundColor: surfaceBackground,
									position: 'relative',
									zIndex: 3,
								}}
							>
								<View className={webDashboardClassNames.sheetInner}>
									<View
										className={`${webExpenseClassNames.formSurface} ${cardBackground} rounded-[28px]`}
										style={{
											display: 'flex',
											flex: 1,
											flexDirection: 'column',
										}}
									>
										<View className={webExpenseClassNames.formScroll}>
											<View className="w-full">
												<VStack className="gap-5">
													<View className={webExpenseClassNames.fieldGrid}>
														<VStack className={webExpenseClassNames.fieldHalf}>
															<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Nome da despesa</Text>
															<Input className={inputClassName} isDisabled={isFormBusy}>
																<InputField
																	accessibilityLabel="Nome da despesa"
																	ref={expenseNameInputRef}
																	placeholder="Ex.: Aluguel, luz ou internet…"
																	autoComplete="off"
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

														<VStack className={webExpenseClassNames.fieldHalf}>
															<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Valor mensal</Text>
															<Input className={inputClassName} isDisabled={isValueFieldDisabled}>
																<InputField
																	accessibilityLabel="Valor mensal"
																	ref={expenseValueInputRef}
																	placeholder="Ex.: R$ 700,00…"
																	value={valueDisplay}
																	onChangeText={handleValueChange}
																	keyboardType="numeric"
																	inputMode="numeric"
																	returnKeyType="next"
																	className={inputField}
																	onFocus={() => handleInputFocus('expense-value')}
																	onSubmitEditing={() => setOpenDueSection('due')}
																/>
															</Input>
														</VStack>
													</View>

													<VStack className={webExpenseClassNames.fieldFull}>
														<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>{dueDayFieldLabel}</Text>
														<Input className={inputClassName} isDisabled={isDueDayFieldDisabled}>
															<InputField
																accessibilityLabel={dueDayFieldLabel}
																ref={dueDayInputRef}
																placeholder={`${dueDayPlaceholder}…`}
																value={dueDay}
																onChangeText={handleDueDayChange}
																keyboardType="numeric"
																inputMode="numeric"
																returnKeyType="done"
																className={inputField}
																onFocus={() => handleInputFocus('due-day')}
															/>
														</Input>
														{dueDay.length > 0 && !isDueDayValid ? (
															<Text accessibilityRole="alert" className="mt-2 text-sm text-red-500 dark:text-red-400">
																{dueDayErrorMessage}
															</Text>
														) : null}
													</VStack>

													<Accordion
														size="md"
														variant="unfilled"
														type="single"
														isCollapsible
														value={openDueSection ? [openDueSection] : []}
														onValueChange={value => setOpenDueSection(value[0] ?? null)}
														className="w-full"
													>
														<AccordionItem value="due" className={`${cardClassName} overflow-hidden !p-0`}>
															<AccordionHeader>
																<AccordionTrigger className="px-4 py-3">
																	{({ isExpanded }: { isExpanded: boolean }) => (
																		<View className="relative w-full">
																			<AccordionTitleText className={`${helperText} self-center text-xs`}>
																				Mais opções do vencimento
																			</AccordionTitleText>
																			<AccordionIcon
																				as={isExpanded ? ChevronUpIcon : ChevronDownIcon}
																				className={`${helperText} absolute right-0 top-0`}
																			/>
																		</View>
																	)}
																</AccordionTrigger>
															</AccordionHeader>
															<AccordionContent className="px-4 pb-3 pt-2">
																<HStack className="items-center justify-between gap-4">
																	<VStack className="min-w-0 flex-1 gap-1">
																		<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} mb-0 ml-0`}>
																			Contar por dia útil
																		</Text>
																	</VStack>
							<Switch
								value={usesBusinessDays}
																		onValueChange={setUsesBusinessDays}
																		disabled={isFormBusy}
									trackColor={switchTrackColor}
									thumbColor={switchThumbColor}
									activeThumbColor={switchActiveThumbColor}
																		ios_backgroundColor={switchIosBackgroundColor}
																		accessibilityLabel="Contar vencimento por dia útil"
																	/>
																</HStack>
															</AccordionContent>
														</AccordionItem>
													</Accordion>

													<VStack className={webExpenseClassNames.fieldFull}>
																	<View className={`${webExpenseClassNames.sectionLabel} mb-2`}>
																		<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} !mb-0`}>Observações</Text>
															<Popover
																placement="bottom"
																size="md"
																offset={4}
																shouldFlip
																focusScope={false}
																trapFocus={false}
																trigger={(triggerProps) => (
																	<Pressable
																		{...triggerProps}
																		accessibilityRole="button"
																		accessibilityLabel="Informações sobre as observações"
																	>
																		<Info size={14} color={isDarkMode ? '#94A3B8' : '#64748B'} />
																	</Pressable>
																)}
															>
																<PopoverBackdrop className="bg-transparent" />
																<PopoverContent className="max-w-[280px]" style={infoCardStyle}>
																	<PopoverBody className="px-3 py-3">
																		<Text className={`${bodyText} text-xs leading-5`}>
																			Campo opcional. Use para explicar o contexto desse compromisso mensal.
																		</Text>
																	</PopoverBody>
																</PopoverContent>
															</Popover>
														</View>
														<Textarea
															className={`${textareaContainerClassName} ${webExpenseClassNames.fieldTextarea}`}
															isDisabled={isDescriptionDisabled}
														>
															<TextareaInput
																accessibilityLabel="Observações do gasto obrigatório"
																ref={descriptionInputRef}
																placeholder="Adicione um contexto rápido para este gasto…"
																multiline
																value={description}
																onChangeText={setDescription}
																className={inputField + ' pt-2'}
																onFocus={() => handleInputFocus('description')}
																editable={!isDescriptionDisabled}
															/>
														</Textarea>
													</VStack>

													<VStack className={webExpenseClassNames.fieldFull}>
														<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Categoria obrigatória</Text>
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
															placeholder="Selecione a categoria da despesa…"
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

													<Accordion
														size="md"
														variant="unfilled"
														type="single"
														isCollapsible
														value={openOptionalSection ? [openOptionalSection] : []}
														onValueChange={value => setOpenOptionalSection(value[0] ?? null)}
														className="w-full"
													>
														<AccordionItem value="optional" className={`${cardClassName} overflow-hidden !p-0`}>
															<AccordionHeader>
																<AccordionTrigger className="px-4 py-3">
																	{({ isExpanded }: { isExpanded: boolean }) => (
																		<View className="relative w-full">
																			<AccordionTitleText className={`${helperText} self-center text-xs`}>
																				Mais opções
																			</AccordionTitleText>
																			<AccordionIcon
																				as={isExpanded ? ChevronUpIcon : ChevronDownIcon}
																				className={`${helperText} absolute right-0 top-0`}
																			/>
																		</View>
																	)}
																</AccordionTrigger>
															</AccordionHeader>
															<AccordionContent className="px-4 pb-4 pt-2">
																<VStack className="gap-5">
																	<VStack className="gap-3">
																		<HStack className="items-center justify-between gap-4">
																			<VStack className="min-w-0 flex-1 gap-1">
																				<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} mb-0 ml-0`}>
																					Parcelamento
																				</Text>
																			</VStack>
								<Switch
									value={installmentsEnabled}
																				onValueChange={handleInstallmentsToggle}
																				disabled={!isCoreTemplateReady || isFormBusy}
										trackColor={switchTrackColor}
										thumbColor={switchThumbColor}
										activeThumbColor={switchActiveThumbColor}
																				ios_backgroundColor={switchIosBackgroundColor}
																				accessibilityLabel="Ativar parcelamento"
																			/>
																		</HStack>
																		{installmentsEnabled ? (
																			<VStack className="w-full gap-2">
																				<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} !mb-0`}>Quantidade de parcelas</Text>
																				<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
																					<NumberInput
																						value={installmentTotal === '' ? '' : Number(installmentTotal)}
																						onChange={value => handleInstallmentTotalChange(String(value))}
																						min={1}
																						max={MAX_MANDATORY_INSTALLMENTS}
																						allowDecimal={false}
																						allowNegative={false}
																						clampBehavior="strict"
																						disabled={isInstallmentFieldDisabled}
																						aria-label="Quantidade de parcelas"
																						classNames={{
																							root: 'w-full !m-0',
																							input: `${inputClassName} ${inputField} !pl-4 !pr-11 !text-base`,
																							controls:
																								'my-1 mr-2 w-7 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800',
																							control:
																								'border-0 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200',
																						}}
																						styles={{ root: { margin: 0 }, input: { paddingLeft: 16, paddingRight: 44 } }}
																						onFocus={() => handleInputFocus('installments')}
																					/>
																																										</MantineProvider>
																																										<VStack className="w-full gap-2">
																																											<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} !mb-0`}>
																																												Valor total do parcelamento
																																											</Text>
																																											<Input className={inputClassName} isDisabled={isInstallmentFieldDisabled}>
																																												<InputField
																																													accessibilityLabel="Valor total do parcelamento"
																																													placeholder="Ex.: R$ 500,00…"
																																													value={installmentTotalValueDisplay}
																																															onChangeText={handleInstallmentTotalValueChange}
																																													keyboardType="numeric"
																																													inputMode="numeric"
																																													className={inputField}
																																												/>
																																											</Input>
																																										</VStack>
																																										<HStack className="w-full gap-3 web:flex-row">
																					<VStack className="min-w-0 flex-1 gap-2">
																						<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} !mb-0`}>Início</Text>
																						<DatePickerField
																							value={installmentStartDate}
																							onChange={handleInstallmentStartDateChange}
																							triggerClassName={inputClassName}
																							inputClassName={inputField}
																							placeholder="Data inicial…"
																							isDisabled={isInstallmentFieldDisabled}
																							accessibilityLabel="Selecionar início das parcelas"
																						/>
																					</VStack>
																					<VStack className="min-w-0 flex-1 gap-2">
																						<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} !mb-0`}>Fim</Text>
																						<DatePickerField
																							value={installmentEndDate}
																							onChange={handleInstallmentEndDateChange}
																							triggerClassName={inputClassName}
																							inputClassName={inputField}
																							placeholder={isInstallmentEndDateUnlocked ? 'Data final…' : 'Informe a quantidade primeiro…'}
																							isDisabled={!isInstallmentEndDateUnlocked || isInstallmentFieldDisabled}
																							accessibilityLabel="Selecionar final das parcelas"
																						/>
																					</VStack>
																				</HStack>
																			</VStack>
																		) : null}
																	</VStack>

																	<VStack className="gap-3">
																		<HStack className="items-center justify-between gap-4">
																			<VStack className="min-w-0 flex-1 gap-1">
																				<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} mb-0 ml-0`}>
																					Lembrete do vencimento
																				</Text>
																			</VStack>
								<Switch
									value={reminderEnabled}
																				onValueChange={handleReminderToggle}
																				disabled={!isTemplateReady || isFormBusy}
										trackColor={switchTrackColor}
										thumbColor={switchThumbColor}
										activeThumbColor={switchActiveThumbColor}
																				ios_backgroundColor={switchIosBackgroundColor}
																				accessibilityLabel="Ativar lembrete do vencimento"
																			/>
																		</HStack>
																		{reminderEnabled ? (
																			<VStack className="gap-4">
																				<VStack className="gap-2">
																					<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} !mb-0`}>Começar a lembrar</Text>
																	<WebSelectField
																		options={MANDATORY_REMINDER_DAY_OPTIONS}
																		value={String(reminderDaysBefore)}
																		onChange={handleReminderDaysBeforeChange}
																		isDisabled={isFormBusy}
																		placeholder="Escolha quando começar…"
																		accessibilityLabel="Antecedência do lembrete"
																	/>
																				</VStack>

																				<HStack className="items-center justify-between gap-4">
																					<VStack className="min-w-0 flex-1 gap-1">
																						<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} mb-0 ml-0`}>
																							Avisar também no vencimento
																						</Text>
																					</VStack>
									<Switch
										value={reminderOnDueDate}
																						onValueChange={setReminderOnDueDate}
																						disabled={isFormBusy}
																	trackColor={switchTrackColor}
																	thumbColor={switchThumbColor}
																	activeThumbColor={switchActiveThumbColor}
																						ios_backgroundColor={switchIosBackgroundColor}
																						accessibilityLabel="Avisar também no vencimento"
																					/>
																				</HStack>

																				<VStack className="w-full gap-2">
																					<HStack className="items-center gap-1">
																						<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} !mb-0`}>Horário preferido</Text>
																						<Popover
																							placement="bottom"
																							size="md"
																							offset={0}
																							shouldFlip
																							focusScope={false}
																							trapFocus={false}
																							trigger={(triggerProps) => (
																								<Pressable
																									{...triggerProps}
																									hitSlop={8}
																									accessibilityRole="button"
																									accessibilityLabel="Informações sobre o horário preferido do lembrete"
																								>
																									<Info size={14} color={isDarkMode ? '#94A3B8' : '#64748B'} style={{ marginLeft: 4 }} />
																								</Pressable>
																							)}
																						>
																							<PopoverBackdrop className="bg-transparent" />
																							<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
																								<PopoverBody className="px-3 py-3">
																									<Text className={bodyText + ' text-xs leading-5'}>
																										Use o padrão 24h. O navegador guarda a preferência; a entrega acontece no aplicativo
																										instalado.
																									</Text>
																								</PopoverBody>
																							</PopoverContent>
																						</Popover>
																					</HStack>
																					<TimePickerField
																						value={reminderTime}
																						onChange={setReminderTime}
																						isDisabled={isReminderTimeFieldDisabled}
																						triggerClassName={inputClassName}
																						inputClassName={inputField}
																						accessibilityLabel="Selecionar horário preferido do lembrete de vencimento"
																					/>
																					{!isReminderTimeValid ? (
																						<Text accessibilityRole="alert" className="ml-1 text-sm text-red-500 dark:text-red-400">
																							Informe um horário válido entre 00:00 e 23:59.
																						</Text>
																					) : null}
																				</VStack>
																			</VStack>
																		) : null}
																	</VStack>
																</VStack>
															</AccordionContent>
														</AccordionItem>
													</Accordion>

													<Button
														className={submitButtonClassName + ' web:h-12 web:rounded-2xl'}
														onPress={handleSubmit}
														isDisabled={isSaveDisabled}
													>
														{isSubmitting ? (
															<>
																<ButtonSpinner />
																<ButtonText>{isEditingMode ? 'Atualizando…' : 'Registrando…'}</ButtonText>
															</>
														) : (
															<ButtonText>{isEditingMode ? 'Atualizar gasto' : 'Registrar gasto'}</ButtonText>
														)}
													</Button>
												</VStack>
											</View>
										</View>
									</View>
								</View>
							</View>
						</View>
					</ScrollView>
					<Navigator defaultValue={1} onHardwareBack={handleBackToHome} />
				</KeyboardAvoidingView>
			</SafeAreaView>
		</ScreenDismissKeyboard>
	);
}
