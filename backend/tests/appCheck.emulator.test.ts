import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { assertCallableAppCheck } from '../src/secureCallable';

const projectId = 'demo-lumus-financas';
const app = initializeApp({ apiKey: 'demo-key', projectId });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

async function run() {
  assert.throws(() => assertCallableAppCheck({}, true), { code: 'unauthenticated' });
  assert.doesNotThrow(() => assertCallableAppCheck({}, false));
  assert.doesNotThrow(() => assertCallableAppCheck({ app: { appId: 'trusted-app', token: {} } as any }, true));
  const { user } = await createUserWithEmailAndPassword(auth, `appcheck-${Date.now()}@example.test`, 'Synthetic-test-123!');
  const idToken = await user.getIdToken();
  const names = ['postMovement', 'transferFunds', 'correctMovement', 'reverseTransaction', 'reconcileAccount',
    'manageFinancialMetadata', 'completeFinancialRecurring', 'manageAccount', 'rebuildFinancialReadModels',
    'migrateFinancialGroup', 'bankBalanceAdjustment', 'executeLegacyFinancialMovement', 'userRelationship',
    'financialMigrationConsent', 'requestAccountDeletion'];
  for (const name of names) {
    // Functions Emulator skips signature verification; forged tokens need a separate SDK transport test.
    for (const appCheckToken of [undefined]) {
      const response = await fetch(`http://127.0.0.1:5001/${projectId}/southamerica-east1/${name}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`,
          ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}) }, body: JSON.stringify({ data: {} }),
      });
      const body = await response.json() as { error?: { status?: string; message?: string } };
      assert.equal(response.status, 401, name);
      assert.equal(body.error?.status, 'UNAUTHENTICATED', name);
      assert.match(body.error?.message ?? '', /integridade/, name);
    }
  }
  console.log('App Check: all 15 callables reject authenticated requests with missing attestation.');
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
