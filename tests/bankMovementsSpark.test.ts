const mockContext = jest.fn();
const mockAccount = jest.fn();
const mockAccounts = jest.fn();
const mockEvents = jest.fn();
const mockLegacy = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ db: {}, auth: { currentUser: { uid: 'owner' } } }));
jest.mock('@/functions/RegisterUserFirebase', () => ({}));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkAccountReadFirebase', () => ({ readSparkAccountFirebase: (...args: unknown[]) => mockAccount(...args), readSparkAccountsFirebase: (...args: unknown[]) => mockAccounts(...args) }));
jest.mock('@/functions/SparkFinancialReadFirebase', () => ({ readSparkFinancialEventsFirebase: (...args: unknown[]) => mockEvents(...args) }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ getFinancialLedgerContextFirebase: (...args: unknown[]) => mockLegacy(...args) }));
jest.mock('firebase/firestore', () => ({ doc: (...parts: unknown[]) => parts, getDocFromServer: async () => ({ data: () => ({ name: 'Contraparte' }) }) }));
import { computeBankMovementTotals } from '@/utils/bankMovementTotals';
import { shouldIncludeMovementInGainExpenseTotals } from '@/utils/monthlyBalance';
import { getAllBanksFirebase, getBanksByPersonFirebase, getBanksWithUsersByPersonFirebase, getBankCurrentBalanceInCentsFirebase, getBankMovementBanksFirebase, getBankMovementsByPeriodFirebase, getCashMovementsByPeriodFirebase } from '@/functions/BankFirebase';
import { buildSparkFinancialReadEvents } from '@/utils/sparkFinancialReadModel';
const record = (id: string, kind: string, data: Record<string, unknown>) => ({ id, data: { kind, actorId: 'owner', createdAt: new Date('2026-09-10T12:00Z'), ...data } });
const current = { accountId: 'bank', catalog: { name: 'Banco', colorHex: null, iconKey: null }, lifecycle: { archived: false }, position: { kind: 'bank', active: true, balanceInCents: 12000 }, positionStatus: 'current' };
beforeEach(() => {
  jest.clearAllMocks(); mockContext.mockResolvedValue({ groupId: 'group', actorId: 'owner' }); mockAccount.mockResolvedValue(current); mockAccounts.mockResolvedValue([current]);
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [record('income', 'income', { accountId: 'bank', categoryId: 'category', differenceInCents: 1000 }),
    record('withdraw', 'transfer', { fromAccountId: 'bank', toAccountId: 'cash', amountInCents: 300 }),
    record('edit', 'movement_correction', { originalSource: 'live', originalOperationId: 'income', fromAccountId: 'bank', toAccountId: 'bank', movementKind: 'income',
      originalDeltaInCents: 1000, differenceInCents: 1500, categoryId: 'new-category', effectiveAt: new Date('2026-09-11T12:00Z') })]));
});
test('extrato Spark mantém inverso, substituto e saque sem consultar as coleções antigas', async () => {
  const result = await getBankMovementsByPeriodFirebase({ personId: 'owner', bankId: 'bank', startDate: new Date(2026, 8, 1), endDate: new Date(2026, 8, 30) });
  expect(result.success).toBe(true); expect(result.data?.expenses).toHaveLength(2); expect(result.data?.gains).toHaveLength(2);
  expect(result.data?.expenses.find((row: any) => row.sparkComponent === 'inverse')).toMatchObject({ valueInCents: 1000, tagId: 'category' });
  expect(result.data?.gains.find((row: any) => row.sparkComponent === 'replacement')).toMatchObject({ valueInCents: 1500, tagId: 'new-category' });
  expect(result.data?.gains.find((row: any) => row.sparkOperationId === 'income')).toMatchObject({ sparkResolvedByOperationId: 'edit',
    sparkExecutionReference: { source: 'live', operationId: 'income', family: 'ordinary' } });
  expect(result.data?.gains.find((row: any) => row.sparkComponent === 'replacement')).toMatchObject({ sparkResolvedByOperationId: null,
    sparkExecutionReference: { source: 'live', operationId: 'edit', family: 'ordinary' } });
  expect(result.data?.expenses.find((row: any) => row.isCashRescue)).toMatchObject({ valueInCents: 300, isBankTransfer: false, isLedgerMovement: true });
  expect(mockLegacy).not.toHaveBeenCalled();
});
test('seleção de extrato inclui conta arquivada e saldo corrente só é confirmado para posição atual', async () => {
  mockAccounts.mockResolvedValueOnce([{ ...current, lifecycle: { archived: true }, position: { ...current.position, active: false } }]);
  expect((await getBankMovementBanksFirebase('owner')).data?.[0]).toMatchObject({ id: 'bank', name: 'Banco (arquivado)', isActive: false });
  await expect(getBankCurrentBalanceInCentsFirebase('owner', 'bank')).resolves.toMatchObject({ success: true, data: 12000 });
  mockAccount.mockResolvedValueOnce({ ...current, positionStatus: 'retained' }); await expect(getBankCurrentBalanceInCentsFirebase('owner', 'bank')).resolves.toMatchObject({ success: false });
});
test('Caixa usa o mesmo leitor e mantém saque fora de receitas ordinárias', async () => {
  mockAccount.mockResolvedValueOnce({ ...current, accountId: 'cash', position: { ...current.position, kind: 'cash' } });
  const result = await getCashMovementsByPeriodFirebase({ personId: 'owner', startDate: new Date(2026, 8, 1), endDate: new Date(2026, 8, 30) });
  expect(result.data?.gains).toHaveLength(1); expect(result.data?.gains[0]).toMatchObject({ bankId: null, moneyFormat: true, isCashRescue: true, valueInCents: 300 });
  expect(mockLegacy).not.toHaveBeenCalled();
});
test('período civil inclui o primeiro instante de São Paulo em qualquer fuso do aparelho', async () => {
  mockEvents.mockResolvedValueOnce(buildSparkFinancialReadEvents('group', [record('before', 'income', { accountId: 'bank', differenceInCents: 100, effectiveAt: new Date('2026-09-10T02:59:59Z') }),
    record('midnight', 'income', { accountId: 'bank', differenceInCents: 200, effectiveAt: new Date('2026-09-10T03:00Z') })]));
  const result = await getBankMovementsByPeriodFirebase({ personId: 'owner', bankId: 'bank', startDate: new Date(2026, 8, 10), endDate: new Date(2026, 8, 10) });
  expect(result.data?.gains.map((row: any) => row.valueInCents)).toEqual([200]);
});

