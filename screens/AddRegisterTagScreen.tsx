import React from 'react';
import { Keyboard, TouchableWithoutFeedback, View } from 'react-native';

// Importações relacionadas ao Gluestack UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

// Importação das funções relacionadas a adição de tag ao Firebase
import { addTagFirebase } from '@/functions/TagFirebase';

export default function AddRegisterTagScreen() {

	// =========================================== Funções para Registro ============================================ //
	const [tagName, setTagName] = React.useState('');
	const [isSubmitting, setIsSubmitting] = React.useState(false);

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

		setIsSubmitting(true);

		try {
			
			const result = await addTagFirebase({ tagName: trimmedName });

			if (result.success) {
				showFloatingAlert({
					message: 'Tag registrada com sucesso!',
					action: 'success',
					position: 'bottom',
					offset: 40,
				});
				setTagName('');
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
		}
	}, [tagName]);

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
						Adição de nova tag
					</Heading>

					<VStack className="gap-4">
						<Text>
							Registre uma nova tag para categorizar as despesas, como investimento, mercado ou conta de
							casa. Ela ficará disponível para seleção nas telas do aplicativo.
						</Text>

						<Input>
							<InputField
								placeholder="Nome da Tag"
								value={tagName}
								onChangeText={setTagName}
								autoCapitalize="sentences"
							/>
						</Input>

						<Button
							className="w-full mt-2"
							size="sm"
							variant="outline"
							onPress={registerTag}
							isDisabled={isSubmitting}
						>
							{isSubmitting ? (
								<ButtonSpinner />
							) : (
								<ButtonText>
									Registrar Tag
								</ButtonText>
							)}
						</Button>
					</VStack>
				</View>

				<Menu defaultValue={2} />
			</View>
		</TouchableWithoutFeedback>
	);
}
