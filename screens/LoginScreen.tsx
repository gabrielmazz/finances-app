import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	View,
	TouchableWithoutFeedback,
	Keyboard,
	StatusBar,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	findNodeHandle,
} from 'react-native';

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
import { AlertCircleIcon, EyeIcon, EyeOffIcon } from '@/components/ui/icon';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';

import { useAppTheme } from '@/contexts/ThemeContext';
import { auth } from '@/FirebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import LogoLumus from '@/assets/Logo/Logo.png';
import LogoLumusWhite from '@/assets/Logo/LogoWhite.png';
import {
	clearFailedLoginAttempts,
	clampEmailInput,
	clampPasswordInput,
	formatRemainingTime,
	getLoginThrottleStatus,
	isEmailFormatValid,
	mapLoginError,
	normalizeEmailForAuth,
	registerFailedLoginAttempt,
} from '@/utils/loginSecurity';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { getUserDataFirebase } from '@/functions/RegisterUserFirebase';
// Canal padronizado de alertas in-app conforme [[Notificações]]
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';

type FocusableInputKey = 'email' | 'password';


export default function LoginScreen() {

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
			insets,
			compactCardClassName,
			notTintedCardClassName,
			topSummaryCardClassName,
		} = useScreenStyles();

	const theme = useMemo(
		() => ({
			surfaceBackground: isDarkMode ? '#020617' : '#ffffff',
			cardBackground: isDarkMode ? 'bg-slate-950' : 'bg-white',
			headingText: isDarkMode ? 'text-slate-100' : 'text-slate-900',
			bodyText: isDarkMode ? 'text-slate-300' : 'text-slate-700',
			mutedText: isDarkMode ? 'text-slate-500' : 'text-slate-500',
			helperText: isDarkMode ? 'text-slate-400' : 'text-slate-500',
			inputField: isDarkMode
				? 'text-slate-100 placeholder:text-slate-500'
				: 'text-slate-900 placeholder:text-slate-500',
			buttonText: 'font-semibold',
		}),
		[isDarkMode]
	);

	const {
		headingText,
		mutedText,
		buttonText,
	} = theme;

	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [emailError, setEmailError] = useState<string | null>(null);
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [keyboardHeight, setKeyboardHeight] = useState(0);
	const [loginCooldownUntil, setLoginCooldownUntil] = useState<number | null>(null);
	const [clockTick, setClockTick] = useState(Date.now());

	const scrollViewRef = useRef<ScrollView | null>(null);
	const emailInputRef = useRef<any>(null);
	const passwordInputRef = useRef<any>(null);
	const lastFocusedInputKey = useRef<FocusableInputKey | null>(null);

	const normalizedEmail = useMemo(() => normalizeEmailForAuth(email), [email]);
	const loginCooldownRemainingMs = useMemo(
		() => (loginCooldownUntil ? Math.max(0, loginCooldownUntil - clockTick) : 0),
		[clockTick, loginCooldownUntil]
	);
	const isLocallyRateLimited = loginCooldownRemainingMs > 0;
	const isLoginDisabled =
		isSubmitting || isLocallyRateLimited || normalizedEmail.length === 0 || password.length === 0;

	const keyboardScrollOffset = useCallback(
		(key: FocusableInputKey) => (key === 'password' ? 180 : 140),
		[]
	);

	const contentBottomPadding = useMemo(
		() => (keyboardHeight > 0 ? keyboardHeight + 24 : 24),
		[keyboardHeight]
	);

	const handleDismissKeyboard = useCallback(() => Keyboard.dismiss(), []);

	const getInputRef = useCallback((key: FocusableInputKey) => {
		switch (key) {
			case 'email':
				return emailInputRef;
			case 'password':
				return passwordInputRef;
			default:
				return null;
		}
	}, []);

	const syncCooldownForEmail = useCallback(async (emailValue: string) => {
		if (!emailValue) {
			setLoginCooldownUntil(null);
			return;
		}

		const status = await getLoginThrottleStatus(emailValue);
		setLoginCooldownUntil(status.blockedUntil);
	}, []);

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
					(_x: number, y: number) =>
						scrollViewNode.scrollTo({
							y: Math.max(0, y - offset),
							animated: true,
						}),
					() => {}
				);
			}
		},
		[getInputRef, keyboardScrollOffset]
	);

	const handleInputFocus = useCallback(
		(key: FocusableInputKey) => {
			lastFocusedInputKey.current = key;
			scrollToInput(key);
		},
		[scrollToInput]
	);

	const handleEmailChange = useCallback((value: string) => {
		setEmail(clampEmailInput(value));
		setEmailError(null);

	}, []);

	const handlePasswordChange = useCallback((value: string) => {
		setPassword(clampPasswordInput(value));
		setPasswordError(null);

	}, []);

	const handleTogglePasswordVisibility = useCallback(() => {
		setShowPassword(currentValue => !currentValue);
	}, []);

	const validateCredentials = useCallback(() => {
		const nextEmail = normalizeEmailForAuth(email);
		let nextEmailError: string | null = null;
		let nextPasswordError: string | null = null;

		if (!nextEmail) {
			nextEmailError = 'Informe seu email.';
		} else if (!isEmailFormatValid(nextEmail)) {
			nextEmailError = 'Informe um email válido.';
		}

		if (!password) {
			nextPasswordError = 'Informe sua senha.';
		}

		setEmailError(nextEmailError);
		setPasswordError(nextPasswordError);

		return {
			nextEmail,
			isValid: !nextEmailError && !nextPasswordError,
		};
	}, [email, password]);

	const signIn = useCallback(async () => {
		if (isSubmitting) {
			return;
		}

		const { nextEmail, isValid } = validateCredentials();
		if (!isValid) {
			return;
		}

		const throttleStatus = await getLoginThrottleStatus(nextEmail);
		if (throttleStatus.isBlocked) {
			setLoginCooldownUntil(throttleStatus.blockedUntil);
			showNotifierAlert({
				description: `Muitas tentativas no dispositivo. Tente novamente em ${formatRemainingTime(
					throttleStatus.remainingMs
				)}.`,
				type: 'warn',
				isDarkMode,
			});
			return;
		}

		Keyboard.dismiss();

		setIsSubmitting(true);

		try {
			const userCredential = await signInWithEmailAndPassword(auth, nextEmail, password);
			await clearFailedLoginAttempts(nextEmail);
			setLoginCooldownUntil(null);
			await userCredential.user.reload();

			// Busca o nome do usuário no Firestore (fonte primária) com fallback para displayName do Auth
			let userName = userCredential.user.displayName?.trim() || null;
			try {
				const userData = await getUserDataFirebase(userCredential.user.uid);
				if (userData.success) {
					const storedName = (userData.data as { name?: unknown })?.name;
					if (typeof storedName === 'string' && storedName.trim()) {
						userName = storedName.trim().split(/\s+/)[0] ?? userName;
					}
				}
			} catch {
				// Fallback silencioso para displayName do Auth
			}

			showNotifierAlert({
				description: userName
					? `Login realizado. Bem-vindo, ${userName}!`
					: 'Login realizado. Redirecionando...',
				type: 'success',
				isDarkMode,
			});
		} catch (error) {
			const mappedError = mapLoginError(error);

			if (mappedError.category === 'credentials') {
				const nextThrottleStatus = await registerFailedLoginAttempt(nextEmail);
				setLoginCooldownUntil(nextThrottleStatus.blockedUntil);

				if (nextThrottleStatus.isBlocked) {
					showNotifierAlert({
						description: `Email ou senha inválidos. Tente novamente em ${formatRemainingTime(
							nextThrottleStatus.remainingMs
						)}.`,
						type: 'error',
						isDarkMode,
					});
				} else {
					showNotifierAlert({
						description: mappedError.message,
						type: 'error',
						isDarkMode,
					});
				}
			} else {
				showNotifierAlert({
					description: mappedError.message,
					type: mappedError.category === 'verification' ? 'warn' : 'error',
					isDarkMode,
				});
			}
		} finally {
			setIsSubmitting(false);
		}
	}, [isSubmitting, isDarkMode, validateCredentials]);

	useEffect(() => {
		void syncCooldownForEmail(normalizedEmail);
	}, [normalizedEmail, syncCooldownForEmail]);

	useEffect(() => {
		if (!loginCooldownUntil || loginCooldownUntil <= Date.now()) {
			setClockTick(Date.now());
			return;
		}

		const interval = setInterval(() => {
			setClockTick(Date.now());
		}, 1000);

		return () => clearInterval(interval);
	}, [loginCooldownUntil]);

	useEffect(() => {
		if (loginCooldownUntil && loginCooldownUntil <= Date.now()) {
			setLoginCooldownUntil(null);
		}
	}, [clockTick, loginCooldownUntil]);

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

	const derivedCooldownMessage = isLocallyRateLimited
		? `Muitas tentativas no dispositivo. Tente novamente em ${formatRemainingTime(
				loginCooldownRemainingMs
		  )}.`
		: null;

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
					<ScrollView
						ref={scrollViewRef}
						style={{ flex: 1, backgroundColor: surfaceBackground }}
						contentContainerStyle={{
							flexGrow: 1,
							paddingBottom: contentBottomPadding,
						}}
						keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}
					>
						<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
							<View className={`w-full h-1/4 ${cardBackground}`}>
								<Image
									source={LoginWallpaper}
									alt="Wallpaper da tela de login"
									className="w-full h-full rounded-b-3xl absolute"
									resizeMode="cover"
								/>
							</View>

							<View className={`flex-1 -mt-16 rounded-t-3xl ${cardBackground} px-6 pt-12`}>
								<Image
									source={isDarkMode ? LogoLumusWhite : LogoLumus}
									alt="Logo da Lumus"
									className="self-center w-52 h-52"
									resizeMode="contain"
								/>

								<VStack className="self-center items-center gap-2 mb-12">
									<Heading className={`${headingText} text-xl text-center`}>
										Bem-vindo de volta ao Lumus Finances!
									</Heading>

									<Text className={`${bodyText} text-base text-center`}>
										Faça login para acessar sua conta e gerenciar suas finanças.
									</Text>
								</VStack>

								<FormControl className="mb-4">
									<FormControlLabel>
										<FormControlLabelText className={`${bodyText} mb-1 ml-1 text-sm`}>
											Email
										</FormControlLabelText>
									</FormControlLabel>
									<Input className={fieldContainerClassName}>
										<InputField
											ref={emailInputRef}
											placeholder="Digite seu email"
											keyboardType="email-address"
											autoCapitalize="none"
											autoCorrect={false}
											autoComplete="email"
											textContentType="emailAddress"
											returnKeyType="next"
											value={email}
											onChangeText={handleEmailChange}
											onFocus={() => handleInputFocus('email')}
											onSubmitEditing={() => passwordInputRef.current?.focus()}
											className={inputField}
										/>
									</Input>
									{emailError ? (
										<FormControlError>
											<FormControlErrorIcon as={AlertCircleIcon} />
											<FormControlErrorText>{emailError}</FormControlErrorText>
										</FormControlError>
									) : null}
								</FormControl>

								<FormControl className="mb-6">
									<FormControlLabel>
										<FormControlLabelText className={`${bodyText} mb-1 ml-1 text-sm`}>
											Senha
										</FormControlLabelText>
									</FormControlLabel>
									<Input className={fieldContainerClassName}>
										<InputField
											ref={passwordInputRef}
											placeholder="Digite sua senha"
											value={password}
											onChangeText={handlePasswordChange}
											onFocus={() => handleInputFocus('password')}
											onSubmitEditing={() => void signIn()}
											autoCapitalize="none"
											autoCorrect={false}
											autoComplete="password"
											textContentType="password"
											returnKeyType="done"
											secureTextEntry={!showPassword}
											className={inputField}
										/>
										<InputSlot className="pr-3" onPress={handleTogglePasswordVisibility}>
											<InputIcon as={showPassword ? EyeIcon : EyeOffIcon} />
										</InputSlot>
									</Input>
									{passwordError ? (
										<FormControlError>
											<FormControlErrorIcon as={AlertCircleIcon} />
											<FormControlErrorText>{passwordError}</FormControlErrorText>
										</FormControlError>
									) : null}
								</FormControl>

								<Button
									className={submitButtonClassName}
									onPress={() => void signIn()}
									disabled={isLoginDisabled}
									
								>
									{isSubmitting ? (
										<ButtonSpinner color={isDarkMode ? '#ffffff' : '#0f172a'} />
									) : (
										<ButtonText
											className={`${isDarkMode ? 'text-white' : 'text-slate-900'} text-center`}
										>
											Entrar
										</ButtonText>
									)}
								</Button>

								{derivedCooldownMessage ? (
									<FormControl className="mt-4">
										<FormControlHelper className="mt-0">
											<FormControlHelperText className={`${helperText} text-sm`}>
												{derivedCooldownMessage}
											</FormControlHelperText>
										</FormControlHelper>
									</FormControl>
								) : null}

								<VStack className="mt-auto items-center px-4 pb-6 pt-8">
									<VStack className="gap-1">
										<Text className={`${mutedText} text-center text-xs`}>
											Desenvolvido por Gabriel Mazzuco
										</Text>

										<Text className={`${mutedText} text-center text-xs`}>Versão 1.8.0</Text>
									</VStack>
								</VStack>
							</View>
						</View>
					</ScrollView>
				</TouchableWithoutFeedback>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
