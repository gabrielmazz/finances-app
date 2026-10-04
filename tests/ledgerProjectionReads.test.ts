jest.mock('@/FirebaseConfig', () => ({ db: {}, auth: { currentUser: { uid: 'owner' } }, firebaseFunctions: {} }));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('firebase/firestore', () => ({
	collection: (_db: unknown, name: string) => ({ name }),
	doc: (_db: unknown, name: string, id: string) => ({ name, id }),
	query: (source: { name: string }, ...filters: unknown[]) => ({ ...source, filters }),
	where: (field: string, operator: string, value: unknown) => ({ field, operator, value }),
	orderBy: (field: string, direction = 'asc') => ({ orderBy: field, direction }),
	documentId: () => '__name__',
	limit: (count: number) => ({ limit: count }),
	startAfter: (cursor: { id: string }) => ({ startAfter: cursor.id }),
	Timestamp: { fromDate: (date: Date) => date },
	getDoc: jest.fn(), getDocs: jest.fn(),
}));

import { getCategoryAnalysisFirebase } from '@/functions/CategoryAnalysisFirebase';
import { getFinancialForecastFirebase } from '@/functions/FinancialForecastFirebase';
import { getHomeSnapshotFirebase, getHomeOverviewFirebase, getHomeInvestmentsFirebase, getHomeBalancesFirebase } from '@/functions/HomeFirebase';
import { getLegacyBankBalanceInCentsFirebase, getLegacyBankBalancesInCentsFirebase } from '@/functions/BankFirebase';
import { getDoc, getDocs } from 'firebase/firestore';

type Row = Record<string, unknown> & { id: string };
type Filter = { field?: string; operator?: string; value?: unknown; limit?: number; startAfter?: string; orderBy?: string; direction?: string };
let records: Record<string, Row[]>;
const date = (value: string) => new Date(value + 'T12:00:00-03:00');
const event = (id: string, kind: string, value: number, civilDate: string, extra: Record<string, unknown> = {}): Row => ({
	id, groupId: 'group', actorId: 'owner', clientActionId: 'request_' + id, kind,
	effectiveAt: date(civilDate), categoryId: 'food', note: id,
	legs: [{ accountId: 'bank', deltaInCents: kind === 'expense' ? -value : value }, { accountId: null, deltaInCents: kind === 'expense' ? value : -value }],
	...extra,
});
const snapshot = (row: Row) => ({ id: row.id, exists: () => true, data: () => row });

beforeEach(() => {
	jest.useFakeTimers().setSystemTime(date('2026-09-10'));
	records = {
		users: [{ id: 'owner', name: 'Pessoa', financialGroupId: 'group', financialGroupRole: 'member', relatedIdUsers: ['related'] }],
		financialAccounts: [
			{ id: 'bank', groupId: 'group', kind: 'bank', name: 'Nubank', currentBalanceInCents: 10_000 },
			{ id: 'cash', groupId: 'group', kind: 'cash', name: 'Caixa', currentBalanceInCents: 2_000 },
			{ id: 'investment', groupId: 'group', kind: 'investment', name: 'CDB', currentBalanceInCents: 80_000 },
		],
		tags: [{ id: 'food', personId: 'owner', name: 'Alimentação', usageType: 'both' }],
		banks: [], monthlyBalances: [], expenses: [], gains: [], cashRescues: [], mandatoryExpenses: [], mandatoryGains: [], financeInvestments: [], investmentCdiRates: [], bankBalanceAdjustments: [], ledgerTransactions: [],
	};
	(getDoc as jest.Mock).mockReset().mockImplementation(async ({ name, id }: { name: string; id: string }) => {
		const row = records[name]?.find(item => item.id === id);
		return row ? snapshot(row) : { exists: () => false };
	});
	(getDocs as jest.Mock).mockReset().mockImplementation(async ({ name, filters = [] }: { name: string; filters?: Filter[] }) => {
		if (filters.some(filter => filter.operator === 'in' && (filter.value as unknown[]).length > 30)) throw new Error('Firestore in filter supports at most 30 values.');
		let rows = [...(records[name] ?? [])].sort((a, b) => a.id.localeCompare(b.id));
		const ordering = filters.filter(filter => filter.orderBy);
		if (ordering.length) rows.sort((left, right) => {
			for (const filter of ordering) {
				const key = filter.orderBy === '__name__' ? 'id' : filter.orderBy!;
				const a = left[key] as string | number;
				const b = right[key] as string | number;
				const difference = a < b ? -1 : a > b ? 1 : 0;
				if (difference) return difference * (filter.direction === 'desc' ? -1 : 1);
			}
			return left.id.localeCompare(right.id);
		});
		for (const filter of filters) {
			if (filter.field) rows = rows.filter(row => {
				const value = filter.field === '__name__' ? row.id : row[filter.field!];
				switch (filter.operator) {
					case 'in': return (filter.value as unknown[]).includes(value);
					case '==': return value === filter.value;
					case '>=': return (value as Date) >= (filter.value as Date);
					case '<=': return (value as Date) <= (filter.value as Date);
					default: return true;
				}
			});
			if (filter.startAfter) rows = rows.filter(row => row.id.localeCompare(filter.startAfter!) > 0);
			if (filter.limit) rows = rows.slice(0, filter.limit);
		}
		const docs = rows.map(snapshot);
		return { docs, size: docs.length, empty: docs.length === 0 };
	});
});
afterEach(() => jest.useRealTimers());

