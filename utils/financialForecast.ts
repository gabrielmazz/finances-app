export const FINANCIAL_FORECAST_PERIOD_OPTIONS = [3, 6, 12] as const;

export type FinancialForecastPeriod = (typeof FINANCIAL_FORECAST_PERIOD_OPTIONS)[number];

export type FinancialForecastCommitmentKind =
	| 'fixed-expense'
	| 'fixed-gain'
	| 'variable-expense'
	| 'variable-gain'
	| 'scheduled-expense'
	| 'scheduled-gain'
	| 'investment-outflow'
	| 'investment-inflow'
	| 'investment-liquidity';

export type FinancialForecastCommitment = {
	id: string;
	kind: FinancialForecastCommitmentKind;
	name: string;
	date: Date;
	valueInCents: number;
	tagName: string | null;
	isOverdue: boolean;
	/** Quantos meses fechados registraram a categoria desta estimativa variável. */
	historicalOccurrenceMonths?: number;
};

export type FinancialForecastMonth = {
	key: string;
	label: string;
	startDate: Date;
	openingBalanceInCents: number;
	closingBalanceInCents: number;
	gainsInCents: number;
	expensesInCents: number;
	netChangeInCents: number;
	fixedExpensesInCents: number;
	fixedGainsInCents: number;
	variableExpensesInCents: number;
	variableGainsInCents: number;
	scheduledExpensesInCents: number;
	scheduledGainsInCents: number;
	investmentOutflowsInCents: number;
	investmentInflowsInCents: number;
	commitments: FinancialForecastCommitment[];
};

export type FinancialForecastData = {
	generatedAt: Date;
	periodInMonths: FinancialForecastPeriod;
	openingBalanceInCents: number;
	finalBalanceInCents: number;
	totalGainsInCents: number;
	totalExpensesInCents: number;
	historicalMonthsUsed: number;
	missingSnapshotBankNames: string[];
	hasScheduledMonthlyOpenings?: boolean;
	months: FinancialForecastMonth[];
};
