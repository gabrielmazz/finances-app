import { executeLegacyFinancialMovementFirebase } from '@/functions/LegacyFinancialMovementFirebase';
import { getFinancialLedgerAccountsFirebase, getFinancialLedgerContextFirebase, manageFinancialLedgerAccountFirebase, transferFundsFinancialLedgerFirebase } from '@/functions/FinancialLedgerFirebase';
import { createAssistantRecordFingerprint } from '@/utils/assistantRecordFingerprint';
import { auth, db } from '@/FirebaseConfig';
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
import {
	getInvestmentAssetType,
	getInvestmentValuationMethod,
	normalizeCdiPercentageInBasisPoints,
	type InvestmentAssetType,
	type InvestmentCashFlow,
	type InvestmentSync,
	type InvestmentValuationMethod,
} from '@/utils/investmentPortfolio';
import { isSafeIntegerCents } from '@/utils/monthlyBalance';

interface AddFinanceInvestmentParams {
	name: string;
	initialValueInCents: number;
	currentValueInCents?: number;
	cdiPercentage: number;
	cdiPercentageInBasisPoints?: number;
	assetType?: InvestmentAssetType;
	valuationMethod?: InvestmentValuationMethod;
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
	cdiPercentageInBasisPoints?: number;
	assetType?: InvestmentAssetType;
	valuationMethod?: InvestmentValuationMethod;
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

const parseFirestoreDate = (value: unknown): Date | null => {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}

	if (
		value &&
		typeof value === 'object' &&
		'toDate' in value &&
		typeof (value as { toDate?: () => Date }).toDate === 'function'
	) {
		const parsedDate = (value as { toDate: () => Date }).toDate();
		return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
	}

	if (typeof value === 'string' || typeof value === 'number') {
		const parsedDate = new Date(value);
		return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
	}

	return null;
};

export async function addFinanceInvestmentFirebase({ name, initialValueInCents, currentValueInCents, cdiPercentage, cdiPercentageInBasisPoints, assetType, valuationMethod, redemptionTerm, bankId, personId, description, date }: AddFinanceInvestmentParams) {
	try {
		const percentage = cdiPercentageInBasisPoints ?? normalizeCdiPercentageInBasisPoints(cdiPercentage);
		const resolvedAsset = getInvestmentAssetType(assetType); const resolvedMethod = getInvestmentValuationMethod(valuationMethod, resolvedAsset);
		const ledger = await getFinancialLedgerContextFirebase(personId);
		if (ledger) {
			const bank = (await getFinancialLedgerAccountsFirebase(ledger.groupId)).find(account => account.kind === 'bank' && (account.id === bankId || account.legacyBankId === bankId));
			if (!bank) return { success: false, error: 'Banco indisponível no grupo.' };
			const result = await manageFinancialLedgerAccountFirebase({ groupId: ledger.groupId, expectedActorId: personId, action: 'create', kind: 'investment', name, initialBalanceInCents: initialValueInCents, ...(currentValueInCents === undefined ? {} : { initialCountedBalanceInCents: currentValueInCents }), fundingAccountId: bank.id, effectiveAt: date, clientActionId: 'form_' + doc(collection(db, COLLECTION)).id, metadata: { cdiPercentageInBasisPoints: percentage, assetType: resolvedAsset, valuationMethod: resolvedMethod, redemptionTerm, description: description ?? null } });
			return { success: true, investmentId: result.accountId };
		}
		const result = await executeLegacyFinancialMovementFirebase({ kind: 'create_investment', expectedActorId: personId, name, initialValueInCents, ...(currentValueInCents === undefined ? {} : { currentValueInCents }), cdiPercentageInBasisPoints: percentage, assetType: resolvedAsset, valuationMethod: resolvedMethod, redemptionTerm, bankId, description, date });
		return { success: true, investmentId: result.recordId };
	} catch {
		return { success: false, error: 'Não foi possível criar o investimento. Confira autorização, banco e saldo.' };
	}
}

