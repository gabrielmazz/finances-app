import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createBank, readBank } from '../../firebase/banks';
import { archiveCategory, createCategory } from '../../firebase/categories';
import { LOCAL_PROJECT_ID, STAGING_PROJECT_ID } from '../../firebase/config';
import { readMandatoryTemplate, saveMandatoryTemplate } from '../../firebase/mandatory';
import { cancelMandatoryCycle, confirmMandatoryCycle, createMovement, hasCashHistory, readMovementTimeline, updateMovement } from '../../firebase/movements';
import { CASH_HISTORY_ID, type MovementInput } from '../../domain/movements';
import type { AccountClient } from '../../firebase/profiles';

for (const [projectId, rules] of [[LOCAL_PROJECT_ID, 'firestore.rules'], [STAGING_PROJECT_ID, 'security/financial-canonical.rules']]) {
  test(`${rules}: credit, debit, cash, edited amount and partial settlement preserve balances and scope`, async () => {
    const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync(rules, 'utf8') } });
    try {
      const uid = 'payment-method-owner', scope = { uid, id: uid, kind: 'personal' as const };
      const db = env.authenticatedContext(uid).firestore();
      const client = { db, auth: { currentUser: { uid } } } as unknown as AccountClient;
      const bank = 'paymentsBank00000001', categoryId = 'paymentsType00000001', templateId = 'paymentsPlan00000001';
      await createBank(client, scope, bank, {
        name: 'Conta', institutionKey: 'outro-banco', institutionName: 'Banco', accountType: 'checking',
        colorHex: null, initialBalanceCents: 20000, openingDate: '2025-01-01', reason: '',
      });
      const category = await createCategory(client, scope, categoryId, {
        name: 'Compras', usageType: 'expense', iconFamily: 'ionicons', iconName: 'basket-outline', iconStyle: null,
        isMandatoryExpense: true, isMandatoryGain: false, showInBothLists: true,
      });
      const balance = async () => (await readBank(client, scope, { source: 'new', id: bank })).balanceInCents;
      const input: MovementInput = {
        name: 'Compra', type: 'expense', amountCents: 1057, accountId: bank, date: '2025-04-02',
        categoryId, categorySource: 'new', explanation: '', paymentFormats: [],
      };
      const credit = await createMovement(client, scope, 'paymentsItem00000001', { ...input, paymentMethod: 'credit' });
      assert.equal(credit.paymentMethod, 'credit');
      assert.equal(await balance(), 20000);
      const debit = await updateMovement(client, scope, credit, { ...input, paymentMethod: 'debit' });
      assert.equal(debit.paymentMethod, 'debit');
      assert.equal(await balance(), 18943);
      const cash = await updateMovement(client, scope, debit, { ...input, accountId: null, amountCents: 52 });
      assert.equal(cash.paymentMethod, undefined);
      assert.equal(await balance(), 20000);
      assert.equal(await hasCashHistory(client, scope), true);
      const cashHistory = await readMovementTimeline(client, scope, CASH_HISTORY_ID, new Date('2025-04-01'), new Date('2025-05-01'));
      assert.deepEqual(cashHistory.items.map(item => [item.id, item.moneyFormat, item.tagIconName]), [[cash.id, true, 'basket-outline']]);
      await assertFails(getDoc(doc(env.authenticatedContext('another-user').firestore(), 'financialContexts', 'personal:' + uid, 'movements', cash.id)));
      await updateMovement(client, scope, cash, null);
      assert.equal(await hasCashHistory(client, scope), false);
      assert.equal(await balance(), 20000);
      await assert.rejects(createMovement(client, scope, 'paymentsItem00000002', { ...input, type: 'gain', paymentMethod: 'credit' }), /invalid-format/);
      await assert.rejects(createMovement(client, scope, 'paymentsItem00000002', { ...input, accountId: null, paymentMethod: 'debit' }), /invalid-format/);

      await saveMandatoryTemplate(client, scope, templateId, {
        type: 'expense', name: input.name, valueInCents: 333, categoryId, categorySource: 'new', description: '',
        dueDay: 10, usesBusinessDays: false, installmentTotal: 3, installmentStartDate: '2025-06-10', installmentTotalValueInCents: 1000,
      }, null);
      await archiveCategory(client, scope, category);
      const first = { ...input, amountCents: 297 };
      await confirmMandatoryCycle(client, scope, templateId, first, 1, 333);
      await confirmMandatoryCycle(client, scope, templateId, first, 1, 333);
      const plan = await readMandatoryTemplate(client, scope, templateId);
      assert.equal(plan.installmentsCompleted, 1);
      assert.equal(plan.lastAmountCents, 297);
      assert.equal(await balance(), 19703);
      await cancelMandatoryCycle(client, scope, templateId, '2025-04', plan.revision);
      assert.equal(await balance(), 20000);
      const reposted = await confirmMandatoryCycle(client, scope, templateId, first, 1, 333);
      const audited = (await getDoc(doc(db, 'financialContexts', 'personal:' + uid, 'movements', reposted.id))).data();
      assert.equal(audited?.reversalHistory[0].amountCents, 297);
      assert.equal(audited?.reversalHistory[0].plannedInstallmentCents, 333);
      const next = await confirmMandatoryCycle(client, scope, templateId, { ...input, date: '2025-05-02', amountCents: 667 }, 2, 667);
      assert.equal(await balance(), 19036);
      const settled = await readMandatoryTemplate(client, scope, templateId);
      assert.equal(settled.installmentsCompleted, 3);
      const rows = await readMovementTimeline(client, scope, bank, new Date('2025-04-01'), new Date('2025-06-01'));
      assert.equal(rows.items.find(item => item.valueInCents === 297)?.plannedInstallmentCents, 333);
      assert.ok(rows.items.every(item => item.tagIconName === 'basket-outline'));
      await cancelMandatoryCycle(client, scope, templateId, next.date.slice(0, 7), settled.revision);
      assert.equal(await balance(), 19703);
      assert.equal((await readMandatoryTemplate(client, scope, templateId)).installmentsCompleted, 1);
    } finally { await env.cleanup(); }
  });
}
