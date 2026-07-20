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
	investmentId: string;
	date: Date;
	valueInCents: number;
	kind: 'deposit' | 'withdrawal';
};

export type InvestmentSync = {
	investmentId: string;
	date: Date;
	syncedValueInCents: number;
	reason: 'manual' | 'deposit' | 'withdrawal';
};

export type InvestmentPortfolioInvestment = {
	id: string;
	personId: string;
	name: string;
	bankId: string | null;
	initialValueInCents: number;
	currentValueInCents: number;
	cdiPercentageInBasisPoints: number;
	assetType: InvestmentAssetType;
	valuationMethod: InvestmentValuationMethod;
	investmentDate: Date | null;
	createdAt: Date | null;
	lastManualSyncAt: Date | null;
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

export type InvestmentEvolutionPoint = {
	label: string;
	dateISO: string;
	netAppliedInCents: number;
	projectedValueInCents: number;
};

export type InvestmentPortfolioAllocation = {
	bankId: string | null;
	investmentCount: number;
	netAppliedInCents: number;
	projectedValueInCents: number;
	totalGainInCents: number;
};

export type InvestmentPortfolioAnalytics = {
	period: InvestmentPerformancePeriod;
	periodLabel: string;
	periodStart: Date;
	asOfDate: Date;
	totalContributionsInCents: number;
	totalRedemptionsInCents: number;
	netAppliedInCents: number;
	projectedValueInCents: number;
	totalGainInCents: number;
	totalReturnInBasisPoints: number;
	periodGainInCents: number;
	periodReturnInBasisPoints: number;
	dailyYieldInCents: number;
	unconfiguredInvestmentIds: string[];
	itemsByInvestmentId: Record<string, InvestmentPerformanceItem>;
	evolution: InvestmentEvolutionPoint[];
	allocation: InvestmentPortfolioAllocation[];
};

const BASIS_POINTS_SCALE = 10_000;
const CDI_PERCENTAGE_SCALE = 100;
const DAYS_IN_YEAR = 365n;
const FIXED_POINT_SCALE = 1_000_000_000_000_000_000n;
const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

const isValidDate = (value: Date | null | undefined): value is Date =>
	value instanceof Date && !Number.isNaN(value.getTime());

const normalizeCents = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

const normalizeBasisPoints = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getCalendarDayIndex = (date: Date) =>
	Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MILLISECONDS_IN_DAY);

const differenceInCalendarDays = (from: Date, to: Date) =>
	Math.max(0, getCalendarDayIndex(startOfLocalDay(to)) - getCalendarDayIndex(startOfLocalDay(from)));

