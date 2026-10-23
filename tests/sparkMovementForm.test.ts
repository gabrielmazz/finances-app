const mockContext = jest.fn(), mockExecute = jest.fn(), mockReadTarget = jest.fn();
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkMovementCommandFirebase', () => ({ executeSparkMovementCommandFirebase: (...args: unknown[]) => mockExecute(...args) }));
jest.mock('@/functions/SparkOrdinaryReadFirebase', () => ({ readSparkOrdinaryForEditFirebase: (...args: unknown[]) => mockReadTarget(...args) }));
import { Timestamp, type Firestore } from 'firebase/firestore';
import { beginNextSparkMovementFormIntent, sparkFormEffectiveAt, submitSparkMovementFormFirebase, type SparkMovementFormDraft, type SparkMovementFormState } from '@/functions/SparkMovementFormFirebase';

const db = {} as Firestore;
const now = new Date('2026-10-19T15:42:31.457Z');
const draft = (): SparkMovementFormDraft => ({ actorId: 'owner', movementKind: 'expense', name: 'Mercado', amountInCents: 1200,
  selectedDate: new Date(2026, 9, 18), bankId: 'bank', moneyFormat: false, categoryId: 'category', explanation: null,
  paymentFormats: ['Pix'], isEditing: false, specialSource: false });
const original = { groupId: 'group', readerActorId: 'owner', reference: { source: 'live' as const, operationId: 'original_123456', family: 'ordinary' as const },
  expectedFingerprint: 'confirmed-original', movementKind: 'expense' as const, accountId: 'bank', amountInCents: 1000,
  effectiveAt: new Timestamp(Timestamp.fromDate(new Date('2026-10-18T03:00:00Z')).seconds, 123456789), categoryId: 'category',
  details: { name: 'Mercado', explanation: null, paymentFormats: [], moneyFormat: false }, personId: 'owner' };
beforeEach(() => { jest.clearAllMocks(); mockContext.mockResolvedValue({ groupId: 'group', actorId: 'owner', role: 'member' }); mockExecute.mockResolvedValue({ idempotent: false }); });

test('confirmação conserva uma única identidade e data, inclusive em novo clique com relógio avançado', async () => {
  const state: SparkMovementFormState = {}, id = jest.fn(() => 'form_123456');
  expect(await submitSparkMovementFormFirebase(db, state, draft(), id, now)).toBe(true);
  expect(await submitSparkMovementFormFirebase(db, state, draft(), id, new Date('2026-10-20T15:00Z'))).toBe(true);
  expect(mockExecute).toHaveBeenCalledTimes(1); expect(id).toHaveBeenCalledTimes(1);
  expect(state.intent?.command.effectiveAt.toDate().toISOString()).toBe('2026-10-18T15:42:31.457Z');
});

test('resposta incerta bloqueia mudança dos campos e permite recuperar somente o mesmo comando', async () => {
  const state: SparkMovementFormState = {}, id = jest.fn(() => 'uncertain_123456');
  mockExecute.mockRejectedValueOnce(Object.assign(new Error('rede indisponível'), { code: 'unavailable' }));
  await expect(submitSparkMovementFormFirebase(db, state, draft(), id, now)).rejects.toThrow(/rede/);
  const first = state.intent!.command;
  await expect(submitSparkMovementFormFirebase(db, state, { ...draft(), amountInCents: 1300 }, id, now)).rejects.toThrow(/mesmos dados/);
  expect(await submitSparkMovementFormFirebase(db, state, draft(), id, new Date('2026-10-20T15:00Z'))).toBe(true);
  expect(mockExecute.mock.calls[1][1]).toBe(first); expect(id).toHaveBeenCalledTimes(1);
});

test('falha definida permite corrigir os campos, sem converter banco ausente em Caixa', async () => {
  const state: SparkMovementFormState = {}, id = jest.fn().mockReturnValueOnce('first_123456').mockReturnValueOnce('changed_123456');
  mockExecute.mockRejectedValueOnce(new Error('Saldo insuficiente.'));
  await expect(submitSparkMovementFormFirebase(db, state, draft(), id, now)).rejects.toThrow(/Saldo/);
  await submitSparkMovementFormFirebase(db, state, { ...draft(), amountInCents: 100 }, id, now);
  expect(state.intent!.command.clientActionId).toBe('changed_123456');
  await expect(submitSparkMovementFormFirebase(db, {}, { ...draft(), bankId: null }, id, now)).rejects.toThrow(/banco/);
  await expect(submitSparkMovementFormFirebase(db, {}, { ...draft(), bankId: 'cash' }, id, now)).rejects.toThrow(/banco/);
});

test('Caixa explícito usa a conta canônica e conserva os formatos', async () => {
  await submitSparkMovementFormFirebase(db, {}, { ...draft(), bankId: null, moneyFormat: true }, () => 'cash_123456', now);
  expect(mockExecute.mock.calls[0][1]).toMatchObject({ accountId: 'cash', details: { moneyFormat: true, paymentFormats: ['Pix'] } });
});

test('edição do mesmo dia conserva instante e nanossegundos, sem gerar novo horário de envio', async () => {
  const state: SparkMovementFormState = { target: original, entryReference: original.reference };
  await submitSparkMovementFormFirebase(db, state, { ...draft(), isEditing: true, editingReference: original.reference }, () => 'edit_123456', now);
  expect(state.intent!.command.effectiveAt.isEqual(original.effectiveAt)).toBe(true);
  expect(state.intent!.command).toMatchObject({ action: 'correct', expectedFingerprint: 'confirmed-original', target: original.reference });
});

