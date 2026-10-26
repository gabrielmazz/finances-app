import { getMandatoryInstallmentValueInCents } from '@/utils/mandatoryInstallments';
const mockContext = jest.fn(), mockRead = jest.fn(), mockCreate = jest.fn(), mockUpdate = jest.fn(), mockMetadata = jest.fn(), mockSettle = jest.fn(), mockUndo = jest.fn();
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkRecurringReadFirebase', () => ({ readSparkRecurringPlansFirebase: (...args: unknown[]) => mockRead(...args) }));
jest.mock('@/functions/SparkRecurringFirebase', () => ({ createSparkRecurringPlanFirebase: (...args: unknown[]) => mockCreate(...args), updateSparkRecurringPlanFirebase: (...args: unknown[]) => mockUpdate(...args), settleSparkRecurringFirebase: (...args: unknown[]) => mockSettle(...args), undoSparkRecurringFirebase: (...args: unknown[]) => mockUndo(...args) }));
jest.mock('@/functions/SparkRecurringMetadataFirebase', () => ({ saveSparkRecurringMetadataFirebase: (...args: unknown[]) => mockMetadata(...args) }));
jest.mock('@/functions/SparkMovementFormFirebase', () => ({ sparkFormEffectiveAt: (date: Date) => require('firebase/firestore').Timestamp.fromDate(date) }));
jest.mock('@/functions/SparkRecurringReplanFirebase', () => ({ replanSparkRecurringFirebase: jest.fn(), undoSparkRecurringReplanFirebase: jest.fn() }));
import type { Firestore } from 'firebase/firestore';
import { submitSparkRecurringFormFirebase, submitSparkRecurringActionFirebase, type SparkRecurringDraft, type SparkRecurringFormState, type SparkRecurringActionState } from '@/functions/SparkRecurringFormFirebase';
const db = {} as Firestore, now = new Date('2026-10-23T15:00:00Z');
const draft = (): SparkRecurringDraft => ({ actorId: 'owner', recurringType: 'expense', planId: null, name: 'Aluguel', valueInCents: 10000, tagId: 'category', dueDay: 25, usesBusinessDays: false, description: null, reminderEnabled: false, reminderDaysBefore: 1, reminderOnDueDate: false, reminderHour: 19, reminderMinute: 0, installmentTotal: null, installmentTotalValueInCents: null, installmentsCompleted: 0, installmentStartDate: null, installmentEndDate: null });
let sequence = 0; const newId = () => `recurring_action_${++sequence}`;
beforeEach(() => {
  sequence = 0; jest.clearAllMocks(); mockContext.mockReset().mockResolvedValue({ groupId: 'group' });
  for (const fn of [mockCreate, mockUpdate, mockMetadata, mockSettle, mockUndo]) fn.mockReset().mockResolvedValue({ idempotent: false });
  mockRead.mockReset().mockResolvedValue([{ id: 'plan', actorId: 'owner', recurringType: 'expense', name: 'Aluguel', categoryId: 'category', valueInCents: 10000, revision: 2, installmentTotal: null, endCycle: null, cycleStates: [{ cycle: '2026-10', active: true, settlementOperationId: 'payment_123456', effectiveAt: now }] }]);
});
test('criar definição e metadados não registra pagamento nem altera saldo', async () => {
  const saved = await submitSparkRecurringFormFirebase(db, {}, draft(), newId, now);
  expect(saved).toMatchObject({ success: true }); expect(mockCreate).toHaveBeenCalledTimes(1); expect(mockMetadata).toHaveBeenCalledTimes(1); expect(mockSettle).not.toHaveBeenCalled(); expect(mockUndo).not.toHaveBeenCalled();
});
test('falha entre definição e metadados retoma receipts sem criar outro plano', async () => {
  const state: SparkRecurringFormState = {}; mockMetadata.mockRejectedValueOnce(Object.assign(new Error('Offline'), { code: 'unavailable' }));
  await expect(submitSparkRecurringFormFirebase(db, state, draft(), newId, now)).rejects.toThrow('Offline');
  const definition = state.intent!.definition, metadata = state.intent!.metadata;
  await expect(submitSparkRecurringFormFirebase(db, state, { ...draft(), name: 'Outro' }, newId, now)).rejects.toThrow('mesmos dados');
  await submitSparkRecurringFormFirebase(db, state, draft(), newId, now);
  expect(state.intent!.definition).toBe(definition); expect(state.intent!.metadata).toBe(metadata); expect(mockCreate).toHaveBeenCalledTimes(1); expect(mockMetadata).toHaveBeenCalledTimes(2); expect(state.intent!.status).toBe('confirmed');
});
test('pagamento incerto conserva revisão, ciclo, data e ID apesar de leituras posteriores diferentes', async () => {
  const state: SparkRecurringActionState = {}, makeId = jest.fn(newId);
  const input = { actorId: 'owner', planId: 'plan', recurringType: 'expense' as const, action: 'settle' as const, accountId: 'bank', selectedDate: now, amountInCents: 10000, installmentsCount: 1, note: null };
  mockSettle.mockRejectedValueOnce(Object.assign(new Error('Resposta perdida'), { code: 'unavailable' }));
  await expect(submitSparkRecurringActionFirebase(db, state, input, makeId, now)).rejects.toThrow('Resposta perdida');
  mockRead.mockResolvedValueOnce([]); await submitSparkRecurringActionFirebase(db, state, input, makeId, new Date(now.getTime() + 1000));
  expect(mockSettle.mock.calls[1][1]).toEqual(mockSettle.mock.calls[0][1]); expect(mockSettle.mock.calls[1][1]).toMatchObject({ cycle: '2026-10', expectedPlanRevision: 2, amountInCents: 10000, accountId: 'bank' }); expect(mockRead).toHaveBeenCalledTimes(1); expect(makeId).toHaveBeenCalledTimes(1);
});
test('desfazimento referencia a efetivação e preserva o instante original', async () => {
  await submitSparkRecurringActionFirebase(db, {}, { actorId: 'owner', planId: 'plan', recurringType: 'expense', action: 'reverse' }, newId, now);
  expect(mockUndo.mock.calls[0][1]).toMatchObject({ settlementOperationId: 'payment_123456', cycle: '2026-10', expectedPlanRevision: 2 }); expect(mockUndo.mock.calls[0][1].effectiveAt.toDate()).toEqual(now); expect(mockSettle).not.toHaveBeenCalled();
});
test('erro de contexto não escolhe legado nem inicia definição', async () => {
  mockContext.mockRejectedValueOnce(new Error('Sem contexto')); await expect(submitSparkRecurringFormFirebase(db, {}, draft(), newId, now)).rejects.toThrow('Sem contexto'); expect(mockCreate).not.toHaveBeenCalled();
});

