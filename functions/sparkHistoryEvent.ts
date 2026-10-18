import { Timestamp } from 'firebase/firestore';

export const compareSparkTime = (a: Timestamp, b: Timestamp) => a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;

/** [[Protocolo Financeiro Spark]]: normalização compartilhada de cada termo histórico. */
export function sparkHistoryEvent(operation: Record<string, any>, accountId: string) {
  const root = ['account_opening', 'account_bootstrap'].includes(operation.kind);
  const single = 'accountId' in operation;
  if ((single && operation.accountId !== accountId)
    || (!single && operation.fromAccountId !== accountId && operation.toAccountId !== accountId)) {
    throw new Error('Histórico aponta para outra conta.');
  }
  const from = operation.fromAccountId === accountId;
  return {
    revision: root ? 0 : single ? operation.expectedRevision + 1 : (from ? operation.fromRevision : operation.toRevision) + 1,
    previous: root ? null : single ? operation.previousOperationId : from ? operation.fromPreviousOperationId : operation.toPreviousOperationId,
    at: (operation.effectiveAt ?? operation.createdAt) as Timestamp,
    checkpoint: ['account_bootstrap', 'account_count', 'dated_reconciliation', 'monthly_opening', 'imported_checkpoint'].includes(operation.kind),
    counted: root ? operation.openingBalanceInCents : operation.targetBalanceInCents ?? 0,
    inclusive: operation.kind === 'monthly_opening' || operation.includesBoundary === true,
    delta: root ? 0 : single ? operation.differenceInCents : (from ? -1 : 1) * operation.amountInCents,
    inverseAt: (operation.kind === 'adjustment_replacement' ? operation.originalEffectiveAt : operation.effectiveAt ?? operation.createdAt) as Timestamp,
    inverseDelta: operation.kind === 'adjustment_replacement' ? -operation.originalDifferenceInCents : 0,
  };
}

