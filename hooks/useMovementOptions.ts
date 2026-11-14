import React from 'react';
import { useBankAccounts } from '@/contexts/BankAccountsContext';
import { categorySupports } from '@/domain/categories';
import type { MovementType } from '@/domain/movements';
import { useCategories } from './useCategories';

export function useMovementOptions(type: MovementType) {
  const accounts = useBankAccounts();
  const categories = useCategories(true, type);
  const banks = React.useMemo(() => accounts.active.items.filter(item => item.source === 'new' && !item.blocked && item.balanceInCents !== null).map(item => ({ id: item.id, name: item.name, iconKey: item.institutionKey, colorHex: item.colorHex })), [accounts.active.items]);
  const tags = React.useMemo(() => categories.items.filter(item => categorySupports(item, type)).map(item => ({ id: `${item.source}:${item.id}`, name: item.name, usageType: item.usageType ?? undefined, iconFamily: item.iconFamily, iconName: item.iconName, iconStyle: item.iconStyle })), [categories.items, type]);
  return { scope: accounts.scope, banks, tags, optionsError: accounts.scopeError || accounts.active.error || categories.error, isLoadingBanks: accounts.active.loading && !accounts.active.items.length, isLoadingTags: categories.loading && !categories.items.length, loadMoreBanks: () => accounts.load('active', true), loadMoreTags: categories.loadMore, hasMoreTags: categories.hasMore, reloadTags: categories.reload, reloadBanks: accounts.reload };
}
