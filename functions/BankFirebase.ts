// O arquivo BankFirebase.ts é responsável por gerenciar as operações relacionadas às contas bancárias
// registradas para uso no aplicativo

import { db } from '@/FirebaseConfig';
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where, Timestamp, documentId } from 'firebase/firestore';

import { getRelatedUsersFirebase, getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';

// Define os parâmetros necessários para adicionar um banco
interface AddBankParams {
    bankName: string;
    personId: string;
    colorHex?: string | null;
}

interface UpdateBankParams {
    bankId: string;
    bankName?: string;
    colorHex?: string | null;
}


// =========================================== Funções de Registro ================================================== //

// Função para registrar um novo banco no Firestore
export async function addBankFirebase({ bankName, personId, colorHex = null }: AddBankParams) {
    
    try {

        // Cria um novo documento na coleção 'banks' com o nome do banco
        const bankRef = doc(collection(db, 'banks'));

        await setDoc(bankRef, {
            name: bankName,
            personId,
            colorHex: colorHex ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        return { success: true, bankId: bankRef.id };

    } catch (error) {
        
        console.error('Erro ao adicionar banco:', error);
        
        return { success: false, error };

    }
}

export async function updateBankFirebase({ bankId, bankName, colorHex }: UpdateBankParams) {
    
    try {

        const bankRef = doc(db, 'banks', bankId);
        const updates: Record<string, unknown> = {
            updatedAt: new Date(),
        };

        if (typeof bankName === 'string') {
            updates.name = bankName;
        }

        if (colorHex !== undefined) {
            updates.colorHex = colorHex;
        }

        await setDoc(bankRef, updates, { merge: true });

        return { success: true };

    } catch (error) {

        console.error('Erro ao atualizar banco:', error);
        return { success: false, error };

    }
}

// Função para deletar um banco registrado no Firestore
export async function deleteBankFirebase(bankId: string) {

    try {

        await deleteDoc(doc(db, 'banks', bankId));
        return { success: true };

    } catch (error) {

        console.error('Erro ao deletar banco:', error);
        return { success: false, error };

    }
}

// =========================================== Funções de Consulta ================================================== //

// Função para obter todos os bancos registrados no Firestore
export async function getAllBanksFirebase() {

    try {

        const banksSnapshot = await getDocs(collection(db, 'banks'));
        const banks = banksSnapshot.docs.map(bankDoc => ({
            id: bankDoc.id,
            ...bankDoc.data(),
        }));

        return { success: true, data: banks };

    } catch (error) {

        console.error('Erro ao obter todos os bancos:', error);
        return { success: false, error };

    }

}

// Função para obter os dados de um banco específico do Firestore
export async function getBankDataFirebase(bankId: string) {

    try {

        const bankDoc = await getDoc(doc(db, 'banks', bankId));

        if (bankDoc.exists()) {

            return { success: true, data: bankDoc.data() };

        } else {

            return { success: false, error: 'Banco não encontrado' };
        }

    } catch (error) {

        console.error('Erro ao obter dados do banco:', error);
        return { success: false, error };

    }

}

// Função para obter todos os bancos vinculados a um usuário específico
export async function getBanksByPersonFirebase(personId: string) {

    try {

        const banksQuery = query(
            collection(db, 'banks'),
            where('personId', '==', personId)
        );

        const banksSnapshot = await getDocs(banksQuery);
        const banks = banksSnapshot.docs.map(bankDoc => ({
            id: bankDoc.id,
            ...bankDoc.data(),
        }));

        return { success: true, data: banks };

    } catch (error) {

        console.error('Erro ao obter bancos por pessoa:', error);
        return { success: false, error };

    }

}

// Função para obter todos os bancos vinculados a um usuário específico com seus usuarios relacionados, passando o personId
// verifica-se quais são as pessoas relacionadas e assim volta apenas os bancos vinculados a essas pessoas
export async function getBanksWithUsersByPersonFirebase(personId: string) {

    try {

        // Primeiro, obtém os IDs dos usuários relacionados
        const relatedUsersResult = await getRelatedUsersIDsFirebase(personId);

        if (!relatedUsersResult.success) {
            throw new Error('Erro ao obter usuários relacionados.');
        }

        // Constante para separar os IDs dos usuarios relacionados em uma array
        const relatedUserIds = Array.isArray(relatedUsersResult.data) ? [...relatedUsersResult.data] : [];

        // Inclui o personId na lista de IDs para buscar seus bancos também
        relatedUserIds.push(personId);

        // Agora, busca os bancos vinculados a esses IDs
        const banksQuery = query(
            collection(db, 'banks'),
            where('personId', 'in', relatedUserIds)
        );

        const banksSnapshot = await getDocs(banksQuery);
        const banks = banksSnapshot.docs.map(bankDoc => ({
            id: bankDoc.id,
            ...bankDoc.data(),
        }));

        return { success: true, data: banks };

    } catch (error) {

        console.error('Erro ao obter bancos com usuários por pessoa:', error);

        return { success: false, error };

    }

}

// Função para obter uma lista dos gastos de um banco, por um range de datas entre o começo de
// um mês e o final dele, apenas mostrando resgatando esses valores, automaticamente ele seleciona os dados do mês atual
// da execução desse aplicativo, se por exemplo é setembro, ele busca do dia 1 de setembro até o dia 30 de setembro
export async function getCurrentMonthSummaryByBankFirebaseExpanses(personId: string) {

    try {

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Busca os bancos vinculados ao personId e aos seus usuarios relacionados
        const banksResult = await getBanksWithUsersByPersonFirebase(personId);

        if (!banksResult.success) {
            throw new Error('Erro ao obter bancos vinculados.');
        }
        // Constante para separar os IDs dos bancos em uma array
        const bankIds = Array.isArray(banksResult.data) ? banksResult.data.map((bank: any) => bank.id) : [];

        if (bankIds.length === 0) {
            return { success: true, data: [] }; // Nenhum banco vinculado encontrado
        }

        // Consulta as pessoas e os seus IDs relacionados para usar na query
        const relatedUsersResult = await getRelatedUsersIDsFirebase(personId);

        if (!relatedUsersResult.success) {
            throw new Error('Erro ao obter usuários relacionados.');
        }

        // Constante para separar os IDs dos usuarios relacionados em uma array
        const relatedUserIds = Array.isArray(relatedUsersResult.data) ? [...relatedUsersResult.data] : [];

        // Inclui o personId na lista de IDs para buscar suas despesas também
        relatedUserIds.push(personId);

        // Monta a query para buscar os registros de despesas com as listas obtidas e o range de datas
        const expensesQuery = query(
            collection(db, 'expenses'),
            where('bankId', 'in', bankIds),
            where('personId', 'in', relatedUserIds),
            where('date', '>=', Timestamp.fromDate(startOfMonth)),
            where('date', '<=', Timestamp.fromDate(endOfMonth))
        );

        const expensesSnapshot = await getDocs(expensesQuery);

        // Mapeia os resultados para um formato mais amigável
        const expenses = expensesSnapshot.docs.map(expenseDoc => ({
            id: expenseDoc.id,
            ...expenseDoc.data(),
        }));

        return { success: true, data: expenses };

    } catch (error) {

        console.error('Erro ao obter resumo mensal por banco:', error);
        return { success: false, error };

    }

}

// Função para obter uma lista dos ganhos de um banco, por um range de datas entre o começo de
// um mês e o final dele, apenas mostrando resgatando esses valores, automaticamente ele seleciona os dados do mês atual
// da execução desse aplicativo, se por exemplo é setembro, ele busca do dia 1 de setembro até o dia 30 de setembro
export async function getCurrentMonthSummaryByBankFirebaseGains(personId: string) {

    try {

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Busca os bancos vinculados ao personId e aos seus usuarios relacionados
        const banksResult = await getBanksWithUsersByPersonFirebase(personId);

        if (!banksResult.success) {
            throw new Error('Erro ao obter bancos vinculados.');
        }

        // Constante para separar os IDs dos bancos em uma array
        const bankIds = Array.isArray(banksResult.data) ? banksResult.data.map((bank: any) => bank.id) : [];

        if (bankIds.length === 0) {
            return { success: true, data: [] }; // Nenhum banco vinculado encontrado
        }

        // Consulta as pessoas e os seus IDs relacionados para usar na query
        const relatedUsersResult = await getRelatedUsersIDsFirebase(personId);

        if (!relatedUsersResult.success) {
            throw new Error('Erro ao obter usuários relacionados.');
        }

        // Constante para separar os IDs dos usuarios relacionados em uma array
        const relatedUserIds = Array.isArray(relatedUsersResult.data) ? [...relatedUsersResult.data] : [];

        // Inclui o personId na lista de IDs para buscar seus ganhos também
        relatedUserIds.push(personId);

        // Monta a query para buscar os registros de ganhos com as listas obtidas e o range de datas
        const gainsQuery = query(
            collection(db, 'gains'),
            where('bankId', 'in', bankIds),
            where('personId', 'in', relatedUserIds),
            where('date', '>=', Timestamp.fromDate(startOfMonth)),
            where('date', '<=', Timestamp.fromDate(endOfMonth))
        );

        const gainsSnapshot = await getDocs(gainsQuery);

        // Mapeia os resultados para um formato mais amigável
        const gains = gainsSnapshot.docs.map(gainDoc => ({
            id: gainDoc.id,
            ...gainDoc.data(),
        }));

        return { success: true, data: gains };

    } catch (error) {

        console.error('Erro ao obter resumo mensal por banco:', error);
        return { success: false, error };

    }

}

// ================================================================================================================= //

interface GetCurrentYearMovementsParams {
    personId: string;
}

export async function getCurrentYearMovementsFirebase({ personId }: GetCurrentYearMovementsParams) {

    try {

        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

        const banksResult = await getBanksWithUsersByPersonFirebase(personId);

        if (!banksResult.success) {
            throw new Error('Erro ao obter bancos vinculados.');
        }

        const bankIds = Array.isArray(banksResult.data) ? banksResult.data.map((bank: any) => bank.id) : [];

        if (bankIds.length === 0) {
            return { success: true, data: { expenses: [], gains: [] } };
        }

        const relatedUsersResult = await getRelatedUsersIDsFirebase(personId);

        if (!relatedUsersResult.success) {
            throw new Error('Erro ao obter usuários relacionados.');
        }

        const relatedUserIds = Array.isArray(relatedUsersResult.data) ? [...relatedUsersResult.data] : [];
        relatedUserIds.push(personId);

        const normalizedStartOfYear = new Date(startOfYear);
        normalizedStartOfYear.setHours(0, 0, 0, 0);

        const normalizedEndOfYear = new Date(endOfYear);
        normalizedEndOfYear.setHours(23, 59, 59, 999);

        const expensesQuery = query(
            collection(db, 'expenses'),
            where('bankId', 'in', bankIds),
            where('personId', 'in', relatedUserIds),
            where('date', '>=', Timestamp.fromDate(normalizedStartOfYear)),
            where('date', '<=', Timestamp.fromDate(normalizedEndOfYear))
        );

        const gainsQuery = query(
            collection(db, 'gains'),
            where('bankId', 'in', bankIds),
            where('personId', 'in', relatedUserIds),
            where('date', '>=', Timestamp.fromDate(normalizedStartOfYear)),
            where('date', '<=', Timestamp.fromDate(normalizedEndOfYear))
        );

        const [expensesSnapshot, gainsSnapshot] = await Promise.all([
            getDocs(expensesQuery),
            getDocs(gainsQuery),
        ]);

        const expenses = expensesSnapshot.docs.map(expenseDoc => ({
            id: expenseDoc.id,
            ...expenseDoc.data(),
        }));

        const gains = gainsSnapshot.docs.map(gainDoc => ({
            id: gainDoc.id,
            ...gainDoc.data(),
        }));

        return {
            success: true,
            data: {
                expenses,
                gains,
            },
        };

    } catch (error) {

        console.error('Erro ao obter resumo anual por banco:', error);
        return { success: false, error };

    }

}

// ================================================================================================================= //

interface GetBankMovementsByPeriodParams {
    personId: string;
    bankId: string;
    startDate: Date;
    endDate: Date;
}

export async function getBankMovementsByPeriodFirebase({
    personId,
    bankId,
    startDate,
    endDate,
}: GetBankMovementsByPeriodParams) {

    try {

        if (!personId || !bankId) {
            return { success: false, error: 'Usuário ou banco não informado.' };
        }

        // Confirma se o banco pertence ao usuário ou algum dos relacionados
        const banksResult = await getBanksWithUsersByPersonFirebase(personId);

        if (!banksResult.success) {
            throw new Error('Erro ao validar bancos vinculados.');
        }

        const accessibleBankIds = Array.isArray(banksResult.data) ? banksResult.data.map((bank: any) => bank.id) : [];

        if (accessibleBankIds.length === 0 || !accessibleBankIds.includes(bankId)) {
            return { success: false, error: 'Banco não autorizado para este usuário.' };
        }

        // Consulta as pessoas e os seus IDs relacionados para usar na query
        const relatedUsersResult = await getRelatedUsersIDsFirebase(personId);

        if (!relatedUsersResult.success) {
            throw new Error('Erro ao obter usuários relacionados.');
        }

        const relatedUserIds = Array.isArray(relatedUsersResult.data) ? [...relatedUsersResult.data] : [];
        relatedUserIds.push(personId);

        const normalizedStartDate = new Date(startDate);
        normalizedStartDate.setHours(0, 0, 0, 0);

        const normalizedEndDate = new Date(endDate);
        normalizedEndDate.setHours(23, 59, 59, 999);

        if (normalizedEndDate < normalizedStartDate) {
            return { success: false, error: 'O período selecionado é inválido.' };
        }

        const expensesQuery = query(
            collection(db, 'expenses'),
            where('bankId', '==', bankId),
            where('personId', 'in', relatedUserIds),
            where('date', '>=', Timestamp.fromDate(normalizedStartDate)),
            where('date', '<=', Timestamp.fromDate(normalizedEndDate))
        );

        const gainsQuery = query(
            collection(db, 'gains'),
            where('bankId', '==', bankId),
            where('personId', 'in', relatedUserIds),
            where('date', '>=', Timestamp.fromDate(normalizedStartDate)),
            where('date', '<=', Timestamp.fromDate(normalizedEndDate))
        );

        const [expensesSnapshot, gainsSnapshot] = await Promise.all([
            getDocs(expensesQuery),
            getDocs(gainsQuery),
        ]);

        const expenses = expensesSnapshot.docs.map(expenseDoc => ({
            id: expenseDoc.id,
            ...expenseDoc.data(),
        }));

        const gains = gainsSnapshot.docs.map(gainDoc => ({
            id: gainDoc.id,
            ...gainDoc.data(),
        }));

        return {
            success: true,
            data: {
                expenses,
                gains,
            },
        };

    } catch (error) {

        console.error('Erro ao obter movimentações do banco no período:', error);
        return { success: false, error };

    }

}
