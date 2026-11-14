import React from 'react';
import { useBankAccounts } from '@/contexts/BankAccountsContext';
import { getFirebaseClient } from '@/firebase/client';
import { readMovement, readMovementTimeline, updateMovement, type TimelineCursor } from '@/firebase/movements';
import { errorMessage } from '@/application/errors';
import type { MovementRecord } from '@/types/bankMovements';

function dateBoundary(value: string, end = false): Date | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return;
  const [, day, month, year] = match;
  const result = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return;
  if (end) result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

export function useMovementList(accountId: string | null, start: string, end: string, enabled: boolean) {
  const accounts = useBankAccounts();
  const scope = accounts.scope;
  const identity = scope ? `${scope.uid}:${scope.kind}:${scope.id}:${accountId}:${start}:${end}:${enabled}` : '';
  const identityRef = React.useRef(identity); identityRef.current = identity;
  const [state, setState] = React.useState<{ identity: string; items: MovementRecord[]; cursor: TimelineCursor | null; issues: number; cashIncomplete: boolean; loading: boolean; error: string | null }>({ identity, items: [], cursor: null, issues: 0, cashIncomplete: false, loading: false, error: null });
  const latest = React.useRef(state); latest.current = state;
  const generation = React.useRef(0);
  const inFlight = React.useRef(false);
  const fetchPage = React.useCallback(async (more = false) => {
    if (!scope || !accountId || !enabled || inFlight.current) return;
    const from = dateBoundary(start), to = dateBoundary(end, true);
    if (!from || !to || from >= to) return;
    const previous = latest.current;
    if (more && (previous.identity !== identity || !previous.cursor)) return;
    const version = generation.current;
    inFlight.current = true;
    setState(current => ({ identity, items: more && current.identity === identity ? current.items : [], cursor: more ? current.cursor : null, issues: more ? current.issues : 0, cashIncomplete: more && current.cashIncomplete, loading: true, error: null }));
    try {
      const client = getFirebaseClient();
      const page = await readMovementTimeline(client, scope, accountId, from, to, more ? previous.cursor : null);
      const items = page.items;
      if (version !== generation.current || identityRef.current !== identity) return;
      setState(current => {
        const merged = more ? [...new Map([...current.items, ...items].map(item => [`${item.storageSource}:${item.id}`, item])).values()] : items;
        merged.sort((left, right) => (right.date?.getTime() ?? 0) - (left.date?.getTime() ?? 0) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0) || ((left.storageSource ?? '') < (right.storageSource ?? '') ? -1 : (left.storageSource ?? '') > (right.storageSource ?? '') ? 1 : 0));
        return { identity, items: merged, cursor: page.cursor, issues: (more ? current.issues : 0) + page.issues, cashIncomplete: (more && current.cashIncomplete) || page.cashIncomplete, loading: false, error: null };
      });
    } catch (error) {
      if (version === generation.current && identityRef.current === identity) setState(current => ({ ...current, loading: false, error: errorMessage(error) }));
    } finally { if (version === generation.current) inFlight.current = false; }
  }, [scope, accountId, start, end, enabled, identity]);
  React.useEffect(() => {
    generation.current++; inFlight.current = false;
    setState({ identity, items: [], cursor: null, issues: 0, cashIncomplete: false, loading: false, error: null });
    void fetchPage();
    return () => { generation.current++; inFlight.current = false; };
  }, [identity, fetchPage]);
  React.useEffect(() => { if (enabled && accountId) void accounts.reload(); }, [enabled, accountId, accounts.reload]);
  const cancel = React.useCallback(async (id: string) => {
    if (!scope) throw Error('movements/invalid-context');
    const client = getFirebaseClient();
    const movement = await readMovement(client, scope, id);
    await updateMovement(client, scope, movement, null);
    await accounts.reload();
    generation.current++; inFlight.current = false;
    await fetchPage();
  }, [scope, accounts.reload, fetchPage]);
  const visible = state.identity === identity ? state : { identity, items: [], cursor: null, issues: 0, cashIncomplete: false, loading: false, error: null };
  return { ...visible, refresh: async () => { await accounts.reload(); await fetchPage(); }, loadMore: () => fetchPage(true), cancel, accounts };
}
