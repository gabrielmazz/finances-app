import React from 'react';
import { Keyboard, TouchableWithoutFeedback, View } from 'react-native';

// Componentes Gluestack UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';

// Componentes Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

// Função responsável por atualizar a relação entre usuários
import { updateUserRelationsFirebase, getUserDataFirebase } from '@/functions/RegisterUserFirebase';
import { router } from 'expo-router';
import { auth } from '@/FirebaseConfig';

export default function AddUserRelationScreen() {
	// Input do ID do usuário a ser relacionado
	const [relatedUserId, setRelatedUserId] = React.useState('');
	const [isSubmitting, setIsSubmitting] = React.useState(false);

	const handleLinkUsers = React.useCallback(async () => {

		Keyboard.dismiss();

		const trimmedId = relatedUserId.trim();

		if (!trimmedId) {
			showFloatingAlert({
				message: 'Informe o ID do usuário que deseja relacionar.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
			return;
		}

		// Verifica se o ID informado não é o mesmo do usuário logado
		const currentUser = auth.currentUser;

		if (!currentUser) {
			showFloatingAlert({
				message: 'Nenhum usuário autenticado foi identificado.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
			return;
		}

		const currentUserId = currentUser.uid;

		if (trimmedId === currentUserId) {
			showFloatingAlert({
				message: 'Você não pode vincular sua própria conta.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
			return;
		}

		// Verifica se o usuário que vai ser relacionado existe no banco de dados
		const userFetchResult = await getUserDataFirebase(trimmedId);
		const userExists = userFetchResult.success && userFetchResult.data;

		if (!userExists) {

			showFloatingAlert({
				message: 'Usuário não encontrado.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
			
			return;
		}

		const relatedUserData = userFetchResult.data as { relatedIdUsers?: string[] } | undefined;
		const alreadyLinked =
			Array.isArray(relatedUserData?.relatedIdUsers) && relatedUserData.relatedIdUsers.includes(currentUserId);

		if (alreadyLinked) {
			showFloatingAlert({
				message: 'Esse usuário já está vinculado à sua conta.',
				action: 'info',
				position: 'bottom',
				offset: 40,
			});
			return;
		}

		setIsSubmitting(true);

		try {

			const result = await updateUserRelationsFirebase(trimmedId);


			if (result.success) {
				
				showFloatingAlert({
					message: 'Relação atualizada com sucesso!',
					action: 'success',
					position: 'bottom',
					offset: 40,
					persistAcrossScreens: true,
				});

				setRelatedUserId('');
				Keyboard.dismiss();
				router.back();

			} else {

				showFloatingAlert({
					message: 'Erro ao atualizar relação. Tente novamente mais tarde.',
					action: 'error',
					position: 'bottom',
					offset: 40,
				});

			}

		} catch (error) {

			console.error('Erro ao atualizar relação de usuário:', error);

			showFloatingAlert({
				message: 'Erro inesperado ao atualizar relação.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});

		} finally {

			setIsSubmitting(false);
		}
	}, [relatedUserId]);

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

				<View className="w-full px-6 gap-4">
					<Heading size="3xl" className="text-center mb-6">
						Vincular usuário
					</Heading>

					<VStack className="gap-4">
						<Text>
							Informe o ID do usuário que deseja relacionar à sua conta. Ambos passarão a visualizar os
							dados financeiros compartilhados.
						</Text>

						<Input>
							<InputField
								placeholder="ID do usuário"
								value={relatedUserId}
								onChangeText={setRelatedUserId}
								autoCapitalize="none"
							/>
						</Input>

						<Button
							className="w-full mt-2"
							size="sm"
							variant="outline"
							onPress={handleLinkUsers}
							isDisabled={isSubmitting}
						>
							{isSubmitting ? <ButtonSpinner /> : <ButtonText>Vincular usuário</ButtonText>}
						</Button>
					</VStack>
				</View>

				<Menu defaultValue={2} />
			</View>
		</TouchableWithoutFeedback>
	);
}
