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
import { HStack } from '@/components/ui/hstack';
import { Switch } from '@/components/ui/switch';
import { Box } from '@/components/ui/box';

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

import { auth } from '@/FirebaseConfig';
import { getAllTagsFirebase } from '@/functions/TagFirebase';
import {
	addMandatoryGainFirebase,
	clearMandatoryGainReceiptFirebase,
	getMandatoryGainFirebase,
	updateMandatoryGainFirebase,
} from '@/functions/MandatoryGainFirebase';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import {
	cancelMandatoryGainNotification,
	ensureNotificationPermissionForMandatoryGains,
	scheduleMandatoryGainNotification,
} from '@/utils/mandatoryGainNotifications';
import { getCurrentCycleKey, isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import { deleteGainFirebase } from '@/functions/GainFirebase';

// Importação do SVG
import AddMandatoryGainListIllustration from '../assets/UnDraw/addMandatoryGainsScreen.svg';
import { Divider } from '@/components/ui/divider';

type TagOption = { id: string; name: string };
type ReceiptInfo = {
	gainId: string | null;
	receivedAt: Date | null;
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
	if (
		typeof value === 'object' &&
		value !== null &&
		'toDate' in value &&
		typeof (value as { toDate?: () => Date }).toDate === 'function'
	) {
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

export default function AddMandatoryGainsScreen() {
	const params = useLocalSearchParams<{ gainTemplateId?: string | string[] }>();
	const editingGainTemplateId = React.useMemo(() => {
		const raw = Array.isArray(params.gainTemplateId) ? params.gainTemplateId[0] : params.gainTemplateId;
		return raw && raw.trim().length > 0 ? raw : null;
	}, [params.gainTemplateId]);

	const [tagOptions, setTagOptions] = React.useState<TagOption[]>([]);
	const [selectedTagId, setSelectedTagId] = React.useState<string | null>(null);
	const [isLoadingTags, setIsLoadingTags] = React.useState(false);

	const [gainName, setGainName] = React.useState('');
	const [valueDisplay, setValueDisplay] = React.useState('');
	const [valueInCents, setValueInCents] = React.useState<number | null>(null);
	const [dueDay, setDueDay] = React.useState('');
	const [description, setDescription] = React.useState('');
	const [reminderEnabled, setReminderEnabled] = React.useState(true);
	const [selectedGainTemplateId, setSelectedGainTemplateId] = React.useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isPrefilling, setIsPrefilling] = React.useState(false);
	const [currentReceiptInfo, setCurrentReceiptInfo] = React.useState<ReceiptInfo | null>(null);
	const [isReceiptActionLoading, setIsReceiptActionLoading] = React.useState(false);
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
			const granted = await ensureNotificationPermissionForMandatoryGains();
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
		setSelectedGainTemplateId(null);
		setGainName('');
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
		setCurrentReceiptInfo(null);
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
					const isMandatory = Boolean(tag?.isMandatoryGain);
					const belongsToAllowedUser = allowedIds.has(String(tag?.personId));
					return usageType === 'gain' && isMandatory && belongsToAllowedUser;
				})
				.map((tag: any) => ({
					id: tag.id,
					name: typeof tag?.name === 'string' && tag.name.trim().length > 0 ? tag.name.trim() : 'Tag sem nome',
				}));

			setTagOptions(formattedTags);
			setSelectedTagId(current => (current && formattedTags.some(tag => tag.id === current) ? current : null));

			if (formattedTags.length === 0) {
				showFloatingAlert({
					message: 'Cadastre uma tag de ganhos marcada como obrigatória para utilizar esta tela.',
					action: 'warning',
					position: 'bottom',
				});
			}
		} catch (error) {
			console.error('Erro ao carregar tags obrigatórias de ganhos:', error);
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

		const prefillGainTemplate = async () => {
			if (!editingGainTemplateId) {
				resetForm({ keepTag: true });
				return;
			}

			setIsPrefilling(true);

			try {
				const response = await getMandatoryGainFirebase(editingGainTemplateId);

				if (!isMounted) {
					return;
				}

				if (!response.success || !response.data) {
					showFloatingAlert({
						message: 'Não foi possível carregar os dados do ganho obrigatório.',
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
				const lastReceiptGainId =
					typeof data.lastReceiptGainId === 'string' && data.lastReceiptGainId.length > 0
						? data.lastReceiptGainId
						: null;
				const lastReceiptCycle =
					typeof data.lastReceiptCycle === 'string' && data.lastReceiptCycle.length > 0
						? data.lastReceiptCycle
						: null;
				const lastReceiptDate = normalizeDateValue(data.lastReceiptDate ?? null);

				setSelectedGainTemplateId(editingGainTemplateId);
				setGainName(name);
				setValueInCents(value);
				setValueDisplay(value ? formatCurrencyBRL(value) : '');
				setDueDay(String(dueDayValue).padStart(2, '0'));
				setSelectedTagId(tagId);
				setDescription(descriptionValue);
				setReminderEnabled(reminderFlag);
				setCurrentReceiptInfo({
					gainId: lastReceiptGainId,
					cycleKey: lastReceiptCycle,
					receivedAt: lastReceiptDate,
				});
			} catch (error) {
				console.error('Erro ao carregar ganho obrigatório para edição:', error);
				if (isMounted) {
					showFloatingAlert({
						message: 'Erro ao carregar o ganho obrigatório selecionado.',
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

		void prefillGainTemplate();

		return () => {
			isMounted = false;
		};
	}, [editingGainTemplateId, resetForm]);

	const handleSubmit = React.useCallback(async () => {
		const trimmedName = gainName.trim();

		if (!trimmedName) {
			showFloatingAlert({
				message: 'Informe o nome do ganho obrigatório.',
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

			let persistedId = selectedGainTemplateId;

			if (selectedGainTemplateId) {
				const result = await updateMandatoryGainFirebase({
					gainTemplateId: selectedGainTemplateId,
					...payload,
				});

				if (!result.success) {
					throw new Error('Erro ao atualizar o ganho obrigatório.');
				}
				showFloatingAlert({
					message: 'Ganho obrigatório atualizado com sucesso!',
					action: 'success',
					position: 'bottom',
				});
			} else {
				const result = await addMandatoryGainFirebase({
					...payload,
					personId: currentUser.uid,
				});

				if (!result.success || !result.id) {
					throw new Error('Erro ao registrar ganho obrigatório.');
				}
				persistedId = result.id;
				showFloatingAlert({
					message: 'Ganho obrigatório registrado com sucesso!',
					action: 'success',
					position: 'bottom',
				});
			}

			if (persistedId) {
				if (reminderEnabled) {
					await scheduleMandatoryGainNotification({
						gainTemplateId: persistedId,
						name: payload.name,
						dueDay: payload.dueDay,
						reminderHour: payload.reminderHour,
						reminderMinute: payload.reminderMinute,
						description: payload.description ?? undefined,
						requestPermission: true,
					});
				} else {
					await cancelMandatoryGainNotification(persistedId);
				}
			}

			resetForm({ keepTag: true });
			router.back();
		} catch (error) {
			console.error('Erro ao salvar ganho obrigatório:', error);
			showFloatingAlert({
				message: 'Não foi possível salvar o ganho obrigatório.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsSubmitting(false);
		}
	}, [
		description,
		dueDay,
		gainName,
		isDueDayValid,
		reminderEnabled,
		resetForm,
		router,
		selectedGainTemplateId,
		selectedTagId,
		valueInCents,
	]);

	const isReceivedForCurrentCycle = React.useMemo(
		() => isCycleKeyCurrent(currentReceiptInfo?.cycleKey),
		[currentReceiptInfo?.cycleKey],
	);

	const handleRegisterReceiptNavigation = React.useCallback(() => {
		if (!selectedGainTemplateId) {
			showFloatingAlert({
				message: 'Salve o ganho obrigatório antes de registrá-lo como recebido.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		if (isReceivedForCurrentCycle) {
			showFloatingAlert({
				message: 'Este ganho já foi registrado como recebido neste mês.',
				action: 'warning',
				position: 'bottom',
			});
			return;
		}

		if (valueInCents === null || !selectedTagId) {
			showFloatingAlert({
				message: 'Informe o valor e selecione uma tag antes de registrar o recebimento.',
				action: 'error',
				position: 'bottom',
			});
			return;
		}

		const params: Record<string, string> = {
			templateName: encodeURIComponent(gainName || 'Ganho obrigatório'),
			templateValueInCents: String(valueInCents),
			templateTagId: selectedTagId,
			templateMandatoryGainId: selectedGainTemplateId,
		};

		if (selectedTagLabel) {
			params.templateTagName = encodeURIComponent(selectedTagLabel);
		}
		if (description.trim().length > 0) {
			params.templateDescription = encodeURIComponent(description.trim());
		}

		if (dueDay.trim().length > 0) {
			params.templateDueDay = dueDay;
		}

		router.push({
			pathname: '/add-register-gain',
			params,
		});
	}, [description, dueDay, gainName, isReceivedForCurrentCycle, selectedGainTemplateId, selectedTagId, selectedTagLabel, valueInCents]);

	const handleReclaimReceipt = React.useCallback(async () => {
		if (!selectedGainTemplateId) {
			return;
		}

		setIsReceiptActionLoading(true);

		try {
			const relatedGainId = currentReceiptInfo?.gainId;

			if (relatedGainId) {
				await deleteGainFirebase(relatedGainId);
			}

			const result = await clearMandatoryGainReceiptFirebase(selectedGainTemplateId);
			if (!result.success) {
				throw new Error('Erro ao remover o registro de recebimento.');
			}

			setCurrentReceiptInfo(null);
			showFloatingAlert({
				message: 'Recebimento reivindicado. Registre novamente quando necessário.',
				action: 'success',
				position: 'bottom',
			});
		} catch (error) {
			console.error('Erro ao reivindicar recebimento do ganho obrigatório:', error);
			showFloatingAlert({
				message: 'Não foi possível reivindicar o recebimento. Tente novamente.',
				action: 'error',
				position: 'bottom',
			});
		} finally {
			setIsReceiptActionLoading(false);
		}
	}, [currentReceiptInfo?.gainId, selectedGainTemplateId]);

	const isSaveDisabled =
		!gainName.trim() || valueInCents === null || !isDueDayValid || !selectedTagId || isSubmitting || isPrefilling;

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

					<Heading size="3xl" className="text-center mb-4">
						{selectedGainTemplateId ? 'Editar ganho obrigatório' : 'Registrar ganho obrigatório'}
					</Heading>

					<Box className="w-full items-center mb-2">
						<AddMandatoryGainListIllustration width={180} height={180} />
					</Box>

					<Text className="text-justify text-gray-600 dark:text-gray-400">
						Organize seus recebimentos recorrentes para garantir que os ganhos previstos sejam registrados em dia. Você pode acompanhar e gerenciar seus ganhos obrigatórios facilmente aqui.
					</Text>

					<Divider className="my-6 mb-6" />

					<VStack className="gap-4">
						<Input isDisabled={isPrefilling}>
							<InputField
								placeholder="Nome do ganho"
								value={gainName}
								onChangeText={setGainName}
								autoCapitalize="sentences"
							/>
						</Input>

						<Input isDisabled={isPrefilling}>
							<InputField
								placeholder="Valor previsto"
								value={valueDisplay}
								onChangeText={handleValueChange}
								keyboardType="numeric"
							/>
						</Input>

						<Input isDisabled={isPrefilling}>
							<InputField
								placeholder="Dia do recebimento (1-31)"
								value={dueDay}
								onChangeText={handleDueDayChange}
								keyboardType="numeric"
							/>
						</Input>
						{dueDay.length > 0 && !isDueDayValid && (
							<Text className="text-sm text-error-600">Informe um dia válido entre 1 e 31.</Text>
						)}

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
										tagOptions.map(tag => <SelectItem key={tag.id} label={tag.name} value={tag.id} />)
									) : (
										<SelectItem label="Nenhuma tag disponível" value="no-tag" isDisabled />
									)}
								</SelectContent>
							</SelectPortal>
						</Select>

						<Textarea className="h-28" isDisabled={isPrefilling}>
							<TextareaInput
								placeholder="Descrição ou observações (opcional)"
								multiline
								value={description}
								onChangeText={setDescription}
							/>
						</Textarea>

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
							<Text className="font-semibold mb-2">Recebimento deste mês</Text>
							{!selectedGainTemplateId ? (
								<Text className="text-gray-600 dark:text-gray-400 mb-3">
									Salve o ganho obrigatório para habilitar o controle de recebimento mensal.
								</Text>
							) : isReceivedForCurrentCycle ? (
								<>
									<Text className="text-emerald-600 dark:text-emerald-400 mb-3">
										Recebimento registrado em{' '}
										{currentReceiptInfo?.receivedAt ? formatDateToBR(currentReceiptInfo.receivedAt) : 'data não disponível'}.
									</Text>
									<Button
										variant="outline"
										action="secondary"
										onPress={handleReclaimReceipt}
										isDisabled={isReceiptActionLoading}
									>
										{isReceiptActionLoading ? (
											<>
												<ButtonSpinner color="white" />
												<ButtonText>Processando</ButtonText>
											</>
										) : (
											<ButtonText>Reivindicar recebimento</ButtonText>
										)}
									</Button>
								</>
							) : (
								<>
									<Text className="text-gray-600 dark:text-gray-400 mb-3">
										Registre este ganho como recebido para marcá-lo neste ciclo ({getCurrentCycleKey()}).
									</Text>
									<Button
										variant="outline"
										action="primary"
										onPress={handleRegisterReceiptNavigation}
										isDisabled={isPrefilling || !selectedGainTemplateId || valueInCents === null || !selectedTagId}
									>
										<ButtonText>Adicionar aos ganhos</ButtonText>
									</Button>
								</>
							)}
						</Box>

						<View className="border border-outline-200 rounded-lg px-4 py-3 opacity-100">
							<HStack className="items-center justify-between">
								<View className="flex-1 mr-3">
									<Text className="font-semibold">Lembrete no dia previsto</Text>
									<Text className="text-gray-600 dark:text-gray-400 text-sm">
										Receba uma notificação quando o dia do ganho chegar para não esquecer o registro.
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
									<ButtonText className="ml-2">{selectedGainTemplateId ? 'Atualizando' : 'Registrando'}</ButtonText>
								</>
							) : (
								<ButtonText>{selectedGainTemplateId ? 'Atualizar ganho' : 'Registrar ganho'}</ButtonText>
							)}
						</Button>
					</VStack>
				</View>
			</ScrollView>

			<Menu defaultValue={1} />
		</View>
	);
}
