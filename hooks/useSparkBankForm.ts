import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auth, db } from '@/FirebaseConfig';
import { getSparkContextFirebase } from '@/functions/SparkContextFirebase';
import { createFinancialClientActionId } from '@/functions/FinancialLedgerFirebase';
import { loadSparkBankFormFirebase, submitSparkBankFormFirebase, type SparkBankDraft, type SparkBankFormState } from '@/functions/SparkBankFormFirebase';

export function useSparkBankForm() {
  const state = useRef<SparkBankFormState>({}), sequence = useRef(0), queryClient = useQueryClient();
  useEffect(() => () => { sequence.current += 1; }, []);
  const reset = useCallback(() => { sequence.current += 1; state.current = {}; }, []);
  const initialize = useCallback(async () => {
    const actorId = auth.currentUser?.uid;
    if (!actorId) throw new Error('Usuário não autenticado.');
    const context = await getSparkContextFirebase(db, actorId);
    if (auth.currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.');
    if (context && context.role !== 'admin') throw new Error('O cadastro de bancos exige administrador do grupo.');
    return context !== null;
  }, []);
  const load = useCallback(async (bankId: string) => {
    const current = ++sequence.current, actorId = auth.currentUser?.uid;
    if (!actorId) throw new Error('Usuário não autenticado.');
    const next: SparkBankFormState = {};
    const catalog = await loadSparkBankFormFirebase(db, next, actorId, bankId);
    if (sequence.current !== current) throw new Error('Carregamento substituído.');
    if (state.current.intent?.status === 'uncertain') throw new Error('Reenvie os mesmos dados para confirmar o resultado anterior.');
    state.current = next;
    return catalog;
  }, []);
  const submit = useCallback(async (draft: SparkBankDraft) => {
    const result = await submitSparkBankFormFirebase(db, state.current, draft, () => createFinancialClientActionId('form_bank'));
    if (auth.currentUser?.uid !== draft.actorId) throw new Error('A sessão autenticada mudou.');
    if (result) void queryClient.invalidateQueries({ queryKey: ['finance', draft.actorId], refetchType: 'all' }).catch(error => console.warn('Não foi possível atualizar os bancos.', error));
    return result;
  }, [queryClient]);
  return { initialize, load, submit, reset };
}
