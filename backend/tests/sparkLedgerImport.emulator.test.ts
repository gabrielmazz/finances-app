import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { canonical, dataDigest, LocalFirestore } from '../scripts/lib/sparkLocalSnapshot';
import { buildSparkLedgerImport, financialFields, importSparkLedgerLocal, sparkImportedIdentityId } from '../scripts/lib/sparkLedgerImport';
import { importAsOf, ledgerImportFixture, legacyImportFixture, recurringLedgerImportFixture, resealImportFixture } from './fixtures/sparkImportFixture';
import { prepareSparkHistoryProofFirebase } from '../../functions/SparkHistoryFirebase';
import { correctSparkMovementFirebase, reverseSparkMovementFirebase } from '../../functions/SparkMovementFirebase';
import { reverseSparkTransferFirebase, transferSparkDatedFundsFirebase, reverseSparkDatedTransferFirebase } from '../../functions/SparkTransferFirebase';
import { settleSparkRecurringFirebase, undoSparkRecurringFirebase } from '../../functions/SparkRecurringFirebase';
import { saveSparkRecurringMetadataFirebase } from '../../functions/SparkRecurringMetadataFirebase';
import { prepareSparkInvestmentSyncFirebase, synchronizeSparkInvestmentFirebase, readSparkInvestmentStateFirebase } from '../../functions/SparkInvestmentFirebase';
import { openFundedSparkInvestmentFirebase, openDatedFundedSparkInvestmentFirebase, type SparkInvestmentOpeningInput } from '../../functions/SparkInvestmentOpeningFirebase';
import { updateSparkInvestmentPrincipalFirebase } from '../../functions/SparkInvestmentPrincipalFirebase';
import { changeSparkInvestmentFundingFirebase } from '../../functions/SparkInvestmentFundingFirebase';
import { readSparkFinancialEventsFirebase } from '../../functions/SparkFinancialReadFirebase';
import { readSparkStatementFirebase } from '../../functions/SparkStatementFirebase';
import { prepareSparkPairReversalFirebase, executeSparkPairReversalFirebase } from '../../functions/SparkPairFormFirebase';
import { sparkImportedRecurringPlanId, sparkImportedRecurringReceiptId } from '../scripts/lib/sparkRecurringImport';

const projectId = 'demo-lumus-snapshot', host = process.env.FIRESTORE_EMULATOR_HOST ?? '', hub = process.env.FIREBASE_EMULATOR_HUB ?? '';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '';
if (process.env.GCLOUD_PROJECT !== projectId || !/^127\.0\.0\.1:\d+$/.test(authHost)
  || Number(authHost.split(':')[1]) < 1024 || Number(authHost.split(':')[1]) > 65535) throw new Error('Ensaio requer projeto demo e Auth/Firestore locais do runner.');
const local = new LocalFirestore(projectId, host, hub);
const rootRequire = createRequire(resolve(__dirname, '../../package.json'));
const { initializeApp, deleteApp } = rootRequire('firebase/app') as typeof import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = rootRequire('firebase/auth') as typeof import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, updateDoc, terminate, Timestamp } = rootRequire('firebase/firestore') as typeof import('firebase/firestore');
const app = initializeApp({ projectId, apiKey: 'fake-api-key' }, 'spark-import-test');
const auth = getAuth(app); connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
const firestore = getFirestore(app); connectFirestoreEmulator(firestore, '127.0.0.1', Number(host.split(':').at(-1)));
const admin = initializeAdmin({ projectId }, 'spark-import-test');
let environment: RulesTestEnvironment;
let createdOwner = false;
before(async () => {
  await local.assertIsolatedEmulator();
  const hubState = await (await fetch(`http://${hub}/emulators`, { redirect: 'error', signal: AbortSignal.timeout(5000) })).json() as { auth?: { port?: number } };
  assert.equal(hubState.auth?.port, Number(authHost.split(':')[1]), 'Auth deve pertencer ao mesmo Hub local.');
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: Number(host.split(':').at(-1)), rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  await getAdminAuth(admin).createUser({ uid: 'owner', email: 'owner@demo.lumus.local', password: 'synthetic-password', emailVerified: true });
  createdOwner = true;
  await signInWithEmailAndPassword(auth, 'owner@demo.lumus.local', 'synthetic-password');
}, { timeout: 30_000 });
beforeEach(async () => { await environment.clearFirestore(); });
after(async () => { await terminate(firestore); await deleteApp(app); if (createdOwner) await getAdminAuth(admin).deleteUser('owner'); await deleteAdmin(admin); await environment?.cleanup(); });

