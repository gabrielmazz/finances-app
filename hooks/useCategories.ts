import React from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { notifyCategoryChange } from '@/application/categoryChanges';
import { errorMessage } from '@/application/errors';
import { getFirebaseClient } from '@/firebase/client';
import { archiveCategory, readCategorySlice, type CategoryCursor, type CategoryFilter } from '@/firebase/categories';
import type { Category } from '@/domain/categories';
import { useCategoryRevision } from './useCategoryRevision';
import { useCategoryScope } from './useCategoryScope';

type State = { identity: string; items: Category[]; cursor: CategoryCursor | null; loading: boolean; error: string | null };
const incompleteMessage = 'Algumas categorias não puderam ser verificadas. Os dados existentes não foram alterados.';
const unavailableMessage = 'Não foi possível consultar todas as fontes de categorias.';

export function useCategories(enabled: boolean, filter: CategoryFilter) {
  const scope = useCategoryScope();
  const focused = useIsFocused();
  const revision = useCategoryRevision(scope);
  const [version, setVersion] = React.useState(0);
  const identity = JSON.stringify([scope?.uid, scope?.kind, scope?.id, enabled, focused, filter, version, revision]);
  const currentIdentity = React.useRef(identity);
  currentIdentity.current = identity;
  const [state, setState] = React.useState<State>({ identity, items: [], cursor: null, loading: false, error: null });
  const running = React.useRef<string | null>(null);
  const reload = React.useCallback(() => setVersion(value => value + 1), []);
  React.useEffect(() => {
    if (!enabled || !focused || !scope) return;
    // Independent Firestore pages are refreshed when the app returns to the foreground.
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') reload(); });
    return () => subscription.remove();
  }, [enabled, focused, scope, reload]);
  React.useEffect(() => {
    let active = true;
    if (!enabled || !focused) { setState({ identity, items: [], cursor: null, loading: false, error: null }); return () => { active = false; }; }
    if (!scope) { setState({ identity, items: [], cursor: null, loading: false, error: 'Não foi possível identificar o contexto financeiro.' }); return () => { active = false; }; }
    setState({ identity, items: [], cursor: null, loading: true, error: null });
    void readCategorySlice(getFirebaseClient(), scope, null, filter, () => active && currentIdentity.current === identity).then(result => {
      if (!active) return;
      if (result.issues) console.warn('Categorias incompatíveis ou com associação não verificada.');
      setState({ identity, items: result.items, cursor: result.cursor, loading: false, error: result.issues ? incompleteMessage : result.unavailable ? unavailableMessage : null });
    }, reason => { if (active) setState({ identity, items: [], cursor: null, loading: false, error: errorMessage(reason) }); });
    return () => { active = false; };
  }, [identity, scope]);
  const loadMore = React.useCallback(async () => {
    if (!scope || state.identity !== identity || !state.cursor || state.loading || running.current === identity) return false;
    running.current = identity;
    setState(value => ({ ...value, loading: true, error: null }));
    try {
      const result = await readCategorySlice(getFirebaseClient(), scope, state.cursor, filter, () => currentIdentity.current === identity);
      if (currentIdentity.current !== identity) return false;
      if (result.issues) console.warn('Categorias incompatíveis ou com associação não verificada.');
      setState(value => value.identity === identity ? { ...value, items: [...value.items, ...result.items], cursor: result.cursor, loading: false, error: result.issues ? incompleteMessage : result.unavailable ? unavailableMessage : null } : value);
      return result.items.length > 0;
    } catch (reason) {
      if (currentIdentity.current === identity) {
        const denied = typeof reason === 'object' && reason && 'code' in reason && reason.code === 'permission-denied';
        setState(value => ({ ...value, ...(denied ? { items: [], cursor: null } : {}), loading: false, error: errorMessage(reason) }));
      }
      return false;
    } finally { if (running.current === identity) running.current = null; }
  }, [scope, state, identity, filter]);
  const archive = React.useCallback(async (item: Category) => {
    if (!scope) throw Error('categories/invalid-context');
    await archiveCategory(getFirebaseClient(), scope, item);
    notifyCategoryChange(scope);
  }, [scope]);
  const visible = state.identity === identity ? state : { identity, items: [], cursor: null, loading: !!scope && enabled && focused, error: null };
  return { items: visible.items, loading: visible.loading, error: visible.error, hasMore: !!visible.cursor, loadMore, archive, reload };
}
