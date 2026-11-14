import React from 'react';
import { errorMessage } from '@/application/errors';
import type { BankScope } from '@/domain/banks';
import { getFirebaseClient } from '@/firebase/client';
import { readMovementTimeline, type TimelineCursor } from '@/firebase/movements';
import type { MovementRecord } from '@/types/bankMovements';

type Account = { id: string; name: string; blocked?: boolean };

export function useRecentMovements(scope: BankScope | null, accounts: Account[], ready: boolean) {
  const [version, setVersion] = React.useState(0);
  const accountKey = JSON.stringify(accounts.filter(item => !item.blocked).map(item => [item.id, item.name]));
  const identity = JSON.stringify([scope?.uid, scope?.kind, scope?.id, accountKey, ready, version]);
  const [state, setState] = React.useState<{ identity: string; items: MovementRecord[]; cashIncomplete: boolean; incomplete: boolean; loading: boolean; error: string | null }>({ identity, items: [], cashIncomplete: false, incomplete: false, loading: false, error: null });
  React.useEffect(() => {
    let active = true;
    if (!scope || !ready) { setState({ identity, items: [], cashIncomplete: false, incomplete: false, loading: !ready, error: null }); return () => { active = false; }; }
    const bankList = JSON.parse(accountKey) as [string, string][];
    if (!bankList.length) { setState({ identity, items: [], cashIncomplete: false, incomplete: false, loading: false, error: null }); return () => { active = false; }; }
    setState({ identity, items: [], cashIncomplete: false, incomplete: false, loading: true, error: null });
    void (async () => {
      const banks = new Map(bankList), items: MovementRecord[] = [];
      const from = new Date('1900-01-01T00:00:00Z'), to = new Date();
      to.setUTCHours(0, 0, 0, 0); to.setUTCDate(to.getUTCDate() + 1);
      let cursor: TimelineCursor | null = null, cashIncomplete = false;
      for (let page = 0; page < 3; page++) {
        const result = await readMovementTimeline(getFirebaseClient(), scope, null, from, to, cursor, [...banks.keys()]);
        items.push(...result.items.map(item => ({ ...item, bankName: item.bankId ? banks.get(item.bankId) ?? null : null })));
        cashIncomplete ||= result.cashIncomplete;
        cursor = result.cursor;
        if (items.length >= 6 || !cursor) break;
      }
      if (active) setState({ identity, items: items.slice(0, 6), cashIncomplete, incomplete: items.length < 6 && !!cursor, loading: false, error: null });
    })().catch(error => { if (active) setState({ identity, items: [], cashIncomplete: false, incomplete: false, loading: false, error: errorMessage(error) }); });
    return () => { active = false; };
  }, [identity]);
  return { ...(state.identity === identity ? state : { items: [], cashIncomplete: false, incomplete: false, loading: ready, error: null }), refresh: () => setVersion(value => value + 1) };
}
