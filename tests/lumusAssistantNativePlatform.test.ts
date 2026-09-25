const installExpoGoMocks = (platform: 'android' | 'ios' = 'android') => {
	let nativeModuleLoaded = false;
	const unavailableNativeModule = () => {
		nativeModuleLoaded = true;
		throw new Error('RNFBAppModule não deveria ser carregado no Expo Go.');
	};
	const config = {
		enabled: true,
		model: 'gemini-3.8-flash',
		maxContextTurns: 8,
		maxActionsPerResponse: 8,
		maxToolCalls: 4,
		maxRequestsPerMinute: 10,
	};

	jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
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
	jest.doMock('@/services/lumusAssistant/assistantPlatform.expoGo', () => ({
		assistantExpoGoAdapter: {
			getConfig: jest.fn(async () => config),
			getAvailability: jest.fn(async () => ({
				available: true,
				platform,
				runtime: 'expo-go',
				appCheckConfigured: true,
				remoteConfigLoaded: false,
				model: config.model,
			})),
			createChat: jest.fn(async () => ({
				sendText: async () => ({ text: 'Resposta de teste', functionCalls: [] }),
				sendFunctionResponses: async () => ({ text: '', functionCalls: [] }),
			})),
			transcribe: jest.fn(async () => 'transcrição'),
			narrateReport: jest.fn(async () => 'relatório'),
		},
	}));
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

	it('uses the JavaScript adapter without evaluating React Native Firebase', async () => {
		const wasNativeModuleLoaded = installExpoGoMocks();
		const { assistantAiGateway } = require('@/services/lumusAssistant/assistantPlatform.native');

		await expect(assistantAiGateway.getAvailability()).resolves.toMatchObject({
			available: true,
			platform: 'android',
			runtime: 'expo-go',
			appCheckConfigured: true,
			remoteConfigLoaded: false,
		});
		expect(wasNativeModuleLoaded()).toBe(false);
	});

	it('routes an iOS StoreClient through the same JavaScript adapter', async () => {
		installExpoGoMocks('ios');
		const { assistantAiGateway } = require('@/services/lumusAssistant/assistantPlatform.native');
		await expect(assistantAiGateway.getAvailability()).resolves.toMatchObject({
			available: true,
			platform: 'ios',
			runtime: 'expo-go',
		});
	});

	it('can complete a conversation without loading a native module', async () => {
		const wasNativeModuleLoaded = installExpoGoMocks();
		const { assistantAiGateway } = require('@/services/lumusAssistant/assistantPlatform.native');
		const config = await assistantAiGateway.getConfig();

		await expect(assistantAiGateway.converse({
			text: 'Olá',
			turns: [],
			catalog: {},
			nowIso: '2026-09-25T12:00:00.000-03:00',
			timeZone: 'America/Sao_Paulo',
			config,
		})).resolves.toMatchObject({ text: 'Resposta de teste', actions: [] });
		expect(wasNativeModuleLoaded()).toBe(false);
	});
});
