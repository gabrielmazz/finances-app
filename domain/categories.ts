import type { BankScope } from './banks';
import type { TagUsageType } from '../utils/tagUsage';
import { normalizeTagUsageType } from '../utils/tagUsage';

export type CategorySource = 'new' | 'legacy' | 'group-legacy' | 'group-root';
export type CategoryInput = {
  name: string;
  usageType: TagUsageType;
  isMandatoryExpense: boolean;
  isMandatoryGain: boolean;
  showInBothLists: boolean;
  iconFamily: string | null;
  iconName: string | null;
  iconStyle: string | null;
};
export type Category = Omit<CategoryInput, 'usageType'> & {
  id: string;
  source: CategorySource;
  usageType: TagUsageType | null;
  status: 'active' | 'archived';
  revision: number;
  blocked: boolean;
};

export function validateCategoryInput(input: CategoryInput): CategoryInput {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) throw Error('categories/invalid-name');
  if (!normalizeTagUsageType(input.usageType)) throw Error('categories/invalid-type');
  if ([input.isMandatoryExpense, input.isMandatoryGain, input.showInBothLists].some(value => typeof value !== 'boolean'))
    throw Error('categories/invalid-availability');
  if ((input.usageType === 'expense' && input.isMandatoryGain) || (input.usageType === 'gain' && input.isMandatoryExpense))
    throw Error('categories/invalid-availability');
  for (const field of [input.iconFamily, input.iconName, input.iconStyle])
    if (field !== null && (typeof field !== 'string' || field.length > 100 || /[\x00-\x1f\x7f]/.test(field))) throw Error('categories/invalid-icon');
  return { name, usageType: input.usageType, isMandatoryExpense: input.isMandatoryExpense,
    isMandatoryGain: input.isMandatoryGain, showInBothLists: input.showInBothLists,
    iconFamily: input.iconFamily, iconName: input.iconName, iconStyle: input.iconStyle };
}

export function parseCategory(id: string, source: CategorySource, data: Record<string, unknown>, scope: BankScope): Category {
  if (!id || typeof data.name !== 'string' || !data.name.trim()) throw Error('categories/incompatible');
  if (source === 'legacy' && (scope.kind !== 'personal' || data.personId !== scope.id || data.groupId != null || data.financialGroupId != null || data.ledgerGroupId != null))
    throw Error('categories/ambiguous-owner');
  if (source === 'group-root' && (scope.kind !== 'group' || (data.personId != null && typeof data.personId !== 'string') || data.groupId !== scope.id || (data.financialGroupId != null && data.financialGroupId !== scope.id)))
    throw Error('categories/ambiguous-owner');
  if (source === 'group-legacy' && (scope.kind !== 'group' || (data.groupId != null && data.groupId !== scope.id) || (data.financialGroupId != null && data.financialGroupId !== scope.id)))
    throw Error('categories/ambiguous-owner');
  if (source === 'new' && (data.scopeKind !== scope.kind || data.scopeId !== scope.id)) throw Error('categories/ambiguous-owner');
  const blocked = ['isMandatoryExpense', 'isMandatoryGain', 'showInBothLists', 'deleted']
    .some(field => data[field] != null && typeof data[field] !== 'boolean') ||
    (data.status != null && data.status !== 'active' && data.status !== 'archived') ||
    (data.usageType != null && !normalizeTagUsageType(data.usageType)) ||
    (data.usageType === 'expense' && data.isMandatoryGain === true) ||
    (data.usageType === 'gain' && data.isMandatoryExpense === true);
  const text = (value: unknown) => typeof value === 'string' ? value : null;
  return {
    id, source, name: data.name,
    usageType: blocked ? null : normalizeTagUsageType(data.usageType) ?? null,
    isMandatoryExpense: data.isMandatoryExpense === true,
    isMandatoryGain: data.isMandatoryGain === true,
    showInBothLists: data.showInBothLists === true,
    iconFamily: text(data.iconFamily), iconName: text(data.iconName), iconStyle: text(data.iconStyle),
    status: data.status === 'archived' || data.deleted === true ? 'archived' : 'active',
    revision: typeof data.revision === 'number' && Number.isSafeInteger(data.revision) ? data.revision : 0,
    blocked,
  };
}

export function categorySupports(category: Category, usage: 'expense' | 'gain'): boolean {
  return !category.blocked && category.status === 'active' && (category.usageType === usage || category.usageType === 'both');
}
