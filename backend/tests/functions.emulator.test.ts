import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, type User } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const projectId = 'lumus-financial-rules-test';
let environment: RulesTestEnvironment | undefined;

async function anonymousUser(name: string): Promise<User> {
  const app = initializeApp({
    apiKey: 'test-api-key',
    authDomain: projectId + '.firebaseapp.com',
    projectId,
  }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const credential = await signInAnonymously(auth);
  return credential.user;
}

async function seed(memberId: string, adminId: string): Promise<void> {
  if (!environment) throw new Error('Rules test environment was not initialized.');
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, 'financialGroups', 'group-1'), {
      id: 'group-1',
      status: 'active',
      members: {
        [memberId]: 'member',
        [adminId]: 'admin',
      },
    });
    await setDoc(doc(firestore, 'financialAccounts', 'bank-1'), {
      id: 'bank-1',
      groupId: 'group-1',
      kind: 'bank',
      name: 'Banco',
      currentBalanceInCents: 1_000,
      archivedAt: null,
    });
    await setDoc(doc(firestore, 'financialAccounts', 'cash-group-1'), {
      id: 'cash-group-1',
      groupId: 'group-1',
      kind: 'cash',
      name: 'Caixa',
      currentBalanceInCents: 0,
      archivedAt: null,
    });
  });
}

async function invokeAs<TData, TResult>(user: User, name: string, data: TData): Promise<TResult> {
  const app = user.auth.app;
  const functions = getFunctions(app, 'southamerica-east1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const callable = httpsCallable<TData, TResult>(functions, name);
  return (await callable(data)).data;
}

async function run(): Promise<void> {
  const member = await anonymousUser('financial-member');
  const admin = await anonymousUser('financial-admin');
  const outsider = await anonymousUser('financial-outsider');
  environment = await initializeTestEnvironment({ projectId });
  await seed(member.uid, admin.uid);

  const action = {
    groupId: 'group-1',
    fromAccountId: 'bank-1',
    toAccountId: 'cash-group-1',
    amountInCents: 300,
    effectiveAt: '2026-08-11T12:00:00.000Z',
    clientActionId: 'emulator_transfer_0001',
    note: 'Saque de teste',
  };
  const first = await invokeAs<typeof action, { transactionId: string; idempotent: boolean }>(
    member,
    'transferFunds',
    action,
  );
  if (first.idempotent || !first.transactionId) {
    throw new Error('Member transfer should create one ledger transaction.');
  }
  const second = await invokeAs<typeof action, { transactionId: string; idempotent: boolean }>(
    member,
    'transferFunds',
    action,
  );
  if (!second.idempotent || second.transactionId !== first.transactionId) {
    throw new Error('Repeated clientActionId must be idempotent.');
  }

  const account = await invokeAs<{
    groupId: string;
    action: string;
    kind: string;
    name: string;
    clientActionId: string;
  }, { accountId: string }>(admin, 'manageAccount', {
    groupId: 'group-1',
    action: 'create',
    kind: 'bank',
    name: 'Banco administrado',
    clientActionId: 'emulator_account_0001',
  });
  if (!account.accountId) throw new Error('Administrator should be able to manage accounts.');

  let outsiderDenied = false;
  try {
    await invokeAs<typeof action, { transactionId: string }>(outsider, 'transferFunds', {
      ...action,
      clientActionId: 'emulator_transfer_0002',
    });
  } catch {
    outsiderDenied = true;
  }
  if (!outsiderDenied) throw new Error('A non-member must not post a ledger transaction.');

  await environment.cleanup();
}

void run().catch(async (error: unknown) => {
  await environment?.cleanup();
  console.error(error);
  process.exitCode = 1;
});
