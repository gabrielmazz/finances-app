const mockAuth = { currentUser: { uid: 'A' } as { uid: string } | null };
const mockSignOut = jest.fn();
const mockUnregister = jest.fn();
const mockFinish = jest.fn();
const mockClearFinance = jest.fn();
const mockClearNotes = jest.fn();
const mockResumeFinance = jest.fn();
const mockResumeNotes = jest.fn();
const mockAlert = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ auth: mockAuth }));
jest.mock('firebase/auth', () => ({ signOut: (...args: unknown[]) => mockSignOut(...args) }));
jest.mock('@/components/uiverse/feedback/notifier-alert', () => ({ showNotifierAlert: (...args: unknown[]) => mockAlert(...args) }));
jest.mock('@/functions/RegisterUserFirebase', () => ({ getUserDataFirebase: async () => ({ success: false }) }));
jest.mock('@/utils/mandatoryReminderNotifications', () => ({ clearMandatoryReminderAccount: async () => true, finalizeMandatoryReminderAccountCleanup: async () => undefined }));
jest.mock('@/utils/mandatoryReminderAccountSync', () => ({ synchronizeMandatoryReminderAccount: async () => ({ complete: true }) }));
jest.mock('@/utils/remoteNotifications', () => ({ unregisterRemoteNotificationDevice: (...args: unknown[]) => mockUnregister(...args), finishRemoteNotificationLogout: (...args: unknown[]) => mockFinish(...args) }));
jest.mock('@/contexts/FinanceDataContext', () => ({ clearFinancePersistedDataForLogout: (...args: unknown[]) => mockClearFinance(...args), resumeFinancePersistedDataAfterFailedLogout: (...args: unknown[]) => mockResumeFinance(...args) }));
jest.mock('@/utils/localAnnotations', () => ({ clearLocalAnnotationsForLogout: (...args: unknown[]) => mockClearNotes(...args), resumeLocalAnnotationsAfterFailedLogout: (...args: unknown[]) => mockResumeNotes(...args) }));
let logoutCurrentUser: typeof import('@/utils/secureLogout').logoutCurrentUser;
let cleanupExpiredSession: typeof import('@/utils/secureLogout').cleanupExpiredSession;

beforeEach(() => {
  logoutCurrentUser = require('@/utils/secureLogout').logoutCurrentUser;
  cleanupExpiredSession = require('@/utils/secureLogout').cleanupExpiredSession;
  jest.clearAllMocks(); mockAuth.currentUser = { uid: 'A' };
  mockSignOut.mockResolvedValue(undefined); mockUnregister.mockResolvedValue(undefined);
  mockClearFinance.mockResolvedValue(undefined); mockClearNotes.mockResolvedValue(undefined);
});
it('attempts every private store cleanup on expiration even if one fails', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockClearFinance.mockRejectedValueOnce(new Error('storage unavailable'));
  await cleanupExpiredSession(mockAuth.currentUser as any);
  expect(mockClearFinance).toHaveBeenCalledWith('A'); expect(mockClearNotes).toHaveBeenCalledWith('A');
  expect(mockUnregister).toHaveBeenCalledWith('A'); expect(mockFinish).toHaveBeenCalledWith('A');
  expect(mockResumeFinance).not.toHaveBeenCalled(); expect(mockResumeNotes).not.toHaveBeenCalled();
  warn.mockRestore();
});
it('does not let an offline push removal indefinitely block expiration', async () => {
  jest.useFakeTimers();
  try {
    mockUnregister.mockReturnValueOnce(new Promise(() => undefined));
    const cleanup = cleanupExpiredSession(mockAuth.currentUser as any);
    await jest.advanceTimersByTimeAsync(2000);
    await cleanup;
    expect(mockClearNotes).toHaveBeenCalledWith('A'); expect(mockFinish).toHaveBeenCalledWith('A');
  } finally { jest.useRealTimers(); }
});
it('waits for push removal and both private stores before signing out', async () => {
  let finish!: () => void;
  let started!: () => void;
  const clearing = new Promise<void>(resolve => { started = resolve; });
  mockClearNotes.mockImplementationOnce(() => { started(); return new Promise<void>(resolve => { finish = resolve; }); });
  const logout = logoutCurrentUser({ userId: 'A', isDarkMode: false });
  await clearing;
  expect(mockUnregister).toHaveBeenCalledWith('A'); expect(mockClearFinance).toHaveBeenCalledWith('A');
  expect(mockSignOut).not.toHaveBeenCalled(); finish(); await logout;
  expect(mockSignOut).toHaveBeenCalledWith(mockAuth); expect(mockFinish).toHaveBeenCalledTimes(1);
});
it('does not sign out B when the account changes while A cleanup is pending', async () => {
  mockClearNotes.mockImplementationOnce(async () => { mockAuth.currentUser = { uid: 'B' }; });
  await logoutCurrentUser({ userId: 'A', isDarkMode: false });
  expect(mockSignOut).not.toHaveBeenCalled(); expect(mockFinish).toHaveBeenCalledWith('A');
  expect(mockAlert).not.toHaveBeenCalled();
});
it('preserves the session and resumes local writes when deletion of private data fails', async () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    mockClearFinance.mockRejectedValueOnce(new Error('storage unavailable'));
    await logoutCurrentUser({ userId: 'A', isDarkMode: false });
    expect(mockSignOut).not.toHaveBeenCalled(); expect(mockClearNotes).not.toHaveBeenCalled();
    expect(mockResumeFinance).toHaveBeenCalledWith('A'); expect(mockResumeNotes).toHaveBeenCalledWith('A');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  } finally { consoleError.mockRestore(); }
});
