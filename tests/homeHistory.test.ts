import { summarizeHomeHistory } from '../domain/homeHistory';
import type { MovementRecord } from '../types/bankMovements';

const expense: MovementRecord = { id: 'purchase', name: 'Compra', type: 'expense', valueInCents: 101, bankId: 'bank',
  date: new Date(2026, 0, 12), paymentMethod: 'credit' };

test('counts confirmed activity by civil day and only includes financial expenses in totals', () => {
  const history = summarizeHomeHistory([
    expense,
    { ...expense, id: 'cash', valueInCents: 199, bankId: null, paymentMethod: undefined, moneyFormat: true },
    { ...expense, id: 'previous-year', valueInCents: 57, date: new Date(2025, 11, 31) },
    { ...expense, id: 'transfer-out', isBankTransfer: true, bankTransferPairId: 'transfer' },
    { ...expense, id: 'transfer-in', type: 'gain', isBankTransfer: true, bankTransferPairId: 'transfer' },
    { ...expense, id: 'withdrawal', isCashRescue: true },
  ], new Date(2026, 0, 12));
  expect(history.months.map(month => month.key)).toEqual(['2025-11', '2025-12', '2026-01']);
  expect(history.months[2].dailyExpensesInCents).toEqual({ '12': 300 });
  expect(history.months[1].dailyExpensesInCents).toEqual({ '31': 57 });
  expect(history.monthly).toMatchObject({ expenses: 300, gains: 0, cashExpenses: 199, expensesByBank: { bank: 101 } });
  expect(history.activity).toEqual({ startDate: '2026-01-01', endDate: '2026-01-12', totalActions: 4, dailyActionCounts: { '2026-01-12': 4 } });
});
