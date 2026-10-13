import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { initializeApp } from 'firebase-admin/app';

// Use the real SDK verifier, without the emulator's skipTokenVerification feature.
delete process.env.FIREBASE_DEBUG_MODE;
delete process.env.FIREBASE_DEBUG_FEATURES;
process.env.LUMUS_ENFORCE_APP_CHECK = 'true';
initializeApp({ projectId: 'demo-lumus-financas' });
async function run() {
  const { secureOnCall } = await import('../src/secureCallable');
  let executed = false;
  const callable = secureOnCall(() => { executed = true; return { success: true }; });
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const req = Object.assign(request, { body: JSON.parse(Buffer.concat(chunks).toString()),
      header: (name: string) => request.headers[name.toLowerCase()],
      get: (name: string) => request.headers[name.toLowerCase()],
    });
    const res = Object.assign(response, {
      status: (code: number) => { response.statusCode = code; return res; },
      send: (body: unknown) => { response.end(typeof body === 'string' ? body : JSON.stringify(body)); return res; },
    });
    await callable(req as any, res as any);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    for (const token of [undefined, 'forged-app-check-token']) {
      const response = await fetch(`http://127.0.0.1:${address.port}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Firebase-AppCheck': token } : {}) },
        body: JSON.stringify({ data: {} }),
      });
      assert.equal(response.status, 401);
      const body = await response.json() as { error: { status: string } };
      assert.equal(body.error.status, 'UNAUTHENTICATED');
      assert.equal(executed, false);
    }
    console.log('App Check transport: real Firebase SDK rejects missing and forged tokens before the business handler.');
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
