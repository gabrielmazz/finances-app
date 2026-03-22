
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
    View,
    Pressable,
    TouchableWithoutFeedback,
    Keyboard,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    TextInput,
    findNodeHandle,
} from 'react-native';

// Importações relacionadas ao Gluestack UI
import {
    FormControl,
    FormControlLabel,
    FormControlError,
    FormControlErrorText,
    FormControlErrorIcon,
    FormControlHelper,
    FormControlHelperText,
    FormControlLabelText,
} from '@/components/ui/form-control';
import { AlertCircleIcon } from '@/components/ui/icon';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';
import { Divider } from '@/components/ui/divider';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import {
    Modal,
    ModalBackdrop,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
} from '@/components/ui/modal';
import { HStack } from '@/components/ui/hstack';

import Loader from '@/components/uiverse/loader';
import { useAppTheme } from '@/contexts/ThemeContext';

// Importações relacionadas ao Firebase
import { auth } from '@/FirebaseConfig';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

// Importação responsável pela navegação pelo expo-router
import { router } from 'expo-router';

// Importação do wallpaper do login
import LoginWallpaper from '@/assets/Background/wallpaper01.jpg';
import LogoLumus from '@/assets/Logo/Logo.png';	
import LogoLumusWhite from '@/assets/Logo/LogoWhite.png';

type FocusableInputKey = 'email' | 'password';

