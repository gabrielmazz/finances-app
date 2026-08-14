export type MinimalBankInfo = {
	id: string;
	name?: string;
	colorHex?: string | null;
};

type Movement = {
	bankId?: string | null;
	valueInCents?: number;
	isInvestmentRedemption?: boolean;
	isBankTransfer?: boolean;
};

type InvestmentMovement = {
	bankId?: string | null;
	initialValueInCents?: number;
	valueInCents?: number;
	currentValueInCents?: number;
	initialInvestedInCents?: number;
	lastManualSyncValueInCents?: number | null;
};

type GainExpenseTotalsMovement = {
	isInvestmentDeposit?: boolean | null;
	isInvestmentRedemption?: boolean | null;
	isFinanceInvestment?: boolean | null;
	isFinanceInvestmentSync?: boolean | null;
	isBankTransfer?: boolean | null;
};

type DatedMovement = Movement & {
	date?: unknown;
	createdAt?: unknown;
};

type DatedInvestment = InvestmentMovement & {
	date?: unknown;
	createdAt?: unknown;
};

export type LegacyMonthlyBalanceSnapshot = {
	bankId?: string | null;
	year?: number;
	month?: number;
	valueInCents?: number;
	updatedAt?: unknown;
	createdAt?: unknown;
};

export type MonthlyBankBalanceInput = {
	banks: MinimalBankInfo[];
	initialBalancesByBank: Record<string, number | null | undefined>;
	expenses?: Movement[];
	gains?: Movement[];
	investmentsByBank?: Record<string, InvestmentMovement[] | undefined>;
};

export type MonthlyBankBalance = {
	id: string;
	name: string;
	colorHex: string | null;
	totalExpensesInCents: number;
	totalGainsInCents: number;
	totalInvestedInCents: number;
	totalInitialInvestedInCents: number;
	totalInvestmentRedemptionsInCents: number;
	totalMovements: number;
	initialBalanceInCents: number | null;
	currentBalanceInCents: number | null;
};

export const isSafeIntegerCents = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value);

const normalizeCurrencyValue = (value: unknown): number => {
	if (isSafeIntegerCents(value)) {
		return value;
	}
	return 0;
};

const parseDate = (value: unknown): Date | null => {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}
	if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
		const date = (value as { toDate: () => Date }).toDate();
		return Number.isNaN(date.getTime()) ? null : date;
	}
	if (typeof value === 'string' || typeof value === 'number') {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	return null;
};

const getMonthStart = (snapshot: LegacyMonthlyBalanceSnapshot) => {
	if (!Number.isInteger(snapshot.year) || !Number.isInteger(snapshot.month) || !snapshot.year || !snapshot.month || snapshot.month < 1 || snapshot.month > 12) {
		return null;
	}
	return new Date(snapshot.year, snapshot.month - 1, 1);
};

const getBankId = (raw: unknown): string | null => {
	if (!raw || typeof raw !== 'object') {
		return null;
	}

	const bankId = (raw as { bankId?: unknown }).bankId;
	if (typeof bankId === 'string' && bankId.trim().length > 0) {
		return bankId;
	}

	return null;
};

const resolveInvestmentBaseValue = (investment: InvestmentMovement) => {
	if (typeof investment?.currentValueInCents === 'number') {
		return investment.currentValueInCents;
	}
	if (typeof investment?.lastManualSyncValueInCents === 'number') {
		return investment.lastManualSyncValueInCents;
	}
	if (typeof investment?.valueInCents === 'number') {
		return investment.valueInCents;
	}
	if (typeof investment?.initialValueInCents === 'number') {
		return investment.initialValueInCents;
	}
	return 0;
};

const resolveInvestmentInitialValue = (investment: InvestmentMovement) => {
	if (typeof investment?.initialInvestedInCents === 'number') {
		return investment.initialInvestedInCents;
	}
	if (typeof investment?.initialValueInCents === 'number') {
		return investment.initialValueInCents;
	}
	return typeof investment?.valueInCents === 'number' ? investment.valueInCents : 0;
};

export const shouldIncludeMovementInGainExpenseTotals = (
	movement: GainExpenseTotalsMovement | null | undefined,
) => {
	return !Boolean(
		movement?.isFinanceInvestment ||
			movement?.isInvestmentDeposit ||
			movement?.isInvestmentRedemption ||
			movement?.isFinanceInvestmentSync ||
			movement?.isBankTransfer,
	);
};

/**
 * Legacy snapshots represent the opening balance of their calendar month.
 * Every balance consumer must use this same rule until the group is migrated
 * to the financial ledger reconciliation model.
 */
