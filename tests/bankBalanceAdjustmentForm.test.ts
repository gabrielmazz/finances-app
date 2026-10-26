import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useBankBalanceAdjustmentForm } from '@/hooks/useBankBalanceAdjustmentForm';

const mockCommand = jest.fn(), mockPrepare = jest.fn(), mockSave = jest.fn(), mockBanks = jest.fn(), mockOriginal = jest.fn(), mockAlert = jest.fn();
let mockUid: string | null = 'owner', mockHidden = false;
const mockRedirect = jest.fn();
const mockInvalidate = jest.fn();
const mockParams: { bankId: string; adjustmentId?: string } = { bankId: 'bank' };
jest.mock('@/functions/SparkBalanceFormFirebase', () => ({ prepareSparkBalanceFormFirebase: (...args: unknown[]) => mockPrepare(...args), submitSparkBalanceFormFirebase: (...args: unknown[]) => mockSave(...args) }));
jest.mock('expo-router', () => ({
	useLocalSearchParams: () => mockParams,
	useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));
jest.mock('@/FirebaseConfig', () => ({ db: {}, auth: { get currentUser() { return mockUid ? { uid: mockUid } : null; } } }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUid ? { uid: mockUid } : null }) }));
jest.mock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ isDarkMode: false }) }));
jest.mock('@/contexts/ValueVisibilityContext', () => ({ useValueVisibility: () => ({ shouldHideValues: mockHidden }) }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ createFinancialClientActionId: jest.fn(() => 'stable_command_id') }));
jest.mock('@/functions/BankBalanceAdjustmentFirebase', () => ({
	runBankBalanceAdjustmentFirebase: (...args: unknown[]) => mockCommand(...args),
	getBalanceAdjustmentBanksFirebase: (...args: unknown[]) => mockBanks(...args),
	getBankBalanceAdjustmentFirebase: (...args: unknown[]) => mockOriginal(...args),
}));
jest.mock('@/components/uiverse/feedback/notifier-alert', () => ({ showNotifierAlert: (...args: unknown[]) => mockAlert(...args) }));
jest.mock('@/utils/navigation', () => ({
	APP_ROUTE_PATHS: { bankMovements: '/mobile/bank-movements', home: '/mobile/home' },
	navigateToRoute: jest.fn(), redirectToRoute: (...args: unknown[]) => mockRedirect(...args),
}));
beforeEach(() => {
	mockUid = 'owner'; mockHidden = false; mockParams.bankId = 'bank'; delete mockParams.adjustmentId;
	mockBanks.mockReset().mockResolvedValue([{ id: 'bank', name: 'Banco' }, { id: 'other', name: 'Outro banco' }]);
	mockOriginal.mockReset().mockResolvedValue({ id: 'original', bankId: 'bank', personId: 'owner', status: 'active', targetBalanceInCents: 12_000, date: new Date('2026-09-10T12:00:00-03:00'), description: 'Original' });
	mockPrepare.mockReset().mockResolvedValue(null); mockSave.mockReset().mockResolvedValue({ id: 'saved' }); mockAlert.mockReset();
	mockCommand.mockReset().mockImplementation(async ({ action }) => action === 'preview' ? { previousBalanceInCents: 10_000 } : { adjustmentId: 'saved' });
	mockRedirect.mockReset(); mockInvalidate.mockReset();
});

it('preserves the edit draft when a stale preview is rejected', async () => {
	mockParams.adjustmentId = 'original';
	const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
	await act(async () => { result.current.onValueChange('15000'); result.current.setDescription('Rascunho editado'); });
	mockCommand.mockImplementation(async ({ action }) => {
		if (action === 'preview') return { previousBalanceInCents: 10_500 };
		throw Object.assign(new Error('Saldo mudou'), { code: 'functions/failed-precondition' });
	});
	await act(async () => { await result.current.submit(); });
	expect(result.current.target).toBe(15_000);
	expect(result.current.description).toBe('Rascunho editado');
	expect(result.current.base).toBe(10_500);
	expect(mockRedirect).not.toHaveBeenCalled();
	await unmount();
});

