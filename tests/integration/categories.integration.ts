import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, getFirestore, connectFirestoreEmulator, disableNetwork, enableNetwork } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { createCategory, readCategory, readCategoryPage, updateCategory, archiveCategory, resolveHistoricalCategory } from '../../firebase/categories';

let env: RulesTestEnvironment;
const key = 'personal:owner', id = 'category000000000001';
const category = () => ({ schemaVersion: 1, scopeKind: 'personal', scopeId: 'owner', name: 'Mercado', usageType: 'expense', isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null, status: 'active', revision: 0, createdBy: 'owner', updatedBy: 'owner', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const path of [`financialContexts/${key}/categories/${id}`, 'financialContexts/group:family/categories/groupcategory0000001']) await deleteDoc(doc(db, path));
  });
});
after(async () => { await env.cleanup(); });
test('category create requires an authenticated owner without setup', async () => {
  const owner = env.authenticatedContext('owner').firestore();
  const foreign = env.authenticatedContext('other').firestore();
  const anonymous = env.unauthenticatedContext().firestore();
  const path = `financialContexts/${key}/categories/${id}`;
  await assertFails(setDoc(doc(foreign, path), { ...category(), createdBy: 'other', updatedBy: 'other' }));
  await assertFails(setDoc(doc(anonymous, path), category()));
  await assertSucceeds(setDoc(doc(owner, path), category()));
  await assertSucceeds(getDoc(doc(owner, path)));
  await assertFails(getDoc(doc(foreign, path)));
  await assertFails(getDoc(doc(anonymous, path)));
  assert.equal((await getDoc(doc(owner, path))).data()?.name, 'Mercado');
});
test('category update protects owner, context and historical identity', async () => {
  const owner = env.authenticatedContext('owner').firestore();
  const other = env.authenticatedContext('other').firestore();
  const ref = doc(owner, `financialContexts/${key}/categories/${id}`);
  await assertFails(updateDoc(ref, { scopeId: 'other', revision: 1, updatedBy: 'owner', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { isMandatoryGain: true, revision: 1, updatedBy: 'owner', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(other, ref.path), { name: 'Invadida', revision: 1, updatedBy: 'other', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { iconFamily: 'ionicons', iconName: 'cart-outline', revision: 1, updatedBy: 'owner', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { status: 'archived', revision: 2, updatedBy: 'owner', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { status: 'active', revision: 3, updatedBy: 'owner', updatedAt: serverTimestamp() }));
});
test('category operations persist while legacy IDs and references survive archival', async () => {
  const app = initializeApp({ projectId: 'demo-lumus-foundation', apiKey: 'demo-key' }, 'category-client');
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8089);
  const user = (await createUserWithEmailAndPassword(auth, `category-${Date.now()}@lumus.test`, 'Test-pass-123!')).user;
  const scope = { kind: 'personal' as const, id: user.uid, uid: user.uid };
  const client = { auth, db };
  const input = { name: 'Transporte', usageType: 'expense' as const, isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null };
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'tags', 'historic-id'), { personId: user.uid, name: 'Antiga', usageType: 'both' });
    await setDoc(doc(context.firestore(), 'tags', 'untyped-id'), { personId: user.uid, name: 'Sem tipo' });
    for (const id of ['historic-id', 'untyped-id']) {
      await setDoc(doc(context.firestore(), '_categoryScopes', id), { scopeKind: 'personal', scopeId: user.uid });
      await setDoc(doc(context.firestore(), 'financialContexts', `personal:${user.uid}`, 'legacyCategoryIndex', id), { tagId: id });
    }
    await setDoc(doc(context.firestore(), 'expenses', 'historic-movement'), { personId: user.uid, tagId: 'historic-id' });
    await setDoc(doc(context.firestore(), 'financialContexts', `personal:${user.uid}`, 'categories', 'oldCategory000000001'), {
      schemaVersion: 1, scopeKind: 'personal', scopeId: user.uid, name: 'Categoria anterior', usageType: 'expense', isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null, nameKey: 'expense~categoria%20anterior', status: 'active', revision: 0, createdBy: user.uid, updatedBy: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await setDoc(doc(context.firestore(), 'financialContexts', `personal:${user.uid}`, 'categoryNames', 'expense~categoria%20anterior'), { categoryId: 'oldCategory000000001' });
  });
  const untyped = await readCategory(client, scope, { source: 'legacy', id: 'untyped-id' });
  assert.equal(untyped.usageType, null);
  const updatedUntyped = await updateCategory(client, scope, untyped, { ...input, name: 'Sem tipo editada', usageType: null });
  assert.equal(updatedUntyped.usageType, null);
  const explicitlyTyped = await updateCategory(client, scope, updatedUntyped, { ...input, name: updatedUntyped.name, usageType: 'gain' });
  assert.equal(explicitlyTyped.usageType, 'gain');
  const previous = await readCategory(client, scope, { source: 'new', id: 'oldCategory000000001' });
  const previousEdited = await updateCategory(client, scope, previous, { ...input, name: 'Categoria anterior editada' });
  assert.equal((await archiveCategory(client, scope, previousEdited)).id, previous.id);
  await env.withSecurityRulesDisabled(async context => {
    const old = await getDoc(doc(context.firestore(), 'financialContexts', `personal:${user.uid}`, 'categories', previous.id));
    const oldReservation = await getDoc(doc(context.firestore(), 'financialContexts', `personal:${user.uid}`, 'categoryNames', 'expense~categoria%20anterior'));
    assert.equal(old.data()?.nameKey, 'expense~categoria%20anterior');
    assert.equal(oldReservation.data()?.categoryId, previous.id);
  });
  const concurrent = await Promise.allSettled([
    createCategory(client, scope, 'raceCategory00000001', { ...input, name: 'Simultânea' }),
    createCategory(client, scope, 'raceCategory00000002', { ...input, name: 'Simultânea' }),
  ]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 2);
  await disableNetwork(db);
  await assert.rejects(createCategory(client, scope, 'offlineCategory00001', { ...input, name: 'Offline' }));
  await enableNetwork(db);
  await assert.rejects(readCategory(client, scope, { id: 'offlineCategory00001', source: 'new' }), /not-found/);
  const fresh = await createCategory(client, scope, 'newCategory000000001', input);
  assert.equal(fresh.name, 'Transporte');
  const gain = await createCategory(client, scope, 'gainCategory00000001', { ...input, name: "McDonald's / 🐶", usageType: 'gain' });
  assert.equal(gain.usageType, 'gain');
  assert.equal((await readCategory(client, scope, gain)).name, "McDonald's / 🐶");
  assert.equal((await createCategory(client, scope, 'newCategory000000001', input)).id, fresh.id);
  assert.equal((await createCategory(client, scope, 'newCategory000000002', { ...input, name: 'transporte' })).name, 'transporte');
  const changed = await updateCategory(client, scope, fresh, { ...input, iconFamily: 'ionicons', iconName: 'car-outline' });
  assert.equal(changed.iconName, 'car-outline');
  const renamed = await updateCategory(client, scope, changed, { ...input, name: 'Deslocamento', iconFamily: 'ionicons', iconName: 'car-outline' });
  assert.equal(renamed.id, fresh.id);
  assert.equal(renamed.name, 'Deslocamento');
  const legacy = await readCategory(client, scope, { source: 'legacy', id: 'historic-id' });
  assert.equal(legacy.usageType, 'both');
  assert.ok((await readCategoryPage(client, scope, 'legacy')).items.some(item => item.id === 'historic-id'));
  assert.equal((await archiveCategory(client, scope, legacy)).status, 'archived');
  assert.equal((await resolveHistoricalCategory(client, scope, 'historic-id')).status, 'archived');
  await assert.rejects(resolveHistoricalCategory(client, scope, 'unknown-id'), /not-found/);
  assert.equal((await archiveCategory(client, scope, legacy)).status, 'archived');
  assert.equal((await archiveCategory(client, scope, renamed)).status, 'archived');
  assert.equal((await archiveCategory(client, scope, renamed)).status, 'archived');
  assert.equal((await createCategory(client, scope, 'newCategory000000003', { ...input, name: 'Deslocamento' })).name, 'Deslocamento');
  await env.withSecurityRulesDisabled(async context => {
    assert.equal((await getDoc(doc(context.firestore(), 'expenses', 'historic-movement'))).data()?.tagId, 'historic-id');
  });
  await deleteApp(app);
});
test('group categories require verified membership and admin authority', async () => {
  const generation = 'category-test-generation';
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'financialGroups', 'family'), { status: 'active' });
    await setDoc(doc(db, 'financialGroups', 'family', 'tags', 'nested-legacy'), { name: 'Casa', usageType: 'expense' });
    await setDoc(doc(db, 'financialGroups', 'family', 'tags', 'nested-accent'), { name: 'SAÚDE', usageType: 'expense' });
    await setDoc(doc(db, 'tags', 'historic.group.id'), { personId: 'admin', groupId: 'family', name: 'Grupo legada', usageType: 'both' });
    await setDoc(doc(db, '_categoryScopes', 'historic.group.id'), { scopeKind: 'group', scopeId: 'family' });
    await setDoc(doc(db, 'financialContexts', 'group:family', 'legacyCategoryIndex', 'historic.group.id'), { tagId: 'historic.group.id' });
    await setDoc(doc(db, '_authorizations', 'admin'), { generation, enabled: true, readOwners: [], groups: { family: 'admin' } });
    await setDoc(doc(db, '_authorizations', 'member'), { generation, enabled: true, readOwners: [], groups: { family: 'member' } });
  });
  const admin = env.authenticatedContext('admin', { lumusAccess: generation }).firestore();
  const member = env.authenticatedContext('member', { lumusAccess: generation }).firestore();
  const stranger = env.authenticatedContext('stranger').firestore();
  const path = 'financialContexts/group:family/categories/groupcategory0000001';
  const data = { ...category(), scopeKind: 'group', scopeId: 'family', name: 'Salário', usageType: 'gain', createdBy: 'admin', updatedBy: 'admin' };
  await assertFails(setDoc(doc(member, path), { ...data, createdBy: 'member', updatedBy: 'member' }));
  await assertSucceeds(setDoc(doc(admin, path), data));
  await assertSucceeds(getDoc(doc(member, path)));
  await assertSucceeds(getDoc(doc(admin, 'tags', 'historic.group.id')));
  const groupClient = { db: admin, auth: { currentUser: { uid: 'admin' } } } as unknown as Parameters<typeof readCategory>[0];
  const groupScope = { kind: 'group' as const, id: 'family', uid: 'admin' };
  const historic = await readCategory(groupClient, groupScope, { source: 'group-root', id: 'historic.group.id' });
  assert.equal(historic.usageType, 'both');
  assert.ok((await readCategoryPage(groupClient, groupScope, 'group-root')).items.some(item => item.id === 'historic.group.id'));
  const nested = await readCategory(groupClient, groupScope, { source: 'group-legacy', id: 'nested-legacy' });
  const renamed = await updateCategory(groupClient, groupScope, nested, { name: 'Moradia', usageType: 'expense', isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null });
  assert.equal(renamed.id, 'nested-legacy');
  assert.equal(renamed.name, 'Moradia');
  const accented = await readCategory(groupClient, groupScope, { source: 'group-legacy', id: 'nested-accent' });
  const accentedRenamed = await updateCategory(groupClient, groupScope, accented, { name: 'ALIMENTAÇÃO', usageType: 'expense', isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null });
  assert.equal(accentedRenamed.id, 'nested-accent');
  await assertSucceeds(getDoc(doc(member, 'tags', 'historic.group.id')));
  await assertFails(getDoc(doc(stranger, path)));
  await assertFails(updateDoc(doc(member, path), { name: 'Outro', revision: 1, updatedBy: 'member', updatedAt: serverTimestamp() }));
});
test('legacy and new categories may share the same name while preserving their IDs', async () => {
  const uid = 'category-race-owner', contextKey = `personal:${uid}`;
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [id, name] of [['legacy-race-a', 'Antiga A'], ['legacy-race-b', 'Antiga B'], ['legacy-race-c', 'Antiga C']]) {
      await setDoc(doc(db, 'tags', id), { personId: uid, name, usageType: 'expense' });
      await setDoc(doc(db, '_categoryScopes', id), { scopeKind: 'personal', scopeId: uid });
      await setDoc(doc(db, 'financialContexts', contextKey, 'legacyCategoryIndex', id), { tagId: id });
    }
  });
  const db = env.authenticatedContext(uid).firestore();
  const client = { db, auth: { currentUser: { uid } } } as unknown as Parameters<typeof readCategory>[0];
  const scope = { kind: 'personal' as const, id: uid, uid };
  const input = { name: 'Mesmo nome', usageType: 'expense' as const, isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null };
  const first = await readCategory(client, scope, { id: 'legacy-race-a', source: 'legacy' });
  const second = await readCategory(client, scope, { id: 'legacy-race-b', source: 'legacy' });
  const changes = await Promise.allSettled([updateCategory(client, scope, first, input), updateCategory(client, scope, second, input)]);
  assert.equal(changes.filter(result => result.status === 'fulfilled').length, 2);
  const third = await readCategory(client, scope, { id: 'legacy-race-c', source: 'legacy' });
  const mixed = await Promise.allSettled([
    updateCategory(client, scope, third, { ...input, name: 'Novo nome' }),
    createCategory(client, scope, 'raceMixedCategory001', { ...input, name: 'Novo nome' }),
  ]);
  assert.equal(mixed.filter(result => result.status === 'fulfilled').length, 2);
  const legacyPage = await readCategoryPage(client, scope, 'legacy');
  const newPage = await readCategoryPage(client, scope, 'new');
  assert.equal([...legacyPage.items, ...newPage.items].filter(item => item.name === 'Novo nome' && item.status === 'active').length, 2);
  assert.equal(legacyPage.items.some(item => item.id === 'legacy-race-c'), true);
});
