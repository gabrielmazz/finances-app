export type MinimalBankInfo = {
	id: string;
	name?: string;
	colorHex?: string | null;
};

type Movement = {
	bankId?: string | null;
	valueInCents?: number;
	isInvestmentRedemption?: boolean;
};

type InvestmentMovement = {
	bankId?: string | null;
	initialValueInCents?: number;
	valueInCents?: number;
	currentValueInCents?: number;
	initialInvestedInCents?: number;
	lastManualSyncValueInCents?: number | null;
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

const normalizeCurrencyValue = (value: unknown): number => {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	return 0;
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
		const hasInitial = typeof summary.initialBalanceInCents === 'number';
		const currentBalanceInCents = hasInitial
			? summary.initialBalanceInCents +
				summary.totalGainsInCents -
				(summary.totalExpensesInCents + summary.totalInvestedInCents)
			: null;

		return {
			...summary,
			currentBalanceInCents,
		};
	});
}
