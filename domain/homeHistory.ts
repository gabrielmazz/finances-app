import type { MovementRecord } from '../types/bankMovements';
import type { HomeExpenseHistoryMonth } from '../types/presentation/home-expense-history';
import { civilDay } from './mandatory';
import { sumCents } from './money';
import { isIncomeOrExpenseTotal } from './movements';

const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' });

export function summarizeHomeHistory(items: MovementRecord[], today: Date) {
  const year = today.getFullYear();
  const months: HomeExpenseHistoryMonth[] = [2, 1, 0].map(offset => {
    const month = new Date(year, today.getMonth() - offset, 1);
    return {
      key: civilDay(month).slice(0, 7), label: monthLabel.format(month),
      daysInMonth: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
      dailyExpensesInCents: {}, totalExpensesInCents: 0, totalGainsInCents: 0,
    };
  });
  const monthsByKey = new Map(months.map(month => [month.key, month]));
  const dailyActionCounts: Record<string, number> = {};
  const startDate = `${year}-01-01`, endDate = civilDay(today);
  const expensesByBank = new Map<string | null, number>(), gainsByBank = new Map<string | null, number>();
  const transfers = new Set<string>();
  let totalActions = 0;
  for (const item of items) {
    if (!item.date) continue;
    const day = civilDay(item.date);
    const transfer = item.isBankTransfer ? item.bankTransferPairId : null;
    if (day >= startDate && day <= endDate && (!transfer || !transfers.has(transfer))) {
      if (transfer) transfers.add(transfer);
      dailyActionCounts[day] = (dailyActionCounts[day] ?? 0) + 1;
      totalActions++;
    }
    const month = monthsByKey.get(day.slice(0, 7));
    if (!month || !isIncomeOrExpenseTotal(item) || (item.type !== 'expense' && item.type !== 'gain')) continue;
    if (item.type === 'expense') {
      const dayOfMonth = String(item.date.getDate());
      month.dailyExpensesInCents[dayOfMonth] = sumCents([month.dailyExpensesInCents[dayOfMonth] ?? 0, item.valueInCents]);
      month.totalExpensesInCents = sumCents([month.totalExpensesInCents, item.valueInCents]);
    } else {
      month.totalGainsInCents = sumCents([month.totalGainsInCents, item.valueInCents]);
    }
    if (month === months[2]) {
      const bank = item.bankId ?? null;
      const values = item.type === 'expense' ? expensesByBank : gainsByBank;
      values.set(bank, sumCents([values.get(bank) ?? 0, item.valueInCents]));
    }
  }
  return {
    months, activity: { startDate, endDate, dailyActionCounts, totalActions },
    monthly: {
      expensesByBank: Object.fromEntries([...expensesByBank].filter(([id]) => id !== null)),
      gainsByBank: Object.fromEntries([...gainsByBank].filter(([id]) => id !== null)),
      expenses: months[2].totalExpensesInCents, gains: months[2].totalGainsInCents,
      cashExpenses: expensesByBank.get(null) ?? 0, cashGains: gainsByBank.get(null) ?? 0,
    },
  };
}
