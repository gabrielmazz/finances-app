import { createSparkCivilMonthCalendar, projectSparkImportedHistory, reconcileSparkLedgerSnapshot, reconcileSparkLegacySnapshot } from '../utils/sparkFinancialReconciliation';
import type { LedgerTransaction } from '../utils/financialLedger';
import type { LegacyMigrationInput } from '../utils/financialLedgerMigration';

const at = (iso: string) => new Date(iso);
const date = at('2026-09-01T03:00:00Z');
const asOf = at('2026-09-20T15:00:00Z');
const base = () => ({ groupId: 'group', asOf, accounts: [{ id: 'bank', groupId: 'group', kind: 'bank' as const, name: 'Bank', currentBalanceInCents: 9500 }],
  reconciliations: [{ id: 'opening', groupId: 'group', accountId: 'bank', effectiveAt: date, countedBalanceInCents: 10_000, differenceInCents: 0, source: 'legacyMonthStart' as const }],
  transactions: [{ id: 'expense', groupId: 'group', kind: 'expense', actorId: 'owner', clientActionId: 'expense_123456', effectiveAt: date,
    legs: [{ accountId: 'bank', deltaInCents: -500 }, { accountId: null, deltaInCents: 500 }] }] as LedgerTransaction[] });

test('reconciles provided ledger snapshot and preserves inclusive monthly boundary', () => {
  const result = reconcileSparkLedgerSnapshot({ ...base(), verificationDates: [date] });
  expect(result.eligibleForReviewedBootstrap).toBe(true);
  expect(result.sourceCompleteness).toBe('provided-snapshot-only');
  expect(result.accounts[0].calculatedBalanceInCents).toBe(9500);
  expect(result.accounts[0].historicalBalances[0].balanceInCents).toBe(9500);
});

test('exact reconciliation excludes events at its counted instant', () => {
  const input = base(); input.accounts[0].currentBalanceInCents = 10_000;
  const result = reconcileSparkLedgerSnapshot({ ...input, reconciliations: [{ ...input.reconciliations[0], source: 'manual' }] });
  expect(result.eligibleForReviewedBootstrap).toBe(true);
  expect(result.accounts[0].calculatedBalanceInCents).toBe(10_000);
});

test('stored position mismatch blocks bootstrap and reports the difference', () => {
  const input = base(); input.accounts[0].currentBalanceInCents = 9000;
  const result = reconcileSparkLedgerSnapshot(input);
  expect(result.eligibleForReviewedBootstrap).toBe(false);
  expect(result.issues.map(issue => issue.code)).toContain('balance-mismatch');
  expect(result.accounts[0].differenceInCents).toBe(500);
});

test.each(['duplicate-event', 'duplicate-opening', 'missing-account', 'invalid-event', 'future-opening'])('%s is explicit and blocks bootstrap', code => {
  const input = base();
  if (code === 'duplicate-event') input.transactions.push(input.transactions[0]);
  if (code === 'duplicate-opening') input.reconciliations.push({ ...input.reconciliations[0], id: 'another' });
  if (code === 'missing-account') input.transactions[0].legs[0].accountId = 'missing';
  if (code === 'invalid-event') input.transactions[0].legs[0].deltaInCents = -500.5;
  if (code === 'future-opening') input.reconciliations[0].effectiveAt = at('2026-10-01T03:00:00Z');
  const result = reconcileSparkLedgerSnapshot(input);
  expect(result.eligibleForReviewedBootstrap).toBe(false); expect(result.issues.map(issue => issue.code)).toContain(code);
});

test('reversals preserve history before a later counted reference', () => {
  const input = base(); input.accounts[0].currentBalanceInCents = 8000;
  input.reconciliations.push({ ...input.reconciliations[0], id: 'counted', effectiveAt: at('2026-09-15T03:00:00Z'), countedBalanceInCents: 8000 });
  input.transactions.push({ ...input.transactions[0], id: 'inverse', kind: 'reversal', reversesTransactionId: 'expense',
    legs: [{ accountId: 'bank', deltaInCents: 500 }, { accountId: null, deltaInCents: -500 }] });
  const result = reconcileSparkLedgerSnapshot({ ...input, verificationDates: [date] });
  expect(result.eligibleForReviewedBootstrap).toBe(true);
  expect(result.accounts[0].historicalBalances[0].balanceInCents).toBe(10_000);
  expect(result.accounts[0].calculatedBalanceInCents).toBe(8000);
});

const legacy = (): LegacyMigrationInput & { asOf: Date } => ({ groupId: 'group', memberIds: ['owner'], banks: [{ id: 'a', name: 'Bank' }],
  expenses: [{ id: 'e', bankId: 'a', amountInCents: 500, effectiveAt: at('2018-12-01T02:00:00Z') }], gains: [], bankTransfers: [], cashRescues: [], investments: [],
  monthlyBalances: [{ id: 'month', bankId: 'a', year: 2018, month: 12, balanceInCents: 10_000 }],
  confirmedCashBalanceInCents: 0, confirmedAt: at('2018-12-20T15:00:00Z'), asOf: at('2018-12-20T15:00:00Z') });

test('legacy uses existing calculator as oracle, corrects DST and preserves midnight movements', () => {
  const result = reconcileSparkLegacySnapshot(legacy());
  expect(result.issues).toEqual([]);
  const bank = result.accounts.find(account => account.accountId === 'bank-a')!;
  expect(bank.calculatedBalanceInCents).toBe(9500);
  expect(bank.entries.find(entry => entry.kind === 'checkpoint')!.effectiveAt.toISOString()).toBe('2018-12-01T02:00:00.000Z');
  expect(result.accounts.find(account => account.kind === 'cash')!.accountId).toBe('cash');
});

