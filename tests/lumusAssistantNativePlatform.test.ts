const installExpoGoMocks = () => {
	let nativeModuleLoaded = false;
	const unavailableNativeModule = () => {
		nativeModuleLoaded = true;
		throw new Error('RNFBAppModule não deveria ser carregado no Expo Go.');
	};

	jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
	jest.doMock('expo-constants', () => ({
		__esModule: true,
		default: { executionEnvironment: 'storeClient' },
		ExecutionEnvironment: {
			Bare: 'bare',
			Standalone: 'standalone',
			StoreClient: 'storeClient',
		},
	}));
	jest.doMock('expo/virtual/env', () => ({ env: process.env }));
	jest.doMock('@/FirebaseConfig', () => ({ auth: { currentUser: { uid: 'test-user' } } }));
	jest.doMock('@react-native-firebase/app', unavailableNativeModule);
	jest.doMock('@react-native-firebase/app-check', unavailableNativeModule);
	jest.doMock('@react-native-firebase/ai', unavailableNativeModule);
	jest.doMock('@react-native-firebase/remote-config', unavailableNativeModule);

	return () => nativeModuleLoaded;
};

describe('Lumus Assistant native platform in Expo Go', () => {
	beforeEach(() => {
		jest.resetModules();
	});

	it('reports the feature as unavailable without evaluating React Native Firebase', async () => {
		const wasNativeModuleLoaded = installExpoGoMocks();
		const { assistantAiGateway } = require('@/services/lumusAssistant/assistantPlatform.native');

		await expect(assistantAiGateway.getAvailability()).resolves.toMatchObject({
			available: false,
			platform: 'android',
			appCheckConfigured: false,
			remoteConfigLoaded: false,
			reason: expect.stringContaining('development build'),
		});
		expect(wasNativeModuleLoaded()).toBe(false);
	});

	it('blocks accidental requests before attempting to load a native module', async () => {
		const wasNativeModuleLoaded = installExpoGoMocks();
		const { assistantAiGateway } = require('@/services/lumusAssistant/assistantPlatform.native');
		const config = await assistantAiGateway.getConfig();

		await expect(assistantAiGateway.converse({
			text: 'Olá',
			turns: [],
			catalog: {},
			nowIso: '2026-07-20T12:00:00.000-03:00',
			timeZone: 'America/Sao_Paulo',
			config,
		})).rejects.toMatchObject({ code: 'unsupported' });
		expect(wasNativeModuleLoaded()).toBe(false);
	});
});
