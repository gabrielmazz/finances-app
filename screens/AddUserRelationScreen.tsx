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
	useWindowDimensions,
	Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import {
	Popover,
	PopoverBackdrop,
	PopoverBody,
	PopoverContent,
} from '@/components/ui/popover';

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import Navigator from '@/components/uiverse/navigator';

import { updateUserRelationsFirebase, getUserDataFirebase } from '@/functions/RegisterUserFirebase';
import { router } from 'expo-router';
import { auth } from '@/FirebaseConfig';
import { useAppTheme } from '@/contexts/ThemeContext';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { Info } from 'lucide-react-native';

import { useScreenStyles } from '@/hooks/useScreenStyle';

import AddUserRelationScreenIllustration from '../assets/UnDraw/addUserRelationScreen.svg';

type FocusableInputKey = 'related-user-id';

export default function AddUserRelationScreen() {

	const {
			isDarkMode,
			surfaceBackground,
			cardBackground,
			bodyText,
			helperText,
			inputField,
			focusFieldClassName,
			fieldContainerClassName,
			fieldContainerClassNameNotSpace,
			fieldContainerCardClassName,
			textareaContainerClassName,
			submitButtonClassName,
			heroHeight,
			infoCardStyle,
			insets,
			labelText,
			switchRadioClassName,
			switchRadioIndicatorClassName,
			switchRadioIconClassName,
			switchRadioLabelClassName,
			addTagButtonClassName,
		} = useScreenStyles();

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

				showNotifierAlert({
					title: 'Usuário vinculado',
					description: 'A relação entre os usuários foi registrada com sucesso.',
					type: 'success',
					isDarkMode,
					duration: 4000,
				});

				setRelatedUserId('');
				Keyboard.dismiss();
				router.replace('/home?tab=0');

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
	}, [relatedUserId, isDarkMode]);

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
	const screenTitle = 'Vincular usuário';

	return (
		<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
		<SafeAreaView
			className="flex-1"
			edges={['left', 'right', 'bottom']}
			style={{ backgroundColor: surfaceBackground }}
		>
		<StatusBar
				translucent
				backgroundColor="transparent"
				barStyle={isDarkMode ? 'light-content' : 'dark-content'}
			/>
		<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
			<FloatingAlertViewport />

			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
				className="flex-1"
			>
				<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
					<View
						className={`absolute top-0 left-0 right-0 ${cardBackground}`}
						style={{ height: heroHeight }}
					>
						<Image
							source={LoginWallpaper}
							alt="Background da tela de vínculo de usuário"
							className="w-full h-full rounded-b-3xl absolute"
							resizeMode="cover"
						/>

						<VStack
							className="w-full h-full items-center justify-start px-6 gap-4"
							style={{ paddingTop: insets.top + 24 }}
						>
							<Heading size="xl" className="text-white text-center">
								{screenTitle}
							</Heading>
							<AddUserRelationScreenIllustration width="40%" height="40%" className="opacity-90" />
						</VStack>
					</View>

					<ScrollView
						ref={scrollViewRef}
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="on-drag"
						className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
						style={{ marginTop: heroHeight - 64 }}
						contentContainerStyle={{ paddingBottom: Math.max(32, contentBottomPadding - 108) }}
					>
						<VStack className="justify-between mt-4">

							<VStack className="mb-4">
								<HStack className="mb-1 ml-1 gap-1">
											<Text className={`${bodyText} text-sm`}>ID do usuário</Text>
											<Popover
												placement="bottom"
												size="md"
												offset={0}
												shouldFlip
												focusScope={false}
												trapFocus={false}
												trigger={triggerProps => (
													<Pressable
														{...triggerProps}
														hitSlop={8}
														accessibilityRole="button"
														accessibilityLabel="Informações sobre a observação da despesa"
													>
														<Info
															size={14}
															color={isDarkMode ? '#94A3B8' : '#64748B'}
															style={{ marginLeft: 4 }}
														/>
													</Pressable>
												)}
											>
												<PopoverBackdrop className="bg-transparent" />
												<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
													<PopoverBody className="px-3 py-3">
														<Text className={`${bodyText} text-xs leading-5`}>
															Informe o ID do usuário que deseja vincular com você. 
															Este vínculo permitirá compartilhar informações e dados financeiros. Lembrando, esse ID deve ser o mesmo registrado no banco, sendo possivel de conferir na tela de configurações do usuário.
														</Text>
													</PopoverBody>
												</PopoverContent>
											</Popover>
										</HStack>
								<Input className={fieldContainerClassName}>
									<InputField
										ref={relatedUserInputRef as any}
										placeholder="ID do usuário que será vinculado com você e vice-versa"
										value={relatedUserId}
										onChangeText={setRelatedUserId}
										autoCapitalize="none"
										className={inputField}
										onFocus={() => handleInputFocus('related-user-id')}
									/>
								</Input>
							</VStack>

							<Button
								className={submitButtonClassName}
								onPress={handleLinkUsers}
								isDisabled={isSubmitting || !relatedUserId.trim()}
							>
								{isSubmitting ? <ButtonSpinner /> : <ButtonText>Vincular usuário</ButtonText>}
							</Button>
						</VStack>
					</ScrollView>
				</View>
			</KeyboardAvoidingView>

			<View
				style={{
					marginHorizontal: -18,
					paddingBottom: 0,
					flexShrink: 0,
				}}
			>
				<Navigator defaultValue={2} />
			</View>
		</View>
		</SafeAreaView>
		</TouchableWithoutFeedback>
	);
}
