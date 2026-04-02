import { db } from '@/FirebaseConfig';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import { computeMonthlyBankBalances, shouldIncludeMovementInGainExpenseTotals } from '@/utils/monthlyBalance';
import { isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import {
	collection,
	getDocs,
	limit as limitQuery,
	orderBy,
	query,
	Timestamp,
	where,
} from 'firebase/firestore';

type HomeBankRecord = {
	id: string;
	name: string;
	colorHex: string | null;
};

type HomeMovementDocument = Record<string, any>;
type HomeInvestmentDocument = Record<string, any>;
type HomeMonthlyBalanceDocument = Record<string, any>;

export type HomeBankBalanceCard = {
	id: string;
	name: string;
	balanceInCents: number | null;
	colorHex: string | null;
};

export type HomeCashSummary = {
	id: 'cash-transactions';
	name: 'Dinheiro';
	balanceInCents: number;
	currentMonthExpensesInCents: number;
	currentMonthGainsInCents: number;
};

export type HomeInvestmentItem = {
	id: string;
	name: string;
	bankId: string | null;
	bankNameSnapshot: string | null;
	initialValueInCents: number;
	currentBaseValueInCents: number;
	simulatedValueInCents: number;
	estimatedGainInCents: number;
	cdiPercentage: number;
	lastManualSyncValueInCents: number | null;
	lastManualSyncAt: Date | null;
	createdAt: Date | null;
};

export type HomeInvestmentPortfolio = {
	items: HomeInvestmentItem[];
	totalCurrentBaseInCents: number;
	totalInitialInCents: number;
	totalSimulatedInCents: number;
	totalEstimatedGainInCents: number;
	investmentCount: number;
};

export type HomeTimelineMovement = {
	id: string;
	type: 'expense' | 'gain';
	name: string;
	valueInCents: number;
	date: Date | null;
	bankId: string | null;
	bankName: string | null;
	explanation: string | null;
	moneyFormat: boolean | null;
	isBankTransfer: boolean;
	bankTransferDirection: 'incoming' | 'outgoing' | null;
	bankTransferSourceBankNameSnapshot: string | null;
	bankTransferTargetBankNameSnapshot: string | null;
	isInvestmentDeposit: boolean;
	isInvestmentRedemption: boolean;
	investmentNameSnapshot: string | null;
	isFromMandatory: boolean;
};

export type HomeOverviewData = {
	bankBalances: HomeBankBalanceCard[];
	cashSummary: HomeCashSummary | null;
	currentMonthExpensesByBankId: Record<string, number>;
	currentMonthGainsByBankId: Record<string, number>;
};

export type HomeMovementsData = {
	timelineMovements: HomeTimelineMovement[];
	bankColorsById: Record<string, string | null>;
};

export type HomeInvestmentsData = {
	portfolio: HomeInvestmentPortfolio;
};

export type HomeSectionResult<T> =
	| {
			success: true;
			data: T;
	  }
	| {
			success: false;
			error: string;
	  };

export type HomeSnapshot = {
	overview: HomeSectionResult<HomeOverviewData>;
	movements: HomeSectionResult<HomeMovementsData>;
	investments: HomeSectionResult<HomeInvestmentsData>;
};

type HomeQueryContext = {
	allowedPersonIds: string[];
	banks: HomeBankRecord[];
	bankIds: string[];
	bankNamesById: Record<string, string>;
	bankColorsById: Record<string, string | null>;
	currentYear: number;
	currentMonth: number;
	startOfMonth: Date;
	endOfMonth: Date;
};

type NormalizedInvestmentSummary = {
	id: string;
	name: string;
	initialValueInCents: number;
	currentValueInCents: number;
	cdiPercentage: number;
	bankId: string | null;
	bankNameSnapshot: string | null;
	lastManualSyncValueInCents: number | null;
	lastManualSyncAt: Date | null;
	createdAt: Date | null;
};

const DAYS_IN_YEAR = 365;
const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;
const BASE_CDI_ANNUAL_RATE = 0.1375;

const EMPTY_OVERVIEW_DATA: HomeOverviewData = {
	bankBalances: [],
	cashSummary: null,
	currentMonthExpensesByBankId: {},
	currentMonthGainsByBankId: {},
};

const EMPTY_MOVEMENTS_DATA: HomeMovementsData = {
	timelineMovements: [],
	bankColorsById: {},
};

export const createEmptyInvestmentPortfolio = (): HomeInvestmentPortfolio => ({
	items: [],
	totalCurrentBaseInCents: 0,
	totalInitialInCents: 0,
	totalSimulatedInCents: 0,
	totalEstimatedGainInCents: 0,
	investmentCount: 0,
});

const normalizeTransferDirection = (value: unknown): 'incoming' | 'outgoing' | null => {
	if (value === 'incoming' || value === 'outgoing') {
		return value;
	}

	return null;
};

const parseToDate = (value: unknown): Date | null => {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}

	if (typeof value === 'object' && value !== null) {
		if ('toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
			const parsedFromTimestamp = (value as { toDate?: () => Date }).toDate?.();
			if (parsedFromTimestamp instanceof Date && !Number.isNaN(parsedFromTimestamp.getTime())) {
				return parsedFromTimestamp;
			}
		}

		if ('seconds' in value && typeof (value as { seconds?: number }).seconds === 'number') {
			const secondsValue = (value as { seconds?: number }).seconds ?? 0;
			const dateFromSeconds = new Date(secondsValue * 1000);
			if (!Number.isNaN(dateFromSeconds.getTime())) {
				return dateFromSeconds;
			}
		}
	}

	if (typeof value === 'string' || typeof value === 'number') {
		const parsedDate = new Date(value);
		if (!Number.isNaN(parsedDate.getTime())) {
			return parsedDate;
		}
	}

	return null;
};