it('retries an uncertain save with its original receipt ID even after the balance changed', async () => {
	const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
	await act(async () => result.current.onValueChange('12000'));
	const savedInputs: unknown[] = [];
	let failSave = true;
	mockCommand.mockImplementation(async (input) => {
		if (input.action === 'preview') return { previousBalanceInCents: 12_000 };
		savedInputs.push(input);
		if (failSave) { failSave = false; throw Object.assign(new Error('Resposta perdida'), { code: 'functions/unavailable' }); }
		return { adjustmentId: 'saved' };
	});
	await act(async () => { await result.current.submit(); });
	expect(result.current.base).toBe(12_000);
	expect(result.current.submitDisabled).toBe(false);
	await act(async () => { await result.current.submit(); });
	expect(savedInputs).toHaveLength(2);
	expect(savedInputs[1]).toEqual(savedInputs[0]);
	expect(mockRedirect).toHaveBeenCalledTimes(1);
	expect(mockInvalidate).toHaveBeenCalled();
	await unmount();
});

it('clears the negative balance validation as soon as a reason is supplied', async () => {
	const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
	await act(async () => result.current.onValueChange('-100'));
	expect(result.current.descriptionError).toBeTruthy();
	expect(result.current.submitDisabled).toBe(true);
	await act(async () => result.current.setDescription('Limite utilizado'));
	expect(result.current.descriptionError).toBeNull();
	expect(result.current.submitDisabled).toBe(false);
	await unmount();
});

const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; };
const sparkPreview = (base = 10000) => mockPrepare.mockImplementation(async (_db, state, selection) => {
  state.preview = { ...selection, base, currentBalance: base, clientActionId: 'spark-stable', revision: 7 };
  return state.preview;
});

it('falha de catálogo persiste, bloqueia o envio e pode ser repetida', async () => {
  mockBanks.mockRejectedValueOnce(new Error('Catálogo indisponível'));
  const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
  expect(result.current.error).toBe('Catálogo indisponível'); expect(result.current.submitDisabled).toBe(true); expect(mockPrepare).not.toHaveBeenCalled();
  await act(async () => result.current.retry()); await waitFor(() => expect(result.current.base).toBe(10000));
  expect(result.current.error).toBeNull(); await unmount();
});

it('falha Spark não libera preview nem escritor antigo; retry pode confirmar a base', async () => {
  mockPrepare.mockRejectedValueOnce(new Error('Sem acesso ao Spark'));
  const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
  expect(result.current.previewError).toBe('Sem acesso ao Spark'); expect(result.current.base).toBeNull();
  await act(async () => { result.current.onValueChange('12000'); await result.current.submit(); });
  expect(mockCommand).not.toHaveBeenCalled(); expect(mockSave).not.toHaveBeenCalled();
  sparkPreview(11000); await act(async () => result.current.retry()); await waitFor(() => expect(result.current.base).toBe(11000)); await unmount();
});

it('atualizar prévia pronta usa outra revisão e preserva valor e descrição', async () => {
  sparkPreview(); const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
  const firstWork = mockPrepare.mock.calls[0][1];
  await act(async () => { result.current.onValueChange('12000'); result.current.setDescription('Conferência'); });
  sparkPreview(10500); await act(async () => result.current.retry());
  expect(mockPrepare.mock.calls[1][1]).not.toBe(firstWork); expect(result.current.base).toBe(10500);
  expect(result.current.target).toBe(12000); expect(result.current.description).toBe('Conferência'); expect(result.current.difference).toBe(1500); await unmount();
});

