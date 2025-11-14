import React from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Menu } from '@/components/uiverse/menu';
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { AddIcon, EditIcon, TrashIcon } from '@/components/ui/icon';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
} from '@/components/ui/modal';

import { auth } from '@/FirebaseConfig';
import {
	clearMandatoryExpensePaymentFirebase,
	deleteMandatoryExpenseFirebase,
	getMandatoryExpensesWithRelationsFirebase,
} from '@/functions/MandatoryExpenseFirebase';
import { getAllTagsFirebase } from '@/functions/TagFirebase';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import {
	cancelMandatoryExpenseNotification,
	syncMandatoryExpenseNotifications,
} from '@/utils/mandatoryExpenseNotifications';
import { isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import { deleteExpenseFirebase } from '@/functions/ExpenseFirebase';

// Importação do SVG
import MandatoryExpensesListIllustration from '../assets/UnDraw/mandatoryExpensesListScreen.svg';
import { Divider } from '@/components/ui/divider';

type MandatoryExpenseItem = {
	id: string;
	name: string;
	valueInCents: number;
	dueDay: number;
	tagId: string;
	description?: string | null;
	reminderEnabled?: boolean;
	lastPaymentExpenseId?: string | null;
	lastPaymentCycle?: string | null;
	lastPaymentDate?: Date | null;
	isPaidForCurrentCycle?: boolean;
};

type PendingExpenseAction =
	| { type: 'register'; expense: MandatoryExpenseItem }
	| { type: 'edit'; expense: MandatoryExpenseItem }
	| { type: 'delete'; expense: MandatoryExpenseItem }
	| { type: 'reclaim'; expense: MandatoryExpenseItem };

const formatCurrencyBRL = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
	}).format(valueInCents / 100);

const getDueDayColorClass = (dueDay: number) => {
	const today = new Date().getDate();
	const difference = dueDay - today;

	if (difference <= 3) {
		return 'text-red-600 dark:text-red-400';
	}

	if (difference <= 7) {
		return 'text-yellow-600 dark:text-yellow-400';
	}

	return 'text-emerald-600 dark:text-emerald-400';
};

const normalizeDateValue = (value: unknown): Date | null => {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value;
	}

	if (typeof value === 'object' && value !== null) {
		const candidate = value as { toDate?: () => Date };
		if (typeof candidate.toDate === 'function') {
			return candidate.toDate() ?? null;
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

const formatPaymentDate = (value: Date | null) => {
	if (!value) {
		return 'data não disponível';
	}

	return new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}).format(value);
};

