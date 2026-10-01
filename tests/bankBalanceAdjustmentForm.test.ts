import { act, renderHook } from '@testing-library/react-native';
import { useBankBalanceAdjustmentForm } from '@/hooks/useBankBalanceAdjustmentForm';

const mockCommand = jest.fn();
const mockRedirect = jest.fn();
const mockInvalidate = jest.fn();
const mockParams: { bankId: string; adjustmentId?: string } = { bankId: 'bank' };
jest.mock('expo-router', () => ({
	useLocalSearchParams: () => mockParams,
	useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));
jest.mock('@/FirebaseConfig', () => ({ auth: { currentUser: { uid: 'owner' } } }));
jest.mock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ isDarkMode: false }) }));
jest.mock('@/contexts/ValueVisibilityContext', () => ({ useValueVisibility: () => ({ shouldHideValues: false }) }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ createFinancialClientActionId: jest.fn(() => 'stable_command_id') }));
jest.mock('@/functions/BankBalanceAdjustmentFirebase', () => ({
	runBankBalanceAdjustmentFirebase: (...args: unknown[]) => mockCommand(...args),
	getBalanceAdjustmentBanksFirebase: jest.fn().mockResolvedValue([{ id: 'bank', name: 'Banco' }]),
	getBankBalanceAdjustmentFirebase: jest.fn().mockResolvedValue({ id: 'original', bankId: 'bank', personId: 'owner', status: 'active', targetBalanceInCents: 12_000, date: new Date('2026-09-10T12:00:00-03:00'), description: 'Original' }),
}));
jest.mock('@/components/uiverse/feedback/notifier-alert', () => ({ showNotifierAlert: jest.fn() }));
jest.mock('@/utils/navigation', () => ({
	APP_ROUTE_PATHS: { bankMovements: '/mobile/bank-movements', home: '/mobile/home' },
	navigateToRoute: jest.fn(), redirectToRoute: (...args: unknown[]) => mockRedirect(...args),
}));
beforeEach(() => {
	delete mockParams.adjustmentId;
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
