import { db } from '@/FirebaseConfig';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import type { InvestmentCdiRate } from '@/utils/investmentPortfolio';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { executeSparkMetadataCommandFirebase } from './SparkMetadataCommandFirebase';
import { fromFinancialCivilDate, toFinancialCivilDate } from '../utils/financialCivilDate';
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
	const annualRateInBasisPoints = data.annualRateInBasisPoints;
	const effectiveFrom = parseDateValue(data.effectiveFrom);

	if (!personId || typeof annualRateInBasisPoints !== 'number' || !Number.isSafeInteger(annualRateInBasisPoints)
		|| annualRateInBasisPoints < 0 || annualRateInBasisPoints > 100_000 || !effectiveFrom) {
		return null;
	}

	return {
		id,
		personId,
		annualRateInBasisPoints,
		effectiveFrom: normalizeStartOfDay(data.schemaVersion === 1 ? toFinancialCivilDate(effectiveFrom) : effectiveFrom),
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

		const snapshots = await Promise.all(Array.from({ length: Math.ceil(allowedIds.length / 30) }, (_, index) =>
			getDocs(query(collection(db, COLLECTION), where('personId', 'in', allowedIds.slice(index * 30, index * 30 + 30))))));
		const rates = snapshots.flatMap(snapshot => snapshot.docs)
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
		const [spark, personal] = await Promise.all([getSparkContextFirebase(db, personId), getInvestmentCdiRatesByPersonIdsFirebase([
			personId,
			...relatedIds.filter((id): id is string => typeof id === 'string'),
		])]);
		if (!spark || !personal.success) return personal;
		const shared = await getDocs(query(collection(db, COLLECTION), where('groupId', '==', spark.groupId)));
		const rates = new Map((personal.data ?? []).map(rate => [rate.id, rate]));
		for (const document of shared.docs) {
			const rate = normalizeRate(document.id, document.data());
			if (rate) rates.set(rate.id, rate);
		}
		return { success: true, data: [...rates.values()].sort((left, right) => left.effectiveFrom.getTime() - right.effectiveFrom.getTime()) };
	} catch (error) {
		console.error('Erro ao buscar o histórico de CDI relacionado:', error);
		return { success: false, error };
	}
}

export async function upsertInvestmentCdiRateFirebase({
	personId,
	annualRateInBasisPoints,
	effectiveFrom,
	clientActionId,
}: {
	personId: string;
	annualRateInBasisPoints: number;
	effectiveFrom: Date;
	clientActionId?: string;
}) {
	try {
		const normalizedPersonId = personId.trim();
		const normalizedRate = annualRateInBasisPoints;
		const normalizedEffectiveFrom = normalizeStartOfDay(effectiveFrom);
		if (!normalizedPersonId || !Number.isSafeInteger(normalizedRate) || normalizedRate < 0 || normalizedRate > 100_000 || Number.isNaN(normalizedEffectiveFrom.getTime())) {
			return { success: false, error: 'Dados inválidos para salvar a taxa CDI.' };
		}

		const rateRef = doc(
			collection(db, COLLECTION),
			buildRateDocumentId(normalizedPersonId, normalizedEffectiveFrom),
		);
		const spark = await getSparkContextFirebase(db, normalizedPersonId);
		if (spark) {
			await executeSparkMetadataCommandFirebase(db, { ...spark, clientActionId: clientActionId ?? `cdi_${doc(collection(db, COLLECTION)).id}`,
				domain: 'cdi', action: 'upsert', recordId: rateRef.id, fields: { annualRateInBasisPoints: normalizedRate, effectiveFrom: fromFinancialCivilDate(normalizedEffectiveFrom) } });
			return { success: true, rateId: rateRef.id };
		}
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
