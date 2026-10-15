import assert from 'node:assert/strict';
import { assertCallableSession, secureOnCall } from '../src/secureCallable';
import { AUTH_SESSION_MAX_AGE_MS } from '../../utils/authSessionPolicy';

const now = Date.parse('2026-10-15T15:00:00Z');
const request = (authTime: unknown) => ({ auth: { uid: 'owner', token: { auth_time: authTime } } } as any);
async function run() {
  assert.doesNotThrow(() => assertCallableSession(request((now - AUTH_SESSION_MAX_AGE_MS) / 1000 + 1), now));
  assert.doesNotThrow(() => assertCallableSession(request(now / 1000), now));
  for (const authTime of [undefined, null, '1780000000', NaN, Infinity, 0, now / 1000 + 1, (now - AUTH_SESSION_MAX_AGE_MS) / 1000]) {
    assert.throws(() => assertCallableSession(request(authTime), now), { code: 'unauthenticated' });
  }
  assert.throws(() => assertCallableSession({ auth: undefined }, now), { code: 'unauthenticated' });
  let calls = 0;
  const callable = secureOnCall(() => { calls++; return { success: true }; });
  const stale = request(Math.floor(Date.now() / 1000) - 8 * 3600 - 1);
  stale.auth.token.iat = Math.floor(Date.now() / 1000);
  await assert.rejects(async () => callable.run(stale), { code: 'unauthenticated' });
  assert.equal(calls, 0);
  await callable.run(request(Math.floor(Date.now() / 1000)));
  assert.equal(calls, 1);
  console.log('Auth sessions: callable rejects expired, future, malformed and absent auth_time before business logic.');
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