test('receita recorrente cria definição sem crédito bancário antecipado', async () => {
  await submitSparkRecurringFormFirebase(db, {}, { ...draft(), recurringType: 'gain', name: 'Salário' }, newId, now);
  expect(mockCreate.mock.calls[0][1]).toMatchObject({ recurringType: 'gain', valueInCents: 10000 }); expect(mockSettle).not.toHaveBeenCalled(); expect(mockMetadata).toHaveBeenCalledTimes(1);
});
const gainPlan = () => ({ id: 'plan', actorId: 'owner', recurringType: 'gain', name: 'Parcelas recebidas', categoryId: 'category', valueInCents: 333, revision: 2, installmentTotal: 3, contractTotalInCents: 1000, installmentsCompleted: 2, endCycle: '2026-12', cycleStates: [{ cycle: '2026-10', active: true, settlementOperationId: 'receipt_123456', effectiveAt: now }] });
test('última parcela de receita conserva o resto contratual e o mesmo receipt no reenvio incerto', async () => {
  const plan = gainPlan(); mockRead.mockResolvedValue([plan]); const state: SparkRecurringActionState = {};
  const amount = getMandatoryInstallmentValueInCents({ installmentTotal: 3, installmentsCompleted: 2, installmentsToSettle: 1, installmentValueInCents: 333, installmentTotalValueInCents: 1000 });
  expect(amount).toBe(334);
  const input = { actorId: 'owner', planId: 'plan', recurringType: 'gain' as const, action: 'settle' as const, accountId: 'bank', selectedDate: now, amountInCents: amount!, installmentsCount: 1, note: null };
  mockSettle.mockRejectedValueOnce(Object.assign(new Error('Resposta perdida'), { code: 'unavailable' }));
  await expect(submitSparkRecurringActionFirebase(db, state, input, newId, now)).rejects.toThrow('Resposta perdida');
  mockRead.mockResolvedValueOnce([]); await submitSparkRecurringActionFirebase(db, state, input, newId, now);
  expect(mockSettle.mock.calls[1][1]).toEqual(mockSettle.mock.calls[0][1]); expect(mockSettle.mock.calls[1][1]).toMatchObject({ amountInCents: 334, installmentsCount: 1, expectedPlanRevision: 2 }); expect(mockRead).toHaveBeenCalledTimes(1);
});
test('receita finita recusa quitação negociada antes de enviar ao escritor', async () => {
  mockRead.mockResolvedValue([gainPlan()]); await expect(submitSparkRecurringActionFirebase(db, {}, { actorId: 'owner', planId: 'plan', recurringType: 'gain', action: 'settle', accountId: 'bank', selectedDate: now, amountInCents: 300, installmentsCount: 1, note: 'Desconto', settlementMode: 'negotiated' }, newId, now)).rejects.toThrow('despesa parcelada'); expect(mockSettle).not.toHaveBeenCalled();
});
test('desfazimento da receita referencia seu recebimento e a data original', async () => {
  mockRead.mockResolvedValue([gainPlan()]); await submitSparkRecurringActionFirebase(db, {}, { actorId: 'owner', planId: 'plan', recurringType: 'gain', action: 'reverse' }, newId, now);
  expect(mockUndo.mock.calls[0][1]).toMatchObject({ settlementOperationId: 'receipt_123456', cycle: '2026-10', expectedPlanRevision: 2 }); expect(mockUndo.mock.calls[0][1].effectiveAt.toDate()).toEqual(now); expect(mockCreate).not.toHaveBeenCalled();
});
