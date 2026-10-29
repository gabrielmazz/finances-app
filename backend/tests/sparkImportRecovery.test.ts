import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalFirestore, type SnapshotDocument } from '../scripts/lib/sparkLocalSnapshot';
import { buildSparkLedgerImport, importSparkLedgerLocal } from '../scripts/lib/sparkLedgerImport';
import { importAsOf, ledgerImportFixture } from './fixtures/sparkImportFixture';

class InterruptedFirestore extends LocalFirestore {
  rows = new Map<string, SnapshotDocument>();
  failAfterCommit = false;
  calls = 0;
  constructor() { super('demo-lumus-snapshot', '127.0.0.1:8080', '127.0.0.1:4400'); }
  async assertIsolatedEmulator() {}
  async scan() { return [...this.rows.values()]; }
  async call(_suffix: string, _method = 'GET', body?: any): Promise<Record<string, any>> {
    this.calls++;
    for (const write of body.writes) {
      const path = write.update.name.split('/documents/')[1];
      if (this.rows.has(path)) throw new Error('precondition failed');
      this.rows.set(path, { path, fields: write.update.fields });
    }
    if (this.failAfterCommit) { this.failAfterCommit = false; throw new Error('resposta perdida após commit'); }
    return {};
  }
}

test('retoma lote confirmado com resposta perdida e repete recibo sem duplicar dados', async () => {
  const client = new InterruptedFirestore(), source = ledgerImportFixture();
  const plan = buildSparkLedgerImport(source, 'group', importAsOf);
  client.failAfterCommit = true;
  await assert.rejects(importSparkLedgerLocal(client, source, 'group', importAsOf, plan.planSha256), /resposta perdida/);
  assert(client.rows.size > 0);
  const result = await importSparkLedgerLocal(client, source, 'group', importAsOf, plan.planSha256);
  assert.equal(result.status, 'verified-locked');
  const calls = client.calls;
  assert.equal((await importSparkLedgerLocal(client, source, 'group', importAsOf, plan.planSha256)).idempotent, true);
  assert.equal(client.calls, calls);
});

test('recusa dados divergentes e recibo alterado sem sobrescrever', async () => {
  const client = new InterruptedFirestore(), source = ledgerImportFixture();
  const plan = buildSparkLedgerImport(source, 'group', importAsOf);
  client.rows.set('unexpected/doc', { path: 'unexpected/doc', fields: {} });
  await assert.rejects(importSparkLedgerLocal(client, source, 'group', importAsOf, plan.planSha256), /não previsto/);
  assert.equal(client.calls, 0);
  client.rows.clear();
  await importSparkLedgerLocal(client, source, 'group', importAsOf, plan.planSha256);
  const receipt = client.rows.get(`financialGroups/group/sparkImportReceipts/${plan.importId}`)!;
  receipt.fields.status = { stringValue: 'changed' };
  const calls = client.calls;
  await assert.rejects(importSparkLedgerLocal(client, source, 'group', importAsOf, plan.planSha256), /diverge/);
  assert.equal(client.calls, calls);
});

test('retoma conjunto de 205 documentos em lotes limitados e informa progresso', async () => {
  const client = new InterruptedFirestore();
  const documents = Array.from({ length: 205 }, (_, index) => ({ path: `test/${index}`, fields: { index: { integerValue: String(index) } } }));
  client.failAfterCommit = true;
  await assert.rejects(client.resumeDocumentSet(documents), /resposta perdida/);
  assert.equal(client.rows.size, 100);
  const progress: number[] = [];
  const result = await client.resumeDocumentSet(documents, completed => progress.push(completed));
  assert.equal(result.documents, 205);
  assert.deepEqual(progress, [100, 200, 205]);
  assert.equal(client.calls, 3);
});
