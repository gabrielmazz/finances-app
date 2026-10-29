import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalFirestore } from '../scripts/lib/sparkLocalSnapshot';
import { buildSparkLedgerImport, importSparkLedgerLocal } from '../scripts/lib/sparkLedgerImport';
import { importAsOf, ledgerImportFixture } from './fixtures/sparkImportFixture';

test('retoma commit confirmado no Firestore Emulator após perda da resposta', async () => {
  assert.equal(process.env.LUMUS_RECOVERY_EMULATOR, '1');
  let loseReply = true;
  const transport: typeof fetch = async (input, init) => {
    const result = await fetch(input, init);
    if (loseReply && String(input).endsWith(':commit') && result.ok) {
      loseReply = false; throw new Error('resposta perdida');
    }
    return result;
  };
  const client = new LocalFirestore('demo-lumus-snapshot', '127.0.0.1:8188', '127.0.0.1:4409', transport);
  const source = ledgerImportFixture(), plan = buildSparkLedgerImport(source, 'group', importAsOf);
  await assert.rejects(importSparkLedgerLocal(client, source, 'group', importAsOf, plan.planSha256), /resposta perdida/);
  assert((await client.scan()).length > 0);
  const result = await importSparkLedgerLocal(client, source, 'group', importAsOf, plan.planSha256);
  assert.equal(result.status, 'verified-locked');
  assert.equal((await importSparkLedgerLocal(client, source, 'group', importAsOf, plan.planSha256)).idempotent, true);
});