test('importa financeiro de forma verificada, preserva bruto e permanece bloqueado para clientes', { timeout: 30_000 }, async () => {
  const source = ledgerImportFixture(), plan = buildSparkLedgerImport(source, 'group', importAsOf);
  const result = await importSparkLedgerLocal(local, source, 'group', importAsOf, plan.planSha256);
  assert.equal(result.status, 'verified-locked'); assert.equal(result.activationAllowed, false); assert.equal(result.accounts, 4);
  const restored = await local.scan();
  for (const original of source.documents.filter(row => row.path !== 'financialGroups/group')) assert.deepEqual(restored.find(row => row.path === original.path)?.fields, original.fields);
  assert.equal(restored.find(row => row.path === 'financialGroups/group')?.fields.status.stringValue, 'spark_importing');
  await assert.rejects(getDocFromServer(doc(firestore, 'financialGroups/group/sparkPositions/bank-a')), (error: any) => error.code === 'permission-denied');
  await assert.rejects(importSparkLedgerLocal(local, source, 'group', importAsOf, plan.planSha256), /vazio/);
  assert.equal(dataDigest(await local.scan()), dataDigest(restored));
});

test('projeções autenticadas conferem o histórico importado após habilitação SOMENTE pelo harness', { timeout: 60_000 }, async () => {
  const source = ledgerImportFixture(), plan = buildSparkLedgerImport(source, 'group', importAsOf);
  await importSparkLedgerLocal(local, source, 'group', importAsOf, plan.planSha256);
  // Não existe comando de ativação no importador. Esta mudança privilegiada pertence só à fixture.
  await environment.withSecurityRulesDisabled(async context => {
    await context.firestore().doc('financialGroups/group').update({ status: 'active', sparkProtocol: 'financial-proof-v17' });
  });
  const cases: Array<[string, string, number]> = [
    ['bank-a', '2026-09-01T03:00:00Z', 1000], ['bank-a', '2026-09-02T12:00:00Z', 1200],
    ['bank-a', '2026-09-03T12:00:00Z', 900], ['bank-a', '2026-09-04T12:00:00Z', 800],
    ['bank-b', '2026-09-03T12:00:00Z', 800], ['cash', '2026-09-04T12:00:00Z', 0],
    ['investment', '2026-09-03T12:00:00Z', 0], ['investment', '2026-09-04T12:00:00Z', 100],
  ];
  for (let index = 0; index < cases.length; index++) {
    const [accountId, time, expected] = cases[index];
    const proof = await prepareSparkHistoryProofFirebase(firestore, { groupId: 'group', actorId: 'owner', accountId,
      clientActionId: `import_proof_${index}`, asOf: Timestamp.fromDate(new Date(time)), purpose: 'instant' });
    assert.equal(proof.phase, 'done'); assert.equal(proof.balanceInCents, expected);
  }
  const head = (await local.scan()).find(row => row.path === 'financialGroups/group/sparkPositions/bank-a')!.fields.lastOperationId.stringValue as string;
  await assert.rejects(updateDoc(doc(firestore, 'financialGroups/group/sparkOperations', head), { differenceInCents: 999 }));
});

test('CLI liga plano, importação e normalização legada sem aceitar hash diferente', { timeout: 30_000 }, async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'lumus-financial-import-'));
  const execute = promisify(execFile);
  const command = (args: string[]) => execute(process.execPath, ['--import', 'tsx', 'scripts/sparkSnapshot.ts', ...args], { cwd: resolve(__dirname, '..'), env: { ...process.env, INIT_CWD: directory } });
  writeFileSync(resolve(directory, 'snapshot.json'), canonical(ledgerImportFixture()), { mode: 0o600 });
  await command(['plan-ledger', '--input', 'snapshot.json', '--group', 'group', '--as-of', importAsOf.toISOString(), '--output', 'plan.json']);
  const plan = JSON.parse(readFileSync(resolve(directory, 'plan.json'), 'utf8')); assert.equal(plan.documents, undefined);
  const args = ['import-ledger', '--input', 'snapshot.json', '--group', 'group', '--as-of', importAsOf.toISOString(), '--project', projectId, '--host', host, '--hub', hub];
  await assert.rejects(command([...args, '--plan-sha256', '0'.repeat(64), '--output', 'failed.json']));
  assert.equal((await local.scan()).length, 0);
  await command([...args, '--plan-sha256', plan.planSha256, '--output', 'receipt.json']);
  assert.equal(JSON.parse(readFileSync(resolve(directory, 'receipt.json'), 'utf8')).status, 'verified-locked');
  const legacy = legacyImportFixture(); writeFileSync(resolve(directory, 'legacy.json'), canonical(legacy.snapshot)); writeFileSync(resolve(directory, 'scope.json'), canonical(legacy.scope));
  await command(['normalize-legacy', '--input', 'legacy.json', '--scope', 'scope.json', '--output', 'legacy-report.json']);
  const report = JSON.parse(readFileSync(resolve(directory, 'legacy-report.json'), 'utf8')); assert.equal(report.canReviewNormalization, true); assert.equal(report.canApply, false);
});

