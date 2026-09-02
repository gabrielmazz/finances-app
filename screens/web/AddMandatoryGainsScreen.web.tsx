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
import { MantineProvider, NumberInput } from '@mantine/core';

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
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';
import DatePickerField from '@/components/uiverse/shared/date-picker';
import WebSelectField from '@/components/web/shared/web-select-field';
import TagActionsheetSelector, {
	type TagActionsheetOption,
} from '@/components/uiverse/categories/tag-actionsheet-selector';
import TimePickerField from '@/components/uiverse/recurring/time-picker-field';
import { ScreenDismissKeyboard } from '@/components/uiverse/shared/screen-dismiss-keyboard';

import { auth } from '@/FirebaseConfig';
import { getAllTagsFirebase, getTagDataFirebase } from '@/functions/TagFirebase';
import {
	addMandatoryGainFirebase,
	clearMandatoryGainReceiptFirebase,
	getMandatoryGainFirebase,
	updateMandatoryGainFirebase,
} from '@/functions/MandatoryGainFirebase';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import { deleteGainFirebase } from '@/functions/GainFirebase';
import { cancelMandatoryGainNotification, scheduleMandatoryGainNotification } from '@/utils/mandatoryGainNotifications';
import {
	formatMandatoryReminderNextTrigger,
	type MandatoryReminderScheduleResult,
} from '@/utils/mandatoryReminderNotifications';
import {
	MANDATORY_REMINDER_CONFIG_VERSION,
	formatMandatoryReminderSummary,
	isMandatoryReminderConfigured,
	normalizeMandatoryReminderDaysBefore,
} from '@/utils/mandatoryReminderConfig';
import { clearPendingCreatedTag, peekPendingCreatedTag } from '@/utils/pendingCreatedTag';
import { isTagVisibleInMandatoryUsageList, tagSupportsUsage } from '@/utils/tagUsage';
import { APP_ROUTE_PATHS, navigateToHomeDashboard, navigateToRoute } from '@/utils/navigation';
import { getCurrentCycleKey, isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import { MAX_MONTHLY_BUSINESS_DAY, formatConfiguredMonthlyDueLabel } from '@/utils/businessCalendar';
import {
	MAX_MANDATORY_INSTALLMENTS,
	formatMandatoryInstallmentLabel,
	getMandatoryInstallmentEndDateFromTotal,
	getMandatoryInstallmentTotalFromDateRange,
	isMandatoryInstallmentPlanComplete,
	normalizeMandatoryInstallmentDate,
	normalizeMandatoryInstallmentTotal,
	resolveMandatoryInstallmentsCompleted,
	sanitizeMandatoryInstallmentInput,
} from '@/utils/mandatoryInstallments';
import {
	DEFAULT_MANDATORY_REMINDER_HOUR,
	DEFAULT_MANDATORY_REMINDER_MINUTE,
	DEFAULT_MANDATORY_REMINDER_TIME,
	formatMandatoryReminderTime,
	isMandatoryReminderTimeValid,
	parseMandatoryReminderTime,
} from '@/utils/mandatoryReminderTime';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';

import AddMandatoryGainListIllustration from '../../assets/UnDraw/addMandatoryGainsScreen.svg';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';
import { Info } from 'lucide-react-native';

type TagOption = {
	id: string;
	name: string;
	iconFamily?: TagIconFamily | null;
	iconName?: string | null;
	iconStyle?: TagIconStyle | null;
};

type ReceiptInfo = {
	gainId: string | null;
	receivedAt: Date | null;
	cycleKey: string | null;
};

type MandatoryGainFormSnapshot = {
	name: string;
	valueInCents: number | null;
	dueDay: string;
	usesBusinessDays: boolean;
	tagId: string | null;
	installmentTotal: number | null;
	installmentStartDate: string;
	installmentEndDate: string;
	description: string;
	reminderTime: string;
	reminderEnabled: boolean;
	reminderDaysBefore: 1 | 2 | 3;
	reminderOnDueDate: boolean;
};

type FocusableInputKey = 'gain-name' | 'gain-value' | 'due-day' | 'installments' | 'description';

const formatCurrencyBRL = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(valueInCents / 100);

const formatDateToBR = (date: Date) =>
	`${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

const parseDateFromBR = (value: string) => {
	const [dayString, monthString, yearString] = value.split('/');
	const day = Number(dayString);
	const month = Number(monthString);
	const year = Number(yearString);

	if (!day || !month || !year) {
		return null;
	}

	const candidate = new Date(year, month - 1, day);
	return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day
		? candidate
		: null;
};

const normalizeDateValue = (value: unknown): Date | null => {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value;
	}

	if (typeof value === 'object' && value !== null && 'toDate' in value) {
		const toDate = (value as { toDate?: () => Date }).toDate;
		if (typeof toDate === 'function') {
			return toDate() ?? null;
		}
	}

	if (typeof value === 'string' || typeof value === 'number') {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	return null;
};

const sanitizeDueDay = (value: string) => value.replace(/\D/g, '').slice(0, 2);
const MANDATORY_REMINDER_DAY_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: '1', label: '1 dia antes (1 aviso)' },
	{ value: '2', label: '2 dias antes (2 avisos)' },
	{ value: '3', label: '3 dias antes (3 avisos)' },
];

export default function AddMandatoryGainsScreen() {
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
	const params = useLocalSearchParams<{ gainTemplateId?: string | string[] }>();
	const editingGainTemplateId = React.useMemo(() => {
		const raw = Array.isArray(params.gainTemplateId) ? params.gainTemplateId[0] : params.gainTemplateId;
		return raw && raw.trim().length > 0 ? raw : null;
	}, [params.gainTemplateId]);

	const [tagOptions, setTagOptions] = React.useState<TagOption[]>([]);
	const [selectedTagId, setSelectedTagId] = React.useState<string | null>(null);
	const [selectedTagName, setSelectedTagName] = React.useState<string | null>(null);
	const [isLoadingTags, setIsLoadingTags] = React.useState(false);
	const [gainName, setGainName] = React.useState('');
	const [valueDisplay, setValueDisplay] = React.useState('');
	const [valueInCents, setValueInCents] = React.useState<number | null>(null);
	const [dueDay, setDueDay] = React.useState('');
	const [usesBusinessDays, setUsesBusinessDays] = React.useState(false);
	const [installmentsEnabled, setInstallmentsEnabled] = React.useState(false);
	const [installmentTotal, setInstallmentTotal] = React.useState('');
	const [installmentStartDate, setInstallmentStartDate] = React.useState(() => formatDateToBR(new Date()));
	const [installmentEndDate, setInstallmentEndDate] = React.useState('');
	const [settledInstallmentsCount, setSettledInstallmentsCount] = React.useState(0);
	const [description, setDescription] = React.useState('');
	const [reminderEnabled, setReminderEnabled] = React.useState(false);
	const [reminderTime, setReminderTime] = React.useState(DEFAULT_MANDATORY_REMINDER_TIME);
	const [reminderDaysBefore, setReminderDaysBefore] = React.useState<1 | 2 | 3>(1);
	const [reminderOnDueDate, setReminderOnDueDate] = React.useState(false);
	const [openDueSection, setOpenDueSection] = React.useState<string | null>(null);
	const [openOptionalSection, setOpenOptionalSection] = React.useState<string | null>(null);
	const [selectedGainTemplateId, setSelectedGainTemplateId] = React.useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isPrefilling, setIsPrefilling] = React.useState(false);
	const [currentReceiptInfo, setCurrentReceiptInfo] = React.useState<ReceiptInfo | null>(null);
	const [isReceiptActionLoading, setIsReceiptActionLoading] = React.useState(false);
	const [persistedFormSnapshot, setPersistedFormSnapshot] = React.useState<MandatoryGainFormSnapshot | null>(null);
	const submitLockRef = React.useRef(false);
	const applyPostSubmitBehavior = usePostSubmitBehavior('addMandatoryGains');
	const selectedTagLabel = React.useMemo(
		() =>
			selectedTagId ? (tagOptions.find((tag) => tag.id === selectedTagId)?.name ?? selectedTagName ?? null) : null,
		[selectedTagId, selectedTagName, tagOptions],
	);

	const gainNameInputRef = React.useRef<TextInput | null>(null);
	const gainValueInputRef = React.useRef<TextInput | null>(null);
	const dueDayInputRef = React.useRef<TextInput | null>(null);
	const installmentsInputRef = React.useRef<TextInput | null>(null);
	const descriptionInputRef = React.useRef<TextInput | null>(null);
	const keyboardScrollOffset = React.useCallback((key: FocusableInputKey) => (key === 'description' ? 180 : 120), []);

	const handleValueChange = React.useCallback((input: string) => {
		const digitsOnly = input.replace(/\D/g, '');
		if (!digitsOnly) {
			setValueDisplay('');
			setValueInCents(null);
			return;
		}

		const nextValueInCents = parseInt(digitsOnly, 10);
		setValueInCents(nextValueInCents);
		setValueDisplay(formatCurrencyBRL(nextValueInCents));
	}, []);

	const handleInstallmentTotalChange = React.useCallback(
		(input: string) => {
			const sanitizedValue = sanitizeMandatoryInstallmentInput(input);
			setInstallmentTotal(sanitizedValue);
			const normalizedTotal = normalizeMandatoryInstallmentTotal(Number(sanitizedValue));
			const computedEndDate = getMandatoryInstallmentEndDateFromTotal(
				parseDateFromBR(installmentStartDate),
				normalizedTotal,
			);
			setInstallmentEndDate(computedEndDate ? formatDateToBR(computedEndDate) : '');
		},
		[installmentStartDate],
	);

	const handleInstallmentsToggle = React.useCallback(
		(value: boolean) => {
			setOpenOptionalSection('optional');
			setInstallmentsEnabled(value);
			if (value) {
				const nextStartDate = installmentStartDate || formatDateToBR(new Date());
				const nextTotal =
					normalizeMandatoryInstallmentTotal(Number(installmentTotal)) ?? Math.max(1, settledInstallmentsCount);
				setInstallmentStartDate(nextStartDate);
				setInstallmentTotal(String(nextTotal));
				const computedEndDate = getMandatoryInstallmentEndDateFromTotal(parseDateFromBR(nextStartDate), nextTotal);
				setInstallmentEndDate(computedEndDate ? formatDateToBR(computedEndDate) : '');
			} else {
				setInstallmentEndDate('');
			}
		},
		[installmentStartDate, installmentTotal, settledInstallmentsCount],
	);

	const handleInstallmentStartDateChange = React.useCallback(
		(formattedValue: string, date: Date) => {
			setInstallmentStartDate(formattedValue);
			const normalizedTotal = normalizeMandatoryInstallmentTotal(Number(installmentTotal));
			const computedEndDate = getMandatoryInstallmentEndDateFromTotal(date, normalizedTotal);
			setInstallmentEndDate(computedEndDate ? formatDateToBR(computedEndDate) : '');
		},
		[installmentTotal],
	);

	const handleInstallmentEndDateChange = React.useCallback(
		(formattedValue: string, date: Date) => {
			setInstallmentEndDate(formattedValue);
			const totalFromRange = getMandatoryInstallmentTotalFromDateRange(parseDateFromBR(installmentStartDate), date);
			if (totalFromRange !== null) {
				setInstallmentTotal(String(totalFromRange));
			}
		},
		[installmentStartDate],
	);

	const handleReminderDaysBeforeChange = React.useCallback((value: string) => {
		setReminderDaysBefore(normalizeMandatoryReminderDaysBefore(value));
	}, []);

	const isDueDayValid = React.useMemo(() => {
		if (!dueDay) {
			return false;
		}
		const parsed = Number(dueDay);
		const maxDueDay = usesBusinessDays ? MAX_MONTHLY_BUSINESS_DAY : 31;
		return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxDueDay;
	}, [dueDay, usesBusinessDays]);
	const isReceivedForCurrentCycle = React.useMemo(
		() => isCycleKeyCurrent(currentReceiptInfo?.cycleKey),
		[currentReceiptInfo?.cycleKey],
	);
	const normalizedInstallmentTotal = React.useMemo(
		() =>
			installmentsEnabled && installmentTotal.trim()
				? normalizeMandatoryInstallmentTotal(Number(installmentTotal))
				: null,
		[installmentTotal, installmentsEnabled],
	);
	const parsedInstallmentStartDate = React.useMemo(() => parseDateFromBR(installmentStartDate), [installmentStartDate]);
	const parsedInstallmentEndDate = React.useMemo(() => parseDateFromBR(installmentEndDate), [installmentEndDate]);
	const isInstallmentTotalValid = !installmentsEnabled || normalizedInstallmentTotal !== null;
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
					isCurrentCycleCompleted: isReceivedForCurrentCycle,
				})
				: 0,
		[
			installmentsEnabled,
			isReceivedForCurrentCycle,
			normalizedInstallmentTotal,
			parsedInstallmentStartDate,
			settledInstallmentsCount,
		],
	);
	const isInstallmentTotalBelowSettled =
		installmentsEnabled &&
		normalizedInstallmentTotal !== null &&
		normalizedInstallmentTotal < resolvedSettledInstallmentsCount;
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

	const handleReminderToggle = React.useCallback(
		(value: boolean) => {
			if (!value) {
				setReminderEnabled(false);
				return;
			}

			if (!gainName.trim() || valueInCents === null || valueInCents <= 0 || !isDueDayValid || !selectedTagId) {
				showNotifierAlert({
					title: 'Lembrete indisponível',
					description: 'Preencha nome, valor, dia do recebimento e categoria antes de ativar o lembrete.',
					type: 'warn',
					isDarkMode,
					duration: 4500,
				});
				return;
			}

			setReminderTime((currentValue) =>
				parseMandatoryReminderTime(currentValue) ? currentValue : DEFAULT_MANDATORY_REMINDER_TIME,
			);
			setOpenOptionalSection('optional');
			setReminderEnabled(true);
			showNotifierAlert({
				title: 'Lembrete salvo no cadastro',
				description:
					'O navegador guarda a configuração, mas o aviso será agendado somente no aplicativo Android ou iOS instalado.',
				type: 'info',
				isDarkMode,
				duration: 5500,
			});
		},
		[gainName, isDarkMode, isDueDayValid, selectedTagId, valueInCents],
	);

	const buildFormSnapshot = React.useCallback(
		(): MandatoryGainFormSnapshot => ({
			name: gainName.trim(),
			valueInCents,
			dueDay: dueDay.trim(),
			usesBusinessDays,
			tagId: selectedTagId,
			installmentTotal: installmentsEnabled ? normalizedInstallmentTotal : null,
			installmentStartDate: installmentsEnabled ? installmentStartDate : '',
			installmentEndDate: installmentsEnabled ? installmentEndDate : '',
			description: description.trim(),
			reminderTime,
			reminderEnabled,
			reminderDaysBefore,
			reminderOnDueDate,
		}),
		[
			description,
			dueDay,
			gainName,
			installmentEndDate,
			installmentStartDate,
			installmentsEnabled,
			normalizedInstallmentTotal,
			reminderEnabled,
			reminderDaysBefore,
			reminderOnDueDate,
			reminderTime,
			selectedTagId,
			usesBusinessDays,
			valueInCents,
		],
	);

	const hasGainName = gainName.trim().length > 0;
	const hasGainValue = valueInCents !== null && valueInCents > 0;
	const isFormBusy = isSubmitting || isPrefilling;
	const isCoreTemplateReady = hasGainName && hasGainValue && isDueDayValid;
	const isInstallmentConfigReady =
		!installmentsEnabled ||
		(isInstallmentTotalValid &&
			isInstallmentStartDateValid &&
			isInstallmentEndDateValid &&
			!isInstallmentTotalBelowSettled);
	const isTemplateReady = isCoreTemplateReady && Boolean(selectedTagId) && isInstallmentConfigReady;
	const isValueFieldDisabled = !hasGainName || isFormBusy;
	const isDueDayFieldDisabled = !hasGainName || !hasGainValue || isFormBusy;
	const isInstallmentFieldDisabled = !isCoreTemplateReady || isFormBusy;
	const isTagSelectDisabled = isLoadingTags || !isCoreTemplateReady || isFormBusy;
	const isDescriptionDisabled = !isTemplateReady || isFormBusy;
	const isReminderTimeFieldDisabled = !reminderEnabled || isFormBusy;
	const hasPendingTemplateChanges = React.useMemo(() => {
		if (!selectedGainTemplateId || !persistedFormSnapshot) {
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
			currentSnapshot.installmentStartDate !== persistedFormSnapshot.installmentStartDate ||
			currentSnapshot.installmentEndDate !== persistedFormSnapshot.installmentEndDate ||
			currentSnapshot.description !== persistedFormSnapshot.description ||
			currentSnapshot.reminderTime !== persistedFormSnapshot.reminderTime ||
			currentSnapshot.reminderEnabled !== persistedFormSnapshot.reminderEnabled ||
			currentSnapshot.reminderDaysBefore !== persistedFormSnapshot.reminderDaysBefore ||
			currentSnapshot.reminderOnDueDate !== persistedFormSnapshot.reminderOnDueDate
		);
	}, [buildFormSnapshot, persistedFormSnapshot, selectedGainTemplateId]);

	const tagHelperMessage = isLoadingTags
		? 'Carregando categorias obrigatórias...'
		: tagOptions.length === 0
			? 'Cadastre uma categoria de ganho marcada como obrigatória para continuar.'
			: !isCoreTemplateReady
				? 'Preencha nome, valor e dia do recebimento para liberar a categoria.'
				: 'Selecione a categoria obrigatória que identifica este template.';
	const dueDayFieldLabel = usesBusinessDays ? 'Número do dia útil do recebimento' : 'Dia do recebimento';
	const dueDayPlaceholder = usesBusinessDays
		? `Informe um número entre 1 e ${MAX_MONTHLY_BUSINESS_DAY}`
		: 'Informe um dia entre 1 e 31';
	const dueDayErrorMessage = usesBusinessDays
		? `Informe um dia útil válido entre 1 e ${MAX_MONTHLY_BUSINESS_DAY}.`
		: 'Informe um dia válido entre 1 e 31.';
	const dueDayHelperMessage = usesBusinessDays
		? `${formatConfiguredMonthlyDueLabel(Number(dueDay || '1'), true)}. Fins de semana e feriados nacionais não contam.`
		: 'Use um dia fixo do mês. Se coincidir com feriado nacional, o calendário destacará a data.';
	const installmentHelperMessage = React.useMemo(() => {
		if (!isCoreTemplateReady) {
			return 'Preencha nome, valor e recebimento para liberar o parcelamento.';
		}
		if (!installmentsEnabled) {
			return 'Deixe desligado para um ganho fixo mensal sem limite de parcelas.';
		}
		if (!isInstallmentTotalValid) {
			return `Informe uma quantidade de parcelas entre 1 e ${MAX_MANDATORY_INSTALLMENTS}.`;
		}
		if (!isInstallmentStartDateValid) {
			return 'Informe uma data inicial válida para calcular o progresso das parcelas.';
		}
		if (!isInstallmentEndDateValid) {
			return 'Escolha a data final das parcelas no calendário.';
		}
		if (isInstallmentTotalBelowSettled) {
			return `Este ganho já tem ${resolvedSettledInstallmentsCount} parcela(s) registrada(s). Use uma quantidade igual ou maior.`;
		}
		return normalizedInstallmentTotal
			? `A listagem exibirá ${formatMandatoryInstallmentLabel(normalizedInstallmentTotal, resolvedSettledInstallmentsCount, isReceivedForCurrentCycle) ?? 'o progresso das parcelas'}.`
			: 'Informe a quantidade total de parcelas.';
	}, [
		installmentsEnabled,
		isCoreTemplateReady,
		isInstallmentEndDateValid,
		isInstallmentStartDateValid,
		isInstallmentTotalBelowSettled,
		isInstallmentTotalValid,
		isReceivedForCurrentCycle,
		normalizedInstallmentTotal,
		resolvedSettledInstallmentsCount,
	]);

	const getInputRef = React.useCallback((key: FocusableInputKey) => {
		switch (key) {
			case 'gain-name':
				return gainNameInputRef;
			case 'gain-value':
				return gainValueInputRef;
			case 'due-day':
				return dueDayInputRef;
			case 'installments':
				return installmentsInputRef;
			case 'description':
				return descriptionInputRef;
			default:
				return null;
		}
	}, []);
	const { scrollViewRef, contentBottomPadding, handleInputFocus, handleScroll, scrollEventThrottle } =
		useKeyboardAwareScroll<FocusableInputKey>({ getInputRef, keyboardScrollOffset });

	const resetForm = React.useCallback((options?: { keepTag?: boolean }) => {
		setSelectedGainTemplateId(null);
		setGainName('');
		setValueDisplay('');
		setValueInCents(null);
		setDueDay('');
		setUsesBusinessDays(false);
		setInstallmentsEnabled(false);
		setInstallmentTotal('');
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
		setSelectedTagId((current) => (options?.keepTag && current ? current : null));
		setCurrentReceiptInfo(null);
		setPersistedFormSnapshot(null);
	}, []);

	const handleOpenAddTagScreen = React.useCallback(() => {
		if (isFormBusy) {
			return;
		}
		navigateToRoute(APP_ROUTE_PATHS.addRegisterTag, {
			placement: 'mandatory-gain',
			returnAfterCreate: '1',
			returnToRoute: APP_ROUTE_PATHS.addMandatoryGains,
		});
	}, [isFormBusy]);
	const handleSelectTag = React.useCallback((tag: TagActionsheetOption) => {
		setSelectedTagId(tag.id);
		setSelectedTagName(tag.name);
	}, []);

	const loadTags = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showNotifierAlert({ description: 'Usuário não autenticado. Faça login novamente.', type: 'error', isDarkMode });
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
			const allowedIds = new Set<string>([currentUser.uid, ...relatedIds.filter((id) => typeof id === 'string')]);
			const formattedTags: TagOption[] = tagsResponse.data
				.filter((tag: any) => allowedIds.has(String(tag?.personId)) && isTagVisibleInMandatoryUsageList(tag, 'gain'))
				.map((tag: any) => ({
					id: tag.id,
					name: typeof tag?.name === 'string' && tag.name.trim() ? tag.name.trim() : 'Tag sem nome',
					iconFamily: typeof tag?.iconFamily === 'string' ? tag.iconFamily : null,
					iconName: typeof tag?.iconName === 'string' ? tag.iconName : null,
					iconStyle: typeof tag?.iconStyle === 'string' ? tag.iconStyle : null,
				}))
				.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
			const pendingCreatedTag = peekPendingCreatedTag();
			const matchingPendingTag =
				pendingCreatedTag && tagSupportsUsage(pendingCreatedTag.usageType, 'gain')
					? (formattedTags.find((tag) => tag.id === pendingCreatedTag.tagId) ?? null)
					: null;

			setTagOptions(formattedTags);
			if (matchingPendingTag) {
				setSelectedTagId(matchingPendingTag.id);
				setSelectedTagName(matchingPendingTag.name);
				clearPendingCreatedTag(matchingPendingTag.id);
			} else {
				setSelectedTagId((current) => (current && formattedTags.some((tag) => tag.id === current) ? current : null));
			}

			if (formattedTags.length === 0) {
				showNotifierAlert({
					description: 'Cadastre uma categoria de ganhos marcada como obrigatória para utilizar esta tela.',
					type: 'warn',
					isDarkMode,
				});
			}
		} catch (error) {
			console.error('Erro ao carregar categorias obrigatórias de ganhos:', error);
			showNotifierAlert({ description: 'Erro ao carregar categorias obrigatórias.', type: 'error', isDarkMode });
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
		const matchedTag = tagOptions.find((tag) => tag.id === selectedTagId);
		if (matchedTag) {
			setSelectedTagName(matchedTag.name);
			return;
		}
		if (!selectedTagId) {
			setSelectedTagName(null);
			return;
		}

		let isMounted = true;
		void getTagDataFirebase(selectedTagId)
			.then((result) => {
				if (!isMounted) {
					return;
				}
				setSelectedTagName(
					result.success && result.data && typeof result.data.name === 'string' ? result.data.name : null,
				);
			})
			.catch((error) => {
				console.error('Erro ao buscar dados da categoria obrigatória de ganho:', error);
				if (isMounted) {
					setSelectedTagName(null);
				}
			});

		return () => {
			isMounted = false;
		};
	}, [selectedTagId, tagOptions]);

	React.useEffect(() => {
		let isMounted = true;
		const prefillGainTemplate = async () => {
			if (!editingGainTemplateId) {
				resetForm({ keepTag: true });
				return;
			}

			setIsPrefilling(true);
			try {
				const response = await getMandatoryGainFirebase(editingGainTemplateId);
				if (!isMounted) {
					return;
				}
				if (!response.success || !response.data) {
					showNotifierAlert({
						description: 'Não foi possível carregar os dados do ganho obrigatório.',
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
						? (normalizeMandatoryInstallmentDate(data.installmentStartDate) ?? new Date())
						: null;
				const installmentEndDateValue =
					installmentTotalValue !== null
						? (normalizeMandatoryInstallmentDate(data.installmentEndDate) ??
							getMandatoryInstallmentEndDateFromTotal(installmentStartDateValue, installmentTotalValue))
						: null;
				const reminderFlag = isMandatoryReminderConfigured(data);
				const hasCurrentReminderConfig = data.reminderConfigVersion === MANDATORY_REMINDER_CONFIG_VERSION;
				const reminderDaysBeforeValue = hasCurrentReminderConfig
					? normalizeMandatoryReminderDaysBefore(data.reminderDaysBefore)
					: 1;
				const reminderOnDueDateValue = hasCurrentReminderConfig && data.reminderOnDueDate === true;
				const reminderHour =
					typeof data.reminderHour === 'number' ? data.reminderHour : DEFAULT_MANDATORY_REMINDER_HOUR;
				const reminderMinute =
					typeof data.reminderMinute === 'number' ? data.reminderMinute : DEFAULT_MANDATORY_REMINDER_MINUTE;
				const lastReceiptGainId =
					typeof data.lastReceiptGainId === 'string' && data.lastReceiptGainId ? data.lastReceiptGainId : null;
				const lastReceiptCycle =
					typeof data.lastReceiptCycle === 'string' && data.lastReceiptCycle ? data.lastReceiptCycle : null;
				const lastReceiptDate = normalizeDateValue(data.lastReceiptDate);
				const installmentsCompletedValue = resolveMandatoryInstallmentsCompleted({
					storedCompleted: data.installmentsCompleted,
					installmentTotal: installmentTotalValue,
					startDate: installmentStartDateValue,
					isCurrentCycleCompleted: isCycleKeyCurrent(lastReceiptCycle),
				});
				const normalizedStartDate = installmentStartDateValue ? formatDateToBR(installmentStartDateValue) : '';
				const normalizedEndDate = installmentEndDateValue ? formatDateToBR(installmentEndDateValue) : '';
				const normalizedReminderTime = formatMandatoryReminderTime(reminderHour, reminderMinute);

				setSelectedGainTemplateId(editingGainTemplateId);
				setGainName(name);
				setValueInCents(value);
				setValueDisplay(value ? formatCurrencyBRL(value) : '');
				setDueDay(String(dueDayValue).padStart(2, '0'));
				setUsesBusinessDays(usesBusinessDaysValue);
				setInstallmentsEnabled(installmentTotalValue !== null);
				setInstallmentTotal(installmentTotalValue !== null ? String(installmentTotalValue) : '');
				setInstallmentStartDate(normalizedStartDate || formatDateToBR(new Date()));
				setInstallmentEndDate(normalizedEndDate);
				setSettledInstallmentsCount(installmentsCompletedValue);
				setSelectedTagId(tagId);
				setDescription(descriptionValue);
				setReminderEnabled(reminderFlag);
				setReminderTime(normalizedReminderTime);
				setReminderDaysBefore(reminderDaysBeforeValue);
				setReminderOnDueDate(reminderOnDueDateValue);
				setOpenOptionalSection(installmentTotalValue !== null || reminderFlag ? 'optional' : null);
				setCurrentReceiptInfo({ gainId: lastReceiptGainId, cycleKey: lastReceiptCycle, receivedAt: lastReceiptDate });
				setPersistedFormSnapshot({
					name: name.trim(),
					valueInCents: value,
					dueDay: String(dueDayValue).padStart(2, '0'),
					usesBusinessDays: usesBusinessDaysValue,
					tagId,
					installmentTotal: installmentTotalValue,
					installmentStartDate: normalizedStartDate,
					installmentEndDate: normalizedEndDate,
					description: descriptionValue.trim(),
					reminderTime: normalizedReminderTime,
					reminderEnabled: reminderFlag,
					reminderDaysBefore: reminderDaysBeforeValue,
					reminderOnDueDate: reminderOnDueDateValue,
				});
			} catch (error) {
				console.error('Erro ao carregar ganho obrigatório para edição:', error);
				if (isMounted) {
					showNotifierAlert({
						description: 'Erro ao carregar o ganho obrigatório selecionado.',
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

		void prefillGainTemplate();
		return () => {
			isMounted = false;
		};
	}, [editingGainTemplateId, isDarkMode, resetForm]);

	const handleSubmit = React.useCallback(async () => {
		if (submitLockRef.current || isSubmitting) {
			return;
		}

		const trimmedName = gainName.trim();
		const showValidationError = (descriptionText: string) =>
			showNotifierAlert({
				title: 'Erro ao salvar ganho obrigatório',
				description: descriptionText,
				type: 'error',
				isDarkMode,
				duration: 4500,
			});

		if (!trimmedName) return showValidationError('Informe o nome do ganho obrigatório.');
		if (valueInCents === null || valueInCents <= 0) return showValidationError('Informe um valor válido.');
		if (!isDueDayValid)
			return showValidationError(
				usesBusinessDays
					? `Informe um número de dia útil entre 1 e ${MAX_MONTHLY_BUSINESS_DAY}.`
					: 'Informe um dia do mês entre 1 e 31.',
			);
		if (!selectedTagId) return showValidationError('Selecione uma categoria obrigatória.');
		if (installmentsEnabled && normalizedInstallmentTotal === null)
			return showValidationError(`Informe uma quantidade de parcelas entre 1 e ${MAX_MANDATORY_INSTALLMENTS}.`);
		if (installmentsEnabled && parsedInstallmentStartDate === null)
			return showValidationError('Informe uma data inicial válida para as parcelas.');
		if (installmentsEnabled && parsedInstallmentEndDate === null)
			return showValidationError('Informe uma data final válida para as parcelas.');
		if (installmentsEnabled && isInstallmentTotalBelowSettled)
			return showValidationError(
				`Este ganho já tem ${resolvedSettledInstallmentsCount} parcela(s) registrada(s). A quantidade total precisa ser igual ou maior.`,
			);

		const parsedReminderTime = parseMandatoryReminderTime(reminderTime);
		if (reminderEnabled && !parsedReminderTime)
			return showValidationError('Informe um horário válido para o lembrete no formato 24h, como 19:00.');
		const currentUser = auth.currentUser;
		if (!currentUser) return showValidationError('Usuário não autenticado.');

		submitLockRef.current = true;
		setIsSubmitting(true);
		try {
			const payloadInstallmentsCompleted =
				installmentsEnabled && normalizedInstallmentTotal !== null ? resolvedSettledInstallmentsCount : 0;
			const payload = {
				name: trimmedName,
				valueInCents,
				dueDay: Number(dueDay),
				usesBusinessDays,
				tagId: selectedTagId,
				description: description.trim() || null,
				reminderEnabled,
				reminderHour: parsedReminderTime?.hour ?? DEFAULT_MANDATORY_REMINDER_HOUR,
				reminderMinute: parsedReminderTime?.minute ?? DEFAULT_MANDATORY_REMINDER_MINUTE,
				reminderConfigVersion: MANDATORY_REMINDER_CONFIG_VERSION,
				reminderDaysBefore,
				reminderOnDueDate,
				installmentTotal: installmentsEnabled ? normalizedInstallmentTotal : null,
				installmentsCompleted: payloadInstallmentsCompleted,
				installmentStartDate: installmentsEnabled ? parsedInstallmentStartDate : null,
				installmentEndDate: installmentsEnabled ? parsedInstallmentEndDate : null,
			};

			let persistedId = selectedGainTemplateId;
			const successTitle = selectedGainTemplateId ? 'Ganho obrigatório atualizado' : 'Ganho obrigatório registrado';
			if (selectedGainTemplateId) {
				const result = await updateMandatoryGainFirebase({ gainTemplateId: selectedGainTemplateId, ...payload });
				if (!result.success) throw new Error('Erro ao atualizar o ganho obrigatório.');
			} else {
				const result = await addMandatoryGainFirebase({ ...payload, personId: currentUser.uid });
				if (!result.success || !result.id) throw new Error('Erro ao registrar ganho obrigatório.');
				persistedId = result.id;
			}

			let reminderFeedback: MandatoryReminderScheduleResult | null = null;
			let reminderOperationError: string | null = null;
			if (persistedId) {
				try {
					if (reminderEnabled) {
						reminderFeedback = await scheduleMandatoryGainNotification({
							accountId: currentUser.uid,
							gainTemplateId: persistedId,
							name: payload.name,
							dueDay: payload.dueDay,
							usesBusinessDays: payload.usesBusinessDays,
							reminderHour: payload.reminderHour,
							reminderMinute: payload.reminderMinute,
							reminderDaysBefore: payload.reminderDaysBefore,
							reminderOnDueDate: payload.reminderOnDueDate,
							description: payload.description ?? undefined,
							lastCompletedCycle: currentReceiptInfo?.cycleKey ?? undefined,
							activeFromDate: payload.installmentStartDate ?? undefined,
							activeThroughDate: payload.installmentEndDate ?? undefined,
							requestPermission: true,
						});
					} else {
						await cancelMandatoryGainNotification(currentUser.uid, persistedId);
					}
				} catch (notificationError) {
					console.error('Erro ao atualizar a agenda do ganho obrigatório salvo:', notificationError);
					reminderOperationError = 'Não foi possível atualizar a agenda local neste dispositivo.';
				}
			}

			const reminderFailureMessage =
				reminderOperationError ??
				(reminderEnabled && reminderFeedback && !reminderFeedback.success ? reminderFeedback.message : null);
			if (reminderFailureMessage) {
				showNotifierAlert({
					title: successTitle,
					description: `O template foi salvo, mas o lembrete não foi agendado. ${reminderFailureMessage}`,
					type: 'warn',
					isDarkMode,
					duration: 5500,
				});
			} else if (reminderEnabled && reminderFeedback?.success && reminderFeedback.capacityLimited) {
				showNotifierAlert({
					title: successTitle,
					description: `O lembrete foi salvo com agenda reduzida (${reminderFeedback.scheduledCount} avisos mantidos). Próximo aviso em ${formatMandatoryReminderNextTrigger(reminderFeedback.nextTriggerAt)}.`,
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

			if (selectedGainTemplateId) {
				setPersistedFormSnapshot(buildFormSnapshot());
			}
			applyPostSubmitBehavior({
				resetForm: !editingGainTemplateId ? resetForm : undefined,
				isEditing: Boolean(editingGainTemplateId),
			});
		} catch (error) {
			console.error('Erro ao salvar ganho obrigatório:', error);
			showNotifierAlert({
				title: 'Erro ao salvar ganho obrigatório',
				description: 'Não foi possível salvar o ganho obrigatório.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
		} finally {
			submitLockRef.current = false;
			setIsSubmitting(false);
		}
	}, [
		applyPostSubmitBehavior,
		buildFormSnapshot,
		currentReceiptInfo?.cycleKey,
		description,
		dueDay,
		editingGainTemplateId,
		gainName,
		isDarkMode,
		isDueDayValid,
		isInstallmentTotalBelowSettled,
		isSubmitting,
		installmentsEnabled,
		normalizedInstallmentTotal,
		parsedInstallmentEndDate,
		parsedInstallmentStartDate,
		reminderEnabled,
		reminderDaysBefore,
		reminderOnDueDate,
		reminderTime,
		resetForm,
		resolvedSettledInstallmentsCount,
		selectedGainTemplateId,
		selectedTagId,
		usesBusinessDays,
		valueInCents,
	]);

	const isInstallmentPlanCompleted = React.useMemo(
		() => isMandatoryInstallmentPlanComplete(normalizedInstallmentTotal, resolvedSettledInstallmentsCount),
		[normalizedInstallmentTotal, resolvedSettledInstallmentsCount],
	);
	const handleRegisterReceiptNavigation = React.useCallback(() => {
		if (!selectedGainTemplateId) {
			showNotifierAlert({
				title: 'Controle mensal indisponível',
				description: 'Salve o ganho obrigatório antes de registrá-lo como recebido.',
				type: 'warn',
				isDarkMode,
				duration: 4500,
			});
			return;
		}
		if (isReceivedForCurrentCycle) {
			showNotifierAlert({
				title: 'Recebimento já registrado',
				description: 'Este ganho já foi registrado como recebido neste mês.',
				type: 'warn',
				isDarkMode,
				duration: 4500,
			});
			return;
		}
		if (isInstallmentPlanCompleted) {
			showNotifierAlert({
				title: 'Parcelamento concluído',
				description: 'Todas as parcelas deste ganho obrigatório já foram registradas.',
				type: 'warn',
				isDarkMode,
				duration: 4500,
			});
			return;
		}
		if (!isTemplateReady || hasPendingTemplateChanges) {
			showNotifierAlert({
				title: 'Salve as alterações primeiro',
				description: 'Salve o template atualizado antes de registrar o ganho deste mês.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}
		const requiredValueInCents = valueInCents;
		if (requiredValueInCents === null || !selectedTagId) return;
		const receiptParams: Record<string, string> = {
			templateName: encodeURIComponent(gainName || 'Ganho obrigatório'),
			templateValueInCents: String(requiredValueInCents),
			templateTagId: selectedTagId,
			templateMandatoryGainId: selectedGainTemplateId,
		};
		if (selectedTagLabel) receiptParams.templateTagName = encodeURIComponent(selectedTagLabel);
		if (description.trim()) receiptParams.templateDescription = encodeURIComponent(description.trim());
		if (dueDay.trim()) receiptParams.templateDueDay = dueDay;
		if (usesBusinessDays) receiptParams.templateUsesBusinessDays = '1';
		navigateToRoute(APP_ROUTE_PATHS.addRegisterGain, receiptParams);
	}, [
		description,
		dueDay,
		gainName,
		hasPendingTemplateChanges,
		isDarkMode,
		isInstallmentPlanCompleted,
		isReceivedForCurrentCycle,
		isTemplateReady,
		selectedGainTemplateId,
		selectedTagId,
		selectedTagLabel,
		usesBusinessDays,
		valueInCents,
	]);

	const handleReclaimReceipt = React.useCallback(async () => {
		if (!selectedGainTemplateId) return;
		setIsReceiptActionLoading(true);
		try {
			if (currentReceiptInfo?.gainId) await deleteGainFirebase(currentReceiptInfo.gainId);
			const result = await clearMandatoryGainReceiptFirebase(selectedGainTemplateId);
			if (!result.success) throw new Error('Erro ao remover o registro de recebimento.');
			setCurrentReceiptInfo(null);
			showNotifierAlert({
				title: 'Recebimento do mês desfeito',
				description: 'O registro mensal foi removido. Faça um novo lançamento quando necessário.',
				type: 'success',
				isDarkMode,
				duration: 4000,
			});
		} catch (error) {
			console.error('Erro ao desfazer recebimento do ganho obrigatório:', error);
			showNotifierAlert({
				title: 'Erro ao desfazer recebimento',
				description: 'Não foi possível desfazer o recebimento. Tente novamente.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
		} finally {
			setIsReceiptActionLoading(false);
		}
	}, [currentReceiptInfo?.gainId, isDarkMode, selectedGainTemplateId]);

	const isSaveDisabled = !isTemplateReady || isFormBusy || (reminderEnabled && !isReminderTimeValid);
	const isEditingMode = Boolean(editingGainTemplateId);
	const screenTitle = isEditingMode ? 'Atualize seu ganho obrigatório' : 'Registro de ganho obrigatório';
	const monthlyControlMessage =
		isPrefilling && isEditingMode
			? 'Carregando os dados do ganho obrigatório salvo.'
			: !selectedGainTemplateId
				? 'Salve este template para liberar o registro do ciclo atual.'
				: hasPendingTemplateChanges
					? 'Salve as alterações para usar os dados atualizados ao registrar o recebimento deste mês.'
					: isReceivedForCurrentCycle
						? `Recebimento registrado em ${currentReceiptInfo?.receivedAt ? formatDateToBR(currentReceiptInfo.receivedAt) : 'data não disponível'}.`
						: `Pronto para registrar o ciclo ${getCurrentCycleKey()}. O banco e a data exata serão definidos no próximo passo.`;
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
				<KeyboardAvoidingView
					className={webDashboardClassNames.fill}
					behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				>
					<ScrollView
						ref={scrollViewRef}
						className={`${webDashboardClassNames.fill} web:relative web:z-[3]`}
						contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(110, contentBottomPadding) }}
						showsVerticalScrollIndicator={false}
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="on-drag"
						onScroll={handleScroll}
						scrollEventThrottle={scrollEventThrottle}
					>
						<View
							className={webDashboardClassNames.fill}
							style={{ backgroundColor: surfaceBackground, position: 'relative' }}
						>
							<View
								className={webDashboardClassNames.hero}
								style={{ height: heroHeight, backgroundColor: surfaceBackground }}
							>
								<RNImage
									source={LoginWallpaper}
									accessibilityLabel="Background da tela de ganho obrigatório"
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
									Illustration={AddMandatoryGainListIllustration}
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
										style={{ display: 'flex', flex: 1, flexDirection: 'column' }}
									>
										<View className={webExpenseClassNames.formScroll}>
											<VStack className="gap-5">
												<View className={webExpenseClassNames.fieldGrid}>
													<VStack className={webExpenseClassNames.fieldHalf}>
														<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Nome do ganho</Text>
														<Input className={inputClassName} isDisabled={isFormBusy}>
															<InputField
																accessibilityLabel="Nome do ganho"
																ref={gainNameInputRef}
																placeholder="Ex.: Salário, aluguel ou freelance…"
																value={gainName}
																onChangeText={setGainName}
																autoCapitalize="sentences"
																returnKeyType="next"
																className={inputField}
																onFocus={() => handleInputFocus('gain-name')}
																onSubmitEditing={() => gainValueInputRef.current?.focus?.()}
															/>
														</Input>
													</VStack>
													<VStack className={webExpenseClassNames.fieldHalf}>
														<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Valor mensal</Text>
														<Input className={inputClassName} isDisabled={isValueFieldDisabled}>
															<InputField
																accessibilityLabel="Valor mensal"
																ref={gainValueInputRef}
																placeholder="Ex.: R$ 1.500,00…"
																value={valueDisplay}
																onChangeText={handleValueChange}
																keyboardType="numeric"
																inputMode="numeric"
																returnKeyType="next"
																className={inputField}
																onFocus={() => handleInputFocus('gain-value')}
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
															onChangeText={(value) => setDueDay(sanitizeDueDay(value))}
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
													onValueChange={(value) => setOpenDueSection(value[0] ?? null)}
													className="w-full"
												>
													<AccordionItem value="due" className={`${cardClassName} overflow-hidden !p-0`}>
														<AccordionHeader>
															<AccordionTrigger className="px-4 py-3">
																{({ isExpanded }: { isExpanded: boolean }) => (
																	<View className="relative w-full">
																		<AccordionTitleText className={`${helperText} self-center text-xs`}>
																			Mais opções do recebimento
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
															<VStack className="gap-2">
																<HStack className="items-center justify-between gap-4">
																	<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} mb-0 ml-0`}>
																		Contar por dia útil
																	</Text>
																	<Switch
																		value={usesBusinessDays}
																		onValueChange={setUsesBusinessDays}
																		disabled={isFormBusy}
																		trackColor={switchTrackColor}
																		thumbColor={switchThumbColor}
																		activeThumbColor={switchActiveThumbColor}
																		ios_backgroundColor={switchIosBackgroundColor}
																		accessibilityLabel="Contar recebimento por dia útil"
																	/>
																</HStack>
															</VStack>
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
																		Campo opcional. Use para explicar o contexto deste recebimento mensal.
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
															accessibilityLabel="Observações do ganho obrigatório"
															ref={descriptionInputRef}
															placeholder="Adicione um contexto rápido para este ganho…"
															multiline
															value={description}
															onChangeText={setDescription}
															className={`${inputField} pt-2`}
															onFocus={() => handleInputFocus('description')}
															editable={!isDescriptionDisabled}
														/>
													</Textarea>
												</VStack>

												<VStack className={webExpenseClassNames.fieldFull}>
													<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>
														Categoria obrigatória
													</Text>
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
														placeholder="Selecione a categoria do ganho…"
														sheetTitle="Escolha a categoria obrigatória"
														emptyMessage="Nenhuma categoria obrigatória de ganho disponível."
														triggerHint={tagHelperMessage}
														disabledHint={tagHelperMessage}
														accessibilityLabel="Escolher categoria obrigatória de ganho"
														onCreatePress={handleOpenAddTagScreen}
														createActionLabel="Adicionar categoria obrigatória de ganho"
														isCreateDisabled={isFormBusy}
													/>
												</VStack>

												<Accordion
													size="md"
													variant="unfilled"
													type="single"
													isCollapsible
													value={openOptionalSection ? [openOptionalSection] : []}
													onValueChange={(value) => setOpenOptionalSection(value[0] ?? null)}
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
																		<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} mb-0 ml-0`}>
																			Parcelamento
																		</Text>
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
																			<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} !mb-0`}>
																				Quantidade de parcelas
																			</Text>
																			<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
																				<NumberInput
																					value={installmentTotal === '' ? '' : Number(installmentTotal)}
																					onChange={(value) => handleInstallmentTotalChange(String(value))}
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
																			<HStack className="w-full gap-3 web:flex-row">
																				<VStack className="min-w-0 flex-1 gap-2">
																					<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} !mb-0`}>
																						Início
																					</Text>
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
																					<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} !mb-0`}>
																						Fim
																					</Text>
																					<DatePickerField
																						value={installmentEndDate}
																						onChange={handleInstallmentEndDateChange}
																						triggerClassName={inputClassName}
																						inputClassName={inputField}
																						placeholder={
																							isInstallmentEndDateUnlocked
																								? 'Data final…'
																								: 'Informe a quantidade primeiro…'
																						}
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
																		<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} mb-0 ml-0`}>
																			Lembrete do recebimento
																		</Text>
																		<Switch
																			value={reminderEnabled}
																			onValueChange={handleReminderToggle}
																			disabled={!isTemplateReady || isFormBusy}
																			trackColor={switchTrackColor}
																			thumbColor={switchThumbColor}
																			activeThumbColor={switchActiveThumbColor}
																			ios_backgroundColor={switchIosBackgroundColor}
																			accessibilityLabel="Ativar lembrete do recebimento"
																		/>
																	</HStack>
																	{reminderEnabled ? (
																		<VStack className="gap-3">
																			<VStack className="gap-2">
																				<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} !mb-0`}>Começar a lembrar</Text>
																				<WebSelectField
																					options={MANDATORY_REMINDER_DAY_OPTIONS}
																					value={String(reminderDaysBefore)}
																					onChange={handleReminderDaysBeforeChange}
																					isDisabled={isFormBusy}
																					placeholder="Escolha quando começar…"
																					accessibilityLabel="Antecedência do lembrete de recebimento"
																				/>
																			</VStack>

																			<HStack className="items-center justify-between gap-4">
																				<VStack className="min-w-0 flex-1 gap-1">
																					<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} mb-0 ml-0`}>
																						Avisar também no recebimento
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
																					accessibilityLabel="Avisar também no recebimento"
																				/>
																			</HStack>

																			<HStack className="items-center gap-1">
																				<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText} !mb-0`}>
																					Horário preferido
																				</Text>
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
																								Use o padrão 24h. O navegador guarda a preferência; a entrega acontece
																								no aplicativo instalado.
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
																				accessibilityLabel="Selecionar horário preferido do lembrete de recebimento"
																			/>
																			{!isReminderTimeValid ? (
																				<Text
																					accessibilityRole="alert"
																					className="ml-1 text-sm text-red-500 dark:text-red-400"
																				>
																					Informe um horário válido entre 00:00 e 23:59.
																				</Text>
																			) : null}
																		</VStack>
																	) : null}
																</VStack>
															</VStack>
														</AccordionContent>
													</AccordionItem>
												</Accordion>

												{selectedGainTemplateId ? (
													<View className={cardClassName}>
														<VStack className="gap-3">
															<Text className={`${bodyText} font-semibold`}>Controle mensal</Text>
															<Text className={`${helperText} text-sm leading-5`}>{monthlyControlMessage}</Text>
															<HStack className="flex-wrap gap-3">
																{!isReceivedForCurrentCycle && !isInstallmentPlanCompleted ? (
																	<Button
																		className={submitButtonClassName}
																		onPress={handleRegisterReceiptNavigation}
																		isDisabled={!isTemplateReady || hasPendingTemplateChanges || isReceiptActionLoading}
																	>
																		{isReceiptActionLoading ? <ButtonSpinner /> : null}
																		<ButtonText>Registrar recebimento</ButtonText>
																	</Button>
																) : null}
																{isReceivedForCurrentCycle ? (
																	<Button
																		variant="outline"
																		className={submitButtonCancelClassName}
																		onPress={handleReclaimReceipt}
																		isDisabled={isReceiptActionLoading}
																	>
																		{isReceiptActionLoading ? <ButtonSpinner /> : null}
																		<ButtonText>Desfazer recebimento</ButtonText>
																	</Button>
																) : null}
															</HStack>
														</VStack>
													</View>
												) : null}
												<Button
													className={`${submitButtonClassName} web:h-12 web:rounded-2xl`}
													onPress={handleSubmit}
													isDisabled={isSaveDisabled}
												>
													{isSubmitting ? (
														<>
															<ButtonSpinner />
															<ButtonText>{isEditingMode ? 'Atualizando…' : 'Registrando…'}</ButtonText>
														</>
													) : (
														<ButtonText>{isEditingMode ? 'Atualizar ganho' : 'Registrar ganho'}</ButtonText>
													)}
												</Button>
											</VStack>
										</View>
									</View>
								</View>
							</View>
						</View>
					</ScrollView>
					<Navigator
						defaultValue={1}
						onHardwareBack={() => {
							navigateToHomeDashboard();
							return true;
						}}
					/>
				</KeyboardAvoidingView>
			</SafeAreaView>
		</ScreenDismissKeyboard>
	);
}
