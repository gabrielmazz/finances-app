import { db } from '@/FirebaseConfig';
import {
	collection,
	deleteDoc,
	doc,
	getDocs,
	limit as limitQuery,
	orderBy,
	query,
	setDoc,
	where,
	updateDoc,
	increment,
} from 'firebase/firestore';
import { getRelatedUsersIDsFirebase } from './RegisterUserFirebase';
import { RedemptionTerm } from '@/utils/finance';

interface AddFinanceInvestmentParams {
	name: string;
	initialValueInCents: number;
	cdiPercentage: number;
	redemptionTerm: RedemptionTerm;
	bankId: string;
	personId: string;
	description?: string | null;
}

interface UpdateFinanceInvestmentParams {
	investmentId: string;
	name?: string;
	initialValueInCents?: number;
	cdiPercentage?: number;
	redemptionTerm?: RedemptionTerm;
	bankId?: string;
	description?: string | null;
}

const COLLECTION = 'financeInvestments';

export async function addFinanceInvestmentFirebase({
	name,
	initialValueInCents,
	cdiPercentage,
	redemptionTerm,
	bankId,
	personId,
	description,
}: AddFinanceInvestmentParams) {
	try {
		const investmentRef = doc(collection(db, COLLECTION));
		await setDoc(investmentRef, {
			name,
			initialValueInCents,
			cdiPercentage,
			redemptionTerm,
			bankId,
			personId,
			description: description ?? null,
			createdAt: new Date(),
			updatedAt: new Date(),
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
	cdiPercentage,
	redemptionTerm,
	bankId,
	description,
}: UpdateFinanceInvestmentParams) {
	try {
		const investmentRef = doc(db, COLLECTION, investmentId);
		const updates: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (typeof name === 'string') {
			updates.name = name;
		}

		if (typeof initialValueInCents === 'number') {
			updates.initialValueInCents = initialValueInCents;
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
		const investmentRef = doc(db, COLLECTION, investmentId);
		await updateDoc(investmentRef, {
			initialValueInCents: increment(deltaInCents),
			updatedAt: new Date(),
		});
		return { success: true };
	} catch (error) {
		console.error('Erro ao ajustar o valor do investimento:', error);
		return { success: false, error };
	}
}
