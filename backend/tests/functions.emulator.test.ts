import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, type User } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

const projectId = 'demo-lumus-financas';
const runId = Date.now().toString(36);
const groupId = 'functions-test-' + runId;
const bankAccountId = 'bank-' + runId;
const cashAccountId = 'cash-' + runId;
let environment: RulesTestEnvironment | undefined;

async function anonymousUser(name: string): Promise<User> {
  const app = initializeApp({
    apiKey: 'test-api-key',
    authDomain: projectId + '.firebaseapp.com',
    projectId,
  }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const credential = await signInAnonymously(auth);
  return credential.user;
}

async function seed(memberId: string, adminId: string): Promise<void> {
  if (!environment) throw new Error('Rules test environment was not initialized.');
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, 'financialGroups', groupId), {
      id: groupId,
      status: 'active',
      members: {
        [memberId]: 'member',
        [adminId]: 'admin',
      },
    });
    await setDoc(doc(firestore, 'financialAccounts', bankAccountId), {
      id: bankAccountId,
      groupId,
      kind: 'bank',
      name: 'Banco',
      currentBalanceInCents: 1_000,
      archivedAt: null,
    });
    await setDoc(doc(firestore, 'financialAccounts', cashAccountId), {
      id: cashAccountId,
      groupId,
      kind: 'cash',
      name: 'Caixa',
      currentBalanceInCents: 0,
      archivedAt: null,
    });
  });
}

