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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';

import { EyeIcon, EyeOffIcon } from '@/components/ui/icon';

import { registerUserFirebase } from '@/functions/RegisterUserFirebase';

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';

import { router } from 'expo-router';
import Navigator from '@/components/uiverse/navigator';
import { useAppTheme } from '@/contexts/ThemeContext';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';

import AddRegisterUserScreenIllustration from '../assets/UnDraw/addRegisterUserScreen.svg';

type FocusableInputKey = 'name' | 'email' | 'password';

const resolveRegisterUserErrorMessage = (error: unknown) => {
	const errorCode =
		typeof error === 'object' && error !== null && 'code' in error
			? String((error as { code?: unknown }).code ?? '')
			: '';

	switch (errorCode) {
		case 'auth/email-already-in-use':
			return 'Já existe um usuário cadastrado com este e-mail.';
		case 'auth/invalid-email':
			return 'Informe um endereço de e-mail válido.';
		case 'auth/weak-password':
			return 'A senha deve ter pelo menos 6 caracteres.';
		case 'auth/network-request-failed':
			return 'Falha de conexão ao registrar o usuário. Tente novamente.';
		default:
			if (typeof error === 'object' && error !== null && 'message' in error) {
				const message = (error as { message?: unknown }).message;
				if (typeof message === 'string' && message.trim().length > 0) {
					return message;
				}
			}

			if (typeof error === 'string' && error.trim().length > 0) {
				return error;
			}

			return 'Não foi possível registrar o usuário. Tente novamente.';
	}
};

