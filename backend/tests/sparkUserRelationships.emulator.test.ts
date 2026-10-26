import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runSparkUserRelationshipFirebase as run, loadSparkUserRelationshipsFirebase as overview, sparkRelationshipRef } from '../../functions/SparkUserRelationshipFirebase';

const projectId = 'demo-lumus-relationships';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
assert.match(emulatorHost, /^127\.0\.0\.1:(8080|8185|8186)$/, 'Use o Firestore Emulator isolado, porta 8080, 8185 ou 8186.');
const emulatorPort = Number(emulatorHost.split(':')[1]);
const client = createRequire(resolve(__dirname, '../../package.json'));
const { initializeApp, deleteApp } = client('firebase/app') as typeof import('firebase/app');
const { getAuth } = client('firebase/auth') as typeof import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, Timestamp, doc, getDocFromServer, getDocsFromServer, collectionGroup, writeBatch, serverTimestamp, deleteDoc, updateDoc, terminate } = client('firebase/firestore') as typeof import('firebase/firestore');
// Fixture privilegiada apenas no emulador demo; leituras/escritas sob teste usam o SDK com Rules.
const AdminTimestamp = Timestamp;
const encode = (value: any): any => value === null ? { nullValue: null } : value instanceof Timestamp ? { timestampValue: value.toDate().toISOString() }
  : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } } : typeof value === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode(entry)])) } }
  : typeof value === 'string' ? { stringValue: value } : typeof value === 'boolean' ? { booleanValue: value } : { integerValue: String(value) };
const decode = (value: any): any => 'nullValue' in value ? null : 'timestampValue' in value ? Timestamp.fromDate(new Date(value.timestampValue))
  : 'arrayValue' in value ? (value.arrayValue.values ?? []).map(decode) : 'mapValue' in value ? Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, entry]) => [key, decode(entry)]))
  : 'stringValue' in value ? value.stringValue : 'booleanValue' in value ? value.booleanValue : Number(value.integerValue);
