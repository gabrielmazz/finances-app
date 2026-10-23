import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auth, db } from '@/FirebaseConfig';
import { getSparkContextFirebase } from '@/functions/SparkContextFirebase';
import { createFinancialClientActionId } from '@/functions/FinancialLedgerFirebase';
import { readSparkOrdinaryForEditFirebase, sparkEditableMovementRecord } from '@/functions/SparkOrdinaryReadFirebase';
import { beginNextSparkMovementFormIntent, submitSparkMovementFormFirebase, type SparkMovementFormDraft, type SparkMovementFormState } from '@/functions/SparkMovementFormFirebase';
import type { SparkExecutionReference } from '@/utils/sparkFinancialReadModel';

export function useSparkMovementForm(movementKind: 'income' | 'expense') {
  const state = useRef<SparkMovementFormState>({}), queryClient = useQueryClient();
  const loadSequence = useRef(0);
  useEffect(() => () => { loadSequence.current += 1; }, []);
  const reset = useCallback(() => { loadSequence.current += 1; state.current = {}; }, []);
  const initialize = useCallback(async () => {
    const actorId = auth.currentUser?.uid;
    if (!actorId) throw new Error('Usuário não autenticado.');
    const context = await getSparkContextFirebase(db, actorId);
    if (auth.currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.');
    return context !== null;
  }, []);
  const load = useCallback(async (operationId: string, source?: string) => {
    const sequence = ++loadSequence.current;
    if (state.current.intent?.status === 'uncertain') throw new Error('Reenvie os mesmos dados para confirmar o resultado anterior antes de recarregar o lançamento.');
    const actorId = auth.currentUser?.uid;
    if (!actorId) throw new Error('Usuário não autenticado.');
    const context = await getSparkContextFirebase(db, actorId);
    if (sequence !== loadSequence.current) throw new Error('Carregamento substituído.');
    if (auth.currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.');
    if (!context) {
      if (source) throw new Error('O contexto financeiro mudou. Atualize o extrato.');
      state.current = {};
      return null;
    }
    if (source !== 'live' && source !== 'imported') throw new Error('Abra o lançamento pelo extrato atualizado para editar.');
    const reference: SparkExecutionReference = { source, operationId, family: 'ordinary' };
    const target = await readSparkOrdinaryForEditFirebase(db, actorId, context.groupId, reference);
    if (sequence !== loadSequence.current) throw new Error('Carregamento substituído.');
    if (auth.currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.');
    if (target.movementKind !== movementKind) throw new Error('Tipo de lançamento incompatível com este formulário.');
    state.current = { target, entryReference: reference };
    return { success: true, data: sparkEditableMovementRecord(target) };
  }, [movementKind]);
  const submit = useCallback(async (draft: Omit<SparkMovementFormDraft, 'movementKind'>) => {
    state.current = beginNextSparkMovementFormIntent(state.current);
    const handled = await submitSparkMovementFormFirebase(db, state.current, { ...draft, movementKind }, () => createFinancialClientActionId('form_movement'));
    if (auth.currentUser?.uid !== draft.actorId) throw new Error('A sessão autenticada mudou.');
    if (handled && auth.currentUser?.uid === draft.actorId) {
      void queryClient.invalidateQueries({ queryKey: ['finance', draft.actorId], refetchType: 'all' }).catch(error => console.warn('Não foi possível atualizar a consulta financeira.', error));
    }
    return handled;
  }, [movementKind, queryClient]);
  return { initialize, load, submit, reset };
}
