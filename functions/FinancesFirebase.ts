import { db } from '@/FirebaseConfig';
import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	limit as limitQuery,
	orderBy,
	query,
	setDoc,
	where,
	serverTimestamp,
} from 'firebase/firestore';
import { getRelatedUsersIDsFirebase } from './RegisterUserFirebase';
import { RedemptionTerm } from '@/utils/finance';

interface AddFinanceInvestmentParams {
	name: string;
	initialValueInCents: number;
	currentValueInCents?: number;
	cdiPercentage: number;
	redemptionTerm: RedemptionTerm;
	bankId: string;
	personId: string;
	description?: string | null;
	date: Date;
	bankNameSnapshot?: string | null;
}

interface UpdateFinanceInvestmentParams {
	investmentId: string;
	name?: string;
	initialValueInCents?: number;
	currentValueInCents?: number;
	cdiPercentage?: number;
	redemptionTerm?: RedemptionTerm;
	bankId?: string;
	description?: string | null;
}

const COLLECTION = 'financeInvestments';

export async function addFinanceInvestmentFirebase({
	name,
	initialValueInCents,
	currentValueInCents,
	cdiPercentage,
	redemptionTerm,
	bankId,
	personId,
	description,
	date,
	bankNameSnapshot,
}: AddFinanceInvestmentParams) {
	try {
		const investmentRef = doc(collection(db, COLLECTION));
		await setDoc(investmentRef, {
			name,
			initialValueInCents,
			initialInvestedInCents: initialValueInCents,
			currentValueInCents: typeof currentValueInCents === 'number' ? currentValueInCents : initialValueInCents,
			cdiPercentage,
			redemptionTerm,
			bankId,
			personId,
			description: description ?? null,
			date,
			bankNameSnapshot: bankNameSnapshot ?? null,
			lastManualSyncValueInCents:
				typeof currentValueInCents === 'number' ? currentValueInCents : initialValueInCents,
			lastManualSyncAt: serverTimestamp(),
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp(),
		});

		return { success: true, investmentId: investmentRef.id };
	} catch (error) {
		console.error('Erro ao adicionar investimento financeiro:', error);
		return { success: false, error };
	}
}

export async function updateFinanceInvestmentFirebase({
	investmentId,
	name,
	initialValueInCents,
	currentValueInCents,
	cdiPercentage,
	redemptionTerm,
	bankId,
	description,
}: UpdateFinanceInvestmentParams) {
	try {
		const investmentRef = doc(db, COLLECTION, investmentId);
		const updates: Record<string, unknown> = {
			updatedAt: serverTimestamp(),
		};

		if (typeof name === 'string') {
			updates.name = name;
		}

		if (typeof initialValueInCents === 'number') {
			updates.initialValueInCents = initialValueInCents;
			updates.initialInvestedInCents = initialValueInCents;
		}

		if (typeof currentValueInCents === 'number') {
			updates.currentValueInCents = currentValueInCents;
			updates.lastManualSyncValueInCents = currentValueInCents;
			updates.lastManualSyncAt = serverTimestamp();
		}

		if (typeof cdiPercentage === 'number') {
			updates.cdiPercentage = cdiPercentage;
		}

		if (typeof redemptionTerm === 'string') {
			updates.redemptionTerm = redemptionTerm;
		}

		if (typeof bankId === 'string') {
			updates.bankId = bankId;
		}

		if (description !== undefined) {
			updates.description = description ?? null;
		}

		await setDoc(investmentRef, updates, { merge: true });

		return { success: true };
	} catch (error) {
		console.error('Erro ao atualizar investimento financeiro:', error);
		return { success: false, error };
	}
}

export async function deleteFinanceInvestmentFirebase(investmentId: string) {
	try {
		await deleteDoc(doc(db, COLLECTION, investmentId));
		return { success: true };
	} catch (error) {
		console.error('Erro ao excluir investimento financeiro:', error);
		return { success: false, error };
	}
}

