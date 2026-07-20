// Funções responsáveis por gerenciar os gastos obrigatórios registrados no aplicativo.

import { db } from '@/FirebaseConfig';
import { collection, deleteDoc, doc, documentId, getDoc, getDocs, query, runTransaction, setDoc, where } from 'firebase/firestore';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import { getCycleKeyFromDate } from '@/utils/mandatoryExpenses';
import {
	isMandatoryInstallmentPlanComplete,
	normalizeMandatoryInstallmentDate,
	normalizeMandatoryInstallmentTotal,
	normalizeMandatoryInstallmentsCompleted,
	resolveMandatoryInstallmentsCompleted,
} from '@/utils/mandatoryInstallments';
import {
	MANDATORY_REMINDER_CONFIG_VERSION,
	normalizeMandatoryReminderDaysBefore,
} from '@/utils/mandatoryReminderConfig';

interface AddMandatoryExpenseParams {
	name: string;
	valueInCents: number;
	dueDay: number;
	usesBusinessDays?: boolean;
	tagId: string;
	personId: string;
	description?: string | null;
	reminderEnabled?: boolean;
	reminderConfigVersion?: number;
	reminderDaysBefore?: 1 | 2 | 3;
	reminderOnDueDate?: boolean;
	reminderHour?: number;
	reminderMinute?: number;
	installmentTotal?: number | null;
	installmentsCompleted?: number;
	installmentStartDate?: Date | null;
	installmentEndDate?: Date | null;
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
	reminderConfigVersion?: number;
	reminderDaysBefore?: 1 | 2 | 3;
	reminderOnDueDate?: boolean;
	reminderHour?: number;
	reminderMinute?: number;
	installmentTotal?: number | null;
	installmentsCompleted?: number;
	installmentStartDate?: Date | null;
	installmentEndDate?: Date | null;
}

interface MarkMandatoryExpensePaymentParams {
	expenseId: string;
	paymentExpenseId: string;
	paymentDate: Date;
}

interface RegisterMandatoryExpensePaymentParams {
	mandatoryExpenseId: string;
	name: string;
	valueInCents: number;
	tagId?: string | null;
	bankId: string | null;
	date: Date;
	personId: string;
	explanation?: string | null;
	moneyFormat?: boolean;
	isInvestmentDeposit?: boolean;
	investmentId?: string | null;
	investmentNameSnapshot?: string | null;
	isBankTransfer?: boolean;
	bankTransferPairId?: string | null;
	bankTransferDirection?: 'outgoing' | 'incoming';
	bankTransferSourceBankId?: string | null;
	bankTransferTargetBankId?: string | null;
	bankTransferSourceBankNameSnapshot?: string | null;
	bankTransferTargetBankNameSnapshot?: string | null;
	bankTransferExpenseId?: string | null;
	bankTransferGainId?: string | null;
}

type MandatoryExpensePaymentFailureReason =
	| 'mandatory_expense_not_found'
	| 'payment_expense_not_found'
	| 'already_paid_for_cycle'
	| 'installment_plan_complete'
	| 'invalid_payment_data'
	| 'transaction_failed';

type MandatoryExpensePaymentResult =
	| { success: true; expenseId: string }
	| { success: false; reason: MandatoryExpensePaymentFailureReason };

const MANDATORY_EXPENSES_COLLECTION = 'mandatoryExpenses';
const LINKED_MOVEMENTS_QUERY_LIMIT = 10;

const buildMandatoryInstallmentFields = (
	installmentTotal: number | null | undefined,
	installmentsCompleted = 0,
	installmentStartDate?: Date | null,
	installmentEndDate?: Date | null,
) => {
	const normalizedInstallmentTotal = normalizeMandatoryInstallmentTotal(installmentTotal);

	return {
		installmentTotal: normalizedInstallmentTotal,
		installmentsCompleted:
			normalizedInstallmentTotal === null
				? 0
				: normalizeMandatoryInstallmentsCompleted(installmentsCompleted, normalizedInstallmentTotal),
		installmentStartDate:
			normalizedInstallmentTotal === null ? null : normalizeMandatoryInstallmentDate(installmentStartDate),
		installmentEndDate:
			normalizedInstallmentTotal === null ? null : normalizeMandatoryInstallmentDate(installmentEndDate),
	};
};

