import { doc, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';
import { assertSparkDocumentId, runSparkOperation, sparkText, SPARK_MAX_CENTS, type SparkIdentity } from './sparkFinancialProtocol';
import { readSparkMovementPosition, sparkMovementCurrentEffect, updateSparkMovementPosition, validateSparkMovementCategory } from './SparkMovementFirebase';
import { getMandatoryInstallmentValueInCents, MAX_MANDATORY_INSTALLMENTS } from '../utils/mandatoryInstallments';
import { getCycleKeyFromDate } from '../utils/mandatoryExpenses';
import { toFinancialCivilDate } from '../utils/financialCivilDate';

export type SparkRecurringPlanInput = SparkIdentity & {
  planId: string; recurringType: 'expense' | 'gain'; name: string; categoryId?: string | null;
  startCycle: string; valueInCents: number; installmentTotal?: number | null; contractTotalInCents?: number | null;
};
export type SparkRecurringInput = SparkIdentity & {
  planId: string; cycle: string; expectedPlanRevision: number; effectiveAt: Timestamp;
  note?: string | null; overdraftReason?: string | null;
};
export type SparkRecurringSettlementInput = SparkRecurringInput & { accountId: string; installmentsCount?: number; amountInCents?: number | null;
  settlementMode?: 'negotiated'; lateSettlement?: true };
export type SparkRecurringUndoInput = SparkRecurringInput & { settlementOperationId: string };
export type SparkRecurringPlanUpdateInput = SparkIdentity & {
  planId: string; expectedPlanRevision: number; name: string; categoryId: string | null; valueInCents: number; active: boolean;
};
const identity = (input: SparkIdentity) => ({ groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId });
function cycle(value: string) {
  if (typeof value !== 'string' || !/^(19[7-9]\d|20\d\d|2100)-(0[1-9]|1[0-2])$/.test(value)) throw new Error('Ciclo inválido.');
}
function positive(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > SPARK_MAX_CENTS) throw new Error('Valor deve ser positivo e inteiro em centavos.');
}
function common(input: SparkRecurringInput) {
  assertSparkDocumentId(input.planId); cycle(input.cycle);
  if (!(input.effectiveAt instanceof Timestamp) || input.effectiveAt.seconds < 0 || input.effectiveAt.toMillis() > Date.now()
    || !Number.isSafeInteger(input.expectedPlanRevision) || input.expectedPlanRevision < 0 || input.expectedPlanRevision >= SPARK_MAX_CENTS) throw new Error('Data ou revisão da recorrência inválida.');
  return { planId: input.planId, cycle: input.cycle, expectedPlanRevision: input.expectedPlanRevision, effectiveAt: input.effectiveAt,
    note: sparkText(input.note, 2000), overdraftReason: sparkText(input.overdraftReason, 500) };
}
export async function createSparkRecurringPlanFirebase(firestore: Firestore, input: SparkRecurringPlanInput) {
  input = { ...input }; assertSparkDocumentId(input.planId); cycle(input.startCycle); positive(input.valueInCents);
  if (!['expense', 'gain'].includes(input.recurringType)) throw new Error('Tipo de recorrência inválido.');
  const name = sparkText(input.name, 160); if (!name) throw new Error('Informe o nome da recorrência.');
  const total = input.installmentTotal ?? null, contract = input.contractTotalInCents ?? null;
  if (total !== null && (!Number.isInteger(total) || total < 1 || total > MAX_MANDATORY_INSTALLMENTS)) throw new Error('Quantidade de parcelas inválida.');
  if (total === null ? contract !== null : contract === null) throw new Error('Contrato de parcelamento incompleto.');
  if (contract !== null) { positive(contract); if (Math.floor(contract / total!) !== input.valueInCents) throw new Error('Parcela mensal diverge do contrato.'); }
  const categoryId = input.categoryId ?? null; if (categoryId !== null) assertSparkDocumentId(categoryId);
  const [year, month] = input.startCycle.split('-').map(Number), end = total === null ? null : new Date(Date.UTC(year, month + total - 2, 1));
  const endCycle = end ? `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}` : null;
  if (endCycle) cycle(endCycle);
  const material = { kind: 'recurring_plan_create', planId: input.planId, recurringType: input.recurringType, name, categoryId,
    startCycle: input.startCycle, endCycle, valueInCents: input.valueInCents, installmentTotal: total, contractTotalInCents: contract };
  return runSparkOperation(firestore, identity(input), () => material, async transaction => {
    const ref = doc(firestore, 'financialGroups', input.groupId, 'sparkRecurringPlans', input.planId);
    if ((await transaction.get(ref)).exists()) throw new Error('Identidade da recorrência já cadastrada.');
    const markCategory = await validateSparkMovementCategory(firestore, transaction, input, categoryId, input.recurringType === 'gain' ? 'income' : 'expense');
    const { kind: _, planId: __, ...definition } = material;
    markCategory(); transaction.set(ref, { schemaVersion: 1, actorId: input.actorId, ...definition, historyFromCycle: input.startCycle, active: true, revision: 0, installmentsCompleted: 0,
      lastOperationId: input.clientActionId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

/** Arquivar conserva ciclos e permite desfazer pagamentos; o contrato parcelado permanece imutável. */
export async function updateSparkRecurringPlanFirebase(firestore: Firestore, input: SparkRecurringPlanUpdateInput) {
  input = { ...input }; assertSparkDocumentId(input.planId); positive(input.valueInCents);
  if (input.categoryId !== null) assertSparkDocumentId(input.categoryId);
  const name = sparkText(input.name, 160);
  if (!name || typeof input.active !== 'boolean' || !Number.isSafeInteger(input.expectedPlanRevision) || input.expectedPlanRevision < 0) throw new Error('Definição ou revisão inválida.');
  const material = { kind: 'recurring_plan_update', planId: input.planId, expectedPlanRevision: input.expectedPlanRevision,
    name, categoryId: input.categoryId, valueInCents: input.valueInCents, active: input.active };
  return runSparkOperation(firestore, identity(input), () => material, async transaction => {
    const ref = doc(firestore, 'financialGroups', input.groupId, 'sparkRecurringPlans', input.planId);
    const plan = (await transaction.get(ref)).data();
    if (!plan || plan.actorId !== input.actorId || plan.revision !== input.expectedPlanRevision) throw new Error('Recorrência alterada ou sem permissão.');
    if (plan.successorPlanId || plan.replanCancelled) throw new Error('Este contrato foi substituído. Desfaça o replanejamento para voltar a operá-lo.');
    if (plan.installmentTotal !== null && input.valueInCents !== plan.valueInCents) throw new Error('Valor das parcelas depende do contrato original.');
    const markCategory = await validateSparkMovementCategory(firestore, transaction, input, input.categoryId, plan.recurringType === 'gain' ? 'income' : 'expense');
    markCategory();
    transaction.update(ref, { name, categoryId: input.categoryId, valueInCents: input.valueInCents, active: input.active,
      revision: plan.revision + 1, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
  });
}

/** [[Recorrências Spark]]: ciclo, parcelas, evento e posição são confirmados na mesma transação. */
export async function settleSparkRecurringFirebase(firestore: Firestore, input: SparkRecurringSettlementInput) {
  input = { ...input }; const fields = common(input); assertSparkDocumentId(input.accountId);
  if (getCycleKeyFromDate(toFinancialCivilDate(input.effectiveAt.toDate())) !== input.cycle) throw new Error('Data fora do ciclo escolhido.');
  const quantity = input.installmentsCount ?? 1, requestedAmount = input.amountInCents ?? null;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_MANDATORY_INSTALLMENTS) throw new Error('Quantidade de parcelas inválida.');
  if (requestedAmount !== null) positive(requestedAmount);
  const negotiated = input.settlementMode === 'negotiated';
  if (input.settlementMode !== undefined && !negotiated) throw new Error('Modalidade de quitação inválida.');
  if (negotiated && (requestedAmount === null || !fields.note)) throw new Error('Informe o valor pago e o motivo do acerto das parcelas.');
  if (input.lateSettlement !== undefined && input.lateSettlement !== true) throw new Error('Modalidade de liquidação atrasada inválida.');
  if (input.lateSettlement && !fields.note) throw new Error('Informe o motivo da liquidação após o prazo do contrato.');
  return runSparkOperation(firestore, identity(input), () => ({ kind: 'recurring_settlement', ...fields,
    accountId: input.accountId, installmentsCount: quantity, requestedAmountInCents: requestedAmount,
    ...(negotiated ? { settlementMode: 'negotiated' as const } : {}), ...(input.lateSettlement ? { lateSettlement: true } : {}) }), async (transaction, material) => {
    const group = doc(firestore, 'financialGroups', input.groupId), planRef = doc(group, 'sparkRecurringPlans', input.planId);
    const cycleRef = doc(planRef, 'cycles', input.cycle);
    const plan = (await transaction.get(planRef)).data(), previous = (await transaction.get(cycleRef)).data();
    if (!plan || plan.actorId !== input.actorId || !plan.active) throw new Error('Recorrência indisponível ou de outro proprietário.');
    if (plan.successorPlanId || plan.replanCancelled) throw new Error('Este contrato foi substituído.');
    if (plan.revision !== input.expectedPlanRevision) throw new Error('A recorrência mudou. Atualize a confirmação.');
    const late = plan.installmentTotal !== null && plan.endCycle !== null && input.cycle > plan.endCycle;
    if (input.cycle < plan.startCycle || late !== !!input.lateSettlement) throw new Error('Ciclo fora da vigência; confirme explicitamente a liquidação das parcelas vencidas.');
    if (input.cycle < plan.historyFromCycle) throw new Error('Histórico indisponível para efetivar este ciclo.');
    if (previous?.active) throw new Error('Ciclo já efetivado.');
    const finite = plan.installmentTotal !== null, completed = plan.installmentsCompleted as number;
    if (quantity > (finite ? plan.installmentTotal - completed : 1)) throw new Error('Quantidade excede as parcelas restantes.');
    if (negotiated && (!finite || plan.recurringType !== 'expense')) throw new Error('O acerto de quitação exige uma despesa parcelada.');
    const contractualAmount = finite ? getMandatoryInstallmentValueInCents({ installmentTotal: plan.installmentTotal, installmentsCompleted: completed,
      installmentsToSettle: quantity, installmentValueInCents: plan.valueInCents, installmentTotalValueInCents: plan.contractTotalInCents })!
      : requestedAmount ?? plan.valueInCents;
    const amount = negotiated ? requestedAmount! : contractualAmount;
    positive(amount);
    if (finite && !negotiated && requestedAmount !== null && requestedAmount !== amount) throw new Error('Valor diverge da soma contratual das parcelas.');
    const negotiation = negotiated ? { settlementMode: 'negotiated', contractAmountInCents: contractualAmount } : {};
    const before = await readSparkMovementPosition(firestore, transaction, input.groupId, input.accountId);
    const markCategory = await validateSparkMovementCategory(firestore, transaction, input, plan.categoryId, plan.recurringType === 'gain' ? 'income' : 'expense');
    const delta = plan.recurringType === 'gain' ? amount : -amount;
    const effect = await sparkMovementCurrentEffect(firestore, transaction, input.groupId, input.accountId, input.effectiveAt, delta);
    const afterCompleted = finite ? completed + quantity : 0;
    markCategory(); updateSparkMovementPosition(transaction, input, before, effect, material.overdraftReason);
    transaction.update(planRef, { revision: plan.revision + 1, installmentsCompleted: afterCompleted, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    transaction.set(cycleRef, { schemaVersion: 1, active: true, revision: (previous?.revision ?? -1) + 1, settlementOperationId: input.clientActionId,
      lastOperationId: input.clientActionId, accountId: input.accountId, amountInCents: amount, installmentsCount: quantity,
      installmentsBefore: completed, installmentsAfter: afterCompleted, ...negotiation, ...(late ? { lateSettlement: true } : {}), effectiveAt: input.effectiveAt, updatedAt: serverTimestamp() });
    return { recurringType: plan.recurringType, categoryId: plan.categoryId, amountInCents: amount, differenceInCents: delta,
      currentEffectInCents: effect, expectedRevision: before.revision, previousOperationId: before.lastOperationId,
      installmentsBefore: completed, installmentsAfter: afterCompleted, ...negotiation };
  });
}

export async function undoSparkRecurringFirebase(firestore: Firestore, input: SparkRecurringUndoInput) {
  input = { ...input }; const fields = common(input); assertSparkDocumentId(input.settlementOperationId);
  const group = doc(firestore, 'financialGroups', input.groupId);
  return runSparkOperation(firestore, identity(input), async transaction => {
    const original = (await transaction.get(doc(group, 'sparkOperations', input.settlementOperationId))).data();
    if (!original || !['recurring_settlement', 'imported_recurring_settlement'].includes(original.kind) || original.actorId !== input.actorId
      || original.planId !== input.planId || original.cycle !== input.cycle) throw new Error('Efetivação original incompatível com o ciclo.');
    return { kind: 'recurring_reversal', ...fields, settlementOperationId: input.settlementOperationId,
      accountId: original.accountId as string, amountInCents: original.amountInCents as number, installmentsCount: original.installmentsCount as number,
      differenceInCents: -(original.differenceInCents as number), recurringType: original.recurringType as string };
  }, async (transaction, material) => {
    const planRef = doc(group, 'sparkRecurringPlans', input.planId), cycleRef = doc(planRef, 'cycles', input.cycle);
    const plan = (await transaction.get(planRef)).data(), settled = (await transaction.get(cycleRef)).data();
    if (!plan || plan.actorId !== input.actorId || plan.revision !== input.expectedPlanRevision) throw new Error('Recorrência alterada ou sem permissão.');
    if (plan.successorPlanId || plan.replanCancelled) throw new Error('Desfaça o replanejamento antes de desfazer pagamentos do contrato anterior.');
    if (!settled?.active || settled.settlementOperationId !== input.settlementOperationId) throw new Error('Ciclo já desfeito ou substituído.');
    if (plan.installmentTotal !== null && plan.installmentsCompleted !== settled.installmentsAfter) throw new Error('Desfaça primeiro as parcelas efetivadas depois desta.');
    const before = await readSparkMovementPosition(firestore, transaction, input.groupId, material.accountId);
    const effect = await sparkMovementCurrentEffect(firestore, transaction, input.groupId, material.accountId, input.effectiveAt, material.differenceInCents);
    updateSparkMovementPosition(transaction, input, before, effect, material.overdraftReason);
    transaction.update(planRef, { revision: plan.revision + 1, installmentsCompleted: settled.installmentsBefore,
      lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    transaction.update(cycleRef, { active: false, revision: settled.revision + 1, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    return { expectedRevision: before.revision, previousOperationId: before.lastOperationId, currentEffectInCents: effect,
      installmentsBefore: plan.installmentsCompleted, installmentsAfter: settled.installmentsBefore };
  });
}