export async function getFinanceInvestmentsWithRelationsFirebase(personId: string) {
	try {
		const relatedResult = await getRelatedUsersIDsFirebase(personId);
		if (!relatedResult.success) {
			throw new Error('Erro ao buscar usuários relacionados.');
		}

		const relatedIds = Array.isArray(relatedResult.data) ? relatedResult.data : [];
		const allowedIds = Array.from(
			new Set([personId, ...relatedIds.filter(id => typeof id === 'string')]),
		);

		const investmentsCollection = collection(db, COLLECTION);
		const investmentsQuery = query(
			investmentsCollection,
			where('personId', 'in', allowedIds),
			orderBy('createdAt', 'desc'),
			limitQuery(50),
		);

		const snapshot = await getDocs(investmentsQuery);
		const investments = snapshot.docs.map(docSnap => ({
			id: docSnap.id,
			...docSnap.data(),
		}));

		return { success: true, data: investments };
	} catch (error) {
		console.error('Erro ao buscar investimentos financeiros:', error);
		return { success: false, error };
	}
}

export async function adjustFinanceInvestmentValueFirebase({
	investmentId,
	deltaInCents,
}: {
	investmentId: string;
	deltaInCents: number;
}) {
	try {
		if (!investmentId || !Number.isFinite(deltaInCents)) {
			return { success: false, error: 'Dados inválidos para ajustar investimento.' };
		}

		const investmentRef = doc(db, COLLECTION, investmentId);
		const snapshot = await getDoc(investmentRef);
		const data = snapshot.data() as Record<string, unknown> | undefined;
		const baseValue =
			typeof data?.currentValueInCents === 'number'
				? data.currentValueInCents
				: typeof data?.lastManualSyncValueInCents === 'number'
					? data.lastManualSyncValueInCents
					: typeof data?.initialValueInCents === 'number'
						? data.initialValueInCents
						: 0;
		const nextValue = baseValue + deltaInCents;
		const normalizedNext = Number.isFinite(nextValue) ? nextValue : baseValue;
		await setDoc(
			investmentRef,
			{
				currentValueInCents: normalizedNext,
				lastManualSyncValueInCents: normalizedNext,
				lastManualSyncAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			},
			{ merge: true },
		);
		return { success: true };
	} catch (error) {
		console.error('Erro ao ajustar o valor do investimento:', error);
		return { success: false, error };
	}
}

export async function syncFinanceInvestmentValueFirebase({
	investmentId,
	syncedValueInCents,
}: {
	investmentId: string;
	syncedValueInCents: number;
}) {
	try {
		const investmentRef = doc(db, COLLECTION, investmentId);
		await setDoc(
			investmentRef,
			{
				currentValueInCents: syncedValueInCents,
				lastManualSyncValueInCents: syncedValueInCents,
				lastManualSyncAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			},
			{ merge: true },
		);
		return { success: true };
	} catch (error) {
		console.error('Erro ao sincronizar manualmente o investimento:', error);
		return { success: false, error };
	}
}

export async function getFinanceInvestmentsByPeriodFirebase({
	personId,
	bankId,
	startDate,
	endDate,
}: {
	personId: string;
	bankId: string;
	startDate: Date;
	endDate: Date;
}) {
	try {
		if (!personId || !bankId) {
			return { success: false, error: 'Usuário ou banco não informado.' };
		}

		const relatedResult = await getRelatedUsersIDsFirebase(personId);

		if (!relatedResult.success) {
			throw new Error('Erro ao obter usuários relacionados.');
		}

		const relatedUserIds = Array.isArray(relatedResult.data) ? [...relatedResult.data] : [];
		relatedUserIds.push(personId);

		const normalizedStart = new Date(startDate);
		normalizedStart.setHours(0, 0, 0, 0);

		const normalizedEnd = new Date(endDate);
		normalizedEnd.setHours(23, 59, 59, 999);

		if (normalizedEnd < normalizedStart) {
			return { success: false, error: 'O período selecionado é inválido.' };
		}

		const investmentsQuery = query(
			collection(db, COLLECTION),
			where('bankId', '==', bankId),
			where('personId', 'in', relatedUserIds),
			where('date', '>=', normalizedStart),
			where('date', '<=', normalizedEnd),
		);

		const snapshot = await getDocs(investmentsQuery);
		const investments = snapshot.docs.map(investmentDoc => ({
			id: investmentDoc.id,
			...investmentDoc.data(),
		}));

		return { success: true, data: investments };
	} catch (error) {
		console.error('Erro ao buscar investimentos por período:', error);
		return { success: false, error };
	}
}