test('segunda edição intencional usa o substituto confirmado, enquanto repetir os mesmos campos não grava novamente', async () => {
  const state: SparkMovementFormState = { target: original, entryReference: original.reference };
  const fields = { ...draft(), isEditing: true, editingReference: original.reference };
  await submitSparkMovementFormFirebase(db, state, fields, () => 'edit_123456', now);
  await submitSparkMovementFormFirebase(db, state, fields, () => 'unused_123456', now);
  mockReadTarget.mockResolvedValueOnce({ ...original, expectedFingerprint: 'replacement-fingerprint',
    reference: { ...original.reference, operationId: 'edit_123456' } });
  await submitSparkMovementFormFirebase(db, state, { ...fields, amountInCents: 1500 }, () => 'second_edit_123456', now);
  expect(mockExecute).toHaveBeenCalledTimes(2);
  expect(mockExecute.mock.calls[1][1]).toMatchObject({ target: { operationId: 'edit_123456' }, expectedFingerprint: 'replacement-fingerprint' });
});

test('mesmo ID em outra fonte, alvo não carregado ou ator diferente não permitem edição', async () => {
  const state: SparkMovementFormState = { target: original, entryReference: original.reference };
  for (const input of [
    { ...draft(), isEditing: true },
    { ...draft(), isEditing: true, editingReference: { ...original.reference, source: 'imported' as const } },
    { ...draft(), actorId: 'other', isEditing: true, editingReference: original.reference },
  ]) await expect(submitSparkMovementFormFirebase(db, state, input, () => 'unused_123456', now)).rejects.toThrow(/Carregue/);
  expect(mockExecute).not.toHaveBeenCalled();
});

test('contexto legado preserva o fluxo anterior, mas queda de contexto Spark não autoriza fallback', async () => {
  mockContext.mockResolvedValue(null);
  expect(await submitSparkMovementFormFirebase(db, {}, { ...draft(), name: 'x'.repeat(200) }, () => 'unused_123456', now)).toBe(false);
  await expect(submitSparkMovementFormFirebase(db, { target: original }, draft(), () => 'unused_123456', now)).rejects.toThrow(/contexto/);
  expect(mockExecute).not.toHaveBeenCalled();
});

test('fontes especiais são recusadas antes de lançar qualquer valor', async () => {
  await expect(submitSparkMovementFormFirebase(db, {}, { ...draft(), specialSource: true }, () => 'unused_123456', now)).rejects.toThrow(/Nenhum valor/);
  expect(mockExecute).not.toHaveBeenCalled();
});

test('campos capturados antes da espera do grupo não mudam durante o envio', async () => {
  let resume!: (value: unknown) => void; mockContext.mockReturnValueOnce(new Promise(resolve => { resume = resolve; }));
  const input = draft(); const result = submitSparkMovementFormFirebase(db, {}, input, () => 'snapshot_123456', now);
  input.name = 'Outro'; input.paymentFormats!.push('Outro'); input.selectedDate.setDate(5);
  resume({ groupId: 'group', actorId: 'owner', role: 'member' }); await result;
  expect(mockExecute.mock.calls[0][1]).toMatchObject({ details: { name: 'Mercado', paymentFormats: ['Pix'] } });
  expect(mockExecute.mock.calls[0][1].effectiveAt.toDate().toISOString()).toBe('2026-10-18T15:42:31.457Z');
});

test('mudança do dia usa calendário de São Paulo em qualquer fuso e data inválida é recusada', () => {
  expect(sparkFormEffectiveAt(new Date(2026, 9, 17), now, original.effectiveAt).toDate().toISOString()).toBe('2026-10-17T15:42:31.457Z');
  expect(() => sparkFormEffectiveAt(new Date('invalid'), now)).toThrow(/Data/);
});

test('novo envio explícito após sucesso permite lançamento idêntico, mas não libera uma intenção incerta', async () => {
  let state: SparkMovementFormState = {};
  await submitSparkMovementFormFirebase(db, state, draft(), () => 'first_123456', now);
  state = beginNextSparkMovementFormIntent(state);
  await submitSparkMovementFormFirebase(db, state, draft(), () => 'second_123456', now);
  expect(mockExecute).toHaveBeenCalledTimes(2); expect(state.intent!.command.clientActionId).toBe('second_123456');
  state.intent!.status = 'uncertain'; expect(beginNextSparkMovementFormIntent(state)).toBe(state);
});

test('cancelamento confirmado libera o formulário com outra identidade sem reutilizar o envio cancelado', async () => {
  const state: SparkMovementFormState = {};
  mockExecute.mockRejectedValueOnce(Object.assign(new Error('Envio cancelado'), { code: 'permission-denied', sparkIntentCancelled: true }));
  await expect(submitSparkMovementFormFirebase(db, state, draft(), () => 'cancelled_123456', now)).rejects.toThrow('cancelado');
  expect(state.intent).toBeUndefined();
  await submitSparkMovementFormFirebase(db, state, draft(), () => 'fresh_123456', now);
  expect(mockExecute.mock.calls[1][1].clientActionId).toBe('fresh_123456');
});
