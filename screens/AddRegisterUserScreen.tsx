import React from 'react';
import { Keyboard, TouchableWithoutFeedback, View } from 'react-native';

// Importações relacionadas ao Gluestack UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';

// Icones do Gluestack UI
import { EyeIcon, EyeOffIcon } from '@/components/ui/icon';

// Importação das funções relacionadas a adição de usuário ao Firebase
import { registerUserFirebase } from '@/functions/RegisterUserFirebase';


export default function AddRegisterUserScreen() {

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
        const result = await registerUserFirebase({ email, password });
        if (result.success) {
            alert('Usuário registrado com sucesso!');
        } else {
            alert('Erro ao registrar usuário: ' + result.error);
        }
    };

    return (

        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>


            <View className="
                flex-1 w-full h-full
                mt-[64px]
                items-center"
            >

                <Heading size="3xl" className="text-center mb-6">
                    Adição de um novo usuário
                </Heading>

                <VStack className="w-full px-6 gap-4">

                    <Text className="mb-4">
                        Preencha os campos abaixo para registrar um novo usuário no aplicativo. Ele será adicionado
                        ao sistema e poderá fazer login utilizando as credenciais fornecidas.
                    </Text>


                    <Input>
                        <InputField
                            placeholder="Email"
                            value={email}
                            onChangeText={setEmail}
                        />
                    </Input>

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

                    <Button
                        className="w-full"
                        size="sm"
                        variant="outline"
                        onPress={registerUser}
                    >

                        <ButtonText>
                            Registrar Usuário
                        </ButtonText>

                    </Button>

                </VStack>

            </View>

        </TouchableWithoutFeedback>

    );
}