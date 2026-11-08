import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import MovementFormStatus from '@/components/uiverse/transactions/movement-form-status';
import { useMovementFormEntry } from '@/hooks/useMovementFormEntry';

import { toFinancialCivilDate } from '@/utils/financialCivilDate';

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

import { Button,ButtonSpinner,ButtonText } from '@/components/ui/button';
import {
Checkbox,
CheckboxIcon,
CheckboxIndicator,
CheckboxLabel,
} from '@/components/ui/checkbox';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { CheckIcon,CircleIcon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { Input,InputField } from '@/components/ui/input';
import {
Popover,
PopoverBackdrop,
PopoverBody,
PopoverContent,
} from '@/components/ui/popover';
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

import LoginWallpaper from '@/assets/Background/wallpaper01.png';

import type { TagIconFamily,TagIconSelection,TagIconStyle } from '@/hooks/useTagIcons';
import { TagIcon } from '@/hooks/useTagIcons';
import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import { APP_ROUTE_PATHS,navigateToHomeDashboard,navigateToRoute } from '@/utils/navigation';
import {
type TagUsageType
} from '@/utils/tagUsage';
import { Info } from 'lucide-react-native';

import { LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { useScreenStyles } from '@/hooks/useScreenStyle';

import AddGainIllustration from '../../assets/UnDraw/addRegisterGainScreen.svg';

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
type FocusableInputKey = 'gain-name' | 'gain-value' | 'gain-explanation';
type GainMoneyFormatRadioValue = 'Recebimento em Banco' | 'Recebimento em Dinheiro';

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

export default function AddRegisterGainScreen() {

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
		submitButtonClassName,
		heroHeight,
		infoCardStyle,
		insets,
		switchRadioClassName,
		switchRadioIndicatorClassName,
		switchRadioIconClassName,
		switchRadioLabelClassName,
		checkboxClassName,
		checkboxIndicatorClassName,
		checkboxIndicatorCheckedClassName,
		checkboxIndicatorCheckedStyle,
		checkboxIconClassName,
		checkboxLabelClassName,
		checkboxLabelCheckedClassName,
	} = useScreenStyles();

	const [gainName, setGainName] = React.useState('');
	const [gainValueDisplay, setGainValueDisplay] = React.useState('');
	const [gainValueCents, setGainValueCents] = React.useState<number | null>(null);
	const [gainDate, setGainDate] = React.useState(formatDateToBR(toFinancialCivilDate(new Date())));

	const [tags] = React.useState<OptionItem[]>([]);
	const [banks] = React.useState<OptionItem[]>([]);

	const [selectedTagId, setSelectedTagId] = React.useState<string | null>(null);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);

	const [isLoadingTags] = React.useState(false);
	const [isLoadingBanks] = React.useState(false);
	const [isSubmitting] = React.useState(false);

	const [paymentFormat, setPaymentFormat] = React.useState<string[]>([]);
	const [explanationGain, setExplanationGain] = React.useState<string | null>(null);

	const [moneyFormat, setMoneyFormat] = React.useState(false);

	const [selectedMovementTagName, setSelectedMovementTagName] = React.useState<string | null>(null);
	const [selectedMovementTagIcon, setSelectedMovementTagIcon] = React.useState<TagIconSelection | null>(null);
	const [selectedMovementBankName, setSelectedMovementBankName] = React.useState<string | null>(null);

	const gainNameInputRef = React.useRef<any>(null);
	const gainValueInputRef = React.useRef<any>(null);
	const gainExplanationInputRef = React.useRef<any>(null);
	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => (key === 'gain-explanation' ? 220 : 170),
		[],
	);

	const getInputRef = React.useCallback(
		(key: FocusableInputKey) => {
			switch (key) {
				case 'gain-name':
					return gainNameInputRef;
				case 'gain-value':
					return gainValueInputRef;
				case 'gain-explanation':
					return gainExplanationInputRef;
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
		minBottomPadding: 32,
	});

	const params = useLocalSearchParams<{
		gainId?: string | string[];

		templateName?: string | string[];
		templateValueInCents?: string | string[];
		templateTagId?: string | string[];
		templateDescription?: string | string[];
		templateDueDay?: string | string[];
		templateUsesBusinessDays?: string | string[];
		templateTagName?: string | string[];
		templateTagIconFamily?: string | string[];
		templateTagIconName?: string | string[];
		templateTagIconStyle?: string | string[];
		templateMandatoryGainId?: string | string[];
		templateMandatoryGainInstallmentsCount?: string | string[];
		templateLockTag?: string | string[];
		investmentIdForAdjustment?: string | string[];
		investmentDeltaInCents?: string | string[];
		templateBankId?: string | string[];
		templateBankName?: string | string[];
		templateLockBank?: string | string[];
		templateInvestmentName?: string | string[];
	}>();
	const editingGainId = React.useMemo(() => {
		const value = Array.isArray(params.gainId) ? params.gainId[0] : params.gainId;
		return value && value.trim().length > 0 ? value : null;
	}, [params.gainId]);
	const isEditing = Boolean(editingGainId);
	const { record: existingMovement, loading: isLoadingExisting, ready: isMovementReady, error: movementLoadError, retry: retryMovementLoad } = useMovementFormEntry();

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
		const mandatoryGainId = decodeParam(params.templateMandatoryGainId);
		const installmentsToAdvance = parseNumberParam(params.templateMandatoryGainInstallmentsCount);
		const lockTagParam = decodeParam(params.templateLockTag);
		const investmentAdjustmentId = decodeParam(params.investmentIdForAdjustment);
		const investmentDelta = parseNumberParam(params.investmentDeltaInCents);
		const bankId = decodeParam(params.templateBankId);
		const bankName = decodeParam(params.templateBankName);
		const lockBankParam = decodeParam(params.templateLockBank);
		const investmentName = decodeParam(params.templateInvestmentName);

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
			typeof mandatoryGainId === 'undefined'
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
			mandatoryGainId,
			installmentsToAdvance,
			lockTag: lockTagParam === '1',
			investmentAdjustmentId,
			investmentDeltaInCents: typeof investmentDelta === 'number' ? investmentDelta : undefined,
			bankId,
			bankName,
			lockBank: lockBankParam === '1',
			investmentNameSnapshot: investmentName,
		};
	}, [
		params.templateDescription,
		params.templateDueDay,
		params.templateUsesBusinessDays,
		params.templateTagIconFamily,
		params.templateTagIconName,
		params.templateTagIconStyle,
		params.templateLockTag,
		params.templateTagName,
		params.templateMandatoryGainId,
		params.templateMandatoryGainInstallmentsCount,
		params.templateName,
		params.templateTagId,
		params.templateValueInCents,
		params.investmentDeltaInCents,
		params.investmentIdForAdjustment,
		params.templateBankId,
		params.templateBankName,
		params.templateLockBank,
		params.templateInvestmentName,
	]);

	const [hasAppliedTemplate, setHasAppliedTemplate] = React.useState(false);
	const linkedMandatoryGainId = React.useMemo(
		() => (templateData?.mandatoryGainId ? templateData.mandatoryGainId : null),
		[templateData],
	);
	const templateTagDisplayName = templateData?.tagName ?? null;
	const isTemplateLocked = Boolean(linkedMandatoryGainId && !isEditing);
	const isTagSelectionLocked = isTemplateLocked || Boolean(templateData?.lockTag);
	const isBankSelectionLocked = Boolean(templateData?.lockBank || templateData?.bankId);
	const shouldShowPaymentFormatSelection = !isTemplateLocked;
	const lockedBankName = React.useMemo(() => {
		if (selectedMovementBankName) {
			return selectedMovementBankName;
		}
		if (templateData?.bankName) {
			return templateData.bankName;
		}
		const targetId = selectedBankId ?? templateData?.bankId ?? null;
		if (targetId) {
			const matched = banks.find(bank => bank.id === targetId);
			if (matched?.name) {
				return matched.name;
			}
		}
		return 'Banco não encontrado';
	}, [banks, selectedBankId, selectedMovementBankName, templateData]);
	const parsedGainDate = React.useMemo(() => parseDateFromBR(gainDate), [gainDate]);
	const isBankSelectionRequired = isBankSelectionLocked ? true : !moneyFormat;
	const isFormBusy = isLoadingExisting || isSubmitting || !isMovementReady;
	const isGainFormatPendingSelection =
		shouldShowPaymentFormatSelection && paymentFormat.length === 0;
	const isSubmitDisabled =
		isFormBusy ||
		!gainName.trim() ||
		gainValueCents === null ||
		isGainFormatPendingSelection ||
		!selectedTagId ||
		(isBankSelectionRequired && !selectedBankId) ||
		!parsedGainDate;
	const isBankFieldPrerequisitesIncomplete =
		gainName.trim().length === 0 ||
		gainValueCents === null ||
		gainValueCents === 0 ||
		!parsedGainDate ||
		isGainFormatPendingSelection;
	const isExplanationDisabled = gainName.trim().length === 0 || gainValueCents === null || isFormBusy;
	const isMoneyFormatSelectionDisabled =
		isFormBusy || isBankSelectionLocked || isGainFormatPendingSelection;
	const isBankSelectDisabled =
		isLoadingBanks || banks.length === 0 || isFormBusy || isBankFieldPrerequisitesIncomplete;
	const isVariablePaymentFormatSelected = paymentFormat.includes('Variable');
	const isExternalPaymentFormatSelected = paymentFormat.includes('External');
	const valuesRadioMoneyFormat: GainMoneyFormatRadioValue =
		isBankSelectionLocked || !moneyFormat ? 'Recebimento em Banco' : 'Recebimento em Dinheiro';
	const isTagFieldPrerequisitesIncomplete =
		gainName.trim().length === 0 ||
		gainValueCents === null ||
		gainValueCents === 0 ||
		!parsedGainDate ||
		isGainFormatPendingSelection ||
		(isBankSelectionRequired && !selectedBankId);
	const isTagSelectDisabled =
		isLoadingTags || isFormBusy || isTagFieldPrerequisitesIncomplete;
	const isAddTagButtonDisabled = isFormBusy || isTagSelectionLocked;

	React.useEffect(() => {
		if (!templateData) {
			setHasAppliedTemplate(false);
		}
	}, [templateData]);

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

	const handleRadioMoneyFormatChange = React.useCallback(
		(nextValue: GainMoneyFormatRadioValue) => {
			if (isBankSelectionLocked) {
				return;
			}

			const isMoneyReceipt = nextValue === 'Recebimento em Dinheiro';
			setMoneyFormat(isMoneyReceipt);

			if (isMoneyReceipt) {
				setSelectedBankId(null);
				setSelectedMovementBankName(null);
			}
		},
		[isBankSelectionLocked],
	);
	const handlePaymentFormatChange = React.useCallback((format: string, isSelected: boolean) => {
		setPaymentFormat(isSelected ? [format] : []);
	}, []);
	const handleOpenAddTagScreen = React.useCallback(() => {
		if (isAddTagButtonDisabled) {
			return;
		}

		navigateToRoute(APP_ROUTE_PATHS.addRegisterTag, {
			placement: 'gain',
			returnAfterCreate: '1',
			returnToRoute: APP_ROUTE_PATHS.addRegisterGain,
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
		if (hasAppliedTemplate || isEditing || !templateData) {
			return;
		}

		if (templateData.name) {
			setGainName(templateData.name);
		}

		if (typeof templateData.valueInCents === 'number' && templateData.valueInCents > 0) {
			setGainValueCents(templateData.valueInCents);
			setGainValueDisplay(formatCurrencyBRL(templateData.valueInCents));
		}

		if (typeof templateData.dueDay === 'number') {
			setGainDate(getSuggestedDateByDueDay(templateData.dueDay, templateData.usesBusinessDays));
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
			setExplanationGain(templateData.description ?? null);
		}

		if (templateData.bankId) {
			setSelectedBankId(templateData.bankId);
		}

		if (templateData.bankName) {
			setSelectedMovementBankName(templateData.bankName);
		}

		setMoneyFormat(false);
		setHasAppliedTemplate(true);
	}, [hasAppliedTemplate, isEditing, templateData]);

	const handleValueChange = React.useCallback((input: string) => {
		const digitsOnly = input.replace(/\D/g, '');
		if (!digitsOnly) {
			setGainValueDisplay('');
			setGainValueCents(null);
			return;
		}

		const centsValue = parseInt(digitsOnly, 10);
		setGainValueDisplay(formatCurrencyBRL(centsValue));
		setGainValueCents(centsValue);
	}, []);

	const handleSubmit = React.useCallback(async () => { showFeatureUnavailable(); }, []);

	React.useEffect(() => {
		if (!existingMovement) return;
		const data = existingMovement;
		const value = typeof data.valueInCents === 'number' ? data.valueInCents : 0;
		setGainName(typeof data.name === 'string' ? data.name : '');
		setGainValueCents(value);
		setGainValueDisplay(formatCurrencyBRL(value));

		const normalizedDate = normalizeDateValue(data.date) ?? new Date();
		setGainDate(formatDateToBR(normalizedDate));

		setSelectedTagId(typeof data.tagId === 'string' ? data.tagId : null);
		setSelectedBankId(typeof data.bankId === 'string' ? data.bankId : null);

		if (Array.isArray(data.paymentFormats)) {
			const validFormats = (data.paymentFormats as unknown[]).filter(item => typeof item === 'string') as string[];
			setPaymentFormat(validFormats);
		} else {
			setPaymentFormat([]);
		}

		setExplanationGain(typeof data.explanation === 'string' ? data.explanation : null);
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
		return matchedBank?.name ?? selectedMovementBankName ?? templateData?.bankName ?? null;
	}, [banks, selectedBankId, selectedMovementBankName, templateData?.bankName]);
	const selectedBankOption = React.useMemo(() => {
		const matchedBank = banks.find(bank => bank.id === selectedBankId);
		if (matchedBank) {
			return matchedBank;
		}

		if (selectedBankId && selectedBankLabel) {
			return {
				id: selectedBankId,
				name: selectedBankLabel,
			};
		}

		return null;
	}, [banks, selectedBankId, selectedBankLabel]);
	const selectedTagIconColor = isDarkMode ? '#FCD34D' : '#D97706';
	const selectedTagIconContainerClassName = isDarkMode
		? 'border border-slate-800'
		: 'border border-slate-200';

	const screenTitle = 'Registro de Ganho';

	return (
		<SafeAreaView
			className="flex-1"
			edges={['left', 'right', 'bottom']}
			style={{ backgroundColor: surfaceBackground }}
		>
			<StatusBar
				translucent
				backgroundColor="transparent"
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
								alt="Background da tela de registro de ganho"
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
								<AddGainIllustration width="40%" height="40%" className="opacity-90" />
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
									<Text className={LUMUS_FORM_CLASS_NAMES.label}>Nome do ganho</Text>
									<Input className={fieldContainerClassName} isDisabled={isTemplateLocked || isFormBusy}>
										<InputField
											ref={gainNameInputRef}
											placeholder="Digite o nome do ganho"
											keyboardType="default"
											autoCapitalize="sentences"
											autoCorrect={false}
											returnKeyType="next"
											className={inputField}
											value={gainName}
											onChangeText={setGainName}
											onFocus={() => handleInputFocus('gain-name')}
											onSubmitEditing={() => gainValueInputRef.current?.focus?.()}
										/>
									</Input>
								</VStack>

								<VStack className="mb-4">
									<Text className={LUMUS_FORM_CLASS_NAMES.label}>Valor do ganho</Text>
									<Input className={fieldContainerClassName} isDisabled={gainName.trim().length === 0}>
										<InputField
											ref={gainValueInputRef}
											placeholder="Digite o valor do ganho"
											keyboardType="numeric"
											autoCapitalize="none"
											autoCorrect={false}
											returnKeyType="next"
											className={inputField}
											value={gainValueDisplay}
											onChangeText={handleValueChange}
											onFocus={() => handleInputFocus('gain-value')}
										/>
									</Input>
								</VStack>

								<VStack className="mb-4">
									<Text className={LUMUS_FORM_CLASS_NAMES.label}>Data do ganho</Text>
									<DatePickerField
										value={gainDate}
										onChange={setGainDate}
										triggerClassName={fieldContainerClassName}
										inputClassName={inputField}
										placeholder="Selecione a data do ganho"
										isDisabled={isFormBusy || gainValueCents === null || gainValueCents === 0 || gainName.trim().length === 0}
									/>
								</VStack>

								<VStack className="mb-4">
									<HStack className="mb-2 ml-1 items-center gap-2">
										<Text className={LUMUS_FORM_CLASS_NAMES.inlineLabel}>Observação do ganho</Text>
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
													accessibilityLabel="Informações sobre a observação do ganho"
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
														Campo opcional. Use para registrar detalhes que ajudem a identificar
														esse ganho, como origem, cliente, contexto ou alguma observação útil.
													</Text>
												</PopoverBody>
											</PopoverContent>
										</Popover>
									</HStack>
									<Textarea className={textareaContainerClassName} isDisabled={isExplanationDisabled}>
										<TextareaInput
											ref={gainExplanationInputRef}
											placeholder="Adicione uma descrição ou observação para este ganho"
											className={`${inputField} pt-2`}
											value={explanationGain ?? ''}
											onChangeText={setExplanationGain}
											onFocus={() => handleInputFocus('gain-explanation')}
											editable={!isExplanationDisabled}
										/>
									</Textarea>
								</VStack>

								{shouldShowPaymentFormatSelection && (
									<VStack className="mb-4">
										<HStack className="mb-2 ml-1 items-center gap-2">
											<Text className={LUMUS_FORM_CLASS_NAMES.inlineLabel}>Formato do ganho</Text>
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
														accessibilityLabel="Informações sobre o formato do ganho"
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
															Selecione se este ganho representa uma renda variável ou um
															pagamento externo. Essa escolha libera os demais campos de
															detalhamento do registro.
														</Text>
													</PopoverBody>
												</PopoverContent>
											</Popover>
										</HStack>
										<View className={`${fieldContainerCardClassName} px-4 py-3`}>
											<HStack space="2xl">
												<Checkbox
													value="Variable"
													isChecked={isVariablePaymentFormatSelected}
													onChange={isSelected => handlePaymentFormatChange('Variable', isSelected)}
													className={checkboxClassName}
													isDisabled={
														gainName.trim().length === 0 ||
														gainValueCents === null ||
														gainValueCents === 0 ||
														isFormBusy ||
														isExternalPaymentFormatSelected
													}
												>
													<CheckboxIndicator
														className={`${checkboxIndicatorClassName} ${
															isVariablePaymentFormatSelected ? checkboxIndicatorCheckedClassName : ''
														}`.trim()}
														style={isVariablePaymentFormatSelected ? checkboxIndicatorCheckedStyle : undefined}
													>
														<CheckboxIcon as={CheckIcon} className={checkboxIconClassName} />
													</CheckboxIndicator>
													<CheckboxLabel
														className={`${checkboxLabelClassName} ${
															isVariablePaymentFormatSelected ? checkboxLabelCheckedClassName : ''
														} text-sm`.trim()}
													>
														Renda variável
													</CheckboxLabel>
												</Checkbox>
												<Checkbox
													value="External"
													isChecked={isExternalPaymentFormatSelected}
													onChange={isSelected => handlePaymentFormatChange('External', isSelected)}
													className={checkboxClassName}
													isDisabled={
														gainName.trim().length === 0 ||
														gainValueCents === null ||
														gainValueCents === 0 ||
														isFormBusy ||
														isVariablePaymentFormatSelected
													}
												>
													<CheckboxIndicator
														className={`${checkboxIndicatorClassName} ${
															isExternalPaymentFormatSelected ? checkboxIndicatorCheckedClassName : ''
														}`.trim()}
														style={isExternalPaymentFormatSelected ? checkboxIndicatorCheckedStyle : undefined}
													>
														<CheckboxIcon as={CheckIcon} className={checkboxIconClassName} />
													</CheckboxIndicator>
													<CheckboxLabel
														className={`${checkboxLabelClassName} ${
															isExternalPaymentFormatSelected ? checkboxLabelCheckedClassName : ''
														} text-sm`.trim()}
													>
														Pagamento externo
													</CheckboxLabel>
												</Checkbox>
											</HStack>
										</View>
									</VStack>
								)}

								<VStack className="mb-4">
									<HStack className="mb-2 ml-1 items-center gap-2">
										<Text className={LUMUS_FORM_CLASS_NAMES.inlineLabel}>Formato de recebimento</Text>
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
													accessibilityLabel="Informações sobre o formato de recebimento"
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
														Selecione o formato de recebimento deste ganho. Caso seja em
														dinheiro, ele não ficará vinculado a nenhum banco. Caso seja em banco,
														selecione onde esse valor foi recebido para manter seus registros
														organizados.
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
													value="Recebimento em Banco"
													className={switchRadioClassName}
													isDisabled={isMoneyFormatSelectionDisabled}
												>
													<RadioIndicator className={switchRadioIndicatorClassName}>
														<RadioIcon as={CircleIcon} className={switchRadioIconClassName} />
													</RadioIndicator>
													<RadioLabel className={`${switchRadioLabelClassName} text-sm`}>
														Recebimento em Banco
													</RadioLabel>
												</Radio>
												<Radio
													value="Recebimento em Dinheiro"
													className={switchRadioClassName}
													isDisabled={isMoneyFormatSelectionDisabled}
												>
													<RadioIndicator className={switchRadioIndicatorClassName}>
														<RadioIcon as={CircleIcon} className={switchRadioIconClassName} />
													</RadioIndicator>
													<RadioLabel className={`${switchRadioLabelClassName} text-sm`}>
														Recebimento em Dinheiro
													</RadioLabel>
												</Radio>
											</HStack>
										</RadioGroup>

										{valuesRadioMoneyFormat === 'Recebimento em Banco' && isBankSelectionLocked ? (
											<VStack className="mt-4">
												<Text className={LUMUS_FORM_CLASS_NAMES.label}>Banco</Text>
												<View className={`${fieldContainerCardClassName} px-4 py-3`}>
													<Text className={`${bodyText} text-sm`}>
														{lockedBankName ?? selectedBankLabel ?? 'Banco definido automaticamente'}
													</Text>
												</View>
											</VStack>
										) : valuesRadioMoneyFormat === 'Recebimento em Banco' ? (
											<VStack className="mt-4">
												<Text className={LUMUS_FORM_CLASS_NAMES.label}>Banco</Text>
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
													sheetTitle="Escolha o banco do ganho"
													emptyMessage="Nenhum banco disponível."
													triggerHint="Escolha onde essa entrada foi lançada."
													disabledHint={
														isLoadingBanks
															? 'Carregando bancos disponíveis...'
															: banks.length === 0
																? 'Cadastre um banco para vincular este ganho.'
																: 'Preencha os campos anteriores para liberar o banco.'
													}
													accessibilityLabel="Selecionar banco do ganho"
												/>
											</VStack>
										) : null}
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
											isDisabled={isTagSelectDisabled}
											isDarkMode={isDarkMode}
											bodyTextClassName={bodyText}
											helperTextClassName={helperText}
											triggerClassName={fieldContainerCardClassName}
											placeholder="Selecione a categoria do ganho"
											sheetTitle="Escolha a categoria do ganho"
											emptyMessage="Nenhuma categoria de ganho disponível."
											accessibilityLabel="Escolher categoria de ganho"
											onCreatePress={handleOpenAddTagScreen}
											createActionLabel="Adicionar categoria de ganho"
											isCreateDisabled={isAddTagButtonDisabled}
										/>
									)}
								</VStack>

								<MovementFormStatus loading={isLoadingExisting} error={movementLoadError} onRetry={retryMovementLoad} />

								<Button
									className={submitButtonClassName}
									onPress={handleSubmit}
									isDisabled={isSubmitDisabled}
								>
									{isSubmitting || isLoadingExisting ? (
										<ButtonSpinner />
									) : (
										<ButtonText>{isEditing ? 'Atualizar ganho' : 'Registrar ganho'}</ButtonText>
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
			</View>
		</SafeAreaView>
	);
}