it('analyzes confirmed group movements after cutover without resurrecting legacy or reversed entries', async () => {
	records.expenses = [{ id: 'stale-legacy', personId: 'owner', tagId: 'food', name: 'Legado', date: date('2026-09-01'), valueInCents: 90_000 }];
	records.ledgerTransactions = [
		event('june', 'expense', 300, '2026-06-01'), event('july', 'expense', 300, '2026-07-01'), event('august', 'expense', 300, '2026-08-01'),
		event('cancelled', 'expense', 9_000, '2026-09-01'),
		event('reversal', 'reversal', 9_000, '2026-09-02', { reversesTransactionId: 'cancelled' }),
		event('replacement', 'expense', 800, '2026-09-02'),
		event('cash-spending', 'expense', 200, '2026-09-03', { legs: [{ accountId: 'cash', deltaInCents: -200 }, { accountId: null, deltaInCents: 200 }] }),
		event('internal', 'transfer', 60_000, '2026-09-01', { legs: [{ accountId: 'bank', deltaInCents: -60_000 }, { accountId: 'cash', deltaInCents: 60_000 }] }),
		event('future-reversal', 'reversal', 800, '2026-09-15', { reversesTransactionId: 'replacement' }),
		event('unrelated', 'expense', 70_000, '2026-09-01', { groupId: 'other' }),
	];
	const result = await getCategoryAnalysisFirebase('owner');
	if (!result.success) throw result.error;
	const food = result.data.reportsByTagId.food;
	expect(food.expense).toMatchObject({ currentInCents: 1_000, historicalAverageInCents: 300, currentCount: 2 });
	expect(food.gain.currentInCents).toBe(0);
	expect(food.bankBreakdown).toEqual(expect.arrayContaining([
		expect.objectContaining({ name: 'Nubank', expenseInCents: 800, isCash: false }),
		expect.objectContaining({ name: 'Caixa', expenseInCents: 200, isCash: true }),
	]));
	expect(food.movements.map(item => item.id).sort()).toEqual(['august', 'cash-spending', 'july', 'june', 'replacement']);
});

it('starts migrated forecasts from liquid account balances without applying the same ledger or legacy movements again', async () => {
	records.banks = [{ id: 'old-bank', personId: 'owner', name: 'Legado' }];
	records.monthlyBalances = [{ id: 'old-snapshot', personId: 'owner', bankId: 'old-bank', year: 2026, month: 9, valueInCents: 900_000 }];
	records.expenses = [{ id: 'old-expense', personId: 'owner', tagId: 'food', name: 'Legado', date: date('2026-09-01'), valueInCents: 90_000 }];
	records.ledgerTransactions = [
		event('june', 'expense', 300, '2026-06-01'), event('july', 'expense', 300, '2026-07-01'), event('august', 'expense', 300, '2026-08-01'),
		event('current', 'expense', 800, '2026-09-02'),
		event('internal', 'transfer', 60_000, '2026-09-01', { legs: [{ accountId: 'bank', deltaInCents: -60_000 }, { accountId: 'investment', deltaInCents: 60_000 }] }),
	];
	const result = await getFinancialForecastFirebase('owner', 3);
	if (!result.success) throw new Error(result.error);
	expect(result.data.openingBalanceInCents).toBe(12_000);
	expect(result.data.missingSnapshotBankNames).toEqual([]);
	expect(result.data.months).toHaveLength(3);
	expect(result.data.months.map(month => month.variableExpensesInCents)).toEqual([300, 300, 300]);
	expect(result.data.finalBalanceInCents).toBe(11_100);
});

