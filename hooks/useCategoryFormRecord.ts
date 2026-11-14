import React from 'react';
import { getFirebaseClient } from '@/firebase/client';
import { readCategory } from '@/firebase/categories';
import { errorMessage } from '@/application/errors';
import type { Category, CategorySource } from '@/domain/categories';
import { useCategoryScope } from './useCategoryScope';

type State = { identity: string; record: Category | null; isLoading: boolean; error: string | null };
export function useCategoryFormRecord(tagId: string | null, source: CategorySource = 'legacy') {
  const scope = useCategoryScope();
  const identity = JSON.stringify([tagId, source, scope?.kind, scope?.id, scope?.uid]);
  const [version, setVersion] = React.useState(0);
  const [state, setState] = React.useState<State>({ identity, record: null, isLoading: !!tagId, error: null });
  const reload = React.useCallback(() => setVersion(value => value + 1), []);
  React.useEffect(() => {
    let active = true;
    if (!tagId) { setState({ identity, record: null, isLoading: false, error: null }); return () => { active = false; }; }
    if (!scope) { setState({ identity, record: null, isLoading: false, error: 'Não foi possível identificar o contexto financeiro.' }); return () => { active = false; }; }
    setState({ identity, record: null, isLoading: true, error: null });
    void readCategory(getFirebaseClient(), scope, { id: tagId, source }).then(
      record => { if (active) setState({ identity, record, isLoading: false, error: null }); },
      error => { if (active) setState({ identity, record: null, isLoading: false, error: errorMessage(error) }); },
    );
    return () => { active = false; };
  }, [identity, tagId, source, scope, version]);
  return state.identity === identity ? { ...state, reload } : { record: null, isLoading: !!tagId, error: null, reload };
}
