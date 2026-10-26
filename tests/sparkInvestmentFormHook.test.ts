import { act, renderHook } from '@testing-library/react-native';
import { useSparkInvestmentForm } from '@/hooks/useSparkInvestmentForm';
const mockSubmit = jest.fn(), mockInvalidate = jest.fn();
let mockUid = 'owner', mockProjectId = 'test-project';
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: mockUid } }) }));
jest.mock('@/FirebaseConfig', () => ({ db: { app: { get options() { return { projectId: mockProjectId }; } } }, auth: { get currentUser() { return { uid: mockUid }; } } }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ createFinancialClientActionId: () => 'investment_123456' }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: jest.fn() }));
jest.mock('@/functions/SparkInvestmentFormFirebase', () => ({ submitSparkInvestmentFormFirebase: (...args: unknown[]) => mockSubmit(...args) }));
const params = { personId: 'owner', name: 'CDB', bankId: 'bank', initialValueInCents: 30000, cdiPercentage: 100, cdiPercentageInBasisPoints: 10000, redemptionTerm: 'anytime' as const, date: new Date('2026-10-23T15:00:00Z') };
beforeEach(() => { mockUid = 'owner'; mockProjectId = 'test-project'; mockSubmit.mockReset().mockResolvedValue({ success: true, investmentId: 'asset' }); mockInvalidate.mockReset().mockResolvedValue(undefined); });
test('cria com centavos e invalida cache sem converter falha de cache em falha financeira', async () => {
  mockInvalidate.mockImplementationOnce(() => { throw new Error('cache'); }); const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try { const view = await renderHook(useSparkInvestmentForm); await act(async () => { await expect(view.result.current.create(params)).resolves.toMatchObject({ success: true }); }); expect(mockSubmit.mock.calls[0][2]).toMatchObject({ action: 'create', principalInCents: 30000, observedValueInCents: 30000, cdiPercentageInBasisPoints: 10000 }); expect(view.result.current.isPending).toBe(false); await view.unmount(); } finally { warning.mockRestore(); }
});
test('intenção incerta não é limpa e retry usa o mesmo estado e material', async () => {
  mockSubmit.mockImplementationOnce(async (_db, state) => { state.intent = { status: 'uncertain' }; throw new Error('Resposta perdida'); });
  const view = await renderHook(useSparkInvestmentForm); await act(async () => view.result.current.create(params)); expect(view.result.current.fieldsLocked).toBe(true);
  await act(async () => { expect(view.result.current.reset()).toBe(false); }); await act(async () => view.result.current.retryPending());
  expect(mockSubmit.mock.calls[1][1]).toBe(mockSubmit.mock.calls[0][1]); expect(mockSubmit.mock.calls[1][2]).toEqual(mockSubmit.mock.calls[0][2]); expect(view.result.current.isPending).toBe(false); await view.unmount();
});
test('preparação parcial mantém os dados bloqueados até continuar', async () => {
  mockSubmit.mockResolvedValueOnce({ success: false, preparing: true, error: 'Continue' }); const view = await renderHook(useSparkInvestmentForm);
  await act(async () => view.result.current.sync({ personId: 'owner', investmentId: 'asset', syncedValueInCents: 0, date: params.date })); expect(view.result.current.fieldsLocked).toBe(true);
  await act(async () => view.result.current.retryPending()); expect(mockSubmit.mock.calls[1][2]).toEqual(mockSubmit.mock.calls[0][2]); expect(mockSubmit.mock.calls[1][2].observedValueInCents).toBe(0); expect(view.result.current.fieldsLocked).toBe(false); await view.unmount();
});
test('troca de UID descarta a intenção anterior e o seu retorno atrasado', async () => {
  let finish!: (value: any) => void; mockSubmit.mockReturnValueOnce(new Promise(done => { finish = done; }));
  const view = await renderHook(useSparkInvestmentForm); let pending!: Promise<unknown>; await act(async () => { pending = view.result.current.create(params); });
  mockUid = 'other'; await view.rerender({}); await act(async () => finish({ success: true, investmentId: 'old' })); expect(await pending).toMatchObject({ success: false });
  await act(async () => view.result.current.create({ ...params, personId: 'other' })); expect(mockSubmit.mock.calls[1][1]).not.toBe(mockSubmit.mock.calls[0][1]); expect(mockInvalidate).toHaveBeenCalledTimes(1); await view.unmount();
});
test('dois cliques simultâneos produzem somente uma chamada', async () => {
  let finish!: (value: any) => void; mockSubmit.mockReturnValueOnce(new Promise(done => { finish = done; })); const view = await renderHook(useSparkInvestmentForm);
  let pending!: Promise<unknown>; await act(async () => { pending = view.result.current.create(params); await expect(view.result.current.create(params)).resolves.toMatchObject({ success: false }); }); expect(mockSubmit).toHaveBeenCalledTimes(1);
  await act(async () => finish({ success: true })); await pending; await view.unmount();
});
test('erro de contexto não confirma legado', async () => {
  mockSubmit.mockRejectedValueOnce(new Error('Sem contexto')); const view = await renderHook(useSparkInvestmentForm); await act(async () => { await expect(view.result.current.create(params)).resolves.toEqual({ success: false, error: 'Sem contexto' }); }); await view.unmount();
});

test.each(['create', 'sync', 'move'] as const)('%s bloqueia fallback legado na demonstração para conta sem grupo Spark', async action => {
  mockProjectId = 'demo-lumus-financas'; mockSubmit.mockResolvedValueOnce(null);
  const view = await renderHook(useSparkInvestmentForm);
  let result: any;
  await act(async () => {
    result = action === 'create' ? await view.result.current.create(params)
      : action === 'sync' ? await view.result.current.sync({ personId: 'owner', investmentId: 'asset', syncedValueInCents: 30000, date: params.date })
      : await view.result.current.move({ investmentId: 'asset', bankId: 'bank', valueInCents: 1000, date: params.date, type: 'deposit' });
  });
  expect(result).toMatchObject({ success: false, error: expect.stringContaining('spark@demo.lumus.local') });
  expect(view.result.current.fieldsLocked).toBe(false); expect(mockInvalidate).not.toHaveBeenCalled(); await view.unmount();
});
test('conta preparada continua aportando pelo Spark e invalida a carteira', async () => {
  mockProjectId = 'demo-lumus-financas'; const view = await renderHook(useSparkInvestmentForm);
  await act(async () => { await expect(view.result.current.move({ investmentId: 'asset', bankId: 'bank', valueInCents: 1000, date: params.date, type: 'deposit', expectedCurrentValueInCents: 30000 })).resolves.toMatchObject({ success: true }); });
  expect(mockSubmit.mock.calls[0][2]).toMatchObject({ action: 'move', amountInCents: 1000, expectedCurrentValueInCents: 30000 }); expect(mockInvalidate).toHaveBeenCalledTimes(1); await view.unmount();
});
test('seleção legada fora da demonstração conserva o contrato null', async () => {
  mockSubmit.mockResolvedValueOnce(null); const view = await renderHook(useSparkInvestmentForm);
  await act(async () => { await expect(view.result.current.move({ investmentId: 'asset', bankId: 'bank', valueInCents: 1000, date: params.date, type: 'deposit' })).resolves.toBeNull(); }); await view.unmount();
});
