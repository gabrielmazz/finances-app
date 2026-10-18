import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonical, dataDigest, digest, inventorySnapshot, LocalFirestore, sealSnapshot, validateSnapshot, type Fields, type LocalSnapshot } from '../scripts/lib/sparkLocalSnapshot';
import { prepareSparkBootstrap } from '../scripts/lib/sparkBootstrapPreflight';

const string = (value: string) => ({ stringValue: value });
const integer = (value: number | string) => ({ integerValue: String(value) });
const timestamp = (value = '2026-09-01T03:00:00Z') => ({ timestampValue: value });
function fixture(): LocalSnapshot {
  return sealSnapshot({ format: 'lumus-firestore-emulator-snapshot', schemaVersion: 1, databaseId: '(default)', projectId: 'demo-lumus-snapshot',
    capturedAt: '2026-10-18T12:00:00.000Z', consistency: 'two-matching-scans-not-point-in-time', artifacts: { rules: 'rules_version = "2";', indexes: '{"indexes":[]}' }, documents: [
      { path: 'financialGroups/group', fields: { status: string('active'), members: { mapValue: { fields: { owner: string('admin') } } } } },
      { path: 'users/owner', fields: { financialGroupId: string('group'), financialGroupRole: string('admin') } },
      { path: 'financialCutovers/owner', fields: { groupId: string('group') } },
      { path: 'financialAccounts/bank', fields: { groupId: string('group'), kind: string('bank'), name: string('Bank'), currentBalanceInCents: integer(1100) } },
      { path: 'ledgerTransactions/income', fields: { groupId: string('group'), actorId: string('owner'), kind: string('income'), clientActionId: string('income_123456'), effectiveAt: timestamp(),
        legs: { arrayValue: { values: [{ mapValue: { fields: { accountId: string('bank'), deltaInCents: integer(100) } } }, { mapValue: { fields: { accountId: { nullValue: null }, deltaInCents: integer(-100) } } }] } } } },
      { path: 'accountReconciliations/opening', fields: { groupId: string('group'), accountId: string('bank'), effectiveAt: timestamp(), countedBalanceInCents: integer(1000), differenceInCents: integer(1000), source: string('legacyMonthStart') } },
    ] });
}
const reseal = (snapshot: LocalSnapshot) => { const { sha256: _, ...body } = snapshot; return sealSnapshot(body); };
test('snapshot e dry-run ligam o bruto à reconciliação, sem permissão de escrita', () => {
  const snapshot = fixture(); validateSnapshot(snapshot);
  const plan = prepareSparkBootstrap(snapshot, 'group', new Date('2026-10-01T00:00:00Z'));
  assert.equal(plan.canReviewInitialization, true); assert.equal(plan.canApply, false); assert.equal(plan.readyForCutover, false);
  assert.equal(plan.snapshotSha256, snapshot.sha256); assert.deepEqual(plan.writes, []);
  assert.equal(plan.reconciliation?.accounts[0].calculatedBalanceInCents, 1100);
  assert.match(canonical(plan), /2026-10-01T00:00:00.000Z/);
});
test('checksum independe da ordem das chaves e preserva -0', () => {
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
  assert.notEqual(digest({ doubleValue: -0 }), digest({ doubleValue: 0 }));
  assert.equal(Object.is(JSON.parse(canonical({ doubleValue: -0 })).doubleValue, -0), true);
});
test('datas e valores materiais mudam o hash de normalização', () => {
  const snapshot = fixture(), previous = prepareSparkBootstrap(snapshot, 'group', new Date('2026-10-01Z'));
  snapshot.documents[4].fields.effectiveAt = timestamp('2026-09-02T03:00:00Z');
  assert.notEqual(prepareSparkBootstrap(reseal(snapshot), 'group', new Date('2026-10-01Z')).normalizedSha256, previous.normalizedSha256);
});
test('mudança material sem novo checksum é recusada', () => {
  const snapshot = fixture(); snapshot.documents[0].fields.status.stringValue = 'migrating'; assert.throws(() => validateSnapshot(snapshot), /Integridade/);
});
for (const mutate of [
  (s: any) => s.schemaVersion = 2,
  (s: any) => s.projectId = 'finances-app-e8685',
  (s: any) => s.documents.push(s.documents[0]),
  (s: any) => s.documents[0].path = 'users/../children/a',
  (s: any) => s.documents[0].fields = { amount: { integerValue: '9223372036854775808' } },
  (s: any) => s.documents[0].fields = { amount: { mysteryValue: 1 } },
  (s: any) => s.documents[0].fields = { amount: { integerValue: '01' } },
  (s: any) => s.documents[0].fields = { at: { timestampValue: '2026-02-31T00:00:00Z' } },
  (s: any) => s.documents[0].fields = { a: { integerValue: '1', stringValue: '1' } },
  (s: any) => s.documents[0].fields = { bytes: { bytesValue: 'invalid!' } },
  (s: any) => s.documents[0].fields = { point: { geoPointValue: { latitude: 91, longitude: 0 } } },
  (s: any) => s.documents[0].fields = { list: { arrayValue: { values: [{ arrayValue: {} }] } } },
  (s: any) => s.unrecognized = true,
]) test(`recusa corrupção/estrutura inválida ${mutate.toString().split('=>')[1]}`, () => {
  const snapshot = fixture(); mutate(snapshot); assert.throws(() => validateSnapshot(reseal(snapshot)));
});
test('snapshot tipado aceita int64 extremo, nanos, tipos especiais e mapas vazios', () => {
  const snapshot = fixture(); snapshot.documents.push({ path: 'unknown/values', fields: {
    min: integer('-9223372036854775808'), max: integer('9223372036854775807'), at: timestamp('2026-09-01T03:00:00.123456789Z'),
    bytes: { bytesValue: 'AAEC/w==' }, point: { geoPointValue: { latitude: -23, longitude: -46 } }, zero: { geoPointValue: {} }, equator: { geoPointValue: { longitude: 15 } }, map: { mapValue: {} }, array: { arrayValue: {} },
    ref: { referenceValue: 'projects/demo-lumus-snapshot/databases/(default)/documents/users/owner' },
    nan: { doubleValue: 'NaN' }, infinity: { doubleValue: 'Infinity' }, negative: { doubleValue: -0 },
  } }); validateSnapshot(reseal(snapshot));
});
test('inventário inclui coleções desconhecidas, subcoleções, pais ausentes e não aprova corte', () => {
  const snapshot = fixture(); snapshot.documents.push({ path: 'unknown/missing/nested/item', fields: {} });
  const inventory = inventorySnapshot(reseal(snapshot));
  assert.equal(inventory.collections['unknown/{id}/nested'], 1); assert.deepEqual(inventory.missingParents, ['unknown/missing']);
  assert.equal(inventory.readyForCutover, false); assert.equal(inventory.groups[0].groupId, 'group');
});
for (const [host, project] of [['firebase.google.com:8080', 'demo-x'], ['localhost:8080', 'demo-x'], ['127.0.0.2:8080', 'demo-x'],
  ['127.0.0.1:8080/path', 'demo-x'], ['127.0.0.1:8080@remote', 'demo-x'], ['127.0.0.1:65536', 'demo-x'], ['127.0.0.1:8080', 'finances-app-e8685']]) {
  test(`nenhum acesso de rede para destino recusado ${host}/${project}`, () => {
    assert.throws(() => new LocalFirestore(project, host, '127.0.0.1:4400', (() => { throw new Error('Não deve acessar rede'); }) as any));
  });
}
test('Hub com Functions bloqueia antes de ler/escrever documentos', async () => {
  let requests = 0;
  const client = new LocalFirestore('demo-lumus-snapshot', '127.0.0.1:8080', '127.0.0.1:4400', (async () => {
    requests++; return new Response(JSON.stringify({ firestore: { host: '127.0.0.1', port: 8080 }, functions: { port: 5001 } }));
  }) as typeof fetch);
  await assert.rejects(client.restore(fixture()), /sem Functions/); assert.equal(requests, 1);
});
test('não remapeia referências para outro projeto demo', async () => {
  const client = new LocalFirestore('demo-another', '127.0.0.1:8080', '127.0.0.1:4400', (() => { throw new Error('Sem rede'); }) as any);
  await assert.rejects(client.restore(fixture()), /mesmo projeto/);
});
test('digest de dados ignora somente metadados gerados pelo servidor', () => {
  assert.equal(dataDigest([{ path: 'a/b', fields: {}, createTime: '2026-01-01T00:00:00Z' }]), dataDigest([{ path: 'a/b', fields: {}, createTime: '2026-02-01T00:00:00Z' }]));
});
for (const [label, change, code] of [
  ['saldo divergente', (s: LocalSnapshot) => s.documents[3].fields.currentBalanceInCents = integer(1001), 'balance-mismatch'],
  ['abertura futura', (s: LocalSnapshot) => s.documents[5].fields.effectiveAt = timestamp('2027-01-01T00:00:00Z'), 'future-opening'],
  ['papel unilateral', (s: LocalSnapshot) => s.documents[1].fields.financialGroupRole = string('member'), 'membership-mismatch'],
  ['data fina', (s: LocalSnapshot) => s.documents[4].fields.effectiveAt = timestamp('2026-09-01T03:00:00.000001Z'), 'unsupported-normalization'],
  ['inteiro não seguro', (s: LocalSnapshot) => s.documents[3].fields.currentBalanceInCents = integer('9007199254740993'), 'unsupported-normalization'],
  ['referência ausente', (s: LocalSnapshot) => s.documents[4].fields.sourceReferences = { arrayValue: { values: [{ mapValue: { fields: { collection: string('gains'), id: string('missing') } } }] } }, 'missing-source-reference'],
  ['ajuste editável', (s: LocalSnapshot) => s.documents[4].fields.kind = string('reconciliation_adjustment'), 'adjustment-normalization-required'],
  ['já inicializado', (s: LocalSnapshot) => s.documents[0].fields.sparkProtocol = string('financial-proof-v6'), 'already-spark'],
] as Array<[string, (s: LocalSnapshot) => unknown, string]>) test(`preflight bloqueia ${label}`, () => {
  const snapshot = fixture(); change(snapshot);
  const plan = prepareSparkBootstrap(reseal(snapshot), 'group', new Date('2026-10-01T00:00:00Z'));
  assert.equal(plan.canReviewInitialization, false); assert(plan.issues.some(issue => issue.code === code)); assert.deepEqual(plan.writes, []);
});
test('legado sem grupo nunca vira razão implicitamente', () => {
  const snapshot = fixture(); snapshot.documents = [{ path: 'banks/bank', fields: { personId: string('owner'), amount: integer(100) } }];
  const plan = prepareSparkBootstrap(reseal(snapshot), 'group', new Date('2026-10-01Z'));
  assert.equal(plan.canReviewInitialization, false); assert(plan.issues.some(issue => issue.code === 'missing-accounts'));
});
test('inventário trata campo de grupo malformado como desconhecido', () => {
  const snapshot = fixture(); snapshot.documents = [{ path: 'users/owner', fields: { financialGroupId: integer(1) } }];
  const report = inventorySnapshot(reseal(snapshot));
  assert.equal(report.users[0].storageModel, 'unknown'); assert(report.issues.some(issue => issue.code === 'ambiguous-storage-model'));
});
test('inventário aponta abertura mensal duplicada sem alterar fonte', () => {
  const snapshot = fixture(); const fields = { bankId: string('bank'), year: integer(2026), month: integer(10) };
  snapshot.documents.push({ path: 'monthlyBalances/a', fields }, { path: 'monthlyBalances/b', fields });
  const report = inventorySnapshot(reseal(snapshot));
  assert(report.issues.some(issue => issue.code === 'duplicate-monthly-opening')); assert.equal(report.documentCount, 8);
});
test('preflight identifica lista de referências malformada', () => {
  const snapshot = fixture(); snapshot.documents[4].fields.sourceReferences = { mapValue: {} };
  const plan = prepareSparkBootstrap(reseal(snapshot), 'group', new Date('2026-10-01Z'));
  assert(plan.issues.some(issue => issue.code === 'invalid-source-references')); assert.equal(plan.canReviewInitialization, false);
});
test('referência nula gera pendência em vez de interromper o relatório', () => {
  const snapshot = fixture(); snapshot.documents[4].fields.sourceReferences = { arrayValue: { values: [{ nullValue: null }] } };
  const plan = prepareSparkBootstrap(reseal(snapshot), 'group', new Date('2026-10-01Z'));
  assert.equal(plan.canReviewInitialization, false); assert(plan.issues.some(issue => issue.code === 'missing-source-reference'));
});
test('preflight bloqueia perfil/corte que reivindicam grupo sem pertencer aos membros', () => {
  const snapshot = fixture(); snapshot.documents.push(
    { path: 'users/intruder', fields: { financialGroupId: string('group'), financialGroupRole: string('member') } },
    { path: 'financialCutovers/intruder', fields: { groupId: string('group') } });
  const plan = prepareSparkBootstrap(reseal(snapshot), 'group', new Date('2026-10-01Z'));
  assert.equal(plan.canReviewInitialization, false); assert(plan.issues.some(issue => issue.code === 'inventory-ambiguous-storage-model'));
});
test('preflight não ignora ajuste editável fora dos eventos do razão', () => {
  const snapshot = fixture(); snapshot.documents.push({ path: 'bankBalanceAdjustments/editable', fields: { personId: string('owner') } });
  const plan = prepareSparkBootstrap(reseal(snapshot), 'group', new Date('2026-10-01Z'));
  assert.equal(plan.canReviewInitialization, false); assert(plan.issues.some(issue => issue.code === 'adjustment-normalization-required'));
});
test('falha no segundo lote conserva erro e não apaga nem repete o primeiro', async () => {
  let commits = 0; const requests: string[] = [];
  const snapshot = fixture(); snapshot.documents = Array.from({ length: 150 }, (_, index) => ({ path: `restore/${index}`, fields: {} }));
  const client = new LocalFirestore(snapshot.projectId, '127.0.0.1:8080', '127.0.0.1:4400', (async (url: any, init: any) => {
    requests.push(`${init?.method ?? 'GET'} ${url}`);
    if (String(url).endsWith('/emulators')) return new Response(JSON.stringify({ firestore: { host: '127.0.0.1', port: 8080 } }));
    assert.equal(init.redirect, 'error');
    if (String(url).endsWith(':listCollectionIds')) return new Response('{}');
    assert(String(url).endsWith(':commit')); const writes = JSON.parse(init.body).writes;
    assert(writes.every((write: any) => write.currentDocument.exists === false));
    commits++; return commits === 1 ? new Response('{}') : new Response('sensitive body', { status: 503 });
  }) as typeof fetch);
  await assert.rejects(client.restore(reseal(snapshot)), error => {
    assert.match(String(error), /503/); assert.doesNotMatch(String(error), /sensitive/); return true;
  });
  assert.equal(commits, 2); assert.equal(requests.some(request => request.startsWith('DELETE')), false);
});
test('captura instável é recusada e não retorna backup certificado', async () => {
  let scans = 0;
  const client = new LocalFirestore('demo-lumus-snapshot', '127.0.0.1:8080', '127.0.0.1:4400', (async (url: any) => {
    if (String(url).endsWith('/emulators')) return new Response(JSON.stringify({ firestore: { host: '127.0.0.1', port: 8080 } }));
    if (String(url).endsWith('/documents:listCollectionIds')) { scans++; return new Response('{"collectionIds":["a"]}'); }
    if (String(url).includes('/documents/a?')) return new Response(JSON.stringify({ documents: [{ name: 'projects/demo-lumus-snapshot/databases/(default)/documents/a/b', fields: { revision: integer(scans) } }] }));
    return new Response('{}');
  }) as typeof fetch);
  await assert.rejects(client.capture(fixture().artifacts), /Dados mudaram/);
});
test('token de paginação repetido é recusado', async () => {
  const client = new LocalFirestore('demo-lumus-snapshot', '127.0.0.1:8080', '127.0.0.1:4400', (async () => new Response('{"nextPageToken":"same"}')) as typeof fetch);
  await assert.rejects(client.scan(), /Paginação/);
});