it('preparação parcial retoma o mesmo estado sem registrar saldo', async () => {
  let first = true;
  mockPrepare.mockImplementation(async (_db, state, selection) => {
    state.preview = { ...selection, base: first ? null : 10000, proof: { workRevision: first ? 20 : 21 } }; first = false; return state.preview;
  });
  const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
  expect(result.current.preparationProgress).toContain('20 etapas'); expect(result.current.previewError).toMatch(/parcial/);
  const firstWork = mockPrepare.mock.calls[0][1];
  await act(async () => result.current.retry()); expect(mockPrepare.mock.calls[1][1]).toBe(firstWork);
  expect(result.current.base).toBe(10000); expect(mockSave).not.toHaveBeenCalled(); expect(mockCommand).not.toHaveBeenCalled(); await unmount();
});

it('resposta atrasada de outro banco não contamina a prévia nem o comando atual', async () => {
  const old = deferred();
  mockPrepare.mockImplementation(async (_db, state, selection) => {
    if (selection.accountId === 'bank') { await old.promise; state.preview = { ...selection, base: 99999 }; }
    else state.preview = { ...selection, base: 5000, clientActionId: 'other-receipt' };
    return state.preview;
  });
  const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
  await act(async () => result.current.setBankId('other')); await waitFor(() => expect(result.current.base).toBe(5000));
  await act(async () => old.resolve(null)); expect(result.current.base).toBe(5000);
  await act(async () => result.current.onValueChange('6000')); await act(async () => result.current.submit());
  expect(mockSave.mock.calls[0][1].preview.accountId).toBe('other'); expect(mockSave.mock.calls[0][2]).toMatchObject({ accountId: 'other', targetBalanceInCents: 6000 }); await unmount();
});

it('rejeição de revisão Spark renova a preparação e conserva o rascunho de edição', async () => {
  mockParams.adjustmentId = 'original'; sparkPreview();
  const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
  const initial = mockPrepare.mock.calls[0][1];
  await act(async () => { result.current.onValueChange('15000'); result.current.setDescription('Rascunho editado'); });
  mockSave.mockRejectedValueOnce(new Error('A prévia ficou desatualizada')); sparkPreview(11000);
  await act(async () => result.current.submit());
  expect(result.current.target).toBe(15000); expect(result.current.description).toBe('Rascunho editado'); expect(result.current.base).toBe(11000);
  expect(mockPrepare.mock.calls.at(-1)![1]).not.toBe(initial); expect(result.current.retryPending).toBe(false); expect(result.current.submitError).toMatch(/desatualizada/); expect(mockRedirect).not.toHaveBeenCalled(); await unmount();
});

it('envio Spark incerto bloqueia mudanças e confirma o mesmo estado/material mesmo com prévia indisponível', async () => {
  sparkPreview(); const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
  await act(async () => { result.current.onValueChange('12000'); result.current.setDescription('Conferência'); });
  mockSave.mockImplementationOnce(async (_db, state) => { state.intent = { status: 'uncertain' }; throw new Error('Resposta perdida'); });
  mockPrepare.mockRejectedValueOnce(new Error('Saldo indisponível'));
  await act(async () => result.current.submit()); expect(result.current.retryPending).toBe(true); expect(result.current.fieldsLocked).toBe(true);
  const date = result.current.date;
  await act(async () => { result.current.setBankId('other'); result.current.setDate('01/01/2026'); result.current.onValueChange('99000'); result.current.setDescription('Outro motivo'); });
  expect([result.current.bankId, result.current.date, result.current.target, result.current.description]).toEqual(['bank', date, 12000, 'Conferência']);
  expect(result.current.previewError).toBe('Saldo indisponível'); expect(result.current.submitDisabled).toBe(false);
  await act(async () => result.current.submit());
  expect(mockSave.mock.calls[1][1]).toBe(mockSave.mock.calls[0][1]); expect(mockSave.mock.calls[1][2]).toEqual(mockSave.mock.calls[0][2]);
  expect(mockCommand).not.toHaveBeenCalled(); expect(mockRedirect).toHaveBeenCalledTimes(1); await unmount();
});

