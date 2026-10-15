import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';

async function run() {
  const environment = await initializeTestEnvironment({ projectId: 'demo-lumus-legacy-schema',
    firestore: { rules: readFileSync(resolve(process.cwd(), '..', 'firestore.rules'), 'utf8') } });
  try {
    const firestore = environment.authenticatedContext('owner', { auth_time: Math.floor(Date.now() / 1000) }).firestore();
    const now = new Date('2026-10-11T12:00:00Z');
    const common = { personId: 'owner', createdAt: now, updatedAt: now };
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', 'owner'), { relatedIdUsers: [] });
      await setDoc(doc(db, 'users', 'stranger'), { relatedIdUsers: [] });
      await setDoc(doc(db, 'banks', 'private-bank'), { personId: 'stranger', name: 'Private' });
      await setDoc(doc(db, 'tags', 'private-tag'), { personId: 'stranger', name: 'Private' });
    });
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, 'banks', 'bank'), { ...common, name: 'Banco', isActive: true });
    batch.set(doc(firestore, 'monthlyBalances', 'opening'), { ...common, bankId: 'bank', year: 2026, month: 10, valueInCents: 10_000 });
    await assertSucceeds(batch.commit());
    await assertSucceeds(setDoc(doc(firestore, 'tags', 'tag'), { ...common, name: 'Categoria', usageType: 'both' }));
    const movement = { ...common, name: 'Movimento', date: now, bankId: 'bank', tagId: 'tag', valueInCents: 100 };
    const recurring = { ...common, name: 'Recorrência', valueInCents: 100, dueDay: 10, tagId: 'tag', installmentTotal: 12, installmentsCompleted: 1 };
    const investment = { ...common, name: 'Investimento', bankId: 'bank', initialValueInCents: 100, currentValueInCents: 100, cdiPercentageInBasisPoints: 10000 };
    const fixtures: Record<string, Record<string, unknown>> = {
      banks: { ...common, name: 'Outro banco', isActive: true }, expenses: movement, gains: movement,
      monthlyBalances: { ...common, bankId: 'bank', year: 2026, month: 10, valueInCents: -100 },
      tags: { ...common, name: 'Categoria', usageType: 'expense', isMandatoryExpense: true },
      mandatoryExpenses: recurring, mandatoryGains: recurring,
      financeInvestments: investment,
      investmentCdiRates: { ...common, annualRateInBasisPoints: 1300, effectiveFrom: now },
      financeInvestmentSyncs: { ...common, investmentId: 'valid-financeInvestments', bankId: 'bank', previousValueInCents: 100, syncedValueInCents: 100, deltaInCents: 0, date: now, reason: 'manual' },
    };
    for (const [collection, data] of Object.entries(fixtures)) {
      await assertSucceeds(setDoc(doc(firestore, collection, `valid-${collection}`), data));
      await assertFails(setDoc(doc(firestore, collection, 'unknown-field'), { ...data, injected: { admin: true } }));
      await assertFails(setDoc(doc(firestore, collection, 'group-spoof'), { ...data, groupId: 'victim' }));
      if (collection !== 'financeInvestmentSyncs') {
        await assertFails(updateDoc(doc(firestore, collection, `valid-${collection}`), { injected: true }));
        await assertFails(updateDoc(doc(firestore, collection, `valid-${collection}`), { personId: 'stranger' }));
      }
    }
    for (const collection of ['expenses', 'gains']) {
      for (const invalid of [{ date: '2026-10-11' }, { moneyFormat: 'yes' }, { tagId: 'private-tag' }, { bankId: 'private-bank' },
        { valueInCents: 0 }, { valueInCents: 1.5 }, { valueInCents: 1_000_000_000_001 }, { isBankTransfer: true }, { isInvestmentDeposit: true }, { name: '' }]) {
        await assertFails(setDoc(doc(firestore, collection, 'invalid'), { ...movement, ...invalid }));
      }
    }
    for (const collection of ['mandatoryExpenses', 'mandatoryGains']) {
      for (const invalid of [{ dueDay: 32 }, { reminderHour: 24 }, { reminderDaysBefore: 4 }, { installmentsCompleted: 13 },
        { installmentTotal: 0 }, { installmentTotalValueInCents: -1 }, { lastPaymentCycle: '2026-13' }, { tagId: 'private-tag' }]) {
        await assertFails(setDoc(doc(firestore, collection, 'invalid'), { ...recurring, ...invalid }));
      }
    }
    for (const invalid of [{ month: 0 }, { month: 13 }, { year: 1 }, { year: 2026.5 }]) {
      await assertFails(setDoc(doc(firestore, 'monthlyBalances', 'invalid'), { ...fixtures.monthlyBalances, ...invalid }));
    }
    for (const invalid of [{ initialValueInCents: -1 }, { currentValueInCents: -1 }, { lastManualSyncValueInCents: -1 },
      { currentValueInCents: '100' }, { assetType: 'other' }, { cdiPercentageInBasisPoints: -1 }, { redemptionTerm: 'invalid' }]) {
      await assertFails(setDoc(doc(firestore, 'financeInvestments', 'invalid'), { ...investment, ...invalid }));
    }
    await assertFails(setDoc(doc(firestore, 'financeInvestmentSyncs', 'invalid'), { ...fixtures.financeInvestmentSyncs, deltaInCents: 9 }));
    await assertFails(setDoc(doc(firestore, 'financeInvestmentSyncs', 'invalid'), { ...fixtures.financeInvestmentSyncs, syncedValueInCents: 200, deltaInCents: 110 }));
    await assertFails(setDoc(doc(firestore, 'financeInvestmentSyncs', 'invented-previous'), { ...fixtures.financeInvestmentSyncs, previousValueInCents: 90, deltaInCents: 10 }));
    await assertFails(setDoc(doc(firestore, 'financeInvestmentSyncs', 'wrong-bank'), { ...fixtures.financeInvestmentSyncs, bankId: 'private-bank' }));
    const sync = writeBatch(firestore);
    sync.update(doc(firestore, 'financeInvestments', 'valid-financeInvestments'), { currentValueInCents: 120 });
    sync.set(doc(firestore, 'financeInvestmentSyncs', 'atomic-sync'), { ...fixtures.financeInvestmentSyncs, previousValueInCents: 100, syncedValueInCents: 120, deltaInCents: 20 });
    await assertSucceeds(sync.commit());
    for (const collection of ['bankTransfers', 'cashRescues', 'investments']) {
      await assertFails(setDoc(doc(firestore, collection, 'direct-write'), movement));
    }
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'banks', 'historic'), { ...common, name: 'Histórico', historicalMetadata: 'preserved' });
      await setDoc(doc(db, 'expenses', 'special'), { ...movement, isBankTransfer: true });
    });
    await assertSucceeds(updateDoc(doc(firestore, 'banks', 'historic'), { name: 'Nome atualizado' }));
    await assertFails(updateDoc(doc(firestore, 'banks', 'historic'), { historicalMetadata: 'changed' }));
    await assertFails(updateDoc(doc(firestore, 'expenses', 'special'), { valueInCents: 200 }));
    await assertFails(deleteDoc(doc(firestore, 'expenses', 'special')));
    console.log('Legacy schemas: valid records, atomic opening balance, field injection, references, amounts, recurrence and compound movement protection passed.');
  } finally { await environment.cleanup(); }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
