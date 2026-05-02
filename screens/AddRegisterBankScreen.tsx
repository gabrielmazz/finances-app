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
	Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
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
import {
    Actionsheet,
    ActionsheetBackdrop,
    ActionsheetContent,
    ActionsheetDragIndicator,
    ActionsheetDragIndicatorWrapper,
    ActionsheetItem,
    ActionsheetItemText,
    ActionsheetScrollView,
} from '@/components/ui/actionsheet';

import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import Navigator from '@/components/uiverse/navigator';
import { BankIcon, BANK_ICON_OPTIONS } from '@/hooks/useBankIcons';

import { addBankFirebase, updateBankFirebase } from '@/functions/BankFirebase';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { useLocalSearchParams } from 'expo-router';
import { navigateToHomeDashboard } from '@/utils/navigation';

import AddRegisterBankScreenIllustration from '../assets/UnDraw/addRegisterBankScreen.svg';

import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { Check, ChevronDown } from 'lucide-react-native';

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
		fieldBankContainerClassName,
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
    const [selectedBankIconKey, setSelectedBankIconKey] = React.useState<string | null>('outro-banco');
    const [isBankIconSheetOpen, setIsBankIconSheetOpen] = React.useState(false);
    const bankNameInputRef = React.useRef<TextInput | null>(null);
    const keyboardScrollOffset = React.useCallback(
        (_key: FocusableInputKey) => 140,
        [],
    );

    const params = useLocalSearchParams<{
        bankId?: string | string[];
        bankName?: string | string[];
        colorHex?: string | string[];
        bankIconKey?: string | string[];
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

    const initialBankIconKey = React.useMemo(() => {
        const value = Array.isArray(params.bankIconKey) ? params.bankIconKey[0] : params.bankIconKey;
        if (!value) {
            return 'outro-banco';
        }

        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    }, [params.bankIconKey]);

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

    const handleBackToHome = React.useCallback(() => {
        navigateToHomeDashboard();
        return true;
    }, []);

    React.useEffect(() => {
        if (isEditing) {
            setNameBank(initialBankName);
            setSelectedColor(initialColorHex);
            setSelectedBankIconKey(initialBankIconKey);
        }
    }, [initialBankIconKey, initialBankName, initialColorHex, isEditing]);

    const selectedBankIcon = React.useMemo(
        () =>
            BANK_ICON_OPTIONS.find(option => option.key === selectedBankIconKey) ??
            BANK_ICON_OPTIONS.find(option => option.key === 'outro-banco') ??
            BANK_ICON_OPTIONS[0],
        [selectedBankIconKey],
    );

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
            selectedColor === initialColorHex &&
            selectedBankIconKey === initialBankIconKey
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
        const normalizedIconKey = selectedBankIconKey ?? 'outro-banco';

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
                    iconKey: normalizedIconKey,
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
                    navigateToHomeDashboard();
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

            const result = await addBankFirebase({
                bankName: trimmedName,
                personId,
                colorHex: normalizedColor ?? null,
                iconKey: normalizedIconKey,
            });

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
                setSelectedBankIconKey('outro-banco');
                Keyboard.dismiss();
                navigateToHomeDashboard();
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
    }, [nameBank, selectedColor, selectedBankIconKey, initialBankIconKey, isEditing, initialBankName, initialColorHex, editingBankId, isDarkMode]);

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
                            onScroll={handleScroll}
                            scrollEventThrottle={scrollEventThrottle}
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
                                    <Text className={`${bodyText} mb-1 ml-1 text-sm`}>Ícone do banco</Text>
                                    <Pressable
                                        onPress={() => setIsBankIconSheetOpen(true)}
                                        accessibilityRole="button"
                                        accessibilityLabel="Escolher ícone do banco"
                                        className={`${fieldBankContainerClassName} px-4 py-3`}
                                    >
                                        <HStack className="items-center justify-between gap-3">
                                            <HStack className="min-w-0 flex-1 items-center gap-3">
                                                <View className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                                                    <BankIcon
                                                        iconKey={selectedBankIcon?.key}
                                                        name={nameBank}
                                                        colorHex={selectedColor}
                                                        size={32}
                                                    />
                                                </View>
                                                <VStack className="min-w-0 flex-1">
                                                    <Text className={`${bodyText} text-sm font-medium`} numberOfLines={1}>
                                                        {selectedBankIcon?.label ?? 'Outro banco'}
                                                    </Text>
                                                    <Text className={`${helperText} text-xs`} numberOfLines={1}>
                                                        Toque para escolher um ícone brasileiro.
                                                    </Text>
                                                </VStack>
                                            </HStack>
                                            <ChevronDown size={18} color={isDarkMode ? '#FCD34D' : '#D97706'} />
                                        </HStack>
                                    </Pressable>
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
                                            selectedColor === initialColorHex &&
                                            selectedBankIconKey === initialBankIconKey)
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
                    <Navigator defaultValue={2} onHardwareBack={handleBackToHome} />
                </View>
            </View>

            <Actionsheet
                isOpen={isBankIconSheetOpen}
                onClose={() => setIsBankIconSheetOpen(false)}
                snapPoints={[72]}
            >
                <ActionsheetBackdrop />
                <ActionsheetContent className={isDarkMode ? 'bg-slate-950' : 'bg-white'}>
                    <ActionsheetDragIndicatorWrapper>
                        <ActionsheetDragIndicator />
                    </ActionsheetDragIndicatorWrapper>
                    <VStack className="w-full px-4 pb-3 pt-6 gap-1">
                        <Heading size="lg" className={isDarkMode ? 'text-slate-100' : 'text-slate-900'}>
                            Escolha o ícone do banco
                        </Heading>
                        <Text className={`${helperText} text-sm`}>
                            Selecione uma instituição ou use a opção genérica.
                        </Text>
                    </VStack>
                    <ActionsheetScrollView
                        className="w-full flex-1"
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ paddingBottom: Math.max(96, insets.bottom + 72) }}
                    >
                        <VStack className="px-2 pb-2">
                            {BANK_ICON_OPTIONS.map(option => {
                                const isSelected = option.key === selectedBankIconKey;
                                return (
                                    <ActionsheetItem
                                        key={option.key}
                                        onPress={() => {
                                            setSelectedBankIconKey(option.key);
                                            setIsBankIconSheetOpen(false);
                                        }}
                                        className={isSelected ? (isDarkMode ? 'bg-slate-900 rounded-2xl' : 'bg-amber-50 rounded-2xl') : ''}
                                    >
                                        <HStack className="items-center gap-3 w-full">
                                            <View className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                                                <BankIcon iconKey={option.key} size={32} />
                                            </View>
                                            <VStack className="min-w-0 flex-1 items-start justify-center">
                                                <ActionsheetItemText className={isDarkMode ? 'mx-0 text-slate-100' : 'mx-0 text-slate-900'}>
                                                    {option.label}
                                                </ActionsheetItemText>
                                                {isSelected ? (
                                                    <Text className="text-xs text-amber-500 dark:text-amber-300">
                                                        Selecionado atualmente
                                                    </Text>
                                                ) : null}
                                            </VStack>
                                            {isSelected ? <Check size={18} color={isDarkMode ? '#FCD34D' : '#D97706'} /> : null}
                                        </HStack>
                                    </ActionsheetItem>
                                );
                            })}
                        </VStack>
                    </ActionsheetScrollView>
                </ActionsheetContent>
            </Actionsheet>
		</SafeAreaView>
        </TouchableWithoutFeedback>
    );
}
