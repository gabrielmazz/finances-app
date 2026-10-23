const mockContext = jest.fn(), mockPlans = jest.fn(), mockSettle = jest.fn(), mockTransfer = jest.fn(), mockAccount = jest.fn();
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkRecurringReadFirebase', () => ({ readSparkRecurringPlansFirebase: (...args: unknown[]) => mockPlans(...args) }));
jest.mock('@/functions/SparkRecurringFirebase', () => ({ settleSparkRecurringFirebase: (...args: unknown[]) => mockSettle(...args) }));
jest.mock('@/functions/SparkTransferFirebase', () => ({ transferSparkDatedFundsFirebase: (...args: unknown[]) => mockTransfer(...args) }));
jest.mock('@/functions/SparkAccountReadFirebase', () => ({ readSparkAccountFirebase: (...args: unknown[]) => mockAccount(...args) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'owner' } }) }));
import type { Firestore } from 'firebase/firestore';
import { submitSparkRecurringActionFirebase, type SparkRecurringActionDraft } from '@/functions/SparkRecurringFormFirebase';
import { submitSparkInvestmentFormFirebase, type SparkInvestmentFormDraft } from '@/functions/SparkInvestmentFormFirebase';
import { toFinancialCivilDate } from '@/utils/financialCivilDate';

const firestore = {} as Firestore, now = new Date('2026-10-31T21:30:00Z');
beforeEach(() => {
  jest.clearAllMocks();
  mockPlans.mockResolvedValue([{ id: 'plan', recurringType: 'expense', installmentTotal: null, revision: 0 }]);
  mockAccount.mockResolvedValue({ position: { kind: 'investment', revision: 1, balanceInCents: 10000 } });
});
function delayedContext() {
  let resolve!: (value: unknown) => void;
  mockContext.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  return () => resolve({ actorId: 'owner', groupId: 'group', role: 'admin' });
}
const day = (instant: Date) => { const date = toFinancialCivilDate(instant); return [date.getFullYear(), date.getMonth() + 1, date.getDate()]; };

test('data do pagamento é capturada antes da leitura de contexto e não muda por referência compartilhada', async () => {
  const resolve = delayedContext();
  const draft: SparkRecurringActionDraft = { actorId: 'owner', action: 'settle', recurringType: 'expense', planId: 'plan',
    selectedDate: new Date(2026, 9, 30), amountInCents: 100, installmentsCount: 1, accountId: 'bank', note: null };
  const pending = submitSparkRecurringActionFirebase(firestore, {}, draft, () => 'payment_123456', now);
  draft.selectedDate.setDate(1); resolve(); await pending;
  expect(day(mockSettle.mock.calls[0][1].effectiveAt.toDate())).toEqual([2026, 10, 30]);
});

test('data do aporte é capturada antes da leitura de contexto e conservada no par financeiro', async () => {
  const resolve = delayedContext();
  const draft: SparkInvestmentFormDraft = { actorId: 'owner', action: 'move', accountId: 'investment', bankId: 'bank',
    selectedDate: new Date(2026, 9, 30), movement: 'deposit', amountInCents: 100 };
  const pending = submitSparkInvestmentFormFirebase(firestore, {}, draft, () => 'investment_123456', now);
  draft.selectedDate.setDate(1); resolve(); await pending;
  expect(day(mockTransfer.mock.calls[0][1].effectiveAt.toDate())).toEqual([2026, 10, 30]);
});
