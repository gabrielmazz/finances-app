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
    Pressable
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';
import { HStack } from '@/components/ui/hstack';

import { Info } from 'lucide-react-native';

import { EyeIcon, EyeOffIcon } from '@/components/ui/icon';

import { registerUserFirebase } from '@/functions/RegisterUserFirebase';

import { showNotifierAlert } from '@/components/uiverse/notifier-alert';

import Navigator from '@/components/uiverse/navigator';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { navigateToHomeDashboard } from '@/utils/navigation';

import AddRegisterUserScreenIllustration from '../assets/UnDraw/addRegisterUserScreen.svg';

import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';

type FocusableInputKey = 'name' | 'email' | 'password';

const resolveRegisterUserErrorAlert = (error: unknown) => {
    const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code?: unknown }).code ?? '')
            : '';

    switch (errorCode) {
        case 'auth/email-already-in-use':
            return {
                title: 'E-mail já cadastrado',
                description: 'Já existe um usuário cadastrado com este e-mail.',
            };
        case 'auth/invalid-email':
            return {
                title: 'E-mail inválido',
                description: 'Informe um endereço de e-mail válido.',
            };
        case 'auth/weak-password':
            return {
                title: 'Senha inválida',
                description: 'A senha deve ter pelo menos 6 caracteres.',
            };
        case 'auth/network-request-failed':
            return {
                title: 'Falha de conexão',
                description: 'Falha de conexão ao registrar o usuário. Tente novamente.',
            };
        default:
            if (typeof error === 'object' && error !== null && 'message' in error) {
                const message = (error as { message?: unknown }).message;
                if (typeof message === 'string' && message.trim().length > 0) {
                    return {
                        title: 'Erro ao registrar usuário',
                        description: message,
                    };
                }
            }

            if (typeof error === 'string' && error.trim().length > 0) {
                return {
                    title: 'Erro ao registrar usuário',
                    description: error,
                };
            }

            return {
                title: 'Erro ao registrar usuário',
                description: 'Não foi possível registrar o usuário. Tente novamente.',
            };
    }
};

export default function AddRegisterUserScreen() {

    const {
        isDarkMode,
        surfaceBackground,
        cardBackground,
        bodyText,
        helperText,
        inputField,
        fieldContainerClassName,
        submitButtonClassName,
        heroHeight,
        infoCardStyle,
        insets
    } = useScreenStyles();

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
    const nameInputRef = React.useRef<TextInput | null>(null);
    const emailInputRef = React.useRef<TextInput | null>(null);
    const passwordInputRef = React.useRef<TextInput | null>(null);
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

    const handleBackToHome = React.useCallback(() => {
        navigateToHomeDashboard();
        return true;
    }, []);

    const registerUser = async () => {

        Keyboard.dismiss();

        const trimmedName = name.trim();
        const trimmedEmail = email.trim();

        if (!trimmedEmail) {
            showNotifierAlert({
                title: 'E-mail inválido',
                description: 'Informe o e-mail do usuário.',
                type: 'error',
                isDarkMode,
            });
            return;
        }

        if (!/\S+@\S+\.\S+/.test(trimmedEmail)) {
            showNotifierAlert({
                title: 'E-mail inválido',
                description: 'Informe um endereço de e-mail válido.',
                type: 'error',
                isDarkMode,
            });
            return;
        }

        if (!password) {
            showNotifierAlert({
                title: 'Senha inválida',
                description: 'Informe a senha do novo usuário.',
                type: 'error',
                isDarkMode,
            });
            return;
        }

        if (password.length < 6) {
            showNotifierAlert({
                title: 'Senha inválida',
                description: 'A senha deve ter pelo menos 6 caracteres.',
                type: 'error',
                isDarkMode,
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
                navigateToHomeDashboard();
                return;
            }

            const resolvedErrorAlert = resolveRegisterUserErrorAlert(result.error);
            showNotifierAlert({
                title: resolvedErrorAlert.title,
                description: resolvedErrorAlert.description,
                type: 'error',
                isDarkMode,
                duration: 4000,
            });

        } catch (error) {
            console.error('Erro ao registrar usuário:', error);
            const resolvedErrorAlert = resolveRegisterUserErrorAlert(error);
            showNotifierAlert({
                title: resolvedErrorAlert.title,
                description: resolvedErrorAlert.description,
                type: 'error',
                isDarkMode,
                duration: 4000,
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
                                onScroll={handleScroll}
                                scrollEventThrottle={scrollEventThrottle}
                            >
                                <VStack className="justify-between mt-4">

                                    <VStack className="mb-4">
                                        <HStack className="mb-1 ml-1">
                                            <Text className={`${bodyText} text-sm`}>Nome do usuário (opcional)</Text>
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
                                                            Este campo é opcional e serve para identificar o usuário de forma mais amigável.
                                                        </Text>
                                                    </PopoverBody>
                                                </PopoverContent>
                                            </Popover>
                                        </HStack>
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
                                        <HStack className="mb-1 ml-1">
                                            <Text className={`${bodyText} text-sm`}>Email do Usuário</Text>
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
                                                        accessibilityLabel="Informações sobre o email do usuário a ser registrado"
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
                                                            Informe o e-mail do usuário que será registrado. Este e-mail será utilizado para acessar a conta, portanto deve ser válido e único.
                                                        </Text>
                                                    </PopoverBody>
                                                </PopoverContent>
                                            </Popover>
                                        </HStack>
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
                                        <Input className={fieldContainerClassName} isDisabled={email.trim() === ''}>
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
                        <Navigator defaultValue={2} onHardwareBack={handleBackToHome} />
                    </View>

                </View>
            </SafeAreaView>
        </TouchableWithoutFeedback>

    );
}
