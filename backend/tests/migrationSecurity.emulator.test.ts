import assert from 'node:assert/strict';
import { initializeApp as initializeAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, type User } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
  || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') throw new Error('Local emulators required.');
const projectId = 'demo-lumus-financas';
initializeAdmin({ projectId });
const db = getAdminFirestore();
const runId = Date.now().toString(36);
const now = new Date('2026-10-01T15:00:00Z');
async function actor(label: string): Promise<User> {
  const app = initializeApp({ projectId, apiKey: 'demo-key' }, `${label}-${runId}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFunctionsEmulator(getFunctions(app, 'southamerica-east1'), '127.0.0.1', 5001);
  const { user } = await signInAnonymously(auth);
  await db.doc(`users/${user.uid}`).set({ name: label, relatedIdUsers: [] });
  return user;
}
async function invoke(user: User, name: string, data: object) {
  return (await httpsCallable(getFunctions(user.auth.app, 'southamerica-east1'), name)(data)).data as Record<string, any>;
}
const denied = (user: User, name: string, data: object, code: string) => assert.rejects(invoke(user, name, data), { code: `functions/${code}` });
async function run() {
  const owner = await actor('migration-paged-owner');
  const member = await actor('migration-paged-member');
  const clientActionId = `migration_paged_${runId}`;
  const groupId = `group-${owner.uid}-${clientActionId}`;
  const bankId = `paged-bank-${runId}`;
  const batch = db.batch();
  batch.set(db.doc(`banks/${bankId}`), { personId: member.uid, name: 'Banco sintético', isActive: true });
  batch.set(db.doc(`monthlyBalances/${bankId}`), { personId: member.uid, bankId, year: 2026, month: 10, valueInCents: 10000 });
  for (let index = 0; index < 450; index++) batch.set(db.doc(`gains/paged-${runId}-${index}`), {
    personId: member.uid, bankId, name: 'Entrada sintética', valueInCents: 1, date: now,
  });
  await batch.commit();
  const consent = { action: 'approve', actorId: owner.uid, clientActionId };
  const input = { mode: 'dry-run', clientActionId, memberIds: [member.uid],
    confirmedCashBalanceInCents: 50, confirmedAt: '2026-10-11T12:00:00Z' };
  await denied(owner, 'migrateFinancialGroup', input, 'permission-denied');
  await invoke(member, 'financialMigrationConsent', consent);
  const preview = await invoke(owner, 'migrateFinancialGroup', input);
  assert.equal(preview.issueCount, 0);
  const execute = { ...input, mode: 'execute', approvedFingerprint: preview.fingerprint };
  await db.doc(`gains/paged-${runId}-0`).update({ valueInCents: 2 });
  await denied(owner, 'migrateFinancialGroup', execute, 'failed-precondition');
  assert.equal((await db.doc(`financialGroups/${groupId}`).get()).exists, false);
  await db.doc(`gains/paged-${runId}-0`).update({ valueInCents: 1 });
  const first = await invoke(owner, 'migrateFinancialGroup', execute);
  assert.equal(first.complete, false);
  assert.equal((await db.doc(`financialGroups/${groupId}`).get()).data()?.status, 'migrating');
  assert.equal((await db.doc(`financialCutovers/${member.uid}`).get()).exists, false);
  await invoke(member, 'financialMigrationConsent', { ...consent, action: 'revoke' });
  await denied(owner, 'migrateFinancialGroup', execute, 'permission-denied');
  assert.equal((await db.doc(`financialGroups/${groupId}/migrationRuns/${clientActionId}`).get()).data()?.cursor, first.cursor);
  await invoke(member, 'financialMigrationConsent', consent);
  const complete = await invoke(owner, 'migrateFinancialGroup', execute);
  assert.equal(complete.complete, true);
  assert.equal((await db.doc(`financialCutovers/${member.uid}`).get()).data()?.groupId, groupId);
  assert.equal((await db.doc(`financialAccounts/bank-${bankId}`).get()).data()?.currentBalanceInCents, 10450);
  assert.equal((await db.doc(`financialAccounts/cash-${groupId}`).get()).data()?.currentBalanceInCents, 50);
  const count = (await db.collection('ledgerTransactions').where('groupId', '==', groupId).get()).size;
  assert.deepEqual(await invoke(owner, 'migrateFinancialGroup', execute), complete);
  assert.equal((await db.collection('ledgerTransactions').where('groupId', '==', groupId).get()).size, count);
  await denied(owner, 'migrateFinancialGroup', { ...execute, confirmedCashBalanceInCents: 51 }, 'failed-precondition');

  const oversized = await actor('migration-over-limit');
  for (let start = 0; start < 2001; start += 500) {
    const page = db.batch();
    for (let index = start; index < Math.min(start + 500, 2001); index++) page.set(db.doc(`gains/limit-${runId}-${index}`), {
      personId: oversized.uid, name: 'Entrada', valueInCents: 1, date: now,
    });
    await page.commit();
  }
  await denied(oversized, 'migrateFinancialGroup', { mode: 'dry-run', clientActionId: `migration_limit_${runId}` }, 'resource-exhausted');
  console.log('Migration: 450 movements, changed amounts, consent revocation between batches, exact balances, safe retry and 2001-document limit passed.');
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
