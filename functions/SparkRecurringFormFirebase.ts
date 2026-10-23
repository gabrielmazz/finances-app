import { Timestamp, type Firestore } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { readSparkRecurringPlansFirebase } from './SparkRecurringReadFirebase';
import { createSparkRecurringPlanFirebase, updateSparkRecurringPlanFirebase, settleSparkRecurringFirebase, undoSparkRecurringFirebase,
  type SparkRecurringPlanInput, type SparkRecurringPlanUpdateInput, type SparkRecurringSettlementInput, type SparkRecurringUndoInput } from './SparkRecurringFirebase';
import { saveSparkRecurringMetadataFirebase, type SparkRecurringMetadataInput } from './SparkRecurringMetadataFirebase';
import { sparkFormEffectiveAt } from './SparkMovementFormFirebase';
import { serializeAssistantRecord } from '../utils/assistantRecordFingerprint';
import { getCycleKeyFromDate } from '../utils/mandatoryExpenses';
import { toFinancialCivilDate } from '../utils/financialCivilDate';
import type { SparkRecurringReadModel } from '../utils/sparkRecurringReadModel';
import { validateSparkRecurringMetadata } from '../utils/sparkRecurringMetadata';
import { getMandatoryInstallmentValueInCents } from '../utils/mandatoryInstallments';
import { replanSparkRecurringFirebase, undoSparkRecurringReplanFirebase, type SparkRecurringReplanInput, type SparkRecurringReplanUndoInput } from './SparkRecurringReplanFirebase';

export type SparkRecurringReplanDraft = { actorId: string; plan: SparkRecurringReadModel; reason: string } & (
  { action: 'replan'; installmentTotal: number; contractTotalInCents: number; startCycle: string } | { action: 'undo' }
);
export type SparkRecurringReplanFormState = { intent?: { key: string; action: 'replan' | 'undo';
  input: SparkRecurringReplanInput | SparkRecurringReplanUndoInput; status: 'prepared' | 'uncertain' | 'confirmed' } };

/** A confirmação conserva revisões, IDs e material; a configuração do sucessor faz parte do mesmo commit. */
export async function submitSparkRecurringReplanFormFirebase(firestore: Firestore, state: SparkRecurringReplanFormState,
  draft: SparkRecurringReplanDraft, newId: () => string) {
  draft = { ...draft, plan: { ...draft.plan, metadata: draft.plan.metadata ? { ...draft.plan.metadata } : null } };
  const context = await getSparkContextFirebase(firestore, draft.actorId);
  if (!context) throw new Error('Grupo Spark indisponível.');
  if (draft.plan.actorId !== draft.actorId) throw new Error('Somente o proprietário pode replanejar este contrato.');
  const key = serializeAssistantRecord({ ...draft, groupId: context.groupId });
  if (state.intent?.key !== key) {
    if (state.intent?.status === 'uncertain') throw new Error('Reenvie a mesma confirmação para recuperar o resultado anterior.');
    const common = { groupId: context.groupId, actorId: draft.actorId, clientActionId: newId(), expectedPlanRevision: draft.plan.revision, reason: draft.reason };
    let input: SparkRecurringReplanInput | SparkRecurringReplanUndoInput;
    if (draft.action === 'replan') {
      if (!draft.plan.metadata) throw new Error('Configure o vencimento do contrato antes de renegociar.');
      input = { ...common, planId: draft.plan.id, replacementPlanId: newId(), expectedMetadataRevision: draft.plan.metadataRevision ?? null,
        name: draft.plan.name, categoryId: draft.plan.categoryId, startCycle: draft.startCycle, installmentTotal: draft.installmentTotal,
        contractTotalInCents: draft.contractTotalInCents, metadata: { ...draft.plan.metadata } };
    } else {
      if (!draft.plan.successorPlanId || !draft.plan.replanOperationId) throw new Error('O contrato não possui replanejamento ativo.');
      const next = (await readSparkRecurringPlansFirebase(firestore, draft.actorId, context.groupId, new Date())).find(plan => plan.id === draft.plan.successorPlanId);
      if (!next) throw new Error('Contrato sucessor indisponível.');
      input = { ...common, planId: draft.plan.id, replacementPlanId: next.id, expectedReplacementRevision: next.revision, replanOperationId: draft.plan.replanOperationId };
    }
    state.intent = { key, action: draft.action, input, status: 'prepared' };
  }
  const intent = state.intent!;
  if (intent.status !== 'confirmed') {
    try {
      if (intent.action === 'replan') await replanSparkRecurringFirebase(firestore, intent.input as SparkRecurringReplanInput);
      else await undoSparkRecurringReplanFirebase(firestore, intent.input as SparkRecurringReplanUndoInput);
      intent.status = 'confirmed';
    } catch (error) {
      if ((error as { sparkIntentCancelled?: boolean })?.sparkIntentCancelled) state.intent = undefined;
      else if (['unavailable', 'deadline-exceeded', 'unknown', 'aborted', 'permission-denied', 'unauthenticated'].includes((error as { code?: string })?.code ?? '')) intent.status = 'uncertain';
      throw error;
    }
  }
  return { success: true as const, id: intent.input.replacementPlanId };
}