it('does not project an already materialized future ledger entry or its completed template a second time', async () => {
	records.ledgerTransactions = [event('future-payment', 'expense', 700, '2026-09-20')];
	records.mandatoryExpenses = [{ id: 'subscription', personId: 'owner', name: 'Assinatura', tagId: 'food', valueInCents: 700, dueDay: 20, lastPaymentExpenseId: 'future-payment', lastPaymentCycle: '2026-09' }];
	const result = await getFinancialForecastFirebase('owner', 3);
	if (!result.success) throw new Error(result.error);
	expect(result.data.openingBalanceInCents).toBe(12_000);
	expect(result.data.months.map(month => month.fixedExpensesInCents)).toEqual([0, 700, 700]);
	expect(result.data.months.map(month => month.scheduledExpensesInCents)).toEqual([0, 0, 0]);
	expect(result.data.finalBalanceInCents).toBe(10_600);
});

it('uses the São Paulo month and civil day when UTC has already advanced to the next month', async () => {
	jest.setSystemTime(new Date('2026-10-01T01:30:00Z'));
	records.ledgerTransactions = [event('evening', 'expense', 123, '2026-09-30', { effectiveAt: new Date('2026-10-01T01:00:00Z') })];
	const analysis = await getCategoryAnalysisFirebase('owner');
	if (!analysis.success) throw analysis.error;
	expect(analysis.data.reportsByTagId.food.expense.currentInCents).toBe(123);
	expect(analysis.data.reportsByTagId.food.months.at(-1)?.key).toBe('2026-09');
	expect(analysis.data.reportsByTagId.food.months.at(-1)?.dailyMovementsByDay['30']?.expenseInCents).toBe(123);
	expect(analysis.data.reportsByTagId.food.movements[0].date?.toISOString()).toBe('2026-10-01T01:00:00.000Z');
	const forecast = await getFinancialForecastFirebase('owner', 3);
	if (!forecast.success) throw new Error(forecast.error);
	expect(forecast.data.months[0].key).toBe('2026-09');
	expect(forecast.data.months[0].startDate.toISOString()).toBe('2026-09-01T03:00:00.000Z');
});

it('reads every ledger page and applies a reversal outside the compared historical interval', async () => {
	records.ledgerTransactions = Array.from({ length: 251 }, (_, index) => event('expense_' + String(index).padStart(3, '0'), 'expense', 1, '2026-09-01'));
	records.ledgerTransactions.push(event('old', 'expense', 900, '2026-06-01'), event('reverse-old', 'reversal', 900, '2026-09-01', { reversesTransactionId: 'old' }));
	const result = await getCategoryAnalysisFirebase('owner');
	if (!result.success) throw result.error;
	expect(result.data.reportsByTagId.food.expense).toMatchObject({ currentInCents: 251, currentCount: 251, historicalAverageInCents: 0 });
	expect(result.data.reportsByTagId.food.movements).toHaveLength(251);
});

it('reads permitted categories and recurring templates shared by migrated group members', async () => {
	records.tags.push({ id: 'shared-tag', personId: 'colleague', groupId: 'group', name: 'Casa', usageType: 'expense' });
	records.tags.push({ id: 'private-tag', personId: 'stranger', groupId: 'other', name: 'Outro grupo', usageType: 'expense' });
	records.ledgerTransactions = [event('shared-expense', 'expense', 500, '2026-09-03', { categoryId: 'shared-tag' })];
	records.mandatoryExpenses = [{ id: 'shared-template', personId: 'colleague', groupId: 'group', name: 'Casa', tagId: 'shared-tag', valueInCents: 500, dueDay: 20 }];
	const analysis = await getCategoryAnalysisFirebase('owner');
	if (!analysis.success) throw analysis.error;
	expect(analysis.data.reportsByTagId['shared-tag']?.expense.currentInCents).toBe(500);
	expect(analysis.data.reportsByTagId['private-tag']).toBeUndefined();
	const forecast = await getFinancialForecastFirebase('owner', 3);
	if (!forecast.success) throw new Error(forecast.error);
	expect(forecast.data.months.map(month => month.fixedExpensesInCents)).toEqual([500, 500, 500]);
});

