// Funções responsáveis por gerenciar os gastos obrigatórios registrados no aplicativo.

import { db } from '@/FirebaseConfig';
import { collection, deleteDoc, doc, documentId, getDoc, getDocs, query, runTransaction, setDoc, where } from 'firebase/firestore';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import { getCycleKeyFromDate } from '@/utils/mandatoryExpenses';
import {
	normalizeMandatoryInstallmentTotal,
	normalizeMandatoryInstallmentsCompleted,
} from '@/utils/mandatoryInstallments';

interface AddMandatoryExpenseParams {
	name: string;
	valueInCents: number;
	dueDay: number;
	usesBusinessDays?: boolean;
	tagId: string;
	personId: string;
	description?: string | null;
	reminderEnabled?: boolean;
	reminderHour?: number;
	reminderMinute?: number;
	installmentTotal?: number | null;
}

interface UpdateMandatoryExpenseParams {
	expenseId: string;
	name?: string;
	valueInCents?: number;
	dueDay?: number;
	usesBusinessDays?: boolean;
	tagId?: string;
	description?: string | null;
	reminderEnabled?: boolean;
	reminderHour?: number;
	reminderMinute?: number;
	installmentTotal?: number | null;
	installmentsCompleted?: number;
}

interface MarkMandatoryExpensePaymentParams {
	expenseId: string;
	paymentExpenseId: string;
	paymentDate: Date;
}

const MANDATORY_EXPENSES_COLLECTION = 'mandatoryExpenses';
const LINKED_MOVEMENTS_QUERY_LIMIT = 10;

const buildMandatoryInstallmentFields = (installmentTotal: number | null | undefined, installmentsCompleted = 0) => {
	const normalizedInstallmentTotal = normalizeMandatoryInstallmentTotal(installmentTotal);

	return {
		installmentTotal: normalizedInstallmentTotal,
		installmentsCompleted:
			normalizedInstallmentTotal === null
				? 0
				: normalizeMandatoryInstallmentsCompleted(installmentsCompleted, normalizedInstallmentTotal),
	};
};

const chunkDocumentIds = (ids: string[]) =>
	Array.from({ length: Math.ceil(ids.length / LINKED_MOVEMENTS_QUERY_LIMIT) }, (_, index) =>
		ids.slice(index * LINKED_MOVEMENTS_QUERY_LIMIT, (index + 1) * LINKED_MOVEMENTS_QUERY_LIMIT),
	);

