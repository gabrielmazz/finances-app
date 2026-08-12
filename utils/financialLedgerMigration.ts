import {
  calculateAccountBalanceInCents,
  type AccountReconciliation,
  type FinancialAccountKind,
  type LedgerSourceReference,
  type LedgerTransaction,
} from './financialLedger';

export type LegacyBank = {
  id: string;
  name: string;
  colorHex?: string | null;
};

export type LegacyMovement = {
  id: string;
  bankId: string | null;
  amountInCents: number;
  effectiveAt: Date;
  categoryId?: string | null;
  note?: string | null;
  transferId?: string | null;
  investmentId?: string | null;
  isInvestmentDeposit?: boolean;
  isInvestmentRedemption?: boolean;
};

export type LegacyBankTransfer = {
  id: string;
  fromBankId: string;
  toBankId: string;
  amountInCents: number;
  effectiveAt: Date;
  expenseId: string;
  gainId: string;
};

export type LegacyCashRescue = {
  id: string;
  bankId: string;
  amountInCents: number;
  effectiveAt: Date;
  note?: string | null;
};

export type LegacyInvestment = {
  id: string;
  name: string;
  bankId: string | null;
  initialValueInCents: number;
  effectiveAt: Date;
};

export type LegacyMonthlyBalance = {
  id: string;
  bankId: string;
  year: number;
  month: number;
  balanceInCents: number;
};

export type LegacyMigrationInput = {
  groupId: string;
  memberIds: string[];
  banks: LegacyBank[];
  expenses: LegacyMovement[];
  gains: LegacyMovement[];
  bankTransfers: LegacyBankTransfer[];
  cashRescues: LegacyCashRescue[];
  investments: LegacyInvestment[];
  monthlyBalances: LegacyMonthlyBalance[];
  confirmedCashBalanceInCents?: number | null;
  confirmedAt?: Date;
  preflightIssues?: MigrationIssue[];
};

export type FinancialAccountSeed = {
  id: string;
  groupId: string;
  kind: FinancialAccountKind;
  name: string;
  currentBalanceInCents: number;
  legacyBankId?: string | null;
  legacyInvestmentId?: string | null;
};

export type MigrationIssue = {
  code: 'duplicate-bank' | 'orphan-transfer' | 'missing-account' | 'invalid-amount';
  collection: string;
  id: string;
  detail: string;
};

export type LegacyMigrationPlan = {
  accounts: FinancialAccountSeed[];
  transactions: LedgerTransaction[];
  reconciliations: AccountReconciliation[];
  issues: MigrationIssue[];
  sourceDocumentCount: number;
};

const CASH_ACCOUNT_PREFIX = 'cash-';
const BANK_ACCOUNT_PREFIX = 'bank-';
const INVESTMENT_ACCOUNT_PREFIX = 'investment-';

function source(collection: string, id: string): LedgerSourceReference {
  return { collection, id };
}

function movementDate(value: Date): Date {
  return Number.isNaN(value.valueOf()) ? new Date(0) : value;
}

function isValidPositiveCents(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function cashAccountId(groupId: string): string {
  return CASH_ACCOUNT_PREFIX + groupId;
}

function bankAccountId(bankId: string): string {
  return BANK_ACCOUNT_PREFIX + bankId;
}

function investmentAccountId(investmentId: string): string {
  return INVESTMENT_ACCOUNT_PREFIX + investmentId;
}

/**
 * This represents midnight in America/Sao_Paulo for modern ledger data.
 * The migration intentionally marks these snapshots as approximate because
 * old documents did not keep a real timestamp (and historical DST can differ).
 */
function legacyMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
}

function externalMovement(
  groupId: string,
  actorId: string,
  kind: 'income' | 'expense',
  accountId: string,
  legacy: LegacyMovement,
): LedgerTransaction {
  const accountDelta = kind === 'income' ? legacy.amountInCents : -legacy.amountInCents;
  return {
    id: 'migration-' + kind + '-' + legacy.id,
    groupId,
    kind,
    effectiveAt: movementDate(legacy.effectiveAt),
    actorId,
    clientActionId: 'migration_' + kind + '_' + legacy.id,
    categoryId: legacy.categoryId ?? null,
    note: legacy.note ?? null,
    sourceReferences: [source(kind === 'income' ? 'gains' : 'expenses', legacy.id)],
    legs: [
      { accountId, deltaInCents: accountDelta },
      { accountId: null, deltaInCents: -accountDelta },
    ],
  };
}