async function stageAndEnableFixture(source = ledgerImportFixture()) {
  const plan = buildSparkLedgerImport(source, 'group', importAsOf);
  await importSparkLedgerLocal(local, source, 'group', importAsOf, plan.planSha256);
  await environment.withSecurityRulesDisabled(async context => context.firestore().doc('financialGroups/group').update({ status: 'active', sparkProtocol: 'financial-proof-v17' }));
  return plan;
}
test('leitura compartilhada usa projeção imutável importada e mantém as pernas sem duplicar identidades', { timeout: 30_000 }, async () => {
  await stageAndEnableFixture();
  const events = await readSparkFinancialEventsFirebase(firestore, 'owner', 'group');
  assert.equal(events.filter(event => event.economicKind === 'income').length, 1);
  assert.equal(events.filter(event => event.economicKind === 'income').reduce((sum, event) => sum + event.deltaInCents, 0), 200);
  const statement = await readSparkStatementFirebase(firestore, 'owner', 'group', 'bank-a', new Date(2026, 8, 1), new Date(2026, 8, 30));
  assert.equal(statement.gains.length, 1); assert.equal(statement.gains[0].valueInCents, 200);
  assert.equal(statement.expenses.some(row => row.isInvestmentDeposit && row.valueInCents === 100), true);
  assert.equal(statement.expenses.some(row => row.isBankTransfer && row.valueInCents === 300), true);
});
const importedResolution = (id: string, action: string) => ({ groupId: 'group', actorId: 'owner', clientActionId: action,
  originalOperationId: sparkImportedIdentityId('group', id), originalSource: 'imported' as const, effectiveAt: Timestamp.fromDate(new Date('2026-09-10Z')) });
const importedBalance = async (accountId: string) => (await getDocFromServer(doc(firestore, 'financialGroups/group/sparkPositions', accountId))).data()!;

test('ponte importada edita renda de outro autor como admin, estorna substituto e mantém cadeia verificável', { timeout: 60_000 }, async () => {
  await stageAndEnableFixture();
  const correction = { ...importedResolution('income', 'import_correction_123456'), accountId: 'bank-b', amountInCents: 250 };
  await correctSparkMovementFirebase(firestore, correction);
  assert.equal((await importedBalance('bank-a')).balanceInCents, 600); assert.equal((await importedBalance('bank-b')).balanceInCents, 1050);
  assert.equal((await correctSparkMovementFirebase(firestore, correction)).idempotent, true);
  await assert.rejects(reverseSparkMovementFirebase(firestore, importedResolution('income', 'import_twice_123456')), /já estornado/);
  await reverseSparkMovementFirebase(firestore, { ...importedResolution('income', 'reverse_substitute_123456'), originalSource: 'live', originalOperationId: correction.clientActionId });
  assert.equal((await importedBalance('bank-b')).balanceInCents, 800);
  for (const [accountId, expected] of [['bank-a', 600], ['bank-b', 800]] as const) {
    const proof = await prepareSparkHistoryProofFirebase(firestore, { groupId: 'group', actorId: 'owner', accountId,
      clientActionId: `bridge_proof_${accountId}`, asOf: Timestamp.fromDate(new Date('2026-09-11Z')), purpose: 'instant' }, 100, { useSegments: true });
    assert.equal(proof.balanceInCents, expected);
  }
  await assert.rejects(updateDoc(doc(firestore, 'financialGroups/group/sparkImportedIdentities', correction.originalOperationId), { amountInCents: 999 }));
  await assert.rejects(updateDoc(doc(firestore, 'financialGroups/group/sparkImportedClaims', correction.originalOperationId), { reversalOperationId: 'forged_123456' }));
});
test('transferência e aporte importados usam claim único e estorno exato', { timeout: 30_000 }, async () => {
  await stageAndEnableFixture();
  const input = { groupId: 'group', actorId: 'owner', clientActionId: 'reverse_import_pair_123456',
    originalOperationId: sparkImportedIdentityId('group', 'transfer'), originalSource: 'imported' as const };
  await reverseSparkTransferFirebase(firestore, input);
  assert.equal((await importedBalance('bank-a')).balanceInCents, 1100); assert.equal((await importedBalance('bank-b')).balanceInCents, 500);
  assert.equal((await reverseSparkTransferFirebase(firestore, input)).idempotent, true);
  await assert.rejects(reverseSparkTransferFirebase(firestore, { ...input, clientActionId: 'reverse_import_twice_123456' }), /já foi estornada/);
  await reverseSparkTransferFirebase(firestore, { ...input, originalOperationId: sparkImportedIdentityId('group', 'deposit'), clientActionId: 'reverse_import_deposit_123456' });
  assert.equal((await importedBalance('investment')).balanceInCents, 0); assert.equal((await importedBalance('bank-a')).balanceInCents, 1200);
});

