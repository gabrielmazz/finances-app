import { db } from '@/FirebaseConfig';
import {
	collection,
	doc,
	getDoc,
	getDocs,
	limit as limitQuery,
	orderBy,
	query,
	setDoc,
	serverTimestamp,
	writeBatch,
	where,
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
	bankNameSnapshot?: string | null;
	description?: string | null;
}

const COLLECTION = 'financeInvestments';
const SYNC_COLLECTION = 'financeInvestmentSyncs';

type FinanceInvestmentSyncReason = 'manual' | 'deposit' | 'withdrawal';

type FinanceInvestmentRecord = Record<string, unknown>;

const resolveInvestmentInitialValue = (investment: FinanceInvestmentRecord | undefined) => {
	if (typeof investment?.initialValueInCents === 'number') {
		return investment.initialValueInCents;
	}

	if (typeof investment?.initialInvestedInCents === 'number') {
		return investment.initialInvestedInCents;
	}

	if (typeof investment?.currentValueInCents === 'number') {
		return investment.currentValueInCents;
	}

	if (typeof investment?.lastManualSyncValueInCents === 'number') {
		return investment.lastManualSyncValueInCents;
	}

	return 0;
};

const resolveInvestmentCurrentValue = (investment: FinanceInvestmentRecord | undefined) => {
	if (typeof investment?.currentValueInCents === 'number') {
		return investment.currentValueInCents;
	}

	if (typeof investment?.lastManualSyncValueInCents === 'number') {
		return investment.lastManualSyncValueInCents;
	}

	if (typeof investment?.initialValueInCents === 'number') {
		return investment.initialValueInCents;
	}

	if (typeof investment?.initialInvestedInCents === 'number') {
		return investment.initialInvestedInCents;
	}

	return 0;
};

