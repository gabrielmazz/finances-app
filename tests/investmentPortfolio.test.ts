import {
	buildInvestmentPortfolioAnalytics,
	formatBasisPointsAsPercentage,
	parsePercentageToBasisPoints,
	projectInvestmentValueInCents,
	type InvestmentCdiRate,
	type InvestmentPortfolioInvestment,
} from '@/utils/investmentPortfolio';

const makeDate = (year: number, month: number, day: number) => new Date(year, month - 1, day);

const cdiRates: InvestmentCdiRate[] = [
	{
		id: 'cdi-jan',
		personId: 'person-1',
		annualRateInBasisPoints: 1200,
		effectiveFrom: makeDate(2026, 1, 1),
	},
	{
		id: 'cdi-feb',
		personId: 'person-1',
		annualRateInBasisPoints: 1500,
		effectiveFrom: makeDate(2026, 2, 1),
	},
];

const baseInvestment: InvestmentPortfolioInvestment = {
	id: 'investment-1',
	personId: 'person-1',
	name: 'CDB',
	bankId: 'bank-1',
	initialValueInCents: 100_000,
	currentValueInCents: 100_000,
	cdiPercentageInBasisPoints: 10_000,
	assetType: 'fixed_income',
	valuationMethod: 'cdi',
	investmentDate: makeDate(2026, 1, 1),
	createdAt: makeDate(2026, 1, 1),
	lastManualSyncAt: makeDate(2026, 1, 1),
};

describe('investmentPortfolio', () => {
	it('mantém a projeção no valor base até uma taxa CDI ser configurada', () => {
		const projected = projectInvestmentValueInCents({
			valueInCents: 100_000,
			fromDate: makeDate(2026, 1, 1),
			toDate: makeDate(2026, 2, 1),
			personId: 'person-1',
			cdiPercentageInBasisPoints: 10_000,
			assetType: 'fixed_income',
			valuationMethod: 'cdi',
			rates: [],
		});

		expect(projected.valueInCents).toBe(100_000);
		expect(projected.unconfiguredDays).toBeGreaterThan(0);
	});

	it('aplica o histórico de CDI por vigência, sem uma taxa anual fixa no código', () => {
		const withHistory = projectInvestmentValueInCents({
			valueInCents: 100_000,
			fromDate: makeDate(2026, 1, 1),
			toDate: makeDate(2026, 3, 1),
			personId: 'person-1',
			cdiPercentageInBasisPoints: 10_000,
			assetType: 'fixed_income',
			valuationMethod: 'cdi',
			rates: cdiRates,
		});
		const onlyFirstRate = projectInvestmentValueInCents({
			valueInCents: 100_000,
			fromDate: makeDate(2026, 1, 1),
			toDate: makeDate(2026, 3, 1),
			personId: 'person-1',
			cdiPercentageInBasisPoints: 10_000,
			assetType: 'fixed_income',
			valuationMethod: 'cdi',
			rates: cdiRates.slice(0, 1),
		});

		expect(withHistory.valueInCents).toBeGreaterThan(100_000);
		expect(withHistory.valueInCents).toBeGreaterThan(onlyFirstRate.valueInCents);
		expect(withHistory.configuredDays).toBeGreaterThan(0);
	});

	it('preserva o valor salvo para classes de ativo sem modelo de precificação automático', () => {
		const projected = projectInvestmentValueInCents({
			valueInCents: 100_000,
			fromDate: makeDate(2026, 1, 1),
			toDate: makeDate(2026, 3, 1),
			personId: 'person-1',
			cdiPercentageInBasisPoints: 10_000,
			assetType: 'treasury',
			valuationMethod: 'manual',
			rates: cdiRates,
		});

		expect(projected.valueInCents).toBe(100_000);
	});

	it('calcula ganho acumulado considerando aportes, resgates e a última sincronização real', () => {
		const analytics = buildInvestmentPortfolioAnalytics({
			investments: [
				{
					...baseInvestment,
					currentValueInCents: 115_000,
					lastManualSyncAt: makeDate(2026, 1, 20),
				},
			],
			rates: cdiRates,
			cashFlows: [
				{
					investmentId: 'investment-1',
					date: makeDate(2026, 1, 10),
					valueInCents: 20_000,
					kind: 'deposit',
				},
				{
					investmentId: 'investment-1',
					date: makeDate(2026, 1, 15),
					valueInCents: 10_000,
					kind: 'withdrawal',
				},
			],
			syncs: [
				{
					investmentId: 'investment-1',
					date: makeDate(2026, 1, 9),
					syncedValueInCents: 105_000,
					reason: 'manual',
				},
			],
			period: 'all',
			asOfDate: makeDate(2026, 1, 20),
		});

		expect(analytics.totalContributionsInCents).toBe(120_000);
		expect(analytics.totalRedemptionsInCents).toBe(10_000);
		expect(analytics.netAppliedInCents).toBe(110_000);
		expect(analytics.projectedValueInCents).toBe(115_000);
		expect(analytics.totalGainInCents).toBe(5_000);
		expect(analytics.periodGainInCents).toBe(5_000);
		expect(analytics.dailyYieldInCents).toBeGreaterThan(0);
		expect(analytics.evolution.at(-1)).toMatchObject({
			netAppliedInCents: 110_000,
			projectedValueInCents: 115_000,
		});
	});

	it('converte percentuais em pontos-base sem transformar valores monetários em float', () => {
		expect(parsePercentageToBasisPoints('13,75')).toBe(1375);
		expect(parsePercentageToBasisPoints('110,25')).toBe(11025);
		expect(parsePercentageToBasisPoints('13,755')).toBeNull();
		expect(formatBasisPointsAsPercentage(11025)).toBe('110,25');
	});
});
