import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

test('authorized legacy access preserves historical IDs and denies ambiguous or foreign records', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-category-legacy', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'tags', 'historical'), { personId: 'owner', name: 'Sem tipo' });
      await setDoc(doc(db, '_categoryScopes', 'historical'), { scopeKind: 'personal', scopeId: 'owner' });
      await setDoc(doc(db, 'tags', 'unresolved'), { name: 'Propriedade desconhecida' });
      await setDoc(doc(db, 'expenses', 'old-movement'), { personId: 'owner', tagId: 'historical' });
    });
    const owner = env.authenticatedContext('owner').firestore();
    const other = env.authenticatedContext('other').firestore();
    const historical = await assertSucceeds(getDoc(doc(owner, 'tags', 'historical')));
    assert.equal(historical.id, 'historical');
    assert.equal(historical.data()?.usageType, undefined);
    await assertFails(getDoc(doc(other, 'tags', 'historical')));
    await assertFails(getDoc(doc(owner, 'tags', 'unresolved')));
    await assertFails(updateDoc(doc(other, 'tags', 'historical'), { name: 'Outro', updatedBy: 'other', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(owner, 'tags', 'historical'), { personId: 'other', updatedBy: 'owner', updatedAt: serverTimestamp() }));
    await env.withSecurityRulesDisabled(async context => {
      assert.equal((await getDoc(doc(context.firestore(), 'expenses', 'old-movement'))).data()?.tagId, 'historical');
    });
  } finally { await env.clearFirestore(); await env.cleanup(); }
});
