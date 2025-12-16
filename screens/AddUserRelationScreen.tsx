import React from 'react';
import {
	Keyboard,
	TouchableWithoutFeedback,
	View,
	StatusBar,
	ScrollView,
	KeyboardAvoidingView,
	Platform,
	TextInput,
	findNodeHandle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Componentes Gluestack UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { Box } from '@/components/ui/box';
import { Divider } from '@/components/ui/divider';

// Componentes Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

// Função responsável por atualizar a relação entre usuários
import { updateUserRelationsFirebase, getUserDataFirebase } from '@/functions/RegisterUserFirebase';
import { router } from 'expo-router';
import { auth } from '@/FirebaseConfig';
import { useAppTheme } from '@/contexts/ThemeContext';

// Importação do SVG
import AddUserRelationScreenIllustration from '../assets/UnDraw/addUserRelationScreen.svg';

type FocusableInputKey = 'related-user-id';

export default function AddUserRelationScreen() {
	const { isDarkMode } = useAppTheme();
	const pageBackground = isDarkMode ? '#0b1220' : '#f4f5f7';
	// Input do ID do usuário a ser relacionado
	const [relatedUserId, setRelatedUserId] = React.useState('');
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const scrollViewRef = React.useRef<ScrollView | null>(null);
	const relatedUserInputRef = React.useRef<TextInput | null>(null);
	const lastFocusedInputKey = React.useRef<FocusableInputKey | null>(null);
	const [keyboardHeight, setKeyboardHeight] = React.useState(0);
	const keyboardScrollOffset = React.useCallback((_key: FocusableInputKey) => 140, []);

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

	const getInputRef = React.useCallback((key: FocusableInputKey) => {
		switch (key) {
			case 'related-user-id':
				return relatedUserInputRef;
			default:
				return null;
		}
	}, []);

	const scrollToInput = React.useCallback(
		(key: FocusableInputKey) => {
			const inputRef = getInputRef(key);
			if (!inputRef?.current) {
				return;
			}

			const nodeHandle = findNodeHandle(inputRef.current);
			const scrollResponder = scrollViewRef.current?.getScrollResponder?.();
			const offset = keyboardScrollOffset(key);

			if (scrollResponder && nodeHandle) {
				scrollResponder.scrollResponderScrollNativeHandleToKeyboard(nodeHandle, offset, true);
				return;
			}

			const scrollViewNode = scrollViewRef.current;
			const innerViewNode = scrollViewNode?.getInnerViewNode?.();

			if (scrollViewNode && innerViewNode && typeof inputRef.current.measureLayout === 'function') {
				inputRef.current.measureLayout(
					innerViewNode,
					(_x, y) =>
						scrollViewNode.scrollTo({
							y: Math.max(0, y - keyboardScrollOffset(key)),
							animated: true,
						}),
					() => {},
				);
			}
		},
		[getInputRef, keyboardScrollOffset],
	);

	const handleInputFocus = React.useCallback(
		(key: FocusableInputKey) => {
			lastFocusedInputKey.current = key;
			scrollToInput(key);
		},
		[scrollToInput],
	);

	React.useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

		const showSub = Keyboard.addListener(showEvent, e => {
			setKeyboardHeight(e.endCoordinates?.height ?? 0);
			const focusedKey = lastFocusedInputKey.current;
			if (focusedKey) {
				setTimeout(() => {
					scrollToInput(focusedKey);
				}, 50);
			}
		});
		const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

		return () => {
			showSub.remove();
			hideSub.remove();
		};
	}, [scrollToInput]);

	const contentBottomPadding = React.useMemo(() => Math.max(140, keyboardHeight + 120), [keyboardHeight]);

	return (
		<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
				className="flex-1 w-full"
			>
				<ScrollView
					ref={scrollViewRef}
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					style={{ backgroundColor: pageBackground }}
					contentContainerStyle={{ flexGrow: 1, paddingBottom: contentBottomPadding }}
				>
					<View className="w-full px-6">

				<Heading size="3xl" className="text-center">
					Vincular usuário
				</Heading>

				<Box className="w-full items-center ">
					<AddUserRelationScreenIllustration width={180} height={180} />
				</Box>

				<Text className="text-justify text-gray-600 dark:text-gray-400">
					Informe o ID do usuário que deseja relacionar à sua conta. Ambos passarão a visualizar os
					dados financeiros compartilhados.
				</Text>

				<Divider className="my-6 mb-6" />


				<VStack className="gap-4">

					<Box>
						<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
							ID do usuário a ser vinculado com você
						</Text>
						<Input>
							<InputField
								ref={relatedUserInputRef}
								placeholder="ID do usuário que será vinculado com você e vice-versa"
								value={relatedUserId}
								onChangeText={setRelatedUserId}
								autoCapitalize="none"
								onFocus={() => handleInputFocus('related-user-id')}
							/>
						</Input>
					</Box>

					<Button
						className="w-full mt-2"
						size="sm"
						variant="outline"
						onPress={handleLinkUsers}
						isDisabled={isSubmitting || !relatedUserId.trim()}
					>
						{isSubmitting ? <ButtonSpinner /> : <ButtonText>Vincular usuário</ButtonText>}
					</Button>
				</VStack>
					</View>
				</ScrollView>
			</KeyboardAvoidingView>

			<Menu defaultValue={2} />
		</View>
		</SafeAreaView>
		</TouchableWithoutFeedback>
	);
}
