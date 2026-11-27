import { useSyncExternalStore } from 'react';
import { categoryRevision, subscribeCategoryChanges } from '@/application/categoryChanges';
import type { BankScope } from '@/domain/banks';

export function useCategoryRevision(scope: BankScope | null) {
  return useSyncExternalStore(subscribeCategoryChanges, () => categoryRevision(scope));
}
