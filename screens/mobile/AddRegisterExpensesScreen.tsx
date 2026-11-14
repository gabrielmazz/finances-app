import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import MovementFormStatus from '@/components/uiverse/transactions/movement-form-status';
import { useMovementFormEntry } from '@/hooks/useMovementFormEntry';
import { useMovementOptions } from '@/hooks/useMovementOptions';
import { useMovementSubmit } from '@/hooks/useMovementSubmit';
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import { errorMessage } from '@/application/errors';
import type { CategorySource } from '@/domain/categories';
import type { MandatoryExpenseSuggestion } from '@/types/presentation/suggestion';

import { toFinancialCivilDate } from '@/utils/financialCivilDate';

import { Button,ButtonSpinner,ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import { Input,InputField } from '@/components/ui/input';
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
import { Popover,PopoverBackdrop,PopoverBody,PopoverContent } from '@/components/ui/popover';
import {
Radio,
RadioGroup,
RadioIcon,
RadioIndicator,
RadioLabel,
} from '@/components/ui/radio';
import { Text } from '@/components/ui/text';
import { Textarea,TextareaInput } from '@/components/ui/textarea';
import { VStack } from '@/components/ui/vstack';
import BankActionsheetSelector,{ type BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';
import TagActionsheetSelector,{ type TagActionsheetOption } from '@/components/uiverse/categories/tag-actionsheet-selector';
import Navigator from '@/components/uiverse/navigation/navigator';
import DatePickerField from '@/components/uiverse/shared/date-picker';
import { useFocusEffect,useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
BackHandler,
KeyboardAvoidingView,
Platform,
Pressable,
ScrollView,
StatusBar,
View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';

import { APP_ROUTE_PATHS,navigateToHomeDashboard,navigateToRoute } from '@/utils/navigation';

import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';

import {
type TagUsageType
} from '@/utils/tagUsage';

import { CircleIcon } from '@/components/ui/icon';
import type { TagIconFamily,TagIconSelection,TagIconStyle } from '@/hooks/useTagIcons';
import { TagIcon } from '@/hooks/useTagIcons';
import { Info } from 'lucide-react-native';

import AddExpenseIllustration from '../../assets/UnDraw/addRegisterExpanseScreen.svg';

import { LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { useScreenStyles } from '@/hooks/useScreenStyle';

type OptionItem = {
	id: string;
	name: string;
	usageType?: TagUsageType;
	iconFamily?: TagIconFamily | null;
	iconName?: string | null;
	iconStyle?: TagIconStyle | null;
	iconKey?: string | null;
	colorHex?: string | null;
};

type FocusableInputKey = 'expense-name' | 'expense-value' | 'expense-explanation';

type SubmitOptions = {
	bypassMandatorySuggestionKey?: string | null;
};

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
	const [day, month, year] = value.split('/');
	if (!day || !month || !year) {
		return null;
	}

	const dayNumber = Number(day);
	const monthNumber = Number(month);
	const yearNumber = Number(year);

	if (
		Number.isNaN(dayNumber) ||
		Number.isNaN(monthNumber) ||
		Number.isNaN(yearNumber) ||
		dayNumber <= 0 ||
		monthNumber <= 0 ||
		monthNumber > 12 ||
		yearNumber < 1900
	) {
		return null;
	}

	const dateInstance = new Date(yearNumber, monthNumber - 1, dayNumber);

	if (
		dateInstance.getDate() !== dayNumber ||
		dateInstance.getMonth() + 1 !== monthNumber ||
		dateInstance.getFullYear() !== yearNumber
	) {
		return null;
	}

	return dateInstance;
};

const normalizeDateValue = (value: unknown): Date | null => {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value;
	}

	if (typeof value === 'object' && value !== null) {
		if ('toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
			return (value as { toDate?: () => Date }).toDate?.() ?? null;
		}

		if ('seconds' in value && typeof (value as { seconds?: number }).seconds === 'number') {
			const secondsValue = (value as { seconds?: number }).seconds ?? 0;
			const dateFromSeconds = new Date(secondsValue * 1000);
			if (!Number.isNaN(dateFromSeconds.getTime())) {
				return dateFromSeconds;
			}
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

const getSuggestedDateByDueDay = (dueDay: number, usesBusinessDays = false) =>
	formatDateToBR(
		resolveMonthlyOccurrence({
			referenceDate: new Date(),
			dueDay,
			usesBusinessDays,
		}).date,
	);

export default function AddRegisterExpensesScreen() {

	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		fieldBankContainerClassName,
		fieldContainerClassName,
		fieldContainerCardClassName,
		textareaContainerClassName,
		modalContentClassName,
		submitButtonClassName,
		submitButtonCancelClassName,
		submitButtonTextClassName,
		heroHeight,
		infoCardStyle,
		insets,
		switchRadioClassName,
		switchRadioIndicatorClassName,
		switchRadioIconClassName,
		switchRadioLabelClassName,
	} = useScreenStyles();

	const [expenseName, setExpenseName] = React.useState('');
	const [expenseValueDisplay, setExpenseValueDisplay] = React.useState('');
	const [expenseValueCents, setExpenseValueCents] = React.useState<number | null>(null);
	const [expenseDate, setExpenseDate] = React.useState(formatDateToBR(toFinancialCivilDate(new Date())));
	const { banks, tags, optionsError, isLoadingBanks, isLoadingTags, loadMoreBanks, loadMoreTags, hasMoreTags, reloadTags, reloadBanks } = useMovementOptions('expense');
	const { submit, isSubmitting } = useMovementSubmit();
	const [selectedTagId, setSelectedTagId] = React.useState<string | null>(null);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);
	const [selectedMovementTagName, setSelectedMovementTagName] = React.useState<string | null>(null);
	const [selectedMovementTagIcon, setSelectedMovementTagIcon] = React.useState<TagIconSelection | null>(null);
	const [selectedMovementBankName, setSelectedMovementBankName] = React.useState<string | null>(null);
	const [explanationExpense, setExplanationExpense] = React.useState<string | null>(null);
	const [moneyFormat, setMoneyFormat] = React.useState(false);
	const [hasAppliedTemplate, setHasAppliedTemplate] = React.useState(false);
	const [mandatoryExpenseSuggestion, setMandatoryExpenseSuggestion] =
		React.useState<MandatoryExpenseSuggestion | null>(null);
	const [, setIgnoredMandatorySuggestionKey] = React.useState<string | null>(null);
	const [valuesRadioMoneyFormat, setValuesRadioMoneyFormat] = React.useState<
		'Pagamento em Dinheiro' | 'Pagamento em Banco'
	>(moneyFormat ? 'Pagamento em Dinheiro' : 'Pagamento em Banco');

	const expenseNameInputRef = React.useRef<any>(null);
	const expenseValueInputRef = React.useRef<any>(null);
	const expenseExplanationInputRef = React.useRef<any>(null);

	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => (key === 'expense-explanation' ? 220 : 170),
		[],
	);

	const getInputRef = React.useCallback((key: FocusableInputKey) => {
		switch (key) {
			case 'expense-name':
				return expenseNameInputRef;
			case 'expense-value':
				return expenseValueInputRef;
			case 'expense-explanation':
				return expenseExplanationInputRef;
			default:
				return null;
		}
	}, []);

	const {
		scrollViewRef,
		contentBottomPadding,
		handleInputFocus,
		handleScroll,
		scrollEventThrottle,
	} = useKeyboardAwareScroll<FocusableInputKey>({
		getInputRef,
		keyboardScrollOffset,
		minBottomPadding: 32,
	});

	const params = useLocalSearchParams<{
		expenseId?: string | string[];

		templateName?: string | string[];
		templateValueInCents?: string | string[];
		templateTagId?: string | string[];
		templateDueDay?: string | string[];
		templateUsesBusinessDays?: string | string[];
		templateDescription?: string | string[];
		templateTagName?: string | string[];
		templateTagIconFamily?: string | string[];
		templateTagIconName?: string | string[];
		templateTagIconStyle?: string | string[];
		templateMandatoryExpenseId?: string | string[];
		templateMandatoryExpenseSettlement?: string | string[];
		templateMandatoryExpenseInstallmentsCount?: string | string[];
		templateLockTag?: string | string[];
		investmentIdForAdjustment?: string | string[];
		investmentDeltaInCents?: string | string[];
	}>();

	const editingExpenseId = React.useMemo(() => {
		const value = Array.isArray(params.expenseId) ? params.expenseId[0] : params.expenseId;
		return value && value.trim().length > 0 ? value : null;
	}, [params.expenseId]);
	const isEditing = Boolean(editingExpenseId);
	const { movement: editableMovement, record: existingMovement, loading: isLoadingExisting, ready: isMovementReady, error: movementLoadError, retry: retryMovementLoad } = useMovementFormEntry(editingExpenseId);

	const templateData = React.useMemo(() => {
		const decodeParam = (value?: string | string[]) => {
			const rawValue = Array.isArray(value) ? value[0] : value;
			if (!rawValue) {
				return undefined;
			}
			try {
				return decodeURIComponent(rawValue);
			} catch {
				return rawValue;
			}
		};

		const parseNumberParam = (value?: string | string[]) => {
			const rawValue = Array.isArray(value) ? value[0] : value;
			if (!rawValue) {
				return undefined;
			}
			const parsed = Number(rawValue);
			return Number.isNaN(parsed) ? undefined : parsed;
		};

		const name = decodeParam(params.templateName);
		const description = decodeParam(params.templateDescription);
		const tagId = decodeParam(params.templateTagId);
		const tagName = decodeParam(params.templateTagName);
		const tagIconFamily = decodeParam(params.templateTagIconFamily);
		const tagIconName = decodeParam(params.templateTagIconName);
		const tagIconStyle = decodeParam(params.templateTagIconStyle);
		const valueInCents = parseNumberParam(params.templateValueInCents);
		const dueDay = parseNumberParam(params.templateDueDay);
		const usesBusinessDaysParam = decodeParam(params.templateUsesBusinessDays);
		const mandatoryExpenseId = decodeParam(params.templateMandatoryExpenseId);
		const mandatoryExpenseSettlement = decodeParam(params.templateMandatoryExpenseSettlement);
		const installmentsToSettle = parseNumberParam(params.templateMandatoryExpenseInstallmentsCount);
		const lockTagParam = decodeParam(params.templateLockTag);
		const investmentAdjustmentId = decodeParam(params.investmentIdForAdjustment);
		const investmentDelta = parseNumberParam(params.investmentDeltaInCents);

		if (
			!name &&
			!description &&
			typeof tagId === 'undefined' &&
			typeof tagName === 'undefined' &&
			typeof tagIconFamily === 'undefined' &&
			typeof tagIconName === 'undefined' &&
			typeof tagIconStyle === 'undefined' &&
			typeof valueInCents === 'undefined' &&
			typeof dueDay === 'undefined' &&
			typeof mandatoryExpenseId === 'undefined'
		) {
			return null;
		}

		return {
			name,
			description,
			tagId,
			tagName,
			tagIcon:
				typeof tagIconFamily === 'string' && typeof tagIconName === 'string'
					? {
						iconFamily: tagIconFamily as TagIconFamily,
						iconName: tagIconName,
						iconStyle: typeof tagIconStyle === 'string' ? tagIconStyle as TagIconStyle : null,
					}
					: null,
			valueInCents,
			dueDay,
			usesBusinessDays: usesBusinessDaysParam === '1',
			mandatoryExpenseId,
			isMandatoryExpenseSettlement: mandatoryExpenseSettlement === '1',
			installmentsToSettle,
			lockTag: lockTagParam === '1',
			investmentAdjustmentId,
			investmentDeltaInCents: typeof investmentDelta === 'number' ? investmentDelta : undefined,
		};
	}, [
		params.expenseId,
		params.investmentDeltaInCents,
		params.investmentIdForAdjustment,
		params.templateDescription,
		params.templateDueDay,
		params.templateUsesBusinessDays,
		params.templateTagIconFamily,
		params.templateTagIconName,
		params.templateTagIconStyle,
		params.templateLockTag,
		params.templateMandatoryExpenseId,
		params.templateMandatoryExpenseSettlement,
		params.templateMandatoryExpenseInstallmentsCount,
		params.templateName,
		params.templateTagId,
		params.templateTagName,
		params.templateValueInCents,
	]);

	const linkedMandatoryExpenseId = React.useMemo(
		() => (templateData?.mandatoryExpenseId ? templateData.mandatoryExpenseId : null),
		[templateData],
	);
	React.useEffect(() => {
		if (!templateData) {
			setHasAppliedTemplate(false);
		}
	}, [templateData]);
	const templateTagDisplayName = templateData?.tagName ?? null;
	const isTemplateLocked = Boolean(linkedMandatoryExpenseId && !isEditing);
	const isTagSelectionLocked = isTemplateLocked || Boolean(templateData?.lockTag);

	const parsedExpenseDate = React.useMemo(() => parseDateFromBR(expenseDate), [expenseDate]);
	const isBankSelectionRequired = !moneyFormat;
	const isFormBusy = isLoadingExisting || isSubmitting || !isMovementReady;
	const hasExpenseName = expenseName.trim().length > 0;
	const hasExpenseValue = expenseValueCents !== null && expenseValueCents > 0;
	const isSubmitDisabled =
		isFormBusy ||
		!hasExpenseName ||
		expenseValueCents === null ||
		!selectedTagId ||
		(isBankSelectionRequired && !selectedBankId) ||
		!parsedExpenseDate;
	const isExpenseValueDisabled = !hasExpenseName || isFormBusy;
	const isExpenseDateDisabled = !hasExpenseName || !hasExpenseValue || isFormBusy;
	const isExplanationDisabled = !hasExpenseName || !hasExpenseValue || isFormBusy;
	const isMoneyFormatSelectionDisabled = !hasExpenseName || !hasExpenseValue || !parsedExpenseDate || isFormBusy;
	const isBankFieldPrerequisitesIncomplete = !hasExpenseName || !hasExpenseValue || !parsedExpenseDate;
	const isBankSelectDisabled =
		isLoadingBanks || banks.length === 0 || isFormBusy || isBankFieldPrerequisitesIncomplete;
	const isTagFieldPrerequisitesIncomplete =
		!hasExpenseName ||
		!hasExpenseValue ||
		!parsedExpenseDate ||
		(isBankSelectionRequired && !selectedBankId);
	const isTagSelectDisabled =
		isLoadingTags || isFormBusy || isTagFieldPrerequisitesIncomplete;
	const isAddTagButtonDisabled = isFormBusy || isTagSelectionLocked;

	const handleMoneyFormatChange = React.useCallback((nextValue: boolean) => {
		setMoneyFormat(nextValue);

		if (nextValue) {
			setSelectedBankId(null);
			setSelectedMovementBankName(null);
		}
	}, []);

	const handleRadioMoneyFormatChange = React.useCallback(
		(nextValue: 'Pagamento em Dinheiro' | 'Pagamento em Banco') => {
			setValuesRadioMoneyFormat(nextValue);
			handleMoneyFormatChange(nextValue === 'Pagamento em Dinheiro');
		},
		[handleMoneyFormatChange],
	);
	const handleOpenAddTagScreen = React.useCallback(() => {
		if (isAddTagButtonDisabled) {
			return;
		}

		navigateToRoute(APP_ROUTE_PATHS.addRegisterTag, {
			placement: 'expense',
			returnAfterCreate: '1',
			returnToRoute: APP_ROUTE_PATHS.addRegisterExpenses,
		});
	}, [isAddTagButtonDisabled]);

	const handleSelectTag = React.useCallback((tag: TagActionsheetOption) => {
		setSelectedTagId(tag.id);
		setSelectedMovementTagName(tag.name);
		setSelectedMovementTagIcon({
			iconFamily: tag.iconFamily ?? null,
			iconName: tag.iconName ?? null,
			iconStyle: tag.iconStyle ?? null,
		});
	}, []);

	const handleSelectBank = React.useCallback((bank: BankActionsheetOption) => {
		setSelectedBankId(bank.id);
		setSelectedMovementBankName(bank.name);
	}, []);

	React.useEffect(() => {
		setValuesRadioMoneyFormat(moneyFormat ? 'Pagamento em Dinheiro' : 'Pagamento em Banco');
	}, [moneyFormat]);

	const handleLeaveScreen = React.useCallback(() => {
		navigateToHomeDashboard();
	}, []);

	useFocusEffect(
		React.useCallback(() => {
			const handleBackPress = () => {
				handleLeaveScreen();
				return true;
			};

			const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
			return () => {
				subscription.remove();
			};
		}, [handleLeaveScreen]),
	);

	React.useEffect(() => {
		if (hasAppliedTemplate || isEditing || !templateData) {
			return;
		}

		if (templateData.name) {
			setExpenseName(templateData.name);
		}

		if (typeof templateData.valueInCents === 'number' && templateData.valueInCents > 0) {
			setExpenseValueCents(templateData.valueInCents);
			setExpenseValueDisplay(formatCurrencyBRL(templateData.valueInCents));
		}

		if (typeof templateData.dueDay === 'number') {
			setExpenseDate(getSuggestedDateByDueDay(templateData.dueDay, templateData.usesBusinessDays));
		}

		if (templateData.tagId) {
			setSelectedTagId(templateData.tagId);
		}

		if (templateData.tagName) {
			setSelectedMovementTagName(templateData.tagName);
		}

		if (templateData.tagIcon) {
			setSelectedMovementTagIcon(templateData.tagIcon);
		}

		if (templateData.description) {
			setExplanationExpense(templateData.description ?? null);
		}

		setHasAppliedTemplate(true);
	}, [hasAppliedTemplate, isEditing, templateData]);

	const handleValueChange = React.useCallback((input: string) => {
		const digitsOnly = input.replace(/\D/g, '');
		if (!digitsOnly) {
			setExpenseValueDisplay('');
			setExpenseValueCents(null);
			return;
		}

		const centsValue = Number.parseInt(digitsOnly, 10);
		setExpenseValueDisplay(formatCurrencyBRL(centsValue));
		setExpenseValueCents(centsValue);
	}, []);

	const handleSubmit = React.useCallback(async (_options: SubmitOptions = {}) => {
		if (moneyFormat || linkedMandatoryExpenseId || params.investmentIdForAdjustment) { showFeatureUnavailable(); return; }
		if (!selectedBankId || !selectedTagId || !expenseValueCents) return;
		const separator = selectedTagId.indexOf(':');
		if (separator < 1) return;
		const [day, month, year] = expenseDate.split('/');
		try {
			await submit({ name: expenseName, type: 'expense', amountCents: expenseValueCents, accountId: selectedBankId, categorySource: selectedTagId.slice(0, separator) as CategorySource, categoryId: selectedTagId.slice(separator + 1), date: `${year}-${month}-${day}`, explanation: explanationExpense ?? '', paymentFormats: [] }, editableMovement);
			await reloadBanks();
			showNotifierAlert({ type: 'success', description: isEditing ? 'Despesa atualizada.' : 'Despesa cadastrada.' });
			navigateToHomeDashboard();
		} catch (error) { showNotifierAlert({ type: 'error', description: errorMessage(error) }); }
	}, [moneyFormat, linkedMandatoryExpenseId, params.investmentIdForAdjustment, selectedBankId, selectedTagId, expenseValueCents, expenseDate, expenseName, explanationExpense, editableMovement, submit, reloadBanks, isEditing]);

	const handleCloseMandatoryExpenseSuggestionModal = React.useCallback(() => {
		setMandatoryExpenseSuggestion(null);
	}, []);

	const handleIgnoreMandatoryExpenseSuggestion = React.useCallback(() => {
		if (!mandatoryExpenseSuggestion) {
			return;
		}

		const bypassSuggestionKey = mandatoryExpenseSuggestion.matchKey;
		setIgnoredMandatorySuggestionKey(bypassSuggestionKey);
		setMandatoryExpenseSuggestion(null);
		void handleSubmit({ bypassMandatorySuggestionKey: bypassSuggestionKey });
	}, [handleSubmit, mandatoryExpenseSuggestion]);

	const handleGoToMandatoryExpenses = React.useCallback(() => {
		if (!mandatoryExpenseSuggestion) {
			return;
		}

		setMandatoryExpenseSuggestion(null);
		navigateToRoute(APP_ROUTE_PATHS.mandatoryExpenses, {
			focusMandatoryExpenseId: mandatoryExpenseSuggestion.id,
		});
	}, [mandatoryExpenseSuggestion]);

	React.useEffect(() => {
		if (!existingMovement) return;
		const data = existingMovement;
		const value = typeof data.valueInCents === 'number' ? data.valueInCents : 0;

		setExpenseName(typeof data.name === 'string' ? data.name : '');
		setExpenseValueCents(value);
		setExpenseValueDisplay(formatCurrencyBRL(value));

		const normalizedDate = normalizeDateValue(data.date) ?? new Date();
		setExpenseDate(formatDateToBR(normalizedDate));

		setSelectedTagId(typeof data.tagId === 'string' ? data.tagId : null);
		setSelectedBankId(typeof data.bankId === 'string' ? data.bankId : null);
		setSelectedMovementTagName(typeof data.tagName === 'string' ? data.tagName : null);
		setSelectedMovementBankName(typeof data.bankName === 'string' ? data.bankName : null);
		setExplanationExpense(typeof data.explanation === 'string' ? data.explanation : null);
		setMoneyFormat(typeof data.moneyFormat === 'boolean' ? data.moneyFormat : false);
	}, [existingMovement]);

	const selectedTagLabel = React.useMemo(() => {
		const matchedTag = tags.find(tag => tag.id === selectedTagId);
		if (matchedTag) {
			return matchedTag.name;
		}

		if (selectedMovementTagName && selectedTagId) {
			return selectedMovementTagName;
		}

		if (selectedTagId && selectedTagId === templateData?.tagId && templateTagDisplayName) {
			return templateTagDisplayName;
		}

		return null;
	}, [selectedMovementTagName, selectedTagId, tags, templateData?.tagId, templateTagDisplayName]);
	const selectedTagOption = React.useMemo(() => {
		const matchedTag = tags.find(tag => tag.id === selectedTagId);
		if (matchedTag) {
			return matchedTag;
		}

		if (selectedTagId && selectedMovementTagIcon?.iconFamily && selectedMovementTagIcon.iconName) {
			return {
				id: selectedTagId,
				name: selectedMovementTagName ?? templateTagDisplayName ?? 'Categoria selecionada',
				iconFamily: selectedMovementTagIcon.iconFamily,
				iconName: selectedMovementTagIcon.iconName,
				iconStyle: selectedMovementTagIcon.iconStyle ?? null,
			};
		}

		if (selectedTagId && templateData?.tagId === selectedTagId && templateData.tagIcon?.iconFamily && templateData.tagIcon.iconName) {
			return {
				id: selectedTagId,
				name: templateTagDisplayName ?? 'Categoria selecionada',
				iconFamily: templateData.tagIcon.iconFamily,
				iconName: templateData.tagIcon.iconName,
				iconStyle: templateData.tagIcon.iconStyle ?? null,
			};
		}

		return null;
	}, [
		selectedMovementTagIcon,
		selectedMovementTagName,
		selectedTagId,
		tags,
		templateData,
		templateTagDisplayName,
	]);

	const selectedBankLabel = React.useMemo(() => {
		const matchedBank = banks.find(bank => bank.id === selectedBankId);
		return matchedBank?.name ?? selectedMovementBankName ?? null;
	}, [banks, selectedBankId, selectedMovementBankName]);
	const selectedBankOption = React.useMemo(() => {
		const matchedBank = banks.find(bank => bank.id === selectedBankId);
		if (matchedBank) {
			return matchedBank;
		}

		if (selectedBankId && selectedMovementBankName) {
			return {
				id: selectedBankId,
				name: selectedMovementBankName,
			};
		}

		return null;
	}, [banks, selectedBankId, selectedMovementBankName]);

	const mandatoryExpenseSuggestionValue = React.useMemo(() => {
		if (!mandatoryExpenseSuggestion) {
			return '';
		}

		return formatCurrencyBRL(mandatoryExpenseSuggestion.valueInCents);
	}, [mandatoryExpenseSuggestion]);

	const screenTitle = 'Registro de Despesa';
	const bankHelperMessage = moneyFormat
		? 'Pagamentos em dinheiro não ficam vinculados a banco.'
		: isLoadingBanks
			? 'Carregando bancos disponíveis...'
			: banks.length === 0
				? 'Cadastre um banco para vincular esta despesa.'
				: 'Selecione onde essa saída foi lançada.';
	const selectedTagIconColor = isDarkMode ? '#FCD34D' : '#D97706';
	const selectedTagIconContainerClassName = isDarkMode
		? 'border border-slate-800 bg-slate-900'
		: 'border border-slate-200';

	return (
		<SafeAreaView
			className="flex-1"
			edges={['left', 'right', 'bottom']}
			style={{ backgroundColor: surfaceBackground }}
		>
			<StatusBar
				barStyle={isDarkMode ? 'light-content' : 'dark-content'}
			/>

			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<KeyboardAvoidingView
					className="flex-1"
					behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
					keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
				>
					<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
						<View
							className={`absolute top-0 left-0 right-0 ${cardBackground}`}
							style={{ height: heroHeight }}
						>
							<Image
								source={LoginWallpaper}
								alt="Background da tela de registro de despesa"
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
								<AddExpenseIllustration width="40%" height="40%" className="opacity-90" />
							</VStack>
						</View>

						<ScrollView
							ref={scrollViewRef}
							className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
							style={{ marginTop: heroHeight - 64 }}
							keyboardShouldPersistTaps="handled"
							keyboardDismissMode="on-drag"
							contentContainerStyle={{ paddingBottom: contentBottomPadding }}
							onScroll={handleScroll}
							scrollEventThrottle={scrollEventThrottle}
						>
							<VStack className="justify-between mt-4">

								<VStack className="mb-4">
									<Text className={LUMUS_FORM_CLASS_NAMES.label}>Nome da despesa</Text>
									<Input className={fieldContainerClassName} isDisabled={isFormBusy}>
										<InputField
											ref={expenseNameInputRef}
											placeholder="Digite o nome da despesa"
											keyboardType="default"
											autoCapitalize="sentences"
											autoCorrect={false}
											returnKeyType="next"
											className={inputField}
											value={expenseName}
											onChangeText={setExpenseName}
											onFocus={() => handleInputFocus('expense-name')}
											onSubmitEditing={() => expenseValueInputRef.current?.focus?.()}
										/>
									</Input>
								</VStack>

								<VStack className="mb-4">
									<Text className={LUMUS_FORM_CLASS_NAMES.label}>Valor da despesa</Text>
									<Input className={fieldContainerClassName} isDisabled={isExpenseValueDisabled}>
										<InputField
											ref={expenseValueInputRef}
											placeholder="Digite o valor da despesa"
											keyboardType="numeric"
											autoCapitalize="none"
											autoCorrect={false}
											returnKeyType="next"
											className={inputField}
											value={expenseValueDisplay}
											onChangeText={handleValueChange}
											onFocus={() => handleInputFocus('expense-value')}
										/>
									</Input>
								</VStack>

								<VStack className="mb-4">
									<Text className={LUMUS_FORM_CLASS_NAMES.label}>Data da despesa</Text>
									<DatePickerField
										value={expenseDate}
										onChange={setExpenseDate}
										triggerClassName={fieldContainerClassName}
										inputClassName={inputField}
										placeholder="Selecione a data da despesa"
										isDisabled={isExpenseDateDisabled}
									/>
								</VStack>

								<VStack className="mb-4">
									<HStack className="mb-2 ml-1 items-center gap-2">
										<Text className={LUMUS_FORM_CLASS_NAMES.inlineLabel}>Observação da despesa</Text>
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
													accessibilityLabel="Informações sobre a observação da despesa"
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
														Campo opcional. Use para adicionar detalhes que ajudem a identificar
														essa despesa, como motivo, local da compra ou outra observação útil.
													</Text>
												</PopoverBody>
											</PopoverContent>
										</Popover>
									</HStack>
									<Textarea
										className={textareaContainerClassName}
										isDisabled={isExplanationDisabled}
									>
										<TextareaInput
											ref={expenseExplanationInputRef}
											placeholder="Adicione uma descrição ou observação para esta despesa"
											className={`${inputField} pt-2`}
											value={explanationExpense ?? ''}
											onChangeText={setExplanationExpense}
											onFocus={() => handleInputFocus('expense-explanation')}
											editable={!isExplanationDisabled}
										/>
									</Textarea>
								</VStack>

								<VStack className="mb-4">
									<HStack className="mb-2 ml-1 items-center gap-2">
										<Text className={LUMUS_FORM_CLASS_NAMES.inlineLabel}>Formato de pagamento</Text>
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
													accessibilityLabel="Informações sobre o formato de pagamento"
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
														Selecione o formato de pagamento para esta despesa. Caso seja em
														dinheiro, ela não ficará vinculada a nenhum banco e o campo de anexos
														ficará indisponível. Caso seja em banco, selecione onde essa despesa foi
														lançada para manter seus registros organizados.
													</Text>
												</PopoverBody>
											</PopoverContent>
										</Popover>
									</HStack>
									<View className={`${fieldContainerCardClassName} px-4 py-3 pt-4 pb-4`}>
										<RadioGroup
											value={valuesRadioMoneyFormat}
											onChange={handleRadioMoneyFormatChange}
										>
											<HStack space="2xl">
												<Radio
													value="Pagamento em Banco"
													className={switchRadioClassName}
													isDisabled={isMoneyFormatSelectionDisabled}
												>
													<RadioIndicator className={switchRadioIndicatorClassName}>
														<RadioIcon as={CircleIcon} className={switchRadioIconClassName} />
													</RadioIndicator>
													<RadioLabel className={`${switchRadioLabelClassName} text-sm`}>
														Pagamento em Banco
													</RadioLabel>
												</Radio>
												<Radio
													value="Pagamento em Dinheiro"
													className={switchRadioClassName}
													isDisabled={isMoneyFormatSelectionDisabled}
												>
													<RadioIndicator className={switchRadioIndicatorClassName}>
														<RadioIcon as={CircleIcon} className={switchRadioIconClassName} />
													</RadioIndicator>
													<RadioLabel className={`${switchRadioLabelClassName} text-sm`}>
														Pagamento em Dinheiro
													</RadioLabel>
												</Radio>
											</HStack>
										</RadioGroup>

										{valuesRadioMoneyFormat === 'Pagamento em Banco' && (
											<VStack className="mt-4">
												<Text className={LUMUS_FORM_CLASS_NAMES.label}>Banco</Text>
												<BankActionsheetSelector
													options={banks}
													selectedId={selectedBankId}
													selectedLabel={selectedBankLabel}
													selectedOption={selectedBankOption}
													onSelect={handleSelectBank}
												onEndReached={() => void loadMoreBanks()}
													isDisabled={isBankSelectDisabled}
													isDarkMode={isDarkMode}
													bodyTextClassName={bodyText}
													helperTextClassName={helperText}
													triggerClassName={fieldBankContainerClassName}
													placeholder="Selecione o banco vinculado"
													sheetTitle="Escolha o banco da despesa"
													emptyMessage="Nenhum banco disponível."
													triggerHint={bankHelperMessage}
													disabledHint={bankHelperMessage}
													accessibilityLabel="Selecionar banco da despesa"
												/>
											</VStack>
										)}
									</View>
								</VStack>

								<VStack className="mb-4">
									<Text className={LUMUS_FORM_CLASS_NAMES.label}>Categoria</Text>
									{isTagSelectionLocked ? (
										<View className={`${fieldContainerCardClassName} px-4 py-3`}>
											<HStack className="items-center gap-3">
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
												<Text className={`${bodyText} flex-1 text-sm`}>
													{selectedTagLabel ?? 'Categoria definida automaticamente'}
												</Text>
											</HStack>
										</View>
									) : (
										<TagActionsheetSelector
											options={tags}
											selectedId={selectedTagId}
											selectedLabel={selectedTagLabel}
											selectedOption={selectedTagOption}
											onSelect={handleSelectTag}
												onOpen={() => { if (!tags.length && hasMoreTags) void loadMoreTags(); }}
												onEndReached={() => void loadMoreTags()}
											isDisabled={isTagSelectDisabled}
											isDarkMode={isDarkMode}
											bodyTextClassName={bodyText}
											helperTextClassName={helperText}
											triggerClassName={fieldContainerCardClassName}
											placeholder="Selecione a categoria da despesa"
											sheetTitle="Escolha a categoria da despesa"
											emptyMessage="Nenhuma categoria de despesa disponível."
											accessibilityLabel="Escolher categoria de despesa"
											onCreatePress={handleOpenAddTagScreen}
											createActionLabel="Adicionar categoria de despesa"
											isCreateDisabled={isAddTagButtonDisabled}
										/>
									)}
								</VStack>

								<MovementFormStatus loading={isLoadingExisting} error={movementLoadError || optionsError} onRetry={() => { retryMovementLoad(); reloadTags(); void reloadBanks(); }} />

								<Button
									className={`${submitButtonClassName}`}
									onPress={() => {
										void handleSubmit();
									}}
									isDisabled={isSubmitDisabled}
								>
									{isSubmitting || isLoadingExisting ? (
										<ButtonSpinner />
									) : (
										<ButtonText>{isEditing ? 'Atualizar despesa' : 'Registrar despesa'}</ButtonText>
									)}
								</Button>
							</VStack>
						</ScrollView>
					</View>
				</KeyboardAvoidingView>

				<View
					style={{
						marginHorizontal: -18,
						paddingBottom: 0,
						flexShrink: 0,
					}}
				>
					<Navigator defaultValue={1} />
				</View>

				<Modal
					isOpen={Boolean(mandatoryExpenseSuggestion)}
					onClose={handleCloseMandatoryExpenseSuggestionModal}
				>
					<ModalBackdrop />
					<ModalContent className={`max-w-[380px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>Pagamento obrigatório pendente</ModalTitle>
							<ModalCloseButton onPress={handleCloseMandatoryExpenseSuggestionModal} />
						</ModalHeader>
						<ModalBody>
							<Text className={`${bodyText} text-sm leading-5 text-justify`}>
								Encontramos o gasto obrigatório pendente{' '}
								<Text className="font-semibold text-yellow-600 dark:text-yellow-400">
									&quot;{mandatoryExpenseSuggestion?.name}&quot; ({mandatoryExpenseSuggestionValue})
								</Text>
								. Deseja ir aos pagamentos obrigatórios para efetivá-lo?
							</Text>
						</ModalBody>
						<ModalFooter className="gap-3">
							<VStack className="w-full gap-3">
								<Button
									variant="outline"
									onPress={handleIgnoreMandatoryExpenseSuggestion}
									isDisabled={isSubmitting}
									className={submitButtonCancelClassName}
								>
									<ButtonText>Registrar como gasto avulso</ButtonText>
								</Button>
								<Button
									variant="solid"
									onPress={handleGoToMandatoryExpenses}
									isDisabled={isSubmitting}
									className={submitButtonClassName}
								>
									<ButtonText className={submitButtonTextClassName}>
										Ir para pagamentos obrigatórios
									</ButtonText>
								</Button>
							</VStack>
						</ModalFooter>
					</ModalContent>
				</Modal>
			</View>
		</SafeAreaView>
	);
}
