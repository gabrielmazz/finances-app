import { act, renderHook } from '@testing-library/react-native';
import { useUserRelationships } from '@/hooks/useUserRelationships';
const mockLoad = jest.fn(), mockRun = jest.fn();
let mockOnFocus: () => void, mockOnBlur: (() => void) | undefined;
let mockUid: string | null = 'owner';
const mockAuth = { currentUser: { uid: 'owner' } as { uid: string } | null };
jest.mock('@/FirebaseConfig', () => ({ get auth() { return mockAuth; } }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUid ? { uid: mockUid } : null }) }));
jest.mock('expo-router', () => ({ useFocusEffect: (effect: any) => { mockOnFocus = effect; require('react').useEffect(() => { mockOnBlur = effect(); return mockOnBlur; }, [effect]); } }));
jest.mock('@/functions/UserRelationshipFirebase', () => ({ loadUserRelationshipsFirebase: (...args: unknown[]) => mockLoad(...args), runUserRelationshipFirebase: (...args: unknown[]) => mockRun(...args) }));
const deferred = <T,>() => { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; };
const preview = { fingerprint: 'snapshot', relatedUserName: 'Conta informada', hasIncomingInvite: false, isLinked: false };
beforeEach(() => { mockUid = 'owner'; mockAuth.currentUser = { uid: 'owner' }; mockLoad.mockReset().mockResolvedValue({ incoming: [], outgoing: [], linked: [] }); mockRun.mockReset().mockImplementation(async (_uid: string, command: any) => command.action === 'preview' ? preview : { status: 'invited', changed: true }); });
async function prepare(view: any) { await act(async () => view.result.current.changeName('target')); await act(async () => view.result.current.prepare('link')); }
test('revisão não escreve e confirmação usa o snapshot e o ID apresentados', async () => {
  const view = await renderHook(useUserRelationships); await prepare(view); expect(mockRun).toHaveBeenCalledTimes(1);
  const prepared = view.result.current.prepared!; expect(prepared.target).toBe('target');
  await act(async () => view.result.current.confirm());
  expect(mockRun).toHaveBeenLastCalledWith('owner', expect.objectContaining({ action: 'link', relatedUserId: 'target', expectedFingerprint: 'snapshot', clientActionId: prepared.clientActionId, isCurrent: expect.any(Function) }));
  expect(view.result.current.prepared).toBeNull(); expect(mockLoad).toHaveBeenCalledTimes(2); await view.unmount();
});
test('falha de leitura permanece explícita e retry preserva o campo', async () => {
  const view = await renderHook(useUserRelationships); await act(async () => view.result.current.changeName('target'));
  mockLoad.mockRejectedValueOnce(new Error('offline')); await act(async () => view.result.current.reload()); expect(view.result.current.loadError).toBeTruthy();
  await act(async () => view.result.current.prepare('link')); expect(mockRun).not.toHaveBeenCalled();
  await act(async () => view.result.current.reload()); expect(view.result.current.loadError).toBe(''); expect(view.result.current.name).toBe('target'); await view.unmount();
});
test('resultado incerto conserva material e bloqueia alteração, cancelamento e recarga', async () => {
  const view = await renderHook(useUserRelationships); await prepare(view); mockRun.mockRejectedValueOnce(new Error('response lost'));
  await act(async () => view.result.current.confirm()); const prepared = view.result.current.prepared!; expect(prepared.attempted).toBe(true);
  await act(async () => { view.result.current.changeName('other'); view.result.current.cancel(); view.result.current.reload(); });
  expect(view.result.current.name).toBe('target'); expect(view.result.current.prepared?.clientActionId).toBe(prepared.clientActionId); expect(mockLoad).toHaveBeenCalledTimes(1);
  await act(async () => view.result.current.confirm()); expect(mockRun.mock.calls[2][1].clientActionId).toBe(mockRun.mock.calls[1][1].clientActionId); await view.unmount();
});
test('trava síncrona impede duplo clique e recarga enquanto a confirmação aguarda', async () => {
  const view = await renderHook(useUserRelationships); await prepare(view); const pending = deferred<any>(); mockRun.mockReturnValueOnce(pending.promise);
  let request!: Promise<any>; await act(async () => { request = view.result.current.confirm(); void view.result.current.confirm(); view.result.current.reload(); });
  expect(mockRun).toHaveBeenCalledTimes(2); expect(view.result.current.busy).toBe(true);
  await act(async () => { pending.resolve({ status: 'invited' }); await request; }); expect(view.result.current.busy).toBe(false); await view.unmount();
});
test('conflito definitivo exige nova revisão, mantendo o ID da conta', async () => {
  const view = await renderHook(useUserRelationships); await prepare(view); mockRun.mockRejectedValueOnce(new Error('Os vínculos mudaram.'));
  await act(async () => view.result.current.confirm()); expect(view.result.current.prepared).toBeNull(); expect(view.result.current.name).toBe('target'); expect(view.result.current.feedback).toContain('confira o efeito'); await view.unmount();
});
test('troca de conta descarta consulta anterior e não confirma material da conta antiga', async () => {
  const view = await renderHook(useUserRelationships); await prepare(view); mockUid = 'other'; mockAuth.currentUser = { uid: 'other' };
  await view.rerender({}); expect(view.result.current.name).toBe(''); expect(view.result.current.prepared).toBeNull();
  await act(async () => view.result.current.confirm()); expect(mockRun).toHaveBeenCalledTimes(1); await view.unmount();
});
test('ausência de sessão encerra carregamento com erro e não consulta o serviço', async () => {
  mockUid = null; mockAuth.currentUser = null; const view = await renderHook(useUserRelationships);
  expect(view.result.current.loading).toBe(false); expect(view.result.current.loadError).toContain('Entre novamente'); expect(mockLoad).not.toHaveBeenCalled(); await view.unmount();
});
test('UID ao vivo bloqueia revisão antes do provider refletir a troca de conta', async () => {
  const view = await renderHook(useUserRelationships); await act(async () => view.result.current.changeName('target')); mockAuth.currentUser = { uid: 'other' };
  await act(async () => view.result.current.prepare('link')); expect(mockRun).not.toHaveBeenCalled(); await view.unmount();
});

test('retorno ao foco recupera confirmação interrompida sem travar o formulário', async () => {
  const view = await renderHook(useUserRelationships); await prepare(view); const pending = deferred<any>(); mockRun.mockReturnValueOnce(pending.promise);
  let request!: Promise<any>; await act(async () => { request = view.result.current.confirm(); });
  const originalId = view.result.current.prepared!.clientActionId;
  await act(async () => mockOnBlur?.()); await act(async () => mockOnFocus());
  await act(async () => { pending.resolve({ status: 'linked' }); await request; });
  expect(view.result.current.busy).toBe(false); expect(view.result.current.prepared?.attempted).toBe(true);
  await act(async () => view.result.current.confirm()); expect(mockRun.mock.calls[2][1].clientActionId).toBe(originalId); await view.unmount();
});