export async function addMandatoryExpenseFirebase({
	name,
	valueInCents,
	dueDay,
	usesBusinessDays = false,
	tagId,
	personId,
	description,
	reminderEnabled = true,
	reminderHour = 9,
	reminderMinute = 0,
	installmentTotal = null,
}: AddMandatoryExpenseParams) {
	try {
		const mandatoryExpenseRef = doc(collection(db, MANDATORY_EXPENSES_COLLECTION));
		const installmentFields = buildMandatoryInstallmentFields(installmentTotal);

		await setDoc(mandatoryExpenseRef, {
			name,
			valueInCents,
			dueDay,
			usesBusinessDays,
			tagId,
			personId,
			description: description ?? null,
			reminderEnabled,
			reminderHour,
			reminderMinute,
			...installmentFields,
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
	usesBusinessDays,
	tagId,
	description,
	reminderEnabled,
	reminderHour,
	reminderMinute,
	installmentTotal,
	installmentsCompleted,
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

		if (typeof usesBusinessDays === 'boolean') {
			updates.usesBusinessDays = usesBusinessDays;
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

		if (installmentTotal !== undefined) {
			const normalizedInstallmentTotal = normalizeMandatoryInstallmentTotal(installmentTotal);
			updates.installmentTotal = normalizedInstallmentTotal;
			if (normalizedInstallmentTotal === null) {
				updates.installmentsCompleted = 0;
			} else if (typeof installmentsCompleted === 'number') {
				updates.installmentsCompleted = normalizeMandatoryInstallmentsCompleted(
					installmentsCompleted,
					normalizedInstallmentTotal,
				);
			}
		} else if (typeof installmentsCompleted === 'number') {
			updates.installmentsCompleted = Math.max(0, Math.floor(installmentsCompleted));
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
		const baseExpenses: Array<Record<string, unknown> & { id: string }> = snapshot.docs
			.map(expenseDoc => ({
				id: expenseDoc.id,
				...(expenseDoc.data() as Record<string, unknown>),
			}))
			.sort((a, b) => toComparableName(a as Record<string, unknown>).localeCompare(toComparableName(b as Record<string, unknown>)));

		const linkedPaymentIds = Array.from(
			new Set(
				baseExpenses
					.map(expense => (typeof expense.lastPaymentExpenseId === 'string' ? expense.lastPaymentExpenseId : null))
					.filter((expenseId): expenseId is string => Boolean(expenseId)),
			),
		);
		const linkedPaymentValuesById = new Map<string, number>();

		if (linkedPaymentIds.length > 0) {
			const linkedPaymentSnapshots = await Promise.all(
				chunkDocumentIds(linkedPaymentIds).map(paymentIds =>
					getDocs(query(collection(db, 'expenses'), where(documentId(), 'in', paymentIds))),
				),
			);

			linkedPaymentSnapshots.forEach(linkedPaymentSnapshot => {
				linkedPaymentSnapshot.docs.forEach(paymentDoc => {
					const paymentData = paymentDoc.data();
					if (typeof paymentData.valueInCents === 'number' && !Number.isNaN(paymentData.valueInCents)) {
						linkedPaymentValuesById.set(paymentDoc.id, paymentData.valueInCents);
					}
				});
			});
		}

		const expenses = baseExpenses.map(expense => {
			const linkedPaymentExpenseId =
				typeof expense.lastPaymentExpenseId === 'string' && expense.lastPaymentExpenseId.length > 0
					? expense.lastPaymentExpenseId
					: null;

			return {
				...expense,
				lastPaymentValueInCents:
					linkedPaymentExpenseId !== null ? linkedPaymentValuesById.get(linkedPaymentExpenseId) ?? null : null,
			};
		});

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
		const paymentCycle = getCycleKeyFromDate(paymentDate);

		await runTransaction(db, async transaction => {
			const expenseSnapshot = await transaction.get(mandatoryExpenseRef);
			const data = expenseSnapshot.exists() ? expenseSnapshot.data() : {};
			const installmentTotal = normalizeMandatoryInstallmentTotal(data.installmentTotal);
			const installmentsCompleted = normalizeMandatoryInstallmentsCompleted(
				data.installmentsCompleted,
				installmentTotal,
			);
			const lastPaymentCycle = typeof data.lastPaymentCycle === 'string' ? data.lastPaymentCycle : null;
			const shouldAdvanceInstallment = installmentTotal !== null && lastPaymentCycle !== paymentCycle;
			const nextInstallmentsCompleted = shouldAdvanceInstallment
				? Math.min(installmentsCompleted + 1, installmentTotal)
				: installmentsCompleted;

			transaction.set(
				mandatoryExpenseRef,
				{
					lastPaymentExpenseId: paymentExpenseId,
					lastPaymentDate: paymentDate,
					lastPaymentCycle: paymentCycle,
					...(installmentTotal !== null ? { installmentsCompleted: nextInstallmentsCompleted } : {}),
					updatedAt: new Date(),
				},
				{ merge: true },
			);
		});

		return { success: true };
	} catch (error) {
		console.error('Erro ao marcar pagamento do gasto obrigatório:', error);
		return { success: false, error };
	}
}

export async function clearMandatoryExpensePaymentFirebase(expenseId: string) {
	try {
		const mandatoryExpenseRef = doc(db, MANDATORY_EXPENSES_COLLECTION, expenseId);
		await runTransaction(db, async transaction => {
			const expenseSnapshot = await transaction.get(mandatoryExpenseRef);
			const data = expenseSnapshot.exists() ? expenseSnapshot.data() : {};
			const installmentTotal = normalizeMandatoryInstallmentTotal(data.installmentTotal);
			const installmentsCompleted = normalizeMandatoryInstallmentsCompleted(
				data.installmentsCompleted,
				installmentTotal,
			);
			const hasLinkedPayment =
				typeof data.lastPaymentExpenseId === 'string' && data.lastPaymentExpenseId.length > 0;
			const nextInstallmentsCompleted =
				installmentTotal !== null && hasLinkedPayment ? Math.max(0, installmentsCompleted - 1) : installmentsCompleted;

			transaction.set(
				mandatoryExpenseRef,
				{
					lastPaymentExpenseId: null,
					lastPaymentDate: null,
					lastPaymentCycle: null,
					...(installmentTotal !== null ? { installmentsCompleted: nextInstallmentsCompleted } : {}),
					updatedAt: new Date(),
				},
				{ merge: true },
			);
		});

		return { success: true };
	} catch (error) {
		console.error('Erro ao remover registro de pagamento do gasto obrigatório:', error);
		return { success: false, error };
	}
}
