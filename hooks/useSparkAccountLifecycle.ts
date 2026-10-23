import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auth, db } from '@/FirebaseConfig';
import { createFinancialClientActionId } from '@/functions/FinancialLedgerFirebase';
import { submitSparkAccountLifecycleFormFirebase, type SparkAccountLifecycleFormState } from '@/functions/SparkAccountLifecycleFormFirebase';

export function useSparkAccountLifecycle() {
  const state = useRef<SparkAccountLifecycleFormState>({}), queryClient = useQueryClient();
  const submit = useCallback(async (accountId: string, action: 'archive' | 'restore' | 'set-active', isActive = true) => {
    const actorId = auth.currentUser?.uid;
    if (!actorId) throw new Error('Usuário não autenticado.');
    try {
      const result = await submitSparkAccountLifecycleFormFirebase(db, state.current, action === 'set-active' ? { actorId, accountId, action, isActive } : { actorId, accountId, action }, () => createFinancialClientActionId('account_state'));
      if (auth.currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.');
      if (result) {
        state.current = {};
        void queryClient.invalidateQueries({ queryKey: ['finance', actorId], refetchType: 'all' }).catch(error => console.warn('Não foi possível atualizar as contas.', error));
      }
      return result;
    } catch (error) { return { success: false as const, error }; }
  }, [queryClient]);
  return { submit };
}
