const mockContext = jest.fn(), mockTransfer = jest.fn(), mockCommit = jest.fn();
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkTransferFirebase', () => ({ transferSparkDatedFundsFirebase: (...args: unknown[]) => mockTransfer(...args), transferSparkFundsFirebase: (...args: unknown[]) => mockCommit(...args) }));
import type { Firestore } from 'firebase/firestore';
import { submitSparkPairFormFirebase, type SparkPairFormDraft, type SparkPairFormState } from '@/functions/SparkPairFormFirebase';
import { fromFinancialCivilDate } from '@/utils/financialCivilDate';

const db = {} as Firestore, now = new Date('2026-10-20T18:15:12.123Z');
const draft = (): SparkPairFormDraft => ({ actorId: 'owner', mode: 'transfer', fromAccountId: 'bank-a', toAccountId: 'bank-b',
  amountInCents: 1234, selectedDate: new Date(2026, 9, 18), note: ' Entre contas ' });
beforeEach(() => { jest.clearAllMocks(); mockContext.mockReset().mockResolvedValue({ groupId: 'group', actorId: 'owner', role: 'admin' }); mockTransfer.mockReset().mockResolvedValue({ idempotent: false }); mockCommit.mockReset().mockResolvedValue({ idempotent: false }); });

test('contexto legado confirmado retorna false; falha de contexto nunca autoriza fallback', async () => {
  mockContext.mockResolvedValueOnce(null); expect(await submitSparkPairFormFirebase(db, {}, draft(), () => 'action_123456', now)).toBe(false);
  mockContext.mockRejectedValueOnce(new Error('protocolo indisponível'));
  await expect(submitSparkPairFormFirebase(db, {}, draft(), () => 'action_123456', now)).rejects.toThrow('protocolo indisponível');
  expect(mockTransfer).not.toHaveBeenCalled();
});
test('par datado conserva dia civil de São Paulo e material inteiro em centavos', async () => {
  await submitSparkPairFormFirebase(db, {}, draft(), () => 'action_123456', now);
  const command = mockTransfer.mock.calls[0][1];
  expect(command).toMatchObject({ groupId: 'group', actorId: 'owner', clientActionId: 'action_123456', fromAccountId: 'bank-a', toAccountId: 'bank-b', amountInCents: 1234, note: 'Entre contas' });
  expect(command.effectiveAt.toMillis()).toBe(fromFinancialCivilDate(new Date(2026, 9, 18, 15, 15, 12, 123)).getTime());
});
test('saque aponta sempre ao Caixa canônico e não aceita banco de destino substituto', async () => {
  await submitSparkPairFormFirebase(db, {}, { ...draft(), mode: 'withdrawal', toAccountId: undefined }, () => 'action_123456', now);
  expect(mockTransfer.mock.calls[0][1].toAccountId).toBe('cash');
  await expect(submitSparkPairFormFirebase(db, {}, { ...draft(), mode: 'withdrawal' }, () => 'other_123456', now)).rejects.toThrow('contas bancárias');
});
test('resultado incerto preserva ID, nanossegundos e campos; alterações não geram outro débito', async () => {
  const state: SparkPairFormState = {}, makeId = jest.fn(() => 'action_123456');
  mockTransfer.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
  await expect(submitSparkPairFormFirebase(db, state, draft(), makeId, now)).rejects.toThrow('offline');
  const original = state.intent!.command;
  await expect(submitSparkPairFormFirebase(db, state, { ...draft(), amountInCents: 2000 }, makeId, now)).rejects.toThrow('mesmos dados');
  await submitSparkPairFormFirebase(db, state, draft(), makeId, new Date(now.getTime() + 86400000));
  expect(makeId).toHaveBeenCalledTimes(1); expect(mockTransfer.mock.calls[1][1]).toEqual(original); expect(state.intent!.status).toBe('confirmed');
});

test('par cancelado exige outra identificação e não prende o formulário no reenvio incerto', async () => {
  const state: SparkPairFormState = {};
  mockTransfer.mockRejectedValueOnce(Object.assign(new Error('Envio cancelado'), { code: 'permission-denied', sparkIntentCancelled: true }));
  await expect(submitSparkPairFormFirebase(db, state, draft(), () => 'cancelled_123456', now)).rejects.toThrow('cancelado');
  expect(state.intent).toBeUndefined();
  await submitSparkPairFormFirebase(db, state, draft(), () => 'fresh_123456', now);
  expect(mockTransfer.mock.calls[1][1].clientActionId).toBe('fresh_123456');
});
test('argumentos e data são capturados antes da leitura assíncrona de contexto', async () => {
  let resolve!: (context: unknown) => void;
  mockContext.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const input = draft(), pending = submitSparkPairFormFirebase(db, {}, input, () => 'action_123456', now);
  input.amountInCents = 9999; input.fromAccountId = 'other'; input.selectedDate.setDate(1);
  resolve({ groupId: 'group', actorId: 'owner', role: 'admin' }); await pending;
  expect(mockTransfer.mock.calls[0][1]).toMatchObject({ fromAccountId: 'bank-a', amountInCents: 1234 });
  expect(mockTransfer.mock.calls[0][1].effectiveAt.toDate().toISOString()).toBe('2026-10-18T18:15:12.123Z');
});
test('contexto desaparecido após preparar uma intenção é erro, inclusive no replay confirmado', async () => {
  const state: SparkPairFormState = {};
  await submitSparkPairFormFirebase(db, state, draft(), () => 'action_123456', now);
  mockContext.mockResolvedValueOnce(null);
  await expect(submitSparkPairFormFirebase(db, state, draft(), () => 'action_123456', now)).rejects.toThrow('contexto financeiro mudou');
  expect(mockTransfer).toHaveBeenCalledTimes(1);
});
test('hoje usa o commit do servidor, sem data futura fabricada pelo relógio do navegador', async () => {
  const state: SparkPairFormState = {};
  await submitSparkPairFormFirebase(db, state, { ...draft(), selectedDate: new Date(2026, 9, 20) }, () => 'action_123456', now);
  expect(mockCommit).toHaveBeenCalledTimes(1); expect(mockTransfer).not.toHaveBeenCalled();
  expect(state.intent!.command).not.toHaveProperty('effectiveAt'); expect(state.intent!.selectedDay).toBe('2026-10-20');
});
test('data futura é recusada antes de enviar qualquer par', async () => {
  await expect(submitSparkPairFormFirebase(db, {}, { ...draft(), selectedDate: new Date(2026, 9, 21) }, () => 'action_123456', now)).rejects.toThrow('futura');
  expect(mockCommit).not.toHaveBeenCalled(); expect(mockTransfer).not.toHaveBeenCalled();
});
