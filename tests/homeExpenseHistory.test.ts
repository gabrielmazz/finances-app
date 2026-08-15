import { buildHomeExpenseHistory } from '@/utils/homeExpenseHistory';

describe('buildHomeExpenseHistory', () => {
	it('groups expenses by day across the current and two previous months', () => {
		const referenceDate = new Date(2026, 7, 14, 12, 0, 0);
		const history = buildHomeExpenseHistory(
			[
				{ date: new Date(2026, 5, 4, 9), valueInCents: 1250 },
				{ date: new Date(2026, 5, 4, 18), valueInCents: 750 },
				{ date: new Date(2026, 6, 31, 12), valueInCents: 5000 },
				{ date: new Date(2026, 7, 2, 12), valueInCents: 2300 },
				{ date: new Date(2026, 7, 15, 12), valueInCents: 9000 },
			],
			[
				{ date: new Date(2026, 5, 20, 12), valueInCents: 4200 },
				{ date: new Date(2026, 6, 20, 12), valueInCents: 1800 },
			],
			referenceDate,
		);

		expect(history).toHaveLength(3);
		expect(history[0]).toMatchObject({
			key: '2026-06',
			daysInMonth: 30,
			dailyExpensesInCents: { '4': 2000 },
			totalExpensesInCents: 2000,
			totalGainsInCents: 4200,
		});
		expect(history[1]).toMatchObject({
			key: '2026-07',
			dailyExpensesInCents: { '31': 5000 },
			totalExpensesInCents: 5000,
			totalGainsInCents: 1800,
		});
		expect(history[2]).toMatchObject({
			key: '2026-08',
			dailyExpensesInCents: { '2': 2300 },
			totalExpensesInCents: 2300,
			totalGainsInCents: 0,
		});
	});

	it('ignores invalid, non-positive and future values', () => {
		const history = buildHomeExpenseHistory(
			[
				{ date: new Date(2026, 7, 2), valueInCents: 0 },
				{ date: new Date(2026, 7, 3), valueInCents: -100 },
				{ date: new Date(2026, 7, 4), valueInCents: 10.5 },
				{ date: new Date(2026, 7, 15), valueInCents: 1000 },
				{ date: null, valueInCents: 1000 },
			],
			[],
			new Date(2026, 7, 14, 12),
		);

		expect(history.every((month) => month.totalExpensesInCents === 0)).toBe(true);
	});
});
