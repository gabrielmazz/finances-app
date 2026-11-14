import React from 'react';
import { getFirebaseClient } from '@/firebase/client';
import { createCategory, newCategoryId, updateCategory } from '@/firebase/categories';
import type { Category, CategoryInput } from '@/domain/categories';
import { useCategoryScope } from './useCategoryScope';

export function useCategoryMutations() {
  const scope = useCategoryScope();
  const create = React.useCallback(async (input: CategoryInput, intent: { signature: string; id: string } | null) => {
    if (!scope) throw Error('categories/invalid-context');
    const client = getFirebaseClient();
    const signature = JSON.stringify(input);
    const operation = intent?.signature === signature ? intent : { signature, id: newCategoryId(client, scope) };
    return { operation, run: () => createCategory(client, scope, operation.id, input) };
  }, [scope]);
  const update = React.useCallback(async (category: Category, input: Omit<CategoryInput, 'usageType'> & { usageType: CategoryInput['usageType'] | null }) => {
    if (!scope) throw Error('categories/invalid-context');
    return updateCategory(getFirebaseClient(), scope, category, input);
  }, [scope]);
  return { scope, create, update };
}
