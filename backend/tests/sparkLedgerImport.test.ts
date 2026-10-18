import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSparkLedgerImport, financialFields, importSparkLedgerLocal } from '../scripts/lib/sparkLedgerImport';
import { normalizeSparkLegacy } from '../scripts/lib/sparkLegacyNormalization';
import { canonical, digest, LocalFirestore } from '../scripts/lib/sparkLocalSnapshot';
import { prepareSparkBootstrap } from '../scripts/lib/sparkBootstrapPreflight';
import { importAsOf, ledgerImportFixture, legacyImportFixture, resealImportFixture } from './fixtures/sparkImportFixture';

test('plano determinístico conserva bruto e metadados, bloqueia grupo e não ativa protocolo', () => {
  const snapshot = ledgerImportFixture(), before = canonical(snapshot);
  const plan = buildSparkLedgerImport(snapshot, 'group', importAsOf);
  assert.equal(plan.planSha256, buildSparkLedgerImport(snapshot, 'group', importAsOf).planSha256);
  assert.equal(canonical(snapshot), before); assert.equal(plan.activationAllowed, false);
  const group = plan.documents.find(row => row.path === 'financialGroups/group')!;
  assert.equal(group.fields.status.stringValue, 'spark_importing'); assert.equal(group.fields.sparkProtocol, undefined);
  for (const source of snapshot.documents.filter(row => row.path !== 'financialGroups/group')) assert.deepEqual(plan.documents.find(row => row.path === source.path), source);
  const manifest = plan.documents.find(row => row.path === plan.manifestPath)!;
  assert.deepEqual((manifest.fields.originalGroupFields.mapValue as any).fields, snapshot.documents[0].fields);
  assert(plan.mappings.some(mapping => mapping.sourceAccountId === 'cash-group' && mapping.accountId === 'cash'));
});
test('cadeias contíguas, autoria histórica, ponteiros e raiz neutra têm proveniência', () => {
  const snapshot = ledgerImportFixture(), plan = buildSparkLedgerImport(snapshot, 'group', importAsOf);
  for (const mapping of plan.mappings) {
    const position = plan.documents.find(row => row.path === `financialGroups/group/sparkPositions/${mapping.accountId}`)!;
    let id = String(position.fields.lastOperationId.stringValue), revision = Number(position.fields.revision.integerValue);
    while (true) {
      const node = plan.documents.find(row => row.path === `financialGroups/group/sparkOperations/${id}`)!;
      assert(node); assert.equal(node.fields.accountId.stringValue, mapping.accountId);
      if (node.fields.kind.stringValue === 'account_opening') {
        assert.equal(revision, 0); assert.equal(node.fields.openingBalanceInCents.integerValue, '0'); assert.equal(node.fields.actorId.nullValue, null); break;
      }
      assert.equal(node.fields.expectedRevision.integerValue, String(revision - 1)); revision--;
      id = String(node.fields.previousOperationId.stringValue);
      if (node.fields.sourcePath.stringValue === 'ledgerTransactions/income') assert.equal(node.fields.actorId.stringValue, 'guest');
    }
  }
  assert(plan.documents.some(row => row.path === 'financialGroups/group/sparkMonthlyOpenings/bank-a/cycles/2026-09'));
  assert(plan.documents.some(row => row.path === 'sparkCivilMonths/2026-09'));
});
test('corte faz parte do hash normalizado e do plano', () => {
  const snapshot = ledgerImportFixture(), another = new Date('2026-10-02T12:00:00Z');
  assert.notEqual(prepareSparkBootstrap(snapshot, 'group', importAsOf).normalizedSha256, prepareSparkBootstrap(snapshot, 'group', another).normalizedSha256);
  assert.notEqual(buildSparkLedgerImport(snapshot, 'group', importAsOf).planSha256, buildSparkLedgerImport(snapshot, 'group', another).planSha256);
});
for (const [name, mutate] of [
  ['arquivada', (snapshot: any) => snapshot.documents.find((row: any) => row.path === 'financialAccounts/bank-a').fields.archivedAt = { timestampValue: '2026-09-30T12:00:00Z' }],
  ['inativa', (snapshot: any) => snapshot.documents.find((row: any) => row.path === 'financialAccounts/bank-a').fields.isActive = { booleanValue: false }],
  ['namespace ocupado', (snapshot: any) => snapshot.documents.push({ path: 'financialGroups/group/sparkPositions/foreign', fields: {} })],
  ['saldo final divergente', (snapshot: any) => snapshot.documents.find((row: any) => row.path === 'financialAccounts/bank-a').fields.currentBalanceInCents = { integerValue: '999' }],
  ['calendário divergente', (snapshot: any) => snapshot.documents.push({ path: 'sparkCivilMonths/2026-09', fields: {} })],
  ['autoria não textual', (snapshot: any) => snapshot.documents.find((row: any) => row.path === 'ledgerTransactions/income').fields.actorId = { booleanValue: true }],
] as const) test(`não planeja conta/candidato ${name}`, () => {
  const snapshot = ledgerImportFixture(); mutate(snapshot); assert.throws(() => buildSparkLedgerImport(resealImportFixture(snapshot), 'group', importAsOf));
});
test('contagem posterior não esconde posição histórica fora dos limites', () => {
  const snapshot = ledgerImportFixture();
  snapshot.documents.find(row => row.path === 'ledgerTransactions/income')!.fields.legs = financialFields({ legs: [
    { accountId: 'bank-a', deltaInCents: 1e12 }, { accountId: null, deltaInCents: -1e12 },
  ] }).legs;
  snapshot.documents.push({ path: 'accountReconciliations/later', fields: financialFields({ groupId: 'group', accountId: 'bank-a', effectiveAt: new Date('2026-09-30Z'), countedBalanceInCents: 800, differenceInCents: 0, source: 'manual' }) });
  const source = resealImportFixture(snapshot);
  assert.equal(prepareSparkBootstrap(source, 'group', importAsOf).canReviewInitialization, true);
  assert.throws(() => buildSparkLedgerImport(source, 'group', importAsOf), /fronteira/);
});
test('plano diferente é recusado antes de qualquer rede', async () => {
  const client = new LocalFirestore('demo-lumus-snapshot', '127.0.0.1:8080', '127.0.0.1:4400', (() => { throw new Error('Não acessar rede'); }) as any);
  await assert.rejects(importSparkLedgerLocal(client, ledgerImportFixture(), 'group', importAsOf, '0'.repeat(64)), /Plano mudou/);
});
test('estorno com original existente mas pernas divergentes é bloqueado', () => {
  const snapshot = ledgerImportFixture();
  snapshot.documents.push({ path: 'ledgerTransactions/wrong-reversal', fields: financialFields({ groupId: 'group', kind: 'reversal', reversesTransactionId: 'transfer',
    actorId: 'owner', clientActionId: 'wrong_reversal', effectiveAt: new Date('2026-09-05Z'), legs: [{ accountId: 'bank-a', deltaInCents: 10 }, { accountId: 'bank-b', deltaInCents: -10 }] }) });
  snapshot.documents.find(row => row.path === 'financialAccounts/bank-a')!.fields.currentBalanceInCents = { integerValue: '810' };
  snapshot.documents.find(row => row.path === 'financialAccounts/bank-b')!.fields.currentBalanceInCents = { integerValue: '790' };
  assert.throws(() => buildSparkLedgerImport(resealImportFixture(snapshot), 'group', importAsOf), /inverso exato/);
});
test('legado normalizado usa fechamento civil, conserva fonte e não troca autor pelo primeiro membro', () => {
  const { snapshot, scope } = legacyImportFixture(), before = digest(snapshot);
  const report = normalizeSparkLegacy(snapshot, scope);
  assert.equal(report.canReviewNormalization, true); assert.equal(report.canApply, false); assert.equal(report.readyForCutover, false);
  assert.equal(report.cutoff.toISOString(), '2026-10-01T02:59:59.999Z'); assert.equal(digest(snapshot), before);
  assert.equal(report.reconciliation?.accounts.find(row => row.kind === 'bank')?.sourceBalanceInCents, 1200);
  assert.equal(report.reconciliation?.accounts.flatMap(row => row.entries).find(entry => entry.sourceReferences?.some(ref => ref.collection === 'gains'))?.actorId, 'guest');
});
for (const [name, mutate, code] of [
  ['unidade ambígua', (snapshot: any) => { const row = snapshot.documents.find((row: any) => row.path === 'gains/income'); delete row.fields.valueInCents; row.fields.amount = { integerValue: '200' }; }, 'unsupported-legacy-schema'],
  ['centavos fracionários', (snapshot: any) => snapshot.documents.find((row: any) => row.path === 'gains/income').fields.valueInCents = { doubleValue: 2.5 }, 'unsupported-legacy-schema'],
  ['classificação especial', (snapshot: any) => snapshot.documents.find((row: any) => row.path === 'gains/income').fields.isFinanceInvestmentSync = { booleanValue: true }, 'unsupported-legacy-classification'],
  ['banco ausente', (snapshot: any) => snapshot.documents.find((row: any) => row.path === 'gains/income').fields.bankId = { stringValue: 'missing' }, 'missing-account'],
  ['data sem precisão suportada', (snapshot: any) => snapshot.documents.find((row: any) => row.path === 'gains/income').fields.date = { timestampValue: '2026-09-02T12:00:00.000001Z' }, 'unsupported-legacy-schema'],
  ['dono desconhecido', (snapshot: any) => delete snapshot.documents.find((row: any) => row.path === 'gains/income').fields.personId, 'unscoped-legacy-source'],
  ['contraparte sem par', (snapshot: any) => snapshot.documents.find((row: any) => row.path === 'gains/income').fields.bankTransferPairId = { stringValue: 'missing' }, 'orphan-transfer'],
  ['marcador de transferência sem identidade', (snapshot: any) => snapshot.documents.find((row: any) => row.path === 'gains/income').fields.isBankTransfer = { booleanValue: true }, 'unidentified-transfer-counterpart'],
  ['ajuste disfarçado de receita', (snapshot: any) => snapshot.documents.find((row: any) => row.path === 'gains/income').fields.isBalanceAdjustment = { booleanValue: true }, 'editable-adjustment-normalization-required'],
] as const) test(`normalização não aprova ${name}`, () => {
  const { snapshot, scope } = legacyImportFixture(); mutate(snapshot);
  const report = normalizeSparkLegacy(resealImportFixture(snapshot), scope);
  assert.equal(report.canReviewNormalization, false); assert(report.issues.some(issue => issue.code === code));
});
test('observação de caixa e corte não são inferidos nem arredondados', () => {
  const { snapshot, scope } = legacyImportFixture();
  assert.throws(() => normalizeSparkLegacy(snapshot, { ...scope, confirmedCashBalanceInCents: undefined }));
  assert.throws(() => normalizeSparkLegacy(snapshot, { ...scope, asOf: '2026-09-31T12:00:00Z' }));
  const report = normalizeSparkLegacy(snapshot, { ...scope, asOf: '2026-10-18T12:00:00Z' });
  assert.equal(report.canReviewNormalization, false); assert(report.issues.some(issue => issue.code === 'unobserved-cutoff'));
});
test('autor histórico removido do grupo continua preservado sem ganhar autoridade', () => {
  const snapshot = ledgerImportFixture(); snapshot.documents.find(row => row.path === 'ledgerTransactions/income')!.fields.actorId = { stringValue: 'departed-user' };
  const plan = buildSparkLedgerImport(resealImportFixture(snapshot), 'group', importAsOf);
  assert(plan.generatedDocuments.some(row => row.fields.sourcePath?.stringValue === 'ledgerTransactions/income' && row.fields.actorId.stringValue === 'departed-user'));
  assert.equal(plan.activationAllowed, false);
});
test('estorno exato é preservado, mas resolver o mesmo original duas vezes bloqueia importação', () => {
  const snapshot = ledgerImportFixture();
  const reverse = { groupId: 'group', kind: 'reversal', reversesTransactionId: 'transfer', actorId: 'owner', clientActionId: 'exact_reversal',
    effectiveAt: new Date('2026-09-05Z'), legs: [{ accountId: 'bank-a', deltaInCents: 300 }, { accountId: 'bank-b', deltaInCents: -300 }] };
  snapshot.documents.push({ path: 'ledgerTransactions/reversed', fields: financialFields(reverse) });
  snapshot.documents.find(row => row.path === 'financialAccounts/bank-a')!.fields.currentBalanceInCents = { integerValue: '1100' };
  snapshot.documents.find(row => row.path === 'financialAccounts/bank-b')!.fields.currentBalanceInCents = { integerValue: '500' };
  assert.equal(buildSparkLedgerImport(resealImportFixture(snapshot), 'group', importAsOf).activationAllowed, false);
  snapshot.documents.push({ path: 'ledgerTransactions/twice', fields: financialFields({ ...reverse, clientActionId: 'other_reversal' }) });
  snapshot.documents.find(row => row.path === 'financialAccounts/bank-a')!.fields.currentBalanceInCents = { integerValue: '1400' };
  snapshot.documents.find(row => row.path === 'financialAccounts/bank-b')!.fields.currentBalanceInCents = { integerValue: '200' };
  assert.throws(() => buildSparkLedgerImport(resealImportFixture(snapshot), 'group', importAsOf), /já resolvido/);
});
test('normalização conserva transferência completa sem inflar renda/despesa ordinárias', () => {
  const { snapshot, scope } = legacyImportFixture();
  const put = (path: string, value: Record<string, unknown>) => snapshot.documents.push({ path, fields: financialFields(value) });
  put('banks/other', { personId: 'guest', name: 'Other' });
  put('monthlyBalances/other-opening', { personId: 'guest', bankId: 'other', year: 2026, month: 9, valueInCents: 500 });
  const date = new Date('2026-09-03T12:00:00Z');
  put('expenses/pair-out', { personId: 'owner', bankId: 'bank', bankTransferPairId: 'pair', isBankTransfer: true, valueInCents: 300, date });
  put('gains/pair-in', { personId: 'guest', bankId: 'other', bankTransferPairId: 'pair', isBankTransfer: true, valueInCents: 300, date });
  put('bankTransfers/pair', { personId: 'owner', sourceBankId: 'bank', targetBankId: 'other', valueInCents: 300, date, expenseId: 'pair-out', gainId: 'pair-in' });
  const report = normalizeSparkLegacy(resealImportFixture(snapshot), scope);
  assert.equal(report.canReviewNormalization, true);
  assert.equal(report.reconciliation?.accounts.find(row => row.sourceAccountId === 'bank-bank')?.calculatedBalanceInCents, 900);
  assert.equal(report.reconciliation?.accounts.find(row => row.sourceAccountId === 'bank-other')?.calculatedBalanceInCents, 800);
});
test('investimento exige observação independente e não inventa rendimento para zerar diferenças', () => {
  const { snapshot, scope } = legacyImportFixture();
  snapshot.documents.push({ path: 'financeInvestments/asset', fields: financialFields({ personId: 'owner', name: 'Asset', bankId: 'bank', initialValueInCents: 100, date: new Date('2026-09-04T12:00:00Z') }) });
  const source = resealImportFixture(snapshot);
  assert(normalizeSparkLegacy(source, scope).issues.some(issue => issue.code === 'unverified-investment-position'));
  const matching = normalizeSparkLegacy(source, { ...scope, observedInvestmentBalancesInCents: { asset: 100 } });
  assert.equal(matching.canReviewNormalization, true);
  const mismatch = normalizeSparkLegacy(source, { ...scope, observedInvestmentBalancesInCents: { asset: 150 } });
  assert.equal(mismatch.canReviewNormalization, false); assert(mismatch.issues.some(issue => issue.code === 'balance-mismatch'));
});
test('conferência de caixa preserva saque como transferência entre duas contas', () => {
  const { snapshot, scope } = legacyImportFixture();
  snapshot.documents.push({ path: 'cashRescues/rescue', fields: financialFields({ personId: 'owner', bankId: 'bank', valueInCents: 200, date: new Date('2026-09-04T12:00:00Z') }) });
  const report = normalizeSparkLegacy(resealImportFixture(snapshot), { ...scope, confirmedCashBalanceInCents: 200 });
  assert.equal(report.canReviewNormalization, true);
  assert.equal(report.reconciliation?.accounts.find(row => row.kind === 'cash')?.sourceBalanceInCents, 200);
  assert.equal(report.reconciliation?.accounts.find(row => row.kind === 'bank')?.sourceBalanceInCents, 1000);
});
