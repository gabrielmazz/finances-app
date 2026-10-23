import { Timestamp, type Firestore } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { executeSparkMovementCommandFirebase, type SparkMovementCommand } from './SparkMovementCommandFirebase';
import { readSparkOrdinaryForEditFirebase, type SparkEditableMovement } from './SparkOrdinaryReadFirebase';
import { fromFinancialCivilDate, toFinancialCivilDate } from '../utils/financialCivilDate';
import { serializeAssistantRecord } from '../utils/assistantRecordFingerprint';
import { validateSparkMovementDetails, type SparkMovementDetails } from '../utils/sparkMovementDetails';
import type { SparkExecutionReference } from '../utils/sparkFinancialReadModel';

export type SparkMovementFormDraft = {
  actorId: string; movementKind: 'income' | 'expense'; name: string; amountInCents: number; selectedDate: Date;
  bankId: string | null; moneyFormat: boolean; categoryId: string | null; explanation: string | null; paymentFormats?: string[];
  editingReference?: SparkExecutionReference | null; isEditing: boolean; specialSource: boolean;
};
export type SparkMovementFormState = {
  target?: SparkEditableMovement;
  entryReference?: SparkExecutionReference;
  intent?: { key: string; command: SparkMovementCommand; status: 'prepared' | 'uncertain' | 'confirmed' };
};
/** Novo clique após sucesso confirmado é outra intenção; falha/incerteza nunca libera um novo ID. */
export function beginNextSparkMovementFormIntent(state: SparkMovementFormState): SparkMovementFormState {
  return state.intent?.status === 'confirmed' ? { ...state, intent: { ...state.intent, key: '' } } : state;
}
const sameReference = (left?: SparkExecutionReference | null, right?: SparkExecutionReference | null) => !!left && !!right
  && left.source === right.source && left.operationId === right.operationId && left.family === right.family;

export async function prepareSparkMovementReversalFirebase(firestore: Firestore, actorId: string, reference: SparkExecutionReference, clientActionId: string): Promise<SparkMovementCommand> {
  reference = { ...reference };
  const context = await getSparkContextFirebase(firestore, actorId);
  if (!context) throw new Error('Grupo Spark indisponível.');
  const target = await readSparkOrdinaryForEditFirebase(firestore, actorId, context.groupId, reference);
  return { groupId: context.groupId, actorId, clientActionId, movementKind: target.movementKind, action: 'reverse',
    target: reference, expectedFingerprint: target.expectedFingerprint, effectiveAt: Timestamp.now(), note: null, overdraftReason: null };
}

/** A data escolhida é civil de São Paulo; edição no mesmo dia conserva o Timestamp original completo. */
export function sparkFormEffectiveAt(selectedDate: Date, now: Date, original?: Timestamp) {
  if (!(selectedDate instanceof Date) || !Number.isFinite(selectedDate.getTime()) || !Number.isFinite(now.getTime())) throw new Error('Data inválida.');
  const day = [selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()];
  if (original) {
    const civil = toFinancialCivilDate(original.toDate());
    if (day[0] === civil.getFullYear() && day[1] === civil.getMonth() && day[2] === civil.getDate()) return original;
  }
  const clock = toFinancialCivilDate(now);
  return Timestamp.fromDate(fromFinancialCivilDate(new Date(day[0], day[1], day[2], clock.getHours(), clock.getMinutes(), clock.getSeconds(), clock.getMilliseconds())));
}

/** [[Integração Financeira Spark]]: false autoriza somente o legado realmente confirmado pelo contexto. */
export async function submitSparkMovementFormFirebase(firestore: Firestore, state: SparkMovementFormState, draft: SparkMovementFormDraft, newId: () => string, now = new Date()): Promise<boolean> {
  draft = { ...draft, paymentFormats: [...(draft.paymentFormats ?? (draft.isEditing ? state.target?.details.paymentFormats : undefined) ?? [])],
    selectedDate: new Date(draft.selectedDate), editingReference: draft.editingReference ? { ...draft.editingReference } : null };
  now = new Date(now);
  const context = await getSparkContextFirebase(firestore, draft.actorId);
  if (!context) {
    if (state.target?.readerActorId === draft.actorId || state.intent?.command.actorId === draft.actorId) throw new Error('O contexto financeiro mudou. Atualize o formulário.');
    return false;
  }
  if (draft.specialSource) throw new Error('Este lançamento exige o fluxo próprio de recorrência ou investimento. Nenhum valor foi registrado.');
  const details: SparkMovementDetails = validateSparkMovementDetails({ name: draft.name, explanation: draft.explanation, paymentFormats: draft.paymentFormats!, moneyFormat: draft.moneyFormat });
  const key = serializeAssistantRecord({ ...draft, name: details.name, explanation: details.explanation, paymentFormats: details.paymentFormats,
    selectedDate: [draft.selectedDate.getFullYear(), draft.selectedDate.getMonth(), draft.selectedDate.getDate()], groupId: context.groupId });
  if (state.intent?.key !== key) {
    if (state.intent?.status === 'uncertain') throw new Error('O resultado anterior ainda precisa ser confirmado. Reenvie os mesmos dados antes de alterar este lançamento.');
    let target = state.target;
    if (draft.isEditing) {
      if (!sameReference(draft.editingReference, state.entryReference) || !target || target.readerActorId !== draft.actorId || target.groupId !== context.groupId
        || target.movementKind !== draft.movementKind) throw new Error('Carregue novamente o lançamento antes de editar.');
      if (state.intent?.status === 'confirmed') target = await readSparkOrdinaryForEditFirebase(firestore, draft.actorId, context.groupId,
        { source: 'live', operationId: state.intent.command.clientActionId, family: 'ordinary' });
    }
    if (!draft.moneyFormat && (!draft.bankId || draft.bankId === 'cash')) throw new Error('Selecione um banco.');
    const common = { groupId: context.groupId, actorId: draft.actorId, clientActionId: newId(), movementKind: draft.movementKind,
      effectiveAt: sparkFormEffectiveAt(draft.selectedDate, now, draft.isEditing ? target!.effectiveAt : undefined),
      accountId: draft.moneyFormat ? 'cash' : draft.bankId!, amountInCents: draft.amountInCents, categoryId: draft.categoryId,
      note: details.explanation, details };
    const command: SparkMovementCommand = draft.isEditing ? { ...common, action: 'correct', target: target!.reference, expectedFingerprint: target!.expectedFingerprint }
      : { ...common, action: 'create' };
    state.intent = { key, command, status: 'prepared' };
  }
  const intent = state.intent!;
  if (intent.status === 'confirmed') return true;
  try {
    await executeSparkMovementCommandFirebase(firestore, intent.command);
    intent.status = 'confirmed'; return true;
  } catch (error) {
    if ((error as { sparkIntentCancelled?: boolean })?.sparkIntentCancelled) state.intent = undefined;
    else if (['unavailable', 'deadline-exceeded', 'unknown', 'aborted', 'permission-denied', 'unauthenticated'].includes((error as { code?: string })?.code ?? '')) intent.status = 'uncertain';
    throw error;
  }
}
