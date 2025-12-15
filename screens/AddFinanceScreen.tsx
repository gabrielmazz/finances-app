import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
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
import { Divider } from '@/components/ui/divider';

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

import AddFinancialIllustration from '../assets/UnDraw/addFinancialScreen.svg';

import { redemptionTermLabels, RedemptionTerm } from '@/utils/finance';
import { auth } from '@/FirebaseConfig';
import { addFinanceInvestmentFirebase, getFinanceInvestmentsByPeriodFirebase } from '@/functions/FinancesFirebase';
import {
	getBanksWithUsersByPersonFirebase,
	getCurrentMonthSummaryByBankFirebaseExpanses,
	getCurrentMonthSummaryByBankFirebaseGains,
} from '@/functions/BankFirebase';
import { getMonthlyBalanceFirebaseRelatedToUser } from '@/functions/MonthlyBalanceFirebase';
import { useAppTheme } from '@/contexts/ThemeContext';
import DatePickerField from '@/components/uiverse/date-picker';

// Lista fixa com todas as opções de prazo descritas na solicitação.
const redemptionOptions: { value: RedemptionTerm; label: string }[] = [
	{ value: 'anytime', label: redemptionTermLabels.anytime },
	{ value: '1m', label: redemptionTermLabels['1m'] },
	{ value: '3m', label: redemptionTermLabels['3m'] },
	{ value: '6m', label: redemptionTermLabels['6m'] },
	{ value: '1y', label: redemptionTermLabels['1y'] },
	{ value: '2y', label: redemptionTermLabels['2y'] },
	{ value: '3y', label: redemptionTermLabels['3y'] },
];

const sanitizeNumberInput = (value: string) => value.replace(/[^\d.,]/g, '');

const parseStringToNumber = (value: string) => {
	if (!value.trim()) {
		return NaN;
	}
	const normalized = value.replace(/\./g, '').replace(',', '.');
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : NaN;
};

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

const formatCurrencyBRL = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(valueInCents / 100);

