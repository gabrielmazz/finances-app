import { doc, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';
import { assertClientActionId } from '../utils/financialLedger';
import { sparkMovementCurrentEffect } from './SparkMovementFirebase';
import { assertSparkBalance, assertSparkDocumentId, assertSparkPositionCurrent, parseSparkPosition, runSparkOperation, sparkText, SPARK_MAX_CENTS, type SparkIdentity } from './sparkFinancialProtocol';
import { prepareSparkInvestmentEditValuation, sparkInvestmentEditValuationMaterial, type SparkInvestmentEditValuation } from './sparkInvestmentEditValuation';

export type SparkInvestmentPrincipalInput = SparkIdentity & {
  accountId: string; fundingAccountId: string; openingOperationId: string;
  expectedFundingRevision: number; expectedInvestmentRevision: number;
  expectedCapitalRevision: number; expectedCapitalOperationId: string;
  principalInCents: number; note?: string | null; overdraftReason?: string | null;
  valuation?: SparkInvestmentEditValuation;
};

/** [[Edição do Principal Spark]]: correção líquida na data original, sem reescrever avaliações. */
export async function updateSparkInvestmentPrincipalFirebase(firestore: Firestore, input: SparkInvestmentPrincipalInput) {
  input = { ...input, ...(input.valuation ? { valuation: { ...input.valuation } } : {}) };
  [input.accountId, input.fundingAccountId].forEach(assertSparkDocumentId);
  [input.openingOperationId, input.expectedCapitalOperationId].forEach(assertClientActionId);
  if (['date', 'effectiveAt', 'observedAt'].some(key => key in input)) throw new Error('A correção do principal usa a data original do financiamento.');
  if (input.accountId === input.fundingAccountId || input.accountId === 'cash'
    || !Number.isSafeInteger(input.principalInCents) || input.principalInCents < 0 || input.principalInCents > SPARK_MAX_CENTS
    || [input.expectedFundingRevision, input.expectedInvestmentRevision, input.expectedCapitalRevision]
      .some(value => !Number.isSafeInteger(value) || value < 0 || value >= SPARK_MAX_CENTS)) throw new Error('Principal ou revisão inválidos.');
  // Conversões de moeda também podem produzir -0, que deve persistir como inteiro zero.
  if (input.principalInCents === 0) input.principalInCents = 0;
  const material = { kind: 'investment_principal_update', fromAccountId: input.fundingAccountId, toAccountId: input.accountId,
    openingOperationId: input.openingOperationId, expectedCapitalRevision: input.expectedCapitalRevision,
    expectedCapitalOperationId: input.expectedCapitalOperationId, fromRevision: input.expectedFundingRevision,
    toRevision: input.expectedInvestmentRevision, principalInCents: input.principalInCents,
    note: sparkText(input.note, 2000), overdraftReason: sparkText(input.overdraftReason, 500), ...sparkInvestmentEditValuationMaterial(input, input.valuation) };
  return runSparkOperation(firestore, input, (_transaction, role) => {
    if (role !== 'admin') throw new Error('A edição do principal exige administrador do grupo.');
    return material;
  }, async transaction => {
    const group = doc(firestore, 'financialGroups', input.groupId);
    const capitalRef = doc(group, 'sparkInvestmentCapital', input.accountId);
    const capital = (await transaction.get(capitalRef)).data();
    if (!capital || capital.openingOperationId !== input.openingOperationId || capital.fundingAccountId !== input.fundingAccountId) throw new Error('Principal canônico ausente ou financiamento incompatível.');
    if (capital.revision !== input.expectedCapitalRevision || capital.lastOperationId !== input.expectedCapitalOperationId) throw new Error('O principal mudou. Atualize a confirmação.');
    const original = (await transaction.get(doc(group, 'sparkOperations', input.openingOperationId))).data();
    if (original?.kind !== 'investment_opening' || original.toAccountId !== input.accountId || !(original.createdAt instanceof Timestamp)
      || !Number.isSafeInteger(capital.initialValueInCents) || capital.initialValueInCents < 0 || capital.initialValueInCents > SPARK_MAX_CENTS) throw new Error('Origem do principal inválida.');
    const effectiveAt = (original.effectiveAt ?? original.createdAt) as Timestamp;
    const bankRef = doc(group, 'sparkPositions', input.fundingAccountId), investmentRef = doc(group, 'sparkPositions', input.accountId);
    const bank = parseSparkPosition((await transaction.get(bankRef)).data() ?? {});
    const investment = parseSparkPosition((await transaction.get(investmentRef)).data() ?? {});
    if (bank.kind !== 'bank' || investment.kind !== 'investment') throw new Error('Financiamento exige banco e investimento ativos.');
    [bank, investment].forEach(assertSparkPositionCurrent);
    if (bank.revision !== input.expectedFundingRevision || investment.revision !== input.expectedInvestmentRevision) throw new Error('O saldo mudou. Atualize a confirmação do principal.');
    const amountInCents = input.principalInCents - capital.initialValueInCents;
    // Firestore codifica -0 como double; centavos zero devem permanecer inteiros nas Rules.
    const fromCurrentEffectInCents = (await sparkMovementCurrentEffect(firestore, transaction, input.groupId, input.fundingAccountId, effectiveAt, -amountInCents)) || 0;
    const toCurrentEffectInCents = await sparkMovementCurrentEffect(firestore, transaction, input.groupId, input.accountId, effectiveAt, amountInCents);
    assertSparkBalance('bank', bank.balanceInCents + fromCurrentEffectInCents, material.overdraftReason);
    assertSparkBalance('investment', investment.balanceInCents + toCurrentEffectInCents, null);
    const valuation = await prepareSparkInvestmentEditValuation(firestore, transaction, input, input.accountId, investment, toCurrentEffectInCents, input.valuation);
    transaction.update(bankRef, { balanceInCents: bank.balanceInCents + fromCurrentEffectInCents, revision: bank.revision + 1,
      lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    transaction.update(investmentRef, { balanceInCents: investment.balanceInCents + toCurrentEffectInCents, revision: investment.revision + 1,
      lastOperationId: input.clientActionId, ...valuation?.position, updatedAt: serverTimestamp() });
    valuation?.save();
    transaction.update(capitalRef, { initialValueInCents: input.principalInCents, revision: capital.revision + 1,
      lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    return { amountInCents, previousPrincipalInCents: capital.initialValueInCents, effectiveAt,
      fromCurrentEffectInCents, toCurrentEffectInCents, fromPreviousOperationId: bank.lastOperationId, toPreviousOperationId: investment.lastOperationId };
  });
}