const aggregateMonthlyValuesByBankId = (items: HomeMovementDocument[], bankIds: Set<string>) =>
	items.reduce<Record<string, number>>((acc, item) => {
		if (!shouldIncludeMovementInGainExpenseTotals(item)) {
			return acc;
		}

		const bankId =
			typeof item?.bankId === 'string' && item.bankId.trim().length > 0 ? item.bankId.trim() : null;
		if (!bankId || !bankIds.has(bankId)) {
			return acc;
		}

		const value =
			typeof item?.valueInCents === 'number' && Number.isFinite(item.valueInCents) ? item.valueInCents : 0;
		acc[bankId] = (acc[bankId] ?? 0) + Math.max(value, 0);
		return acc;
	}, {});

const sumMovementValues = (items: HomeMovementDocument[]) =>
	items.reduce((accumulator, item) => {
		const value =
			typeof item?.valueInCents === 'number' && Number.isFinite(item.valueInCents) ? item.valueInCents : 0;
		return accumulator + Math.max(value, 0);
	}, 0);

const calculateInvestmentDailyRate = (cdiPercentage: number) => {
	if (!Number.isFinite(cdiPercentage) || cdiPercentage <= 0) {
		return 0;
	}

	return (BASE_CDI_ANNUAL_RATE * (cdiPercentage / 100)) / DAYS_IN_YEAR;
};

const resolveInvestmentBaseValueInCents = (investment: NormalizedInvestmentSummary) => {
	if (typeof investment.currentValueInCents === 'number') {
		return investment.currentValueInCents;
	}

	if (typeof investment.lastManualSyncValueInCents === 'number') {
		return investment.lastManualSyncValueInCents;
	}

	return investment.initialValueInCents;
};

const resolveInvestmentBaseDate = (investment: NormalizedInvestmentSummary) => {
	return investment.lastManualSyncAt ?? investment.createdAt ?? new Date();
};

const simulateInvestmentValueInCents = (investment: NormalizedInvestmentSummary) => {
	const baseValueInCents = resolveInvestmentBaseValueInCents(investment);
	const dailyRate = calculateInvestmentDailyRate(investment.cdiPercentage);
	if (dailyRate <= 0) {
		return baseValueInCents;
	}

	const baseDate = resolveInvestmentBaseDate(investment);
	const diff = Date.now() - baseDate.getTime();
	const days = diff > 0 ? Math.floor(diff / MILLISECONDS_IN_DAY) : 0;
	const simulatedBRL = (baseValueInCents / 100) * Math.pow(1 + dailyRate, days);
	return Math.round(simulatedBRL * 100);
};

