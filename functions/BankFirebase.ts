// O arquivo BankFirebase.ts é responsável por gerenciar as operações relacionadas às contas bancárias
// registradas para uso no aplicativo

import { db } from '@/FirebaseConfig';
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection } from 'firebase/firestore';

// Define os parâmetros necessários para adicionar um banco
interface AddBankParams {
    bankName: string;
}


// =========================================== Funções de Registro ================================================== //

// Função para registrar um novo banco no Firestore
export async function addBankFirebase({ bankName }: AddBankParams) {
    
    try {

        // Cria um novo documento na coleção 'banks' com o nome do banco
        const bankRef = doc(collection(db, 'banks'));

        await setDoc(bankRef, {
            name: bankName,
            createdAt: new Date(),
        });

        return { success: true, bankId: bankRef.id };

    } catch (error) {
        
        console.error('Erro ao adicionar banco:', error);
        
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

// ================================================================================================================= //
