import { getAuth } from 'firebase/auth';
import { doc, runTransaction, Timestamp, type Firestore } from 'firebase/firestore';
import { prepareSparkHistoryProofFirebase, type SparkPreparationOptions } from './SparkHistoryFirebase';
import { saveSparkTemporalBalanceFirebase, type SparkTemporalBalanceInput } from './SparkTemporalBalanceFirebase';
import { assertSparkBalance, assertSparkDocumentId, parseSparkPosition, sparkText, SPARK_MAX_CENTS, type SparkIdentity } from './sparkFinancialProtocol';

export type SparkInvestmentSyncInput = SparkIdentity & {
  accountId: string; observedAt: Timestamp; observedValueInCents: number; expectedRevision: number; note?: string | null;
};

function syncCommand(input: SparkInvestmentSyncInput): SparkTemporalBalanceInput {
  if ('date' in input || 'effectiveAt' in input) throw new Error('Informe apenas a data observada do investimento.');
  if (!(input.observedAt instanceof Timestamp) || input.observedAt.seconds < 0
    || !Number.isSafeInteger(input.observedValueInCents) || input.observedValueInCents < 0 || input.observedValueInCents > SPARK_MAX_CENTS
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= SPARK_MAX_CENTS) throw new Error('Valor observado, data ou revisão do investimento inválidos.');
  return { groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId, accountId: input.accountId,
    kind: 'investment_sync', effectiveAt: input.observedAt, targetBalanceInCents: input.observedValueInCents,
    expectedRevision: input.expectedRevision, note: sparkText(input.note, 2000) };
}

/** [[Sincronização de Investimentos Spark]]: progresso/pausa usam a projeção existente, sem efeitos financeiros. */
export async function prepareSparkInvestmentSyncFirebase(firestore: Firestore, input: SparkInvestmentSyncInput, maxSteps = 100, options?: SparkPreparationOptions) {
  const command = syncCommand(input);
  return prepareSparkHistoryProofFirebase(firestore, { groupId: command.groupId, actorId: command.actorId, clientActionId: command.clientActionId,
    accountId: command.accountId, asOf: command.effectiveAt, purpose: 'instant' }, maxSteps, options);
}

export async function synchronizeSparkInvestmentFirebase(firestore: Firestore, input: SparkInvestmentSyncInput) {
  return saveSparkTemporalBalanceFirebase(firestore, syncCommand(input));
}

/** Saldo atual e referência observada são valores distintos após um aporte/resgate. */
export async function readSparkInvestmentStateFirebase(firestore: Firestore, input: Pick<SparkIdentity, 'groupId' | 'actorId'> & { accountId: string }) {
  input = { ...input }; [input.groupId, input.actorId, input.accountId].forEach(assertSparkDocumentId);
  return runTransaction(firestore, async transaction => {
    const assertActor = () => { if (getAuth(firestore.app).currentUser?.uid !== input.actorId) throw new Error('A sessão autenticada mudou.'); };
    assertActor();
    const group = doc(firestore, 'financialGroups', input.groupId);
    const position = parseSparkPosition((await transaction.get(doc(group, 'sparkPositions', input.accountId))).data() ?? {});
    if (position.kind !== 'investment') throw new Error('Selecione uma conta de investimento.');
    assertSparkBalance('investment', position.balanceInCents, null);
    await transaction.get(doc(group, 'sparkCurrentPositions', input.accountId));
    const checkpoint = (await transaction.get(doc(group, 'sparkCheckpoints', input.accountId))).data();
    const capital = (await transaction.get(doc(group, 'sparkInvestmentCapital', input.accountId))).data();
    if (checkpoint && (typeof checkpoint.operationId !== 'string' || !(checkpoint.effectiveAt instanceof Timestamp)
      || !Number.isSafeInteger(checkpoint.countedBalanceInCents) || checkpoint.countedBalanceInCents < 0 || checkpoint.countedBalanceInCents > SPARK_MAX_CENTS
      || typeof checkpoint.includesBoundary !== 'boolean')) throw new Error('Referência do investimento inválida.');
    if (capital && (capital.schemaVersion !== 1 || !Number.isSafeInteger(capital.revision) || capital.revision < 0 || capital.revision > SPARK_MAX_CENTS
      || !Number.isSafeInteger(capital.initialValueInCents) || capital.initialValueInCents < 0 || capital.initialValueInCents > SPARK_MAX_CENTS
      || typeof capital.fundingAccountId !== 'string' || typeof capital.lastOperationId !== 'string'
      || typeof capital.openingOperationId !== 'string')) throw new Error('Principal inicial do investimento inválido.');
    assertActor();
    return { accountId: input.accountId, currentBalanceInCents: position.balanceInCents, revision: position.revision,
      lastOperationId: position.lastOperationId,
      principal: capital ? { initialValueInCents: capital.initialValueInCents as number, fundingAccountId: capital.fundingAccountId as string,
        openingOperationId: capital.openingOperationId as string, revision: capital.revision as number,
        lastOperationId: capital.lastOperationId as string } : null,
      reference: checkpoint ? { operationId: checkpoint.operationId as string, observedAt: checkpoint.effectiveAt as Timestamp,
        observedValueInCents: checkpoint.countedBalanceInCents as number, includesBoundary: checkpoint.includesBoundary as boolean } : null };
  });
}