const server = { doc(path: string) {
  const url = `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  return {
    async get() { const result = await fetch(url, { headers: { Authorization: 'Bearer owner' } }); if (!result.ok) throw new Error(`Fixture get: ${result.status}`); const data: any = await result.json(); return { data: () => Object.fromEntries(Object.entries(data.fields ?? {}).map(([key, entry]) => [key, decode(entry)])) as Record<string, any> }; },
    async set(data: Record<string, any>) { const result = await fetch(url, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)])) }) }); if (!result.ok) throw new Error(`Fixture set: ${result.status}`); },
    async update(data: Record<string, any>) { const old = await this.get(); await this.set({ ...old.data(), ...data }); },
  };
} };
const apps: ReturnType<typeof initializeApp>[] = [], clients: ReturnType<typeof getFirestore>[] = [];
let sequence = 0;
const nextId = () => `relationship_action_${++sequence}_123456`;
async function user(uid: string, name: string, claims = {}) {
  await server.doc(`users/${uid}`).set({ name, adminUser: false, relatedIdUsers: [], financialGroupId: `group-${uid}`, financialGroupRole: 'member' });
  const app = initializeApp({ projectId, apiKey: 'fake-api-key' }, `relationship-${uid}-${++sequence}`); apps.push(app);
  const auth = getAuth(app); await auth.authStateReady(); Object.defineProperty(auth, 'currentUser', { value: { uid }, writable: true });
  const firestore = getFirestore(app); clients.push(firestore);
  connectFirestoreEmulator(firestore, '127.0.0.1', emulatorPort, { mockUserToken: { sub: uid, user_id: uid, auth_time: Math.floor(Date.now() / 1000), ...claims } });
  return { uid, firestore, auth };
}
async function pair() { const id = ++sequence; return { a: await user(`a-${id}`, 'Ana'), b: await user(`b-${id}`, 'Bia') }; }
type Client = Awaited<ReturnType<typeof user>>;
async function command(actor: Client, target: Client, action: 'link' | 'unlink') {
  const preview = await run(actor.firestore, actor.uid, { action: 'preview', relatedUserId: target.uid });
  return { action, relatedUserId: target.uid, clientActionId: nextId(), expectedFingerprint: preview.fingerprint };
}
async function link(a: Client, b: Client) {
  await run(a.firestore, a.uid, await command(a, b, 'link'));
  const accept = await command(b, a, 'link');
  await run(b.firestore, b.uid, accept); return accept;
}
async function forged(actor: Client, other: Client, changes: Record<string, unknown>) {
  const ref = sparkRelationshipRef(actor.firestore, actor.uid, other.uid), previous = (await getDocFromServer(ref)).data()!;
  const operationId = nextId(), batch = writeBatch(actor.firestore), status = changes.status ?? previous.status;
  batch.set(ref, { ...previous, ...changes, revision: previous.revision + 1, updatedAt: serverTimestamp(), lastActorId: actor.uid, lastOperationId: operationId });
  batch.set(doc(actor.firestore, 'sparkUserRelationshipOperations', actor.uid, 'receipts', operationId), { relatedUserId: other.uid, action: status === 'revoked' ? 'unlink' : 'link', expectedFingerprint: 'forged', revision: previous.revision + 1, status: status === 'revoked' ? 'unlinked' : status, createdAt: serverTimestamp() });
  if (status !== 'revoked') {
    const ref = doc(actor.firestore, 'sparkUserRelationshipQuotas', actor.uid), quota = (await getDocFromServer(ref)).data();
    const windowStartInMillis = Math.floor(Date.now() / 60000) * 60000;
    batch.set(ref, { windowStartInMillis, count: quota?.windowStartInMillis === windowStartInMillis ? quota.count + 1 : 1, lastOperationId: operationId, updatedAt: serverTimestamp() });
  }
  return batch.commit();
}
after(async () => { await Promise.all(clients.map(firestore => terminate(firestore))); for (const app of apps) Object.defineProperty(getAuth(app), 'currentUser', { value: null, writable: true }); await Promise.all(apps.map(app => deleteApp(app))); });

test('convite não revela o perfil alvo nem autoriza leitura; listas são escopadas', async () => {
  const { a, b } = await pair();
  const preview = await run(a.firestore, a.uid, { action: 'preview', relatedUserId: b.uid });
  assert.equal(preview.relatedUserName, 'Conta informada'); assert.equal(preview.isLinked, false);
  assert.equal((await run(a.firestore, a.uid, await command(a, b, 'link'))).status, 'invited');
  await assert.rejects(getDocFromServer(doc(a.firestore, 'users', b.uid)), /permission/i);
  assert.deepEqual((await overview(b.firestore, b.uid)).incoming, [{ id: a.uid, name: 'Ana' }]);
  assert.equal((await overview(a.firestore, a.uid)).outgoing.length, 1);
  await assert.rejects(getDocsFromServer(collectionGroup(a.firestore, 'sparkRelationshipPairs')), /permission/i);
});
test('somente destinatário aceita, com perfil e papéis preservados', async () => {
  const { a, b } = await pair(); await run(a.firestore, a.uid, await command(a, b, 'link'));
  await assert.rejects(forged(a, b, { status: 'linked', acceptedAt: serverTimestamp() }), /permission/i);
  const accepted = await run(b.firestore, b.uid, await command(b, a, 'link')); assert.equal(accepted.status, 'linked');
  assert.equal((await getDocFromServer(doc(a.firestore, 'users', b.uid))).data()?.name, 'Bia');
  const saved = (await server.doc(`users/${a.uid}`).get()).data()!;
  assert.deepEqual(saved.relatedIdUsers, []); assert.equal(saved.financialGroupRole, 'member'); assert.equal(saved.financialGroupId, `group-${a.uid}`);
  await assert.rejects(updateDoc(doc(a.firestore, 'users', a.uid), { financialGroupRole: 'admin' }), /permission/i);
  await server.doc(`financialGroups/group-${b.uid}`).set({ status: 'active', members: { [b.uid]: 'admin' } });
  await assert.rejects(getDocFromServer(doc(a.firestore, 'financialGroups', `group-${b.uid}`)), /permission/i);
});
test('revogação remove leitura nas duas direções e replay antigo não restaura autoridade', async () => {
  const { a, b } = await pair(); const accepted = await link(a, b);
  await run(a.firestore, a.uid, await command(a, b, 'unlink'));
  await assert.rejects(getDocFromServer(doc(a.firestore, 'users', b.uid)), /permission/i);
  await assert.rejects(getDocFromServer(doc(b.firestore, 'users', a.uid)), /permission/i);
  assert.equal((await run(b.firestore, b.uid, accepted)).idempotent, true);
  assert.equal((await getDocFromServer(sparkRelationshipRef(a.firestore, a.uid, b.uid))).data()?.status, 'revoked');
  await assert.rejects(getDocFromServer(doc(b.firestore, 'users', a.uid)), /permission/i);
});
test('tombstone Spark prevalece sobre concessões e perfis legados ainda recíprocos', async () => {
  const { a, b } = await pair();
  await server.doc(`users/${a.uid}`).update({ relatedIdUsers: [b.uid] }); await server.doc(`users/${b.uid}`).update({ relatedIdUsers: [a.uid] });
  await server.doc(`userRelationshipGrants/${a.uid}/related/${b.uid}`).set({ acceptedAt: AdminTimestamp.now() });
  await server.doc(`userRelationshipGrants/${b.uid}/related/${a.uid}`).set({ acceptedAt: AdminTimestamp.now() });
  assert.equal((await overview(a.firestore, a.uid)).linked.length, 1);
  await run(a.firestore, a.uid, await command(a, b, 'unlink'));
  assert.equal((await overview(a.firestore, a.uid)).linked.length, 0);
  await assert.rejects(getDocFromServer(doc(b.firestore, 'users', a.uid)), /permission/i);
});
test('recibo é privado, imutável e obrigatório no mesmo commit', async () => {
  const { a, b } = await pair(); const request = await command(a, b, 'link'); await run(a.firestore, a.uid, request);
  const receipt = doc(a.firestore, 'sparkUserRelationshipOperations', a.uid, 'receipts', request.clientActionId);
  await assert.rejects(updateDoc(receipt, { status: 'linked' }), /permission/i);
  await assert.rejects(getDocFromServer(doc(b.firestore, 'sparkUserRelationshipOperations', a.uid, 'receipts', request.clientActionId)), /permission/i);
  await assert.rejects(updateDoc(sparkRelationshipRef(a.firestore, a.uid, b.uid), { status: 'revoked', revision: 2, lastOperationId: nextId(), updatedAt: serverTimestamp() }), /permission/i);
  await assert.rejects(deleteDoc(sparkRelationshipRef(a.firestore, a.uid, b.uid)), /permission/i);
});
test('reenvio tem um efeito e rejeita mudança de material sob o mesmo ID', async () => {
  const { a, b } = await pair(); const request = await command(a, b, 'link'); await run(a.firestore, a.uid, request);
  assert.equal((await run(a.firestore, a.uid, request)).idempotent, true);
  assert.equal((await getDocFromServer(sparkRelationshipRef(a.firestore, a.uid, b.uid))).data()?.revision, 1);
  await assert.rejects(run(a.firestore, a.uid, { ...request, action: 'unlink' }), /outro pedido/);
});
test('prévia obsoleta ou convite expirado não aceita nem muda participantes', async () => {
  const { a, b } = await pair(); await run(a.firestore, a.uid, await command(a, b, 'link'));
  const accept = await command(b, a, 'link');
  const ref = sparkRelationshipRef(a.firestore, a.uid, b.uid);
  await server.doc(ref.path).update({ createdAt: AdminTimestamp.fromMillis(Date.now() - 8 * 24 * 60 * 60 * 1000) });
  await assert.rejects(run(b.firestore, b.uid, accept), /vínculos mudaram/);
  await assert.rejects(forged(b, a, { status: 'linked', acceptedAt: serverTimestamp() }), /permission/i);
  await assert.rejects(forged(a, b, { participants: [a.uid, 'another'] }), /permission/i);
  assert.equal((await overview(b.firestore, b.uid)).incoming.length, 0);
  await run(a.firestore, a.uid, await command(a, b, 'link'));
  assert.equal((await overview(b.firestore, b.uid)).incoming.length, 1);
});
test('convites cruzados não aceitam automaticamente e pares independentes não conflitam', async () => {
  const { a, b } = await pair(); const c = await user(`c-${++sequence}`, 'Caio');
  const [ab, ba, ac] = await Promise.all([command(a, b, 'link'), command(b, a, 'link'), command(a, c, 'link')]);
  const results = await Promise.allSettled([run(a.firestore, a.uid, ab), run(b.firestore, b.uid, ba)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await run(a.firestore, a.uid, ac)).status, 'invited');
  assert.equal((await getDocFromServer(sparkRelationshipRef(a.firestore, a.uid, b.uid))).data()?.status, 'invited');
});
test('terceiro, conta inexistente e sessão revogada falham sem escrita parcial', async () => {
  const { a, b } = await pair(); const c = await user(`c-${++sequence}`, 'Caio');
  await run(a.firestore, a.uid, await command(a, b, 'link'));
  await assert.rejects(getDocFromServer(sparkRelationshipRef(c.firestore, a.uid, b.uid)), /permission/i);
  await assert.rejects(run(a.firestore, a.uid, { action: 'preview', relatedUserId: a.uid }), /própria conta/);
  await assert.rejects(run(a.firestore, a.uid, { action: 'link', relatedUserId: 'missing', clientActionId: nextId(), expectedFingerprint: '[0,null,null,false,false,false]' }), /permission/i);
  const request = await command(b, a, 'link');
  await assert.rejects(run(b.firestore, b.uid, { ...request, isCurrent: () => false }), /conta ou a tela mudou/);
  Object.defineProperty(b.auth, 'currentUser', { value: null, writable: true });
  await assert.rejects(run(b.firestore, b.uid, request), /conta ou a tela mudou/);
});

test('cota de dez envios/aceites é atômica e não impede revogação', async () => {
  const { a, b } = await pair(); await run(a.firestore, a.uid, await command(a, b, 'link'));
  const windowStartInMillis = Math.floor(Date.now() / 60000) * 60000;
  await server.doc(`sparkUserRelationshipQuotas/${b.uid}`).set({ windowStartInMillis, count: 10, lastOperationId: nextId(), updatedAt: AdminTimestamp.now() });
  await assert.rejects(run(b.firestore, b.uid, await command(b, a, 'link')), /Limite de convites/);
  await assert.rejects(forged(b, a, { status: 'linked', acceptedAt: serverTimestamp() }), /permission/i);
  assert.equal((await getDocFromServer(sparkRelationshipRef(a.firestore, a.uid, b.uid))).data()?.status, 'invited');
  assert.equal((await run(b.firestore, b.uid, await command(b, a, 'unlink'))).status, 'unlinked');
});

test('revogação sem vínculo não grava estado nem permite criar tombstones arbitrários', async () => {
  const { a, b } = await pair(); const request = await command(a, b, 'unlink');
  assert.equal((await run(a.firestore, a.uid, request)).changed, false);
  const ref = sparkRelationshipRef(a.firestore, a.uid, b.uid); assert.equal((await getDocFromServer(ref)).exists(), false);
  const operationId = nextId(), batch = writeBatch(a.firestore);
  batch.set(ref, { schemaVersion: 1, participants: [a.uid, b.uid].sort(), senderId: a.uid, senderName: 'Ana', status: 'revoked', revision: 1, inviteId: operationId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), acceptedAt: null, lastActorId: a.uid, lastOperationId: operationId });
  batch.set(doc(a.firestore, 'sparkUserRelationshipOperations', a.uid, 'receipts', operationId), { relatedUserId: b.uid, action: 'unlink', expectedFingerprint: request.expectedFingerprint, revision: 1, status: 'unlinked', createdAt: serverTimestamp() });
  await assert.rejects(batch.commit(), /permission/i);
});