export default function LoginScreen() {

	const { isDarkMode } = useAppTheme();
		const theme = useMemo(
			() => ({
				pageBackground: isDarkMode ? '#0b1220' : '#f4f5f7',
				surfaceBackground: isDarkMode ? '#020617' : '#ffffff',
				cardBackground: isDarkMode ? 'bg-slate-950' : 'bg-white border border-slate-200',
				headingText: isDarkMode ? 'text-slate-100' : 'text-slate-900',
			bodyText: isDarkMode ? 'text-slate-300' : 'text-slate-700',
			mutedText: isDarkMode ? 'text-slate-500' : 'text-slate-500',
			helperText: isDarkMode ? 'text-slate-400' : '#fff763',
			inputField: isDarkMode ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-500',
			button: isDarkMode ? '' : '',
			buttonText: 'font-semibold',
		}),
		[isDarkMode],
	);

	const {
		pageBackground,
		surfaceBackground,
		cardBackground,
		headingText,
		bodyText,
		mutedText,
		helperText,
		inputField,
		button,
		buttonText,
	} = theme;

    // Variaveis relacionadas ao login
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);
	const scrollViewRef = useRef<ScrollView | null>(null);
    const emailInputRef = useRef<TextInput | null>(null);
    const passwordInputRef = useRef<TextInput | null>(null);
    const lastFocusedInputKey = useRef<FocusableInputKey | null>(null);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
	const isLoginDisabled = email.trim().length === 0 || password.trim().length < 6;

    // ============================================= Funções para Login ============================================= //

    // Função responsável por fazer login de um usuário já cadastrado, conectando-o ao Firebase Authentication
    const singIn = async () => {
		if (isLoginDisabled) {
			alert('Informe login e senha (mínimo 6 caracteres).');
			return;
		}
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);

            if (userCredential) {
                router.replace({ pathname: '/home', params: { balanceReminder: '1' } });
            }

        } catch (error) {
            alert('Erro ao fazer login: ' + error);
        }
    }

    const signUp = async () => {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);

            if (userCredential) {

            }

        } catch (error) {
            alert('Erro ao criar conta: ' + error);
        }
    }

    const handleOpenCreditsModal = () => setIsCreditsModalOpen(true);
    const handleCloseCreditsModal = () => setIsCreditsModalOpen(false);
	const handleDismissKeyboard = () => Keyboard.dismiss();

    const keyboardScrollOffset = useCallback(
        (key: FocusableInputKey) => (key === 'password' ? 180 : 140),
        [],
    );

    const getInputRef = useCallback(
        (key: FocusableInputKey) => {
            switch (key) {
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

    const scrollToInput = useCallback(
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
                            y: Math.max(0, y - offset),
                            animated: true,
                        }),
                    () => {},
                );
            }
        },
        [getInputRef, keyboardScrollOffset],
    );

    const handleInputFocus = useCallback(
        (key: FocusableInputKey) => {
            lastFocusedInputKey.current = key;
            scrollToInput(key);
        },
        [scrollToInput],
    );

    useEffect(() => {
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

    const contentBottomPadding = useMemo(() => (keyboardHeight > 0 ? keyboardHeight + 24 : 24), [keyboardHeight]);

		return (
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
			<KeyboardAvoidingView
				className="flex-1"
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
			>
				<TouchableWithoutFeedback onPress={handleDismissKeyboard} accessible={false}>
					<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
						
						<View className={`w-full h-1/4 ${cardBackground}`}>
							<Image
								source={LoginWallpaper}
								className="w-full h-full rounded-b-3xl absolute"
								resizeMode="cover"
							/>
						</View>

						<View className={`flex-1 -mt-16 rounded-t-3xl ${cardBackground}`}>
							<ScrollView
								ref={scrollViewRef}
								style={{ flex: 1 }}
								contentContainerStyle={{
									paddingHorizontal: 24,
									paddingTop: 12,
									paddingBottom: contentBottomPadding,
								}}
								keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
								keyboardShouldPersistTaps="handled"
								showsVerticalScrollIndicator={false}
							>
								<Image
									source={isDarkMode ? LogoLumusWhite : LogoLumus}
									className="self-center w-52 h-52"
									resizeMode="contain"
								/>
								
								<VStack className="self-center items-center gap-2 mb-12">
									<Heading 
										className={`${headingText} text-xl text-center`}
									>
										Bem-vindo de volta ao Lumus Finances!
									</Heading>
									
									<Text 
										className={`${bodyText} text-base text-center`}
									>
										Faça login para acessar sua conta e gerenciar suas finanças.
									</Text>
								</VStack>

								<FormControl className="mb-4">
									<FormControlLabel>
										<FormControlLabelText className={`${bodyText} text-sm`}>Email</FormControlLabelText>
									</FormControlLabel>
									<Input className="bg-transparent border border-slate-300 rounded-md">
										<InputField
                                            ref={emailInputRef}
											placeholder="Digite seu email"
											keyboardType="email-address"
											autoCapitalize="none"
											value={email}
											onChangeText={setEmail}
											onFocus={() => handleInputFocus('email')}
											className={inputField}
										/>
									</Input>
								</FormControl>

								<FormControl className="mb-6">
									<FormControlLabel>
										<FormControlLabelText className={`${bodyText} text-sm`}>Senha</FormControlLabelText>
									</FormControlLabel>
									<Input className="bg-transparent border border-slate-300 rounded-md">
										<InputField
                                            ref={passwordInputRef}
											placeholder="Digite sua senha"
											value={password}
											onChangeText={setPassword}
											onFocus={() => handleInputFocus('password')}
											secureTextEntry
											className={inputField}
										/>
									</Input>
								</FormControl>

								<Button
									className={`w-full ${button} rounded-md py-3 ${isLoginDisabled ? 'bg-yellow-400' : 'bg-yellow-600'} ${buttonText}`}
									onPress={singIn}
									disabled={isLoginDisabled}
								>
									<ButtonText 
										className={`${isDarkMode ? 'text-white' : 'text-slate-900'} text-center`}
									>
										Entrar
									</ButtonText>
								</Button>
							</ScrollView>

							<VStack className="items-center px-4 pb-6">
								<VStack className="gap-1">
									<Text 
										className={`${mutedText} text-center text-xs`}
									>
										Desenvolvido por Gabriel Mazzuco
									</Text>

									<Text 
										className={`${mutedText} text-center text-xs`}
									>
										Versão 1.8.0
									</Text>
								</VStack>
							</VStack>
						</View>

					</View>
				</TouchableWithoutFeedback>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
