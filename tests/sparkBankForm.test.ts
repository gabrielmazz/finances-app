const mockContext = jest.fn(), mockOpen = jest.fn(), mockSave = jest.fn(), mockRead = jest.fn();
let mockUid: string | null = 'owner';
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: mockUid ? { uid: mockUid } : null }) }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkAccountFirebase', () => ({ openSparkBankFirebase: (...args: unknown[]) => mockOpen(...args) }));
jest.mock('@/functions/SparkAccountCatalogFirebase', () => ({ saveSparkAccountCatalogFirebase: (...args: unknown[]) => mockSave(...args) }));
jest.mock('@/functions/SparkAccountReadFirebase', () => ({ readSparkAccountFirebase: (...args: unknown[]) => mockRead(...args) }));
import type { Firestore } from 'firebase/firestore';
import { loadSparkBankFormFirebase, submitSparkBankFormFirebase, type SparkBankDraft, type SparkBankFormState } from '@/functions/SparkBankFormFirebase';

const db = {} as Firestore;
const draft = (fields: Partial<SparkBankDraft> = {}): SparkBankDraft => ({ actorId: 'owner', bankId: null, name: 'Conta principal', colorHex: null, iconKey: 'outro-banco', ...fields });
const newId = jest.fn(() => 'bank_form_action_123456');
beforeEach(() => {
  jest.clearAllMocks(); mockUid = 'owner';
  mockContext.mockReset().mockResolvedValue({ actorId: 'owner', groupId: 'group', role: 'admin' });
  mockOpen.mockReset().mockResolvedValue({ idempotent: false }); mockSave.mockReset().mockResolvedValue({ idempotent: false });
  mockRead.mockReset().mockResolvedValue({ position: { kind: 'bank' }, catalogRevision: 3, catalog: { name: 'Banco atual', colorHex: null, iconKey: null } });
});
test('cria banco e saldo declarado em uma única intenção, com replay sem nova abertura', async () => {
  const state: SparkBankFormState = {}, input = draft({ openingBalanceInCents: 123456 });
  const first = await submitSparkBankFormFirebase(db, state, input, newId);
  expect(mockOpen).toHaveBeenCalledTimes(1);
  expect(mockOpen.mock.calls[0][1]).toMatchObject({ openingBalanceInCents: 123456, overdraftReason: null, catalog: { name: 'Conta principal' } });
  expect(await submitSparkBankFormFirebase(db, state, input, newId)).toEqual(first);
  expect(mockOpen).toHaveBeenCalledTimes(1); expect(newId).toHaveBeenCalledTimes(1); expect(mockSave).not.toHaveBeenCalled();
});
test('compatibilidade da abertura zero mantém o saldo como inteiro', async () => {
  await submitSparkBankFormFirebase(db, {}, draft(), newId);
  expect(mockOpen.mock.calls[0][1].openingBalanceInCents).toBe(0);
});
test('saldo negativo exige justificativa e a preserva no comando atômico', async () => {
  await expect(submitSparkBankFormFirebase(db, {}, draft({ openingBalanceInCents: -100 }), newId)).rejects.toThrow('justificativa');
  expect(mockOpen).not.toHaveBeenCalled();
  await submitSparkBankFormFirebase(db, {}, draft({ openingBalanceInCents: -100, overdraftReason: '  Cheque especial contratado  ' }), newId);
  expect(mockOpen.mock.calls[0][1]).toMatchObject({ openingBalanceInCents: -100, overdraftReason: 'Cheque especial contratado' });
});
test.each([NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER, 1000000000001])('saldo inválido %s é recusado antes de gravar', async amount => {
  await expect(submitSparkBankFormFirebase(db, {}, draft({ openingBalanceInCents: amount }), newId)).rejects.toThrow('limite');
  expect(mockOpen).not.toHaveBeenCalled();
});
test('reenvio incerto conserva saldo, conta e ID; editar valor ou motivo não cria outro banco', async () => {
  const state: SparkBankFormState = {}, input = draft({ openingBalanceInCents: -100, overdraftReason: 'Cheque especial' });
  mockOpen.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
  await expect(submitSparkBankFormFirebase(db, state, input, newId)).rejects.toThrow('offline');
  const command = mockOpen.mock.calls[0][1];
  await expect(submitSparkBankFormFirebase(db, state, { ...input, openingBalanceInCents: -200 }, newId)).rejects.toThrow('mesmos dados');
  await expect(submitSparkBankFormFirebase(db, state, { ...input, overdraftReason: 'Outro motivo' }, newId)).rejects.toThrow('mesmos dados');
  await submitSparkBankFormFirebase(db, state, input, newId);
  expect(mockOpen.mock.calls[1][1]).toEqual(command); expect(newId).toHaveBeenCalledTimes(1);
});
test('edição carrega a revisão canônica e não altera o saldo inicial', async () => {
  const state: SparkBankFormState = {};
  await loadSparkBankFormFirebase(db, state, 'owner', 'bank');
  await submitSparkBankFormFirebase(db, state, draft({ bankId: 'bank', name: 'Nome corrigido' }), newId);
  expect(mockSave.mock.calls[0][1]).toMatchObject({ accountId: 'bank', expectedCatalogRevision: 3, catalog: { name: 'Nome corrigido' } });
  expect(mockOpen).not.toHaveBeenCalled();
  await expect(submitSparkBankFormFirebase(db, state, draft({ bankId: 'bank', openingBalanceInCents: 100 }), newId)).rejects.toThrow('conferência');
});
test('falha de contexto e papel de membro nunca permitem criar banco', async () => {
  mockContext.mockRejectedValueOnce(new Error('Acesso indisponível'));
  await expect(submitSparkBankFormFirebase(db, {}, draft(), newId)).rejects.toThrow('indisponível');
  mockContext.mockResolvedValueOnce({ groupId: 'group', role: 'member' });
  await expect(submitSparkBankFormFirebase(db, {}, draft(), newId)).rejects.toThrow('administrador');
  expect(mockOpen).not.toHaveBeenCalled();
});
test('legado explícito mantém o cadastro anterior, mas não ignora um saldo declarado', async () => {
  mockContext.mockResolvedValue(null);
  expect(await submitSparkBankFormFirebase(db, {}, draft(), newId)).toBeNull();
  await expect(submitSparkBankFormFirebase(db, {}, draft({ openingBalanceInCents: 100 }), newId)).rejects.toThrow('saldo mensal');
  expect(mockOpen).not.toHaveBeenCalled();
});
test('argumentos são capturados antes de aguardar o contexto', async () => {
  let resolve!: (context: unknown) => void;
  mockContext.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const input = draft({ openingBalanceInCents: 12345 }), pending = submitSparkBankFormFirebase(db, {}, input, newId);
  input.openingBalanceInCents = 99999;
  resolve({ actorId: 'owner', groupId: 'group', role: 'admin' }); await pending;
  expect(mockOpen.mock.calls[0][1].openingBalanceInCents).toBe(12345);
});
