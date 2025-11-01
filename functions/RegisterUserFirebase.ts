// O RegisterUserFirebase.ts é responsável por registrar novos usuários no 
// Firebase Authentication e armazenar seus dados iniciais com nome, email
// e a senha de login

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/FirebaseConfig';
import { doc, setDoc } from 'firebase/firestore';

// Define os parâmetros necessários para registrar um usuário
interface RegisterUserParams {
    email: string;
    password: string;
}

// Função para registrar um novo usuário no Firebase
export async function registerUserFirebase({ email, password }: RegisterUserParams) {

    try {
        // Cria o usuário no Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Armazena os dados iniciais do usuário no Firestore
        await setDoc(doc(db, 'users', user.uid), {
            email,
            createdAt: new Date(),
        });

        return { success: true, user };

    } catch (error) {
        
        console.error('Erro ao registrar usuário:', error);
        return { success: false, error };
    }

}