import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
	Keyboard,
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

import { showNotifierAlert, type NotifierAlertType } from '@/components/uiverse/feedback/notifier-alert';
import Navigator from '@/components/uiverse/navigation/navigator';
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';

import { updateUserRelationsFirebase } from '@/functions/RegisterUserFirebase';
import { runUserRelationshipFirebase } from '@/functions/UserRelationshipFirebase';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { Info } from 'lucide-react-native';
import { APP_ROUTE_PATHS, navigateBackOrRoute, replaceToRoute } from '@/utils/navigation';
import { LUMUS_CLASS_NAMES } from '@/design-system/tokens';

import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';
import { ScreenDismissKeyboard } from '@/components/uiverse/shared/screen-dismiss-keyboard';

import AddUserRelationScreenIllustration from '../../assets/UnDraw/addUserRelationScreen.svg';

type FocusableInputKey = 'related-user-id';

export default function AddUserRelationScreen() {
	const { fromProfile } = useLocalSearchParams<{ fromProfile?: string }>();

	const {
		webExpenseClassNames,
		webDashboardClassNames,
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
	const submitLockRef = React.useRef(false);
	const relatedUserInputRef = React.useRef<TextInput | null>(null);
	const applyPostSubmitBehavior = usePostSubmitBehavior('addUserRelation');
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

	const handleBackToProfile = React.useCallback(() => {
		if (fromProfile === '1') navigateBackOrRoute(APP_ROUTE_PATHS.profile);
		else replaceToRoute(APP_ROUTE_PATHS.profile);
		return true;
	}, [fromProfile]);

	const resetRelationForm = React.useCallback(() => {
		setRelatedUserId('');
	}, []);

	const handleLinkUsers = React.useCallback(async () => {
		if (submitLockRef.current || isSubmitting) {
			return;
		}

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

		submitLockRef.current = true;
		setIsSubmitting(true);

		try {
			const preview = await runUserRelationshipFirebase(currentUserId, { action: 'preview', relatedUserId: trimmedId });
			if (preview.isLinked) {
				showScreenAlert('Esse usuário já está vinculado à sua conta.', 'info');
				return;
			}

			if (!preview.fingerprint) throw new Error('Confira o vínculo novamente.');
			const result = await updateUserRelationsFirebase(trimmedId, {
				expectedFingerprint: preview.fingerprint,
				clientActionId: `relationship-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
			});


			if (result.success) {

				showNotifierAlert({
					title: 'Usuário vinculado',
					description: 'A relação entre os usuários foi registrada com sucesso.',
					type: 'success',
					isDarkMode,
					duration: 4000,
				});

				applyPostSubmitBehavior({ resetForm: resetRelationForm });

			} else {

				showScreenAlert('Erro ao atualizar relação. Tente novamente mais tarde.', 'error');

			}

		} catch (error) {

			console.error('Erro ao atualizar relação de usuário:', error);

			showScreenAlert('Erro inesperado ao atualizar relação.', 'error');

		} finally {

			submitLockRef.current = false;
			setIsSubmitting(false);
		}
	}, [relatedUserId, isDarkMode, isSubmitting, showScreenAlert, applyPostSubmitBehavior, resetRelationForm]);

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
		<ScreenDismissKeyboard>
			<SafeAreaView
				className="flex-1 web:w-screen"
				edges={['left', 'right', 'bottom']}
				style={{ backgroundColor: surfaceBackground }}
			>
				<StatusBar
					translucent
					backgroundColor="transparent"
					barStyle={isDarkMode ? 'light-content' : 'dark-content'}
				/>
				<View className="flex-1 web:w-screen" style={{ backgroundColor: surfaceBackground }}>
					<KeyboardAvoidingView
						behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
						keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
						className="flex-1"
					>
						<View className="flex-1 web:w-screen" style={{ backgroundColor: surfaceBackground }}>
							<View
								className={`absolute top-0 left-0 right-0 web:w-screen ${cardBackground}`}
								style={{ height: heroHeight }}
							>
								<Image
									source={LoginWallpaper}
									alt="Background da tela de vínculo de usuário"
									className="w-full h-full rounded-b-3xl absolute"
									resizeMode="cover"
								/>

								<WebScreenHero
									title={screenTitle}
									Illustration={AddUserRelationScreenIllustration}
									isDarkMode={isDarkMode}
									topPadding={insets.top + 24}
								/>
							</View>

							<ScrollView
								ref={scrollViewRef}
								keyboardShouldPersistTaps="handled"
								keyboardDismissMode="on-drag"
								className={`${webDashboardClassNames.sheet} ${cardBackground} web:relative web:z-[3]`}
								style={{ marginTop: heroHeight - 64 }}
								contentContainerStyle={{ paddingBottom: Math.max(32, contentBottomPadding - 108) }}
								onScroll={handleScroll}
								scrollEventThrottle={scrollEventThrottle}
							>
								<VStack className={`${webDashboardClassNames.contentFrame} ${webDashboardClassNames.contentPadding} justify-between mt-4`}>

									<Button variant="outline" className={`${LUMUS_CLASS_NAMES.secondaryButton} mb-4`} onPress={handleBackToProfile}>
										<ButtonText className={LUMUS_CLASS_NAMES.body}>Voltar ao perfil</ButtonText>
									</Button>

									<VStack className="mb-4">
										<HStack className={`${webExpenseClassNames.sectionLabel} mb-2`}>
											<Text className={`${webExpenseClassNames.fieldInlineLabel} ${bodyText}`}>ID do usuário</Text>
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
														accessibilityLabel="Sobre o vínculo entre usuários"
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
															O vínculo permite compartilhar gastos e ganhos. A outra pessoa pode copiar o ID dela em Meu perfil.
														</Text>
													</PopoverBody>
												</PopoverContent>
											</Popover>
										</HStack>
										<Input className={`${fieldContainerClassName} ${webExpenseClassNames.fieldInput}`}>
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
										className={`${submitButtonClassName} web:mt-2 web:h-12`}
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
						<Navigator defaultValue={2} onHardwareBack={handleBackToProfile} />
					</View>
				</View>
			</SafeAreaView>
		</ScreenDismissKeyboard>
	);
}
