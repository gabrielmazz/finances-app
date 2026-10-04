// O RegisterUserFirebase.ts é responsável por registrar novos usuários no 
// Firebase Authentication e armazenar seus dados iniciais com nome, email
// sem persistir a senha no Firestore.

import { createUserWithEmailAndPassword, deleteUser, sendPasswordResetEmail, signOut, type User } from 'firebase/auth';
import { auth, db, secondaryAuth, secondaryDb } from '@/FirebaseConfig';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { runUserRelationshipFirebase } from '@/functions/UserRelationshipFirebase';

// Define os parâmetros necessários para registrar um usuário
interface RegisterUserParams {
    name?: string;
    email: string;
    password: string;
}

// =========================================== Funções de Registro ================================================== //

// Função para registrar um novo usuário no Firebase
export async function registerUserFirebase({
    name,
    email,
    password,
}: RegisterUserParams) {

    let shouldSignOutSecondary = false;
    let createdUser: User | null = null;

    try {
        const normalizedName = typeof name === 'string' ? name.trim() : '';

        // Cria o usuário no Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const user = userCredential.user;
        createdUser = user;
        shouldSignOutSecondary = true;

        // Armazena os dados iniciais do usuário no Firestore
        // [[Autenticação]]: o perfil deve ser escrito com o UID recém-criado,
        // inclusive quando não existe sessão primária no cadastro público.
        await setDoc(doc(secondaryDb, 'users', user.uid), {
            name: normalizedName.length > 0 ? normalizedName : null,
            email,
            createdAt: new Date(),
            adminUser: false,
        });

        return { success: true, user };

    } catch (error) {
        if (createdUser) {
            try {
                await deleteUser(createdUser);
            } catch {
                return { success: false, error: { code: 'auth/profile-creation-incomplete' } };
            }
        }
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

// [[Autenticação]]: resposta neutra também em projetos sem proteção contra
// enumeração de emails. A redefinição efetiva acontece no link do Firebase.
export async function requestPasswordResetFirebase(email: string) {
    auth.languageCode = 'pt-BR';
    try {
        await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    } catch (error) {
        if (typeof error === 'object' && error && 'code' in error && error.code === 'auth/user-not-found') return;
        throw error;
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
type RelationshipSnapshot = { expectedFingerprint: string; clientActionId: string };

async function changeUserRelationship(relatedUserId: string, action: 'link' | 'unlink', snapshot?: RelationshipSnapshot) {
    try {
        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error('Nenhum usuário está logado.');
        const preview = snapshot ?? await runUserRelationshipFirebase(uid, { action: 'preview', relatedUserId });
        if (auth.currentUser?.uid !== uid) throw new Error('A conta mudou. Envie o pedido novamente.');
        const result = await runUserRelationshipFirebase(uid, {
            action, relatedUserId,
            expectedFingerprint: snapshot?.expectedFingerprint ?? ('fingerprint' in preview ? preview.fingerprint : undefined),
            clientActionId: snapshot?.clientActionId ?? `relationship-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
        });
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error };
    }
}

// O backend revalida ambos perfis e persiste o vínculo bidirecional numa transação.
export async function updateUserRelationsFirebase(relatedUserId: string, snapshot?: RelationshipSnapshot) {
    return changeUserRelationship(relatedUserId, 'link', snapshot);
}

export async function deleteUserRelationFirebase(relatedUserId: string, snapshot?: RelationshipSnapshot) {
    return changeUserRelationship(relatedUserId, 'unlink', snapshot);
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

// Função para obter o email do usuário pelo ID
export async function getUserNameByIdFirebase(userId: string) {

    try {

        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const userData = userDoc.data();
            return { success: true, data: userData.email || 'Desconhecido' };
        } else {
            return { success: false, error: 'Usuário não encontrado.' };
        }

    } catch (error) {

        console.error('Erro ao obter nome do usuário:', error);
        return { success: false, error };

    }

}

// Função para obter todos os usuários registrados no Firebase
export async function getAllUsersFirebase() {

    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            return { success: false, error: 'Usuário não autenticado.' };
        }

        // A regra de /users não permite uma coleção inteira no cliente.
        // Retorne somente o usuário atual e os relacionados autorizados.
        const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const relatedResult = await getRelatedUsersFirebase(currentUser.uid);
        if (!relatedResult.success) return relatedResult;
        const users = [
            ...(currentUserDoc.exists() ? [{ id: currentUserDoc.id, ...currentUserDoc.data() }] : []),
            ...(Array.isArray(relatedResult.data) ? relatedResult.data : []),
        ];

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

// Função para resgatar os IDs dos usuários relacionados ao usuário passado por parâmetro, voltando o objeto
// inteiro da consulta, necessário separa-los posteriormente para tratamentos mais específicos
export async function getRelatedUsersIDsFirebase(userId: string) {

    try {

        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            return { success: false, error: 'Usuário não encontrado.' };
        }

        const userData = userDoc.data();
        const relatedIdUsers = Array.isArray(userData.relatedIdUsers)
            ? userData.relatedIdUsers.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
            : [];

        if (relatedIdUsers.length === 0) {
            return { success: true, data: [] };
        }

        return { success: true, data: relatedIdUsers };
    } catch (error) {
        console.error('Erro ao buscar usuários relacionados:', error);
        return { success: false, error };
    }
}

// ================================================================================================================= //
