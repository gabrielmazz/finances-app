import { db } from '@/FirebaseConfig';
import { getInvestmentCdiRatesByPersonIdsFirebase } from '@/functions/InvestmentCdiRateFirebase';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import { calculateLegacyBankBalanceInCents, shouldIncludeMovementInGainExpenseTotals } from '@/utils/monthlyBalance';
import { getLegacyBankBalancesInCentsFirebase } from '@/functions/BankFirebase';
import {
	getFinancialLedgerAccountsFirebase,
	getFinancialLedgerContextFirebase,
	getFinancialLedgerTransactionsFirebase,
	type FinancialLedgerAccount,
} from '@/functions/FinancialLedgerFirebase';
import type { LedgerTransaction } from '@/utils/financialLedger';
import { endOfFinancialCivilDay, fromFinancialCivilDate, toFinancialCivilDate } from '@/utils/financialCivilDate';
import { isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import {
	getInvestmentAssetType,
	getInvestmentValuationMethod,
	normalizeCdiPercentageInBasisPoints,
	projectInvestmentValueInCents,
	type InvestmentAssetType,
	type InvestmentCdiRate,
	type InvestmentValuationMethod,
} from '@/utils/investmentPortfolio';
import {
	buildHomeExpenseHistory,
	type HomeExpenseHistorySource,
	type HomeExpenseHistoryMonth,
} from '@/utils/homeExpenseHistory';
import {
	buildHomeActivityHeatmap,
	type HomeActivityHeatmap,
	type HomeActivityHeatmapSource,
} from '@/utils/homeActivityHeatmap';
import {
	buildHomeMandatorySchedule,
	type HomeMandatoryItem,
} from '@/utils/homeMandatorySchedule';
import {
	collection,
	getDocs,
	limit as limitQuery,
	orderBy,
	query,
	Timestamp,
	where,
	type QueryDocumentSnapshot,
	type QueryConstraint,
} from 'firebase/firestore';

type HomeBankRecord = {
	id: string;
	name: string;
	colorHex: string | null;
};

type HomeMovementDocument = Record<string, any>;
type HomeInvestmentDocument = Record<string, any>;
type HomeTagMetadata = {
	name: string | null;
	iconFamily: string | null;
	iconName: string | null;
	iconStyle: string | null;
};

export type HomeBankBalanceCard = {
	id: string;
	name: string;
	balanceInCents: number | null;
	colorHex: string | null;
};

export type HomeCashSummary = {
	id: 'cash-transactions';
	name: string;
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
	type: 'expense' | 'gain' | 'sync';
	name: string;
	valueInCents: number;
	date: Date | null;
	tagId: string | null;
	tagName: string | null;
	tagIconFamily: string | null;
	tagIconName: string | null;
	tagIconStyle: string | null;
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
	isFinanceInvestmentSync: boolean;
	investmentSyncPreviousValueInCents: number | null;
	investmentSyncReason: 'manual' | 'deposit' | 'withdrawal' | null;
	investmentNameSnapshot: string | null;
	isFromMandatory: boolean;
};

export type HomeOverviewData = {
	bankBalances: HomeBankBalanceCard[];
	cashSummary: HomeCashSummary | null;
	currentMonthExpensesByBankId: Record<string, number>;
	currentMonthGainsByBankId: Record<string, number>;
	expenseHistoryLastThreeMonths: HomeExpenseHistoryMonth[];
	activityHeatmap: HomeActivityHeatmap;
	upcomingMandatoryItems: HomeMandatoryItem[];
};

export type HomeBalancesData = {
	bankBalances: HomeBankBalanceCard[];
	cashSummary: Pick<HomeCashSummary, 'id' | 'name' | 'balanceInCents'> | null;
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
	personId: string;
	allowedPersonIds: string[];
	banks: HomeBankRecord[];
	bankIds: string[];
	bankNamesById: Record<string, string>;
	bankColorsById: Record<string, string | null>;
	startOfMonth: Date;
	endOfMonth: Date;
	startOfExpenseHistory: Date;
	startOfActivityYear: Date;
	asOfDate: Date;
	financialLedgerAccounts: FinancialLedgerAccount[] | null;
	financialLedgerGroupId: string | null;
	ledgerTransactions?: Promise<LedgerTransaction[]>;
	metadataDocuments?: Map<string, Promise<{ docs: QueryDocumentSnapshot[] }>>;
};

type NormalizedInvestmentSummary = {
	id: string;
	personId: string;
	name: string;
	initialValueInCents: number;
	currentValueInCents: number;
	cdiPercentage: number;
	cdiPercentageInBasisPoints: number;
	assetType: InvestmentAssetType;
	valuationMethod: InvestmentValuationMethod;
	bankId: string | null;
	bankNameSnapshot: string | null;
	lastManualSyncValueInCents: number | null;
	lastManualSyncAt: Date | null;
	investmentDate: Date | null;
	createdAt: Date | null;
};

const EMPTY_OVERVIEW_DATA: HomeOverviewData = {
	bankBalances: [],
	cashSummary: null,
	currentMonthExpensesByBankId: {},
	currentMonthGainsByBankId: {},
	expenseHistoryLastThreeMonths: [],
	activityHeatmap: buildHomeActivityHeatmap([]),
	upcomingMandatoryItems: [],
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

const buildLedgerInvestmentPortfolio = (accounts: FinancialLedgerAccount[], transactions: LedgerTransaction[], rates: InvestmentCdiRate[], asOfDate: Date): HomeInvestmentPortfolio => {
	// [[Investimentos]]: estimates use a verified base and never replace ledger balances.
	const portfolioItems = accounts
		.filter(account => account.kind === 'investment')
		.map<HomeInvestmentItem>(account => {
			const accountDate = parseToDate(account.date);
			const materializedEvents = transactions.filter(transaction => transaction.legs.some(leg => leg.accountId === account.id)).sort((left, right) => right.effectiveAt.getTime() - left.effectiveAt.getTime());
			const baseDate = materializedEvents[0]?.effectiveAt ?? accountDate;
			const percentage = account.cdiPercentageInBasisPoints ?? 0;
			const simulatedValueInCents = account.personId && baseDate && percentage > 0
				? projectInvestmentValueInCents({
					valueInCents: account.currentBalanceInCents, fromDate: toFinancialCivilDate(baseDate), toDate: toFinancialCivilDate(asOfDate),
					personId: account.personId, cdiPercentageInBasisPoints: percentage,
					assetType: getInvestmentAssetType(account.assetType), valuationMethod: getInvestmentValuationMethod(account.valuationMethod, getInvestmentAssetType(account.assetType)),
					rates: rates.map(rate => ({ ...rate, effectiveFrom: toFinancialCivilDate(rate.effectiveFrom) })),
				}).valueInCents : account.currentBalanceInCents;
			const lastSync = materializedEvents.find(transaction => transaction.kind === 'reconciliation_adjustment');
			return {
			id: account.id,
			name: account.name,
			bankId: account.bankAccountId ?? null,
			bankNameSnapshot: accounts.find(candidate => candidate.id === account.bankAccountId)?.name ?? null,
			initialValueInCents: account.initialValueInCents ?? account.currentBalanceInCents,
			currentBaseValueInCents: account.currentBalanceInCents,
			simulatedValueInCents,
			estimatedGainInCents: simulatedValueInCents - account.currentBalanceInCents,
			cdiPercentage: percentage / 100,
			lastManualSyncValueInCents: materializedEvents[0] === lastSync ? account.currentBalanceInCents : null,
			lastManualSyncAt: lastSync?.effectiveAt ?? null,
			createdAt: accountDate,
		};
		})
		.sort((left, right) => right.currentBaseValueInCents - left.currentBaseValueInCents);

	return {
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
		totalEstimatedGainInCents: portfolioItems.reduce((sum, item) => sum + item.estimatedGainInCents, 0),
		investmentCount: portfolioItems.length,
	};
};

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
	return investment.lastManualSyncAt ?? investment.investmentDate ?? investment.createdAt ?? new Date();
};

const simulateInvestmentValueInCents = (
	investment: NormalizedInvestmentSummary,
	rates: InvestmentCdiRate[],
) => {
	const baseValueInCents = resolveInvestmentBaseValueInCents(investment);

	return projectInvestmentValueInCents({
		valueInCents: baseValueInCents,
		fromDate: resolveInvestmentBaseDate(investment),
		toDate: new Date(),
		personId: investment.personId,
		cdiPercentageInBasisPoints: investment.cdiPercentageInBasisPoints,
		assetType: investment.assetType,
		valuationMethod: investment.valuationMethod,
		rates,
	}).valueInCents;
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

const readHomeDocumentsForPeople = async (collectionName: string, allowedPersonIds: string[], constraints: QueryConstraint[] = []): Promise<{ docs: QueryDocumentSnapshot[] }> => {
	const chunks = Array.from({ length: Math.ceil(allowedPersonIds.length / 10) }, (_, index) => allowedPersonIds.slice(index * 10, (index + 1) * 10));
	const snapshots = await Promise.all(chunks.map(ids => getDocs(query(collection(db, collectionName), where('personId', 'in', ids), ...constraints))));
	return { docs: snapshots.flatMap(snapshot => snapshot.docs) };
};

const buildHomeQueryContext = async (personId: string): Promise<HomeQueryContext> => {
	const allowedPersonIds = await buildAllowedPersonIds(personId);
	const financialLedgerContext = await getFinancialLedgerContextFirebase(personId);
	const now = new Date();
	const civilNow = toFinancialCivilDate(now);
	const asOfDate = endOfFinancialCivilDay(now);
	const startOfMonth = fromFinancialCivilDate(new Date(civilNow.getFullYear(), civilNow.getMonth(), 1));
	const endOfMonth = fromFinancialCivilDate(new Date(civilNow.getFullYear(), civilNow.getMonth() + 1, 0, 23, 59, 59, 999));
	const startOfExpenseHistory = fromFinancialCivilDate(new Date(civilNow.getFullYear(), civilNow.getMonth() - 2, 1));
	const startOfActivityYear = fromFinancialCivilDate(new Date(civilNow.getFullYear(), 0, 1));

	if (financialLedgerContext) {
		const accounts = await getFinancialLedgerAccountsFirebase(financialLedgerContext.groupId);
		const banks = accounts
			.filter(account => account.kind === 'bank')
			.map(account => ({ id: account.id, name: account.name, colorHex: account.colorHex ?? null }));
		return {
			personId,
			allowedPersonIds,
			banks,
			bankIds: banks.map(bank => bank.id),
			bankNamesById: banks.reduce<Record<string, string>>((acc, bank) => ({ ...acc, [bank.id]: bank.name }), {}),
			bankColorsById: banks.reduce<Record<string, string | null>>((acc, bank) => ({ ...acc, [bank.id]: bank.colorHex }), {}),
			startOfMonth,
			endOfMonth,
				startOfExpenseHistory,
				startOfActivityYear,
			asOfDate,
			financialLedgerAccounts: accounts,
			financialLedgerGroupId: financialLedgerContext.groupId,
		};
	}
	const banksSnapshot = await readHomeDocumentsForPeople('banks', allowedPersonIds);

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

	return {
		personId,
		allowedPersonIds,
		banks,
		bankIds: banks.map(bank => bank.id),
		bankNamesById,
		bankColorsById,
		startOfMonth,
		endOfMonth,
		startOfExpenseHistory,
		startOfActivityYear,
		asOfDate,
		financialLedgerAccounts: null,
		financialLedgerGroupId: null,
	};
};

const loadLedgerTransactions = (context: HomeQueryContext) => {
	if (!context.ledgerTransactions) context.ledgerTransactions = getFinancialLedgerTransactionsFirebase(context.financialLedgerGroupId!);
	return context.ledgerTransactions;
};

const loadHomeMetadata = async (context: HomeQueryContext, collectionName: string): Promise<{ docs: QueryDocumentSnapshot[] }> => {
	const cache = context.metadataDocuments ??= new Map<string, Promise<{ docs: QueryDocumentSnapshot[] }>>();
	const cached = cache.get(collectionName);
	if (cached) return cached;
	const pending = Promise.all([
		readHomeDocumentsForPeople(collectionName, context.allowedPersonIds),
		...(context.financialLedgerGroupId ? [getDocs(query(collection(db, collectionName), where('groupId', '==', context.financialLedgerGroupId)))] : []),
	]).then(snapshots => ({ docs: [...new Map(snapshots.flatMap(snapshot => snapshot.docs).map(document => [document.id, document])).values()] }));
	cache.set(collectionName, pending);
	return pending;
};

const calculateLegacyCashBalance = (context: HomeQueryContext, expenses: HomeMovementDocument[], gains: HomeMovementDocument[], cashRescues: HomeMovementDocument[]) => {
	const pastCashItems = (items: HomeMovementDocument[], withdrawals = false) => items.filter(item => {
		const date = parseToDate(item.date ?? item.createdAt);
		return date && date <= context.asOfDate && (withdrawals || item.bankId == null);
	});
	return sumMovementValues([...pastCashItems(gains), ...pastCashItems(cashRescues, true)]) - sumMovementValues(pastCashItems(expenses));
};

const loadBalancesSection = async (context: HomeQueryContext): Promise<HomeBalancesData> => {
	if (context.financialLedgerAccounts) {
		const cash = context.financialLedgerAccounts.find(account => account.kind === 'cash');
		return {
			bankBalances: context.financialLedgerAccounts.filter(account => account.kind === 'bank').map(account => ({ id: account.id, name: account.name, balanceInCents: account.currentBalanceInCents, colorHex: account.colorHex ?? null })),
			cashSummary: cash ? { id: 'cash-transactions', name: cash.name, balanceInCents: cash.currentBalanceInCents } : null,
		};
	}
	// Both positions share complete sources: legacy Cash can predate bank openings
	// and older records can omit bankId. A null-only query would lose that money.
	const [snapshots, expenses, gains, cashRescues, investments, balanceAdjustments] = await Promise.all(
		['monthlyBalances', 'expenses', 'gains', 'cashRescues', 'financeInvestments', 'bankBalanceAdjustments'].map(async name => (await loadHomeMetadata(context, name)).docs.map(document => document.data() as HomeMovementDocument)),
	);
	return {
		bankBalances: context.banks.map(bank => ({
			id: bank.id, name: bank.name, colorHex: bank.colorHex,
			balanceInCents: calculateLegacyBankBalanceInCents({ bankId: bank.id, snapshots, expenses, gains, cashRescues, investments, balanceAdjustments, asOfDate: context.asOfDate }),
		})),
		cashSummary: { id: 'cash-transactions', name: 'Dinheiro', balanceInCents: calculateLegacyCashBalance(context, expenses, gains, cashRescues) },
	};
};

const projectLedgerMovements = (transactions: LedgerTransaction[], context: HomeQueryContext) => {
	const reversedIds = new Set(transactions.filter(transaction => transaction.kind === 'reversal' && transaction.effectiveAt <= context.asOfDate).map(transaction => transaction.reversesTransactionId));
	const supportedKinds = new Set(['expense', 'income', 'transfer', 'investment_deposit', 'investment_redemption']);
	return transactions.filter(transaction => supportedKinds.has(transaction.kind) && !reversedIds.has(transaction.id) && transaction.effectiveAt <= context.asOfDate).map(transaction => {
		const isGain = transaction.kind === 'income' || transaction.kind === 'investment_redemption';
		const accountLeg = transaction.legs.find(leg => leg.accountId !== null && (isGain ? leg.deltaInCents > 0 : leg.deltaInCents < 0))!;
		const account = context.financialLedgerAccounts?.find(account => account.id === accountLeg.accountId);
		const source = context.financialLedgerAccounts?.find(account => account.id === transaction.legs.find(leg => leg.deltaInCents < 0)?.accountId);
		const target = context.financialLedgerAccounts?.find(account => account.id === transaction.legs.find(leg => leg.deltaInCents > 0)?.accountId);
		return { id: transaction.id, type: isGain ? 'gain' : 'expense',
			name: transaction.note || (transaction.kind === 'transfer' ? 'Transferência' : transaction.kind === 'investment_deposit' ? 'Aporte' : transaction.kind === 'investment_redemption' ? 'Resgate' : isGain ? 'Receita' : 'Despesa'),
			date: transaction.effectiveAt, valueInCents: Math.abs(accountLeg.deltaInCents), tagId: transaction.categoryId,
			bankId: account?.kind === 'cash' ? null : accountLeg.accountId, moneyFormat: account?.kind === 'cash',
			isBankTransfer: transaction.kind === 'transfer', bankTransferDirection: transaction.kind === 'transfer' ? 'outgoing' : null,
			bankTransferSourceBankNameSnapshot: source?.name, bankTransferTargetBankNameSnapshot: target?.name,
			isInvestmentDeposit: transaction.kind === 'investment_deposit', isInvestmentRedemption: transaction.kind === 'investment_redemption',
			investmentNameSnapshot: transaction.kind === 'investment_deposit' ? target?.name : transaction.kind === 'investment_redemption' ? source?.name : null,
		};
	});
};

const toExpenseHistorySource = (item: HomeMovementDocument): HomeExpenseHistorySource | null => {
	if (!shouldIncludeMovementInGainExpenseTotals(item)) {
		return null;
	}

	const date = parseToDate(item.date ?? item.createdAt);
	const valueInCents = item.valueInCents;
	if (!date || !Number.isSafeInteger(valueInCents) || valueInCents <= 0) {
		return null;
	}

	return { date, valueInCents };
};

const loadUpcomingMandatoryItems = async (context: HomeQueryContext) => {
	try {
		const [mandatoryExpensesSnapshot, mandatoryGainsSnapshot] = await Promise.all([
			loadHomeMetadata(context, 'mandatoryExpenses'), loadHomeMetadata(context, 'mandatoryGains'),
		]);

		const toScheduleSource = (document: QueryDocumentSnapshot) => {
			const data: Record<string, unknown> = { ...document.data() };
			for (const key of ['installmentStartDate', 'installmentEndDate']) {
				const date = parseToDate(data[key]);
				if (date) data[key] = toFinancialCivilDate(date);
			}
			return { ...data, id: document.id };
		};
		return buildHomeMandatorySchedule(
			mandatoryExpensesSnapshot.docs.map(toScheduleSource),
			mandatoryGainsSnapshot.docs.map(toScheduleSource),
			toFinancialCivilDate(context.asOfDate),
		).map(item => ({ ...item, dueDate: fromFinancialCivilDate(item.dueDate) }));
	} catch (error) {
		console.warn('Não foi possível carregar os compromissos obrigatórios da Home:', error);
		return [];
	}
};

const loadOverviewSection = async (context: HomeQueryContext): Promise<HomeOverviewData> => {
	const upcomingMandatoryItems = await loadUpcomingMandatoryItems(context);

	if (context.financialLedgerAccounts) {
		const cashAccount = context.financialLedgerAccounts.find(account => account.kind === 'cash') ?? null;
		const ledgerGroupId = context.financialLedgerGroupId;
		const currentMonthExpensesByBankId: Record<string, number> = {};
		const currentMonthGainsByBankId: Record<string, number> = {};
		const expenseHistorySources: HomeExpenseHistorySource[] = [];
		const gainHistorySources: HomeExpenseHistorySource[] = [];
		const activityHeatmapSources: HomeActivityHeatmapSource[] = [];
		if (ledgerGroupId) {
			const transactions = await loadLedgerTransactions(context);
			const transactionsSnapshot = { docs: transactions.map(transaction => ({ id: transaction.id, data: () => transaction })) };
			const reversedIds = new Set(transactionsSnapshot.docs.filter(document => {
				const data = document.data();
				const date = parseToDate(data.effectiveAt);
				return typeof data.reversesTransactionId === 'string' && date && date.getTime() <= context.asOfDate.getTime();
			}).map(document => document.data().reversesTransactionId));
			transactionsSnapshot.docs.forEach(document => {
				const data = document.data() as Record<string, unknown>;
				const effectiveAt = parseToDate(data.effectiveAt);
				if (
					!effectiveAt ||
					effectiveAt.getTime() > context.asOfDate.getTime() ||
					!Array.isArray(data.legs)
				) {
					return;
				}
				if (effectiveAt.getTime() >= context.startOfActivityYear.getTime()) {
					activityHeatmapSources.push({ date: toFinancialCivilDate(effectiveAt) });
				}
				if (reversedIds.has(document.id) || data.kind !== 'income' && data.kind !== 'expense') return;
				data.legs.forEach(leg => {
					if (!leg || typeof leg !== 'object') return;
					const accountId = (leg as { accountId?: unknown }).accountId;
					const deltaInCents = (leg as { deltaInCents?: unknown }).deltaInCents;
					if (
						typeof accountId !== 'string' ||
						typeof deltaInCents !== 'number' ||
						!Number.isSafeInteger(deltaInCents)
					) return;
					if (
						data.kind === 'expense' &&
						effectiveAt.getTime() >= context.startOfMonth.getTime() &&
						deltaInCents < 0
					) {
						currentMonthExpensesByBankId[accountId] =
							(currentMonthExpensesByBankId[accountId] ?? 0) + Math.abs(deltaInCents);
					}
					if (
						data.kind === 'income' &&
						effectiveAt.getTime() >= context.startOfMonth.getTime() &&
						deltaInCents > 0
					) {
						currentMonthGainsByBankId[accountId] =
							(currentMonthGainsByBankId[accountId] ?? 0) + deltaInCents;
					}
					if (
						data.kind === 'expense' &&
						effectiveAt.getTime() >= context.startOfExpenseHistory.getTime() &&
						deltaInCents < 0
					) {
						expenseHistorySources.push({
							date: toFinancialCivilDate(effectiveAt),
							valueInCents: Math.abs(deltaInCents),
						});
					}
					if (
						data.kind === 'income' &&
						effectiveAt.getTime() >= context.startOfExpenseHistory.getTime() &&
						deltaInCents > 0
					) {
						gainHistorySources.push({ date: toFinancialCivilDate(effectiveAt), valueInCents: deltaInCents });
					}
				});
			});
		}
		return {
			bankBalances: context.financialLedgerAccounts
				.filter(account => account.kind === 'bank')
				.map(account => ({
					id: account.id,
					name: account.name,
					balanceInCents: account.currentBalanceInCents,
					colorHex: account.colorHex ?? null,
				})),
			cashSummary: cashAccount
				? {
						id: 'cash-transactions',
						name: cashAccount.name,
						balanceInCents: cashAccount.currentBalanceInCents,
						currentMonthExpensesInCents: currentMonthExpensesByBankId[cashAccount.id] ?? 0,
						currentMonthGainsInCents: currentMonthGainsByBankId[cashAccount.id] ?? 0,
					}
				: null,
			currentMonthExpensesByBankId,
			currentMonthGainsByBankId,
			upcomingMandatoryItems,
			expenseHistoryLastThreeMonths: buildHomeExpenseHistory(
				expenseHistorySources,
				gainHistorySources,
				toFinancialCivilDate(context.asOfDate),
			),
			activityHeatmap: buildHomeActivityHeatmap(activityHeatmapSources, toFinancialCivilDate(context.asOfDate)),
		};
	}
	const bankIdsSet = new Set(context.bankIds);
	const readPeriod = (name: string, start: Date) => readHomeDocumentsForPeople(name, context.allowedPersonIds, [
		where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(context.asOfDate)),
	]);

	const legacyCashBalancePromise = Promise.all(['expenses', 'gains', 'cashRescues'].map(name => loadHomeMetadata(context, name))).then(([expenses, gains, cashRescues]) => calculateLegacyCashBalance(
		context,
		expenses.docs.map(document => document.data()),
		gains.docs.map(document => document.data()),
		cashRescues.docs.map(document => document.data()),
	));
	const legacyBalancesPromise = getLegacyBankBalancesInCentsFirebase({
		personId: context.personId,
		bankIds: context.bankIds,
		allowedPersonIds: context.allowedPersonIds,
		asOfDate: context.asOfDate,
	});
	const coreSnapshotsPromise = Promise.all([
		readPeriod('expenses', context.startOfMonth),
		readPeriod('gains', context.startOfMonth),
	]);
	const historySnapshotsPromise = Promise.allSettled([
		readPeriod('expenses', context.startOfExpenseHistory),
		readPeriod('gains', context.startOfExpenseHistory),
	]);
	const activitySnapshotsPromise = Promise.allSettled([
		readPeriod('expenses', context.startOfActivityYear),
		readPeriod('gains', context.startOfActivityYear),
		readPeriod('cashRescues', context.startOfActivityYear),
		readPeriod('financeInvestmentSyncs', context.startOfActivityYear),
	]);
	const [monthlyExpensesSnapshot, monthlyGainsSnapshot] = await coreSnapshotsPromise;
	const historySnapshotResults = await historySnapshotsPromise;
	const activitySnapshotResults = await activitySnapshotsPromise;
	const [expenseHistorySnapshot, gainHistorySnapshot] = historySnapshotResults.map(result =>
		result.status === 'fulfilled' ? result.value : null,
	);
	const [activityExpensesSnapshot, activityGainsSnapshot, activityCashRescuesSnapshot, activityInvestmentSyncsSnapshot] =
		activitySnapshotResults.map(result => result.status === 'fulfilled' ? result.value : null);

	if (historySnapshotResults.some(result => result.status === 'rejected')) {
		console.warn('Não foi possível carregar o histórico da Home; mantendo o resumo dos bancos disponível.');
	}
	if (activitySnapshotResults.some(result => result.status === 'rejected')) {
		console.warn('Não foi possível carregar o heatmap da Home; mantendo o resumo dos bancos disponível.');
	}
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
	const cashExpenses = monthlyExpensesSnapshot.docs
		.map<HomeMovementDocument>(docSnap => ({ id: docSnap.id, ...(docSnap.data() as HomeMovementDocument) }))
		.filter(item => item?.bankId == null);
	const cashGains = monthlyGainsSnapshot.docs
		.map<HomeMovementDocument>(docSnap => ({ id: docSnap.id, ...(docSnap.data() as HomeMovementDocument) }))
		.filter(item => item?.bankId == null);
	const expenseHistorySources = [
		...(expenseHistorySnapshot?.docs ?? []).map<HomeMovementDocument>(docSnap => ({
			id: docSnap.id,
			...(docSnap.data() as HomeMovementDocument),
		})),
	]
		.map(toExpenseHistorySource)
		.filter((source): source is HomeExpenseHistorySource => Boolean(source));
	const gainHistorySources = (gainHistorySnapshot?.docs ?? [])
		.map<HomeMovementDocument>(docSnap => ({
			id: docSnap.id,
			...(docSnap.data() as HomeMovementDocument),
		}))
		.map(toExpenseHistorySource)
		.filter((source): source is HomeExpenseHistorySource => Boolean(source));
	const activityHeatmapSources = [
		...(activityExpensesSnapshot?.docs ?? []),
		...(activityGainsSnapshot?.docs ?? []),
		...(activityCashRescuesSnapshot?.docs ?? []),
		...(activityInvestmentSyncsSnapshot?.docs ?? []).filter(
			document => (document.data() as HomeMovementDocument).reason === 'manual',
		),
	]
		.map(docSnap => docSnap.data() as HomeMovementDocument)
		.filter(item => !item.isBankTransfer || item.bankTransferDirection !== 'incoming')
		.map(item => ({ date: parseToDate(item.date ?? item.createdAt) }));
	const legacyBalancesResult = await legacyBalancesPromise;
	if (!legacyBalancesResult.success) throw legacyBalancesResult.error;
	const legacyCashBalanceInCents = await legacyCashBalancePromise;

	return {
		bankBalances: context.banks.map(bank => ({
			id: bank.id, name: bank.name, balanceInCents: legacyBalancesResult.data[bank.id] ?? null, colorHex: bank.colorHex,
		})),
		cashSummary: {
			id: 'cash-transactions',
			name: 'Dinheiro',
			balanceInCents: legacyCashBalanceInCents,
			currentMonthExpensesInCents: sumMovementValues(cashExpenses.filter(shouldIncludeMovementInGainExpenseTotals)),
			currentMonthGainsInCents: sumMovementValues(cashGains.filter(shouldIncludeMovementInGainExpenseTotals)),
		},
		currentMonthExpensesByBankId: aggregateMonthlyValuesByBankId(monthlyExpenses, bankIdsSet),
		currentMonthGainsByBankId: aggregateMonthlyValuesByBankId(monthlyGains, bankIdsSet),
		upcomingMandatoryItems,
		expenseHistoryLastThreeMonths: buildHomeExpenseHistory(
			expenseHistorySources.map(source => ({ ...source, date: source.date ? toFinancialCivilDate(source.date) : null })),
			gainHistorySources.map(source => ({ ...source, date: source.date ? toFinancialCivilDate(source.date) : null })),
			toFinancialCivilDate(context.asOfDate),
		),
		activityHeatmap: buildHomeActivityHeatmap(activityHeatmapSources.map(source => ({ date: source.date ? toFinancialCivilDate(source.date) : null })), toFinancialCivilDate(context.asOfDate)),
	};
};

const loadMovementsSection = async (context: HomeQueryContext): Promise<HomeMovementsData> => {
	const ledgerMovements = context.financialLedgerAccounts ? projectLedgerMovements(await loadLedgerTransactions(context), context) : null;
	const readRecent = (name: string) => readHomeDocumentsForPeople(name, context.allowedPersonIds, [
		where('date', '<=', Timestamp.fromDate(context.asOfDate)), orderBy('date', 'desc'), limitQuery(6),
	]);
	const [
		recentExpensesSnapshot,
		recentGainsSnapshot,
		recentInvestmentSyncsSnapshot,
		recentCashRescuesSnapshot,
		mandatoryExpensesSnapshot,
		mandatoryGainsSnapshot,
		tagsSnapshot,
	] = await Promise.all([
		ledgerMovements ? Promise.resolve({ docs: ledgerMovements.filter(item => item.type === 'expense').map(item => ({ id: item.id, data: () => item })) }) : readRecent('expenses'),
		ledgerMovements ? Promise.resolve({ docs: ledgerMovements.filter(item => item.type === 'gain').map(item => ({ id: item.id, data: () => item })) }) : readRecent('gains'),
		ledgerMovements ? Promise.resolve({ docs: [] }) : readRecent('financeInvestmentSyncs'),
		ledgerMovements ? Promise.resolve({ docs: [] }) : readRecent('cashRescues'),
		loadHomeMetadata(context, 'mandatoryExpenses'),
		loadHomeMetadata(context, 'mandatoryGains'),
		loadHomeMetadata(context, 'tags'),
	]);

	const tagMetadataById = tagsSnapshot.docs.reduce<Record<string, HomeTagMetadata>>((acc, docSnap) => {
		const tag = docSnap.data() as HomeMovementDocument;
		acc[docSnap.id] = {
			name: typeof tag.name === 'string' && tag.name.trim().length > 0 ? tag.name.trim() : null,
			iconFamily:
				typeof tag.iconFamily === 'string' && tag.iconFamily.trim().length > 0
					? tag.iconFamily.trim()
					: null,
			iconName:
				typeof tag.iconName === 'string' && tag.iconName.trim().length > 0 ? tag.iconName.trim() : null,
			iconStyle:
				typeof tag.iconStyle === 'string' && tag.iconStyle.trim().length > 0
					? tag.iconStyle.trim()
					: null,
		};
		return acc;
	}, {});

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
		type: 'expense' | 'gain' | 'sync',
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
			type === 'expense' ? mandatoryExpenseIds.has(movementId) : type === 'gain' ? mandatoryGainIds.has(movementId) : false;
		const tagId =
			typeof item?.tagId === 'string' && item.tagId.trim().length > 0 ? item.tagId.trim() : null;
		const tagMetadata = tagId ? tagMetadataById[tagId] ?? null : null;

		return {
			id: movementId,
			type,
			name:
				typeof item?.name === 'string' && item.name.trim().length > 0
					? item.name.trim()
					: type === 'expense'
						? 'Despesa sem nome'
						: type === 'gain'
							? 'Ganho sem nome'
							: 'Sincronização de investimento',
			valueInCents:
				typeof item?.valueInCents === 'number' && !Number.isNaN(item.valueInCents)
					? item.valueInCents
					: typeof item?.syncedValueInCents === 'number' && !Number.isNaN(item.syncedValueInCents)
						? item.syncedValueInCents
					: 0,
			date: parsedDate,
			tagId: type === 'sync' ? null : tagId,
			tagName: type === 'sync' ? null : tagMetadata?.name ?? null,
			tagIconFamily: type === 'sync' ? null : tagMetadata?.iconFamily ?? null,
			tagIconName: type === 'sync' ? null : tagMetadata?.iconName ?? null,
			tagIconStyle: type === 'sync' ? null : tagMetadata?.iconStyle ?? null,
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
			isFinanceInvestmentSync: Boolean(item?.reason),
			investmentSyncPreviousValueInCents:
				typeof item?.previousValueInCents === 'number' ? item.previousValueInCents : null,
			investmentSyncReason:
				item?.reason === 'manual' || item?.reason === 'deposit' || item?.reason === 'withdrawal'
					? item.reason
					: null,
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
		...recentCashRescuesSnapshot.docs.map(docSnap => {
			const item = docSnap.data() as HomeMovementDocument;
			return normalizeMovement({ ...item, id: docSnap.id, name: 'Saque em dinheiro', explanation: item.description,
				isBankTransfer: true, bankTransferDirection: 'outgoing',
				bankTransferSourceBankNameSnapshot: item.bankNameSnapshot ?? context.bankNamesById[item.bankId] ?? null,
				bankTransferTargetBankNameSnapshot: 'Caixa',
			}, 'expense');
		}),
		...recentInvestmentSyncsSnapshot.docs.map(docSnap =>
			normalizeMovement({ id: docSnap.id, ...(docSnap.data() as HomeMovementDocument) }, 'sync'),
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
	if (context.financialLedgerAccounts) {
		const [transactions, rateSnapshot] = await Promise.all([
			loadLedgerTransactions(context), loadHomeMetadata(context, 'investmentCdiRates').catch(() => ({ docs: [] })),
		]);
		const rates: InvestmentCdiRate[] = rateSnapshot.docs.flatMap(document => {
			const rate = document.data();
			const effectiveFrom = parseToDate(rate.effectiveFrom);
			return typeof rate.personId === 'string' && Number.isSafeInteger(rate.annualRateInBasisPoints) && rate.annualRateInBasisPoints > 0 && effectiveFrom
				? [{ id: document.id, personId: rate.personId, annualRateInBasisPoints: rate.annualRateInBasisPoints, effectiveFrom }] : [];
		});
		return { portfolio: buildLedgerInvestmentPortfolio(context.financialLedgerAccounts, transactions, rates, context.asOfDate) };
	}
	const personIdChunks = Array.from({ length: Math.ceil(context.allowedPersonIds.length / 10) }, (_, index) => context.allowedPersonIds.slice(index * 10, (index + 1) * 10));
	const [investmentsSnapshot, cdiRatesResults] = await Promise.all([
		readHomeDocumentsForPeople('financeInvestments', context.allowedPersonIds),
		Promise.all(personIdChunks.map(getInvestmentCdiRatesByPersonIdsFirebase)),
	]);
	if (cdiRatesResults.some(result => !result.success)) {
		// A taxa é opcional para a Home: sem ela, a projeção conserva o valor confirmado.
		console.warn('Não foi possível carregar o histórico de CDI da Home; usando valores-base.');
	}
	const cdiRates: InvestmentCdiRate[] =
		cdiRatesResults.every(result => result.success) ? cdiRatesResults.flatMap(result => result.success && Array.isArray(result.data) ? result.data : []) : [];
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
		const cdiPercentageInBasisPoints =
			typeof investment.cdiPercentageInBasisPoints === 'number'
				? Math.max(0, Math.round(investment.cdiPercentageInBasisPoints))
				: normalizeCdiPercentageInBasisPoints(investment.cdiPercentage);
		const assetType = getInvestmentAssetType(investment.assetType);

		return {
			id: docSnap.id,
			personId: typeof investment.personId === 'string' ? investment.personId : '',
			name:
				typeof investment.name === 'string' && investment.name.trim().length > 0
					? investment.name.trim()
					: 'Investimento sem nome',
			initialValueInCents,
			currentValueInCents,
			cdiPercentage:
				typeof investment.cdiPercentage === 'number'
					? investment.cdiPercentage
					: cdiPercentageInBasisPoints / 100,
			cdiPercentageInBasisPoints,
			assetType,
			valuationMethod: getInvestmentValuationMethod(investment.valuationMethod, assetType),
			bankId: typeof investment.bankId === 'string' ? investment.bankId : null,
			bankNameSnapshot:
				typeof investment.bankNameSnapshot === 'string' && investment.bankNameSnapshot.trim().length > 0
					? investment.bankNameSnapshot.trim()
					: null,
			lastManualSyncValueInCents,
			lastManualSyncAt: parseToDate(investment.lastManualSyncAt),
			investmentDate: parseToDate(investment.date),
			createdAt: parseToDate(investment.createdAt ?? investment.createdAtISO ?? investment.createdAtUtc),
		};
	});

	const portfolioItems = normalizedInvestments
		.map<HomeInvestmentItem>(investment => {
			const currentBaseValueInCents = resolveInvestmentBaseValueInCents(investment);
			const simulatedValueInCents = simulateInvestmentValueInCents(investment, cdiRates);

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

const readHomeSection = async <T>(personId: string, sectionName: string, load: (context: HomeQueryContext) => Promise<T>): Promise<{ success: true; data: T } | { success: false; error: unknown }> => {
	try {
		if (!personId.trim()) return { success: false, error: 'Usuário não informado.' };
		return { success: true, data: await load(await buildHomeQueryContext(personId)) };
	} catch (error) {
		return { success: false, error: toSectionError(sectionName, error) };
	}
};

/** A focused report does not need the unrelated timeline or investment sections. */
export const getHomeOverviewFirebase = (personId: string) => readHomeSection(personId, 'resumo dos bancos', loadOverviewSection);
export const getHomeInvestmentsFirebase = (personId: string) => readHomeSection(personId, 'investimentos', loadInvestmentsSection);
/** Current positions omit chart, timeline, schedule and portfolio sources. */
export const getHomeBalancesFirebase = (personId: string) => readHomeSection(personId, 'saldos', loadBalancesSection);

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
