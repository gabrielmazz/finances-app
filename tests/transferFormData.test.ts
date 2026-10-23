import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTransferFormData } from '@/hooks/useTransferFormData';

const mockBanks = jest.fn(), mockBalance = jest.fn();
let mockUid: string | null = 'owner';
jest.mock('@/FirebaseConfig', () => ({ auth: { get currentUser() { return mockUid ? { uid: mockUid } : null; } } }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUid ? { uid: mockUid } : null }) }));
jest.mock('@/functions/BankFirebase', () => ({ getBanksWithUsersByPersonFirebase: (...args: unknown[]) => mockBanks(...args), getBankCurrentBalanceInCentsFirebase: (...args: unknown[]) => mockBalance(...args) }));
const banks = [{ id: 'a', name: 'Banco A' }, { id: 'b', name: 'Banco B' }, { id: 'c', name: 'Banco C' }];
const deferred = () => {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>(done => { resolve = done; });
  return { promise, resolve };
};
beforeEach(() => {
  mockUid = 'owner'; mockBanks.mockReset().mockResolvedValue({ success: true, data: banks });
  mockBalance.mockReset().mockImplementation(async (_uid, bank) => ({ success: true, data: bank === 'a' ? 100000 : 20000 }));
});

test('aguarda bancos confirmados antes de consultar saldos e não apresenta saldo antigo na troca', async () => {
  const pending = deferred(); mockBanks.mockReturnValueOnce(pending.promise);
  const { result, unmount } = await renderHook(() => useTransferFormData('a', 'b'));
  expect(result.current.isLoadingBanks).toBe(true); expect(result.current.banks).toEqual([]); expect(mockBalance).not.toHaveBeenCalled();
  await act(async () => pending.resolve({ success: true, data: banks }));
  await waitFor(() => expect(result.current.originBalanceInCents).toBe(100000));
  expect(result.current.targetBalanceInCents).toBe(20000); expect(result.current.error).toBeNull();
  await unmount();
});

test('erro de contexto/catálogo fica explícito e retry recarrega bancos e ambas as contas', async () => {
  mockBanks.mockResolvedValueOnce({ success: false, error: 'permission-denied' });
  const { result, unmount } = await renderHook(() => useTransferFormData('a', 'b'));
  await waitFor(() => expect(result.current.error).toMatch(/carregar os bancos/));
  expect(mockBalance).not.toHaveBeenCalled(); expect(result.current.banks).toEqual([]);
  await act(async () => result.current.reload());
  await waitFor(() => expect(result.current.originBalanceInCents).toBe(100000));
  expect(result.current.targetBalanceInCents).toBe(20000); expect(result.current.error).toBeNull();
  await unmount();
});

test('falha de saldo não vira zero e pode ser repetida sem trocar a seleção', async () => {
  mockBalance.mockImplementationOnce(async () => ({ success: false }));
  const { result, unmount } = await renderHook(() => useTransferFormData('a', 'b'));
  await waitFor(() => expect(result.current.error).toMatch(/confirmar o saldo/));
  expect(result.current.originBalanceInCents).toBeNull(); expect(result.current.targetBalanceInCents).toBe(20000);
  await act(async () => result.current.reload());
  await waitFor(() => expect(result.current.originBalanceInCents).toBe(100000));
  expect(result.current.error).toBeNull(); await unmount();
});

test('após transferência, recarga invalida os dois saldos e mostra a nova posição sem outra gravação', async () => {
  const { result, unmount } = await renderHook(() => useTransferFormData('a', 'b'));
  await waitFor(() => expect(result.current.originBalanceInCents).toBe(100000));
  const pending = deferred(); mockBanks.mockReturnValueOnce(pending.promise);
  mockBalance.mockImplementation(async (_uid, bank) => ({ success: true, data: bank === 'a' ? 85000 : 35000 }));
  await act(async () => result.current.reload());
  expect(result.current.originBalanceInCents).toBeNull(); expect(result.current.targetBalanceInCents).toBeNull();
  await act(async () => pending.resolve({ success: true, data: banks }));
  await waitFor(() => expect(result.current.originBalanceInCents).toBe(85000));
  expect(result.current.targetBalanceInCents).toBe(35000); await unmount();
});

test.each(['source', 'target'])('resposta atrasada da conta %s não substitui a seleção nova', async side => {
  const pending = deferred();
  mockBalance.mockImplementation(async (_uid, bank) => bank === 'a' ? pending.promise : { success: true, data: 20000 });
  const { result, rerender, unmount } = await renderHook(({ source, target }: { source: string; target: string }) => useTransferFormData(source, target),
    { initialProps: { source: side === 'source' ? 'a' : 'b', target: side === 'target' ? 'a' : 'b' } });
  await waitFor(() => expect(mockBalance).toHaveBeenCalledWith('owner', 'a'));
  await rerender({ source: side === 'source' ? 'c' : 'b', target: side === 'target' ? 'c' : 'b' });
  await waitFor(() => expect(side === 'source' ? result.current.originBalanceInCents : result.current.targetBalanceInCents).toBe(20000));
  await act(async () => pending.resolve({ success: true, data: 999999 }));
  expect(side === 'source' ? result.current.originBalanceInCents : result.current.targetBalanceInCents).toBe(20000);
  await unmount();
});

test('sem sessão ou com sessão substituída não publica bancos/saldos de outra conta', async () => {
  mockUid = null;
  const { result, rerender, unmount } = await renderHook(() => useTransferFormData('a', 'b'));
  await waitFor(() => expect(result.current.error).toMatch(/Entre novamente/)); expect(mockBanks).not.toHaveBeenCalled();
  mockUid = 'owner'; const pending = deferred(); mockBanks.mockReturnValueOnce(pending.promise);
  await rerender({}); await waitFor(() => expect(mockBanks).toHaveBeenCalled());
  const otherSession = deferred(); mockBanks.mockReturnValueOnce(otherSession.promise);
  mockUid = 'other'; await act(async () => pending.resolve({ success: true, data: banks }));
  expect(result.current.banks).toEqual([]); expect(result.current.isLoadingBanks).toBe(true); expect(mockBalance).not.toHaveBeenCalled();
  await act(async () => otherSession.resolve({ success: true, data: banks }));
  await waitFor(() => expect(result.current.originBalanceInCents).toBe(100000));
  expect(mockBalance.mock.calls.every(([uid]) => uid === 'other')).toBe(true);
  await unmount();
});

test('banco desativado durante recarga é recusado sem consultar saldo da seleção obsoleta', async () => {
  const { result, unmount } = await renderHook(() => useTransferFormData('a', 'b'));
  await waitFor(() => expect(result.current.originBalanceInCents).toBe(100000));
  mockBalance.mockClear(); mockBanks.mockResolvedValueOnce({ success: true, data: banks.filter(bank => bank.id !== 'a') });
  await act(async () => result.current.reload());
  await waitFor(() => expect(result.current.error).toMatch(/não está mais disponível/));
  expect(result.current.originBalanceInCents).toBeNull(); expect(mockBalance.mock.calls.some(([, id]) => id === 'a')).toBe(false);
  await unmount();
});

test('menos de dois bancos indica a preparação necessária, sem erro financeiro inventado', async () => {
  mockBanks.mockResolvedValueOnce({ success: true, data: [banks[0]] });
  const { result, unmount } = await renderHook(() => useTransferFormData(null, null));
  await waitFor(() => expect(result.current.needsBanks).toBe(true)); expect(result.current.error).toBeNull();
  expect(mockBalance).not.toHaveBeenCalled(); await unmount();
});
