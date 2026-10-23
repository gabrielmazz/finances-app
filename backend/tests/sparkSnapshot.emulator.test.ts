import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { canonical, dataDigest, inventorySnapshot, LocalFirestore, type Fields } from '../scripts/lib/sparkLocalSnapshot';

const projectId = 'demo-lumus-snapshot';
const host = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const hub = process.env.FIREBASE_EMULATOR_HUB ?? '';
if (process.env.GCLOUD_PROJECT !== projectId) throw new Error('Ensaio exige projeto demo-lumus-snapshot criado pelo runner.');
const client = new LocalFirestore(projectId, host, hub);
const artifacts = { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), indexes: readFileSync(resolve(__dirname, '../../firestore.indexes.json'), 'utf8') };
let environment: RulesTestEnvironment;
const put = async (rows: Array<{ path: string; fields: Fields }>) => {
  for (let offset = 0; offset < rows.length; offset += 100) await client.call(':commit', 'POST', { writes: rows.slice(offset, offset + 100).map(row => ({
    update: { name: `projects/${projectId}/databases/(default)/documents/${row.path}`, fields: row.fields }, currentDocument: { exists: false },
  })) });
};
before(async () => {
  await client.assertIsolatedEmulator();
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: Number(host.split(':').at(-1)),
    rules: 'rules_version = "2"; service cloud.firestore { match /databases/{db}/documents { match /{path=**} { allow read, write: if false; } } }' } });
});
beforeEach(async () => { await environment.clearFirestore(); }); // somente fixture demo-* do harness, nunca o utilitário de restore.
after(async () => { await environment?.cleanup(); });

test('restaura caminhos e tipos após paginação de coleções/documentos e pais inexistentes', { timeout: 120_000 }, async () => {
  const rows: Array<{ path: string; fields: Fields }> = [
    { path: 'unknown/typed', fields: {
      huge: { integerValue: '9223372036854775807' }, min: { integerValue: '-9223372036854775808' },
      at: { timestampValue: '2026-10-18T12:00:00.123456Z' }, bytes: { bytesValue: 'AAEC/w==' },
      ref: { referenceValue: `projects/${projectId}/databases/(default)/documents/users/missing` },
      nan: { doubleValue: 'NaN' }, inf: { doubleValue: 'Infinity' }, minusInf: { doubleValue: '-Infinity' }, negativeZero: { doubleValue: -0 },
      point: { geoPointValue: { latitude: -23.5, longitude: -46.6 } }, zeroPoint: { geoPointValue: {} }, equator: { geoPointValue: { longitude: 15 } }, map: { mapValue: { fields: {} } }, array: { arrayValue: { values: [] } },
      nil: { nullValue: null }, flag: { booleanValue: true },
      nested: { arrayValue: { values: [{ mapValue: { fields: { amount: { integerValue: '123' } } } }] } },
    } },
    { path: 'empty/document', fields: {} },
    { path: 'sparkOperationRecovery/synthetic', fields: { schemaVersion: { integerValue: '1' }, groupId: { stringValue: 'synthetic-group' },
      operationId: { stringValue: 'cancelled_action_123456' }, updatedAt: { timestampValue: '2026-10-22T12:00:00.123456Z' } } },
    { path: 'sparkOperationRecovery/synthetic/intents/cancelled_action_123456', fields: { schemaVersion: { integerValue: '1' },
      groupId: { stringValue: 'synthetic-group' }, kind: { stringValue: 'transfer' }, status: { stringValue: 'cancelled' },
      createdAt: { timestampValue: '2026-10-22T12:00:00.123456Z' }, updatedAt: { timestampValue: '2026-10-22T12:00:01.123456Z' } } },
    { path: 'sparkOperationIntentQuotas/synthetic', fields: { groupId: { stringValue: 'synthetic-group' }, operationId: { stringValue: 'cancelled_action_123456' },
      windowStartInMillis: { integerValue: '1792670400000' }, count: { integerValue: '1' }, updatedAt: { timestampValue: '2026-10-22T12:00:00.123456Z' } } },
    { path: 'financialGroups/missing/sparkHistorySegments/bank/nodes/two', fields: { nodeCount: { integerValue: '2' } } },
    { path: 'special/space % ? ç', fields: { text: { stringValue: 'synthetic' } } },
  ];
  for (let index = 0; index < 205; index++) rows.push({ path: `many/doc${String(index).padStart(3, '0')}`, fields: { cents: { integerValue: String(index) } } });
  for (let index = 0; index < 107; index++) rows.push({ path: `root${String(index).padStart(3, '0')}/one`, fields: {} });
  await put(rows);
  const snapshot = await client.capture(artifacts);
  assert.equal(snapshot.documents.length, rows.length);
  assert.equal(snapshot.documents.find(row => row.path === 'unknown/typed')?.fields.at.timestampValue, '2026-10-18T12:00:00.123456Z');
  assert.equal(snapshot.documents.some(row => row.path === 'financialGroups/missing'), false);
  assert.equal(snapshot.documents.some(row => row.path === 'financialGroups/missing/sparkHistorySegments/bank'), false);
  assert.equal(snapshot.documents.find(row => row.path === 'unknown/typed')?.fields.huge.integerValue, '9223372036854775807');
  const inventory = inventorySnapshot(snapshot);
  assert.equal(inventory.collections.many, 205); assert.equal(inventory.collections['financialGroups/{id}/sparkHistorySegments/{id}/nodes'], 1);
  await environment.clearFirestore();
  const result = await client.restore(JSON.parse(canonical(snapshot)));
  assert.equal(result.verified, true); assert.equal(result.documents, rows.length);
  assert.equal(result.dataSha256, dataDigest(snapshot.documents)); assert.equal(result.serverMetadataPreserved, false);
  assert.equal(result.rulesApplied, false); assert.equal(result.authIncluded, false);
  const restored = await client.scan(); assert.equal(dataDigest(restored), dataDigest(snapshot.documents));
});

