// O RegisterUserFirebase.ts é responsável por registrar novos usuários no 
// Firebase Authentication e armazenar seus dados iniciais com nome, email
// e a senha de login

import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db, secondaryAuth } from '@/FirebaseConfig';
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection, updateDoc, arrayUnion } from 'firebase/firestore';

// Define os parâmetros necessários para registrar um usuário
interface RegisterUserParams {
    email: string;
    password: string;
    adminUser?: boolean;
    relatedIdUsers?: string[];
}

// =========================================== Funções de Registro ================================================== //

// Função para registrar um novo usuário no Firebase
export async function registerUserFirebase({ email, password, adminUser = false, relatedIdUsers = [] }: RegisterUserParams) {

    

    let shouldSignOutSecondary = false;

    try {

        // Cria o usuário no Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const user = userCredential.user;
        shouldSignOutSecondary = true;

        // Armazena os dados iniciais do usuário no Firestore
        await setDoc(doc(db, 'users', user.uid), {
            email,
            createdAt: new Date(),
            adminUser,
        });

        return { success: true, user };

    } catch (error) {
        
        return { success: false, error };
        
    } finally {
        // Garante que a sessão utilizada para criação de usuário não interfira no usuário atual
        if (shouldSignOutSecondary) {
            try {
                await signOut(secondaryAuth);
            } catch (signOutError) {
                console.warn('Erro ao encerrar sessão secundária de registro:', signOutError);
            }
        }
    }

}

// Função para deletar um usuário registrado no Firebase
export async function deleteUserFirebase(userId: string) {
    try {
        // Deleta o documento do usuário no Firestore
        await deleteDoc(doc(db, 'users', userId));

        // Note: Deleting a user from Firebase Authentication requires the user to be signed in.
        // This function assumes that the user is already authenticated.

        return { success: true };

    } catch (error) {
        
        console.error('Erro ao deletar usuário:', error);
        return { success: false, error };
    }
}

// Função para atualizar os dados de um usuário que está logado no Firebase, essa função irá relacionar ele com
// outros usuários através dos IDs, essa relação é basicamente para que o usuário relacionado veja os gastos e receitas
// um do outro, assim vice e versa, para isso é necessário o ID do usuário que será relacionado com o usuário logado;
// Na função em especifico, o usuário logado será relacionado mas tambem irá ser atualizado o usuário relacionado para que
// no Firabase tenha essa relação em ambos os sentidos
export async function updateUserRelationsFirebase(relatedUserId: string) {

    try {

        const currentUser = auth.currentUser;

        if (!currentUser) {
            throw new Error('Nenhum usuário está logado.');
        }

        const currentUserRef = doc(db, 'users', currentUser.uid);
        const relatedUserRef = doc(db, 'users', relatedUserId);

        const currentUserDoc = await getDoc(currentUserRef);
        const relatedUserDoc = await getDoc(relatedUserRef);

        if (!currentUserDoc.exists()) {
            throw new Error('Dados do usuário atual não foram encontrados.');
        }

        if (!relatedUserDoc.exists()) {
            throw new Error('Usuário relacionado não encontrado.');
        }

        // Atualiza o usuário logado para adicionar o ID do usuário relacionado
        await updateDoc(currentUserRef, {
            relatedIdUsers: arrayUnion(relatedUserId),
        });

        // Atualiza o usuário relacionado para adicionar o ID do usuário logado
        await updateDoc(relatedUserRef, {
            relatedIdUsers: arrayUnion(currentUser.uid),
        });

        return { success: true };

    } catch (error) {

        console.error('Erro ao atualizar relações do usuário:', error);
        return { success: false, error };

    }

}

// =========================================== Funções de consulta ================================================== //

// Função para obter os dados de um usuário específico do Firebase, voltando todos os seus dados salvos no Firestore
export async function getUserDataFirebase(userId: string) {

    try {

        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            return { success: true, data: { id: userDoc.id, ...userDoc.data() } };
        } else {
            return { success: false, error: 'Usuário não encontrado.' };
        }

    } catch (error) {

        console.error('Erro ao obter dados do usuário:', error);
        return { success: false, error };

    }

}

// Função para obter todos os usuários registrados no Firebase
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

// Função para resgatar os dados de usuário relacionados ao usuário logado
export async function getRelatedUsersFirebase(userId: string) {

    try {

        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            return { success: false, error: 'Usuário não encontrado.' };
        }

        const userData = userDoc.data();
        const relatedIdUsers: string[] = userData.relatedIdUsers || [];

        if (relatedIdUsers.length === 0) {
            return { success: true, data: [] };
        }

        const relatedUsersPromises = relatedIdUsers.map(async (relatedIdUser) => {
            const relatedUserDocRef = doc(db, 'users', relatedIdUser);
            const relatedUserDoc = await getDoc(relatedUserDocRef);

            if (relatedUserDoc.exists()) {
                return { id: relatedUserDoc.id, ...relatedUserDoc.data() };
            } else {
                return null;
            }
        });

        const relatedUsers = await Promise.all(relatedUsersPromises);
        return { success: true, data: relatedUsers.filter((user) => user !== null) };
    } catch (error) {
        console.error('Erro ao buscar usuários relacionados:', error);
        return { success: false, error };
    }
}

// ================================================================================================================= //