export type SparkRecurringDraft = {
  actorId: string; recurringType: 'expense' | 'gain'; planId: string | null; name: string; valueInCents: number; tagId: string;
  dueDay: number; usesBusinessDays: boolean; description: string | null; reminderEnabled: boolean; reminderDaysBefore: number;
  reminderOnDueDate: boolean; reminderHour: number; reminderMinute: number; installmentTotal: number | null;
  installmentTotalValueInCents: number | null; installmentsCompleted: number; installmentStartDate: Date | null; installmentEndDate: Date | null;
};
type Definition = { action: 'create'; input: SparkRecurringPlanInput } | { action: 'update'; input: SparkRecurringPlanUpdateInput };
export type SparkRecurringFormState = {
  target?: SparkRecurringReadModel; readerActorId?: string; groupId?: string;
  intent?: { key: string; definition: Definition; metadata: SparkRecurringMetadataInput; status: 'prepared' | 'uncertain' | 'confirmed'; definitionConfirmed: boolean };
};
export type SparkRecurringActionDraft = { actorId: string; planId: string; recurringType: 'expense' | 'gain' } & (
  | { action: 'settle'; selectedDate: Date; accountId: string; amountInCents: number; installmentsCount: number; note: string | null; settlementMode?: 'negotiated' }
  | { action: 'reverse' | 'archive' | 'restore' }
);
export type SparkRecurringActionState = { intent?: { key: string; action: SparkRecurringActionDraft['action'];
  input: SparkRecurringSettlementInput | SparkRecurringUndoInput | SparkRecurringPlanUpdateInput; status: 'prepared' | 'uncertain' | 'confirmed' } };

const civilCycleDate = (cycle: string, end = false) => {
  const [year, month] = cycle.split('-').map(Number);
  // Formulários e calendário consomem campos civis locais, não um instante a converter outra vez.
  return new Date(year, end ? month : month - 1, end ? 0 : 1, 12);
};

