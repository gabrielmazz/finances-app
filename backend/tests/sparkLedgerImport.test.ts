import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSparkLedgerImport, financialFields, importSparkLedgerLocal, sparkImportedIdentityId } from '../scripts/lib/sparkLedgerImport';
import { normalizeSparkLegacy } from '../scripts/lib/sparkLegacyNormalization';
import { canonical, digest, LocalFirestore } from '../scripts/lib/sparkLocalSnapshot';
import { decodeSparkFinancialValue, prepareSparkBootstrap } from '../scripts/lib/sparkBootstrapPreflight';
import { buildSparkFinancialReadEvents } from '../../utils/sparkFinancialReadModel';
import { importAsOf, ledgerImportFixture, legacyImportFixture, recurringLedgerImportFixture, resealImportFixture } from './fixtures/sparkImportFixture';
import { sparkImportedRecurringPlanId, sparkImportedRecurringReceiptId } from '../scripts/lib/sparkRecurringImport';

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
test('conversão conserva contador, parcelas exatas, metadados e recibos sem repetir pernas financeiras', () => {
  const source = recurringLedgerImportFixture(), plan = buildSparkLedgerImport(source, 'group', importAsOf);
  assert.equal(plan.recurringImport.converted.length, 1); assert.equal(plan.recurringImport.issues.length, 0);
  const id = sparkImportedRecurringPlanId('group', 'mandatoryGains/contract');
  const definition = plan.generatedDocuments.find(row => row.path === `financialGroups/group/sparkRecurringPlans/${id}`)!.fields;
  assert.equal(definition.installmentsCompleted.integerValue, '3'); assert.equal(definition.historyFromCycle.stringValue, '2026-07');
  const metadata = plan.generatedDocuments.find(row => row.path === `financialGroups/group/sparkRecurringMetadata/${id}`)!.fields;
  assert.equal(metadata.dueDay.integerValue, '5'); assert.equal(metadata.usesBusinessDays.booleanValue, true); assert.equal(metadata.reminderEnabled.booleanValue, true);
  assert.equal(metadata.description.stringValue, 'Metadados preservados');
  for (const [index, month] of ['07', '08', '09'].entries()) {
    const cycle = plan.generatedDocuments.find(row => row.path.endsWith(`/sparkRecurringPlans/${id}/cycles/2026-${month}`))!.fields;
    assert.equal(cycle.installmentsBefore.integerValue, String(index)); assert.equal(cycle.installmentsAfter.integerValue, String(index + 1));
    assert.equal(cycle.amountInCents.integerValue, index === 2 ? '334' : '333');
    assert.equal(cycle.settlementOperationId.stringValue, sparkImportedRecurringReceiptId('group', `recurring-${month}`));
  }
  assert.equal(plan.documents.find(row => row.path === 'financialGroups/group/sparkPositions/bank-a')!.fields.balanceInCents.integerValue, '1134');
  assert.equal(plan.generatedDocuments.filter(row => row.fields.kind?.stringValue === 'imported_movement' && row.fields.sourcePath?.stringValue === 'ledgerTransactions/recurring-09').length, 1);
  assert.deepEqual(plan.documents.find(row => row.path === 'mandatoryGains/contract'), source.documents.find(row => row.path === 'mandatoryGains/contract'));
});
for (const [name, mutate, code] of [
  ['contador inferido', (s: any, row: any) => row.fields.installmentsCompleted = { integerValue: '4' }, 'recurring-unproven-installment-counter'],
  ['principal ausente', (s: any, row: any) => delete row.fields.installmentTotalValueInCents, 'recurring-unproven-installment-contract'],
  ['ordem sem evidência', (s: any) => delete s.documents.find((r: any) => r.path === 'ledgerTransactions/recurring-07').fields.createdAt, 'recurring-ambiguous-installment-order'],
  ['instantes empatados', (s: any) => s.documents.find((r: any) => r.path === 'ledgerTransactions/recurring-08').fields.createdAt = { timestampValue: '2026-09-20T12:00:00.000001Z' }, 'recurring-ambiguous-installment-order'],
  ['ciclo órfão', (s: any, row: any) => row.fields.completedCycles = financialFields({ v: { '2026-07': { transactionId: 'missing', installmentsCount: 1, amountInCents: 333 } } }).v, 'recurring-orphan-cycle'],
  ['histórico declarado incompleto', (s: any, row: any) => row.fields.completedCycles = { mapValue: {} }, 'recurring-incomplete-declared-history'],
  ['último vínculo divergente', (s: any, row: any) => row.fields.lastReceiptGainId = { stringValue: 'income' }, 'recurring-orphan-last-payment'],
  ['valor do ciclo divergente', (s: any, row: any) => (row.fields.completedCycles.mapValue.fields['2026-09'].mapValue.fields.amountInCents = { integerValue: '333' }), 'recurring-cycle-amount-conflict'],
  ['versão futura de lembrete', (s: any, row: any) => row.fields.reminderConfigVersion = { integerValue: '2' }, 'recurring-unsupported-reminder-version'],
  ['proprietário fora do grupo', (s: any, row: any) => row.fields.personId = { stringValue: 'outsider' }, 'recurring-owner-scope-conflict'],
  ['início do histórico sem prova', (s: any, row: any) => { delete row.fields.createdAt; delete row.fields.installmentStartDate; row.fields.installmentTotal = { nullValue: null }; row.fields.installmentTotalValueInCents = { nullValue: null }; row.fields.installmentsCompleted = { integerValue: '0' }; delete row.fields.installmentEndDate; }, 'recurring-missing-history-start'],
] as const) test(`recorrência com ${name} permanece bruta e gera pendência sem subconjunto parcial`, () => {
  const source = recurringLedgerImportFixture(), row = source.documents.find(row => row.path === 'mandatoryGains/contract')!; mutate(source, row);
  const plan = buildSparkLedgerImport(resealImportFixture(source), 'group', importAsOf);
  assert.equal(plan.recurringImport.converted.length, 0); assert.equal(plan.recurringImport.issues[0].code, code);
  assert(!plan.generatedDocuments.some(row => row.path.includes('/sparkRecurringPlans/'))); assert.equal(plan.activationAllowed, false);
  assert.deepEqual(plan.documents.find(row => row.path === 'mandatoryGains/contract')!.fields, row.fields);
});
test('histórico incompleto preserva pagamentos conhecidos e restringe efetivação ao mês posterior ao corte', () => {
  const source = recurringLedgerImportFixture(), row = source.documents.find(row => row.path === 'mandatoryGains/contract')!;
  row.fields.assistantCycleHistoryComplete = { booleanValue: false };
  const plan = buildSparkLedgerImport(resealImportFixture(source), 'group', new Date('2026-09-30T12:00:00Z'));
  assert.equal(plan.recurringImport.converted[0].historyFromCycle, '2026-10');
  assert(plan.recurringImport.warnings.some(row => row.code === 'recurring-history-restricted-after-cutoff'));
});
test('configuração anterior à versão um mantém lembrete desativado e conserva fonte original', () => {
  const source = recurringLedgerImportFixture(), row = source.documents.find(row => row.path === 'mandatoryGains/contract')!;
  delete row.fields.reminderConfigVersion;
  const plan = buildSparkLedgerImport(resealImportFixture(source), 'group', importAsOf);
  const metadata = plan.generatedDocuments.find(row => row.path.includes('/sparkRecurringMetadata/'))!;
  assert.equal(metadata.fields.reminderEnabled.booleanValue, false);
  assert(plan.recurringImport.warnings.some(row => row.code === 'recurring-unversioned-reminder-kept-disabled'));
});
test('calendário da importação inclui vigência contratual futura sem ativar movimento antecipado', () => {
  const source = recurringLedgerImportFixture(), row = source.documents.find(row => row.path === 'mandatoryGains/contract')!;
  Object.assign(row.fields, financialFields({ installmentTotal: 15, installmentTotalValueInCents: 5000, installmentEndDate: new Date('2027-09-01T03:00:00Z') }));
  const history = row.fields.completedCycles.mapValue as any; history.fields['2026-09'].mapValue.fields.amountInCents = { integerValue: '333' };
  source.documents.find(row => row.path === 'ledgerTransactions/recurring-09')!.fields.legs = financialFields({ v: [{ accountId: 'bank-a', deltaInCents: 333 }, { accountId: null, deltaInCents: -333 }] }).v;
  source.documents.find(row => row.path === 'financialAccounts/bank-a')!.fields.currentBalanceInCents = { integerValue: '1133' };
  const plan = buildSparkLedgerImport(resealImportFixture(source), 'group', importAsOf);
  assert.equal(plan.recurringImport.issues.length, 0); assert(plan.generatedDocuments.some(row => row.path === 'sparkCivilMonths/2027-09'));
  assert.equal(plan.documents.find(row => row.path === 'financialGroups/group/sparkPositions/bank-a')!.fields.balanceInCents.integerValue, '1133');
});
test('pagamento já estornado não é recriado como ciclo ativo na conversão', () => {
  const source = recurringLedgerImportFixture(), row = source.documents.find(row => row.path === 'mandatoryGains/contract')!;
  source.documents.push({ path: 'ledgerTransactions/recurring-reversed', fields: financialFields({ groupId: 'group', actorId: 'owner', kind: 'reversal',
    reversesTransactionId: 'recurring-09', clientActionId: 'old_recurring_reverse', effectiveAt: new Date('2026-09-25Z'),
    legs: [{ accountId: 'bank-a', deltaInCents: -334 }, { accountId: null, deltaInCents: 334 }] }) });
  source.documents.find(row => row.path === 'financialAccounts/bank-a')!.fields.currentBalanceInCents = { integerValue: '800' };
  const stale = buildSparkLedgerImport(resealImportFixture(source), 'group', importAsOf);
  assert.equal(stale.recurringImport.issues[0].code, 'recurring-orphan-cycle');
  delete (row.fields.completedCycles.mapValue as any).fields['2026-09'];
  Object.assign(row.fields, financialFields({ installmentsCompleted: 2, lastReceiptCycle: '2026-08', lastReceiptGainId: 'recurring-08' }));
  const plan = buildSparkLedgerImport(resealImportFixture(source), 'group', importAsOf);
  assert.equal(plan.recurringImport.converted[0].cycles, 2); assert(!plan.generatedDocuments.some(row => row.path.includes('/sparkRecurringPlans/') && row.path.endsWith('/cycles/2026-09')));
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

test('ponte imutável contém uma identidade por transação e todas as pernas sem duplicar saldo', () => {
  const plan = buildSparkLedgerImport(ledgerImportFixture(), 'group', importAsOf);
  const identities = plan.generatedDocuments.filter(row => row.path.includes('/sparkImportedIdentities/'));
  assert.equal(identities.length, 3);
  const income = identities.find(row => row.path.endsWith(sparkImportedIdentityId('group', 'income')))!;
  assert.equal(income.fields.kind.stringValue, 'income'); assert.equal(income.fields.actorId.stringValue, 'guest');
  assert.equal(income.fields.ordinaryResolutionAllowed.booleanValue, true);
  const transfer = identities.find(row => row.fields.kind.stringValue === 'transfer')!;
  assert.equal(transfer.fields.fromAccountId.stringValue, 'bank-a'); assert.equal(transfer.fields.toAccountId.stringValue, 'bank-b');
  assert.equal(transfer.fields.amountInCents.integerValue, '300');
  for (const identity of identities) for (const node of (identity.fields.historyNodes.arrayValue as any).values) {
    const fields = node.mapValue.fields;
    const linked = plan.generatedDocuments.find(row => row.path.endsWith('/sparkOperations/' + fields.operationId.stringValue))!;
    assert.equal(linked.fields.accountId.stringValue, fields.accountId.stringValue);
    assert.equal(linked.fields.sourcePath.stringValue, identity.fields.sourcePath.stringValue);
    assert.equal(linked.fields.sourceDocumentSha256.stringValue, identity.fields.sourceDocumentSha256.stringValue);
  }
});
test('projeção imutável importada alimenta a leitura sem reler fontes anteriores nem somar identidades duas vezes', () => {
  const plan = buildSparkLedgerImport(ledgerImportFixture(), 'group', importAsOf);
  const rows = (collection: string) => plan.generatedDocuments.filter(row => row.path.includes(`/${collection}/`)).map(row => ({
    id: row.path.split('/').at(-1)!, data: decodeSparkFinancialValue({ mapValue: { fields: row.fields } }) as Record<string, any>,
  }));
  const operations = rows('sparkOperations'), identities = rows('sparkImportedIdentities');
  const events = buildSparkFinancialReadEvents('group', operations, identities);
  assert.equal(events.filter(event => event.economicKind === 'income').length, 1);
  assert.equal(events.filter(event => event.economicKind === 'income').reduce((total, event) => total + event.deltaInCents, 0), 200);
  assert.equal(events.filter(event => event.accountId === 'bank-a' && event.term === 'delta').reduce((total, event) => total + event.deltaInCents, 0), -200);
  const old = identities.map(row => ({ ...row, data: { ...row.data, readModel: undefined } }));
  assert.throws(() => buildSparkFinancialReadEvents('group', operations, old), /preparação/);
});

function correctedLedgerFixture() {
  const snapshot = ledgerImportFixture();
  snapshot.documents.push({ path: 'ledgerTransactions/income-reversed', fields: financialFields({ groupId: 'group', kind: 'reversal',
    actorId: 'owner', clientActionId: 'income_correction_reverse', reversesTransactionId: 'income', effectiveAt: new Date('2026-09-05Z'),
    legs: [{ accountId: 'bank-a', deltaInCents: -200 }, { accountId: null, deltaInCents: 200 }] }) });
  snapshot.documents.push({ path: 'ledgerTransactions/replacement', fields: financialFields({ groupId: 'group', kind: 'income',
    actorId: 'owner', clientActionId: 'income_correction_replace', effectiveAt: new Date('2026-09-05Z'),
    legs: [{ accountId: 'bank-b', deltaInCents: 250 }, { accountId: null, deltaInCents: -250 }] }) });
  snapshot.documents.push({ path: 'financialGroups/group/operations/correction', fields: financialFields({ operation: 'correctMovement',
    actorId: 'owner', result: { transactionId: 'replacement', reversalTransactionId: 'income-reversed', idempotent: false } }) });
  snapshot.documents.find(row => row.path === 'financialAccounts/bank-a')!.fields.currentBalanceInCents = { integerValue: '600' };
  snapshot.documents.find(row => row.path === 'financialAccounts/bank-b')!.fields.currentBalanceInCents = { integerValue: '1050' };
  return resealImportFixture(snapshot);
}
test('edição importada liga claim ao estorno e ao substituto, preservando suas identidades independentes', () => {
  const plan = buildSparkLedgerImport(correctedLedgerFixture(), 'group', importAsOf);
  const claim = plan.generatedDocuments.find(row => row.path.endsWith('/sparkImportedClaims/' + sparkImportedIdentityId('group', 'income')))!;
  assert.equal(claim.fields.resolution.stringValue, 'correction');
  assert.equal(claim.fields.reversalOperationId.stringValue, sparkImportedIdentityId('group', 'income-reversed'));
  assert.equal(claim.fields.replacementIdentityId.stringValue, sparkImportedIdentityId('group', 'replacement'));
  assert(plan.generatedDocuments.some(row => row.path.endsWith('/sparkImportedIdentities/' + sparkImportedIdentityId('group', 'replacement'))));
});
for (const [name, mutate] of [
  ['ausente', (snapshot: any) => snapshot.documents.find((row: any) => row.path.endsWith('/operations/correction')).fields.result = financialFields({ result: { transactionId: 'missing', reversalTransactionId: 'income-reversed' } }).result],
  ['duplicado', (snapshot: any) => snapshot.documents.push({ ...snapshot.documents.find((row: any) => row.path.endsWith('/operations/correction')), path: 'financialGroups/group/operations/duplicate' })],
  ['data divergente', (snapshot: any) => snapshot.documents.find((row: any) => row.path === 'ledgerTransactions/replacement').fields.effectiveAt = { timestampValue: '2026-09-06T00:00:00Z' }],
  ['autor divergente', (snapshot: any) => snapshot.documents.find((row: any) => row.path.endsWith('/operations/correction')).fields.actorId = { stringValue: 'guest' }],
] as const) test(`recibo de edição ${name} impede plano`, () => {
  const snapshot = correctedLedgerFixture(); mutate(snapshot);
  assert.throws(() => buildSparkLedgerImport(resealImportFixture(snapshot), 'group', importAsOf), /Vínculo/);
});
test('marcador parcial de edição não vira estorno simples silenciosamente', () => {
  const snapshot = correctedLedgerFixture();
  const receipt = snapshot.documents.find(row => row.path.endsWith('/operations/correction'))!;
  delete receipt.fields.result; receipt.fields.transactionId = { stringValue: 'income-reversed' };
  assert.throws(() => buildSparkLedgerImport(resealImportFixture(snapshot), 'group', importAsOf), /vínculo completo/);
});
test('recibo auxiliar de edição é conservado quando o resultado principal vincula todas as fontes', () => {
  const snapshot = correctedLedgerFixture(); snapshot.documents.push({ path: 'financialGroups/group/operations/reversal_of_historical',
    fields: financialFields({ actorId: 'owner', operation: 'correctMovement', transactionId: 'income-reversed' }) });
  assert.equal(buildSparkLedgerImport(resealImportFixture(snapshot), 'group', importAsOf).activationAllowed, false);
});
test('par de investimento com contas bancárias é bloqueado em vez de receber identidade enganosa', () => {
  const snapshot = ledgerImportFixture(); snapshot.documents.find(row => row.path === 'ledgerTransactions/transfer')!.fields.kind = { stringValue: 'investment_deposit' };
  assert.throws(() => buildSparkLedgerImport(resealImportFixture(snapshot), 'group', importAsOf), /incompatível com as contas/);
});
test('ciclo de edições entre transações existentes é bloqueado', () => {
  const snapshot = correctedLedgerFixture();
  snapshot.documents.push({ path: 'ledgerTransactions/replacement-reversed', fields: financialFields({ groupId: 'group', kind: 'reversal',
    actorId: 'guest', clientActionId: 'cycle_reverse_123456', reversesTransactionId: 'replacement', effectiveAt: new Date('2026-09-02T12:00:00Z'),
    legs: [{ accountId: 'bank-b', deltaInCents: -250 }, { accountId: null, deltaInCents: 250 }] }) });
  snapshot.documents.push({ path: 'financialGroups/group/operations/cycle', fields: financialFields({ actorId: 'guest', operation: 'correctMovement',
    result: { transactionId: 'income', reversalTransactionId: 'replacement-reversed' } }) });
  snapshot.documents.find(row => row.path === 'financialAccounts/bank-b')!.fields.currentBalanceInCents = { integerValue: '800' };
  assert.throws(() => buildSparkLedgerImport(resealImportFixture(snapshot), 'group', importAsOf), /Ciclo/);
});
test('par com fontes especiais exige adaptador em vez de liberar estorno genérico', () => {
  const snapshot = ledgerImportFixture();
  snapshot.documents.find(row => row.path === 'ledgerTransactions/transfer')!.fields.sourceReferences = financialFields({ refs: [{ collection: 'mandatoryExpenses', id: 'definition' }] }).refs;
  const plan = buildSparkLedgerImport(resealImportFixture(snapshot), 'group', importAsOf);
  const identity = plan.generatedDocuments.find(row => row.path.endsWith('/sparkImportedIdentities/' + sparkImportedIdentityId('group', 'transfer')))!;
  assert.equal(identity.fields.pairResolutionAllowed.booleanValue, false);
});
test('fonte de recorrência preservada impede resolução ordinária sem adaptar o ciclo', () => {
  const snapshot = ledgerImportFixture();
  snapshot.documents.find(row => row.path === 'ledgerTransactions/income')!.fields.sourceReferences = financialFields({ refs: [{ collection: 'mandatoryExpenses', id: 'definition' }] }).refs;
  const plan = buildSparkLedgerImport(resealImportFixture(snapshot), 'group', importAsOf);
  const identity = plan.generatedDocuments.find(row => row.path.endsWith('/sparkImportedIdentities/' + sparkImportedIdentityId('group', 'income')))!;
  assert.equal(identity.fields.ordinaryResolutionAllowed.booleanValue, false);
  assert.equal(plan.activationAllowed, false);
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
