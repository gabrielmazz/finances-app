import React from 'react';
import { ScrollView, View } from 'react-native';
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
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { Box } from '@/components/ui/box';

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

import { getAllTagsFirebase } from '@/functions/TagFirebase';
import { getAllBanksFirebase } from '@/functions/BankFirebase';
import { addExpenseFirebase, getExpenseDataFirebase, updateExpenseFirebase } from '@/functions/ExpenseFirebase';
import { auth } from '@/FirebaseConfig';
import { markMandatoryExpensePaymentFirebase } from '@/functions/MandatoryExpenseFirebase';

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

	const params = useLocalSearchParams<{
		expenseId?: string | string[];
		templateName?: string | string[];
		templateValueInCents?: string | string[];
		templateTagId?: string | string[];
		templateDueDay?: string | string[];
		templateDescription?: string | string[];
		templateTagName?: string | string[];
		templateMandatoryExpenseId?: string | string[];
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
		};
	}, [
		params.templateDescription,
		params.templateDueDay,
		params.templateMandatoryExpenseId,
		params.templateName,
		params.templateTagId,
		params.templateTagName,
		params.templateValueInCents,
	]);

	const [hasAppliedTemplate, setHasAppliedTemplate] = React.useState(false);
	const linkedMandatoryExpenseId = React.useMemo(
		() => (templateData?.mandatoryExpenseId ? templateData.mandatoryExpenseId : null),
		[templateData],
	);
	const templateTagDisplayName = templateData?.tagName ?? null;
	const isTemplateLocked = Boolean(linkedMandatoryExpenseId && !isEditing);

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
							if (isTemplateLocked && templateData?.tagId) {
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

		if (!selectedBankId) {

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
					bankId: selectedBankId ?? undefined,
					date: dateWithCurrentTime,
					explanation: explanationExpense?.trim() ?? null,
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
				bankId: selectedBankId as string,
				date: dateWithCurrentTime,
				personId,
				explanation: explanationExpense?.trim() ? explanationExpense.trim() : null,
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
		explanationExpense,
		isEditing,
		isTemplateLocked,
		linkedMandatoryExpenseId,
		selectedBankId,
		selectedTagId,
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

	return (
		<View
			className="
					flex-1 w-full h-full
					mt-[64px]
					items-center
					justify-between
					pb-6
					relative
				"
		>
			<FloatingAlertViewport />

			<ScrollView
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
				contentContainerStyle={{
					flexGrow: 1,
					paddingBottom: 48,
				}}
			>
				<View className="w-full px-6">
					<Heading size="3xl" className="text-center mb-6">
						{isEditing ? 'Editar despesa' : 'Registro de Despesas'}
					</Heading>

					<Text className="mb-6 text-center">
						{isEditing
							? 'Atualize os dados da despesa selecionada e confirme para salvar.'
							: 'Preencha os dados abaixo para cadastrar uma nova despesa no sistema.'}
					</Text>

					<VStack className="gap-5">
						<Input isDisabled={isTemplateLocked}>
							<InputField
								placeholder="Nome da despesa"
								value={expenseName}
								onChangeText={setExpenseName}
								autoCapitalize="sentences"
							/>
						</Input>

						<Input isDisabled={isTemplateLocked}>
							<InputField
								placeholder="Valor da despesa"
								value={expenseValueDisplay}
								onChangeText={handleValueChange}
								keyboardType="numeric"
							/>
						</Input>

						<Textarea
							size="md"
							isDisabled={!expenseValueDisplay}
							className="h-32"
						>
							<TextareaInput
								placeholder="(Opcional) Explique sobre essa despesa..."
								value={explanationExpense ?? ''}
								onChangeText={setExplanationExpense}
							/>
						</Textarea>

						{isTemplateLocked ? (
							<Box className="border border-outline-200 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
								<Text className="font-semibold mb-1">Tag do gasto obrigatório</Text>
								<Text className="text-gray-700 dark:text-gray-300">
									{templateTagDisplayName ?? 'Tag não encontrada'}
								</Text>
							</Box>
						) : (
							<Select
								selectedValue={selectedTagId}
								onValueChange={setSelectedTagId}
								isDisabled={isLoadingTags || tags.length === 0}
							>
								<SelectTrigger>
									<SelectInput placeholder="Selecione uma tag" />
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

						<Select
							selectedValue={selectedBankId}
							onValueChange={setSelectedBankId}
							isDisabled={isLoadingBanks || banks.length === 0}
						>
							<SelectTrigger>
								<SelectInput placeholder="Selecione um banco" />
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

						<Input>
							<InputField
								placeholder="Data da despesa (DD/MM/AAAA)"
								value={expenseDate}
								onChangeText={handleDateChange}
								autoCorrect={false}
								keyboardType="numbers-and-punctuation"
							/>
						</Input>

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
								!selectedBankId ||
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

			<Menu defaultValue={1} />
		</View>
	);
}
