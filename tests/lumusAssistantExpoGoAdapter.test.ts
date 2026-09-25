import {
	createExpoGoAssistantAdapter,
} from '@/services/lumusAssistant/assistantPlatform.expoGo';
import { PRODUCTION_FIREBASE_PROJECT_ID } from '@/utils/firebaseRuntime';

const makeResponse = (status: number, body: unknown) => ({
	status,
	ok: status >= 200 && status < 300,
	json: async () => body,
}) as Response;

const makeAdapter = (fetchImplementation: typeof fetch, overrides: Record<string, unknown> = {}) =>
	createExpoGoAssistantAdapter({
		isDevelopment: true,
		usesFirebaseEmulator: true,
		platform: 'android',
		isAuthenticated: () => true,
		firebase: {
			apiKey: 'public-test-key',
			appId: '1:123456789:web:expo-test',
			projectId: PRODUCTION_FIREBASE_PROJECT_ID,
		},
		debugToken: 'registered-debug-token',
		fetchImplementation,
		...overrides,
	} as Parameters<typeof createExpoGoAssistantAdapter>[0]);

describe('Lumus Assistant Expo Go adapter', () => {
	it('exchanges App Check once and returns function results to Firebase AI Logic', async () => {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		const fetchImplementation = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
			const request = init ?? {};
			calls.push({ url: String(url), init: request });
			if (String(url).includes('exchangeDebugToken')) {
				return makeResponse(200, { token: 'app-check-test-token', ttl: '3600s' });
			}
			const modelResponse = calls.filter(call => call.url.includes('generateContent')).length === 1
				? { candidates: [{ content: { parts: [{ functionCall: { id: 'call-1', name: 'request_financial_report', args: { kind: 'monthly_overview' } } }] } }] }
				: { candidates: [{ content: { parts: [{ text: 'Resumo pronto.' }] } }] };
			return makeResponse(200, modelResponse);
		}) as typeof fetch;
		const adapter = makeAdapter(fetchImplementation);

		await expect(adapter.getAvailability()).resolves.toMatchObject({
			available: true,
			runtime: 'expo-go',
			appCheckConfigured: true,
			remoteConfigLoaded: false,
		});
		const chat = await adapter.createChat({
			model: 'gemini-3.8-flash',
			systemInstruction: 'Não escreva dados financeiros.',
			history: [{ role: 'user', text: 'Resuma meu mês.' }, { role: 'model', text: 'Vou consultar.' }],
			functionDeclarations: [{ name: 'request_financial_report', parameters: { type: 'object' } }],
		});
		const functionCallResponse = await chat.sendText('Resumo de setembro', new AbortController().signal);
		expect(functionCallResponse.functionCalls).toEqual([{
			id: 'call-1',
			name: 'request_financial_report',
			args: { kind: 'monthly_overview' },
		}]);
		await expect(chat.sendFunctionResponses([{
			id: 'call-1',
			name: 'request_financial_report',
			response: { accepted: true },
		}])).resolves.toMatchObject({ text: 'Resumo pronto.', functionCalls: [] });

		const appCheckCalls = calls.filter(call => call.url.includes('exchangeDebugToken'));
		const modelCalls = calls.filter(call => call.url.includes('generateContent'));
		expect(appCheckCalls).toHaveLength(1);
		expect(modelCalls).toHaveLength(2);
		expect(modelCalls[0].init.headers).toMatchObject({
			'X-Firebase-AppCheck': 'app-check-test-token',
		});
		expect(modelCalls[0].init.headers).not.toHaveProperty('Authorization');
		const initialRequest = JSON.parse(String(modelCalls[0].init.body));
		expect(initialRequest.contents.map((content: { role: string }) => content.role)).toEqual(['user', 'model', 'user']);
		expect(initialRequest.systemInstruction).toEqual({ parts: [{ text: 'Não escreva dados financeiros.' }] });
		expect(String(modelCalls[0].init.body)).not.toContain('app-check-test-token');
		expect(String(modelCalls[0].init.body)).not.toContain('test-user');
		const continuation = JSON.parse(String(modelCalls[1].init.body));
		expect(continuation.contents.at(-1)).toEqual({
			role: 'user',
			parts: [{ functionResponse: { id: 'call-1', name: 'request_financial_report', response: { accepted: true } } }],
		});
	});

	it('keeps Expo Go limited to development with the Emulator Suite and requires App Check Debug', async () => {
		const fetchImplementation = jest.fn(async () => makeResponse(500, {})) as typeof fetch;
		const wrongTargetAdapter = makeAdapter(fetchImplementation, { usesFirebaseEmulator: false });
		await expect(wrongTargetAdapter.getAvailability()).resolves.toMatchObject({
			available: false,
			remoteConfigLoaded: false,
		});
		await expect(wrongTargetAdapter.createChat({
			model: 'gemini-3.8-flash',
			systemInstruction: '',
			history: [],
			functionDeclarations: [],
		})).rejects.toMatchObject({ name: 'AssistantUnsupportedRuntimeError' });
		expect(fetchImplementation).not.toHaveBeenCalled();
		const nonDevelopmentAdapter = makeAdapter(fetchImplementation, { isDevelopment: false });
		await expect(nonDevelopmentAdapter.getAvailability()).resolves.toMatchObject({ available: false });
		expect(fetchImplementation).not.toHaveBeenCalled();

		const missingTokenAdapter = makeAdapter(fetchImplementation, { debugToken: '' });
		await expect(missingTokenAdapter.getAvailability()).resolves.toMatchObject({
			available: false,
			appCheckConfigured: false,
			reason: expect.stringContaining('App Check Debug'),
		});
	});
});
