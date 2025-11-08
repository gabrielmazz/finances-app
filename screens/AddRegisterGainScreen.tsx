import React from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

// Importações relacionadas ao Gluestack UI
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
import {
	Checkbox,
	CheckboxGroup,
	CheckboxIndicator,
	CheckboxIcon,
	CheckboxLabel,
} from '@/components/ui/checkbox';
import { HStack } from '@/components/ui/hstack';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { Box } from '@/components/ui/box';

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

// Importação das funções relacionadas a adição de ganho ao Firebase
import { getAllTagsFirebase } from '@/functions/TagFirebase';
import { getAllBanksFirebase } from '@/functions/BankFirebase';
import { addGainFirebase, getGainDataFirebase, updateGainFirebase } from '@/functions/GainFirebase';
import { auth } from '@/FirebaseConfig';
import { markMandatoryGainReceiptFirebase } from '@/functions/MandatoryGainFirebase';

// Importação dos icones
import { CheckIcon } from '@/components/ui/icon';

type OptionItem = {
	id: string;
	name: string;
	usageType?: 'expense' | 'gain';
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

export default function AddRegisterGainScreen() {
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

const params = useLocalSearchParams<{
	gainId?: string | string[];
	templateName?: string | string[];
	templateValueInCents?: string | string[];
	templateTagId?: string | string[];
	templateDescription?: string | string[];
	templateDueDay?: string | string[];
	templateTagName?: string | string[];
	templateMandatoryGainId?: string | string[];
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
		};
	}, [
		params.templateDescription,
		params.templateDueDay,
		params.templateTagName,
		params.templateMandatoryGainId,
		params.templateName,
		params.templateTagId,
		params.templateValueInCents,
	]);

	const [hasAppliedTemplate, setHasAppliedTemplate] = React.useState(false);
