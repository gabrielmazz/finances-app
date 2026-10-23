const mockPrincipal = jest.fn(), mockCatalog = jest.fn(), mockReadAccount = jest.fn(), mockDefinition = jest.fn(), mockMetadata = jest.fn();
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'owner' } }) }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: async () => ({ actorId: 'owner', groupId: 'group', role: 'admin' }) }));
jest.mock('@/functions/SparkInvestmentPrincipalFirebase', () => ({ updateSparkInvestmentPrincipalFirebase: (...args: unknown[]) => mockPrincipal(...args) }));
jest.mock('@/functions/SparkAccountCatalogFirebase', () => ({ saveSparkAccountCatalogFirebase: (...args: unknown[]) => mockCatalog(...args) }));
jest.mock('@/functions/SparkAccountReadFirebase', () => ({ readSparkAccountFirebase: (...args: unknown[]) => mockReadAccount(...args) }));
jest.mock('@/functions/SparkRecurringFirebase', () => ({ createSparkRecurringPlanFirebase: (...args: unknown[]) => mockDefinition(...args) }));
jest.mock('@/functions/SparkRecurringMetadataFirebase', () => ({ saveSparkRecurringMetadataFirebase: (...args: unknown[]) => mockMetadata(...args) }));
import type { Firestore } from 'firebase/firestore';
import { submitSparkInvestmentFormFirebase, type SparkInvestmentFormState } from '@/functions/SparkInvestmentFormFirebase';
import { submitSparkRecurringFormFirebase, type SparkRecurringDraft, type SparkRecurringFormState } from '@/functions/SparkRecurringFormFirebase';

const firestore = {} as Firestore, cancelled = () => Object.assign(new Error('Envio cancelado'), { code: 'permission-denied', sparkIntentCancelled: true });
let sequence = 0;
const newId = () => `partial_action_${++sequence}_123456`;
beforeEach(() => {
  jest.clearAllMocks(); sequence = 0;
  mockPrincipal.mockReset().mockResolvedValue({ idempotent: false }); mockCatalog.mockReset().mockResolvedValue({ idempotent: false });
  mockDefinition.mockReset().mockResolvedValue({ idempotent: false }); mockMetadata.mockReset().mockResolvedValue({ idempotent: false });
  mockReadAccount.mockReset().mockImplementation(async (_db, _actor, _group, accountId) => accountId === 'bank'
    ? { position: { kind: 'bank', revision: 2 } }
    : { position: { kind: 'investment', revision: 5, balanceInCents: 1000 }, catalogRevision: 1,
      principal: { fundingAccountId: 'bank', openingOperationId: 'opening_123456', revision: 1, lastOperationId: 'principal_123456', initialValueInCents: 1000 },
      catalog: { name: 'Reserva', colorHex: null, iconKey: null, bankAccountId: 'bank', assetType: 'fixed_income', valuationMethod: 'manual',
        cdiPercentageInBasisPoints: null, redemptionTerm: 'anytime', description: null } });
});
test('catálogo cancelado renova somente a etapa descritiva, preservando principal confirmado', async () => {
  const state: SparkInvestmentFormState = {}, draft = { actorId: 'owner', action: 'edit' as const, accountId: 'investment', principalInCents: 2000,
    name: 'Reserva', bankId: 'bank', cdiPercentageInBasisPoints: 10000, redemptionTerm: 'anytime', description: null };
  mockCatalog.mockRejectedValueOnce(cancelled());
  await expect(submitSparkInvestmentFormFirebase(firestore, state, draft, newId)).rejects.toThrow('cancelado');
  expect(state.intent).toMatchObject({ financialConfirmed: true, status: 'uncertain' });
  const renewedId = state.intent!.catalog!.clientActionId;
  expect(renewedId).not.toBe(mockCatalog.mock.calls[0][1].clientActionId);
  await expect(submitSparkInvestmentFormFirebase(firestore, state, { ...draft, principalInCents: 3000 }, newId)).rejects.toThrow('mesmos dados');
  await submitSparkInvestmentFormFirebase(firestore, state, draft, newId);
  expect(mockPrincipal).toHaveBeenCalledTimes(1); expect(mockCatalog).toHaveBeenCalledTimes(2);
  expect(mockCatalog.mock.calls[1][1].clientActionId).toBe(renewedId); expect(state.intent!.status).toBe('confirmed');
});
test('configuração cancelada renova somente metadados, preservando contrato já criado', async () => {
  const state: SparkRecurringFormState = {}, draft: SparkRecurringDraft = { actorId: 'owner', recurringType: 'expense', planId: null,
    name: 'Aluguel', valueInCents: 10000, tagId: '', dueDay: 10, usesBusinessDays: false, description: null,
    reminderEnabled: false, reminderDaysBefore: 0, reminderOnDueDate: true, reminderHour: 9, reminderMinute: 0,
    installmentTotal: null, installmentTotalValueInCents: null, installmentsCompleted: 0, installmentStartDate: null, installmentEndDate: null };
  mockMetadata.mockRejectedValueOnce(cancelled());
  await expect(submitSparkRecurringFormFirebase(firestore, state, draft, newId)).rejects.toThrow('cancelado');
  expect(state.intent).toMatchObject({ definitionConfirmed: true, status: 'uncertain' });
  const renewedId = state.intent!.metadata.clientActionId;
  expect(renewedId).not.toBe(mockMetadata.mock.calls[0][1].clientActionId);
  await submitSparkRecurringFormFirebase(firestore, state, draft, newId);
  expect(mockDefinition).toHaveBeenCalledTimes(1); expect(mockMetadata).toHaveBeenCalledTimes(2);
  expect(mockMetadata.mock.calls[1][1].clientActionId).toBe(renewedId); expect(state.intent!.status).toBe('confirmed');
});
