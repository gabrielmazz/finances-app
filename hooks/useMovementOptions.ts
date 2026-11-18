import React from 'react';
import { useBankAccounts } from '@/contexts/BankAccountsContext';
import { categorySupports, type CategorySource } from '@/domain/categories';
import type { Movement, MovementInput, MovementType } from '@/domain/movements';
import { isTagVisibleInMandatoryUsageList, isTagVisibleInRegularUsageList } from '@/utils/tagUsage';
import { useCategories } from './useCategories';

export function useMovementBanks() {
  const accounts = useBankAccounts();
  const writable = React.useMemo(() => accounts.active.items.filter(item => item.source === 'new' && !item.blocked && item.balanceInCents !== null), [accounts.active.items]);
  const banks = React.useMemo(() => writable.map(item => ({ id: item.id, name: item.name, iconKey: item.institutionKey, colorHex: item.colorHex })), [writable]);
  return { accounts, banks, writable };
}

const MANDATORY_PREFIX = 'mandatory:';

export function movementCategorySelection(selection: string): Pick<MovementInput, 'categoryId' | 'categorySource' | 'isFromMandatory'> | null {
  const mandatory = selection.startsWith(MANDATORY_PREFIX);
  const key = mandatory ? selection.slice(MANDATORY_PREFIX.length) : selection;
  const separator = key.indexOf(':');
  if (separator < 1) return null;
  return { categorySource: key.slice(0, separator) as CategorySource, categoryId: key.slice(separator + 1), ...(mandatory ? { isFromMandatory: true } : {}) };
}

export function useMovementOptions(type: MovementType, editing: Movement | null) {
  const { accounts, banks } = useMovementBanks();
  const categories = useCategories(true, type);
  const tags = React.useMemo(() => categories.items.filter(item => categorySupports(item, type)).flatMap(item => {
    const tag = { id: `${item.source}:${item.id}`, name: item.name, usageType: item.usageType ?? undefined, iconFamily: item.iconFamily, iconName: item.iconName, iconStyle: item.iconStyle };
    const mandatory = isTagVisibleInMandatoryUsageList(item, type);
    const regular = isTagVisibleInRegularUsageList(item, type);
    if (editing) return (editing.isFromMandatory ? mandatory : regular) ? [tag] : [];
    if (!mandatory) return [tag];
    const mandatoryTag = { ...tag, id: MANDATORY_PREFIX + tag.id, name: `${tag.name} (${type === 'gain' ? 'ganho obrigatório' : 'gasto obrigatório'})` };
    return regular ? [tag, mandatoryTag] : [mandatoryTag];
  }), [categories.items, editing, type]);
  return { scope: accounts.scope, banks, tags, optionsError: accounts.scopeError || accounts.active.error || categories.error, isLoadingBanks: accounts.active.loading && !accounts.active.items.length, isLoadingTags: categories.loading && !categories.items.length, loadMoreBanks: () => accounts.load('active', true), loadMoreTags: categories.loadMore, hasMoreTags: categories.hasMore, reloadTags: categories.reload, reloadBanks: accounts.reload };
}
