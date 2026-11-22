import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { readCategoryPage } from '../../firebase/categories';
import { readMovementTimeline } from '../../firebase/movements';

test('stale legacy discovery pointers remain inaccessible even to their former owner', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async context => {
      for (const index of ['legacyBankReadIndex', 'legacyMovementReadIndex', 'legacyCategoryIndex']) {
        await setDoc(doc(context.firestore(), 'financialContexts', 'personal:owner', index, 'stale'), { bankId: 'old-bank' });
      }
    });
    for (const index of ['legacyBankReadIndex', 'legacyMovementReadIndex', 'legacyCategoryIndex']) {
      await assertFails(getDoc(doc(env.authenticatedContext('owner').firestore(), 'financialContexts', 'personal:owner', index, 'stale')));
    }
  } finally { await env.cleanup(); }
});

test('a historical movement with an untyped category remains visible without assigning a category type', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'tags', 'untyped-timeline'), { personId: 'owner', name: 'Untyped' });
      await setDoc(doc(db, 'expenses', 'historical-untyped'), { personId: 'owner', groupId: null, financialGroupId: null, ledgerGroupId: null, bankId: 'old-bank', tagId: 'untyped-timeline', name: 'Expense', valueInCents: 100, date: Timestamp.fromDate(new Date('2025-01-10T12:00:00Z')) });
    });
    const db = env.authenticatedContext('owner').firestore();
    const client = { db, auth: { currentUser: { uid: 'owner' } } } as unknown as Parameters<typeof readMovementTimeline>[0];
    const result = await readMovementTimeline(client, { kind: 'personal', id: 'owner', uid: 'owner' }, 'old-bank', new Date('2025-01-01T00:00:00Z'), new Date('2025-02-01T00:00:00Z'));
    if (!result.items.some(item => item.id === 'historical-untyped' && item.type === 'expense' && item.tagName === 'Untyped')) throw Error('Historical movement was omitted');
    const original = await getDoc(doc(db, 'tags', 'untyped-timeline'));
    if ('usageType' in original.data()!) throw Error('Historical category type was invented');
  } finally { await env.cleanup(); }
});

test('a protected group binding cannot be bypassed by missing legacy group fields', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'banks', 'bound-group'), { personId: 'owner', name: 'Bank' });
      await setDoc(doc(db, '_bankScopes', 'bound-group'), { scopeKind: 'group', scopeId: 'foreign' });
      await setDoc(doc(db, 'tags', 'bound-group'), { personId: 'owner', name: 'Category' });
      await setDoc(doc(db, '_categoryScopes', 'bound-group'), { scopeKind: 'group', scopeId: 'foreign' });
    });
    const db = env.authenticatedContext('owner').firestore();
    await assertFails(getDoc(doc(db, 'banks', 'bound-group')));
    await assertFails(getDoc(doc(db, 'tags', 'bound-group')));
  } finally { await env.cleanup(); }
});

test('a contradictory group binding cannot be bypassed through personal list queries', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      for (const [source, binding] of [['banks', '_bankScopes'], ['tags', '_categoryScopes']]) {
        await setDoc(doc(db, source, 'contradictory'), { personId: 'owner', groupId: null, financialGroupId: null, ledgerGroupId: null });
        await setDoc(doc(db, binding, 'contradictory'), { scopeKind: 'group', scopeId: 'foreign' });
      }
      await setDoc(doc(db, 'banks', 'moved'), { personId: 'owner', groupId: 'foreign' });
      await setDoc(doc(db, '_bankScopes', 'moved'), { scopeKind: 'personal', scopeId: 'owner' });
    });
    const db = env.authenticatedContext('owner').firestore();
    for (const source of ['banks', 'tags']) {
      await assertFails(getDocs(query(collection(db, source), where('personId', '==', 'owner'), where('groupId', '==', null), where('financialGroupId', '==', null), where('ledgerGroupId', '==', null), limit(20))));
    }
    await assertFails(getDoc(doc(db, '_bankScopes', 'moved')));
    await assertFails(getDocs(query(collection(db, '_bankScopes'), where('scopeKind', '==', 'personal'), where('scopeId', '==', 'owner'), limit(20))));
    await assertFails(updateDoc(doc(db, 'banks', 'contradictory'), { name: 'Modified', bankIconKey: 'other', institutionName: 'Bank', accountType: 'checking', colorHex: null, metadataRevision: 1, updatedBy: 'owner', updatedAt: serverTimestamp() }));
  } finally { await env.cleanup(); }
});

test('an admin cannot modify legacy records with a contradictory ledger group', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'financialGroups', 'team'), { status: 'active' });
      await setDoc(doc(db, '_authorizations', 'admin'), { generation: 'gen', enabled: true, readOwners: [], groups: { team: 'admin' } });
      await setDoc(doc(db, 'financialGroups', 'team', 'accounts', 'bad'), { name: 'Bank', ledgerGroupId: 'other' });
      await setDoc(doc(db, 'financialGroups', 'team', 'tags', 'bad'), { name: 'Category', ledgerGroupId: 'other' });
    });
    const db = env.authenticatedContext('admin', { lumusAccess: 'gen' }).firestore();
    await assertFails(updateDoc(doc(db, 'financialGroups', 'team', 'accounts', 'bad'), { name: 'Modified', bankIconKey: 'other', institutionName: 'Bank', accountType: 'checking', colorHex: null, metadataRevision: 1, updatedBy: 'admin', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'financialGroups', 'team', 'tags', 'bad'), { name: 'Modified', updatedBy: 'admin', updatedAt: serverTimestamp() }));
  } finally { await env.cleanup(); }
});

test('personal legacy category resolves by ID while unsafe discovery stays unavailable', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'tags', 'personal'), { personId: 'owner', groupId: null, financialGroupId: null, ledgerGroupId: null, name: 'Category', usageType: 'both' });
      await setDoc(doc(context.firestore(), 'tags', 'group'), { personId: 'owner', groupId: 'foreign', financialGroupId: null, ledgerGroupId: null, name: 'Group' });
    });
    const db = env.authenticatedContext('owner').firestore();
    const client = { db, auth: { currentUser: { uid: 'owner' } } } as unknown as Parameters<typeof readCategoryPage>[0];
    const result = await readCategoryPage(client, { kind: 'personal', id: 'owner', uid: 'owner' }, 'legacy');
    if (!result.unavailable || result.items.length) throw Error('Legacy category discovery must stay closed');
    await assertSucceeds(getDoc(doc(db, 'tags', 'personal')));
    await assertFails(getDoc(doc(db, 'tags', 'group')));
  } finally { await env.cleanup(); }
});
