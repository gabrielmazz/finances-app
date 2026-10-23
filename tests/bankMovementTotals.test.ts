import { computeBankMovementTotals, getBankMovementEconomicValue } from '@/utils/bankMovementTotals';
const expense = (delta: number) => ({ type: delta < 0 ? 'expense' as const : 'gain' as const,
  valueInCents: Math.abs(delta), isSparkMovement: true, sparkEconomicKind: 'expense' as const, sparkDeltaInCents: delta });
const gain = (delta: number) => ({ ...expense(delta), sparkEconomicKind: 'income' as const });

test('correção de despesa abate a despesa original sem criar renda e mantém saldo de 1.130 reais', () => {
  const total = computeBankMovementTotals([gain(20000), expense(-5000), expense(5000), expense(-7000)]);
  expect(total).toEqual({ totalGains: 20000, totalExpenses: 7000 });
  expect(100000 + total.totalGains - total.totalExpenses).toBe(113000);
});

test('estorno de receita reduz ganhos, incluindo filtro de período com somente o inverso', () => {
  expect(computeBankMovementTotals([gain(20000), gain(-20000)])).toEqual({ totalGains: 0, totalExpenses: 0 });
  expect(computeBankMovementTotals([gain(-20000)])).toEqual({ totalGains: -20000, totalExpenses: 0 });
  expect(getBankMovementEconomicValue(expense(5000))).toEqual({ type: 'expense', valueInCents: -5000 });
});

test('pares, saques, ajustes e investimentos continuam fora dos indicadores econômicos', () => {
  const flags = ['isBankTransfer', 'isCashRescue', 'isBalanceAdjustment', 'isInvestmentDeposit', 'isInvestmentRedemption', 'isFinanceInvestment', 'isFinanceInvestmentSync'];
  const special = flags.map(flag => ({ ...expense(-10000), [flag]: true }));
  expect(computeBankMovementTotals(special)).toEqual({ totalGains: 0, totalExpenses: 0 });
});

test('mantém o cálculo legado e acumula centavos sem arredondamento intermediário', () => {
  expect(computeBankMovementTotals([{ type: 'gain', valueInCents: 20001 }, { type: 'expense', valueInCents: 7001 }])).toEqual({ totalGains: 20001, totalExpenses: 7001 });
  const max = Number.MAX_SAFE_INTEGER;
  expect(computeBankMovementTotals([gain(max), gain(1), gain(-1)]).totalGains).toBe(max);
  expect(() => computeBankMovementTotals([gain(max), gain(1)])).toThrow(/limite/);
  expect(() => computeBankMovementTotals([expense(-1.5)])).toThrow(/válido/);
});
