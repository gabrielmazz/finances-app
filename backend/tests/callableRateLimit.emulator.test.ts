import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { enforceCallableRateLimit } from '../src/callableRateLimit';

async function run() {
  assert.equal(process.env.FIREBASE_PROJECT_ID, 'demo-lumus-financas');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  const app = initializeApp({ projectId: 'demo-lumus-financas' });
  const uid = `quota-contract-${Date.now()}`;
  const operation = 'quota-contract';
  const id = createHash('sha256').update(`${uid}:${operation}`).digest('hex');
  const reference = getFirestore(app).doc(`callableRateLimits/${id}`);
  const originalNow = Date.now;
  const now = Date.now();
  Date.now = () => now;
  try {
    // Synthetic exhausted window belongs only to this guard test, never to a batch user.
    await reference.set({ windowStart: Math.floor(Date.now() / 60_000), count: 120 });
    let handlerCalls = 0;
    const guarded = async () => { await enforceCallableRateLimit(uid, operation, 120); handlerCalls++; };
    await assert.rejects(guarded, (error: any) => error.code === 'resource-exhausted'
      && error.details?.reason === 'rate-limit'
      && Number.isFinite(error.details.retryAfterMs)
      && error.details.retryAfterMs >= 250 && error.details.retryAfterMs <= 60_250);
    assert.equal(handlerCalls, 0);
    assert.equal((await reference.get()).data()?.count, 120);
    await reference.set({ windowStart: Math.floor(Date.now() / 60_000) - 1, count: 120 });
    await guarded();
    assert.equal(handlerCalls, 1);
    assert.equal((await reference.get()).data()?.count, 1);
    console.log('Callable quota: 120/min enforced, retry metadata, no handler on refusal and next-window recovery passed.');
  } finally { Date.now = originalNow; await reference.delete(); await deleteApp(app); }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
