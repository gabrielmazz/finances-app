import React from 'react';
import {
	BackHandler,
	Image as RNImage,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StatusBar,
	Text,
	useWindowDimensions,
	View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField } from '@/components/ui/input';
import { Radio, RadioGroup, RadioIcon, RadioIndicator, RadioLabel } from '@/components/ui/radio';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { VStack } from '@/components/ui/vstack';
import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';
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
import { CircleIcon } from '@/components/ui/icon';
import DatePickerField from '@/components/uiverse/date-picker';
import BankActionsheetSelector, { type BankActionsheetOption } from '@/components/uiverse/bank-actionsheet-selector';
import TagActionsheetSelector, { type TagActionsheetOption } from '@/components/uiverse/tag-actionsheet-selector';
import Navigator from '@/components/uiverse/navigator';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import AnimatedContent from '@/components/web/AnimatedContent';
import Grainient from '@/components/web/Grainient';
import StrokeText from '@/components/web/StrokeText';
import AddExpenseIllustration from '../assets/UnDraw/addRegisterExpanseScreen.svg';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { Info } from 'lucide-react';
import { auth } from '@/FirebaseConfig';
import { useAppTheme } from '@/contexts/ThemeContext';
import { addExpenseFirebase, getExpenseDataFirebase, updateExpenseFirebase } from '@/functions/ExpenseFirebase';
import { adjustFinanceInvestmentValueFirebase } from '@/functions/FinancesFirebase';
import {
	getMandatoryExpensesWithRelationsFirebase,
	registerMandatoryExpensePaymentFirebase,
	settleMandatoryExpenseFirebase,
} from '@/functions/MandatoryExpenseFirebase';
import { getAllBanksFirebase, getBankDataFirebase } from '@/functions/BankFirebase';
import { getAllTagsFirebase, getTagDataFirebase } from '@/functions/TagFirebase';
import { clearPendingCreatedTag, peekPendingCreatedTag } from '@/utils/pendingCreatedTag';
import { APP_ROUTE_PATHS, navigateToHomeDashboard, navigateToRoute } from '@/utils/navigation';
import { findMandatoryExpenseSuggestion, type MandatoryExpenseSuggestion } from '@/utils/mandatoryExpenseSuggestions';
import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import { getCycleKeyFromDate } from '@/utils/mandatoryExpenses';
import {
	cancelMandatoryExpenseNotification,
	suppressMandatoryExpenseNotificationCycle,
} from '@/utils/mandatoryExpenseNotifications';
import {
	isTagVisibleInRegularUsageList,
	normalizeTagUsageType,
	tagSupportsUsage,
	type TagUsageType,
} from '@/utils/tagUsage';
import { TagIcon, type TagIconFamily, type TagIconSelection, type TagIconStyle } from '@/hooks/useTagIcons';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';
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
type SubmitOptions = { bypassMandatorySuggestionKey?: string | null };

const formatCurrencyBRL = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueInCents / 100);

