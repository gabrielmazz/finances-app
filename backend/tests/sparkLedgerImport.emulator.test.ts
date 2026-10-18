import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { canonical, dataDigest, LocalFirestore } from '../scripts/lib/sparkLocalSnapshot';
import { buildSparkLedgerImport, importSparkLedgerLocal } from '../scripts/lib/sparkLedgerImport';
import { importAsOf, ledgerImportFixture, legacyImportFixture } from './fixtures/sparkImportFixture';
import { prepareSparkHistoryProofFirebase } from '../../functions/SparkHistoryFirebase';

const projectId = 'demo-lumus-snapshot', host = process.env.FIRESTORE_EMULATOR_HOST ?? '', hub = process.env.FIREBASE_EMULATOR_HUB ?? '';
if (process.env.GCLOUD_PROJECT !== projectId || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') throw new Error('Ensaio requer projeto demo e Auth/Firestore locais do runner.');
const local = new LocalFirestore(projectId, host, hub);
const rootRequire = createRequire(resolve(__dirname, '../../package.json'));
const { initializeApp, deleteApp } = rootRequire('firebase/app') as typeof import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = rootRequire('firebase/auth') as typeof import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, updateDoc, terminate, Timestamp } = rootRequire('firebase/firestore') as typeof import('firebase/firestore');
const app = initializeApp({ projectId, apiKey: 'fake-api-key' }, 'spark-import-test');
const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const firestore = getFirestore(app); connectFirestoreEmulator(firestore, '127.0.0.1', Number(host.split(':').at(-1)));
const admin = initializeAdmin({ projectId }, 'spark-import-test');
let environment: RulesTestEnvironment;
before(async () => {
  await local.assertIsolatedEmulator();
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: Number(host.split(':').at(-1)), rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  await getAdminAuth(admin).createUser({ uid: 'owner', email: 'owner@demo.lumus.local', password: 'synthetic-password', emailVerified: true });
  await signInWithEmailAndPassword(auth, 'owner@demo.lumus.local', 'synthetic-password');
}, { timeout: 30_000 });
beforeEach(async () => { await environment.clearFirestore(); });
after(async () => { await terminate(firestore); await deleteApp(app); await deleteAdmin(admin); await environment?.cleanup(); });

test('importa financeiro de forma verificada, preserva bruto e permanece bloqueado para clientes', { timeout: 30_000 }, async () => {
  const source = ledgerImportFixture(), plan = buildSparkLedgerImport(source, 'group', importAsOf);
  const result = await importSparkLedgerLocal(local, source, 'group', importAsOf, plan.planSha256);
  assert.equal(result.status, 'verified-locked'); assert.equal(result.activationAllowed, false); assert.equal(result.accounts, 4);
  const restored = await local.scan();
  for (const original of source.documents.filter(row => row.path !== 'financialGroups/group')) assert.deepEqual(restored.find(row => row.path === original.path)?.fields, original.fields);
  assert.equal(restored.find(row => row.path === 'financialGroups/group')?.fields.status.stringValue, 'spark_importing');
  await assert.rejects(getDocFromServer(doc(firestore, 'financialGroups/group/sparkPositions/bank-a')), (error: any) => error.code === 'permission-denied');
  await assert.rejects(importSparkLedgerLocal(local, source, 'group', importAsOf, plan.planSha256), /vazio/);
  assert.equal(dataDigest(await local.scan()), dataDigest(restored));
});

test('projeções autenticadas conferem o histórico importado após habilitação SOMENTE pelo harness', { timeout: 60_000 }, async () => {
  const source = ledgerImportFixture(), plan = buildSparkLedgerImport(source, 'group', importAsOf);
  await importSparkLedgerLocal(local, source, 'group', importAsOf, plan.planSha256);
  // Não existe comando de ativação no importador. Esta mudança privilegiada pertence só à fixture.
  await environment.withSecurityRulesDisabled(async context => {
    await context.firestore().doc('financialGroups/group').update({ status: 'active', sparkProtocol: 'financial-proof-v6' });
  });
  const cases: Array<[string, string, number]> = [
    ['bank-a', '2026-09-01T03:00:00Z', 1000], ['bank-a', '2026-09-02T12:00:00Z', 1200],
    ['bank-a', '2026-09-03T12:00:00Z', 900], ['bank-a', '2026-09-04T12:00:00Z', 800],
    ['bank-b', '2026-09-03T12:00:00Z', 800], ['cash', '2026-09-04T12:00:00Z', 0],
    ['investment', '2026-09-03T12:00:00Z', 0], ['investment', '2026-09-04T12:00:00Z', 100],
  ];
  for (let index = 0; index < cases.length; index++) {
    const [accountId, time, expected] = cases[index];
    const proof = await prepareSparkHistoryProofFirebase(firestore, { groupId: 'group', actorId: 'owner', accountId,
      clientActionId: `import_proof_${index}`, asOf: Timestamp.fromDate(new Date(time)), purpose: 'instant' });
    assert.equal(proof.phase, 'done'); assert.equal(proof.balanceInCents, expected);
  }
  const head = (await local.scan()).find(row => row.path === 'financialGroups/group/sparkPositions/bank-a')!.fields.lastOperationId.stringValue as string;
  await assert.rejects(updateDoc(doc(firestore, 'financialGroups/group/sparkOperations', head), { differenceInCents: 999 }));
});

test('CLI liga plano, importação e normalização legada sem aceitar hash diferente', { timeout: 30_000 }, async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'lumus-financial-import-'));
  const execute = promisify(execFile);
  const command = (args: string[]) => execute(process.execPath, ['--import', 'tsx', 'scripts/sparkSnapshot.ts', ...args], { cwd: resolve(__dirname, '..'), env: { ...process.env, INIT_CWD: directory } });
  writeFileSync(resolve(directory, 'snapshot.json'), canonical(ledgerImportFixture()), { mode: 0o600 });
  await command(['plan-ledger', '--input', 'snapshot.json', '--group', 'group', '--as-of', importAsOf.toISOString(), '--output', 'plan.json']);
  const plan = JSON.parse(readFileSync(resolve(directory, 'plan.json'), 'utf8')); assert.equal(plan.documents, undefined);
  const args = ['import-ledger', '--input', 'snapshot.json', '--group', 'group', '--as-of', importAsOf.toISOString(), '--project', projectId, '--host', host, '--hub', hub];
  await assert.rejects(command([...args, '--plan-sha256', '0'.repeat(64), '--output', 'failed.json']));
  assert.equal((await local.scan()).length, 0);
  await command([...args, '--plan-sha256', plan.planSha256, '--output', 'receipt.json']);
  assert.equal(JSON.parse(readFileSync(resolve(directory, 'receipt.json'), 'utf8')).status, 'verified-locked');
  const legacy = legacyImportFixture(); writeFileSync(resolve(directory, 'legacy.json'), canonical(legacy.snapshot)); writeFileSync(resolve(directory, 'scope.json'), canonical(legacy.scope));
  await command(['normalize-legacy', '--input', 'legacy.json', '--scope', 'scope.json', '--output', 'legacy-report.json']);
  const report = JSON.parse(readFileSync(resolve(directory, 'legacy-report.json'), 'utf8')); assert.equal(report.canReviewNormalization, true); assert.equal(report.canApply, false);
});
