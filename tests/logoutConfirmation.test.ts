import { act, renderHook } from '@testing-library/react-native';
import { useLogoutConfirmation } from '@/hooks/useLogoutConfirmation';

const mockLogout = jest.fn();
let mockUser: { uid: string; displayName: string } | null = { uid: 'A', displayName: 'Ana' };
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ isDarkMode: false }) }));
jest.mock('@/utils/secureLogout', () => ({ logoutCurrentUser: (...args: unknown[]) => mockLogout(...args) }));

beforeEach(() => {
	mockUser = { uid: 'A', displayName: 'Ana' };
	mockLogout.mockReset().mockResolvedValue(undefined);
});

it('opens confirmation without logging out and keeps the session when cancelled', async () => {
	const { result, unmount } = await renderHook(() => useLogoutConfirmation());
	await act(async () => { result.current.requestLogout(); });
	expect(result.current.isOpen).toBe(true);
	expect(mockLogout).not.toHaveBeenCalled();
	await act(async () => { result.current.cancelLogout(); });
	expect(result.current.isOpen).toBe(false);
	await act(async () => { await result.current.confirmLogout(); });
	expect(mockLogout).not.toHaveBeenCalled();
	unmount();
});

it('runs secure logout once after confirming and blocks cancellation while pending', async () => {
	let finish!: () => void;
	mockLogout.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
	const { result, unmount } = await renderHook(() => useLogoutConfirmation());
	await act(async () => { result.current.requestLogout(); });
	let pending!: Promise<void>;
	await act(async () => {
		pending = result.current.confirmLogout();
		void result.current.confirmLogout();
		result.current.cancelLogout();
	});
	expect(result.current.isLoggingOut).toBe(true);
	expect(result.current.isOpen).toBe(true);
	expect(mockLogout).toHaveBeenCalledTimes(1);
	expect(mockLogout).toHaveBeenCalledWith({ userId: 'A', displayName: 'Ana', isDarkMode: false });
	await act(async () => { finish(); await pending; });
	expect(result.current.isLoggingOut).toBe(false);
	expect(result.current.isOpen).toBe(false);
	unmount();
});

it('discards confirmation on account change and requires a fresh request', async () => {
	const { result, rerender, unmount } = await renderHook(() => useLogoutConfirmation());
	await act(async () => { result.current.requestLogout(); });
	mockUser = { uid: 'B', displayName: 'Bruno' };
	await rerender({});
	expect(result.current.isOpen).toBe(false);
	await act(async () => { await result.current.confirmLogout(); });
	expect(mockLogout).not.toHaveBeenCalled();
	await act(async () => { result.current.requestLogout(); });
	await act(async () => { await result.current.confirmLogout(); });
	expect(mockLogout).toHaveBeenCalledWith(expect.objectContaining({ userId: 'B' }));
	unmount();
});

it('allows another attempt when secure logout preserves the session after a failure', async () => {
	const { result, unmount } = await renderHook(() => useLogoutConfirmation());
	await act(async () => { result.current.requestLogout(); });
	await act(async () => { await result.current.confirmLogout(); });
	await act(async () => { result.current.requestLogout(); });
	expect(result.current.isOpen).toBe(true);
	expect(result.current.isLoggingOut).toBe(false);
	unmount();
});
