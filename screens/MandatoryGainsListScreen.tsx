import React from 'react';
import { ScrollView, View, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
	clearMandatoryGainReceiptFirebase,
	deleteMandatoryGainFirebase,
	getMandatoryGainsWithRelationsFirebase,
} from '@/functions/MandatoryGainFirebase';
import { getAllTagsFirebase } from '@/functions/TagFirebase';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import {
	cancelMandatoryGainNotification,
	syncMandatoryGainNotifications,
} from '@/utils/mandatoryGainNotifications';
import { isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import { deleteGainFirebase } from '@/functions/GainFirebase';

// Importação do SVG
import MandatoryGainListIllustration from '../assets/UnDraw/mandatoryGainsListScreen.svg';
import { Divider } from '@/components/ui/divider';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';
import { useAppTheme } from '@/contexts/ThemeContext';

type MandatoryGainItem = {
	id: string;
	name: string;
	valueInCents: number;
	dueDay: number;
	tagId: string;
	description?: string | null;
	reminderEnabled?: boolean;
	lastReceiptGainId?: string | null;
	lastReceiptCycle?: string | null;
	lastReceiptDate?: Date | null;
	isReceivedForCurrentCycle?: boolean;
};

type PendingGainAction =
	| { type: 'register'; gain: MandatoryGainItem }
	| { type: 'edit'; gain: MandatoryGainItem }
	| { type: 'delete'; gain: MandatoryGainItem }
	| { type: 'reclaim'; gain: MandatoryGainItem };

const getDueDayColorClass = (dueDay: number, isReceivedForCurrentCycle?: boolean) => {
	const today = new Date().getDate();
	const difference = dueDay - today;

	if (isReceivedForCurrentCycle) {
		return 'text-emerald-600 dark:text-emerald-400';
	}

	if (difference < 0) {
		return 'text-red-600 dark:text-red-400';
	}

	if (difference <= 3) {
		return 'text-emerald-600 dark:text-emerald-400';
	}

	if (difference <= 7) {
		return 'text-yellow-600 dark:text-yellow-400';
	}

	return 'text-gray-600 dark:text-gray-300';
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

const formatReceiptDate = (value: Date | null) => {
	if (!value) {
		return 'data não disponível';
	}

	return new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}).format(value);
};