test('destino ocupado e snapshot adulterado não sofrem alteração', async () => {
  await put([{ path: 'keep/original', fields: { value: { integerValue: '9' } } }]);
  const snapshot = await client.capture(artifacts), previous = dataDigest(await client.scan());
  await assert.rejects(client.restore(snapshot), /vazio/); assert.equal(dataDigest(await client.scan()), previous);
  snapshot.documents[0].fields.value = { integerValue: '99' };
  await assert.rejects(client.restore(snapshot), /Integridade/); assert.equal(dataDigest(await client.scan()), previous);
});

test('precondição create-only impede sobrescrever mesmo com corrida entre lotes', async () => {
  await put([{ path: 'keep/original', fields: { value: { integerValue: '9' } } }]);
  await assert.rejects(put([{ path: 'keep/original', fields: { value: { integerValue: '11' } } }, { path: 'keep/other', fields: {} }]));
  const documents = await client.scan(); assert.equal(documents.length, 1); assert.equal(documents[0].fields.value.integerValue, '9');
});

test('CLI gera cópia privada, inventário e dry-run; recusa saída existente e restore ocupado', { timeout: 30_000 }, async () => {
  await put([{ path: 'banks/synthetic', fields: { personId: { stringValue: 'owner' }, amount: { integerValue: '100' } } }]);
  const directory = mkdtempSync(resolve(tmpdir(), 'lumus-snapshot-'));
  const execute = promisify(execFile);
  const command = (args: string[]) => execute(process.execPath, ['--import', 'tsx', 'scripts/sparkSnapshot.ts', ...args], { cwd: resolve(__dirname, '..'), env: { ...process.env, INIT_CWD: directory } });
  await command(['capture', '--project', projectId, '--host', host, '--hub', hub, '--output', 'snapshot.json']);
  const snapshot = JSON.parse(readFileSync(resolve(directory, 'snapshot.json'), 'utf8'));
  assert.equal(snapshot.documents.length, 1); assert.equal(statSync(resolve(directory, 'snapshot.json')).mode & 0o777, 0o600);
  await command(['inventory', '--input', 'snapshot.json', '--output', 'inventory.json']);
  assert.equal(JSON.parse(readFileSync(resolve(directory, 'inventory.json'), 'utf8')).documentCount, 1);
  await assert.rejects(command(['prepare', '--input', 'snapshot.json', '--group', 'missing', '--as-of', '2026-10-18T12:00:00Z', '--output', 'prepare.json']));
  const plan = JSON.parse(readFileSync(resolve(directory, 'prepare.json'), 'utf8'));
  assert.equal(plan.canApply, false); assert.equal(plan.canReviewInitialization, false); assert(plan.issues.length > 0);
  await assert.rejects(command(['inventory', '--input', 'snapshot.json', '--output', 'snapshot.json']), (error: any) => {
    assert.match(error.stderr, /Arquivo de saída já existe/); return true;
  });
  assert.equal(JSON.parse(readFileSync(resolve(directory, 'snapshot.json'), 'utf8')).sha256, snapshot.sha256);
  await assert.rejects(command(['restore', '--project', projectId, '--host', host, '--hub', hub, '--input', 'snapshot.json', '--output', 'failed.json']));
  const failure = JSON.parse(readFileSync(resolve(directory, 'failed.json'), 'utf8'));
  assert.equal(failure.status, 'failed'); assert.match(failure.reason, /vazio/);
  assert.equal((await client.scan()).length, 1);
});
