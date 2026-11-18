import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';

// Regression for the previous pointer approach: stale metadata must not be readable.
test('legacy pointer documents cannot disclose metadata after an association change', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'banks', 'historic'), { personId: 'owner', groupId: 'foreign' });
      for (const index of ['legacyBankReadIndex', 'legacyMovementReadIndex'])
        await setDoc(doc(db, 'financialContexts', 'personal:owner', index, 'stale'), { bankId: 'historic' });
    });
    const owner = env.authenticatedContext('owner').firestore();
    await assertFails(getDoc(doc(owner, 'banks', 'historic')));
    for (const index of ['legacyBankReadIndex', 'legacyMovementReadIndex']) {
      await assertFails(getDoc(doc(owner, 'financialContexts', 'personal:owner', index, 'stale')));
      await assertFails(getDocs(query(collection(owner, 'financialContexts', 'personal:owner', index), limit(20))));
      await assertFails(setDoc(doc(owner, 'financialContexts', 'personal:owner', index, 'forged'), { bankId: 'historic' }));
    }
  } finally { await env.cleanup(); }
});

test('bounded explicit personal legacy query preserves isolation', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'banks', 'personal'), { personId: 'owner', groupId: null, financialGroupId: null, ledgerGroupId: null });
      await setDoc(doc(db, 'banks', 'group'), { personId: 'owner', groupId: 'foreign', financialGroupId: null, ledgerGroupId: null });
    });
    const db = env.authenticatedContext('owner').firestore();
    const result = await assertSucceeds(getDocs(query(collection(db, 'banks'), where('personId', '==', 'owner'), where('groupId', '==', null), where('financialGroupId', '==', null), where('ledgerGroupId', '==', null), limit(20))));
    if (result.docs.length !== 1 || result.docs[0].id !== 'personal') throw Error('Legacy query returned unexpected records');
    await assertFails(getDoc(doc(db, 'banks', 'group')));
  } finally { await env.cleanup(); }
});