const addDays = (date: Date, days: number) => {
	const nextDate = startOfLocalDay(date);
	nextDate.setDate(nextDate.getDate() + days);
	return nextDate;
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

const addMonths = (date: Date, months: number) => {
	const targetMonth = date.getMonth() + months;
	const year = date.getFullYear() + Math.floor(targetMonth / 12);
	const month = ((targetMonth % 12) + 12) % 12;
	const day = Math.min(date.getDate(), getDaysInMonth(year, month));
	return new Date(year, month, day);
};

const getMonthDifference = (from: Date, to: Date) =>
	(to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());

const getSafeDate = (value: Date | null | undefined, fallback: Date) =>
	isValidDate(value) ? startOfLocalDay(value) : startOfLocalDay(fallback);

const formatChartLabel = (date: Date, period: InvestmentPerformancePeriod) => {
	if (period === '30d') {
		return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
			.format(date)
			.replace('.', '');
	}

	return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' })
		.format(date)
		.replace('.', '');
};

const formatDateISO = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const sortRates = (rates: InvestmentCdiRate[]) =>
	[...rates]
		.filter(
			rate =>
			typeof rate.personId === 'string' &&
			rate.personId.trim().length > 0 &&
			normalizeBasisPoints(rate.annualRateInBasisPoints) > 0 &&
			isValidDate(rate.effectiveFrom),
		)
		.sort((left, right) => left.effectiveFrom.getTime() - right.effectiveFrom.getTime());

const multiplyFixedPoint = (left: bigint, right: bigint) => (left * right) / FIXED_POINT_SCALE;

const powerFixedPoint = (base: bigint, exponent: number) => {
	let result = FIXED_POINT_SCALE;
	let factor = base;
	let remaining = BigInt(Math.max(0, Math.floor(exponent)));

	while (remaining > 0n) {
		if (remaining % 2n === 1n) {
			result = multiplyFixedPoint(result, factor);
		}
		factor = multiplyFixedPoint(factor, factor);
		remaining /= 2n;
	}

	return result;
};

// A projeção mantém precisão fixa com BigInt para não introduzir arredondamento de moeda por float.
const compoundValueWithCdiRate = ({
	valueInCents,
	annualRateInBasisPoints,
	cdiPercentageInBasisPoints,
	days,
}: {
	valueInCents: number;
	annualRateInBasisPoints: number;
	cdiPercentageInBasisPoints: number;
	days: number;
}) => {
	const normalizedValue = normalizeCents(valueInCents);
	const normalizedAnnualRate = normalizeBasisPoints(annualRateInBasisPoints);
	const normalizedCdiPercentage = normalizeBasisPoints(cdiPercentageInBasisPoints);
	if (normalizedValue === 0 || normalizedAnnualRate === 0 || normalizedCdiPercentage === 0 || days <= 0) {
		return normalizedValue;
	}

	const dailyNumerator = BigInt(normalizedAnnualRate) * BigInt(normalizedCdiPercentage);
	const dailyDenominator = BigInt(BASIS_POINTS_SCALE) * BigInt(BASIS_POINTS_SCALE) * DAYS_IN_YEAR;
	const dailyRateFixedPoint = (FIXED_POINT_SCALE * dailyNumerator) / dailyDenominator;
	const dailyFactor = FIXED_POINT_SCALE + dailyRateFixedPoint;
	const compoundedFactor = powerFixedPoint(dailyFactor, days);
	const projectedValue = BigInt(normalizedValue) * compoundedFactor;

	return Number((projectedValue + FIXED_POINT_SCALE / 2n) / FIXED_POINT_SCALE);
};

const getRatesForPerson = (rates: InvestmentCdiRate[], personId: string) =>
	sortRates(rates.filter(rate => rate.personId === personId));

export const getActiveCdiRateForPerson = (
	rates: InvestmentCdiRate[],
	personId: string,
	date: Date,
) => {
	const targetDate = startOfLocalDay(date);
	const matchingRates = getRatesForPerson(rates, personId).filter(
		rate => startOfLocalDay(rate.effectiveFrom).getTime() <= targetDate.getTime(),
	);
	return matchingRates.length > 0 ? matchingRates[matchingRates.length - 1] : null;
};

export const normalizeCdiPercentageInBasisPoints = (value: unknown) => {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return 0;
	}

	return Math.max(0, Math.round(value * CDI_PERCENTAGE_SCALE));
};

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

export const getInvestmentAssetType = (value: unknown): InvestmentAssetType => {
	return investmentAssetTypes.includes(value as InvestmentAssetType)
		? (value as InvestmentAssetType)
		: 'fixed_income';
};

export const getInvestmentValuationMethod = (
	value: unknown,
	assetType: InvestmentAssetType = 'fixed_income',
): InvestmentValuationMethod => {
	if (value === 'manual') {
		return 'manual';
	}

	return assetType === 'fixed_income' ? 'cdi' : 'manual';
};

export const investmentAssetTypeLabels: Record<InvestmentAssetType, string> = {
	fixed_income: 'Renda fixa CDI',
	treasury: 'Tesouro Direto',
	stock: 'Ações',
	fund: 'Fundos',
};

const shouldProjectWithCdi = (investment: InvestmentPortfolioInvestment) =>
	investment.assetType === 'fixed_income' && investment.valuationMethod === 'cdi';

