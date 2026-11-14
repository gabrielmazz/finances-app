import React from 'react';
import { useSession } from './useSession';
import type { BankScope } from '../domain/banks';

export function useCategoryScope(): BankScope | null {
  const session = useSession();
  const uid = session.user?.uid;
  const kind = session.context?.kind;
  const id = session.context?.kind === 'group' ? session.context.groupId : uid;
  return React.useMemo(() => uid && kind && id && !session.contextError ? { uid, kind, id } : null,
    [uid, kind, id, session.contextError]);
}
