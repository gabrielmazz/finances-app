import { useCategoryRevision } from './useCategoryRevision';
import React from 'react';
import { useIsFocused } from 'expo-router';
import { useBankAccounts } from '@/contexts/BankAccountsContext';
import { getFirebaseClient } from '@/firebase/client';
import { cancelBankOperation, readMovement, readMovementTimeline, readTransferCounterpartyName, updateMovement, type TimelineCursor } from '@/firebase/movements';
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

export function useMovementList(accountId: string | null, start: string, end: string, requested: boolean) {
  const accounts = useBankAccounts();
  const focused = useIsFocused();
  const enabled = requested && focused;
  const scope = accounts.scope;
  const canWrite = accounts.canWrite;
  const categoryRevision = useCategoryRevision(scope);
  const identity = scope ? `${scope.uid}:${scope.kind}:${scope.id}:${accountId}:${start}:${end}:${enabled}` : '';
  const identityRef = React.useRef(identity); identityRef.current = identity;
  const [state, setState] = React.useState<{ identity: string; items: MovementRecord[]; cursor: TimelineCursor | null; issues: number; cashIncomplete: boolean; loading: boolean; error: string | null }>({ identity, items: [], cursor: null, issues: 0, cashIncomplete: false, loading: false, error: null });
  const [transferDetails, setTransferDetails] = React.useState<{ identity: string; names: Record<string, string | null> }>({ identity, names: {} });
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
    // Keep the expanded rows during refreshes of the same authorized query.
    setState(current => ({ identity, items: current.identity === identity ? current.items : [], cursor: more ? current.cursor : null, issues: more ? current.issues : 0, cashIncomplete: more && current.cashIncomplete, loading: true, error: null }));
    try {
      const client = getFirebaseClient();
      const page = await readMovementTimeline(client, scope, accountId, from, to, more ? previous.cursor : null);
      const items = page.items;
      if (version !== generation.current || identityRef.current !== identity) return;
      setState(current => {
        const merged = more ? [...new Map([...current.items, ...items].map(item => [`${item.storageSource}:${item.id}`, item])).values()] : items;
        return { identity, items: merged, cursor: page.cursor, issues: (more ? current.issues : 0) + page.issues, cashIncomplete: (more && current.cashIncomplete) || page.cashIncomplete, loading: false, error: null };
      });
    } catch (error) {
      if (version === generation.current && identityRef.current === identity) {
        const denied = error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied';
        if (denied) setTransferDetails({ identity, names: {} });
        setState(current => ({ ...current, ...(denied ? { items: [], cursor: null } : {}), loading: false, error: errorMessage(error) }));
      }
    } finally { if (version === generation.current) inFlight.current = false; }
  }, [scope, accountId, start, end, enabled, identity]);
  React.useEffect(() => {
    generation.current++; inFlight.current = false;
    setState(current => current.identity === identity ? current : {
      identity, items: [], cursor: null, issues: 0, cashIncomplete: false, loading: false, error: null,
    });
    void fetchPage();
    return () => { generation.current++; inFlight.current = false; };
  }, [identity, fetchPage, enabled ? accounts.ledgerRevision : 0, enabled ? categoryRevision : 0]);
  React.useEffect(() => { setTransferDetails({ identity, names: {} }); }, [identity]);
  const cancel = React.useCallback(async (record: MovementRecord) => {
    if (!scope) throw Error('movements/invalid-context');
    if (!canWrite) throw Error('read-only/operation');
    const client = getFirebaseClient();
    if (record.isBankTransfer || record.isCashRescue) await cancelBankOperation(client, scope, record.id);
    else await updateMovement(client, scope, await readMovement(client, scope, record.id), null);
    if (identityRef.current !== identity) return;
    await accounts.refreshAfterMovement(scope);
  }, [scope, canWrite, identity, accounts.refreshAfterMovement]);
  const loadTransferDetails = React.useCallback(async (movement: MovementRecord) => {
    if (!scope || movement.storageSource !== 'new' || !movement.bankTransferPairId || !movement.bankTransferDirection) return;
    const update = (name: string | null) => {
      if (identityRef.current === identity) {
        setTransferDetails(current => ({ identity, names: { ...(current.identity === identity ? current.names : {}), [movement.id]: name } }));
      }
    };
    update(null);
    try { update(await readTransferCounterpartyName(getFirebaseClient(), scope, movement.bankTransferPairId, movement.bankTransferDirection)); }
    catch { update(null); }
  }, [scope, identity]);
  const visible = state.identity === identity ? state : { identity, items: [], cursor: null, issues: 0, cashIncomplete: false, loading: false, error: null };
  return { ...visible, refresh: async () => { await accounts.reload(); await fetchPage(); }, loadMore: () => fetchPage(true),
    cancel, canWrite, accounts, loadTransferDetails, transferNames: transferDetails.identity === identity ? transferDetails.names : {} };
}