export function createLegacyMigrationPlan(input: LegacyMigrationInput): LegacyMigrationPlan {
  const actorId = input.memberIds[0] ?? 'legacy-migration';
  const accounts: FinancialAccountSeed[] = [{
    id: cashAccountId(input.groupId),
    groupId: input.groupId,
    kind: 'cash',
    name: 'Caixa',
    currentBalanceInCents: 0,
  }];
  const transactions: LedgerTransaction[] = [];
  const reconciliations: AccountReconciliation[] = [];
  const issues: MigrationIssue[] = [...(input.preflightIssues ?? [])];
  const knownAccounts = new Set<string>([cashAccountId(input.groupId)]);
  const bankIds = new Set<string>();

  input.banks.forEach((bank) => {
    if (bankIds.has(bank.id)) {
      issues.push({
        code: 'duplicate-bank',
        collection: 'banks',
        id: bank.id,
        detail: 'The legacy bank id appears more than once.',
      });
      return;
    }
    bankIds.add(bank.id);
    const id = bankAccountId(bank.id);
    knownAccounts.add(id);
    accounts.push({
      id,
      groupId: input.groupId,
      kind: 'bank',
      name: bank.name,
      currentBalanceInCents: 0,
      legacyBankId: bank.id,
    });
  });

  const accountForLegacyBank = (legacyBankId: string | null): string | null => {
    if (legacyBankId === null) return cashAccountId(input.groupId);
    const id = bankAccountId(legacyBankId);
    return knownAccounts.has(id) ? id : null;
  };

  const investmentAccountIds = new Set<string>();
  input.investments.forEach((investment) => {
    const id = investmentAccountId(investment.id);
    if (investmentAccountIds.has(id)) {
      issues.push({
        code: 'duplicate-bank',
        collection: 'financeInvestments',
        id: investment.id,
        detail: 'The legacy investment id appears more than once.',
      });
      return;
    }
    investmentAccountIds.add(id);
    accounts.push({
      id,
      groupId: input.groupId,
      kind: 'investment',
      name: investment.name,
      currentBalanceInCents: 0,
      legacyInvestmentId: investment.id,
    });
  });

  const accountForLegacyInvestment = (legacyInvestmentId: string | null | undefined): string | null => {
    if (!legacyInvestmentId) return null;
    const id = investmentAccountId(legacyInvestmentId);
    return investmentAccountIds.has(id) ? id : null;
  };

  const expenseById = new Map(input.expenses.map((expense) => [expense.id, expense]));
  const gainById = new Map(input.gains.map((gain) => [gain.id, gain]));
  const pairedExpenseIds = new Set<string>();
  const pairedGainIds = new Set<string>();

  input.bankTransfers.forEach((transfer) => {
    const fromAccountId = accountForLegacyBank(transfer.fromBankId);
    const toAccountId = accountForLegacyBank(transfer.toBankId);
    const expense = expenseById.get(transfer.expenseId);
    const gain = gainById.get(transfer.gainId);

    if (!fromAccountId || !toAccountId) {
      issues.push({
        code: 'missing-account',
        collection: 'bankTransfers',
        id: transfer.id,
        detail: 'The source or destination legacy bank was not selected for migration.',
      });
      return;
    }
    if (!expense || !gain) {
      issues.push({
        code: 'orphan-transfer',
        collection: 'bankTransfers',
        id: transfer.id,
        detail: 'The transfer pair is incomplete; it requires both expense and gain documents.',
      });
      return;
    }
    if (!isValidPositiveCents(transfer.amountInCents)) {
      issues.push({
        code: 'invalid-amount',
        collection: 'bankTransfers',
        id: transfer.id,
        detail: 'Transfer amount is not a positive integer number of cents.',
      });
      return;
    }

    pairedExpenseIds.add(expense.id);
    pairedGainIds.add(gain.id);
    transactions.push({
      id: 'migration-transfer-' + transfer.id,
      groupId: input.groupId,
      kind: 'transfer',
      effectiveAt: movementDate(transfer.effectiveAt),
      actorId,
      clientActionId: 'migration_transfer_' + transfer.id,
      sourceReferences: [
        source('bankTransfers', transfer.id),
        source('expenses', expense.id),
        source('gains', gain.id),
      ],
      legs: [
        { accountId: fromAccountId, deltaInCents: -transfer.amountInCents },
        { accountId: toAccountId, deltaInCents: transfer.amountInCents },
      ],
    });
  });

  const migrateExternalMovements = (
    collection: 'expenses' | 'gains',
    movements: LegacyMovement[],
    pairedIds: Set<string>,
    kind: 'expense' | 'income',
  ) => {
    movements.forEach((movement) => {
      if (pairedIds.has(movement.id)) return;
      if (movement.transferId) {
        issues.push({
          code: 'orphan-transfer',
          collection,
          id: movement.id,
          detail: 'Movement references a transfer but no complete pair was found.',
        });
        return;
      }
      const accountId = accountForLegacyBank(movement.bankId);
      if (!accountId) {
        issues.push({
          code: 'missing-account',
          collection,
          id: movement.id,
          detail: 'Movement points to an unselected or missing legacy bank.',
        });
        return;
      }
      if (!isValidPositiveCents(movement.amountInCents)) {
        issues.push({
          code: 'invalid-amount',
          collection,
          id: movement.id,
          detail: 'Movement amount is not a positive integer number of cents.',
        });
        return;
      }
      const investmentAccountId = accountForLegacyInvestment(movement.investmentId);
      const isInvestmentFlow =
        (kind === 'expense' && movement.isInvestmentDeposit === true) ||
        (kind === 'income' && movement.isInvestmentRedemption === true);
      if (isInvestmentFlow) {
        if (!investmentAccountId) {
          issues.push({
            code: 'missing-account',
            collection,
            id: movement.id,
            detail: 'Investment movement points to a missing legacy investment account.',
          });
          return;
        }
        const isDeposit = kind === 'expense';
        transactions.push({
          id: 'migration-' + (isDeposit ? 'investment-deposit-' : 'investment-redemption-') + movement.id,
          groupId: input.groupId,
          kind: isDeposit ? 'investment_deposit' : 'investment_redemption',
          effectiveAt: movementDate(movement.effectiveAt),
          actorId,
          clientActionId: 'migration_investment_flow_' + movement.id,
          categoryId: movement.categoryId ?? null,
          note: movement.note ?? null,
          sourceReferences: [source(collection, movement.id)],
          legs: isDeposit
            ? [
              { accountId, deltaInCents: -movement.amountInCents },
              { accountId: investmentAccountId, deltaInCents: movement.amountInCents },
            ]
            : [
              { accountId: investmentAccountId, deltaInCents: -movement.amountInCents },
              { accountId, deltaInCents: movement.amountInCents },
            ],
        });
        return;
      }
      transactions.push(externalMovement(input.groupId, actorId, kind, accountId, movement));
    });
  };

  migrateExternalMovements('expenses', input.expenses, pairedExpenseIds, 'expense');
  migrateExternalMovements('gains', input.gains, pairedGainIds, 'income');

  input.cashRescues.forEach((rescue) => {
    const bankAccount = accountForLegacyBank(rescue.bankId);
    if (!bankAccount || !isValidPositiveCents(rescue.amountInCents)) {
      issues.push({
        code: bankAccount ? 'invalid-amount' : 'missing-account',
        collection: 'cashRescues',
        id: rescue.id,
        detail: bankAccount
          ? 'Cash rescue amount is not a positive integer number of cents.'
          : 'Cash rescue points to an unselected or missing legacy bank.',
      });
      return;
    }
    transactions.push({
      id: 'migration-cash-rescue-' + rescue.id,
      groupId: input.groupId,
      kind: 'transfer',
      effectiveAt: movementDate(rescue.effectiveAt),
      actorId,
      clientActionId: 'migration_cash_rescue_' + rescue.id,
      note: rescue.note ?? null,
      sourceReferences: [source('cashRescues', rescue.id)],
      legs: [
        { accountId: bankAccount, deltaInCents: -rescue.amountInCents },
        { accountId: cashAccountId(input.groupId), deltaInCents: rescue.amountInCents },
      ],
    });
  });

  input.investments.forEach((investment) => {
    const id = investmentAccountId(investment.id);
    if (investment.initialValueInCents === 0) return;
    const bankAccount = accountForLegacyBank(investment.bankId);
    if (!bankAccount || !isValidPositiveCents(investment.initialValueInCents)) {
      issues.push({
        code: bankAccount ? 'invalid-amount' : 'missing-account',
        collection: 'financeInvestments',
        id: investment.id,
        detail: bankAccount
          ? 'Investment opening value is not a positive integer number of cents.'
          : 'Investment has no selected origin bank.',
      });
      return;
    }
    transactions.push({
      id: 'migration-investment-' + investment.id,
      groupId: input.groupId,
      kind: 'investment_deposit',
      effectiveAt: movementDate(investment.effectiveAt),
      actorId,
      clientActionId: 'migration_investment_' + investment.id,
      sourceReferences: [source('financeInvestments', investment.id)],
      legs: [
        { accountId: bankAccount, deltaInCents: -investment.initialValueInCents },
        { accountId: id, deltaInCents: investment.initialValueInCents },
      ],
    });
  });

  input.monthlyBalances.forEach((snapshot) => {
    const accountId = accountForLegacyBank(snapshot.bankId);
    if (!accountId) {
      issues.push({
        code: 'missing-account',
        collection: 'monthlyBalances',
        id: snapshot.id,
        detail: 'Snapshot points to an unselected or missing legacy bank.',
      });
      return;
    }
    if (!Number.isSafeInteger(snapshot.balanceInCents) || snapshot.month < 1 || snapshot.month > 12) {
      issues.push({
        code: 'invalid-amount',
        collection: 'monthlyBalances',
        id: snapshot.id,
        detail: 'Snapshot has an invalid balance or calendar month.',
      });
      return;
    }
    reconciliations.push({
      id: 'migration-reconciliation-' + snapshot.id,
      groupId: input.groupId,
      accountId,
      effectiveAt: legacyMonthStart(snapshot.year, snapshot.month),
      countedBalanceInCents: snapshot.balanceInCents,
      differenceInCents: 0,
      source: 'legacyMonthStart',
      legacyApproximation: true,
    });
  });

  if (input.confirmedCashBalanceInCents !== undefined && input.confirmedCashBalanceInCents !== null) {
    const cashId = cashAccountId(input.groupId);
    const calculatedCashBalance = calculateAccountBalanceInCents({ accountId: cashId, transactions });
    const differenceInCents = input.confirmedCashBalanceInCents - calculatedCashBalance;
    const effectiveAt = input.confirmedAt ?? new Date();
    const adjustmentId = 'migration-cash-confirmation';

    if (differenceInCents !== 0) {
      transactions.push({
        id: adjustmentId,
        groupId: input.groupId,
        kind: 'reconciliation_adjustment',
        effectiveAt,
        actorId,
        clientActionId: 'migration_cash_confirmation',
        note: 'Ajuste criado pela confirmação física do Caixa durante a migração.',
        legs: [
          { accountId: cashId, deltaInCents: differenceInCents },
          { accountId: null, deltaInCents: -differenceInCents },
        ],
      });
    }

    reconciliations.push({
      id: 'migration-cash-confirmation-reconciliation',
      groupId: input.groupId,
      accountId: cashId,
      effectiveAt,
      countedBalanceInCents: input.confirmedCashBalanceInCents,
      differenceInCents,
      source: 'manual',
      transactionId: differenceInCents === 0 ? null : adjustmentId,
    });
  }

  const currentBalances = new Map<string, number>();
  accounts.forEach((account) => {
    const latestReconciliation = reconciliations
      .filter((reconciliation) => reconciliation.accountId === account.id)
      .sort((left, right) => right.effectiveAt.valueOf() - left.effectiveAt.valueOf())[0];
    currentBalances.set(account.id, calculateAccountBalanceInCents({
      accountId: account.id,
      transactions,
      reconciliation: latestReconciliation,
    }));
  });
  accounts.forEach((account) => {
    account.currentBalanceInCents = currentBalances.get(account.id) ?? 0;
  });

  return {
    accounts,
    transactions,
    reconciliations,
    issues,
    sourceDocumentCount:
      input.banks.length +
      input.expenses.length +
      input.gains.length +
      input.bankTransfers.length +
      input.cashRescues.length +
      input.investments.length +
      input.monthlyBalances.length,
  };
}
