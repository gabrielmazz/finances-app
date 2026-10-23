import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/FirebaseConfig';

type ReadResult = { success: boolean; data?: Record<string, unknown>; error?: unknown };
type Options = {
  movementId: string | null; source?: string;
  initialize: () => Promise<boolean>;
  loadSpark: (id: string, source?: string) => Promise<ReadResult | null>;
  loadLegacy: (id: string) => Promise<ReadResult>;
};
type EntryState = { key: string; loading: boolean; ready: boolean; record: Record<string, unknown> | null; error: string | null };

/** [[Versão Usável por Telas]]: erro de leitura nunca libera um formulário de edição vazio. */
export function useMovementFormEntry({ movementId, source, initialize, loadSpark, loadLegacy }: Options) {
  const key = JSON.stringify([movementId, source]);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<EntryState>({ key, loading: true, ready: false, record: null, error: null });
  const retry = useCallback(() => {
    setState({ key, loading: true, ready: false, record: null, error: null });
    setVersion(value => value + 1);
  }, [key]);
  useEffect(() => {
    let active = true;
    const actorId = auth.currentUser?.uid;
    setState({ key, loading: true, ready: false, record: null, error: null });
    void (async () => {
      try {
        if (!actorId) throw new Error('Entre novamente para registrar o lançamento.');
        let record: Record<string, unknown> | null = null;
        if (movementId) {
          const result = (await loadSpark(movementId, source)) ?? await loadLegacy(movementId);
          if (!result.success || !result.data) throw new Error('Não foi possível carregar o lançamento. Confira a conexão e tente novamente.');
          record = result.data;
        } else await initialize();
        if (auth.currentUser?.uid !== actorId) throw new Error('A sessão mudou. Entre novamente.');
        if (active) setState({ key, loading: false, ready: true, record, error: null });
      } catch (error) {
        if (active) setState({ key, loading: false, ready: false, record: null,
          error: error instanceof Error ? error.message : 'Não foi possível preparar o lançamento. Tente novamente.' });
      }
    })();
    return () => { active = false; };
  }, [key, movementId, source, version, initialize, loadSpark, loadLegacy]);
  return state.key === key ? { ...state, retry } : { key, loading: true, ready: false, record: null, error: null, retry };
}
