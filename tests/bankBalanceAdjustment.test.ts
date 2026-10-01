import { calculateBankBalanceAdjustment, canChangeBankBalanceAdjustment } from '@/utils/bankBalanceAdjustment';
import { calculateLegacyBankBalanceInCents, shouldIncludeMovementInGainExpenseTotals } from '@/utils/monthlyBalance';
import { calculateFinancialForecastOpeningBalance, buildFinancialForecast } from '@/utils/financialForecast';
import { createLegacyMigrationPlan } from '@/utils/financialLedgerMigration';
import { validateLedgerTransaction } from '@/utils/financialLedger';

describe('bank balance adjustments', () => {
	it.each([[10_000, 12_000, 2_000], [10_000, 8_000, -2_000], [100, 101, 1], [500, 0, -500], [100, -100, -200], [100, 100, 0]])(
		'calculates the signed difference from %i to %i', (previous, target, expected) => {
			expect(calculateBankBalanceAdjustment(previous, target)).toBe(expected);
		},
	);
	it('rejects fractional cents and unsafe results', () => {
		expect(() => calculateBankBalanceAdjustment(1.5, 100)).toThrow();
		expect(() => calculateBankBalanceAdjustment(100, NaN)).toThrow();
		expect(() => calculateBankBalanceAdjustment(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toThrow();
	});
	it('only allows changes to an active original', () => {
		expect(canChangeBankBalanceAdjustment({ status: 'active' })).toBe(true);
		expect(canChangeBankBalanceAdjustment({ status: 'reversed' })).toBe(false);
		expect(canChangeBankBalanceAdjustment({ status: 'replaced' })).toBe(false);
		expect(canChangeBankBalanceAdjustment({ status: 'active', reversesAdjustmentId: 'original' })).toBe(false);
	});
	it('keeps real movements and sums only adjustments after the latest opening', () => {
		const balance = calculateLegacyBankBalanceInCents({
			bankId: 'bank', snapshotTimeZone: 'America/Sao_Paulo', asOfDate: new Date('2026-09-15T23:00:00-03:00'),
			snapshots: [{ bankId: 'bank', year: 2026, month: 9, valueInCents: 10_000 }],
			gains: [{ bankId: 'bank', valueInCents: 500, date: new Date('2026-09-02T12:00:00-03:00') }],
			expenses: [{ bankId: 'bank', valueInCents: 300, date: new Date('2026-09-03T12:00:00-03:00') }],
			balanceAdjustments: [
				{ bankId: 'bank', differenceInCents: 2_000, date: new Date('2026-09-04T12:00:00-03:00') },
				{ bankId: 'bank', differenceInCents: -100, date: new Date('2026-09-05T12:00:00-03:00') },
				{ bankId: 'bank', differenceInCents: 50_000, date: new Date('2026-09-01T01:00:00Z') },
				{ bankId: 'bank', differenceInCents: 50_000, date: new Date('2026-09-20T12:00:00-03:00') },
				{ bankId: 'other', differenceInCents: 50_000, date: new Date('2026-09-04T12:00:00-03:00') },
			],
		});
		expect(balance).toBe(12_100);
		expect(shouldIncludeMovementInGainExpenseTotals({ isBalanceAdjustment: true })).toBe(false);
	});
	it('an inverse cancels its original and does not leak past a newer snapshot', () => {
		const adjustments = [2_000, -2_000].map(differenceInCents => ({ bankId: 'bank', differenceInCents, date: new Date('2026-08-20T12:00:00-03:00') }));
		const snapshots = [{ bankId: 'bank', year: 2026, month: 8, valueInCents: 10_000 }, { bankId: 'bank', year: 2026, month: 9, valueInCents: 12_000 }];
		expect(calculateLegacyBankBalanceInCents({ bankId: 'bank', snapshots, balanceAdjustments: adjustments, asOfDate: new Date('2026-08-25T12:00:00-03:00') })).toBe(10_000);
		expect(calculateLegacyBankBalanceInCents({ bankId: 'bank', snapshots, balanceAdjustments: adjustments, asOfDate: new Date('2026-09-15T12:00:00-03:00') })).toBe(12_000);
	});
	it('changes forecast liquidity without manufacturing gains or expenses', () => {
		const asOfDate = new Date(2026, 8, 15, 12);
		const opening = calculateFinancialForecastOpeningBalance({ asOfDate,
			banks: [{ bankId: 'bank', bankName: 'Banco', snapshotDate: new Date(2026, 8, 1), valueInCents: 10_000 }],
			movements: [], investments: [], balanceAdjustments: [{ bankId: 'bank', date: new Date(2026, 8, 10), differenceInCents: 2_000 }],
		});
		const forecast = buildFinancialForecast({ asOfDate, periodInMonths: 3, openingBalanceInCents: opening.openingBalanceInCents, movements: [], investments: [], mandatoryTemplates: [] });
		expect(forecast.openingBalanceInCents).toBe(12_000);
		expect(forecast.totalGainsInCents).toBe(0);
		expect(forecast.totalExpensesInCents).toBe(0);
	});
	it('migrates signed originals and inverses with a balanced audit trail', () => {
		const plan = createLegacyMigrationPlan({ groupId: 'group', memberIds: ['admin'], banks: [{ id: 'bank', name: 'Banco' }], expenses: [], gains: [], investments: [], bankTransfers: [], cashRescues: [],
			monthlyBalances: [{ id: 'opening', bankId: 'bank', year: 2026, month: 9, balanceInCents: 10_000 }],
			balanceAdjustments: [2_000, -2_000, -500].map((differenceInCents, index) => ({ id: `adjustment-${index}`, bankId: 'bank', differenceInCents, effectiveAt: new Date('2026-09-10T12:00:00-03:00') })),
		});
		expect(plan.issues).toEqual([]);
		expect(plan.accounts.find(account => account.kind === 'bank')?.currentBalanceInCents).toBe(9_500);
		expect(plan.sourceDocumentCount).toBe(5);
		plan.transactions.forEach(event => { expect(() => validateLedgerTransaction(event)).not.toThrow(); expect(event.sourceReferences?.[0].collection).toBe('bankBalanceAdjustments'); });
	});
});
