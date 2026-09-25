import { DEFAULT_ASSISTANT_AI_CONFIG } from '@/services/lumusAssistant/assistantGatewayCore';

describe('Lumus Assistant Android function calling protocol', () => {
	beforeEach(() => {
		jest.resetModules();
		(globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = true;
	});

	it('returns a function result with the user role and the original call id', async () => {
		const app = { name: '[DEFAULT]' };
		let requestCount = 0;
		const generateContent = jest.fn(async (_request: { contents: Array<{ role: string; parts: unknown[] }> }) => {
			requestCount += 1;
			const first = requestCount === 1;
			const call = { id: 'call-1', name: 'prepare_financial_actions', args: { actions: [{
				clientActionId: 'expense-1', kind: 'create_expense', payload: { name: 'Teste' },
			}] } };
			return { response: {
				text: () => first ? '' : 'Rascunho preparado.',
				functionCalls: () => first ? [call] : [],
				candidates: [{ content: first
					? { role: 'model', parts: [{ functionCall: call }] }
					: { role: 'model', parts: [{ text: 'Rascunho preparado.' }] } }],
			} };
		});
		const appCheck = {
			newReactNativeFirebaseAppCheckProvider: () => ({ configure: jest.fn() }),
			initializeAppCheck: jest.fn(async () => {}),
		};
		jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
		jest.doMock('expo-constants', () => ({
			__esModule: true,
			default: { executionEnvironment: 'bare' },
			ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
		}));
		jest.doMock('expo/virtual/env', () => ({ env: process.env }));
		jest.doMock('@/FirebaseConfig', () => ({ auth: { currentUser: { uid: 'test-user' } } }));
		jest.doMock('@/utils/firebaseRuntime', () => ({ isFirebaseEmulatorRuntime: () => true }));
		jest.doMock('@react-native-firebase/app', () => ({ getApp: () => app }));
		jest.doMock('@react-native-firebase/app-check', () => ({ __esModule: true, default: () => appCheck }));
		jest.doMock('@react-native-firebase/ai', () => ({
			GoogleAIBackend: class {},
			getAI: jest.fn(() => ({})),
			getGenerativeModel: jest.fn(() => ({ generateContent })),
		}));
		jest.doMock('@react-native-firebase/remote-config', () => ({}));
		const { assistantAiGateway } = require('@/services/lumusAssistant/assistantPlatform.native') as typeof import('@/services/lumusAssistant/assistantPlatform.native');

		const result = await assistantAiGateway.converse({
			text: 'Prepare um rascunho fictício.',
			turns: [],
			catalog: {},
			nowIso: '2026-09-25T12:00:00.000-03:00',
			timeZone: 'America/Sao_Paulo',
			config: DEFAULT_ASSISTANT_AI_CONFIG,
		});

		expect(result.actions).toHaveLength(1);
		expect(generateContent).toHaveBeenCalledTimes(2);
		const firstContents = generateContent.mock.calls[0]?.[0].contents;
		const secondContents = generateContent.mock.calls[1]?.[0].contents;
		expect(firstContents.at(-1)).toMatchObject({ role: 'user', parts: [{ text: 'Prepare um rascunho fictício.' }] });
		expect(secondContents.at(-2)).toMatchObject({ role: 'model' });
		expect(secondContents.at(-1)).toMatchObject({
			role: 'user',
			parts: [{ functionResponse: { id: 'call-1', name: 'prepare_financial_actions' } }],
		});
	});
});
