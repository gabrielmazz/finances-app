// O RegisterUserFirebase.ts é responsável por registrar novos usuários no 
// Firebase Authentication e armazenar seus dados iniciais com nome, email
// sem persistir a senha no Firestore.

import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, type User } from 'firebase/auth';
import { auth, db, firebaseFunctions, secondaryAuth, secondaryDb } from '@/FirebaseConfig';
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { loadUserRelationshipsFirebase, runUserRelationshipFirebase } from '@/functions/UserRelationshipFirebase';
import { registrationRecoveryStorage } from '@/utils/registrationRecoveryStorage';

// Define os parâmetros necessários para registrar um usuário
interface RegisterUserParams {
    name?: string;
    email: string;
    password: string;
}

// =========================================== Funções de Registro ================================================== //

// [[Autenticação]]: somente dados não secretos ficam em memória para recuperar o mesmo UID.
const pendingRegistrations = new Map<string, { uid: string; name: string | null; createdAt: Date }>();

export async function registerUserFirebase({ name, email, password }: RegisterUserParams) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = typeof name === 'string' && name.trim() ? name.trim() : null;
    let shouldSignOutSecondary = false;
    let user: User | undefined;
    try {
        let pending = pendingRegistrations.get(normalizedEmail);
        if (!pending) {
            try {
                const stored = await registrationRecoveryStorage.find(normalizedEmail);
                if (stored) pending = { uid: stored.uid, name: stored.name, createdAt: new Date(stored.createdAt) };
            } catch { return { success: false, error: { code: 'auth/profile-recovery-storage' } }; }
        }
        if (pending && pending.name !== normalizedName) return { success: false, error: { code: 'auth/profile-recovery-mismatch' } };
        if (pending) {
            const credential = await signInWithEmailAndPassword(secondaryAuth, normalizedEmail, password);
            user = credential.user;
            shouldSignOutSecondary = true;
            if (user.uid !== pending.uid) return { success: false, error: { code: 'auth/profile-recovery-mismatch' } };
        } else {
            const credential = await createUserWithEmailAndPassword(secondaryAuth, normalizedEmail, password);
            user = credential.user;
            shouldSignOutSecondary = true;
            pending = { uid: user.uid, name: normalizedName, createdAt: new Date() };
            pendingRegistrations.set(normalizedEmail, pending);
            try { await registrationRecoveryStorage.save({ ...pending, email: normalizedEmail, createdAt: pending.createdAt.toISOString() }); }
            catch { return { success: false, error: { code: 'auth/profile-recovery-storage-pending' } }; }
        }
        const saved = pending;
        try { await registrationRecoveryStorage.save({ ...saved, email: normalizedEmail, createdAt: saved.createdAt.toISOString() }); }
        catch { return { success: false, error: { code: 'auth/profile-recovery-storage-pending' } }; }
        const reference = doc(secondaryDb, 'users', saved.uid);
        try {
            // A transação cria somente se ausente; reenvio nunca sobrescreve perfil já alterado.
            await runTransaction(secondaryDb, async transaction => {
                const current = await transaction.get(reference);
                if (current.exists()) {
                    if (current.data()?.email !== normalizedEmail) throw Object.assign(new Error('Perfil incompatível.'), { code: 'auth/profile-recovery-mismatch' });
                    return;
                }
                transaction.set(reference, { name: saved.name, email: normalizedEmail, createdAt: saved.createdAt, adminUser: false, sparkFirstUseRequested: true });
            });
        } catch (error) {
            if ((error as { code?: string })?.code === 'auth/profile-recovery-mismatch') return { success: false, error };
            return { success: false, error: { code: 'auth/profile-creation-pending' } };
        }
        try { await registrationRecoveryStorage.remove(normalizedEmail, saved.uid); }
        catch { return { success: false, error: { code: 'auth/profile-recovery-storage-pending' } }; }
        pendingRegistrations.delete(normalizedEmail);
        return { success: true, user };
    } catch (error) {
        return { success: false, error };
    } finally {
        if (shouldSignOutSecondary) {
            try { await signOut(secondaryAuth); }
            catch (signOutError) { console.warn('Erro ao encerrar sessão secundária de registro:', signOutError); }
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

// [[Autenticação]]: registra o pedido sem apagar parcialmente dados financeiros.
export async function requestAccountDeletionFirebase(userId: string) {
    if (!userId || auth.currentUser?.uid !== userId) throw new Error('Entre na conta que deseja excluir.');
    const result = await httpsCallable<Record<string, never>, { status: 'pending-retention-policy' }>(firebaseFunctions, 'requestAccountDeletion')({});
    if (auth.currentUser?.uid !== userId) throw new Error('A conta mudou durante o pedido.');
    return result.data;
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

// [[Gerenciamento de Usuários]]: o serviço Spark e as Rules conferem o aceite, sem escrever perfis.
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
    try { return { success: true, data: (await loadUserRelationshipsFirebase(userId)).linked }; }
    catch (error) { return { success: false, error }; }
}

// Função para resgatar os IDs dos usuários relacionados ao usuário passado por parâmetro, voltando o objeto
// inteiro da consulta, necessário separa-los posteriormente para tratamentos mais específicos
export async function getRelatedUsersIDsFirebase(userId: string) {
    try { return { success: true, data: (await loadUserRelationshipsFirebase(userId)).linked.map(user => user.id) }; }
    catch (error) { return { success: false, error }; }
}

// ================================================================================================================= //