it('keeps legacy opening balances accurate beyond the three months used for variable forecasts', async () => {
	records.users[0] = { id: 'owner', name: 'Pessoa', relatedIdUsers: [] };
	records.banks = [{ id: 'bank', personId: 'owner', name: 'Nubank' }];
	records.monthlyBalances = [{ id: 'january', personId: 'owner', bankId: 'bank', year: 2026, month: 1, valueInCents: 10_000 }];
	records.expenses = [
		{ id: 'old-spending', personId: 'owner', bankId: 'bank', date: date('2026-04-01'), valueInCents: 1_000 },
		{ id: 'recent-spending', personId: 'owner', bankId: 'bank', date: date('2026-09-01'), valueInCents: 1_000 },
	];
	records.gains = [
		{ id: 'old-income', personId: 'owner', bankId: 'bank', date: date('2026-03-01'), valueInCents: 4_000 },
		{ id: 'old-cash', personId: 'owner', bankId: null, date: date('2026-01-01'), valueInCents: 500 },
	];
	const result = await getFinancialForecastFirebase('owner', 3);
	if (!result.success) throw new Error(result.error);
	expect(result.data.openingBalanceInCents).toBe(12_500);
});

it('reports migrated investment liquidity without adding applied money to available cash or replaying its creation', async () => {
	records.financialAccounts[2] = { ...records.financialAccounts[2], date: date('2026-09-20'), redemptionTerm: '1m', initialValueInCents: 50_000 };
	const result = await getFinancialForecastFirebase('owner', 3);
	if (!result.success) throw new Error(result.error);
	expect(result.data.openingBalanceInCents).toBe(12_000);
	expect(result.data.finalBalanceInCents).toBe(12_000);
	expect(result.data.months.map(month => month.investmentOutflowsInCents)).toEqual([0, 0, 0]);
	expect(result.data.months[1].commitments).toEqual(expect.arrayContaining([
		expect.objectContaining({ kind: 'investment-liquidity', valueInCents: 80_000 }),
	]));
});

it('reads legacy relationships beyond the Firestore in-filter limit without dropping the last person', async () => {
	records.users[0] = { id: 'owner', name: 'Pessoa', relatedIdUsers: Array.from({ length: 32 }, (_, index) => 'related_' + index) };
	records.expenses = [{ id: 'tail', personId: 'related_31', tagId: 'food', name: 'Último relacionado', date: date('2026-09-01'), valueInCents: 77 }];
	const result = await getCategoryAnalysisFirebase('owner');
	if (!result.success) throw result.error;
	expect(result.data.reportsByTagId.food.expense.currentInCents).toBe(77);
});

it('refreshes migrated Home movements and totals from active persisted events while keeping account balances authoritative', async () => {
	records.ledgerTransactions = [event('cancelled', 'expense', 9_000, '2026-09-01'),
		event('undo', 'reversal', 9_000, '2026-09-02', { reversesTransactionId: 'cancelled' }),
		event('replacement', 'expense', 800, '2026-09-03'), event('income', 'income', 300, '2026-09-04')];
	const result = await getHomeSnapshotFirebase('owner');
	if (!result.success) throw result.error;
	if (!result.data.overview.success || !result.data.movements.success) throw new Error('Home failed.');
	expect(result.data.overview.data.bankBalances).toEqual([expect.objectContaining({ id: 'bank', balanceInCents: 10_000 })]);
	expect(result.data.overview.data.cashSummary?.balanceInCents).toBe(2_000);
	expect(result.data.overview.data.currentMonthExpensesByBankId.bank).toBe(800);
	expect(result.data.overview.data.currentMonthGainsByBankId.bank).toBe(300);
	expect(result.data.movements.data.timelineMovements.map(movement => movement.id)).toEqual(['income', 'replacement']);
});