export async function moveFinanceInvestmentFirebase({ investmentId, valueInCents, date, type, expectedCurrentValueInCents }: { investmentId: string; valueInCents: number; date: Date; type: 'deposit' | 'redemption'; expectedCurrentValueInCents?: number }) {
	try {
		const personId = auth.currentUser?.uid; if (!personId) return { success: false, error: 'Usuário não autenticado.' };
		const ledger = await getFinancialLedgerContextFirebase(personId);
		if (ledger) {
			const accounts = await getFinancialLedgerAccountsFirebase(ledger.groupId); const investment = accounts.find(account => account.id === investmentId && account.kind === 'investment');
			const bank = accounts.find(account => account.id === investment?.bankAccountId && account.kind === 'bank');
			if (!investment || !bank || expectedCurrentValueInCents !== undefined && investment.currentBalanceInCents !== expectedCurrentValueInCents) return { success: false, error: 'O investimento mudou ou o banco está indisponível. Confira o valor atual.' };
			await transferFundsFinancialLedgerFirebase({ groupId: ledger.groupId, expectedActorId: personId, fromAccountId: type === 'deposit' ? bank.id : investment.id, toAccountId: type === 'deposit' ? investment.id : bank.id, amountInCents: valueInCents, effectiveAt: date, clientActionId: 'form_' + doc(collection(db, COLLECTION)).id, kind: type === 'deposit' ? 'investment_deposit' : 'investment_redemption' });
		} else {
			const snapshot = await getDoc(doc(db, COLLECTION, investmentId)); const investment = snapshot.data();
			if (!investment || expectedCurrentValueInCents !== undefined && resolveInvestmentCurrentValue(investment) !== expectedCurrentValueInCents) return { success: false, error: 'O investimento mudou. Confira o valor atual.' };
			await executeLegacyFinancialMovementFirebase({ kind: type === 'deposit' ? 'deposit_investment' : 'redeem_investment', expectedActorId: personId, investmentId, valueInCents, date, expectedFingerprint: createAssistantRecordFingerprint(investment) });
		}
		return { success: true };
	} catch (error) { return { success: false, error: 'Não foi possível registrar o movimento. Confira saldo, autorização e valor atualizado.', errorCode: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'invalid-state', reason: error && typeof error === 'object' && 'details' in error && error.details && typeof error.details === 'object' && 'reason' in error.details && typeof error.details.reason === 'string' && ['stale-record', 'inactive-account', 'insufficient-bank-balance', 'insufficient-investment-balance', 'amount-limit', 'idempotency-conflict'].includes(error.details.reason) ? error.details.reason : undefined }; }
}

export async function updateFinanceInvestmentFirebase({
	investmentId,
	name,
	initialValueInCents,
	currentValueInCents,
	cdiPercentage,
	cdiPercentageInBasisPoints,
	assetType,
	valuationMethod,
	redemptionTerm,
	bankId,
	bankNameSnapshot,
	description,
}: UpdateFinanceInvestmentParams) {
	try {
		const personId = auth.currentUser?.uid; if (!personId) return { success: false, error: 'Usuário não autenticado.' };
		const ledger = await getFinancialLedgerContextFirebase(personId);
		if (ledger) {
			const accounts = await getFinancialLedgerAccountsFirebase(ledger.groupId); const investment = accounts.find(account => account.id === investmentId && account.kind === 'investment');
			if (!investment) return { success: false, error: 'Investimento indisponível no grupo.' };
			const bank = bankId === undefined ? undefined : accounts.find(account => account.kind === 'bank' && (account.id === bankId || account.legacyBankId === bankId));
			if (bankId !== undefined && !bank) return { success: false, error: 'Banco indisponível no grupo.' };
			const percentage = cdiPercentageInBasisPoints ?? (cdiPercentage === undefined ? undefined : normalizeCdiPercentageInBasisPoints(cdiPercentage));
			await manageFinancialLedgerAccountFirebase({ groupId: ledger.groupId, expectedActorId: personId, accountId: investment.id, action: 'update', ...(name === undefined ? {} : { name }), ...(initialValueInCents === undefined ? {} : { initialValueInCents }), ...(currentValueInCents === undefined ? {} : { countedBalanceInCents: currentValueInCents }), effectiveAt: new Date(), clientActionId: 'form_' + doc(collection(db, COLLECTION)).id, metadata: { ...(percentage === undefined ? {} : { cdiPercentageInBasisPoints: percentage }), ...(assetType === undefined ? {} : { assetType }), ...(valuationMethod === undefined ? {} : { valuationMethod }), ...(redemptionTerm === undefined ? {} : { redemptionTerm }), ...(bank === undefined ? {} : { bankAccountId: bank.id }), ...(description === undefined ? {} : { description }) } });
		} else {
			const snapshot = await getDoc(doc(db, COLLECTION, investmentId)); const investment = snapshot.data();
			if (!investment) return { success: false, error: 'Investimento indisponível.' };
			await executeLegacyFinancialMovementFirebase({ kind: 'update_investment', expectedActorId: personId, investmentId, expectedFingerprint: createAssistantRecordFingerprint(investment), date: new Date(), fields: { ...(name === undefined ? {} : { name }), ...(initialValueInCents === undefined ? {} : { initialValueInCents }), ...(currentValueInCents === undefined ? {} : { currentValueInCents }), ...(cdiPercentageInBasisPoints === undefined && cdiPercentage === undefined ? {} : { cdiPercentageInBasisPoints: cdiPercentageInBasisPoints ?? normalizeCdiPercentageInBasisPoints(cdiPercentage!) }), ...(assetType === undefined ? {} : { assetType }), ...(valuationMethod === undefined ? {} : { valuationMethod }), ...(redemptionTerm === undefined ? {} : { redemptionTerm }), ...(bankId === undefined ? {} : { bankId }), ...(description === undefined ? {} : { description }) } });
		}
		return { success: true };
	} catch {
		return { success: false, error: 'Não foi possível atualizar o investimento. Confira autorização, saldo e valor atual.' };
	}
}

