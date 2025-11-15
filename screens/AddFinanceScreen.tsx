import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
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
import { addFinanceInvestmentFirebase } from '@/functions/FinancesFirebase';
import { getBanksWithUsersByPersonFirebase } from '@/functions/BankFirebase';

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

export default function AddFinanceScreen() {
	// Estado para guardar o nome do investimento que o usuário está digitando.
	const [investmentName, setInvestmentName] = React.useState('');
	// Guardamos o valor inicial como string para facilitar a edição pelo usuário.
	const [initialValueInput, setInitialValueInput] = React.useState('');
	// Guardamos o percentual do CDI informado pelo usuário.
	const [cdiInput, setCdiInput] = React.useState('');
	// Estado que guarda o prazo selecionado dentre as opções fixas.
	const [selectedRedemptionTerm, setSelectedRedemptionTerm] = React.useState<RedemptionTerm>('anytime');
	// Flag simples para saber se estamos salvando e evitar envio duplicado.
	const [isSaving, setIsSaving] = React.useState(false);
	// Flag que exibimos depois de um salvamento bem sucedido para mostrar o texto de confirmação.
	const [hasSavedOnce, setHasSavedOnce] = React.useState(false);
	const [bankOptions, setBankOptions] = React.useState<{ id: string; name: string }[]>([]);
	const [isLoadingBanks, setIsLoadingBanks] = React.useState(false);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);

	// Verificamos se todos os campos obrigatórios foram preenchidos.
	const isFormValid = React.useMemo(() => {
		const parsedInitial = parseStringToNumber(initialValueInput);
		const parsedCdi = parseStringToNumber(cdiInput);
		return investmentName.trim().length > 0 && parsedInitial > 0 && parsedCdi > 0 && Boolean(selectedBankId);
	}, [investmentName, initialValueInput, cdiInput, selectedBankId]);

	// Função utilitária para limpar o formulário após o salvamento.
	const resetForm = React.useCallback(() => {
		setInvestmentName('');
		setInitialValueInput('');
		setCdiInput('');
		setSelectedRedemptionTerm('anytime');
		setSelectedBankId(null);
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

		const parsedInitial = parseStringToNumber(initialValueInput);
		const parsedCdi = parseStringToNumber(cdiInput);

		if (!Number.isFinite(parsedInitial) || parsedInitial <= 0) {
			showFloatingAlert({
				message: 'Informe um valor inicial válido.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		if (!Number.isFinite(parsedCdi) || parsedCdi <= 0) {
			showFloatingAlert({
				message: 'Informe um CDI válido.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		setIsSaving(true);
		try {
			const result = await addFinanceInvestmentFirebase({
				name: investmentName.trim(),
				initialValueInCents: Math.round(parsedInitial * 100),
				cdiPercentage: parsedCdi,
				redemptionTerm: selectedRedemptionTerm,
				bankId: selectedBankId,
				personId: currentUser.uid,
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
	]);

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
			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}
				className="flex-1 w-full"
			>
				<ScrollView
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="interactive"
					contentContainerStyle={{
						flexGrow: 1,
						paddingBottom: 48,
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
								Essa é uma tela simples e independente para você testar o cadastro de investimentos.
								Todas as informações ficam apenas no dispositivo.
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
										onChangeText={text => {
											// Sanitizamos para aceitar apenas números, vírgula e ponto.
											setInitialValueInput(sanitizeNumberInput(text));
											setHasSavedOnce(false);
										}}
										placeholder="Ex: 1500,00"
										keyboardType="decimal-pad"
									/>
								</Input>
							</Box>

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
	);
}
