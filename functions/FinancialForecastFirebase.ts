import { db } from '@/FirebaseConfig';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import type { RedemptionTerm } from '@/utils/finance';
import {
	buildFinancialForecast,
	calculateFinancialForecastOpeningBalance,
	type FinancialForecastCashRescue,
	type FinancialForecastData,
	type FinancialForecastInvestment,
	type FinancialForecastMandatoryTemplate,
	type FinancialForecastMovement,
	type FinancialForecastMovementType,
	type FinancialForecastPeriod,
} from '@/utils/financialForecast';
import { collection, getDocs, query, where } from 'firebase/firestore';

type FirestoreDocument = Record<string, unknown> & { id: string };

export type FinancialForecastResult =
	| { success: true; data: FinancialForecastData }
	| { success: false; error: string };

const FIRESTORE_IN_QUERY_LIMIT = 10;
const REDEMPTION_TERMS: RedemptionTerm[] = ['anytime', '1m', '3m', '6m', '1y', '2y', '3y'];

const parseToDate = (value: unknown): Date | null => {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}

	if (typeof value === 'object' && value !== null) {
		const timestampValue = value as { toDate?: () => Date; seconds?: number };
		if (typeof timestampValue.toDate === 'function') {
			const parsedDate = timestampValue.toDate();
			return parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
		}

		if (typeof timestampValue.seconds === 'number') {
			const parsedDate = new Date(timestampValue.seconds * 1000);
			return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
		}
	}

	if (typeof value === 'string' || typeof value === 'number') {
		const parsedDate = new Date(value);
		return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
	}

	return null;
};

const getNonEmptyString = (value: unknown) =>
	typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const getNullableString = (value: unknown) => getNonEmptyString(value);

const getNonNegativeCents = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

const getSignedCents = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;

const getRedemptionTerm = (value: unknown): RedemptionTerm =>
	typeof value === 'string' && REDEMPTION_TERMS.includes(value as RedemptionTerm)
		? (value as RedemptionTerm)
		: 'anytime';

const chunkPersonIds = (personIds: string[]) =>
	Array.from({ length: Math.ceil(personIds.length / FIRESTORE_IN_QUERY_LIMIT) }, (_, index) =>
		personIds.slice(index * FIRESTORE_IN_QUERY_LIMIT, (index + 1) * FIRESTORE_IN_QUERY_LIMIT),
	);

const getCollectionDocumentsForPeople = async (collectionName: string, personIds: string[]) => {
	const chunks = chunkPersonIds(personIds);
	const snapshots = await Promise.all(
		chunks.map(personIdChunk =>
			getDocs(query(collection(db, collectionName), where('personId', 'in', personIdChunk))),
		),
	);

	return snapshots.flatMap(snapshot =>
		snapshot.docs.map(docSnapshot => ({
			id: docSnapshot.id,
			...(docSnapshot.data() as Record<string, unknown>),
		})),
	) as FirestoreDocument[];
};

