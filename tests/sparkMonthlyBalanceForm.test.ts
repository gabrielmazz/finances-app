import { act, renderHook } from '@testing-library/react-native';
import { useSparkMonthlyBalanceForm } from '@/hooks/useSparkMonthlyBalanceForm';
import type { SparkBalanceDraft } from '@/functions/SparkBalanceFormFirebase';
const mockPrepare = jest.fn(), mockSave = jest.fn(), mockInvalidate = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ db: {}, auth: { currentUser: { uid: 'owner' } } }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ createFinancialClientActionId: () => 'monthly_action_123456' }));
jest.mock('@/functions/SparkBalanceFormFirebase', () => ({
  prepareSparkBalanceFormFirebase: (...args: unknown[]) => mockPrepare(...args),
  submitSparkBalanceFormFirebase: (...args: unknown[]) => mockSave(...args),
  sparkBalanceDraftKey: (draft: unknown) => JSON.stringify(draft),
}));
const input: SparkBalanceDraft = { actorId: 'owner', accountId: 'bank', mode: 'monthly', date: '2026-10', targetBalanceInCents: 20000, note: null };
beforeEach(() => {
  mockPrepare.mockReset().mockResolvedValue({ base: 10000, proof: { workRevision: 4 } });
  mockSave.mockReset().mockResolvedValue({ id: 'monthly_action_123456' });
  mockInvalidate.mockReset().mockResolvedValue(undefined);
});
test('preparar não grava abertura; confirmação explícita posterior salva e invalida o UID', async () => {
  const { result, unmount } = await renderHook(() => useSparkMonthlyBalanceForm(input));
  await act(async () => { expect((await result.current.submit()).kind).toBe('ready'); });
  expect(mockSave).not.toHaveBeenCalled(); expect(result.current.ready).toBe(true);
  await act(async () => { expect((await result.current.submit()).kind).toBe('saved'); });
  expect(mockSave).toHaveBeenCalledTimes(1); expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['finance', 'owner'], refetchType: 'all' });
  await unmount();
});
test('alterar valor depois da prévia exige outra apresentação antes de confirmar', async () => {
  const { result, rerender, unmount } = await renderHook((props: unknown) => useSparkMonthlyBalanceForm((props as { draft: SparkBalanceDraft }).draft), { initialProps: { draft: input } });
  await act(async () => { await result.current.submit(); });
  await rerender({ draft: { ...input, targetBalanceInCents: 30000 } });
  expect(result.current.ready).toBe(false);
  await act(async () => { await result.current.submit(); });
  expect(mockSave).not.toHaveBeenCalled(); expect(mockPrepare).toHaveBeenCalledTimes(2);
  await unmount();
});
test('prévia parcial pode continuar sem confirmar saldo', async () => {
  mockPrepare.mockResolvedValueOnce({ base: null, proof: { workRevision: 20 } });
  const { result, unmount } = await renderHook(() => useSparkMonthlyBalanceForm(input));
  await act(async () => { expect((await result.current.submit()).kind).toBe('preparing'); });
  expect(result.current.progress).toContain('20 etapas'); expect(result.current.ready).toBe(false);
  await act(async () => { await result.current.submit(); });
  expect(result.current.ready).toBe(true); expect(mockSave).not.toHaveBeenCalled();
  await unmount();
});
test('revisão rejeitada retém rascunho e exige nova preparação', async () => {
  const { result, unmount } = await renderHook(() => useSparkMonthlyBalanceForm(input));
  await act(async () => { await result.current.submit(); });
  mockSave.mockRejectedValueOnce(new Error('A prévia ficou desatualizada.'));
  await act(async () => { await expect(result.current.submit()).rejects.toThrow('desatualizada'); });
  expect(result.current.ready).toBe(false);
  await act(async () => { await result.current.submit(); });
  expect(mockPrepare).toHaveBeenCalledTimes(2); expect(mockSave).toHaveBeenCalledTimes(1);
  await unmount();
});
test('falha de contexto não é resultado legado e não salva saldo', async () => {
  mockPrepare.mockRejectedValueOnce(new Error('Acesso financeiro revogado.'));
  const { result, unmount } = await renderHook(() => useSparkMonthlyBalanceForm(input));
  await act(async () => { await expect(result.current.submit()).rejects.toThrow('revogado'); });
  expect(mockSave).not.toHaveBeenCalled(); expect(result.current.ready).toBe(false);
  await unmount();
});
test('somente contexto legado explícito devolve o fluxo anterior', async () => {
  mockPrepare.mockResolvedValueOnce(null);
  const { result, unmount } = await renderHook(() => useSparkMonthlyBalanceForm(input));
  await act(async () => { expect((await result.current.submit()).kind).toBe('legacy'); });
  expect(mockSave).not.toHaveBeenCalled(); await unmount();
});
