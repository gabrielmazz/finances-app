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

import { showNotifierAlert, type NotifierAlertType } from '@/components/uiverse/notifier-alert';
import Navigator from '@/components/uiverse/navigator';

import { updateUserRelationsFirebase, getUserDataFirebase } from '@/functions/RegisterUserFirebase';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { Info } from 'lucide-react-native';
import { navigateToHomeDashboard } from '@/utils/navigation';

import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';

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
	const relatedUserInputRef = React.useRef<TextInput | null>(null);
	const keyboardScrollOffset = React.useCallback((_key: FocusableInputKey) => 140, []);

	const showScreenAlert = React.useCallback(
		(description: string, type: NotifierAlertType = 'error') => {
			showNotifierAlert({
				description,
				type,
				isDarkMode,
			});
		},
		[isDarkMode],
	);

	const handleBackToHome = React.useCallback(() => {
		navigateToHomeDashboard();
		return true;
	}, []);

	const handleLinkUsers = React.useCallback(async () => {

		Keyboard.dismiss();

		const trimmedId = relatedUserId.trim();

		if (!trimmedId) {
			showScreenAlert('Informe o ID do usuário que deseja relacionar.', 'error');
			return;
		}

		// Verifica se o ID informado não é o mesmo do usuário logado
		const currentUser = auth.currentUser;

		if (!currentUser) {
			showScreenAlert('Nenhum usuário autenticado foi identificado.', 'error');
			return;
		}

		const currentUserId = currentUser.uid;

		if (trimmedId === currentUserId) {
			showScreenAlert('Você não pode vincular sua própria conta.', 'error');
			return;
		}

		// Verifica se o usuário que vai ser relacionado existe no banco de dados
		const userFetchResult = await getUserDataFirebase(trimmedId);
		const userExists = userFetchResult.success && userFetchResult.data;

		if (!userExists) {

			showScreenAlert('Usuário não encontrado.', 'error');

			return;
		}

		const relatedUserData = userFetchResult.data as { relatedIdUsers?: string[] } | undefined;
		const alreadyLinked =
			Array.isArray(relatedUserData?.relatedIdUsers) && relatedUserData.relatedIdUsers.includes(currentUserId);

		if (alreadyLinked) {
			showScreenAlert('Esse usuário já está vinculado à sua conta.', 'info');
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
				navigateToHomeDashboard();

			} else {

				showScreenAlert('Erro ao atualizar relação. Tente novamente mais tarde.', 'error');

			}

		} catch (error) {

			console.error('Erro ao atualizar relação de usuário:', error);

			showScreenAlert('Erro inesperado ao atualizar relação.', 'error');

		} finally {

			setIsSubmitting(false);
		}
	}, [relatedUserId, isDarkMode, showScreenAlert]);

	const getInputRef = React.useCallback((key: FocusableInputKey) => {
		switch (key) {
			case 'related-user-id':
				return relatedUserInputRef;
			default:
				return null;
		}
	}, []);

	const {
		scrollViewRef,
		contentBottomPadding,
		handleInputFocus,
		handleScroll,
		scrollEventThrottle,
	} = useKeyboardAwareScroll<FocusableInputKey>({
		getInputRef,
		keyboardScrollOffset,
	});
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
						onScroll={handleScroll}
						scrollEventThrottle={scrollEventThrottle}
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
				<Navigator defaultValue={2} onHardwareBack={handleBackToHome} />
			</View>
		</View>
		</SafeAreaView>
		</TouchableWithoutFeedback>
	);
}