export async function deleteFinanceInvestmentFirebase(investmentId: string) {
	try {
		const personId = auth.currentUser?.uid;
		if (!personId) return { success: false, error: 'Usuário não autenticado.' };
		const related = await getRelatedUsersIDsFirebase(personId);
		if (!related.success) return related;
		const personIds = Array.from(new Set([personId, ...(Array.isArray(related.data) ? related.data : [])]));
		const investmentRef = doc(db, COLLECTION, investmentId);
		const [depositSnapshot, redemptionSnapshot, syncSnapshot] = await Promise.all([
			getDocs(query(collection(db, 'expenses'), where('investmentId', '==', investmentId), where('personId', 'in', personIds))),
			getDocs(query(collection(db, 'gains'), where('investmentId', '==', investmentId), where('personId', 'in', personIds))),
			getDocs(query(collection(db, SYNC_COLLECTION), where('investmentId', '==', investmentId), where('personId', 'in', personIds))),
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
		if (!investmentId || !isSafeIntegerCents(deltaInCents)) {
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
		if (!isSafeIntegerCents(syncedValueInCents) || syncedValueInCents < 0) {
			return { success: false, error: 'O valor sincronizado deve ser um número inteiro de centavos.' };
		}
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

async function revertFinanceInvestmentMovementFirebase(movementId: string, type: 'deposit' | 'redemption') {
	try {
		const personId = auth.currentUser?.uid; if (!personId) return { success: false, error: 'Usuário não autenticado.' };
		const movement = (await getDoc(doc(db, type === 'deposit' ? 'expenses' : 'gains', movementId))).data();
		if (!movement || !(type === 'deposit' ? movement.isInvestmentDeposit : movement.isInvestmentRedemption) || typeof movement.investmentId !== 'string') return { success: false, error: 'Movimento indisponível.' };
		const investment = (await getDoc(doc(db, COLLECTION, movement.investmentId))).data();
		if (!investment) return { success: false, error: 'Investimento relacionado indisponível.' };
		await executeLegacyFinancialMovementFirebase({ kind: type === 'deposit' ? 'undo_investment_deposit' : 'undo_investment_redemption', expectedActorId: personId, movementId, expectedMovementFingerprint: createAssistantRecordFingerprint(movement), expectedInvestmentFingerprint: createAssistantRecordFingerprint(investment), date: new Date() });
		return { success: true };
	} catch {
		return { success: false, error: 'Não foi possível desfazer o movimento. Confira autorização, saldo do banco e valor atual do investimento.' };
	}
}

export const revertFinanceInvestmentDepositFirebase = (expenseId: string) => revertFinanceInvestmentMovementFirebase(expenseId, 'deposit');
export const revertFinanceInvestmentRedemptionFirebase = (gainId: string) => revertFinanceInvestmentMovementFirebase(gainId, 'redemption');

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

export type FinanceInvestmentPortfolioActivity = {
	cashFlows: InvestmentCashFlow[];
	syncs: InvestmentSync[];
};

export async function getFinanceInvestmentPortfolioActivityWithRelationsFirebase(personId: string, startDate?: Date) {
	try {
		const relatedResult = await getRelatedUsersIDsFirebase(personId);
		if (!relatedResult.success) {
			throw new Error('Erro ao buscar usuários relacionados.');
		}

		const relatedIds = Array.isArray(relatedResult.data) ? relatedResult.data : [];
		const allowedIds = Array.from(
			new Set(
				[personId, ...relatedIds].filter(
					(candidate): candidate is string =>
						typeof candidate === 'string' && candidate.trim().length > 0,
				),
			),
		);

		const defaultStart = new Date();
		defaultStart.setMonth(defaultStart.getMonth() - 6);
		const from = startDate && !Number.isNaN(startDate.getTime()) ? startDate : defaultStart;
		const datedQuery = (collectionName: string) => query(
			collection(db, collectionName),
			where('personId', 'in', allowedIds),
			where('date', '>=', from),
			orderBy('date', 'desc'),
		);
		const [syncSnapshot, expensesSnapshot, gainsSnapshot] = await Promise.all([
			getDocs(datedQuery(SYNC_COLLECTION)),
			getDocs(datedQuery('expenses')),
			getDocs(datedQuery('gains')),
		]);

		const syncs = syncSnapshot.docs
			.map(syncDoc => {
				const data = syncDoc.data() as FinanceInvestmentRecord;
				const investmentId = typeof data.investmentId === 'string' ? data.investmentId : null;
				const syncedValueInCents =
					typeof data.syncedValueInCents === 'number' && Number.isFinite(data.syncedValueInCents)
						? Math.max(0, Math.round(data.syncedValueInCents))
						: null;
				const date = parseFirestoreDate(data.date ?? data.createdAt);
				const reason =
					data.reason === 'deposit' || data.reason === 'withdrawal' || data.reason === 'manual'
						? data.reason
						: 'manual';

				if (!investmentId || syncedValueInCents === null || !date) {
					return null;
				}

				return { investmentId, syncedValueInCents, date, reason } satisfies InvestmentSync;
			})
			.filter((sync): sync is InvestmentSync => sync !== null);

		const deposits = expensesSnapshot.docs
			.map<InvestmentCashFlow | null>(expenseDoc => {
				const data = expenseDoc.data() as FinanceInvestmentRecord;
				const investmentId = typeof data.investmentId === 'string' ? data.investmentId : null;
				const valueInCents =
					typeof data.valueInCents === 'number' && Number.isFinite(data.valueInCents)
						? Math.max(0, Math.round(data.valueInCents))
						: null;
				const date = parseFirestoreDate(data.date ?? data.createdAt);

				if (!data.isInvestmentDeposit || !investmentId || valueInCents === null || !date) {
					return null;
				}

				return { investmentId, valueInCents, date, kind: 'deposit' } satisfies InvestmentCashFlow;
			})
			.filter((flow): flow is InvestmentCashFlow => flow !== null);

		const redemptions = gainsSnapshot.docs
			.map<InvestmentCashFlow | null>(gainDoc => {
				const data = gainDoc.data() as FinanceInvestmentRecord;
				const investmentId = typeof data.investmentId === 'string' ? data.investmentId : null;
				const valueInCents =
					typeof data.valueInCents === 'number' && Number.isFinite(data.valueInCents)
						? Math.max(0, Math.round(data.valueInCents))
						: null;
				const date = parseFirestoreDate(data.date ?? data.createdAt);

				if (!data.isInvestmentRedemption || !investmentId || valueInCents === null || !date) {
					return null;
				}

				return { investmentId, valueInCents, date, kind: 'withdrawal' } satisfies InvestmentCashFlow;
			})
			.filter((flow): flow is InvestmentCashFlow => flow !== null);

		return {
			success: true,
			data: {
				cashFlows: [...deposits, ...redemptions],
				syncs,
			} satisfies FinanceInvestmentPortfolioActivity,
		};
	} catch (error) {
		console.error('Erro ao buscar a atividade do portfólio de investimentos:', error);
		return { success: false, error };
	}
}
