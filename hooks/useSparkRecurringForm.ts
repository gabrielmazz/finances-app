import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { auth, db } from '@/FirebaseConfig';
import { getSparkContextFirebase } from '@/functions/SparkContextFirebase';
import { createFinancialClientActionId } from '@/functions/FinancialLedgerFirebase';
import { loadSparkRecurringFormFirebase, submitSparkRecurringFormFirebase, submitSparkRecurringActionFirebase,
  type SparkRecurringDraft, type SparkRecurringFormState, type SparkRecurringActionDraft, type SparkRecurringActionState } from '@/functions/SparkRecurringFormFirebase';

export function useSparkRecurringForm(recurringType: 'expense' | 'gain', formScope?: string) {
  const { user } = useAuth(), actorId = user?.uid;
  const scope = JSON.stringify([actorId, recurringType, formScope]);
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const state = useRef<SparkRecurringFormState>({}), queryClient = useQueryClient(), sequence = useRef(0);
  const [mode, setMode] = useState<{ scope: string; value: boolean | null }>({ scope, value: null });
  const [isUncertain, setIsUncertain] = useState(false);
  const initialize = useCallback(async () => {
    if (!actorId || auth.currentUser?.uid !== actorId) throw new Error('Entre novamente para cadastrar a recorrência.');
    const context = await getSparkContextFirebase(db, actorId);
    if (scopeRef.current !== scope || auth.currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.');
    if (context) { state.current.readerActorId = actorId; state.current.groupId = context.groupId; }
    setMode({ scope, value: !!context });
    return !!context;
  }, [actorId, scope]);
  useEffect(() => {
    scopeRef.current = scope; sequence.current += 1; state.current = {}; setIsUncertain(false); setMode({ scope, value: null });
    // Formulários gerenciados aguardam initialize/load na entrada; mantém compatibilidade com os demais.
    if (formScope === undefined && actorId) void initialize().catch(() => {});
    return () => { sequence.current += 1; scopeRef.current = ''; };
  }, [scope, initialize, actorId, formScope]);
  const reset = useCallback(() => {
    sequence.current += 1;
    const current = state.current;
    if ((!current.intent?.definitionConfirmed && current.intent?.status !== 'uncertain') || current.intent?.status === 'confirmed') {
      state.current = { readerActorId: current.readerActorId, groupId: current.groupId }; setIsUncertain(false);
    }
  }, []);
  const load = useCallback(async (planId: string) => {
    const current = ++sequence.current;
    if (!actorId || auth.currentUser?.uid !== actorId) throw new Error('Usuário não autenticado.');
    const next: SparkRecurringFormState = {};
    const record = await loadSparkRecurringFormFirebase(db, next, actorId, planId, recurringType);
    if (current !== sequence.current || scopeRef.current !== scope || auth.currentUser?.uid !== actorId) throw new Error('Carregamento substituído.');
    if (state.current.intent?.status === 'uncertain') throw new Error('Confirme o resultado anterior com os mesmos dados.');
    if (record && (record.personId !== actorId || record.sparkPlanActive === false || record.sparkReplanCancelled)) throw new Error('Esta recorrência não está disponível para edição.');
    state.current = next; setMode({ scope, value: !!record });
    return record ? { success: true as const, data: record } : null;
  }, [recurringType, actorId, scope]);
  const submit = useCallback(async (draft: Omit<SparkRecurringDraft, 'recurringType'>) => {
    if (draft.actorId !== actorId || auth.currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.');
    const work = state.current;
    try {
      const result = await submitSparkRecurringFormFirebase(db, work, { ...draft, recurringType }, () => createFinancialClientActionId('form_recurring'));
      if (auth.currentUser?.uid !== draft.actorId || scopeRef.current !== scope) throw new Error('A sessão autenticada mudou.');
      if (result) void Promise.resolve().then(() => queryClient.invalidateQueries({ queryKey: ['finance', draft.actorId], refetchType: 'all' })).catch(error => console.warn('Não foi possível atualizar as recorrências.', error));
      return result;
    } finally {
      if (state.current === work && scopeRef.current === scope) setIsUncertain(work.intent?.status === 'uncertain' || !!work.intent?.definitionConfirmed && work.intent.status !== 'confirmed');
    }
  }, [queryClient, recurringType, actorId, scope]);
  return { load, submit, reset, initialize, isSpark: mode.scope === scope ? mode.value : null, isUncertain };
}

type ActionFormDraft = { planId: string } & ({ action: 'reverse' | 'archive' | 'restore' }
  | { action: 'settle'; selectedDate: Date; accountId: string; amountInCents: number; installmentsCount: number; note: string | null; settlementMode?: 'negotiated' });

export function useSparkRecurringAction(recurringType: 'expense' | 'gain') {
  const state = useRef<SparkRecurringActionState>({}), queryClient = useQueryClient();
  const { user } = useAuth(); const uid = user?.uid;
  const [isUncertain, setIsUncertain] = useState(false);
  useEffect(() => { state.current = {}; setIsUncertain(false); }, [uid]);
  const submit = useCallback(async (draft: ActionFormDraft) => {
    const actorId = auth.currentUser?.uid;
    if (!actorId || actorId !== uid) throw new Error('Usuário não autenticado.');
    const work = state.current;
    try {
    const result = await submitSparkRecurringActionFirebase(db, work, { ...draft, actorId, recurringType } as SparkRecurringActionDraft, () => createFinancialClientActionId('form_recurring_action'));
    if (auth.currentUser?.uid !== actorId || state.current !== work) throw new Error('A sessão autenticada mudou.');
    if (result) {
      state.current = {};
      void Promise.resolve().then(() => queryClient.invalidateQueries({ queryKey: ['finance', actorId], refetchType: 'all' })).catch(error => console.warn('Não foi possível atualizar as recorrências.', error));
    }
    return result;
    } finally { if (auth.currentUser?.uid === actorId) setIsUncertain(state.current.intent?.status === 'uncertain'); }
  }, [queryClient, recurringType, uid]);
  const reset = useCallback(() => { if (state.current.intent?.status === 'confirmed') state.current = {}; }, []);
  const hasPending = useCallback(() => state.current.intent?.status === 'uncertain', []);
  return { submit, reset, isUncertain, hasPending };
}
