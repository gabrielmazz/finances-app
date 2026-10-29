import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewLegacySpark } from '../scripts/lib/sparkLegacySparkPreview';
import { canonical } from '../scripts/lib/sparkLocalSnapshot';
import { financialFields } from '../scripts/lib/sparkLedgerImport';
import { decodeSparkFinancialValue } from '../scripts/lib/sparkBootstrapPreflight';
import { legacyImportFixture, resealImportFixture } from './fixtures/sparkImportFixture';

test('conecta legado suportado ao plano Spark sem alterar a origem ou habilitar o grupo', () => {
  const { snapshot, scope } = legacyImportFixture(), before = canonical(snapshot);
  const preview = previewLegacySpark(snapshot, scope);
  assert.equal(canonical(snapshot), before);
  assert.equal(preview.sourceSnapshotSha256, snapshot.sha256);
  assert.equal(preview.previewSha256, previewLegacySpark(snapshot, scope).previewSha256);
  assert.equal(preview.groupPreview.fields.status.stringValue, 'spark_importing');
  assert.equal(preview.groupPreview.fields.sparkProtocol, undefined);
  assert.equal(preview.mappings.find(row => row.sourceAccountId === 'bank-bank')?.balanceInCents, 1200);
  assert(preview.generatedDocuments.some(row => row.fields.kind?.stringValue === 'imported_movement' && row.fields.actorId?.stringValue === 'guest'));
  assert(preview.sourceRecords.some(row => row.path === 'gains/income' && row.actorId === 'guest' && row.documentSha256.length === 64));
  const catalog = preview.generatedDocuments.find(row => row.path.endsWith('/sparkAccountCatalog/bank-bank'))!;
  assert.equal(catalog.fields.name.stringValue, 'Bank');
  assert.equal(catalog.fields.actorId.stringValue, 'owner');
  assert.equal(decodeSparkFinancialValue(catalog.fields.revision), 0);
  assert.equal(preview.canApply, false); assert.equal(preview.readyForCutover, false);
});

test('banco inativo não é convertido como ativo', () => {
  const { snapshot, scope } = legacyImportFixture();
  snapshot.documents.find(row => row.path === 'banks/bank')!.fields.isActive = { booleanValue: false };
  assert.throws(() => previewLegacySpark(resealImportFixture(snapshot), scope), /inativo/);
});

test('cadastro bancário preserva nome, cor e ícone válidos', () => {
  const { snapshot, scope } = legacyImportFixture(), bank = snapshot.documents.find(row => row.path === 'banks/bank')!;
  bank.fields.colorHex = { stringValue: '#aabbcc' }; bank.fields.iconKey = { stringValue: 'nubank' };
  const preview = previewLegacySpark(resealImportFixture(snapshot), scope);
  const catalog = preview.generatedDocuments.find(row => row.path.endsWith('/sparkAccountCatalog/bank-bank'))!;
  assert.equal(catalog.fields.colorHex.stringValue, '#aabbcc'); assert.equal(catalog.fields.iconKey.stringValue, 'nubank');
});

test('metadado bancário incompatível não é descartado para aprovar conversão', () => {
  const { snapshot, scope } = legacyImportFixture();
  snapshot.documents.find(row => row.path === 'banks/bank')!.fields.colorHex = { stringValue: 'invalid' };
  assert.throws(() => previewLegacySpark(resealImportFixture(snapshot), scope), /revisão/);
});

test('colisão com documentos existentes não é sobrescrita', () => {
  const { snapshot, scope } = legacyImportFixture();
  snapshot.documents.push({ path: 'financialAccounts/bank-bank', fields: financialFields({ groupId: 'other' }) });
  assert.throws(() => previewLegacySpark(resealImportFixture(snapshot), scope), /colide/);
});

