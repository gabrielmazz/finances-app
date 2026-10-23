import { act, renderHook } from '@testing-library/react-native';
import { useSparkBankForm } from '@/hooks/useSparkBankForm';
const mockContext = jest.fn(), mockSubmit = jest.fn(), mockInvalidate = jest.fn();
let mockUid: string | null = 'owner';
jest.mock('@/FirebaseConfig', () => ({ db: {}, auth: { get currentUser() { return mockUid ? { uid: mockUid } : null; } } }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ createFinancialClientActionId: () => 'bank_action_123456' }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkBankFormFirebase', () => ({ submitSparkBankFormFirebase: (...args: unknown[]) => mockSubmit(...args), loadSparkBankFormFirebase: jest.fn() }));
beforeEach(() => { mockUid = 'owner'; mockContext.mockReset().mockResolvedValue({ role: 'admin' }); mockSubmit.mockReset().mockResolvedValue({ bankId: 'bank' }); mockInvalidate.mockReset().mockResolvedValue(undefined); });
test('novo cadastro distingue Spark e legado sem escrever nada na inicialização', async () => {
  const { result, unmount } = await renderHook(useSparkBankForm);
  expect(await result.current.initialize()).toBe(true);
  mockContext.mockResolvedValueOnce(null); expect(await result.current.initialize()).toBe(false);
  expect(mockSubmit).not.toHaveBeenCalled(); await unmount();
});
test('rede, papel e troca de sessão interrompem a inicialização em vez de liberar o fluxo anterior', async () => {
  const { result, unmount } = await renderHook(useSparkBankForm);
  mockContext.mockRejectedValueOnce(new Error('offline')); await expect(result.current.initialize()).rejects.toThrow('offline');
  mockContext.mockResolvedValueOnce({ role: 'member' }); await expect(result.current.initialize()).rejects.toThrow('administrador');
  mockContext.mockImplementationOnce(async () => { mockUid = 'other'; return { role: 'admin' }; });
  await expect(result.current.initialize()).rejects.toThrow('sessão');
  expect(mockSubmit).not.toHaveBeenCalled(); await unmount();
});
test('falha ao atualizar consultas depois do commit não transforma o banco salvo em nova tentativa de criação', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    mockInvalidate.mockRejectedValueOnce(new Error('offline'));
    const { result, unmount } = await renderHook(useSparkBankForm);
    await act(async () => { expect(await result.current.submit({ actorId: 'owner', bankId: null, name: 'Banco', colorHex: null, iconKey: null, openingBalanceInCents: 12000 })).toEqual({ bankId: 'bank' }); });
    expect(mockSubmit).toHaveBeenCalledTimes(1); expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['finance', 'owner'], refetchType: 'all' });
    await unmount();
  } finally { warning.mockRestore(); }
});