export const calculateLegacyBankBalanceInCents = ({
	bankId,
	snapshots,
	expenses = [],
	gains = [],
	cashRescues = [],
	investments = [],
	asOfDate = new Date(),
}: {
	bankId: string;
	snapshots: LegacyMonthlyBalanceSnapshot[];
	expenses?: DatedMovement[];
	gains?: DatedMovement[];
	cashRescues?: DatedMovement[];
	investments?: DatedInvestment[];
	asOfDate?: Date;
}): number | null => {
	if (!bankId || Number.isNaN(asOfDate.getTime())) {
		return null;
	}

	const latestSnapshot = snapshots.reduce<{
		snapshot: LegacyMonthlyBalanceSnapshot;
		monthStart: Date;
		updatedAt: Date | null;
	} | null>((current, snapshot) => {
		if (snapshot.bankId !== bankId || !Number.isSafeInteger(snapshot.valueInCents)) {
			return current;
		}
		const monthStart = getMonthStart(snapshot);
		if (!monthStart || monthStart.getTime() > asOfDate.getTime()) {
			return current;
		}
		const updatedAt = parseDate(snapshot.updatedAt ?? snapshot.createdAt);
		if (
			!current ||
			monthStart.getTime() > current.monthStart.getTime() ||
			(monthStart.getTime() === current.monthStart.getTime() &&
				(updatedAt?.getTime() ?? 0) >= (current.updatedAt?.getTime() ?? 0))
		) {
			return { snapshot, monthStart, updatedAt };
		}
		return current;
	}, null);

	if (!latestSnapshot || typeof latestSnapshot.snapshot.valueInCents !== 'number') {
		return null;
	}

	const isMovementAfterSnapshot = (item: DatedMovement | DatedInvestment) => {
		if (item.bankId !== bankId) {
			return false;
		}
		const date = parseDate(item.date ?? item.createdAt);
		return Boolean(
			date &&
			date.getTime() >= latestSnapshot.monthStart.getTime() &&
			date.getTime() <= asOfDate.getTime(),
		);
	};
	const sumMovements = (items: DatedMovement[]) =>
		items.reduce(
			(total, item) => total + (isMovementAfterSnapshot(item) ? Math.max(0, normalizeCurrencyValue(item.valueInCents)) : 0),
			0,
		);
	const totalInitialInvestments = investments.reduce((total, investment) => {
		if (!isMovementAfterSnapshot(investment)) {
			return total;
		}
		return total + Math.max(0, normalizeCurrencyValue(resolveInvestmentInitialValue(investment)));
	}, 0);

	return (
		latestSnapshot.snapshot.valueInCents +
		sumMovements(gains) -
		sumMovements(expenses) -
		sumMovements(cashRescues) -
		totalInitialInvestments
	);
};

export function computeMonthlyBankBalances({
	banks,
	initialBalancesByBank,
	expenses,
	gains,
	investmentsByBank,
}: MonthlyBankBalanceInput): MonthlyBankBalance[] {
	const bankMetaById = new Map<string, { name: string; colorHex: string | null }>();
	banks.forEach(bank => {
		if (bank?.id) {
			bankMetaById.set(bank.id, {
				name: typeof bank.name === 'string' && bank.name.trim().length > 0 ? bank.name.trim() : 'Banco sem nome',
				colorHex: typeof bank.colorHex === 'string' && bank.colorHex.trim().length > 0 ? bank.colorHex.trim() : null,
			});
		}
	});

	const summaries: Record<string, MonthlyBankBalance> = {};

	const ensureSummary = (bankId: string): MonthlyBankBalance => {
		if (!summaries[bankId]) {
			const meta = bankMetaById.get(bankId);
			const initialBalanceRaw = initialBalancesByBank?.[bankId];
			const initialBalance =
				typeof initialBalanceRaw === 'number' && Number.isFinite(initialBalanceRaw) ? initialBalanceRaw : null;

			summaries[bankId] = {
				id: bankId,
				name: meta?.name ?? 'Banco não identificado',
				colorHex: meta?.colorHex ?? null,
				totalExpensesInCents: 0,
				totalGainsInCents: 0,
				totalInvestedInCents: 0,
				totalInitialInvestedInCents: 0,
				totalInvestmentRedemptionsInCents: 0,
				totalMovements: 0,
				initialBalanceInCents: initialBalance,
				currentBalanceInCents: null,
			};
		}

		return summaries[bankId];
	};

	(expenses ?? []).forEach(expense => {
		const bankId = getBankId(expense);
		if (!bankId) {
			return;
		}

		const value = Math.max(0, normalizeCurrencyValue(expense?.valueInCents));
		const summary = ensureSummary(bankId);
		summary.totalExpensesInCents += value;
		summary.totalMovements += 1;
	});

	(gains ?? []).forEach(gain => {
		const bankId = getBankId(gain);
		if (!bankId) {
			return;
		}

		const value = Math.max(0, normalizeCurrencyValue(gain?.valueInCents));
		const summary = ensureSummary(bankId);
		summary.totalGainsInCents += value;
		summary.totalMovements += 1;

		if (gain?.isInvestmentRedemption) {
			summary.totalInvestmentRedemptionsInCents += value;
		}
	});

	Object.entries(investmentsByBank ?? {}).forEach(([bankId, bankInvestments]) => {
		if (!bankId || !Array.isArray(bankInvestments)) {
			return;
		}

		const summary = ensureSummary(bankId);

		bankInvestments.forEach(investment => {
			if (!investment) {
				return;
			}

			const value = Math.max(0, normalizeCurrencyValue(resolveInvestmentBaseValue(investment)));
			const initialValue = Math.max(0, normalizeCurrencyValue(resolveInvestmentInitialValue(investment)));

			summary.totalInvestedInCents += value;
			summary.totalInitialInvestedInCents += initialValue;
			summary.totalMovements += 1;
		});
	});

	// Garante que bancos sem movimentação no mês ainda apareçam no resumo
	banks.forEach(bank => {
		if (bank?.id) {
			ensureSummary(bank.id);
		}
	});

	return Object.values(summaries).map(summary => {
		const initialBalanceInCents = summary.initialBalanceInCents;
		const hasInitial = typeof initialBalanceInCents === 'number';
		const currentBalanceInCents = hasInitial
			? initialBalanceInCents +
				summary.totalGainsInCents -
				(summary.totalExpensesInCents + summary.totalInitialInvestedInCents)
			: null;

		return {
			...summary,
			currentBalanceInCents,
		};
	});
}
