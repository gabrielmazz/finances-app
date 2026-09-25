import { deleteApp, initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { createAssistantAiGateway, DEFAULT_ASSISTANT_AI_CONFIG } from '@/services/lumusAssistant/assistantGatewayCore';

describe('Firebase AI Logic Web function calling protocol', () => {
	it('accepts a new command after an unanswered financial question', async () => {
		const requests: Array<{ contents: Array<{ role: string; parts: unknown[] }> }> = [];
		const originalFetch = global.fetch;
		global.fetch = jest.fn(async (_input, init) => {
			requests.push(JSON.parse(String(init?.body)));
			return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Resposta curta.' }] } }] }), {
				status: 200, headers: { 'Content-Type': 'application/json' },
			});
		}) as typeof fetch;
		const app = initializeApp({ apiKey: 'public-test-key', appId: '1:000000000000:web:history', projectId: 'demo-lumus-protocol-test' }, 'LUMUS_HISTORY_TEST');
		try {
			const model = getGenerativeModel(getAI(app, { backend: new GoogleAIBackend() }), { model: 'gemini-3.8-flash' });
			expect(() => model.startChat({ history: [
				{ role: 'user', parts: [{ text: 'Pergunta anterior.' }] },
				{ role: 'user', parts: [{ text: 'Novo comando.' }] },
			] })).toThrow(/can't follow 'user'/);
			const gateway = createAssistantAiGateway({
				getConfig: async () => DEFAULT_ASSISTANT_AI_CONFIG,
				getAvailability: async () => ({ available: true, platform: 'web', appCheckConfigured: true, remoteConfigLoaded: true, model: 'gemini-3.8-flash' }),
				createChat: async input => {
					const chat = model.startChat({ history: input.history.map(turn => ({ role: turn.role, parts: [{ text: turn.text }] })) });
					return {
						sendText: async text => ({ text: (await chat.sendMessage(text)).response.text(), functionCalls: [] }),
						sendFunctionResponses: async () => ({ text: '', functionCalls: [] }),
					};
				},
				transcribe: async () => '', narrateReport: async () => '',
			});
			await expect(gateway.converse({
				text: 'Novo comando.',
				turns: [
					{ role: 'user', text: 'Pergunta anterior.', createdAt: '2026-09-25T12:00:00Z' },
					{ role: 'user', text: 'Novo comando.', createdAt: '2026-09-25T12:01:00Z' },
				],
				catalog: {}, nowIso: '2026-09-25T12:01:00Z', timeZone: 'America/Sao_Paulo', config: DEFAULT_ASSISTANT_AI_CONFIG,
			})).resolves.toMatchObject({ text: 'Resposta curta.' });
			expect(requests).toHaveLength(1);
			expect(requests[0]?.contents).toHaveLength(1);
		} finally {
			global.fetch = originalFetch;
			await deleteApp(app);
		}
	});

	it('sends function responses with the user role required by Gemini 3.x', async () => {
		const requests: Array<{ contents: Array<{ role: string; parts: unknown[] }> }> = [];
		const originalFetch = global.fetch;
		global.fetch = jest.fn(async (_input, init) => {
			requests.push(JSON.parse(String(init?.body)));
			const content = requests.length === 1
				? { role: 'model', parts: [{ functionCall: { id: 'call-1', name: 'prepare_financial_actions', args: {} } }] }
				: { role: 'model', parts: [{ text: 'Rascunho preparado.' }] };
			return new Response(JSON.stringify({ candidates: [{ content }] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}) as typeof fetch;
		const app = initializeApp({
			apiKey: 'public-test-key',
			appId: '1:000000000000:web:test',
			projectId: 'demo-lumus-protocol-test',
		}, 'LUMUS_PROTOCOL_TEST');

		try {
			const model = getGenerativeModel(getAI(app, { backend: new GoogleAIBackend() }), {
				model: 'gemini-3.8-flash',
			});
			const chat = model.startChat();
			const first = await chat.sendMessage('Prepare um rascunho fictício.');
			const call = first.response.functionCalls()?.[0];
			expect(call?.id).toBe('call-1');
			await chat.sendMessage([{ functionResponse: {
				id: call?.id,
				name: call!.name,
				response: { accepted: true, draftCount: 1 },
			} }]);

			expect(requests).toHaveLength(2);
			expect(requests[1]?.contents.at(-1)).toMatchObject({
				role: 'user',
				parts: [{ functionResponse: { id: 'call-1', name: 'prepare_financial_actions' } }],
			});
		} finally {
			global.fetch = originalFetch;
			await deleteApp(app);
		}
	});
});
