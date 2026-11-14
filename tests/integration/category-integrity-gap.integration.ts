import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
});
after(async () => { await env.cleanup(); });

test('category writes require the authenticated context owner and preserve protected fields', async () => {
  const owner = env.authenticatedContext('security-owner').firestore();
  const other = env.authenticatedContext('security-other').firestore();
  const anonymous = env.unauthenticatedContext().firestore();
  const path = 'financialContexts/personal:security-owner/categories/securitycategory0001';
  const data = { schemaVersion: 1, scopeKind: 'personal', scopeId: 'security-owner', name: "McDonald's / 🐶", usageType: 'expense', isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null, status: 'active', revision: 0, createdBy: 'security-owner', updatedBy: 'security-owner', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await assertFails(setDoc(doc(other, path), { ...data, createdBy: 'security-other', updatedBy: 'security-other' }));
  await assertFails(setDoc(doc(anonymous, path), data));
  await assertSucceeds(setDoc(doc(owner, path), data));
  await assertFails(getDoc(doc(other, path)));
  await assertFails(updateDoc(doc(other, path), { name: 'Invadida', revision: 1, updatedBy: 'security-other', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(owner, path), { createdBy: 'security-other', revision: 1, updatedBy: 'security-owner', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(owner, path), { scopeId: 'security-other', revision: 1, updatedBy: 'security-owner', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(owner, path), { usageType: 'invalid', revision: 1, updatedBy: 'security-owner', updatedAt: serverTimestamp() }));
});