export default function MandatoryExpensesListScreen() {
	const [isLoading, setIsLoading] = React.useState(false);
	const [expenses, setExpenses] = React.useState<MandatoryExpenseItem[]>([]);
	const [tagsMap, setTagsMap] = React.useState<Record<string, string>>({});
	const [pendingAction, setPendingAction] = React.useState<PendingExpenseAction | null>(null);
	const [isActionProcessing, setIsActionProcessing] = React.useState(false);

	const loadData = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showFloatingAlert({
				message: 'Usuário não autenticado. Faça login novamente.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		setIsLoading(true);

		try {
			const [expensesResult, tagsResult, relatedUsersResult] = await Promise.all([
				getMandatoryExpensesWithRelationsFirebase(currentUser.uid),
				getAllTagsFirebase(),
				getRelatedUsersIDsFirebase(currentUser.uid),
			]);

			if (!expensesResult.success || !Array.isArray(expensesResult.data)) {
				throw new Error('Erro ao obter os gastos obrigatórios.');
			}

			const relatedIds =
				relatedUsersResult.success && Array.isArray(relatedUsersResult.data) ? relatedUsersResult.data : [];
			const allowedIds = new Set<string>([currentUser.uid, ...relatedIds.filter(id => typeof id === 'string')]);

			const tagsRecord: Record<string, string> = {};
			if (tagsResult.success && Array.isArray(tagsResult.data)) {
				(tagsResult.data as Array<Record<string, unknown>>)
					.filter(tag => {
						const personIdValue = tag['personId'];
						const personId = typeof personIdValue === 'string' ? personIdValue : '';
						return allowedIds.has(personId);
					})
					.forEach(tag => {
						const tagIdValue = tag['id'];
						if (typeof tagIdValue === 'string') {
							const tagNameValue = tag['name'];
							const label =
								typeof tagNameValue === 'string' && tagNameValue.trim().length > 0
									? tagNameValue.trim()
									: 'Tag sem nome';
							tagsRecord[tagIdValue] = label;
						}
					});
			}

			const formattedExpenses: MandatoryExpenseItem[] = expensesResult.data.map((expense: any) => ({
				id: expense.id,
				name: typeof expense?.name === 'string' ? expense.name : 'Gasto sem nome',
				valueInCents: typeof expense?.valueInCents === 'number' ? expense.valueInCents : 0,
				dueDay: typeof expense?.dueDay === 'number' ? expense.dueDay : 1,
				tagId: typeof expense?.tagId === 'string' ? expense.tagId : '',
				description: typeof expense?.description === 'string' ? expense.description : null,
				reminderEnabled: expense?.reminderEnabled !== false,
				lastPaymentExpenseId:
					typeof expense?.lastPaymentExpenseId === 'string' ? expense.lastPaymentExpenseId : null,
				lastPaymentCycle:
					typeof expense?.lastPaymentCycle === 'string' ? expense.lastPaymentCycle : null,
				lastPaymentDate: normalizeDateValue(expense?.lastPaymentDate ?? null),
			}));

			const expensesWithStatus = formattedExpenses.map(expense => ({
				...expense,
				isPaidForCurrentCycle: isCycleKeyCurrent(expense.lastPaymentCycle ?? undefined),
			}));

			setTagsMap(tagsRecord);
			setExpenses(expensesWithStatus);
			await syncMandatoryExpenseNotifications(
				expensesWithStatus.map(expense => ({
					id: expense.id,
					name: expense.name,
					dueDay: expense.dueDay,
					reminderEnabled: expense.reminderEnabled,
					reminderHour: 9,
					reminderMinute: 0,
					description: expense.description,
				})),
			);
		} catch (error) {
			console.error('Erro ao carregar gastos obrigatórios:', error);
			showFloatingAlert({
				message: 'Não foi possível carregar os gastos obrigatórios.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsLoading(false);
		}
	}, []);

	useFocusEffect(
		React.useCallback(() => {
			let isMounted = true;

			const fetch = async () => {
				await loadData();
			};

			void fetch();

			return () => {
				isMounted = false;
			};
		}, [loadData]),
	);

	const handleOpenCreate = React.useCallback(() => {
		router.push('/add-mandatory-expenses');
	}, []);

	const handleEdit = React.useCallback((expenseId: string) => {
		router.push({
			pathname: '/add-mandatory-expenses',
			params: { expenseId },
		});
	}, []);

	const handleRegisterExpense = React.useCallback((expense: MandatoryExpenseItem) => {
		if (expense.isPaidForCurrentCycle) {
			showFloatingAlert({
				message: 'Este gasto já foi registrado como pago neste mês.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		router.push({
			pathname: '/add-register-expenses',
			params: {
				templateName: encodeURIComponent(expense.name),
				templateValueInCents: String(expense.valueInCents),
				templateTagId: expense.tagId,
				templateDueDay: String(expense.dueDay),
				templateDescription: expense.description ? encodeURIComponent(expense.description) : undefined,
				templateMandatoryExpenseId: expense.id,
				templateTagName: tagsMap[expense.tagId] ? encodeURIComponent(tagsMap[expense.tagId]) : undefined,
			},
		});
	}, [tagsMap]);

	const handleCloseActionModal = React.useCallback(() => {
		if (isActionProcessing) {
			return;
		}
		setPendingAction(null);
	}, [isActionProcessing]);

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) {
			return;
		}

		if (pendingAction.type === 'register') {
			handleRegisterExpense(pendingAction.expense);
			setPendingAction(null);
			return;
		}

		if (pendingAction.type === 'edit') {
			handleEdit(pendingAction.expense.id);
			setPendingAction(null);
			return;
		}

		setIsActionProcessing(true);
		try {
			if (pendingAction.type === 'delete') {
				const result = await deleteMandatoryExpenseFirebase(pendingAction.expense.id);
				if (result.success) {
					await cancelMandatoryExpenseNotification(pendingAction.expense.id);
					showFloatingAlert({
						message: 'Gasto obrigatório removido.',
						action: 'success',
						position: 'bottom',
					});
					await loadData();
				} else {
					showFloatingAlert({
						message: 'Não foi possível remover o gasto obrigatório.',
						action: 'error',
						position: 'bottom',
					});
				}
				return;
			}

			if (pendingAction.type === 'reclaim') {
				const linkedExpenseId = pendingAction.expense.lastPaymentExpenseId;

				if (linkedExpenseId) {
					const deleteResult = await deleteExpenseFirebase(linkedExpenseId);
					if (!deleteResult.success) {
						showFloatingAlert({
							message: 'Não foi possível remover a despesa vinculada.',
							action: 'error',
							position: 'bottom',
						});
						return;
					}
				}

				const clearResult = await clearMandatoryExpensePaymentFirebase(pendingAction.expense.id);
				if (!clearResult.success) {
					showFloatingAlert({
						message: 'Não foi possível reivindicar o pagamento.',
						action: 'error',
						position: 'bottom',
					});
					return;
				}

				showFloatingAlert({
					message: 'Pagamento reivindicado. Registre novamente quando necessário.',
					action: 'success',
					position: 'bottom',
				});
				await loadData();
				return;
			}
		} catch (error) {
			console.error('Erro ao processar a ação do gasto obrigatório:', error);
			showFloatingAlert({
				message: 'Erro inesperado ao processar a ação selecionada.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsActionProcessing(false);
			setPendingAction(null);
		}
	}, [handleEdit, handleRegisterExpense, loadData, pendingAction]);

	const handleBackToHome = React.useCallback(() => {
		router.replace('/home?tab=0');
		return true;
	}, []);

	const actionModalCopy = React.useMemo(() => {
		if (!pendingAction) {
			return {
				title: '',
				message: '',
				confirmLabel: 'Confirmar',
				action: 'primary' as const,
			};
		}

		const expenseName = pendingAction.expense.name || 'gasto obrigatório selecionado';

		if (pendingAction.type === 'register') {
			return {
				title: 'Registrar despesa',
				message: `Deseja registrar "${expenseName}" como uma nova despesa?`,
				confirmLabel: 'Registrar',
				action: 'primary' as const,
			};
		}

		if (pendingAction.type === 'edit') {
			return {
				title: 'Editar gasto obrigatório',
				message: `Deseja editar o gasto obrigatório "${expenseName}"?`,
				confirmLabel: 'Editar',
				action: 'primary' as const,
			};
		}

		if (pendingAction.type === 'reclaim') {
			return {
				title: 'Reivindicar pagamento',
				message: `Deseja cancelar o pagamento registrado para "${expenseName}"? A despesa vinculada será removida.`,
				confirmLabel: 'Reivindicar',
				action: 'secondary' as const,
			};
		}

		return {
			title: 'Excluir gasto obrigatório',
			message: `Tem certeza de que deseja excluir "${expenseName}"? Essa ação não pode ser desfeita.`,
			confirmLabel: 'Excluir',
			action: 'negative' as const,
		};
	}, [pendingAction]);

	const isModalOpen = Boolean(pendingAction);

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

					<Heading size="3xl" className="text-center">
						Gastos obrigatórios
					</Heading>

					<Box className="w-full items-center ">
						<MandatoryExpensesListIllustration width={170} height={170} />
					</Box>

					<Text className="text-justify text-gray-600 dark:text-gray-400">
						Acompanhe seus pagamentos recorrentes, registre-os facilmente e nunca perca um vencimento. Sempre renovando a cada mês para manter suas finanças em dia.
					</Text>

					<Divider className="my-6 mb-6" />

					<Button className="mb-6" onPress={handleOpenCreate} variant="outline">
						<ButtonText>Registrar novo gasto obrigatório</ButtonText>
					</Button>

					{isLoading ? (
						<Text className="text-center text-gray-500">Carregando gastos obrigatórios...</Text>
					) : expenses.length === 0 ? (
						<Text className="text-center text-gray-500">
							Nenhum gasto obrigatório cadastrado até o momento.
						</Text>
					) : (
						<VStack className="">
							{expenses.map(expense => (
								<Box
									key={expense.id}
									className="
										w-full
										bg-white dark:bg-gray-800
										rounded-lg
										p-4
										mb-4
									"
								>
									<HStack className="justify-between items-start mb-2">
										<View className="flex-1 pr-3">
											<Text className="text-lg font-semibold">{expense.name}</Text>
											<Text className="text-gray-700 dark:text-gray-300">
												Valor previsto: {' '}
												<Text className="text-orange-500 dark:text-orange-300">
													{formatCurrencyBRL(expense.valueInCents)}
												</Text>
											</Text>
											<Text className="text-gray-700 dark:text-gray-300">
												Vencimento: {''}
												<Text className={getDueDayColorClass(expense.dueDay)}>
													dia {String(expense.dueDay).padStart(2, '0')}
												</Text>
											</Text>
											<Text className="text-gray-600">
												Tag: {tagsMap[expense.tagId] ?? 'Tag não encontrada'}
											</Text>
											<Text className="text-gray-600">
												Lembrete: {expense.reminderEnabled === false ? 'desativado' : 'ativado'}
											</Text>
											<Text
												className={
													expense.isPaidForCurrentCycle
														? 'text-emerald-600 dark:text-emerald-400 mt-1'
														: 'text-gray-500 dark:text-gray-400 mt-1'
												}
											>
												{expense.isPaidForCurrentCycle
													? `Pagamento registrado em ${formatPaymentDate(expense.lastPaymentDate ?? null)}.`
													: 'Aguardando registro como despesa neste mês.'}
											</Text>
											{expense.description && (
												<Text className="text-gray-600 mt-1">Observações: {expense.description}</Text>
											)}
										</View>
										<HStack className="gap-2">
											<Button
												size="sm"
												variant="link"
												action="primary"
												onPress={() => setPendingAction({ type: 'register', expense })}
												isDisabled={expense.isPaidForCurrentCycle}
											>
												<ButtonIcon as={AddIcon} />
											</Button>
											<Button
												size="sm"
												variant="link"
												action="primary"
												onPress={() => setPendingAction({ type: 'edit', expense })}
											>
												<ButtonIcon as={EditIcon} />
											</Button>
											{expense.isPaidForCurrentCycle && (
												<Button
													size="sm"
													variant="link"
													action="secondary"
													onPress={() => setPendingAction({ type: 'reclaim', expense })}
												>
													<ButtonText>Reivindicar</ButtonText>
												</Button>
											)}
											<Button
												size="sm"
												variant="link"
												action="negative"
												onPress={() => setPendingAction({ type: 'delete', expense })}
											>
												<ButtonIcon as={TrashIcon} />
											</Button>
										</HStack>
									</HStack>
								</Box>
							))}
						</VStack>
					)}
				</View>
			</ScrollView>

			<Menu defaultValue={1} onHardwareBack={handleBackToHome} />

			<Modal isOpen={isModalOpen} onClose={handleCloseActionModal}>
				<ModalBackdrop />
				<ModalContent className="max-w-[360px]">
					<ModalHeader>
						<Heading size="lg">{actionModalCopy.title}</Heading>
						<ModalCloseButton onPress={handleCloseActionModal} />
					</ModalHeader>
					<ModalBody>
						<Text className="text-gray-700 dark:text-gray-300">{actionModalCopy.message}</Text>
					</ModalBody>
					<ModalFooter className="gap-3">
						<Button variant="outline" onPress={handleCloseActionModal} isDisabled={isActionProcessing}>
							<ButtonText>Cancelar</ButtonText>
						</Button>
						<Button
							variant="solid"
							action={actionModalCopy.action}
							onPress={handleConfirmAction}
							isDisabled={isActionProcessing}
						>
							{isActionProcessing ? (
								<>
									<ButtonSpinner color="white" />
									<ButtonText>Processando</ButtonText>
								</>
							) : (
								<ButtonText>{actionModalCopy.confirmLabel}</ButtonText>
							)}
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</View>
	);
}
