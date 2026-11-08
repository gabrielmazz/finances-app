// Regras de projeção e rentabilidade documentadas em [[Investimentos]].
// Valores monetários entram e saem deste módulo sempre em centavos inteiros.

export const investmentAssetTypes = ['fixed_income', 'treasury', 'stock', 'fund'] as const;

export type InvestmentAssetType = (typeof investmentAssetTypes)[number];

export type InvestmentValuationMethod = 'cdi' | 'manual';

export type InvestmentPerformancePeriod = '30d' | '6m' | '12m' | 'all';

export type InvestmentCdiRate = {
	id: string;
	personId: string;
	annualRateInBasisPoints: number;
	effectiveFrom: Date;
	createdAt?: Date | null;
};

export type InvestmentCashFlow = {
  sequence?: number;
	investmentId: string;
	date: Date;
	valueInCents: number;
	kind: 'deposit' | 'withdrawal';
};

export type InvestmentSync = {
  sequence?: number;
	investmentId: string;
	date: Date;
	syncedValueInCents: number;
	reason: 'manual' | 'deposit' | 'withdrawal';
};

export type InvestmentPerformanceItem = {
	investmentId: string;
	projectedValueInCents: number;
	netAppliedInCents: number;
	totalContributionsInCents: number;
	totalRedemptionsInCents: number;
	totalGainInCents: number;
	totalReturnInBasisPoints: number;
	periodGainInCents: number;
	periodReturnInBasisPoints: number;
	dailyYieldInCents: number;
	hasCurrentCdiRate: boolean;
};

const CDI_PERCENTAGE_SCALE = 100;

const normalizeBasisPoints = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

export const parsePercentageToBasisPoints = (value: string): number | null => {
	const normalized = value.trim().replace(/\s/g, '');
	if (!normalized) {
		return null;
	}

	const match = normalized.match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/);
	if (!match) {
		return null;
	}

	const wholePart = Number(match[1].replace(/\./g, ''));
	if (!Number.isSafeInteger(wholePart)) {
		return null;
	}

	const decimalPart = (match[2] ?? '').padEnd(2, '0');
	const decimals = decimalPart ? Number(decimalPart) : 0;
	const result = wholePart * CDI_PERCENTAGE_SCALE + decimals;
	return Number.isSafeInteger(result) ? result : null;
};

export const formatBasisPointsAsPercentage = (valueInBasisPoints: number) => {
	const normalized = normalizeBasisPoints(valueInBasisPoints);
	const wholePart = Math.floor(normalized / CDI_PERCENTAGE_SCALE);
	const decimalPart = normalized % CDI_PERCENTAGE_SCALE;
	if (decimalPart === 0) {
		return String(wholePart);
	}

	return `${wholePart},${String(decimalPart).padStart(2, '0').replace(/0+$/, '')}`;
};

export const investmentAssetTypeLabels: Record<InvestmentAssetType, string> = {
	fixed_income: 'Renda fixa CDI',
	treasury: 'Tesouro Direto',
	stock: 'Ações',
	fund: 'Fundos',
};
