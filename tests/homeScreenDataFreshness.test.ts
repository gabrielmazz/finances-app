const mockQuery = jest.fn();
jest.mock('react', () => ({ __esModule: true, default: { useCallback: (callback: unknown) => callback } }));
jest.mock('@/hooks/useFinanceQueries', () => ({ useHomeQuery: (...args: unknown[]) => mockQuery(...args) }));
jest.mock('@/functions/HomeFirebase', () => ({ EMPTY_HOME_OVERVIEW_DATA: { bankBalances: [] }, EMPTY_HOME_MOVEMENTS_DATA: { timelineMovements: [] }, createEmptyInvestmentPortfolio: () => ({ items: [] }) }));
import { useHomeScreenData } from '@/hooks/useHomeScreenData';
const data = (extra: Record<string, unknown> = {}) => ({ financialSource: 'spark', currentUntil: Date.now() + 10000,
  overview: { success: true, data: { bankBalances: [{ id: 'bank', balanceInCents: 1000 }] } },
  movements: { success: true, data: { timelineMovements: [{ id: 'movement' }] } },
  investments: { success: false, error: 'Capital precisa de reconciliação.' }, ...extra });
const read = (snapshot: unknown, error: unknown = null, fetching = false) => {
  mockQuery.mockReturnValue({ data: snapshot, error, isLoading: false, isFetching: fetching, refetch: jest.fn() });
  return useHomeScreenData('owner');
};
test('erro de revalidação esconde cache Spark anterior, inclusive depois de acesso revogado', () => {
  const result = read(data(), new Error('permission-denied'));
  expect(result.overview.data.bankBalances).toEqual([]); expect(result.movements.data.timelineMovements).toEqual([]);
  expect(result.overview.error).toBe('Não foi possível carregar os dados da Home.');
});
test('abertura vencida esconde saldo anterior enquanto atualiza e exige atualização se não está carregando', () => {
  const expired = data({ currentUntil: Date.now() - 1 });
  const loading = read(expired, null, true);
  expect(loading.overview.data.bankBalances).toEqual([]); expect(loading.overview.loading).toBe(true); expect(loading.overview.error).toBeNull();
  expect(read(expired).overview.error).toBe('Atualize os saldos para continuar.');
});
test('fotografia vigente mantém dados disponíveis e erro independente da carteira', () => {
  const result = read(data()); expect(result.overview.data.bankBalances).toHaveLength(1); expect(result.overview.error).toBeNull();
  expect(result.investments.error).toBe('Capital precisa de reconciliação.');
});
test('cache restaurado não é exibido como saldo atual durante sua revalidação Spark', () => {
  const result = read(data(), null, true);
  expect(result.overview.data.bankBalances).toEqual([]); expect(result.overview.loading).toBe(true); expect(result.overview.error).toBeNull();
});
test('cache legado preserva a política anterior durante erro de atualização', () => {
  expect(read(data({ financialSource: undefined }), new Error('offline')).overview.data.bankBalances).toHaveLength(1);
});


test('sem sessão não exibe snapshot residual, inclusive do transporte legado', () => {
  mockQuery.mockReturnValue({ data: data({ financialSource: undefined }), error: null, isLoading: false, isFetching: false, refetch: jest.fn() });
  const result = useHomeScreenData(null);
  expect(result.overview.data.bankBalances).toEqual([]);
  expect(result.movements.data.timelineMovements).toEqual([]);
  expect(result.overview.error).toMatch(/autenticado/);
});
