import React from 'react';
import { Keyboard, View } from 'react-native';

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

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

// Importação das funções relacionadas a adição de banco ao Firebase
import { addBankFirebase, updateBankFirebase } from '@/functions/BankFirebase';
import { auth } from '@/FirebaseConfig';
import { router, useLocalSearchParams } from 'expo-router';

const presetBankColors = [
	{ label: 'Azul', value: '#2563EB' },
	{ label: 'Verde', value: '#10B981' },
	{ label: 'Vermelho', value: '#EF4444' },
	{ label: 'Amarelo', value: '#FACC15' },
	{ label: 'Roxo', value: '#9333EA' },
	{ label: 'Cinza', value: '#6B7280' },
];

export default function AddRegisterBankScreen() {

    // =========================================== Funções para Registro ============================================ //
    const [nameBank, setNameBank] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [selectedColor, setSelectedColor] = React.useState<string | null>(null);

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

	return (
		<View
				className="
					flex-1 w-full h-full
                    mt-[64px]
                    items-center
                    justify-between
                    pb-6
                    relative
                "
            >
                <FloatingAlertViewport />

                <View className="w-full px-6 gap-4">
                    <Heading size="3xl" className="text-center mb-6">
                        {isEditing ? 'Editar banco' : 'Adição de um novo banco'}
                    </Heading>

                    <VStack className="gap-4">
                        <Text>
                            {isEditing
                                ? 'Atualize as informações do banco selecionado. As alterações serão refletidas imediatamente após salvar.'
                                : 'Preencha os campos abaixo para registrar um novo banco no aplicativo. Ele será adicionado ao sistema e poderá ser selecionado nas ações financeiras.'}
                        </Text>

                        <Input>
                            <InputField
                                placeholder="Nome do Banco"
                                value={nameBank}
                                onChangeText={setNameBank}
                            />
                        </Input>

                        <Select
                            selectedValue={selectedColor ?? 'no-color'}
                            onValueChange={value => setSelectedColor(value === 'no-color' ? null : value)}
                        >
                            <SelectTrigger>
                                <SelectInput placeholder="Cor do banco (opcional)" />
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

                        <Button
                            className="w-full mt-2"
                            size="sm"
                            variant="outline"
                            onPress={registerBank}
                            isDisabled={isSubmitting}
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

                <Menu defaultValue={2} />
		</View>
	);
}
