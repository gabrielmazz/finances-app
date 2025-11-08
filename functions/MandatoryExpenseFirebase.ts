// Funções responsáveis por gerenciar os gastos obrigatórios registrados no aplicativo.

import { db } from '@/FirebaseConfig';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import { getCycleKeyFromDate } from '@/utils/mandatoryExpenses';

interface AddMandatoryExpenseParams {
	name: string;
	valueInCents: number;
	dueDay: number;
	tagId: string;
	personId: string;
	description?: string | null;
	reminderEnabled?: boolean;
	reminderHour?: number;
	reminderMinute?: number;
}

interface UpdateMandatoryExpenseParams {
	expenseId: string;
	name?: string;
	valueInCents?: number;
	dueDay?: number;
	tagId?: string;
	description?: string | null;
	reminderEnabled?: boolean;
	reminderHour?: number;
	reminderMinute?: number;
}

interface MarkMandatoryExpensePaymentParams {
	expenseId: string;
	paymentExpenseId: string;
	paymentDate: Date;
}

const MANDATORY_EXPENSES_COLLECTION = 'mandatoryExpenses';

export async function addMandatoryExpenseFirebase({
	name,
	valueInCents,
	dueDay,
	tagId,
	personId,
	description,
	reminderEnabled = true,
	reminderHour = 9,
	reminderMinute = 0,
}: AddMandatoryExpenseParams) {
	try {
		const mandatoryExpenseRef = doc(collection(db, MANDATORY_EXPENSES_COLLECTION));

		await setDoc(mandatoryExpenseRef, {
			name,
			valueInCents,
			dueDay,
			tagId,
			personId,
			description: description ?? null,
			reminderEnabled,
			reminderHour,
			reminderMinute,
			lastPaymentExpenseId: null,
			lastPaymentCycle: null,
			lastPaymentDate: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		return { success: true, id: mandatoryExpenseRef.id };
	} catch (error) {
		console.error('Erro ao adicionar gasto obrigatório:', error);
		return { success: false, error };
	}
}

export async function updateMandatoryExpenseFirebase({
	expenseId,
	name,
	valueInCents,
	dueDay,
	tagId,
	description,
	reminderEnabled,
	reminderHour,
	reminderMinute,
}: UpdateMandatoryExpenseParams) {
	try {
		const mandatoryExpenseRef = doc(db, MANDATORY_EXPENSES_COLLECTION, expenseId);
		const updates: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (typeof name === 'string') {
			updates.name = name;
		}

		if (typeof valueInCents === 'number') {
			updates.valueInCents = valueInCents;
		}

		if (typeof dueDay === 'number') {
			updates.dueDay = dueDay;
		}

		if (typeof tagId === 'string') {
			updates.tagId = tagId;
		}

		if (description !== undefined) {
			updates.description = description ?? null;
		}

		if (typeof reminderEnabled === 'boolean') {
			updates.reminderEnabled = reminderEnabled;
		}

		if (typeof reminderHour === 'number') {
			updates.reminderHour = reminderHour;
		}

		if (typeof reminderMinute === 'number') {
			updates.reminderMinute = reminderMinute;
		}

		await setDoc(mandatoryExpenseRef, updates, { merge: true });

		return { success: true };
	} catch (error) {
		console.error('Erro ao atualizar gasto obrigatório:', error);
		return { success: false, error };
	}
}

export async function deleteMandatoryExpenseFirebase(expenseId: string) {
	try {
		await deleteDoc(doc(db, MANDATORY_EXPENSES_COLLECTION, expenseId));
		return { success: true };
	} catch (error) {
		console.error('Erro ao deletar gasto obrigatório:', error);
		return { success: false, error };
	}
}

export async function getMandatoryExpenseFirebase(expenseId: string) {
	try {
		const mandatoryExpenseDoc = await getDoc(doc(db, MANDATORY_EXPENSES_COLLECTION, expenseId));

		if (mandatoryExpenseDoc.exists()) {
			return { success: true, data: { id: mandatoryExpenseDoc.id, ...mandatoryExpenseDoc.data() } };
		}

		return { success: false, error: 'Gasto obrigatório não encontrado' };
	} catch (error) {
		console.error('Erro ao obter gasto obrigatório:', error);
		return { success: false, error };
	}
}

export async function getMandatoryExpensesWithRelationsFirebase(personId: string) {
	try {
		const relatedUsersResult = await getRelatedUsersIDsFirebase(personId);

		const relatedIds =
			relatedUsersResult.success && Array.isArray(relatedUsersResult.data) ? [...relatedUsersResult.data] : [];

		const idsSet = new Set<string>([personId, ...relatedIds.filter(id => typeof id === 'string' && id.length > 0)]);

		const ids = Array.from(idsSet);

		let expensesQuery;

		if (ids.length === 1) {
			expensesQuery = query(collection(db, MANDATORY_EXPENSES_COLLECTION), where('personId', '==', ids[0]));
		} else {
			expensesQuery = query(collection(db, MANDATORY_EXPENSES_COLLECTION), where('personId', 'in', ids));
		}

		const snapshot = await getDocs(expensesQuery);
		const toComparableName = (entry: Record<string, unknown>) => {
			const value = entry['name'];
			return typeof value === 'string' ? value.toLocaleLowerCase() : '';
		};
		const expenses = snapshot.docs
			.map(expenseDoc => ({
				id: expenseDoc.id,
				...expenseDoc.data(),
			}))
			.sort((a, b) => toComparableName(a as Record<string, unknown>).localeCompare(toComparableName(b as Record<string, unknown>)));

		return { success: true, data: expenses };
	} catch (error) {
		console.error('Erro ao obter gastos obrigatórios:', error);
		return { success: false, error };
	}
}

export async function markMandatoryExpensePaymentFirebase({
	expenseId,
	paymentExpenseId,
	paymentDate,
}: MarkMandatoryExpensePaymentParams) {
	try {
		const mandatoryExpenseRef = doc(db, MANDATORY_EXPENSES_COLLECTION, expenseId);
		await setDoc(
			mandatoryExpenseRef,
			{
				lastPaymentExpenseId: paymentExpenseId,
				lastPaymentDate: paymentDate,
				lastPaymentCycle: getCycleKeyFromDate(paymentDate),
				updatedAt: new Date(),
			},
			{ merge: true },
		);

		return { success: true };
	} catch (error) {
		console.error('Erro ao marcar pagamento do gasto obrigatório:', error);
		return { success: false, error };
	}
}

export async function clearMandatoryExpensePaymentFirebase(expenseId: string) {
	try {
		const mandatoryExpenseRef = doc(db, MANDATORY_EXPENSES_COLLECTION, expenseId);
		await setDoc(
			mandatoryExpenseRef,
			{
				lastPaymentExpenseId: null,
				lastPaymentDate: null,
				lastPaymentCycle: null,
				updatedAt: new Date(),
			},
			{ merge: true },
		);

		return { success: true };
	} catch (error) {
		console.error('Erro ao remover registro de pagamento do gasto obrigatório:', error);
		return { success: false, error };
	}
}