/** Projeção de apresentação: o contador vem exclusivamente dos ciclos confirmados. */
export function sparkRecurringFormRecord(plan: SparkRecurringReadModel, now = new Date()): Record<string, any> & { id: string } {
  const cycle = getCycleKeyFromDate(toFinancialCivilDate(now)), completed = plan.cycleStates?.find(state => state.active && state.cycle === cycle);
  const prefix = plan.recurringType === 'expense' ? 'lastPayment' : 'lastReceipt';
  return { id: plan.id, name: plan.name, valueInCents: plan.valueInCents, tagId: plan.categoryId, personId: plan.actorId,
    ...plan.metadata, dueDay: plan.metadata?.dueDay ?? 1, sparkPlan: true, sparkPlanActive: plan.active,
    sparkSuccessorPlanId: plan.successorPlanId ?? null, sparkPredecessorPlanId: plan.predecessorPlanId ?? null, sparkReplanCancelled: plan.replanCancelled ?? false,
    installmentTotal: plan.installmentTotal, installmentTotalValueInCents: plan.contractTotalInCents, installmentsCompleted: plan.installmentsCompleted,
    installmentStartDate: plan.installmentTotal === null ? null : civilCycleDate(plan.startCycle),
    installmentEndDate: plan.endCycle === null ? null : civilCycleDate(plan.endCycle, true),
    hasLinkedPaymentExpense: !!completed, hasLinkedReceiptGain: !!completed,
    [`${prefix}${plan.recurringType === 'expense' ? 'ExpenseId' : 'GainId'}`]: completed?.settlementOperationId ?? null,
    [`${prefix}Cycle`]: completed?.cycle ?? null, [`${prefix}Date`]: completed ? toFinancialCivilDate(completed.effectiveAt) : null,
    [`${prefix}ValueInCents`]: completed?.amountInCents ?? null,
    [`${prefix}InstallmentsCount`]: completed?.installmentsCount ?? null };
}

export async function readSparkRecurringFormRowsFirebase(firestore: Firestore, actorId: string, recurringType: 'expense' | 'gain', now = new Date(), includeInactive = false) {
  const context = await getSparkContextFirebase(firestore, actorId);
  if (!context) return null;
  const plans = await readSparkRecurringPlansFirebase(firestore, actorId, context.groupId, now);
  return plans.filter(plan => plan.recurringType === recurringType && (includeInactive || plan.active)).map(plan => sparkRecurringFormRecord(plan, now));
}

export async function loadSparkRecurringFormFirebase(firestore: Firestore, state: SparkRecurringFormState, actorId: string, planId: string, recurringType: 'expense' | 'gain') {
  const context = await getSparkContextFirebase(firestore, actorId);
  if (!context) return null;
  const target = (await readSparkRecurringPlansFirebase(firestore, actorId, context.groupId, new Date())).find(plan => plan.id === planId);
  if (!target || target.recurringType !== recurringType) throw new Error('Recorrência indisponível.');
  if (state.intent?.status === 'uncertain' || state.intent?.definitionConfirmed && state.intent.status !== 'confirmed') throw new Error('Conclua a confirmação anterior com os mesmos dados.');
  state.target = target; state.readerActorId = actorId; state.groupId = context.groupId;
  return sparkRecurringFormRecord(target);
}