test('extrato encaminha pares importados pelo mesmo recibo sem liberar abertura ou fontes especiais', { timeout: 30_000 }, async () => {
  await stageAndEnableFixture();
  const statement = await readSparkStatementFirebase(firestore, 'owner', 'group', 'bank-a', new Date(2026, 8, 1), new Date(2026, 8, 10));
  const transferId = sparkImportedIdentityId('group', 'transfer'), depositId = sparkImportedIdentityId('group', 'deposit');
  for (const [id, action] of [[transferId, 'wrapper_import_transfer_123456'], [depositId, 'wrapper_import_deposit_123456']] as const) {
    const row = [...statement.expenses, ...statement.gains].find(row => row.sparkExecutionReference?.operationId === id)!;
    assert.equal(row.sparkExecutionReference.source, 'imported');
    const command = await prepareSparkPairReversalFirebase(firestore, 'owner', row.sparkExecutionReference, action);
    await executeSparkPairReversalFirebase(firestore, command); await executeSparkPairReversalFirebase(firestore, command);
    await assert.rejects(prepareSparkPairReversalFirebase(firestore, 'owner', row.sparkExecutionReference, 'wrapper_duplicate_123456'), /disponível/);
  }
  assert.equal((await importedBalance('bank-a')).balanceInCents, 1200);
  assert.equal((await importedBalance('bank-b')).balanceInCents, 500);
  assert.equal((await importedBalance('investment')).balanceInCents, 0);
});
test('resgate importado conserva direção e não vira receita ordinária', { timeout: 30_000 }, async () => {
  const source = ledgerImportFixture();
  source.documents.push({ path: 'ledgerTransactions/redemption', fields: financialFields({ groupId: 'group', kind: 'investment_redemption',
    actorId: 'owner', clientActionId: 'prior_redemption_123456', effectiveAt: new Date('2026-09-05Z'),
    legs: [{ accountId: 'investment', deltaInCents: -50 }, { accountId: 'bank-a', deltaInCents: 50 }] }) });
  source.documents.find(row => row.path === 'financialAccounts/bank-a')!.fields.currentBalanceInCents = { integerValue: '850' };
  source.documents.find(row => row.path === 'financialAccounts/investment')!.fields.currentBalanceInCents = { integerValue: '50' };
  await stageAndEnableFixture(resealImportFixture(source));
  await assert.rejects(reverseSparkMovementFirebase(firestore, importedResolution('redemption', 'wrong_redemption_123456')), /fluxo específico/);
  await reverseSparkTransferFirebase(firestore, { groupId: 'group', actorId: 'owner', clientActionId: 'reverse_import_redemption_123456',
    originalOperationId: sparkImportedIdentityId('group', 'redemption'), originalSource: 'imported' });
  assert.equal((await importedBalance('bank-a')).balanceInCents, 800); assert.equal((await importedBalance('investment')).balanceInCents, 100);
});
test('estorno já existente no bruto bloqueia nova resolução depois da importação', { timeout: 30_000 }, async () => {
  const source = ledgerImportFixture();
  source.documents.push({ path: 'ledgerTransactions/reversed', fields: financialFields({ groupId: 'group', kind: 'reversal',
    reversesTransactionId: 'income', actorId: 'guest', clientActionId: 'prior_reverse_123456', effectiveAt: new Date('2026-09-05Z'),
    legs: [{ accountId: 'bank-a', deltaInCents: -200 }, { accountId: null, deltaInCents: 200 }] }) });
  source.documents.find(row => row.path === 'financialAccounts/bank-a')!.fields.currentBalanceInCents = { integerValue: '600' };
  await stageAndEnableFixture(resealImportFixture(source));
  await assert.rejects(reverseSparkMovementFirebase(firestore, importedResolution('income', 'import_duplicate_reverse_123456')), /já estornado/);
  assert.equal((await importedBalance('bank-a')).balanceInCents, 600);
});
test('renda de recorrência importada conserva fonte e exige resolução específica do ciclo', { timeout: 30_000 }, async () => {
  const source = ledgerImportFixture();
  source.documents.find(row => row.path === 'ledgerTransactions/income')!.fields.sourceReferences = financialFields({ refs: [{ collection: 'mandatoryExpenses', id: 'definition' }] }).refs;
  await stageAndEnableFixture(resealImportFixture(source));
  await assert.rejects(reverseSparkMovementFirebase(firestore, importedResolution('income', 'import_recurring_123456')), /fluxo específico/);
  assert.equal((await importedBalance('bank-a')).balanceInCents, 800);
});
test('recorrência convertida desfaz parcela comprovada sem duplicar saldo e atualiza metadados', { timeout: 45_000 }, async () => {
  const source = recurringLedgerImportFixture(), plan = await stageAndEnableFixture(source);
  const planId = sparkImportedRecurringPlanId('group', 'mandatoryGains/contract');
  assert.equal(plan.recurringImport.issues.length, 0); assert.equal((await importedBalance('bank-a')).balanceInCents, 1134);
  assert.equal((await getDocFromServer(doc(firestore, 'financialGroups/group/sparkImportRecurringMappings', planId))).data()!.sourcePath, 'mandatoryGains/contract');
  await assert.rejects(updateDoc(doc(firestore, 'financialGroups/group/sparkImportRecurringMappings', planId), { sourcePath: 'foreign' }));
  const undo = { groupId: 'group', actorId: 'owner', planId, cycle: '2026-09', expectedPlanRevision: 0,
    clientActionId: 'undo_converted_123456', effectiveAt: Timestamp.fromDate(new Date('2026-10-10Z')),
    settlementOperationId: sparkImportedRecurringReceiptId('group', 'recurring-09') };
  await assert.rejects(undoSparkRecurringFirebase(firestore, { ...undo, clientActionId: 'wrong_order_converted_123456', cycle: '2026-07', settlementOperationId: sparkImportedRecurringReceiptId('group', 'recurring-07') }), /primeiro as parcelas/);
  await undoSparkRecurringFirebase(firestore, undo); assert.equal((await importedBalance('bank-a')).balanceInCents, 800);
  assert.equal((await undoSparkRecurringFirebase(firestore, undo)).idempotent, true);
  const definition = await getDocFromServer(doc(firestore, 'financialGroups/group/sparkRecurringPlans', planId));
  assert.equal(definition.data()!.installmentsCompleted, 2);
  const metadata = (await getDocFromServer(doc(firestore, 'financialGroups/group/sparkRecurringMetadata', planId))).data()!;
  await saveSparkRecurringMetadataFirebase(firestore, { groupId: 'group', actorId: 'owner', planId, clientActionId: 'metadata_converted_123456', expectedMetadataRevision: 0,
    metadata: { dueDay: metadata.dueDay, usesBusinessDays: metadata.usesBusinessDays, description: 'Editado', reminderConfigVersion: 1, reminderEnabled: false,
      reminderDaysBefore: metadata.reminderDaysBefore, reminderOnDueDate: metadata.reminderOnDueDate, reminderHour: metadata.reminderHour, reminderMinute: metadata.reminderMinute } });
  const proof = await prepareSparkHistoryProofFirebase(firestore, { groupId: 'group', actorId: 'owner', accountId: 'bank-a',
    clientActionId: 'proof_converted_recurring_123456', purpose: 'instant', asOf: Timestamp.fromDate(new Date('2026-10-11Z')) });
  assert.equal(proof.balanceInCents, 800);
  await assert.rejects(reverseSparkMovementFirebase(firestore, importedResolution('recurring-09', 'bypass_import_recurring_123456')), /fluxo específico/);
});
test('recorrência com cobertura incompleta bloqueia mês desconhecido e admite ciclo futuro conhecido', { timeout: 45_000 }, async () => {
  const source = recurringLedgerImportFixture(), raw = source.documents.find(row => row.path === 'mandatoryGains/contract')!;
  Object.assign(raw.fields, financialFields({ assistantCycleHistoryComplete: false, installmentTotal: null, installmentTotalValueInCents: null,
    installmentStartDate: null, installmentEndDate: null, installmentsCompleted: 0 }));
  const snapshot = resealImportFixture(source), cutoff = new Date('2026-09-30T12:00:00Z');
  const plan = buildSparkLedgerImport(snapshot, 'group', cutoff); await importSparkLedgerLocal(local, snapshot, 'group', cutoff, plan.planSha256);
  await environment.withSecurityRulesDisabled(async context => context.firestore().doc('financialGroups/group').update({ status: 'active', sparkProtocol: 'financial-proof-v17' }));
  const planId = sparkImportedRecurringPlanId('group', 'mandatoryGains/contract');
  const input = { groupId: 'group', actorId: 'owner', planId, accountId: 'bank-a', cycle: '2026-08', expectedPlanRevision: 0,
    clientActionId: 'settle_unknown_cycle_123456', effectiveAt: Timestamp.fromDate(new Date('2026-08-16Z')) };
  await assert.rejects(settleSparkRecurringFirebase(firestore, input), /Histórico indisponível/);
  await settleSparkRecurringFirebase(firestore, { ...input, cycle: '2026-10', effectiveAt: Timestamp.fromDate(new Date('2026-10-10Z')), clientActionId: 'settle_covered_cycle_123456' });
  assert.equal((await importedBalance('bank-a')).balanceInCents, 1467);
});