it('uses verified migrated investment metadata and its last materialized date to calculate CDI without rewriting confirmed value', async () => {
	records.financialAccounts[2] = { ...records.financialAccounts[2], personId: 'owner', bankAccountId: 'bank', date: date('2026-09-01'), initialValueInCents: 50_000, cdiPercentageInBasisPoints: 10_000, assetType: 'fixed_income', valuationMethod: 'cdi' };
	records.investmentCdiRates = [{ id: 'rate', personId: 'owner', groupId: 'group', annualRateInBasisPoints: 36_500, effectiveFrom: date('2026-09-01') }];
	records.ledgerTransactions = [event('valuation', 'reconciliation_adjustment', 30_000, '2026-09-09', { categoryId: null, legs: [{ accountId: 'investment', deltaInCents: 30_000 }, { accountId: null, deltaInCents: -30_000 }] })];
	const result = await getHomeSnapshotFirebase('owner');
	if (!result.success) throw result.error;
	if (!result.data.investments.success) throw new Error(result.data.investments.error);
	expect(result.data.investments.data.portfolio.items).toEqual([expect.objectContaining({
		id: 'investment', bankId: 'bank', bankNameSnapshot: 'Nubank', initialValueInCents: 50_000,
		currentBaseValueInCents: 80_000, simulatedValueInCents: 80_800, estimatedGainInCents: 800, cdiPercentage: 100,
	})]);
	expect(records.financialAccounts[2].currentBalanceInCents).toBe(80_000);
});

it.each(['missing-rate', 'missing-owner', 'manual-asset'])('keeps migrated investment value confirmed when CDI cannot be calculated safely: %s', async scenario => {
	records.financialAccounts[2] = { ...records.financialAccounts[2], personId: scenario === 'missing-owner' ? undefined : 'owner', date: date('2026-09-09'), cdiPercentageInBasisPoints: 10_000, assetType: scenario === 'manual-asset' ? 'stock' : 'fixed_income', valuationMethod: scenario === 'manual-asset' ? 'manual' : 'cdi' };
	if (scenario !== 'missing-rate') records.investmentCdiRates = [{ id: 'rate', personId: 'owner', groupId: 'group', annualRateInBasisPoints: 36_500, effectiveFrom: date('2026-09-01') }];
	const result = await getHomeSnapshotFirebase('owner');
	if (!result.success) throw result.error;
	if (!result.data.investments.success) throw new Error(result.data.investments.error);
	expect(result.data.investments.data.portfolio).toMatchObject({ totalCurrentBaseInCents: 80_000, totalSimulatedInCents: 80_000, totalEstimatedGainInCents: 0 });
});

it('keeps legacy Home cash balance across month boundaries while monthly totals keep their selected period', async () => {
	records.users[0] = { id: 'owner', name: 'Pessoa', relatedIdUsers: [] };
	records.expenses = [{ id: 'cash-expense', personId: 'owner', bankId: null, date: date('2026-01-02'), valueInCents: 200 }];
	records.gains = [{ id: 'cash-opening', personId: 'owner', bankId: null, date: date('2026-01-01'), valueInCents: 1_000 }, { id: 'cash-current', personId: 'owner', bankId: null, date: date('2026-09-01'), valueInCents: 300 }];
	records.cashRescues = [{ id: 'cash-rescue', personId: 'owner', bankId: 'old-bank', date: date('2026-05-01'), valueInCents: 500 }];
	const result = await getHomeSnapshotFirebase('owner');
	if (!result.success) throw result.error;
	if (!result.data.overview.success) throw new Error(result.data.overview.error);
	expect(result.data.overview.data.cashSummary).toMatchObject({ balanceInCents: 1_600, currentMonthGainsInCents: 300, currentMonthExpensesInCents: 0 });
});

