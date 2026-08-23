import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const projectId = 'demo-lumus-financas';
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
    await setDoc(doc(firestore, 'financeMonthlySummaries', 'group-1-2026-08'), {
      groupId: 'group-1',
      monthKey: '2026-08',
      transactionCount: 1,
    });
    await setDoc(doc(firestore, 'investmentCdiRates', 'admin_20260801'), {
      personId: 'admin',
      annualRateInBasisPoints: 1_250,
      effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
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

  await assertSucceeds(getDoc(doc(member, 'investmentCdiRates', 'admin_20260801')));
  await assertSucceeds(getDocs(query(
    collection(member, 'investmentCdiRates'),
    where('personId', 'in', ['member', 'admin']),
  )));
  await assertFails(getDoc(doc(outsider, 'investmentCdiRates', 'admin_20260801')));
  await assertSucceeds(setDoc(doc(member, 'investmentCdiRates', 'member_20260821'), {
    personId: 'member',
    annualRateInBasisPoints: 1_300,
    effectiveFrom: new Date('2026-08-21T00:00:00.000Z'),
    createdAt: new Date('2026-08-21T00:00:00.000Z'),
    updatedAt: new Date('2026-08-21T00:00:00.000Z'),
  }));
  await assertSucceeds(setDoc(doc(member, 'investmentCdiRates', 'member_20260821'), {
    annualRateInBasisPoints: 1_350,
  }, { merge: true }));
  await assertFails(setDoc(doc(outsider, 'investmentCdiRates', 'outsider_20260821'), {
    personId: 'outsider',
    annualRateInBasisPoints: 1_300,
    effectiveFrom: new Date('2026-08-21T00:00:00.000Z'),
  }));

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
  await assertSucceeds(getDoc(doc(member, 'financeMonthlySummaries', 'group-1-2026-08')));
  await assertFails(getDoc(doc(outsider, 'financeMonthlySummaries', 'group-1-2026-08')));
  await assertFails(setDoc(doc(member, 'financeMonthlySummaries', 'group-1-2026-08'), {
    groupId: 'group-1', monthKey: '2026-08', transactionCount: 0,
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
