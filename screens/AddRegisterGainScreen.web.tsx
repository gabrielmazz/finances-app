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
import {
	Popover,
	PopoverBackdrop,
	PopoverBody,
	PopoverContent,
} from '@/components/ui/popover';
import {
	Radio,
	RadioGroup,
	RadioIndicator,
	RadioIcon,
	RadioLabel,
} from '@/components/ui/radio';
import { CheckIcon, CircleIcon } from '@/components/ui/icon';
import { VStack } from '@/components/ui/vstack';
import {
	Checkbox,
	CheckboxGroup,
	CheckboxIndicator,
	CheckboxIcon,
	CheckboxLabel,
} from '@/components/ui/checkbox';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import Navigator from '@/components/uiverse/navigator';
import DatePickerField from '@/components/uiverse/date-picker';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import BankActionsheetSelector, { type BankActionsheetOption } from '@/components/uiverse/bank-actionsheet-selector';
import TagActionsheetSelector, { type TagActionsheetOption } from '@/components/uiverse/tag-actionsheet-selector';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { getAllBanksFirebase } from '@/functions/BankFirebase';
import { getAllTagsFirebase, getTagDataFirebase } from '@/functions/TagFirebase';
import { addGainFirebase, getGainDataFirebase, updateGainFirebase } from '@/functions/GainFirebase';
import { markMandatoryGainReceiptFirebase } from '@/functions/MandatoryGainFirebase';
import { suppressMandatoryGainNotificationCycle } from '@/utils/mandatoryGainNotifications';
import { getCycleKeyFromDate } from '@/utils/mandatoryExpenses';
import { adjustFinanceInvestmentValueFirebase } from '@/functions/FinancesFirebase';
import { clearPendingCreatedTag, peekPendingCreatedTag } from '@/utils/pendingCreatedTag';
import { APP_ROUTE_PATHS, navigateToHomeDashboard, navigateToRoute } from '@/utils/navigation';
import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import {
	isTagVisibleInRegularUsageList,
	normalizeTagUsageType,
	tagSupportsUsage,
	type TagUsageType,
} from '@/utils/tagUsage';
import { Info } from 'lucide-react';
import { TagIcon } from '@/hooks/useTagIcons';
import type { TagIconFamily, TagIconSelection, TagIconStyle } from '@/hooks/useTagIcons';

import AnimatedContent from '@/components/web/AnimatedContent';
import Grainient from '@/components/web/Grainient';
import StrokeText from '@/components/web/StrokeText';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';

import AddGainIllustration from '../assets/UnDraw/addRegisterGainScreen.svg';

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

