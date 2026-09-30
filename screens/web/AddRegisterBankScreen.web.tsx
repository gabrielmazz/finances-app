import React from 'react';
import {
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StatusBar,
	TextInput,
	useWindowDimensions,
	View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Check, ChevronDown } from 'lucide-react-native';

import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalHeader,
	ModalTitle,
} from '@/components/ui/modal';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import WebSelectField from '@/components/web/shared/web-select-field';
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
import { useBankIcons, BankIcon, type BankIconOption } from '@/hooks/useBankIcons';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';
import { navigateToHomeDashboard } from '@/utils/navigation';

type FocusableInputKey = 'bank-name';

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
	const fieldContainerCardClassName = LUMUS_CLASS_NAMES.modal;
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

	const [nameBank, setNameBank] = React.useState('');
	const [selectedColor, setSelectedColor] = React.useState<string | null>(null);
	const [selectedBankIconKey, setSelectedBankIconKey] = React.useState('outro-banco');
	const [isBankIconDialogOpen, setIsBankIconDialogOpen] = React.useState(false);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const submitLockRef = React.useRef(false);
	const bankNameInputRef = React.useRef<TextInput | null>(null);

	const colorOptions = React.useMemo(() => {
		const options = LUMUS_BANK_COLOR_PRESETS.map(option => ({
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
		if (isEditing) {
			setNameBank(initialBankName);
			setSelectedColor(initialColorHex);
			setSelectedBankIconKey(initialBankIconKey);
		}
	}, [initialBankIconKey, initialBankName, initialColorHex, isEditing]);

	const selectedBankIcon = React.useMemo<BankIconOption>(
		() => iconOptions.find(option => option.key === selectedBankIconKey) ?? defaultBankIcon,
		[defaultBankIcon, iconOptions, selectedBankIconKey],
	);
	const isFormUnchanged =
		isEditing &&
		nameBank.trim() === initialBankName.trim() &&
		selectedColor === initialColorHex &&
		selectedBankIconKey === initialBankIconKey;

	const resetBankForm = React.useCallback(() => {
		setNameBank('');
		setSelectedColor(null);
		setSelectedBankIconKey('outro-banco');
	}, []);

	const handleBackToHome = React.useCallback(() => {
		navigateToHomeDashboard();
		return true;
	}, []);

	const registerBank = React.useCallback(async () => {
		if (submitLockRef.current || isSubmitting) {
			return;
		}

		const trimmedName = nameBank.trim();
		if (!trimmedName) {
			showNotifierAlert({
				title: 'Erro ao registrar banco',
				description: 'Informe o nome do banco antes de registrar.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			bankNameInputRef.current?.focus?.();
			return;
		}

		if (trimmedName.length < 2) {
			showNotifierAlert({
				title: 'Erro ao registrar banco',
				description: 'Informe um nome de banco com pelo menos 2 caracteres.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
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
											<Input className={`${fieldContainerClassName} ${webExpenseClassNames.fieldInput}`}>
												<InputField
													ref={bankNameInputRef as any}
													accessibilityLabel="Nome do banco"
													placeholder="Ex.: Banco do Brasil, Caixa Econômica ou Itaú…"
													autoComplete="off"
													autoCapitalize="words"
													autoCorrect={false}
													value={nameBank}
													onChangeText={setNameBank}
													className={inputField}
													onFocus={() => handleInputFocus('bank-name')}
													onSubmitEditing={registerBank}
												/>
											</Input>
										</VStack>

										<VStack className={`w-full ${webExpenseClassNames.fieldHalf}`}>
											<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Ícone do banco</Text>
											<Pressable
												onPress={() => setIsBankIconDialogOpen(true)}
												accessibilityRole="button"
												accessibilityLabel="Escolher ícone do banco"
												accessibilityState={{ expanded: isBankIconDialogOpen }}
												className={`${fieldBankContainerClassName} min-h-12 flex-row items-center justify-between gap-3 px-4 py-2.5`}
											>
												<HStack className="min-w-0 flex-1 items-center gap-3">
													<View className={`h-11 w-11 items-center justify-center rounded-2xl ${cardBackground}`}>
														<BankIcon
															iconKey={selectedBankIcon?.key}
															name={nameBank}
															colorHex={selectedColor}
															size={32}
														/>
													</View>
													<VStack className="min-w-0 flex-1">
														<Text className={`${bodyText} text-sm font-semibold`} isTruncated>
															{selectedBankIcon?.label ?? 'Outro banco'}
														</Text>
														<Text className={`${helperText} text-xs`} isTruncated>
															Selecione uma instituição para identificar este banco.
														</Text>
													</VStack>
													<ChevronDown size={18} className={`${helperText} shrink-0`} aria-hidden />
												</HStack>
											</Pressable>
										</VStack>

										<VStack className={`w-full ${webExpenseClassNames.fieldHalf}`}>
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
									</View>

									<Button
									className={`${submitButtonClassName} web:mt-2 web:h-12`}
									onPress={registerBank}
									isDisabled={isSubmitting || !nameBank.trim() || isFormUnchanged}
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

				<Modal isOpen={isBankIconDialogOpen} onClose={() => setIsBankIconDialogOpen(false)} size="md">
					<ModalBackdrop />
					<ModalContent className={`${fieldContainerCardClassName} max-h-screen`}>
						<ModalHeader>
							<VStack className="min-w-0 flex-1">
								<ModalTitle>Escolha o ícone do banco</ModalTitle>
								<Text className={`${helperText} mt-1 text-sm`}>
									Selecione uma instituição ou use a opção genérica.
								</Text>
							</VStack>
							<ModalCloseButton
								accessibilityLabel="Fechar seleção do ícone"
								onPress={() => setIsBankIconDialogOpen(false)}
							/>
						</ModalHeader>
						<ModalBody className="max-h-96 px-4 pb-4 pt-2">
							<VStack className="gap-2">
								{iconOptions.map(option => {
									const isSelected = option.key === selectedBankIconKey;
									return (
										<Pressable
											key={option.key}
											onPress={() => {
												setSelectedBankIconKey(option.key);
												setIsBankIconDialogOpen(false);
											}}
											accessibilityRole="button"
											accessibilityLabel={`Selecionar ícone ${option.label}`}
											accessibilityState={{ selected: isSelected }}
											className={`${fieldBankContainerClassName} min-h-touch flex-row items-center gap-3 px-3 py-2 ${
												isSelected ? 'border-lumus-accent bg-lumus-accent/10' : ''
											}`}
										>
											<BankIcon iconKey={option.key} size={36} />
											<VStack className="min-w-0 flex-1">
												<Text className={`${bodyText} text-sm font-medium`}>{option.label}</Text>
												{isSelected ? <Text className={`${helperText} text-xs`}>Selecionado atualmente</Text> : null}
											</VStack>
											{isSelected ? (
												<View className="h-6 w-6 items-center justify-center rounded-full bg-lumus-accent">
													<Check size={14} className="text-lumus-on-accent" aria-hidden />
												</View>
											) : null}
										</Pressable>
									);
								})}
							</VStack>
						</ModalBody>
					</ModalContent>
				</Modal>
			</SafeAreaView>
		</ScreenDismissKeyboard>
	);
}
