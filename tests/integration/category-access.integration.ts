import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, limit, serverTimestamp } from 'firebase/firestore';
import { readCategory } from '../../firebase/categories';

let env: RulesTestEnvironment;
const generation = 'category-access-generation';
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'financialGroups', 'verified'), { status: 'active' });
    for (const uid of ['creator', 'member']) await setDoc(doc(db, '_authorizations', uid), { generation, enabled: true, readOwners: [], groups: { verified: uid === 'creator' ? 'admin' : 'member' } });
    await setDoc(doc(db, 'tags', 'group-tag'), { name: 'Sem tipo', personId: 'creator', groupId: 'verified' });
    await setDoc(doc(db, 'tags', 'unverified-tag'), { name: 'Ambígua', personId: 'creator', groupId: 'verified' });
    await setDoc(doc(db, 'tags', 'x'.repeat(600)), { name: 'Sem criador', groupId: 'verified', financialGroupId: null });
    await setDoc(doc(db, '_categoryScopes', 'x'.repeat(600)), { scopeKind: 'group', scopeId: 'verified' });
    await setDoc(doc(db, 'tags', 'invalid-tag'), { name: 'Inválida', personId: 'creator', groupId: 'verified', usageType: 'expense', isMandatoryGain: true });
    await setDoc(doc(db, '_categoryScopes', 'invalid-tag'), { scopeKind: 'group', scopeId: 'verified' });
    await setDoc(doc(db, '_categoryScopes', 'group-tag'), { scopeKind: 'group', scopeId: 'verified' });
    await setDoc(doc(db, 'financialContexts', 'group:verified', 'legacyCategoryIndex', 'group-tag'), { tagId: 'group-tag' });
  });
});
after(async () => { await env.cleanup(); });
test('legacy access follows protected projection and current group membership', async () => {
  const creator = env.authenticatedContext('creator', { lumusAccess: generation }).firestore();
  const member = env.authenticatedContext('member', { lumusAccess: generation }).firestore();
  const outsider = env.authenticatedContext('outsider').firestore();
  const anonymous = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(creator, 'tags', 'group-tag')));
  await assertSucceeds(getDoc(doc(member, 'tags', 'group-tag')));
  const groupClient = { db: member, auth: { currentUser: { uid: 'member' } } } as unknown as Parameters<typeof readCategory>[0];
  const longId = 'x'.repeat(600);
  assert.equal((await readCategory(groupClient, { kind: 'group', id: 'verified', uid: 'member' }, { id: longId, source: 'group-root' })).id, longId);
  await assertFails(getDoc(doc(outsider, 'tags', 'group-tag')));
  await assertFails(getDoc(doc(anonymous, 'tags', 'group-tag')));
  await assertFails(getDoc(doc(creator, 'tags', 'unverified-tag')));
  await assertSucceeds(getDocs(query(collection(member, 'financialContexts', 'group:verified', 'legacyCategoryIndex'), limit(5))));
  await assertFails(setDoc(doc(member, '_categoryScopes', 'unverified-tag'), { scopeKind: 'group', scopeId: 'verified' }));
  await assertFails(setDoc(doc(member, 'financialContexts', 'group:verified', 'legacyCategoryIndex', 'unverified-tag'), { tagId: 'unverified-tag' }));
  await assertFails(updateDoc(doc(creator, 'tags', 'group-tag'), { groupId: 'other' }));
  await assertSucceeds(getDoc(doc(creator, 'tags', 'invalid-tag')));
  await assertFails(updateDoc(doc(creator, 'tags', 'invalid-tag'), { name: 'Alteração', updatedBy: 'creator', updatedAt: serverTimestamp() }));
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), '_authorizations', 'creator'), { groups: {} });
  });
  await assertFails(getDoc(doc(creator, 'tags', 'group-tag')));
});
