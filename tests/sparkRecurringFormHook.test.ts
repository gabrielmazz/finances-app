import { act, renderHook } from '@testing-library/react-native';
import { useSparkRecurringForm, useSparkRecurringAction } from '@/hooks/useSparkRecurringForm';
const mockContext = jest.fn(), mockLoad = jest.fn(), mockSubmit = jest.fn(), mockAction = jest.fn(), mockInvalidate = jest.fn();
let mockUid: string | null = 'owner';
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUid ? { uid: mockUid } : null }) }));
jest.mock('@/FirebaseConfig', () => ({ db: {}, auth: { get currentUser() { return mockUid ? { uid: mockUid } : null; } } }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ createFinancialClientActionId: () => 'recurring_action_123456' }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkRecurringFormFirebase', () => ({ loadSparkRecurringFormFirebase: (...args: unknown[]) => mockLoad(...args), submitSparkRecurringFormFirebase: (...args: unknown[]) => mockSubmit(...args), submitSparkRecurringActionFirebase: (...args: unknown[]) => mockAction(...args) }));
const draft: any = { actorId: 'owner', planId: null, name: 'Aluguel', valueInCents: 10000 };
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  mockUid = 'owner'; mockContext.mockReset().mockResolvedValue({ groupId: 'group' }); mockLoad.mockReset().mockResolvedValue({ id: 'plan', personId: 'owner', sparkPlanActive: true });
  mockSubmit.mockReset().mockResolvedValue({ success: true, id: 'plan' }); mockAction.mockReset().mockResolvedValue({ success: true }); mockInvalidate.mockReset().mockResolvedValue(undefined);
});
test('entrada gerenciada aguarda contexto e mantém a guarda Spark após limpar o formulário', async () => {
  const { result, unmount } = await renderHook(() => useSparkRecurringForm('expense', 'create'));
  expect(mockContext).not.toHaveBeenCalled(); await act(async () => result.current.initialize()); expect(result.current.isSpark).toBe(true);
  await act(async () => result.current.reset()); await act(async () => result.current.submit(draft));
  expect(mockSubmit.mock.calls[0][1]).toMatchObject({ readerActorId: 'owner', groupId: 'group' }); await unmount();
});
test('erro de contexto não confirma legado e pode ser repetido', async () => {
  mockContext.mockRejectedValueOnce(new Error('Sem contexto')); const { result, unmount } = await renderHook(() => useSparkRecurringForm('expense', 'create'));
  await act(async () => { await expect(result.current.initialize()).rejects.toThrow('Sem contexto'); }); expect(result.current.isSpark).toBeNull();
  mockContext.mockResolvedValueOnce(null); await act(async () => result.current.initialize()); expect(result.current.isSpark).toBe(false); await unmount();
});
test.each([{ personId: 'other' }, { personId: 'owner', sparkPlanActive: false }])('edição indisponível não prepara o cadastro: %o', async invalid => {
  mockLoad.mockResolvedValueOnce({ id: 'plan', ...invalid }); const { result, unmount } = await renderHook(() => useSparkRecurringForm('expense', 'plan'));
  await act(async () => { await expect(result.current.load('plan')).rejects.toThrow('não está disponível'); }); expect(mockSubmit).not.toHaveBeenCalled(); await unmount();
});
test('fase de metadados pendente conserva o estado e informa incerteza até concluir', async () => {
  mockSubmit.mockImplementationOnce(async (_db, state) => { state.intent = { definitionConfirmed: true, status: 'uncertain' }; throw new Error('Resposta perdida'); });
  const { result, unmount } = await renderHook(() => useSparkRecurringForm('expense', 'create'));
  await act(async () => { await expect(result.current.submit(draft)).rejects.toThrow('Resposta perdida'); }); expect(result.current.isUncertain).toBe(true);
  const work = mockSubmit.mock.calls[0][1]; await act(async () => result.current.reset());
  mockSubmit.mockImplementationOnce(async (_db, state) => { state.intent.status = 'confirmed'; return { success: true, id: 'plan' }; });
  await act(async () => result.current.submit(draft)); expect(mockSubmit.mock.calls[1][1]).toBe(work); expect(result.current.isUncertain).toBe(false); await unmount();
});
test('carregamento antigo de outra rota é descartado', async () => {
  const old = deferred(); mockLoad.mockReturnValueOnce(old.promise);
  const { result, rerender, unmount } = await renderHook(({ route }: { route: string }) => useSparkRecurringForm('expense', route), { initialProps: { route: 'old' } });
  let pending!: Promise<unknown>; await act(async () => { pending = result.current.load('old').catch(reason => reason); });
  await rerender({ route: 'new' }); await act(async () => old.resolve({ personId: 'owner' })); expect(await pending).toBeInstanceOf(Error); expect(result.current.isSpark).toBeNull(); await unmount();
});
test('troca de UID elimina a tentativa incerta anterior', async () => {
  mockSubmit.mockImplementationOnce(async (_db, state) => { state.intent = { status: 'uncertain' }; throw new Error('Offline'); });
  const { result, rerender, unmount } = await renderHook(() => useSparkRecurringForm('expense', 'create'));
  await act(async () => { await result.current.submit(draft).catch(() => {}); }); mockUid = 'other'; await rerender({});
  expect(result.current.isUncertain).toBe(false); await act(async () => result.current.submit({ ...draft, actorId: 'other' })); expect(mockSubmit.mock.calls[1][1]).not.toBe(mockSubmit.mock.calls[0][1]); await unmount();
});
test('ação incerta conserva o mesmo estado até o receipt ser confirmado', async () => {
  mockAction.mockImplementationOnce(async (_db, state) => { state.intent = { status: 'uncertain' }; throw new Error('Offline'); });
  const { result, unmount } = await renderHook(() => useSparkRecurringAction('expense')); const input = { planId: 'plan', action: 'reverse' as const };
  await act(async () => { await result.current.submit(input).catch(() => {}); }); expect(result.current.isUncertain).toBe(true); expect(result.current.hasPending()).toBe(true);
  await act(async () => result.current.submit(input)); expect(mockAction.mock.calls[1][1]).toBe(mockAction.mock.calls[0][1]); expect(result.current.hasPending()).toBe(false); await unmount();
});
test('falha síncrona de cache não transforma cadastro confirmado em falha de escrita', async () => {
  mockInvalidate.mockImplementationOnce(() => { throw new Error('cache'); }); const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try { const { result, unmount } = await renderHook(() => useSparkRecurringForm('expense', 'create')); await act(async () => { await expect(result.current.submit(draft)).resolves.toMatchObject({ id: 'plan' }); }); expect(result.current.isUncertain).toBe(false); await unmount(); } finally { warning.mockRestore(); }
});
