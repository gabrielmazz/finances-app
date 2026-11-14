import React from 'react';
import { useBankAccounts } from '@/contexts/BankAccountsContext';
import { useSession } from '@/hooks/useSession';
import { archiveBank } from '@/firebase/banks';
import { getFirebaseClient } from '@/firebase/client';

export function useConfigurationBanks() {
  const accounts = useBankAccounts();
  const session = useSession();
  const canWrite = !!accounts.scope && (accounts.scope.kind === 'personal' || (session.context?.kind === 'group' && session.context.role === 'admin'));
  const items = React.useMemo(() => accounts.active.items.map(item => ({ id: item.id, name: item.name, colorHex: item.colorHex, iconKey: item.institutionKey,
    isActive: item.status === 'active' && !item.blocked, archived: false, financialSource: item.source, blocked: !!item.blocked })), [accounts.active.items]);
  const archive = React.useCallback(async (id: string, source: string | undefined) => {
    if (!accounts.scope || !canWrite) throw Error('banks/invalid-context');
    const bank = accounts.active.items.find(item => item.id === id && item.source === source);
    if (!bank) throw Error('banks/not-found');
    await archiveBank(getFirebaseClient(), accounts.scope, bank, bank.revision);
    await accounts.reload();
  }, [accounts.scope, accounts.active.items, accounts.reload, canWrite]);
  return { items, canWrite, archive, error: accounts.active.error || accounts.scopeError, loading: accounts.active.loading,
    warning: accounts.active.loaded && accounts.active.contextUnverified ? 'Encontramos contas antigas, mas não foi possível confirmar a qual contexto elas pertencem.'
      : accounts.active.loaded && accounts.active.issues > 0 ? 'Alguns registros de contas não puderam ser verificados.'
      : accounts.active.loaded && accounts.active.unavailable ? 'Não foi possível consultar todas as fontes de contas.' : null,
    hasMore: !accounts.active.complete, loadMore: () => accounts.load('active', true) };
}