export const projectInvestmentValueInCents = ({
	valueInCents,
	fromDate,
	toDate,
	personId,
	cdiPercentageInBasisPoints,
	valuationMethod,
	assetType,
	rates,
}: {
	valueInCents: number;
	fromDate: Date;
	toDate: Date;
	personId: string;
	cdiPercentageInBasisPoints: number;
	valuationMethod: InvestmentValuationMethod;
	assetType: InvestmentAssetType;
	rates: InvestmentCdiRate[];
}) => {
	const initialValueInCents = normalizeCents(valueInCents);
	const startDate = startOfLocalDay(fromDate);
	const endDate = startOfLocalDay(toDate);
	const cdiEligible = assetType === 'fixed_income' && valuationMethod === 'cdi';
	const totalDays = differenceInCalendarDays(startDate, endDate);
	if (!cdiEligible || totalDays === 0 || initialValueInCents === 0) {
		return {
			valueInCents: initialValueInCents,
			configuredDays: 0,
			unconfiguredDays: cdiEligible ? totalDays : 0,
		};
	}

	const history = getRatesForPerson(rates, personId);
	const futureChanges = history.filter(rate => {
		const effectiveDate = startOfLocalDay(rate.effectiveFrom);
		return effectiveDate.getTime() > startDate.getTime() && effectiveDate.getTime() <= endDate.getTime();
	});

	let cursor = startDate;
	let activeRate = getActiveCdiRateForPerson(history, personId, startDate);
	let projectedValueInCents = initialValueInCents;
	let configuredDays = 0;
	let unconfiguredDays = 0;

	const applySegment = (segmentEnd: Date) => {
		const days = differenceInCalendarDays(cursor, segmentEnd);
		if (days === 0) {
			return;
		}

		if (activeRate) {
			projectedValueInCents = compoundValueWithCdiRate({
				valueInCents: projectedValueInCents,
				annualRateInBasisPoints: activeRate.annualRateInBasisPoints,
				cdiPercentageInBasisPoints,
				days,
			});
			configuredDays += days;
		} else {
			unconfiguredDays += days;
		}
	};

	futureChanges.forEach(rate => {
		const effectiveDate = startOfLocalDay(rate.effectiveFrom);
		applySegment(effectiveDate);
		cursor = effectiveDate;
		activeRate = rate;
	});

	applySegment(endDate);

	return {
		valueInCents: projectedValueInCents,
		configuredDays,
		unconfiguredDays,
	};
};

const resolveInvestmentStartDate = (investment: InvestmentPortfolioInvestment, asOfDate: Date) =>
	getSafeDate(investment.investmentDate ?? investment.createdAt, asOfDate);

type InvestmentTimelineEvent =
	| { date: Date; priority: number; type: 'adjust'; valueInCents: number }
	| { date: Date; priority: number; type: 'set'; valueInCents: number };

const buildTimelineEvents = ({
	investment,
	cashFlows,
	syncs,
	asOfDate,
}: {
	investment: InvestmentPortfolioInvestment;
	cashFlows: InvestmentCashFlow[];
	syncs: InvestmentSync[];
	asOfDate: Date;
}) => {
	const startDate = resolveInvestmentStartDate(investment, asOfDate);
	const events: InvestmentTimelineEvent[] = [
		{
			date: startDate,
			priority: 0,
			type: 'adjust',
			valueInCents: normalizeCents(investment.initialValueInCents),
		},
	];

	cashFlows
		.filter(flow => flow.investmentId === investment.id && isValidDate(flow.date))
		.forEach(flow => {
			const date = startOfLocalDay(flow.date);
			if (date.getTime() < startDate.getTime()) {
				return;
			}
			events.push({
				date,
				priority: 2,
				type: 'adjust',
				valueInCents:
					flow.kind === 'deposit' ? normalizeCents(flow.valueInCents) : -normalizeCents(flow.valueInCents),
			});
		});

	syncs
		.filter(sync => sync.investmentId === investment.id && isValidDate(sync.date))
		.forEach(sync => {
			const date = startOfLocalDay(sync.date);
			if (date.getTime() < startDate.getTime()) {
				return;
			}
			events.push({
				date,
				priority: 1,
				type: 'set',
				valueInCents: normalizeCents(sync.syncedValueInCents),
			});
		});

	if (isValidDate(investment.lastManualSyncAt)) {
		const snapshotDate = startOfLocalDay(investment.lastManualSyncAt);
		if (snapshotDate.getTime() >= startDate.getTime()) {
			events.push({
				date: snapshotDate,
				priority: 3,
				type: 'set',
				valueInCents: normalizeCents(investment.currentValueInCents),
			});
		}
	}

	return events.sort((left, right) => {
		const dateDifference = left.date.getTime() - right.date.getTime();
		return dateDifference !== 0 ? dateDifference : left.priority - right.priority;
	});
};

