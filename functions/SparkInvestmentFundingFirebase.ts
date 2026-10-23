import { doc, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';
import { assertClientActionId } from '../utils/financialLedger';
import type { SparkInvestmentPrincipalInput } from './SparkInvestmentPrincipalFirebase';
import { sparkMovementCurrentEffect } from './SparkMovementFirebase';
import { assertSparkBalance, assertSparkDocumentId, assertSparkPositionCurrent, parseSparkPosition, runSparkOperation, sparkText, SPARK_MAX_CENTS } from './sparkFinancialProtocol';
import { prepareSparkInvestmentEditValuation, sparkInvestmentEditValuationMaterial } from './sparkInvestmentEditValuation';

export type SparkInvestmentFundingInput = SparkInvestmentPrincipalInput & { newFundingAccountId: string; expectedNewFundingRevision: number };

/** [[Troca do Banco de Financiamento Spark]]: três pernas na data original, sem reescrever avaliações. */
export async function changeSparkInvestmentFundingFirebase(firestore: Firestore, input: SparkInvestmentFundingInput) {
  input = { ...input, ...(input.valuation ? { valuation: { ...input.valuation } } : {}) };
  [input.accountId, input.fundingAccountId, input.newFundingAccountId].forEach(assertSparkDocumentId);
  [input.openingOperationId, input.expectedCapitalOperationId].forEach(assertClientActionId);
  if (['date', 'effectiveAt', 'observedAt'].some(key => key in input)) throw new Error('A troca do financiamento usa a data original.');
  if (new Set([input.accountId, input.fundingAccountId, input.newFundingAccountId]).size !== 3 || input.accountId === 'cash'
    || !Number.isSafeInteger(input.principalInCents) || input.principalInCents < 0 || input.principalInCents > SPARK_MAX_CENTS
    || [input.expectedFundingRevision, input.expectedNewFundingRevision, input.expectedInvestmentRevision, input.expectedCapitalRevision]
      .some(value => !Number.isSafeInteger(value) || value < 0 || value >= SPARK_MAX_CENTS)) throw new Error('Contas, principal ou revisões inválidos.');
  if (input.principalInCents === 0) input.principalInCents = 0;
  const material = { kind: 'investment_funding_change', fromAccountId: input.newFundingAccountId, toAccountId: input.accountId,
    refundAccountId: input.fundingAccountId, fromRevision: input.expectedNewFundingRevision, toRevision: input.expectedInvestmentRevision,
    refundRevision: input.expectedFundingRevision, openingOperationId: input.openingOperationId,
    expectedCapitalRevision: input.expectedCapitalRevision, expectedCapitalOperationId: input.expectedCapitalOperationId,
    principalInCents: input.principalInCents, note: sparkText(input.note, 2000), overdraftReason: sparkText(input.overdraftReason, 500),
    ...sparkInvestmentEditValuationMaterial(input, input.valuation) };
  return runSparkOperation(firestore, input, (_transaction, role) => {
    if (role !== 'admin') throw new Error('A troca de financiamento exige administrador do grupo.');
    return material;
  }, async transaction => {
    const group = doc(firestore, 'financialGroups', input.groupId), capitalRef = doc(group, 'sparkInvestmentCapital', input.accountId);
    const capital = (await transaction.get(capitalRef)).data();
    if (!capital || capital.openingOperationId !== input.openingOperationId || capital.fundingAccountId !== input.fundingAccountId) throw new Error('Principal canônico ausente ou financiamento incompatível.');
    if (capital.revision !== input.expectedCapitalRevision || capital.lastOperationId !== input.expectedCapitalOperationId) throw new Error('O principal mudou. Atualize a confirmação.');
    const original = (await transaction.get(doc(group, 'sparkOperations', input.openingOperationId))).data();
    if (original?.kind !== 'investment_opening' || original.toAccountId !== input.accountId || !(original.createdAt instanceof Timestamp)
      || !Number.isSafeInteger(capital.initialValueInCents) || capital.initialValueInCents < 0 || capital.initialValueInCents > SPARK_MAX_CENTS) throw new Error('Origem do principal inválida.');
    const effectiveAt = (original.effectiveAt ?? original.createdAt) as Timestamp;
    const accounts = [input.newFundingAccountId, input.accountId, input.fundingAccountId];
    const revisions = [input.expectedNewFundingRevision, input.expectedInvestmentRevision, input.expectedFundingRevision];
    const deltas = [-input.principalInCents, input.principalInCents - capital.initialValueInCents, capital.initialValueInCents];
    const positions = [];
    for (const [index, accountId] of accounts.entries()) {
      const ref = doc(group, 'sparkPositions', accountId), position = parseSparkPosition((await transaction.get(ref)).data() ?? {});
      if (position.kind !== (index === 1 ? 'investment' : 'bank')) throw new Error('Financiamento exige dois bancos e investimento ativos.');
      assertSparkPositionCurrent(position);
      if (position.revision !== revisions[index]) throw new Error('O saldo mudou. Atualize a confirmação do financiamento.');
      positions.push({ ref, ...position });
    }
    const effects: number[] = [];
    for (const [index, accountId] of accounts.entries()) {
      const effect = (await sparkMovementCurrentEffect(firestore, transaction, input.groupId, accountId, effectiveAt, deltas[index])) || 0;
      assertSparkBalance(positions[index].kind, positions[index].balanceInCents + effect, material.overdraftReason); effects.push(effect);
    }
    const valuation = await prepareSparkInvestmentEditValuation(firestore, transaction, input, input.accountId, positions[1], effects[1], input.valuation);
    for (const [index, position] of positions.entries()) transaction.update(position.ref, {
      balanceInCents: position.balanceInCents + effects[index], revision: position.revision + 1,
      lastOperationId: input.clientActionId, ...(index === 1 ? valuation?.position : {}), updatedAt: serverTimestamp() });
    valuation?.save();
    transaction.update(capitalRef, { initialValueInCents: input.principalInCents, fundingAccountId: input.newFundingAccountId,
      revision: capital.revision + 1, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    return { amountInCents: input.principalInCents, previousPrincipalInCents: capital.initialValueInCents,
      differenceInCents: deltas[1], effectiveAt, fromCurrentEffectInCents: effects[0], toCurrentEffectInCents: effects[1],
      refundCurrentEffectInCents: effects[2], fromPreviousOperationId: positions[0].lastOperationId,
      toPreviousOperationId: positions[1].lastOperationId, refundPreviousOperationId: positions[2].lastOperationId };
  });
}
