import { createLegacyMigrationPlan } from '@/utils/financialLedgerMigration';

const at = new Date('2026-08-01T12:00:00.000Z');

describe('legacy financial migration plan', () => {
  it('pairs transfers, turns cash rescues into transfers and preserves source references', () => {
    const plan = createLegacyMigrationPlan({
      groupId: 'group-1',
      memberIds: ['admin-1'],
      banks: [
        { id: 'bank-a', name: 'Banco A' },
        { id: 'bank-b', name: 'Banco B' },
      ],
      expenses: [{
        id: 'expense-transfer',
        bankId: 'bank-a',
        amountInCents: 10_000,
        effectiveAt: at,
        transferId: 'transfer-1',
      }],
      gains: [{
        id: 'gain-transfer',
        bankId: 'bank-b',
        amountInCents: 10_000,
        effectiveAt: at,
        transferId: 'transfer-1',
      }],
      bankTransfers: [{
        id: 'transfer-1',
        fromBankId: 'bank-a',
        toBankId: 'bank-b',
        amountInCents: 10_000,
        effectiveAt: at,
        expenseId: 'expense-transfer',
        gainId: 'gain-transfer',
      }],
      cashRescues: [{ id: 'rescue-1', bankId: 'bank-b', amountInCents: 2_000, effectiveAt: at }],
      investments: [],
      monthlyBalances: [],
      confirmedCashBalanceInCents: 2_000,
      confirmedAt: new Date('2026-08-02T12:00:00.000Z'),
    });

    expect(plan.issues).toEqual([]);
    expect(plan.accounts.map((account) => account.kind)).toEqual(['cash', 'bank', 'bank']);
    expect(plan.transactions).toHaveLength(2);
    expect(plan.transactions[0].sourceReferences).toEqual([
      { collection: 'bankTransfers', id: 'transfer-1' },
      { collection: 'expenses', id: 'expense-transfer' },
      { collection: 'gains', id: 'gain-transfer' },
    ]);
    expect(plan.transactions[1].legs).toEqual([
      { accountId: 'bank-bank-b', deltaInCents: -2_000 },
      { accountId: 'cash-group-1', deltaInCents: 2_000 },
    ]);
  });

  it('puts incomplete transfer pairs into the resolution queue instead of silently migrating them', () => {
    const plan = createLegacyMigrationPlan({
      groupId: 'group-1',
      memberIds: ['admin-1'],
      banks: [{ id: 'bank-a', name: 'Banco A' }],
      expenses: [{
        id: 'expense-transfer',
        bankId: 'bank-a',
        amountInCents: 10_000,
        effectiveAt: at,
        transferId: 'transfer-1',
      }],
      gains: [],
      bankTransfers: [{
        id: 'transfer-1',
        fromBankId: 'bank-a',
        toBankId: 'bank-a',
        amountInCents: 10_000,
        effectiveAt: at,
        expenseId: 'expense-transfer',
        gainId: 'missing-gain',
      }],
      cashRescues: [],
      investments: [],
      monthlyBalances: [{
        id: 'snapshot-1',
        bankId: 'bank-a',
        year: 2026,
        month: 8,
        balanceInCents: 33_000,
      }],
    });

    expect(plan.transactions).toHaveLength(0);
    expect(plan.issues.map((issue) => issue.code)).toEqual(['orphan-transfer', 'orphan-transfer']);
    expect(plan.reconciliations[0]).toMatchObject({
      source: 'legacyMonthStart',
      legacyApproximation: true,
    });
  });

  it('keeps legacy input unchanged and models investment opening, deposits and redemptions as account transfers', () => {
    const input = {
      groupId: 'group-1',
      memberIds: ['admin-1'],
      banks: [{ id: 'bank-a', name: 'Banco A' }],
      expenses: [{
        id: 'deposit-1',
        bankId: 'bank-a',
        amountInCents: 2_000,
        effectiveAt: at,
        investmentId: 'investment-1',
        isInvestmentDeposit: true,
      }],
      gains: [{
        id: 'redemption-1',
        bankId: 'bank-a',
        amountInCents: 500,
        effectiveAt: at,
        investmentId: 'investment-1',
        isInvestmentRedemption: true,
      }],
      bankTransfers: [],
      cashRescues: [],
      investments: [{
        id: 'investment-1',
        name: 'CDB',
        bankId: 'bank-a',
        initialValueInCents: 10_000,
        effectiveAt: at,
      }],
      monthlyBalances: [],
    };
    const before = JSON.stringify(input);

    const plan = createLegacyMigrationPlan(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(plan.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'investment-investment-1', kind: 'investment' }),
    ]));
    expect(plan.transactions.map(transaction => transaction.kind)).toEqual([
      'investment_deposit',
      'investment_redemption',
      'investment_deposit',
    ]);
    expect(plan.transactions.flatMap(transaction => transaction.sourceReferences ?? [])).toEqual(expect.arrayContaining([
      { collection: 'financeInvestments', id: 'investment-1' },
      { collection: 'expenses', id: 'deposit-1' },
      { collection: 'gains', id: 'redemption-1' },
    ]));
  });
});
