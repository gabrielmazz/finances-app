import React from 'react';
import { readBank } from '@/firebase/banks';
import { readCategory } from '@/firebase/categories';
import { getFirebaseClient } from '@/firebase/client';
import { APP_ROUTE_PATHS, navigateToRoute } from '@/utils/navigation';
import { useCategoryScope } from './useCategoryScope';

export function useLegacyRecordLookup(kind: 'bank' | 'category') {
  const scope = useCategoryScope();
  const [loading, setLoading] = React.useState(false), [error, setError] = React.useState<string | null>(null);
  const current = React.useRef(scope);
  current.current = scope;
  const inFlight = React.useRef(false);

  async function open(value: string) {
    const id = value.trim();
    if (!scope || !id || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const client = getFirebaseClient();
      if (kind === 'bank') {
        const record = await readBank(client, scope, { source: 'legacy', id });
        if (current.current === scope) navigateToRoute(APP_ROUTE_PATHS.addRegisterBank, { bankId: record.id, bankSource: record.source });
      } else {
        const record = await readCategory(client, scope, { source: scope.kind === 'personal' ? 'legacy' : 'group-root', id });
        if (current.current === scope) navigateToRoute(APP_ROUTE_PATHS.addRegisterTag, { tagId: record.id, tagSource: record.source });
      }
    } catch {
      if (current.current === scope) setError('Registro indisponível no contexto atual. Confira o ID.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return { open, loading, error, enabled: process.env.EXPO_PUBLIC_FIREBASE_MODE === 'emulator' && !!scope && (kind === 'category' || scope.kind === 'personal') };
}
