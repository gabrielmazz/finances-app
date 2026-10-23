import { doc, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';
import { sparkMovementCurrentEffect } from './SparkMovementFirebase';
import { assertSparkDocumentId, assertSparkPositionCurrent, parseSparkPosition, runSparkOperation, sparkText, SPARK_MAX_CENTS, type SparkIdentity } from './sparkFinancialProtocol';
import { validateSparkAccountCatalog, type SparkAccountCatalog } from '../utils/sparkAccountCatalog';
import { sparkAccountCatalogDocument } from './SparkAccountCatalogFirebase';

export type SparkInvestmentOpeningInput = SparkIdentity & {
  accountId: string; fundingAccountId: string; expectedFundingRevision: number;
  principalInCents: number; observedValueInCents: number; catalog: SparkAccountCatalog; note?: string | null;
};
export type SparkDatedInvestmentOpeningInput = SparkInvestmentOpeningInput & { effectiveAt: Timestamp };

/** [[Financiamento Inicial de Investimentos Spark]]: principal, avaliação e cadastro em um único commit. */
export async function openFundedSparkInvestmentFirebase(firestore: Firestore, input: SparkInvestmentOpeningInput) {
  if ('date' in input || 'effectiveAt' in input || 'observedAt' in input) throw new Error('A abertura financiada não aceita data explícita; usa o instante de confirmação.');
  return openInvestment(firestore, input);
}

/** [[Criação Retroativa de Investimentos Spark]]: aplicação e referência inicial na mesma data explícita. */
export async function openDatedFundedSparkInvestmentFirebase(firestore: Firestore, input: SparkDatedInvestmentOpeningInput) {
  if ('date' in input || 'observedAt' in input || !(input.effectiveAt instanceof Timestamp)
    || input.effectiveAt.seconds < 0 || input.effectiveAt.toMillis() > Date.now()) throw new Error('Informe uma única data efetiva válida, sem data futura.');
  if (input.effectiveAt.nanoseconds % 1000 !== 0) throw new Error('A data efetiva deve ter precisão de microssegundos, conforme o armazenamento do Firestore.');
  return openInvestment(firestore, input, input.effectiveAt);
}

async function openInvestment(firestore: Firestore, input: SparkInvestmentOpeningInput, effectiveAt?: Timestamp) {
  input = { ...input }; [input.accountId, input.fundingAccountId].forEach(assertSparkDocumentId);
  if (input.accountId === 'cash' || input.accountId === input.fundingAccountId
    || !Number.isSafeInteger(input.principalInCents) || input.principalInCents <= 0 || input.principalInCents > SPARK_MAX_CENTS
    || !Number.isSafeInteger(input.observedValueInCents) || input.observedValueInCents < 0 || input.observedValueInCents > SPARK_MAX_CENTS
    || !Number.isSafeInteger(input.expectedFundingRevision) || input.expectedFundingRevision < 0 || input.expectedFundingRevision >= SPARK_MAX_CENTS) throw new Error('Financiamento, valor observado ou revisão inválidos.');
  if (input.observedValueInCents === 0) input.observedValueInCents = 0;
  const catalog = validateSparkAccountCatalog('investment', input.catalog);
  if (catalog.bankAccountId !== input.fundingAccountId) throw new Error('O banco vinculado deve ser o banco do financiamento inicial.');
  const material = { kind: 'investment_opening', dated: effectiveAt !== undefined, ...(effectiveAt ? { effectiveAt } : {}),
    accountKind: 'investment', fromAccountId: input.fundingAccountId, toAccountId: input.accountId,
    fromRevision: input.expectedFundingRevision, amountInCents: input.principalInCents, openingBalanceInCents: input.observedValueInCents,
    valuationDifferenceInCents: input.observedValueInCents - input.principalInCents, ...catalog, note: sparkText(input.note, 2000) };
  const identity = { groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId };
  return runSparkOperation(firestore, identity, (_transaction, role) => {
    if (role !== 'admin') throw new Error('A abertura de investimento exige administrador do grupo.');
    return material;
  }, async transaction => {
    const group = doc(firestore, 'financialGroups', input.groupId), bankRef = doc(group, 'sparkPositions', input.fundingAccountId);
    const positionRef = doc(group, 'sparkPositions', input.accountId), catalogRef = doc(group, 'sparkAccountCatalog', input.accountId);
    const capitalRef = doc(group, 'sparkInvestmentCapital', input.accountId), checkpointRef = doc(group, 'sparkCheckpoints', input.accountId);
    const bank = parseSparkPosition((await transaction.get(bankRef)).data() ?? {});
    if (bank.kind !== 'bank') throw new Error('O financiamento inicial exige uma conta bancária ativa.');
    assertSparkPositionCurrent(bank);
    if (bank.revision !== input.expectedFundingRevision) throw new Error('O saldo do banco mudou. Atualize a confirmação do financiamento.');
    for (const ref of [positionRef, catalogRef, capitalRef, checkpointRef]) {
      if ((await transaction.get(ref)).exists()) throw new Error('O investimento ou seu cadastro inicial já existe.');
    }
    const fromCurrentEffectInCents = effectiveAt
      ? await sparkMovementCurrentEffect(firestore, transaction, input.groupId, input.fundingAccountId, effectiveAt, -input.principalInCents)
      : -input.principalInCents;
    if (bank.balanceInCents + fromCurrentEffectInCents < 0) throw new Error('Saldo bancário insuficiente para o investimento inicial.');
    transaction.update(bankRef, { balanceInCents: bank.balanceInCents + fromCurrentEffectInCents, revision: bank.revision + 1,
      lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    transaction.set(positionRef, { schemaVersion: 1, kind: 'investment', active: true, balanceInCents: input.observedValueInCents,
      revision: 0, lastOperationId: input.clientActionId, nextActivationAt: null, updatedAt: serverTimestamp() });
    transaction.set(catalogRef, sparkAccountCatalogDocument(input.actorId, 'investment', catalog, 0, input.clientActionId));
    transaction.set(capitalRef, { schemaVersion: 1, actorId: input.actorId, initialValueInCents: input.principalInCents,
      fundingAccountId: input.fundingAccountId, openingOperationId: input.clientActionId, revision: 0,
      lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    transaction.set(checkpointRef, { operationId: input.clientActionId, countedBalanceInCents: input.observedValueInCents,
      effectiveAt: effectiveAt ?? serverTimestamp(), includesBoundary: false });
    return { fromPreviousOperationId: bank.lastOperationId, ...(effectiveAt ? { fromCurrentEffectInCents } : {}) };
  });
}
