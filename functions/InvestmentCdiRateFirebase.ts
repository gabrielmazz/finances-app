import { db } from '@/FirebaseConfig';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import type { InvestmentCdiRate } from '@/utils/investmentPortfolio';
import {
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	serverTimestamp,
	setDoc,
	where,
} from 'firebase/firestore';

const COLLECTION = 'investmentCdiRates';

const normalizeStartOfDay = (value: Date) =>
	new Date(value.getFullYear(), value.getMonth(), value.getDate());

const parseDateValue = (value: unknown): Date | null => {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}

	if (
		value &&
		typeof value === 'object' &&
		'toDate' in value &&
		typeof (value as { toDate?: () => Date }).toDate === 'function'
	) {
		const date = (value as { toDate: () => Date }).toDate();
		return Number.isNaN(date.getTime()) ? null : date;
	}

	if (typeof value === 'string' || typeof value === 'number') {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	return null;
};

const normalizeRate = (id: string, data: Record<string, unknown>): InvestmentCdiRate | null => {
	const personId = typeof data.personId === 'string' ? data.personId.trim() : '';
	const annualRateInBasisPoints =
		typeof data.annualRateInBasisPoints === 'number' && Number.isFinite(data.annualRateInBasisPoints)
			? Math.max(0, Math.round(data.annualRateInBasisPoints))
			: 0;
	const effectiveFrom = parseDateValue(data.effectiveFrom);

	if (!personId || annualRateInBasisPoints <= 0 || !effectiveFrom) {
		return null;
	}

	return {
		id,
		personId,
		annualRateInBasisPoints,
		effectiveFrom: normalizeStartOfDay(effectiveFrom),
		createdAt: parseDateValue(data.createdAt),
	};
};

const buildRateDocumentId = (personId: string, effectiveFrom: Date) => {
	const date = normalizeStartOfDay(effectiveFrom);
	const dateKey = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
	return `${personId}_${dateKey}`;
};

export async function getInvestmentCdiRatesByPersonIdsFirebase(personIds: string[]) {
	try {
		const allowedIds = Array.from(
			new Set(
				personIds.filter(
					(candidate): candidate is string =>
						typeof candidate === 'string' && candidate.trim().length > 0,
				),
			),
		);

		if (allowedIds.length === 0) {
			return { success: true, data: [] as InvestmentCdiRate[] };
		}

		const snapshot = await getDocs(
			query(collection(db, COLLECTION), where('personId', 'in', allowedIds)),
		);
		const rates = snapshot.docs
			.map(rateDoc => normalizeRate(rateDoc.id, rateDoc.data() as Record<string, unknown>))
			.filter((rate): rate is InvestmentCdiRate => rate !== null)
			.sort((left, right) => left.effectiveFrom.getTime() - right.effectiveFrom.getTime());

		return { success: true, data: rates };
	} catch (error) {
		console.error('Erro ao buscar o histórico de CDI:', error);
		return { success: false, error };
	}
}

export async function getInvestmentCdiRatesWithRelationsFirebase(personId: string) {
	try {
		const relatedResult = await getRelatedUsersIDsFirebase(personId);
		if (!relatedResult.success) {
			throw new Error('Erro ao buscar usuários relacionados.');
		}

		const relatedIds = Array.isArray(relatedResult.data) ? relatedResult.data : [];
		return getInvestmentCdiRatesByPersonIdsFirebase([
			personId,
			...relatedIds.filter((id): id is string => typeof id === 'string'),
		]);
	} catch (error) {
		console.error('Erro ao buscar o histórico de CDI relacionado:', error);
		return { success: false, error };
	}
}

export async function upsertInvestmentCdiRateFirebase({
	personId,
	annualRateInBasisPoints,
	effectiveFrom,
}: {
	personId: string;
	annualRateInBasisPoints: number;
	effectiveFrom: Date;
}) {
	try {
		const normalizedPersonId = personId.trim();
		const normalizedRate = Math.max(0, Math.round(annualRateInBasisPoints));
		const normalizedEffectiveFrom = normalizeStartOfDay(effectiveFrom);
		if (!normalizedPersonId || normalizedRate <= 0 || Number.isNaN(normalizedEffectiveFrom.getTime())) {
			return { success: false, error: 'Dados inválidos para salvar a taxa CDI.' };
		}

		const rateRef = doc(
			collection(db, COLLECTION),
			buildRateDocumentId(normalizedPersonId, normalizedEffectiveFrom),
		);
		const existingRate = await getDoc(rateRef);
		await setDoc(
			rateRef,
			{
				personId: normalizedPersonId,
				annualRateInBasisPoints: normalizedRate,
				effectiveFrom: normalizedEffectiveFrom,
				updatedAt: serverTimestamp(),
				...(existingRate.exists() ? {} : { createdAt: serverTimestamp() }),
			},
			{ merge: true },
		);

		return { success: true, rateId: rateRef.id };
	} catch (error) {
		console.error('Erro ao salvar a taxa CDI:', error);
		return { success: false, error };
	}
}
