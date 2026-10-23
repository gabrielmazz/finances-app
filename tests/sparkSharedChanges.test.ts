const mockAuth = { currentUser: { uid: 'A' } as { uid: string } | null };
const mockStorage = new Map<string, string>();
const mockContext = jest.fn();
const mockRead = jest.fn();
const mockSet = jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); });
jest.mock('@/FirebaseConfig', () => ({ auth: mockAuth, db: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: async (key: string) => mockStorage.get(key) ?? null, setItem: (...args: [string, string]) => mockSet(...args) }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkSharedChangesFirebase', () => ({ ...jest.requireActual('@/functions/SparkSharedChangesFirebase'), readSparkSharedChangesFirebase: (...args: unknown[]) => mockRead(...args) }));

const cursor = { seconds: 1780000000, nanoseconds: 123000, id: 'notice_123456' };
const service = () => (require('@/utils/sparkSharedChanges') as typeof import('@/utils/sparkSharedChanges')).synchronizeSparkSharedChanges;
beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks(); mockStorage.clear(); mockAuth.currentUser = { uid: 'A' };
  mockContext.mockResolvedValue({ groupId: 'group', actorId: 'A', role: 'member' });
  mockRead.mockResolvedValue({ cursor, changedCount: 2, hasMore: false });
});
test('aviso confirma o cursor somente depois da apresentação e conserva seu escopo por UID/grupo', async () => {
  const announce = jest.fn(() => expect(mockSet).not.toHaveBeenCalled());
  await expect(service()('A', () => true, announce)).resolves.toBe('spark');
  expect(announce).toHaveBeenCalledWith(2, false); expect(mockSet).toHaveBeenCalledWith('@lumusSparkChanges:v1:A:group', JSON.stringify(cursor));
  mockAuth.currentUser = { uid: 'B' }; mockContext.mockResolvedValue({ groupId: 'group' });
  await service()('B', () => true, jest.fn()); expect(mockRead.mock.calls.at(-1)?.[3]).toBe(null);
});
test('falha de rede conserva o cursor para a próxima tentativa', async () => {
  mockStorage.set('@lumusSparkChanges:v1:A:group', JSON.stringify(cursor)); mockRead.mockRejectedValueOnce(new Error('offline'));
  const announce = jest.fn(); await expect(service()('A', () => true, announce)).rejects.toThrow('offline');
  expect(mockSet).not.toHaveBeenCalled(); expect(announce).not.toHaveBeenCalled();
  await service()('A', () => true, announce); expect(mockRead.mock.calls.at(-1)?.[3]).toEqual(cursor);
});
test('troca de sessão durante a leitura impede aviso tardio e avanço do cursor', async () => {
  mockRead.mockImplementationOnce(async () => { mockAuth.currentUser = { uid: 'B' }; return { cursor, changedCount: 2 }; });
  const announce = jest.fn(); await expect(service()('A', () => true, announce)).resolves.toBe('cancelled');
  expect(announce).not.toHaveBeenCalled(); expect(mockSet).not.toHaveBeenCalled();
});
test('contexto legado conserva o transporte anterior e erro de acesso nunca vira fallback', async () => {
  mockContext.mockResolvedValueOnce(null); await expect(service()('A', () => true, jest.fn())).resolves.toBe('legacy');
  mockContext.mockRejectedValueOnce(new Error('revogado')); await expect(service()('A', () => true, jest.fn())).rejects.toThrow('revogado');
  expect(mockRead).not.toHaveBeenCalled(); expect(mockSet).not.toHaveBeenCalled();
});
test('falha de apresentação não marca o aviso como visto', async () => {
  await expect(service()('A', () => true, () => { throw new Error('apresentação indisponível'); })).rejects.toThrow('apresentação'); expect(mockSet).not.toHaveBeenCalled();
});
test('autenticação e foreground simultâneos compartilham uma única leitura/apresentação', async () => {
  const sync = service(), announce = jest.fn(); const first = sync('A', () => true, announce), second = sync('A', () => true, announce);
  expect(first).toBe(second); await Promise.all([first, second]); expect(mockRead).toHaveBeenCalledTimes(1); expect(announce).toHaveBeenCalledTimes(1);
});
test('uma nova sessão do mesmo UID não herda uma execução cancelada ainda pendente', async () => {
  let release!: () => void; let active = true;
  mockContext.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ groupId: 'group' }); }));
  const sync = service(), old = sync('A', () => active, jest.fn()); active = false;
  const announce = jest.fn(); await expect(sync('A', () => true, announce)).resolves.toBe('spark'); release(); await expect(old).resolves.toBe('cancelled');
  expect(announce).toHaveBeenCalledTimes(1); expect(mockRead).toHaveBeenCalledTimes(1);
});
test('recupera várias páginas na abertura e apresenta somente um resumo após terminar', async () => {
  mockRead.mockResolvedValueOnce({ cursor, changedCount: 100, hasMore: true }).mockResolvedValueOnce({ cursor: { ...cursor, id: 'notice_123457' }, changedCount: 7, hasMore: false });
  const announce = jest.fn(); await service()('A', () => true, announce);
  expect(mockRead).toHaveBeenCalledTimes(2); expect(announce).toHaveBeenCalledWith(107, false); expect(mockSet).toHaveBeenCalledTimes(1);
});
test('backlog grande mantém limite de cinco páginas e informa continuação sem consumir registros não lidos', async () => {
  let page = 0; mockRead.mockImplementation(async () => ({ cursor: { ...cursor, id: `notice_${String(++page).padStart(8, '0')}` }, changedCount: 100, hasMore: true }));
  const announce = jest.fn(); await service()('A', () => true, announce);
  expect(mockRead).toHaveBeenCalledTimes(5); expect(announce).toHaveBeenCalledWith(500, true);
  expect(JSON.parse(mockStorage.get('@lumusSparkChanges:v1:A:group')!)).toMatchObject({ id: 'notice_00000005' });
});