export default function AddRegisterUserScreen() {
	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { height: windowHeight } = useWindowDimensions();

	const surfaceBackground = isDarkMode ? '#020617' : '#FFFFFF';
	const cardBackground = isDarkMode ? 'bg-slate-950' : 'bg-white';
	const bodyText = isDarkMode ? 'text-slate-300' : 'text-slate-700';
	const helperText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
	const inputField = isDarkMode
		? 'text-slate-100 placeholder:text-slate-500'
		: 'text-slate-900 placeholder:text-slate-500';
	const focusFieldClassName =
		'data-[focus=true]:border-[#FFE000] dark:data-[focus=true]:border-yellow-300';
	const fieldContainerClassName = `h-10 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const fieldContainerCardClassName = `rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const submitButtonClassName = isDarkMode
		? 'bg-yellow-300/80 text-slate-900 hover:bg-yellow-300 rounded-2xl'
		: 'bg-yellow-400 text-white hover:bg-yellow-500 rounded-2xl';
	const heroHeight = Math.max(windowHeight * 0.28, 250) + insets.top;

    const [showPassword, setShowPassword] = React.useState(false);

    const handleState = () => {
        setShowPassword((showState) => {
            return !showState;
        });
    };


    const [name, setName] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const scrollViewRef = React.useRef<ScrollView | null>(null);
    const nameInputRef = React.useRef<TextInput | null>(null);
    const emailInputRef = React.useRef<TextInput | null>(null);
    const passwordInputRef = React.useRef<TextInput | null>(null);
    const lastFocusedInputKey = React.useRef<FocusableInputKey | null>(null);
    const [keyboardHeight, setKeyboardHeight] = React.useState(0);
    const keyboardScrollOffset = React.useCallback(
        (key: FocusableInputKey) => {
            if (key === 'password') {
                return 160;
            }

            if (key === 'email') {
                return 120;
            }

            return 80;
        },
        [],
    );

    const registerUser = async () => {

        Keyboard.dismiss();

        const trimmedName = name.trim();
        const trimmedEmail = email.trim();

        if (!trimmedEmail) {
            showFloatingAlert({
                message: 'Informe o e-mail do usuário.',
                action: 'error',
                position: 'bottom',
                offset: 40,
            });
            return;
        }

        if (!/\S+@\S+\.\S+/.test(trimmedEmail)) {
            showFloatingAlert({
                message: 'Informe um endereço de e-mail válido.',
                action: 'error',
                position: 'bottom',
                offset: 40,
            });
            return;
        }

        if (!password) {
            showFloatingAlert({
                message: 'Informe a senha do novo usuário.',
                action: 'error',
                position: 'bottom',
                offset: 40,
            });
            return;
        }

        if (password.length < 6) {
            showFloatingAlert({
                message: 'A senha deve ter pelo menos 6 caracteres.',
                action: 'error',
                position: 'bottom',
                offset: 40,
            });
            return;
        }

        setIsSubmitting(true);

        try {
            const result = await registerUserFirebase({
                name: trimmedName.length > 0 ? trimmedName : undefined,
                email: trimmedEmail,
                password,
            });

            if (result.success) {
                showNotifierAlert({
                    title: 'Usuário registrado',
                    description: `O usuário ${trimmedName || trimmedEmail} foi registrado com sucesso.`,
                    type: 'success',
                    isDarkMode,
                    duration: 4000,
                });

                setName('');
                setEmail('');
                setPassword('');
                router.replace('/home?tab=0');
                return;
            }

            showFloatingAlert({
                message: resolveRegisterUserErrorMessage(result.error),
                action: 'error',
                position: 'bottom',
                offset: 40,
            });
        } catch (error) {
            console.error('Erro ao registrar usuário:', error);
            showFloatingAlert({
                message: 'Erro inesperado ao registrar o usuário.',
                action: 'error',
                position: 'bottom',
                offset: 40,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

	const getInputRef = React.useCallback(
		(key: FocusableInputKey) => {
			switch (key) {
                case 'name':
                    return nameInputRef;
				case 'email':
					return emailInputRef;
				case 'password':
					return passwordInputRef;
				default:
					return null;
			}
		},
		[],
	);

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
    const screenTitle = 'Adição de um novo usuário';

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
                            alt="Background da tela de cadastro de usuário"
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
                            <AddRegisterUserScreenIllustration width="40%" height="40%" className="opacity-90" />
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
                            <View className={`${fieldContainerCardClassName} px-4 py-4 mb-4`}>
                                <Text className={`${bodyText} text-sm leading-6`}>
                                    Preencha os campos abaixo para registrar um novo usuário no aplicativo. Ele
                                    poderá fazer login utilizando as credenciais informadas.
                                </Text>
                            </View>

                            <VStack className="mb-4">
                                <Text className={`${bodyText} mb-1 ml-1 text-sm`}>
                                    Nome do usuário (opcional)
                                </Text>
                                <Input className={fieldContainerClassName}>
                                    <InputField
                                        ref={nameInputRef as any}
                                        placeholder="Nome da pessoa que terá acesso à conta"
                                        autoCapitalize="words"
                                        value={name}
                                        onChangeText={setName}
                                        className={inputField}
                                        onFocus={() => handleInputFocus('name')}
                                    />
                                </Input>
                            </VStack>

                            <VStack className="mb-4">
                                <Text className={`${bodyText} mb-1 ml-1 text-sm`}>Email do usuário</Text>
                                <Input className={fieldContainerClassName}>
                                    <InputField
                                        ref={emailInputRef as any}
                                        placeholder="Email do usuário que será registrado"
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        value={email}
                                        onChangeText={setEmail}
                                        className={inputField}
                                        onFocus={() => handleInputFocus('email')}
                                    />
                                </Input>
                            </VStack>

                            <VStack className="mb-4">
                                <Text className={`${bodyText} mb-1 ml-1 text-sm`}>Senha do usuário</Text>
                                <Input className={fieldContainerClassName}>
                                    <InputField
                                        ref={passwordInputRef as any}
                                        placeholder="Senha"
                                        secureTextEntry={!showPassword}
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChangeText={setPassword}
                                        className={inputField}
                                        onFocus={() => handleInputFocus('password')}
                                    />
                                    <InputSlot className="pr-3" onPress={handleState}>
                                        <InputIcon
                                            as={showPassword ? EyeIcon : EyeOffIcon}
                                            className={helperText}
                                        />
                                    </InputSlot>
                                </Input>
                            </VStack>

                            <Button
                                className={submitButtonClassName}
                                onPress={registerUser}
                                isDisabled={isSubmitting || email.trim() === '' || password === ''}
                            >
                                {isSubmitting ? <ButtonSpinner /> : <ButtonText>Registrar Usuário</ButtonText>}
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
