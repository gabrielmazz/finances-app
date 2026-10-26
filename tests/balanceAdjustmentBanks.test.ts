const mockContext = jest.fn(), mockAccounts = jest.fn(), mockLedger = jest.fn(), mockLedgerAccounts = jest.fn(), mockBanks = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ auth: { currentUser: { uid: 'owner' } }, db: {}, firebaseFunctions: {} }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkAccountReadFirebase', () => ({ readSparkAccountsFirebase: (...args: unknown[]) => mockAccounts(...args) }));
jest.mock('@/functions/SparkBalanceFormFirebase', () => ({ readSparkAdjustmentFormFirebase: jest.fn() }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ getFinancialLedgerContextFirebase: (...args: unknown[]) => mockLedger(...args), getFinancialLedgerAccountsFirebase: (...args: unknown[]) => mockLedgerAccounts(...args) }));
jest.mock('@/functions/BankFirebase', () => ({ getBanksWithUsersByPersonFirebase: (...args: unknown[]) => mockBanks(...args) }));
jest.mock('@/functions/RegisterUserFirebase', () => ({ getRelatedUsersIDsFirebase: jest.fn() }));
import { getBalanceAdjustmentBanksFirebase } from '@/functions/BankBalanceAdjustmentFirebase';
const account = (id: string, active = true, archived = false, kind = 'bank') => ({ accountId: id, position: { kind, active }, lifecycle: { archived }, catalog: { name: id } });
beforeEach(() => {
  mockContext.mockReset().mockResolvedValue({ groupId: 'group', role: 'admin' }); mockAccounts.mockReset().mockResolvedValue([account('bank')]);
  mockLedger.mockReset().mockResolvedValue(null); mockLedgerAccounts.mockReset().mockResolvedValue([]); mockBanks.mockReset().mockResolvedValue({ success: true, data: [{ id: 'legacy', name: 'Legado' }] });
});
test('catálogo Spark lista apenas bancos ativos não arquivados para administradores', async () => {
  mockAccounts.mockResolvedValue([account('bank'), account('inactive', false), account('archived', true, true), account('cash', true, false, 'cash')]);
  expect((await getBalanceAdjustmentBanksFirebase()).map(bank => bank.id)).toEqual(['bank']);
  expect(mockAccounts).toHaveBeenCalledWith({}, 'owner', 'group', { requireCurrent: false }); expect(mockLedger).not.toHaveBeenCalled(); expect(mockBanks).not.toHaveBeenCalled();
});
test('papel não administrativo impede abrir o ajuste Spark', async () => {
  mockContext.mockResolvedValue({ groupId: 'group', role: 'member' });
  await expect(getBalanceAdjustmentBanksFirebase()).rejects.toThrow('administrador'); expect(mockAccounts).not.toHaveBeenCalled(); expect(mockLedger).not.toHaveBeenCalled();
});
test('erro de contexto não autoriza catálogo legado', async () => {
  mockContext.mockRejectedValue(new Error('Offline')); await expect(getBalanceAdjustmentBanksFirebase()).rejects.toThrow('Offline');
  expect(mockLedger).not.toHaveBeenCalled(); expect(mockBanks).not.toHaveBeenCalled();
});
test('razão anterior conserva IDs legados e descarta bancos inativos/arquivados', async () => {
  mockContext.mockResolvedValue(null); mockLedger.mockResolvedValue({ groupId: 'ledger', role: 'admin' });
  mockLedgerAccounts.mockResolvedValue([{ id: 'account', legacyBankId: 'legacy', kind: 'bank', name: 'Banco' }, { id: 'inactive', kind: 'bank', isActive: false }, { id: 'archived', kind: 'bank', archivedAt: new Date() }]);
  expect((await getBalanceAdjustmentBanksFirebase()).map(bank => bank.id)).toEqual(['legacy']); expect(mockBanks).not.toHaveBeenCalled();
});
test('catálogo legado depende de ausência confirmada dos dois contextos', async () => {
  mockContext.mockResolvedValue(null); expect((await getBalanceAdjustmentBanksFirebase()).map(bank => bank.id)).toEqual(['legacy']); expect(mockLedger).toHaveBeenCalledWith('owner'); expect(mockBanks).toHaveBeenCalledWith('owner');
});
