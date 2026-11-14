import { hasAmbiguousMovementIds, isIncomeOrExpenseTotal, movementEffect, validateMovement } from '../domain/movements';

const input = { name: 'Mercado', type: 'expense' as const, amountCents: 20000, accountId: 'bank0000000000000001', categoryId: 'tag00000000000000001', categorySource: 'new' as const, date: '2025-03-10', explanation: '', paymentFormats: [] };

test('movements use positive integer cents and an unambiguous civil date', () => {
  expect(validateMovement(input)).toEqual(input);
  expect(() => validateMovement({ ...input, amountCents: 1.5 })).toThrow();
  expect(() => validateMovement({ ...input, amountCents: 0 })).toThrow();
  expect(() => validateMovement({ ...input, date: '2025-02-30' })).toThrow();
});

test('posted gains and expenses affect only their own account; cancellation reverses the effect', () => {
  expect(movementEffect({ ...input, status: 'posted' }, input.accountId)).toBe(-20000);
  expect(movementEffect({ ...input, type: 'gain', status: 'posted' }, input.accountId)).toBe(20000);
  expect(movementEffect({ ...input, status: 'cancelled' }, input.accountId)).toBe(0);
  expect(movementEffect({ ...input, status: 'posted' }, 'other-account')).toBe(0);
});


test('keeps totals unavailable for an unresolved ID shared by distinct sources', () => {
  expect(hasAmbiguousMovementIds([
    { id: 'same', type: 'expense', storageSource: 'new' },
    { id: 'same', type: 'expense', storageSource: 'legacy-expense' },
  ])).toBe(true);
  expect(hasAmbiguousMovementIds([{ id: 'same', type: 'expense', storageSource: 'new' }, { id: 'same', type: 'gain', storageSource: 'legacy-gain' }])).toBe(false);
});

test('transfers, withdrawals and adjustments do not enter income or expense totals', () => {
  expect(isIncomeOrExpenseTotal({})).toBe(true);
  for (const field of ['isBankTransfer', 'isCashRescue', 'isInvestmentDeposit', 'isInvestmentRedemption', 'isFinanceInvestment', 'isFinanceInvestmentSync', 'isBalanceAdjustment']) {
    expect(isIncomeOrExpenseTotal({ [field]: true })).toBe(false);
  }
});
