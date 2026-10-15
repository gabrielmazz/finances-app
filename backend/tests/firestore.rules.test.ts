import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const projectId = 'demo-lumus-financas-ledger-rules';
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
    await setDoc(doc(firestore, 'financeMonthlySummaries', 'person-admin-2026-08'), { scopeType: 'person', scopeId: 'admin', monthKey: '2026-08', transactionCount: 1 });
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

  const member = environment.authenticatedContext('member', { auth_time: Math.floor(Date.now() / 1000) }).firestore();
  const admin = environment.authenticatedContext('admin', { auth_time: Math.floor(Date.now() / 1000) }).firestore();
  const outsider = environment.authenticatedContext('outsider', { auth_time: Math.floor(Date.now() / 1000) }).firestore();

  await assertFails(getDoc(doc(member, 'users', 'admin')));
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, 'userRelationshipGrants', 'member', 'related', 'admin'), { acceptedAt: new Date() });
    await setDoc(doc(firestore, 'userRelationshipGrants', 'admin', 'related', 'member'), { acceptedAt: new Date() });
  });
  await assertSucceeds(getDoc(doc(member, 'users', 'admin')));
  await assertFails(deleteDoc(doc(member, 'users', 'member')));
  await assertFails(setDoc(doc(member, 'users', 'member'), { adminUser: true }, { merge: true }));
  await assertFails(setDoc(doc(outsider, 'users', 'outsider'), { adminUser: true, relatedIdUsers: [] }));

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
  await assertFails(setDoc(doc(member, 'expenses', 'invalid-negative'), { personId: 'member', valueInCents: -1 }));
  await assertFails(setDoc(doc(member, 'expenses', 'invalid-bank'), { personId: 'member', valueInCents: 100, bankId: 'missing' }));
  await assertFails(setDoc(doc(member, 'expenses', 'invalid-extra-text'), { personId: 'member', valueInCents: 100, name: 'x'.repeat(201) }));
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'financialCutovers', 'member'), { groupId: 'group-1' });
  });
  await assertFails(setDoc(doc(member, 'expenses', 'after-cutover'), { personId: 'member', valueInCents: 100 }));

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
  await assertSucceeds(getDoc(doc(admin, 'financeMonthlySummaries', 'person-admin-2026-08')));
  await assertSucceeds(getDoc(doc(member, 'financeMonthlySummaries', 'person-admin-2026-08')));
  await assertFails(getDoc(doc(outsider, 'financeMonthlySummaries', 'person-admin-2026-08')));
  await assertFails(setDoc(doc(admin, 'financeMonthlySummaries', 'person-admin-2026-08'), { scopeType: 'person', scopeId: 'admin', transactionCount: 2 }));
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
