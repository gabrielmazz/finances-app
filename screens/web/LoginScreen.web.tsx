import { useAccountAccess, type AccountAccessMode } from '@/hooks/useAccountAccess';
import { AUTH_CLASS_NAMES } from '@/design-system/auth';
import { MantineProvider, UnstyledButton } from '@mantine/core';
import { LUMUS_FORM_CLASS_NAMES, LUMUS_RUNTIME_COLORS } from '@/design-system/tokens';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	View,
	Keyboard,
	StatusBar,
	KeyboardAvoidingView,
	Platform,
	RefreshControl,
	ScrollView,
	useWindowDimensions,
} from 'react-native';

import Grainient from '../../components/web/visuals/Grainient';
import StrokeText from '../../components/web/visuals/StrokeText';


import {
	FormControl,
	FormControlError,
	FormControlErrorText,
	FormControlErrorIcon,
	FormControlHelper,
	FormControlHelperText,
} from '@/components/ui/form-control';
import { AlertCircleIcon, EyeIcon, EyeOffIcon } from '@/components/ui/icon';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { Button, ButtonSpinner } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';

import { auth } from '@/FirebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';

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
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';

type FocusableInputKey = 'name' | 'email' | 'password';

export default function LoginScreen() {
	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		headingText,
		bodyText,
		helperText,
		inputField,
		fieldContainerClassName,
		submitButtonClassName,
	} = useScreenStyles();
	const { height, width } = useWindowDimensions();
	const isSplitLayout = width >= 768;
	const identityHeight = isSplitLayout ? Math.max(height, 680) : 360;

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
	const headingRef = useRef<HTMLHeadingElement>(null);
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
		[clockTick, loginCooldownUntil],
	);
	const isLocallyRateLimited = loginCooldownRemainingMs > 0;
	const isLoginDisabled =
		isBusy || access.isResetSent || (access.mode === 'login' && isLocallyRateLimited);
	const keyboardScrollOffset = useCallback(
		(key: FocusableInputKey) => (key === 'password' ? 180 : 140),
		[],
	);

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
		setShowPassword((currentValue) => !currentValue);
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
						throttleStatus.remainingMs,
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
							nextThrottleStatus.remainingMs,
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
		headingRef.current?.focus();
	}, [access.mode]);

	const derivedCooldownMessage = access.mode === 'login' && isLocallyRateLimited
		? `Muitas tentativas no dispositivo. Tente novamente em ${formatRemainingTime(
			loginCooldownRemainingMs,
		)}.`
		: null;

	return (
		<SafeAreaView
			edges={['left', 'right', 'bottom']}
			className="flex-1"
			style={{ backgroundColor: surfaceBackground }}
		>
			<StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

			<KeyboardAvoidingView
				className="flex-1"
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
			>
				<ScrollView
					ref={scrollViewRef}
					className="flex-1"
					style={{ backgroundColor: surfaceBackground }}
					scrollEnabled
					contentContainerStyle={{
						flexGrow: 1,
						paddingBottom: isSplitLayout ? 0 : contentBottomPadding,
					}}
					keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={false}
					onScroll={handleScroll}
					scrollEventThrottle={scrollEventThrottle}
					refreshControl={
						!isSplitLayout ? (
							<RefreshControl
								refreshing={isRefreshing}
								onRefresh={() => void handleRefresh()}
								tintColor="#FACC15"
							/>
						) : undefined
					}
				>
					<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
						<View className={`flex-1 ${isSplitLayout ? 'min-h-login-shell flex-row' : 'flex-col'}`}>
							<View
								className={`w-full items-center justify-center overflow-hidden ${isSplitLayout ? 'flex-login-identity rounded-br-hero rounded-tr-hero' : 'shrink-0'}`}
								style={{ height: identityHeight }}
							>
								<View className="relative flex-1 w-full items-center justify-center">
									<div style={{ position: 'absolute', inset: 0 }}>
										<Grainient
											color1="#f8bd0c"
											color2="#facc15"
											color3="#fefe59"
											timeSpeed={0.85}
											colorBalance={0.04}
											warpStrength={1}
											warpFrequency={4.3}
											warpSpeed={2}
											warpAmplitude={50}
											blendAngle={0}
											blendSoftness={0.05}
											rotationAmount={570}
											noiseScale={1.85}
											grainAmount={0}
											grainScale={0.2}
											grainAnimated={false}
											contrast={1.5}
											gamma={0.65}
											saturation={1.25}
											centerX={-0.27}
											centerY={0}
											zoom={0.9}
										/>
									</div>

									<div
										style={{
											position: 'absolute',
											width: isSplitLayout ? '46%' : '62%',
											zIndex: 1,
										}}
									>
										<StrokeText
											text="Lumus Finances"
											strokeColor="#FFFFFF"
											fillColor="#FFFDF5"
											strokeWidth={1.8}
											drawDuration={1.75}
											fillDelay={0.6}
											fontSize={isSplitLayout ? 110 : 68}
											fontWeight={500}
											letterSpacing={-3}
											fontFamily="Poppins, sans-serif"
											ease="sine.inOut"
											trigger="mount"
										/>
									</div>

									<div
										style={{
											position: 'absolute',
											width: isSplitLayout ? '46%' : '62%',
											top: isSplitLayout ? 'calc(50%)' : 'calc(50%)',
											zIndex: 1,
										}}
									>
										<StrokeText
											text="Controle suas finanças com clareza"
											strokeColor="#FFFFFF"
											fillColor="#FFFDF5"
											strokeWidth={1.8}
											drawDuration={1.3}
											fillDelay={1}
											fontSize={isSplitLayout ? 110 : 68}
											fontWeight={500}
											letterSpacing={-3}
											fontFamily="Poppins, sans-serif"
											ease="sine.inOut"
											trigger="mount"
											reverse
										/>
									</div>

								</View>
							</View>

							<View
								className={`${cardBackground} justify-center px-8 ${isSplitLayout ? 'flex-login-form py-10.5' : '-mt-7 min-h-login-card flex-none rounded-tl-hero rounded-tr-hero pb-6 pt-12'}`}
							>
								<View className="w-full max-w-login-form flex-1 self-center">
									<View className="flex-1 justify-center">
										<VStack className="mb-10 shrink-0 gap-2">
											<Text
												className={`${helperText} text-xs font-semibold uppercase tracking-widest`}
											>
												{access.mode === 'login' ? 'Acesse sua conta' : access.mode === 'register' ? 'Comece por aqui' : 'Recupere seu acesso'}
											</Text>
											<h1 ref={headingRef} tabIndex={-1}
												className={`${headingText} text-[28px]`}
											>
												{accessTitle}
											</h1>

											<Text className={`${bodyText} text-base leading-6`}>
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
												<label htmlFor="auth-name" className={LUMUS_FORM_CLASS_NAMES.label}>Nome</label>
												<Input className={fieldContainerClassName}>
													<InputField
														ref={nameInputRef}
														aria-label="Nome"
														nativeID="auth-name"
														aria-describedby={access.nameError ? 'auth-name-error' : undefined}
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
											<label htmlFor="auth-email" className={LUMUS_FORM_CLASS_NAMES.label}>Email</label>
											<Input className={fieldContainerClassName}>
												<InputField
													aria-label="Email"
													nativeID="auth-email"
													aria-describedby={emailError ? 'auth-email-error' : undefined}
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
												<label htmlFor="auth-password" className={LUMUS_FORM_CLASS_NAMES.label}>Senha</label>
												<Input className={fieldContainerClassName}>
													<InputField
														aria-label="Senha"
														nativeID="auth-password"
														aria-describedby={passwordError ? 'auth-password-error' : undefined}
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
													<InputSlot
														accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
														accessibilityRole="button"
														className="min-h-12 min-w-12 items-center justify-center"
														disabled={isBusy}
														onPress={handleTogglePasswordVisibility}
													>
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
											className={`${submitButtonClassName} h-12`}
											onPress={submitAccess}
											disabled={isLoginDisabled}
											accessibilityLabel={isBusy ? 'Enviando…' : submitLabel}
											accessibilityState={{ busy: isBusy, disabled: isLoginDisabled }}
										>
											{isBusy ? (
												<ButtonSpinner color={LUMUS_RUNTIME_COLORS.light.onAccent} />
											) : (
												<Text className={AUTH_CLASS_NAMES.submitText}>{submitLabel}</Text>
											)}
										</Button>

										<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'} withCssVariables={false} withGlobalClasses={false}>
											<View className="mt-4 flex-row flex-wrap items-center justify-between gap-2">
												{access.mode === 'login' ? (
													<>
														<UnstyledButton type="button" unstyled className={AUTH_CLASS_NAMES.modeAction} disabled={isBusy} onClick={() => changeAccessMode('register')}>
															Criar conta
														</UnstyledButton>
														<UnstyledButton type="button" unstyled className={AUTH_CLASS_NAMES.modeAction} disabled={isBusy} onClick={() => changeAccessMode('reset')}>
															Esqueci minha senha
														</UnstyledButton>
													</>
												) : (
													<UnstyledButton type="button" unstyled className={AUTH_CLASS_NAMES.modeAction} disabled={isBusy} onClick={() => changeAccessMode('login')}>
														Voltar para entrar
													</UnstyledButton>
												)}
											</View>
										</MantineProvider>

										{derivedCooldownMessage ? (
											<FormControl className="mt-4">
												<FormControlHelper className="mt-0">
													<FormControlHelperText className={`${helperText} text-sm`}>
														{derivedCooldownMessage}
													</FormControlHelperText>
												</FormControlHelper>
											</FormControl>
										) : null}
									</View>

									<VStack className="mt-auto items-center px-4 pb-6 pt-8">
										<VStack className="gap-1">
											<Text className={`${helperText} text-center text-xs`}>
												Desenvolvido por Gabriel Mazzuco
											</Text>

											<Text className={`${helperText} text-center text-xs`}>Versão 2.3.1</Text>
										</VStack>
									</VStack>
								</View>
							</View>
						</View>
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
