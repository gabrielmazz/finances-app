import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCategoryFormRecord } from '@/hooks/useCategoryFormRecord';
import { createAssistantRecordFingerprint } from '@/utils/assistantRecordFingerprint';

const mockRead = jest.fn();
let mockUid: string | null = 'owner';
jest.mock('@/FirebaseConfig', () => ({ auth: { get currentUser() { return mockUid ? { uid: mockUid } : null; } } }));
jest.mock('@/functions/TagFirebase', () => ({ getTagDataFirebase: (...args: unknown[]) => mockRead(...args) }));
const category = { name: 'Casa', personId: 'owner', usageType: 'expense', revision: 0 };
beforeEach(() => { mockUid = 'owner'; mockRead.mockReset().mockResolvedValue({ success: true, data: category }); });

test('criação não consulta um cadastro inexistente; edição exige a fonte servidor', async () => {
  const { result, rerender, unmount } = await renderHook(({ id }: { id: string | null }) => useCategoryFormRecord(id), { initialProps: { id: null } });
  expect(mockRead).not.toHaveBeenCalled(); expect(result.current.isLoading).toBe(false);
  await rerender({ id: 'category' });
  await waitFor(() => expect(result.current.record).toEqual(category));
  expect(mockRead).toHaveBeenCalledWith('category', { fromServer: true });
  await unmount();
});

test('após salvar, bloqueia a edição enquanto recarrega e usa a nova revisão na próxima confirmação', async () => {
  const { result, unmount } = await renderHook(() => useCategoryFormRecord('category'));
  await waitFor(() => expect(result.current.record).toEqual(category));
  const fingerprint = createAssistantRecordFingerprint(result.current.record!);
  let finish!: (value: unknown) => void;
  mockRead.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await act(async () => { result.current.reload(); });
  expect(result.current.record).toBeNull(); expect(result.current.isLoading).toBe(true);
  const updated = { ...category, name: 'Moradia', revision: 1 };
  await act(async () => { finish({ success: true, data: updated }); });
  expect(result.current.record).toEqual(updated);
  expect(createAssistantRecordFingerprint(result.current.record!)).not.toBe(fingerprint);
  await unmount();
});

test('falha de rede libera uma nova tentativa sem expor o registro anterior como editável', async () => {
  mockRead.mockRejectedValueOnce(new Error('offline'));
  const { result, unmount } = await renderHook(() => useCategoryFormRecord('category'));
  await waitFor(() => expect(result.current.error).toBe('offline'));
  expect(result.current.record).toBeNull(); expect(result.current.isLoading).toBe(false);
  await act(async () => { result.current.reload(); });
  await waitFor(() => expect(result.current.record).toEqual(category));
  expect(result.current.error).toBeNull(); await unmount();
});

test('categoria ausente ou de outro proprietário não libera o formulário', async () => {
  mockRead.mockResolvedValueOnce({ success: false, error: 'missing' });
  const { result, unmount } = await renderHook(() => useCategoryFormRecord('category'));
  await waitFor(() => expect(result.current.error).toMatch(/carregar/));
  mockRead.mockResolvedValueOnce({ success: true, data: { ...category, personId: 'member' } });
  await act(async () => { result.current.reload(); });
  await waitFor(() => expect(result.current.error).toMatch(/proprietário/));
  expect(result.current.record).toBeNull(); await unmount();
});

test('resposta antiga não substitui outra categoria aberta depois', async () => {
  let finish!: (value: unknown) => void;
  mockRead.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { result, rerender, unmount } = await renderHook(({ id }: { id: string }) => useCategoryFormRecord(id), { initialProps: { id: 'old' } });
  await rerender({ id: 'new' });
  await waitFor(() => expect(result.current.record).toEqual(category));
  await act(async () => { finish({ success: true, data: { ...category, name: 'Antiga' } }); });
  expect(result.current.record?.name).toBe('Casa'); await unmount();
});

test('ausência ou troca de sessão durante a leitura impede a edição', async () => {
  mockUid = null;
  const { result, unmount } = await renderHook(() => useCategoryFormRecord('category'));
  await waitFor(() => expect(result.current.error).toMatch(/Entre novamente/));
  expect(mockRead).not.toHaveBeenCalled();
  mockUid = 'owner'; mockRead.mockImplementationOnce(async () => { mockUid = 'other'; return { success: true, data: category }; });
  await act(async () => { result.current.reload(); });
  await waitFor(() => expect(result.current.error).toMatch(/sessão/));
  expect(result.current.record).toBeNull(); await unmount();
});
