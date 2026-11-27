import type { BankScope } from '../domain/banks';
import type { Category } from '../domain/categories';

const listeners = new Set<() => void>();
const revisions = new Map<string, number>();
const scopeKey = (scope: BankScope) => JSON.stringify([scope.uid, scope.kind, scope.id]);

export function subscribeCategoryChanges(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function categoryRevision(scope: BankScope | null) {
  return scope ? revisions.get(scopeKey(scope)) ?? 0 : 0;
}

export function notifyCategoryChange(scope: BankScope) {
  revisions.set(scopeKey(scope), categoryRevision(scope) + 1);
  listeners.forEach(listener => listener());
}

const forms = new Map<string, { scope: string; select: (category: Category) => void }>();
let nextForm = 0;

export function registerCategoryForm(scope: BankScope, select: (category: Category) => void) {
  const id = String(++nextForm);
  forms.set(id, { scope: scopeKey(scope), select });
  return { id, clear: () => { forms.delete(id); } };
}

export function returnCreatedCategory(scope: BankScope, formId: string | undefined, category: Category) {
  const form = formId ? forms.get(formId) : undefined;
  if (form && form.scope === scopeKey(scope)) {
    forms.delete(formId!);
    form.select(category);
  }
}
