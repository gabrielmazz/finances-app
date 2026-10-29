import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { doc, getDoc, runTransaction, setDoc, Timestamp, type Firestore } from 'firebase/firestore';
import { initializeSparkFirstUseFirebase } from '@/functions/SparkFirstUseFirebase';
import { openSparkBankFirebase } from '@/functions/SparkAccountFirebase';
import { postSparkMovementFirebase } from '@/functions/SparkMovementFirebase';
import { readSparkAccountFirebase } from '@/functions/SparkAccountReadFirebase';
import { assertFirstUseUnlocked } from '../backend/src/sparkFirstUseLock';

// The Rules emulator supplies the authentication token; only the app's session
// accessor is mocked. No Auth emulator, Admin SDK or production credentials.
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'integration-owner' } }), onAuthStateChanged: () => () => {} }));
const run = process.env.RUN_SPARK_FIRST_USE_RULES === '1' ? test : test.skip;

run('serviço de primeiro uso grava e reenvia com as Rules reais', async () => {
  const { initializeTestEnvironment } = require('../backend/node_modules/@firebase/rules-unit-testing');
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8186').split(':');
  if (host !== '127.0.0.1' || !Number.isInteger(Number(port))) throw new Error('O teste exige Firestore Emulator no loopback.');
  const env = await initializeTestEnvironment({ projectId: 'demo-first-use-rules', firestore: {
    host, port: Number(port), rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
  } });
  const uid = 'integration-owner', createdAt = Timestamp.fromMillis(Date.now() - 1000);
  try {
    await env.withSecurityRulesDisabled(async (context: { firestore(): Firestore }) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', uid), { name: 'Teste', createdAt, sparkFirstUseRequested: true });
      await setDoc(doc(db, 'sparkFirstUseLocks', uid), { status: 'reviewing', lockId: 'integration_lock_123456' });
      await setDoc(doc(db, 'sparkCivilMonths', '2026-10'), { startAt: Timestamp.fromMillis(Date.now() - 3600000), endAt: Timestamp.fromMillis(Date.now() + 3600000) });
    });
    const db = env.authenticatedContext(uid, { auth_time: Math.floor(Date.now() / 1000) }).firestore() as Firestore;
    await expect(initializeSparkFirstUseFirebase(db, uid)).resolves.toEqual({ status: 'awaiting-authorization' });
    await env.withSecurityRulesDisabled(async (context: { firestore(): Firestore }) => {
      const admin = context.firestore();
      expect((await getDoc(doc(admin, 'financialGroups', `first_${uid}`))).exists()).toBe(false);
      await setDoc(doc(admin, 'sparkFirstUseLocks', uid), { schemaVersion: 1, status: 'authorized', actorId: uid, groupId: `first_${uid}`,
        profileCreatedAt: createdAt, expiresAt: Timestamp.fromMillis(Date.now() + 3600000), cycle: '2026-10', lockId: 'integration_lock_123456' });
    });
    await expect(initializeSparkFirstUseFirebase(db, uid)).resolves.toEqual({ status: 'ready', groupId: `first_${uid}`, idempotent: false });
    await expect(initializeSparkFirstUseFirebase(db, uid)).resolves.toEqual({ status: 'ready', groupId: `first_${uid}`, idempotent: true });
    expect((await getDoc(doc(db, 'financialGroups', `first_${uid}`, 'sparkPositions', 'cash'))).data()?.balanceInCents).toBe(0);
    const groupId = `first_${uid}`;
    const catalog = { name: 'Conta de teste', colorHex: null, iconKey: null, bankAccountId: null, assetType: null,
      valuationMethod: null, cdiPercentageInBasisPoints: null, redemptionTerm: null, description: null };
    await openSparkBankFirebase(db, { groupId, actorId: uid, clientActionId: 'integration_bank_01', accountId: 'bank1', openingBalanceInCents: 10000, catalog });
    await postSparkMovementFirebase(db, { groupId, actorId: uid, clientActionId: 'integration_cash_income_01', kind: 'income', accountId: 'cash', amountInCents: 2500, effectiveAt: Timestamp.now() });
    expect((await getDoc(doc(db, 'financialGroups', groupId, 'sparkPositions', 'bank1'))).data()?.balanceInCents).toBe(10000);
    expect((await getDoc(doc(db, 'financialGroups', groupId, 'sparkPositions', 'cash'))).data()?.balanceInCents).toBe(2500);
    await expect(readSparkAccountFirebase(db, uid, groupId, 'cash')).resolves.toMatchObject({ position: { kind: 'cash', balanceInCents: 2500 } });
    await expect(readSparkAccountFirebase(db, uid, groupId, 'bank1')).resolves.toMatchObject({ position: { kind: 'bank', balanceInCents: 10000 }, catalog: { name: 'Conta de teste' } });
  } finally { await env.cleanup(); }
}, 60000);

run('bloqueio criado durante transação força nova leitura e impede escrita legada', async () => {
  const { initializeTestEnvironment } = require('../backend/node_modules/@firebase/rules-unit-testing');
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8186').split(':');
  if (host !== '127.0.0.1' || !Number.isInteger(Number(port))) throw new Error('O teste exige Firestore Emulator no loopback.');
  const env = await initializeTestEnvironment({ projectId: 'demo-first-use-rules', firestore: {
    host, port: Number(port), rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
  } });
  try {
    await env.withSecurityRulesDisabled(async (context: { firestore(): Firestore }) => {
      const db = context.firestore(), uid = 'race-owner';
      let notifyRead!: () => void, resume!: () => void, attempts = 0;
      const firstRead = new Promise<void>(resolveRead => { notifyRead = resolveRead; });
      const continueWrite = new Promise<void>(resolveWrite => { resume = resolveWrite; });
      const pending = runTransaction(db, async transaction => {
        const adapter = { get: async (ref: ReturnType<typeof doc>) => ({ exists: (await transaction.get(ref)).exists() }) };
        await assertFirstUseUnlocked(adapter as never, { doc: (path: string) => doc(db, path) } as never, [uid]);
        if (++attempts === 1) { notifyRead(); await continueWrite; }
        transaction.set(doc(db, 'banks', 'race-bank'), { personId: uid, name: 'Conta' });
      });
      await firstRead;
      try { await setDoc(doc(db, 'sparkFirstUseLocks', uid), { lockId: 'race_lock_1234567890' }); }
      finally { resume(); }
      await expect(pending).rejects.toMatchObject({ code: 'failed-precondition' });
      expect(attempts).toBe(1);
      expect((await getDoc(doc(db, 'banks', 'race-bank'))).exists()).toBe(false);
    });
  } finally { await env.cleanup(); }
}, 60000);
