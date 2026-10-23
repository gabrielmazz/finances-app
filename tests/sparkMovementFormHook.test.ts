import { act, renderHook } from '@testing-library/react-native';
import { useSparkMovementForm } from '@/hooks/useSparkMovementForm';
const mockContext = jest.fn(), mockRead = jest.fn(), mockSubmit = jest.fn(), mockInvalidate = jest.fn();
let mockUid: string | null = 'owner';
jest.mock('@/FirebaseConfig', () => ({ db: {}, auth: { get currentUser() { return mockUid ? { uid: mockUid } : null; } } }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ createFinancialClientActionId: () => 'movement_123456' }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkOrdinaryReadFirebase', () => ({ readSparkOrdinaryForEditFirebase: (...args: unknown[]) => mockRead(...args), sparkEditableMovementRecord: (value: unknown) => value }));
jest.mock('@/functions/SparkMovementFormFirebase', () => ({ beginNextSparkMovementFormIntent: (state: unknown) => state, submitSparkMovementFormFirebase: (...args: unknown[]) => mockSubmit(...args) }));
beforeEach(() => { mockUid = 'owner'; mockContext.mockReset().mockResolvedValue({ groupId: 'group', actorId: 'owner', role: 'member' }); mockRead.mockReset().mockResolvedValue({ movementKind: 'income' }); mockSubmit.mockReset().mockResolvedValue(true); mockInvalidate.mockReset().mockResolvedValue(undefined); });

test('membro pode iniciar ganho/despesa; legado somente após contexto confirmado nulo', async () => {
  const { result, unmount } = await renderHook(() => useSparkMovementForm('income'));
  expect(await result.current.initialize()).toBe(true);
  mockContext.mockResolvedValueOnce(null); expect(await result.current.initialize()).toBe(false);
  mockContext.mockRejectedValueOnce(new Error('offline')); await expect(result.current.initialize()).rejects.toThrow('offline');
  expect(mockSubmit).not.toHaveBeenCalled(); await unmount();
});

test('troca de sessão durante inicialização ou leitura canônica é recusada', async () => {
  const { result, unmount } = await renderHook(() => useSparkMovementForm('income'));
  mockContext.mockImplementationOnce(async () => { mockUid = 'other'; return {}; });
  await expect(result.current.initialize()).rejects.toThrow('sessão');
  mockUid = 'owner'; mockRead.mockImplementationOnce(async () => { mockUid = 'other'; return { movementKind: 'income' }; });
  await expect(result.current.load('operation_123456', 'live')).rejects.toThrow('sessão'); await unmount();
});

test('fonte Spark sem contexto e tipo incompatível não retornam fallback', async () => {
  const { result, unmount } = await renderHook(() => useSparkMovementForm('income'));
  mockContext.mockResolvedValueOnce(null);
  await expect(result.current.load('operation_123456', 'live')).rejects.toThrow('contexto');
  mockRead.mockResolvedValueOnce({ movementKind: 'expense' });
  await expect(result.current.load('operation_123456', 'live')).rejects.toThrow('incompatível'); await unmount();
});

test('falha de atualização da consulta não transforma commit confirmado em erro financeiro', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    mockInvalidate.mockRejectedValueOnce(new Error('offline'));
    const { result, unmount } = await renderHook(() => useSparkMovementForm('expense'));
    await act(async () => { expect(await result.current.submit({ actorId: 'owner', name: 'Mercado', amountInCents: 1200, selectedDate: new Date(), bankId: 'bank', moneyFormat: false, categoryId: 'category', explanation: null, isEditing: false, specialSource: false })).toBe(true); });
    expect(mockSubmit).toHaveBeenCalledTimes(1); expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['finance', 'owner'], refetchType: 'all' }); await unmount();
  } finally { warning.mockRestore(); }
});
