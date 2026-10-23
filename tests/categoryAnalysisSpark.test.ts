const mockContext = jest.fn(), mockAccounts = jest.fn(), mockEvents = jest.fn(), mockTags = jest.fn(), mockLegacy = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ db: {} }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkAccountReadFirebase', () => ({ readSparkAccountsFirebase: (...args: unknown[]) => mockAccounts(...args) }));
jest.mock('@/functions/SparkFinancialReadFirebase', () => ({ readSparkFinancialEventsFirebase: (...args: unknown[]) => mockEvents(...args) }));
jest.mock('@/functions/TagFirebase', () => ({ getTagsWithUsersByPersonFirebase: (...args: unknown[]) => mockTags(...args) }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ getFinancialLedgerContextFirebase: (...args: unknown[]) => mockLegacy(...args) }));
jest.mock('@/functions/RegisterUserFirebase', () => ({ getRelatedUsersIDsFirebase: () => { throw new Error('Não deve ler relacionamentos legados.'); } }));
jest.mock('firebase/firestore', () => ({ collection: () => { throw new Error('Não deve consultar coleção legada.'); } }));
import { getCategoryAnalysisFirebase } from '@/functions/CategoryAnalysisFirebase';
import { buildSparkFinancialReadEvents, type SparkReadRecord } from '@/utils/sparkFinancialReadModel';
const at = (day: string) => new Date(`${day}T12:00:00-03:00`);
const row = (id: string, kind: string, data: Record<string, unknown> = {}): SparkReadRecord => ({ id, data: { kind, actorId: 'owner', createdAt: at('2026-10-05'), ...data } });
const expense = (id: string, day: string, value: number, categoryId = 'food') => row(id, 'expense', { accountId: 'bank', categoryId, differenceInCents: -value, effectiveAt: at(day) });
const correction = (id: string, originalOperationId: string, amount: number, replacement: number, data: Record<string, unknown> = {}) => row(id, 'movement_correction', {
  originalSource: 'live', originalOperationId, movementKind: 'expense', originalDeltaInCents: -amount, differenceInCents: -replacement,
  fromAccountId: 'bank', toAccountId: 'cash', categoryId: 'food', effectiveAt: at('2026-10-06'), ...data });
const report = async () => { const result = await getCategoryAnalysisFirebase('owner'); if (!result.success) throw result.error; return result.data; };
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(at('2026-10-10')); jest.clearAllMocks();
  mockContext.mockResolvedValue({ groupId: 'group', actorId: 'owner', role: 'member' });
  mockAccounts.mockResolvedValue([{ accountId: 'bank', catalog: { name: 'Banco', colorHex: '#123456' }, position: { kind: 'bank' } },
    { accountId: 'cash', catalog: { name: 'Dinheiro' }, position: { kind: 'cash' } }]);
  mockTags.mockResolvedValue({ success: true, data: [{ id: 'food', name: 'Alimentação', usageType: 'both' }, { id: 'work', name: 'Trabalho', usageType: 'both' }] });
  mockEvents.mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());

test('Spark corrige despesa sem inflar ganhos e conserva inverso/substituto por conta', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [expense('original', '2026-10-05', 10000), correction('edit', 'original', 10000, 12000),
    row('pair', 'transfer', { fromAccountId: 'bank', toAccountId: 'cash', amountInCents: 50000 }),
    row('count', 'account_count', { accountId: 'bank', targetBalanceInCents: 100000, differenceInCents: 20000 })]));
  const food = (await report()).reportsByTagId.food;
  expect(food.expense.currentInCents).toBe(12000); expect(food.gain.currentInCents).toBe(0);
  expect(food.bankBreakdown.find(bank => bank.id === 'bank')?.expenseInCents).toBe(0);
  expect(food.bankBreakdown.find(bank => bank.isCash)?.expenseInCents).toBe(12000);
  expect(food.months.at(-1)?.dailyMovementsByDay).toEqual({ '5': { expenseInCents: 10000, gainInCents: 0 }, '6': { expenseInCents: 2000, gainInCents: 0 } });
  expect(food.movements.find(movement => movement.id === 'edit:inverse')).toMatchObject({ name: 'Estorno: Despesa', valueInCents: -10000 });
  expect(mockLegacy).not.toHaveBeenCalled(); expect(mockAccounts).toHaveBeenCalledWith({}, 'owner', 'group', { requireCurrent: false });
});

