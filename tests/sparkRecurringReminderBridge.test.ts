const mockExpenses = jest.fn(), mockGains = jest.fn(), mockExpenseSync = jest.fn(), mockGainSync = jest.fn(), mockActivate = jest.fn();
jest.mock('@/functions/MandatoryExpenseFirebase', () => ({ getMandatoryExpensesWithRelationsFirebase: (...args: unknown[]) => mockExpenses(...args) }));
jest.mock('@/functions/MandatoryGainFirebase', () => ({ getMandatoryGainsWithRelationsFirebase: (...args: unknown[]) => mockGains(...args) }));
jest.mock('@/utils/mandatoryExpenseNotifications', () => ({ syncMandatoryExpenseNotifications: (...args: unknown[]) => mockExpenseSync(...args) }));
jest.mock('@/utils/mandatoryGainNotifications', () => ({ syncMandatoryGainNotifications: (...args: unknown[]) => mockGainSync(...args) }));
jest.mock('@/utils/mandatoryReminderNotifications', () => ({ setActiveMandatoryReminderAccount: (...args: unknown[]) => mockActivate(...args) }));
import { buildMandatoryExpenseReminderSyncItems, buildMandatoryGainReminderSyncItems, synchronizeMandatoryReminderAccount } from '@/utils/mandatoryReminderAccountSync';
import { normalizeMandatoryReminderDaysBefore } from '@/utils/mandatoryReminderConfig';
import { resolveMandatoryInstallmentsCompleted } from '@/utils/mandatoryInstallments';
const plan = { id: 'spark-plan', sparkPlan: true, name: 'Contrato', dueDay: 25, usesBusinessDays: false, reminderConfigVersion: 1,
  reminderEnabled: true, reminderDaysBefore: 0, reminderOnDueDate: true, reminderHour: 19, reminderMinute: 30,
  installmentTotal: 12, installmentsCompleted: 2, installmentStartDate: new Date(2026, 0, 1), installmentEndDate: new Date(2026, 11, 31),
  lastPaymentCycle: '2026-10', lastReceiptCycle: '2026-10' };
beforeEach(() => {
  jest.clearAllMocks(); mockExpenses.mockResolvedValue({ success: true, data: [plan] }); mockGains.mockResolvedValue({ success: true, data: [] });
  mockExpenseSync.mockResolvedValue({ failed: 0 }); mockGainSync.mockResolvedValue({ failed: 0 });
});
test('D0 é preservado nas duas famílias, sem criar um aviso antecipado adicional', () => {
  expect(normalizeMandatoryReminderDaysBefore(0)).toBe(0); expect(normalizeMandatoryReminderDaysBefore('0')).toBe(0);
  expect(normalizeMandatoryReminderDaysBefore(null)).toBe(1);
  expect(buildMandatoryExpenseReminderSyncItems([plan])[0]).toMatchObject({ reminderDaysBefore: 0, reminderOnDueDate: true, lastCompletedCycle: '2026-10' });
  expect(buildMandatoryGainReminderSyncItems([plan])[0]).toMatchObject({ reminderDaysBefore: 0, reminderOnDueDate: true, lastCompletedCycle: '2026-10' });
});
test('contador Spark fica explícito mesmo depois de vários meses sem pagamento', () => {
  const input = { storedCompleted: 2, installmentTotal: 12, startDate: new Date(2026, 0, 1), isCurrentCycleCompleted: false, referenceDate: new Date(2026, 9, 21) };
  expect(resolveMandatoryInstallmentsCompleted({ ...input, explicitCompletion: true })).toBe(2);
  expect(resolveMandatoryInstallmentsCompleted(input)).toBe(9);
});
test('retorno ao app reconcilia agendas com os leitores selecionados, inclusive lista arquivada vazia', async () => {
  expect(await synchronizeMandatoryReminderAccount('owner')).toEqual({ complete: true, cancelled: false });
  expect(mockExpenses).toHaveBeenCalledWith('owner'); expect(mockGains).toHaveBeenCalledWith('owner');
  expect(mockExpenseSync).toHaveBeenCalledWith('owner', [expect.objectContaining({ id: 'spark-plan', reminderEnabled: true })]);
  mockExpenses.mockResolvedValueOnce({ success: true, data: [] }); await synchronizeMandatoryReminderAccount('owner');
  expect(mockExpenseSync).toHaveBeenLastCalledWith('owner', []);
});
test('falha de leitura não vira lista vazia nem cancela lembretes válidos; troca de sessão interrompe', async () => {
  mockExpenses.mockResolvedValueOnce({ success: false });
  expect((await synchronizeMandatoryReminderAccount('owner')).complete).toBe(false); expect(mockExpenseSync).not.toHaveBeenCalled();
  mockGainSync.mockClear();
  expect(await synchronizeMandatoryReminderAccount('owner', () => false)).toEqual({ complete: false, cancelled: true });
  expect(mockGainSync).not.toHaveBeenCalled();
});
