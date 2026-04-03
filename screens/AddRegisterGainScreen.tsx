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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import Navigator from '@/components/uiverse/navigator';
import DatePickerField from '@/components/uiverse/date-picker';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { getAllBanksFirebase } from '@/functions/BankFirebase';
import { getAllTagsFirebase, getTagDataFirebase } from '@/functions/TagFirebase';
import { addGainFirebase, getGainDataFirebase, updateGainFirebase } from '@/functions/GainFirebase';
import { markMandatoryGainReceiptFirebase } from '@/functions/MandatoryGainFirebase';
import { adjustFinanceInvestmentValueFirebase } from '@/functions/FinancesFirebase';
import { clearPendingCreatedTag, peekPendingCreatedTag } from '@/utils/pendingCreatedTag';
import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import { Info, Tags as TagsIcon } from 'lucide-react-native';
import { TagIcon } from '@/hooks/useTagIcons';
import type { TagIconFamily, TagIconSelection, TagIconStyle } from '@/hooks/useTagIcons';

import { useScreenStyles } from '@/hooks/useScreenStyle';

import AddGainIllustration from '../assets/UnDraw/addRegisterGainScreen.svg';
import { Divider } from '@/components/ui/divider';

type OptionItem = {
	id: string;
	name: string;
	usageType?: 'expense' | 'gain';
	iconFamily?: TagIconFamily | null;
	iconName?: string | null;
	iconStyle?: TagIconStyle | null;
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

	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		focusFieldClassName,
		fieldContainerClassName,
		fieldContainerClassNameNotSpace,
		fieldContainerCardClassName,
		textareaContainerClassName,
		submitButtonClassName,
		heroHeight,
		infoCardStyle,
		insets,
		labelText,
		switchRadioClassName,
		switchRadioIndicatorClassName,
		switchRadioIconClassName,
		switchRadioLabelClassName,
		addTagButtonClassName,
		checkboxClassName,
		checkboxIndicatorClassName,
		checkboxIconClassName,
		checkboxLabelClassName,
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
							.filter((tag: any) => {
								const usageType = typeof tag?.usageType === 'string' ? tag.usageType : undefined;
								const isMandatoryGain = Boolean(tag?.isMandatoryGain);
								const showInBothLists = Boolean(tag?.showInBothLists);
								return (
									(usageType === 'gain' || usageType === undefined || usageType === null) &&
									(!isMandatoryGain || showInBothLists)
								);
							})
							.map((tag: any) => ({
								id: tag.id,
								name: tag.name,
								usageType: typeof tag?.usageType === 'string' ? tag.usageType : undefined,
								iconFamily: typeof tag?.iconFamily === 'string' ? tag.iconFamily : null,
								iconName: typeof tag?.iconName === 'string' ? tag.iconName : null,
								iconStyle: typeof tag?.iconStyle === 'string' ? tag.iconStyle : null,
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

	const handleSubmit = React.useCallback(async () => {
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
			router.replace('/home?tab=0');
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
		isDarkMode,
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
										<Select
											selectedValue={selectedTagId ?? undefined}
											onValueChange={value => {
												setSelectedTagId(value);
												const matchedTag = tags.find(tag => tag.id === value);
												setSelectedMovementTagName(matchedTag?.name ?? null);
												setSelectedMovementTagIcon(
													matchedTag
														? {
															iconFamily: matchedTag.iconFamily ?? null,
															iconName: matchedTag.iconName ?? null,
															iconStyle: matchedTag.iconStyle ?? null,
														}
														: null,
												);
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
													className={`h-10 w-10 items-center justify-center rounded-2xl ${selectedTagIconContainerClassName}`}
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