it('saldo negativo Spark valida 3 a 500 caracteres e o limite monetário antes de enviar', async () => {
  sparkPreview(); const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
  await act(async () => { result.current.onValueChange('-100'); result.current.setDescription('a'.repeat(501)); });
  expect(result.current.descriptionError).toMatch(/3 a 500/); expect(result.current.submitDisabled).toBe(true);
  await act(async () => result.current.setDescription('Limite utilizado')); expect(result.current.descriptionError).toBeNull(); expect(result.current.submitDisabled).toBe(false);
  await act(async () => result.current.onValueChange('1000000000001')); expect(result.current.valueError).toBeTruthy(); expect(result.current.submitDisabled).toBe(true); await unmount();
});

it('banco fora do catálogo e datas inválidas não preparam nem enviam ajuste', async () => {
  mockParams.bankId = 'missing'; const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
  expect(result.current.previewError).toMatch(/não está mais disponível/); expect(mockPrepare).not.toHaveBeenCalled();
  await act(async () => { result.current.setDate('31/02/2026'); result.current.setBankId('bank'); result.current.onValueChange('12000'); });
  expect(result.current.dateError).toBeTruthy(); expect(result.current.submitDisabled).toBe(true); expect(mockPrepare).not.toHaveBeenCalled(); await unmount();
});

it('um alvo de edição ausente não abre um novo ajuste', async () => {
  mockParams.adjustmentId = 'original'; mockOriginal.mockResolvedValueOnce(null);
  const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
  expect(result.current.error).toMatch(/não está disponível para edição/); expect(result.current.submitDisabled).toBe(true); expect(mockPrepare).not.toHaveBeenCalled(); await unmount();
});

it('edição com privacidade exige redigitar o valor e mantém banco fixo', async () => {
  mockParams.adjustmentId = 'original'; mockHidden = true;
  const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
  expect(result.current.target).toBeNull(); expect(result.current.value).toBe(''); expect(result.current.submitDisabled).toBe(true);
  await act(async () => { result.current.setBankId('other'); result.current.onValueChange('13000'); });
  expect(result.current.bankId).toBe('bank'); expect(result.current.submitDisabled).toBe(false); await unmount();
});

it('ausência de sessão não consulta catálogo nem cria comandos', async () => {
  mockUid = null; const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
  expect(result.current.error).toMatch(/Entre na sua conta/); expect(mockBanks).not.toHaveBeenCalled(); expect(result.current.submitDisabled).toBe(true); await unmount();
});

it('resposta de envio de outro UID não publica confirmação nem retorno na sessão nova', async () => {
  sparkPreview(); const { result, rerender, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
  await act(async () => result.current.onValueChange('12000'));
  const pending = deferred(); mockSave.mockReturnValueOnce(pending.promise);
  let submission!: Promise<void>; await act(async () => { submission = result.current.submit(); });
  mockUid = 'other'; await rerender({}); await waitFor(() => expect(result.current.target).toBeNull()); expect(result.current.submitting).toBe(false);
  await act(async () => { pending.resolve({ id: 'old' }); await submission; });
  expect(mockRedirect).not.toHaveBeenCalled(); expect(mockInvalidate).not.toHaveBeenCalled(); expect(mockAlert).not.toHaveBeenCalled(); expect(result.current.completed).toBe(false); await unmount();
});

it('falha síncrona de recarga após commit não transforma sucesso em reenvio financeiro', async () => {
  sparkPreview(); mockInvalidate.mockImplementationOnce(() => { throw new Error('Cache indisponível'); });
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const { result, unmount } = await renderHook(() => useBankBalanceAdjustmentForm());
    await act(async () => result.current.onValueChange('12000')); await act(async () => result.current.submit());
    expect(result.current.completed).toBe(true); expect(result.current.submitError).toBeNull(); expect(mockRedirect).toHaveBeenCalledTimes(1);
    await act(async () => result.current.submit()); expect(mockSave).toHaveBeenCalledTimes(1); await unmount();
  } finally { warning.mockRestore(); }
});
