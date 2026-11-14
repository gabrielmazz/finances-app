import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { disableNetwork, doc, enableNetwork, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { readCategorySlice } from '../../firebase/categories';
import { getFirebaseDiagnostics } from '../../firebase/diagnostics';

let env: RulesTestEnvironment;
const scope = { kind: 'personal' as const, id: 'pager', uid: 'pager' };
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (let start = 0; start < 1007; start += 400) {
      const batch = writeBatch(db);
      for (let index = start; index < Math.min(start + 400, 1007); index++) {
        batch.set(doc(db, 'financialContexts', 'personal:pager', 'categories', `id${String(index).padStart(4,'0')}`), {
          name: `Categoria ${index}`, scopeKind: 'personal', scopeId: 'pager', usageType: index % 2 ? 'gain' : 'expense', status: 'active',
        });
      }
      await batch.commit();
    }
    const legacy = writeBatch(db);
    legacy.set(doc(db, 'tags', 'old-1'), { personId: 'pager', name: 'Histórica', usageType: 'both' });
    legacy.set(doc(db, '_categoryScopes', 'old-1'), { scopeKind: 'personal', scopeId: 'pager' });
    legacy.set(doc(db, 'financialContexts', 'personal:pager', 'legacyCategoryIndex', 'old-1'), { tagId: 'old-1' });
    await legacy.commit();
  });
});
after(async () => { await env.cleanup(); });
test('pages incrementally across more than 1000 new and legacy categories', async () => {
  const client = { db: env.authenticatedContext('pager').firestore(), auth: { currentUser: { uid: 'pager' } } } as unknown as Parameters<typeof readCategorySlice>[0];
  const before = getFirebaseDiagnostics().operations['categories.page.new']?.documents ?? 0;
  const first = await readCategorySlice(client, scope, null, 'all');
  const afterFirst = getFirebaseDiagnostics().operations['categories.page.new']?.documents ?? 0;
  assert.equal(first.items.length, 5);
  assert.ok(afterFirst - before <= 6, 'first page must not scan entire collection');
  const ids = first.items.map(item => item.id);
  let cursor = first.cursor;
  while (cursor) {
    const page = await readCategorySlice(client, scope, cursor, 'all');
    ids.push(...page.items.map(item => item.id)); cursor = page.cursor;
  }
  assert.equal(ids.length, 1008);
  assert.equal(new Set(ids).size, 1008);
  assert.equal(ids[0], 'id0000');
  assert.equal(ids.at(-1), 'old-1');
});
test('filtered pages remain ordered and a connection failure does not advance the cursor', async () => {
  const db = env.authenticatedContext('pager').firestore();
  const client = { db, auth: { currentUser: { uid: 'pager' } } } as unknown as Parameters<typeof readCategorySlice>[0];
  const first = await readCategorySlice(client, scope, null, 'gain');
  assert.deepEqual(first.items.map(item => item.id), ['id0001', 'id0003', 'id0005', 'id0007', 'id0009']);
  await disableNetwork(db);
  await assert.rejects(readCategorySlice(client, scope, first.cursor, 'gain'));
  await enableNetwork(db);
  const second = await readCategorySlice(client, scope, first.cursor, 'gain');
  assert.deepEqual(second.items.map(item => item.id), ['id0011', 'id0013', 'id0015', 'id0017', 'id0019']);
});
test('a sparse filter returns a continuation without scanning the whole collection', async () => {
  const client = { db: env.authenticatedContext('pager').firestore(), auth: { currentUser: { uid: 'pager' } } } as unknown as Parameters<typeof readCategorySlice>[0];
  const before = getFirebaseDiagnostics().operations['categories.page.new']?.documents ?? 0;
  const page = await readCategorySlice(client, scope, null, 'mandatory-gain');
  const reads = (getFirebaseDiagnostics().operations['categories.page.new']?.documents ?? 0) - before;
  assert.deepEqual(page.items, []);
  assert.ok(page.cursor);
  assert.ok(reads <= 12, `expected at most 12 documents, got ${reads}`);
});
test('an insertion before an existing cursor is visible after refreshing from the beginning', async () => {
  const client = { db: env.authenticatedContext('pager').firestore(), auth: { currentUser: { uid: 'pager' } } } as unknown as Parameters<typeof readCategorySlice>[0];
  const first = await readCategorySlice(client, scope, null, 'all');
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'financialContexts', 'personal:pager', 'categories', 'aaa'), {
      name: 'Inserida', scopeKind: 'personal', scopeId: 'pager', usageType: 'gain', status: 'active',
    });
  });
  const second = await readCategorySlice(client, scope, first.cursor, 'all');
  assert.equal(second.items.some(item => item.id === 'aaa'), false);
  const refreshed = await readCategorySlice(client, scope, null, 'all');
  assert.equal(refreshed.items[0].id, 'aaa');
});
test('refresh incorporates an external rename and archive without retaining the old cursor', async () => {
  const client = { db: env.authenticatedContext('pager').firestore(), auth: { currentUser: { uid: 'pager' } } } as unknown as Parameters<typeof readCategorySlice>[0];
  const first = await readCategorySlice(client, scope, null, 'all');
  assert.ok(first.cursor);
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await updateDoc(doc(db, 'financialContexts', 'personal:pager', 'categories', 'id0001'), { name: 'Atualizada externamente' });
    await updateDoc(doc(db, 'financialContexts', 'personal:pager', 'categories', 'id0002'), { status: 'archived' });
  });
  const refreshed = await readCategorySlice(client, scope, null, 'all');
  assert.equal(refreshed.items.find(item => item.id === 'id0001')?.name, 'Atualizada externamente');
  assert.equal(refreshed.items.some(item => item.id === 'id0002'), false);
  assert.equal(new Set(refreshed.items.map(item => `${item.source}:${item.id}`)).size, refreshed.items.length);
});