test('categoria legada é preservada e protegida na prévia do histórico', () => {
  const { snapshot, scope } = legacyImportFixture();
  snapshot.documents.find(row => row.path === 'gains/income')!.fields.tagId = { stringValue: 'category' };
  snapshot.documents.push({ path: 'tags/category', fields: financialFields({ personId: 'owner', name: 'Categoria', usageType: 'gain' }) });
  const preview = previewLegacySpark(resealImportFixture(snapshot), scope);
  const tag = preview.generatedDocuments.find(row => row.path === 'tags/category')!;
  assert.equal(tag.fields.groupId.stringValue, scope.groupId);
  assert.equal(tag.fields.historyKnown.booleanValue, false);
  assert(preview.generatedDocuments.some(row => row.path === 'sparkCategoryReferences/category'));
  assert(preview.generatedDocuments.some(row => row.path === `financialGroups/${scope.groupId}/sparkMetadataOrigins/category_category`));
  assert(preview.generatedDocuments.some(row => row.path.includes('/sparkImportedIdentities/') && row.fields.categoryId?.stringValue === 'category'));
});

test('categoria ausente bloqueia a prévia', () => {
  const { snapshot, scope } = legacyImportFixture();
  snapshot.documents.find(row => row.path === 'gains/income')!.fields.tagId = { stringValue: 'missing' };
  assert.throws(() => previewLegacySpark(resealImportFixture(snapshot), scope), /Categoria.*ausente/);
});

test('categoria de outro grupo ou com uso incompatível não é convertida', () => {
  for (const fields of [{ personId: 'owner', groupId: 'other', name: 'Teste' },
    { personId: 'owner', name: 'Teste', usageType: 'expense' }]) {
    const { snapshot, scope } = legacyImportFixture();
    snapshot.documents.find(row => row.path === 'gains/income')!.fields.tagId = { stringValue: 'category' };
    snapshot.documents.push({ path: 'tags/category', fields: financialFields(fields) });
    assert.throws(() => previewLegacySpark(resealImportFixture(snapshot), scope), /Categorias/);
  }
});

test('uso de categoria por titular externo e recorrência não é omitido', () => {
  for (const [collection, owner] of [['gains', 'outside'], ['mandatoryGains', 'owner']]) {
    const { snapshot, scope } = legacyImportFixture();
    snapshot.documents.push({ path: 'tags/category', fields: financialFields({ personId: 'owner', name: 'Teste' }) });
    snapshot.documents.push({ path: `${collection}/other`, fields: financialFields({ personId: owner, tagId: 'category' }) });
    assert.throws(() => previewLegacySpark(resealImportFixture(snapshot), scope), /referência|metadados/);
  }
});

test('categoria ligada a movimento impede conversão parcial mesmo fora do escopo', () => {
  const { snapshot, scope } = legacyImportFixture();
  snapshot.documents.find(row => row.path === 'gains/income')!.fields.tagId = { stringValue: 'outside-tag' };
  snapshot.documents.push({ path: 'tags/outside-tag', fields: financialFields({ personId: 'outside', name: 'Categoria' }) });
  assert.throws(() => previewLegacySpark(resealImportFixture(snapshot), scope), /Categorias/);
});

test('metadado com alias de membro não é descartado pelo titular externo', () => {
  const { snapshot, scope } = legacyImportFixture();
  snapshot.documents.push({ path: 'tags/ambiguous', fields: financialFields({ personId: 'outside', userId: 'owner', name: 'Categoria' }) });
  assert.throws(() => previewLegacySpark(resealImportFixture(snapshot), scope), /metadados/);
});

test('histórico volumoso preserva todos os movimentos, autores e saldo reconciliado', () => {
  const { snapshot, scope } = legacyImportFixture();
  const count = 1500;
  for (let index = 0; index < count; index++) {
    snapshot.documents.push({ path: `gains/bulk-${index}`, fields: financialFields({
      personId: index % 2 ? 'owner' : 'guest', bankId: 'bank', valueInCents: 1,
      date: new Date('2026-09-10T12:00:00Z'),
    }) });
  }
  const preview = previewLegacySpark(resealImportFixture(snapshot), scope);
  assert.equal(preview.mappings.find(row => row.sourceAccountId === 'bank-bank')?.balanceInCents, 1200 + count);
  const movements = preview.generatedDocuments.filter(row => row.fields.kind?.stringValue === 'imported_movement');
  assert.equal(movements.length, count + 1);
  assert.equal(movements.filter(row => row.fields.actorId?.stringValue === 'owner').length, count / 2);
  assert.equal(movements.filter(row => row.fields.actorId?.stringValue === 'guest').length, count / 2 + 1);
  assert.equal(preview.sourceRecords.filter(row => row.path.startsWith('gains/bulk-')).length, count);
  assert.equal(preview.canApply, false);
});
