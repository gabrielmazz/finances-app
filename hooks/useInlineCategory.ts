import React from 'react';
import { registerCategoryForm } from '@/application/categoryChanges';
import type { Category } from '@/domain/categories';
import { APP_ROUTE_PATHS, navigateToRoute, type AppRoutePath } from '@/utils/navigation';
import type { CategoryPlacement } from '@/utils/categoryAvailability';
import { useCategoryScope } from './useCategoryScope';

export function useInlineCategory(placement: CategoryPlacement, origin: AppRoutePath, select: (category: Category) => void) {
  const scope = useCategoryScope();
  const form = React.useRef<ReturnType<typeof registerCategoryForm> | null>(null);
  React.useEffect(() => () => form.current?.clear(), [scope]);

  return React.useCallback(() => {
    if (!scope) return;
    form.current?.clear();
    form.current = registerCategoryForm(scope, select);
    navigateToRoute(APP_ROUTE_PATHS.addRegisterTag, {
      placement, returnAfterCreate: '1', returnToRoute: origin, categoryFormId: form.current.id,
    });
  }, [scope, select, placement, origin]);
}
