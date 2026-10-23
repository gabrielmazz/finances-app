import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auth, db } from '@/FirebaseConfig';
import { createFinancialClientActionId } from '@/functions/FinancialLedgerFirebase';
import { submitSparkPairFormFirebase, type SparkPairFormDraft, type SparkPairFormState } from '@/functions/SparkPairFormFirebase';

export function useSparkPairForm() {
  const state = useRef<SparkPairFormState>({}), queryClient = useQueryClient();
  const [isUncertain, setIsUncertain] = useState(false);
  const reset = useCallback(() => { state.current = {}; setIsUncertain(false); }, []);
  const submit = useCallback(async (draft: SparkPairFormDraft) => {
    // Após sucesso confirmado, outro clique explícito representa uma nova operação.
    if (state.current.intent?.status === 'confirmed') state.current = { intent: { ...state.current.intent, key: '' } };
    try {
      const handled = await submitSparkPairFormFirebase(db, state.current, draft, () => createFinancialClientActionId('form_pair'));
      if (auth.currentUser?.uid !== draft.actorId) throw new Error('A sessão autenticada mudou.');
      if (handled) void queryClient.invalidateQueries({ queryKey: ['finance', draft.actorId], refetchType: 'all' }).catch(error => console.warn('Não foi possível atualizar os saldos.', error));
      return handled;
    } finally { setIsUncertain(state.current.intent?.status === 'uncertain'); }
  }, [queryClient]);
  return { submit, reset, isUncertain };
}