const getValueAtDate = ({
	investment,
	cashFlows,
	syncs,
	rates,
	date,
}: {
	investment: InvestmentPortfolioInvestment;
	cashFlows: InvestmentCashFlow[];
	syncs: InvestmentSync[];
	rates: InvestmentCdiRate[];
	date: Date;
}) => {
	const targetDate = startOfLocalDay(date);
	const startDate = resolveInvestmentStartDate(investment, targetDate);
	if (targetDate.getTime() < startDate.getTime()) {
		return 0;
	}

	let cursor = startDate;
	let currentValueInCents = 0;
	const events = buildTimelineEvents({ investment, cashFlows, syncs, asOfDate: targetDate });

	events.forEach(event => {
		if (event.date.getTime() > targetDate.getTime()) {
			return;
		}
		currentValueInCents = projectInvestmentValueInCents({
			valueInCents: currentValueInCents,
			fromDate: cursor,
			toDate: event.date,
			personId: investment.personId,
			cdiPercentageInBasisPoints: investment.cdiPercentageInBasisPoints,
			valuationMethod: investment.valuationMethod,
			assetType: investment.assetType,
			rates,
		}).valueInCents;
		cursor = event.date;
		currentValueInCents =
			event.type === 'set'
				? normalizeCents(event.valueInCents)
				: Math.max(0, currentValueInCents + event.valueInCents);
	});

	return projectInvestmentValueInCents({
		valueInCents: currentValueInCents,
		fromDate: cursor,
		toDate: targetDate,
		personId: investment.personId,
		cdiPercentageInBasisPoints: investment.cdiPercentageInBasisPoints,
		valuationMethod: investment.valuationMethod,
		assetType: investment.assetType,
		rates,
	}).valueInCents;
};

const sumCashFlows = ({
	investment,
	cashFlows,
	until,
}: {
	investment: InvestmentPortfolioInvestment;
	cashFlows: InvestmentCashFlow[];
	until: Date;
}) => {
	const startDate = resolveInvestmentStartDate(investment, until);
	const normalizedUntil = startOfLocalDay(until);
	const result = {
		contributionsInCents: normalizedUntil.getTime() >= startDate.getTime() ? normalizeCents(investment.initialValueInCents) : 0,
		redemptionsInCents: 0,
	};

	cashFlows
		.filter(
			flow =>
				flow.investmentId === investment.id &&
				isValidDate(flow.date) &&
				startOfLocalDay(flow.date).getTime() <= normalizedUntil.getTime(),
		)
		.forEach(flow => {
			if (flow.kind === 'deposit') {
				result.contributionsInCents += normalizeCents(flow.valueInCents);
			} else {
				result.redemptionsInCents += normalizeCents(flow.valueInCents);
			}
		});

	return result;
};

const sumCashFlowsInPeriod = ({
	investment,
	cashFlows,
	from,
	to,
}: {
	investment: InvestmentPortfolioInvestment;
	cashFlows: InvestmentCashFlow[];
	from: Date;
	to: Date;
}) => {
	const fromDate = startOfLocalDay(from);
	const toDate = startOfLocalDay(to);
	const result = { depositsInCents: 0, withdrawalsInCents: 0 };

	cashFlows
		.filter(flow => flow.investmentId === investment.id && isValidDate(flow.date))
		.forEach(flow => {
			const flowDate = startOfLocalDay(flow.date);
			if (flowDate.getTime() <= fromDate.getTime() || flowDate.getTime() > toDate.getTime()) {
				return;
			}
			if (flow.kind === 'deposit') {
				result.depositsInCents += normalizeCents(flow.valueInCents);
			} else {
				result.withdrawalsInCents += normalizeCents(flow.valueInCents);
			}
		});

	return result;
};

const calculateReturnInBasisPoints = (gainInCents: number, baseInCents: number) => {
	if (baseInCents <= 0) {
		return 0;
	}

	return Math.trunc((gainInCents * BASIS_POINTS_SCALE) / baseInCents);
};

