import React from 'react';
import {
	BackHandler,
	findNodeHandle,
	Keyboard,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StatusBar,
	View,
	useWindowDimensions,
	Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
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
import {
	Radio,
	RadioGroup,
	RadioIndicator,
	RadioIcon,
	RadioLabel,
} from '@/components/ui/radio';
import { Text } from '@/components/ui/text';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { VStack } from '@/components/ui/vstack';
import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';
import DatePickerField from '@/components/uiverse/date-picker';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import Navigator from '@/components/uiverse/navigator';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { useAppTheme } from '@/contexts/ThemeContext';
import { getAllBanksFirebase } from '@/functions/BankFirebase';
import {
	addExpenseFirebase,
	getExpenseDataFirebase,
	updateExpenseFirebase,
} from '@/functions/ExpenseFirebase';
import { adjustFinanceInvestmentValueFirebase } from '@/functions/FinancesFirebase';
import { markMandatoryExpensePaymentFirebase } from '@/functions/MandatoryExpenseFirebase';
import { getAllTagsFirebase } from '@/functions/TagFirebase';
import { clearPendingCreatedTag, peekPendingCreatedTag } from '@/utils/pendingCreatedTag';

import { Info, Tags as TagsIcon } from 'lucide-react-native';
import { CircleIcon } from '@/components/ui/icon';
import { TagIcon } from '@/hooks/useTagIcons';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';

import AddExpenseIllustration from '../assets/UnDraw/addRegisterExpanseScreen.svg';

import { useScreenStyles } from '@/hooks/useScreenStyle';

type OptionItem = {
	id: string;
	name: string;
	usageType?: 'expense' | 'gain';
	iconFamily?: TagIconFamily | null;
	iconName?: string | null;
	iconStyle?: TagIconStyle | null;
};

type FocusableInputKey = 'expense-name' | 'expense-value' | 'expense-explanation';

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

export default function AddRegisterExpensesScreen() {

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
	} = useScreenStyles();

	const [expenseName, setExpenseName] = React.useState('');
	const [expenseValueDisplay, setExpenseValueDisplay] = React.useState('');
	const [expenseValueCents, setExpenseValueCents] = React.useState<number | null>(null);
	const [expenseDate, setExpenseDate] = React.useState(formatDateToBR(new Date()));
	const [tags, setTags] = React.useState<OptionItem[]>([]);
	const [banks, setBanks] = React.useState<OptionItem[]>([]);
	const [selectedTagId, setSelectedTagId] = React.useState<string | null>(null);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);
	const [isLoadingTags, setIsLoadingTags] = React.useState(false);
	const [isLoadingBanks, setIsLoadingBanks] = React.useState(false);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isLoadingExisting, setIsLoadingExisting] = React.useState(false);
	const [explanationExpense, setExplanationExpense] = React.useState<string | null>(null);
	const [moneyFormat, setMoneyFormat] = React.useState(false);
	const [hasAppliedTemplate, setHasAppliedTemplate] = React.useState(false);
	const [valuesRadioMoneyFormat, setValuesRadioMoneyFormat] = React.useState<
		'Pagamento em Dinheiro' | 'Pagamento em Banco'
	>(moneyFormat ? 'Pagamento em Dinheiro' : 'Pagamento em Banco');

	const scrollViewRef = React.useRef<ScrollView | null>(null);
	const expenseNameInputRef = React.useRef<any>(null);
	const expenseValueInputRef = React.useRef<any>(null);
	const expenseExplanationInputRef = React.useRef<any>(null);
	const lastFocusedInputKey = React.useRef<FocusableInputKey | null>(null);

	const keyboardScrollOffset = React.useCallback(
		(key: FocusableInputKey) => (key === 'expense-explanation' ? 220 : 170),
		[],
	);

	const showSuccessfulExpenseNotification = React.useCallback((isUpdating = false) => {
		const normalizedExpenseName = expenseName.trim() || 'informada';
		const resolvedBankName = banks.find(bank => bank.id === selectedBankId)?.name ?? null;
		const destinationLabel = moneyFormat
			? 'como pagamento em dinheiro'
			: resolvedBankName
				? `no banco ${resolvedBankName}`
				: 'no banco selecionado';

		showNotifierAlert({
			title: isUpdating ? 'Despesa atualizada' : 'Despesa registrada',
			description: `A despesa "${normalizedExpenseName}" foi ${isUpdating ? 'atualizada' : 'registrada'} com sucesso ${destinationLabel}.`,
			type: 'success',
			isDarkMode,
			duration: 4000,
		});
	}, [banks, expenseName, isDarkMode, moneyFormat, selectedBankId]);

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
							y: Math.max(0, y - offset),
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
		expenseId?: string | string[];
		templateName?: string | string[];
		templateValueInCents?: string | string[];
		templateTagId?: string | string[];
		templateDueDay?: string | string[];
		templateDescription?: string | string[];
		templateTagName?: string | string[];
		templateMandatoryExpenseId?: string | string[];
		templateLockTag?: string | string[];
		investmentIdForAdjustment?: string | string[];
		investmentDeltaInCents?: string | string[];
	}>();

	const editingExpenseId = React.useMemo(() => {
		const value = Array.isArray(params.expenseId) ? params.expenseId[0] : params.expenseId;
		return value && value.trim().length > 0 ? value : null;
	}, [params.expenseId]);
	const isEditing = Boolean(editingExpenseId);

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
		const mandatoryExpenseId = decodeParam(params.templateMandatoryExpenseId);
		const lockTagParam = decodeParam(params.templateLockTag);
		const investmentAdjustmentId = decodeParam(params.investmentIdForAdjustment);
		const investmentDelta = parseNumberParam(params.investmentDeltaInCents);

		if (
			!name &&
			!description &&
			typeof tagId === 'undefined' &&
			typeof tagName === 'undefined' &&
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
			valueInCents,
			dueDay,
			mandatoryExpenseId,
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
		params.templateLockTag,
		params.templateMandatoryExpenseId,
		params.templateName,
		params.templateTagId,
		params.templateTagName,
		params.templateValueInCents,
	]);

	const linkedMandatoryExpenseId = React.useMemo(
		() => (templateData?.mandatoryExpenseId ? templateData.mandatoryExpenseId : null),
		[templateData],
	);
	const templateTagDisplayName = templateData?.tagName ?? null;
	const isTemplateLocked = Boolean(linkedMandatoryExpenseId && !isEditing);
	const isTagSelectionLocked = isTemplateLocked || Boolean(templateData?.lockTag);
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

	const parsedExpenseDate = React.useMemo(() => parseDateFromBR(expenseDate), [expenseDate]);
	const isBankSelectionRequired = !moneyFormat;
	const isFormBusy = isLoadingExisting || isSubmitting;
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
		isLoadingTags || tags.length === 0 || isFormBusy || isTagFieldPrerequisitesIncomplete;
	const isAddTagButtonDisabled = isFormBusy || isTagSelectionLocked;

	const handleMoneyFormatChange = React.useCallback((nextValue: boolean) => {
		setMoneyFormat(nextValue);

		if (nextValue) {
			setSelectedBankId(null);
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

		Keyboard.dismiss();
		router.push({
			pathname: '/add-register-tag',
			params: {
				usageType: 'expense',
				lockUsageType: '1',
				returnAfterCreate: '1',
			},
		});
	}, [isAddTagButtonDisabled]);

	React.useEffect(() => {
		setValuesRadioMoneyFormat(moneyFormat ? 'Pagamento em Dinheiro' : 'Pagamento em Banco');
	}, [moneyFormat]);

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

	useFocusEffect(
		React.useCallback(() => {
			let isMounted = true;

			const loadOptions = async () => {
				setIsLoadingTags(true);
				setIsLoadingBanks(true);

				try {
					const [tagsResult, banksResult] = await Promise.all([getAllTagsFirebase(), getAllBanksFirebase()]);

					if (!isMounted) {
						return;
					}

					if (tagsResult.success && Array.isArray(tagsResult.data)) {
						const formattedTags = tagsResult.data
							.filter((tag: any) => {
								const usageType = typeof tag?.usageType === 'string' ? tag.usageType : undefined;
								const isMandatoryExpense = Boolean(tag?.isMandatoryExpense);
								const isExpenseTag =
									usageType === 'expense' || usageType === undefined || usageType === null;
								return isExpenseTag && !isMandatoryExpense;
							})
							.map((tag: any) => ({
								id: tag.id,
								name:
									typeof tag?.name === 'string' && tag.name.trim().length > 0
										? tag.name.trim()
										: 'Tag sem nome',
								usageType: typeof tag?.usageType === 'string' ? tag.usageType : undefined,
								iconFamily: typeof tag?.iconFamily === 'string' ? tag.iconFamily : null,
								iconName: typeof tag?.iconName === 'string' ? tag.iconName : null,
								iconStyle: typeof tag?.iconStyle === 'string' ? tag.iconStyle : null,
							}));
						const pendingCreatedTag = peekPendingCreatedTag();
						const matchingPendingTag =
							pendingCreatedTag?.usageType === 'expense'
								? formattedTags.find(tag => tag.id === pendingCreatedTag.tagId) ?? null
								: null;

						setTags(formattedTags);
						if (matchingPendingTag) {
							setSelectedTagId(matchingPendingTag.id);
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
								title: 'Nenhuma tag de despesas disponível',
								description: 'Cadastre uma tag marcada como despesa.',
								type: 'error',
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
						setSelectedBankId(current =>
							current && formattedBanks.some(bank => bank.id === current) ? current : null,
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
		}, [isDarkMode, isTemplateLocked, templateData?.lockTag, templateData?.tagId]),
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
			setExpenseDate(getSuggestedDateByDueDay(templateData.dueDay));
		}

		if (templateData.tagId) {
			setSelectedTagId(templateData.tagId);
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

	const handleSubmit = React.useCallback(async () => {
		if (!expenseName.trim()) {
			showNotifierAlert({
				title: 'Erro ao registrar despesa',
				description: 'Informe o nome da despesa.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (expenseValueCents === null) {
			showNotifierAlert({
				title: 'Erro ao registrar despesa',
				description: 'Informe o valor da despesa.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (expenseValueCents <= 0) {
			showNotifierAlert({
				title: 'Erro ao registrar despesa',
				description: 'Informe um valor maior que zero para a despesa.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (!selectedTagId) {
			showNotifierAlert({
				title: 'Erro ao registrar despesa',
				description: 'Selecione uma tag.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (isBankSelectionRequired && !selectedBankId) {
			showNotifierAlert({
				title: 'Erro ao registrar despesa',
				description: 'Selecione um banco.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (!expenseDate) {
			showNotifierAlert({
				title: 'Erro ao registrar despesa',
				description: 'Informe a data da despesa.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (!parsedExpenseDate) {
			showNotifierAlert({
				title: 'Erro ao registrar despesa',
				description: 'Informe uma data válida (DD/MM/AAAA).',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		const dateWithCurrentTime = mergeDateWithCurrentTime(parsedExpenseDate);
		setIsSubmitting(true);

		try {
			const personId = auth.currentUser?.uid;

			if (!personId) {
				showNotifierAlert({
					title: 'Erro ao registrar despesa',
					description: 'Não foi possível identificar o usuário atual.',
					type: 'error',
					isDarkMode,
					duration: 4000,
				});
				setIsSubmitting(false);
				return;
			}

			if (isEditing && editingExpenseId) {
				const result = await updateExpenseFirebase({
					expenseId: editingExpenseId,
					name: expenseName.trim(),
					valueInCents: expenseValueCents ?? undefined,
					tagId: selectedTagId ?? undefined,
					bankId: isBankSelectionRequired ? selectedBankId ?? null : null,
					date: dateWithCurrentTime,
					explanation: explanationExpense?.trim() ?? null,
					moneyFormat,
				});

				if (!result.success) {
					showNotifierAlert({
						title: 'Erro ao atualizar despesa',
						description: 'Tente novamente mais tarde.',
						type: 'error',
						isDarkMode,
						duration: 4000,
					});
					return;
				}

				showSuccessfulExpenseNotification(true);
				router.replace('/home?tab=0');
				return;
			}

			const result = await addExpenseFirebase({
				name: expenseName.trim(),
				valueInCents: expenseValueCents,
				tagId: selectedTagId as string,
				bankId: isBankSelectionRequired ? (selectedBankId as string) : null,
				date: dateWithCurrentTime,
				personId,
				explanation: explanationExpense?.trim() ? explanationExpense.trim() : null,
				moneyFormat,
			});

			if (!result.success) {
				showNotifierAlert({
					title: 'Erro ao registrar despesa',
					description: 'Tente novamente mais tarde.',
					type: 'error',
					isDarkMode,
					duration: 4000,
				});
				return;
			}

			if (linkedMandatoryExpenseId && result.expenseId) {
				const markResult = await markMandatoryExpensePaymentFirebase({
					expenseId: linkedMandatoryExpenseId,
					paymentExpenseId: result.expenseId,
					paymentDate: dateWithCurrentTime,
				});

				if (!markResult.success) {
					showNotifierAlert({
						title: 'Erro ao atualizar gasto obrigatório',
						description: 'Despesa registrada, mas não foi possível atualizar o status do gasto obrigatório.',
						type: 'error',
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
						title: 'Erro ao atualizar investimento',
						description: 'Despesa registrada, mas não foi possível atualizar o investimento.',
						type: 'error',
						isDarkMode,
						duration: 4000,
					});
				}
			}

			showSuccessfulExpenseNotification();
			router.replace('/home?tab=0');
		} catch (error) {
			console.error('Erro ao registrar/atualizar despesa:', error);
			showNotifierAlert({
				title: 'Erro ao registrar despesa',
				description: 'Erro inesperado ao salvar a despesa.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
		} finally {
			setIsSubmitting(false);
		}
	}, [
		editingExpenseId,
		expenseDate,
		expenseName,
		expenseValueCents,
		explanationExpense,
		isEditing,
		isBankSelectionRequired,
		linkedMandatoryExpenseId,
		moneyFormat,
		pendingInvestmentAdjustment,
		isDarkMode,
		selectedBankId,
		selectedTagId,
		parsedExpenseDate,
		showSuccessfulExpenseNotification,
	]);

	React.useEffect(() => {
		if (!editingExpenseId) {
			return;
		}

		let isMounted = true;
		setIsLoadingExisting(true);

		const loadExpense = async () => {
			try {
				const response = await getExpenseDataFirebase(editingExpenseId);

				if (!isMounted) {
					return;
				}

				if (!response.success || !response.data) {
					showNotifierAlert({
						title: 'Erro ao carregar despesa',
						description: 'Não foi possível carregar os dados da despesa selecionada.',
						type: 'error',
						isDarkMode,
						duration: 4000,
					});
					return;
				}

				const data = response.data as Record<string, unknown>;
				const value = typeof data.valueInCents === 'number' ? data.valueInCents : 0;

				setExpenseName(typeof data.name === 'string' ? data.name : '');
				setExpenseValueCents(value);
				setExpenseValueDisplay(formatCurrencyBRL(value));

				const normalizedDate = normalizeDateValue(data.date) ?? new Date();
				setExpenseDate(formatDateToBR(normalizedDate));

				setSelectedTagId(typeof data.tagId === 'string' ? data.tagId : null);
				setSelectedBankId(typeof data.bankId === 'string' ? data.bankId : null);
				setExplanationExpense(typeof data.explanation === 'string' ? data.explanation : null);
				setMoneyFormat(typeof data.moneyFormat === 'boolean' ? data.moneyFormat : false);
			} catch (error) {
				console.error('Erro ao carregar despesa para edição:', error);
				if (isMounted) {
					showNotifierAlert({
						title: 'Erro ao carregar despesa',
						description: 'Erro inesperado ao carregar a despesa selecionada.',
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

		void loadExpense();

		return () => {
			isMounted = false;
		};
	}, [editingExpenseId, isDarkMode]);

	const selectedTagLabel = React.useMemo(() => {
		const matchedTag = tags.find(tag => tag.id === selectedTagId);
		if (matchedTag) {
			return matchedTag.name;
		}

		if (selectedTagId && selectedTagId === templateData?.tagId && templateTagDisplayName) {
			return templateTagDisplayName;
		}

		return null;
	}, [selectedTagId, tags, templateData?.tagId, templateTagDisplayName]);
	const selectedTagOption = React.useMemo(() => {
		return tags.find(tag => tag.id === selectedTagId) ?? null;
	}, [selectedTagId, tags]);

	const selectedBankLabel = React.useMemo(() => {
		const matchedBank = banks.find(bank => bank.id === selectedBankId);
		return matchedBank?.name ?? null;
	}, [banks, selectedBankId]);

	const screenTitle = 'Registro de Despesa';
	const tagHelperMessage = isTagSelectionLocked
		? isTemplateLocked
			? 'Essa categoria vem do gasto obrigatório vinculado.'
			: 'Essa categoria foi definida pelo template usado como base.'
		: isLoadingTags
			? 'Carregando tags de despesas...'
			: tags.length === 0
				? 'Cadastre uma tag de despesa para continuar.'
				: 'Escolha a categoria que melhor representa esta saída.';
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
							contentContainerStyle={{ paddingBottom: 32 }}
						>
							<VStack className="justify-between mt-4">

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Nome da despesa</Text>
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
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Valor da despesa</Text>
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
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Data da despesa</Text>
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
									<HStack className="mb-1 ml-1 gap-2">
										<Text className={`${bodyText} text-sm`}>Observação da despesa</Text>
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
									<HStack className="mb-1 ml-1 gap-2">
										<Text className={`${bodyText} text-sm`}>Formato de pagamento</Text>
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
									<View className={`${fieldContainerCardClassName} px-4 py-3`}>
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
												<Text className={`${labelText} mb-1 ml-1 text-sm`}>Banco</Text>
												<Select
													selectedValue={selectedBankId ?? undefined}
													onValueChange={value => setSelectedBankId(value)}
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
										)}
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
											onValueChange={value => setSelectedTagId(value)}
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
															placeholder="Selecione a categoria da despesa"
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
													accessibilityLabel="Adicionar nova categoria de despesa"
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
										Carregando informações da despesa selecionada...
									</Text>
								)}

								<Button
									className={`${submitButtonClassName}`}
									onPress={handleSubmit}
									isDisabled={isSubmitDisabled}
								>
									{isFormBusy ? (
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
			</View>
		</SafeAreaView>
	);
}