test('correção que troca categoria reduz a antiga e atribui só o substituto à nova', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [expense('original', '2026-10-05', 10000), correction('edit', 'original', 10000, 12000, { categoryId: 'work' })]));
  const data = await report();
  expect(data.reportsByTagId.food.expense.currentInCents).toBe(0);
  expect(data.reportsByTagId.work.expense.currentInCents).toBe(12000);
});

test('estorno no mês atual conserva o histórico do mês anterior e um valor líquido negativo no mês atual', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [expense('original', '2026-09-05', 10000),
    row('undo', 'movement_reversal', { originalSource: 'live', originalOperationId: 'original', accountId: 'bank', movementKind: 'expense', differenceInCents: 10000 })]));
  const food = (await report()).reportsByTagId.food;
  expect(food.months.find(month => month.key === '2026-09')?.expenseInCents).toBe(10000);
  expect(food.expense.currentInCents).toBe(-10000); expect(food.gain.currentInCents).toBe(0);
});

test('correção de receita reduz renda em vez de criar uma despesa', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [row('salary', 'income', { accountId: 'bank', categoryId: 'work', differenceInCents: 50000 }),
    correction('edit', 'salary', 50000, 40000, { movementKind: 'income', originalDeltaInCents: 50000, differenceInCents: 40000, categoryId: 'work' })]));
  const work = (await report()).reportsByTagId.work;
  expect(work.gain.currentInCents).toBe(40000); expect(work.expense.currentInCents).toBe(0);
});

test('intervalos usam o dia civil de São Paulo e excluem eventos futuros e entre histórico e mês atual', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [expense('history', '2026-08-05', 100),
    expense('future', '2026-10-11', 90000), expense('gap', '2026-06-05', 90000),
    row('before', 'expense', { accountId: 'bank', categoryId: 'food', differenceInCents: -200, effectiveAt: new Date('2026-10-01T02:59:59Z') }),
    row('midnight', 'expense', { accountId: 'bank', categoryId: 'food', differenceInCents: -300, effectiveAt: new Date('2026-10-01T03:00Z') })]));
  const food = (await report()).reportsByTagId.food;
  expect(food.expense.currentInCents).toBe(300);
  expect(food.months.find(month => month.key === '2026-09')?.expenseInCents).toBe(200);
  expect(food.movements.map(movement => movement.id).sort()).toEqual(['before:movement', 'history:movement', 'midnight:movement']);
});

test('falhas de contexto ou histórico não causam fallback nem relatório vazio de sucesso', async () => {
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    mockEvents.mockRejectedValueOnce(new Error('Histórico incompleto.'));
    expect(await getCategoryAnalysisFirebase('owner')).toMatchObject({ success: false, error: expect.any(Error) });
    mockContext.mockRejectedValueOnce(new Error('Revogado.'));
    expect(await getCategoryAnalysisFirebase('owner')).toMatchObject({ success: false, error: expect.any(Error) });
    expect(mockLegacy).not.toHaveBeenCalled();
  } finally { errorLog.mockRestore(); }
});

test('troca de grupo enquanto o relatório é montado descarta a resposta', async () => {
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    mockContext.mockResolvedValueOnce({ groupId: 'group', actorId: 'owner' }).mockResolvedValueOnce({ groupId: 'other', actorId: 'owner' });
    expect(await getCategoryAnalysisFirebase('owner')).toMatchObject({ success: false, error: expect.any(Error) });
    expect(mockLegacy).not.toHaveBeenCalled();
  } finally { errorLog.mockRestore(); }
});

test('um relatório volumoso não confirma centavos arredondados além do limite inteiro seguro', async () => {
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', Array.from({ length: 9008 }, (_, index) => expense(`large-${index}`, '2026-10-05', 1e12))));
    const result = await getCategoryAnalysisFirebase('owner');
    expect(result).toMatchObject({ success: false });
    if (!result.success) expect(String(result.error)).toMatch(/limite de centavos inteiros/);
  } finally { errorLog.mockRestore(); }
});
