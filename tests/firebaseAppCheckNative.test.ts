const mockRuntime = { target: 'production', projectId: 'synthetic-production' };
const mockNativeApp = { options: { projectId: 'synthetic-production' } };
const mockConstants = { executionEnvironment: 'standalone', expoConfig: { extra: { lumusAssistantAppCheckDebugToken: 'synthetic-debug' } } };
const mockConfigure = jest.fn();
const mockInitialize = jest.fn(async () => undefined);
const mockInitializeJs = jest.fn();
const mockGetToken = jest.fn();
jest.mock('@/utils/firebaseRuntime', () => ({ firebaseRuntime: mockRuntime }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: mockConstants, ExecutionEnvironment: { StoreClient: 'storeClient' } }));
jest.mock('@react-native-firebase/app', () => ({ getApp: () => mockNativeApp }));
jest.mock('@react-native-firebase/app-check', () => ({ __esModule: true, default: () => ({
  newReactNativeFirebaseAppCheckProvider: () => ({ configure: mockConfigure }),
  initializeAppCheck: mockInitialize, getToken: mockGetToken,
}) }));
jest.mock('firebase/app-check', () => ({
  CustomProvider: jest.fn(options => options), initializeAppCheck: (...args: unknown[]) => mockInitializeJs(...args),
}));
beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks(); mockRuntime.target = 'production';
  mockNativeApp.options.projectId = mockRuntime.projectId; mockConstants.executionEnvironment = 'standalone';
});
it('bridges one native initialization to both JS apps, using integrity in production', async () => {
  const service = require('@/utils/firebaseAppCheck.native') as typeof import('@/utils/firebaseAppCheck.native');
  const appA = {} as any; const appB = {} as any;
  service.initializeBusinessAppCheck(appA); service.initializeBusinessAppCheck(appB); service.initializeBusinessAppCheck(appA);
  expect(mockInitializeJs).toHaveBeenCalledTimes(2);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
  mockGetToken.mockResolvedValue({ token });
  const [first, second] = await Promise.all(mockInitializeJs.mock.calls.map(([, options]) => options.provider.getToken()));
  expect(first).toEqual({ token, expireTimeMillis: exp * 1000 }); expect(second).toEqual(first);
  expect(mockInitialize).toHaveBeenCalledTimes(1);
  expect(mockConfigure).toHaveBeenCalledWith({ android: { provider: 'playIntegrity' }, apple: { provider: 'appAttestWithDeviceCheckFallback' } });
});
it('rejects native credentials from another project before requesting attestation', async () => {
  mockNativeApp.options.projectId = 'another-project';
  const service = require('@/utils/firebaseAppCheck.native') as typeof import('@/utils/firebaseAppCheck.native');
  await expect(service.ensureNativeAppCheck()).rejects.toThrow('não corresponde');
  expect(mockInitialize).not.toHaveBeenCalled();
});
it('does not permit remote attestation through Expo Go and skips business App Check for emulator data', async () => {
  mockConstants.executionEnvironment = 'storeClient';
  const service = require('@/utils/firebaseAppCheck.native') as typeof import('@/utils/firebaseAppCheck.native');
  await expect(service.ensureNativeAppCheck()).rejects.toThrow('build nativo');
  mockRuntime.target = 'emulator'; service.initializeBusinessAppCheck({} as any);
  expect(mockInitializeJs).not.toHaveBeenCalled(); expect(mockInitialize).not.toHaveBeenCalled();
});