const mergeDateWithCurrentTime = (date: Date) => {
	const now = new Date();
	const dateWithTime = new Date(date);
	dateWithTime.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
	return dateWithTime;
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
	
	const { width } = useWindowDimensions();
	const isDesktop = width >= 1024;
	const compact = width < 720;
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
		submitButtonTextClassName,
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
		webDashboardClassNames,
		webExpenseClassNames,
	} = useScreenStyles();

	const [gainName, setGainName] = React.useState('');
	const [gainValueDisplay, setGainValueDisplay] = React.useState('');
	const [gainValueCents, setGainValueCents] = React.useState<number | null>(null);
	const [gainDate, setGainDate] = React.useState(formatDateToBR(new Date()));

	const [tags, setTags] = React.useState<OptionItem[]>([]);
	const [banks, setBanks] = React.useState<OptionItem[]>([]);

	const [selectedTagId, setSelectedTagId] = React.useState<string | null>(null);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);

	const [isLoadingTags, setIsLoadingTags] = React.useState(false);
	const [isLoadingBanks, setIsLoadingBanks] = React.useState(false);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isLoadingExisting, setIsLoadingExisting] = React.useState(false);

	const [paymentFormat, setPaymentFormat] = React.useState<string[]>([]);
	const [explanationGain, setExplanationGain] = React.useState<string | null>(null);

	const [moneyFormat, setMoneyFormat] = React.useState(false);

	const [selectedMovementTagName, setSelectedMovementTagName] = React.useState<string | null>(null);
	const [selectedMovementTagIcon, setSelectedMovementTagIcon] = React.useState<TagIconSelection | null>(null);
	const [selectedMovementBankName, setSelectedMovementBankName] = React.useState<string | null>(null);
	const submitLockRef = React.useRef(false);
	const applyPostSubmitBehavior = usePostSubmitBehavior('addRegisterGain');
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
	const pendingInvestmentAdjustment = React.useMemo(() => {
		if (isEditing) {
			return null;
		}
		if (
			templateData?.investmentAdjustmentId &&
			typeof templateData.investmentDeltaInCents === 'number' &&
			templateData.investmentDeltaInCents !== 0
		) {
			return {
				investmentId: templateData.investmentAdjustmentId,
				deltaInCents: templateData.investmentDeltaInCents,
			};
		}
		return null;
	}, [isEditing, templateData]);
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
	const isFormBusy = isLoadingExisting || isSubmitting;
	const isSubmitDisabled =
		isFormBusy ||
		!gainName.trim() ||
		gainValueCents === null ||
		!selectedTagId ||
		(isBankSelectionRequired && !selectedBankId) ||
		!parsedGainDate;
	const isGainFormatPendingSelection =
		shouldShowPaymentFormatSelection && paymentFormat.length === 0;
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

	const showSuccessfulGainNotification = React.useCallback((isUpdating = false) => {
		const normalizedGainName = gainName.trim() || 'informado';
		const resolvedBankName =
			selectedMovementBankName ??
			templateData?.bankName ??
			banks.find(bank => bank.id === selectedBankId)?.name ??
			null;
		const destinationLabel = isBankSelectionRequired
			? resolvedBankName
				? `no banco ${resolvedBankName}`
				: 'no banco selecionado'
			: 'como recebimento em dinheiro';

		showNotifierAlert({
			title: isUpdating ? 'Ganho atualizado' : 'Ganho registrado',
			description: `O ganho "${normalizedGainName}" foi ${isUpdating ? 'atualizado' : 'registrado'} com sucesso ${destinationLabel}.`,
			type: 'success',
			isDarkMode,
			duration: 4000,
		});
	}, [banks, gainName, isBankSelectionRequired, isDarkMode, selectedBankId, selectedMovementBankName, templateData?.bankName]);

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

	useFocusEffect(
		React.useCallback(() => {
			let isMounted = true;

			const loadOptions = async () => {
				setIsLoadingTags(true);
				setIsLoadingBanks(true);

				try {
					const [tagsResult, banksResult] = await Promise.all([
						getAllTagsFirebase(),
						getAllBanksFirebase(),
					]);

					if (!isMounted) {
						return;
					}

					if (tagsResult.success && Array.isArray(tagsResult.data)) {
						const formattedTags = tagsResult.data
							.filter((tag: any) =>
								isTagVisibleInRegularUsageList(tag, 'gain', {
									allowUndefinedUsageType: true,
								}),
							)
							.map((tag: any) => ({
								id: tag.id,
								name: tag.name,
								usageType: normalizeTagUsageType(tag?.usageType),
								iconFamily: typeof tag?.iconFamily === 'string' ? tag.iconFamily : null,
								iconName: typeof tag?.iconName === 'string' ? tag.iconName : null,
								iconStyle: typeof tag?.iconStyle === 'string' ? tag.iconStyle : null,
							}));
						const pendingCreatedTag = peekPendingCreatedTag();
						const matchingPendingTag =
							pendingCreatedTag && tagSupportsUsage(pendingCreatedTag.usageType, 'gain')
								? formattedTags.find(tag => tag.id === pendingCreatedTag.tagId) ?? null
								: null;

						setTags(formattedTags);
						if (matchingPendingTag) {
							setSelectedTagId(matchingPendingTag.id);
							setSelectedMovementTagName(matchingPendingTag.name);
							setSelectedMovementTagIcon({
								iconFamily: matchingPendingTag.iconFamily ?? null,
								iconName: matchingPendingTag.iconName ?? null,
								iconStyle: matchingPendingTag.iconStyle ?? null,
							});
							clearPendingCreatedTag(matchingPendingTag.id);
						} else {
							setSelectedTagId(current => {
								if (current && formattedTags.some(tag => tag.id === current)) {
									return current;
								}
								if ((isTemplateLocked || templateData?.lockTag) && templateData?.tagId) {
									return templateData.tagId;
								}
								return null;
							});
						}

						if (formattedTags.length === 0) {
							showNotifierAlert({
								title: 'Nenhuma tag de ganhos disponível',
								description: 'Cadastre uma tag marcada como ganho.',
								type: 'warn',
								isDarkMode,
								duration: 4000,
							});
						}
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
							name:
								typeof bank?.name === 'string' && bank.name.trim().length > 0
									? bank.name.trim()
									: 'Banco sem nome',
							iconKey: typeof bank?.iconKey === 'string' ? bank.iconKey : null,
							colorHex: typeof bank?.colorHex === 'string' ? bank.colorHex : null,
						}));

						setBanks(formattedBanks);
						setSelectedBankId(current => {
							const desiredId = current ?? templateData?.bankId ?? null;
							if (desiredId && (formattedBanks.some(bank => bank.id === desiredId) || isBankSelectionLocked)) {
								return desiredId;
							}
							return null;
						});
						setSelectedMovementBankName(currentName => {
							if (currentName) {
								return currentName;
							}
							if (templateData?.bankName) {
								return templateData.bankName;
							}
							const desiredId = templateData?.bankId ?? null;
							const matched = desiredId ? formattedBanks.find(bank => bank.id === desiredId) : null;
							return matched?.name ?? null;
						});
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
					console.error('Erro ao carregar opções de ganhos:', error);
					showNotifierAlert({
						title: 'Erro ao carregar dados',
						description: 'Erro inesperado ao carregar dados. Tente novamente mais tarde.',
						type: 'error',
						isDarkMode,
						duration: 4000,
					});
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
		}, [isBankSelectionLocked, isDarkMode, isTemplateLocked, templateData?.bankId, templateData?.bankName, templateData?.tagId]),
	);

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

	const resetNewGainForm = React.useCallback(() => {
		setGainName('');
		setGainValueDisplay('');
		setGainValueCents(null);
		setGainDate(formatDateToBR(new Date()));
		setSelectedTagId(null);
		setSelectedBankId(null);
		setPaymentFormat([]);
		setExplanationGain(null);
		setMoneyFormat(false);
		setSelectedMovementTagName(null);
		setSelectedMovementTagIcon(null);
		setSelectedMovementBankName(null);
	}, []);

	const handleSubmit = React.useCallback(async () => {
		if (submitLockRef.current || isSubmitting) {
			return;
		}

		if (!gainName.trim()) {
			showNotifierAlert({
				title: 'Erro ao registrar ganho',
				description: 'Informe o nome do ganho.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (gainValueCents === null) {
			showNotifierAlert({
				title: 'Erro ao registrar ganho',
				description: 'Informe o valor do ganho.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (gainValueCents <= 0) {
			showNotifierAlert({
				title: 'Erro ao registrar ganho',
				description: 'Informe um valor maior que zero para o ganho.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (shouldShowPaymentFormatSelection && paymentFormat.length === 0) {
			showNotifierAlert({
				title: 'Erro ao registrar ganho',
				description: 'Selecione o formato do ganho antes de continuar.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (!selectedTagId) {
			showNotifierAlert({
				title: 'Erro ao registrar ganho',
				description: 'Selecione uma tag.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (isBankSelectionRequired && !selectedBankId) {
			showNotifierAlert({
				title: 'Erro ao registrar ganho',
				description: 'Selecione um banco.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (!gainDate) {
			showNotifierAlert({
				title: 'Erro ao registrar ganho',
				description: 'Informe a data do ganho.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (!parsedGainDate) {
			showNotifierAlert({
				title: 'Erro ao registrar ganho',
				description: 'Informe uma data válida (DD/MM/AAAA).',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		const dateWithCurrentTime = mergeDateWithCurrentTime(parsedGainDate);

		submitLockRef.current = true;
		setIsSubmitting(true);

		try {
			const personId = auth.currentUser?.uid;

			if (!personId) {
				showNotifierAlert({
					title: 'Erro ao registrar ganho',
					description: 'Não foi possível identificar o usuário atual.',
					type: 'error',
					isDarkMode,
					duration: 4000,
				});
				setIsSubmitting(false);
				return;
			}

			if (isEditing && editingGainId) {
				const result = await updateGainFirebase({
					gainId: editingGainId,
					name: gainName.trim(),
					valueInCents: gainValueCents,
					paymentFormats: paymentFormat,
					explanation: explanationGain?.trim() ? explanationGain.trim() : null,
					moneyFormat,
					tagId: selectedTagId ?? undefined,
					bankId: isBankSelectionRequired ? selectedBankId ?? null : null,
					date: dateWithCurrentTime,
				});

				if (!result.success) {
					showNotifierAlert({
						title: 'Erro ao atualizar ganho',
						description: 'Tente novamente mais tarde.',
						type: 'error',
						isDarkMode,
						duration: 4000,
					});
					return;
				}

				showSuccessfulGainNotification(true);
				applyPostSubmitBehavior({ isEditing: true });
				return;
			}

			const result = await addGainFirebase({
				name: gainName.trim(),
				valueInCents: gainValueCents,
				paymentFormats: paymentFormat,
				explanation: explanationGain?.trim() ? explanationGain.trim() : null,
				moneyFormat,
				tagId: selectedTagId as string,
				bankId: isBankSelectionRequired ? selectedBankId : null,
				date: dateWithCurrentTime,
				personId,
				isInvestmentRedemption:
					(pendingInvestmentAdjustment?.deltaInCents ?? 0) < 0,
				investmentId: pendingInvestmentAdjustment?.investmentId ?? null,
				investmentNameSnapshot: templateData?.investmentNameSnapshot ?? null,
			});

			if (!result.success) {
				showNotifierAlert({
					title: 'Erro ao registrar ganho',
					description: 'Tente novamente mais tarde.',
					type: 'error',
					isDarkMode,
					duration: 4000,
				});
				return;
			}

			if (linkedMandatoryGainId && result.gainId) {
				const markResult = await markMandatoryGainReceiptFirebase({
					gainTemplateId: linkedMandatoryGainId,
					receiptGainId: result.gainId,
					receiptDate: dateWithCurrentTime,
				});

				if (!markResult.success) {
					showNotifierAlert({
						title: 'Atenção ao atualizar ganho obrigatório',
						description: 'Ganho registrado, mas não foi possível atualizar o ganho obrigatório.',
						type: 'warn',
						isDarkMode,
						duration: 4000,
					});
				} else {
					try {
						await suppressMandatoryGainNotificationCycle(
							personId,
							linkedMandatoryGainId,
							getCycleKeyFromDate(dateWithCurrentTime),
						);
					} catch (error) {
						console.error('Erro ao suprimir o lembrete do ganho obrigatório recebido:', error);
					}
				}
			}

			if (pendingInvestmentAdjustment) {
				const adjustResult = await adjustFinanceInvestmentValueFirebase({
					investmentId: pendingInvestmentAdjustment.investmentId,
					deltaInCents: pendingInvestmentAdjustment.deltaInCents,
				});

				if (!adjustResult.success) {
					showNotifierAlert({
						title: 'Atenção ao atualizar investimento',
						description: 'Ganho registrado, mas não foi possível atualizar o investimento.',
						type: 'warn',
						isDarkMode,
						duration: 4000,
					});
				}
			}

			showSuccessfulGainNotification();
			applyPostSubmitBehavior({ resetForm: resetNewGainForm });
		} catch (error) {
			console.error('Erro ao registrar/atualizar ganho:', error);
			showNotifierAlert({
				title: 'Erro ao registrar ganho',
				description: 'Erro inesperado ao salvar o ganho.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
		} finally {
			submitLockRef.current = false;
			setIsSubmitting(false);
		}
		}, [
			editingGainId,
			explanationGain,
			gainDate,
			gainName,
			moneyFormat,
			gainValueCents,
			isEditing,
			isSubmitting,
			linkedMandatoryGainId,
			paymentFormat,
			selectedBankId,
			selectedTagId,
			pendingInvestmentAdjustment,
			isDarkMode,
			isBankSelectionLocked,
			shouldShowPaymentFormatSelection,
			templateData,
			parsedGainDate,
			resetNewGainForm,
			applyPostSubmitBehavior,
			showSuccessfulGainNotification,
		]);

	React.useEffect(() => {
		if (!editingGainId) {
			return;
		}

		let isMounted = true;
		setIsLoadingExisting(true);

		const loadGain = async () => {
			try {
				const response = await getGainDataFirebase(editingGainId);
				if (!isMounted) {
					return;
				}

				if (!response.success || !response.data) {
					showNotifierAlert({
						title: 'Erro ao carregar ganho',
						description: 'Não foi possível carregar os dados do ganho selecionado.',
						type: 'error',
						isDarkMode,
						duration: 4000,
					});
					return;
				}

				const data = response.data as Record<string, unknown>;
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
			} catch (error) {
				console.error('Erro ao carregar ganho para edição:', error);
				if (isMounted) {
					showNotifierAlert({
						title: 'Erro ao carregar ganho',
						description: 'Erro inesperado ao carregar os dados do ganho.',
						type: 'error',
						isDarkMode,
						duration: 4000,
					});
				}
			} finally {
				if (isMounted) {
					setIsLoadingExisting(false);
				}
			}
		};

		void loadGain();

		return () => {
			isMounted = false;
		};
	}, [editingGainId, isDarkMode]);

	React.useEffect(() => {
		const matchedTag = tags.find(tag => tag.id === selectedTagId);
		if (matchedTag) {
			setSelectedMovementTagName(matchedTag.name);
			setSelectedMovementTagIcon({
				iconFamily: matchedTag.iconFamily ?? null,
				iconName: matchedTag.iconName ?? null,
				iconStyle: matchedTag.iconStyle ?? null,
			});
			return;
		}

		if (!selectedTagId) {
			setSelectedMovementTagName(null);
			setSelectedMovementTagIcon(null);
			return;
		}

		let isMounted = true;

		const fetchTagData = async () => {
			try {
				const tagResult = await getTagDataFirebase(selectedTagId);

				if (!isMounted) {
					return;
				}

				if (tagResult.success && tagResult.data) {
					setSelectedMovementTagName(typeof tagResult.data.name === 'string' ? tagResult.data.name : null);
					setSelectedMovementTagIcon({
						iconFamily: typeof tagResult.data.iconFamily === 'string' ? tagResult.data.iconFamily : null,
						iconName: typeof tagResult.data.iconName === 'string' ? tagResult.data.iconName : null,
						iconStyle: typeof tagResult.data.iconStyle === 'string' ? tagResult.data.iconStyle : null,
					});
					return;
				}

				setSelectedMovementTagName(null);
				setSelectedMovementTagIcon(null);
			} catch (error) {
				console.error('Erro ao buscar nome da tag:', error);
				if (isMounted) {
					setSelectedMovementTagName(null);
					setSelectedMovementTagIcon(null);
				}
			}
		};

		void fetchTagData();

		return () => {
			isMounted = false;
		};
	}, [selectedTagId, tags]);

	React.useEffect(() => {
		try {
			if (!selectedBankId || selectedMovementBankName) {
				return;
			} else {
				const fetchBankName = async () => {
					const bankResult = await getAllBanksFirebase();

					if (bankResult.success && Array.isArray(bankResult.data)) {

						const bankData: any = bankResult.data.find((bank: any) => bank.id === selectedBankId);

						if (bankData && typeof bankData.name === 'string') {
							setSelectedMovementBankName(bankData.name);
						} else {
							setSelectedMovementBankName(null);
						}
					} else {
						setSelectedMovementBankName(null);
					}
				};

				void fetchBankName();
			}
		} catch (error) {
			console.error('Erro ao buscar nome do banco:', error);
		}
	}, [selectedBankId, selectedMovementBankName]);

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

	const fieldColumn = isDesktop ? webExpenseClassNames.fieldHalf : webExpenseClassNames.fieldFull;
	const inputClassName = fieldContainerClassName + ' ' + webExpenseClassNames.fieldInput;
	const cardClassName = fieldContainerCardClassName + ' ' + webExpenseClassNames.fieldCard;
	const bankHelperMessage = isBankSelectionLocked
		? 'Este ganho está vinculado ao banco definido pelo template.'
		: moneyFormat
			? 'Recebimentos em dinheiro não ficam vinculados a banco.'
			: isLoadingBanks
				? 'Carregando bancos disponíveis...'
				: banks.length === 0
					? 'Cadastre um banco para vincular este ganho.'
					: 'Selecione onde esta entrada foi lançada.';
	const tagHelperMessage = isTagSelectionLocked
		? isTemplateLocked
			? 'Esta categoria vem do ganho obrigatório vinculado.'
			: 'Esta categoria foi definida pelo template usado como base.'
		: isLoadingTags
			? 'Carregando categorias de ganhos...'
			: tags.length === 0
				? 'Cadastre uma categoria de ganho para continuar.'
				: 'Escolha a categoria que representa esta entrada.';

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
								accessibilityLabel="Background da tela de registro de ganhos"
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
									className="add-gain-hero-grainient"
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
							<View
								className={webDashboardClassNames.heroContent}
								style={{ paddingTop: insets.top + 24, zIndex: 2 }}
							>
								<StrokeText
									text={isEditing ? 'Atualize seu ganho' : 'Registro de ganho'}
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
									<AddGainIllustration width="40%" height="100%" className="opacity-90" />
								</AnimatedContent>
							</View>
						</View>

						<View
							className={webDashboardClassNames.sheet + ' ' + (compact ? webDashboardClassNames.sheetCompact : '')}
							style={{
								marginTop: heroHeight - 64,
								backgroundColor: surfaceBackground,
								position: 'relative',
								zIndex: 3,
							}}
						>
							<View className={webDashboardClassNames.sheetInner + ' max-w-[1180px] w-full self-center'}>
								<AnimatedContent
									trigger="mount"
									distance={18}
									duration={0.55}
									delay={0.08}
									ease="power3.out"
									className="w-full"
									style={{ display: 'flex' }}
								>
									<View
										className={webExpenseClassNames.formSurface + ' ' + cardBackground + ' rounded-[28px]'}
										style={{ display: 'flex', flex: 1, flexDirection: 'column' }}
									>
										<View className={webExpenseClassNames.formScroll}>
											<View className="w-full">
												<View className={webExpenseClassNames.fieldGrid}>
													<VStack className={fieldColumn}>
														<Text className={webExpenseClassNames.fieldLabel + ' ' + bodyText}>Nome do ganho</Text>
														<Input
															isDisabled={isTemplateLocked || isFormBusy}
															className={inputClassName}
														>
															<InputField
																accessibilityLabel="Nome do ganho"
																ref={gainNameInputRef}
																placeholder="Ex.: salário, venda ou trabalho freelance…"
																autoComplete="off"
																value={gainName}
																onChangeText={setGainName}
																onFocus={() => handleInputFocus('gain-name')}
																onSubmitEditing={() => gainValueInputRef.current?.focus?.()}
																autoCapitalize="sentences"
																autoCorrect={false}
																returnKeyType="next"
																className={inputField}
															/>
														</Input>
													</VStack>

													<VStack className={fieldColumn}>
														<Text className={webExpenseClassNames.fieldLabel + ' ' + bodyText}>Valor do ganho</Text>
														<Input
															isDisabled={gainName.trim().length === 0 || isFormBusy}
															className={inputClassName}
														>
															<InputField
																accessibilityLabel="Valor do ganho"
																ref={gainValueInputRef}
																placeholder="R$ 0,00"
																autoComplete="off"
																keyboardType="numeric"
																value={gainValueDisplay}
																onChangeText={handleValueChange}
																onFocus={() => handleInputFocus('gain-value')}
																returnKeyType="next"
																className={inputField}
															/>
														</Input>
													</VStack>

													<VStack className={webExpenseClassNames.fieldFull}>
														<Text className={webExpenseClassNames.fieldLabel + ' ' + bodyText}>Data do ganho</Text>
														<DatePickerField
															accessibilityLabel="Data do ganho"
															value={gainDate}
															onChange={setGainDate}
															triggerClassName={inputClassName}
															inputClassName={inputField}
															placeholder="Selecione a data do ganho"
															isDisabled={
																isFormBusy ||
																gainValueCents === null ||
																gainValueCents === 0 ||
																gainName.trim().length === 0
															}
														/>
													</VStack>

													<VStack className={webExpenseClassNames.fieldFull}>
														<View className={webExpenseClassNames.sectionLabel}>
															<Text className={webExpenseClassNames.fieldLabel + ' ' + bodyText}>
																Observação
															</Text>
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
																		accessibilityLabel="Informações sobre a observação do ganho"
																	>
																		<Info
																			size={14}
																			color={isDarkMode ? '#94A3B8' : '#64748B'}
																		/>
																	</Pressable>
																)}
															>
																<PopoverBackdrop className="bg-transparent" />
																<PopoverContent className="max-w-[280px]" style={infoCardStyle}>
																	<PopoverBody className="px-3 py-3">
																		<Text className={bodyText + ' text-xs leading-5'}>
																			Campo opcional. Use para registrar a origem, o
																			contexto ou algum detalhe útil desta entrada.
																		</Text>
																	</PopoverBody>
																</PopoverContent>
															</Popover>
														</View>
														<Textarea
															isDisabled={isExplanationDisabled}
															className={textareaContainerClassName + ' ' + webExpenseClassNames.fieldTextarea}
														>
															<TextareaInput
																accessibilityLabel="Observação do ganho"
																ref={gainExplanationInputRef}
																placeholder="Adicione uma observação, se necessário…"
																autoComplete="off"
																value={explanationGain ?? ''}
																onChangeText={setExplanationGain}
																onFocus={() => handleInputFocus('gain-explanation')}
																editable={!isExplanationDisabled}
																className={inputField + ' pt-2'}
															/>
														</Textarea>
													</VStack>

													{shouldShowPaymentFormatSelection ? (
														<VStack className={webExpenseClassNames.fieldFull}>
															<View className={webExpenseClassNames.sectionLabel}>
																<Text className={webExpenseClassNames.fieldLabel + ' ' + bodyText}>
																	Formato do ganho
																</Text>
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
																			accessibilityLabel="Informações sobre o formato do ganho"
																		>
																			<Info
																				size={14}
																				color={isDarkMode ? '#94A3B8' : '#64748B'}
																			/>
																		</Pressable>
																	)}
																>
																	<PopoverBackdrop className="bg-transparent" />
																	<PopoverContent className="max-w-[300px]" style={infoCardStyle}>
																		<PopoverBody className="px-3 py-3">
																			<Text className={bodyText + ' text-xs leading-5'}>
																				Selecione se este ganho representa uma renda
																				variável ou um pagamento externo.
																			</Text>
																		</PopoverBody>
																	</PopoverContent>
																</Popover>
															</View>
															<View className={cardClassName + ' w-full max-w-[1120px] self-center pt-6 pb-6'}>
																<CheckboxGroup value={paymentFormat} onChange={setPaymentFormat}>
																	<View className="w-full flex-row flex-wrap gap-5">
																		<Checkbox
																			value="Variable"
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
																				className={(checkboxIndicatorClassName + ' ' + (isVariablePaymentFormatSelected ? checkboxIndicatorCheckedClassName : '')).trim()}
																				style={isVariablePaymentFormatSelected ? checkboxIndicatorCheckedStyle : undefined}
																			>
																				<CheckboxIcon as={CheckIcon} className={checkboxIconClassName} />
																			</CheckboxIndicator>
																			<CheckboxLabel
																				className={(checkboxLabelClassName + ' ' + (isVariablePaymentFormatSelected ? checkboxLabelCheckedClassName : '') + ' text-sm').trim()}
																			>
																				Renda variável
																			</CheckboxLabel>
																		</Checkbox>
																		<Checkbox
																			value="External"
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
																				className={(checkboxIndicatorClassName + ' ' + (isExternalPaymentFormatSelected ? checkboxIndicatorCheckedClassName : '')).trim()}
																				style={isExternalPaymentFormatSelected ? checkboxIndicatorCheckedStyle : undefined}
																			>
																				<CheckboxIcon as={CheckIcon} className={checkboxIconClassName} />
																			</CheckboxIndicator>
																			<CheckboxLabel
																				className={(checkboxLabelClassName + ' ' + (isExternalPaymentFormatSelected ? checkboxLabelCheckedClassName : '') + ' text-sm').trim()}
																			>
																				Pagamento externo
																			</CheckboxLabel>
																		</Checkbox>
																	</View>
																</CheckboxGroup>
															</View>
														</VStack>
													) : null}

													<VStack className={webExpenseClassNames.fieldFull}>
														<View className={webExpenseClassNames.sectionLabel}>
															<Text className={webExpenseClassNames.fieldLabel + ' ' + bodyText}>
																Formato de recebimento
															</Text>
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
																		accessibilityLabel="Informações sobre o formato de recebimento"
																	>
																		<Info
																			size={14}
																			color={isDarkMode ? '#94A3B8' : '#64748B'}
																		/>
																	</Pressable>
																)}
															>
																<PopoverBackdrop className="bg-transparent" />
																<PopoverContent className="max-w-[320px]" style={infoCardStyle}>
																	<PopoverBody className="px-3 py-3">
																		<Text className={bodyText + ' text-xs leading-5'}>
																			Escolha onde este ganho foi recebido. Em dinheiro,
																			o valor não fica vinculado a banco; em banco, selecione
																			a conta que recebeu a entrada.
																		</Text>
																	</PopoverBody>
																</PopoverContent>
															</Popover>
														</View>
														<View className={cardClassName + ' w-full max-w-[1120px] self-center pt-6 pb-6'}>
															<RadioGroup
																className="w-full max-w-[1120px] self-center"
																value={valuesRadioMoneyFormat}
																onChange={handleRadioMoneyFormatChange}
															>
																<View className="w-full flex-row flex-wrap gap-5">
																	<Radio
																		value="Recebimento em Banco"
																		className={switchRadioClassName}
																		isDisabled={isMoneyFormatSelectionDisabled}
																	>
																		<RadioIndicator className={switchRadioIndicatorClassName}>
																			<RadioIcon as={CircleIcon} className={switchRadioIconClassName} />
																		</RadioIndicator>
																		<RadioLabel className={switchRadioLabelClassName + ' ' + bodyText + ' text-sm'}>
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
																		<RadioLabel className={switchRadioLabelClassName + ' ' + bodyText + ' text-sm'}>
																			Recebimento em Dinheiro
																		</RadioLabel>
																	</Radio>
																</View>
															</RadioGroup>
															{valuesRadioMoneyFormat === 'Recebimento em Banco' ? (
																<VStack className="mt-4 w-full">
																	<Text className={webExpenseClassNames.fieldLabel + ' ' + bodyText}>Banco</Text>
																	{isBankSelectionLocked ? (
																		<View className={cardClassName}>
																			<Text className={bodyText + ' text-sm'}>
																				{lockedBankName}
																			</Text>
																		</View>
																	) : (
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
																			triggerHint={bankHelperMessage}
																			disabledHint={bankHelperMessage}
																			accessibilityLabel="Selecionar banco do ganho"
																		/>
																	)}
																</VStack>
															) : (
																<Text className={helperText + ' mt-3 text-xs'}>{bankHelperMessage}</Text>
															)}
														</View>
													</VStack>

													<VStack className={webExpenseClassNames.fieldFull}>
														<Text className={webExpenseClassNames.fieldLabel + ' ' + bodyText}>Categoria</Text>
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
																	<Text className={bodyText + ' flex-1 text-sm'}>
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
																triggerHint={tagHelperMessage}
																disabledHint={tagHelperMessage}
																accessibilityLabel="Escolher categoria de ganho"
																onCreatePress={handleOpenAddTagScreen}
																createActionLabel="Adicionar categoria de ganho"
																isCreateDisabled={isAddTagButtonDisabled}
															/>
														)}
													</VStack>
												</View>

												{isEditing && isLoadingExisting ? (
													<Text className={helperText + ' mt-5 text-sm'}>
														Carregando informações do ganho selecionado...
													</Text>
												) : null}

												<Button
													className={submitButtonClassName + ' ' + webExpenseClassNames.submit}
													onPress={() => void handleSubmit()}
													isDisabled={isSubmitDisabled}
												>
													{isFormBusy ? (
														<ButtonSpinner color={isDarkMode ? '#0F172A' : '#FFFFFF'} />
													) : (
														<ButtonText className={submitButtonTextClassName}>
															{isEditing ? 'Atualizar ganho' : 'Registrar ganho'}
														</ButtonText>
													)}
												</Button>
											</View>
										</View>
									</View>
								</AnimatedContent>
							</View>
						</View>
					</View>
				</ScrollView>
				<Navigator defaultValue={1} />
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

