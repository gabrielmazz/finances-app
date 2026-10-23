import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useMovementFormEntry } from '@/hooks/useMovementFormEntry';
let mockUid: string | null = 'owner';
jest.mock('@/FirebaseConfig', () => ({ auth: { get currentUser() { return mockUid ? { uid: mockUid } : null; } } }));
const initialize = jest.fn(), loadSpark = jest.fn(), loadLegacy = jest.fn();
const record = { name: 'Mercado', valueInCents: 1250, moneyFormat: false, bankId: 'bank', tagId: 'category' };
const options = { initialize, loadSpark, loadLegacy };
beforeEach(() => { mockUid = 'owner'; initialize.mockReset().mockResolvedValue(true); loadSpark.mockReset().mockResolvedValue({ success: true, data: record }); loadLegacy.mockReset().mockResolvedValue({ success: true, data: record }); });

test('cadastro só fica pronto depois de confirmar o contexto; não consulta lançamento legado', async () => {
  let finish!: (value: boolean) => void;
  initialize.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { result, unmount } = await renderHook(() => useMovementFormEntry({ ...options, movementId: null }));
  expect(result.current.ready).toBe(false); expect(result.current.loading).toBe(true);
  await act(async () => { finish(true); });
  expect(result.current.ready).toBe(true); expect(result.current.record).toBeNull();
  expect(loadSpark).not.toHaveBeenCalled(); expect(loadLegacy).not.toHaveBeenCalled(); await unmount();
});

test('erro de contexto permanece bloqueado até nova tentativa bem-sucedida', async () => {
  initialize.mockRejectedValueOnce(new Error('Grupo indisponível'));
  const { result, unmount } = await renderHook(() => useMovementFormEntry({ ...options, movementId: null }));
  await waitFor(() => expect(result.current.error).toBe('Grupo indisponível'));
  expect(result.current.ready).toBe(false); expect(result.current.loading).toBe(false);
  await act(async () => { result.current.retry(); });
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.error).toBeNull(); expect(loadLegacy).not.toHaveBeenCalled(); await unmount();
});

test('edição usa referência e fonte canônicas Spark sem consultar a coleção antiga', async () => {
  const { result, unmount } = await renderHook(() => useMovementFormEntry({ ...options, movementId: 'operation', source: 'live' }));
  await waitFor(() => expect(result.current.record).toEqual(record));
  expect(loadSpark).toHaveBeenCalledWith('operation', 'live'); expect(loadLegacy).not.toHaveBeenCalled();
  expect(initialize).not.toHaveBeenCalled(); await unmount();
});

test('falha Spark nunca autoriza leitura legada nem edição vazia', async () => {
  loadSpark.mockRejectedValueOnce(new Error('Acesso revogado'));
  const { result, unmount } = await renderHook(() => useMovementFormEntry({ ...options, movementId: 'operation', source: 'live' }));
  await waitFor(() => expect(result.current.error).toBe('Acesso revogado'));
  expect(result.current.ready).toBe(false); expect(result.current.record).toBeNull(); expect(loadLegacy).not.toHaveBeenCalled(); await unmount();
});

test('ausência do documento legado não libera o envio e permite tentar carregar novamente', async () => {
  loadSpark.mockResolvedValue(null); loadLegacy.mockResolvedValueOnce({ success: false });
  const { result, unmount } = await renderHook(() => useMovementFormEntry({ ...options, movementId: 'legacy' }));
  await waitFor(() => expect(result.current.error).toMatch(/carregar/));
  expect(result.current.ready).toBe(false);
  await act(async () => { result.current.retry(); });
  await waitFor(() => expect(result.current.record).toEqual(record));
  expect(loadLegacy).toHaveBeenCalledWith('legacy'); await unmount();
});

test('resposta de outra rota ou fonte não substitui o lançamento atual', async () => {
  let finish!: (value: unknown) => void;
  loadSpark.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { result, rerender, unmount } = await renderHook(({ source }: { source: string }) => useMovementFormEntry({ ...options, movementId: 'same-id', source }), { initialProps: { source: 'imported' } });
  await rerender({ source: 'live' });
  await waitFor(() => expect(result.current.record).toEqual(record));
  await act(async () => { finish({ success: true, data: { ...record, name: 'Antigo' } }); });
  expect(result.current.record?.name).toBe('Mercado'); await unmount();
});

test('sessão ausente ou alterada durante a carga não libera dados nem envio', async () => {
  mockUid = null;
  const { result, unmount } = await renderHook(() => useMovementFormEntry({ ...options, movementId: null }));
  await waitFor(() => expect(result.current.error).toMatch(/Entre novamente/));
  expect(initialize).not.toHaveBeenCalled();
  mockUid = 'owner'; initialize.mockImplementationOnce(async () => { mockUid = 'other'; return true; });
  await act(async () => { result.current.retry(); });
  await waitFor(() => expect(result.current.error).toMatch(/sessão/));
  expect(result.current.ready).toBe(false); await unmount();
});
