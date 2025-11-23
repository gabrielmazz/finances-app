import React from 'react';
import { ScrollView, View, StatusBar } from 'react-native';
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
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { HStack } from '@/components/ui/hstack';
import { Switch } from '@/components/ui/switch';
import { Box } from '@/components/ui/box';

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

import { auth } from '@/FirebaseConfig';
import { getAllTagsFirebase } from '@/functions/TagFirebase';
import {
	addMandatoryExpenseFirebase,
	getMandatoryExpenseFirebase,
	updateMandatoryExpenseFirebase,
	clearMandatoryExpensePaymentFirebase,
} from '@/functions/MandatoryExpenseFirebase';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import {
	cancelMandatoryExpenseNotification,
	ensureNotificationPermissionForMandatoryExpenses,
	scheduleMandatoryExpenseNotification,
} from '@/utils/mandatoryExpenseNotifications';
import { getCurrentCycleKey, isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import { deleteExpenseFirebase } from '@/functions/ExpenseFirebase';

// Importação do SVG
import AddMandatoryExpensesListIllustration from '../assets/UnDraw/addMandatoryExpensesScreen.svg';
import { Divider } from '@/components/ui/divider';
import { useAppTheme } from '@/contexts/ThemeContext';

type TagOption = { id: string; name: string };
type PaymentInfo = {
	expenseId: string | null;
	paidAt: Date | null;
	cycleKey: string | null;
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

const formatValueInput = (value: string) => value.replace(/\D/g, '');
const sanitizeDueDay = (value: string) => value.replace(/\D/g, '').slice(0, 2);
const normalizeDateValue = (value: unknown): Date | null => {
	if (!value) {
		return null;
	}
	if (value instanceof Date) {
		return value;
	}
	if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
		return (value as { toDate?: () => Date }).toDate?.() ?? null;
	}
	if (typeof value === 'string' || typeof value === 'number') {
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) {
			return parsed;
		}
	}
	return null;
};

