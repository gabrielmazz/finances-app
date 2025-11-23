import React from 'react';
import { Keyboard, TouchableWithoutFeedback, View, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Importações relacionadas ao Gluestack UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { Box } from '@/components/ui/box';
import { Divider } from '@/components/ui/divider';

// Icones do Gluestack UI
import { EyeIcon, EyeOffIcon } from '@/components/ui/icon';

// Importação das funções relacionadas a adição de usuário ao Firebase
import { registerUserFirebase } from '@/functions/RegisterUserFirebase';

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';

// Importações relacionadas à navegação e autenticação
import { router } from 'expo-router';
import { Menu } from '@/components/uiverse/menu';
import { useAppTheme } from '@/contexts/ThemeContext';

// Importação do SVG
import AddRegisterUserScreenIllustration from '../assets/UnDraw/addRegisterUserScreen.svg';

export default function AddRegisterUserScreen() {
	const { isDarkMode } = useAppTheme();
	const pageBackground = isDarkMode ? '#0b1220' : '#f4f5f7';

    // Variavel resposável por mostrar ou não a senha do usuário
    const [showPassword, setShowPassword] = React.useState(false);

    const handleState = () => {
        setShowPassword((showState) => {
            return !showState;
        });
    };


    // =========================================== Funções para Registro ============================================ //
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');

    const registerUser = async () => {

        Keyboard.dismiss();

        const result = await registerUserFirebase({ email, password });

        if (result.success) {

            showFloatingAlert({
                message: 'Usuário registrado com sucesso!',
                action: 'success',
                position: 'bottom',
                offset: 40,
            });

            // Voltar para a tela de configurações após o registro bem-sucedido
            setEmail('');
            setPassword('');
            router.back();

        } else {

            showFloatingAlert({
                message: 'Erro ao registrar usuário: ' + result.error,
                action: 'error',
                position: 'bottom',
                offset: 40,
            });

        }
    };

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <SafeAreaView style={{ flex: 1, backgroundColor: pageBackground }}>
		<StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={pageBackground} />
        <View className="
				flex-1 w-full h-full
                mt-[64px]
                items-center
                justify-between
                pb-6
                "
                style={{ backgroundColor: pageBackground }}
        >

            <FloatingAlertViewport />

            <View className="w-full px-6">

                <Heading size="3xl" className="text-center mb-2">
                    Adição de um novo usuário
                </Heading>

                <Box className="w-full items-center mb-2">
                    <AddRegisterUserScreenIllustration width={180} height={180} />
                </Box>

                <Text className="text-justify text-gray-600 dark:text-gray-400">
                    Preencha os campos abaixo para registrar um novo usuário no aplicativo. Ele será adicionado
                    ao sistema e poderá fazer login utilizando as credenciais fornecidas.
                </Text>

                <Divider className="my-6 mb-6" />

                <VStack className="gap-4">

                    <Box>
                        <Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
                            Email do usuário
                        </Text>
                        <Input>
                            <InputField
                                placeholder="Email do usuário que será registrado"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                value={email}
                                onChangeText={setEmail}
                            />
                        </Input>
                    </Box>

                    <Box>
                        <Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
                            Senha do usuário
                        </Text>
                        <Input>
                            <InputField
                                placeholder="Senha"
                                secureTextEntry={!showPassword}
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChangeText={setPassword}
                            />
                            <InputSlot className="pr-3" onPress={handleState}>
                                <InputIcon as={showPassword ? EyeIcon : EyeOffIcon} />
                            </InputSlot>
                        </Input>
                    </Box>

                    <Button
                        className="w-full mt-2"
                        size="sm"
                        variant="outline"
                        onPress={registerUser}
                        isDisabled={email === '' || password === ''}
                    >

                        <ButtonText>
                            Registrar Usuário
                        </ButtonText>

                    </Button>

                </VStack>

            </View>

            <Menu defaultValue={2} />

        </View>
        </SafeAreaView>
        </TouchableWithoutFeedback>

    );
}
