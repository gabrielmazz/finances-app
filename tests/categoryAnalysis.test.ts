const mockGetDocs = jest.fn();
const mockGetRelatedUsers = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ db: {} }));
jest.mock('@/functions/RegisterUserFirebase', () => ({ getRelatedUsersIDsFirebase: (...args: unknown[]) => mockGetRelatedUsers(...args) }));
jest.mock('firebase/firestore', () => ({
	collection: (_db: unknown, name: string) => name,
	doc: (_db: unknown, name: string, id: string) => ({ name, id }),
	getDoc: async () => ({ exists: () => false }),
	query: (name: string, ...filters: unknown[]) => ({ name, filters }),
	where: (field: string, operator: string, value: unknown) => ({ field, operator, value }),
	Timestamp: { fromDate: (date: Date) => date },
	getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));

import { getCategoryAnalysisFirebase, type CategoryAnalysisRecentMovement } from '@/functions/CategoryAnalysisFirebase';
import { buildCategoryAnalysisMonths, getCategoryAnalysisMovementPage, getCategoryAnalysisRangeError, getDefaultCategoryAnalysisRange } from '@/utils/categoryAnalysis';

const now = new Date(2026, 8, 10, 12);
type Row = { id: string; personId: string; date?: Date; [key: string]: unknown };
let records: Record<string, Row[]>;
const movement = (id: string, month: number, day: number, valueInCents: number, extras: Partial<Row> = {}): Row => ({
	id, personId: 'owner', tagId: 'food', name: id, date: new Date(2026, month - 1, day, 10), valueInCents, ...extras,
});
async function report(range?: Parameters<typeof getCategoryAnalysisFirebase>[1]) {
	const result = await getCategoryAnalysisFirebase('owner', range);
	if (!result.success) throw result.error;
	return result.data;
}

beforeEach(() => {
	jest.useFakeTimers().setSystemTime(now);
	mockGetRelatedUsers.mockReset().mockResolvedValue({ success: true, data: ['related'] });
	records = {
		tags: [{ id: 'food', personId: 'owner', name: 'Alimentação', usageType: 'both' }, { id: 'empty', personId: 'owner', name: 'Vazia' }],
		banks: [], expenses: [], gains: [],
	};
	mockGetDocs.mockReset().mockImplementation(async (request: { name: string; filters: { field: string; operator: string; value: Date | string[] }[] }) => ({
		docs: records[request.name].filter(row => request.filters.every(filter => {
			if (filter.field === 'personId') return (filter.value as string[]).includes(row.personId);
			if (filter.field === 'date' && row.date) {
				return filter.operator === '>=' ? row.date >= filter.value : row.date <= filter.value;
			}
			return false;
		})).map(row => ({ id: row.id, data: () => row })),
	}));
});
afterEach(() => jest.useRealTimers());

it('compares the same elapsed calendar days, preserving full historical chart totals', async () => {
	for (const month of [6, 7, 8]) records.expenses.push(
		movement(`${month}-early`, month, 1, 100), movement(`${month}-cutoff`, month, 10, 200), movement(`${month}-late`, month, 20, 9900),
	);
	records.expenses.push(movement('current', 9, 10, 300), movement('future', 9, 11, 90000),
		movement('transfer', 9, 1, 50000, { isBankTransfer: true }),
		movement('investment', 9, 1, 50000, { isInvestmentDeposit: true }),
		movement('other-person', 9, 1, 50000, { personId: 'unrelated' }));
	const data = await report();
	const food = data.reportsByTagId.food;
	expect(food.expense).toMatchObject({ currentInCents: 300, historicalAverageInCents: 300, deltaPercent: 0, status: 'stable', historicalCount: 6, currentCount: 1 });
	expect(food.months.map(month => month.expenseInCents)).toEqual([10200, 10200, 10200, 300]);
	expect(food.bankBreakdown[0].expenseInCents).toBe(300);
	expect(food.currentPeriodLabel).toBe('Parcial até 10/09/2026');
	expect(food.movements).toHaveLength(10);
	expect(data.reportsByTagId.empty.expense.status).toBe('no-history');
});

it('retains older gains when more than eight newer expenses exist', async () => {
	records.expenses = Array.from({ length: 25 }, (_, index) => movement(`expense-${index}`, 9, 9, 100));
	records.gains = [movement('older-gain', 7, 1, 600)];
	const food = (await report()).reportsByTagId.food;
	expect(getCategoryAnalysisMovementPage(food.movements, 'gain', false).items.map(item => item.id)).toEqual(['older-gain']);
	expect(getCategoryAnalysisMovementPage(food.movements, 'expense', false).items).toHaveLength(8);
	const all = getCategoryAnalysisMovementPage(food.movements, 'expense', true, 1);
	expect(all.all).toHaveLength(25);
	expect(all.items).toHaveLength(5);
	expect(all.pageCount).toBe(2);
});

it('honors inclusive historical dates and excludes partial boundary months from the average', async () => {
	records.expenses = [movement('before', 6, 14, 999), movement('first', 6, 15, 400), movement('middle', 7, 1, 600),
		movement('last', 8, 5, 900), movement('after', 8, 6, 999), movement('current', 9, 1, 600)];
	const food = (await report({ startDate: new Date(2026, 5, 15), endDate: new Date(2026, 7, 5) })).reportsByTagId.food;
	expect(food.movements.map(item => item.id)).toEqual(['current', 'last', 'middle', 'first']);
	expect(food.baselineMonthCount).toBe(1);
	expect(food.expense.historicalAverageInCents).toBe(600);
	expect(food.months.map(month => [month.firstDay, month.lastDay])).toEqual([[15, 30], [1, 31], [1, 5], [1, 10]]);
});

it('keeps months between an older history and today out of both queries and results', async () => {
	records.expenses = [movement('history', 3, 1, 500), movement('gap', 6, 1, 99999), movement('current', 9, 1, 500)];
	const food = (await report({ startDate: new Date(2026, 2, 1), endDate: new Date(2026, 2, 31) })).reportsByTagId.food;
	expect(food.months.map(month => month.key)).toEqual(['2026-03', '2026-09']);
	expect(food.movements.map(item => item.id)).toEqual(['current', 'history']);
	expect(food.expense.status).toBe('stable');
	const expenseRequests = mockGetDocs.mock.calls.map(call => call[0]).filter(request => request.name === 'expenses');
	expect(expenseRequests).toHaveLength(2);
	expect(expenseRequests[0].filters).toContainEqual({ field: 'date', operator: '<=', value: new Date('2026-03-31T23:59:59.999-03:00') });
});

it('counts zero-movement full months and rounds the average to integer cents', async () => {
	records.gains = [movement('historical', 7, 1, 100), movement('current', 9, 1, 33)];
	const metric = (await report()).reportsByTagId.food.gain;
	expect(metric.historicalAverageInCents).toBe(33);
	expect(metric.status).toBe('stable');
	expect(metric.historicalCount).toBe(1);
});

it('returns no history when the selected range has no complete month or only later-day transactions', async () => {
	records.expenses = [movement('late', 7, 20, 1000), movement('current', 9, 1, 100)];
	expect((await report()).reportsByTagId.food.expense.deltaPercent).toBeNull();
	const partial = (await report({ startDate: new Date(2026, 6, 15), endDate: new Date(2026, 6, 25) })).reportsByTagId.food;
	expect(partial.baselineMonthCount).toBe(0);
	expect(partial.expense.status).toBe('no-history');
	expect(partial.expense.historicalAverageInCents).toBe(0);
});

it.each([6, 12])('supports %i closed historical months plus the current month', async count => {
	const data = await report(getDefaultCategoryAnalysisRange(now, count));
	expect(data.baselineMonthCount).toBe(count);
	expect(data.reportsByTagId.food.months).toHaveLength(count + 1);
});

it('handles leap February and calendar year rollover', () => {
	const leapNow = new Date(2024, 2, 31, 12);
	const months = buildCategoryAnalysisMonths(getDefaultCategoryAnalysisRange(leapNow), leapNow);
	expect(months.map(month => month.key)).toEqual(['2023-12', '2024-01', '2024-02', '2024-03']);
	expect(months[2].daysInMonth).toBe(29);
	expect(months[2].isComparisonMonth).toBe(true);
});

it('rejects reversed, invalid, current-month, and oversized ranges before reading Firebase', async () => {
	const ranges = [
		{ startDate: new Date(2026, 7, 2), endDate: new Date(2026, 7, 1) },
		{ startDate: new Date(NaN), endDate: new Date(2026, 7, 1) },
		{ startDate: new Date(2026, 7, 1), endDate: now },
		{ startDate: new Date(2025, 6, 1), endDate: new Date(2026, 7, 31) },
	];
	const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
	try {
		for (const range of ranges) {
			expect(getCategoryAnalysisRangeError(range, now)).not.toBeNull();
			expect((await getCategoryAnalysisFirebase('owner', range)).success).toBe(false);
		}
		expect(mockGetDocs).not.toHaveBeenCalled();
	} finally { log.mockRestore(); }
});

it('bounds pagination and gives access to every movement without duplicate page entries', () => {
	const movements = Array.from({ length: 45 }, (_, index): CategoryAnalysisRecentMovement => ({
		id: String(index), type: 'expense', name: String(index), valueInCents: 100, date: now,
		bankId: null, bankName: 'Dinheiro', isCash: true, explanation: null,
	}));
	const pages = [0, 1, 2].flatMap(page => getCategoryAnalysisMovementPage(movements, 'expense', true, page).items);
	expect(pages.map(item => item.id)).toEqual(movements.map(item => item.id));
	expect(getCategoryAnalysisMovementPage(movements, 'expense', true, 99).currentPage).toBe(2);
	expect(getCategoryAnalysisMovementPage(movements, 'gain', true).items).toEqual([]);
});
