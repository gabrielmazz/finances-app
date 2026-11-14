import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, runTransaction, serverTimestamp, startAfter, where, type QueryConstraint } from 'firebase/firestore';
import type { AccountClient } from './profiles';
import { requireBankEnvironment, requireBankReadEnvironment, bankContextKey } from './banks';
import { OFFICIAL_PROJECT_ID } from './config';
import type { BankScope } from '../domain/banks';
import { parseCategory, validateCategoryInput, type Category, type CategoryInput, type CategorySource } from '../domain/categories';
import { isTagVisibleInMandatoryUsageList, isTagVisibleInRegularUsageList } from '../utils/tagUsage';
import { measureRead } from './diagnostics';

export type CategoryRef = { id: string; source: CategorySource };

function requireCategoryEnvironment(client: AccountClient, scope: BankScope) {
  requireBankReadEnvironment(client, scope);
}

function contextCollection(client: AccountClient, scope: BankScope, name: string) {
  requireCategoryEnvironment(client, scope);
  return collection(client.db, 'financialContexts', bankContextKey(scope), name);
}
function categoryRef(client: AccountClient, scope: BankScope, ref: CategoryRef) {
  requireCategoryEnvironment(client, scope);
  if (client.db.app.options.projectId === OFFICIAL_PROJECT_ID && ref.source === 'group-root') throw Error('categories/ambiguous-owner');
  let byteLength = 0;
  try { byteLength = encodeURIComponent(ref.id).replace(/%[0-9a-f]{2}/gi, 'x').length; } catch { throw Error('categories/invalid-id'); }
  if (!ref.id || byteLength > 1500 || ref.id.includes('/') || ref.id === '.' || ref.id === '..') throw Error('categories/invalid-id');
  if (ref.source === 'new') return doc(contextCollection(client, scope, 'categories'), ref.id);
  if (ref.source === 'legacy' && scope.kind === 'personal') return doc(client.db, 'tags', ref.id);
  if (ref.source === 'group-root' && scope.kind === 'group') return doc(client.db, 'tags', ref.id);
  if (ref.source === 'group-legacy' && scope.kind === 'group') return doc(client.db, 'financialGroups', scope.id, 'tags', ref.id);
  throw Error('categories/invalid-context');
}
export function newCategoryId(client: AccountClient, scope: BankScope) {
  requireBankEnvironment(client, scope);
  return doc(contextCollection(client, scope, 'categories')).id;
}
export async function readCategory(client: AccountClient, scope: BankScope, ref: CategoryRef) {
  const snap = await getDocFromServer(categoryRef(client, scope, ref));
  requireCategoryEnvironment(client, scope);
  if (!snap.exists()) throw Error('categories/not-found');
  if (client.db.app.options.projectId === OFFICIAL_PROJECT_ID && ref.source === 'legacy' &&
      (snap.data().groupId != null || snap.data().financialGroupId != null || snap.data().ledgerGroupId != null)) throw Error('categories/ambiguous-owner');
  return parseCategory(snap.id, ref.source, snap.data(), scope);
}
export async function readCategoryPage(client: AccountClient, scope: BankScope, source: CategorySource, cursor?: string | null, pageSize = 20) {
  requireCategoryEnvironment(client, scope);
  const official = client.db.app.options.projectId === OFFICIAL_PROJECT_ID;
  if (official && (source === 'new' || source === 'group-root')) return { items: [], issues: 0, unavailable: true, nextCursor: null };
  const base = source === 'new' ? contextCollection(client, scope, 'categories')
    : source === 'legacy' && scope.kind === 'personal' && official ? collection(client.db, 'tags')
    : (source === 'legacy' && scope.kind === 'personal') || (source === 'group-root' && scope.kind === 'group') ? contextCollection(client, scope, 'legacyCategoryIndex')
    : source === 'group-legacy' && scope.kind === 'group' ? collection(client.db, 'financialGroups', scope.id, 'tags')
    : null;
  if (!base) throw Error('categories/invalid-context');
  const filters: QueryConstraint[] = [];
  if (official && source === 'legacy') filters.push(where('personId', '==', scope.uid));
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 20) throw Error('categories/invalid-page');
  filters.push(orderBy(documentId()), limit(pageSize));
  if (cursor) filters.push(startAfter(cursor));
  const snap = await measureRead('categories.page.' + source, () => getDocsFromServer(query(base, ...filters)), value => value.size);
  requireCategoryEnvironment(client, scope);
  let issues = 0;
  const resolved = await Promise.all(snap.docs.map(async item => {
    let data = item.data();
    if ((source === 'legacy' || source === 'group-root') && !official) {
      if (data.tagId !== item.id) { issues++; return null; }
      try {
        const legacy = await measureRead('categories.legacy.get', () => getDocFromServer(doc(client.db, 'tags', item.id)), () => 1);
        if (!legacy.exists()) { issues++; return null; }
        data = legacy.data();
      } catch (error) {
        if (typeof error === 'object' && error && 'code' in error && error.code === 'permission-denied') { issues++; return null; }
        throw error;
      }
    }
    try {
      if (official && source === 'legacy' && (data.groupId != null || data.financialGroupId != null || data.ledgerGroupId != null)) throw Error('categories/ambiguous-owner');
      return parseCategory(item.id, source, data, scope);
    }
    catch { issues++; return null; }
  }));
  const items = resolved.filter((item): item is Category => item !== null);
  requireCategoryEnvironment(client, scope);
  return { items, issues, unavailable: false, nextCursor: snap.size === pageSize ? snap.docs.at(-1)!.id : null };
}
export type CategoryFilter = 'all' | 'expense' | 'mandatory-expense' | 'gain' | 'mandatory-gain';
export type CategoryCursor = { sourceIndex: number; after: string | null; pending: Category[]; unavailable?: boolean };
function matchesCategoryFilter(item: Category, filter: CategoryFilter) {
  if (item.status !== 'active') return false;
  if (filter === 'all') return true;
  if (filter === 'expense' || filter === 'gain') return isTagVisibleInRegularUsageList(item, filter);
  return isTagVisibleInMandatoryUsageList(item, filter === 'mandatory-expense' ? 'expense' : 'gain');
}
export async function readCategorySlice(client: AccountClient, scope: BankScope, cursor: CategoryCursor | null, filter: CategoryFilter) {
  const sources: CategorySource[] = scope.kind === 'personal' ? ['new', 'legacy'] : ['new', 'group-legacy', 'group-root'];
  let sourceIndex = cursor?.sourceIndex ?? 0, after = cursor?.after ?? null, issues = 0, unavailable = cursor?.unavailable ?? false;
  const pending = [...(cursor?.pending ?? [])];
  let requests = 0;
  // Sparse filters must not turn a page request into a scan of the collection.
  while (pending.length < 5 && sourceIndex < sources.length && requests < 2) {
    const result = await readCategoryPage(client, scope, sources[sourceIndex], after, 6);
    requests++;
    pending.push(...result.items.filter(item => matchesCategoryFilter(item, filter)));
    issues += result.issues;
    unavailable ||= result.unavailable;
    if (result.nextCursor) after = result.nextCursor;
    else { sourceIndex++; after = null; }
  }
  const items = pending.splice(0, 5);
  return { items, issues, unavailable, cursor: pending.length || sourceIndex < sources.length ? { sourceIndex, after, pending, unavailable } : null };
}
export async function resolveHistoricalCategory(client: AccountClient, scope: BankScope, id: string) {
  const official = client.db.app.options.projectId === OFFICIAL_PROJECT_ID;
  const sources: CategorySource[] = official ? (scope.kind === 'personal' ? ['legacy'] : ['group-legacy']) : scope.kind === 'personal' ? ['new', 'legacy'] : ['new', 'group-legacy', 'group-root'];
  // Validate the original ID before constructing either the protected index or document paths.
  categoryRef(client, scope, { id, source: 'new' });
  const matches = (await Promise.all(sources.map(async source => {
    if (!official && (source === 'legacy' || source === 'group-root')) {
      const index = await getDocFromServer(doc(contextCollection(client, scope, 'legacyCategoryIndex'), id));
      if (!index.exists()) return null;
      if (index.data().tagId !== id) throw Error('categories/ambiguous');
    }
    const snapshot = await getDocFromServer(categoryRef(client, scope, { id, source }));
    if (!snapshot.exists()) return null;
    if (official && source === 'legacy' && (snapshot.data().groupId != null || snapshot.data().financialGroupId != null || snapshot.data().ledgerGroupId != null)) throw Error('categories/ambiguous');
    try { return parseCategory(id, source, snapshot.data(), scope); }
    catch { throw Error('categories/ambiguous'); }
  }))).filter((item): item is Category => item !== null);
  requireCategoryEnvironment(client, scope);
  if (matches.length !== 1) throw Error(matches.length ? 'categories/ambiguous' : 'categories/not-found');
  return matches[0];
}
export async function createCategory(client: AccountClient, scope: BankScope, id: string, input: CategoryInput) {
  requireBankEnvironment(client, scope);
  const value = validateCategoryInput(input);
  const ref = categoryRef(client, scope, { id, source: 'new' });
  // Reject offline before starting a transaction; retries reuse the same ID.
  await getDocFromServer(ref);
  requireCategoryEnvironment(client, scope);
  await runTransaction(client.db, async tx => {
    const current = await tx.get(ref);
    requireCategoryEnvironment(client, scope);
    if (current.exists()) {
      const data = current.data();
      if (data.createdBy !== scope.uid || data.status !== 'active' ||
        Object.entries(value).some(([field, content]) => data[field] !== content)) throw Error('categories/operation-conflict');
      return;
    }
    tx.set(ref, { schemaVersion: 1, scopeKind: scope.kind, scopeId: scope.id, ...value, status: 'active', revision: 0, createdBy: scope.uid, updatedBy: scope.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  return readCategory(client, scope, { id, source: 'new' });
}

export async function updateCategory(client: AccountClient, scope: BankScope, expected: Category, input: Omit<CategoryInput, 'usageType'> & { usageType: CategoryInput['usageType'] | null }) {
  requireBankEnvironment(client, scope);
  const validated = validateCategoryInput({ ...input, usageType: input.usageType ?? 'both' });
  const value = { ...validated, usageType: input.usageType };
  const ref = categoryRef(client, scope, expected);
  await getDocFromServer(ref);
  requireCategoryEnvironment(client, scope);
  await runTransaction(client.db, async tx => {
    const snap = await tx.get(ref);
    requireCategoryEnvironment(client, scope);
    if (!snap.exists()) throw Error('categories/not-found');
    const current = parseCategory(snap.id, expected.source, snap.data(), scope);
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw Error('categories/conflict');
    if (current.blocked) throw Error('categories/ambiguous');
    if (current.status !== 'active') throw Error('categories/archived');
    if (expected.source !== 'new') {
      const availabilityChanged = current.usageType !== value.usageType || current.isMandatoryExpense !== value.isMandatoryExpense || current.isMandatoryGain !== value.isMandatoryGain || current.showInBothLists !== value.showInBothLists;
      if (availabilityChanged && !value.usageType) throw Error('categories/invalid-type');
      const availability = availabilityChanged ? { usageType: value.usageType, isMandatoryExpense: value.isMandatoryExpense, isMandatoryGain: value.isMandatoryGain, showInBothLists: value.showInBothLists } : {};
      tx.update(ref, { name: value.name, iconFamily: value.iconFamily, iconName: value.iconName, iconStyle: value.iconStyle, ...availability, updatedBy: scope.uid, updatedAt: serverTimestamp() });
      return;
    }
    if (!value.usageType) throw Error('categories/invalid-type');
    tx.update(ref, { ...value, revision: current.revision + 1, updatedBy: scope.uid, updatedAt: serverTimestamp() });
  });
  return readCategory(client, scope, expected);
}

export async function archiveCategory(client: AccountClient, scope: BankScope, expected: Category) {
  requireBankEnvironment(client, scope);
  const ref = categoryRef(client, scope, expected);
  await getDocFromServer(ref);
  requireCategoryEnvironment(client, scope);
  await runTransaction(client.db, async tx => {
    const snap = await tx.get(ref);
    requireCategoryEnvironment(client, scope);
    if (!snap.exists()) throw Error('categories/not-found');
    const current = parseCategory(snap.id, expected.source, snap.data(), scope);
    if (current.status === 'archived') {
      const previous = { ...current, status: expected.status, revision: expected.revision };
      const sameRevision = current.revision === expected.revision + (expected.status === 'active' && expected.source === 'new' ? 1 : 0);
      if (sameRevision && JSON.stringify(previous) === JSON.stringify(expected)) return;
      throw Error('categories/conflict');
    }
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw Error('categories/conflict');
    if (current.blocked) throw Error('categories/ambiguous');
    if (expected.source === 'new') {
      tx.update(ref, { status: 'archived', revision: current.revision + 1, updatedBy: scope.uid, updatedAt: serverTimestamp() });
    } else {
      tx.update(ref, { deleted: true, updatedBy: scope.uid, updatedAt: serverTimestamp() });
    }
  });
  return readCategory(client, scope, expected);
}
