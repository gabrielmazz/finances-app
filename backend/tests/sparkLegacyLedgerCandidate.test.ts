import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLegacyLedgerCandidate } from '../scripts/lib/sparkLegacyLedgerCandidate';
import { canonical } from '../scripts/lib/sparkLocalSnapshot';
import { normalizeSparkLegacy } from '../scripts/lib/sparkLegacyNormalization';
import { legacyImportFixture, resealImportFixture } from './fixtures/sparkImportFixture';

test('converte fontes suportadas em candidato reconciliado sem alterar a origem', () => {
  const { snapshot, scope } = legacyImportFixture(), before = canonical(snapshot);
  const candidate = buildLegacyLedgerCandidate(snapshot, scope);
  assert.equal(canonical(snapshot), before);
  assert.equal(candidate.sourceSnapshotSha256, snapshot.sha256);
  assert.equal(candidate.candidateSha256, buildLegacyLedgerCandidate(snapshot, scope).candidateSha256);
  assert.equal(candidate.accounts.find(account => account.legacyBankId === 'bank')?.currentBalanceInCents, 1200);
  assert.equal(candidate.transactions.find(event => event.sourceReferences?.some(ref => ref.collection === 'gains' && ref.id === 'income'))?.actorId, 'guest');
  assert.equal(candidate.reconciliationChecksPassed, true);
  assert.equal(Object.hasOwn(candidate.reconciliation, 'eligibleForReviewedBootstrap'), false);
  assert.equal(candidate.canApply, false); assert.equal(candidate.readyForCutover, false);
});

test('fontes com autoria ambígua bloqueiam o candidato inteiro', () => {
  const { snapshot, scope } = legacyImportFixture();
  snapshot.documents.push({ path: 'gains/conflict', fields: { personId: { stringValue: 'outside' }, userId: { stringValue: 'owner' } } });
  assert.throws(() => buildLegacyLedgerCandidate(resealImportFixture(snapshot), scope), /pendências/);
});

test('ajuste de caixa sem autoria verificável não ganha autor inventado', () => {
  const { snapshot, scope } = legacyImportFixture();
  const adjusted = { ...scope, confirmedCashBalanceInCents: 100 };
  assert(normalizeSparkLegacy(snapshot, adjusted).issues.some(issue => issue.code === 'unknown-legacy-actor'));
  assert.throws(() => buildLegacyLedgerCandidate(snapshot, adjusted), /pendências/);
});

test('snapshot adulterado não produz candidato', () => {
  const { snapshot, scope } = legacyImportFixture();
  snapshot.documents[0].fields.name = { stringValue: 'alterado' };
  assert.throws(() => buildLegacyLedgerCandidate(snapshot, scope), /integridade/i);
});

test('banco sem abertura comprovada não produz candidato nem inventa saldo zero', () => {
  const { snapshot, scope } = legacyImportFixture();
  snapshot.documents = snapshot.documents.filter(row => row.path !== 'monthlyBalances/opening');
  assert.throws(() => buildLegacyLedgerCandidate(resealImportFixture(snapshot), scope), /pendências/);
});