/** Definição e lembretes não alteram dinheiro; uma falha entre as fases retoma os mesmos dois receipts. */
export async function submitSparkRecurringFormFirebase(firestore: Firestore, state: SparkRecurringFormState, draft: SparkRecurringDraft, newId: () => string, now = new Date()) {
  draft = { ...draft, installmentStartDate: draft.installmentStartDate ? new Date(draft.installmentStartDate) : null,
    installmentEndDate: draft.installmentEndDate ? new Date(draft.installmentEndDate) : null }; now = new Date(now);
  const context = await getSparkContextFirebase(firestore, draft.actorId);
  if (!context) {
    if (state.readerActorId === draft.actorId || state.intent?.definition.input.actorId === draft.actorId) throw new Error('O contexto financeiro mudou. Atualize o formulário.');
    return null;
  }
  const metadata = validateSparkRecurringMetadata({ dueDay: draft.dueDay, usesBusinessDays: draft.usesBusinessDays, description: draft.description,
    reminderConfigVersion: 1, reminderEnabled: draft.reminderEnabled, reminderDaysBefore: draft.reminderDaysBefore as 0 | 1 | 2 | 3,
    reminderOnDueDate: draft.reminderOnDueDate, reminderHour: draft.reminderHour, reminderMinute: draft.reminderMinute });
  const key = serializeAssistantRecord({ ...draft, groupId: context.groupId });
  if (state.intent?.key !== key) {
    if (state.intent?.status === 'uncertain' || state.intent?.definitionConfirmed && state.intent.status !== 'confirmed') throw new Error('Reenvie os mesmos dados para concluir o cadastro anterior.');
    const target = state.target;
    if (draft.planId && (!target || target.id !== draft.planId || state.readerActorId !== draft.actorId || state.groupId !== context.groupId)) throw new Error('Carregue a recorrência antes de editar.');
    const startCycle = draft.installmentStartDate ? getCycleKeyFromDate(draft.installmentStartDate) : getCycleKeyFromDate(toFinancialCivilDate(now));
    if (draft.installmentsCompleted !== (target?.installmentsCompleted ?? 0)) throw new Error('Parcelas concluídas precisam dos respectivos pagamentos; o calendário não confirma parcelas.');
    if (target && (draft.installmentTotal !== target.installmentTotal || draft.installmentTotalValueInCents !== target.contractTotalInCents
      || target.installmentTotal !== null && startCycle !== target.startCycle)) throw new Error('Para renegociar o contrato, arquive a definição e cadastre as parcelas restantes. O histórico será preservado.');
    const planId = draft.planId ?? newId(), identity = { actorId: draft.actorId, groupId: context.groupId, clientActionId: newId() };
    const definition: Definition = target ? { action: 'update', input: { ...identity, planId, expectedPlanRevision: target.revision,
      name: draft.name, categoryId: draft.tagId, valueInCents: draft.valueInCents, active: target.active } }
      : { action: 'create', input: { ...identity, planId, recurringType: draft.recurringType, name: draft.name, categoryId: draft.tagId, startCycle,
        valueInCents: draft.valueInCents, installmentTotal: draft.installmentTotal, contractTotalInCents: draft.installmentTotalValueInCents } };
    state.intent = { key, definition, metadata: { ...identity, clientActionId: newId(), planId, expectedMetadataRevision: target?.metadataRevision ?? null, metadata },
      status: 'prepared', definitionConfirmed: false };
  }
  const intent = state.intent!;
  if (intent.status === 'confirmed') return { success: true as const, id: intent.definition.input.planId };
  try {
    if (!intent.definitionConfirmed) {
      if (intent.definition.action === 'create') await createSparkRecurringPlanFirebase(firestore, intent.definition.input);
      else await updateSparkRecurringPlanFirebase(firestore, intent.definition.input);
      intent.definitionConfirmed = true;
    }
    await saveSparkRecurringMetadataFirebase(firestore, intent.metadata);
    intent.status = 'confirmed';
    if (state.target) state.target = { ...state.target, name: intent.definition.input.name, categoryId: intent.definition.input.categoryId ?? null,
      valueInCents: intent.definition.input.valueInCents, revision: state.target.revision + 1, metadata: intent.metadata.metadata,
      metadataRevision: (intent.metadata.expectedMetadataRevision ?? -1) + 1 };
    return { success: true as const, id: intent.definition.input.planId };
  } catch (error) {
    if ((error as { sparkIntentCancelled?: boolean })?.sparkIntentCancelled) {
      if (intent.definitionConfirmed) { intent.metadata = { ...intent.metadata, clientActionId: newId() }; intent.status = 'uncertain'; }
      else state.intent = undefined;
    } else if (intent.definitionConfirmed || ['unavailable', 'deadline-exceeded', 'unknown', 'aborted', 'permission-denied', 'unauthenticated'].includes((error as { code?: string })?.code ?? '')) intent.status = 'uncertain';
    throw error;
  }
}