test('investimento importado admite sincronização sem recontar aporte original ou alterar banco', { timeout: 45_000 }, async () => {
  await stageAndEnableFixture();
  const previous = await importedBalance('investment'), bank = await importedBalance('bank-a');
  const input = { groupId: 'group', actorId: 'owner', accountId: 'investment', clientActionId: 'sync_imported_investment_123456',
    observedAt: Timestamp.now(), observedValueInCents: 150, expectedRevision: previous.revision };
  await prepareSparkInvestmentSyncFirebase(firestore, input); await synchronizeSparkInvestmentFirebase(firestore, input);
  assert.equal((await synchronizeSparkInvestmentFirebase(firestore, input)).idempotent, true);
  const state = await readSparkInvestmentStateFirebase(firestore, input);
  assert.equal(state.currentBalanceInCents, 150); assert.equal(state.reference!.observedValueInCents, 150);
  assert.equal((await importedBalance('bank-a')).balanceInCents, bank.balanceInCents);
  const before = await prepareSparkHistoryProofFirebase(firestore, { ...input, clientActionId: 'before_imported_sync_123456',
    asOf: Timestamp.fromDate(new Date('2026-09-05Z')), purpose: 'instant' });
  assert.equal(before.balanceInCents, 100);
});

test('banco importado financia investimento novo com principal e valor observado distintos', { timeout: 45_000 }, async () => {
  await stageAndEnableFixture(); const bank = await importedBalance('bank-a');
  const input: SparkInvestmentOpeningInput = { groupId: 'group', actorId: 'owner', accountId: 'new-imported-investment', fundingAccountId: 'bank-a',
    expectedFundingRevision: bank.revision, clientActionId: 'funded_imported_bank_123456', principalInCents: 100, observedValueInCents: 110,
    catalog: { name: 'Reserva importada', colorHex: null, iconKey: null, bankAccountId: 'bank-a', assetType: 'fixed_income', valuationMethod: 'cdi',
      cdiPercentageInBasisPoints: 10000, redemptionTerm: null, description: null } };
  await openFundedSparkInvestmentFirebase(firestore, input); assert.equal((await openFundedSparkInvestmentFirebase(firestore, input)).idempotent, true);
  const state = await readSparkInvestmentStateFirebase(firestore, input); assert.equal(state.currentBalanceInCents, 110); assert.equal(state.principal!.initialValueInCents, 100);
  assert.equal((await importedBalance('bank-a')).balanceInCents, 700);
  const before = await prepareSparkHistoryProofFirebase(firestore, { ...input, clientActionId: 'before_funded_import_123456', accountId: 'bank-a',
    asOf: Timestamp.fromDate(new Date('2026-09-05Z')), purpose: 'instant' }); assert.equal(before.balanceInCents, 800);
});

