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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Importações relacionadas ao Gluestack UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import {
    Select,
    SelectBackdrop,
    SelectContent,
    SelectDragIndicator,
    SelectDragIndicatorWrapper,
    SelectIcon,
    SelectInput,
    SelectItem,
    SelectPortal,
    SelectTrigger,
} from '@/components/ui/select';
import { Box } from '@/components/ui/box';
import { Divider } from '@/components/ui/divider';

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';
import { useAppTheme } from '@/contexts/ThemeContext';

// Importação das funções relacionadas a adição de banco ao Firebase
import { addBankFirebase, updateBankFirebase } from '@/functions/BankFirebase';
import { auth } from '@/FirebaseConfig';
import { router, useLocalSearchParams } from 'expo-router';

// Importação do SVG
import AddRegisterBankScreenIllustration from '../assets/UnDraw/addRegisterBankScreen.svg';

const presetBankColors = [
    { label: 'Azul', value: '#2563EB' },
    { label: 'Verde', value: '#10B981' },
    { label: 'Vermelho', value: '#EF4444' },
    { label: 'Amarelo', value: '#FACC15' },
    { label: 'Roxo', value: '#9333EA' },
    { label: 'Cinza', value: '#6B7280' },
    { label: 'Laranja', value: '#F97316' },
    { label: 'Rosa', value: '#EC4899' },
    { label: 'Turquesa', value: '#14B8A6' },
    { label: 'Marrom', value: '#A0522D' },
    { label: 'Dourado', value: '#FFD700' },
    { label: 'Prata', value: '#C0C0C0' },
    { label: 'Verde Limão', value: '#32CD32' },
    { label: 'Azul Celeste', value: '#87CEEB' },
    { label: 'Vinho', value: '#800000' },
    { label: 'Roxo Claro', value: '#D8BFD8' },
    { label: 'Cinza Escuro', value: '#374151' },
    { label: 'Azul Marinho', value: '#000080' },
];

type FocusableInputKey = 'bank-name';