export default function MandatoryGainsListScreen() {
	const { isDarkMode } = useAppTheme();
	const pageBackground = isDarkMode ? '#0b1220' : '#f4f5f7';
	const [isLoading, setIsLoading] = React.useState(false);
	const [gains, setGains] = React.useState<MandatoryGainItem[]>([]);
	const [tagsMap, setTagsMap] = React.useState<Record<string, string>>({});
	const [pendingAction, setPendingAction] = React.useState<PendingGainAction | null>(null);
	const [isActionProcessing, setIsActionProcessing] = React.useState(false);
	const { shouldHideValues } = useValueVisibility();

	const formatCurrencyBRL = React.useCallback(
		(valueInCents: number) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}
			return new Intl.NumberFormat('pt-BR', {
				style: 'currency',
				currency: 'BRL',
			}).format(valueInCents / 100);
		},
		[shouldHideValues],
	);

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
			const [gainsResult, tagsResult, relatedUsersResult] = await Promise.all([
				getMandatoryGainsWithRelationsFirebase(currentUser.uid),
				getAllTagsFirebase(),
				getRelatedUsersIDsFirebase(currentUser.uid),
			]);

			if (!gainsResult.success || !Array.isArray(gainsResult.data)) {
				throw new Error('Erro ao obter os ganhos obrigatórios.');
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

			const formattedGains: MandatoryGainItem[] = gainsResult.data.map((gain: any) => ({
				id: gain.id,
				name: typeof gain?.name === 'string' ? gain.name : 'Ganho sem nome',
				valueInCents: typeof gain?.valueInCents === 'number' ? gain.valueInCents : 0,
				dueDay: typeof gain?.dueDay === 'number' ? gain.dueDay : 1,
				tagId: typeof gain?.tagId === 'string' ? gain.tagId : '',
				description: typeof gain?.description === 'string' ? gain.description : null,
				reminderEnabled: gain?.reminderEnabled !== false,
				lastReceiptGainId: typeof gain?.lastReceiptGainId === 'string' ? gain.lastReceiptGainId : null,
				lastReceiptCycle: typeof gain?.lastReceiptCycle === 'string' ? gain.lastReceiptCycle : null,
				lastReceiptDate: normalizeDateValue(gain?.lastReceiptDate ?? null),
			}));

			const gainsWithStatus = formattedGains.map(gain => ({
				...gain,
				isReceivedForCurrentCycle: isCycleKeyCurrent(gain.lastReceiptCycle ?? undefined),
			}));

			setTagsMap(tagsRecord);
			setGains(gainsWithStatus);
			await syncMandatoryGainNotifications(
				gainsWithStatus.map(gain => ({
					id: gain.id,
					name: gain.name,
					dueDay: gain.dueDay,
					reminderEnabled: gain.reminderEnabled,
					reminderHour: 9,
					reminderMinute: 0,
					description: gain.description,
				})),
			);
		} catch (error) {
			console.error('Erro ao carregar ganhos obrigatórios:', error);
			showFloatingAlert({
				message: 'Não foi possível carregar os ganhos obrigatórios.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsLoading(false);
		}
	}, []);

	useFocusEffect(
		React.useCallback(() => {
			const fetch = async () => {
				await loadData();
			};

			void fetch();
			return () => { };
		}, [loadData]),
	);

	const handleOpenCreate = React.useCallback(() => {
		router.push('/add-mandatory-gains');
	}, []);

	const handleEdit = React.useCallback((gainTemplateId: string) => {
		router.push({
			pathname: '/add-mandatory-gains',
			params: { gainTemplateId },
		});
	}, []);

	const handleRegisterGain = React.useCallback((gain: MandatoryGainItem) => {
		if (gain.isReceivedForCurrentCycle) {
			showFloatingAlert({
				message: 'Este ganho já foi registrado como recebido neste mês.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		router.push({
			pathname: '/add-register-gain',
			params: {
				templateName: encodeURIComponent(gain.name),
				templateValueInCents: String(gain.valueInCents),
				templateTagId: gain.tagId,
				templateDueDay: String(gain.dueDay),
				templateDescription: gain.description ? encodeURIComponent(gain.description) : undefined,
				templateMandatoryGainId: gain.id,
				templateTagName: tagsMap[gain.tagId] ? encodeURIComponent(tagsMap[gain.tagId]) : undefined,
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
			handleRegisterGain(pendingAction.gain);
			setPendingAction(null);
			return;
		}

		if (pendingAction.type === 'edit') {
			handleEdit(pendingAction.gain.id);
			setPendingAction(null);
			return;
		}

		setIsActionProcessing(true);
		try {
			if (pendingAction.type === 'delete') {
				const result = await deleteMandatoryGainFirebase(pendingAction.gain.id);
				if (result.success) {
					await cancelMandatoryGainNotification(pendingAction.gain.id);
					showFloatingAlert({
						message: 'Ganho obrigatório removido.',
						action: 'success',
						position: 'bottom',
					});
					await loadData();
				} else {
					showFloatingAlert({
						message: 'Não foi possível remover o ganho obrigatório.',
						action: 'error',
						position: 'bottom',
					});
				}
				return;
			}

			if (pendingAction.type === 'reclaim') {
				const linkedGainId = pendingAction.gain.lastReceiptGainId;

				if (linkedGainId) {
					const deleteResult = await deleteGainFirebase(linkedGainId);
					if (!deleteResult.success) {
						showFloatingAlert({
							message: 'Não foi possível remover o ganho registrado.',
							action: 'error',
							position: 'bottom',
						});
						return;
					}
				}

				const clearResult = await clearMandatoryGainReceiptFirebase(pendingAction.gain.id);
				if (!clearResult.success) {
					showFloatingAlert({
						message: 'Não foi possível reivindicar o recebimento.',
						action: 'error',
						position: 'bottom',
					});
					return;
				}

				showFloatingAlert({
					message: 'Recebimento reivindicado. Registre novamente quando necessário.',
					action: 'success',
					position: 'bottom',
				});
				await loadData();
				return;
			}
		} catch (error) {
			console.error('Erro ao processar ação do ganho obrigatório:', error);
			showFloatingAlert({
				message: 'Erro inesperado ao processar a ação selecionada.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsActionProcessing(false);
			setPendingAction(null);
		}
	}, [handleEdit, handleRegisterGain, loadData, pendingAction]);

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

		const gainName = pendingAction.gain.name || 'ganho obrigatório selecionado';

		if (pendingAction.type === 'register') {
			return {
				title: 'Registrar ganho',
				message: `Deseja registrar "${gainName}" como um novo ganho?`,
				confirmLabel: 'Registrar',
				action: 'primary' as const,
			};
		}

		if (pendingAction.type === 'edit') {
			return {
				title: 'Editar ganho obrigatório',
				message: `Deseja editar o ganho obrigatório "${gainName}"?`,
				confirmLabel: 'Editar',
				action: 'primary' as const,
			};
		}

		if (pendingAction.type === 'reclaim') {
			return {
				title: 'Reivindicar recebimento',
				message: `Deseja cancelar o recebimento registrado para "${gainName}"? O ganho vinculado será removido.`,
				confirmLabel: 'Reivindicar',
				action: 'secondary' as const,
			};
		}

		return {
			title: 'Excluir ganho obrigatório',
			message: `Tem certeza de que deseja excluir "${gainName}"? Essa ação não pode ser desfeita.`,
			confirmLabel: 'Excluir',
			action: 'negative' as const,
		};
	}, [pendingAction]);

	const isModalOpen = Boolean(pendingAction);

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
					<Heading size="3xl" className="text-center mb-6">
						Ganhos obrigatórios
					</Heading>

					<Box className="w-full items-center ">
						<MandatoryGainListIllustration width={160} height={160} />
					</Box>

					<Text className="text-justify text-gray-600 dark:text-gray-400 mt-6">
						Acompanhe seus recebimentos recorrentes, registre-os facilmente e nunca perca um vencimento. Sempre renovando a cada mês para manter suas finanças em dia.
					</Text>

					<Divider className="my-6 mb-6" />

					<Button className="mb-6" onPress={handleOpenCreate} variant="outline">
						<ButtonText>Registrar novo ganho obrigatório</ButtonText>
					</Button>

					{isLoading ? (
						<Text className="text-center text-gray-500">Carregando ganhos obrigatórios...</Text>
					) : gains.length === 0 ? (
						<Text className="text-center text-gray-500">Nenhum ganho obrigatório cadastrado até o momento.</Text>
					) : (
						<VStack className="">
							{gains.map(gain => (
								<Box
									key={gain.id}
									className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 w-full mb-6"
								>
									<HStack className="justify-between items-start mb-2">
										<View className="flex-1 pr-3">
											<Text className="text-lg font-semibold">{gain.name}</Text>
											<Text className="text-gray-700 dark:text-gray-300">
												Valor previsto: {' '}
												<Text className="text-emerald-600 dark:text-emerald-400">
													{formatCurrencyBRL(gain.valueInCents)}
												</Text>
											</Text>
											<Text className="text-gray-700 dark:text-gray-300">
												Recebimento: {''}
												<Text className={getDueDayColorClass(gain.dueDay, gain.isReceivedForCurrentCycle)}>
													dia {String(gain.dueDay).padStart(2, '0')}
												</Text>
											</Text>
											<Text className="text-gray-600">Tag: {tagsMap[gain.tagId] ?? 'Tag não encontrada'}</Text>
											<Text className="text-gray-600">
												Lembrete: {gain.reminderEnabled === false ? 'desativado' : 'ativado'}
											</Text>
											<Text
												className={
													gain.isReceivedForCurrentCycle
														? 'text-emerald-600 dark:text-emerald-400 mt-1'
														: 'text-gray-500 dark:text-gray-400 mt-1'
												}
											>
												{gain.isReceivedForCurrentCycle
													? `Recebido em ${formatReceiptDate(gain.lastReceiptDate ?? null)}.`
													: 'Aguardando registro como ganho neste mês.'}
											</Text>
											{gain.description && (
												<Text className="text-gray-600 mt-1">Observações: {gain.description}</Text>
											)}
										</View>
									</HStack>

									<Divider className="my-4" />
									
									<HStack className="gap-3 flex-wrap justify-end">
										<Button
											size="md"
											variant="link"
											action="primary"
											onPress={() => setPendingAction({ type: 'register', gain })}
											isDisabled={gain.isReceivedForCurrentCycle}
										>
											<ButtonIcon as={AddIcon} />
										</Button>
										<Button
											size="md"
											variant="link"
											action="primary"
											onPress={() => setPendingAction({ type: 'edit', gain })}
										>
											<ButtonIcon as={EditIcon} />
										</Button>
										{gain.isReceivedForCurrentCycle && (
											<Button
												size="md"
												variant="link"
												action="secondary"
												onPress={() => setPendingAction({ type: 'reclaim', gain })}
											>
												<ButtonText>Reivindicar</ButtonText>
											</Button>
										)}
										<Button
											size="md"
											variant="link"
											action="negative"
											onPress={() => setPendingAction({ type: 'delete', gain })}
										>
											<ButtonIcon as={TrashIcon} />
										</Button>
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
		</SafeAreaView>
	);
}
