// O arquivo ExpenseFirebase.ts é responsável por gerenciar as operações relacionadas
// às despesas registradas no aplicativo.

import { db } from '@/FirebaseConfig';
import { collection, deleteDoc, doc, getDoc, getDocs, limit as limitQuery, orderBy, query, setDoc, where } from 'firebase/firestore';
import { getRelatedUsersIDsFirebase } from './RegisterUserFirebase';

interface AddExpenseParams {
	name: string;
	valueInCents: number;
	tagId: string;
	bankId: string | null;
	date: Date;
	personId: string;
	explanation?: string | null;
	moneyFormat?: boolean;
	isInvestmentDeposit?: boolean;
	investmentId?: string | null;
	investmentNameSnapshot?: string | null;
}

interface UpdateExpenseParams {
	expenseId: string;
	name?: string;
	valueInCents?: number;
	tagId?: string;
	bankId?: string | null;
	date?: Date;
	explanation?: string | null;
	moneyFormat?: boolean;
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
	moneyFormat,
	isInvestmentDeposit,
	investmentId,
	investmentNameSnapshot,
}: AddExpenseParams) {
	try {
		const expenseRef = doc(collection(db, 'expenses'));

		await setDoc(expenseRef, {
			name,
			valueInCents,
			tagId,
			bankId: typeof bankId === 'string' ? bankId : null,
			date,
			personId,
			explanation: explanation ?? null,
			moneyFormat: typeof moneyFormat === 'boolean' ? moneyFormat : false,
			isInvestmentDeposit: Boolean(isInvestmentDeposit),
			investmentId: investmentId ?? null,
			investmentNameSnapshot: investmentNameSnapshot ?? null,
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
	moneyFormat,
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

		if (bankId !== undefined) {
			updates.bankId = bankId;
		}

		if (date instanceof Date) {
			updates.date = date;
		}

		if (explanation !== undefined) {
			updates.explanation = explanation ?? null;
		}

		if (typeof moneyFormat === 'boolean') {
			updates.moneyFormat = moneyFormat;
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

// Função para obter um limite de despesas registradas no Firestore, ordenadas por data de criação (mais recentes primeiro),
// mas com a diferença que irá juntar as despesas com os dados das pessoas relacionadas.
export async function getLimitedExpensesWithPeopleFirebase({ limit, personId }: GetLimitedExpensesParams) {
	
	try {
		
		// Primeiro, obterm os IDs dos usuários relacionados às despesas
		const relatedUserResult = await getRelatedUsersIDsFirebase(personId);

		if (!relatedUserResult.success) {
			throw new Error('Erro ao obter IDs de usuários relacionados');
		}

		// Constante para separar os IDs dos usuarios relacionados em uma array
		const relatedUserIds = Array.isArray(relatedUserResult.data) ? [...relatedUserResult.data] : [];

		// Inclui o personId na lista de IDs para buscar suas despesas também
		relatedUserIds.push(personId);

		// Busca as despesas do usuário e dos seus relacionado, semelhante à função getLimitedExpensesFirebase
		const expensesCollection = collection(db, 'expenses');

		const expensesQuery = query(
			expensesCollection,
			where('personId', 'in', relatedUserIds),
			orderBy('createdAt', 'desc'),
			limitQuery(limit)
		);

		const expensesSnapshot = await getDocs(expensesQuery);

		const expenses = expensesSnapshot.docs.map(expenseDoc => ({
			id: expenseDoc.id,
			...expenseDoc.data(),
		}));

		// Agora, junta as despesas com os dados das pessoas relacionadas
		const expensesWithPeople = await Promise.all(
			expenses.map(async expense => {
				const personDoc = await getDoc(doc(db, 'users', expense.personId));
				const personData = personDoc.exists() ? personDoc.data() : null;

				return {
					...expense,
					person: personData
						? {
								id: expense.personId,
								name: personData.name,
								email: personData.email,
								avatarUrl: personData.avatarUrl || null,
						  }
						: null,
				};
			})
		);

		return { success: true, data: expensesWithPeople };

		// return { success: true, data: expensesWithPeople };
	} catch (error) {
		console.error('Erro ao obter despesas com pessoas relacionadas:', error);
		return { success: false, error };
	}

}

// ================================================================================================================= //
