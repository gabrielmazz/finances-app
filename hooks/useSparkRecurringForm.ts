import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auth, db } from '@/FirebaseConfig';
import { getSparkContextFirebase } from '@/functions/SparkContextFirebase';
import { createFinancialClientActionId } from '@/functions/FinancialLedgerFirebase';
import { loadSparkRecurringFormFirebase, submitSparkRecurringFormFirebase, submitSparkRecurringActionFirebase,
  type SparkRecurringDraft, type SparkRecurringFormState, type SparkRecurringActionDraft, type SparkRecurringActionState } from '@/functions/SparkRecurringFormFirebase';

export function useSparkRecurringForm(recurringType: 'expense' | 'gain') {
  const state = useRef<SparkRecurringFormState>({}), queryClient = useQueryClient(), sequence = useRef(0);
  const [isSpark, setIsSpark] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const actorId = auth.currentUser?.uid;
    if (actorId) void getSparkContextFirebase(db, actorId).then(context => { if (active) setIsSpark(!!context); }).catch(() => { if (active) setIsSpark(null); });
    return () => { active = false; sequence.current += 1; };
  }, []);
  const reset = useCallback(() => {
    sequence.current += 1;
    if (state.current.intent?.status !== 'uncertain' && !state.current.intent?.definitionConfirmed || state.current.intent?.status === 'confirmed') state.current = {};
  }, []);
  const load = useCallback(async (planId: string) => {
    const current = ++sequence.current, actorId = auth.currentUser?.uid;
    if (!actorId) throw new Error('Usuário não autenticado.');
    const next: SparkRecurringFormState = {};
    const record = await loadSparkRecurringFormFirebase(db, next, actorId, planId, recurringType);
    if (current !== sequence.current) throw new Error('Carregamento substituído.');
    if (state.current.intent?.status === 'uncertain') throw new Error('Confirme o resultado anterior com os mesmos dados.');
    state.current = next; setIsSpark(!!record);
    return record ? { success: true as const, data: record } : null;
  }, [recurringType]);
  const submit = useCallback(async (draft: Omit<SparkRecurringDraft, 'recurringType'>) => {
    const result = await submitSparkRecurringFormFirebase(db, state.current, { ...draft, recurringType }, () => createFinancialClientActionId('form_recurring'));
    if (auth.currentUser?.uid !== draft.actorId) throw new Error('A sessão autenticada mudou.');
    if (result) void queryClient.invalidateQueries({ queryKey: ['finance', draft.actorId], refetchType: 'all' }).catch(error => console.warn('Não foi possível atualizar as recorrências.', error));
    return result;
  }, [queryClient, recurringType]);
  return { load, submit, reset, isSpark };
}

type ActionFormDraft = { planId: string } & ({ action: 'reverse' | 'archive' | 'restore' }
  | { action: 'settle'; selectedDate: Date; accountId: string; amountInCents: number; installmentsCount: number; note: string | null; settlementMode?: 'negotiated' });

export function useSparkRecurringAction(recurringType: 'expense' | 'gain') {
  const state = useRef<SparkRecurringActionState>({}), queryClient = useQueryClient();
  const submit = useCallback(async (draft: ActionFormDraft) => {
    const actorId = auth.currentUser?.uid;
    if (!actorId) throw new Error('Usuário não autenticado.');
    const result = await submitSparkRecurringActionFirebase(db, state.current, { ...draft, actorId, recurringType } as SparkRecurringActionDraft, () => createFinancialClientActionId('form_recurring_action'));
    if (auth.currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.');
    if (result) {
      state.current = {};
      void queryClient.invalidateQueries({ queryKey: ['finance', actorId], refetchType: 'all' }).catch(error => console.warn('Não foi possível atualizar as recorrências.', error));
    }
    return result;
  }, [queryClient, recurringType]);
  const reset = useCallback(() => { if (state.current.intent?.status === 'confirmed') state.current = {}; }, []);
  return { submit, reset };
}
