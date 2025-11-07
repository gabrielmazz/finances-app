// O arquivo ExpenseFirebase.ts é responsável por gerenciar as operações relacionadas
// às despesas registradas no aplicativo.

import { db } from '@/FirebaseConfig';
import { collection, deleteDoc, doc, getDoc, getDocs, limit as limitQuery, orderBy, query, setDoc, where } from 'firebase/firestore';

interface AddExpenseParams {
	name: string;
	valueInCents: number;
	tagId: string;
	bankId: string;
	date: Date;
	personId: string;
	explanation?: string | null;
}

interface UpdateExpenseParams {
	expenseId: string;
	name?: string;
	valueInCents?: number;
	tagId?: string;
	bankId?: string;
	date?: Date;
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
			updatedAt: new Date(),
		});

		return { success: true, expenseId: expenseRef.id };
	} catch (error) {
		console.error('Erro ao adicionar despesa:', error);
		return { success: false, error };
	}
}

export async function updateExpenseFirebase({
	expenseId,
	name,
	valueInCents,
	tagId,
	bankId,
	date,
	explanation,
}: UpdateExpenseParams) {
	try {
		const expenseRef = doc(db, 'expenses', expenseId);
		const updates: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (typeof name === 'string') {
			updates.name = name;
		}

		if (typeof valueInCents === 'number') {
			updates.valueInCents = valueInCents;
		}

		if (typeof tagId === 'string') {
			updates.tagId = tagId;
		}

		if (typeof bankId === 'string') {
			updates.bankId = bankId;
		}

		if (date instanceof Date) {
			updates.date = date;
		}

		if (explanation !== undefined) {
			updates.explanation = explanation ?? null;
		}

		await setDoc(expenseRef, updates, { merge: true });

		return { success: true };
	} catch (error) {
		console.error('Erro ao atualizar despesa:', error);
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

interface GetLimitedExpensesParams {
	limit: number;
	personId?: string;
}

// Função para obter um limite de despesas registradas no Firestore, ordenadas por data de criação (mais recentes primeiro)
export async function getLimitedExpensesFirebase({ limit, personId }: GetLimitedExpensesParams) {
	try {
		const expensesCollection = collection(db, 'expenses');

		const expensesQuery = personId
			? query(expensesCollection, where('personId', '==', personId), orderBy('createdAt', 'desc'), limitQuery(limit))
			: query(expensesCollection, orderBy('createdAt', 'desc'), limitQuery(limit));

		const expensesSnapshot = await getDocs(expensesQuery);

		const expenses = expensesSnapshot.docs.map(expenseDoc => ({
			id: expenseDoc.id,
			...expenseDoc.data(),
		}));

		return { success: true, data: expenses };
	} catch (error) {
		console.error('Erro ao obter despesas limitadas:', error);
		return { success: false, error };
	}
}

// ================================================================================================================= //