export default function AddFinanceScreen() {
	const { isDarkMode } = useAppTheme();
	const pageBackground = isDarkMode ? '#0b1220' : '#f4f5f7';
	// Estado para guardar o nome do investimento que o usuário está digitando.
	const [investmentName, setInvestmentName] = React.useState('');
	// Guardamos o valor inicial como string formatada e em centavos.
	const [initialValueInput, setInitialValueInput] = React.useState('');
	const [initialValueInCents, setInitialValueInCents] = React.useState<number | null>(null);
	// Guardamos o percentual do CDI informado pelo usuário.
	const [cdiInput, setCdiInput] = React.useState('');
	// Data informada para o investimento, sempre no formato brasileiro.
	const [investmentDate, setInvestmentDate] = React.useState(formatDateToBR(new Date()));
	// Estado que guarda o prazo selecionado dentre as opções fixas.
	const [selectedRedemptionTerm, setSelectedRedemptionTerm] = React.useState<RedemptionTerm>('anytime');
	// Flag simples para saber se estamos salvando e evitar envio duplicado.
	const [isSaving, setIsSaving] = React.useState(false);
	// Flag que exibimos depois de um salvamento bem sucedido para mostrar o texto de confirmação.
	const [hasSavedOnce, setHasSavedOnce] = React.useState(false);
	const [bankOptions, setBankOptions] = React.useState<{ id: string; name: string }[]>([]);
	const [isLoadingBanks, setIsLoadingBanks] = React.useState(false);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);
	const [currentBankBalanceInCents, setCurrentBankBalanceInCents] = React.useState<number | null>(null);
	const [isLoadingBankBalance, setIsLoadingBankBalance] = React.useState(false);

	const handleInitialValueChange = React.useCallback((value: string) => {
		const digitsOnly = value.replace(/\D/g, '');
		if (!digitsOnly) {
			setInitialValueInput('');
			setInitialValueInCents(null);
			setHasSavedOnce(false);
			return;
		}

		const centsValue = parseInt(digitsOnly, 10);
		setInitialValueInCents(centsValue);
		setInitialValueInput(formatCurrencyBRL(centsValue));
		setHasSavedOnce(false);
	}, []);

	// Verificamos se todos os campos obrigatórios foram preenchidos.
	const isFormValid = React.useMemo(() => {
		const parsedCdi = parseStringToNumber(cdiInput);
		const initialCents = typeof initialValueInCents === 'number' ? initialValueInCents : 0;
		const hasValidBalance =
			typeof currentBankBalanceInCents === 'number'
				? currentBankBalanceInCents >= 0 && initialCents > 0 && initialCents <= currentBankBalanceInCents
				: initialCents > 0;
		return (
			investmentName.trim().length > 0 &&
			initialCents > 0 &&
			parsedCdi > 0 &&
			Boolean(selectedBankId) &&
			Boolean(parseDateFromBR(investmentDate)) &&
			hasValidBalance
		);
	}, [investmentName, initialValueInCents, cdiInput, selectedBankId, investmentDate, currentBankBalanceInCents]);

	// Função utilitária para limpar o formulário após o salvamento.
	const resetForm = React.useCallback(() => {
		setInvestmentName('');
		setInitialValueInput('');
		setInitialValueInCents(null);
		setCdiInput('');
		setInvestmentDate(formatDateToBR(new Date()));
		setSelectedRedemptionTerm('anytime');
		setSelectedBankId(null);
		setCurrentBankBalanceInCents(null);
		setIsLoadingBankBalance(false);
	}, []);

	const loadBanks = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showFloatingAlert({
				message: 'Usuário não autenticado. Faça login novamente.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		setIsLoadingBanks(true);
		try {
			const banksResponse = await getBanksWithUsersByPersonFirebase(currentUser.uid);
			if (!banksResponse.success || !Array.isArray(banksResponse.data)) {
				throw new Error('Erro ao carregar bancos.');
			}

			const formatted = (banksResponse.data as Array<Record<string, any>>).map(bank => ({
				id: String(bank.id),
				name:
					typeof bank.name === 'string' && bank.name.trim().length > 0
						? bank.name.trim()
						: 'Banco sem nome',
			}));
			setBankOptions(formatted);
			setSelectedBankId(current => (current && formatted.some(bank => bank.id === current) ? current : null));

			if (formatted.length === 0) {
				showFloatingAlert({
					message: 'Cadastre um banco antes de registrar investimentos.',
					action: 'warning',
					position: 'bottom',
				});
			}
		} catch (error) {
			console.error('Erro ao carregar bancos:', error);
			showFloatingAlert({
				message: 'Não foi possível carregar os bancos.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsLoadingBanks(false);
		}
	}, []);

	useFocusEffect(
		React.useCallback(() => {
			void loadBanks();
		}, [loadBanks]),
	);

	const handleDateSelect = React.useCallback((formatted: string) => {
		setInvestmentDate(formatted);
		setHasSavedOnce(false);
	}, []);

	React.useEffect(() => {
		if (!selectedBankId) {
			setCurrentBankBalanceInCents(null);
			setIsLoadingBankBalance(false);
			return;
		}

		let isMounted = true;
		setIsLoadingBankBalance(true);
		setCurrentBankBalanceInCents(null);

		const loadBankBalance = async () => {
			try {
				const currentUser = auth.currentUser;
				if (!currentUser) {
					showFloatingAlert({
						message: 'Usuário não autenticado. Faça login novamente.',
						action: 'error',
						position: 'bottom',
					});
					return;
				}

				const now = new Date();
				const currentYear = now.getFullYear();
				const currentMonth = now.getMonth() + 1;
				const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
				const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

				const [expensesResult, gainsResult, balanceResponse, investmentsResult] = await Promise.all([
					getCurrentMonthSummaryByBankFirebaseExpanses(currentUser.uid),
					getCurrentMonthSummaryByBankFirebaseGains(currentUser.uid),
					getMonthlyBalanceFirebaseRelatedToUser({
						personId: currentUser.uid,
						bankId: selectedBankId,
						year: currentYear,
						month: currentMonth,
					}),
					getFinanceInvestmentsByPeriodFirebase({
						personId: currentUser.uid,
						bankId: selectedBankId,
						startDate: startOfMonth,
						endDate: endOfMonth,
					}),
				]);

				if (!isMounted) {
					return;
				}

				const expensesArray: any[] =
					expensesResult?.success && Array.isArray(expensesResult.data) ? expensesResult.data : [];
				const gainsArray: any[] =
					gainsResult?.success && Array.isArray(gainsResult.data) ? gainsResult.data : [];
				const investmentsArray: any[] =
					investmentsResult?.success && Array.isArray(investmentsResult.data) ? investmentsResult.data : [];

				const totalExpensesInCents = expensesArray.reduce((acc, item) => {
					const bankId = typeof item?.bankId === 'string' ? item.bankId : null;
					const value =
						typeof item?.valueInCents === 'number' && !Number.isNaN(item.valueInCents)
							? item.valueInCents
							: 0;
					if (bankId === selectedBankId) {
						return acc + value;
					}
					return acc;
				}, 0);

				const totalInvestmentInCents = investmentsArray.reduce((acc, item) => {
					const bankId = typeof item?.bankId === 'string' ? item.bankId : null;
					const value =
						typeof item?.currentValueInCents === 'number' && !Number.isNaN(item.currentValueInCents)
							? item.currentValueInCents
							: typeof item?.lastManualSyncValueInCents === 'number' && !Number.isNaN(item.lastManualSyncValueInCents)
								? item.lastManualSyncValueInCents
								: typeof item?.initialValueInCents === 'number' && !Number.isNaN(item.initialValueInCents)
									? item.initialValueInCents
									: 0;
					if (bankId === selectedBankId) {
						return acc + value;
					}
					return acc;
				}, 0);

				const totalGainsInCents = gainsArray.reduce((acc, item) => {
					const bankId = typeof item?.bankId === 'string' ? item.bankId : null;
					const value =
						typeof item?.valueInCents === 'number' && !Number.isNaN(item.valueInCents)
							? item.valueInCents
							: 0;
					if (bankId === selectedBankId) {
						return acc + value;
					}
					return acc;
				}, 0);

				const initialBalance =
					balanceResponse?.success && balanceResponse.data && typeof balanceResponse.data.valueInCents === 'number'
						? balanceResponse.data.valueInCents
						: null;

				const currentBalance =
					typeof initialBalance === 'number'
						? initialBalance + (totalGainsInCents - (totalExpensesInCents + totalInvestmentInCents))
						: null;

				setCurrentBankBalanceInCents(currentBalance);
			} catch (error) {
				console.error('Erro ao carregar saldo do banco:', error);
				if (isMounted) {
					showFloatingAlert({
						message: 'Não foi possível carregar o saldo atual do banco.',
						action: 'error',
						position: 'bottom',
					});
					setCurrentBankBalanceInCents(null);
				}
			} finally {
				if (isMounted) {
					setIsLoadingBankBalance(false);
				}
			}
		};

		void loadBankBalance();

		return () => {
			isMounted = false;
		};
	}, [selectedBankId]);

	// Função responsável por salvar o investimento simples no Firebase.
	const handleSaveInvestment = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showFloatingAlert({
				message: 'Usuário não autenticado. Faça login novamente.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (!isFormValid || isSaving || !selectedBankId) {
			return;
		}

		const parsedInitial = typeof initialValueInCents === 'number' ? initialValueInCents / 100 : NaN;
		const parsedCdi = parseStringToNumber(cdiInput);
		const initialInCents = typeof initialValueInCents === 'number' ? initialValueInCents : Math.round(parsedInitial * 100);

		if (!Number.isFinite(parsedInitial) || parsedInitial <= 0 || !Number.isFinite(initialInCents) || initialInCents <= 0) {
			showFloatingAlert({
				message: 'Informe um valor inicial válido.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		if (typeof currentBankBalanceInCents === 'number') {
			if (currentBankBalanceInCents < 0) {
				showFloatingAlert({
					message: 'O saldo do banco está negativo. Regularize antes de investir.',
					action: 'warning',
					position: 'bottom',
				});
				return;
			}

			if (initialInCents > currentBankBalanceInCents) {
				showFloatingAlert({
					message: 'Saldo insuficiente para registrar este investimento.',
					action: 'warning',
					position: 'bottom',
				});
				return;
			}
		}

		if (!Number.isFinite(parsedCdi) || parsedCdi <= 0) {
			showFloatingAlert({
				message: 'Informe um CDI válido.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		const parsedDate = parseDateFromBR(investmentDate);
		if (!parsedDate) {
			showFloatingAlert({
				message: 'Informe uma data válida (DD/MM/AAAA).',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		const dateWithCurrentTime = mergeDateWithCurrentTime(parsedDate);
		const bankSnapshotName = selectedBankId
			? bankOptions.find(bank => bank.id === selectedBankId)?.name ?? null
			: null;

		setIsSaving(true);
		try {
			const result = await addFinanceInvestmentFirebase({
				name: investmentName.trim(),
				initialValueInCents: initialInCents,
				currentValueInCents: initialInCents,
				cdiPercentage: parsedCdi,
				redemptionTerm: selectedRedemptionTerm,
				bankId: selectedBankId,
				personId: currentUser.uid,
				date: dateWithCurrentTime,
				bankNameSnapshot: bankSnapshotName,
			});

			if (!result.success) {
				throw new Error('Erro ao registrar investimento no Firebase.');
			}

			setHasSavedOnce(true);
			showFloatingAlert({
				message: 'Investimento salvo com sucesso!',
				action: 'success',
				position: 'bottom',
			});
			resetForm();

			// Após salvar conduzimos o usuário para a lista, deixando claro que tudo está separado do restante do app.
			router.push('/financial-list');
		} catch (error) {
			console.error(error);
			showFloatingAlert({
				message: 'Não foi possível salvar o investimento agora. Tente novamente.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSaving(false);
		}
	}, [
		isFormValid,
		isSaving,
		initialValueInput,
		cdiInput,
		investmentName,
		selectedRedemptionTerm,
		resetForm,
		investmentDate,
		bankOptions,
		selectedBankId,
	]);

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: pageBackground }}>
			<StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={pageBackground} />
			<View
				className="
					flex-1 w-full h-full
					mt-[64px]
					items-center
					justify-between
					pb-6
					relative
				"
				style={{ backgroundColor: pageBackground }}
			>
				<FloatingAlertViewport />
				<KeyboardAvoidingView
					behavior={Platform.OS === 'ios' ? 'padding' : undefined}
					className="flex-1 w-full"
				>
					<ScrollView
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="interactive"
						style={{ backgroundColor: pageBackground }}
						contentContainerStyle={{
							flexGrow: 1,
							paddingBottom: 48,
							backgroundColor: pageBackground,
						}}
					>
						<View className="w-full px-6">
						<VStack className="gap-4 items-center">
							<Heading size="3xl" className="text-center">
								Registrar investimento
							</Heading>

							<Box className="w-full items-center mt-4 mb-2">
								<AddFinancialIllustration width={180} height={180} />
							</Box>

							<Text className="text-justify text-gray-600 dark:text-gray-400">
								Adicione seus investimentos financeiros de forma independente. Eles ficarão disponíveis na
								lista separada de investimentos, facilitando o acompanhamento.
							</Text>

						</VStack>

						<Divider className="my-4" />

						<VStack className="gap-4">
							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Nome do investimento
								</Text>
								<Input>
									<InputField
										value={investmentName}
										onChangeText={text => {
											// Mantemos o estado sempre atualizado enquanto o usuário digita.
											setInvestmentName(text);
											setHasSavedOnce(false);
										}}
										placeholder="Ex: CDB Banco X"
										autoCapitalize="sentences"
										returnKeyType="next"
									/>
								</Input>
							</Box>

							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Valor inicial investido
								</Text>
								<Input>
									<InputField
										value={initialValueInput}
										onChangeText={handleInitialValueChange}
										placeholder="Ex: R$ 1.500,00"
										keyboardType="numeric"
									/>
								</Input>
							</Box>

							<DatePickerField
								label="Dia do investimento"
								value={investmentDate}
								onChange={formatted => handleDateSelect(formatted)}
							/>

							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">CDI (%)</Text>
								<Input>
									<InputField
										value={cdiInput}
										onChangeText={text => {
											setCdiInput(sanitizeNumberInput(text));
											setHasSavedOnce(false);
										}}
										placeholder="Ex: 110"
										keyboardType="decimal-pad"
									/>
								</Input>
							</Box>

							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Prazo para resgate
								</Text>
								<Select
									selectedValue={selectedRedemptionTerm}
									onValueChange={value => {
										// O componente Select devolve string, por isso forçamos para o tipo definido.
										setSelectedRedemptionTerm(value as RedemptionTerm);
										setHasSavedOnce(false);
									}}
								>
									<SelectTrigger>
										<SelectInput
											placeholder="Escolha uma opção"
											value={redemptionTermLabels[selectedRedemptionTerm]}
										/>
										<SelectIcon />
									</SelectTrigger>
									<SelectPortal>
										<SelectBackdrop />
										<SelectContent>
											<SelectDragIndicatorWrapper>
												<SelectDragIndicator />
											</SelectDragIndicatorWrapper>
											{redemptionOptions.map(option => (
												<SelectItem
													key={option.value}
													label={option.label}
													value={option.value}
												/>
											))}
										</SelectContent>
									</SelectPortal>
								</Select>
							</Box>

							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Banco vinculado
								</Text>
								<Select
									selectedValue={selectedBankId ?? undefined}
									onValueChange={value => {
										setSelectedBankId(value);
										setHasSavedOnce(false);
									}}
									isDisabled={isLoadingBanks || bankOptions.length === 0}
								>
									<SelectTrigger>
										<SelectInput
											placeholder="Selecione o banco onde o investimento está registrado"
											value={
												selectedBankId
													? bankOptions.find(bank => bank.id === selectedBankId)?.name ?? ''
													: ''
											}
										/>
										<SelectIcon />
									</SelectTrigger>
									<SelectPortal>
										<SelectBackdrop />
										<SelectContent>
											<SelectDragIndicatorWrapper>
												<SelectDragIndicator />
											</SelectDragIndicatorWrapper>
											{bankOptions.length > 0 ? (
												bankOptions.map(bank => (
													<SelectItem key={bank.id} label={bank.name} value={bank.id} />
												))
											) : (
												<SelectItem label="Nenhum banco disponível" value="no-bank" isDisabled />
											)}
										</SelectContent>
									</SelectPortal>
								</Select>
							</Box>

							<Box>
								<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
									Saldo atual do banco
								</Text>
								<Input isDisabled>
									<InputField
										value={
											!selectedBankId
												? 'Selecione um banco para visualizar o saldo'
												: isLoadingBankBalance
													? 'Carregando saldo...'
													: typeof currentBankBalanceInCents === 'number'
														? formatCurrencyBRL(currentBankBalanceInCents)
														: 'Saldo indisponível'
										}
									/>
								</Input>
							</Box>

							<Button
								className="mt-2"
								variant="outline"
								onPress={handleSaveInvestment}
								isDisabled={!isFormValid || isSaving}
							>
								{isSaving ? (
									<>
										<ButtonSpinner color="white" />
										<ButtonText>Salvando</ButtonText>
									</>
								) : (
									<ButtonText>Salvar investimento</ButtonText>
								)}
							</Button>

							{hasSavedOnce && (
								<HStack className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 items-center justify-between">
									<Text className="text-emerald-700 flex-1 pr-2">
										Pronto! O investimento está disponível na lista independente.
									</Text>
									<Button variant="link" action="primary" onPress={() => router.push('/financial-list')}>
										<ButtonText>Ver lista</ButtonText>
									</Button>
								</HStack>
							)}
						</VStack>
						</View>
					</ScrollView>
				</KeyboardAvoidingView>

				<Menu defaultValue={1} />
			</View>
		</SafeAreaView>
	);
}
