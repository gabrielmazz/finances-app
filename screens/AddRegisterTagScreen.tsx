import React from 'react';
import { Keyboard, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

// Importações relacionadas ao Gluestack UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import {
	Checkbox,
	CheckboxGroup,
	CheckboxIndicator,
	CheckboxIcon,
	CheckboxLabel,
} from '@/components/ui/checkbox';
import { CheckIcon } from '@/components/ui/icon';

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

// Importação das funções relacionadas a adição de tag ao Firebase
import { addTagFirebase, updateTagFirebase } from '@/functions/TagFirebase';
import { auth } from '@/FirebaseConfig';

export default function AddRegisterTagScreen() {

	// =========================================== Funções para Registro ============================================ //
	const [tagName, setTagName] = React.useState('');
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isExpenseTag, setIsExpenseTag] = React.useState(false);
	const [isGainTag, setIsGainTag] = React.useState(false);

	const params = useLocalSearchParams<{
		tagId?: string | string[];
		tagName?: string | string[];
		usageType?: string | string[];
	}>();

	const editingTagId = React.useMemo(() => {
		const value = Array.isArray(params.tagId) ? params.tagId[0] : params.tagId;
		return value && value.trim().length > 0 ? value : null;
	}, [params.tagId]);

	const initialTagName = React.useMemo(() => {
		const value = Array.isArray(params.tagName) ? params.tagName[0] : params.tagName;
		if (!value) {
			return '';
		}

		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}, [params.tagName]);

	const initialUsageType = React.useMemo(() => {
		const value = Array.isArray(params.usageType) ? params.usageType[0] : params.usageType;
		if (!value) {
		 return null;
		}

		try {
			const decoded = decodeURIComponent(value);
			return decoded ?? null;
		} catch {
			return value;
		}
	}, [params.usageType]);

	const isEditing = Boolean(editingTagId);

	React.useEffect(() => {
		if (!isEditing) {
			return;
		}

		setTagName(initialTagName);
		if (initialUsageType === 'expense') {
			setIsExpenseTag(true);
			setIsGainTag(false);
		} else if (initialUsageType === 'gain') {
			setIsGainTag(true);
			setIsExpenseTag(false);
		} else {
			setIsExpenseTag(false);
			setIsGainTag(false);
		}
	}, [initialTagName, initialUsageType, isEditing]);

	const handleUsageSelection = React.useCallback((values: string[]) => {
		if (values.includes('expense')) {
			setIsExpenseTag(true);
			setIsGainTag(false);
			return;
		}

		if (values.includes('gain')) {
			setIsGainTag(true);
			setIsExpenseTag(false);
			return;
		}

		setIsExpenseTag(false);
		setIsGainTag(false);
	}, []);

	const registerTag = React.useCallback(async () => {
		const trimmedName = tagName.trim();

		if (!trimmedName) {
			showFloatingAlert({
				message: 'Informe o nome da tag antes de registrar.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
			return;
		}

		const selectedUsageType = isExpenseTag ? 'expense' : isGainTag ? 'gain' : null;

		if (!selectedUsageType) {
			showFloatingAlert({
				message: 'Informe se a tag será utilizada para ganhos ou despesas.',
				action: 'error',
				position: 'bottom',
				offset: 40,
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
					offset: 40,
				});
				setIsSubmitting(false);
				return;
			}

			if (isEditing && editingTagId) {
				const result = await updateTagFirebase({
					tagId: editingTagId,
					tagName: trimmedName,
					usageType: selectedUsageType,
				});

				if (result.success) {
					showFloatingAlert({
						message: 'Tag atualizada com sucesso!',
						action: 'success',
						position: 'bottom',
						offset: 40,
					});
					Keyboard.dismiss();
					router.back();
				} else {
					showFloatingAlert({
						message: 'Erro ao atualizar tag. Tente novamente mais tarde.',
						action: 'error',
						position: 'bottom',
						offset: 40,
					});
				}

				return;
			}

			const result = await addTagFirebase({ tagName: trimmedName, personId, usageType: selectedUsageType });

			if (result.success) {
				showFloatingAlert({
					message: 'Tag registrada com sucesso!',
					action: 'success',
					position: 'bottom',
					offset: 40,
				});
				setTagName('');
				setIsExpenseTag(true);
				setIsGainTag(false);
				Keyboard.dismiss();
			} else {
				showFloatingAlert({
					message: 'Erro ao registrar tag. Tente novamente mais tarde.',
					action: 'error',
					position: 'bottom',
					offset: 40,
				});
			}
		} catch (error) {
			console.error('Erro ao registrar tag:', error);
			showFloatingAlert({
				message: 'Erro inesperado ao registrar tag. Tente novamente.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
		} finally {
			setIsSubmitting(false);

			// Limpar os campos após o registro
			setTagName('');
			setIsExpenseTag(false);
			setIsGainTag(false);
		}
	}, [editingTagId, isExpenseTag, isGainTag, isEditing, tagName]);

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

				<View className="w-full px-6 gap-4">
					<Heading size="3xl" className="text-center mb-6">
						{isEditing ? 'Editar tag' : 'Adição de nova tag'}
					</Heading>

					<VStack className="gap-4">
						<Text>
							{isEditing
								? 'Atualize as informações da tag selecionada. As alterações serão aplicadas imediatamente.'
								: 'Registre uma nova tag para categorizar as despesas, como investimento, mercado ou conta de casa. Ela ficará disponível para seleção nas telas do aplicativo.'}
						</Text>

						<Input>
							<InputField
								placeholder="Nome da Tag"
								value={tagName}
								onChangeText={setTagName}
								autoCapitalize="sentences"
							/>
						</Input>

							<VStack className="gap-3">
								<Text className="font-semibold">Tipo de utilização</Text>
								<Text className="text-gray-600 dark:text-gray-400">
									Selecione se essa tag será usada para ganhos ou despesas. Apenas uma opção pode ficar
									ativa.
								</Text>

								<CheckboxGroup
									value={isExpenseTag ? ['expense'] : isGainTag ? ['gain'] : []}
									onChange={handleUsageSelection}
								>
									<HStack space="2xl" className="items-center">

										<Checkbox value="expense" isDisabled={isGainTag}>
											<CheckboxIndicator>
												<CheckboxIcon as={CheckIcon} />
											</CheckboxIndicator>
											<CheckboxLabel>Tag para despesas</CheckboxLabel>
										</Checkbox>

										<Checkbox value="gain" isDisabled={isExpenseTag}>
											<CheckboxIndicator>
												<CheckboxIcon as={CheckIcon} />
											</CheckboxIndicator>
											<CheckboxLabel>Tag para ganhos</CheckboxLabel>
										</Checkbox>

									</HStack>
								</CheckboxGroup>
							</VStack>

						<Button
							className="w-full mt-2"
							size="sm"
							variant="outline"
							onPress={registerTag}
							isDisabled={
								isSubmitting || !tagName.trim() || (!isExpenseTag && !isGainTag)
							}
						>
							{isSubmitting ? (
								<ButtonSpinner />
							) : (
								<ButtonText>{isEditing ? 'Atualizar Tag' : 'Registrar Tag'}</ButtonText>
							)}
						</Button>
					</VStack>
				</View>

				<Menu defaultValue={2} />
			</View>
	);
}
