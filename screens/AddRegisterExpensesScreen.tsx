import React from 'react';
import {
	BackHandler,
	Keyboard,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	View,
	StatusBar,
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
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { Box } from '@/components/ui/box';
import { Switch } from '@/components/ui/switch';

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

import { getAllTagsFirebase, getTagDataFirebase } from '@/functions/TagFirebase';
import { getAllBanksFirebase } from '@/functions/BankFirebase';
import { addExpenseFirebase, getExpenseDataFirebase, updateExpenseFirebase } from '@/functions/ExpenseFirebase';
import { auth } from '@/FirebaseConfig';
import { markMandatoryExpensePaymentFirebase } from '@/functions/MandatoryExpenseFirebase';
import { adjustFinanceInvestmentValueFirebase } from '@/functions/FinancesFirebase';

// Importação do SVG
import AddExpenseIllustration from '../assets/UnDraw/addRegisterExpanseScreen.svg';
import { Divider } from '@/components/ui/divider';
import { useAppTheme } from '@/contexts/ThemeContext';

type OptionItem = {
	id: string;
	name: string;
	usageType?: 'expense' | 'gain';
};

// Formata um valor em centavos para o formato de moeda BRL
const formatCurrencyBRL = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(valueInCents / 100);

// Formata uma data para o formato brasileiro (DD/MM/YYYY)
const formatDateToBR = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${day}/${month}/${year}`;
};

// Sanitiza a entrada de data para o formato brasileiro (DD/MM/YYYY)
const sanitizeDateInput = (value: string) => value.replace(/\D/g, '').slice(0, 8);

const formatDateInput = (value: string) => {
	if (value.length <= 2) {
		return value;
	}
	if (value.length <= 4) {
		return `${value.slice(0, 2)}/${value.slice(2)}`;
	}
	return `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
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
	const { isDarkMode } = useAppTheme();
	const pageBackground = isDarkMode ? '#0b1220' : '#f4f5f7';

	// Variaveis relacionadas ao registro de despesas
	const [expenseName, setExpenseName] = React.useState('');
	const [expenseValueDisplay, setExpenseValueDisplay] = React.useState('');
	const [expenseValueCents, setExpenseValueCents] = React.useState<number | null>(null);
	const [expenseDate, setExpenseDate] = React.useState(formatDateToBR(new Date()));

	// Opções carregadas do Firebase
	const [tags, setTags] = React.useState<OptionItem[]>([]);
	const [banks, setBanks] = React.useState<OptionItem[]>([]);

	// Valores selecionados pelo usuário das opções no select
	const [selectedTagId, setSelectedTagId] = React.useState<string | null>(null);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);

	// Estados de carregamento e submissão
	const [isLoadingTags, setIsLoadingTags] = React.useState(false);
	const [isLoadingBanks, setIsLoadingBanks] = React.useState(false);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isLoadingExisting, setIsLoadingExisting] = React.useState(false);
	const [explanationExpense, setExplanationExpense] = React.useState<string | null>(null);
	const [moneyFormat, setMoneyFormat] = React.useState(false);
	const [keyboardHeight, setKeyboardHeight] = React.useState(0);

	// Constantes pós volta da consulta de ID de tag e banco, apenas para quando
	// vier dos parâmetros, assim mostrando o nome correto no input
	// Controla no nome da tag e banco depois de buscado dentro do Firebase
	const [selectedMovementTagName, setSelectedMovementTagName] = React.useState<string | null>(null);
	const [selectedMovementBankName, setSelectedMovementBankName] = React.useState<string | null>(null);
	const scrollViewRef = React.useRef<ScrollView | null>(null);
	const inputPositions = React.useRef<Record<string, number>>({});

	React.useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

		const showSub = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates?.height ?? 0));
		const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

		return () => {
			showSub.remove();
			hideSub.remove();
		};
	}, []);

	const contentBottomPadding = React.useMemo(() => Math.max(140, keyboardHeight + 80), [keyboardHeight]);

	const handleInputLayout = React.useCallback(
		(id: string) => (event: { nativeEvent: { layout: { y: number } } }) => {
			inputPositions.current[id] = event.nativeEvent.layout.y;
		},
		[],
	);

	const scrollToInput = React.useCallback(
		(id: string) => {
			if (!scrollViewRef.current) {
				return;
			}
			const y = inputPositions.current[id];
			if (typeof y === 'number') {
				scrollViewRef.current.scrollTo({ y: Math.max(0, y - 32), animated: true });
				return;
			}
			scrollViewRef.current.scrollToEnd({ animated: true });
		},
		[],
	);

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
		params.templateDescription,
		params.templateDueDay,
		params.templateLockTag,
		params.templateMandatoryExpenseId,
		params.templateName,
		params.templateTagId,
		params.templateTagName,
		params.templateValueInCents,
		params.investmentDeltaInCents,
		params.investmentIdForAdjustment,
	]);

	const [hasAppliedTemplate, setHasAppliedTemplate] = React.useState(false);
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

					// Carrega as tags e bancos do Firebase
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
								const isMandatoryExpense = Boolean(tag?.isMandatoryExpense);
								const isExpenseTag = usageType === 'expense' || usageType === undefined || usageType === null;
								return isExpenseTag && !isMandatoryExpense;
							})
							.map((tag: any) => ({
								id: tag.id,
								name:
									typeof tag?.name === 'string' && tag.name.trim().length > 0
										? tag.name.trim()
										: 'Tag sem nome',
								usageType: typeof tag?.usageType === 'string' ? tag.usageType : undefined,
							}));

						setTags(formattedTags);
						setSelectedTagId(current => {
							if (current && formattedTags.some(tag => tag.id === current)) {
								return current;
							}
							if ((isTemplateLocked || templateData?.lockTag) && templateData?.tagId) {
								return templateData.tagId;
							}
							return null;
						});

						if (formattedTags.length === 0) {
							showFloatingAlert({
								message: 'Nenhuma tag de despesas disponível. Cadastre uma tag marcada como despesa.',
								action: 'warning',
								position: 'bottom',
								offset: 40,
							});
						}

					} else {

						showFloatingAlert({
							message: 'Não foi possível carregar as tags disponíveis.',
							action: 'error',
							position: 'bottom',
							offset: 40,
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

						showFloatingAlert({
							message: 'Não foi possível carregar os bancos disponíveis.',
							action: 'error',
							position: 'bottom',
							offset: 40,
						});

					}

				} catch (error) {

					console.error('Erro ao carregar opções da despesa:', error);

					showFloatingAlert({
						message: 'Erro inesperado ao carregar dados. Tente novamente mais tarde.',
						action: 'error',
						position: 'bottom',
						offset: 40,

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
		}, [isTemplateLocked, templateData?.tagId]),
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
	}, [
		hasAppliedTemplate,
		isEditing,
		setExplanationExpense,
		setExpenseDate,
		setExpenseName,
		setExpenseValueCents,
		setExpenseValueDisplay,
		setSelectedTagId,
		templateData,
	]);

	// Manipula a mudança no campo de valor, formatando para moeda BRL
	const handleValueChange = React.useCallback((input: string) => {

		const digitsOnly = input.replace(/\D/g, '');
		if (!digitsOnly) {
			setExpenseValueDisplay('');
			setExpenseValueCents(null);
			return;
		}

		const centsValue = parseInt(digitsOnly, 10);
		setExpenseValueDisplay(formatCurrencyBRL(centsValue));
		setExpenseValueCents(centsValue);
	}, []);

	// Manipula a mudança no campo de data, sanitizando a entrada
	const handleDateChange = React.useCallback((value: string) => {
		const sanitized = sanitizeDateInput(value);
		setExpenseDate(formatDateInput(sanitized));
	}, []);


	const handleSubmit = React.useCallback(async () => {

		if (!expenseName.trim()) {

			showFloatingAlert({
				message: 'Informe o nome da despesa.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});

			return;
		}

		if (expenseValueCents === null) {

			showFloatingAlert({
				message: 'Informe o valor da despesa.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});

			return;
		}

		if (!selectedTagId) {

			showFloatingAlert({
				message: 'Selecione uma tag.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});

			return;
		}

		const isBankSelectionRequired = !moneyFormat;

		if (isBankSelectionRequired && !selectedBankId) {

			showFloatingAlert({
				message: 'Selecione um banco.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});

			return;
		}

		if (!expenseDate) {

			showFloatingAlert({
				message: 'Informe a data da despesa.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});

			return;
		}

		const parsedDate = parseDateFromBR(expenseDate);

		if (!parsedDate) {
			showFloatingAlert({
				message: 'Informe uma data válida (DD/MM/AAAA).',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});

			return;
		}

		const dateWithCurrentTime = mergeDateWithCurrentTime(parsedDate);

		setIsSubmitting(true);

		try {
			const personId = auth.currentUser?.uid;

			if (!personId) {
				showFloatingAlert({
					message: 'Não foi possível identificar o usuário atual.',
					action: 'error',
					position: 'bottom',
					offset: 40,
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
					showFloatingAlert({
						message: 'Erro ao atualizar despesa. Tente novamente mais tarde.',
						action: 'error',
						position: 'bottom',
						offset: 40,
					});
					return;
				}

				showFloatingAlert({
					message: 'Despesa atualizada com sucesso!',
					action: 'success',
					position: 'bottom',
					offset: 40,
				});
				router.back();
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
				showFloatingAlert({
					message: 'Erro ao registrar despesa. Tente novamente mais tarde.',
					action: 'error',
					position: 'bottom',
					offset: 40,
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
					showFloatingAlert({
						message: 'Despesa registrada, mas não foi possível atualizar o status do gasto obrigatório.',
						action: 'warning',
						position: 'bottom',
						offset: 40,
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
						message: 'Despesa registrada, mas não foi possível atualizar o investimento.',
						action: 'warning',
						position: 'bottom',
						offset: 40,
					});
				}
			}

			showFloatingAlert({
				message: 'Despesa registrada com sucesso!',
				action: 'success',
				position: 'bottom',
				offset: 40,
			});

			if (isTemplateLocked) {
				router.back();
				return;
			}

			setExpenseName('');
			setExpenseValueDisplay('');
			setExpenseValueCents(null);
			setExpenseDate(formatDateToBR(new Date()));
			setExplanationExpense(null);
			setMoneyFormat(false);
			setSelectedTagId(null);
			setSelectedBankId(null);
		} catch (error) {
			console.error('Erro ao registrar/atualizar despesa:', error);
			showFloatingAlert({
				message: 'Erro inesperado ao salvar a despesa.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
		} finally {
			setIsSubmitting(false);
		}

	}, [
		editingExpenseId,
		expenseDate,
		expenseName,
		expenseValueCents,
		moneyFormat,
		explanationExpense,
		isEditing,
		isTemplateLocked,
		linkedMandatoryExpenseId,
		selectedBankId,
		selectedTagId,
		pendingInvestmentAdjustment,
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
					showFloatingAlert({
						message: 'Não foi possível carregar os dados da despesa selecionada.',
						action: 'error',
						position: 'bottom',
						offset: 40,
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
					showFloatingAlert({
						message: 'Erro inesperado ao carregar a despesa selecionada.',
						action: 'error',
						position: 'bottom',
						offset: 40,
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
	}, [editingExpenseId]);

	// UseFocusEffect para quando vier os parametros do template para editar
	// um registro, a tag ID vem como número, portanto faz uma consulta no
	// firebase para resgatar o nome corretamente, igual a tela @BankMovementsScreen
	// React.useEffect(() => {
	React.useEffect(() => {

		try {

			if (!selectedTagId || selectedMovementTagName) {
				return;
			} else {
				const fetchTagName = async () => {

					// Busca o nome da tag pelo ID
					const tagResult = await getTagDataFirebase(selectedTagId);

					if (tagResult.success && tagResult.data) {

						// Atualiza o nome da tag no estado com o nome buscado
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

	// UseFocusEffect para quando vier os parametros do template para editar
	// um registro, o banco ID vem como número, portanto faz uma consulta no
	// firebase para resgatar o nome corretamente, igual a tela @BankMovementsScreen
	React.useEffect(() => {

		try {

			if (!selectedBankId || selectedMovementBankName) {
				return;
			} else {
				const fetchBankName = async () => {

					// Busca o nome do banco pelo ID
					const bankResult = await getAllBanksFirebase();

					if (bankResult.success && Array.isArray(bankResult.data)) {

						const bankData = bankResult.data.find((bank: any) => bank.id === selectedBankId);

						if (bankData && typeof (bankData as any).name === 'string') {
							
							// Atualiza o nome do banco no estado com o nome buscado
							setSelectedMovementBankName((bankData as any).name);
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


	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: pageBackground }}>
			<StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={pageBackground} />
			<View
				className="
						flex-1 w-full h-full
						pt-[64px]
						items-center
						justify-between
						pb-6
						relative
					"
				style={{ backgroundColor: pageBackground }}
			>
				<FloatingAlertViewport />

				<KeyboardAvoidingView
					behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
					keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
					className="flex-1 w-full"
				>
					<ScrollView
						ref={scrollViewRef}
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="on-drag"
						style={{ backgroundColor: pageBackground }}
						contentContainerStyle={{
							flexGrow: 1,
							paddingBottom: contentBottomPadding, // espaço extra baseado na altura do teclado
							backgroundColor: pageBackground,
						}}
					>
						<View className="w-full px-6">

						<Heading size="3xl" className="text-center mb-4 text-gray-900 dark:text-gray-100">
							{isEditing ? 'Editar despesa' : 'Registro de Despesas'}
						</Heading>

						<Box className="w-full items-center mb-4">
							<AddExpenseIllustration width={160} height={160} />
						</Box>

						<Text className="text-justify mb-6 text-gray-600 dark:text-gray-400">
							{isEditing
								? 'Atualize os dados da despesa selecionada e confirme para salvar. Podendo alterar qualquer informação previamente cadastrada.'
								: 'Preencha os dados abaixo para cadastrar uma nova despesa no sistema. Podendo descrever ela pelo template já estabelecido.'}
						</Text>

						<Divider className="mb-6" />

						<VStack className="gap-4">
							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Nome da despesa
								</Text>
								<Input isDisabled={isTemplateLocked}>
									<InputField
										onLayout={handleInputLayout('expense-name')}
										placeholder="Ex: Mercado, Combustível, Roupa..."
										value={expenseName}
										onChangeText={setExpenseName}
										autoCapitalize="sentences"
										onFocus={() => scrollToInput('expense-name')}
									/>
								</Input>
							</Box>

							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Valor da despesa
								</Text>
								<Input>
									<InputField
										onLayout={handleInputLayout('expense-value')}
										placeholder="Ex: R$ 50,00"
										value={expenseValueDisplay}
										onChangeText={handleValueChange}
										keyboardType="numeric"
										onFocus={() => scrollToInput('expense-value')}
									/>
								</Input>
							</Box>

							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Explicação da despesa
								</Text>
								<Textarea
									size="md"
									isDisabled={!expenseValueDisplay}
									className="h-32"
								>
									<TextareaInput
										onLayout={handleInputLayout('expense-explanation')}
										placeholder="(Opcional) Explique sobre essa despesa..."
										value={explanationExpense ?? ''}
										onChangeText={setExplanationExpense}
										onFocus={() => scrollToInput('expense-explanation')}
									/>
								</Textarea>
							</Box>

							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Pagamento em dinheiro
								</Text>
								<View className="border border-outline-200 rounded-md px-4 py-3 opacity-100">
									<HStack className="items-center justify-between">
										<View className="flex-1 mr-3">
											<Text className="font-semibold text-gray-800 dark:text-gray-200">Pagamento em dinheiro</Text>
											<Text className="text-gray-600 dark:text-gray-400 text-sm">
												Indique se essa despesa foi paga em dinheiro
											</Text>
										</View>
										<Switch
											value={moneyFormat}
											onValueChange={() => {
												setMoneyFormat(!moneyFormat);
												setSelectedBankId(null);
												setSelectedMovementBankName(null);
											}}
											trackColor={{ false: '#d4d4d4', true: '#525252' }}
											thumbColor="#fafafa"
											ios_backgroundColor="#d4d4d4"
										/>
									</HStack>
								</View>
							</Box>

							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Tag da despesa
								</Text>
								{isTagSelectionLocked ? (
									<Box className="border border-outline-200 rounded-lg p-4 bg-transparent">
										<Text className="font-semibold mb-1 text-gray-800 dark:text-gray-200">
											{isTemplateLocked ? 'Tag da despesa obrigatória' : 'Tag definida automaticamente'}
										</Text>
										<Text className="text-gray-700 dark:text-gray-300">
											{templateTagDisplayName ?? 'Tag não encontrada'}
										</Text>
									</Box>
								) : (
									<Select
										selectedValue={selectedMovementTagName}
										onValueChange={setSelectedTagId}
										isDisabled={isLoadingTags || tags.length === 0}
									>
										<SelectTrigger>
											<SelectInput placeholder="Selecione uma tag para a despesa" />
											<SelectIcon />
										</SelectTrigger>

										<SelectPortal>
											<SelectBackdrop />
											<SelectContent>
												<SelectDragIndicatorWrapper>
													<SelectDragIndicator />
												</SelectDragIndicatorWrapper>

												{tags.length > 0 ? (
													tags.map(tag => (
														<SelectItem key={tag.id} label={tag.name} value={tag.id} />
													))
												) : (
													<SelectItem key="no-tag" label="Nenhuma tag disponível" value="no-tag" isDisabled />
												)}
											</SelectContent>
										</SelectPortal>
									</Select>
								)}
							</Box>

							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Banco da despesa
								</Text>
								<Select
									selectedValue={selectedMovementBankName}
									onValueChange={setSelectedBankId}
									isDisabled={isLoadingBanks || banks.length === 0 || moneyFormat}
								>
									<SelectTrigger>
										<SelectInput placeholder="Selecione o banco onde a despesa foi registrada" />
										<SelectIcon />
									</SelectTrigger>

									<SelectPortal>
										<SelectBackdrop />
										<SelectContent>
											<SelectDragIndicatorWrapper>
												<SelectDragIndicator />
											</SelectDragIndicatorWrapper>

											{banks.length > 0 ? (
												banks.map(bank => (
													<SelectItem
														key={bank.id}
														label={bank.name}
														value={bank.id}
													/>
												))
											) : (
												<SelectItem
													key="no-bank"
													label="Nenhum banco disponível"
													value="no-bank"
													isDisabled
												/>
											)}
										</SelectContent>
									</SelectPortal>
								</Select>
							</Box>

							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Data da despesa
								</Text>
								<Input>
									<InputField
										onLayout={handleInputLayout('expense-date')}
										placeholder="Data da despesa (DD/MM/AAAA)"
										value={expenseDate}
										onChangeText={handleDateChange}
										autoCorrect={false}
										keyboardType="numbers-and-punctuation"
										onFocus={() => scrollToInput('expense-date')}
									/>
								</Input>
							</Box>

							{isEditing && isLoadingExisting && (
								<Text className="text-sm text-gray-500 dark:text-gray-400">
									Carregando dados da despesa selecionada...
								</Text>
							)}

							<Button
								className="w-full mt-2"
								size="sm"
								variant="outline"
								onPress={handleSubmit}
								isDisabled={
									isLoadingExisting ||
									isSubmitting ||
									!expenseName.trim() ||
									expenseValueCents === null ||
									!selectedTagId ||
									(!moneyFormat && !selectedBankId) ||
									!expenseDate
								}
							>
								{isSubmitting ? (
									<ButtonSpinner />
								) : (
									<ButtonText>{isEditing ? 'Atualizar despesa' : 'Registrar despesa'}</ButtonText>
								)}
							</Button>
						</VStack>
						</View>
					</ScrollView>
				</KeyboardAvoidingView>

				<Menu defaultValue={1} />
			</View>
		</SafeAreaView>
	);
}
