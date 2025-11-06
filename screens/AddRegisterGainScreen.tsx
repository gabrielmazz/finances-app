import React from 'react';
import { Keyboard, ScrollView, TouchableWithoutFeedback, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

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

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

// Importação das funções relacionadas a adição de ganho ao Firebase
import { getAllTagsFirebase } from '@/functions/TagFirebase';
import { getAllBanksFirebase } from '@/functions/BankFirebase';
import { addGainFirebase } from '@/functions/GainFirebase';
import { auth } from '@/FirebaseConfig';

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

	const [paymentFormat, setPaymentFormat] = React.useState<string[]>([]);
	const [explanationGain, setExplanationGain] = React.useState<string | null>(null);

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
								return usageType === 'gain' || usageType === undefined || usageType === null;
							})
							.map((tag: any) => ({
								id: tag.id,
								name: tag.name,
								usageType: typeof tag?.usageType === 'string' ? tag.usageType : undefined,
							}));

						setTags(formattedTags);
						setSelectedTagId(current =>
							current && formattedTags.some(tag => tag.id === current) ? current : null,
						);

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
		}, []),
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

			const result = await addGainFirebase({
				name: gainName.trim(),
				valueInCents: gainValueCents,
				paymentFormats: paymentFormat,
				explanation: explanationGain?.trim() ? explanationGain.trim() : null,
				tagId: selectedTagId as string,
				bankId: selectedBankId as string,
				date: parsedDate,
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

			showFloatingAlert({
				message: 'Ganho registrado com sucesso!',
				action: 'success',
				position: 'bottom',
			});

			setGainName('');
			setGainValueDisplay('');
			setGainValueCents(null);
			setGainDate(formatDateToBR(new Date()));
		} catch (error) {
			console.error('Erro ao registrar ganho:', error);
			showFloatingAlert({
				message: 'Erro inesperado ao registrar ganho.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSubmitting(false);
		}
	}, [gainDate, gainName, gainValueCents, selectedBankId, selectedTagId]);


	return (
		<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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
					contentContainerStyle={{
						flexGrow: 1,
						paddingBottom: 48,
					}}
				>
					<View className="w-full px-6">
						<Heading size="3xl" className="text-center mb-6">
							Registro de Ganhos
						</Heading>

						<Text className="mb-6 text-center">
							Informe os dados abaixo para registrar um novo ganho no sistema.
						</Text>

						<VStack className="gap-5">
							<Input>
								<InputField
									placeholder="Nome do ganho"
									value={gainName}
									onChangeText={setGainName}
									autoCapitalize="sentences"
								/>
							</Input>

							<Input>
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

							<Button
								className="w-full mt-2"
								size="sm"
								variant="outline"
								onPress={handleSubmit}
								isDisabled={
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
									<ButtonText>Registrar Ganho</ButtonText>
								)}
							</Button>
						</VStack>
					</View>
				</ScrollView>

				<Menu defaultValue={1} />
			</View>
		</TouchableWithoutFeedback>
	);
}
