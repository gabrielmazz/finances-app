import { Timestamp } from 'firebase/firestore';

export const compareSparkTime = (a: Timestamp, b: Timestamp) => a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;

/** [[Protocolo Financeiro Spark]]: normalização compartilhada de cada termo histórico. */
export function sparkHistoryEvent(operation: Record<string, any>, accountId: string) {
  const fundedRoot = operation.kind === 'investment_opening' && operation.toAccountId === accountId;
  const root = fundedRoot || ['account_opening', 'bank_opening', 'account_bootstrap'].includes(operation.kind);
  const single = 'accountId' in operation;
  const refund = operation.kind === 'investment_funding_change' && operation.refundAccountId === accountId;
  if ((single && operation.accountId !== accountId)
    || (!single && !refund && operation.fromAccountId !== accountId && operation.toAccountId !== accountId)) {
    throw new Error('Histórico aponta para outra conta.');
  }
  const from = operation.fromAccountId === accountId;
  return {
    revision: root ? 0 : single ? operation.expectedRevision + 1 : (refund ? operation.refundRevision : from ? operation.fromRevision : operation.toRevision) + 1,
    previous: root ? null : single ? operation.previousOperationId : refund ? operation.refundPreviousOperationId : from ? operation.fromPreviousOperationId : operation.toPreviousOperationId,
    at: (operation.effectiveAt ?? operation.createdAt) as Timestamp,
    commitTime: !('effectiveAt' in operation),
    checkpoint: fundedRoot || ['bank_opening', 'account_bootstrap', 'account_count', 'dated_reconciliation', 'investment_sync', 'investment_edit_valuation', 'investment_valuation_reversal', 'monthly_opening', 'imported_checkpoint'].includes(operation.kind),
    counted: root ? operation.openingBalanceInCents : operation.targetBalanceInCents ?? 0,
    inclusive: operation.kind === 'monthly_opening' || operation.includesBoundary === true,
    delta: root ? 0 : single ? operation.differenceInCents : operation.kind === 'investment_funding_change'
      ? refund ? operation.previousPrincipalInCents : from ? -operation.principalInCents : operation.differenceInCents
      : operation.kind === 'movement_correction'
      ? (from ? -operation.originalDeltaInCents : 0) + (operation.toAccountId === accountId ? operation.differenceInCents : 0)
      : (from ? -1 : 1) * operation.amountInCents,
    inverseAt: (operation.kind === 'adjustment_replacement' ? operation.originalEffectiveAt : operation.effectiveAt ?? operation.createdAt) as Timestamp,
    inverseDelta: operation.kind === 'adjustment_replacement' ? -operation.originalDifferenceInCents : 0,
  };
}

