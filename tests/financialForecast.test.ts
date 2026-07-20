import {
	buildFinancialForecast,
	calculateFinancialForecastOpeningBalance,
	type FinancialForecastMandatoryTemplate,
	type FinancialForecastMovement,
} from '@/utils/financialForecast';

const buildMovement = (overrides: Partial<FinancialForecastMovement>): FinancialForecastMovement => ({
	id: overrides.id ?? Math.random().toString(36),
	type: overrides.type ?? 'expense',
	name: overrides.name ?? 'Movimento',
	valueInCents: overrides.valueInCents ?? 0,
	date: overrides.date ?? new Date(2026, 6, 1, 12),
	tagId: overrides.tagId ?? null,
	tagName: overrides.tagName ?? null,
	bankId: overrides.bankId ?? 'bank-a',
	isInvestmentDeposit: overrides.isInvestmentDeposit ?? false,
	isInvestmentRedemption: overrides.isInvestmentRedemption ?? false,
	isBankTransfer: overrides.isBankTransfer ?? false,
	isFinanceInvestment: overrides.isFinanceInvestment ?? false,
	isFinanceInvestmentSync: overrides.isFinanceInvestmentSync ?? false,
});

const buildMandatoryTemplate = (
	overrides: Partial<FinancialForecastMandatoryTemplate>,
): FinancialForecastMandatoryTemplate => ({
	id: overrides.id ?? Math.random().toString(36),
	type: overrides.type ?? 'expense',
	name: overrides.name ?? 'Compromisso',
	valueInCents: overrides.valueInCents ?? 1000,
	dueDay: overrides.dueDay ?? 10,
	usesBusinessDays: overrides.usesBusinessDays ?? false,
	tagId: overrides.tagId ?? null,
	tagName: overrides.tagName ?? null,
	lastCompletedCycle: overrides.lastCompletedCycle ?? null,
	installmentTotal: overrides.installmentTotal ?? null,
	installmentsCompleted: overrides.installmentsCompleted ?? 0,
	installmentStartDate: overrides.installmentStartDate ?? null,
	installmentEndDate: overrides.installmentEndDate ?? null,
});

