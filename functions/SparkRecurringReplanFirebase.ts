import { doc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { assertSparkDocumentId, runSparkOperation, sparkText, SPARK_MAX_CENTS, type SparkIdentity } from './sparkFinancialProtocol';
import { validateSparkMovementCategory } from './SparkMovementFirebase';
import { getCycleKeyFromDate } from '../utils/mandatoryExpenses';
import { toFinancialCivilDate } from '../utils/financialCivilDate';
import { validateSparkRecurringMetadata, type SparkRecurringMetadata } from '../utils/sparkRecurringMetadata';
import { MAX_MANDATORY_INSTALLMENTS } from '../utils/mandatoryInstallments';

export type SparkRecurringReplanInput = SparkIdentity & {
  planId: string; replacementPlanId: string; expectedPlanRevision: number; expectedMetadataRevision: number | null;
  name: string; categoryId: string | null; startCycle: string; installmentTotal: number; contractTotalInCents: number;
  reason: string; metadata: SparkRecurringMetadata;
};
export type SparkRecurringReplanUndoInput = SparkIdentity & {
  planId: string; replacementPlanId: string; replanOperationId: string; expectedPlanRevision: number; expectedReplacementRevision: number; reason: string;
};
const identity = (input: SparkIdentity) => ({ actorId: input.actorId, groupId: input.groupId, clientActionId: input.clientActionId });
const revision = (value: number) => Number.isSafeInteger(value) && value >= 0 && value < SPARK_MAX_CENTS;

/** [[Recorrências Spark]]: nova definição para o saldo negociado, sem reescrever os pagamentos anteriores. */
export async function replanSparkRecurringFirebase(firestore: Firestore, input: SparkRecurringReplanInput) {
  input = { ...input, metadata: validateSparkRecurringMetadata(input.metadata) };
  [input.planId, input.replacementPlanId].forEach(assertSparkDocumentId);
  if (input.categoryId !== null) assertSparkDocumentId(input.categoryId);
  const name = sparkText(input.name, 160), reason = sparkText(input.reason, 2000);
  if (!name || !reason || input.planId === input.replacementPlanId || !revision(input.expectedPlanRevision)
    || input.expectedMetadataRevision !== null && !revision(input.expectedMetadataRevision)
    || !/^(19[7-9]\d|20\d\d|2100)-(0[1-9]|1[0-2])$/.test(input.startCycle)
    || !Number.isInteger(input.installmentTotal) || input.installmentTotal < 1 || input.installmentTotal > MAX_MANDATORY_INSTALLMENTS
    || !Number.isSafeInteger(input.contractTotalInCents) || input.contractTotalInCents < input.installmentTotal || input.contractTotalInCents > SPARK_MAX_CENTS) {
    throw new Error('Informe nome, motivo, revisão e o novo contrato em centavos, com uma a 360 parcelas.');
  }
  const [year, month] = input.startCycle.split('-').map(Number), end = new Date(Date.UTC(year, month + input.installmentTotal - 2, 1));
  const endCycle = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}`;
  if (endCycle > '2100-12') throw new Error('Fim do contrato fora do calendário suportado.');
  const material = { kind: 'recurring_replan', planId: input.planId, replacementPlanId: input.replacementPlanId,
    expectedPlanRevision: input.expectedPlanRevision, expectedMetadataRevision: input.expectedMetadataRevision, name, reason,
    categoryId: input.categoryId, startCycle: input.startCycle, endCycle, installmentTotal: input.installmentTotal,
    contractTotalInCents: input.contractTotalInCents, valueInCents: Math.floor(input.contractTotalInCents / input.installmentTotal), ...input.metadata };
  return runSparkOperation(firestore, identity(input), () => material, async transaction => {
    const group = doc(firestore, 'financialGroups', input.groupId), oldRef = doc(group, 'sparkRecurringPlans', input.planId);
    const nextRef = doc(group, 'sparkRecurringPlans', input.replacementPlanId), metaRef = doc(group, 'sparkRecurringMetadata', input.replacementPlanId);
    const old = (await transaction.get(oldRef)).data(), next = await transaction.get(nextRef);
    const previousMetadata = (await transaction.get(doc(group, 'sparkRecurringMetadata', input.planId))).data();
    const currentCycle = (await transaction.get(doc(oldRef, 'cycles', input.startCycle))).data();
    if (!old || old.actorId !== input.actorId || old.revision !== input.expectedPlanRevision || !old.active
      || old.successorPlanId || old.replanCancelled || old.installmentTotal === null || old.installmentsCompleted >= old.installmentTotal) {
      throw new Error('Contrato alterado, concluído, substituído ou sem permissão. Atualize a confirmação.');
    }
    if ((previousMetadata?.revision ?? null) !== input.expectedMetadataRevision) throw new Error('Configuração alterada. Atualize a confirmação.');
    if (next.exists()) throw new Error('Identidade do novo contrato já utilizada.');
    if (input.startCycle < getCycleKeyFromDate(toFinancialCivilDate(new Date())) || currentCycle?.active) {
      throw new Error('Escolha um ciclo atual ou futuro sem pagamento já confirmado no contrato anterior.');
    }
    const markCategory = await validateSparkMovementCategory(firestore, transaction, input, input.categoryId, old.recurringType === 'gain' ? 'income' : 'expense');
    markCategory();
    transaction.update(oldRef, { active: false, successorPlanId: input.replacementPlanId, replanOperationId: input.clientActionId,
      revision: old.revision + 1, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    transaction.set(nextRef, { schemaVersion: 1, actorId: input.actorId, recurringType: old.recurringType, name, categoryId: input.categoryId,
      startCycle: input.startCycle, endCycle, historyFromCycle: input.startCycle, valueInCents: material.valueInCents,
      installmentTotal: input.installmentTotal, contractTotalInCents: input.contractTotalInCents, installmentsCompleted: 0, active: true, revision: 0,
      predecessorPlanId: input.planId, replanOriginOperationId: input.clientActionId, lastOperationId: input.clientActionId,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    transaction.set(metaRef, { schemaVersion: 1, actorId: input.actorId, ...input.metadata, revision: 0,
      lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    return { recurringType: old.recurringType, originalContractTotalInCents: old.contractTotalInCents,
      originalInstallmentTotal: old.installmentTotal, originalInstallmentsCompleted: old.installmentsCompleted };
  });
}

/** Desfaz primeiro os pagamentos do sucessor; somente então o contrato anterior pode voltar a operar. */
export async function undoSparkRecurringReplanFirebase(firestore: Firestore, input: SparkRecurringReplanUndoInput) {
  input = { ...input }; [input.planId, input.replacementPlanId, input.replanOperationId].forEach(assertSparkDocumentId);
  const reason = sparkText(input.reason, 2000);
  if (!reason || !revision(input.expectedPlanRevision) || !revision(input.expectedReplacementRevision)) throw new Error('Motivo ou revisões inválidos.');
  const material = { kind: 'recurring_replan_reversal', planId: input.planId, replacementPlanId: input.replacementPlanId,
    replanOperationId: input.replanOperationId, expectedPlanRevision: input.expectedPlanRevision, expectedReplacementRevision: input.expectedReplacementRevision, reason };
  return runSparkOperation(firestore, identity(input), () => material, async transaction => {
    const group = doc(firestore, 'financialGroups', input.groupId), oldRef = doc(group, 'sparkRecurringPlans', input.planId), nextRef = doc(group, 'sparkRecurringPlans', input.replacementPlanId);
    const old = (await transaction.get(oldRef)).data(), next = (await transaction.get(nextRef)).data();
    const original = (await transaction.get(doc(group, 'sparkOperations', input.replanOperationId))).data();
    if (!old || !next || old.actorId !== input.actorId || next.actorId !== input.actorId
      || old.revision !== input.expectedPlanRevision || next.revision !== input.expectedReplacementRevision
      || old.successorPlanId !== input.replacementPlanId || old.replanOperationId !== input.replanOperationId
      || next.predecessorPlanId !== input.planId || next.replanOriginOperationId !== input.replanOperationId
      || original?.kind !== 'recurring_replan' || original.planId !== input.planId || original.replacementPlanId !== input.replacementPlanId
      || next.successorPlanId || next.replanCancelled || next.installmentsCompleted !== 0) {
      throw new Error('Desfaça primeiro os pagamentos e replanejamentos posteriores; atualize as revisões do contrato.');
    }
    transaction.update(oldRef, { active: true, successorPlanId: null, replanOperationId: null, revision: old.revision + 1,
      lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    transaction.update(nextRef, { active: false, replanCancelled: true, revision: next.revision + 1,
      lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
  });
}
