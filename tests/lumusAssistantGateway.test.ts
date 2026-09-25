import {
	ASSISTANT_FREE_BACKUP_MODEL,
	DEFAULT_ASSISTANT_AI_CONFIG,
	createAssistantAuthTokenBridge,
	createAssistantAiGateway,
	normalizeAssistantAiConfig,
	resolveAndroidAssistantAppCheckProvider,
	shouldAttachAssistantAuthToken,
	type AssistantPlatformAdapter,
	type AssistantPlatformResponse,
} from '@/services/lumusAssistant/assistantGatewayCore';
import { buildReportNarrationInstruction } from '@/services/lumusAssistant/assistantPrompt';

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
	it('corrects a largest-expense tool call when the user explicitly asked for the smallest expense', async () => {
		const adapter = createAdapter({ text: '', functionCalls: [{
			name: 'request_financial_report', args: { kind: 'largest_expense', period: '2026-09' },
		}] });
		const result = await createAssistantAiGateway(adapter).converse(request({ text: 'Qual foi meu menor gasto esse mês?' }));
		expect(result.reportRequest).toEqual({ kind: 'smallest_expense', period: '2026-09' });
	});

	it('drops unanswered turns and the current user message before starting a new Firebase chat', async () => {
		let history: Array<{ role: 'user' | 'model'; text: string }> = [];
		const adapter = createAdapter();
		adapter.createChat = async input => {
			history = input.history;
			return { sendText: async () => ({ text: 'Resposta.', functionCalls: [] }), sendFunctionResponses: async () => ({ text: '', functionCalls: [] }) };
		};
		await createAssistantAiGateway(adapter).converse(request({
			text: 'Registre uma despesa',
			turns: [
				{ role: 'user', text: 'Qual foi meu maior gasto?', createdAt: '2026-09-25T12:00:00Z' },
				{ role: 'user', text: 'Registre uma despesa', createdAt: '2026-09-25T12:01:00Z' },
			],
		}));
		expect(history).toEqual([]);
	});

	it('asks the narration to answer the specific question only from calculated metrics', () => {
		const instruction = buildReportNarrationInstruction({
			kind: 'monthly_overview', title: 'Visão do mês', periodLabel: 'setembro de 2026',
			scopeLabel: 'Minha conta', metrics: [], deterministicSummary: 'Resumo calculado.', notes: [],
		}, 'Como foram meus gastos?');
		expect(instruction).toContain('Como foram meus gastos?');
		expect(instruction).toContain('Se o relatório não trouxer os dados necessários');
	});

	it('accepts a targeted largest-expense request without exposing account records to the model', async () => {
		let toolResult: Record<string, unknown> | undefined;
		const adapter = createAdapter();
		adapter.createChat = async ({ functionDeclarations, systemInstruction }) => {
			expect(JSON.stringify(functionDeclarations)).toContain('largest_expense');
			expect(systemInstruction.toLocaleLowerCase('pt-BR')).toContain('maior gasto');
			return {
				sendText: async () => ({ text: '', functionCalls: [{ name: 'request_financial_report', args: { kind: 'largest_expense', period: '2026-07' } }] }),
				sendFunctionResponses: async responses => {
					toolResult = responses[0]?.response;
					return { text: 'Vou consultar seus registros.', functionCalls: [] };
				},
			};
		};
		const result = await createAssistantAiGateway(adapter).converse(request({ text: 'Qual foi meu maior gasto em julho?' }));
		expect(result.reportRequest).toEqual({ kind: 'largest_expense', period: '2026-07' });
		expect(toolResult).toEqual({ accepted: true, message: 'O Lumus calculará o relatório de forma determinística.' });
	});

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

	it.each([
		'gemini-3.5-flash',
		'gemini-3.8-flash-preview',
		'gemini-3.8-flash-latest',
		'gemini-3.8-flash-image',
		'gemini-2.5-flash',
	])('rejects an unvalidated or unstable Remote Config model: %s', model => {
		expect(normalizeAssistantAiConfig({ model }).model).toBe(DEFAULT_ASSISTANT_AI_CONFIG.model);
	});

	it('accepts the explicit stable model selected for this release', () => {
		expect(normalizeAssistantAiConfig({ model: 'gemini-3.8-flash' }).model).toBe('gemini-3.8-flash');
		expect(normalizeAssistantAiConfig({ model: ASSISTANT_FREE_BACKUP_MODEL }).model).toBe(ASSISTANT_FREE_BACKUP_MODEL);
	});

	it.each([500, 429])('uses one free backup after the primary model returns HTTP %s', async status => {
		const models: string[] = [];
		let responseId: string | undefined;
		const adapter = createAdapter();
		adapter.createChat = async input => {
			models.push(input.model);
			return {
				sendText: async () => {
					if (input.model === DEFAULT_ASSISTANT_AI_CONFIG.model) {
						throw { code: 'fetch-error', customErrorData: { status }, message: 'Error fetching from Firebase AI' };
					}
					return { text: '', functionCalls: [{
						id: 'call-1', name: 'prepare_financial_actions', args: { actions: [{
							clientActionId: 'expense-1', kind: 'create_expense', payload: { name: 'Teste' },
						}] },
					}] };
				},
				sendFunctionResponses: async responses => {
					responseId = responses[0]?.id;
					return { text: 'Rascunho preparado.', functionCalls: [] };
				},
			};
		};

		const result = await createAssistantAiGateway(adapter).converse(request());

		expect(models).toEqual([DEFAULT_ASSISTANT_AI_CONFIG.model, ASSISTANT_FREE_BACKUP_MODEL]);
		expect(responseId).toBe('call-1');
		expect(result.fallbackModel).toBe(ASSISTANT_FREE_BACKUP_MODEL);
		expect(result.actions).toHaveLength(1);
	});

	it('does not substitute the model for an invalid request', async () => {
		const adapter = createAdapter();
		const createChat = jest.fn(async () => ({
			sendText: async () => { throw { code: 'fetch-error', customErrorData: { status: 400 }, message: 'Invalid request' }; },
			sendFunctionResponses: async () => ({ text: '', functionCalls: [] }),
		}));
		adapter.createChat = createChat;

		await expect(createAssistantAiGateway(adapter).converse(request())).rejects.toMatchObject({ code: 'invalid-request' });
		expect(createChat).toHaveBeenCalledTimes(1);
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

	it('responds to every function call when a model turn exceeds the tool limit', async () => {
		const calls = Array.from({ length: 9 }, (_, index) => ({
			name: 'request_financial_report',
			args: { kind: 'monthly_overview', period: `2026-${String(index + 1).padStart(2, '0')}` },
		}));
		let returnedResponses: Array<{ name: string; response: Record<string, unknown> }> = [];
		const adapter = createAdapter();
		adapter.createChat = async () => ({
			sendText: async () => ({ text: '', functionCalls: calls }),
			sendFunctionResponses: async responses => {
				returnedResponses = responses;
				return { text: 'Relatórios recebidos.', functionCalls: [] };
			},
		});

		const result = await createAssistantAiGateway(adapter).converse(request());

		expect(result.toolCallCount).toBe(8);
		expect(returnedResponses).toHaveLength(9);
		expect(returnedResponses[8]?.response).toMatchObject({ accepted: false });
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

	it('does not attach an Auth Emulator token to the production AI Logic project', () => {
		expect(shouldAttachAssistantAuthToken(true)).toBe(false);
		expect(shouldAttachAssistantAuthToken(false)).toBe(true);
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