async function invokeAs<TData, TResult>(user: User, name: string, data: TData): Promise<TResult> {
  const app = user.auth.app;
  const functions = getFunctions(app, 'southamerica-east1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const callable = httpsCallable<TData, TResult>(functions, name);
  return (await callable(data)).data;
}

async function expectDenied(actor: User, name: string, data: Record<string, unknown>, code = 'failed-precondition'): Promise<void> {
  try { await invokeAs(actor, name, data); } catch (error) { if ((error as { code?: string }).code === 'functions/' + code) return; throw error; }
  throw new Error(name + ' unexpectedly accepted the denied command.');
}

async function run(): Promise<void> {
  const member = await anonymousUser('financial-member');
  const admin = await anonymousUser('financial-admin');
  const outsider = await anonymousUser('financial-outsider');
  environment = await initializeTestEnvironment({ projectId });
  await seed(member.uid, admin.uid);

  const action = {
    groupId,
    fromAccountId: bankAccountId,
    toAccountId: cashAccountId,
    amountInCents: 300,
    effectiveAt: '2026-08-11T12:00:00.000Z',
    clientActionId: 'emulator_transfer_0001_' + runId,
    note: 'Saque de teste',
  };
  const first = await invokeAs<typeof action, { transactionId: string; idempotent: boolean }>(
    member,
    'transferFunds',
    action,
  );
  if (first.idempotent || !first.transactionId) {
    throw new Error('Member transfer should create one ledger transaction.');
  }
  const second = await invokeAs<typeof action, { transactionId: string; idempotent: boolean }>(
    member,
    'transferFunds',
    action,
  );
  if (!second.idempotent || second.transactionId !== first.transactionId) {
    throw new Error('Repeated clientActionId must be idempotent.');
  }

  const expense = await invokeAs(admin, 'postMovement', {
    groupId, accountId: bankAccountId, direction: 'expense', amountInCents: 100,
    effectiveAt: '2026-10-01T15:00:00.000Z', clientActionId: 'emulator_expense_' + runId,
  }) as { transactionId: string };
  const reversalCommand = { groupId, transactionId: expense.transactionId, effectiveAt: '2026-10-01T15:01:00.000Z', clientActionId: 'emulator_reverse_' + runId };
  await invokeAs(admin, 'reverseTransaction', reversalCommand);
  await invokeAs(admin, 'reverseTransaction', reversalCommand);
  let repeatedReversalDenied = false;
  try {
    await invokeAs(admin, 'reverseTransaction', { ...reversalCommand, clientActionId: 'emulator_reverse_again_' + runId });
  } catch {
    repeatedReversalDenied = true;
  }
  if (!repeatedReversalDenied) throw new Error('A completed movement must not be reversed twice under different request identities.');

  const originalForCorrection = await invokeAs(admin, 'postMovement', {
    groupId, accountId: bankAccountId, direction: 'expense', amountInCents: 200,
    effectiveAt: '2026-10-01T15:00:00.000Z', clientActionId: 'emulator_original_' + runId,
  }) as { transactionId: string };
  const correction = {
    groupId, originalTransactionId: originalForCorrection.transactionId, accountId: bankAccountId,
    direction: 'expense', amountInCents: 100, effectiveAt: '2026-10-01T15:00:00.000Z',
    clientActionId: 'emulator_correction_' + runId, note: 'Valor corrigido',
  };
  const corrected = await invokeAs(admin, 'correctMovement', correction) as { transactionId: string };
  const correctedAgain = await invokeAs(admin, 'correctMovement', correction) as { transactionId: string; idempotent: boolean };
  const correctedBank = await getDoc(doc(environment.authenticatedContext(admin.uid).firestore(), 'financialAccounts', bankAccountId));
  if (!correctedAgain.idempotent || corrected.transactionId !== correctedAgain.transactionId || correctedBank.data()?.currentBalanceInCents !== 600) {
    throw new Error('A correction must reverse and replace the original atomically without duplicating on retry.');
  }

  const account = await invokeAs<{
    groupId: string;
    action: string;
    kind: string;
    name: string;
    clientActionId: string;
  }, { accountId: string }>(admin, 'manageAccount', {
    groupId,
    action: 'create',
    kind: 'bank',
    name: 'Banco administrado',
    clientActionId: 'emulator_account_0001_' + runId,
  });
  if (!account.accountId) throw new Error('Administrator should be able to manage accounts.');

  const openingCommand = {
    groupId, action: 'create', kind: 'bank', name: 'Banco com abertura',
    initialBalanceInCents: 12_345, effectiveAt: '2026-10-01T15:00:00.000Z', clientActionId: 'emulator_opening_0001_' + runId,
  };
  const opening = await invokeAs<typeof openingCommand, { accountId: string }>(admin, 'manageAccount', openingCommand);
  const repeatedOpening = await invokeAs<typeof openingCommand, { accountId: string }>(admin, 'manageAccount', openingCommand);
  if (opening.accountId !== repeatedOpening.accountId) throw new Error('Opening retry must preserve the account identity.');
  const readDb = environment.authenticatedContext(admin.uid).firestore();
  const openedAccount = await getDoc(doc(readDb, 'financialAccounts', opening.accountId));
  const openingEvent = await getDoc(doc(readDb, 'ledgerTransactions', 'opening-' + openingCommand.clientActionId));
  if (openedAccount.data()?.currentBalanceInCents !== 12_345 || openingEvent.data()?.legs?.[0]?.deltaInCents !== 12_345) {
    throw new Error('Account creation and its audited opening balance must commit together exactly once.');
  }

  // A migrated member can manage their own categories and recurring plans through the trusted domain command.
  const categoryCommand = { groupId, domain: 'category', action: 'create', clientActionId: 'emulator_category_' + runId, fields: { name: 'Internet', usageType: 'expense', isMandatoryExpense: true } };
  const category = await invokeAs(member, 'manageFinancialMetadata', categoryCommand) as { recordId: string };
  const planCommand = { groupId, domain: 'mandatoryExpense', action: 'create', clientActionId: 'emulator_plan_' + runId, fields: { name: 'Internet parcelada', valueInCents: 333, dueDay: 10, tagId: category.recordId, installmentTotal: 3, installmentTotalValueInCents: 1_000, reminderEnabled: false } };
  const plan = await invokeAs(member, 'manageFinancialMetadata', planCommand) as { recordId: string };
  const settle = { groupId, templateId: plan.recordId, recurringType: 'expense', action: 'settle', accountId: opening.accountId, effectiveAt: '2026-10-01T15:00:00.000Z', installmentsToAdvance: 3, clientActionId: 'emulator_settle_' + runId };
  const settled = await invokeAs(member, 'completeFinancialRecurring', settle) as { transactionId: string; amountInCents: number };
  const settledAgain = await invokeAs(member, 'completeFinancialRecurring', settle) as { idempotent: boolean };
  const planAfter = await getDoc(doc(environment.authenticatedContext(member.uid).firestore(), 'mandatoryExpenses', plan.recordId));
  const accountAfter = await getDoc(doc(readDb, 'financialAccounts', opening.accountId));
  if (settled.amountInCents !== 1_000 || !settledAgain.idempotent || planAfter.data()?.installmentsCompleted !== 3 || accountAfter.data()?.currentBalanceInCents !== 11_345) throw new Error('Settling all three installments must post exactly the contractual 1000 cents once and advance the plan atomically.');
  const undo = { groupId, templateId: plan.recordId, recurringType: 'expense', action: 'undo', effectiveAt: '2026-10-01T15:00:00.000Z', clientActionId: 'emulator_undo_plan_' + runId };
  await invokeAs(member, 'completeFinancialRecurring', undo);
  await invokeAs(member, 'completeFinancialRecurring', undo);
  const planRestored = await getDoc(doc(environment.authenticatedContext(member.uid).firestore(), 'mandatoryExpenses', plan.recordId));
  if (planRestored.data()?.installmentsCompleted !== 0 || planRestored.data()?.lastPaymentCycle !== null) throw new Error('Recurring reversal must restore exactly the three advanced installments.');
  let otherOwnerDenied = false;
  try { await invokeAs(admin, 'manageFinancialMetadata', { groupId, domain: 'mandatoryExpense', action: 'delete', recordId: plan.recordId, clientActionId: 'emulator_other_owner_' + runId, fields: {} }); } catch { otherOwnerDenied = true; }
  if (!otherOwnerDenied) throw new Error('A group role must not grant ownership of another member recurring template.');

  const investmentCommand = { groupId, action: 'create', kind: 'investment', name: 'CDB', initialBalanceInCents: 2_345, fundingAccountId: opening.accountId, effectiveAt: '2026-10-01T15:00:00.000Z', clientActionId: 'emulator_investment_' + runId, metadata: { cdiPercentageInBasisPoints: 10_000, assetType: 'fixed_income', valuationMethod: 'cdi', redemptionTerm: 'Liquidez diária' } };
  const investment = await invokeAs(admin, 'manageAccount', investmentCommand) as { accountId: string };
  await invokeAs(admin, 'manageAccount', investmentCommand);
  const fundedBank = await getDoc(doc(readDb, 'financialAccounts', opening.accountId));
  const fundedInvestment = await getDoc(doc(readDb, 'financialAccounts', investment.accountId));
  if (fundedBank.data()?.currentBalanceInCents !== 10_000 || fundedInvestment.data()?.currentBalanceInCents !== 2_345 || fundedInvestment.data()?.cdiPercentageInBasisPoints !== 10_000) throw new Error('Investment creation must fund from the bank exactly once and retain its CDI metadata.');
  const updatedInvestment = { groupId, accountId: investment.accountId, action: 'update', clientActionId: 'emulator_investment_metadata_' + runId, metadata: { cdiPercentageInBasisPoints: 11_000 }, expectedName: 'CDB' };
  await invokeAs(admin, 'manageAccount', updatedInvestment);
  const afterMetadata = await getDoc(doc(readDb, 'financialAccounts', investment.accountId));
  if (afterMetadata.data()?.cdiPercentageInBasisPoints !== 11_000 || afterMetadata.data()?.currentBalanceInCents !== 2_345) throw new Error('Investment metadata updates must not mutate confirmed balances.');

  await invokeAs(admin, 'postMovement', { groupId, accountId: bankAccountId, direction: 'income', amountInCents: 77, effectiveAt: '2026-10-01T01:30:00.000Z', clientActionId: 'emulator_sp_boundary_' + runId });
  let civilSummaryDelta: number | undefined;
  await environment.withSecurityRulesDisabled(async context => { civilSummaryDelta = (await getDoc(doc(context.firestore(), 'financeMonthlySummaries', groupId + '-2026-09'))).data()?.bankDeltaInCents?.[bankAccountId]; });
  if (civilSummaryDelta !== 77) throw new Error('Ledger monthly summaries must put 01:30 UTC on Oct 1 into the September São Paulo cycle.');

  let negativeInvestmentDenied = false;
  try { await invokeAs(admin, 'transferFunds', { groupId, fromAccountId: investment.accountId, toAccountId: opening.accountId, amountInCents: 2_346, effectiveAt: '2026-10-02T15:00:00.000Z', kind: 'investment_redemption', clientActionId: 'emulator_invalid_redemption_' + runId }); } catch { negativeInvestmentDenied = true; }
  if (!negativeInvestmentDenied) throw new Error('A redemption cannot drive the investment balance below zero.');

  const principalCorrection = { groupId, accountId: investment.accountId, action: 'update', initialValueInCents: 3_000, effectiveAt: '2026-10-02T15:00:00.000Z', clientActionId: 'emulator_principal_correction_' + runId };
  await invokeAs(admin, 'manageAccount', principalCorrection); await invokeAs(admin, 'manageAccount', principalCorrection);
  const principalInvestment = await getDoc(doc(readDb, 'financialAccounts', investment.accountId));
  const principalBank = await getDoc(doc(readDb, 'financialAccounts', opening.accountId));
  if (principalInvestment.data()?.initialValueInCents !== 3_000 || principalInvestment.data()?.currentBalanceInCents !== 3_000 || principalBank.data()?.currentBalanceInCents !== 9_345) throw new Error('Correcting the original 2345-cent principal to 3000 cents must preserve the opening history and move only a net 655 cents on retry.');
  const linkedNewBank = openedAccount.data()?.assistantActionId;
  if (linkedNewBank !== openingCommand.clientActionId) throw new Error('A newly managed bank must retain its action identity to resolve dependent movements.');

  // Exercise metadata CRUD, recurring income, account guards and investment movements against persisted records.
  await expectDenied(admin, 'postMovement', { groupId, accountId: bankAccountId, direction: 'income', amountInCents: 1, categoryId: category.recordId, effectiveAt: '2026-10-02T15:00:00.000Z', clientActionId: 'emulator_wrong_category_' + runId });
  await expectDenied(member, 'manageFinancialMetadata', { groupId, domain: 'category', action: 'delete', recordId: category.recordId, fields: {}, clientActionId: 'emulator_linked_category_' + runId });
  const unusedCategoryCommand = { groupId, domain: 'category', action: 'create', fields: { name: 'Categoria livre', usageType: 'both', isMandatoryGain: true }, clientActionId: 'emulator_unused_category_' + runId };
  const unusedCategory = await invokeAs(member, 'manageFinancialMetadata', unusedCategoryCommand) as { recordId: string };
  await invokeAs(member, 'manageFinancialMetadata', { groupId, domain: 'category', action: 'update', recordId: unusedCategory.recordId, fields: { name: 'Categoria renomeada', iconLabel: 'Mercado' }, clientActionId: 'emulator_category_update_' + runId });
  if ((await getDoc(doc(readDb, 'tags', unusedCategory.recordId))).data()?.iconName !== 'shopping-outline') throw new Error('Category icons must be resolved from the same catalog as the app UI.');
  if ((await getDoc(doc(readDb, 'tags', unusedCategory.recordId))).data()?.assistantActionId !== unusedCategoryCommand.clientActionId) throw new Error('Metadata edits must retain the creation identity used by dependent commands.');
  const incomePlanCommand = { groupId, domain: 'mandatoryGain', action: 'create', fields: { name: 'Receita parcelada', valueInCents: 350, dueDay: 10, tagId: unusedCategory.recordId, installmentTotal: 2, installmentTotalValueInCents: 701 }, clientActionId: 'emulator_gain_plan_' + runId };
  const incomePlan = await invokeAs(member, 'manageFinancialMetadata', incomePlanCommand) as { recordId: string };
  await invokeAs(member, 'manageFinancialMetadata', { groupId, domain: 'mandatoryGain', action: 'update', recordId: incomePlan.recordId, fields: { description: 'Contrato sintético' }, clientActionId: 'emulator_gain_plan_update_' + runId });
  const receive = { groupId, templateId: incomePlan.recordId, recurringType: 'gain', action: 'settle', accountId: opening.accountId, effectiveAt: '2026-10-02T15:00:00.000Z', installmentsToAdvance: 2, clientActionId: 'emulator_gain_receive_' + runId };
  const received = await invokeAs(member, 'completeFinancialRecurring', receive) as { transactionId: string; amountInCents: number };
  await invokeAs(member, 'completeFinancialRecurring', receive);
  const gainTemplate = (await getDoc(doc(readDb, 'mandatoryGains', incomePlan.recordId))).data();
  if (received.amountInCents !== 701 || gainTemplate?.completedCycles?.['2026-10']?.transactionId !== received.transactionId || (await getDoc(doc(readDb, 'financialAccounts', opening.accountId))).data()?.currentBalanceInCents !== 10_046) throw new Error('A recurring receipt must advance its history and exact contractual remainder with the persisted balance once.');
  await invokeAs(member, 'completeFinancialRecurring', { groupId, templateId: incomePlan.recordId, recurringType: 'gain', action: 'undo', effectiveAt: '2026-10-02T15:00:00.000Z', clientActionId: 'emulator_gain_undo_' + runId });
  if ((await getDoc(doc(readDb, 'mandatoryGains', incomePlan.recordId))).data()?.installmentsCompleted !== 0) throw new Error('Recurring income reversal must restore the installment count.');
  await invokeAs(member, 'manageFinancialMetadata', { groupId, domain: 'mandatoryGain', action: 'delete', recordId: incomePlan.recordId, fields: {}, clientActionId: 'emulator_gain_plan_delete_' + runId });
  const emptyPlan = await invokeAs(member, 'manageFinancialMetadata', { ...planCommand, fields: { ...planCommand.fields, tagId: unusedCategory.recordId, name: 'Plano ainda não iniciado', installmentStartDate: '2026-11-01T15:00:00.000Z', installmentEndDate: '2026-12-01T15:00:00.000Z' }, clientActionId: 'emulator_future_plan_' + runId }) as { recordId: string };
  await expectDenied(member, 'completeFinancialRecurring', { ...settle, templateId: emptyPlan.recordId, installmentsToAdvance: 1, clientActionId: 'emulator_plan_too_early_' + runId });
  await expectDenied(member, 'completeFinancialRecurring', { ...settle, templateId: emptyPlan.recordId, effectiveAt: '2027-01-01T15:00:00.000Z', installmentsToAdvance: 1, clientActionId: 'emulator_plan_too_late_' + runId });
  await invokeAs(member, 'manageFinancialMetadata', { groupId, domain: 'mandatoryExpense', action: 'delete', recordId: emptyPlan.recordId, fields: {}, clientActionId: 'emulator_empty_plan_delete_' + runId });
  const freshCategory = await invokeAs(member, 'manageFinancialMetadata', { ...unusedCategoryCommand, clientActionId: 'emulator_category_deletable_' + runId }) as { recordId: string };
  const deleteFreshCategory = { groupId, domain: 'category', action: 'delete', recordId: freshCategory.recordId, fields: {}, clientActionId: 'emulator_category_delete_' + runId };
  await invokeAs(member, 'manageFinancialMetadata', deleteFreshCategory); await invokeAs(member, 'manageFinancialMetadata', deleteFreshCategory);
  if ((await getDoc(doc(readDb, 'tags', freshCategory.recordId))).exists()) throw new Error('An unused category must actually be deleted, with a durable retry receipt.');
  const cdiRecordId = 'cdi-emulator-' + runId;
  const cdiCommand = { groupId, domain: 'cdi', action: 'upsert', recordId: cdiRecordId, fields: { annualRateInBasisPoints: 1_400, effectiveFrom: '2026-10-02T15:00:00.000Z' }, clientActionId: 'emulator_cdi_' + runId };
  await invokeAs(member, 'manageFinancialMetadata', cdiCommand); await invokeAs(member, 'manageFinancialMetadata', cdiCommand);
  if ((await getDoc(doc(readDb, 'investmentCdiRates', cdiRecordId))).data()?.annualRateInBasisPoints !== 1_400) throw new Error('CDI must retain fixed-point basis points in persisted metadata.');
  await expectDenied(admin, 'manageFinancialMetadata', { ...cdiCommand, fields: { ...cdiCommand.fields, annualRateInBasisPoints: 1_500 }, clientActionId: 'emulator_cdi_other_owner_' + runId }, 'permission-denied');
  const deactivate = { groupId, accountId: account.accountId, action: 'update', metadata: { isActive: false }, clientActionId: 'emulator_bank_deactivate_' + runId };
  await invokeAs(admin, 'manageAccount', deactivate);
  await expectDenied(admin, 'manageAccount', { ...investmentCommand, fundingAccountId: account.accountId, clientActionId: 'emulator_inactive_funding_' + runId }, 'permission-denied');
  await expectDenied(admin, 'manageAccount', { groupId, accountId: investment.accountId, action: 'update', metadata: { bankAccountId: account.accountId }, clientActionId: 'emulator_inactive_link_' + runId }, 'permission-denied');
  await expectDenied(member, 'manageAccount', { ...deactivate, metadata: { isActive: true }, clientActionId: 'emulator_member_manage_bank_' + runId }, 'permission-denied');
  await expectDenied(admin, 'postMovement', { groupId, accountId: opening.accountId, direction: 'expense', amountInCents: 1, expectedActorId: member.uid, clientActionId: 'emulator_changed_actor_' + runId }, 'unauthenticated');
  await invokeAs(admin, 'manageAccount', { ...deactivate, metadata: { isActive: true }, name: 'Banco reativado', clientActionId: 'emulator_bank_reactivate_' + runId });
  if ((await getDoc(doc(readDb, 'financialAccounts', account.accountId))).data()?.isActive !== true) throw new Error('Reactivation must preserve the bank and enable later commands.');
  const deposited = await invokeAs(admin, 'transferFunds', { groupId, fromAccountId: opening.accountId, toAccountId: investment.accountId, amountInCents: 200, effectiveAt: '2026-10-02T15:00:00.000Z', kind: 'investment_deposit', clientActionId: 'emulator_deposit_' + runId }) as { transactionId: string };
  const redeemed = await invokeAs(admin, 'transferFunds', { groupId, fromAccountId: investment.accountId, toAccountId: opening.accountId, amountInCents: 100, effectiveAt: '2026-10-02T15:00:00.000Z', kind: 'investment_redemption', clientActionId: 'emulator_redemption_' + runId }) as { transactionId: string };
  if ((await getDoc(doc(readDb, 'financialAccounts', investment.accountId))).data()?.currentBalanceInCents !== 3_100) throw new Error('Deposit and redemption must post the actual 200- and 100-cent legs.');
  for (const [label, transactionId] of [['redemption', redeemed.transactionId], ['deposit', deposited.transactionId]]) await invokeAs(admin, 'reverseTransaction', { groupId, transactionId, effectiveAt: '2026-10-02T15:00:00.000Z', clientActionId: 'emulator_investment_reverse_' + label + '_' + runId });
  const synced = await invokeAs(admin, 'reconcileAccount', { groupId, accountId: investment.accountId, countedBalanceInCents: 3_500, effectiveAt: '2026-10-02T15:00:00.000Z', clientActionId: 'emulator_sync_' + runId }) as { transactionId: string };
  if ((await getDoc(doc(readDb, 'financialAccounts', investment.accountId))).data()?.currentBalanceInCents !== 3_500) throw new Error('Investment synchronization must persist its counted balance.');
  await invokeAs(admin, 'reverseTransaction', { groupId, transactionId: synced.transactionId, effectiveAt: '2026-10-02T15:00:00.000Z', clientActionId: 'emulator_sync_reverse_' + runId });
  await invokeAs(admin, 'manageAccount', { groupId, accountId: investment.accountId, action: 'update', countedBalanceInCents: 3_600, effectiveAt: '2026-10-02T15:00:00.000Z', clientActionId: 'emulator_valuation_update_' + runId });
  if ((await getDoc(doc(readDb, 'financialAccounts', investment.accountId))).data()?.currentBalanceInCents !== 3_600) throw new Error('Editing current investment value must create a reconciliation rather than silently changing only metadata.');
  await invokeAs(admin, 'manageAccount', { groupId, accountId: investment.accountId, action: 'archive', clientActionId: 'emulator_investment_archive_' + runId });
  await invokeAs(admin, 'manageAccount', { groupId, accountId: account.accountId, action: 'archive', clientActionId: 'emulator_bank_archive_' + runId });
  if (!(await getDoc(doc(readDb, 'financialAccounts', investment.accountId))).data()?.archivedAt || !(await getDoc(doc(readDb, 'financialAccounts', account.accountId))).data()?.archivedAt) throw new Error('Deleting managed accounts must archive the account while preserving its ledger history.');

  const maximumBalanceAccount = 'bank-maximum-' + runId;
  await environment.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(), 'financialAccounts', maximumBalanceAccount), { groupId, kind: 'bank', name: 'Limite exato', currentBalanceInCents: Number.MAX_SAFE_INTEGER, archivedAt: null }); });
  await expectDenied(admin, 'postMovement', { groupId, accountId: maximumBalanceAccount, direction: 'income', amountInCents: 1, effectiveAt: '2026-10-02T15:00:00.000Z', clientActionId: 'emulator_overflow_' + runId });
  const exactBankReconciliation = { groupId, accountId: bankAccountId, countedBalanceInCents: 800, effectiveAt: '2026-10-02T15:00:00.000Z', clientActionId: 'emulator_bank_reconciliation_' + runId };
  await invokeAs(admin, 'reconcileAccount', exactBankReconciliation); await invokeAs(admin, 'reconcileAccount', exactBankReconciliation);
  if ((await getDoc(doc(readDb, 'financialAccounts', bankAccountId))).data()?.currentBalanceInCents !== 800) throw new Error('Monthly balance on a migrated bank must reconcile to the counted balance exactly once.');
  const originalIncome = await invokeAs(admin, 'postMovement', { groupId, accountId: bankAccountId, direction: 'income', amountInCents: 200, effectiveAt: '2026-10-02T15:00:00.000Z', clientActionId: 'emulator_original_income_' + runId }) as { transactionId: string };
  const correctedIncome = await invokeAs(admin, 'correctMovement', { groupId, originalTransactionId: originalIncome.transactionId, accountId: bankAccountId, direction: 'income', amountInCents: 300, effectiveAt: '2026-10-02T15:00:00.000Z', clientActionId: 'emulator_correct_income_' + runId }) as { transactionId: string };
  if ((await getDoc(doc(readDb, 'financialAccounts', bankAccountId))).data()?.currentBalanceInCents !== 1_100) throw new Error('Correcting income must replace 200 cents with 300, rather than add both.');
  await invokeAs(admin, 'reverseTransaction', { groupId, transactionId: correctedIncome.transactionId, effectiveAt: '2026-10-02T15:00:00.000Z', clientActionId: 'emulator_delete_income_' + runId });
  if ((await getDoc(doc(readDb, 'financialAccounts', bankAccountId))).data()?.currentBalanceInCents !== 800) throw new Error('Deleting corrected income must reverse only the current replacement.');

  const legacyOwner = await anonymousUser('financial-legacy-owner-' + runId);
  const legacyCategoryId = 'legacy-category-' + runId;
  const foreignLinkId = 'foreign-expense-' + runId;
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, 'users', legacyOwner.uid), { relatedIdUsers: [] });
    await setDoc(doc(firestore, 'tags', legacyCategoryId), { personId: legacyOwner.uid, name: 'Categoria com histórico de outro usuário', usageType: 'both' });
    await setDoc(doc(firestore, 'expenses', foreignLinkId), { personId: outsider.uid, tagId: legacyCategoryId, valueInCents: 10 });
  });
  const legacyCategoryDelete = { domain: 'category', action: 'delete', recordId: legacyCategoryId, fields: {}, clientActionId: 'legacy_category_delete_' + runId, assistantRequestFingerprint: 'legacy-delete-current-version', expectedActorId: legacyOwner.uid };
  await expectDenied(legacyOwner, 'manageFinancialMetadata', legacyCategoryDelete);
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore();
    await deleteDoc(doc(firestore, 'expenses', foreignLinkId));
    await setDoc(doc(firestore, 'ledgerTransactions', foreignLinkId), { groupId: 'historical-group-' + runId, categoryId: legacyCategoryId, actorId: outsider.uid });
  });
  await expectDenied(legacyOwner, 'manageFinancialMetadata', legacyCategoryDelete);
  await environment.withSecurityRulesDisabled(async context => { await deleteDoc(doc(context.firestore(), 'ledgerTransactions', foreignLinkId)); });
  const deletedLegacyCategory = await invokeAs(legacyOwner, 'manageFinancialMetadata', legacyCategoryDelete) as { idempotent: boolean };
  const retriedLegacyCategory = await invokeAs(legacyOwner, 'manageFinancialMetadata', legacyCategoryDelete) as { idempotent: boolean };
  if (deletedLegacyCategory.idempotent || !retriedLegacyCategory.idempotent || (await getDoc(doc(environment.authenticatedContext(legacyOwner.uid).firestore(), 'tags', legacyCategoryId))).exists()) throw new Error('Legacy category deletion must check all historical references and preserve its response-loss receipt.');
  await expectDenied(legacyOwner, 'manageFinancialMetadata', { ...legacyCategoryDelete, assistantRequestFingerprint: 'changed-delete-version' });
  await expectDenied(legacyOwner, 'manageFinancialMetadata', { ...legacyCategoryDelete, expectedActorId: outsider.uid }, 'unauthenticated');
  await environment.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(), 'users', legacyOwner.uid), { financialLegacyCutoverAt: new Date() }, { merge: true }); });
  await expectDenied(legacyOwner, 'manageFinancialMetadata', { ...legacyCategoryDelete, clientActionId: 'legacy_after_cutover_' + runId }, 'permission-denied');

  // Legacy outflows use the same trusted transaction/query path as manual forms.
  const legacyMovementOwner = await anonymousUser('legacy-movement-owner-' + runId);
  const legacyBankId = 'legacy-movement-bank-' + runId;
  const legacyInvestmentId = 'legacy-movement-investment-' + runId;
  await environment.withSecurityRulesDisabled(async context => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, 'users', legacyMovementOwner.uid), { relatedIdUsers: [] });
    await setDoc(doc(firestore, 'banks', legacyBankId), { personId: legacyMovementOwner.uid, name: 'Banco legado', isActive: true });
    await setDoc(doc(firestore, 'monthlyBalances', legacyBankId), { personId: legacyMovementOwner.uid, bankId: legacyBankId, year: 2026, month: 10, valueInCents: 1_000 });
    await setDoc(doc(firestore, 'financeInvestments', legacyInvestmentId), { personId: legacyMovementOwner.uid, bankId: legacyBankId, name: 'Investimento legado', currentValueInCents: 100, initialValueInCents: 100, date: new Date('2026-10-01T15:00:00Z') });
  });
  const legacyOutflow = { kind: 'create_cash_withdrawal', bankId: legacyBankId, valueInCents: 100, date: '2026-10-02T15:00:00Z', expectedActorId: legacyMovementOwner.uid, clientActionId: 'legacy_outflow_' + runId, assistantRequestFingerprint: 'current-user-version' };
  await expectDenied(legacyMovementOwner, 'executeLegacyFinancialMovement', { ...legacyOutflow, expectedActorId: outsider.uid }, 'unauthenticated');
  await expectDenied(outsider, 'executeLegacyFinancialMovement', { ...legacyOutflow, expectedActorId: outsider.uid }, 'permission-denied');
  await expectDenied(legacyMovementOwner, 'executeLegacyFinancialMovement', { ...legacyOutflow, valueInCents: 0 }, 'invalid-argument');
  await expectDenied(legacyMovementOwner, 'executeLegacyFinancialMovement', { ...legacyOutflow, valueInCents: 901 });
  await expectDenied(legacyMovementOwner, 'executeLegacyFinancialMovement', { ...legacyOutflow, kind: 'deposit_investment', investmentId: legacyInvestmentId, expectedFingerprint: 'stale-current-value' });
  const persistedOutflow = await invokeAs(legacyMovementOwner, 'executeLegacyFinancialMovement', legacyOutflow) as { recordId: string; idempotent: boolean };
  const resumedOutflow = await invokeAs(legacyMovementOwner, 'executeLegacyFinancialMovement', legacyOutflow) as { recordId: string; idempotent: boolean };
  if (!resumedOutflow.idempotent || persistedOutflow.recordId !== resumedOutflow.recordId) throw new Error('Legacy outflow receipt must reconcile persisted success before any retry.');
  await expectDenied(legacyMovementOwner, 'executeLegacyFinancialMovement', { ...legacyOutflow, description: 'Different material description' });
  await environment.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(), 'users', legacyMovementOwner.uid), { financialLegacyCutoverAt: new Date() }, { merge: true }); });
  await expectDenied(legacyMovementOwner, 'executeLegacyFinancialMovement', { ...legacyOutflow, clientActionId: 'legacy_movement_after_cutover_' + runId }, 'permission-denied');

  let changedRetryDenied = false;
  try {
    await invokeAs(member, 'transferFunds', { ...action, amountInCents: 301 });
  } catch {
    changedRetryDenied = true;
  }
  if (!changedRetryDenied) throw new Error('A request identity must not authorize changed financial arguments.');

  let outsiderDenied = false;
  try {
    await invokeAs<typeof action, { transactionId: string }>(outsider, 'transferFunds', {
      ...action,
      clientActionId: 'emulator_transfer_0002_' + runId,
    });
  } catch {
    outsiderDenied = true;
  }
  if (!outsiderDenied) throw new Error('A non-member must not post a ledger transaction.');

  await environment.cleanup();
}

void run().catch(async (error: unknown) => {
  await environment?.cleanup();
  console.error(error);
  process.exitCode = 1;
});