const linkedMandatoryGainId = React.useMemo(
	() => (templateData?.mandatoryGainId ? templateData.mandatoryGainId : null),
	[templateData],
);
const templateTagDisplayName = templateData?.tagName ?? null;
const isTemplateLocked = Boolean(linkedMandatoryGainId && !isEditing);

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
						setSelectedBankId(current =>
							current && formattedBanks.some(bank => bank.id === current) ? current : null,
						);
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
		}, [isTemplateLocked, templateData?.tagId]),
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

	const handleDateChange = React.useCallback((value: string) => {
		const sanitized = sanitizeDateInput(value);
		setGainDate(formatDateInput(sanitized));
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

		if (!selectedTagId) {
			showFloatingAlert({
				message: 'Selecione uma tag.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (!selectedBankId) {
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

		const parsedDate = parseDateFromBR(gainDate);

		if (!parsedDate) {
			showFloatingAlert({
				message: 'Informe uma data válida (DD/MM/AAAA).',
				action: 'error',
				position: 'bottom',
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
					tagId: selectedTagId ?? undefined,
					bankId: selectedBankId ?? undefined,
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

				showFloatingAlert({
					message: 'Ganho atualizado com sucesso!',
					action: 'success',
					position: 'bottom',
				});
				router.back();
				return;
			}

			const result = await addGainFirebase({
				name: gainName.trim(),
				valueInCents: gainValueCents,
				paymentFormats: paymentFormat,
				explanation: explanationGain?.trim() ? explanationGain.trim() : null,
				tagId: selectedTagId as string,
				bankId: selectedBankId as string,
				date: dateWithCurrentTime,
				personId,
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

			showFloatingAlert({
				message: 'Ganho registrado com sucesso!',
				action: 'success',
				position: 'bottom',
			});

			if (isTemplateLocked) {
				router.back();
				return;
			}

			setGainName('');
			setGainValueDisplay('');
			setGainValueCents(null);
			setGainDate(formatDateToBR(new Date()));
			setPaymentFormat([]);
			setExplanationGain(null);
			setSelectedTagId(null);
			setSelectedBankId(null);
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
		gainValueCents,
		isEditing,
		isTemplateLocked,
		linkedMandatoryGainId,
		paymentFormat,
		selectedBankId,
		selectedTagId,
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
						{isEditing ? 'Editar ganho' : 'Registro de Ganhos'}
					</Heading>

					<Text className="mb-6 text-center">
						{isEditing
							? 'Atualize os dados do ganho selecionado e salve as alterações.'
							: 'Informe os dados abaixo para registrar um novo ganho no sistema.'}
					</Text>

					<VStack className="gap-5">
						<Input isDisabled={isTemplateLocked}>
							<InputField
								placeholder="Nome do ganho"
								value={gainName}
								onChangeText={setGainName}
								autoCapitalize="sentences"
							/>
						</Input>

						<Input isDisabled={isTemplateLocked}>
							<InputField
								placeholder="Valor do ganho"
								value={gainValueDisplay}
								onChangeText={handleValueChange}
								keyboardType="numeric"
							/>
						</Input>

						<CheckboxGroup
							value={paymentFormat}
							onChange={(keys: string[]) => {
								setPaymentFormat(keys);
							}}
						>
							<HStack space="2xl">

								<Checkbox
									value="Salary"
									isDisabled={
										!gainValueDisplay || gainValueCents === 0 || paymentFormat.includes('Variable') || paymentFormat.includes('External')
									}
								>

									<CheckboxIndicator>
										<CheckboxIcon as={CheckIcon} />
									</CheckboxIndicator>

									<CheckboxLabel>Salário</CheckboxLabel>

								</Checkbox>

								<Checkbox
									value="Variable"
									isDisabled={
										!gainValueDisplay || gainValueCents === 0 || paymentFormat.includes('Salary') || paymentFormat.includes('External')
									}>

									<CheckboxIndicator>
										<CheckboxIcon as={CheckIcon} />
									</CheckboxIndicator>

									<CheckboxLabel>Renda variável</CheckboxLabel>

								</Checkbox>

								<Checkbox
									value="External"
									isDisabled={
										!gainValueDisplay || gainValueCents === 0 || paymentFormat.includes('Salary') || paymentFormat.includes('Variable')
									}>

									<CheckboxIndicator>
										<CheckboxIcon as={CheckIcon} />
									</CheckboxIndicator>

									<CheckboxLabel>Pagamento externo</CheckboxLabel>

								</Checkbox>

							</HStack>
						</CheckboxGroup>

						<Textarea
							size="md"
							isReadOnly={false}
							isInvalid={false}
							isDisabled={!paymentFormat || paymentFormat.length === 0}
							className="h-32"
						>
							<TextareaInput
								placeholder="(Opcional) Explique sobre esse ganho..."
								value={explanationGain ?? ''}
								onChangeText={setExplanationGain}
							/>
						</Textarea>

						{isTemplateLocked ? (
							<Box className="border border-outline-200 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
								<Text className="font-semibold mb-1">Tag do ganho obrigatório</Text>
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
											<SelectItem key={bank.id} label={bank.name} value={bank.id} />
										))
									) : (
										<SelectItem key="no-bank" label="Nenhum banco disponível" value="no-bank" isDisabled />
									)}
								</SelectContent>
							</SelectPortal>
						</Select>

						<Input>
							<InputField
								placeholder="Data do ganho (DD/MM/AAAA)"
								value={gainDate}
								onChangeText={handleDateChange}
								autoCorrect={false}
								keyboardType="numbers-and-punctuation"
							/>
						</Input>

						{isEditing && isLoadingExisting && (
							<Text className="text-sm text-gray-500 dark:text-gray-400">
								Carregando informações do ganho selecionado...
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
								!gainName.trim() ||
								gainValueCents === null ||
								!selectedTagId ||
								!selectedBankId ||
								!gainDate
							}
						>
							{isSubmitting ? (
								<ButtonSpinner />
							) : (
								<ButtonText>{isEditing ? 'Atualizar ganho' : 'Registrar ganho'}</ButtonText>
							)}
						</Button>
					</VStack>
				</View>
			</ScrollView>

			<Menu defaultValue={1} />
		</View>
	);
}