const chunkDocumentIds = (ids: string[]) =>
	Array.from({ length: Math.ceil(ids.length / LINKED_MOVEMENTS_QUERY_LIMIT) }, (_, index) =>
		ids.slice(index * LINKED_MOVEMENTS_QUERY_LIMIT, (index + 1) * LINKED_MOVEMENTS_QUERY_LIMIT),
	);

const getMandatoryExpenseInstallmentPaymentState = (data: Record<string, unknown>, paymentDate: Date) => {
	const installmentTotal = normalizeMandatoryInstallmentTotal(data.installmentTotal);
	const installmentsCompleted = resolveMandatoryInstallmentsCompleted({
		storedCompleted: data.installmentsCompleted,
		installmentTotal,
		startDate: normalizeMandatoryInstallmentDate(data.installmentStartDate),
		isCurrentCycleCompleted: false,
		referenceDate: paymentDate,
	});

	return {
		installmentTotal,
		installmentsCompleted,
		isInstallmentPlanComplete: isMandatoryInstallmentPlanComplete(installmentTotal, installmentsCompleted),
	};
};

const isValidMandatoryExpensePaymentInput = (params: RegisterMandatoryExpensePaymentParams | null | undefined) => {
	if (!params) {
		return false;
	}

	const { mandatoryExpenseId, name, valueInCents, date, personId } = params;

	return (
		typeof mandatoryExpenseId === 'string' &&
		mandatoryExpenseId.trim().length > 0 &&
		typeof name === 'string' &&
		name.trim().length > 0 &&
		typeof valueInCents === 'number' &&
		Number.isSafeInteger(valueInCents) &&
		valueInCents > 0 &&
		date instanceof Date &&
		!Number.isNaN(date.getTime()) &&
		typeof personId === 'string' &&
		personId.trim().length > 0
	);
};

