/**
 * Primitives for the post-cutover financial ledger.
 *
 * Amounts are deliberately represented as signed integer cents. A positive
 * leg increases an account balance and a negative leg decreases it.
 */
export type FinancialAccountKind = 'bank' | 'cash' | 'investment';

export type LedgerTransactionKind =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'investment_deposit'
  | 'investment_redemption'
  | 'reconciliation_adjustment'
  | 'migration'
  | 'reversal';

export type LedgerLeg = {
  /** Null denotes the external counterpart of an income, expense or adjustment. */
  accountId: string | null;
  deltaInCents: number;
};

export type LedgerSourceReference = {
  collection: string;
  id: string;
};

export type LedgerTransaction = {
  id: string;
  groupId: string;
  kind: LedgerTransactionKind;
  effectiveAt: Date;
  actorId: string;
  clientActionId: string;
  legs: LedgerLeg[];
  categoryId?: string | null;
  note?: string | null;
  overdraftReason?: string | null;
  reversesTransactionId?: string | null;
  sourceReferences?: LedgerSourceReference[];
};

export type AccountReconciliation = {
  id: string;
  groupId: string;
  accountId: string;
  effectiveAt: Date;
  countedBalanceInCents: number;
  differenceInCents: number;
  source: 'manual' | 'legacyMonthStart';
  legacyApproximation?: boolean;
  transactionId?: string | null;
};

export type AccountBalanceInput = {
  accountId: string;
  transactions: LedgerTransaction[];
  reconciliation?: AccountReconciliation | null;
};

const EXTERNAL_LEG_COUNT_BY_KIND: Partial<Record<LedgerTransactionKind, number>> = {
  income: 1,
  expense: 1,
  reconciliation_adjustment: 1,
  migration: 1,
};

function fail(message: string): never {
  throw new Error('Invalid financial ledger transaction: ' + message);
}

export function assertCents(value: number, fieldName = 'amount'): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(fieldName + ' must be a safe integer amount in cents.');
  }
}

export function assertClientActionId(value: string): void {
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(value)) {
    throw new Error('clientActionId must contain 8-160 URL-safe characters.');
  }
}

export function isFinancialAccountKind(value: unknown): value is FinancialAccountKind {
  return value === 'bank' || value === 'cash' || value === 'investment';
}

/** Ensures that an event is self-balancing before it can be persisted. */
export function validateLedgerTransaction(transaction: LedgerTransaction): void {
  if (!transaction.id) fail('id is required');
  if (!transaction.groupId) fail('groupId is required');
  if (!transaction.actorId) fail('actorId is required');
  if (!(transaction.effectiveAt instanceof Date) || Number.isNaN(transaction.effectiveAt.valueOf())) {
    fail('effectiveAt must be a valid Date');
  }

  assertClientActionId(transaction.clientActionId);

  if (transaction.legs.length < 2) fail('at least two legs are required');

  let total = 0;
  let externalLegs = 0;
  const accountIds = new Set<string>();

  for (const leg of transaction.legs) {
    assertCents(leg.deltaInCents, 'leg delta');
    if (leg.deltaInCents === 0) fail('zero-value legs are not allowed');
    total += leg.deltaInCents;

    if (leg.accountId === null) {
      externalLegs += 1;
      continue;
    }

    if (!leg.accountId) fail('account legs require an accountId');
    if (accountIds.has(leg.accountId)) fail('an account may appear only once per transaction');
    accountIds.add(leg.accountId);
  }

  if (total !== 0) fail('all legs must balance to zero');

  const expectedExternalLegs = EXTERNAL_LEG_COUNT_BY_KIND[transaction.kind] ?? 0;
  const reversalHasExternalCounterpart = transaction.kind === 'reversal' && externalLegs === 1;
  if (externalLegs !== expectedExternalLegs && !reversalHasExternalCounterpart) {
    fail(transaction.kind + ' requires ' + expectedExternalLegs + ' external counterpart leg(s)');
  }

  if ((expectedExternalLegs === 0 && !reversalHasExternalCounterpart) && accountIds.size !== 2) {
    fail(transaction.kind + ' must move money between exactly two accounts');
  }

  if ((expectedExternalLegs === 1 || reversalHasExternalCounterpart) && accountIds.size !== 1) {
    fail(transaction.kind + ' must affect exactly one financial account');
  }

  if (transaction.kind === 'reversal' && !transaction.reversesTransactionId) {
    fail('reversal transactions require reversesTransactionId');
  }
}

export function accountDeltaInCents(transaction: LedgerTransaction, accountId: string): number {
  return transaction.legs.find((leg) => leg.accountId === accountId)?.deltaInCents ?? 0;
}

/**
 * Calculates the materialized account balance from its latest counted balance
 * plus only events that happened strictly after that reconciliation moment.
 */
export function calculateAccountBalanceInCents({
  accountId,
  transactions,
  reconciliation,
}: AccountBalanceInput): number {
  const reconciliationTime = reconciliation?.effectiveAt.valueOf();
  const opening = reconciliation?.countedBalanceInCents ?? 0;
  assertCents(opening, 'reconciled balance');

  return transactions.reduce((balance, transaction) => {
    validateLedgerTransaction(transaction);
    if (reconciliationTime !== undefined && transaction.effectiveAt.valueOf() <= reconciliationTime) {
      return balance;
    }
    return balance + accountDeltaInCents(transaction, accountId);
  }, opening);
}

export function calculateAccountDeltasInCents(transactions: LedgerTransaction[]): Map<string, number> {
  const balances = new Map<string, number>();

  transactions.forEach((transaction) => {
    validateLedgerTransaction(transaction);
    transaction.legs.forEach((leg) => {
      if (leg.accountId === null) return;
      balances.set(leg.accountId, (balances.get(leg.accountId) ?? 0) + leg.deltaInCents);
    });
  });

  return balances;
}

export function assertCashBalanceWillRemainNonNegative(
  currentBalanceInCents: number,
  deltaInCents: number,
): void {
  assertCents(currentBalanceInCents, 'current cash balance');
  assertCents(deltaInCents, 'cash movement');
  if (currentBalanceInCents + deltaInCents < 0) {
    throw new Error('Cash balance cannot become negative.');
  }
}

export function requiresOverdraftJustification(
  kind: FinancialAccountKind,
  currentBalanceInCents: number,
  deltaInCents: number,
): boolean {
  assertCents(currentBalanceInCents, 'current account balance');
  assertCents(deltaInCents, 'account movement');
  return kind === 'bank' && currentBalanceInCents + deltaInCents < 0;
}

export function createReversalTransaction(
  original: LedgerTransaction,
  input: Pick<LedgerTransaction, 'id' | 'effectiveAt' | 'actorId' | 'clientActionId'> & {
    note?: string | null;
  },
): LedgerTransaction {
  validateLedgerTransaction(original);

  const reversal: LedgerTransaction = {
    id: input.id,
    groupId: original.groupId,
    kind: 'reversal',
    effectiveAt: input.effectiveAt,
    actorId: input.actorId,
    clientActionId: input.clientActionId,
    categoryId: original.categoryId ?? null,
    note: input.note ?? null,
    reversesTransactionId: original.id,
    sourceReferences: original.sourceReferences,
    legs: original.legs.map((leg) => ({
      accountId: leg.accountId,
      deltaInCents: -leg.deltaInCents,
    })),
  };

  validateLedgerTransaction(reversal);
  return reversal;
}
