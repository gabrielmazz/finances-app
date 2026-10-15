import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';

const projectId = 'demo-lumus-financas';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST;
if (!authHost?.startsWith('127.0.0.1:') || !functionsHost?.startsWith('127.0.0.1:')) {
  throw new Error('Este teste exige Auth e Functions em emuladores locais isolados.');
}
const app = initializeApp({ apiKey: 'demo-key', projectId });
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });

async function run() {
  const email = `auth-session-${Date.now()}@example.test`;
  const password = 'Synthetic-session-123!';
  await createUserWithEmailAndPassword(auth, email, password);
  await signOut(auth);
  await assert.rejects(() => signInWithEmailAndPassword(auth, email, 'incorrect-password'));
  assert.equal(auth.currentUser, null);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const token = await credential.user.getIdTokenResult();
  assert.equal(typeof token.claims.auth_time, 'number');

  const call = async (idToken: string) => {
    const response = await fetch(`http://${functionsHost}/${projectId}/southamerica-east1/userRelationship`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ data: {} }),
    });
    return { status: response.status, body: await response.json() as { error?: { status: string; message: string } } };
  };
  // Somente o Emulator aceita JWT sem assinatura. Não testa assinatura de produção.
  const parts = token.token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  const stalePayload = { ...payload, auth_time: Math.floor(Date.now() / 1000) - 8 * 3600 - 1 };
  const staleToken = `${parts[0]}.${Buffer.from(JSON.stringify(stalePayload)).toString('base64url')}.${parts[2]}`;
  const expired = await call(staleToken);
  assert.equal(expired.status, 401);
  assert.equal(expired.body.error?.status, 'UNAUTHENTICATED');
  assert.match(expired.body.error?.message ?? '', /sessão expirou/);
  const fresh = await call(token.token);
  assert.equal(fresh.status, 400); // Chegou à validação de negócio; {} é uma operação inválida.
  assert.equal(fresh.body.error?.status, 'INVALID_ARGUMENT');
  await signOut(auth);
  assert.equal(auth.currentUser, null);
  console.log('Auth + Functions: incorrect password rejected, correct credentials accepted, renewed token with stale login denied.');
}
void run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => deleteApp(app));
