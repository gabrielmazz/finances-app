import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const projectId = 'lumus-financial-rules-test';
let environment: RulesTestEnvironment | undefined;

async function seed(): Promise<void> {
  if (!environment) throw new Error('Rules test environment was not initialized.');
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, 'financialGroups', 'group-1'), {
      status: 'active',
      members: {
        admin: 'admin',
        member: 'member',
      },
    });
    await setDoc(doc(firestore, 'financialAccounts', 'bank-1'), {
      groupId: 'group-1',
      kind: 'bank',
      currentBalanceInCents: 10_000,
    });
    await setDoc(doc(firestore, 'ledgerTransactions', 'transaction-1'), {
      groupId: 'group-1',
      legs: [],
    });
    await setDoc(doc(firestore, 'users', 'member'), {
      relatedIdUsers: ['admin'],
    });
    await setDoc(doc(firestore, 'users', 'admin'), {
      relatedIdUsers: ['member'],
    });
  });
}

async function run(): Promise<void> {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), '..', 'firestore.rules'), 'utf8'),
    },
  });
  await seed();

  const member = environment.authenticatedContext('member').firestore();
  const admin = environment.authenticatedContext('admin').firestore();
  const outsider = environment.authenticatedContext('outsider').firestore();

  await assertSucceeds(getDoc(doc(member, 'financialAccounts', 'bank-1')));
  await assertSucceeds(getDoc(doc(admin, 'ledgerTransactions', 'transaction-1')));
  await assertFails(getDoc(doc(outsider, 'financialAccounts', 'bank-1')));
  await assertFails(setDoc(doc(member, 'financialAccounts', 'bank-1'), {
    groupId: 'group-1',
    kind: 'bank',
    currentBalanceInCents: 0,
  }));
  await assertFails(setDoc(doc(admin, 'ledgerTransactions', 'new-transaction'), {
    groupId: 'group-1',
    legs: [],
  }));

  const device = doc(member, 'users', 'member', 'pushDevices', 'device-1');
  await assertSucceeds(setDoc(device, {
    expoPushToken: 'ExponentPushToken[test-member-device]',
    platform: 'android',
    updatedAt: new Date(),
  }));
  await assertSucceeds(getDoc(device));
  await assertFails(getDoc(doc(admin, 'users', 'member', 'pushDevices', 'device-1')));
  await assertFails(setDoc(doc(outsider, 'users', 'member', 'pushDevices', 'device-2'), {
    expoPushToken: 'ExponentPushToken[outsider-device]',
    platform: 'android',
    updatedAt: new Date(),
  }));

  await environment.cleanup();
}

void run().catch(async (error: unknown) => {
  await environment?.cleanup();
  console.error(error);
  process.exitCode = 1;
});