const getAllowedPersonIds = async (personId: string) => {
	const relatedResult = await getRelatedUsersIDsFirebase(personId);
	if (!relatedResult.success) {
		throw new Error('Não foi possível carregar os usuários relacionados.');
	}

	const relatedIds = Array.isArray(relatedResult.data) ? relatedResult.data : [];
	return Array.from(
		new Set(
			[personId, ...relatedIds].filter(
				(candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
			),
		),
	);
};

const getTagNamesById = (tagDocuments: FirestoreDocument[]) =>
	tagDocuments.reduce<Record<string, string>>((tagNamesById, tag) => {
		const name = getNonEmptyString(tag.name);
		if (name) {
			tagNamesById[tag.id] = name;
		}
		return tagNamesById;
	}, {});

const normalizeMovement = (
	document: FirestoreDocument,
	type: FinancialForecastMovementType,
	tagNamesById: Record<string, string>,
): FinancialForecastMovement | null => {
	const date = parseToDate(document.date ?? document.createdAt);
	if (!date) {
		return null;
	}

	const tagId = getNullableString(document.tagId);
	return {
		id: document.id,
		type,
		name: getNonEmptyString(document.name) ?? (type === 'expense' ? 'Despesa sem nome' : 'Ganho sem nome'),
		valueInCents: getNonNegativeCents(document.valueInCents),
		date,
		tagId,
		tagName: tagId ? tagNamesById[tagId] ?? null : null,
		bankId: getNullableString(document.bankId),
		isInvestmentDeposit: document.isInvestmentDeposit === true,
		isInvestmentRedemption: document.isInvestmentRedemption === true,
		isBankTransfer: document.isBankTransfer === true,
		isFinanceInvestment: document.isFinanceInvestment === true,
		isFinanceInvestmentSync: document.isFinanceInvestmentSync === true,
	};
};

const normalizeMandatoryTemplate = ({
	document,
	type,
	tagNamesById,
	linkedMovementIds,
}: {
	document: FirestoreDocument;
	type: FinancialForecastMovementType;
	tagNamesById: Record<string, string>;
	linkedMovementIds: Set<string>;
}): FinancialForecastMandatoryTemplate | null => {
	const name = getNonEmptyString(document.name);
	if (!name) {
		return null;
	}

	const tagId = getNullableString(document.tagId);
	const linkedMovementId = getNullableString(
		type === 'expense' ? document.lastPaymentExpenseId : document.lastReceiptGainId,
	);
	const storedLastCycle = getNullableString(
		type === 'expense' ? document.lastPaymentCycle : document.lastReceiptCycle,
	);
	const lastCompletedCycle =
		linkedMovementId && linkedMovementIds.has(linkedMovementId) ? storedLastCycle : null;

	return {
		id: document.id,
		type,
		name,
		valueInCents: getNonNegativeCents(document.valueInCents),
		dueDay:
			typeof document.dueDay === 'number' && Number.isFinite(document.dueDay)
				? Math.max(1, Math.trunc(document.dueDay))
				: 1,
		usesBusinessDays: document.usesBusinessDays === true,
		tagId,
		tagName: tagId ? tagNamesById[tagId] ?? null : null,
		lastCompletedCycle,
		installmentTotal:
			typeof document.installmentTotal === 'number' && Number.isFinite(document.installmentTotal)
				? Math.trunc(document.installmentTotal)
				: null,
		installmentsCompleted:
			typeof document.installmentsCompleted === 'number' && Number.isFinite(document.installmentsCompleted)
				? Math.max(0, Math.trunc(document.installmentsCompleted))
				: 0,
		installmentStartDate: parseToDate(document.installmentStartDate),
		installmentEndDate: parseToDate(document.installmentEndDate),
	};
};

const normalizeInvestment = (document: FirestoreDocument): FinancialForecastInvestment | null => {
	const date = parseToDate(document.date ?? document.createdAt);
	if (!date) {
		return null;
	}

	const initialValueInCents = getNonNegativeCents(
		typeof document.initialValueInCents === 'number'
			? document.initialValueInCents
			: document.initialInvestedInCents,
	);
	const currentValueInCents = getNonNegativeCents(
		typeof document.currentValueInCents === 'number'
			? document.currentValueInCents
			: typeof document.lastManualSyncValueInCents === 'number'
				? document.lastManualSyncValueInCents
				: initialValueInCents,
	);

	return {
		id: document.id,
		name: getNonEmptyString(document.name) ?? 'Investimento sem nome',
		initialValueInCents,
		currentValueInCents,
		date,
		bankId: getNullableString(document.bankId),
		redemptionTerm: getRedemptionTerm(document.redemptionTerm),
	};
};

const normalizeCashRescue = (document: FirestoreDocument): FinancialForecastCashRescue | null => {
	const date = parseToDate(document.date ?? document.createdAt);
	if (!date) {
		return null;
	}

	return {
		id: document.id,
		bankId: getNullableString(document.bankId),
		valueInCents: getNonNegativeCents(document.valueInCents),
		date,
	};
};

const buildBankSnapshots = ({
	bankDocuments,
	monthlyBalanceDocuments,
	asOfDate,
}: {
	bankDocuments: FirestoreDocument[];
	monthlyBalanceDocuments: FirestoreDocument[];
	asOfDate: Date;
}) => {
	const asOfEnd = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate(), 23, 59, 59, 999);
	const bankNamesById = bankDocuments.reduce<Record<string, string>>((bankNames, bank) => {
		bankNames[bank.id] = getNonEmptyString(bank.name) ?? 'Banco sem nome';
		return bankNames;
	}, {});

	type CandidateSnapshot = {
		valueInCents: number;
		snapshotDate: Date;
		updatedAt: Date | null;
	};
	const latestByBankId = new Map<string, CandidateSnapshot>();

	monthlyBalanceDocuments.forEach(balance => {
		const bankId = getNullableString(balance.bankId);
		const year = typeof balance.year === 'number' && Number.isInteger(balance.year) ? balance.year : null;
		const month = typeof balance.month === 'number' && Number.isInteger(balance.month) ? balance.month : null;
		const valueInCents = getSignedCents(balance.valueInCents);
		if (!bankId || !bankNamesById[bankId] || !year || !month || month < 1 || month > 12 || valueInCents === null) {
			return;
		}

		const candidate: CandidateSnapshot = {
			valueInCents,
			snapshotDate: new Date(year, month - 1, 1, 0, 0, 0, 0),
			updatedAt: parseToDate(balance.updatedAt ?? balance.createdAt),
		};
		if (candidate.snapshotDate.getTime() > asOfEnd.getTime()) {
			return;
		}
		const current = latestByBankId.get(bankId);
		const hasNewerMonth = !current || candidate.snapshotDate.getTime() > current.snapshotDate.getTime();
		const hasNewerUpdateInSameMonth =
			current !== undefined &&
			candidate.snapshotDate.getTime() === current.snapshotDate.getTime() &&
			(candidate.updatedAt?.getTime() ?? 0) > (current.updatedAt?.getTime() ?? 0);

		if (hasNewerMonth || hasNewerUpdateInSameMonth) {
			latestByBankId.set(bankId, candidate);
		}
	});

	return bankDocuments.map(bank => {
		const latest = latestByBankId.get(bank.id);
		return {
			bankId: bank.id,
			bankName: bankNamesById[bank.id] ?? 'Banco sem nome',
			snapshotDate: latest?.snapshotDate ?? null,
			valueInCents: latest?.valueInCents ?? null,
		};
	});
};

