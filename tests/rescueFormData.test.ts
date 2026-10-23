import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useRescueFormData } from '@/hooks/useRescueFormData';
const mockContext = jest.fn(), mockAccounts = jest.fn(), mockLedger = jest.fn(), mockLedgerAccounts = jest.fn(), mockBanks = jest.fn(), mockBalance = jest.fn();
let mockUid: string | null = 'owner';
jest.mock('@/FirebaseConfig', () => ({ db: {}, auth: { get currentUser() { return mockUid ? { uid: mockUid } : null; } } }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUid ? { uid: mockUid } : null }) }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkAccountReadFirebase', () => ({ readSparkAccountsFirebase: (...args: unknown[]) => mockAccounts(...args) }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ getFinancialLedgerContextFirebase: (...args: unknown[]) => mockLedger(...args), getFinancialLedgerAccountsFirebase: (...args: unknown[]) => mockLedgerAccounts(...args) }));
jest.mock('@/functions/BankFirebase', () => ({ getBanksWithUsersByPersonFirebase: (...args: unknown[]) => mockBanks(...args), getBankCurrentBalanceInCentsFirebase: (...args: unknown[]) => mockBalance(...args) }));
const account = (id: string, kind = 'bank') => ({ accountId: id, position: { kind, active: true }, lifecycle: { archived: false }, catalog: { name: id, iconKey: null, colorHex: null } });
const accounts = () => [account('a'), account('b'), account('cash', 'cash')];
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  mockUid = 'owner'; mockContext.mockReset().mockResolvedValue({ groupId: 'group' }); mockAccounts.mockReset().mockResolvedValue(accounts());
  mockLedger.mockReset().mockResolvedValue(null); mockLedgerAccounts.mockReset().mockResolvedValue([]);
  mockBanks.mockReset().mockResolvedValue({ success: true, data: [{ id: 'a', name: 'A' }] });
  mockBalance.mockReset().mockResolvedValue({ success: true, data: 100000 });
});

test('Spark seleciona banco ativo e Caixa canônico, confirma saldo e dispensa fontes anteriores', async () => {
  mockAccounts.mockResolvedValueOnce([...accounts(), { ...account('inactive'), position: { kind: 'bank', active: false } }, { ...account('archived'), lifecycle: { archived: true } }]);
  const { result, unmount } = await renderHook(() => useRescueFormData('a'));
  await waitFor(() => expect(result.current.currentBankBalanceInCents).toBe(100000));
  expect(result.current.banks.map(bank => bank.id)).toEqual(['a', 'b']); expect(result.current.cashAccountId).toBe('cash');
  expect(result.current.isSparkMode).toBe(true); expect(result.current.error).toBeNull();
  expect(mockBalance).toHaveBeenCalledWith('owner', 'a'); expect(mockLedger).not.toHaveBeenCalled(); expect(mockBanks).not.toHaveBeenCalled();
  await unmount();
});

test.each(['missing', 'inactive', 'archived'])('Caixa %s impede preparar um saque, sem consultar legado', async kind => {
  const rows = accounts().filter(row => row.accountId !== 'cash');
  if (kind !== 'missing') rows.push({ ...account('cash', 'cash'), position: { kind: 'cash', active: kind !== 'inactive' }, lifecycle: { archived: kind === 'archived' } });
  mockAccounts.mockResolvedValueOnce(rows);
  const { result, unmount } = await renderHook(() => useRescueFormData('a'));
  await waitFor(() => expect(result.current.error).toMatch(/Dinheiro/));
  expect(result.current.cashAccountId).toBeNull(); expect(result.current.currentBankBalanceInCents).toBeNull();
  expect(mockLedger).not.toHaveBeenCalled(); expect(mockBanks).not.toHaveBeenCalled(); await unmount();
});

test('falha de contexto não autoriza legado e oferece retry', async () => {
  mockContext.mockRejectedValueOnce(new Error('offline'));
  const { result, unmount } = await renderHook(() => useRescueFormData('a'));
  await waitFor(() => expect(result.current.error).toBe('offline'));
  expect(result.current.banks).toEqual([]); expect(mockLedger).not.toHaveBeenCalled(); expect(mockBanks).not.toHaveBeenCalled();
  await act(async () => result.current.reload());
  await waitFor(() => expect(result.current.currentBankBalanceInCents).toBe(100000)); expect(result.current.error).toBeNull(); await unmount();
});

test('falha de saldo não vira zero e pode ser repetida com a seleção mantida', async () => {
  mockBalance.mockResolvedValueOnce({ success: false });
  const { result, unmount } = await renderHook(() => useRescueFormData('a'));
  await waitFor(() => expect(result.current.error).toMatch(/confirmar o saldo/)); expect(result.current.currentBankBalanceInCents).toBeNull();
  await act(async () => result.current.reload());
  await waitFor(() => expect(result.current.currentBankBalanceInCents).toBe(100000)); await unmount();
});