test('legacy duplicates are reported rather than silently collapsed by month', () => {
  const input = legacy(); input.monthlyBalances.push({ ...input.monthlyBalances[0], id: 'duplicate', balanceInCents: 12_000 });
  const result = reconcileSparkLegacySnapshot(input);
  expect(result.eligibleForReviewedBootstrap).toBe(false);
  expect(result.issues.some(issue => issue.code === 'duplicate-opening')).toBe(true);
});

test('missing opening and unconfirmed cash block legacy bootstrap', () => {
  const input = legacy(); input.monthlyBalances = []; input.confirmedCashBalanceInCents = null;
  const result = reconcileSparkLegacySnapshot(input);
  expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['missing-opening', 'unconfirmed-cash']));
  expect(result.eligibleForReviewedBootstrap).toBe(false);
});

test('invalid original date cannot be silently turned into an epoch movement', () => {
  const input = legacy(); input.expenses[0].effectiveAt = new Date(NaN);
  const result = reconcileSparkLegacySnapshot(input);
  expect(result.eligibleForReviewedBootstrap).toBe(false);
  expect(result.issues.map(issue => issue.code)).toContain('invalid-source-date');
});

test('calendar uses Sao Paulo historical offset and bounds the generated interval', () => {
  const rows = createSparkCivilMonthCalendar(2018, 2019);
  expect(rows).toHaveLength(24);
  expect(rows.find(row => row.cycle === '2018-12')!.startAt.toISOString()).toBe('2018-12-01T02:00:00.000Z');
  expect(rows.find(row => row.cycle === '2019-12')!.startAt.toISOString()).toBe('2019-12-01T03:00:00.000Z');
  expect(() => createSparkCivilMonthCalendar(1900, 2026)).toThrow('Intervalo');
  expect(() => projectSparkImportedHistory([], new Date(NaN))).toThrow('Data');
});

test('legacy investment cannot be declared reconciled by comparing principal against itself', () => {
  const input = legacy(); input.investments.push({ id: 'investment', name: 'Fund', bankId: 'a', initialValueInCents: 1000, effectiveAt: at('2018-12-02T12:00:00Z') });
  const absent = reconcileSparkLegacySnapshot(input);
  expect(absent.eligibleForReviewedBootstrap).toBe(false);
  expect(absent.issues.map(issue => issue.code)).toContain('unverified-investment-position');
  const observed = reconcileSparkLegacySnapshot({ ...input, observedInvestmentBalancesInCents: { investment: 1500 } });
  expect(observed.eligibleForReviewedBootstrap).toBe(false);
  expect(observed.accounts.find(account => account.kind === 'investment')!.differenceInCents).toBe(-500);
});

test('transfer counterpart mismatch is found even when a later opening hides its current balance effect', () => {
  const input = legacy(); input.banks.push({ id: 'b', name: 'Other' });
  input.monthlyBalances.push({ ...input.monthlyBalances[0], id: 'other', bankId: 'b' });
  input.expenses = [{ id: 'debit', bankId: 'a', amountInCents: 400, effectiveAt: at('2018-11-20T12:00:00Z') }];
  input.gains = [{ id: 'credit', bankId: 'b', amountInCents: 500, effectiveAt: at('2018-11-20T12:00:00Z') }];
  input.bankTransfers = [{ id: 'transfer', fromBankId: 'a', toBankId: 'b', amountInCents: 500, effectiveAt: at('2018-11-20T12:00:00Z'), expenseId: 'debit', gainId: 'credit' }];
  const result = reconcileSparkLegacySnapshot(input);
  expect(result.accounts.every(account => account.differenceInCents === 0)).toBe(true);
  expect(result.eligibleForReviewedBootstrap).toBe(false);
  expect(result.issues.map(issue => issue.code)).toContain('inconsistent-transfer-pair');
});

test('two transfer records cannot consume the same old expense and gain even with matching values', () => {
  const input = legacy(); input.banks.push({ id: 'b', name: 'Other' });
  input.monthlyBalances.push({ ...input.monthlyBalances[0], id: 'other', bankId: 'b' });
  input.expenses = [{ id: 'debit', bankId: 'a', amountInCents: 500, effectiveAt: at('2018-11-20T12:00:00Z') }];
  input.gains = [{ id: 'credit', bankId: 'b', amountInCents: 500, effectiveAt: at('2018-11-20T12:00:00Z') }];
  const transfer = { id: 'first', fromBankId: 'a', toBankId: 'b', amountInCents: 500, effectiveAt: at('2018-11-20T12:00:00Z'), expenseId: 'debit', gainId: 'credit' };
  input.bankTransfers = [transfer, { ...transfer, id: 'second' }];
  const result = reconcileSparkLegacySnapshot(input);
  expect(result.eligibleForReviewedBootstrap).toBe(false);
  expect(result.issues.map(issue => issue.code)).toContain('inconsistent-transfer-pair');
});

test('unknown event type cannot pass the general balanced ledger validator at the snapshot boundary', () => {
  const input = base(); input.transactions[0].kind = 'unknown' as LedgerTransaction['kind'];
  input.transactions[0].legs[1].accountId = 'second';
  input.accounts.push({ ...input.accounts[0], id: 'second', currentBalanceInCents: 500 });
  const result = reconcileSparkLedgerSnapshot(input);
  expect(result.eligibleForReviewedBootstrap).toBe(false);
  expect(result.issues.map(issue => issue.code)).toContain('invalid-event');
});