// Esta leitura consolida apenas dados existentes. [[Previsão de Fluxo de Caixa]]
// não escreve despesas, ganhos ou resgates; movimentos de investimento entram no
// caixa, mas continuam excluídos do resultado de ganhos/despesas de [[Balanço Mensal]].
export const getFinancialForecastFirebase = async (
	personId: string,
	periodInMonths: FinancialForecastPeriod,
): Promise<FinancialForecastResult> => {
	try {
		if (!personId.trim()) {
			return { success: false, error: 'Usuário não informado.' };
		}

		const allowedPersonIds = await getAllowedPersonIds(personId);
		const [
			bankDocuments,
			monthlyBalanceDocuments,
			expenseDocuments,
			gainDocuments,
			cashRescueDocuments,
			mandatoryExpenseDocuments,
			mandatoryGainDocuments,
			investmentDocuments,
			tagDocuments,
		] = await Promise.all([
			getCollectionDocumentsForPeople('banks', allowedPersonIds),
			getCollectionDocumentsForPeople('monthlyBalances', allowedPersonIds),
			getCollectionDocumentsForPeople('expenses', allowedPersonIds),
			getCollectionDocumentsForPeople('gains', allowedPersonIds),
			getCollectionDocumentsForPeople('cashRescues', allowedPersonIds),
			getCollectionDocumentsForPeople('mandatoryExpenses', allowedPersonIds),
			getCollectionDocumentsForPeople('mandatoryGains', allowedPersonIds),
			getCollectionDocumentsForPeople('financeInvestments', allowedPersonIds),
			getCollectionDocumentsForPeople('tags', allowedPersonIds),
		]);

		const tagNamesById = getTagNamesById(tagDocuments);
		const expenses = expenseDocuments
			.map(document => normalizeMovement(document, 'expense', tagNamesById))
			.filter((movement): movement is FinancialForecastMovement => Boolean(movement));
		const gains = gainDocuments
			.map(document => normalizeMovement(document, 'gain', tagNamesById))
			.filter((movement): movement is FinancialForecastMovement => Boolean(movement));
		const movements = [...expenses, ...gains];
		const expenseIds = new Set(expenses.map(expense => expense.id));
		const gainIds = new Set(gains.map(gain => gain.id));
		const mandatoryTemplates = [
			...mandatoryExpenseDocuments
				.map(document =>
					normalizeMandatoryTemplate({
						document,
						type: 'expense',
						tagNamesById,
						linkedMovementIds: expenseIds,
					}),
				)
				.filter((template): template is FinancialForecastMandatoryTemplate => Boolean(template)),
			...mandatoryGainDocuments
				.map(document =>
					normalizeMandatoryTemplate({
						document,
						type: 'gain',
						tagNamesById,
						linkedMovementIds: gainIds,
					}),
				)
				.filter((template): template is FinancialForecastMandatoryTemplate => Boolean(template)),
		];
		const investments = investmentDocuments
			.map(normalizeInvestment)
			.filter((investment): investment is FinancialForecastInvestment => Boolean(investment));
		const cashRescues = cashRescueDocuments
			.map(normalizeCashRescue)
			.filter((rescue): rescue is FinancialForecastCashRescue => Boolean(rescue));
		const asOfDate = new Date();
		const opening = calculateFinancialForecastOpeningBalance({
			asOfDate,
			banks: buildBankSnapshots({ bankDocuments, monthlyBalanceDocuments, asOfDate }),
			movements,
			investments,
			cashRescues,
		});

		return {
			success: true,
			data: buildFinancialForecast({
				asOfDate,
				periodInMonths,
				openingBalanceInCents: opening.openingBalanceInCents,
				missingSnapshotBankNames: opening.missingSnapshotBankNames,
				movements,
				mandatoryTemplates,
				investments,
			}),
		};
	} catch (error) {
		console.error('Erro ao carregar previsão financeira:', error);
		return { success: false, error: 'Não foi possível carregar a previsão financeira.' };
	}
};