test('troca rápida de banco descarta saldo atrasado da origem anterior', async () => {
  const pending = deferred(); mockBalance.mockReturnValueOnce(pending.promise).mockResolvedValue({ success: true, data: 25000 });
  const { result, rerender, unmount } = await renderHook(({ id }: { id: string }) => useRescueFormData(id), { initialProps: { id: 'a' } });
  await waitFor(() => expect(mockBalance).toHaveBeenCalledWith('owner', 'a'));
  await rerender({ id: 'b' }); await waitFor(() => expect(result.current.currentBankBalanceInCents).toBe(25000));
  await act(async () => pending.resolve({ success: true, data: 999999 })); expect(result.current.currentBankBalanceInCents).toBe(25000);
  await unmount();
});

test('recarga após sucesso limpa saldo antigo e confere de novo banco e disponibilidade do Caixa', async () => {
  const { result, unmount } = await renderHook(() => useRescueFormData('a'));
  await waitFor(() => expect(result.current.currentBankBalanceInCents).toBe(100000));
  const pending = deferred(); mockAccounts.mockReturnValueOnce(pending.promise); mockBalance.mockResolvedValue({ success: true, data: 85000 });
  await act(async () => result.current.reload()); expect(result.current.currentBankBalanceInCents).toBeNull(); expect(result.current.cashAccountId).toBeNull();
  await act(async () => pending.resolve(accounts())); await waitFor(() => expect(result.current.currentBankBalanceInCents).toBe(85000));
  expect(result.current.cashAccountId).toBe('cash'); await unmount();
});

test('sessão ausente ou substituída não publica dados do UID anterior', async () => {
  mockUid = null;
  const { result, rerender, unmount } = await renderHook(() => useRescueFormData('a'));
  await waitFor(() => expect(result.current.error).toMatch(/Entre novamente/)); expect(mockContext).not.toHaveBeenCalled();
  mockUid = 'owner'; const old = deferred(); mockContext.mockReturnValueOnce(old.promise);
  await rerender({}); await waitFor(() => expect(mockContext).toHaveBeenCalledWith({}, 'owner'));
  const other = deferred(); mockContext.mockReturnValueOnce(other.promise); mockUid = 'other';
  await act(async () => old.resolve({ groupId: 'old' })); expect(result.current.banks).toEqual([]); expect(mockAccounts).not.toHaveBeenCalled();
  await act(async () => other.resolve({ groupId: 'new' })); await waitFor(() => expect(result.current.currentBankBalanceInCents).toBe(100000));
  expect(mockBalance.mock.calls.every(([uid]) => uid === 'other')).toBe(true); await unmount();
});

test('razão anterior conserva a conta Caixa e seu saldo bancário materializado', async () => {
  mockContext.mockResolvedValue(null); mockLedger.mockResolvedValue({ groupId: 'ledger', role: 'member' });
  mockLedgerAccounts.mockResolvedValue([{ id: 'a', kind: 'bank', name: 'A', currentBalanceInCents: 30000 }, { id: 'cash-ledger', kind: 'cash' }]);
  const { result, unmount } = await renderHook(() => useRescueFormData('a'));
  await waitFor(() => expect(result.current.currentBankBalanceInCents).toBe(30000)); expect(result.current.cashAccountId).toBe('cash-ledger');
  expect(result.current.isSparkMode).toBe(false); expect(mockBalance).not.toHaveBeenCalled(); expect(mockBanks).not.toHaveBeenCalled(); await unmount();
});

test('legado só é selecionado após ambos os contextos confirmados ausentes', async () => {
  mockContext.mockResolvedValue(null);
  const { result, unmount } = await renderHook(() => useRescueFormData('a'));
  await waitFor(() => expect(result.current.currentBankBalanceInCents).toBe(100000));
  expect(mockLedger).toHaveBeenCalledWith('owner'); expect(mockBanks).toHaveBeenCalledWith('owner'); expect(result.current.isSparkMode).toBe(false); await unmount();
});

test('banco que saiu do catálogo após recarga bloqueia a seleção antiga', async () => {
  const { result, unmount } = await renderHook(() => useRescueFormData('a'));
  await waitFor(() => expect(result.current.currentBankBalanceInCents).toBe(100000));
  mockAccounts.mockResolvedValueOnce([account('cash', 'cash')]); await act(async () => result.current.reload());
  await waitFor(() => expect(result.current.error).toMatch(/não está mais disponível/));
  expect(result.current.currentBankBalanceInCents).toBeNull(); expect(result.current.needsBank).toBe(true); await unmount();
});
