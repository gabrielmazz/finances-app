const mockStorage = new Map<string, string>();
const mockSet = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => mockStorage.get(key) ?? null,
  setItem: (...args: unknown[]) => mockSet(...args),
  removeItem: async (key: string) => { mockStorage.delete(key); },
}));
import { createLocalAnnotation, saveLocalAnnotations, clearLocalAnnotationsForLogout,
  loadLocalAnnotations, resumeLocalAnnotationsAfterFailedLogout } from '@/utils/localAnnotations';

beforeEach(() => {
  mockStorage.clear(); mockSet.mockReset();
  mockSet.mockImplementation(async (key: string, value: string) => { mockStorage.set(key, value); });
  resumeLocalAnnotationsAfterFailedLogout('A'); resumeLocalAnnotationsAfterFailedLogout('B');
});
it('waits for an in-flight write before clearing A and preserves B', async () => {
  await saveLocalAnnotations('B', [{ ...createLocalAnnotation(), title: 'Privado B' }]);
  let finish!: () => void;
  let started!: () => void;
  const startedWrite = new Promise<void>(resolve => { started = resolve; });
  mockSet.mockImplementationOnce((key: string, value: string) => {
    started(); return new Promise<void>(resolve => { finish = () => { mockStorage.set(key, value); resolve(); }; });
  });
  const saving = saveLocalAnnotations('A', [{ ...createLocalAnnotation(), title: 'Privado A' }]);
  await startedWrite;
  const cleanup = clearLocalAnnotationsForLogout('A');
  const lateSave = expect(saveLocalAnnotations('A', [])).rejects.toThrow('sessão está sendo encerrada');
  finish(); await saving; await cleanup; await lateSave;
  expect(await loadLocalAnnotations('A')).toEqual([]);
  expect(await loadLocalAnnotations('B')).toEqual([expect.objectContaining({ title: 'Privado B' })]);
  await expect(saveLocalAnnotations('A', [])).rejects.toThrow('sessão está sendo encerrada');
  resumeLocalAnnotationsAfterFailedLogout('A'); await expect(saveLocalAnnotations('A', [])).resolves.toBeUndefined();
});
