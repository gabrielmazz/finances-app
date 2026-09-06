import React from 'react';
import {
	ScrollView,
	View,
	StatusBar,
	KeyboardAvoidingView,
	Platform,
	TextInput,
	Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

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

import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import Navigator from '@/components/uiverse/navigation/navigator';
import DatePickerField from '@/components/uiverse/shared/date-picker';
import TagActionsheetSelector, { type TagActionsheetOption } from '@/components/uiverse/categories/tag-actionsheet-selector';
import TimePickerField from '@/components/uiverse/recurring/time-picker-field';

import { auth } from '@/FirebaseConfig';
import { getAllTagsFirebase, getTagDataFirebase } from '@/functions/TagFirebase';
import {
	addMandatoryGainFirebase,
	getMandatoryGainFirebase,
	updateMandatoryGainFirebase,
} from '@/functions/MandatoryGainFirebase';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import {
	cancelMandatoryGainNotification,
	ensureNotificationPermissionForMandatoryGains,
	scheduleMandatoryGainNotification,
} from '@/utils/mandatoryGainNotifications';
import {
	MANDATORY_REMINDER_CONFIG_VERSION,
	formatMandatoryReminderSummary,
	isMandatoryReminderConfigured,
	normalizeMandatoryReminderDaysBefore,
} from '@/utils/mandatoryReminderConfig';
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
import AddMandatoryGainListIllustration from '../../assets/UnDraw/addMandatoryGainsScreen.svg';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';
import { Info } from 'lucide-react-native';
import {
	DEFAULT_MANDATORY_REMINDER_HOUR,
	DEFAULT_MANDATORY_REMINDER_MINUTE,
	DEFAULT_MANDATORY_REMINDER_TIME,
	formatMandatoryReminderTime,
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
type FocusableInputKey = 'gain-name' | 'gain-value' | 'due-day' | 'installments' | 'description';

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
export default function AddMandatoryGainsScreen() {
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
	const [installmentTotalValueDisplay, setInstallmentTotalValueDisplay] = React.useState('');
	const [installmentTotalValueInCents, setInstallmentTotalValueInCents] = React.useState<number | null>(null);
	const [installmentStartDate, setInstallmentStartDate] = React.useState(() => formatDateToBR(new Date()));
	const [installmentEndDate, setInstallmentEndDate] = React.useState('');
	const [settledInstallmentsCount, setSettledInstallmentsCount] = React.useState(0);
	const [description, setDescription] = React.useState('');
	// Segue [[Receitas Fixas]]: o lembrete só é liberado quando o template base estiver completo.
	const [reminderEnabled, setReminderEnabled] = React.useState(false);
	const [reminderTime, setReminderTime] = React.useState(DEFAULT_MANDATORY_REMINDER_TIME);
	const [reminderDaysBefore, setReminderDaysBefore] = React.useState<1 | 2 | 3>(1);
	const [reminderOnDueDate, setReminderOnDueDate] = React.useState(false);
	const [selectedGainTemplateId, setSelectedGainTemplateId] = React.useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isPrefilling, setIsPrefilling] = React.useState(false);
	const [lastReceiptCycle, setLastReceiptCycle] = React.useState<string | null>(null);
	const submitLockRef = React.useRef(false);
	const applyPostSubmitBehavior = usePostSubmitBehavior('addMandatoryGains');
	const selectedTagLabel = React.useMemo(() => {
		if (!selectedTagId) {
			return null;
		}
		return tagOptions.find(tag => tag.id === selectedTagId)?.name ?? selectedTagName ?? null;
	}, [selectedTagId, selectedTagName, tagOptions]);

	const gainNameInputRef = React.useRef<TextInput | null>(null);
	const gainValueInputRef = React.useRef<TextInput | null>(null);
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

	const handleReminderToggle = React.useCallback(async (value: boolean) => {
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

		const permissionResult = await ensureNotificationPermissionForMandatoryGains();
		if (!permissionResult.granted) {
			showNotifierAlert({
				title: 'Lembrete indisponível',
				description:
					permissionResult.reason === 'unavailable'
						? 'Lembretes agendados estão disponíveis somente na versão instalada do aplicativo Android ou iOS.'
						: 'Ative as notificações do aplicativo nas configurações do dispositivo para receber lembretes.',
				type: 'warn',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		setReminderTime(currentValue =>
			parseMandatoryReminderTime(currentValue) ? currentValue : DEFAULT_MANDATORY_REMINDER_TIME,
		);
		setReminderEnabled(value);
	}, [gainName, isDarkMode, isDueDayValid, selectedTagId, valueInCents]);

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

	const hasGainName = gainName.trim().length > 0;
	const hasGainValue = valueInCents !== null && valueInCents > 0;
	const isFormBusy = isSubmitting || isPrefilling;
	const isCoreTemplateReady = hasGainName && hasGainValue && isDueDayValid;
	const isInstallmentConfigReady =
		!installmentsEnabled ||
		(isInstallmentTotalValid &&
			isInstallmentTotalValueValid &&
			isInstallmentStartDateValid &&
			isInstallmentEndDateValid &&
			!isInstallmentTotalBelowSettled);
	const isTemplateReady = isCoreTemplateReady && Boolean(selectedTagId) && isInstallmentConfigReady;
	const isValueFieldDisabled = !hasGainName || isFormBusy || installmentsEnabled;
	const isDueDayFieldDisabled = !hasGainName || !hasGainValue || isFormBusy;
	const isInstallmentFieldDisabled = !hasGainName || !isDueDayValid || isFormBusy;
	const isTagSelectDisabled = isLoadingTags || !isCoreTemplateReady || isFormBusy;
	const isAddTagButtonDisabled = isFormBusy;
	const isDescriptionDisabled = !isTemplateReady || isFormBusy;
	const isReminderTimeFieldDisabled = !reminderEnabled || isFormBusy;
	const tagHelperMessage = isLoadingTags
		? 'Carregando categorias obrigatórias...'
		: tagOptions.length === 0
			? 'Cadastre uma tag de ganho marcada como obrigatória para continuar.'
			: !isCoreTemplateReady
				? 'Preencha nome, valor e dia do recebimento para liberar a categoria.'
				: 'Selecione a categoria obrigatória que identifica este template.';

	const reminderHelperMessage = !isTemplateReady
		? 'Preencha nome, valor, dia do recebimento e categoria antes de ativar o lembrete.'
		: reminderEnabled
			? isReminderTimeValid
				? `Lembrete ativo: ${reminderSummary} para ${formatConfiguredMonthlyDueLabel(Number(dueDay || '1'), usesBusinessDays)}.`
				: 'Defina um horário válido no padrão 24h para agendar o lembrete.'
			: 'Ative para receber um lembrete mensal no dia configurado.';

	const dueDayFieldLabel = usesBusinessDays ? 'Número do dia útil do recebimento' : 'Dia do recebimento';
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
		? `Este ganho será tratado como ${formatConfiguredMonthlyDueLabel(Number(dueDay || '1'), true)}. Se o mês tiver menos dias úteis, usamos o último dia útil disponível.`
		: 'Ative quando o recebimento seguir um dia útil do mês, como salário no 5º dia útil.';
	const installmentHelperMessage = React.useMemo(() => {
		if (!isCoreTemplateReady) {
			return 'Preencha nome, valor e recebimento para liberar o parcelamento.';
		}
		if (!installmentsEnabled) {
			return 'Deixe desligado para uma receita fixa mensal sem limite de parcelas.';
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
			return `Este ganho já tem ${resolvedSettledInstallmentsCount} parcela(s) registrada(s). Use uma quantidade igual ou maior.`;
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

	const getInputRef = React.useCallback(
		(key: FocusableInputKey) => {
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

	const resetForm = React.useCallback((options?: { keepTag?: boolean }) => {
		setSelectedGainTemplateId(null);
		setGainName('');
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
		setSelectedTagId(current => {
			if (options?.keepTag && current) {
				return current;
			}
			return null;
		});
		setLastReceiptCycle(null);
	}, []);

	// Segue [[Receitas Fixas]] e [[Gerenciamento de Tags]]: a categoria obrigatória pode ser criada inline e voltar já elegível neste filtro.
	const handleOpenAddTagScreen = React.useCallback(() => {
		if (isAddTagButtonDisabled) {
			return;
		}

		navigateToRoute(APP_ROUTE_PATHS.addRegisterTag, {
			placement: 'mandatory-gain',
			returnAfterCreate: '1',
			returnToRoute: APP_ROUTE_PATHS.addMandatoryGains,
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
					return isTagVisibleInMandatoryUsageList(tag, 'gain') && belongsToAllowedUser;
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
				pendingCreatedTag && tagSupportsUsage(pendingCreatedTag.usageType, 'gain')
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
					description: 'Cadastre uma tag de ganhos marcada como obrigatória para utilizar esta tela.',
					type: 'warn',
					isDarkMode,
				});
			}
		} catch (error) {
			console.error('Erro ao carregar tags obrigatórias de ganhos:', error);
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
				console.error('Erro ao buscar dados da tag obrigatória de ganho:', error);
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
						? normalizeMandatoryInstallmentDate(data.installmentStartDate) ?? new Date()
						: null;
				const installmentEndDateValue =
					installmentTotalValue !== null
						? normalizeMandatoryInstallmentDate(data.installmentEndDate) ??
							getMandatoryInstallmentEndDateFromTotal(installmentStartDateValue, installmentTotalValue)
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
				const lastReceiptCycle =
					typeof data.lastReceiptCycle === 'string' && data.lastReceiptCycle.length > 0
						? data.lastReceiptCycle
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
					isCurrentCycleCompleted: isCycleKeyCurrent(lastReceiptCycle),
				});

				setSelectedGainTemplateId(editingGainTemplateId);
				setGainName(name);
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
				setLastReceiptCycle(lastReceiptCycle);
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
	}, [editingGainTemplateId, resetForm]);

	const handleSubmit = React.useCallback(async () => {
		if (submitLockRef.current || isSubmitting) {
			return;
		}

		const trimmedName = gainName.trim();

		if (!trimmedName) {
			showNotifierAlert({
				title: 'Erro ao salvar ganho obrigatório',
				description: 'Informe o nome do ganho obrigatório.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (valueInCents === null || valueInCents <= 0) {
			showNotifierAlert({
				title: 'Erro ao salvar ganho obrigatório',
				description: 'Informe um valor válido.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (!isDueDayValid) {
			showNotifierAlert({
				title: 'Erro ao salvar ganho obrigatório',
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
				title: 'Erro ao salvar ganho obrigatório',
				description: 'Selecione uma tag obrigatória.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (installmentsEnabled && normalizedInstallmentTotal === null) {
			showNotifierAlert({
				title: 'Erro ao salvar ganho obrigatório',
				description: `Informe uma quantidade de parcelas entre 1 e ${MAX_MANDATORY_INSTALLMENTS}.`,
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (installmentsEnabled && !isInstallmentTotalValueValid) {
			showNotifierAlert({
				title: 'Erro ao salvar ganho obrigatório',
				description: 'Informe um valor total que cubra pelo menos R$ 0,01 por parcela.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (installmentsEnabled && parsedInstallmentStartDate === null) {
			showNotifierAlert({
				title: 'Erro ao salvar ganho obrigatório',
				description: 'Informe uma data inicial válida para as parcelas.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (installmentsEnabled && parsedInstallmentEndDate === null) {
			showNotifierAlert({
				title: 'Erro ao salvar ganho obrigatório',
				description: 'Informe uma data final válida para as parcelas.',
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		if (installmentsEnabled && isInstallmentTotalBelowSettled) {
			showNotifierAlert({
				title: 'Erro ao salvar ganho obrigatório',
				description: `Este ganho já tem ${resolvedSettledInstallmentsCount} parcela(s) registrada(s). A quantidade total precisa ser igual ou maior.`,
				type: 'error',
				isDarkMode,
				duration: 4500,
			});
			return;
		}

		const parsedReminderTime = parseMandatoryReminderTime(reminderTime);
		if (reminderEnabled && !parsedReminderTime) {
			showNotifierAlert({
				title: 'Erro ao salvar ganho obrigatório',
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
				title: 'Erro ao salvar ganho obrigatório',
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
				reminderHour: parsedReminderTime?.hour ?? DEFAULT_MANDATORY_REMINDER_HOUR,
				reminderMinute: parsedReminderTime?.minute ?? DEFAULT_MANDATORY_REMINDER_MINUTE,
				reminderConfigVersion: MANDATORY_REMINDER_CONFIG_VERSION,
				reminderDaysBefore,
				reminderOnDueDate,
				installmentTotal: installmentsEnabled ? normalizedInstallmentTotal : null,
				installmentTotalValueInCents: installmentsEnabled ? installmentTotalValueInCents : null,
				installmentsCompleted: payloadInstallmentsCompleted,
				installmentStartDate: installmentsEnabled ? parsedInstallmentStartDate : null,
				installmentEndDate: installmentsEnabled ? parsedInstallmentEndDate : null,
			};

			let persistedId = selectedGainTemplateId;
			const successTitle = selectedGainTemplateId ? 'Ganho obrigatório atualizado' : 'Ganho obrigatório registrado';

			if (selectedGainTemplateId) {
				const result = await updateMandatoryGainFirebase({
					gainTemplateId: selectedGainTemplateId,
					...payload,
				});

				if (!result.success) {
					throw new Error('Erro ao atualizar o ganho obrigatório.');
				}
			} else {
				const result = await addMandatoryGainFirebase({
					...payload,
					personId: currentUser.uid,
				});

				if (!result.success || !result.id) {
					throw new Error('Erro ao registrar ganho obrigatório.');
				}
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
							lastCompletedCycle: lastReceiptCycle ?? undefined,
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
		description,
		dueDay,
		gainName,
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
		resolvedSettledInstallmentsCount,
		applyPostSubmitBehavior,
		resetForm,
		editingGainTemplateId,
		selectedGainTemplateId,
		selectedTagId,
		valueInCents,
		installmentTotalValueInCents,
		lastReceiptCycle,
	]);

	const isSaveDisabled =
		!isTemplateReady || isFormBusy || (reminderEnabled && !isReminderTimeValid);
	// Mantém o formulário visível durante o prefill, conforme o fluxo progressivo descrito em [[Receitas Fixas]].
	const isEditingMode = Boolean(editingGainTemplateId);
	const screenTitle = isEditingMode ? 'Editar ganho obrigatório' : 'Registrar ganho obrigatório';
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
								alt="Background da tela de ganho obrigatório"
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
								<AddMandatoryGainListIllustration width="38%" height="38%" className="opacity-90" />
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
										<Text className={`${bodyText} ml-1 text-sm`}>Nome do ganho</Text>
										<Input className={fieldContainerClassName} isDisabled={isFormBusy}>
											<InputField
												ref={gainNameInputRef}
												placeholder="Ex: Salário, Aluguel, Freelance..."
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

									<VStack className="gap-2">
										<Text className={`${bodyText} ml-1 text-sm`}>Valor previsto</Text>
										<Input className={fieldContainerClassName} isDisabled={isValueFieldDisabled}>
											<InputField
												ref={gainValueInputRef}
												placeholder="Ex: R$ 1.500,00"
												value={valueDisplay}
												onChangeText={handleValueChange}
												keyboardType="numeric"
												returnKeyType="next"
												className={inputField}
												onFocus={() => handleInputFocus('gain-value')}
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
												<VStack className="gap-3 pb-2">
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
																					<VStack className="gap-2">
																						<Text className={`${bodyText} ml-1 text-sm`}>Valor total do parcelamento</Text>
																						<Input className={fieldContainerClassName} isDisabled={isInstallmentFieldDisabled}>
																							<InputField
																								placeholder="Ex: R$ 500,00"
																								value={installmentTotalValueDisplay}
																								onChangeText={handleInstallmentTotalValueChange}
																								keyboardType="numeric"
																								returnKeyType="done"
																								className={inputField}
																								accessibilityLabel="Valor total do parcelamento"
																							/>
																						</Input>
																					</VStack>
																					<HStack className="gap-3">
														<VStack className="flex-1 gap-2">
															<Text className={`${bodyText} ml-1 text-sm`}>Início das parcelas</Text>
															<DatePickerField
																value={installmentStartDate}
																onChange={handleInstallmentStartDateChange}
																triggerClassName={fieldContainerClassName}
																inputClassName={inputField}
																placeholder="Data inicial"
																isDisabled={isInstallmentFieldDisabled}
															/>
														</VStack>
														<VStack className="flex-1 gap-2">
															<Text className={`${bodyText} ml-1 text-sm`}>Final das parcelas</Text>
															<DatePickerField
																value={installmentEndDate}
																onChange={handleInstallmentEndDateChange}
																triggerClassName={fieldContainerClassName}
																inputClassName={inputField}
																placeholder={isInstallmentEndDateUnlocked ? 'Data final' : 'Qtd. primeiro'}
																isDisabled={!isInstallmentEndDateUnlocked || isInstallmentFieldDisabled}
															/>
														</VStack>
													</HStack>
													<Text className={`${helperText} ml-1 text-xs`}>
														{installmentHelperMessage}
													</Text>
												</VStack>
											) : null}
										</VStack>
									</Box>

									<VStack className="gap-2">
										<Text className={`${bodyText} ml-1 text-sm`}>Observações</Text>
										<Textarea className={textareaContainerClassName} isDisabled={isDescriptionDisabled}>
											<TextareaInput
												ref={descriptionInputRef}
												placeholder="Adicione um contexto rápido para este ganho"
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
											placeholder="Selecione a categoria do ganho"
											sheetTitle="Escolha a categoria obrigatória"
											emptyMessage="Nenhuma categoria obrigatória de ganho disponível."
											triggerHint={tagHelperMessage}
											disabledHint={tagHelperMessage}
											accessibilityLabel="Escolher categoria obrigatória de ganho"
											onCreatePress={handleOpenAddTagScreen}
											createActionLabel="Adicionar categoria obrigatória de ganho"
											isCreateDisabled={isAddTagButtonDisabled}
										/>
									</VStack>

									<Box className={`${compactCardClassName} px-4 rounded-2xl border ${notTintedCardClassName}`}>
										<VStack className="gap-3">
											<HStack className="items-center justify-between gap-4">
												<VStack className="flex-1 gap-1">
													<Text className="font-semibold">Lembrete do recebimento</Text>
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
									<VStack className="gap-2">
										<Text className={`${bodyText} ml-1 text-sm`}>Começar a lembrar</Text>
										<Select
											selectedValue={String(reminderDaysBefore)}
											onValueChange={handleReminderDaysBeforeChange}
											isDisabled={isFormBusy}
										>
											<SelectTrigger variant="outline" size="md" className={fieldContainerClassName}>
												<SelectInput
													placeholder="Escolha quando começar"
													value={MANDATORY_REMINDER_DAY_OPTIONS.find(
														option => option.value === String(reminderDaysBefore),
													)?.label}
													className={inputField}
												/>
												<SelectIcon />
											</SelectTrigger>
											<SelectPortal>
												<SelectBackdrop />
												<SelectContent>
													<SelectDragIndicatorWrapper>
														<SelectDragIndicator />
													</SelectDragIndicatorWrapper>
													{MANDATORY_REMINDER_DAY_OPTIONS.map(option => (
														<SelectItem key={option.value} label={option.label} value={option.value} />
													))}
												</SelectContent>
											</SelectPortal>
										</Select>
										<Text className={`${helperText} ml-1 text-sm`}>
											A opção é cumulativa: 3 dias gera avisos em 3, 2 e 1 dia antes do recebimento.
										</Text>
									</VStack>

									<HStack className="items-center justify-between gap-4 px-1">
										<VStack className="flex-1 gap-1 py-1">
											<Text className={`${bodyText} text-sm font-semibold`}>Avisar também no recebimento</Text>
											<Text className={`${helperText} text-xs leading-5`}>
												Envia um aviso final no próprio dia, além dos lembretes anteriores.
											</Text>
										</VStack>
										<Switch
											value={reminderOnDueDate}
											onValueChange={setReminderOnDueDate}
											disabled={isFormBusy}
											trackColor={switchTrackColor}
											thumbColor={switchThumbColor}
											ios_backgroundColor={switchIosBackgroundColor}
											accessibilityLabel="Avisar também no recebimento"
										/>
									</HStack>

									<HStack className="items-center gap-1">
														<Text className={`${bodyText} ml-1 text-sm`}>Horário preferido</Text>
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
																		Use o padrão 24h. No Android, economia de bateria e políticas do fabricante podem atrasar a entrega.
																	</Text>
																</PopoverBody>
															</PopoverContent>
														</Popover>
													</HStack>

													<TimePickerField
														value={reminderTime}
														onChange={setReminderTime}
														isDisabled={isReminderTimeFieldDisabled}
														triggerClassName={fieldContainerClassName}
														inputClassName={inputField}
														accessibilityLabel="Selecionar horário preferido do lembrete de recebimento"
													/>

													<Text className={helperText + ' ml-1 text-sm'}>
														Escolha o horário no seletor do dispositivo. O sistema o usa como preferência de entrega.
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
											<ButtonText>{isEditingMode ? 'Atualizar ganho' : 'Registrar ganho'}</ButtonText>
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
