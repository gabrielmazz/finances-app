import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import MovementFormStatus from '@/components/uiverse/transactions/movement-form-status';
import { useBankMovementsRequest } from '@/hooks/useBankMovementsRequest';
import { useMovementFormEntry } from '@/hooks/useMovementFormEntry';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';

import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
KeyboardAvoidingView,
Platform,
Pressable,
ScrollView,
StatusBar,
TextInput,
View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Box } from '@/components/ui/box';
import { Button,ButtonSpinner,ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import { Input,InputField } from '@/components/ui/input';
import { Popover,PopoverBackdrop,PopoverBody,PopoverContent } from '@/components/ui/popover';
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
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { Textarea,TextareaInput } from '@/components/ui/textarea';
import { VStack } from '@/components/ui/vstack';

import TagActionsheetSelector,{ type TagActionsheetOption } from '@/components/uiverse/categories/tag-actionsheet-selector';
import Navigator from '@/components/uiverse/navigation/navigator';
import TimePickerField from '@/components/uiverse/recurring/time-picker-field';
import DatePickerField from '@/components/uiverse/shared/date-picker';

import { APP_ROUTE_PATHS,navigateToHomeDashboard,navigateToRoute } from '@/utils/navigation';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { MAX_MONTHLY_BUSINESS_DAY } from '@/utils/businessCalendar';
import {
MAX_MANDATORY_INSTALLMENTS,
getMandatoryInstallmentEndDateFromTotal,
getMandatoryInstallmentTotalFromDateRange,
normalizeMandatoryInstallmentDate,
normalizeMandatoryInstallmentTotal,
sanitizeMandatoryInstallmentInput
} from '@/utils/mandatoryInstallments';

// Importação do SVG
import { LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import type { TagIconFamily,TagIconStyle } from '@/hooks/useTagIcons';
import {
MANDATORY_REMINDER_CONFIG_VERSION,
isMandatoryReminderConfigured,
normalizeMandatoryReminderDaysBefore,
} from '@/utils/mandatoryReminderConfig';
import {
DEFAULT_MANDATORY_REMINDER_HOUR,
DEFAULT_MANDATORY_REMINDER_MINUTE,
DEFAULT_MANDATORY_REMINDER_TIME,
formatMandatoryReminderTime,
isMandatoryReminderTimeValid,
} from '@/utils/mandatoryReminderTime';
import { Info } from 'lucide-react-native';
import AddMandatoryExpensesListIllustration from '../../assets/UnDraw/addMandatoryExpensesScreen.svg';

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
	{ value: '0', label: 'Somente no vencimento' },
	{ value: '1', label: '1 dia antes (1 aviso)' },
	{ value: '2', label: '2 dias antes (2 avisos)' },
	{ value: '3', label: '3 dias antes (3 avisos)' },
];
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

	const [tagOptions] = React.useState<TagOption[]>([]);
	const [selectedTagId, setSelectedTagId] = React.useState<string | null>(null);
	const [selectedTagName, setSelectedTagName] = React.useState<string | null>(null);
	const [isLoadingTags] = React.useState(false);

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
	const [reminderDaysBefore, setReminderDaysBefore] = React.useState<0 | 1 | 2 | 3>(1);
	const [reminderOnDueDate, setReminderOnDueDate] = React.useState(false);
	const [, setSelectedExpenseId] = React.useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState(false);

	const [, setLastPaymentCycle] = React.useState<string | null>(null);
	const submitLockRef = React.useRef<object | null>(null);
	const { personId, cancelRequest: cancelTagsRequest } = useBankMovementsRequest('mandatory-expense-form');

	const entry = useMovementFormEntry();
	const isPrefilling = entry.loading;
	const currentFormScope = JSON.stringify([personId, editingExpenseId]);
	const formScopeRef = React.useRef(currentFormScope); formScopeRef.current = currentFormScope;
	const [tagsError] = React.useState<string | null>(FEATURE_UNAVAILABLE_MESSAGE);
	const [submitError, setSubmitError] = React.useState<string | null>(null);
	const mounted = React.useRef(true);
	React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
		if (value === '0') setReminderOnDueDate(true);
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
	const resolvedSettledInstallmentsCount = 0;
	const isInstallmentTotalBelowSettled =
		installmentsEnabled &&
		normalizedInstallmentTotal !== null &&
		normalizedInstallmentTotal < resolvedSettledInstallmentsCount;

	const fieldsLockedRef = React.useRef(true);
	const handleReminderToggle = React.useCallback(async (value: boolean) => { showFeatureUnavailable(); }, []);

	const isReminderTimeValid = React.useMemo(() => isMandatoryReminderTimeValid(reminderTime), [reminderTime]);

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
	const hasExpenseValue = valueInCents !== null && Number.isSafeInteger(valueInCents) && valueInCents > 0;
	const isFormBusy = isSubmitting || isPrefilling || !entry.ready || false;
	fieldsLockedRef.current = isFormBusy;
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
	const isContractLocked = false;
	const isInstallmentFieldDisabled = !hasExpenseName || !isDueDayValid || isFormBusy || isContractLocked;
	const isTagSelectDisabled = isLoadingTags || !isCoreTemplateReady || isFormBusy;
	const isAddTagButtonDisabled = isFormBusy;
	const isDescriptionDisabled = !isTemplateReady || isFormBusy;
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

	const resetForm = React.useCallback((options?: { keepTag?: boolean;  }) => {
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
setSelectedTagId(current => {
			if (options?.keepTag && current) {
				return current;
			}
			return null;
		});
setLastPaymentCycle(null);
}, []);

	React.useEffect(() => { submitLockRef.current = null; setIsSubmitting(false); resetForm({ }); setSubmitError(null); }, [personId, editingExpenseId, resetForm]);

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

	const loadTags = React.useCallback(async () => { showFeatureUnavailable(); }, []);

	const handleBackToHome = React.useCallback(() => {
		navigateToHomeDashboard();
		return true;
	}, []);

	React.useEffect(() => {
		if (!entry.ready) return;
		if (!editingExpenseId) { resetForm({ keepTag: true, }); return; }
				const data = entry.record;
				if (!data) return;

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
				const installmentsCompletedValue = (typeof data.installmentsCompleted === 'number' ? data.installmentsCompleted : 0);

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
				setLastPaymentCycle(lastPaymentCycle);
	}, [entry.ready, entry.record, editingExpenseId, resetForm]);

	const handleSubmit = React.useCallback(async () => { showFeatureUnavailable(); }, []);

	const isSaveDisabled =
		!isTemplateReady || isSubmitting || !entry.ready || ((isLoadingTags || Boolean(tagsError) || !tagOptions.some(tag => tag.id === selectedTagId))) || (reminderEnabled && !isReminderTimeValid);
	// Mantém o formulário visível durante o prefill, conforme o fluxo progressivo descrito em [[Despesas Fixas]].
	const isEditingMode = Boolean(editingExpenseId);
	const screenTitle = isEditingMode ? 'Editar gasto obrigatório' : 'Registrar gasto obrigatório';
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
									<MovementFormStatus loading={entry.loading} error={entry.error} onRetry={entry.retry} />
<MovementFormStatus loading={isLoadingTags} error={tagsError} onRetry={loadTags} />
{submitError ? <Text className="text-error-600 dark:text-error-400" accessibilityRole="alert">{submitError}</Text> : null}
{null}
{isContractLocked && installmentsEnabled ? <Text className={helperText}>Para mudar o valor total ou o prazo do parcelamento, use Renegociar na lista.</Text> : null}
<VStack className="gap-2">
										<Text className={`${LUMUS_FORM_CLASS_NAMES.inlineLabel} ml-1`}>Nome da despesa</Text>
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
										<Text className={`${LUMUS_FORM_CLASS_NAMES.inlineLabel} ml-1`}>Valor mensal</Text>
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
										<Text className={`${LUMUS_FORM_CLASS_NAMES.inlineLabel} ml-1`}>{dueDayFieldLabel}</Text>
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
													disabled={!isCoreTemplateReady || isFormBusy || isContractLocked}
													trackColor={switchTrackColor}
													thumbColor={switchThumbColor}
													ios_backgroundColor={switchIosBackgroundColor}
												/>
											</HStack>

											{installmentsEnabled ? (
												<VStack className="gap-3 pb-4">
													<Text className={`${LUMUS_FORM_CLASS_NAMES.inlineLabel} ml-1`}>Quantidade de parcelas</Text>
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
																				<Text className={`${LUMUS_FORM_CLASS_NAMES.inlineLabel} ml-1`}>Valor total do parcelamento</Text>
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
															<Text className={`${LUMUS_FORM_CLASS_NAMES.inlineLabel} ml-1`}>Início das parcelas</Text>
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
															<Text className={`${LUMUS_FORM_CLASS_NAMES.inlineLabel} ml-1`}>Final das parcelas</Text>
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
										<Text className={`${LUMUS_FORM_CLASS_NAMES.inlineLabel} ml-1`}>Observações</Text>
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
										<Text className={`${LUMUS_FORM_CLASS_NAMES.inlineLabel} ml-1`}>Categoria</Text>
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
												<VStack className="gap-4">
													<VStack className="gap-2">
														<Text className={`${LUMUS_FORM_CLASS_NAMES.inlineLabel} ml-1`}>Começar a lembrar</Text>
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
															A opção é cumulativa: 3 dias gera avisos em 3, 2 e 1 dia antes do vencimento.
														</Text>
													</VStack>

													<HStack className="items-center justify-between gap-4 px-1">
														<VStack className="flex-1 gap-1 py-1">
															<Text className={`${bodyText} text-sm font-semibold`}>
																Avisar também no vencimento
															</Text>
															<Text className={`${helperText} text-xs leading-5`}>
																Envia um aviso final no próprio dia, além dos lembretes anteriores.
															</Text>
														</VStack>
														<Switch
															value={reminderOnDueDate}
															onValueChange={setReminderOnDueDate}
															disabled={isFormBusy || reminderDaysBefore === 0}
															trackColor={switchTrackColor}
															thumbColor={switchThumbColor}
															ios_backgroundColor={switchIosBackgroundColor}
														/>
													</HStack>

												<VStack className="gap-2">
													<HStack className="items-center gap-2 ml-1">
														<Text className={LUMUS_FORM_CLASS_NAMES.inlineLabel}>Horário preferido</Text>
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
															accessibilityLabel="Selecionar horário preferido do lembrete de vencimento"
														/>

														<Text className={helperText + ' ml-1 text-sm pb-4'}>
															Escolha o horário no seletor do dispositivo. O sistema o usa como preferência de entrega.
														</Text>

														{!isReminderTimeValid ? (
															<Text className="ml-1 text-sm text-red-500 dark:text-red-400">
																Informe um horário válido entre 00:00 e 23:59.
															</Text>
														) : null}
													</VStack>
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
