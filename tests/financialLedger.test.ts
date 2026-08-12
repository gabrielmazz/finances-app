import {
  assertCashBalanceWillRemainNonNegative,
  calculateAccountBalanceInCents,
  createReversalTransaction,
  requiresOverdraftJustification,
  validateLedgerTransaction,
  type LedgerTransaction,
} from '@/utils/financialLedger';

const effectiveAt = new Date('2026-08-01T12:00:00.000Z');

function transfer(overrides: Partial<LedgerTransaction> = {}): LedgerTransaction {
  return {
    id: 'transaction-1',
    groupId: 'group-1',
    kind: 'transfer',
    effectiveAt,
    actorId: 'member-1',
    clientActionId: 'action_0001',
    legs: [
      { accountId: 'bank-1', deltaInCents: -12_345 },
      { accountId: 'cash-1', deltaInCents: 12_345 },
    ],
    ...overrides,
  };
}

describe('financial ledger domain', () => {
  it('accepts balanced pairs and rejects unbalanced or duplicate account legs', () => {
    expect(() => validateLedgerTransaction(transfer())).not.toThrow();
    expect(() => validateLedgerTransaction(transfer({ legs: [{ accountId: 'bank-1', deltaInCents: 100 }] }))).toThrow(
      'at least two legs',
    );
    expect(() => validateLedgerTransaction(transfer({
      legs: [
        { accountId: 'bank-1', deltaInCents: -100 },
        { accountId: 'cash-1', deltaInCents: 99 },
      ],
    }))).toThrow('balance to zero');
    expect(() => validateLedgerTransaction(transfer({
      legs: [
        { accountId: 'bank-1', deltaInCents: -100 },
        { accountId: 'bank-1', deltaInCents: 100 },
      ],
    }))).toThrow('may appear only once');
  });

  it('uses the latest reconciliation as the opening balance', () => {
    const balance = calculateAccountBalanceInCents({
      accountId: 'bank-1',
      reconciliation: {
        id: 'reconciliation-1',
        groupId: 'group-1',
        accountId: 'bank-1',
        effectiveAt: new Date('2026-08-10T12:00:00.000Z'),
        countedBalanceInCents: 50_000,
        differenceInCents: 0,
        source: 'manual',
      },
      transactions: [
        transfer({ effectiveAt: new Date('2026-08-09T12:00:00.000Z') }),
        transfer({
          id: 'transaction-2',
          clientActionId: 'action_0002',
          effectiveAt: new Date('2026-08-11T12:00:00.000Z'),
        }),
      ],
    });

    expect(balance).toBe(37_655);
  });

  it('creates a balanced immutable reversal', () => {
    const original = transfer();
    const reversal = createReversalTransaction(original, {
      id: 'reversal-1',
      effectiveAt: new Date('2026-08-02T12:00:00.000Z'),
      actorId: 'member-1',
      clientActionId: 'action_0003',
    });

    expect(reversal.reversesTransactionId).toBe(original.id);
    expect(calculateAccountBalanceInCents({ accountId: 'bank-1', transactions: [original, reversal] })).toBe(0);
  });

  it('supports correction as a reversal followed by a replacement event', () => {
    const original = transfer();
    const reversal = createReversalTransaction(original, {
      id: 'reversal-2',
      effectiveAt: new Date('2026-08-02T12:00:00.000Z'),
      actorId: 'member-1',
      clientActionId: 'action_0004',
    });
    const replacement = transfer({
      id: 'transaction-corrected',
      clientActionId: 'action_0005',
      legs: [
        { accountId: 'bank-1', deltaInCents: -5_000 },
        { accountId: 'cash-1', deltaInCents: 5_000 },
      ],
    });

    expect(calculateAccountBalanceInCents({
      accountId: 'bank-1',
      transactions: [original, reversal, replacement],
    })).toBe(-5_000);
  });

  it('blocks negative cash and requires a justification for a negative bank balance', () => {
    expect(() => assertCashBalanceWillRemainNonNegative(500, -501)).toThrow('cannot become negative');
    expect(() => assertCashBalanceWillRemainNonNegative(500, -500)).not.toThrow();
    expect(requiresOverdraftJustification('bank', 100, -101)).toBe(true);
    expect(requiresOverdraftJustification('investment', 100, -101)).toBe(false);
  });
});
