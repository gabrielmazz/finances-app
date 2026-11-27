import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, runTransaction, serverTimestamp, startAfter, where, type QueryConstraint } from 'firebase/firestore';
import type { AccountClient } from './profiles';
import { requireBankEnvironment, requireBankReadEnvironment, bankContextKey } from './banks';
import { OFFICIAL_PROJECT_ID, usesCanonicalFinance } from './config';
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
  if (usesCanonicalFinance(client.db.app.options.projectId) && ref.source !== 'new') throw Error('categories/not-found');
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
export async function readCategoryPage(client: AccountClient, scope: BankScope, source: CategorySource, cursor?: string | null, pageSize = 20, destination: CategoryDestination = 'all', status: 'active' | 'archived' | 'all' = 'all') {
  requireCategoryEnvironment(client, scope);
  const canonical = usesCanonicalFinance(client.db.app.options.projectId);
  const official = !canonical && client.db.app.options.projectId === OFFICIAL_PROJECT_ID;
  if (canonical && source !== 'new') return { items: [], issues: 0, unavailable: false, nextCursor: null };
  if ((official && source === 'new') || source === 'group-root') return { items: [], issues: 0, unavailable: true, nextCursor: null };
  const base = source === 'new' ? contextCollection(client, scope, 'categories')
    : source === 'legacy' && scope.kind === 'personal' ? collection(client.db, 'tags')
    : source === 'group-legacy' && scope.kind === 'group' ? collection(client.db, 'financialGroups', scope.id, 'tags')
    : null;
  if (!base) throw Error('categories/invalid-context');
  const filters: QueryConstraint[] = [];
  if (canonical && source === 'new' && destination === 'all' && status !== 'all') filters.push(where('status', '==', status));
  if (source === 'new' && destination !== 'all') {
    const usage = destination.endsWith('gain') ? 'gain' : 'expense';
    if (destination.startsWith('mandatory-')) {
      filters.push(where(usage === 'gain' ? 'isMandatoryGain' : 'isMandatoryExpense', '==', true));
    } else {
      filters.push(where('usageType', 'in', [usage, 'both']));
    }
  }
  if (source === 'legacy') filters.push(where('personId', '==', scope.uid), ...(official ? [] : [where('groupId', '==', null), where('financialGroupId', '==', null), where('ledgerGroupId', '==', null)]));
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 20) throw Error('categories/invalid-page');
  filters.push(orderBy(documentId()), limit(pageSize));
  if (cursor) filters.push(startAfter(cursor));
  let snap;
  try { snap = await measureRead('categories.page.' + source, () => getDocsFromServer(query(base, ...filters)), value => value.size); }
  catch (error) {
    if (source === 'legacy' && typeof error === 'object' && error && 'code' in error && error.code === 'permission-denied') return { items: [], issues: 0, unavailable: true, nextCursor: null };
    throw error;
  }
  requireCategoryEnvironment(client, scope);
  let issues = 0;
  const resolved = await Promise.all(snap.docs.map(async item => {
    const data = item.data();
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
export type CategoryDestination = 'all' | 'expense' | 'mandatory-expense' | 'gain' | 'mandatory-gain' | 'movement-expense' | 'movement-gain';
export type CategoryFilter = CategoryDestination | {
  destination: CategoryDestination;
  status: 'active' | 'archived' | 'all';
  name: string;
};

export type CategoryCursor = { sourceIndex: number; after: string | null; unavailable?: boolean };

function matchesCategoryDestination(item: Category, destination: CategoryDestination) {
  if (destination === 'all') return true;
  if (item.blocked) return false;
  const usage = destination.endsWith('gain') ? 'gain' : 'expense';
  if (destination.startsWith('movement-')) return item.usageType === usage || item.usageType === 'both';
  if (destination.startsWith('mandatory-')) return isTagVisibleInMandatoryUsageList(item, usage);
  return isTagVisibleInRegularUsageList(item, usage);
}

const searchKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export async function readCategorySlice(client: AccountClient, scope: BankScope, cursor: CategoryCursor | null, filter: CategoryFilter, isCurrent = () => true) {
  const { destination, status, name }: Exclude<CategoryFilter, string> = typeof filter === 'string'
    ? { destination: filter, status: 'active', name: '' } : filter;
  const search = searchKey(name.trim());
  const project = client.db.app.options.projectId;
  // Legacy personal roots in the emulator require a verified lookup by ID.
  const sources: CategorySource[] = usesCanonicalFinance(project) ? ['new']
    : scope.kind === 'group' ? ['new', 'group-legacy']
    : project === OFFICIAL_PROJECT_ID ? ['new', 'legacy'] : ['new'];
  const items: Category[] = [];
  let sourceIndex = cursor?.sourceIndex ?? 0;
  let after = cursor?.after ?? null;
  let unavailable = cursor?.unavailable ?? false;
  let issues = 0;
  const pageSize = 5;
  while (sourceIndex < sources.length) {
    const source = sources[sourceIndex];
    if (!isCurrent()) throw Error('session/changed');
    const result = await readCategoryPage(client, scope, source, after, search ? 20 : pageSize + 1, destination, status);
    issues += result.issues;
    unavailable ||= result.unavailable;
    for (const item of result.items) {
      if ((status === 'all' || item.status === status) && matchesCategoryDestination(item, destination)
          && (!search || searchKey(item.name).includes(search))) {
        if (items.length === pageSize) return { items, issues, unavailable, cursor: { sourceIndex, after, unavailable } };
        items.push(item);
      }
      after = item.id;
    }
    if (result.nextCursor) after = result.nextCursor;
    else { sourceIndex++; after = null; }
  }
  return { items, issues, unavailable, cursor: null };
}

export async function resolveHistoricalCategory(client: AccountClient, scope: BankScope, id: string) {
  if (usesCanonicalFinance(client.db.app.options.projectId)) return readCategory(client, scope, { id, source: 'new' });
  const official = client.db.app.options.projectId === OFFICIAL_PROJECT_ID;
  const sources: CategorySource[] = official ? (scope.kind === 'personal' ? ['legacy'] : ['group-legacy']) : scope.kind === 'personal' ? ['new', 'legacy'] : ['new', 'group-legacy', 'group-root'];
  // Validate the original ID before constructing any document path.
  categoryRef(client, scope, { id, source: 'new' });
  const matches = (await Promise.all(sources.map(async source => {
    let snapshot;
    try { snapshot = await getDocFromServer(categoryRef(client, scope, { id, source })); }
    catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'permission-denied') return null;
      throw error;
    }
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
    if (!value.usageType && current.usageType !== null) throw Error('categories/invalid-type');
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