test('par datado novo e estorno datado de aporte importado preservam as duas cadeias', { timeout: 45_000 }, async () => {
  await stageAndEnableFixture();
  await transferSparkDatedFundsFirebase(firestore, { groupId: 'group', actorId: 'owner', clientActionId: 'dated_import_deposit_123456',
    kind: 'investment_deposit', fromAccountId: 'bank-a', toAccountId: 'investment', amountInCents: 50, effectiveAt: Timestamp.fromDate(new Date('2026-09-05T12:00:00Z')) });
  assert.equal((await importedBalance('investment')).balanceInCents, 150); assert.equal((await importedBalance('bank-a')).balanceInCents, 750);
  const undo = { groupId: 'group', actorId: 'owner', clientActionId: 'dated_import_undo_123456', originalOperationId: sparkImportedIdentityId('group', 'deposit'),
    originalSource: 'imported' as const, effectiveAt: Timestamp.fromDate(new Date('2026-09-06T12:00:00Z')) };
  await reverseSparkDatedTransferFirebase(firestore, undo); assert.equal((await reverseSparkDatedTransferFirebase(firestore, undo)).idempotent, true);
  assert.equal((await importedBalance('investment')).balanceInCents, 50); assert.equal((await importedBalance('bank-a')).balanceInCents, 850);
  for (const [date, expected] of [['2026-09-05T18:00:00Z', 150], ['2026-09-07T12:00:00Z', 50]] as const) {
    const proof = await prepareSparkHistoryProofFirebase(firestore, { groupId: 'group', actorId: 'owner', accountId: 'investment',
      clientActionId: `dated_import_history_${expected}_123456`, purpose: 'instant', asOf: Timestamp.fromDate(new Date(date)) }); assert.equal(proof.balanceInCents, expected);
  }
});

