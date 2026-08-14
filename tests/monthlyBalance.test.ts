import {
	calculateLegacyBankBalanceInCents,
	shouldIncludeMovementInGainExpenseTotals,
} from '@/utils/monthlyBalance';

describe('legacy bank balance', () => {
	it('uses the latest monthly opening snapshot and only subsequent movements', () => {
		const balance = calculateLegacyBankBalanceInCents({
			bankId: 'bank-1',
			asOfDate: new Date(2026, 7, 15),
			snapshots: [
				{ bankId: 'bank-1', year: 2026, month: 5, valueInCents: 50_000 },
				{ bankId: 'bank-1', year: 2026, month: 7, valueInCents: 70_000 },
			],
			expenses: [
				{ bankId: 'bank-1', valueInCents: 10_000, date: new Date(2026, 5, 20) },
				{ bankId: 'bank-1', valueInCents: 5_000, date: new Date(2026, 7, 10) },
			],
			gains: [{ bankId: 'bank-1', valueInCents: 2_500, date: new Date(2026, 7, 12) }],
		});

		expect(balance).toBe(67_500);
	});

	it('subtracts the initial investment cash outflow, never its appreciated value', () => {
		const balance = calculateLegacyBankBalanceInCents({
			bankId: 'bank-1',
			asOfDate: new Date(2026, 7, 15),
			snapshots: [{ bankId: 'bank-1', year: 2026, month: 8, valueInCents: 100_000 }],
			investments: [
				{
					bankId: 'bank-1',
					initialValueInCents: 10_000,
					currentValueInCents: 11_000,
					date: new Date(2026, 7, 2),
				},
			],
		});

		expect(balance).toBe(90_000);
	});

	it('does not classify transfers as gains or expenses', () => {
		expect(shouldIncludeMovementInGainExpenseTotals({ isBankTransfer: true })).toBe(false);
		expect(shouldIncludeMovementInGainExpenseTotals({})).toBe(true);
	});
});
