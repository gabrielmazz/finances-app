import { sparkRecurringFormRecord } from '@/functions/SparkRecurringFormFirebase';
import { isSparkRecurringCycleCurrent, parseSparkRecurringReadModel } from '@/utils/sparkRecurringReadModel';

test('campos civis do contrato não avançam o último dia nem perdem o pagamento na virada de mês', () => {
  const plan = parseSparkRecurringReadModel('contract', { schemaVersion: 1, actorId: 'owner', recurringType: 'expense', name: 'Contrato',
    categoryId: null, startCycle: '2026-10', endCycle: '2026-12', historyFromCycle: '2026-10', valueInCents: 333,
    installmentTotal: 3, contractTotalInCents: 1000, installmentsCompleted: 1, revision: 1, active: true }, undefined, ['2026-10'],
  { fromCycle: '2026-10', throughCycle: '2028-10' });
  plan.cycleStates = [{ cycle: '2026-10', active: true, settlementOperationId: 'settlement_123456', accountId: 'bank',
    amountInCents: 333, installmentsCount: 1, installmentsBefore: 0, installmentsAfter: 1, effectiveAt: new Date('2026-11-01T02:15:00Z') }];
  const record = sparkRecurringFormRecord(plan, new Date('2026-11-01T02:30:00Z'));
  const fields = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  expect(fields(record.installmentStartDate)).toEqual([2026, 10, 1]);
  expect(fields(record.installmentEndDate)).toEqual([2026, 12, 31]);
  expect(record.hasLinkedPaymentExpense).toBe(true);
  expect(isSparkRecurringCycleCurrent(record.lastPaymentCycle, new Date('2026-11-01T02:30:00Z'))).toBe(true);
  expect(isSparkRecurringCycleCurrent('2026-11', new Date('2026-11-01T02:30:00Z'))).toBe(false);
  expect(fields(record.lastPaymentDate)).toEqual([2026, 10, 31]);
});
