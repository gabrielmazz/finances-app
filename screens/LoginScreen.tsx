
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

// Componentes do gluestack-ui
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
import { VStack } from '@/components/ui/vstack';

// Importações relacionadas ao Firebase
import { auth } from '@/FirebaseConfig';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

// Importação responsável pela navegação
import { useNavigation } from '@react-navigation/native';

export default function LoginScreen() {

    // Variaveis relacionadas ao login
    const [email, setEmail] = useState('');
    const [password, setPassword] =useState('');

    // Função para realizar o login
    const singIn = async () => {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);

            if (userCredential) {
                
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
        <SafeAreaView>
            <VStack>
                <FormControl
                    size="md"
                    isDisabled={false}
                    isReadOnly={false}
                    isRequired={false}
                >
                    <FormControlLabel>
                        <FormControlLabelText>Password</FormControlLabelText>
                    </FormControlLabel>
                    <Input className="my-1" size="md">
                        <InputField
                            type="password"
                            placeholder="password"
                        />
                    </Input>
                    <FormControlHelper>
                        <FormControlHelperText>
                            Must be at least 6 characters.
                        </FormControlHelperText>
                    </FormControlHelper>
                    <FormControlError>
                        <FormControlErrorIcon as={AlertCircleIcon} className="text-red-500" />
                        <FormControlErrorText className="text-red-500">
                            At least 6 characters are required.
                        </FormControlErrorText>
                    </FormControlError>
                </FormControl>
                <Button
                    className="w-fit self-end mt-4"
                    size="sm"
                    variant="outline"
                >
                    <ButtonText>Submit</ButtonText>
                </Button>
            </VStack>
        </SafeAreaView>
    );
}