test('um histórico encerrado antes da correção ainda informa que o original já foi resolvido', async () => {
  const result = await getBankMovementsByPeriodFirebase({ personId: 'owner', bankId: 'bank', startDate: new Date(2026, 8, 10), endDate: new Date(2026, 8, 10) });
  expect(result.data?.gains).toHaveLength(1);
  expect(result.data?.gains[0]).toMatchObject({ sparkResolvedByOperationId: 'edit' });
});

test('indicador de dinheiro segue a conta canônica mesmo diante de descrição divergente', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [record('income', 'income', { accountId: 'bank', differenceInCents: 1000,
    hasDetails: true, details: { name: 'Crédito', explanation: null, paymentFormats: [], moneyFormat: true } })]));
  const bank = await getBankMovementsByPeriodFirebase({ personId: 'owner', bankId: 'bank', startDate: new Date(2026, 8, 1), endDate: new Date(2026, 8, 30) });
  expect(bank.data?.gains[0]).toMatchObject({ bankId: 'bank', moneyFormat: false });
  mockAccount.mockResolvedValueOnce({ ...current, accountId: 'cash', position: { ...current.position, kind: 'cash' } });
  mockEvents.mockResolvedValueOnce(buildSparkFinancialReadEvents('group', [record('cash-income', 'income', { accountId: 'cash', differenceInCents: 1000,
    hasDetails: true, details: { name: 'Crédito', explanation: null, paymentFormats: [], moneyFormat: false } })]));
  const cash = await getCashMovementsByPeriodFirebase({ personId: 'owner', startDate: new Date(2026, 8, 1), endDate: new Date(2026, 8, 30) });
  expect(cash.data?.gains[0]).toMatchObject({ bankId: null, moneyFormat: true });
});

test('seletores de lançamento usam contas Spark ativas, sem Caixa, investimento ou dono inferido pelo editor', async () => {
  mockAccounts.mockResolvedValue([
    { ...current, catalogActorId: 'last-editor' },
    { ...current, accountId: 'archived', lifecycle: { archived: true }, position: { ...current.position, active: false } },
    { ...current, accountId: 'inactive', position: { ...current.position, active: false } },
    { ...current, accountId: 'cash', position: { ...current.position, kind: 'cash' } },
    { ...current, accountId: 'investment', position: { ...current.position, kind: 'investment' } },
  ]);
  for (const result of [await getAllBanksFirebase(), await getBanksByPersonFirebase('owner'), await getBanksWithUsersByPersonFirebase('owner')]) {
    expect(result.success).toBe(true); expect(result.data?.map(bank => bank.id)).toEqual(['bank']);
    expect(result.data?.[0]).toMatchObject({ financialSource: 'spark', name: 'Banco', groupId: 'group' });
    expect(result.data?.[0]).not.toHaveProperty('personId');
  }
  expect((await getAllBanksFirebase(true)).data).toHaveLength(3); expect(mockLegacy).not.toHaveBeenCalled();
  expect(mockAccounts).toHaveBeenCalledWith({}, 'owner', 'group', { requireCurrent: false });
});

