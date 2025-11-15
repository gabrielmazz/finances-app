
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { View, Pressable, TouchableWithoutFeedback, Keyboard } from 'react-native';

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
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';
import { Divider } from '@/components/ui/divider';
import { Text } from '@/components/ui/text';
import {
    Modal,
    ModalBackdrop,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
} from '@/components/ui/modal';
import Loader from '@/components/uiverse/loader';

// Importações relacionadas ao Firebase
import { auth } from '@/FirebaseConfig';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

// Importação responsável pela navegação pelo expo-router
import { router } from 'expo-router';

export default function LoginScreen() {

    // Variaveis relacionadas ao login
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);

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

    const handleOpenCreditsModal = () => setIsCreditsModalOpen(true);
    const handleCloseCreditsModal = () => setIsCreditsModalOpen(false);

	return (
		<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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
                                size="xl"
                                className=""
                            >
                                Lumus Finances
                            </Heading>

                            <Heading
                                size="3xl"
                                className=""
                            >
                                Bem-vindo de volta!
                            </Heading>

                            <Heading
                                size="md"
                                className="mb-4"
                            >
                                Faça login para continuar
                            </Heading>

                            <Divider />

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

                    <Pressable
                        accessibilityRole="button"
                        onPress={handleOpenCreditsModal}
                        className="items-center mt-10"
                    >
                        <Text className="text-xs text-slate-500 dark:text-slate-400">
                            Desenvolvido por
                        </Text>
                        <Text className="text-sm font-semibold">
                            Gabriel Mazzuco
                        </Text>
                        <Text className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Toque para conhecer o Lumus Finance
                        </Text>
                        <Text className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                            Versão 1.2.0
                        </Text>
                    </Pressable>

                </View>

                <Modal isOpen={isCreditsModalOpen} onClose={handleCloseCreditsModal} size="md">
                    <ModalBackdrop />
                    <ModalContent className="max-w-[380px] w-[90%]">
                        <ModalHeader>
                            <ModalCloseButton onPress={handleCloseCreditsModal} />
                        </ModalHeader>
                        <ModalBody
                            className="mt-4"
                            contentContainerStyle={{ paddingBottom: 16 }}
                        >
                            <View className="items-center gap-4">
                                <Text className="text-2xl mb-2 font-semibold text-gray-800 dark:text-gray-200">
                                    Lumus Finance
                                </Text>
                                <Loader />
                                <Text className="text-xs uppercase tracking-widest text-amber-500">
                                    Desenvolvido por Gabriel Mazzuco
                                </Text>
                                <Text className="text-sm text-center text-gray-700 dark:text-gray-300">
                                    O Lumus Finance nasceu para simplificar o controle de despesas
                                    domésticas, ajudando você a visualizar gastos e ganhos da casa
                                    em um só lugar.
                                </Text>
                                <Text className="text-sm text-center text-gray-700 dark:text-gray-300">
                                    Explore seus bancos, categorize despesas e mantenha toda a
                                    família alinhada com o orçamento mensal.
                                </Text>
                            </View>
                        </ModalBody>
                        <ModalFooter className="justify-center">
                            <Button size="sm" variant="outline" className="w-full" onPress={handleCloseCreditsModal}>
                                <ButtonText>Fechar</ButtonText>
                            </Button>
                        </ModalFooter>
                    </ModalContent>
                </Modal>

		</SafeAreaView>
		</TouchableWithoutFeedback>
	);
}