const buildAllowedPersonIds = async (personId: string) => {
	const relatedUsersResult = await getRelatedUsersIDsFirebase(personId);
	if (!relatedUsersResult.success) {
		throw new Error('Erro ao obter usuários relacionados.');
	}

	const relatedUserIds = Array.isArray(relatedUsersResult.data) ? relatedUsersResult.data : [];
	return Array.from(
		new Set(
			[personId, ...relatedUserIds].filter(
				(candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
			),
		),
	);
};

const buildHomeQueryContext = async (personId: string): Promise<HomeQueryContext> => {
	const allowedPersonIds = await buildAllowedPersonIds(personId);
	const banksQuery = query(collection(db, 'banks'), where('personId', 'in', allowedPersonIds));
	const banksSnapshot = await getDocs(banksQuery);

	const banks = banksSnapshot.docs.map(bankDoc => {
		const data = bankDoc.data() as Record<string, unknown>;
		const name =
			typeof data.name === 'string' && data.name.trim().length > 0 ? data.name.trim() : 'Banco sem nome';
		const colorHex =
			typeof data.colorHex === 'string' && data.colorHex.trim().length > 0 ? data.colorHex.trim() : null;

		return {
			id: bankDoc.id,
			name,
			colorHex,
		} satisfies HomeBankRecord;
	});

	const bankNamesById = banks.reduce<Record<string, string>>((acc, bank) => {
		acc[bank.id] = bank.name;
		return acc;
	}, {});

	const bankColorsById = banks.reduce<Record<string, string | null>>((acc, bank) => {
		acc[bank.id] = bank.colorHex;
		return acc;
	}, {});

	const now = new Date();
	const currentYear = now.getFullYear();
	const currentMonth = now.getMonth() + 1;
	const startOfMonth = new Date(currentYear, currentMonth - 1, 1);
	const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

	return {
		allowedPersonIds,
		banks,
		bankIds: banks.map(bank => bank.id),
		bankNamesById,
		bankColorsById,
		currentYear,
		currentMonth,
		startOfMonth,
		endOfMonth,
	};
};

const loadOverviewSection = async (context: HomeQueryContext): Promise<HomeOverviewData> => {
	const bankIdsSet = new Set(context.bankIds);
	const monthlyBalancesQuery = query(
		collection(db, 'monthlyBalances'),
		where('personId', 'in', context.allowedPersonIds),
		where('year', '==', context.currentYear),
		where('month', '==', context.currentMonth),
	);
	const monthlyExpensesQuery = query(
		collection(db, 'expenses'),
		where('personId', 'in', context.allowedPersonIds),
		where('date', '>=', Timestamp.fromDate(context.startOfMonth)),
		where('date', '<=', Timestamp.fromDate(context.endOfMonth)),
	);
	const monthlyGainsQuery = query(
		collection(db, 'gains'),
		where('personId', 'in', context.allowedPersonIds),
		where('date', '>=', Timestamp.fromDate(context.startOfMonth)),
		where('date', '<=', Timestamp.fromDate(context.endOfMonth)),
	);
	const monthlyInvestmentsQuery = query(
		collection(db, 'financeInvestments'),
		where('personId', 'in', context.allowedPersonIds),
		where('date', '>=', context.startOfMonth),
		where('date', '<=', context.endOfMonth),
	);
	const cashRescuesQuery = query(
		collection(db, 'cashRescues'),
		where('personId', 'in', context.allowedPersonIds),
		where('date', '>=', Timestamp.fromDate(context.startOfMonth)),
		where('date', '<=', Timestamp.fromDate(context.endOfMonth)),
	);

	const [
		monthlyBalancesSnapshot,
		monthlyExpensesSnapshot,
		monthlyGainsSnapshot,
		monthlyInvestmentsSnapshot,
		cashRescuesSnapshot,
	] = await Promise.all([
		getDocs(monthlyBalancesQuery),
		getDocs(monthlyExpensesQuery),
		getDocs(monthlyGainsQuery),
		getDocs(monthlyInvestmentsQuery),
		getDocs(cashRescuesQuery),
	]);
	const normalizedCashRescues = cashRescuesSnapshot.docs.map<HomeMovementDocument>(docSnap => ({
		id: docSnap.id,
		...(docSnap.data() as HomeMovementDocument),
		isCashRescue: true,
	}));

	const monthlyExpenses = monthlyExpensesSnapshot.docs
		.map<HomeMovementDocument>(docSnap => ({ id: docSnap.id, ...(docSnap.data() as HomeMovementDocument) }))
		.filter(item => {
			const bankId = typeof item.bankId === 'string' ? item.bankId : null;
			return Boolean(bankId && bankIdsSet.has(bankId));
		});
	const monthlyGains = monthlyGainsSnapshot.docs
		.map<HomeMovementDocument>(docSnap => ({ id: docSnap.id, ...(docSnap.data() as HomeMovementDocument) }))
		.filter(item => {
			const bankId = typeof item.bankId === 'string' ? item.bankId : null;
			return Boolean(bankId && bankIdsSet.has(bankId));
		});
	const cashRescues = normalizedCashRescues.filter(item => {
			const bankId = typeof item.bankId === 'string' ? item.bankId : null;
			return Boolean(bankId && bankIdsSet.has(bankId));
		});
	const cashExpenses = monthlyExpensesSnapshot.docs
		.map<HomeMovementDocument>(docSnap => ({ id: docSnap.id, ...(docSnap.data() as HomeMovementDocument) }))
		.filter(item => item?.bankId == null);
	const cashGains = monthlyGainsSnapshot.docs
		.map<HomeMovementDocument>(docSnap => ({ id: docSnap.id, ...(docSnap.data() as HomeMovementDocument) }))
		.filter(item => item?.bankId == null);
	const cashGainsWithRescues = [...cashGains, ...normalizedCashRescues];
	const monthlyInvestments = monthlyInvestmentsSnapshot.docs
		.map<HomeInvestmentDocument>(docSnap => ({
			id: docSnap.id,
			...(docSnap.data() as HomeInvestmentDocument),
		}))
		.filter(item => {
			const bankId = typeof item.bankId === 'string' ? item.bankId : null;
			return Boolean(bankId && bankIdsSet.has(bankId));
		});

	const initialBalancesByBank = monthlyBalancesSnapshot.docs.reduce<Record<string, number | null>>((acc, docSnap) => {
		const data = docSnap.data() as HomeMonthlyBalanceDocument;
		const bankId = typeof data.bankId === 'string' ? data.bankId : null;
		if (!bankId || !bankIdsSet.has(bankId) || bankId in acc) {
			return acc;
		}

		acc[bankId] = typeof data.valueInCents === 'number' ? data.valueInCents : null;
		return acc;
	}, {});

	const investmentsByBank = monthlyInvestments.reduce<Record<string, HomeInvestmentDocument[]>>((acc, item) => {
		const bankId = typeof item.bankId === 'string' ? item.bankId : null;
		if (!bankId || !bankIdsSet.has(bankId)) {
			return acc;
		}

		const normalizedInvestment = {
			...item,
			initialValueInCents:
				typeof item.initialValueInCents === 'number'
					? item.initialValueInCents
					: typeof item.initialInvestedInCents === 'number'
						? item.initialInvestedInCents
						: undefined,
			initialInvestedInCents:
				typeof item.initialInvestedInCents === 'number' ? item.initialInvestedInCents : undefined,
			currentValueInCents:
				typeof item.currentValueInCents === 'number'
					? item.currentValueInCents
					: typeof item.lastManualSyncValueInCents === 'number'
						? item.lastManualSyncValueInCents
						: typeof item.initialValueInCents === 'number'
							? item.initialValueInCents
							: undefined,
		};

		if (!acc[bankId]) {
			acc[bankId] = [];
		}

		acc[bankId].push(normalizedInvestment);
		return acc;
	}, {});

	const bankSummaries = computeMonthlyBankBalances({
		banks: context.banks,
		initialBalancesByBank,
		expenses: [...monthlyExpenses, ...cashRescues],
		gains: monthlyGains,
		investmentsByBank,
	});

	return {
		bankBalances: bankSummaries.map(bank => ({
			id: bank.id,
			name: bank.name,
			balanceInCents: bank.currentBalanceInCents,
			colorHex: bank.colorHex,
		})),
		cashSummary: {
			id: 'cash-transactions',
			name: 'Dinheiro',
			balanceInCents: sumMovementValues(cashGainsWithRescues) - sumMovementValues(cashExpenses),
			currentMonthExpensesInCents: sumMovementValues(cashExpenses),
			currentMonthGainsInCents: sumMovementValues(cashGainsWithRescues),
		},
		currentMonthExpensesByBankId: aggregateMonthlyValuesByBankId([...monthlyExpenses, ...cashRescues], bankIdsSet),
		currentMonthGainsByBankId: aggregateMonthlyValuesByBankId(monthlyGains, bankIdsSet),
	};
};

const loadMovementsSection = async (context: HomeQueryContext): Promise<HomeMovementsData> => {
	const recentExpensesQuery = query(
		collection(db, 'expenses'),
		where('personId', 'in', context.allowedPersonIds),
		orderBy('date', 'desc'),
		limitQuery(6),
	);
	const recentGainsQuery = query(
		collection(db, 'gains'),
		where('personId', 'in', context.allowedPersonIds),
		orderBy('date', 'desc'),
		limitQuery(6),
	);
	const mandatoryExpensesQuery = query(
		collection(db, 'mandatoryExpenses'),
		where('personId', 'in', context.allowedPersonIds),
	);
	const mandatoryGainsQuery = query(
		collection(db, 'mandatoryGains'),
		where('personId', 'in', context.allowedPersonIds),
	);

	const [
		recentExpensesSnapshot,
		recentGainsSnapshot,
		mandatoryExpensesSnapshot,
		mandatoryGainsSnapshot,
	] = await Promise.all([
		getDocs(recentExpensesQuery),
		getDocs(recentGainsQuery),
		getDocs(mandatoryExpensesQuery),
		getDocs(mandatoryGainsQuery),
	]);

	const mandatoryExpenseIds = new Set(
		mandatoryExpensesSnapshot.docs
			.map(
				docSnap =>
					({ id: docSnap.id, ...(docSnap.data() as HomeMovementDocument) }) as HomeMovementDocument & {
						id: string;
					},
			)
			.filter(
				item =>
					typeof item.lastPaymentExpenseId === 'string' &&
					isCycleKeyCurrent(typeof item.lastPaymentCycle === 'string' ? item.lastPaymentCycle : undefined),
			)
			.map(item => item.lastPaymentExpenseId as string),
	);

	const mandatoryGainIds = new Set(
		mandatoryGainsSnapshot.docs
			.map(
				docSnap =>
					({ id: docSnap.id, ...(docSnap.data() as HomeMovementDocument) }) as HomeMovementDocument & {
						id: string;
					},
			)
			.filter(
				item =>
					typeof item.lastReceiptGainId === 'string' &&
					isCycleKeyCurrent(typeof item.lastReceiptCycle === 'string' ? item.lastReceiptCycle : undefined),
			)
			.map(item => item.lastReceiptGainId as string),
	);

	const normalizeMovement = (
		item: HomeMovementDocument,
		type: 'expense' | 'gain',
	): HomeTimelineMovement => {
		const movementId =
			typeof item?.id === 'string' && item.id.length > 0
				? item.id
				: `${type}-${String(item?.createdAt ?? item?.date ?? Math.random())}`;
		const bankId =
			typeof item?.bankId === 'string' && item.bankId.trim().length > 0 ? item.bankId.trim() : null;
		const parsedDate = parseToDate(item?.date ?? item?.createdAt);
		const explanation =
			typeof item?.explanation === 'string' && item.explanation.trim().length > 0
				? item.explanation.trim()
				: null;
		const investmentNameSnapshot =
			typeof item?.investmentNameSnapshot === 'string' && item.investmentNameSnapshot.trim().length > 0
				? item.investmentNameSnapshot.trim()
				: null;
		const sourceBankName =
			typeof item?.bankTransferSourceBankNameSnapshot === 'string' &&
			item.bankTransferSourceBankNameSnapshot.trim().length > 0
				? item.bankTransferSourceBankNameSnapshot.trim()
				: null;
		const targetBankName =
			typeof item?.bankTransferTargetBankNameSnapshot === 'string' &&
			item.bankTransferTargetBankNameSnapshot.trim().length > 0
				? item.bankTransferTargetBankNameSnapshot.trim()
				: null;
		const isFromMandatory =
			type === 'expense' ? mandatoryExpenseIds.has(movementId) : mandatoryGainIds.has(movementId);

		return {
			id: movementId,
			type,
			name:
				typeof item?.name === 'string' && item.name.trim().length > 0
					? item.name.trim()
					: type === 'expense'
						? 'Despesa sem nome'
						: 'Ganho sem nome',
			valueInCents:
				typeof item?.valueInCents === 'number' && !Number.isNaN(item.valueInCents)
					? item.valueInCents
					: 0,
			date: parsedDate,
			bankId,
			bankName: bankId ? context.bankNamesById[bankId] ?? 'Banco não identificado' : null,
			explanation,
			moneyFormat: typeof item?.moneyFormat === 'boolean' ? item.moneyFormat : null,
			isBankTransfer: Boolean(item?.isBankTransfer),
			bankTransferDirection: normalizeTransferDirection(item?.bankTransferDirection),
			bankTransferSourceBankNameSnapshot: sourceBankName,
			bankTransferTargetBankNameSnapshot: targetBankName,
			isInvestmentDeposit: Boolean(item?.isInvestmentDeposit),
			isInvestmentRedemption: Boolean(item?.isInvestmentRedemption),
			investmentNameSnapshot,
			isFromMandatory,
		};
	};

	const timelineMovements = [
		...recentExpensesSnapshot.docs.map(docSnap =>
			normalizeMovement({ id: docSnap.id, ...(docSnap.data() as HomeMovementDocument) }, 'expense'),
		),
		...recentGainsSnapshot.docs.map(docSnap =>
			normalizeMovement({ id: docSnap.id, ...(docSnap.data() as HomeMovementDocument) }, 'gain'),
		),
	]
		.sort((left, right) => {
			const leftTime = left.date?.getTime() ?? 0;
			const rightTime = right.date?.getTime() ?? 0;
			return rightTime - leftTime;
		})
		.slice(0, 6);

	return {
		timelineMovements,
		bankColorsById: context.bankColorsById,
	};
};

const loadInvestmentsSection = async (context: HomeQueryContext): Promise<HomeInvestmentsData> => {
	const investmentsQuery = query(
		collection(db, 'financeInvestments'),
		where('personId', 'in', context.allowedPersonIds),
		orderBy('createdAt', 'desc'),
		limitQuery(50),
	);
	const investmentsSnapshot = await getDocs(investmentsQuery);
	const normalizedInvestments: NormalizedInvestmentSummary[] = investmentsSnapshot.docs.map(docSnap => {
		const investment = docSnap.data() as HomeInvestmentDocument;
		const initialValueInCents =
			typeof investment.initialValueInCents === 'number'
				? investment.initialValueInCents
				: typeof investment.initialInvestedInCents === 'number'
					? investment.initialInvestedInCents
					: 0;
		const currentValueInCents =
			typeof investment.currentValueInCents === 'number'
				? investment.currentValueInCents
				: typeof investment.lastManualSyncValueInCents === 'number'
					? investment.lastManualSyncValueInCents
					: initialValueInCents;
		const lastManualSyncValueInCents =
			typeof investment.lastManualSyncValueInCents === 'number' ? investment.lastManualSyncValueInCents : null;

		return {
			id: docSnap.id,
			name:
				typeof investment.name === 'string' && investment.name.trim().length > 0
					? investment.name.trim()
					: 'Investimento sem nome',
			initialValueInCents,
			currentValueInCents,
			cdiPercentage: typeof investment.cdiPercentage === 'number' ? investment.cdiPercentage : 0,
			bankId: typeof investment.bankId === 'string' ? investment.bankId : null,
			bankNameSnapshot:
				typeof investment.bankNameSnapshot === 'string' && investment.bankNameSnapshot.trim().length > 0
					? investment.bankNameSnapshot.trim()
					: null,
			lastManualSyncValueInCents,
			lastManualSyncAt: parseToDate(investment.lastManualSyncAt),
			createdAt: parseToDate(investment.createdAt ?? investment.createdAtISO ?? investment.createdAtUtc),
		};
	});

	const portfolioItems = normalizedInvestments
		.map<HomeInvestmentItem>(investment => {
			const currentBaseValueInCents = resolveInvestmentBaseValueInCents(investment);
			const simulatedValueInCents = simulateInvestmentValueInCents(investment);

			return {
				id: investment.id,
				name: investment.name,
				bankId: investment.bankId,
				bankNameSnapshot: investment.bankNameSnapshot,
				initialValueInCents: investment.initialValueInCents,
				currentBaseValueInCents,
				simulatedValueInCents,
				estimatedGainInCents: simulatedValueInCents - currentBaseValueInCents,
				cdiPercentage: investment.cdiPercentage,
				lastManualSyncValueInCents: investment.lastManualSyncValueInCents,
				lastManualSyncAt: investment.lastManualSyncAt,
				createdAt: investment.createdAt,
			};
		})
		.sort((left, right) => right.simulatedValueInCents - left.simulatedValueInCents);

	return {
		portfolio: {
			items: portfolioItems,
			totalCurrentBaseInCents: portfolioItems.reduce(
				(accumulator, investment) => accumulator + investment.currentBaseValueInCents,
				0,
			),
			totalInitialInCents: portfolioItems.reduce(
				(accumulator, investment) => accumulator + investment.initialValueInCents,
				0,
			),
			totalSimulatedInCents: portfolioItems.reduce(
				(accumulator, investment) => accumulator + investment.simulatedValueInCents,
				0,
			),
			totalEstimatedGainInCents: portfolioItems.reduce(
				(accumulator, investment) => accumulator + investment.estimatedGainInCents,
				0,
			),
			investmentCount: portfolioItems.length,
		},
	};
};

const toSectionError = (sectionName: string, error: unknown) => {
	console.error(`Erro ao carregar ${sectionName} da Home:`, error);

	if (sectionName === 'investimentos') {
		return 'Não foi possível carregar os investimentos.';
	}

	if (sectionName === 'movimentações') {
		return 'Não foi possível carregar alguns movimentos recentes.';
	}

	return 'Não foi possível carregar o resumo dos bancos.';
};

export async function getHomeSnapshotFirebase(
	personId: string,
): Promise<{ success: true; data: HomeSnapshot } | { success: false; error: unknown }> {
	try {
		const context = await buildHomeQueryContext(personId);
		const [overviewResult, movementsResult, investmentsResult] = await Promise.allSettled([
			loadOverviewSection(context),
			loadMovementsSection(context),
			loadInvestmentsSection(context),
		]);

		return {
			success: true,
			data: {
				overview:
					overviewResult.status === 'fulfilled'
						? { success: true, data: overviewResult.value }
						: { success: false, error: toSectionError('resumo bancário', overviewResult.reason) },
				movements:
					movementsResult.status === 'fulfilled'
						? { success: true, data: movementsResult.value }
						: { success: false, error: toSectionError('movimentações', movementsResult.reason) },
				investments:
					investmentsResult.status === 'fulfilled'
						? { success: true, data: investmentsResult.value }
						: { success: false, error: toSectionError('investimentos', investmentsResult.reason) },
			},
		};
	} catch (error) {
		console.error('Erro fatal ao montar snapshot da Home:', error);
		return { success: false, error };
	}
}

export const EMPTY_HOME_OVERVIEW_DATA = EMPTY_OVERVIEW_DATA;
export const EMPTY_HOME_MOVEMENTS_DATA = EMPTY_MOVEMENTS_DATA;
