import {
	DEFAULT_ASSISTANT_AI_CONFIG,
	createAssistantAuthTokenBridge,
	createAssistantAiGateway,
	normalizeAssistantAiConfig,
	resolveAndroidAssistantAppCheckProvider,
	type AssistantPlatformAdapter,
	type AssistantPlatformResponse,
} from '@/services/lumusAssistant/assistantGatewayCore';

const availability = {
	available: true,
	platform: 'web' as const,
	appCheckConfigured: true,
	remoteConfigLoaded: true,
	model: DEFAULT_ASSISTANT_AI_CONFIG.model,
};

const request = (overrides: Record<string, unknown> = {}) => ({
	text: 'Registre uma despesa',
	turns: [],
	catalog: {},
	nowIso: '2026-07-20T15:00:00.000Z',
	timeZone: 'America/Sao_Paulo' as const,
	config: { ...DEFAULT_ASSISTANT_AI_CONFIG },
	...overrides,
});

const createAdapter = (
	response: AssistantPlatformResponse = { text: 'Tudo certo.', functionCalls: [] },
): AssistantPlatformAdapter => ({
	getConfig: async () => ({ ...DEFAULT_ASSISTANT_AI_CONFIG }),
	getAvailability: async () => availability,
	createChat: async () => ({
		sendText: async () => response,
		sendFunctionResponses: async () => ({ text: 'Rascunhos preparados.', functionCalls: [] }),
	}),
	transcribe: async () => 'transcrição segura',
	narrateReport: async () => 'Narrativa segura.',
});

describe('Lumus Assistant AI gateway', () => {
	it('caps every remotely configurable limit to the safe application maximum', () => {
		expect(normalizeAssistantAiConfig({
			model: 'invalid model',
			maxContextTurns: 999,
			maxActionsPerResponse: 999,
			maxToolCalls: 999,
			maxRequestsPerMinute: 999,
		})).toEqual({
			...DEFAULT_ASSISTANT_AI_CONFIG,
			maxContextTurns: 12,
			maxActionsPerResponse: 20,
			maxToolCalls: 8,
			maxRequestsPerMinute: 10,
		});
	});

	it('passes only the twelve most recent turns and caps model actions at twenty', async () => {
		let receivedHistory: Array<{ role: 'user' | 'model'; text: string }> = [];
		let receivedSystemInstruction = '';
		const actions = Array.from({ length: 30 }, (_, index) => ({
			clientActionId: `expense_${index}`,
			kind: 'create_expense',
			payload: { name: `Despesa ${index}` },
		}));
		const adapter = createAdapter({
			text: '',
			functionCalls: [{ name: 'prepare_financial_actions', args: { actions } }],
		});
		adapter.createChat = async input => {
			receivedHistory = input.history;
			receivedSystemInstruction = input.systemInstruction;
			return {
				sendText: async () => ({ text: '', functionCalls: [{ name: 'prepare_financial_actions', args: { actions } }] }),
				sendFunctionResponses: async () => ({ text: '<b>Rascunhos preparados.</b>', functionCalls: [] }),
			};
		};
		const gateway = createAssistantAiGateway(adapter);
		const turns = Array.from({ length: 16 }, (_, index) => ({
			role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
			text: `turno ${index}`,
			createdAt: new Date(2026, 6, 20, 12, index).toISOString(),
		}));

		const result = await gateway.converse(request({ turns, activeSummary: '[{"kind":"create_expense"}]' }));

		expect(receivedHistory).toHaveLength(12);
		expect(receivedHistory[0]?.text).toBe('turno 4');
		expect(receivedSystemInstruction).toContain('[{"kind":"create_expense"}]');
		expect(result.actions).toHaveLength(20);
		expect(result.toolCallCount).toBe(1);
		expect(result.text).toBe('Rascunhos preparados.');
	});

	it('allows only one active request for the conversation', async () => {
		let resolveFirst!: (response: AssistantPlatformResponse) => void;
		const firstResponse = new Promise<AssistantPlatformResponse>(resolve => {
			resolveFirst = resolve;
		});
		const adapter = createAdapter();
		adapter.createChat = async () => ({
			sendText: async () => firstResponse,
			sendFunctionResponses: async () => ({ text: '', functionCalls: [] }),
		});
		const gateway = createAssistantAiGateway(adapter);

		const first = gateway.converse(request());
		await expect(gateway.converse(request())).rejects.toMatchObject({ code: 'busy' });
		resolveFirst({ text: 'Concluído.', functionCalls: [] });
		await expect(first).resolves.toMatchObject({ text: 'Concluído.' });
	});

	it('stops locally at the configured free request rate', async () => {
		const gateway = createAssistantAiGateway(createAdapter());
		const limitedRequest = request({
			config: { ...DEFAULT_ASSISTANT_AI_CONFIG, maxRequestsPerMinute: 2 },
		});

		await gateway.converse(limitedRequest);
		await gateway.converse(limitedRequest);
		await expect(gateway.converse(limitedRequest)).rejects.toMatchObject({ code: 'quota' });
	});

	it('keeps the local request quota isolated per authenticated user scope', async () => {
		const gateway = createAssistantAiGateway(createAdapter());
		const config = { ...DEFAULT_ASSISTANT_AI_CONFIG, maxRequestsPerMinute: 1 };

		await gateway.converse(request({ requestScope: 'user-a', config }));
		await expect(gateway.converse(request({ requestScope: 'user-b', config }))).resolves.toMatchObject({
			text: 'Tudo certo.',
		});
		await expect(gateway.converse(request({ requestScope: 'user-a', config }))).rejects.toMatchObject({ code: 'quota' });
	});

	it('bridges the current Firebase JS auth token without retaining account data', async () => {
		let forceRefreshReceived: boolean | undefined;
		let currentUser: { getIdToken(forceRefresh?: boolean): Promise<string> } | null = {
			getIdToken: async forceRefresh => {
				forceRefreshReceived = forceRefresh;
				return 'temporary-token';
			},
		};
		const bridge = createAssistantAuthTokenBridge(() => currentUser);

		await expect(bridge.currentUser?.getIdToken(true)).resolves.toBe('temporary-token');
		expect(forceRefreshReceived).toBe(true);
		currentUser = null;
		expect(bridge.currentUser).toBeNull();
	});

	it('selects debug App Check only for development/preview and Play Integrity otherwise', () => {
		expect(resolveAndroidAssistantAppCheckProvider(true, 'playIntegrity')).toBe('debug');
		expect(resolveAndroidAssistantAppCheckProvider(false, 'debug')).toBe('debug');
		expect(resolveAndroidAssistantAppCheckProvider(false, 'playIntegrity')).toBe('playIntegrity');
		expect(resolveAndroidAssistantAppCheckProvider(false)).toBe('playIntegrity');
	});

	it('sanitizes deterministic-report narratives produced by the model', async () => {
		const adapter = createAdapter();
		adapter.narrateReport = async () => '<p>Resumo simples.</p> ```código```';
		const gateway = createAssistantAiGateway(adapter);

		await expect(gateway.narrateReport({
			report: {
				kind: 'monthly_overview',
				title: 'Visão do mês',
				periodLabel: 'julho de 2026',
				scopeLabel: 'Minha conta',
				metrics: [],
				deterministicSummary: 'Resumo local.',
				notes: [],
			},
			config: { ...DEFAULT_ASSISTANT_AI_CONFIG },
		})).resolves.toBe('Resumo simples.');
	});
});