/** Pagamento/recebimento e estorno têm uma única confirmação financeira, com ciclo e revisão explícitos. */
export async function submitSparkRecurringActionFirebase(firestore: Firestore, state: SparkRecurringActionState, draft: SparkRecurringActionDraft, newId: () => string, now = new Date()) {
  draft = draft.action === 'settle' ? { ...draft, selectedDate: new Date(draft.selectedDate) } : { ...draft }; now = new Date(now);
  const context = await getSparkContextFirebase(firestore, draft.actorId);
  if (!context) { if (state.intent) throw new Error('O contexto financeiro mudou.'); return null; }
  const key = serializeAssistantRecord({ ...draft, groupId: context.groupId });
  if (state.intent?.key !== key) {
    if (state.intent?.status === 'uncertain') throw new Error('Reenvie os mesmos dados para confirmar o resultado anterior.');
    const date = draft.action === 'settle' ? sparkFormEffectiveAt(draft.selectedDate, now).toDate() : now;
    const plan = (await readSparkRecurringPlansFirebase(firestore, draft.actorId, context.groupId, date)).find(plan => plan.id === draft.planId);
    if (!plan || plan.recurringType !== draft.recurringType) throw new Error('Recorrência indisponível.');
    const identity = { actorId: draft.actorId, groupId: context.groupId, clientActionId: newId(), planId: plan.id, expectedPlanRevision: plan.revision };
    let input: NonNullable<SparkRecurringActionState['intent']>['input'];
    if (draft.action === 'settle') {
      if (draft.settlementMode && (plan.recurringType !== 'expense' || plan.installmentTotal === null)) throw new Error('O acerto de quitação exige uma despesa parcelada.');
      const contractualAmount = plan.installmentTotal === null ? null : getMandatoryInstallmentValueInCents({
        installmentTotal: plan.installmentTotal, installmentsCompleted: plan.installmentsCompleted, installmentsToSettle: draft.installmentsCount,
        installmentValueInCents: plan.valueInCents, installmentTotalValueInCents: plan.contractTotalInCents });
      input = { ...identity, cycle: getCycleKeyFromDate(toFinancialCivilDate(date)), accountId: draft.accountId, effectiveAt: Timestamp.fromDate(date),
        amountInCents: draft.amountInCents, installmentsCount: draft.installmentsCount, note: draft.note, overdraftReason: draft.note,
        ...(draft.settlementMode && draft.amountInCents !== contractualAmount ? { settlementMode: draft.settlementMode } : {}),
        ...(plan.endCycle !== null && getCycleKeyFromDate(toFinancialCivilDate(date)) > plan.endCycle
          ? { lateSettlement: true as const, note: draft.note?.trim() || 'Liquidação das parcelas pendentes após o prazo original' } : {}) };
    } else if (draft.action === 'reverse') {
      const current = plan.cycleStates?.find(cycle => cycle.active && cycle.cycle === getCycleKeyFromDate(toFinancialCivilDate(now)));
      if (!current) throw new Error('Não existe efetivação ativa neste ciclo.');
      input = { ...identity, cycle: current.cycle, settlementOperationId: current.settlementOperationId, effectiveAt: Timestamp.fromDate(current.effectiveAt),
        note: 'Desfazimento do ciclo', overdraftReason: 'Desfazimento da efetivação original' };
    } else input = { ...identity, name: plan.name, categoryId: plan.categoryId, valueInCents: plan.valueInCents, active: draft.action === 'restore' };
    state.intent = { key, action: draft.action, input, status: 'prepared' };
  }
  const intent = state.intent!;
  if (intent.status === 'confirmed') return { success: true as const, id: intent.input.clientActionId };
  try {
    if (intent.action === 'settle') await settleSparkRecurringFirebase(firestore, intent.input as SparkRecurringSettlementInput);
    else if (intent.action === 'reverse') await undoSparkRecurringFirebase(firestore, intent.input as SparkRecurringUndoInput);
    else await updateSparkRecurringPlanFirebase(firestore, intent.input as SparkRecurringPlanUpdateInput);
    intent.status = 'confirmed'; return { success: true as const, id: intent.input.clientActionId };
  } catch (error) {
    if ((error as { sparkIntentCancelled?: boolean })?.sparkIntentCancelled) state.intent = undefined;
    else if (['unavailable', 'deadline-exceeded', 'unknown', 'aborted', 'permission-denied', 'unauthenticated'].includes((error as { code?: string })?.code ?? '')) intent.status = 'uncertain';
    throw error;
  }
}
