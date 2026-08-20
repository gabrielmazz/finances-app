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

import Grainient from './../components/web/Grainient';
import StrokeText from './../components/web/StrokeText';


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
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';

type FocusableInputKey = 'email' | 'password';

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

	const normalizedEmail = useMemo(() => normalizeEmailForAuth(email), [email]);
	const loginCooldownRemainingMs = useMemo(
		() => (loginCooldownUntil ? Math.max(0, loginCooldownUntil - clockTick) : 0),
		[clockTick, loginCooldownUntil],
	);
	const isLocallyRateLimited = loginCooldownRemainingMs > 0;
	const isLoginDisabled =
		isSubmitting || isLocallyRateLimited || normalizedEmail.length === 0 || password.length === 0;
	const webFieldContainerClassName = `${fieldContainerClassName} web:data-[focus=true]:ring-0`;

	const keyboardScrollOffset = useCallback(
		(key: FocusableInputKey) => (key === 'password' ? 180 : 140),
		[],
	);

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
					throttleStatus.remainingMs,
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
			setIsSubmitting(false);
		}
	}, [isSubmitting, isDarkMode, validateCredentials]);

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

	const derivedCooldownMessage = isLocallyRateLimited
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
					scrollEnabled={!isSplitLayout}
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
						<View className={`flex-1 ${isSplitLayout ? 'flex-row min-h-[680px]' : 'flex-col'}`}>
							<View
								className={`w-full items-center justify-center overflow-hidden ${isSplitLayout ? 'flex-[1.14] rounded-br-[32px] rounded-tr-[32px]' : 'min-h-[360px]'}`}
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
									className={`${cardBackground} flex-[0.86] justify-center px-8 py-[42px] ${!isSplitLayout ? '-mt-7 rounded-tl-[32px] rounded-tr-[32px] pt-12' : ''}`}
								>
								<View className="w-full max-w-[420px] flex-1 self-center">
									<View className="flex-1 justify-center">
										<VStack className="mb-10 gap-2">
											<Text
												className={`${helperText} text-xs font-semibold uppercase tracking-widest`}
											>
												Acesse sua conta
											</Text>
											<Heading
												accessibilityRole="header"
												className={`${headingText} text-[28px]`}
											>
												Bem-vindo de volta
											</Heading>

											<Text className={`${bodyText} text-base leading-6`}>
												Entre para acompanhar o que importa nas suas finanças.
											</Text>
										</VStack>

										<FormControl className="mb-4">
											<FormControlLabel>
												<FormControlLabelText className={`${bodyText} mb-1 ml-1 text-sm`}>
													Email
												</FormControlLabelText>
											</FormControlLabel>
											<Input className={webFieldContainerClassName}>
												<InputField
													accessibilityLabel="Email"
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
											<Input className={webFieldContainerClassName}>
												<InputField
													accessibilityLabel="Senha"
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
												<InputSlot
													accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
													accessibilityRole="button"
													className="pr-3"
													onPress={handleTogglePasswordVisibility}
												>
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
											className={`${submitButtonClassName} h-12`}
											onPress={() => void signIn()}
											disabled={isLoginDisabled}
										>
											{isSubmitting ? (
												<ButtonSpinner color="#0f172a" />
											) : (
												<ButtonText className="text-center text-slate-900">Entrar</ButtonText>
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
									</View>

									<VStack className="mt-auto items-center px-4 pb-6 pt-8">
										<VStack className="gap-1">
											<Text className={`${helperText} text-center text-xs`}>
												Desenvolvido por Gabriel Mazzuco
											</Text>

											<Text className={`${helperText} text-center text-xs`}>Versão 2.2.1</Text>
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