export default function AddMandatoryExpensesScreen() {
	const { isDarkMode } = useAppTheme();
	const pageBackground = isDarkMode ? '#0b1220' : '#f4f5f7';
	const params = useLocalSearchParams<{ expenseId?: string | string[] }>();
	const editingExpenseId = React.useMemo(() => {
		const raw = Array.isArray(params.expenseId) ? params.expenseId[0] : params.expenseId;
		return raw && raw.trim().length > 0 ? raw : null;
	}, [params.expenseId]);

	const [tagOptions, setTagOptions] = React.useState<TagOption[]>([]);
	const [selectedTagId, setSelectedTagId] = React.useState<string | null>(null);
	const [isLoadingTags, setIsLoadingTags] = React.useState(false);

	const [expenseName, setExpenseName] = React.useState('');
	const [valueDisplay, setValueDisplay] = React.useState('');
	const [valueInCents, setValueInCents] = React.useState<number | null>(null);
	const [dueDay, setDueDay] = React.useState('');
	const [description, setDescription] = React.useState('');
	const [reminderEnabled, setReminderEnabled] = React.useState(true);
	const [selectedExpenseId, setSelectedExpenseId] = React.useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isPrefilling, setIsPrefilling] = React.useState(false);
	const [currentPaymentInfo, setCurrentPaymentInfo] = React.useState<PaymentInfo | null>(null);
	const [isPaymentActionLoading, setIsPaymentActionLoading] = React.useState(false);
	const selectedTagLabel = React.useMemo(() => {
		if (!selectedTagId) {
			return null;
		}
		return tagOptions.find(tag => tag.id === selectedTagId)?.name ?? null;
	}, [selectedTagId, tagOptions]);

	const handleValueChange = React.useCallback((input: string) => {
		const digitsOnly = formatValueInput(input);
		if (!digitsOnly) {
			setValueDisplay('');
			setValueInCents(null);
			return;
		}

		const centsValue = parseInt(digitsOnly, 10);
		setValueInCents(centsValue);
		setValueDisplay(formatCurrencyBRL(centsValue));
	}, []);

	const handleDueDayChange = React.useCallback((input: string) => {
		setDueDay(sanitizeDueDay(input));
	}, []);

	const handleReminderToggle = React.useCallback(async (value: boolean) => {
		if (value) {
			const granted = await ensureNotificationPermissionForMandatoryExpenses();
			if (!granted) {
				showFloatingAlert({
					message: 'Ative as notificações do aplicativo nas configurações para receber lembretes.',
					action: 'warning',
					position: 'bottom',
				});
				return;
			}
		}
		setReminderEnabled(value);
	}, []);

	const isDueDayValid = React.useMemo(() => {
		if (!dueDay) {
			return false;
		}
		const parsed = Number(dueDay);
		return !Number.isNaN(parsed) && parsed >= 1 && parsed <= 31;
	}, [dueDay]);

	const resetForm = React.useCallback((options?: { keepTag?: boolean }) => {
		setSelectedExpenseId(null);
		setExpenseName('');
		setValueDisplay('');
		setValueInCents(null);
		setDueDay('');
		setDescription('');
		setReminderEnabled(true);
		setSelectedTagId(current => {
			if (options?.keepTag && current) {
				return current;
			}
			return null;
		});
		setCurrentPaymentInfo(null);
	}, []);

	const loadTags = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showFloatingAlert({
				message: 'Usuário não autenticado. Faça login novamente.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		setIsLoadingTags(true);

		try {
			const [tagsResponse, relatedUsersResult] = await Promise.all([
				getAllTagsFirebase(),
				getRelatedUsersIDsFirebase(currentUser.uid),
			]);

			if (!tagsResponse.success || !Array.isArray(tagsResponse.data)) {
				throw new Error('Não foi possível carregar as tags.');
			}

			const relatedIds =
				relatedUsersResult.success && Array.isArray(relatedUsersResult.data) ? relatedUsersResult.data : [];
			const allowedIds = new Set<string>([currentUser.uid, ...relatedIds.filter(id => typeof id === 'string')]);

			const formattedTags: TagOption[] = tagsResponse.data
				.filter((tag: any) => {
					const usageType = typeof tag?.usageType === 'string' ? tag.usageType : undefined;
					const isMandatory = Boolean(tag?.isMandatoryExpense);
					const belongsToAllowedUser = allowedIds.has(String(tag?.personId));
					return usageType === 'expense' && isMandatory && belongsToAllowedUser;
				})
				.map((tag: any) => ({
					id: tag.id,
					name: typeof tag?.name === 'string' && tag.name.trim().length > 0 ? tag.name.trim() : 'Tag sem nome',
				}));

			setTagOptions(formattedTags);
			setSelectedTagId(current =>
				current && formattedTags.some(tag => tag.id === current) ? current : null,
			);

			if (formattedTags.length === 0) {
				showFloatingAlert({
					message: 'Cadastre uma tag de despesas marcada como obrigatória para utilizar esta tela.',
					action: 'warning',
					position: 'bottom',
				});
			}
		} catch (error) {
			console.error('Erro ao carregar tags obrigatórias:', error);
			showFloatingAlert({
				message: 'Erro ao carregar tags obrigatórias.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsLoadingTags(false);
		}
	}, []);

	useFocusEffect(
		React.useCallback(() => {
			void loadTags();
			return () => { };
		}, [loadTags]),
	);

	React.useEffect(() => {
		let isMounted = true;

		const prefillExpense = async () => {
			if (!editingExpenseId) {
				resetForm({ keepTag: true });
				return;
			}

			setIsPrefilling(true);

			try {
				const response = await getMandatoryExpenseFirebase(editingExpenseId);

				if (!isMounted) {
					return;
				}

				if (!response.success || !response.data) {
					showFloatingAlert({
						message: 'Não foi possível carregar os dados do gasto obrigatório.',
						action: 'error',
						position: 'bottom',
					});
					resetForm({ keepTag: true });
					return;
				}

				const data = response.data as Record<string, unknown>;

				const name = typeof data.name === 'string' ? data.name : '';
				const value = typeof data.valueInCents === 'number' ? data.valueInCents : 0;
				const dueDayValue = typeof data.dueDay === 'number' ? data.dueDay : 1;
				const tagId = typeof data.tagId === 'string' ? data.tagId : null;
				const descriptionValue = typeof data.description === 'string' ? data.description : '';
				const reminderFlag = data.reminderEnabled !== false;
				const lastPaymentExpenseId =
					typeof data.lastPaymentExpenseId === 'string' && data.lastPaymentExpenseId.length > 0
						? data.lastPaymentExpenseId
						: null;
				const lastPaymentCycle =
					typeof data.lastPaymentCycle === 'string' && data.lastPaymentCycle.length > 0
						? data.lastPaymentCycle
						: null;
				const lastPaymentDate = normalizeDateValue(data.lastPaymentDate ?? null);

				setSelectedExpenseId(editingExpenseId);
				setExpenseName(name);
				setValueInCents(value);
				setValueDisplay(value ? formatCurrencyBRL(value) : '');
				setDueDay(String(dueDayValue).padStart(2, '0'));
				setSelectedTagId(tagId);
				setDescription(descriptionValue);
				setReminderEnabled(reminderFlag);
				setCurrentPaymentInfo({
					expenseId: lastPaymentExpenseId,
					cycleKey: lastPaymentCycle,
					paidAt: lastPaymentDate,
				});
			} catch (error) {
				console.error('Erro ao carregar gasto obrigatório para edição:', error);
				if (isMounted) {
					showFloatingAlert({
						message: 'Erro ao carregar o gasto obrigatório selecionado.',
						action: 'error',
						position: 'bottom',
					});
					resetForm({ keepTag: true });
				}
			} finally {
				if (isMounted) {
					setIsPrefilling(false);
				}
			}
		};

		void prefillExpense();

		return () => {
			isMounted = false;
		};
	}, [editingExpenseId, resetForm]);

	const handleSubmit = React.useCallback(async () => {
		const trimmedName = expenseName.trim();

		if (!trimmedName) {
			showFloatingAlert({
				message: 'Informe o nome do gasto obrigatório.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (valueInCents === null || valueInCents <= 0) {
			showFloatingAlert({
				message: 'Informe um valor válido.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (!isDueDayValid) {
			showFloatingAlert({
				message: 'Informe um dia do mês entre 1 e 31.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		if (!selectedTagId) {
			showFloatingAlert({
				message: 'Selecione uma tag obrigatória.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		const currentUser = auth.currentUser;
		if (!currentUser) {
			showFloatingAlert({
				message: 'Usuário não autenticado.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		setIsSubmitting(true);

		try {
			const payload = {
				name: trimmedName,
				valueInCents,
				dueDay: Number(dueDay),
				tagId: selectedTagId,
				description: description.trim().length > 0 ? description.trim() : null,
				reminderEnabled,
				reminderHour: 9,
				reminderMinute: 0,
			};

			let persistedExpenseId = selectedExpenseId;

			if (selectedExpenseId) {
				const result = await updateMandatoryExpenseFirebase({
					expenseId: selectedExpenseId,
					...payload,
				});

				if (!result.success) {
					throw new Error('Erro ao atualizar o gasto obrigatório.');
				}
				showFloatingAlert({
					message: 'Gasto obrigatório atualizado com sucesso!',
					action: 'success',
					position: 'bottom',
				});
			} else {
				const result = await addMandatoryExpenseFirebase({
					...payload,
					personId: currentUser.uid,
				});

				if (!result.success || !result.id) {
					throw new Error('Erro ao registrar gasto obrigatório.');
				}
				persistedExpenseId = result.id;
				showFloatingAlert({
					message: 'Gasto obrigatório registrado com sucesso!',
					action: 'success',
					position: 'bottom',
				});
			}

			if (persistedExpenseId) {
				if (reminderEnabled) {
					await scheduleMandatoryExpenseNotification({
						expenseId: persistedExpenseId,
						name: payload.name,
						dueDay: payload.dueDay,
						reminderHour: payload.reminderHour,
						reminderMinute: payload.reminderMinute,
						description: payload.description ?? undefined,
						requestPermission: true,
					});
				} else {
					await cancelMandatoryExpenseNotification(persistedExpenseId);
				}
			}

			resetForm({ keepTag: true });
			router.back();
		} catch (error) {
			console.error('Erro ao salvar gasto obrigatório:', error);
			showFloatingAlert({
				message: 'Não foi possível salvar o gasto obrigatório.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSubmitting(false);
		}
	}, [
		description,
		dueDay,
		expenseName,
		isDueDayValid,
		reminderEnabled,
		resetForm,
		router,
		selectedExpenseId,
		selectedTagId,
		valueInCents,
	]);

	const isPaidForCurrentCycle = React.useMemo(() => isCycleKeyCurrent(currentPaymentInfo?.cycleKey), [currentPaymentInfo?.cycleKey]);

	const handleRegisterPaymentNavigation = React.useCallback(() => {
		if (!selectedExpenseId) {
			showFloatingAlert({
				message: 'Salve o gasto obrigatório antes de registrá-lo como despesa.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		if (isPaidForCurrentCycle) {
			showFloatingAlert({
				message: 'Este gasto já foi registrado como pago neste mês.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		if (valueInCents === null || !selectedTagId) {
			showFloatingAlert({
				message: 'Informe o valor e selecione uma tag antes de registrar o pagamento.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		const params: Record<string, string> = {
			templateName: encodeURIComponent(expenseName || 'Gasto obrigatório'),
			templateValueInCents: String(valueInCents),
			templateTagId: selectedTagId,
			templateDueDay: dueDay || '1',
			templateMandatoryExpenseId: selectedExpenseId,
		};

		if (selectedTagLabel) {
			params.templateTagName = encodeURIComponent(selectedTagLabel);
		}
		if (description.trim().length > 0) {
			params.templateDescription = encodeURIComponent(description.trim());
		}

		router.push({
			pathname: '/add-register-expenses',
			params,
		});
	}, [description, dueDay, expenseName, isPaidForCurrentCycle, selectedExpenseId, selectedTagId, selectedTagLabel, valueInCents]);

	const handleReclaimPayment = React.useCallback(async () => {
		if (!selectedExpenseId) {
			return;
		}

		setIsPaymentActionLoading(true);

		try {
			const relatedExpenseId = currentPaymentInfo?.expenseId;

			if (relatedExpenseId) {
				await deleteExpenseFirebase(relatedExpenseId);
			}

			const result = await clearMandatoryExpensePaymentFirebase(selectedExpenseId);
			if (!result.success) {
				throw new Error('Erro ao remover o registro de pagamento.');
			}

			setCurrentPaymentInfo(null);
			showFloatingAlert({
				message: 'Pagamento reivindicado. Registre novamente quando necessário.',
				action: 'success',
				position: 'bottom',
			});
		} catch (error) {
			console.error('Erro ao reivindicar pagamento do gasto obrigatório:', error);
			showFloatingAlert({
				message: 'Não foi possível reivindicar o pagamento. Tente novamente.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsPaymentActionLoading(false);
		}
	}, [currentPaymentInfo?.expenseId, selectedExpenseId]);

	const isSaveDisabled =
		!expenseName.trim() || valueInCents === null || !isDueDayValid || !selectedTagId || isSubmitting || isPrefilling;

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

				<ScrollView
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					style={{ backgroundColor: pageBackground }}
					contentContainerStyle={{
						flexGrow: 1,
						paddingBottom: 48,
						backgroundColor: pageBackground,
					}}
				>
					<View className="w-full px-6">

					<Heading size="3xl" className="text-center">
						{selectedExpenseId ? 'Editar gasto obrigatório' : 'Registrar gasto obrigatório'}
					</Heading>

					<Box className="w-full items-center mb-2">
						<AddMandatoryExpensesListIllustration width={170} height={170} />
					</Box>

					<Text className="text-justify text-gray-600 dark:text-gray-400">
						Preencha os campos abaixo para manter seus pagamentos recorrentes organizados. Quando registrados, você pode acompanhar e gerenciar facilmente seus gastos obrigatórios todos os meses.
					</Text>

					<Divider className="my-6 mb-6" />

					<VStack className="gap-4">

						<Box>
							<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
								Valor da despesa obrigatória
							</Text>
							<Input isDisabled={isPrefilling}>
								<InputField
									placeholder="Ex: Aluguel, Luz, Internet..."
									value={expenseName}
									onChangeText={setExpenseName}
									autoCapitalize="sentences"
								/>
							</Input>
						</Box>

						<Box>
							<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
								Valor mensal da despesa obrigatória
							</Text>
							<Input isDisabled={isPrefilling}>
								<InputField
									placeholder="Ex: R$ 700,00"
									value={valueDisplay}
									onChangeText={handleValueChange}
									keyboardType="numeric"
								/>
							</Input>
						</Box>

						<Box>
							<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
								Dia do vencimento mensal
							</Text>
							<Input isDisabled={isPrefilling}>
								<InputField
									placeholder="Dia do vencimento (1-31)"
									value={dueDay}
									onChangeText={handleDueDayChange}
									keyboardType="numeric"
								/>
							</Input>
							{dueDay.length > 0 && !isDueDayValid && (
								<Text className="text-sm text-error-600">Informe um dia válido entre 1 e 31.</Text>
							)}
						</Box>

						<Box>
							<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
								Tag obrigatória da despesa
							</Text>
							<Select
								selectedValue={selectedTagId ?? undefined}
								onValueChange={setSelectedTagId}
								isDisabled={isLoadingTags || tagOptions.length === 0 || isPrefilling}
							>
								<SelectTrigger>
									<SelectInput
										placeholder="Selecione uma tag obrigatória"
										value={selectedTagLabel ?? ''}
									/>
									<SelectIcon />
								</SelectTrigger>
								<SelectPortal>
									<SelectBackdrop />
									<SelectContent>
										<SelectDragIndicatorWrapper>
											<SelectDragIndicator />
										</SelectDragIndicatorWrapper>
										{tagOptions.length > 0 ? (
											tagOptions.map(tag => (
												<SelectItem key={tag.id} label={tag.name} value={tag.id} />
											))
										) : (
											<SelectItem label="Nenhuma tag disponível" value="no-tag" isDisabled />
										)}
									</SelectContent>
								</SelectPortal>
							</Select>
						</Box>

						<Box>
							<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
								Descrição ou observações
							</Text>
							<Textarea className="h-28" isDisabled={isPrefilling}>
								<TextareaInput
									placeholder="Descrição ou observações (opcional)"
									multiline
									value={description}
									onChangeText={setDescription}
								/>
							</Textarea>
						</Box>

						<Box
							className="
								w-full
								bg-white dark:bg-gray-900
								border border-gray-200 dark:border-gray-700
								rounded-lg
								p-4
								bg-transparent
							"
						>
							<Text className="font-semibold mb-2">Pagamento deste mês</Text>
							{!selectedExpenseId ? (
								<Text className="text-gray-600 dark:text-gray-400 mb-3">
									Salve o gasto obrigatório para habilitar o controle de pagamento mensal.
								</Text>
							) : isPaidForCurrentCycle ? (
								<>
									<Text className="text-emerald-600 dark:text-emerald-400 mb-3">
										Pagamento registrado em{' '}
										{currentPaymentInfo?.paidAt ? formatDateToBR(currentPaymentInfo.paidAt) : 'data não disponível'}.
									</Text>
									<Button
										variant="outline"
										action="secondary"
										onPress={handleReclaimPayment}
										isDisabled={isPaymentActionLoading}
									>
										{isPaymentActionLoading ? (
											<>
												<ButtonSpinner color="white" />
												<ButtonText>Processando</ButtonText>
											</>
										) : (
											<ButtonText>Reivindicar pagamento</ButtonText>
										)}
									</Button>
								</>
							) : (
								<>
									<Text className="text-gray-600 dark:text-gray-400 mb-3">
										Registre esta conta como uma despesa para marcá-la como paga neste ciclo ({getCurrentCycleKey()}).
									</Text>
									<Button
										variant="outline"
										action="primary"
										onPress={handleRegisterPaymentNavigation}
										isDisabled={isPrefilling || !selectedExpenseId || valueInCents === null || !selectedTagId}
									>
										<ButtonText>Adicionar às despesas</ButtonText>
									</Button>
								</>
							)}
						</Box>

						<View className="border border-outline-200 rounded-lg px-4 py-3 opacity-100">
							<HStack className="items-center justify-between">
								<View className="flex-1 mr-3">
									<Text className="font-semibold">Lembrete no dia do vencimento</Text>
									<Text className="text-gray-600 dark:text-gray-400 text-sm">
										Receba uma notificação no dia configurado para não esquecer o pagamento.
									</Text>
								</View>
								<Switch
									value={reminderEnabled}
									onValueChange={handleReminderToggle}
									disabled={isPrefilling}
									trackColor={{ false: '#d4d4d4', true: '#525252' }}
									thumbColor="#fafafa"
									ios_backgroundColor="#d4d4d4"
								/>
							</HStack>
						</View>

						<Button onPress={handleSubmit} isDisabled={isSaveDisabled} variant="outline">
							{isSubmitting ? (
								<>
									<ButtonSpinner color="white" />
									<ButtonText className="ml-2">{selectedExpenseId ? 'Atualizando' : 'Registrando'}</ButtonText>
								</>
							) : (
								<ButtonText>{selectedExpenseId ? 'Atualizar gasto' : 'Registrar gasto'}</ButtonText>
							)}
						</Button>
					</VStack>
				</View>
				</ScrollView>

				<Menu defaultValue={1} />

			</View>
		</SafeAreaView>
	);
}