const getPeriodStart = (
	investments: InvestmentPortfolioInvestment[],
	period: InvestmentPerformancePeriod,
	asOfDate: Date,
) => {
	const asOf = startOfLocalDay(asOfDate);
	if (period === '30d') {
		return addDays(asOf, -30);
	}
	if (period === '6m') {
		return addMonths(asOf, -6);
	}
	if (period === '12m') {
		return addMonths(asOf, -12);
	}

	const earliestDate = investments.reduce<Date | null>((earliest, investment) => {
		const date = resolveInvestmentStartDate(investment, asOf);
		if (!earliest || date.getTime() < earliest.getTime()) {
			return date;
		}
		return earliest;
	}, null);
	return earliestDate ?? asOf;
};

const getPeriodLabel = (period: InvestmentPerformancePeriod) => {
	switch (period) {
		case '30d':
			return 'últimos 30 dias';
		case '6m':
			return 'últimos 6 meses';
		case '12m':
			return 'últimos 12 meses';
		default:
			return 'desde o início';
	}
};

const buildEvolutionDates = ({
	period,
	periodStart,
	asOfDate,
}: {
	period: InvestmentPerformancePeriod;
	periodStart: Date;
	asOfDate: Date;
}) => {
	const start = startOfLocalDay(periodStart);
	const end = startOfLocalDay(asOfDate);
	if (start.getTime() >= end.getTime()) {
		return [end];
	}

	if (period === '30d') {
		return Array.from({ length: 7 }, (_, index) => {
			const daysFromStart = Math.min(30, index * 5);
			return index === 6 ? end : addDays(start, daysFromStart);
		});
	}

	const months = Math.max(1, getMonthDifference(start, end));
	const step = period === 'all' ? Math.max(1, Math.ceil(months / 11)) : 1;
	const dates: Date[] = [start];
	let cursor = addMonths(start, step);
	while (cursor.getTime() < end.getTime()) {
		dates.push(cursor);
		cursor = addMonths(cursor, step);
	}
	if (dates[dates.length - 1].getTime() !== end.getTime()) {
		dates.push(end);
	}
	return dates;
};

