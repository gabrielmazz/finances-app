import React from 'react';
import { getFirebaseClient } from '@/firebase/client';
import { readMovement } from '@/firebase/movements';
import { readBank } from '@/firebase/banks';
import { readCategory } from '@/firebase/categories';
import { errorMessage } from '@/application/errors';
import { useCategoryScope } from './useCategoryScope';
import type { Movement } from '@/domain/movements';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';

export function useMovementFormEntry(id?: string | null) {
  const scope = useCategoryScope();
  const [version, setVersion] = React.useState(0);
  const [state, setState] = React.useState<{ movement: Movement | null; loading: boolean; error: string | null; tagName?: string; bankName?: string }>({ movement: null, loading: !!id, error: null });
  React.useEffect(() => {
    let active = true;
    if (id === undefined) { setState({ movement: null, loading: false, error: FEATURE_UNAVAILABLE_MESSAGE }); return () => { active = false; }; }
    if (id === null) { setState({ movement: null, loading: false, error: null }); return () => { active = false; }; }
    if (!scope) { setState({ movement: null, loading: false, error: 'Não foi possível identificar o contexto financeiro.' }); return () => { active = false; }; }
    setState({ movement: null, loading: true, error: null });
    const client = getFirebaseClient();
    void readMovement(client, scope, id).then(async movement => {
      const [tag, bank] = await Promise.all([
        readCategory(client, scope, { id: movement.categoryId, source: movement.categorySource }).catch(() => null),
        readBank(client, scope, { id: movement.accountId, source: 'new' }).catch(() => null),
      ]);
      if (active) setState({ movement, tagName: tag?.name ?? 'Categoria indisponível', bankName: bank?.name, loading: false, error: null });
    }, reason => { if (active) setState({ movement: null, loading: false, error: errorMessage(reason) }); });
    return () => { active = false; };
  }, [id, scope, version]);
  const movement = state.movement;
  const record = React.useMemo<Record<string, unknown> | null>(() => {
    if (!movement) return null;
    const [year, month, day] = movement.date.split('-').map(Number);
    return { name: movement.name, valueInCents: movement.amountCents, date: new Date(year, month - 1, day), tagId: `${movement.categorySource}:${movement.categoryId}`, bankId: movement.accountId, tagName: state.tagName, bankName: state.bankName, explanation: movement.explanation, paymentFormats: movement.paymentFormats, moneyFormat: false };
  }, [movement, state.tagName, state.bankName]);
  return { movement, record, loading: state.loading, ready: id === null || !!movement, error: state.error, retry: () => setVersion(value => value + 1) };
}