test('correção do principal de investimento novo conserva o histórico bancário importado', { timeout: 45_000 }, async () => {
  await stageAndEnableFixture();
  const input: SparkInvestmentOpeningInput = { groupId: 'group', actorId: 'owner', clientActionId: 'principal_import_open_123456',
    accountId: 'new-imported-investment', fundingAccountId: 'bank-a', expectedFundingRevision: (await importedBalance('bank-a')).revision,
    principalInCents: 100, observedValueInCents: 110,
    catalog: { name: 'Reserva importada', colorHex: null, iconKey: null, bankAccountId: 'bank-a', assetType: 'fixed_income', valuationMethod: 'cdi',
      cdiPercentageInBasisPoints: 10000, redemptionTerm: null, description: null } };
  await openFundedSparkInvestmentFirebase(firestore, input);
  const update = { groupId: 'group', actorId: 'owner', clientActionId: 'principal_import_edit_123456', accountId: input.accountId,
    fundingAccountId: 'bank-a', openingOperationId: input.clientActionId, expectedFundingRevision: (await importedBalance('bank-a')).revision,
    expectedInvestmentRevision: 0, expectedCapitalRevision: 0, expectedCapitalOperationId: input.clientActionId, principalInCents: 150 };
  await updateSparkInvestmentPrincipalFirebase(firestore, update); assert.equal((await updateSparkInvestmentPrincipalFirebase(firestore, update)).idempotent, true);
  assert.equal((await importedBalance('bank-a')).balanceInCents, 650);
  const state = await readSparkInvestmentStateFirebase(firestore, input);
  assert.equal(state.currentBalanceInCents, 110); assert.equal(state.principal!.initialValueInCents, 150); assert.equal(state.principal!.revision, 1);
  assert.equal((await readSparkInvestmentStateFirebase(firestore, { ...input, accountId: 'investment' })).principal, null);
  await assert.rejects(updateSparkInvestmentPrincipalFirebase(firestore, { ...update, accountId: 'investment', clientActionId: 'principal_import_absent_123456' }), /ausente/);
  const proof = await prepareSparkHistoryProofFirebase(firestore, { groupId: 'group', actorId: 'owner', accountId: 'bank-a',
    clientActionId: 'principal_import_history_123456', asOf: Timestamp.fromDate(new Date('2026-09-05Z')), purpose: 'instant' });
  assert.equal(proof.balanceInCents, 800);
});

