import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';

test('candidate rejects owner-only legacy discovery while exact reads respect protected scope', async () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  const env = await initializeTestEnvironment({ projectId: 'demo-lumus-optional-fields', firestore: { host: '127.0.0.1', port: 8089, rules } });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'banks', 'missing'), { personId: 'owner' });
      await setDoc(doc(db, 'tags', 'missing'), { personId: 'owner', name: 'Histórica' });
      for (const [root, scope] of [['banks', '_bankScopes'], ['tags', '_categoryScopes']]) {
        await setDoc(doc(db, root, 'ambiguous'), { personId: 'owner', groupId: null, financialGroupId: null, ledgerGroupId: null });
        await setDoc(doc(db, scope, 'ambiguous'), { scopeKind: 'group', scopeId: 'another-group' });
        await setDoc(doc(db, root, 'invalid-binding'), { personId: 'owner' });
        await setDoc(doc(db, scope, 'invalid-binding'), { scopeKind: 'personal', scopeId: 'owner', groupId: 'another-group' });
      }
    });
    const owner = env.authenticatedContext('owner').firestore();
    const stranger = env.authenticatedContext('stranger').firestore();
    for (const root of ['banks', 'tags']) {
      await assertSucceeds(getDoc(doc(owner, root, 'missing')));
      await assertFails(getDoc(doc(stranger, root, 'missing')));
      await assertFails(getDoc(doc(owner, root, 'ambiguous')));
      await assertFails(getDoc(doc(owner, root, 'invalid-binding')));
      await assertFails(getDocs(query(collection(owner, root), where('personId', '==', 'owner'), limit(20))));
    }
    await assertFails(getDoc(doc(owner, '_bankScopes', 'invalid-binding')));
  } finally { await env.cleanup(); }
});
