import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let environment: RulesTestEnvironment | undefined;
async function run() {
  environment = await initializeTestEnvironment({
    projectId: 'demo-lumus-auth-session',
    firestore: { rules: readFileSync(resolve(process.cwd(), '..', 'firestore.rules'), 'utf8') },
  });
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users', 'owner'), { name: 'Owner', adminUser: false, relatedIdUsers: [] });
    await setDoc(doc(context.firestore(), 'users', 'owner', 'pushDevices', 'device'), { expoPushToken: 'ExponentPushToken[test]', platform: 'android', updatedAt: new Date() });
    await setDoc(doc(context.firestore(), 'financialGroups', 'group'), { status: 'active', members: { owner: 'admin' } });
    await setDoc(doc(context.firestore(), 'financialAccounts', 'bank'), { groupId: 'group', kind: 'bank', currentBalanceInCents: 100 });
  });
  const seconds = Math.floor(Date.now() / 1000);
  const fresh = environment.authenticatedContext('owner', { auth_time: seconds }).firestore();
  await assertSucceeds(getDoc(doc(fresh, 'users', 'owner')));
  await assertSucceeds(getDoc(doc(fresh, 'financialAccounts', 'bank')));
  await assertSucceeds(updateDoc(doc(fresh, 'users', 'owner'), { name: 'Updated' }));
  for (const auth_time of [seconds - 8 * 3600 - 1, seconds + 60, 0, null, 'invalid']) {
    const expired = environment.authenticatedContext('owner', { auth_time: auth_time as any, iat: seconds }).firestore();
    await assertFails(getDoc(doc(expired, 'users', 'owner')));
    await assertFails(getDoc(doc(expired, 'financialAccounts', 'bank')));
    await assertFails(updateDoc(doc(expired, 'users', 'owner'), { name: 'Bypass' }));
    await assertFails(setDoc(doc(expired, 'users', 'owner', 'pushDevices', 'new'), { expoPushToken: 'ExponentPushToken[test]', platform: 'android', updatedAt: new Date() }));
    await assertFails(deleteDoc(doc(expired, 'users', 'owner', 'pushDevices', 'device')));
    await assertFails(getDoc(doc(expired, 'expenses', 'missing')));
  }
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'users', 'owner')));
  console.log('Auth session rules: fresh login works; expired, future and invalid auth_time cannot read, create, update or delete.');
}
void run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await environment?.cleanup(); });
