import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonical, sealSnapshot, type LocalSnapshot } from '../scripts/lib/sparkLocalSnapshot';
import { inspectSparkAccount } from '../scripts/lib/sparkAccountPreflight';
const str = (value: string) => ({ stringValue: value });
const fixture = (documents: LocalSnapshot['documents']) => sealSnapshot({ format:'lumus-firestore-emulator-snapshot', schemaVersion:1,
  databaseId:'(default)', projectId:'demo-lumus-snapshot', capturedAt:'2026-10-27T12:00:00.000Z',
  consistency:'two-matching-scans-not-point-in-time', artifacts:{rules:'rules_version = "2";',indexes:'{"indexes":[]}'}, documents });
test('conta legada com dados é identificada sem alterar o snapshot ou autorizar migração', () => {
  const source = fixture([{path:'users/person',fields:{}},{path:'banks/one',fields:{personId:str('person')}},
    {path:'expenses/two',fields:{personId:str('person'),valueInCents:{integerValue:'1250'}}},{path:'cards/card',fields:{personId:str('person')}},{path:'investmentCdiRates/rate',fields:{personId:str('person')}},{path:'gains/other',fields:{personId:str('other')}}]);
  const before=canonical(source), report=inspectSparkAccount(source,'person');
  assert.equal(report.status,'legacy-with-observed-data');assert.equal(report.counts.banks,1);assert.equal(report.counts.expenses,1);
  assert.equal(report.counts.cards,1);assert.equal(report.counts.investmentCdiRates,1);assert.equal(report.counts.gains,0);assert.equal(report.snapshotSha256,source.sha256);assert.equal(canonical(source),before);
  assert.equal(report.canInitialize,false);assert.equal(report.canMigrate,false);assert.equal(report.readyForCutover,false);assert.deepEqual(report.writes,[]);
});
test('ausência de registros não comprova conta nova ou autorização de inicialização',()=>{
  const report=inspectSparkAccount(fixture([{path:'users/person',fields:{}}]),'person');
  assert.equal(report.status,'no-legacy-documents-observed');assert.equal(report.authIncluded,false);assert.equal(report.canInitialize,false);
  assert.equal(report.sourceCompleteness,'emulator-traversal-only');
});
test('investimento da coleção antiga também caracteriza histórico observado',()=>{
  const report=inspectSparkAccount(fixture([{path:'users/person',fields:{}},{path:'investments/older',fields:{personId:str('person')}}]),'person');
  assert.equal(report.status,'legacy-with-observed-data');assert.equal(report.counts.investments,1);assert.equal(report.canInitialize,false);
});
test('documentos sem dono ou com titulares divergentes são ambíguos',()=>{
  const report=inspectSparkAccount(fixture([{path:'users/person',fields:{}},{path:'expenses/unknown',fields:{}},
    {path:'banks/conflict',fields:{personId:str('person'),userId:str('other')}}]),'person');
  assert.deepEqual(report.ambiguousSources,['banks/conflict','expenses/unknown']);assert.equal(report.observedDocuments,0);assert.equal(report.canMigrate,false);
});
test('perfil ausente e vínculo de grupo inválido são desconhecidos, nunca inicializados',()=>{
  const source=fixture([{path:'users/other',fields:{financialGroupId:str('missing')}}]);
  assert.equal(inspectSparkAccount(source,'person').status,'unknown');assert.equal(inspectSparkAccount(source,'other').status,'unknown');assert.throws(()=>inspectSparkAccount(source,'../x'),/UID/);
});
test('conta do razão ou Spark existente não é tratada como nova',()=>{
  for (const spark of [false,true]) {
    const source=fixture([{path:'users/person',fields:{financialGroupId:str('g'),financialGroupRole:str('admin')}},
      {path:'financialCutovers/person',fields:{groupId:str('g')}},
      {path:'financialGroups/g',fields:{status:str('active'),members:{mapValue:{fields:{person:str('admin')}}},...(spark?{sparkProtocol:str('financial-proof-v17')}:{})}}]);
    const report=inspectSparkAccount(source,'person');assert.equal(report.status,spark?'spark-marked':'ledger');assert.equal(report.canInitialize,false);
  }
});
