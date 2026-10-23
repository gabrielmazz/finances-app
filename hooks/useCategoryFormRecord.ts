import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/FirebaseConfig';
import { getTagDataFirebase } from '@/functions/TagFirebase';

type LoadState = { tagId: string | null; record: Record<string, unknown> | null; loading: boolean; error: string | null };

/** [[Gerenciamento de Tags]]: cada edição parte do cadastro confirmado pelo servidor. */
export function useCategoryFormRecord(tagId: string | null) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<LoadState>({ tagId, record: null, loading: Boolean(tagId), error: null });
  const reload = useCallback(() => {
    setState({ tagId, record: null, loading: Boolean(tagId), error: null });
    setVersion(value => value + 1);
  }, [tagId]);

  useEffect(() => {
    if (!tagId) { setState({ tagId, record: null, loading: false, error: null }); return; }
    let active = true;
    const actorId = auth.currentUser?.uid;
    setState({ tagId, record: null, loading: true, error: null });
    void (async () => {
      try {
        if (!actorId) throw new Error('Entre novamente para editar a categoria.');
        const result = await getTagDataFirebase(tagId, { fromServer: true });
        if (auth.currentUser?.uid !== actorId) throw new Error('A sessão mudou. Entre novamente.');
        if (!result.success || !result.data) throw new Error('Não foi possível carregar a categoria. Confira a conexão e tente novamente.');
        if (result.data.personId !== actorId) throw new Error('Somente o proprietário pode editar esta categoria.');
        if (active) setState({ tagId, record: result.data, loading: false, error: null });
      } catch (error) {
        if (active) setState({ tagId, record: null, loading: false, error: error instanceof Error ? error.message : 'Não foi possível carregar a categoria.' });
      }
    })();
    return () => { active = false; };
  }, [tagId, version]);

  return state.tagId === tagId ? { record: state.record, isLoading: state.loading, error: state.error, reload }
    : { record: null, isLoading: Boolean(tagId), error: null, reload };
}
