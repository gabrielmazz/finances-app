import { deleteApp, initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';

describe('Firebase AI Logic Web function calling protocol', () => {
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
