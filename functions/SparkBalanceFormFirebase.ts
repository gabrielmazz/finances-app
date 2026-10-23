import { getAuth } from 'firebase/auth';
import { doc, getDocFromServer, Timestamp, type Firestore } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { prepareSparkHistoryProofFirebase, isSparkProofMovementIncluded, compareSparkTime, SparkPreparationError, type SparkHistoryProof, type SparkPreparationOptions } from './SparkHistoryFirebase';
import { readCurrentSparkPositionFirebase, refreshSparkMonthlyOpeningFirebase } from './SparkMonthlyActivationFirebase';
import { readSparkMonthlyOpeningFirebase } from './SparkAccountReadFirebase';
import { countSparkAccountFirebase, reverseSparkBalanceAdjustmentFirebase, type SparkCountInput, type SparkAdjustmentReversalInput } from './SparkBalanceFirebase';
import { saveSparkTemporalBalanceFirebase, type SparkTemporalBalanceInput } from './SparkTemporalBalanceFirebase';
import { replaceSparkBalanceAdjustmentFirebase, type SparkAdjustmentReplacementInput } from './SparkAdjustmentReplacementFirebase';
import { assertSparkDocumentId, SPARK_MAX_CENTS, sparkText } from './sparkFinancialProtocol';
import { toFinancialCivilDate } from '../utils/financialCivilDate';

export type SparkBalanceSelection = { actorId: string; accountId: string; mode: 'monthly' | 'adjustment'; date: string; adjustmentId?: string };
export type SparkBalanceDraft = SparkBalanceSelection & { targetBalanceInCents: number; note: string | null };
type Preview = SparkBalanceSelection & { key: string; groupId: string; clientActionId: string; effectiveAt: Timestamp;
  commit: boolean; revision: number; openingId: string | null; base: number | null; currentBalance: number; previousCurrentEffect?: number; proof?: SparkHistoryProof };
