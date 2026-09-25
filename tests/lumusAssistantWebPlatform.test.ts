type RemoteValues = Record<string, boolean | number | string>;

type MockModelResponse = {
	text: string;
	functionCalls?: Array<{ id?: string; name: string; args: Record<string, unknown> }>;
};

type WebMockOptions = {
	authenticated?: boolean;
	emulator?: boolean;
	fetchFails?: boolean;
	configInitFails?: boolean;
	remoteValues?: Partial<RemoteValues>;
	responses?: MockModelResponse[];
	siteKey?: string;
};

const originalEnvironment = { ...process.env };

const REMOTE_VALUES: RemoteValues = {
	lumus_ai_enabled: true,
	lumus_ai_model: 'gemini-3.8-flash',
	lumus_ai_max_context_turns: 12,
	lumus_ai_max_actions: 20,
	lumus_ai_max_tool_calls: 8,
	lumus_ai_max_requests_per_minute: 10,
};

const installWebMocks = (options: WebMockOptions = {}) => {
	process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_KEY = options.siteKey ?? 'public-site-key';
	process.env.EXPO_PUBLIC_FIREBASE_API_KEY = 'public-api-key';
	process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN = 'finances-app-e8685.firebaseapp.com';
	process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'finances-app-e8685';
	process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET = 'finances-app-e8685.firebasestorage.app';
	process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = '909478123750';
	process.env.EXPO_PUBLIC_FIREBASE_APP_ID = '1:909478123750:web:test';
	const remoteValues = { ...REMOTE_VALUES, ...options.remoteValues };
	const remoteConfig = {
		defaultConfig: {} as Record<string, boolean | number | string>,
		settings: {},
	};
	const app = { name: '[DEFAULT]' };
	const assistantDevelopmentApp = { name: 'LUMUS_ASSISTANT_DEVELOPMENT' };
	const initializeApp = jest.fn(() => assistantDevelopmentApp);
	const getApps = jest.fn(() => [app]);
	const auth = {
		currentUser: options.authenticated === false ? null : { uid: 'test-user' },
	};
	const appCheck = { name: 'app-check' };
	const initializeAppCheck = jest.fn(() => appCheck);
	const getToken = jest.fn(async () => ({ token: 'valid-app-check-token' }));
	const fetchAndActivate = options.fetchFails
		? jest.fn(async () => { throw new Error('Remote Config indisponível'); })
		: jest.fn(async () => true);
	const queuedResponses = [...(options.responses ?? [{ text: 'Dica segura.' }])];
	const sendMessage = jest.fn(async (_message: unknown) => {
		const next = queuedResponses.shift() ?? { text: 'Resposta final.' };
		return {
			response: {
				text: () => next.text,
				functionCalls: () => next.functionCalls ?? [],
			},
		};
	});
	const startChat = jest.fn(() => ({ sendMessage }));
	const generateContent = jest.fn(async () => ({
		response: {
			text: () => 'Dica segura.',
			functionCalls: () => [],
		},
	}));
	const getGenerativeModel = jest.fn(() => ({ startChat, generateContent }));
	const getAI = jest.fn(() => ({ name: 'firebase-ai' }));

	class MockGoogleAIBackend {}
	class MockReCaptchaEnterpriseProvider {
		constructor(readonly siteKey: string) {}
	}

	jest.doMock('@/FirebaseConfig', () => ({ app, auth }));
	jest.doMock('@/utils/firebaseRuntime', () => ({
		PRODUCTION_FIREBASE_PROJECT_ID: 'finances-app-e8685',
		isFirebaseEmulatorRuntime: () => options.emulator ?? false,
	}));
	jest.doMock('firebase/app', () => ({ getApps, initializeApp }));
	jest.doMock('firebase/app-check', () => ({
		ReCaptchaEnterpriseProvider: MockReCaptchaEnterpriseProvider,
		getToken,
		initializeAppCheck,
	}));
	jest.doMock('firebase/ai', () => ({
		GoogleAIBackend: MockGoogleAIBackend,
		getAI,
		getGenerativeModel,
	}));
	jest.doMock('firebase/remote-config', () => ({
		fetchAndActivate,
		getBoolean: jest.fn((_instance, key: string) => Boolean(remoteValues[key] ?? remoteConfig.defaultConfig[key])),
		getNumber: jest.fn((_instance, key: string) => Number(remoteValues[key] ?? remoteConfig.defaultConfig[key])),
		getRemoteConfig: jest.fn(() => {
			if (options.configInitFails) throw new Error('Remote Config indisponível');
			return remoteConfig;
		}),
		getString: jest.fn((_instance, key: string) => String(remoteValues[key] ?? remoteConfig.defaultConfig[key] ?? '')),
		isSupported: jest.fn(async () => true),
	}));

	const { assistantAiGateway } = require('@/services/lumusAssistant/assistantPlatform.web') as typeof import('@/services/lumusAssistant/assistantPlatform.web');
	return {
		assistantAiGateway,
		fetchAndActivate,
		getAI,
		getGenerativeModel,
		getToken,
		initializeAppCheck,
		initializeApp,
		assistantDevelopmentApp,
		remoteConfig,
		sendMessage,
	};
};

const conversationRequest = (config: Awaited<ReturnType<ReturnType<typeof installWebMocks>['assistantAiGateway']['getConfig']>>) => ({
	text: 'Dê uma dica curta de planejamento financeiro.',
	turns: [],
	catalog: {},
	nowIso: '2026-09-21T12:00:00.000-03:00',
	timeZone: 'America/Sao_Paulo' as const,
	requestScope: 'test-user',
	config,
});