const normalizeDateValue = (value?: Date | null) => {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value;
	}

	return new Date();
};

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
	bankNameSnapshot,
	description,
}: UpdateFinanceInvestmentParams) {
	try {
		const investmentRef = doc(db, COLLECTION, investmentId);
		const currentSnapshot = await getDoc(investmentRef);
		const currentData = currentSnapshot.data() as FinanceInvestmentRecord | undefined;
		const updates: Record<string, unknown> = {
			updatedAt: serverTimestamp(),
		};

		if (typeof name === 'string') {
			updates.name = name;
		}

		if (typeof initialValueInCents === 'number') {
			const previousInitialValue = resolveInvestmentInitialValue(currentData);
			const previousCurrentValue = resolveInvestmentCurrentValue(currentData);
			const shouldAdjustCurrentValue =
				typeof currentValueInCents !== 'number' &&
				previousCurrentValue === previousInitialValue;

			updates.initialValueInCents = initialValueInCents;
			updates.initialInvestedInCents = initialValueInCents;

			if (shouldAdjustCurrentValue) {
				updates.currentValueInCents = initialValueInCents;
				updates.lastManualSyncValueInCents = initialValueInCents;
				updates.lastManualSyncAt = serverTimestamp();
			}
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

		if (bankNameSnapshot !== undefined) {
			updates.bankNameSnapshot = bankNameSnapshot ?? null;
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
		const investmentRef = doc(db, COLLECTION, investmentId);
		const [depositSnapshot, redemptionSnapshot, syncSnapshot] = await Promise.all([
			getDocs(query(collection(db, 'expenses'), where('investmentId', '==', investmentId))),
			getDocs(query(collection(db, 'gains'), where('investmentId', '==', investmentId))),
			getDocs(query(collection(db, SYNC_COLLECTION), where('investmentId', '==', investmentId))),
		]);

		const hasInvestmentDeposits = depositSnapshot.docs.some(
			docSnapshot => Boolean(docSnapshot.data()?.isInvestmentDeposit),
		);
		const hasInvestmentRedemptions = redemptionSnapshot.docs.some(
			docSnapshot => Boolean(docSnapshot.data()?.isInvestmentRedemption),
		);

		if (hasInvestmentDeposits || hasInvestmentRedemptions) {
			return {
				success: false,
				error:
					'Este investimento possui aportes ou resgates registrados. Desfaça essas movimentações antes de excluir o investimento.',
			};
		}

		const batch = writeBatch(db);
		batch.delete(investmentRef);

		syncSnapshot.docs.forEach(syncDoc => {
			batch.delete(syncDoc.ref);
		});

		await batch.commit();
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
		const baseValue = resolveInvestmentCurrentValue(data);
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
	recordHistory = false,
	personId,
	bankId,
	investmentNameSnapshot,
	bankNameSnapshot,
	reason = 'manual',
	date,
}: {
	investmentId: string;
	syncedValueInCents: number;
	recordHistory?: boolean;
	personId?: string | null;
	bankId?: string | null;
	investmentNameSnapshot?: string | null;
	bankNameSnapshot?: string | null;
	reason?: FinanceInvestmentSyncReason;
	date?: Date | null;
}) {
	try {
		const investmentRef = doc(db, COLLECTION, investmentId);
		if (!recordHistory) {
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
		}

		const investmentSnapshot = await getDoc(investmentRef);
		const investmentData = investmentSnapshot.data() as FinanceInvestmentRecord | undefined;
		const previousValueInCents = resolveInvestmentCurrentValue(investmentData);
		const normalizedDate = normalizeDateValue(date);
		const resolvedPersonId =
			typeof personId === 'string' && personId.trim().length > 0
				? personId
				: typeof investmentData?.personId === 'string'
					? investmentData.personId
					: null;
		const resolvedBankId =
			typeof bankId === 'string' && bankId.trim().length > 0
				? bankId
				: typeof investmentData?.bankId === 'string'
					? investmentData.bankId
					: null;
		const resolvedInvestmentName =
			typeof investmentNameSnapshot === 'string' && investmentNameSnapshot.trim().length > 0
				? investmentNameSnapshot.trim()
				: typeof investmentData?.name === 'string' && investmentData.name.trim().length > 0
					? investmentData.name.trim()
					: 'Investimento';
		const resolvedBankName =
			typeof bankNameSnapshot === 'string' && bankNameSnapshot.trim().length > 0
				? bankNameSnapshot.trim()
				: typeof investmentData?.bankNameSnapshot === 'string' && investmentData.bankNameSnapshot.trim().length > 0
					? investmentData.bankNameSnapshot.trim()
					: null;

		if (!resolvedPersonId || !resolvedBankId) {
			return {
				success: false,
				error: 'Não foi possível registrar o histórico da sincronização deste investimento.',
			};
		}

		const syncRef = doc(collection(db, SYNC_COLLECTION));
		const batch = writeBatch(db);

		batch.set(
			investmentRef,
			{
				currentValueInCents: syncedValueInCents,
				lastManualSyncValueInCents: syncedValueInCents,
				lastManualSyncAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			},
			{ merge: true },
		);

		batch.set(syncRef, {
			name: `Sincronização - ${resolvedInvestmentName}`,
			investmentId,
			personId: resolvedPersonId,
			bankId: resolvedBankId,
			bankNameSnapshot: resolvedBankName,
			investmentNameSnapshot: resolvedInvestmentName,
			previousValueInCents,
			syncedValueInCents,
			deltaInCents: syncedValueInCents - previousValueInCents,
			reason,
			date: normalizedDate,
			createdAt: normalizedDate,
			updatedAt: normalizedDate,
		});

		await batch.commit();
		return { success: true };
	} catch (error) {
		console.error('Erro ao sincronizar manualmente o investimento:', error);
		return { success: false, error };
	}
}

export async function getFinanceInvestmentDataFirebase(investmentId: string) {
	try {
		const investmentDoc = await getDoc(doc(db, COLLECTION, investmentId));

		if (investmentDoc.exists()) {
			return { success: true, data: investmentDoc.data() };
		}

		return { success: false, error: 'Investimento não encontrado.' };
	} catch (error) {
		console.error('Erro ao obter dados do investimento:', error);
		return { success: false, error };
	}
}

export async function getFinanceInvestmentSyncEventsByPeriodFirebase({
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

		const syncQuery = query(
			collection(db, SYNC_COLLECTION),
			where('bankId', '==', bankId),
			where('personId', 'in', relatedUserIds),
			where('date', '>=', normalizedStart),
			where('date', '<=', normalizedEnd),
		);

		const snapshot = await getDocs(syncQuery);
		const syncEvents = snapshot.docs.map(syncDoc => ({
			id: syncDoc.id,
			...syncDoc.data(),
		}));

		return { success: true, data: syncEvents };
	} catch (error) {
		console.error('Erro ao buscar sincronizações de investimentos por período:', error);
		return { success: false, error };
	}
}

export async function revertFinanceInvestmentDepositFirebase(expenseId: string) {
	try {
		const expenseRef = doc(db, 'expenses', expenseId);
		const expenseSnapshot = await getDoc(expenseRef);

		if (!expenseSnapshot.exists()) {
			return { success: false, error: 'Aporte não encontrado.' };
		}

		const expenseData = expenseSnapshot.data() as FinanceInvestmentRecord;
		const investmentId =
			typeof expenseData.investmentId === 'string' ? expenseData.investmentId : null;
		const valueInCents =
			typeof expenseData.valueInCents === 'number' ? expenseData.valueInCents : null;

		if (!expenseData.isInvestmentDeposit || !investmentId || valueInCents === null) {
			return { success: false, error: 'Este lançamento não pode ser desfeito como aporte.' };
		}

		const investmentRef = doc(db, COLLECTION, investmentId);
		const investmentSnapshot = await getDoc(investmentRef);
		if (!investmentSnapshot.exists()) {
			return { success: false, error: 'Investimento relacionado não encontrado.' };
		}

		const investmentData = investmentSnapshot.data() as FinanceInvestmentRecord;
		const currentValueInCents = resolveInvestmentCurrentValue(investmentData);
		const nextValueInCents = Math.max(0, currentValueInCents - valueInCents);
		const batch = writeBatch(db);

		batch.set(
			investmentRef,
			{
				currentValueInCents: nextValueInCents,
				lastManualSyncValueInCents: nextValueInCents,
				lastManualSyncAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			},
			{ merge: true },
		);
		batch.delete(expenseRef);
		await batch.commit();

		return { success: true };
	} catch (error) {
		console.error('Erro ao desfazer aporte do investimento:', error);
		return { success: false, error };
	}
}

export async function revertFinanceInvestmentRedemptionFirebase(gainId: string) {
	try {
		const gainRef = doc(db, 'gains', gainId);
		const gainSnapshot = await getDoc(gainRef);

		if (!gainSnapshot.exists()) {
			return { success: false, error: 'Resgate não encontrado.' };
		}

		const gainData = gainSnapshot.data() as FinanceInvestmentRecord;
		const investmentId =
			typeof gainData.investmentId === 'string' ? gainData.investmentId : null;
		const valueInCents =
			typeof gainData.valueInCents === 'number' ? gainData.valueInCents : null;

		if (!gainData.isInvestmentRedemption || !investmentId || valueInCents === null) {
			return { success: false, error: 'Este lançamento não pode ser desfeito como resgate.' };
		}

		const investmentRef = doc(db, COLLECTION, investmentId);
		const investmentSnapshot = await getDoc(investmentRef);
		if (!investmentSnapshot.exists()) {
			return { success: false, error: 'Investimento relacionado não encontrado.' };
		}

		const investmentData = investmentSnapshot.data() as FinanceInvestmentRecord;
		const currentValueInCents = resolveInvestmentCurrentValue(investmentData);
		const nextValueInCents = currentValueInCents + valueInCents;
		const batch = writeBatch(db);

		batch.set(
			investmentRef,
			{
				currentValueInCents: nextValueInCents,
				lastManualSyncValueInCents: nextValueInCents,
				lastManualSyncAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			},
			{ merge: true },
		);
		batch.delete(gainRef);
		await batch.commit();

		return { success: true };
	} catch (error) {
		console.error('Erro ao desfazer resgate do investimento:', error);
		return { success: false, error };
	}
}

export async function revertFinanceInvestmentSyncFirebase(syncId: string) {
	try {
		const syncRef = doc(db, SYNC_COLLECTION, syncId);
		const syncSnapshot = await getDoc(syncRef);

		if (!syncSnapshot.exists()) {
			return { success: false, error: 'Sincronização não encontrada.' };
		}

		const syncData = syncSnapshot.data() as FinanceInvestmentRecord;
		const investmentId =
			typeof syncData.investmentId === 'string' ? syncData.investmentId : null;
		const previousValueInCents =
			typeof syncData.previousValueInCents === 'number'
				? syncData.previousValueInCents
				: null;
		const syncedValueInCents =
			typeof syncData.syncedValueInCents === 'number' ? syncData.syncedValueInCents : null;

		if (!investmentId || previousValueInCents === null || syncedValueInCents === null) {
			return { success: false, error: 'Dados insuficientes para desfazer esta sincronização.' };
		}

		const investmentRef = doc(db, COLLECTION, investmentId);
		const investmentSnapshot = await getDoc(investmentRef);
		if (!investmentSnapshot.exists()) {
			return { success: false, error: 'Investimento relacionado não encontrado.' };
		}

		const investmentData = investmentSnapshot.data() as FinanceInvestmentRecord;
		const currentValueInCents = resolveInvestmentCurrentValue(investmentData);
		const revertedDelta = previousValueInCents - syncedValueInCents;
		const nextValueInCents = Math.max(0, currentValueInCents + revertedDelta);
		const batch = writeBatch(db);

		batch.set(
			investmentRef,
			{
				currentValueInCents: nextValueInCents,
				lastManualSyncValueInCents: nextValueInCents,
				lastManualSyncAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			},
			{ merge: true },
		);
		batch.delete(syncRef);
		await batch.commit();

		return { success: true };
	} catch (error) {
		console.error('Erro ao desfazer sincronização do investimento:', error);
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
