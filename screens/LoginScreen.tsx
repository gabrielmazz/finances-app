
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { View } from 'react-native';

// Importações relacionadas ao Gluestack UI
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
import { AlertCircleIcon } from '@/components/ui/icon';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';

// Importações relacionadas ao Firebase
import { auth } from '@/FirebaseConfig';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

// Importação responsável pela navegação pelo expo-router
import { router } from 'expo-router';

export default function LoginScreen() {

    // Variaveis relacionadas ao login
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // ============================================= Funções para Login ============================================= //

    // Função responsável por fazer login de um usuário já cadastrado, conectando-o ao Firebase Authentication
    const singIn = async () => {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);

            if (userCredential) {
                router.replace('/home');
            }

        } catch (error) {
            alert('Erro ao fazer login: ' + error);
        }
    }

    const signUp = async () => {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);

            if (userCredential) {

            }

        } catch (error) {
            alert('Erro ao criar conta: ' + error);
        }
    }

	return (
		<SafeAreaView
				className="
				flex-1
            "
            >
                <View className="flex-1 justify-between pb-6">
                    <View
                        className="
                        flex-1
                        justify-center
                        px-6
                    "
                    >
                        <VStack
                            space="sm"
                        >

                            <Heading
                                size="3xl"
                                className="mb-6"
                            >
                                Bem-vindo de volta!
                            </Heading>

                            {/* Campo responsável pelo login */}
                            <FormControl
                                size="lg"
                                isDisabled={false}
                                isReadOnly={false}
                                isRequired={false}
                            >
                                <FormControlLabel>

                                    <FormControlLabelText>
                                        Login
                                    </FormControlLabelText>

                                </FormControlLabel>

                                <Input className="my-1" size="md">

                                    <InputField
                                        value={email}
                                        onChangeText={setEmail}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        placeholder="Digite seu login"
                                    />

                                </Input>

                                <FormControlHelper>

                                    <FormControlHelperText>
                                        Informe o login utilizado no cadastro.
                                    </FormControlHelperText>

                                </FormControlHelper>

                                <FormControlError>
                                    <FormControlErrorIcon as={AlertCircleIcon} className="text-red-500" />
                                    <FormControlErrorText className="text-red-500">
                                        Informe um login válido.
                                    </FormControlErrorText>

                                </FormControlError>

                            </FormControl>


                            {/* Campo responsável pela senha */}
                            <FormControl
                                size="md"
                                isDisabled={false}
                                isReadOnly={false}
                                isRequired={true}
                            >
                                <FormControlLabel>
                                    <FormControlLabelText>Senha</FormControlLabelText>
                                </FormControlLabel>

                                <Input className="my-1" size="md">
                                    <InputField
                                        type="password"
                                        value={password}
                                        onChangeText={setPassword}
                                        placeholder="Digite sua senha"
                                    />
                                </Input>

                                <FormControlHelper>

                                    <FormControlHelperText>
                                        Sua senha deve ter no mínimo 6 caracteres.
                                    </FormControlHelperText>

                                </FormControlHelper>

                                <FormControlError>

                                    <FormControlErrorIcon as={AlertCircleIcon} className="text-red-500" />

                                    <FormControlErrorText className="text-red-500">
                                        A senha deve ter pelo menos 6 caracteres.
                                    </FormControlErrorText>

                                </FormControlError>

                            </FormControl>



                            {/* Botão para efetuar o login */}
                            <Button
                                size="sm"
                                variant="outline"
                                onPress={singIn}
                            >
                                <ButtonText>
                                    Entrar
                                </ButtonText>

                            </Button>

                        </VStack>
                    </View>

                </View>

		</SafeAreaView>
	);
}