export const buildInvestmentPortfolioAnalytics = ({
	investments,
	rates,
	cashFlows,
	syncs,
	period,
	asOfDate = new Date(),
}: {
	investments: InvestmentPortfolioInvestment[];
	rates: InvestmentCdiRate[];
	cashFlows: InvestmentCashFlow[];
	syncs: InvestmentSync[];
	period: InvestmentPerformancePeriod;
	asOfDate?: Date;
}): InvestmentPortfolioAnalytics => {
	const normalizedAsOfDate = startOfLocalDay(asOfDate);
	const periodStart = getPeriodStart(investments, period, normalizedAsOfDate);
	const itemsByInvestmentId: Record<string, InvestmentPerformanceItem> = {};
	const allocationByBankId = new Map<string, InvestmentPortfolioAllocation>();
	const unconfiguredInvestmentIds: string[] = [];

	let totalContributionsInCents = 0;
	let totalRedemptionsInCents = 0;
	let projectedValueInCents = 0;
	let totalGainInCents = 0;
	let periodGainInCents = 0;
	let periodBaseInCents = 0;
	let dailyYieldInCents = 0;

	investments.forEach(investment => {
		const currentValueInCents = getValueAtDate({
			investment,
			cashFlows,
			syncs,
			rates,
			date: normalizedAsOfDate,
		});
		const valueAtPeriodStartInCents = getValueAtDate({
			investment,
			cashFlows,
			syncs,
			rates,
			date: periodStart,
		});
		const nextDayValueInCents = getValueAtDate({
			investment,
			cashFlows,
			syncs,
			rates,
			date: addDays(normalizedAsOfDate, 1),
		});
		const totalFlows = sumCashFlows({ investment, cashFlows, until: normalizedAsOfDate });
		const periodFlows = sumCashFlowsInPeriod({
			investment,
			cashFlows,
			from: periodStart,
			to: normalizedAsOfDate,
		});
		const netAppliedInCents = totalFlows.contributionsInCents - totalFlows.redemptionsInCents;
		const totalGain = currentValueInCents + totalFlows.redemptionsInCents - totalFlows.contributionsInCents;
		const periodBase = valueAtPeriodStartInCents + periodFlows.depositsInCents;
		const periodGain =
			currentValueInCents +
			periodFlows.withdrawalsInCents -
			valueAtPeriodStartInCents -
			periodFlows.depositsInCents;
		const hasCurrentCdiRate =
			shouldProjectWithCdi(investment) &&
			Boolean(getActiveCdiRateForPerson(rates, investment.personId, normalizedAsOfDate));

		if (shouldProjectWithCdi(investment) && !hasCurrentCdiRate) {
			unconfiguredInvestmentIds.push(investment.id);
		}

		itemsByInvestmentId[investment.id] = {
			investmentId: investment.id,
			projectedValueInCents: currentValueInCents,
			netAppliedInCents,
			totalContributionsInCents: totalFlows.contributionsInCents,
			totalRedemptionsInCents: totalFlows.redemptionsInCents,
			totalGainInCents: totalGain,
			totalReturnInBasisPoints: calculateReturnInBasisPoints(totalGain, totalFlows.contributionsInCents),
			periodGainInCents: periodGain,
			periodReturnInBasisPoints: calculateReturnInBasisPoints(periodGain, periodBase),
			dailyYieldInCents: nextDayValueInCents - currentValueInCents,
			hasCurrentCdiRate,
		};

		totalContributionsInCents += totalFlows.contributionsInCents;
		totalRedemptionsInCents += totalFlows.redemptionsInCents;
		projectedValueInCents += currentValueInCents;
		totalGainInCents += totalGain;
		periodGainInCents += periodGain;
		periodBaseInCents += periodBase;
		dailyYieldInCents += nextDayValueInCents - currentValueInCents;

		const allocationKey = investment.bankId ?? 'cash';
		const currentAllocation = allocationByBankId.get(allocationKey) ?? {
			bankId: investment.bankId,
			investmentCount: 0,
			netAppliedInCents: 0,
			projectedValueInCents: 0,
			totalGainInCents: 0,
		};
		currentAllocation.investmentCount += 1;
		currentAllocation.netAppliedInCents += netAppliedInCents;
		currentAllocation.projectedValueInCents += currentValueInCents;
		currentAllocation.totalGainInCents += totalGain;
		allocationByBankId.set(allocationKey, currentAllocation);
	});

	const evolution = buildEvolutionDates({ period, periodStart, asOfDate: normalizedAsOfDate }).map(date => {
		const values = investments.reduce(
			(accumulator, investment) => {
				const flows = sumCashFlows({ investment, cashFlows, until: date });
				accumulator.netAppliedInCents += flows.contributionsInCents - flows.redemptionsInCents;
				accumulator.projectedValueInCents += getValueAtDate({
					investment,
					cashFlows,
					syncs,
					rates,
					date,
				});
				return accumulator;
			},
			{ netAppliedInCents: 0, projectedValueInCents: 0 },
		);

		return {
			label: formatChartLabel(date, period),
			dateISO: formatDateISO(date),
			netAppliedInCents: values.netAppliedInCents,
			projectedValueInCents: values.projectedValueInCents,
		};
	});

	return {
		period,
		periodLabel: getPeriodLabel(period),
		periodStart,
		asOfDate: normalizedAsOfDate,
		totalContributionsInCents,
		totalRedemptionsInCents,
		netAppliedInCents: totalContributionsInCents - totalRedemptionsInCents,
		projectedValueInCents,
		totalGainInCents,
		totalReturnInBasisPoints: calculateReturnInBasisPoints(totalGainInCents, totalContributionsInCents),
		periodGainInCents,
		periodReturnInBasisPoints: calculateReturnInBasisPoints(periodGainInCents, periodBaseInCents),
		dailyYieldInCents,
		unconfiguredInvestmentIds,
		itemsByInvestmentId,
		evolution,
		allocation: Array.from(allocationByBankId.values()).sort(
			(left, right) => right.projectedValueInCents - left.projectedValueInCents,
		),
	};
};
