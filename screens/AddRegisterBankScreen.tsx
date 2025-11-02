import React from 'react';
import { Keyboard, TouchableWithoutFeedback, View } from 'react-native';

// Importações relacionadas ao Gluestack UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { Menu } from '@/components/uiverse/menu';

// Importação das funções relacionadas a adição de banco ao Firebase
import { addBankFirebase } from '@/functions/BankFirebase';

export default function AddRegisterBankScreen() {

    // =========================================== Funções para Registro ============================================ //
    const [nameBank, setNameBank] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);

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

        setIsSubmitting(true);

        try {
            const result = await addBankFirebase({ bankName: trimmedName });

            if (result.success) {
                showFloatingAlert({
                    message: 'Banco registrado com sucesso!',
                    action: 'success',
                    position: 'bottom',
                    offset: 40,
                });
                setNameBank('');
                Keyboard.dismiss();
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
    }, [nameBank]);

    return (
        
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>

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
                        Adição de um novo banco
                    </Heading>

                    <VStack className="gap-4">
                        <Text>
                            Preencha os campos abaixo para registrar um novo banco no aplicativo. Ele será adicionado
                            ao sistema e poderá ser selecionado nas ações financeiras.
                        </Text>

                        <Input>
                            <InputField
                                placeholder="Nome do Banco"
                                value={nameBank}
                                onChangeText={setNameBank}
                            />
                        </Input>

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
                                    Registrar Banco
                                </ButtonText>
                            )}
                        </Button>
                    </VStack>
                </View>

                <Menu defaultValue={2} />
            </View>
        </TouchableWithoutFeedback>
    );
}