it('includes a committed expense dated today at civil noon in current legacy balance even before noon', async () => {
	jest.setSystemTime(new Date('2026-10-02T11:37:00Z'));
	records.users[0] = { id: 'owner', name: 'Pessoa', relatedIdUsers: [] };
	records.banks = [{ id: 'bank', personId: 'owner', name: 'Nubank' }];
	records.monthlyBalances = [{ id: 'october', personId: 'owner', bankId: 'bank', year: 2026, month: 10, valueInCents: 100_000 }];
	records.expenses = [{ id: 'market', personId: 'owner', bankId: 'bank', date: date('2026-10-02'), valueInCents: 8_290 }];
	const single = await getLegacyBankBalanceInCentsFirebase({ personId: 'owner', bankId: 'bank' });
	const batch = await getLegacyBankBalancesInCentsFirebase({ personId: 'owner', bankIds: ['bank'] });
	expect(single).toEqual({ success: true, data: 91_710 });
	expect(batch).toEqual({ success: true, data: { bank: 91_710 } });
	const home = await getHomeSnapshotFirebase('owner');
	if (!home.success) throw home.error;
	if (!home.data.overview.success) throw new Error(home.data.overview.error);
	expect(home.data.overview.data.bankBalances[0].balanceInCents).toBe(91_710);
});

it('uses an eligible opening snapshot even when a later monthly snapshot already exists', async () => {
	records.users[0] = { id: 'owner', name: 'Pessoa', relatedIdUsers: [] };
	records.monthlyBalances = [
		{ id: 'september', personId: 'owner', bankId: 'bank', year: 2026, month: 9, valueInCents: 10_000 },
		{ id: 'october', personId: 'owner', bankId: 'bank', year: 2026, month: 10, valueInCents: 90_000 },
	];
	records.expenses = [{ id: 'today', personId: 'owner', bankId: 'bank', date: date('2026-09-10'), valueInCents: 100 }, { id: 'tomorrow', personId: 'owner', bankId: 'bank', date: date('2026-09-11'), valueInCents: 200 }];
	const single = await getLegacyBankBalanceInCentsFirebase({ personId: 'owner', bankId: 'bank' });
	const batch = await getLegacyBankBalancesInCentsFirebase({ personId: 'owner', bankIds: ['bank'] });
	expect(single).toEqual({ success: true, data: 9_900 });
	expect(batch).toEqual(single.success ? { success: true, data: { bank: single.data } } : undefined);
});

it.each(['legacy', 'ledger'])('includes today civil noon in category reads and Home history while excluding the following day: %s', async source => {
	jest.setSystemTime(new Date('2026-09-10T11:00:00Z'));
	if (source === 'legacy') {
		records.users[0] = { id: 'owner', name: 'Pessoa', relatedIdUsers: [] };
		records.banks = [{ id: 'bank', name: 'Nubank', personId: 'owner' }];
		records.expenses = [{ id: 'today', personId: 'owner', bankId: 'bank', tagId: 'food', date: date('2026-09-10'), valueInCents: 100 }, { id: 'tomorrow', personId: 'owner', bankId: 'bank', tagId: 'food', date: date('2026-09-11'), valueInCents: 200 }];
	} else records.ledgerTransactions = [event('today', 'expense', 100, '2026-09-10'), event('tomorrow', 'expense', 200, '2026-09-11')];
	const analysis = await getCategoryAnalysisFirebase('owner');
	if (!analysis.success) throw analysis.error;
	expect(analysis.data.reportsByTagId.food.expense).toMatchObject({ currentInCents: 100, currentCount: 1 });
	const home = await getHomeSnapshotFirebase('owner');
	if (!home.success) throw home.error;
	if (!home.data.overview.success) throw new Error(home.data.overview.error);
	expect(home.data.overview.data.currentMonthExpensesByBankId.bank).toBe(100);
});

it.each(['legacy', 'ledger'])('keeps Home charts and upcoming cycles on the São Paulo calendar: %s', async source => {
	jest.setSystemTime(new Date('2026-10-01T01:30:00Z'));
	const evening = new Date('2026-10-01T01:00:00Z');
	if (source === 'legacy') {
		records.users[0] = { id: 'owner', name: 'Pessoa', relatedIdUsers: [] };
		records.expenses = [{ id: 'evening', personId: 'owner', date: evening, bankId: null, valueInCents: 123 }];
	} else records.ledgerTransactions = [event('evening', 'expense', 123, '2026-09-30', { effectiveAt: evening })];
	records.mandatoryExpenses = [{ id: 'commitment', personId: 'owner', name: 'Internet', dueDay: 30, valueInCents: 700 }];
	const home = await getHomeSnapshotFirebase('owner');
	if (!home.success) throw home.error;
	if (!home.data.overview.success) throw new Error(home.data.overview.error);
	const overview = home.data.overview.data;
	expect(overview.expenseHistoryLastThreeMonths.at(-1)).toMatchObject({ key: '2026-09', dailyExpensesInCents: { '30': 123 }, totalExpensesInCents: 123 });
	expect(overview.upcomingMandatoryItems[0].dueDate.toISOString().slice(0, 10)).toBe('2026-09-30');
});

