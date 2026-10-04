import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, runTransaction, setDoc, where } from 'firebase/firestore';

const projectId = 'demo-lumus-financas-assistant-rules';

async function run(): Promise<void> {
  const environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(resolve(process.cwd(), '..', 'firestore.rules'), 'utf8') },
  });
  try {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async context => {
      const firestore = context.firestore();
      await setDoc(doc(firestore, 'users', 'owner'), { relatedIdUsers: [] });
      await setDoc(doc(firestore, 'users', 'other'), { relatedIdUsers: [] });
      await setDoc(doc(firestore, 'mandatoryExpenses', 'obligation'), {
        personId: 'owner', name: 'Obrigação de teste', valueInCents: 1200,
        lastPaymentCycle: null,
      });
    });

    const owner = environment.authenticatedContext('owner').firestore();
    const other = environment.authenticatedContext('other').firestore();
    const anonymous = environment.unauthenticatedContext().firestore();
    const templateRef = doc(owner, 'mandatoryExpenses', 'obligation');
    const paymentRef = doc(owner, 'expenses', 'assistant_12345678_mandatory_payment');

    for (const collectionName of [
      'banks', 'expenses', 'gains', 'bankTransfers', 'cashRescues', 'monthlyBalances',
      'financeInvestments', 'investmentCdiRates', 'tags', 'mandatoryExpenses',
      'mandatoryGains', 'financeInvestmentSyncs', 'assistantOperationReceipts',
    ]) {
      const missing = await assertSucceeds(getDoc(doc(owner, collectionName, 'assistant_missing')));
      if (missing.exists()) throw new Error(`Unexpected ${collectionName} fixture.`);
    }

    await assertSucceeds(runTransaction(owner, async transaction => {
      const template = await transaction.get(templateRef);
      const payment = await transaction.get(paymentRef);
      if (!template.exists() || payment.exists()) throw new Error('Invalid payment fixture.');
      transaction.set(paymentRef, {
        personId: 'owner', valueInCents: 1200, assistantActionId: 'payment-1',
      });
      transaction.set(doc(owner, 'assistantOperationReceipts', 'payment-1'), { personId: 'owner', clientActionId: 'payment-1', kind: 'pay_mandatory_expense', fingerprint: 'example-fingerprint', createdAt: new Date() });
      transaction.update(templateRef, {
        lastPaymentCycle: '2026-09', lastPaymentExpenseId: paymentRef.id,
      });
    }));

    const savedPayment = await assertSucceeds(getDoc(paymentRef));
    const savedTemplate = await assertSucceeds(getDoc(templateRef));
    if (!savedPayment.exists() || savedTemplate.data()?.lastPaymentExpenseId !== paymentRef.id) {
      throw new Error('Payment and obligation were not committed together.');
    }
    await assertSucceeds(getDoc(doc(owner, 'assistantOperationReceipts', 'payment-1')));
    await assertFails(getDoc(doc(other, 'assistantOperationReceipts', 'payment-1')));
    await assertFails(setDoc(doc(owner, 'assistantOperationReceipts', 'payment-1'), { fingerprint: 'changed' }, { merge: true }));
    await environment.withSecurityRulesDisabled(async context => {
      const firestore = context.firestore();
      await setDoc(doc(firestore, 'financialGroups', 'group-1'), { status: 'active', members: { owner: 'admin', other: 'member' } });
      await setDoc(doc(firestore, 'users', 'owner'), { relatedIdUsers: [], financialGroupId: 'group-1', financialGroupRole: 'admin' });
      for (const name of ['tags', 'mandatoryExpenses', 'mandatoryGains', 'investmentCdiRates']) await setDoc(doc(firestore, name, 'group-metadata'), { personId: 'owner', groupId: 'group-1', valueInCents: 100 });
    });
    for (const name of ['tags', 'mandatoryExpenses', 'mandatoryGains', 'investmentCdiRates']) {
      await assertSucceeds(getDoc(doc(other, name, 'group-metadata')));
      await assertSucceeds(getDocs(query(collection(other, name), where('groupId', '==', 'group-1'))));
      await assertFails(setDoc(doc(owner, name, 'group-metadata'), { valueInCents: 200 }, { merge: true }));
    }
    await assertFails(setDoc(doc(owner, 'assistantOperationReceipts', 'after-cutover'), { personId: 'owner', clientActionId: 'after-cutover', kind: 'create_expense', fingerprint: 'test', createdAt: new Date() }));
    await assertFails(getDoc(doc(other, 'expenses', paymentRef.id)));
    await assertFails(getDoc(doc(anonymous, 'expenses', 'assistant_missing')));
  } finally {
    await environment.cleanup();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
