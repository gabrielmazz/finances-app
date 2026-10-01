import React from 'react';
import {
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StatusBar,
	TextInput,
	useWindowDimensions,
	View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import WebSelectField from '@/components/web/shared/web-select-field';
import BankActionsheetSelector, { type BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';
import Navigator from '@/components/uiverse/navigation/navigator';
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import { ScreenDismissKeyboard } from '@/components/uiverse/shared/screen-dismiss-keyboard';

import { auth } from '@/FirebaseConfig';
import AddRegisterBankScreenIllustration from '@/assets/UnDraw/addRegisterBankScreen.svg';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import {
	LUMUS_BANK_COLOR_PRESETS,
	LUMUS_CLASS_NAMES,
	LUMUS_FORM_CLASS_NAMES,
	LUMUS_LAYOUT_TOKENS,
} from '@/design-system/tokens';
import { WEB_DASHBOARD_CLASS_NAMES } from '@/design-system/web-dashboard';
import { WEB_EXPENSE_CLASS_NAMES } from '@/design-system/web-forms';
import { useAppTheme } from '@/contexts/ThemeContext';
import { addBankFirebase, updateBankFirebase } from '@/functions/BankFirebase';
import { useBankIcons, type BankIconOption } from '@/hooks/useBankIcons';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';
import { navigateToHomeDashboard } from '@/utils/navigation';

type FocusableInputKey = 'bank-name';
type BankFormSnapshot = {
	name: string;
	color: string | null;
	iconKey: string;
};

const getFirstParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const decodeParam = (value: string | string[] | undefined) => {
	const firstValue = getFirstParam(value);
	if (!firstValue) {
		return null;
	}

	try {
		return decodeURIComponent(firstValue);
	} catch {
		return firstValue;
	}
};

export default function AddRegisterBankScreenWeb() {
	const {
		isDarkMode,
	} = useAppTheme();
	const insets = useSafeAreaInsets();
	const { height: windowHeight } = useWindowDimensions();
	const heroHeight = Math.max(
		windowHeight * LUMUS_LAYOUT_TOKENS.heroViewportRatio,
		LUMUS_LAYOUT_TOKENS.heroMinimumHeight,
	) + insets.top;
	const webDashboardClassNames = WEB_DASHBOARD_CLASS_NAMES;
	const webExpenseClassNames = WEB_EXPENSE_CLASS_NAMES;
	const cardBackground = LUMUS_CLASS_NAMES.surfaceFill;
	const bodyText = LUMUS_CLASS_NAMES.body;
	const helperText = LUMUS_CLASS_NAMES.helper;
	const inputField = LUMUS_CLASS_NAMES.inputText;
	const fieldBankContainerClassName = `${LUMUS_CLASS_NAMES.control} ${LUMUS_CLASS_NAMES.focusRing}`;
	const fieldContainerClassName = LUMUS_FORM_CLASS_NAMES.input;
	const submitButtonClassName = LUMUS_CLASS_NAMES.primaryButton;
	const submitButtonTextClassName = LUMUS_CLASS_NAMES.primaryButtonText;
	const { iconOptions, defaultBankIcon } = useBankIcons();
	const applyPostSubmitBehavior = usePostSubmitBehavior('addRegisterBank');
	const params = useLocalSearchParams<{
		bankId?: string | string[];
		bankName?: string | string[];
		colorHex?: string | string[];
		bankIconKey?: string | string[];
	}>();

	const editingBankId = React.useMemo(() => getFirstParam(params.bankId)?.trim() || null, [params.bankId]);
	const initialBankName = React.useMemo(() => decodeParam(params.bankName) ?? '', [params.bankName]);
	const initialColorHex = React.useMemo(() => decodeParam(params.colorHex), [params.colorHex]);
	const initialBankIconKey = React.useMemo(
		() => decodeParam(params.bankIconKey) ?? 'outro-banco',
		[params.bankIconKey],
	);
	const isEditing = Boolean(editingBankId);

	const [nameBank, setNameBank] = React.useState(isEditing ? initialBankName : '');
	const [selectedColor, setSelectedColor] = React.useState<string | null>(isEditing ? initialColorHex : null);
	const [selectedBankIconKey, setSelectedBankIconKey] = React.useState(isEditing ? initialBankIconKey : 'outro-banco');
	const [nameValidationError, setNameValidationError] = React.useState<string | null>(null);
	const [lastSavedValues, setLastSavedValues] = React.useState<BankFormSnapshot | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const submitLockRef = React.useRef(false);
	const bankNameInputRef = React.useRef<TextInput | null>(null);

	const colorOptions = React.useMemo(() => {
		const options: Array<{ label: string; value: string }> = LUMUS_BANK_COLOR_PRESETS.map(option => ({
			label: option.label,
			value: option.value,
		}));
		if (initialColorHex && !LUMUS_BANK_COLOR_PRESETS.some(option => option.value === initialColorHex)) {
			options.push({ label: 'Cor atual', value: initialColorHex });
		}
		return options;
	}, [initialColorHex]);
	const colorSelectOptions = React.useMemo(
		() => [
			{ value: 'no-color', label: 'Sem cor' },
			...colorOptions.map(option => ({
				value: option.value,
				label: `${option.label} (${option.value})`,
			})),
		],
		[colorOptions],
	);

	React.useEffect(() => {
		setNameBank(isEditing ? initialBankName : '');
		setSelectedColor(isEditing ? initialColorHex : null);
		setSelectedBankIconKey(isEditing ? initialBankIconKey : 'outro-banco');
		setNameValidationError(null);
		setLastSavedValues(null);
	}, [initialBankIconKey, initialBankName, initialColorHex, isEditing]);

	const selectedBankIcon = React.useMemo<BankIconOption>(
		() => iconOptions.find(option => option.key === selectedBankIconKey) ?? defaultBankIcon,
		[defaultBankIcon, iconOptions, selectedBankIconKey],
	);
	const bankIconSelectorOptions = React.useMemo<BankActionsheetOption[]>(
		() => iconOptions.map(option => ({ id: option.key, name: option.label, iconKey: option.key })),
		[iconOptions],
	);
	const selectedBankIconOption = React.useMemo<BankActionsheetOption>(
		() => ({
			id: selectedBankIcon.key,
			name: selectedBankIcon.label,
			iconKey: selectedBankIcon.key,
			colorHex: selectedColor,
		}),
		[selectedBankIcon, selectedColor],
	);
	const handleBankIconSelect = React.useCallback((iconKey: string) => {
		if (iconKey !== selectedBankIconKey && iconKey !== 'outro-banco') {
			setSelectedColor(null);
		}
		setSelectedBankIconKey(iconKey);
	}, [selectedBankIconKey]);
	const matchesInitialValues =
		nameBank.trim() === initialBankName.trim() &&
		selectedColor === initialColorHex &&
		selectedBankIconKey === initialBankIconKey;
	const matchesLastSavedValues =
		lastSavedValues !== null &&
		nameBank.trim() === lastSavedValues.name &&
		selectedColor === lastSavedValues.color &&
		selectedBankIconKey === lastSavedValues.iconKey;
	const isFormUnchanged = isEditing && (matchesInitialValues || matchesLastSavedValues);
	const isFormDirty = isEditing
		? !isFormUnchanged
		: nameBank.length > 0 || selectedColor !== null || selectedBankIconKey !== 'outro-banco';

	React.useEffect(() => {
		if (!isFormDirty || typeof window === 'undefined') {
			return;
		}

		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};

		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	}, [isFormDirty]);

	const resetBankForm = React.useCallback(() => {
		setNameBank('');
		setSelectedColor(null);
		setSelectedBankIconKey('outro-banco');
		setNameValidationError(null);
	}, []);

	const handleBackToHome = React.useCallback(() => {
		navigateToHomeDashboard();
		return true;
	}, []);

	// Mantém retorno após edição e limpeza após criação alinhados com [[Comportamento Pós-Registro]].
	const registerBank = React.useCallback(async () => {
		if (submitLockRef.current || isSubmitting) {
			return;
		}

		const trimmedName = nameBank.trim();
		if (!trimmedName) {
			setNameValidationError('Informe o nome do banco antes de registrar.');
			bankNameInputRef.current?.focus?.();
			return;
		}

		if (trimmedName.length < 2) {
			setNameValidationError('Informe um nome de banco com pelo menos 2 caracteres.');
			bankNameInputRef.current?.focus?.();
			return;
		}

		if (isFormUnchanged) {
			showNotifierAlert({
				title: 'Nenhuma alteração identificada',
				description: 'Nenhuma alteração foi identificada para este banco.',
				type: 'info',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		submitLockRef.current = true;
		setIsSubmitting(true);

		try {
			const personId = auth.currentUser?.uid;
			if (!personId) {
				showNotifierAlert({
					title: 'Erro ao registrar banco',
					description: 'Não foi possível identificar o usuário atual.',
					type: 'error',
					isDarkMode,
				});
				return;
			}

			if (isEditing && editingBankId) {
				const result = await updateBankFirebase({
					bankId: editingBankId,
					bankName: trimmedName,
					colorHex: selectedColor,
					iconKey: selectedBankIconKey,
				});

				if (!result.success) {
					showNotifierAlert({
						title: 'Erro ao atualizar banco',
						description: 'Não foi possível atualizar este banco. Tente novamente mais tarde.',
						type: 'error',
						isDarkMode,
					});
					return;
				}

				showNotifierAlert({
					title: 'Banco atualizado',
					description: `O banco ${trimmedName} foi atualizado com sucesso.`,
					type: 'success',
					isDarkMode,
					duration: 4000,
				});
				setLastSavedValues({ name: trimmedName, color: selectedColor, iconKey: selectedBankIconKey });
				applyPostSubmitBehavior({ isEditing: true });
				return;
			}

			const result = await addBankFirebase({
				bankName: trimmedName,
				personId,
				colorHex: selectedColor,
				iconKey: selectedBankIconKey,
			});

			if (!result.success) {
				showNotifierAlert({
					title: 'Erro ao registrar banco',
					description: 'Não foi possível registrar este banco. Tente novamente mais tarde.',
					type: 'error',
					isDarkMode,
				});
				return;
			}

			showNotifierAlert({
				title: 'Banco registrado',
				description: `O banco ${trimmedName} foi registrado com sucesso.`,
				type: 'success',
				isDarkMode,
				duration: 4000,
			});
			applyPostSubmitBehavior({ resetForm: resetBankForm });
		} catch (error) {
			console.error('Erro ao registrar banco:', error);
			showNotifierAlert({
				title: 'Erro inesperado ao registrar banco',
				description: 'Não foi possível salvar. Tente novamente.',
				type: 'error',
				isDarkMode,
			});
		} finally {
			submitLockRef.current = false;
			setIsSubmitting(false);
		}
	}, [
		applyPostSubmitBehavior,
		editingBankId,
		isDarkMode,
		isEditing,
		isFormUnchanged,
		isSubmitting,
		nameBank,
		resetBankForm,
		selectedBankIconKey,
		selectedColor,
	]);

	const keyboardScrollOffset = React.useCallback((_key: FocusableInputKey) => 140, []);
	const getInputRef = React.useCallback(
		(key: FocusableInputKey) => (key === 'bank-name' ? bankNameInputRef : null),
		[],
	);
	const { scrollViewRef, contentBottomPadding, handleInputFocus, handleScroll, scrollEventThrottle } =
		useKeyboardAwareScroll<FocusableInputKey>({ getInputRef, keyboardScrollOffset });

	const screenTitle = isEditing ? 'Editar banco' : 'Adição de um novo banco';

	return (
		<ScreenDismissKeyboard>
			<SafeAreaView className={`${LUMUS_CLASS_NAMES.screen} web:w-screen`} edges={['left', 'right', 'bottom']}>
				<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
				<View className={`${LUMUS_CLASS_NAMES.screen} web:w-screen`}>
					<KeyboardAvoidingView
						behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
						keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
						className="flex-1"
					>
						<View className="flex-1 web:w-screen">
							<View className={`${webDashboardClassNames.hero} ${cardBackground}`} style={{ height: heroHeight }}>
								<Image
									source={LoginWallpaper}
									alt="Plano de fundo da tela de cadastro de banco"
									className="absolute h-full w-full rounded-b-3xl"
									resizeMode="cover"
								/>
								<WebScreenHero
									title={screenTitle}
									Illustration={AddRegisterBankScreenIllustration}
									isDarkMode={isDarkMode}
									topPadding={insets.top + 24}
								/>
							</View>

							<ScrollView
								ref={scrollViewRef}
								className={`${webDashboardClassNames.sheet} ${webDashboardClassNames.webSheet} ${cardBackground}`}
								style={{ marginTop: heroHeight - 64 }}
								contentContainerStyle={{ paddingBottom: Math.max(40, contentBottomPadding - 96) }}
								keyboardShouldPersistTaps="handled"
								keyboardDismissMode="on-drag"
								onScroll={handleScroll}
								scrollEventThrottle={scrollEventThrottle}
							>
								<VStack className={`${webDashboardClassNames.webContentFrame} ${webDashboardClassNames.webContentPadding} mt-4 gap-4`}>
									<View className="w-full flex-row flex-wrap gap-4">
										<VStack className={webExpenseClassNames.fieldFull}>
											<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Nome do banco</Text>
											<Input isInvalid={Boolean(nameValidationError)} className={`${fieldContainerClassName} ${webExpenseClassNames.fieldInput}`}>
												<InputField
													ref={bankNameInputRef as any}
													nativeID="bank-name"
													accessibilityLabel="Nome do banco"
													placeholder="Ex.: Banco do Brasil, Caixa Econômica ou Itaú…"
													autoComplete="off"
													autoCapitalize="words"
													autoCorrect={false}
													value={nameBank}
													onChangeText={value => {
														setNameBank(value);
														setNameValidationError(null);
													}}
													className={inputField}
													onFocus={() => handleInputFocus('bank-name')}
													onSubmitEditing={registerBank}
												/>
											</Input>
											{nameValidationError ? (
												<Text className={LUMUS_CLASS_NAMES.errorText} accessibilityRole="alert">
													{nameValidationError}
												</Text>
											) : null}
										</VStack>

										<VStack className={webExpenseClassNames.fieldFull}>
											<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Ícone do banco</Text>
											<BankActionsheetSelector
												options={bankIconSelectorOptions}
												selectedId={selectedBankIconKey}
												selectedLabel={selectedBankIcon.label}
												selectedOption={selectedBankIconOption}
												onSelect={option => handleBankIconSelect(option.id)}
												isDisabled={isSubmitting}
												isDarkMode={isDarkMode}
												bodyTextClassName={bodyText}
												helperTextClassName={helperText}
												triggerClassName={fieldBankContainerClassName}
												placeholder="Selecione o ícone do banco"
												sheetTitle="Escolha o ícone do banco"
												triggerHint="Selecione uma instituição para identificar este banco."
												disabledHint="Aguarde o salvamento do banco."
												accessibilityLabel="Escolher ícone do banco"
											/>
										</VStack>

										{selectedBankIconKey === 'outro-banco' ? (
											<VStack className={webExpenseClassNames.fieldFull}>
												<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Cor do banco (opcional)</Text>
												<WebSelectField
													options={colorSelectOptions}
													value={selectedColor ?? 'no-color'}
													onChange={value => setSelectedColor(value === 'no-color' ? null : value)}
													placeholder="Selecione uma cor para o cartão…"
													isDisabled={isSubmitting}
													accessibilityLabel="Cor do banco"
												/>
											</VStack>
										) : null}
									</View>

									<Button
										className={`${submitButtonClassName} web:mt-2 web:h-12`}
										onPress={registerBank}
										isDisabled={isSubmitting || isFormUnchanged}
									>
										{isSubmitting ? (
											<>
												<ButtonSpinner />
												<ButtonText className={submitButtonTextClassName}>Salvando…</ButtonText>
											</>
										) : (
											<ButtonText className={submitButtonTextClassName}>
												{isEditing ? 'Atualizar banco' : 'Registrar banco'}
											</ButtonText>
										)}
									</Button>
								</VStack>
							</ScrollView>
						</View>
					</KeyboardAvoidingView>

					<View className="-mx-4.5 shrink-0">
						<Navigator defaultValue={2} onHardwareBack={handleBackToHome} />
					</View>
				</View>
			</SafeAreaView>
		</ScreenDismissKeyboard>
	);
}
