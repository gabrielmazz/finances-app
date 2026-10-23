import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auth, db } from '@/FirebaseConfig';
import { createFinancialClientActionId } from '@/functions/FinancialLedgerFirebase';
import { prepareSparkBalanceFormFirebase, submitSparkBalanceFormFirebase, sparkBalanceDraftKey, type SparkBalanceDraft, type SparkBalanceFormState } from '@/functions/SparkBalanceFormFirebase';

/** [[Balanço Mensal]]: preparar/retomar não confirma saldo; o segundo envio confirma o material apresentado. */
export function useSparkMonthlyBalanceForm(draft: SparkBalanceDraft | null) {
  const state = useRef<SparkBalanceFormState>({}), request = useRef<AbortController | null>(null), client = useQueryClient();
  const [shownKey, setShownKey] = useState<string | null>(null), [progress, setProgress] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const key = draft ? sparkBalanceDraftKey(draft) : null;
  const ready = key !== null && key === shownKey;
  useEffect(() => () => request.current?.abort(), []);
  const reset = () => { request.current?.abort(); state.current = {}; setShownKey(null); setProgress(null); };
  const submit = async () => {
    if (!draft) throw new Error('Selecione banco, mês e saldo.');
    const captured = { ...draft }, capturedKey = sparkBalanceDraftKey(captured);
    if (ready || state.current.intent?.status === 'uncertain') {
      let result: { id: string };
      try { result = await submitSparkBalanceFormFirebase(db, state.current, captured); }
      catch (error) {
        if (state.current.intent?.status !== 'uncertain') { state.current = {}; setShownKey(null); setProgress(null); }
        throw error;
      }
      if (auth.currentUser?.uid !== captured.actorId) throw new Error('A sessão autenticada mudou.');
      void client.invalidateQueries({ queryKey: ['finance', captured.actorId], refetchType: 'all' }).catch(error => console.warn('Falha ao atualizar os saldos.', error));
      setShownKey(null); setProgress(null);
      return { kind: 'saved' as const, id: result.id };
    }
    request.current = new AbortController();
    setIsPreparing(true);
    try {
      const preview = await prepareSparkBalanceFormFirebase(db, state.current, captured, () => createFinancialClientActionId('monthly_form'), { signal: request.current.signal });
      if (!preview) return { kind: 'legacy' as const };
      if (auth.currentUser?.uid !== captured.actorId) throw new Error('A sessão autenticada mudou.');
      if (preview.base === null) {
        setProgress(`Histórico em preparação: ${preview.proof?.workRevision ?? 0} etapas concluídas. Continue para conferir o saldo.`);
        return { kind: 'preparing' as const };
      }
      setShownKey(capturedKey); setProgress('Prévia pronta. Confira banco, mês e saldo informado antes de confirmar.');
      return { kind: 'ready' as const };
    } catch (error) {
      if ((error as { reason?: string }).reason === 'stale') { state.current = {}; setShownKey(null); }
      throw error;
    } finally { setIsPreparing(false); }
  };
  return { submit, reset, ready, progress, isPreparing, pause: () => request.current?.abort() };
}