it('reads all legacy Home relationships and investments beyond the former in-filter and fifty-item caps', async () => {
	records.users[0] = { id: 'owner', name: 'Pessoa', relatedIdUsers: Array.from({ length: 32 }, (_, index) => 'related_' + index) };
	records.banks = [{ id: 'bank', name: 'Nubank', personId: 'related_31' }];
	records.monthlyBalances = [{ id: 'opening', personId: 'related_31', bankId: 'bank', year: 2026, month: 9, valueInCents: 10_000 }];
	records.expenses = [{ id: 'expense', personId: 'related_31', bankId: 'bank', date: date('2026-09-01'), valueInCents: 77 }];
	records.financeInvestments = Array.from({ length: 51 }, (_, index) => ({ id: 'investment_' + index, personId: 'owner', name: 'Ativo ' + index, createdAt: date('2026-08-01'), date: date('2026-08-01'), initialValueInCents: 100, currentValueInCents: 100, assetType: 'stock', valuationMethod: 'manual' }));
	const home = await getHomeSnapshotFirebase('owner');
	if (!home.success) throw home.error;
	if (!home.data.overview.success) throw new Error(home.data.overview.error);
	if (!home.data.investments.success) throw new Error(home.data.investments.error);
	expect(home.data.overview.data.bankBalances).toEqual([expect.objectContaining({ id: 'bank', balanceInCents: 9_923 })]);
	expect(home.data.investments.data.portfolio).toMatchObject({ investmentCount: 51, totalCurrentBaseInCents: 5_100, totalSimulatedInCents: 5_100 });
});

it.each(['legacy', 'ledger'])('keeps focused Home report results identical while omitting unrelated reads: %s', async source => {
	if (source === 'legacy') records.users[0] = { id: 'owner', name: 'Pessoa', relatedIdUsers: [] };
	const home = await getHomeSnapshotFirebase('owner');
	if (!home.success) throw home.error;
	if (!home.data.overview.success || !home.data.investments.success) throw new Error('Snapshot indisponível.');
	const allReadCount = (getDocs as jest.Mock).mock.calls.length;
	(getDocs as jest.Mock).mockClear();
	const overview = await getHomeOverviewFirebase('owner');
	expect(overview).toEqual({ success: true, data: home.data.overview.data });
	expect((getDocs as jest.Mock).mock.calls.length).toBeLessThan(allReadCount);
	expect((getDocs as jest.Mock).mock.calls.some(([query]) => ['financeInvestments', 'investmentCdiRates'].includes(query.name))).toBe(false);
	(getDocs as jest.Mock).mockClear();
	const investments = await getHomeInvestmentsFirebase('owner');
	expect(investments).toEqual({ success: true, data: home.data.investments.data });
	expect((getDocs as jest.Mock).mock.calls.length).toBeLessThan(allReadCount);
	expect((getDocs as jest.Mock).mock.calls.some(([query]) => ['expenses', 'gains', 'mandatoryExpenses', 'mandatoryGains'].includes(query.name))).toBe(false);
});

