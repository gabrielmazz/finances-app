import { act, renderHook } from '@testing-library/react-native';
import { useFinancialForecastData } from '@/hooks/useFinancialForecastData';
import type { FinancialForecastData, FinancialForecastPeriod } from '@/utils/financialForecast';
const mockLoad = jest.fn();
let mockUid: string | null = 'owner';
jest.mock('@/FirebaseConfig', () => ({ auth: { get currentUser() { return mockUid ? { uid: mockUid } : null; } } }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUid ? { uid: mockUid } : null }) }));
jest.mock('@/functions/FinancialForecastFirebase', () => ({ getFinancialForecastFirebase: (...args: unknown[]) => mockLoad(...args) }));
jest.mock('expo-router', () => ({ useFocusEffect: (callback: any) => require('react').useEffect(callback, [callback]) }));
const data = (periodInMonths: FinancialForecastPeriod, openingBalanceInCents = 100000): FinancialForecastData => ({ generatedAt: new Date(), periodInMonths, openingBalanceInCents, finalBalanceInCents: openingBalanceInCents, totalGainsInCents: 0, totalExpensesInCents: 0, historicalMonthsUsed: 3, missingSnapshotBankNames: [], months: [] });
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => { mockUid = 'owner'; mockLoad.mockReset().mockImplementation(async (_uid, period) => ({ success: true, data: data(period) })); });
test('recarrega por horizonte e descarta resposta anterior', async () => {
  const old = deferred(); mockLoad.mockReturnValueOnce(old.promise); const view = await renderHook(({ period }: { period: FinancialForecastPeriod }) => useFinancialForecastData('owner', period), { initialProps: { period: 3 as FinancialForecastPeriod } });
  await view.rerender({ period: 12 }); expect(view.result.current.forecast?.periodInMonths).toBe(12); await act(async () => old.resolve({ success: true, data: data(3) })); expect(view.result.current.forecast?.periodInMonths).toBe(12); await view.unmount();
});
test('refresh limpa o cenário anterior enquanto a nova consulta está pendente', async () => {
  const view = await renderHook(() => useFinancialForecastData('owner', 3)); expect(view.result.current.forecast?.openingBalanceInCents).toBe(100000); const next = deferred(); mockLoad.mockReturnValueOnce(next.promise);
  let pending!: Promise<void>; await act(async () => { pending = view.result.current.loadForecast(true); }); expect(view.result.current.forecast).toBeNull(); expect(view.result.current.isRefreshing).toBe(true);
  await act(async () => next.resolve({ success: true, data: data(3, 90000) })); await pending; expect(view.result.current.forecast?.openingBalanceInCents).toBe(90000); expect(view.result.current.isRefreshing).toBe(false); await view.unmount();
});
test.each(['returned', 'thrown'])('falha %s encerra carregamento e permite retry sem dados antigos', async mode => {
  if (mode === 'thrown') mockLoad.mockRejectedValueOnce(new Error('Sem conexão')); else mockLoad.mockResolvedValueOnce({ success: false, error: 'Sem conexão' });
  const view = await renderHook(() => useFinancialForecastData('owner', 6)); expect(view.result.current.forecast).toBeNull(); expect(view.result.current.errorMessage).toBe('Sem conexão'); expect(view.result.current.isLoading || view.result.current.isRefreshing).toBe(false);
  await act(async () => view.result.current.loadForecast()); expect(view.result.current.forecast?.periodInMonths).toBe(6); expect(view.result.current.errorMessage).toBeNull(); await view.unmount();
});
test('troca de UID e logout removem o cenário anterior', async () => {
  const old = deferred(); mockLoad.mockReturnValueOnce(old.promise); const view = await renderHook(({ uid }: { uid: string | null }) => useFinancialForecastData(uid, 3), { initialProps: { uid: 'owner' as string | null } });
  mockUid = 'other'; await view.rerender({ uid: 'other' }); await act(async () => old.resolve({ success: true, data: data(3, 999999) })); expect(view.result.current.forecast?.openingBalanceInCents).toBe(100000);
  mockUid = null; await view.rerender({ uid: null }); expect(view.result.current.forecast).toBeNull(); expect(view.result.current.isLoading || view.result.current.isRefreshing).toBe(false); expect(view.result.current.errorMessage).toContain('autenticado'); await view.unmount();
});
test('duas atualizações do mesmo horizonte conservam apenas a mais recente', async () => {
  const old = deferred(); mockLoad.mockReturnValueOnce(old.promise); const view = await renderHook(() => useFinancialForecastData('owner', 3)); await act(async () => view.result.current.loadForecast(true));
  await act(async () => old.resolve({ success: true, data: data(3, 999999) })); expect(view.result.current.forecast?.openingBalanceInCents).toBe(100000); await view.unmount();
});
