import { useAccountAccess, type AccountAccessMode } from '@/hooks/useAccountAccess';
import { AUTH_CLASS_NAMES } from '@/design-system/auth';
import { cn } from '@/lib/utils';
import { BackHandler, Pressable, AccessibilityInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	View,
	TouchableWithoutFeedback,
	Keyboard,
	StatusBar,
	KeyboardAvoidingView,
	Platform,
	RefreshControl,
	ScrollView,
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
import { Button, ButtonSpinner } from '@/components/ui/button';
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
import { LUMUS_FORM_CLASS_NAMES, LUMUS_RUNTIME_COLORS } from '@/design-system/tokens';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { getUserDataFirebase } from '@/functions/RegisterUserFirebase';
// Canal padronizado de alertas in-app conforme [[Notificações]]
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';

type FocusableInputKey = 'name' | 'email' | 'password';


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
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [loginCooldownUntil, setLoginCooldownUntil] = useState<number | null>(null);
	const [clockTick, setClockTick] = useState(Date.now());

	const emailInputRef = useRef<any>(null);
	const passwordInputRef = useRef<any>(null);
	const nameInputRef = useRef<any>(null);
	const loginPending = useRef(false);
	const access = useAccountAccess({
		email, password, setPassword, setEmailError, setPasswordError,
		focusField: field => (field === 'name' ? nameInputRef : field === 'email' ? emailInputRef : passwordInputRef).current?.focus(),
	});
	const isBusy = isSubmitting || access.isSubmitting;
	const changeAccessMode = (mode: AccountAccessMode) => {
		if (loginPending.current || isBusy) return;
		setShowPassword(false);
		access.changeMode(mode);
	};
	const accessTitle = access.mode === 'register' ? 'Crie sua conta' : access.mode === 'reset' ? 'Redefina sua senha' : 'Bem-vindo de volta';
	const accessDescription = access.mode === 'register'
		? 'Informe seu nome, email e uma senha para começar.'
		: access.mode === 'reset'
			? 'Informe seu email para receber um link e escolher uma nova senha.'
			: 'Entre para acompanhar o que importa nas suas finanças.';
	const submitAccess = () => {
		if (access.mode === 'login') void signIn();
		else void access.submit();
	};
	const submitLabel = access.mode === 'register' ? 'Criar conta' : access.mode === 'reset' ? (access.isResetSent ? 'Link solicitado' : 'Enviar link de recuperação') : 'Entrar';

	const normalizedEmail = useMemo(() => normalizeEmailForAuth(email), [email]);
	const loginCooldownRemainingMs = useMemo(
		() => (loginCooldownUntil ? Math.max(0, loginCooldownUntil - clockTick) : 0),
		[clockTick, loginCooldownUntil]
	);
	const isLocallyRateLimited = loginCooldownRemainingMs > 0;
	const isLoginDisabled =
		isBusy || access.isResetSent || (access.mode === 'login' && isLocallyRateLimited);

	const keyboardScrollOffset = useCallback(
		(key: FocusableInputKey) => (key === 'password' ? 180 : 140),
		[]
	);

	const handleDismissKeyboard = useCallback(() => Keyboard.dismiss(), []);

	const getInputRef = useCallback((key: FocusableInputKey) => {
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
		minBottomPadding: 24,
		bottomPaddingOffset: 24,
	});

	const syncCooldownForEmail = useCallback(async (emailValue: string) => {
		if (!emailValue) {
			setLoginCooldownUntil(null);
			return;
		}

		const status = await getLoginThrottleStatus(emailValue);
		setLoginCooldownUntil(status.blockedUntil);
	}, []);

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
		if (loginPending.current || access.mode !== 'login' || access.isSubmitting) {
			return;
		}

		const { nextEmail, isValid } = validateCredentials();
		if (!isValid) {
			(!isEmailFormatValid(nextEmail) ? emailInputRef : passwordInputRef).current?.focus();
			return;
		}

		loginPending.current = true;
		setIsSubmitting(true);
		try {
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
			loginPending.current = false;
			setIsSubmitting(false);
		}
	}, [access.mode, access.isSubmitting, isDarkMode, validateCredentials]);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			setEmailError(null);
			setPasswordError(null);
			await syncCooldownForEmail(normalizedEmail);
		} finally {
			setIsRefreshing(false);
		}
	}, [normalizedEmail, syncCooldownForEmail]);

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
		if (access.mode !== 'login') AccessibilityInfo.announceForAccessibility(accessTitle);
	}, [access.mode]);

	useEffect(() => {
		const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
			if (access.mode === 'login') return false;
			changeAccessMode('login');
			return true;
		});
		return () => subscription.remove();
	}, [access.mode, isBusy]);

	const derivedCooldownMessage = access.mode === 'login' && isLocallyRateLimited
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
						onScroll={handleScroll}
						scrollEventThrottle={scrollEventThrottle}
						refreshControl={
							<RefreshControl
								refreshing={isRefreshing}
								onRefresh={() => void handleRefresh()}
								tintColor="#FACC15"
							/>
						}
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

								<VStack className="self-center items-center mb-12">
									<Heading className={`${headingText} text-xl text-center`}>
										{accessTitle}
									</Heading>

									<Text className={`${bodyText} text-base text-center`}>
										{accessDescription}
									</Text>
								</VStack>

								{access.feedback ? (
									<View accessibilityLiveRegion="polite" role={access.feedback.type === 'error' ? 'alert' : 'status'}>
										<Text className={access.feedback.type === 'error' ? AUTH_CLASS_NAMES.feedbackError : AUTH_CLASS_NAMES.feedbackSuccess}>
											{access.feedback.message}
										</Text>
									</View>
								) : null}
								{access.mode === 'register' ? (
									<FormControl className="mb-4" isInvalid={Boolean(access.nameError)} isRequired>
										<FormControlLabel>
											<FormControlLabelText className={LUMUS_FORM_CLASS_NAMES.label}>Nome</FormControlLabelText>
										</FormControlLabel>
										<Input className={fieldContainerClassName}>
											<InputField
												ref={nameInputRef}
												aria-label="Nome"
												nativeID="auth-name"
												accessibilityLabel="Nome"
												placeholder="Seu nome"
												autoComplete="name"
												textContentType="name"
												returnKeyType="next"
												value={access.name}
												maxLength={100}
												editable={!isBusy}
												className={inputField}
												onChangeText={value => { access.setName(value); access.setNameError(null); }}
												onFocus={() => handleInputFocus('name')}
												onSubmitEditing={() => emailInputRef.current?.focus()}
											/>
										</Input>
										{access.nameError ? (
											<FormControlError><FormControlErrorText nativeID="auth-name-error">{access.nameError}</FormControlErrorText></FormControlError>
										) : null}
									</FormControl>
								) : null}
								<FormControl className="mb-4" isInvalid={Boolean(emailError)} isRequired>
									<FormControlLabel>
										<FormControlLabelText className={LUMUS_FORM_CLASS_NAMES.label}>
											Email
										</FormControlLabelText>
									</FormControlLabel>
									<Input className={fieldContainerClassName}>
										<InputField
											aria-label="Email"
											nativeID="auth-email"
											accessibilityLabel="Email"
											ref={emailInputRef}
											editable={!isBusy}
											placeholder="Digite seu email"
											keyboardType="email-address"
											autoCapitalize="none"
											autoCorrect={false}
											autoComplete="email"
											textContentType="emailAddress"
											returnKeyType={access.mode === 'reset' ? 'send' : 'next'}
											value={email}
											onChangeText={handleEmailChange}
											onFocus={() => handleInputFocus('email')}
											onSubmitEditing={() => access.mode === 'reset' ? submitAccess() : passwordInputRef.current?.focus()}
											className={inputField}
										/>
									</Input>
									{emailError ? (
										<FormControlError>
											<FormControlErrorIcon as={AlertCircleIcon} />
											<FormControlErrorText nativeID="auth-email-error">{emailError}</FormControlErrorText>
										</FormControlError>
									) : null}
								</FormControl>

								{access.mode !== 'reset' ? (
									<FormControl className="mb-6" isInvalid={Boolean(passwordError)} isRequired>
										<FormControlLabel>
											<FormControlLabelText className={LUMUS_FORM_CLASS_NAMES.label}>
												Senha
											</FormControlLabelText>
										</FormControlLabel>
										<Input className={fieldContainerClassName}>
											<InputField
												aria-label="Senha"
												nativeID="auth-password"
												accessibilityLabel="Senha"
												ref={passwordInputRef}
												editable={!isBusy}
												placeholder="Digite sua senha"
												value={password}
												onChangeText={handlePasswordChange}
												onFocus={() => handleInputFocus('password')}
												onSubmitEditing={submitAccess}
												autoCapitalize="none"
												autoCorrect={false}
												autoComplete={access.mode === 'register' ? 'new-password' : 'current-password'}
												textContentType={access.mode === 'register' ? 'newPassword' : 'password'}
												returnKeyType="done"
												secureTextEntry={!showPassword}
												className={inputField}
											/>
											<InputSlot accessibilityRole="button" accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'} className="min-h-12 min-w-12 items-center justify-center" disabled={isBusy}
												onPress={handleTogglePasswordVisibility}>
												<InputIcon as={showPassword ? EyeIcon : EyeOffIcon} />
											</InputSlot>
										</Input>
										{passwordError ? (
											<FormControlError>
												<FormControlErrorIcon as={AlertCircleIcon} />
												<FormControlErrorText nativeID="auth-password-error">{passwordError}</FormControlErrorText>
											</FormControlError>
										) : null}
										{access.mode === 'register' ? (
											<FormControlHelper>
												<FormControlHelperText>Use pelo menos 6 caracteres.</FormControlHelperText>
											</FormControlHelper>
										) : null}
									</FormControl>
								) : null}

								<Button
									className={cn(submitButtonClassName, 'h-12')}
									onPress={submitAccess}
									disabled={isLoginDisabled}
									accessibilityLabel={isBusy ? 'Enviando…' : submitLabel}
									accessibilityState={{ busy: isBusy, disabled: isLoginDisabled }}

								>
									{isBusy ? (
										<ButtonSpinner color={LUMUS_RUNTIME_COLORS.light.onAccent} />
									) : (
										<Text
											className={AUTH_CLASS_NAMES.submitText}
										>
											{submitLabel}
										</Text>
									)}
								</Button>

								<View className="mt-4 flex-row flex-wrap items-center justify-between gap-2">
									{access.mode === 'login' ? (
										<>
											<Pressable
												accessibilityRole="button"
												disabled={isBusy}
												accessibilityState={{ disabled: isBusy }}
												className={cn(AUTH_CLASS_NAMES.modeActionNative, isBusy && 'opacity-50')}
												onPress={() => changeAccessMode('register')}
											>
												<Text className={AUTH_CLASS_NAMES.modeActionText}>Criar conta</Text>
											</Pressable>
											<Pressable
												accessibilityRole="button"
												disabled={isBusy}
												accessibilityState={{ disabled: isBusy }}
												className={cn(AUTH_CLASS_NAMES.modeActionNative, isBusy && 'opacity-50')}
												onPress={() => changeAccessMode('reset')}
											>
												<Text className={AUTH_CLASS_NAMES.modeActionText}>Esqueci minha senha</Text>
											</Pressable>
										</>
									) : (
										<Pressable
											accessibilityRole="button"
											disabled={isBusy}
											accessibilityState={{ disabled: isBusy }}
											className={cn(AUTH_CLASS_NAMES.modeActionNative, isBusy && 'opacity-50')}
											onPress={() => changeAccessMode('login')}
										>
											<Text className={AUTH_CLASS_NAMES.modeActionText}>Voltar para entrar</Text>
										</Pressable>
									)}
								</View>

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

										<Text className={`${mutedText} text-center text-xs`}>Versão 2.3.0</Text>
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