describe('financial forecast', () => {
	it('combines fixed commitments, category averages, scheduled movements, and investment events without treating maturity as income', () => {
		const result = buildFinancialForecast({
			asOfDate: new Date(2026, 6, 10, 12),
			periodInMonths: 3,
			openingBalanceInCents: 100000,
			mandatoryTemplates: [
				buildMandatoryTemplate({
					id: 'rent',
					name: 'Aluguel',
					valueInCents: 30000,
					dueDay: 5,
					tagId: 'housing',
					tagName: 'Moradia',
				}),
				buildMandatoryTemplate({
					id: 'salary',
					type: 'gain',
					name: 'Salário',
					valueInCents: 150000,
					dueDay: 5,
					lastCompletedCycle: '2026-07',
				}),
			],
			movements: [
				buildMovement({ id: 'food-apr', name: 'Mercado', valueInCents: 10000, date: new Date(2026, 3, 10), tagId: 'food', tagName: 'Alimentação' }),
				buildMovement({ id: 'food-may', name: 'Mercado', valueInCents: 20000, date: new Date(2026, 4, 10), tagId: 'food', tagName: 'Alimentação' }),
				buildMovement({ id: 'food-jun', name: 'Mercado', valueInCents: 30000, date: new Date(2026, 5, 10), tagId: 'food', tagName: 'Alimentação' }),
				buildMovement({ id: 'freelance-apr', type: 'gain', name: 'Freela', valueInCents: 10000, date: new Date(2026, 3, 20), tagId: 'extra', tagName: 'Extras' }),
				buildMovement({ id: 'freelance-may', type: 'gain', name: 'Freela', valueInCents: 10000, date: new Date(2026, 4, 20), tagId: 'extra', tagName: 'Extras' }),
				buildMovement({ id: 'freelance-jun', type: 'gain', name: 'Freela', valueInCents: 10000, date: new Date(2026, 5, 20), tagId: 'extra', tagName: 'Extras' }),
				buildMovement({ id: 'planned-food', name: 'Compra planejada', valueInCents: 50000, date: new Date(2026, 7, 20), tagId: 'food', tagName: 'Alimentação' }),
			],
			investments: [
				{
					id: 'scheduled-investment',
					name: 'CDB novo',
					initialValueInCents: 40000,
					currentValueInCents: 40000,
					date: new Date(2026, 7, 21),
					bankId: 'bank-a',
					redemptionTerm: '1y',
				},
				{
					id: 'maturing-investment',
					name: 'CDB antigo',
					initialValueInCents: 55000,
					currentValueInCents: 57000,
					date: new Date(2026, 4, 20),
					bankId: 'bank-a',
					redemptionTerm: '3m',
				},
			],
		});

		expect(result.months.map(month => month.closingBalanceInCents)).toEqual([60000, 100000, 210000]);
		expect(result.months[0].commitments.some(item => item.kind === 'fixed-expense' && item.isOverdue)).toBe(true);
		expect(result.months[1].variableExpensesInCents).toBe(0);
		expect(result.months[1].investmentOutflowsInCents).toBe(40000);
		expect(result.months[1].investmentInflowsInCents).toBe(0);
		expect(result.months[1].commitments).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'investment-liquidity',
					valueInCents: 57000,
				}),
			]),
		);
	});

	it('respects the configured start and end cycles of installment templates', () => {
		const result = buildFinancialForecast({
			asOfDate: new Date(2026, 6, 10, 12),
			periodInMonths: 3,
			openingBalanceInCents: 0,
			mandatoryTemplates: [
				buildMandatoryTemplate({
					id: 'course',
					name: 'Curso',
					valueInCents: 25000,
					installmentTotal: 2,
					installmentStartDate: new Date(2026, 6, 15),
					installmentEndDate: new Date(2026, 7, 15),
				}),
			],
			movements: [],
			investments: [],
		});

		expect(result.months.map(month => month.fixedExpensesInCents)).toEqual([25000, 25000, 0]);
	});

	it('only estimates variable categories that recur in distinct closed months', () => {
		const result = buildFinancialForecast({
			asOfDate: new Date(2026, 6, 10, 12),
			periodInMonths: 3,
			openingBalanceInCents: 0,
			mandatoryTemplates: [],
			movements: [
				buildMovement({
					id: 'bike-april-1',
					name: 'Manutenção de bicicleta',
					valueInCents: 9000,
					date: new Date(2026, 3, 8),
					tagId: 'bike',
					tagName: 'Bicicleta',
				}),
				buildMovement({
					id: 'bike-april-2',
					name: 'Peça de bicicleta',
					valueInCents: 3000,
					date: new Date(2026, 3, 20),
					tagId: 'bike',
					tagName: 'Bicicleta',
				}),
				buildMovement({
					id: 'uber-may',
					name: 'Uber trabalho',
					valueInCents: 1200,
					date: new Date(2026, 4, 10),
					tagId: 'uber',
					tagName: 'Uber',
				}),
				buildMovement({
					id: 'uber-june',
					name: 'Uber consulta',
					valueInCents: 1800,
					date: new Date(2026, 5, 18),
					tagId: 'uber',
					tagName: 'Uber',
				}),
			],
			investments: [],
		});

		expect(result.months.map(month => month.variableExpensesInCents)).toEqual([1000, 1000, 1000]);
		expect(result.months[0].commitments).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'variable-expense',
					name: 'Uber',
					historicalOccurrenceMonths: 2,
				}),
			]),
		);
		expect(result.months[0].commitments.some(item => item.tagName === 'Bicicleta')).toBe(false);
	});

	it('updates the latest bank snapshots with actual liquid movements and excludes transfers from the global cash total', () => {
		const opening = calculateFinancialForecastOpeningBalance({
			asOfDate: new Date(2026, 6, 10, 12),
			banks: [
				{
					bankId: 'bank-a',
					bankName: 'Banco A',
					snapshotDate: new Date(2026, 6, 1),
					valueInCents: 100000,
				},
				{
					bankId: 'bank-b',
					bankName: 'Banco B',
					snapshotDate: null,
					valueInCents: null,
				},
			],
			movements: [
				buildMovement({ id: 'bank-expense', valueInCents: 10000, date: new Date(2026, 6, 3), bankId: 'bank-a' }),
				buildMovement({ id: 'bank-gain', type: 'gain', valueInCents: 5000, date: new Date(2026, 6, 4), bankId: 'bank-a' }),
				buildMovement({ id: 'cash-gain', type: 'gain', valueInCents: 2000, date: new Date(2026, 6, 4), bankId: null }),
				buildMovement({ id: 'cash-expense', valueInCents: 1000, date: new Date(2026, 6, 4), bankId: null }),
				buildMovement({ id: 'transfer', valueInCents: 50000, date: new Date(2026, 6, 5), bankId: 'bank-a', isBankTransfer: true }),
			],
			investments: [
				{
					id: 'investment',
					name: 'CDB',
					initialValueInCents: 20000,
					currentValueInCents: 20000,
					date: new Date(2026, 6, 6),
					bankId: 'bank-a',
					redemptionTerm: 'anytime',
				},
			],
			cashRescues: [
				{
					id: 'cash-rescue',
					bankId: 'bank-a',
					valueInCents: 3000,
					date: new Date(2026, 6, 7),
				},
			],
		});

		expect(opening.openingBalanceInCents).toBe(76000);
		expect(opening.missingSnapshotBankNames).toEqual(['Banco B']);
	});
});
