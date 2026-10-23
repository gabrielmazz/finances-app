import { doc, getDocFromServer, type Firestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { sparkFormEffectiveAt } from './SparkMovementFormFirebase';
import { reverseSparkTransferFirebase, transferSparkFundsFirebase, transferSparkDatedFundsFirebase, type SparkReversalInput, type SparkDatedTransferInput, type SparkTransferInput } from './SparkTransferFirebase';
import { toFinancialCivilDate } from '../utils/financialCivilDate';
import type { SparkExecutionReference } from '../utils/sparkFinancialReadModel';
import { serializeAssistantRecord } from '../utils/assistantRecordFingerprint';
import { assertSparkDocumentId, sparkText } from './sparkFinancialProtocol';

export type SparkPairFormDraft = {
  actorId: string; mode: 'transfer' | 'withdrawal'; fromAccountId: string; toAccountId?: string;
  amountInCents: number; selectedDate: Date; note: string | null; overdraftReason?: string | null;
};
export type SparkPairFormState = {
  intent?: { key: string; command: SparkTransferInput | SparkDatedTransferInput; selectedDay: string; status: 'prepared' | 'uncertain' | 'confirmed' };
};
const civilDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** [[Movimentos Datados em Par Spark]]: false é somente legado confirmado; retries preservam o par e sua data. */
export async function submitSparkPairFormFirebase(firestore: Firestore, state: SparkPairFormState, draft: SparkPairFormDraft, newId: () => string, now = new Date()) {
  draft = { ...draft, selectedDate: new Date(draft.selectedDate) }; now = new Date(now);
  const context = await getSparkContextFirebase(firestore, draft.actorId);
  if (!context) {
    if (state.intent) throw new Error('O contexto financeiro mudou. Reabra o formulário.');
    return false;
  }
  if (!['transfer', 'withdrawal'].includes(draft.mode) || !draft.fromAccountId || draft.fromAccountId === 'cash'
    || draft.mode === 'transfer' && (!draft.toAccountId || draft.toAccountId === 'cash')
    || draft.mode === 'withdrawal' && draft.toAccountId !== undefined && draft.toAccountId !== 'cash') throw new Error('Selecione as contas bancárias corretas para esta operação.');
  const toAccountId = draft.mode === 'withdrawal' ? 'cash' : draft.toAccountId!;
  if (!Number.isFinite(draft.selectedDate.getTime()) || !Number.isFinite(now.getTime())) throw new Error('Data inválida.');
  const selectedDay = civilDay(draft.selectedDate), today = civilDay(toFinancialCivilDate(now));
  if (selectedDay > today) throw new Error('A data não pode ser futura.');
  const note = sparkText(draft.note, 2000), overdraftReason = sparkText(draft.overdraftReason, 500);
  if (draft.mode === 'transfer' && overdraftReason) throw new Error('A transferência deste formulário exige saldo suficiente.');
  const key = serializeAssistantRecord({ actorId: draft.actorId, groupId: context.groupId, mode: draft.mode,
    fromAccountId: draft.fromAccountId, toAccountId, amountInCents: draft.amountInCents, note, overdraftReason,
    selectedDate: [draft.selectedDate.getFullYear(), draft.selectedDate.getMonth(), draft.selectedDate.getDate()] });
  if (state.intent?.key !== key) {
    if (state.intent?.status === 'uncertain') throw new Error('O resultado anterior ainda precisa ser confirmado. Reenvie os mesmos dados antes de alterar esta operação.');
    // Hoje usa o commit autoritativo, evitando rejeitar um relógio do navegador adiantado.
    // Retroativos conservam a data explícita; o modo original também é mantido no retry.
    state.intent = { key, status: 'prepared', selectedDay, command: { actorId: draft.actorId, groupId: context.groupId, clientActionId: newId(),
      kind: 'transfer', fromAccountId: draft.fromAccountId, toAccountId, amountInCents: draft.amountInCents, note, overdraftReason,
      ...(selectedDay === today ? {} : { effectiveAt: sparkFormEffectiveAt(draft.selectedDate, now) }) } };
  }
  const intent = state.intent!;
  if (intent.status === 'confirmed') return true;
  try {
    if ('effectiveAt' in intent.command) await transferSparkDatedFundsFirebase(firestore, intent.command);
    else {
      if (intent.selectedDay !== today && !(await getDocFromServer(doc(firestore, 'financialGroups', context.groupId, 'sparkOperations', intent.command.clientActionId))).exists()) {
        throw new Error('O dia mudou sem confirmação do envio anterior. Confira o extrato antes de iniciar outra operação.');
      }
      await transferSparkFundsFirebase(firestore, intent.command);
    }
    intent.status = 'confirmed'; return true;
  } catch (error) {
    if ((error as { sparkIntentCancelled?: boolean })?.sparkIntentCancelled) state.intent = undefined;
    else if (['unavailable', 'deadline-exceeded', 'unknown', 'aborted', 'permission-denied', 'unauthenticated'].includes((error as { code?: string })?.code ?? '')) intent.status = 'uncertain';
    throw error;
  }
}

export type SparkPairReversalCommand = SparkReversalInput;

/** Estorno do par completo; abertura, principal e avaliações nunca recebem esta referência. */
export async function prepareSparkPairReversalFirebase(firestore: Firestore, actorId: string, reference: SparkExecutionReference, clientActionId: string): Promise<SparkPairReversalCommand> {
  reference = { ...reference };
  if (reference.family !== 'pair' || !['live', 'imported'].includes(reference.source)) throw new Error('Este par exige seu fluxo específico de reconciliação.');
  assertSparkDocumentId(reference.operationId);
  const context = await getSparkContextFirebase(firestore, actorId);
  if (!context) throw new Error('Grupo Spark indisponível.');
  const group = doc(firestore, 'financialGroups', context.groupId);
  const imported = reference.source === 'imported';
  const [original, claim] = await Promise.all([getDocFromServer(doc(group, imported ? 'sparkImportedIdentities' : 'sparkOperations', reference.operationId)),
    getDocFromServer(doc(group, imported ? 'sparkImportedClaims' : 'sparkReversals', reference.operationId))]);
  if (getAuth(firestore.app).currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.');
  if (!['transfer', 'investment_deposit', 'investment_redemption'].includes(original.data()?.kind)
    || imported && original.data()?.pairResolutionAllowed !== true || claim.exists()) throw new Error('Este par não está disponível para estorno.');
  if (context.role !== 'admin' && original.data()?.actorId !== actorId) throw new Error('Você só pode estornar suas próprias operações.');
  return { groupId: context.groupId, actorId, clientActionId, originalOperationId: reference.operationId, originalSource: reference.source, note: null, overdraftReason: null };
}

export async function executeSparkPairReversalFirebase(firestore: Firestore, command: SparkPairReversalCommand) {
  command = { ...command };
  const context = await getSparkContextFirebase(firestore, command.actorId);
  if (!context || context.groupId !== command.groupId || !['live', 'imported'].includes(command.originalSource ?? '')) throw new Error('O acesso financeiro mudou.');
  const imported = command.originalSource === 'imported';
  const original = (await getDocFromServer(doc(firestore, 'financialGroups', command.groupId, imported ? 'sparkImportedIdentities' : 'sparkOperations', command.originalOperationId))).data();
  if (!['transfer', 'investment_deposit', 'investment_redemption'].includes(original?.kind)
    || imported && original?.pairResolutionAllowed !== true) throw new Error('Use o fluxo específico desta operação.');
  return reverseSparkTransferFirebase(firestore, command);
}