test('seleção recusa catálogo ausente e falha de contexto sem retornar lista antiga vazia', async () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    mockAccounts.mockResolvedValueOnce([{ ...current, catalog: null }]);
    expect((await getAllBanksFirebase()).success).toBe(false);
    mockContext.mockRejectedValueOnce(new Error('protocolo desconhecido'));
    expect((await getBanksWithUsersByPersonFirebase('owner')).success).toBe(false);
    expect(mockLegacy).not.toHaveBeenCalled();
  } finally { consoleError.mockRestore(); }
});
test('saque Spark no extrato é movimentação interna e conserva o nome do banco', async () => {
  const result = await getBankMovementsByPeriodFirebase({ personId: 'owner', bankId: 'bank', startDate: new Date(2026, 8, 1), endDate: new Date(2026, 8, 30) });
  const withdrawal = result.data?.expenses.find(row => row.isCashRescue);
  expect(withdrawal).toMatchObject({ bankNameSnapshot: 'Banco', isSparkMovement: true, valueInCents: 300 });
  expect(shouldIncludeMovementInGainExpenseTotals(withdrawal)).toBe(false);
  expect(shouldIncludeMovementInGainExpenseTotals({ isCashRescue: true })).toBe(true);
});

test('aporte e seu estorno conservam direção bancária, vínculo executável e exclusão dos totais econômicos', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [
    record('deposit', 'investment_deposit', { fromAccountId: 'bank', toAccountId: 'investment', amountInCents: 500 }),
    record('undo-deposit', 'transfer_reversal', { fromAccountId: 'investment', toAccountId: 'bank', amountInCents: 500, reversesOperationId: 'deposit' }),
  ]));
  const result = await getBankMovementsByPeriodFirebase({ personId: 'owner', bankId: 'bank', startDate: new Date(2026, 8, 1), endDate: new Date(2026, 8, 30) });
  expect(result.data?.expenses[0]).toMatchObject({ isInvestmentDeposit: true, isInvestmentRedemption: false, investmentId: 'investment', sparkResolvedByOperationId: 'undo-deposit' });
  expect(result.data?.gains[0]).toMatchObject({ isInvestmentDeposit: false, isInvestmentRedemption: true, sparkExecutionReference: null });
  expect(result.data?.gains[0].name).toContain('Estorno de Aporte');
  expect([...result.data!.expenses, ...result.data!.gains].filter(shouldIncludeMovementInGainExpenseTotals)).toEqual([]);
});


test('primeiro percurso concilia abertura, ganho e correção de despesa sem transformar o inverso em renda', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [
    record('open', 'bank_opening', { accountId: 'bank', openingBalanceInCents: 100000 }),
    record('gain', 'income', { accountId: 'bank', differenceInCents: 20000 }),
    record('expense', 'expense', { accountId: 'bank', differenceInCents: -5000 }),
    record('edit-expense', 'movement_correction', { originalSource: 'live', originalOperationId: 'expense', fromAccountId: 'bank', toAccountId: 'bank',
      movementKind: 'expense', originalDeltaInCents: -5000, differenceInCents: -7000 }),
  ]));
  mockAccount.mockResolvedValue({ ...current, position: { ...current.position, balanceInCents: 113000 } });
  const result = await getBankMovementsByPeriodFirebase({ personId: 'owner', bankId: 'bank', startDate: new Date(2026, 8, 1), endDate: new Date(2026, 8, 30) });
  if (!result.success || !result.data) throw new Error('Extrato não carregado');
  const rows = [...result.data.expenses.map(row => ({ ...row, type: 'expense' as const })), ...result.data.gains.map(row => ({ ...row, type: 'gain' as const }))];
  const totals = computeBankMovementTotals(rows);
  expect(totals).toEqual({ totalGains: 20000, totalExpenses: 7000 });
  expect(rows.find(row => row.sparkComponent === 'inverse')).toMatchObject({ sparkEconomicKind: 'expense', sparkDeltaInCents: 5000, name: expect.stringContaining('Estorno:') });
  expect(rows.filter(row => row.sparkEconomicKind === 'expense')).toHaveLength(3);
  expect(await getBankCurrentBalanceInCentsFirebase('owner', 'bank')).toMatchObject({ success: true, data: 100000 + totals.totalGains - totals.totalExpenses });
});
