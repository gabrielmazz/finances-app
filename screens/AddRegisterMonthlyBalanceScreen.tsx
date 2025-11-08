import React from 'react';
import { ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

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

import { getAllBanksFirebase } from '@/functions/BankFirebase';
import { getMonthlyBalanceFirebase, upsertMonthlyBalanceFirebase } from '@/functions/MonthlyBalanceFirebase';
import { auth } from '@/FirebaseConfig';


const formatCurrencyBRL = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format((valueInCents ?? 0) / 100);

const formatMonthReference = (date: Date) => {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const year = String(date.getFullYear());
	return `${month}/${year}`;
};

const sanitizeMonthInput = (value: string) => value.replace(/\D/g, '').slice(0, 6);

const formatMonthInput = (value: string) => {
	if (value.length <= 2) {
		return value;
	}
	return `${value.slice(0, 2)}/${value.slice(2)}`;
};

const parseMonthReference = (value: string) => {
	const [monthStr, yearStr] = value.split('/');
	const month = Number(monthStr);
	const year = Number(yearStr);

	if (
		Number.isNaN(month) ||
		Number.isNaN(year) ||
		month < 1 ||
		month > 12 ||
		year < 1900
	) {
		return null;
	}

	return { month, year };
};

type OptionItem = {
	id: string;
	name: string;
};

export default function AddRegisterMonthlyBalanceScreen() {
	const [banks, setBanks] = React.useState<OptionItem[]>([]);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);
	const [isLoadingBanks, setIsLoadingBanks] = React.useState(false);

	const [monthReference, setMonthReference] = React.useState(() => formatMonthReference(new Date()));
	const [balanceDisplay, setBalanceDisplay] = React.useState('');
	const [balanceValueInCents, setBalanceValueInCents] = React.useState<number | null>(null);

	const [existingBalanceId, setExistingBalanceId] = React.useState<string | null>(null);
	const [isLoadingExisting, setIsLoadingExisting] = React.useState(false);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const balanceInputValue = React.useMemo(
		() => (balanceDisplay ? balanceDisplay : balanceValueInCents !== null ? formatCurrencyBRL(balanceValueInCents) : ''),
		[balanceDisplay, balanceValueInCents],
	);

	useFocusEffect(
		React.useCallback(() => {
			let isMounted = true;

			const loadBanks = async () => {
				setIsLoadingBanks(true);

				try {
					const banksResult = await getAllBanksFirebase();

					if (!isMounted) {
						return;
					}

					if (banksResult.success && Array.isArray(banksResult.data)) {
						const formattedBanks = banksResult.data.map((bank: any) => ({
							id: bank.id,
							name: typeof bank?.name === 'string' && bank.name.trim().length > 0 ? bank.name.trim() : 'Banco sem nome',
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
					console.error('Erro ao carregar bancos:', error);
					if (isMounted) {
						showFloatingAlert({
							message: 'Erro inesperado ao carregar os bancos.',
							action: 'error',
							position: 'bottom',
						});
					}
				} finally {
					if (isMounted) {
						setIsLoadingBanks(false);
					}
				}
			};

			loadBanks();

			return () => {
				isMounted = false;
			};
		}, []),
	);

	const handleBalanceChange = React.useCallback((input: string) => {
		const digitsOnly = input.replace(/\D/g, '');
		if (!digitsOnly) {
			setBalanceDisplay('');
			setBalanceValueInCents(null);
			return;
		}

		const centsValue = parseInt(digitsOnly, 10);
		setBalanceDisplay(formatCurrencyBRL(centsValue));
		setBalanceValueInCents(centsValue);
	}, []);

	const fetchExistingBalance = React.useCallback(
		async (options?: { targetBankId?: string | null; targetMonthReference?: string }) => {
			const bankIdToUse = options?.targetBankId ?? selectedBankId;

			if (!bankIdToUse) {
				setExistingBalanceId(null);
				return;
			}

			const monthReferenceToUse = options?.targetMonthReference ?? monthReference;

			const parsedMonth = parseMonthReference(monthReferenceToUse);
			if (!parsedMonth) {
				setExistingBalanceId(null);
				return;
			}

			const currentUser = auth.currentUser;
			if (!currentUser) {
				showFloatingAlert({
					message: 'Usuário não autenticado. Faça login novamente.',
					action: 'error',
					position: 'bottom',
				});
				return;
			}

			setIsLoadingExisting(true);

			try {
				const response = await getMonthlyBalanceFirebase({
					personId: currentUser.uid,
					bankId: bankIdToUse,
					year: parsedMonth.year,
					month: parsedMonth.month,
				});

				if (response.success && response.data) {
					const value = typeof response.data.valueInCents === 'number' ? response.data.valueInCents : 0;
					setExistingBalanceId(response.data.id);
					setBalanceDisplay(formatCurrencyBRL(value));
					setBalanceValueInCents(value);
				} else {
					setExistingBalanceId(null);
					setBalanceDisplay('');
					setBalanceValueInCents(null);
				}
			} catch (error) {
				console.error('Erro ao obter saldo mensal:', error);
				showFloatingAlert({
					message: 'Erro ao buscar o saldo registrado para este mês.',
					action: 'error',
					position: 'bottom',
				});
			} finally {
				setIsLoadingExisting(false);
			}
		},
		[selectedBankId, monthReference],
	);

	const handleMonthChange = React.useCallback(
		(value: string) => {
			const sanitized = sanitizeMonthInput(value);
			const formatted = formatMonthInput(sanitized);
			setMonthReference(formatted);

			if (parseMonthReference(formatted)) {
				void fetchExistingBalance({ targetMonthReference: formatted });
			} else {
				setExistingBalanceId(null);
			}
		},
		[fetchExistingBalance],
	);

	React.useEffect(() => {
		void fetchExistingBalance();
	}, [fetchExistingBalance]);

	const handleSubmit = React.useCallback(async () => {
		if (!selectedBankId) {
			showFloatingAlert({
				message: 'Selecione um banco para registrar o saldo.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		const parsedMonth = parseMonthReference(monthReference);
		if (!parsedMonth) {
			showFloatingAlert({
				message: 'Informe um mês válido no formato MM/AAAA.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (balanceValueInCents === null) {
			showFloatingAlert({
				message: 'Informe o saldo disponível no início do mês.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		const currentUser = auth.currentUser;
		if (!currentUser) {
			showFloatingAlert({
				message: 'Usuário não autenticado. Faça login novamente.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		setIsSubmitting(true);

		try {
			const response = await upsertMonthlyBalanceFirebase({
				personId: currentUser.uid,
				bankId: selectedBankId,
				year: parsedMonth.year,
				month: parsedMonth.month,
				valueInCents: balanceValueInCents,
			});

			if (!response.success) {
				throw new Error('Erro ao salvar saldo.');
			}

			setExistingBalanceId(response.id);
			showFloatingAlert({
				message: 'Saldo mensal registrado com sucesso!',
				action: 'success',
				position: 'bottom',
			});
		} catch (error) {
			console.error('Erro ao registrar saldo mensal:', error);
			showFloatingAlert({
				message: 'Não foi possível registrar o saldo. Tente novamente.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSubmitting(false);
		}
	}, [selectedBankId, monthReference, balanceValueInCents]);

	const hasValidMonthReference = parseMonthReference(monthReference) !== null;
	const isBalanceInputDisabled = !selectedBankId || !hasValidMonthReference;

	const isSaveDisabled =
		!selectedBankId || !monthReference || !hasValidMonthReference || balanceValueInCents === null || isSubmitting;

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
						Saldo mensal por banco
					</Heading>

					<Text className="text-center text-gray-600 dark:text-gray-400 mb-6">
						Registre o saldo disponível em cada banco no início de um mês específico. Caso já exista um registro,
						você poderá atualizá-lo.
					</Text>

					<VStack className="gap-5">
						<View>
							<Select
								selectedValue={selectedBankId}
								onValueChange={value => setSelectedBankId(value)}
								isDisabled={isLoadingBanks || banks.length === 0}
							>
								<SelectTrigger className="">
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
											banks.map(bank => <SelectItem label={bank.name} value={bank.id} key={bank.id} />)
										) : (
											<SelectItem label="Nenhum banco disponível" value="no-bank" isDisabled />
										)}
									</SelectContent>
								</SelectPortal>
							</Select>
						</View>

						<Input>
							<InputField
								placeholder="Mês de referência (MM/AAAA)"
								value={monthReference}
								onChangeText={handleMonthChange}
								keyboardType="numeric"
							/>
						</Input>

						<Input isDisabled={isBalanceInputDisabled}>
							<InputField
								placeholder="Saldo disponível"
								value={balanceInputValue}
								onChangeText={handleBalanceChange}
								keyboardType="numeric"
								editable={!isBalanceInputDisabled}
							/>
						</Input>

						{isLoadingExisting ? (
							<Text className="text-sm text-gray-500 dark:text-gray-400">
								Verificando saldo registrado para este mês...
							</Text>
						) : existingBalanceId ? (
							<Text className="text-sm text-emerald-600 dark:text-emerald-400">
								Já existe um saldo registrado para este banco no mês informado. Ao salvar, o valor será atualizado.
							</Text>
						) : (
							<Text className="text-sm text-gray-500 dark:text-gray-400">
								Nenhum saldo registrado para este banco neste mês.
							</Text>
						)}

						<Button
							size="md"
							variant="outline"
							onPress={handleSubmit}
							isDisabled={
								isSaveDisabled || selectedBankId === null || monthReference.length < 7 || balanceValueInCents === null
							}
						>
							{isSubmitting ? (
								<>
									<ButtonSpinner color="white" />
									<ButtonText>{existingBalanceId ? 'Atualizando saldo' : 'Salvando saldo'}</ButtonText>
								</>
							) : (
								<ButtonText>{existingBalanceId ? 'Editar saldo' : 'Registrar saldo'}</ButtonText>
							)}
						</Button>
					</VStack>
				</View>
			</ScrollView>

			<Menu defaultValue={1} />
		</View>
	);
}
