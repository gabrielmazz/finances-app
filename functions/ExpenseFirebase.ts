// O arquivo ExpenseFirebase.ts é responsável por gerenciar as operações relacionadas
// às despesas registradas no aplicativo.

import { db } from '@/FirebaseConfig';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

interface AddExpenseParams {
	name: string;
	valueInCents: number;
	tagId: string;
	bankId: string;
	date: Date;
	personId: string;
	explanation?: string | null;
}

// =========================================== Funções de Registro ================================================== //

// Função para registrar uma nova despesa no Firestore
export async function addExpenseFirebase({
	name,
	valueInCents,
	tagId,
	bankId,
	date,
	personId,
	explanation,
}: AddExpenseParams) {
	try {
		const expenseRef = doc(collection(db, 'expenses'));

		await setDoc(expenseRef, {
			name,
			valueInCents,
			tagId,
			bankId,
			date,
			personId,
			explanation: explanation ?? null,
			createdAt: new Date(),
		});

		return { success: true, expenseId: expenseRef.id };
	} catch (error) {
		console.error('Erro ao adicionar despesa:', error);
		return { success: false, error };
	}
}

// Função para deletar uma despesa registrada no Firestore
export async function deleteExpenseFirebase(expenseId: string) {
	try {
		await deleteDoc(doc(db, 'expenses', expenseId));
		return { success: true };
	} catch (error) {
		console.error('Erro ao deletar despesa:', error);
		return { success: false, error };
	}
}

// =========================================== Funções de Consulta ================================================== //

// Função para obter todas as despesas registradas no Firestore
export async function getAllExpensesFirebase() {
	try {
		const expensesSnapshot = await getDocs(collection(db, 'expenses'));
		const expenses = expensesSnapshot.docs.map(expenseDoc => ({
			id: expenseDoc.id,
			...expenseDoc.data(),
		}));

		return { success: true, data: expenses };
	} catch (error) {
		console.error('Erro ao obter todas as despesas:', error);
		return { success: false, error };
	}
}

// Função para obter os dados de uma despesa específica do Firestore
export async function getExpenseDataFirebase(expenseId: string) {
	try {
		const expenseDoc = await getDoc(doc(db, 'expenses', expenseId));

		if (expenseDoc.exists()) {
			return { success: true, data: expenseDoc.data() };
		}

		return { success: false, error: 'Despesa não encontrada' };
	} catch (error) {
		console.error('Erro ao obter dados da despesa:', error);
		return { success: false, error };
	}
}

// ================================================================================================================= //