describe('Lumus Assistant web platform', () => {
	beforeEach(() => {
		process.env = { ...originalEnvironment };
		jest.resetModules();
		jest.clearAllMocks();
	});

	afterAll(() => {
		process.env = { ...originalEnvironment };
	});

	it('keeps AI unavailable and blocks requests when Web App Check is absent', async () => {
		const mocks = installWebMocks({ siteKey: '' });

		await expect(mocks.assistantAiGateway.getAvailability()).resolves.toMatchObject({
			available: false,
			appCheckConfigured: false,
			reason: expect.stringContaining('EXPO_PUBLIC_FIREBASE_APP_CHECK'),
		});
		const config = await mocks.assistantAiGateway.getConfig();
		await expect(mocks.assistantAiGateway.converse(conversationRequest(config))).rejects.toBeDefined();
		expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
		expect(mocks.getAI).not.toHaveBeenCalled();
	});

	it('loads Remote Config and reports App Check as configured', async () => {
		const mocks = installWebMocks();

		await expect(mocks.assistantAiGateway.getAvailability()).resolves.toMatchObject({
			available: true,
			appCheckConfigured: true,
			remoteConfigLoaded: true,
			model: 'gemini-3.8-flash',
		});
		expect(mocks.fetchAndActivate).toHaveBeenCalledTimes(1);
		expect(mocks.remoteConfig.defaultConfig).toMatchObject({ lumus_ai_model: 'gemini-3.8-flash' });
	});

	it('keeps financial services local and creates a dedicated cloud app for AI in emulator development', async () => {
		const mocks = installWebMocks({ emulator: true });

		await expect(mocks.assistantAiGateway.getAvailability()).resolves.toMatchObject({
			available: true,
			platform: 'web',
			appCheckConfigured: true,
			remoteConfigLoaded: true,
		});
		expect(mocks.initializeApp).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: 'finances-app-e8685' }),
			'LUMUS_ASSISTANT_DEVELOPMENT',
		);
		const config = await mocks.assistantAiGateway.getConfig();
		await mocks.assistantAiGateway.converse(conversationRequest(config));
		expect(mocks.getAI).toHaveBeenCalledWith(
			mocks.assistantDevelopmentApp,
			expect.objectContaining({ backend: expect.anything() }),
		);
	});

	it('uses safe local defaults when Remote Config cannot be refreshed', async () => {
		const mocks = installWebMocks({ fetchFails: true });

		await expect(mocks.assistantAiGateway.getAvailability()).resolves.toMatchObject({
			available: true,
			remoteConfigLoaded: false,
			model: 'gemini-3.8-flash',
		});
	});

	it('uses local defaults when Remote Config cannot initialize', async () => {
		const mocks = installWebMocks({ configInitFails: true });

		await expect(mocks.assistantAiGateway.getAvailability()).resolves.toMatchObject({
			available: true,
			remoteConfigLoaded: false,
			model: 'gemini-3.8-flash',
		});
	});

	it('rejects an old Remote Config model and keeps the validated fallback', async () => {
		const mocks = installWebMocks({ remoteValues: { lumus_ai_model: 'gemini-3.5-flash' } });

		await expect(mocks.assistantAiGateway.getConfig()).resolves.toMatchObject({
			model: 'gemini-3.8-flash',
		});
	});

	it('does not initialize a model for an unauthenticated user', async () => {
		const mocks = installWebMocks({ authenticated: false });

		await expect(mocks.assistantAiGateway.getAvailability()).resolves.toMatchObject({
			available: false,
			reason: 'Entre na sua conta para usar o Lumus IA.',
		});
		const config = await mocks.assistantAiGateway.getConfig();
		await expect(mocks.assistantAiGateway.converse(conversationRequest(config))).rejects.toBeDefined();
		expect(mocks.getAI).not.toHaveBeenCalled();
	});

	it('initializes App Check before a valid model request and returns its response', async () => {
		const mocks = installWebMocks({ responses: [{ text: 'Reserve primeiro uma parte da renda.' }] });
		const config = await mocks.assistantAiGateway.getConfig();

		await expect(mocks.assistantAiGateway.converse(conversationRequest(config))).resolves.toMatchObject({
			text: 'Reserve primeiro uma parte da renda.',
			actions: [],
		});
		expect(mocks.initializeAppCheck).toHaveBeenCalledTimes(1);
		expect(mocks.initializeAppCheck.mock.invocationCallOrder[0]).toBeLessThan(mocks.getAI.mock.invocationCallOrder[0]);
		expect(mocks.getGenerativeModel).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				model: 'gemini-3.8-flash',
				generationConfig: { maxOutputTokens: 2_048 },
			}),
		);
	});

	it('returns function calls as drafts without executing a persistence operation', async () => {
		const mocks = installWebMocks({
			responses: [
				{
					text: '',
					functionCalls: [{
						id: 'call-test-1',
						name: 'prepare_financial_actions',
						args: {
							actions: [{
								clientActionId: 'expense-1',
								kind: 'create_expense',
								payload: { name: 'Café', amountCents: 1_200, date: '2026-09-21' },
							}],
						},
					}],
				},
				{ text: 'Rascunho preparado.' },
			],
		});
		const config = await mocks.assistantAiGateway.getConfig();

		await expect(mocks.assistantAiGateway.converse(conversationRequest(config))).resolves.toMatchObject({
			text: 'Rascunho preparado.',
			actions: [expect.objectContaining({ clientActionId: 'expense-1', kind: 'create_expense' })],
		});
		expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
		expect(mocks.sendMessage.mock.calls[1]?.[0]).toEqual([
			expect.objectContaining({
				functionResponse: expect.objectContaining({
					id: 'call-test-1',
					name: 'prepare_financial_actions',
					response: expect.objectContaining({ accepted: true, draftCount: 1 }),
				}),
			}),
		]);
	});
});
