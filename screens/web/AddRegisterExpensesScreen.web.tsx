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

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { Button,ButtonSpinner,ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { CircleIcon } from '@/components/ui/icon';
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
import { Radio,RadioGroup,RadioIcon,RadioIndicator,RadioLabel } from '@/components/ui/radio';
import { Textarea,TextareaInput } from '@/components/ui/textarea';
import { VStack } from '@/components/ui/vstack';
import BankActionsheetSelector,{ type BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';
import TagActionsheetSelector,{ type TagActionsheetOption } from '@/components/uiverse/categories/tag-actionsheet-selector';
import Navigator from '@/components/uiverse/navigation/navigator';
import DatePickerField from '@/components/uiverse/shared/date-picker';
import AnimatedContent from '@/components/web/motion/AnimatedContent';
import Grainient from '@/components/web/visuals/Grainient';
import StrokeText from '@/components/web/visuals/StrokeText';
import { useLocalSearchParams } from 'expo-router';
import { Info } from 'lucide-react';
import React from 'react';
import {
KeyboardAvoidingView,
Platform,
Pressable,
Image as RNImage,
ScrollView,
StatusBar,
Text,
useWindowDimensions,
View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AddExpenseIllustration from '../../assets/UnDraw/addRegisterExpanseScreen.svg';

import { useAppTheme } from '@/contexts/ThemeContext';

import { APP_ROUTE_PATHS,navigateToHomeDashboard,navigateToRoute } from '@/utils/navigation';

import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';

import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { TagIcon,type TagIconFamily,type TagIconSelection,type TagIconStyle } from '@/hooks/useTagIcons';
import {
type TagUsageType
} from '@/utils/tagUsage';

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
	const [mandatoryExpenseSuggestion, setMandatoryExpenseSuggestion] = React.useState<MandatoryExpenseSuggestion | null>(
		null,
	);
	const [, setIgnoredMandatorySuggestionKey] = React.useState<string | null>(null);
	const [valuesRadioMoneyFormat, setValuesRadioMoneyFormat] = React.useState<
		'Pagamento em Dinheiro' | 'Pagamento em Banco'
	>('Pagamento em Banco');

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
		templateMandatoryExpenseInstallmentsCount?: string | string[];
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
	const { movement: editableMovement, record: existingMovement, loading: isLoadingExisting, ready: isMovementReady, error: movementLoadError, retry: retryMovementLoad } = useMovementFormEntry(editingExpenseId);
	const templateData = React.useMemo(() => {
		const name = decodeParam(params.templateName);
		const description = decodeParam(params.templateDescription);
		const tagId = decodeParam(params.templateTagId);
		const tagName = decodeParam(params.templateTagName);
		const tagIconFamily = decodeParam(params.templateTagIconFamily);
		const tagIconName = decodeParam(params.templateTagIconName);
		const tagIconStyle = decodeParam(params.templateTagIconStyle);
		const mandatoryExpenseId = decodeParam(params.templateMandatoryExpenseId);
		const installmentsToSettle = parseNumberParam(params.templateMandatoryExpenseInstallmentsCount);
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
			installmentsToSettle,
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
		params.templateMandatoryExpenseInstallmentsCount,
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
	const isTemplateLocked = Boolean(linkedMandatoryExpenseId && !isEditing);
	const isTagSelectionLocked = isTemplateLocked || Boolean(templateData?.lockTag);
	const parsedExpenseDate = React.useMemo(() => parseDateFromBR(expenseDate), [expenseDate]);
	const isBankSelectionRequired = !moneyFormat;
	const isFormBusy = isLoadingExisting || isSubmitting || !isMovementReady;
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
		if (!existingMovement) return;
		const data = existingMovement;
		const value = typeof data.valueInCents === 'number' ? data.valueInCents : 0;
		setExpenseName(typeof data.name === 'string' ? data.name : '');
		setExpenseValueCents(value);
		setExpenseValueDisplay(formatCurrencyBRL(value));
		setExpenseDate(formatDateToBR(normalizeDateValue(data.date) ?? new Date()));
		setSelectedTagId(typeof data.tagId === 'string' ? data.tagId : null);
		setSelectedBankId(typeof data.bankId === 'string' ? data.bankId : null);
		setSelectedMovementTagName(typeof data.tagName === 'string' ? data.tagName : null);
		setSelectedMovementBankName(typeof data.bankName === 'string' ? data.bankName : null);
		setExplanationExpense(typeof data.explanation === 'string' ? data.explanation : null);
		setMoneyFormat(typeof data.moneyFormat === 'boolean' ? data.moneyFormat : false);
	}, [existingMovement]);

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
			<StatusBar barStyle="light-content" />
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
							<View className={webDashboardClassNames.sheetInner}>
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
													<View className={`${webExpenseClassNames.sectionLabel} mb-2`}>
														<Text className={`${webExpenseClassNames.fieldInlineLabel} ${bodyText}`}>Observação</Text>
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
													<View className={`${webExpenseClassNames.sectionLabel} mb-2`}>
														<Text className={`${webExpenseClassNames.fieldInlineLabel} ${bodyText}`}>Formato de pagamento</Text>
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
											<MovementFormStatus loading={isLoadingExisting} error={movementLoadError || optionsError} onRetry={() => { retryMovementLoad(); reloadTags(); void reloadBanks(); }} />
											<Button
												className={`${submitButtonClassName} ${webExpenseClassNames.submit}`}
												onPress={() => void handleSubmit()}
												isDisabled={isSubmitDisabled}
											>
												{isSubmitting || isLoadingExisting ? (
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
