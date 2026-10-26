import { act, renderHook } from '@testing-library/react-native';
import { useCategoryAnalysisData } from '@/hooks/useCategoryAnalysisData';
import type { CategoryAnalysisData } from '@/functions/CategoryAnalysisFirebase';

const mockLoadAnalysis = jest.fn();
let mockUid: string | null = 'owner';
jest.mock('@/FirebaseConfig', () => ({ auth: { get currentUser() { return mockUid ? { uid: mockUid } : null; } } }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUid ? { uid: mockUid } : null }) }));
jest.mock('@/functions/CategoryAnalysisFirebase', () => ({ getCategoryAnalysisFirebase: (...args: unknown[]) => mockLoadAnalysis(...args) }));
jest.mock('expo-router', () => {
	const React = require('react');
	return { useFocusEffect: (callback: () => (() => void) | void) => React.useEffect(callback, [callback]) };
});

const makeData = (id: string): CategoryAnalysisData => ({
	tags: [], reportsByTagId: {}, defaultTagId: id, baselineMonthCount: 3, generatedAt: new Date(),
});
const deferred = () => {
	let resolve!: (value: { success: true; data: CategoryAnalysisData }) => void;
	const promise = new Promise<{ success: true; data: CategoryAnalysisData }>(fulfill => { resolve = fulfill; });
	return { promise, resolve };
};
beforeEach(() => { mockUid = 'owner'; mockLoadAnalysis.mockReset(); });

it('ignores an older period response that completes after the latest query', async () => {
	const oldRequest = deferred();
	const newRequest = deferred();
	mockLoadAnalysis.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
	const { result, unmount } = await renderHook(() => useCategoryAnalysisData('owner'));
	await act(async () => {
		const start = result.current.range.startDate;
		result.current.setStartDate(new Date(start.getFullYear(), start.getMonth() - 3, 1));
	});
	await act(async () => newRequest.resolve({ success: true, data: makeData('latest') }));
	await act(async () => oldRequest.resolve({ success: true, data: makeData('obsolete') }));
	expect(result.current.analysis?.defaultTagId).toBe('latest');
	expect(result.current.isLoading).toBe(false);
	await unmount();
});

it('invalidates pending data on logout and refuses invalid historical ranges', async () => {
	const pending = deferred();
	mockLoadAnalysis.mockReturnValue(pending.promise);
	const { result, rerender, unmount } = await renderHook(({ uid }: { uid: string | null }) => useCategoryAnalysisData(uid), { initialProps: { uid: 'owner' as string | null } });
	await rerender({ uid: null });
	await act(async () => pending.resolve({ success: true, data: makeData('old-user') }));
	expect(result.current.analysis).toBeNull();
	expect(result.current.errorMessage).toContain('autenticado');
	await act(async () => result.current.setEndDate(new Date()));
	expect(result.current.rangeError).toContain('antes do mês atual');
	expect(mockLoadAnalysis).toHaveBeenCalledTimes(1);
	await unmount();
});

it('allows retry after a failed query and clears its error after success', async () => {
	mockLoadAnalysis.mockResolvedValueOnce({ success: false, error: 'offline' }).mockResolvedValueOnce({ success: true, data: makeData('retry') });
	const { result, unmount } = await renderHook(() => useCategoryAnalysisData('owner'));
	expect(result.current.errorMessage).toContain('Tente novamente');
	await act(async () => { await result.current.loadAnalysis(); });
	expect(result.current.analysis?.defaultTagId).toBe('retry');
	expect(result.current.errorMessage).toBeNull();
	await unmount();
});

it('catches a thrown refresh failure, removes the old snapshot and can recover', async () => {
  mockLoadAnalysis.mockResolvedValueOnce({ success: true, data: makeData('original') }).mockRejectedValueOnce(new Error('Conexão interrompida')).mockResolvedValueOnce({ success: true, data: makeData('recovered') });
  const view = await renderHook(() => useCategoryAnalysisData('owner')); expect(view.result.current.isReady).toBe(true);
  await act(async () => view.result.current.loadAnalysis(true)); expect(view.result.current.analysis).toBeNull(); expect(view.result.current.errorMessage).toBe('Conexão interrompida'); expect(view.result.current.isLoading || view.result.current.isRefreshing).toBe(false);
  await act(async () => view.result.current.loadAnalysis()); expect(view.result.current.analysis?.defaultTagId).toBe('recovered'); expect(view.result.current.isReady).toBe(true); await view.unmount();
});
it('checks live authentication before accepting a response even before provider rerender', async () => {
  const old = deferred(); mockLoadAnalysis.mockReturnValueOnce(old.promise); const view = await renderHook(() => useCategoryAnalysisData('owner'));
  mockUid = 'other'; await act(async () => old.resolve({ success: true, data: makeData('old-user') })); expect(view.result.current.analysis).toBeNull(); await view.unmount();
});
it('keeps only the latest refresh of the same range', async () => {
  const old = deferred(); mockLoadAnalysis.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ success: true, data: makeData('newest') });
  const view = await renderHook(() => useCategoryAnalysisData('owner')); await act(async () => view.result.current.loadAnalysis(true));
  await act(async () => old.resolve({ success: true, data: makeData('obsolete') })); expect(view.result.current.analysis?.defaultTagId).toBe('newest'); expect(view.result.current.isRefreshing).toBe(false); await view.unmount();
});