const formatDateToBR = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${day}/${month}/${year}`;
};

const parseDateFromBR = (value: string) => {
	const [day, month, year] = value.split('/').map(Number);
	if (!day || !month || !year || month > 12 || year < 1900) return null;
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
};

const mergeDateWithCurrentTime = (date: Date) => {
	const now = new Date();
	const result = new Date(date);
	result.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
	return result;
};

const normalizeDateValue = (value: unknown): Date | null => {
	if (!value) return null;
	if (value instanceof Date) return value;
	if (
		typeof value === 'object' &&
		value !== null &&
		'toDate' in value &&
		typeof (value as { toDate?: unknown }).toDate === 'function'
	) {
		return (value as { toDate: () => Date }).toDate();
	}
	if (
		typeof value === 'object' &&
		value !== null &&
		'seconds' in value &&
		typeof (value as { seconds?: unknown }).seconds === 'number'
	) {
		return new Date((value as { seconds: number }).seconds * 1000);
	}
	if (typeof value === 'string' || typeof value === 'number') {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	return null;
};

const getSuggestedDateByDueDay = (dueDay: number, usesBusinessDays = false) =>
	formatDateToBR(resolveMonthlyOccurrence({ referenceDate: new Date(), dueDay, usesBusinessDays }).date);

export default function AddRegisterExpensesScreen() {
	const { width } = useWindowDimensions();
	const isDesktop = width >= 1024;
	const compact = width < 720;
	const { isDarkMode } = useAppTheme();
	const {
		surfaceBackground,
		cardBackground,
		heroHeight,
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
		insets,
		switchRadioClassName,
		switchRadioIndicatorClassName,
		switchRadioIconClassName,
		switchRadioLabelClassName,
		infoCardStyle,
		webDashboardClassNames,
		webExpenseClassNames,
	} = useScreenStyles();
	const applyPostSubmitBehavior = usePostSubmitBehavior('addRegisterExpenses');

	const [expenseName, setExpenseName] = React.useState('');
	const [expenseValueDisplay, setExpenseValueDisplay] = React.useState('');
	const [expenseValueCents, setExpenseValueCents] = React.useState<number | null>(null);
	const [expenseDate, setExpenseDate] = React.useState(formatDateToBR(new Date()));
	const [tags, setTags] = React.useState<OptionItem[]>([]);
	const [banks, setBanks] = React.useState<OptionItem[]>([]);
	const [selectedTagId, setSelectedTagId] = React.useState<string | null>(null);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);
	const [selectedMovementTagName, setSelectedMovementTagName] = React.useState<string | null>(null);
	const [selectedMovementTagIcon, setSelectedMovementTagIcon] = React.useState<TagIconSelection | null>(null);
	const [selectedMovementBankName, setSelectedMovementBankName] = React.useState<string | null>(null);
	const [isLoadingTags, setIsLoadingTags] = React.useState(false);
	const [isLoadingBanks, setIsLoadingBanks] = React.useState(false);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isLoadingExisting, setIsLoadingExisting] = React.useState(false);
	const [explanationExpense, setExplanationExpense] = React.useState<string | null>(null);
	const [moneyFormat, setMoneyFormat] = React.useState(false);
	const [hasAppliedTemplate, setHasAppliedTemplate] = React.useState(false);
	const [mandatoryExpenseSuggestion, setMandatoryExpenseSuggestion] = React.useState<MandatoryExpenseSuggestion | null>(
		null,
	);
	const [ignoredMandatorySuggestionKey, setIgnoredMandatorySuggestionKey] = React.useState<string | null>(null);
	const [valuesRadioMoneyFormat, setValuesRadioMoneyFormat] = React.useState<
		'Pagamento em Dinheiro' | 'Pagamento em Banco'
	>('Pagamento em Banco');
	const submitLockRef = React.useRef(false);
	const expenseNameInputRef = React.useRef<any>(null);
	const expenseValueInputRef = React.useRef<any>(null);
	const expenseExplanationInputRef = React.useRef<any>(null);

	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => (key === 'expense-explanation' ? 220 : 170),
		[],
	);
	const getInputRef = React.useCallback((key: FocusableInputKey) => {
		if (key === 'expense-name') return expenseNameInputRef;
		if (key === 'expense-value') return expenseValueInputRef;
		return expenseExplanationInputRef;
	}, []);
	const { scrollViewRef, contentBottomPadding, handleInputFocus, handleScroll, scrollEventThrottle } =
		useKeyboardAwareScroll<FocusableInputKey>({
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
		templateLockTag?: string | string[];
		investmentIdForAdjustment?: string | string[];
		investmentDeltaInCents?: string | string[];
	}>();

	const decodeParam = React.useCallback((value?: string | string[]) => {
		const raw = Array.isArray(value) ? value[0] : value;
		if (!raw) return undefined;
		try {
			return decodeURIComponent(raw);
		} catch {
			return raw;
		}
	}, []);
	const parseNumberParam = React.useCallback((value?: string | string[]) => {
		const raw = Array.isArray(value) ? value[0] : value;
		if (!raw) return undefined;
		const parsed = Number(raw);
		return Number.isNaN(parsed) ? undefined : parsed;
	}, []);
	const editingExpenseId = React.useMemo(() => {
		const value = Array.isArray(params.expenseId) ? params.expenseId[0] : params.expenseId;
		return value?.trim() || null;
	}, [params.expenseId]);
	const isEditing = Boolean(editingExpenseId);
	const templateData = React.useMemo(() => {
		const name = decodeParam(params.templateName);
		const description = decodeParam(params.templateDescription);
		const tagId = decodeParam(params.templateTagId);
		const tagName = decodeParam(params.templateTagName);
		const tagIconFamily = decodeParam(params.templateTagIconFamily);
		const tagIconName = decodeParam(params.templateTagIconName);
		const tagIconStyle = decodeParam(params.templateTagIconStyle);
		const mandatoryExpenseId = decodeParam(params.templateMandatoryExpenseId);
		const valueInCents = parseNumberParam(params.templateValueInCents);
		const dueDay = parseNumberParam(params.templateDueDay);
		if (
			!name &&
			!description &&
			!tagId &&
			!tagName &&
			!tagIconFamily &&
			!tagIconName &&
			!tagIconStyle &&
			!mandatoryExpenseId &&
			typeof valueInCents === 'undefined' &&
			typeof dueDay === 'undefined'
		)
			return null;
		return {
			name,
			description,
			tagId,
			tagName,
			tagIcon:
				tagIconFamily && tagIconName
					? {
						iconFamily: tagIconFamily as TagIconFamily,
						iconName: tagIconName,
						iconStyle: tagIconStyle as TagIconStyle | null,
					}
					: null,
			valueInCents,
			dueDay,
			usesBusinessDays: decodeParam(params.templateUsesBusinessDays) === '1',
			mandatoryExpenseId,
			isMandatoryExpenseSettlement: decodeParam(params.templateMandatoryExpenseSettlement) === '1',
			lockTag: decodeParam(params.templateLockTag) === '1',
			investmentAdjustmentId: decodeParam(params.investmentIdForAdjustment),
			investmentDeltaInCents: parseNumberParam(params.investmentDeltaInCents),
		};
	}, [
		decodeParam,
		params.investmentDeltaInCents,
		params.investmentIdForAdjustment,
		params.templateDescription,
		params.templateDueDay,
		params.templateLockTag,
		params.templateMandatoryExpenseId,
		params.templateMandatoryExpenseSettlement,
		params.templateName,
		params.templateTagIconFamily,
		params.templateTagIconName,
		params.templateTagIconStyle,
		params.templateTagId,
		params.templateTagName,
		params.templateUsesBusinessDays,
		params.templateValueInCents,
		parseNumberParam,
	]);

	const linkedMandatoryExpenseId = templateData?.mandatoryExpenseId ?? null;
	const isMandatoryExpenseSettlement = templateData?.isMandatoryExpenseSettlement === true;
	const isTemplateLocked = Boolean(linkedMandatoryExpenseId && !isEditing);
	const isTagSelectionLocked = isTemplateLocked || Boolean(templateData?.lockTag);
	const pendingInvestmentAdjustment = React.useMemo(() => {
		if (isEditing || !templateData?.investmentAdjustmentId || !templateData.investmentDeltaInCents) return null;
		return { investmentId: templateData.investmentAdjustmentId, deltaInCents: templateData.investmentDeltaInCents };
	}, [isEditing, templateData]);
	const parsedExpenseDate = React.useMemo(() => parseDateFromBR(expenseDate), [expenseDate]);
	const isBankSelectionRequired = !moneyFormat;
	const isFormBusy = isLoadingExisting || isSubmitting;
	const isSubmitDisabled =
		isFormBusy ||
		!expenseName.trim() ||
		expenseValueCents === null ||
		!selectedTagId ||
		(isBankSelectionRequired && !selectedBankId) ||
		!parsedExpenseDate;
	const isExpenseValueDisabled = !expenseName.trim() || isFormBusy;
	const isExpenseDateDisabled =
		!expenseName.trim() || expenseValueCents === null || expenseValueCents <= 0 || isFormBusy;
	const isExplanationDisabled =
		!expenseName.trim() || expenseValueCents === null || expenseValueCents <= 0 || isFormBusy;
	const isMoneyFormatSelectionDisabled =
		!expenseName.trim() || expenseValueCents === null || !parsedExpenseDate || isFormBusy;
	const isBankSelectDisabled =
		isLoadingBanks ||
		banks.length === 0 ||
		isFormBusy ||
		!expenseName.trim() ||
		expenseValueCents === null ||
		expenseValueCents <= 0 ||
		!parsedExpenseDate;
	const isTagSelectDisabled =
		isLoadingTags ||
		isFormBusy ||
		!expenseName.trim() ||
		expenseValueCents === null ||
		!parsedExpenseDate ||
		(isBankSelectionRequired && !selectedBankId);

	const showSuccessfulExpenseNotification = React.useCallback(
		(isUpdating = false, isSettlement = false) => {
			const name = expenseName.trim() || 'informada';
			const bankName = banks.find((bank) => bank.id === selectedBankId)?.name ?? selectedMovementBankName;
			const destination = moneyFormat
				? 'como pagamento em dinheiro'
				: bankName
					? `no banco ${bankName}`
					: 'no banco selecionado';
			showNotifierAlert({
				title: isSettlement ? 'Quitação registrada' : isUpdating ? 'Despesa atualizada' : 'Despesa registrada',
				description: isSettlement
					? `A quitação de "${name}" foi registrada com sucesso ${destination}.`
					: `A despesa "${name}" foi ${isUpdating ? 'atualizada' : 'registrada'} com sucesso ${destination}.`,
				type: 'success',
				isDarkMode,
				duration: 4000,
			});
		},
		[banks, expenseName, isDarkMode, moneyFormat, selectedBankId, selectedMovementBankName],
	);

	const resetNewExpenseForm = React.useCallback(() => {
		setExpenseName('');
		setExpenseValueDisplay('');
		setExpenseValueCents(null);
		setExpenseDate(formatDateToBR(new Date()));
		setSelectedTagId(null);
		setSelectedBankId(null);
		setSelectedMovementTagName(null);
		setSelectedMovementTagIcon(null);
		setSelectedMovementBankName(null);
		setExplanationExpense(null);
		setMoneyFormat(false);
		setValuesRadioMoneyFormat('Pagamento em Banco');
		setIgnoredMandatorySuggestionKey(null);
	}, []);

	const handleValueChange = React.useCallback((input: string) => {
		const digitsOnly = input.replace(/\D/g, '');
		if (!digitsOnly) {
			setExpenseValueDisplay('');
			setExpenseValueCents(null);
			return;
		}
		const cents = Number.parseInt(digitsOnly, 10);
		setExpenseValueDisplay(formatCurrencyBRL(cents));
		setExpenseValueCents(cents);
	}, []);

	const handleSubmit = React.useCallback(
		async (options: SubmitOptions = {}) => {
			const notifyError = (title: string, description: string, duration = 4000) =>
				showNotifierAlert({ title, description, type: 'error', isDarkMode, duration });
			if (submitLockRef.current || isSubmitting) return;
			if (!expenseName.trim()) return notifyError('Erro ao registrar despesa', 'Informe o nome da despesa.');
			if (expenseValueCents === null) return notifyError('Erro ao registrar despesa', 'Informe o valor da despesa.');
			if (expenseValueCents <= 0)
				return notifyError('Erro ao registrar despesa', 'Informe um valor maior que zero para a despesa.');
			if (!selectedTagId) return notifyError('Erro ao registrar despesa', 'Selecione uma tag.');
			if (isBankSelectionRequired && !selectedBankId)
				return notifyError('Erro ao registrar despesa', 'Selecione um banco.');
			if (!parsedExpenseDate) return notifyError('Erro ao registrar despesa', 'Informe uma data válida (DD/MM/AAAA).');

			const dateWithCurrentTime = mergeDateWithCurrentTime(parsedExpenseDate);
			if (linkedMandatoryExpenseId && getCycleKeyFromDate(dateWithCurrentTime) !== getCycleKeyFromDate(new Date())) {
				return notifyError(
					'Data fora do ciclo atual',
					'Registre o pagamento obrigatório com uma data deste mês para manter o ciclo correto.',
					5000,
				);
			}
			submitLockRef.current = true;
			setIsSubmitting(true);
			try {
				const personId = auth.currentUser?.uid;
				if (!personId) return notifyError('Erro ao registrar despesa', 'Não foi possível identificar o usuário atual.');
				const shouldCheckSuggestion =
					!isEditing &&
					!linkedMandatoryExpenseId &&
					!pendingInvestmentAdjustment &&
					getCycleKeyFromDate(dateWithCurrentTime) === getCycleKeyFromDate(new Date());
				if (shouldCheckSuggestion) {
					const mandatoryResult = await getMandatoryExpensesWithRelationsFirebase(personId);
					if (!mandatoryResult.success || !Array.isArray(mandatoryResult.data))
						return notifyError(
							'Não foi possível validar gastos obrigatórios',
							'A despesa não foi registrada para evitar um lançamento obrigatório fora do fluxo correto.',
							5000,
						);
					const suggestion = findMandatoryExpenseSuggestion(
						{
							name: expenseName.trim(),
							valueInCents: expenseValueCents,
							tagId: selectedTagId,
							date: dateWithCurrentTime,
						},
						mandatoryResult.data,
					);
					const bypassKey = options.bypassMandatorySuggestionKey ?? ignoredMandatorySuggestionKey;
					if (suggestion && suggestion.matchKey !== bypassKey) {
						setMandatoryExpenseSuggestion(suggestion);
						return;
					}
				}

				if (isEditing && editingExpenseId) {
					const result = await updateExpenseFirebase({
						expenseId: editingExpenseId,
						name: expenseName.trim(),
						valueInCents: expenseValueCents,
						tagId: selectedTagId,
						bankId: isBankSelectionRequired ? selectedBankId : null,
						date: dateWithCurrentTime,
						explanation: explanationExpense?.trim() ?? null,
						moneyFormat,
					});
					if (!result.success) return notifyError('Erro ao atualizar despesa', 'Tente novamente mais tarde.');
					showSuccessfulExpenseNotification(true);
					applyPostSubmitBehavior({ isEditing: true });
					return;
				}

				if (linkedMandatoryExpenseId) {
					const paymentParams = {
						mandatoryExpenseId: linkedMandatoryExpenseId,
						name: expenseName.trim(),
						valueInCents: expenseValueCents,
						tagId: selectedTagId,
						bankId: isBankSelectionRequired ? selectedBankId : null,
						date: dateWithCurrentTime,
						personId,
						explanation: explanationExpense?.trim() || null,
						moneyFormat,
					};
					const result = isMandatoryExpenseSettlement
						? await settleMandatoryExpenseFirebase(paymentParams)
						: await registerMandatoryExpensePaymentFirebase(paymentParams);
					if (!result.success) {
						const description =
							result.reason === 'installment_plan_required'
								? 'A quitação antecipada só está disponível para gastos parcelados.'
								: result.reason === 'no_remaining_installments' || result.reason === 'installment_plan_complete'
									? 'Todas as parcelas deste gasto obrigatório já foram registradas.'
									: result.reason === 'already_paid_for_cycle'
										? 'Este gasto obrigatório já foi registrado neste ciclo. Atualize a lista para conferir o status.'
										: result.reason === 'mandatory_expense_not_found'
											? 'Este gasto obrigatório não foi encontrado. Volte à lista e atualize os dados.'
											: 'Não foi possível registrar este pagamento obrigatório. Nenhuma despesa foi criada.';
						return notifyError('Erro ao registrar gasto obrigatório', description, 5000);
					}
					try {
						if (isMandatoryExpenseSettlement)
							await cancelMandatoryExpenseNotification(personId, linkedMandatoryExpenseId);
						else
							await suppressMandatoryExpenseNotificationCycle(
								personId,
								linkedMandatoryExpenseId,
								getCycleKeyFromDate(dateWithCurrentTime),
							);
					} catch (notificationError) {
						console.error('Erro ao atualizar lembretes do gasto obrigatório:', notificationError);
					}
				} else {
					const result = await addExpenseFirebase({
						name: expenseName.trim(),
						valueInCents: expenseValueCents,
						tagId: selectedTagId,
						bankId: isBankSelectionRequired ? selectedBankId : null,
						date: dateWithCurrentTime,
						personId,
						explanation: explanationExpense?.trim() || null,
						moneyFormat,
					});
					if (!result.success) return notifyError('Erro ao registrar despesa', 'Tente novamente mais tarde.');
				}

				if (pendingInvestmentAdjustment) {
					const result = await adjustFinanceInvestmentValueFirebase(pendingInvestmentAdjustment);
					if (!result.success)
						notifyError(
							'Erro ao atualizar investimento',
							'Despesa registrada, mas não foi possível atualizar o investimento.',
						);
				}
				showSuccessfulExpenseNotification(false, isMandatoryExpenseSettlement);
				applyPostSubmitBehavior({ resetForm: resetNewExpenseForm });
			} catch (error) {
				console.error('Erro ao registrar/atualizar despesa:', error);
				notifyError('Erro ao registrar despesa', 'Erro inesperado ao salvar a despesa.');
			} finally {
				submitLockRef.current = false;
				setIsSubmitting(false);
			}
		},
		[
			applyPostSubmitBehavior,
			editingExpenseId,
			expenseName,
			expenseValueCents,
			explanationExpense,
			ignoredMandatorySuggestionKey,
			isBankSelectionRequired,
			isEditing,
			isMandatoryExpenseSettlement,
			isSubmitting,
			isDarkMode,
			linkedMandatoryExpenseId,
			moneyFormat,
			parsedExpenseDate,
			pendingInvestmentAdjustment,
			resetNewExpenseForm,
			selectedBankId,
			selectedTagId,
			showSuccessfulExpenseNotification,
		],
	);

	const handleMoneyFormatChange = React.useCallback((nextValue: boolean) => {
		setMoneyFormat(nextValue);
		if (nextValue) {
			setSelectedBankId(null);
			setSelectedMovementBankName(null);
		}
	}, []);
	const handleRadioMoneyFormatChange = React.useCallback(
		(value: 'Pagamento em Dinheiro' | 'Pagamento em Banco') => {
			setValuesRadioMoneyFormat(value);
			handleMoneyFormatChange(value === 'Pagamento em Dinheiro');
		},
		[handleMoneyFormatChange],
	);
	const handleSelectTag = React.useCallback((tag: TagActionsheetOption) => {
		setSelectedTagId(tag.id);
		setSelectedMovementTagName(tag.name);
		setSelectedMovementTagIcon({
			iconFamily: tag.iconFamily as TagIconFamily | null,
			iconName: tag.iconName ?? null,
			iconStyle: tag.iconStyle as TagIconStyle | null,
		});
	}, []);
	const handleSelectBank = React.useCallback((bank: BankActionsheetOption) => {
		setSelectedBankId(bank.id);
		setSelectedMovementBankName(bank.name);
	}, []);
	const handleOpenAddTagScreen = React.useCallback(() => {
		if (isFormBusy || isTagSelectionLocked) return;
		navigateToRoute(APP_ROUTE_PATHS.addRegisterTag, {
			placement: 'expense',
			returnAfterCreate: '1',
			returnToRoute: APP_ROUTE_PATHS.addRegisterExpenses,
		});
	}, [isFormBusy, isTagSelectionLocked]);

	useFocusEffect(
		React.useCallback(() => {
			const listener = () => {
				navigateToHomeDashboard();
				return true;
			};
			const subscription = BackHandler.addEventListener('hardwareBackPress', listener);
			return () => subscription.remove();
		}, []),
	);

	React.useEffect(() => {
		let isMounted = true;
		const loadOptions = async () => {
			setIsLoadingTags(true);
			setIsLoadingBanks(true);
			try {
				const [tagsResult, banksResult] = await Promise.all([getAllTagsFirebase(), getAllBanksFirebase()]);
				if (!isMounted) return;
				if (tagsResult.success && Array.isArray(tagsResult.data)) {
					const formattedTags = tagsResult.data
						.filter((tag: any) => isTagVisibleInRegularUsageList(tag, 'expense', { allowUndefinedUsageType: true }))
						.map((tag: any) => ({
							id: tag.id,
							name: typeof tag.name === 'string' && tag.name.trim() ? tag.name.trim() : 'Tag sem nome',
							usageType: normalizeTagUsageType(tag.usageType),
							iconFamily: typeof tag.iconFamily === 'string' ? tag.iconFamily : null,
							iconName: typeof tag.iconName === 'string' ? tag.iconName : null,
							iconStyle: typeof tag.iconStyle === 'string' ? tag.iconStyle : null,
						}));
					const pending = peekPendingCreatedTag();
					const matchingPending =
						pending && tagSupportsUsage(pending.usageType, 'expense')
							? formattedTags.find((tag) => tag.id === pending.tagId)
							: null;
					setTags(formattedTags);
					if (formattedTags.length === 0) {
						showNotifierAlert({
							title: 'Nenhuma categoria de despesa disponível',
							description: 'Cadastre uma categoria marcada como despesa.',
							type: 'error',
							isDarkMode,
							duration: 4000,
						});
					}
					if (matchingPending) {
						setSelectedTagId(matchingPending.id);
						setSelectedMovementTagName(matchingPending.name);
						setSelectedMovementTagIcon({
							iconFamily: matchingPending.iconFamily ?? null,
							iconName: matchingPending.iconName ?? null,
							iconStyle: matchingPending.iconStyle ?? null,
						});
						clearPendingCreatedTag(matchingPending.id);
					} else
						setSelectedTagId((current) =>
							current && formattedTags.some((tag) => tag.id === current)
								? current
								: isTagSelectionLocked && templateData?.tagId
									? templateData.tagId
									: null,
						);
				} else {
					showNotifierAlert({
						title: 'Erro ao carregar tags',
						description: 'Não foi possível carregar as tags disponíveis.',
						type: 'error',
						isDarkMode,
						duration: 4000,
					});
				}
				if (banksResult.success && Array.isArray(banksResult.data)) {
					const formattedBanks = banksResult.data.map((bank: any) => ({
						id: bank.id,
						name: typeof bank.name === 'string' && bank.name.trim() ? bank.name.trim() : 'Banco sem nome',
						iconKey: typeof bank.iconKey === 'string' ? bank.iconKey : null,
						colorHex: typeof bank.colorHex === 'string' ? bank.colorHex : null,
					}));
					setBanks(formattedBanks);
					setSelectedBankId((current) =>
						current && formattedBanks.some((bank) => bank.id === current) ? current : null,
					);
				} else {
					showNotifierAlert({
						title: 'Erro ao carregar bancos',
						description: 'Não foi possível carregar os bancos disponíveis.',
						type: 'error',
						isDarkMode,
						duration: 4000,
					});
				}
			} catch (error) {
				console.error('Erro ao carregar opções da despesa:', error);
			} finally {
				if (isMounted) {
					setIsLoadingTags(false);
					setIsLoadingBanks(false);
				}
			}
		};
		void loadOptions();
		return () => {
			isMounted = false;
		};
	}, [isDarkMode, isTagSelectionLocked, templateData?.tagId]);

	React.useEffect(() => {
		if (hasAppliedTemplate || isEditing || !templateData) return;
		if (templateData.name) setExpenseName(templateData.name);
		if (typeof templateData.valueInCents === 'number' && templateData.valueInCents > 0) {
			setExpenseValueCents(templateData.valueInCents);
			setExpenseValueDisplay(formatCurrencyBRL(templateData.valueInCents));
		}
		if (typeof templateData.dueDay === 'number')
			setExpenseDate(getSuggestedDateByDueDay(templateData.dueDay, templateData.usesBusinessDays));
		if (templateData.tagId) setSelectedTagId(templateData.tagId);
		if (templateData.tagName) setSelectedMovementTagName(templateData.tagName);
		if (templateData.tagIcon) setSelectedMovementTagIcon(templateData.tagIcon);
		if (templateData.description) setExplanationExpense(templateData.description);
		setHasAppliedTemplate(true);
	}, [hasAppliedTemplate, isEditing, templateData]);

	React.useEffect(() => {
		if (!editingExpenseId) return;
		let isMounted = true;
		setIsLoadingExisting(true);
		void getExpenseDataFirebase(editingExpenseId)
			.then((response) => {
				if (!isMounted) return;
				if (!response.success || !response.data) return;
				const data = response.data as Record<string, unknown>;
				const value = typeof data.valueInCents === 'number' ? data.valueInCents : 0;
				setExpenseName(typeof data.name === 'string' ? data.name : '');
				setExpenseValueCents(value);
				setExpenseValueDisplay(formatCurrencyBRL(value));
				setExpenseDate(formatDateToBR(normalizeDateValue(data.date) ?? new Date()));
				setSelectedTagId(typeof data.tagId === 'string' ? data.tagId : null);
				setSelectedBankId(typeof data.bankId === 'string' ? data.bankId : null);
				setExplanationExpense(typeof data.explanation === 'string' ? data.explanation : null);
				setMoneyFormat(typeof data.moneyFormat === 'boolean' ? data.moneyFormat : false);
			})
			.catch((error: unknown) => {
				console.error('Erro ao carregar despesa para edição:', error);
				if (isMounted)
					showNotifierAlert({
						title: 'Erro ao carregar despesa',
						description: 'Erro inesperado ao carregar a despesa selecionada.',
						type: 'error',
						isDarkMode,
						duration: 4000,
					});
			})
			.finally(() => {
				if (isMounted) setIsLoadingExisting(false);
			});
		return () => {
			isMounted = false;
		};
	}, [editingExpenseId]);

	React.useEffect(() => {
		const matched = tags.find((tag) => tag.id === selectedTagId);
		if (matched) {
			setSelectedMovementTagName(matched.name);
			setSelectedMovementTagIcon({
				iconFamily: matched.iconFamily ?? null,
				iconName: matched.iconName ?? null,
				iconStyle: matched.iconStyle ?? null,
			});
			return;
		}
		if (!selectedTagId) {
			setSelectedMovementTagName(null);
			setSelectedMovementTagIcon(null);
			return;
		}
		let isMounted = true;
		void getTagDataFirebase(selectedTagId)
			.then((result) => {
				if (!isMounted) return;
				if (result.success && result.data) {
					setSelectedMovementTagName(typeof result.data.name === 'string' ? result.data.name : null);
					setSelectedMovementTagIcon({
						iconFamily: typeof result.data.iconFamily === 'string' ? result.data.iconFamily : null,
						iconName: typeof result.data.iconName === 'string' ? result.data.iconName : null,
						iconStyle: typeof result.data.iconStyle === 'string' ? result.data.iconStyle : null,
					});
				} else {
					setSelectedMovementTagName(null);
					setSelectedMovementTagIcon(null);
				}
			})
			.catch(() => {
				if (isMounted) {
					setSelectedMovementTagName(null);
					setSelectedMovementTagIcon(null);
				}
			});
		return () => {
			isMounted = false;
		};
	}, [selectedTagId, tags]);

	React.useEffect(() => {
		const matched = banks.find((bank) => bank.id === selectedBankId);
		if (matched) {
			setSelectedMovementBankName(matched.name);
			return;
		}
		if (!selectedBankId) {
			setSelectedMovementBankName(null);
			return;
		}
		let isMounted = true;
		void getBankDataFirebase(selectedBankId)
			.then((result) => {
				if (isMounted)
					setSelectedMovementBankName(
						result.success && result.data && typeof result.data.name === 'string' ? result.data.name : null,
					);
			})
			.catch(() => {
				if (isMounted) setSelectedMovementBankName(null);
			});
		return () => {
			isMounted = false;
		};
	}, [banks, selectedBankId]);

	React.useEffect(() => {
		setValuesRadioMoneyFormat(moneyFormat ? 'Pagamento em Dinheiro' : 'Pagamento em Banco');
	}, [moneyFormat]);

	const selectedTagLabel =
		tags.find((tag) => tag.id === selectedTagId)?.name ??
		selectedMovementTagName ??
		(selectedTagId === templateData?.tagId ? templateData?.tagName : null);
	const selectedTagOption =
		tags.find((tag) => tag.id === selectedTagId) ??
		(selectedTagId && selectedMovementTagIcon
			? { id: selectedTagId, name: selectedTagLabel ?? 'Categoria selecionada', ...selectedMovementTagIcon }
			: null);
	const selectedBankLabel = banks.find((bank) => bank.id === selectedBankId)?.name ?? selectedMovementBankName;
	const selectedBankOption =
		banks.find((bank) => bank.id === selectedBankId) ??
		(selectedBankId && selectedBankLabel ? { id: selectedBankId, name: selectedBankLabel } : null);
	const suggestionValue = mandatoryExpenseSuggestion ? formatCurrencyBRL(mandatoryExpenseSuggestion.valueInCents) : '';
	const tagHelperMessage = isTagSelectionLocked
		? isTemplateLocked
			? 'Essa categoria vem do gasto obrigatório vinculado.'
			: 'Essa categoria foi definida pelo template usado como base.'
		: isLoadingTags
			? 'Carregando categorias de despesas...'
			: tags.length === 0
				? 'Cadastre uma categoria de despesa para continuar.'
				: 'Escolha a categoria que representa esta saída.';
	const bankHelperMessage = moneyFormat
		? 'Pagamentos em dinheiro não ficam vinculados a banco.'
		: isLoadingBanks
			? 'Carregando bancos disponíveis...'
			: banks.length === 0
				? 'Cadastre um banco para vincular esta despesa.'
				: 'Selecione onde essa saída foi lançada.';
	const fieldColumn = isDesktop ? webExpenseClassNames.fieldHalf : webExpenseClassNames.fieldFull;
	const inputClassName = `${fieldContainerClassName} ${webExpenseClassNames.fieldInput}`;
	const cardClassName = `${fieldContainerCardClassName} ${webExpenseClassNames.fieldCard}`;

	const handleIgnoreSuggestion = () => {
		if (!mandatoryExpenseSuggestion) return;
		const key = mandatoryExpenseSuggestion.matchKey;
		setIgnoredMandatorySuggestionKey(key);
		setMandatoryExpenseSuggestion(null);
		void handleSubmit({ bypassMandatorySuggestionKey: key });
	};
	const handleGoToMandatoryExpenses = () => {
		if (!mandatoryExpenseSuggestion) return;
		setMandatoryExpenseSuggestion(null);
		navigateToRoute(APP_ROUTE_PATHS.mandatoryExpenses, { focusMandatoryExpenseId: mandatoryExpenseSuggestion.id });
	};

	return (
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
					className={webDashboardClassNames.fill}
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
								accessibilityLabel="Background da tela de registro de despesas"
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
							<View
								pointerEvents="none"
								style={{
									position: 'absolute',
									top: 0,
									left: 0,
									width: '100%',
									height: heroHeight,
									opacity: 0.62,
									zIndex: 1,
								}}
							>
								<Grainient
									className="add-expense-hero-grainient"
									timeSpeed={0.12}
									colorBalance={isDarkMode ? 0.08 : -0.12}
									warpStrength={0.8}
									warpFrequency={3.5}
									warpSpeed={1.8}
									warpAmplitude={100}
									blendSoftness={0.18}
									grainAmount={0.08}
									grainScale={3}
									grainAnimated
									contrast={1.08}
									zoom={0.9}
									color1={isDarkMode ? '#f8bd0c' : '#FFE58A'}
									color2={isDarkMode ? '#facc15' : '#D97706'}
									color3={isDarkMode ? '#fefe59' : '#EAB308'}
								/>
							</View>
							<View className={webDashboardClassNames.heroContent} style={{ paddingTop: insets.top + 24, zIndex: 2 }}>
								<StrokeText
									text={isEditing ? 'Atualize sua despesa' : 'Registro de despesa'}
									strokeColor="#FFFFFF"
									fillColor="#FFFFFF"
									strokeWidth={1.5}
									drawDuration={2}
									fillDelay={1}
									fontSize={40}
									fontWeight={600}
									letterSpacing={-0.5}
									fontFamily={'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'}
									ease="power3.out"
									trigger="mount"
									className={webDashboardClassNames.heroTitle}
								/>
								<AnimatedContent
									distance={100}
									direction="vertical"
									reverse={false}
									duration={2}
									ease="power3.out"
									initialOpacity={0}
									animateOpacity
									scale={1}
									threshold={0.1}
									delay={0}
									className={webDashboardClassNames.heroIllustrationAnimation}
								>
									<AddExpenseIllustration width="40%" height="100%" className="opacity-90" />
								</AnimatedContent>
							</View>
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
							<View className={`${webDashboardClassNames.sheetInner} max-w-[1180px] w-full self-center`}>
									<View
										className={`${webExpenseClassNames.formSurface} ${cardBackground} rounded-[28px]`}
										style={{ display: 'flex', flex: 1, flexDirection: 'column' }}
									>
										<View className={webExpenseClassNames.formScroll}>
											<View className="w-full">
												<View className={webExpenseClassNames.fieldGrid}>
													<VStack className={fieldColumn}>
														<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Nome da despesa</Text>
														<Input isDisabled={isFormBusy} className={inputClassName}>
															<InputField
																accessibilityLabel="Nome da despesa"
																ref={expenseNameInputRef}
																placeholder="Ex.: Mercado, aluguel ou transporte…"
																autoComplete="off"
																value={expenseName}
																onChangeText={setExpenseName}
																onFocus={() => handleInputFocus('expense-name')}
																onSubmitEditing={() => expenseValueInputRef.current?.focus?.()}
																autoCapitalize="sentences"
																autoCorrect={false}
																returnKeyType="next"
																className={inputField}
															/>
														</Input>
													</VStack>
													<VStack className={fieldColumn}>
														<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Valor da despesa</Text>
														<Input isDisabled={isExpenseValueDisabled} className={inputClassName}>
															<InputField
																accessibilityLabel="Valor da despesa"
																ref={expenseValueInputRef}
																placeholder="R$ 0,00"
																autoComplete="off"
																keyboardType="numeric"
																value={expenseValueDisplay}
																onChangeText={handleValueChange}
																onFocus={() => handleInputFocus('expense-value')}
																returnKeyType="next"
																className={inputField}
															/>
														</Input>
													</VStack>
													<VStack className={webExpenseClassNames.fieldFull}>
														<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Data da despesa</Text>
														<DatePickerField
															accessibilityLabel="Data da despesa"
															value={expenseDate}
															onChange={setExpenseDate}
															triggerClassName={`${fieldContainerClassName} ${webExpenseClassNames.fieldInput}`}
															inputClassName={inputField}
															placeholder="Selecione a data da despesa"
															isDisabled={isExpenseDateDisabled}
														/>
													</VStack>
													<VStack className={webExpenseClassNames.fieldFull}>
														<View className={webExpenseClassNames.sectionLabel}>
															<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Observação</Text>
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
																		accessibilityLabel="Informações sobre a observação"
																	>
																		<Info size={14} color={isDarkMode ? '#94A3B8' : '#64748B'} />
																	</Pressable>
																)}
															>
																<PopoverBackdrop className="bg-transparent" />
																<PopoverContent className="max-w-[280px]" style={infoCardStyle}>
																	<PopoverBody className="px-3 py-3">
																		<Text className={`${bodyText} text-xs leading-5`}>
																			Campo opcional. Use para explicar o motivo, local ou detalhe útil da despesa.
																		</Text>
																	</PopoverBody>
																</PopoverContent>
															</Popover>
														</View>
														<Textarea
															isDisabled={isExplanationDisabled}
															className={`${textareaContainerClassName} ${webExpenseClassNames.fieldTextarea}`}
														>
															<TextareaInput
																accessibilityLabel="Observação da despesa"
																ref={expenseExplanationInputRef}
																placeholder="Adicione uma observação, se necessário…"
																autoComplete="off"
																value={explanationExpense ?? ''}
																onChangeText={setExplanationExpense}
																onFocus={() => handleInputFocus('expense-explanation')}
																editable={!isExplanationDisabled}
																className={`${inputField} pt-2`}
															/>
														</Textarea>
													</VStack>

													<VStack className={webExpenseClassNames.fieldFull}>
														<View className={webExpenseClassNames.sectionLabel}>
															<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Formato de pagamento</Text>
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
																		accessibilityLabel="Informações sobre o formato de pagamento"
																	>
																		<Info size={14} color={isDarkMode ? '#94A3B8' : '#64748B'} />
																	</Pressable>
																)}
															>
																<PopoverBackdrop className="bg-transparent" />
																<PopoverContent className="max-w-[300px]" style={infoCardStyle}>
																	<PopoverBody className="px-3 py-3">
																		<Text className={`${bodyText} text-xs leading-5`}>
																			Pagamentos em dinheiro não ficam vinculados a um banco. Para pagamentos bancários,
																			selecione a conta logo abaixo.
																		</Text>
																	</PopoverBody>
																</PopoverContent>
															</Popover>
														</View>
														<View className={`${cardClassName} w-full max-w-[1120px] self-center pt-6 pb-6`}>
															<RadioGroup className="w-full max-w-[1120px] self-center" value={valuesRadioMoneyFormat} onChange={handleRadioMoneyFormatChange}>
																<View className="w-full flex-row flex-wrap gap-5">
																	<Radio
																		value="Pagamento em Banco"
																		className={switchRadioClassName}
																		isDisabled={isMoneyFormatSelectionDisabled}
																	>
																		<RadioIndicator className={switchRadioIndicatorClassName}>
																			<RadioIcon as={CircleIcon} className={switchRadioIconClassName} />
																		</RadioIndicator>
																		<RadioLabel className={`${switchRadioLabelClassName} ${bodyText} text-sm`}>
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
																		<RadioLabel className={`${switchRadioLabelClassName} ${bodyText} text-sm`}>
																			Pagamento em Dinheiro
																		</RadioLabel>
																	</Radio>
																</View>
															</RadioGroup>
															{valuesRadioMoneyFormat === 'Pagamento em Banco' ? (
																<VStack className="mt-4 w-full">
																	<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Banco</Text>
																	<BankActionsheetSelector
																		options={banks}
																		selectedId={selectedBankId}
																		selectedLabel={selectedBankLabel}
																		selectedOption={selectedBankOption}
																		onSelect={handleSelectBank}
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
															) : (
																<Text className={`${helperText} mt-3 text-xs`}>{bankHelperMessage}</Text>
															)}
														</View>
													</VStack>

													<VStack className={webExpenseClassNames.fieldFull}>
														<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Categoria</Text>
														{isTagSelectionLocked ? (
															<View className={cardClassName}>
																<HStack className="items-center gap-3">
																	<View className="h-10 w-10 items-center justify-center rounded-2xl border border-yellow-400/30 bg-yellow-400/10">
																		<TagIcon
																			iconFamily={selectedTagOption?.iconFamily}
																			iconName={selectedTagOption?.iconName}
																			iconStyle={selectedTagOption?.iconStyle}
																			size={18}
																			color={isDarkMode ? '#FCD34D' : '#D97706'}
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
																isDisabled={isTagSelectDisabled}
																isDarkMode={isDarkMode}
																bodyTextClassName={bodyText}
																helperTextClassName={helperText}
																triggerClassName={fieldContainerCardClassName}
																placeholder="Selecione a categoria da despesa"
																sheetTitle="Escolha a categoria da despesa"
																emptyMessage="Nenhuma categoria de despesa disponível."
																triggerHint={tagHelperMessage}
																disabledHint={tagHelperMessage}
																accessibilityLabel="Escolher categoria de despesa"
																onCreatePress={handleOpenAddTagScreen}
																createActionLabel="Adicionar categoria de despesa"
																isCreateDisabled={isFormBusy || isTagSelectionLocked}
															/>
														)}
													</VStack>
												</View>
												{isEditing && isLoadingExisting ? (
													<Text className={`${helperText} mt-5 text-sm`}>
														Carregando informações da despesa selecionada...
													</Text>
												) : null}
												<Button
													className={`${submitButtonClassName} ${webExpenseClassNames.submit}`}
													onPress={() => void handleSubmit()}
													isDisabled={isSubmitDisabled}
												>
													{isFormBusy ? (
														<ButtonSpinner color={isDarkMode ? '#0F172A' : '#FFFFFF'} />
													) : (
														<ButtonText className={submitButtonTextClassName}>
															{isEditing ? 'Atualizar despesa' : 'Registrar despesa'}
														</ButtonText>
													)}
												</Button>
											</View>
										</View>
									</View>
							</View>
						</View>
					</View>
				</ScrollView>
				<Navigator defaultValue={1} />
			</KeyboardAvoidingView>

			<Modal isOpen={Boolean(mandatoryExpenseSuggestion)} onClose={() => setMandatoryExpenseSuggestion(null)}>
				<ModalBackdrop />
				<ModalContent className={`${webExpenseClassNames.modal} ${modalContentClassName}`}>
					<ModalHeader>
						<ModalTitle>Pagamento obrigatório pendente</ModalTitle>
						<ModalCloseButton onPress={() => setMandatoryExpenseSuggestion(null)} />
					</ModalHeader>
					<ModalBody>
						<Text className={`${bodyText} text-sm leading-5`}>
							Encontramos o gasto obrigatório pendente{' '}
							<Text className="font-semibold text-yellow-600 dark:text-yellow-400">
								“{mandatoryExpenseSuggestion?.name}” ({suggestionValue})
							</Text>
							. Deseja ir aos pagamentos obrigatórios para efetivá-lo?
						</Text>
					</ModalBody>
					<ModalFooter className="gap-3">
						<VStack className="w-full gap-3">
							<Button
								variant="outline"
								onPress={handleIgnoreSuggestion}
								isDisabled={isSubmitting}
								className={submitButtonCancelClassName}
							>
								<ButtonText>Registrar como gasto avulso</ButtonText>
							</Button>
							<Button onPress={handleGoToMandatoryExpenses} isDisabled={isSubmitting} className={submitButtonClassName}>
								<ButtonText className={submitButtonTextClassName}>Ir para pagamentos obrigatórios</ButtonText>
							</Button>
						</VStack>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</SafeAreaView>
	);
}
