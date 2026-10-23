import { doc, serverTimestamp, type Firestore, type Transaction } from 'firebase/firestore';
import { assertClientActionId } from '../utils/financialLedger';
import { assertSparkBalance, SPARK_MAX_CENTS, type SparkIdentity, type SparkPosition } from './sparkFinancialProtocol';

export type SparkInvestmentEditValuation = { operationId: string; observedValueInCents: number };

export function sparkInvestmentEditValuationMaterial(identity: SparkIdentity, value?: SparkInvestmentEditValuation) {
  if (!value) return {};
  assertClientActionId(value.operationId);
  if (value.operationId === identity.clientActionId || !Number.isSafeInteger(value.observedValueInCents)
    || value.observedValueInCents < 0 || value.observedValueInCents > SPARK_MAX_CENTS) throw new Error('Avaliação composta inválida.');
  return { valuationOperationId: value.operationId, observedValueInCents: value.observedValueInCents };
}

/** [[Investimentos]]: dois nós na mesma confirmação mantêm a data original do capital e a nova observação no commit. */
export async function prepareSparkInvestmentEditValuation(firestore: Firestore, transaction: Transaction, identity: SparkIdentity,
  accountId: string, before: SparkPosition, principalEffectInCents: number, value?: SparkInvestmentEditValuation) {
  if (!value) return null;
  if (before.revision > SPARK_MAX_CENTS - 2) throw new Error('Revisão do investimento fora do limite permitido.');
  const previousBalanceInCents = before.balanceInCents + principalEffectInCents;
  const differenceInCents = value.observedValueInCents - previousBalanceInCents;
  assertSparkBalance('investment', value.observedValueInCents, null);
  if (!Number.isSafeInteger(differenceInCents) || Math.abs(differenceInCents) > SPARK_MAX_CENTS) throw new Error('Diferença da avaliação fora do limite permitido.');
  const group = doc(firestore, 'financialGroups', identity.groupId), ref = doc(group, 'sparkOperations', value.operationId);
  if ((await transaction.get(ref)).exists()) throw new Error('Identidade da avaliação já utilizada.');
  return {
    position: { balanceInCents: value.observedValueInCents, revision: before.revision + 2, lastOperationId: value.operationId },
    save: () => {
      transaction.set(ref, { schemaVersion: 1, kind: 'investment_edit_valuation', actorId: identity.actorId, accountId,
        parentOperationId: identity.clientActionId, previousOperationId: identity.clientActionId, expectedRevision: before.revision + 1,
        targetBalanceInCents: value.observedValueInCents, previousBalanceInCents, differenceInCents, currentEffectInCents: differenceInCents,
        effectiveAt: serverTimestamp(), createdAt: serverTimestamp() });
      transaction.set(doc(group, 'sparkCheckpoints', accountId), { operationId: value.operationId, effectiveAt: serverTimestamp(),
        countedBalanceInCents: value.observedValueInCents, includesBoundary: false });
    },
  };
}