export type SparkBalanceFormState = { activation?: { key: string; clientActionId: string }; preview?: Preview; intent?: { key: string; command: SparkCountInput | SparkTemporalBalanceInput | SparkAdjustmentReplacementInput; status: 'prepared' | 'uncertain' | 'confirmed' } };
export const sparkBalanceDraftKey = (draft: SparkBalanceDraft) => JSON.stringify([draft.actorId, draft.accountId, draft.mode, draft.date, draft.adjustmentId ?? null, draft.targetBalanceInCents, draft.note?.trim() || null]);
const today = () => { const value = toFinancialCivilDate(new Date()); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; };
const selectionKey = (selection: SparkBalanceSelection) => JSON.stringify([selection.actorId, selection.accountId, selection.mode, selection.date, selection.adjustmentId ?? null]);
const assertSession = (firestore: Firestore, actorId: string) => { if (getAuth(firestore.app).currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.'); };

/** [[Balanço Mensal]] / [[Ajuste de Saldo]]: somente a projeção completa da revisão apresentada pode confirmar. */
export async function prepareSparkBalanceFormFirebase(firestore: Firestore, state: SparkBalanceFormState, selection: SparkBalanceSelection, newId: () => string,
  options?: SparkPreparationOptions, maxPages = 20) {
  selection = { ...selection };
  const context = await getSparkContextFirebase(firestore, selection.actorId);
  if (!context) {
    if (state.activation || state.preview || state.intent) throw new Error('O contexto financeiro mudou. Reabra o formulário.');
    return null;
  }
  if (context.role !== 'admin') throw new Error('A conferência de saldo exige administrador do grupo.');
  assertSparkDocumentId(selection.accountId);
  if (!['monthly', 'adjustment'].includes(selection.mode) || !/^((19[7-9]\d|20\d\d|2100)-(0[1-9]|1[0-2]))(?:-(0[1-9]|[12]\d|3[01]))?$/.test(selection.date)
    || (selection.mode === 'monthly' ? selection.date.length !== 7 || !!selection.adjustmentId : selection.date.length !== 10 || selection.date > today())) throw new Error('Data ou ciclo inválido.');
  const key = selectionKey(selection);
  if (state.intent?.status === 'uncertain') {
    if (state.preview?.key !== key || state.preview.groupId !== context.groupId) throw new Error('Reenvie os mesmos dados para confirmar o resultado anterior.');
    return state.preview;
  }
  if (state.preview?.key !== key || state.preview.groupId !== context.groupId || state.intent?.status === 'confirmed') {
    if (selection.mode === 'monthly') {
      const stored = (await getDocFromServer(doc(firestore, 'financialGroups', context.groupId, 'sparkPositions', selection.accountId))).data();
      if (stored?.nextActivationAt instanceof Timestamp && stored.nextActivationAt.toMillis() <= Date.now()) {
        const activationKey = JSON.stringify([context.groupId, key]);
        if (state.activation?.key !== activationKey) state.activation = { key: activationKey, clientActionId: newId() };
        const activation = await refreshSparkMonthlyOpeningFirebase(firestore, { actorId: selection.actorId, groupId: context.groupId, accountId: selection.accountId, clientActionId: state.activation.clientActionId }, maxPages, options);
        if (activation.status !== 'current') throw new SparkPreparationError('paused', `Atualização mensal em preparação: ${activation.proof.workRevision} etapas. Continue para retomar.`);
        state.activation = undefined;
      }
    }
    const position = await readCurrentSparkPositionFirebase(firestore, { actorId: selection.actorId, groupId: context.groupId, accountId: selection.accountId });
    if (position.kind !== 'bank' || !position.active) throw new Error('Selecione um banco ativo.');
    const cycle = selection.date.slice(0, 7);
    const month = (await getDocFromServer(doc(firestore, 'sparkCivilMonths', cycle))).data();
    const commit = selection.mode === 'adjustment' && selection.date === today() && !selection.adjustmentId;
    let effectiveAt = selection.mode === 'monthly' ? month?.startAt : month?.dayEnds?.[Number(selection.date.slice(8)) - 1];
    if (selection.mode === 'adjustment' && selection.date === today()) {
      const stored = (await getDocFromServer(doc(firestore, 'financialGroups', context.groupId, 'sparkPositions', selection.accountId))).data();
      const day = Number(selection.date.slice(8)), previousEnd = month?.dayEnds?.[day - 2];
      const dayStart = day === 1 ? month?.startAt : previousEnd instanceof Timestamp ? Timestamp.fromMillis(previousEnd.toMillis() + 1) : null;
      if (!(stored?.updatedAt instanceof Timestamp) || !(dayStart instanceof Timestamp) || stored.revision !== position.revision) throw new Error('O saldo mudou. Atualize a prévia.');
      // A revisão fixa a cadeia completa: usar o último commit conhecido ou o início civil
      // cobre o saldo de hoje sem transformar relógio do navegador em instante futuro.
      effectiveAt = compareSparkTime(stored.updatedAt, dayStart) >= 0 ? stored.updatedAt : dayStart;
    }
    if (!(effectiveAt instanceof Timestamp) || (selection.mode === 'adjustment' && selection.date !== today() && today().slice(0, 7) === cycle && effectiveAt.toMillis() > Date.now())) throw new Error('Calendário civil indisponível.');
    if (selection.mode === 'adjustment' && selection.date !== today()) {
      const actual = toFinancialCivilDate(effectiveAt.toDate());
      if (`${actual.getFullYear()}-${String(actual.getMonth() + 1).padStart(2, '0')}-${String(actual.getDate()).padStart(2, '0')}` !== selection.date) throw new Error('Dia inválido no calendário.');
    }
    const opening = selection.mode === 'monthly' ? await readSparkMonthlyOpeningFirebase(firestore, selection.actorId, context.groupId, selection.accountId, cycle) : null;
    assertSession(firestore, selection.actorId);
    state.preview = { ...selection, key, groupId: context.groupId, clientActionId: newId(), effectiveAt, commit,
      revision: position.revision, openingId: opening?.operationId ?? null, base: commit ? position.balanceInCents : null, currentBalance: position.balanceInCents };
    state.intent = undefined;
  }
  const preview = state.preview!;
  if (!preview.commit) {
    const proof = await prepareSparkHistoryProofFirebase(firestore, { actorId: selection.actorId, groupId: context.groupId, accountId: selection.accountId,
      clientActionId: preview.clientActionId, asOf: preview.effectiveAt, purpose: selection.mode === 'monthly' ? 'monthly' : 'instant' }, maxPages, options);
    preview.proof = proof; preview.revision = proof.headRevision; preview.base = proof.phase === 'done' ? proof.balanceInCents : null;
    if (preview.base !== null && selection.adjustmentId) {
      const original = await readSparkAdjustmentFormFirebase(firestore, selection.actorId, selection.adjustmentId);
      if (!original || original.bankId !== selection.accountId) throw new Error('O banco do ajuste deve ser mantido.');
      if (isSparkProofMovementIncluded(proof, original.effectiveAt)) preview.base -= original.differenceInCents;
      const reference = (await getDocFromServer(doc(firestore, 'financialGroups', context.groupId, 'sparkCheckpoints', selection.accountId))).data();
      const comparison = reference?.effectiveAt instanceof Timestamp ? compareSparkTime(reference.effectiveAt, original.effectiveAt) : -1;
      preview.previousCurrentEffect = comparison > 0 || comparison === 0 && reference?.includesBoundary !== true ? 0 : original.differenceInCents;
    }
  }
  assertSession(firestore, selection.actorId);
  return preview;
}

export async function submitSparkBalanceFormFirebase(firestore: Firestore, state: SparkBalanceFormState, draft: SparkBalanceDraft) {
  draft = { ...draft };
  const context = await getSparkContextFirebase(firestore, draft.actorId), preview = state.preview;
  if (!context || !preview || context.groupId !== preview.groupId || preview.key !== selectionKey(draft) || preview.base === null) throw new Error('Prepare a prévia completa antes de confirmar.');
  if (context.role !== 'admin') throw new Error('A conferência de saldo exige administrador do grupo.');
  if (!Number.isSafeInteger(draft.targetBalanceInCents) || Math.abs(draft.targetBalanceInCents) > SPARK_MAX_CENTS) throw new Error('Informe um saldo válido em centavos.');
  const note = sparkText(draft.note, 2000), key = sparkBalanceDraftKey({ ...draft, note });
  if (draft.targetBalanceInCents < 0 && (!note || note.length < 3 || note.length > 500)) throw new Error('Justifique o saldo negativo com 3 a 500 caracteres.');
  if (state.intent && state.intent.key !== key) throw new Error('Reenvie os mesmos dados antes de alterar esta operação.');
  if (!state.intent) {
    const covered = preview.proof?.latestCheckpointAt && compareSparkTime(preview.proof.latestCheckpointAt, preview.effectiveAt) > 0;
    const projected = preview.commit ? draft.targetBalanceInCents : draft.mode === 'monthly'
      ? preview.effectiveAt.toMillis() > Date.now() || covered ? preview.currentBalance : draft.targetBalanceInCents + preview.proof!.tailDeltaInCents
      : preview.currentBalance - (preview.previousCurrentEffect ?? 0) + (covered ? 0 : draft.targetBalanceInCents - preview.base);
    const needsReason = draft.targetBalanceInCents < 0 || projected < 0;
    if (needsReason && (!note || note.length < 3 || note.length > 500)) throw new Error('Justifique o saldo negativo resultante com 3 a 500 caracteres.');
    const identity = { actorId: draft.actorId, groupId: context.groupId, clientActionId: preview.clientActionId, accountId: draft.accountId,
      expectedRevision: preview.revision, targetBalanceInCents: draft.targetBalanceInCents, note, overdraftReason: needsReason ? note : null };
    state.intent = { key, status: 'prepared', command: preview.commit ? { ...identity, kind: 'balance_adjustment' }
      : draft.adjustmentId ? { ...identity, originalOperationId: draft.adjustmentId, effectiveAt: preview.effectiveAt }
      : { ...identity, kind: draft.mode === 'monthly' ? 'monthly_opening' : 'dated_adjustment', effectiveAt: preview.effectiveAt,
        ...(draft.mode === 'monthly' ? { cycle: draft.date, expectedOpeningOperationId: preview.openingId } : {}) } };
  }
  const intent = state.intent;
  if (intent.status !== 'confirmed') {
    try {
      if (draft.mode === 'adjustment' && draft.date !== today() && preview.commit
        && !(await getDocFromServer(doc(firestore, 'financialGroups', context.groupId, 'sparkOperations', intent.command.clientActionId))).exists()) throw new Error('O dia mudou. Confira o envio anterior no extrato antes de continuar.');
      if ('originalOperationId' in intent.command) await replaceSparkBalanceAdjustmentFirebase(firestore, intent.command);
      else if ('effectiveAt' in intent.command) await saveSparkTemporalBalanceFirebase(firestore, intent.command);
      else await countSparkAccountFirebase(firestore, intent.command);
      intent.status = 'confirmed';
    } catch (error) {
      if ((error as { sparkIntentCancelled?: boolean })?.sparkIntentCancelled) { state.intent = undefined; state.preview = undefined; }
      else if (['unavailable', 'deadline-exceeded', 'unknown', 'aborted', 'permission-denied', 'unauthenticated'].includes((error as { code?: string })?.code ?? '')) intent.status = 'uncertain';
      else state.intent = undefined;
      throw error;
    }
  }
  assertSession(firestore, draft.actorId);
  return { id: preview.clientActionId };
}

export async function readSparkAdjustmentFormFirebase(firestore: Firestore, actorId: string, operationId: string) {
  const context = await getSparkContextFirebase(firestore, actorId);
  if (!context) return null;
  assertSparkDocumentId(operationId);
  const group = doc(firestore, 'financialGroups', context.groupId);
  const [snapshot, claim] = await Promise.all([getDocFromServer(doc(group, 'sparkOperations', operationId)), getDocFromServer(doc(group, 'sparkAdjustmentReversals', operationId))]);
  const data = snapshot.data(); assertSession(firestore, actorId);
  if (!data || !['balance_adjustment', 'dated_adjustment', 'adjustment_replacement'].includes(data.kind) || context.role !== 'admin' || data.actorId !== actorId || claim.exists()) throw new Error('Este ajuste não está disponível para edição ou estorno.');
  return { id: operationId, bankId: data.accountId as string, personId: actorId, date: (data.effectiveAt ?? data.createdAt).toDate() as Date,
    effectiveAt: (data.effectiveAt ?? data.createdAt) as Timestamp, differenceInCents: data.differenceInCents as number,
    previousBalanceInCents: data.previousBalanceInCents as number, targetBalanceInCents: data.targetBalanceInCents as number,
    description: data.note as string | null, status: 'active' as const, reversesAdjustmentId: null, groupId: context.groupId };
}

export async function prepareSparkAdjustmentReversalFormFirebase(firestore: Firestore, actorId: string, operationId: string, newId: () => string): Promise<SparkAdjustmentReversalInput> {
  const record = await readSparkAdjustmentFormFirebase(firestore, actorId, operationId);
  if (!record) throw new Error('Selecione um ajuste Spark.');
  return { actorId, groupId: record.groupId, clientActionId: newId(), originalOperationId: operationId, note: null, overdraftReason: null };
}
export async function executeSparkAdjustmentReversalFormFirebase(firestore: Firestore, command: SparkAdjustmentReversalInput) {
  const context = await getSparkContextFirebase(firestore, command.actorId);
  if (!context || context.groupId !== command.groupId) throw new Error('O acesso financeiro mudou.');
  return reverseSparkBalanceAdjustmentFirebase(firestore, { ...command });
}
