import React from 'react';
import { Keyboard, ScrollView, TouchableWithoutFeedback, View } from 'react-native';

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

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

import { getAllTagsFirebase } from '@/functions/TagFirebase';
import { getAllBanksFirebase } from '@/functions/BankFirebase';
import { addExpenseFirebase } from '@/functions/ExpenseFirebase';

type OptionItem = {
	id: string;
	name: string;
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

	React.useEffect(() => {

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

					const formattedTags = tagsResult.data.map((tag: any) => ({
						id: tag.id,
						name: tag.name,
					}));

					setTags(formattedTags);
					setSelectedTagId(current => current ?? (formattedTags[0]?.id ?? null));

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
					setSelectedBankId(current => current ?? (formattedBanks[0]?.id ?? null));

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

		loadOptions();

		return () => {
			isMounted = false;
		};
	}, []);

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

		setIsSubmitting(true);

		try {
			const result = await addExpenseFirebase({
				name: expenseName.trim(),
				valueInCents: expenseValueCents,
				tagId: selectedTagId as string,
				bankId: selectedBankId as string,
				date: parsedDate,
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

			showFloatingAlert({
				message: 'Despesa registrada com sucesso!',
				action: 'success',
				position: 'bottom',
				offset: 40,
			});

			setExpenseName('');
			setExpenseValueDisplay('');
			setExpenseValueCents(null);
			setExpenseDate(formatDateToBR(new Date()));
		} catch (error) {
			console.error('Erro ao registrar despesa:', error);
			showFloatingAlert({
				message: 'Erro inesperado ao registrar despesa.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
		} finally {
			setIsSubmitting(false);
		}
		
	}, [expenseDate, expenseName, expenseValueCents, selectedBankId, selectedTagId]);

	const tagPlaceholder = 'Selecione uma tag';
	const bankPlaceholder = 'Selecione um banco';

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
							Registro de Despesas
						</Heading>

						<Text className="mb-6 text-center">
							Preencha os dados abaixo para cadastrar uma nova despesa no sistema.
						</Text>

						<VStack className="gap-5">
							<Input>
								<InputField
									placeholder="Nome da despesa"
									value={expenseName}
									onChangeText={setExpenseName}
									autoCapitalize="sentences"
								/>
							</Input>

							<Input>
								<InputField
									placeholder="Valor da despesa"
									value={expenseValueDisplay}
									onChangeText={handleValueChange}
									keyboardType="numeric"
								/>
							</Input>

							<Select
								selectedValue={selectedTagId}
								onValueChange={setSelectedTagId}
								initialLabel={tagPlaceholder}
								isDisabled={isLoadingTags || tags.length === 0}
							>
								<SelectTrigger>
									<SelectInput placeholder={tagPlaceholder} />
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
												<SelectItem
													key={tag.id}
													label={tag.name}
													value={tag.id}
													textValue={tag.name}
												/>
											))
										) : (
											<SelectItem
												key="no-tag"
												label="Nenhuma tag disponível"
												value="no-tag"
												textValue="Nenhuma tag disponível"
												isDisabled
											/>
										)}
									</SelectContent>
								</SelectPortal>
							</Select>

							<Select
								selectedValue={selectedBankId}
								onValueChange={setSelectedBankId}
								initialLabel={bankPlaceholder}
								isDisabled={isLoadingBanks || banks.length === 0}
							>
								<SelectTrigger>
									<SelectInput placeholder={bankPlaceholder} />
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
													textValue={bank.name}
												/>
											))
										) : (
											<SelectItem
												key="no-bank"
												label="Nenhum banco disponível"
												value="no-bank"
												textValue="Nenhum banco disponível"
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

							<Button
								className="w-full mt-2"
								size="sm"
								variant="outline"
								onPress={handleSubmit}
								isDisabled={isSubmitting}
							>
								{isSubmitting ? (
									<ButtonSpinner />
								) : (
									<ButtonText>Registrar Despesa</ButtonText>
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
