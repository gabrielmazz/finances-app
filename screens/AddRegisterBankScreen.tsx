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

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import Navigator from '@/components/uiverse/navigator';
import { useAppTheme } from '@/contexts/ThemeContext';

import { addBankFirebase, updateBankFirebase } from '@/functions/BankFirebase';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { router, useLocalSearchParams } from 'expo-router';

import AddRegisterBankScreenIllustration from '../assets/UnDraw/addRegisterBankScreen.svg';

import { useScreenStyles } from '@/hooks/useScreenStyle';

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
	
    const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		focusFieldClassName,
		fieldContainerClassName,
		fieldContainerClassNameNotSpace,
		fieldContainerCardClassName,
		textareaContainerClassName,
		submitButtonClassName,
		heroHeight,
		infoCardStyle,
		insets,
		labelText,
		switchRadioClassName,
		switchRadioIndicatorClassName,
		switchRadioIconClassName,
		switchRadioLabelClassName,
		addTagButtonClassName,
		checkboxClassName,
		checkboxIndicatorClassName,
		checkboxIconClassName,
		checkboxLabelClassName,
	} = useScreenStyles();

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
            showNotifierAlert({
                title: 'Erro ao registrar banco',
                description: 'Informe o nome do banco antes de registrar.',
                type: 'error',
                isDarkMode,
                duration: 4000,
            });
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
            return;
        }

        if (
            isEditing &&
            trimmedName === initialBankName.trim() &&
            selectedColor === initialColorHex
        ) {
            showNotifierAlert({
                title: 'Nenhuma alteração identificada',
                description: 'Nenhuma alteração foi identificada para este banco.',
                type: 'info',
                isDarkMode,
                duration: 4000,
            });
            return;
        }

        const normalizedColor = selectedColor ?? null;

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
                    showNotifierAlert({
                        title: 'Banco atualizado',
                        description: `O banco ${trimmedName} foi atualizado com sucesso.`,
                        type: 'success',
                        isDarkMode,
                        duration: 4000,
                    });
                    Keyboard.dismiss();
                    router.replace('/home?tab=0');
                } else {
                    showNotifierAlert({
                        title: 'Erro ao atualizar banco',
                        description: 'Erro ao atualizar banco. Tente novamente mais tarde.',
                        type: 'error',
                        isDarkMode,
                    });
                }

                return;
            }

            const result = await addBankFirebase({ bankName: trimmedName, personId, colorHex: normalizedColor ?? null });

            if (result.success) {
                showNotifierAlert({
                    title: 'Banco registrado',
                    description: `O banco ${trimmedName} foi registrado com sucesso.`,
                    type: 'success',
                    isDarkMode,
                    duration: 4000,
                });
                setNameBank('');
                setSelectedColor(null);
                Keyboard.dismiss();
                router.replace('/home?tab=0');
            } else {
                showNotifierAlert({
                    title: 'Erro ao registrar banco',
                    description: 'Erro ao registrar banco. Tente novamente mais tarde.',
                    type: 'error',
                    isDarkMode,
                });
            }
        } catch (error) {
            console.error('Erro ao registrar banco:', error);
            showNotifierAlert({
                title: 'Erro inesperado ao registrar banco',
                description: 'Erro inesperado ao registrar banco. Tente novamente.',
                type: 'error',
                isDarkMode,
            });
        } finally {
            setIsSubmitting(false);
        }
    }, [nameBank, selectedColor, isEditing, initialBankName, initialColorHex, editingBankId, isDarkMode]);

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
    const screenTitle = isEditing ? 'Editar banco' : 'Adição de um novo banco';

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
                                alt="Background da tela de cadastro de banco"
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
                                <AddRegisterBankScreenIllustration width="40%" height="40%" className="opacity-90" />
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
                                <VStack className="mb-4">
                                    <Text className={`${bodyText} mb-1 ml-1 text-sm`}>Nome do banco</Text>
                                    <Input className={fieldContainerClassName}>
                                        <InputField
                                            ref={bankNameInputRef as any}
                                            placeholder="Ex: Banco do Brasil, Caixa Econômica, Itaú..."
                                            value={nameBank}
                                            onChangeText={setNameBank}
                                            className={inputField}
                                            onFocus={() => handleInputFocus('bank-name')}
                                        />
                                    </Input>
                                </VStack>

                                <VStack className="mb-4">
                                    <Text className={`${bodyText} mb-1 ml-1 text-sm`}>Cor do banco (Opcional)</Text>
                                    <Select
                                        selectedValue={selectedColor ?? undefined}
                                        onValueChange={value => setSelectedColor(value === 'no-color' ? null : value)}
                                    >
                                        <SelectTrigger variant="outline" size="md" className={fieldContainerClassName}>
                                            <SelectInput
                                                placeholder="Cor do banco (opcional), apenas para fins visuais"
                                                className={inputField}
                                            />
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
                                </VStack>

                                <Button
                                    className={submitButtonClassName}
                                    onPress={registerBank}
                                    isDisabled={
                                        isSubmitting ||
                                        nameBank.trim().length === 0 ||
                                        (isEditing &&
                                            nameBank.trim() === initialBankName &&
                                            selectedColor === initialColorHex)
                                    }
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