export default function AddRegisterBankScreen() {
	const { isDarkMode } = useAppTheme();
	const pageBackground = isDarkMode ? '#0b1220' : '#f4f5f7';

    // =========================================== Funções para Registro ============================================ //
    const [nameBank, setNameBank] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [selectedColor, setSelectedColor] = React.useState<string | null>(null);
    const scrollViewRef = React.useRef<ScrollView | null>(null);
    const bankNameInputRef = React.useRef<TextInput | null>(null);
    const lastFocusedInputKey = React.useRef<FocusableInputKey | null>(null);
    const [keyboardHeight, setKeyboardHeight] = React.useState(0);
    const keyboardScrollOffset = React.useCallback(
        (_key: FocusableInputKey) => 140,
        [],
    );

    const params = useLocalSearchParams<{
        bankId?: string | string[];
        bankName?: string | string[];
        colorHex?: string | string[];
    }>();

    const editingBankId = React.useMemo(() => {
        const value = Array.isArray(params.bankId) ? params.bankId[0] : params.bankId;
        return value && value.trim().length > 0 ? value : null;
    }, [params.bankId]);

    const initialBankName = React.useMemo(() => {
        const value = Array.isArray(params.bankName) ? params.bankName[0] : params.bankName;
        if (!value) {
            return '';
        }
        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    }, [params.bankName]);

    const initialColorHex = React.useMemo(() => {
        const value = Array.isArray(params.colorHex) ? params.colorHex[0] : params.colorHex;
        if (!value) {
            return null;
        }

        try {
            const decoded = decodeURIComponent(value);
            return decoded ?? null;
        } catch {
            return value;
        }
    }, [params.colorHex]);

    const colorOptions = React.useMemo(() => {
        const options = [...presetBankColors];

        if (initialColorHex && !presetBankColors.some(option => option.value === initialColorHex)) {
            options.push({
                label: 'Cor atual',
                value: initialColorHex,
            });
        }

        return options;
    }, [initialColorHex]);

    const isEditing = Boolean(editingBankId);

    React.useEffect(() => {
        if (isEditing) {
            setNameBank(initialBankName);
            setSelectedColor(initialColorHex);
        }
    }, [initialBankName, initialColorHex, isEditing]);

    const registerBank = React.useCallback(async () => {

        const trimmedName = nameBank.trim();

        if (!trimmedName) {
            showFloatingAlert({
                message: 'Informe o nome do banco antes de registrar.',
                action: 'error',
                position: 'bottom',
                offset: 40,
            });
            return;
        }

        const normalizedColor = selectedColor ?? null;

        setIsSubmitting(true);

        try {
            const personId = auth.currentUser?.uid;

            if (!personId) {
                showFloatingAlert({
                    message: 'Não foi possível identificar o usuário atual.',
                    action: 'error',
                    position: 'bottom',
                    offset: 40,
                });
                setIsSubmitting(false);
                return;
            }

            if (isEditing && editingBankId) {
                const result = await updateBankFirebase({
                    bankId: editingBankId,
                    bankName: trimmedName,
                    colorHex: normalizedColor,
                });

                if (result.success) {
                    showFloatingAlert({
                        message: 'Banco atualizado com sucesso!',
                        action: 'success',
                        position: 'bottom',
                        offset: 40,
                    });
                    Keyboard.dismiss();
                    router.back();
                } else {
                    showFloatingAlert({
                        message: 'Erro ao atualizar banco. Tente novamente mais tarde.',
                        action: 'error',
                        position: 'bottom',
                        offset: 40,
                    });
                }

                return;
            }

            const result = await addBankFirebase({ bankName: trimmedName, personId, colorHex: normalizedColor ?? null });

            if (result.success) {
                showFloatingAlert({
                    message: 'Banco registrado com sucesso!',
                    action: 'success',
                    position: 'bottom',
                    offset: 40,
                });
                setNameBank('');
                setSelectedColor(null);
                Keyboard.dismiss();
                router.back();
            } else {
                showFloatingAlert({
                    message: 'Erro ao registrar banco. Tente novamente mais tarde.',
                    action: 'error',
                    position: 'bottom',
                    offset: 40,
                });
            }
        } catch (error) {
            console.error('Erro ao registrar banco:', error);
            showFloatingAlert({
                message: 'Erro inesperado ao registrar banco. Tente novamente.',
                action: 'error',
                position: 'bottom',
                offset: 40,
            });
        } finally {
            setIsSubmitting(false);
        }
    }, [nameBank, selectedColor, isEditing, editingBankId]);

    const getInputRef = React.useCallback(
        (key: FocusableInputKey) => {
            switch (key) {
                case 'bank-name':
                    return bankNameInputRef;
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

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <SafeAreaView style={{ flex: 1, backgroundColor: pageBackground }}>
			<StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={pageBackground} />
			<View
				className="
						flex-1 w-full h-full
                        pt-[64px]
                        items-center
                        justify-between
                        pb-6
                        relative
                    "
				style={{ backgroundColor: pageBackground }}
			>
				<FloatingAlertViewport />

				<KeyboardAvoidingView
					behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
					keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
					className="flex-1 w-full"
				>
					<ScrollView
						ref={scrollViewRef}
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="on-drag"
						style={{ backgroundColor: pageBackground }}
						contentContainerStyle={{ flexGrow: 1, paddingBottom: contentBottomPadding }}
					>
						<View className="w-full px-6">

					<Heading size="3xl" className="text-center text-gray-900 dark:text-gray-100">
						{isEditing ? 'Editar banco' : 'Adição de um novo banco'}
					</Heading>
					
					<Box className="w-full items-center ">
						<AddRegisterBankScreenIllustration width={180} height={180} />
					</Box>

					<Text className="text-justify text-gray-600 dark:text-gray-400">
						{isEditing
							? 'Atualize as informações do banco selecionado. As alterações serão refletidas imediatamente após salvar.'
							: 'Preencha os campos abaixo para registrar um novo banco no aplicativo. Ele será adicionado ao sistema e poderá ser selecionado nas ações financeiras.'}
					</Text>

					<Divider className="my-6 mb-6" />

					<VStack className="gap-4">

						<Box>
							<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
								Nome do Banco
							</Text>
							<Input>
								<InputField
									ref={bankNameInputRef}
									placeholder="Ex: Banco do Brasil, Caixa Econômica, Itaú..."
									value={nameBank}
									onChangeText={setNameBank}
									onFocus={() => handleInputFocus('bank-name')}
								/>
							</Input>
						</Box>

						<Box>
							<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
								Cor do Banco
							</Text>
						<Select
							selectedValue={selectedColor ?? undefined}
							onValueChange={value => setSelectedColor(value === 'no-color' ? null : value)}
						>
								<SelectTrigger>
									<SelectInput placeholder="Cor do banco (opcional), apenas para fins visuais" />
									<SelectIcon />
								</SelectTrigger>
								<SelectPortal>
									<SelectBackdrop />
									<SelectContent>
										<SelectDragIndicatorWrapper>
											<SelectDragIndicator />
										</SelectDragIndicatorWrapper>
										<SelectItem label="Sem cor" value="no-color" />
										{colorOptions.map(option => (
											<SelectItem
												key={option.value}
												label={`${option.label} (${option.value})`}
												value={option.value}
											/>
										))}
									</SelectContent>
								</SelectPortal>
							</Select>
						</Box>

						<Button
							className="w-full mt-2"
							size="sm"
							variant="outline"
							onPress={registerBank}
							isDisabled={isSubmitting || nameBank.trim().length === 0 || (isEditing && nameBank.trim() === initialBankName && selectedColor === initialColorHex)}
						>
							{isSubmitting ? (
								<ButtonSpinner />
							) : (
								<ButtonText>
									{isEditing ? 'Atualizar Banco' : 'Registrar Banco'}
								</ButtonText>
							)}
						</Button>
					</VStack>
						</View>
					</ScrollView>
				</KeyboardAvoidingView>

				<Menu defaultValue={2} />
			</View>
		</SafeAreaView>
        </TouchableWithoutFeedback>
    );
}
