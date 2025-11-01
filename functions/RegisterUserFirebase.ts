// O RegisterUserFirebase.ts é responsável por registrar novos usuários no 
// Firebase Authentication e armazenar seus dados iniciais com nome, email
// e a senha de login

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/FirebaseConfig';
import { doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';

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

// Função para deletar um usuário registrado no Firebase
export async function deleteUserFirebase(userId: string) {
    try {
        // Deleta o documento do usuário no Firestore
        await setDoc(doc(db, 'users', userId), { deletedAt: new Date() }, { merge: true });

        // Note: Deleting a user from Firebase Authentication requires the user to be signed in.
        // This function assumes that the user is already authenticated.

        return { success: true };

    } catch (error) {
        
        console.error('Erro ao deletar usuário:', error);
        return { success: false, error };
    }
}


// =========================================== Funções de consulta ================================================== //
export async function getUserDataFirebase(userId: string) {

    try {

        const userDoc = await getDoc(doc(db, 'users', userId));

        if (userDoc.exists()) {

            return { success: true, data: userDoc.data() };
        
        } else {

            return { success: false, error: 'Usuário não encontrado' };
        }

    } catch (error) {

        console.error('Erro ao obter dados do usuário:', error);
        return { success: false, error };

    }

}

export async function getAllUsersFirebase() {

    try {

        const usersSnapshot = await getDocs(collection(db, 'users'));
        const users = usersSnapshot.docs.map(userDoc => ({
            id: userDoc.id,
            ...userDoc.data(),
        }));

        const currentUser = auth.currentUser;

        if (currentUser) {
            const isCurrentUserListed = users.some((user) => user.id === currentUser.uid);

            if (!isCurrentUserListed) {
                const currentUserDocRef = doc(db, 'users', currentUser.uid);
                const currentUserDoc = await getDoc(currentUserDocRef);

                if (currentUserDoc.exists()) {

                    users.push({
                        id: currentUserDoc.id,
                        ...currentUserDoc.data(),
                    });

                } else {

                    const fallbackUserData = {
                        email: currentUser.email ?? '',
                        createdAt: new Date(),
                    };

                    await setDoc(currentUserDocRef, fallbackUserData, { merge: true });

                    users.push({
                        id: currentUser.uid,
                        ...fallbackUserData,
                    });
                }
            }
        }

        return { success: true, data: users };

    } catch (error) {

        console.error('Erro ao obter todos os usuários:', error);
        return { success: false, error };

    }

}
