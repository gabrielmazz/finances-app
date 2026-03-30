import React from 'react';
import {
	BackHandler,
	findNodeHandle,
	Keyboard,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StatusBar,
	View,
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

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
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
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
import { Text } from '@/components/ui/text';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import Navigator from '@/components/uiverse/navigator';
import DatePickerField from '@/components/uiverse/date-picker';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { useAppTheme } from '@/contexts/ThemeContext';
import { getAllBanksFirebase } from '@/functions/BankFirebase';
import { getAllTagsFirebase, getTagDataFirebase } from '@/functions/TagFirebase';
import { addGainFirebase, getGainDataFirebase, updateGainFirebase } from '@/functions/GainFirebase';
import { markMandatoryGainReceiptFirebase } from '@/functions/MandatoryGainFirebase';
import { adjustFinanceInvestmentValueFirebase } from '@/functions/FinancesFirebase';
import { clearPendingCreatedTag, peekPendingCreatedTag } from '@/utils/pendingCreatedTag';
import { Info, Tags as TagsIcon } from 'lucide-react-native';

import AddGainIllustration from '../assets/UnDraw/addRegisterGainScreen.svg';

type OptionItem = {
	id: string;
	name: string;
	usageType?: 'expense' | 'gain';
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

const clampDayToMonth = (day: number, reference: Date) => {
	const daysInMonth = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
	return Math.min(Math.max(day, 1), daysInMonth);
};

const getSuggestedDateByDueDay = (dueDay: number) => {
	const today = new Date();
	const normalizedDay = clampDayToMonth(dueDay, today);
	const date = new Date(today.getFullYear(), today.getMonth(), normalizedDay);
	return formatDateToBR(date);
};

export default function AddRegisterGainScreen() {
	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { height: windowHeight } = useWindowDimensions();

	const surfaceBackground = isDarkMode ? '#020617' : '#FFFFFF';
	const cardBackground = isDarkMode ? 'bg-slate-950' : 'bg-white';
	const bodyText = isDarkMode ? 'text-slate-300' : 'text-slate-700';
	const labelText = isDarkMode ? 'text-slate-300' : 'text-slate-700';
	const helperText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
	const inputField = isDarkMode
		? 'text-slate-100 placeholder:text-slate-500'
		: 'text-slate-900 placeholder:text-slate-500';
	const focusFieldClassName =
		'data-[focus=true]:border-[#FFE000] dark:data-[focus=true]:border-yellow-300';
	const fieldContainerClassName = `h-10 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const fieldContainerCardClassName = `rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const textareaContainerClassName =
		`h-32 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const switchRadioClassName = 'items-center gap-3';
	const switchRadioIndicatorClassName = isDarkMode
		? 'data-[checked=true]:border-yellow-300 data-[checked=true]:bg-yellow-300/20'
		: 'data-[checked=true]:border-yellow-400 data-[checked=true]:bg-yellow-100';
	const switchRadioIconClassName = isDarkMode
		? 'fill-yellow-300 text-yellow-300'
		: 'fill-yellow-500 text-yellow-500';
	const switchRadioLabelClassName = isDarkMode ? '' : '';
	const checkboxClassName = 'items-center gap-3';
	const checkboxIndicatorClassName = isDarkMode
		? 'rounded-md border-slate-500 data-[checked=true]:border-yellow-300 data-[checked=true]:bg-yellow-300'
		: 'rounded-md border-slate-300 data-[checked=true]:border-yellow-400 data-[checked=true]:bg-yellow-400';
	const checkboxIconClassName = isDarkMode ? 'text-slate-950' : 'text-white';
	const checkboxLabelClassName = isDarkMode
		? 'text-slate-300 data-[checked=true]:text-slate-100'
		: 'text-slate-700 data-[checked=true]:text-slate-900';
	const submitButtonClassName = isDarkMode
		? 'bg-yellow-300/80 text-slate-900 hover:bg-yellow-300 rounded-2xl'
		: 'bg-yellow-400 text-white hover:bg-yellow-500 rounded-2xl';
	const addTagButtonClassName = isDarkMode
		? 'h-10 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950'
		: 'h-10 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white';
	const heroHeight = Math.max(windowHeight * 0.28, 250) + insets.top;
	const infoCardStyle = React.useMemo(
		() => ({
			borderRadius: 20,
			borderWidth: 1,
			borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.14)' : 'rgba(226, 232, 240, 1)',
			backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.78)' : '#FFFFFF',
		}),
		[isDarkMode],
	);

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
	const [selectedMovementBankName, setSelectedMovementBankName] = React.useState<string | null>(null);
	const scrollViewRef = React.useRef<ScrollView | null>(null);
	const gainNameInputRef = React.useRef<any>(null);
	const gainValueInputRef = React.useRef<any>(null);
	const gainExplanationInputRef = React.useRef<any>(null);
	const lastFocusedInputKey = React.useRef<FocusableInputKey | null>(null);
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

	const scrollToInput = React.useCallback(
		(key: FocusableInputKey) => {
			const inputRef = getInputRef(key);
			if (!inputRef?.current) {
				return;
			}

			const nodeHandle = findNodeHandle(inputRef.current);
			const scrollResponder = scrollViewRef.current?.getScrollResponder?.();
			const offset = keyboardScrollOffset(key);

			if (scrollResponder && nodeHandle) {
				scrollResponder.scrollResponderScrollNativeHandleToKeyboard(nodeHandle, offset, true);
				return;
			}

			const scrollViewNode = scrollViewRef.current;
			const innerViewNode = scrollViewNode?.getInnerViewNode?.();

			if (scrollViewNode && innerViewNode && typeof inputRef.current.measureLayout === 'function') {
				inputRef.current.measureLayout(
					innerViewNode,
					(_x: number, y: number) =>
						scrollViewNode.scrollTo({
							y: Math.max(0, y - keyboardScrollOffset(key)),
							animated: true,
						}),
					() => { },
				);
			}
		},
		[getInputRef, keyboardScrollOffset],
	);

	const handleInputFocus = React.useCallback(
		(key: FocusableInputKey) => {
			lastFocusedInputKey.current = key;
			scrollToInput(key);
		},
		[scrollToInput],
	);

	React.useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';

		const showSub = Keyboard.addListener(showEvent, () => {
			const focusedKey = lastFocusedInputKey.current;
			if (focusedKey) {
				setTimeout(() => {
					scrollToInput(focusedKey);
				}, 50);
			}
		});

		return () => {
			showSub.remove();
		};
	}, [scrollToInput]);

	const params = useLocalSearchParams<{
		gainId?: string | string[];
		templateName?: string | string[];
		templateValueInCents?: string | string[];
		templateTagId?: string | string[];
		templateDescription?: string | string[];
		templateDueDay?: string | string[];
		templateTagName?: string | string[];
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
		const valueInCents = parseNumberParam(params.templateValueInCents);
		const dueDay = parseNumberParam(params.templateDueDay);
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
			valueInCents,
			dueDay,
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
		isLoadingTags || tags.length === 0 || isFormBusy || isTagFieldPrerequisitesIncomplete;
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

	useFocusEffect(
		React.useCallback(() => {
			const handleBackPress = () => {
				router.replace('/home?tab=0');
				return true;
			};
			const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
			return () => {
				subscription.remove();
			};
		}, []),
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

		Keyboard.dismiss();
		router.push({
			pathname: '/add-register-tag',
			params: {
				usageType: 'gain',
				lockUsageType: '1',
				returnAfterCreate: '1',
			},
		});
	}, [isAddTagButtonDisabled]);

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
			setGainDate(getSuggestedDateByDueDay(templateData.dueDay));
		}

		if (templateData.tagId) {
			setSelectedTagId(templateData.tagId);
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
							.filter((tag: any) => {
								const usageType = typeof tag?.usageType === 'string' ? tag.usageType : undefined;
								const isMandatoryGain = Boolean(tag?.isMandatoryGain);
								return (usageType === 'gain' || usageType === undefined || usageType === null) && !isMandatoryGain;
							})
							.map((tag: any) => ({
								id: tag.id,
								name: tag.name,
								usageType: typeof tag?.usageType === 'string' ? tag.usageType : undefined,
							}));
						const pendingCreatedTag = peekPendingCreatedTag();
						const matchingPendingTag =
							pendingCreatedTag?.usageType === 'gain'
								? formattedTags.find(tag => tag.id === pendingCreatedTag.tagId) ?? null
								: null;

						setTags(formattedTags);
						if (matchingPendingTag) {
							setSelectedTagId(matchingPendingTag.id);
							setSelectedMovementTagName(matchingPendingTag.name);
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
							showFloatingAlert({
								message: 'Nenhuma tag de ganhos disponível. Cadastre uma tag marcada como ganho.',
								action: 'warning',
								position: 'bottom',
							});
						}
					} else {
						showFloatingAlert({
							message: 'Não foi possível carregar as tags disponíveis.',
							action: 'error',
							position: 'bottom',
						});
					}

					if (banksResult.success && Array.isArray(banksResult.data)) {
						const formattedBanks = banksResult.data.map((bank: any) => ({
							id: bank.id,
							name: bank.name,
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
						showFloatingAlert({
							message: 'Não foi possível carregar os bancos disponíveis.',
							action: 'error',
							position: 'bottom',
						});
					}
				} catch (error) {
					console.error('Erro ao carregar opções de ganhos:', error);
					showFloatingAlert({
						message: 'Erro inesperado ao carregar dados. Tente novamente mais tarde.',
						action: 'error',
						position: 'bottom',
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
		}, [isBankSelectionLocked, isTemplateLocked, templateData?.bankId, templateData?.bankName, templateData?.tagId]),
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

	const handleSubmit = React.useCallback(async () => {
		if (!gainName.trim()) {
			showFloatingAlert({
				message: 'Informe o nome do ganho.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (gainValueCents === null) {
			showFloatingAlert({
				message: 'Informe o valor do ganho.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (gainValueCents <= 0) {
			showFloatingAlert({
				message: 'Informe um valor maior que zero para o ganho.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (shouldShowPaymentFormatSelection && paymentFormat.length === 0) {
			showFloatingAlert({
				message: 'Selecione o formato do ganho antes de continuar.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (!selectedTagId) {
			showFloatingAlert({
				message: 'Selecione uma tag.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (isBankSelectionRequired && !selectedBankId) {
			showFloatingAlert({
				message: 'Selecione um banco.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (!gainDate) {
			showFloatingAlert({
				message: 'Informe a data do ganho.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (!parsedGainDate) {
			showFloatingAlert({
				message: 'Informe uma data válida (DD/MM/AAAA).',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		const dateWithCurrentTime = mergeDateWithCurrentTime(parsedGainDate);

		setIsSubmitting(true);

		try {
			const personId = auth.currentUser?.uid;

			if (!personId) {
				showFloatingAlert({
					message: 'Não foi possível identificar o usuário atual.',
					action: 'error',
					position: 'bottom',
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
					showFloatingAlert({
						message: 'Erro ao atualizar ganho. Tente novamente mais tarde.',
						action: 'error',
						position: 'bottom',
					});
					return;
				}

				showSuccessfulGainNotification(true);
				router.replace('/home?tab=0');
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
				showFloatingAlert({
					message: 'Erro ao registrar ganho. Tente novamente mais tarde.',
					action: 'error',
					position: 'bottom',
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
					showFloatingAlert({
						message: 'Ganho registrado, mas não foi possível atualizar o ganho obrigatório.',
						action: 'warning',
						position: 'bottom',
					});
				}
			}

			if (pendingInvestmentAdjustment) {
				const adjustResult = await adjustFinanceInvestmentValueFirebase({
					investmentId: pendingInvestmentAdjustment.investmentId,
					deltaInCents: pendingInvestmentAdjustment.deltaInCents,
				});

				if (!adjustResult.success) {
					showFloatingAlert({
						message: 'Ganho registrado, mas não foi possível atualizar o investimento.',
						action: 'warning',
						position: 'bottom',
					});
				}
			}

			showSuccessfulGainNotification();
			router.replace('/home?tab=0');
		} catch (error) {
			console.error('Erro ao registrar/atualizar ganho:', error);
			showFloatingAlert({
				message: 'Erro inesperado ao salvar o ganho.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
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
		linkedMandatoryGainId,
		paymentFormat,
		selectedBankId,
		selectedTagId,
		pendingInvestmentAdjustment,
		isBankSelectionLocked,
		shouldShowPaymentFormatSelection,
		templateData,
		parsedGainDate,
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
					showFloatingAlert({
						message: 'Não foi possível carregar os dados do ganho selecionado.',
						action: 'error',
						position: 'bottom',
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
					showFloatingAlert({
						message: 'Erro inesperado ao carregar os dados do ganho.',
						action: 'error',
						position: 'bottom',
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
	}, [editingGainId]);

	React.useEffect(() => {
		try {
			if (!selectedTagId || selectedMovementTagName) {
				return;
			} else {
				const fetchTagName = async () => {
					const tagResult = await getTagDataFirebase(selectedTagId);

					if (tagResult.success && tagResult.data) {
						setSelectedMovementTagName(tagResult.data.name);
					} else {
						setSelectedMovementTagName(null);
					}
				};

				void fetchTagName();
			}
		} catch (error) {
			console.error('Erro ao buscar nome da tag:', error);
		}
	}, [selectedTagId, selectedMovementTagName]);

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

		if (selectedMovementTagName) {
			return selectedMovementTagName;
		}

		if (selectedTagId && selectedTagId === templateData?.tagId && templateTagDisplayName) {
			return templateTagDisplayName;
		}

		return null;
	}, [selectedMovementTagName, selectedTagId, tags, templateData?.tagId, templateTagDisplayName]);

	const selectedBankLabel = React.useMemo(() => {
		const matchedBank = banks.find(bank => bank.id === selectedBankId);
		return matchedBank?.name ?? selectedMovementBankName ?? templateData?.bankName ?? null;
	}, [banks, selectedBankId, selectedMovementBankName, templateData?.bankName]);

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

			<FloatingAlertViewport />

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
							contentContainerStyle={{ paddingBottom: 32 }}
						>
							<VStack className="justify-between mt-4">
								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Nome do ganho</Text>
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
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Valor do ganho</Text>
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
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Data do ganho</Text>
									<DatePickerField
										value={gainDate}
										onChange={setGainDate}
										triggerClassName={fieldContainerClassName}
										inputClassName={inputField}
										placeholder="Selecione a data do ganho"
										isDisabled={isFormBusy}
									/>
								</VStack>

								<VStack className="mb-4">
									<HStack className="mb-1 ml-1 gap-2">
										<Text className={`${bodyText} text-sm`}>Observação do ganho</Text>
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
										<HStack className="mb-1 ml-1 gap-2">
											<Text className={`${bodyText} text-sm`}>Formato do ganho</Text>
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
											<CheckboxGroup value={paymentFormat} onChange={setPaymentFormat}>
												<HStack space="2xl">
													<Checkbox
														value="Variable"
														className={checkboxClassName}
														isDisabled={
															gainName.trim().length === 0 || gainValueCents === null || gainValueCents === 0 || isFormBusy || paymentFormat.includes('External')
														}
													>
														<CheckboxIndicator className={checkboxIndicatorClassName}>
															<CheckboxIcon as={CheckIcon} className={checkboxIconClassName} />
														</CheckboxIndicator>
														<CheckboxLabel className={`${checkboxLabelClassName} text-sm`}>
															Renda variável
														</CheckboxLabel>
													</Checkbox>
													<Checkbox
														value="External"
														className={checkboxClassName}
														isDisabled={
															gainName.trim().length === 0 || gainValueCents === null || gainValueCents === 0 || isFormBusy || paymentFormat.includes('Variable')
														}
													>
														<CheckboxIndicator className={checkboxIndicatorClassName}>
															<CheckboxIcon as={CheckIcon} className={checkboxIconClassName} />
														</CheckboxIndicator>
														<CheckboxLabel className={`${checkboxLabelClassName} text-sm`}>
															Pagamento externo
														</CheckboxLabel>
													</Checkbox>
												</HStack>
											</CheckboxGroup>
										</View>
									</VStack>
								)}

								<VStack className="mb-4">
									<HStack className="mb-1 ml-1 gap-2">
										<Text className={`${bodyText} text-sm`}>Formato de recebimento</Text>
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
									<View className={`${fieldContainerCardClassName} px-4 py-3`}>
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
												<Text className={`${labelText} mb-1 ml-1 text-sm`}>Banco</Text>
												<View className={`${fieldContainerCardClassName} px-4 py-3`}>
													<Text className={`${bodyText} text-sm`}>
														{lockedBankName ?? selectedBankLabel ?? 'Banco definido automaticamente'}
													</Text>
												</View>
											</VStack>
										) : valuesRadioMoneyFormat === 'Recebimento em Banco' ? (
											<VStack className="mt-4">
												<Text className={`${labelText} mb-1 ml-1 text-sm`}>Banco</Text>
												<Select
													selectedValue={selectedBankId ?? undefined}
													onValueChange={value => {
														setSelectedBankId(value);
														const matched = banks.find(bank => bank.id === value);
														setSelectedMovementBankName(matched?.name ?? null);
													}}
													isDisabled={isBankSelectDisabled}
												>
													<SelectTrigger variant="outline" size="md" className={fieldContainerClassName}>
														<SelectInput
															placeholder="Selecione o banco vinculado"
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
															{banks.length > 0 ? (
																[...banks]
																	.sort((a, b) =>
																		a.name.localeCompare(b.name, 'pt-BR', {
																			sensitivity: 'base',
																		}),
																	)
																	.map(bank => (
																		<SelectItem
																			key={bank.id}
																			label={bank.name}
																			value={bank.id}
																		/>
																	))
															) : (
																<SelectItem
																	label="Nenhum banco disponível"
																	value="no-bank"
																	isDisabled
																/>
															)}
														</SelectContent>
													</SelectPortal>
												</Select>
											</VStack>
										) : null}
									</View>
								</VStack>

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Categoria</Text>
									{isTagSelectionLocked ? (
										<View className={`${fieldContainerCardClassName} px-4 py-3`}>
											<Text className={`${bodyText} text-sm`}>
												{selectedTagLabel ?? 'Categoria definida automaticamente'}
											</Text>
										</View>
									) : (
										<Select
											selectedValue={selectedTagId ?? undefined}
											onValueChange={value => {
												setSelectedTagId(value);
												const matchedTag = tags.find(tag => tag.id === value);
												setSelectedMovementTagName(matchedTag?.name ?? null);
											}}
											isDisabled={isTagSelectDisabled}
										>
											<HStack className="items-end gap-3">
												<View className="flex-1">
													<SelectTrigger
														variant="outline"
														size="md"
														className={fieldContainerClassName}
													>
														<SelectInput
															placeholder="Selecione a categoria do ganho"
															className={inputField}
														/>
														<SelectIcon />
													</SelectTrigger>
												</View>
												<Pressable
													onPress={handleOpenAddTagScreen}
													disabled={isAddTagButtonDisabled}
													hitSlop={8}
													accessibilityRole="button"
													accessibilityLabel="Adicionar nova categoria de ganho"
													className={`${addTagButtonClassName} ${isAddTagButtonDisabled ? 'opacity-40' : ''}`}
												>
													<TagsIcon
														size={18}
														color={isAddTagButtonDisabled ? '#94A3B8' : isDarkMode ? '#FCD34D' : '#F59E0B'}
													/>
												</Pressable>
											</HStack>
											<SelectPortal>
												<SelectBackdrop />
												<SelectContent>
													<SelectDragIndicatorWrapper>
														<SelectDragIndicator />
													</SelectDragIndicatorWrapper>
													{tags.length > 0 ? (
														[...tags]
															.sort((a, b) =>
																a.name.localeCompare(b.name, 'pt-BR', {
																	sensitivity: 'base',
																}),
															)
															.map(tag => (
																<SelectItem
																	key={tag.id}
																	label={tag.name}
																	value={tag.id}
																/>
															))
													) : (
														<SelectItem
															label="Nenhuma tag disponível"
															value="no-tag"
															isDisabled
														/>
													)}
												</SelectContent>
											</SelectPortal>
										</Select>
									)}
								</VStack>

								{isEditing && isLoadingExisting && (
									<Text className={`${helperText} mb-4 text-sm`}>
										Carregando informações do ganho selecionado...
									</Text>
								)}

								<Button
									className={submitButtonClassName}
									onPress={handleSubmit}
									isDisabled={isSubmitDisabled}
								>
									{isFormBusy ? (
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