test('troca do financiamento de investimento novo conserva três cadeias após importação', { timeout: 45_000 }, async () => {
  await stageAndEnableFixture();
  const input: SparkInvestmentOpeningInput = { groupId: 'group', actorId: 'owner', clientActionId: 'funding_import_open_123456',
    accountId: 'new-imported-investment', fundingAccountId: 'bank-a', expectedFundingRevision: (await importedBalance('bank-a')).revision,
    principalInCents: 100, observedValueInCents: 110,
    catalog: { name: 'Reserva importada', colorHex: null, iconKey: null, bankAccountId: 'bank-a', assetType: 'fixed_income', valuationMethod: 'cdi',
      cdiPercentageInBasisPoints: 10000, redemptionTerm: null, description: null } };
  await openFundedSparkInvestmentFirebase(firestore, input);
  const change = { groupId: 'group', actorId: 'owner', clientActionId: 'funding_import_change_123456', accountId: input.accountId,
    fundingAccountId: 'bank-a', newFundingAccountId: 'bank-b', openingOperationId: input.clientActionId,
    expectedFundingRevision: (await importedBalance('bank-a')).revision, expectedNewFundingRevision: (await importedBalance('bank-b')).revision,
    expectedInvestmentRevision: 0, expectedCapitalRevision: 0, expectedCapitalOperationId: input.clientActionId, principalInCents: 150 };
  await changeSparkInvestmentFundingFirebase(firestore, change); assert.equal((await changeSparkInvestmentFundingFirebase(firestore, change)).idempotent, true);
  assert.equal((await importedBalance('bank-a')).balanceInCents, 800); assert.equal((await importedBalance('bank-b')).balanceInCents, 650);
  const state = await readSparkInvestmentStateFirebase(firestore, input);
  assert.equal(state.currentBalanceInCents, 110); assert.equal(state.principal!.fundingAccountId, 'bank-b');
  for (const [accountId, expected] of [['bank-a', 800], ['bank-b', 800]] as const) {
    const proof = await prepareSparkHistoryProofFirebase(firestore, { groupId: 'group', actorId: 'owner', accountId,
      clientActionId: `funding_import_history_${accountId}_123456`, asOf: Timestamp.fromDate(new Date('2026-09-05Z')), purpose: 'instant' });
    assert.equal(proof.balanceInCents, expected);
  }
});

test('banco importado admite criação retroativa e correções na data financeira original', { timeout: 45_000 }, async () => {
  await stageAndEnableFixture();
  const input = { groupId: 'group', actorId: 'owner', clientActionId: 'retro_import_open_123456', accountId: 'new-retro-investment',
    fundingAccountId: 'bank-a', expectedFundingRevision: (await importedBalance('bank-a')).revision,
    principalInCents: 100, observedValueInCents: 110, effectiveAt: Timestamp.fromDate(new Date('2026-09-05T12:00:00Z')),
    catalog: { name: 'Reserva retroativa', colorHex: null, iconKey: null, bankAccountId: 'bank-a', assetType: 'fixed_income' as const,
      valuationMethod: 'cdi' as const, cdiPercentageInBasisPoints: 10000, redemptionTerm: null, description: null } };
  await openDatedFundedSparkInvestmentFirebase(firestore, input);
  assert.equal((await openDatedFundedSparkInvestmentFirebase(firestore, input)).idempotent, true);
  assert.equal((await importedBalance('bank-a')).balanceInCents, 700);
  const principal = { groupId: 'group', actorId: 'owner', clientActionId: 'retro_import_principal_123456', accountId: input.accountId,
    fundingAccountId: 'bank-a', openingOperationId: input.clientActionId, expectedFundingRevision: (await importedBalance('bank-a')).revision,
    expectedInvestmentRevision: 0, expectedCapitalRevision: 0, expectedCapitalOperationId: input.clientActionId, principalInCents: 150 };
  await updateSparkInvestmentPrincipalFirebase(firestore, principal); assert.equal((await importedBalance('bank-a')).balanceInCents, 650);
  await changeSparkInvestmentFundingFirebase(firestore, { ...principal, clientActionId: 'retro_import_funding_123456', newFundingAccountId: 'bank-b',
    expectedFundingRevision: (await importedBalance('bank-a')).revision, expectedNewFundingRevision: (await importedBalance('bank-b')).revision,
    expectedInvestmentRevision: 1, expectedCapitalRevision: 1, expectedCapitalOperationId: principal.clientActionId, principalInCents: 75 });
  const state = await readSparkInvestmentStateFirebase(firestore, input);
  assert.equal(state.currentBalanceInCents, 110); assert.equal(state.reference!.observedAt.isEqual(input.effectiveAt), true);
  assert.equal(state.principal!.fundingAccountId, 'bank-b'); assert.equal((await importedBalance('bank-a')).balanceInCents, 800);
  assert.equal((await importedBalance('bank-b')).balanceInCents, 725);
  for (const [accountId, date, expected] of [
    ['bank-b', '2026-09-05T11:59:59Z', 800], ['bank-b', '2026-09-05T12:00:00Z', 725],
    [input.accountId, '2026-09-05T11:59:59Z', 0], [input.accountId, '2026-09-05T12:00:00Z', 110],
  ] as const) {
    const proof = await prepareSparkHistoryProofFirebase(firestore, { groupId: 'group', actorId: 'owner', accountId,
      clientActionId: `retro_import_${accountId}_${expected}_123456`, asOf: Timestamp.fromDate(new Date(date)), purpose: 'instant' });
    assert.equal(proof.balanceInCents, expected);
  }
});