export async function addMandatoryExpenseFirebase({
	name,
	valueInCents,
	dueDay,
	usesBusinessDays = false,
	tagId,
	personId,
	description,
	reminderEnabled = false,
	reminderConfigVersion = MANDATORY_REMINDER_CONFIG_VERSION,
	reminderDaysBefore = 1,
	reminderOnDueDate = false,
	reminderHour = 9,
	reminderMinute = 0,
	installmentTotal = null,
	installmentsCompleted = 0,
	installmentStartDate = null,
	installmentEndDate = null,
}: AddMandatoryExpenseParams) {
	try {
		const mandatoryExpenseRef = doc(collection(db, MANDATORY_EXPENSES_COLLECTION));
		const installmentFields = buildMandatoryInstallmentFields(
			installmentTotal,
			installmentsCompleted,
			installmentStartDate,
			installmentEndDate,
		);

		await setDoc(mandatoryExpenseRef, {
			name,
			valueInCents,
			dueDay,
			usesBusinessDays,
			tagId,
			personId,
			description: description ?? null,
			reminderEnabled,
			reminderConfigVersion:
				reminderConfigVersion === MANDATORY_REMINDER_CONFIG_VERSION
					? reminderConfigVersion
					: MANDATORY_REMINDER_CONFIG_VERSION,
			reminderDaysBefore: normalizeMandatoryReminderDaysBefore(reminderDaysBefore),
			reminderOnDueDate,
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
	reminderConfigVersion,
	reminderDaysBefore,
	reminderOnDueDate,
	reminderHour,
	reminderMinute,
	installmentTotal,
	installmentsCompleted,
	installmentStartDate,
	installmentEndDate,
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

		if (reminderConfigVersion !== undefined) {
			updates.reminderConfigVersion = MANDATORY_REMINDER_CONFIG_VERSION;
		}

		if (reminderDaysBefore !== undefined) {
			updates.reminderDaysBefore = normalizeMandatoryReminderDaysBefore(reminderDaysBefore);
		}

		if (typeof reminderOnDueDate === 'boolean') {
			updates.reminderOnDueDate = reminderOnDueDate;
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
				updates.installmentStartDate = null;
				updates.installmentEndDate = null;
			} else if (typeof installmentsCompleted === 'number') {
				updates.installmentsCompleted = normalizeMandatoryInstallmentsCompleted(
					installmentsCompleted,
					normalizedInstallmentTotal,
				);
			}
		} else if (typeof installmentsCompleted === 'number') {
			updates.installmentsCompleted = Math.max(0, Math.floor(installmentsCompleted));
		}

		if (installmentStartDate !== undefined) {
			updates.installmentStartDate = normalizeMandatoryInstallmentDate(installmentStartDate);
		}

		if (installmentEndDate !== undefined) {
			updates.installmentEndDate = normalizeMandatoryInstallmentDate(installmentEndDate);
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
		const linkedPaymentDocumentIds = new Set<string>();

		if (linkedPaymentIds.length > 0) {
			const linkedPaymentSnapshots = await Promise.all(
				chunkDocumentIds(linkedPaymentIds).map(paymentIds =>
					getDocs(query(collection(db, 'expenses'), where(documentId(), 'in', paymentIds))),
				),
			);

			linkedPaymentSnapshots.forEach(linkedPaymentSnapshot => {
				linkedPaymentSnapshot.docs.forEach(paymentDoc => {
					linkedPaymentDocumentIds.add(paymentDoc.id);
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
			const hasLinkedPaymentExpense =
				linkedPaymentExpenseId !== null && linkedPaymentDocumentIds.has(linkedPaymentExpenseId);

			return {
				...expense,
				hasLinkedPaymentExpense,
				lastPaymentExpenseId: hasLinkedPaymentExpense ? linkedPaymentExpenseId : null,
				lastPaymentCycle: hasLinkedPaymentExpense ? expense.lastPaymentCycle ?? null : null,
				lastPaymentDate: hasLinkedPaymentExpense ? expense.lastPaymentDate ?? null : null,
				lastPaymentValueInCents:
					hasLinkedPaymentExpense && linkedPaymentExpenseId !== null
						? linkedPaymentValuesById.get(linkedPaymentExpenseId) ?? null
						: null,
			};
		});

		return { success: true, data: expenses };
	} catch (error) {
		console.error('Erro ao obter gastos obrigatórios:', error);
		return { success: false, error };
	}
}

// O pagamento obrigatório precisa criar a despesa real e concluir o ciclo como uma única unidade.
// Isso evita duplicidade quando dois submits concorrem pelo mesmo ciclo de [[Despesas Fixas]].
export async function registerMandatoryExpensePaymentFirebase(
	params: RegisterMandatoryExpensePaymentParams,
): Promise<MandatoryExpensePaymentResult> {
	if (!isValidMandatoryExpensePaymentInput(params)) {
		return { success: false, reason: 'invalid_payment_data' };
	}

	const {
		mandatoryExpenseId,
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
		isBankTransfer,
		bankTransferPairId,
		bankTransferDirection,
		bankTransferSourceBankId,
		bankTransferTargetBankId,
		bankTransferSourceBankNameSnapshot,
		bankTransferTargetBankNameSnapshot,
		bankTransferExpenseId,
		bankTransferGainId,
	} = params;
	const mandatoryExpenseRef = doc(db, MANDATORY_EXPENSES_COLLECTION, mandatoryExpenseId);
	const paymentExpenseRef = doc(collection(db, 'expenses'));
	const paymentCycle = getCycleKeyFromDate(date);

	try {
		return await runTransaction<MandatoryExpensePaymentResult>(db, async transaction => {
			const mandatoryExpenseSnapshot = await transaction.get(mandatoryExpenseRef);

			if (!mandatoryExpenseSnapshot.exists()) {
				return { success: false, reason: 'mandatory_expense_not_found' };
			}

			const mandatoryExpenseData = mandatoryExpenseSnapshot.data() as Record<string, unknown>;
			const lastPaymentCycle =
				typeof mandatoryExpenseData.lastPaymentCycle === 'string'
					? mandatoryExpenseData.lastPaymentCycle
					: null;

			if (lastPaymentCycle === paymentCycle) {
				const linkedPaymentExpenseId =
					typeof mandatoryExpenseData.lastPaymentExpenseId === 'string'
						? mandatoryExpenseData.lastPaymentExpenseId
						: null;

				if (linkedPaymentExpenseId) {
					const linkedPaymentSnapshot = await transaction.get(doc(db, 'expenses', linkedPaymentExpenseId));
					if (linkedPaymentSnapshot.exists()) {
						return { success: false, reason: 'already_paid_for_cycle' };
					}
				}
			}

			const installmentState = getMandatoryExpenseInstallmentPaymentState(mandatoryExpenseData, date);
			if (installmentState.isInstallmentPlanComplete) {
				return { success: false, reason: 'installment_plan_complete' };
			}

			const createdAt = new Date();
			const nextInstallmentsCompleted =
				installmentState.installmentTotal === null
					? null
					: Math.min(installmentState.installmentsCompleted + 1, installmentState.installmentTotal);

			// Mantém exatamente o documento padrão de addExpenseFirebase para que a despesa
			// continue participando de saldo, timeline e totais como uma despesa normal.
			transaction.set(paymentExpenseRef, {
				name,
				valueInCents,
				tagId: typeof tagId === 'string' ? tagId : null,
				bankId: typeof bankId === 'string' ? bankId : null,
				date,
				personId,
				explanation: explanation ?? null,
				moneyFormat: typeof moneyFormat === 'boolean' ? moneyFormat : false,
				isInvestmentDeposit: Boolean(isInvestmentDeposit),
				investmentId: investmentId ?? null,
				investmentNameSnapshot: investmentNameSnapshot ?? null,
				isBankTransfer: Boolean(isBankTransfer),
				bankTransferPairId: bankTransferPairId ?? null,
				bankTransferDirection: bankTransferDirection ?? null,
				bankTransferSourceBankId: bankTransferSourceBankId ?? null,
				bankTransferTargetBankId: bankTransferTargetBankId ?? null,
				bankTransferSourceBankNameSnapshot: bankTransferSourceBankNameSnapshot ?? null,
				bankTransferTargetBankNameSnapshot: bankTransferTargetBankNameSnapshot ?? null,
				bankTransferExpenseId: bankTransferExpenseId ?? null,
				bankTransferGainId: bankTransferGainId ?? null,
				createdAt,
				updatedAt: createdAt,
			});

			transaction.update(mandatoryExpenseRef, {
				lastPaymentExpenseId: paymentExpenseRef.id,
				lastPaymentDate: date,
				lastPaymentCycle: paymentCycle,
				...(nextInstallmentsCompleted !== null ? { installmentsCompleted: nextInstallmentsCompleted } : {}),
				updatedAt: createdAt,
			});

			return { success: true, expenseId: paymentExpenseRef.id };
		});
	} catch (error) {
		console.error('Erro ao registrar pagamento do gasto obrigatório:', error);
		return { success: false, reason: 'transaction_failed' };
	}
}

export async function markMandatoryExpensePaymentFirebase({
	expenseId,
	paymentExpenseId,
	paymentDate,
}: MarkMandatoryExpensePaymentParams) {
	if (
		typeof expenseId !== 'string' ||
		expenseId.trim().length === 0 ||
		typeof paymentExpenseId !== 'string' ||
		paymentExpenseId.trim().length === 0 ||
		!(paymentDate instanceof Date) ||
		Number.isNaN(paymentDate.getTime())
	) {
		return { success: false, reason: 'invalid_payment_data' as const };
	}

	try {
		const mandatoryExpenseRef = doc(db, MANDATORY_EXPENSES_COLLECTION, expenseId);
		const paymentExpenseRef = doc(db, 'expenses', paymentExpenseId);
		const paymentCycle = getCycleKeyFromDate(paymentDate);

		return await runTransaction(db, async transaction => {
			const [mandatoryExpenseSnapshot, paymentExpenseSnapshot] = await Promise.all([
				transaction.get(mandatoryExpenseRef),
				transaction.get(paymentExpenseRef),
			]);

			if (!mandatoryExpenseSnapshot.exists()) {
				return { success: false, reason: 'mandatory_expense_not_found' as const };
			}

			if (!paymentExpenseSnapshot.exists()) {
				return { success: false, reason: 'payment_expense_not_found' as const };
			}

			const data = mandatoryExpenseSnapshot.data() as Record<string, unknown>;
			const lastPaymentCycle = typeof data.lastPaymentCycle === 'string' ? data.lastPaymentCycle : null;
			if (lastPaymentCycle === paymentCycle) {
				const linkedPaymentExpenseId =
					typeof data.lastPaymentExpenseId === 'string' ? data.lastPaymentExpenseId : null;

				if (linkedPaymentExpenseId === paymentExpenseId) {
					return { success: true };
				}

				if (linkedPaymentExpenseId) {
					const linkedPaymentSnapshot = await transaction.get(doc(db, 'expenses', linkedPaymentExpenseId));
					if (linkedPaymentSnapshot.exists()) {
						return { success: false, reason: 'already_paid_for_cycle' as const };
					}
				}
			}

			const installmentState = getMandatoryExpenseInstallmentPaymentState(data, paymentDate);
			if (installmentState.isInstallmentPlanComplete) {
				return { success: false, reason: 'installment_plan_complete' as const };
			}

			const nextInstallmentsCompleted =
				installmentState.installmentTotal === null
					? null
					: Math.min(installmentState.installmentsCompleted + 1, installmentState.installmentTotal);

			transaction.update(mandatoryExpenseRef, {
				lastPaymentExpenseId: paymentExpenseId,
				lastPaymentDate: paymentDate,
				lastPaymentCycle: paymentCycle,
				...(nextInstallmentsCompleted !== null ? { installmentsCompleted: nextInstallmentsCompleted } : {}),
				updatedAt: new Date(),
			});

			return { success: true };
		});
	} catch (error) {
		console.error('Erro ao marcar pagamento do gasto obrigatório:', error);
		return { success: false, reason: 'transaction_failed' as const };
	}
}

export async function clearMandatoryExpensePaymentFirebase(expenseId: string) {
	if (typeof expenseId !== 'string' || expenseId.trim().length === 0) {
		return { success: false, reason: 'mandatory_expense_not_found' as const };
	}

	try {
		const mandatoryExpenseRef = doc(db, MANDATORY_EXPENSES_COLLECTION, expenseId);
		return await runTransaction(db, async transaction => {
			const expenseSnapshot = await transaction.get(mandatoryExpenseRef);
			if (!expenseSnapshot.exists()) {
				return { success: false, reason: 'mandatory_expense_not_found' as const };
			}

			const data = expenseSnapshot.data() as Record<string, unknown>;
			const installmentTotal = normalizeMandatoryInstallmentTotal(data.installmentTotal);
			const installmentsCompleted = normalizeMandatoryInstallmentsCompleted(
				data.installmentsCompleted,
				installmentTotal,
			);
			const hasLinkedPayment =
				typeof data.lastPaymentExpenseId === 'string' && data.lastPaymentExpenseId.length > 0;
			const nextInstallmentsCompleted =
				installmentTotal !== null && hasLinkedPayment ? Math.max(0, installmentsCompleted - 1) : installmentsCompleted;

			transaction.update(mandatoryExpenseRef, {
				lastPaymentExpenseId: null,
				lastPaymentDate: null,
				lastPaymentCycle: null,
				...(installmentTotal !== null ? { installmentsCompleted: nextInstallmentsCompleted } : {}),
				updatedAt: new Date(),
			});

			return { success: true };
		});
	} catch (error) {
		console.error('Erro ao remover registro de pagamento do gasto obrigatório:', error);
		return { success: false, reason: 'transaction_failed' as const };
	}
}
