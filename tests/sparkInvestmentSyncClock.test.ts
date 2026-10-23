const mockAccount = jest.fn(), mockPrepare = jest.fn(), mockSync = jest.fn();
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'owner' } }) }));
jest.mock('firebase/firestore', () => ({ ...jest.requireActual('firebase/firestore'), doc: () => ({}), getDocFromServer: async () => ({ exists: () => false }) }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: async () => ({ actorId: 'owner', groupId: 'group', role: 'admin' }) }));
jest.mock('@/functions/SparkAccountReadFirebase', () => ({ readSparkAccountFirebase: (...args: unknown[]) => mockAccount(...args) }));
jest.mock('@/functions/SparkInvestmentFirebase', () => ({ prepareSparkInvestmentSyncFirebase: (...args: unknown[]) => mockPrepare(...args),
  synchronizeSparkInvestmentFirebase: (...args: unknown[]) => mockSync(...args) }));
import { Timestamp, type Firestore } from 'firebase/firestore';
import { submitSparkInvestmentFormFirebase, type SparkInvestmentFormState } from '@/functions/SparkInvestmentFormFirebase';
import { sparkFormEffectiveAt } from '@/functions/SparkMovementFormFirebase';
import { toFinancialCivilDate } from '@/utils/financialCivilDate';
const now = new Date('2026-10-22T15:00:00.000Z'), reference = new Timestamp(Math.floor(now.getTime() / 1000), 900123000);
beforeEach(() => {
  jest.clearAllMocks(); mockPrepare.mockResolvedValue({ phase: 'done' }); mockSync.mockResolvedValue({ idempotent: false });
  mockAccount.mockResolvedValue({ position: { kind: 'investment', revision: 3, balanceInCents: 17000 }, reference: { effectiveAt: reference } });
});
test('sincronização de hoje conserva referência confirmada à frente do relógio cliente, com nanossegundos', async () => {
  const state: SparkInvestmentFormState = {};
  const result = await submitSparkInvestmentFormFirebase({} as Firestore, state, { actorId: 'owner', action: 'sync', accountId: 'asset',
    observedValueInCents: 18000, selectedDate: toFinancialCivilDate(now), reason: 'manual' }, () => 'clock_sync_123456', now);
  expect(result?.success).toBe(true); expect(mockPrepare.mock.calls[0][1].observedAt.isEqual(reference)).toBe(true);
  expect(mockSync.mock.calls[0][1].observedAt.isEqual(reference)).toBe(true);
});
test('sincronização retroativa conserva a data escolhida apesar de uma referência posterior', async () => {
  const selected = new Date(2026, 9, 21);
  await submitSparkInvestmentFormFirebase({} as Firestore, {}, { actorId: 'owner', action: 'sync', accountId: 'asset',
    observedValueInCents: 18000, selectedDate: selected, reason: 'manual' }, () => 'dated_sync_123456', now);
  expect(mockSync.mock.calls[0][1].observedAt.isEqual(sparkFormEffectiveAt(selected, now))).toBe(true);
});