it.each(['legacy', 'ledger'])('reads only current bank and Cash positions with complete legacy parity: %s', async source => {
	if (source === 'legacy') {
		records.users[0] = { id: 'owner', name: 'Pessoa', relatedIdUsers: [] };
		records.banks = [{ id: 'bank', personId: 'owner', name: 'Nubank', colorHex: '#123456' }];
		records.monthlyBalances = [{ id: 'opening', personId: 'owner', bankId: 'bank', year: 2026, month: 9, valueInCents: 100_000 }];
		records.expenses = [
			{ id: 'market', personId: 'owner', bankId: 'bank', valueInCents: 8_290, date: date('2026-09-10') },
			{ id: 'old-cash-expense', personId: 'owner', valueInCents: 500, date: date('2026-08-01') },
		];
		records.gains = [
			{ id: 'old-cash-income', personId: 'owner', bankId: null, valueInCents: 1_000, date: date('2026-08-01') },
			{ id: 'bank-income', personId: 'owner', bankId: 'bank', valueInCents: 100, date: date('2026-09-08') },
		];
		records.cashRescues = [{ id: 'withdrawal', personId: 'owner', bankId: 'bank', valueInCents: 2_000, date: date('2026-09-07') }];
		records.financeInvestments = [{ id: 'principal', personId: 'owner', bankId: 'bank', initialValueInCents: 1_000, currentValueInCents: 1_000, date: date('2026-09-02'), assetType: 'stock', valuationMethod: 'manual' }];
		records.bankBalanceAdjustments = [{ id: 'adjustment', personId: 'owner', bankId: 'bank', differenceInCents: 300, date: date('2026-09-09') }];
	}
	const overview = await getHomeOverviewFirebase('owner');
	if (!overview.success) throw overview.error;
	const overviewReadCount = (getDocs as jest.Mock).mock.calls.length;
	(getDocs as jest.Mock).mockClear();
	const balances = await getHomeBalancesFirebase('owner');
	if (!balances.success) throw balances.error;
	expect(balances.data.bankBalances).toEqual(overview.data.bankBalances);
	expect(balances.data.cashSummary).toEqual(overview.data.cashSummary ? { id: overview.data.cashSummary.id, name: overview.data.cashSummary.name, balanceInCents: overview.data.cashSummary.balanceInCents } : null);
	expect(balances.data.bankBalances[0].balanceInCents).toBe(source === 'legacy' ? 89_110 : 10_000);
	expect(balances.data.cashSummary?.balanceInCents).toBe(source === 'legacy' ? 2_500 : 2_000);
	expect((getDocs as jest.Mock).mock.calls.length).toBeLessThan(overviewReadCount);
	expect((getDocs as jest.Mock).mock.calls.some(([query]) => ['mandatoryExpenses', 'mandatoryGains', 'investmentCdiRates', 'ledgerTransactions'].includes(query.name))).toBe(false);
	expect((getDocs as jest.Mock).mock.calls.length).toBe(source === 'legacy' ? 7 : 1);
});

it.each(['legacy', 'ledger'])('keeps a withdrawal neutral in Home income/expense indicators while updating bank and cash: %s', async source => {
	if (source === 'legacy') {
		records.users[0] = { id: 'owner', name: 'Pessoa', relatedIdUsers: [] };
		records.banks = [{ id: 'bank', personId: 'owner', name: 'Nubank' }];
		records.monthlyBalances = [{ id: 'opening', personId: 'owner', bankId: 'bank', year: 2026, month: 9, valueInCents: 10_000 }];
		records.cashRescues = [{ id: 'withdrawal', personId: 'owner', bankId: 'bank', date: date('2026-09-01'), valueInCents: 2_000 }];
	} else {
		records.financialAccounts[0].currentBalanceInCents = 8_000;
		records.financialAccounts[1].currentBalanceInCents = 2_000;
		records.ledgerTransactions = [event('withdrawal', 'transfer', 2_000, '2026-09-01', { categoryId: null, legs: [{ accountId: 'bank', deltaInCents: -2_000 }, { accountId: 'cash', deltaInCents: 2_000 }] })];
	}
	const overview = await getHomeOverviewFirebase('owner');
	if (!overview.success) throw overview.error;
	expect(overview.data.bankBalances[0].balanceInCents).toBe(8_000);
	expect(overview.data.cashSummary).toMatchObject({ balanceInCents: 2_000, currentMonthExpensesInCents: 0, currentMonthGainsInCents: 0 });
	expect(overview.data.currentMonthExpensesByBankId.bank ?? 0).toBe(0);
	expect(overview.data.currentMonthGainsByBankId.bank ?? 0).toBe(0);
	expect(overview.data.expenseHistoryLastThreeMonths.at(-1)).toMatchObject({ totalExpensesInCents: 0, totalGainsInCents: 0 });
	expect(overview.data.activityHeatmap.totalActions).toBe(1);
	const snapshot = await getHomeSnapshotFirebase('owner');
	if (!snapshot.success || !snapshot.data.movements.success) throw new Error('Timeline indisponível.');
	expect(snapshot.data.movements.data.timelineMovements).toEqual([expect.objectContaining({ isBankTransfer: true, valueInCents: 2_000 })]);
});
