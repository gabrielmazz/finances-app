import type {
	AssistantAiAvailability,
	AssistantAiConfig,
	AssistantAiConversationRequest,
	AssistantAiConversationResponse,
	AssistantAiGateway,
	AssistantReportKind,
	AssistantReportNarrationRequest,
	AssistantReportRequest,
	AssistantTranscriptionRequest,
} from '@/types/lumusAssistant';
import {
	ASSISTANT_DEFAULT_CONTEXT_TURNS,
	ASSISTANT_DEFAULT_MAX_ACTIONS,
	ASSISTANT_DEFAULT_MAX_TOOL_CALLS,
	normalizeModelActionProposals,
	sanitizeAssistantInput,
	sanitizeAssistantModelText,
} from '@/utils/lumusAssistant';
import { mapAssistantError } from '@/utils/lumusAssistantErrors';
import {
	ASSISTANT_FUNCTION_DECLARATIONS,
	buildAssistantSystemInstruction,
} from '@/services/lumusAssistant/assistantPrompt';

export const DEFAULT_ASSISTANT_AI_CONFIG: AssistantAiConfig = {
	enabled: true,
	model: 'gemini-3.5-flash',
	maxContextTurns: ASSISTANT_DEFAULT_CONTEXT_TURNS,
	maxActionsPerResponse: ASSISTANT_DEFAULT_MAX_ACTIONS,
	maxToolCalls: ASSISTANT_DEFAULT_MAX_TOOL_CALLS,
	maxRequestsPerMinute: 10,
};

export const ASSISTANT_REMOTE_CONFIG_DEFAULTS = {
	lumus_ai_enabled: true,
	lumus_ai_model: DEFAULT_ASSISTANT_AI_CONFIG.model,
	lumus_ai_max_context_turns: DEFAULT_ASSISTANT_AI_CONFIG.maxContextTurns,
	lumus_ai_max_actions: DEFAULT_ASSISTANT_AI_CONFIG.maxActionsPerResponse,
	lumus_ai_max_tool_calls: DEFAULT_ASSISTANT_AI_CONFIG.maxToolCalls,
	lumus_ai_max_requests_per_minute: DEFAULT_ASSISTANT_AI_CONFIG.maxRequestsPerMinute,
} as const;

const clampInteger = (value: unknown, fallback: number, min: number, max: number) => {
	const parsed = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
};

export const normalizeAssistantAiConfig = (
	value: Partial<AssistantAiConfig>,
): AssistantAiConfig => ({
	enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_ASSISTANT_AI_CONFIG.enabled,
	model:
		typeof value.model === 'string' && /^gemini-[a-z0-9.-]+$/i.test(value.model.trim())
			? value.model.trim()
			: DEFAULT_ASSISTANT_AI_CONFIG.model,
	maxContextTurns: clampInteger(value.maxContextTurns, DEFAULT_ASSISTANT_AI_CONFIG.maxContextTurns, 2, 12),
	maxActionsPerResponse: clampInteger(value.maxActionsPerResponse, DEFAULT_ASSISTANT_AI_CONFIG.maxActionsPerResponse, 1, 20),
	maxToolCalls: clampInteger(value.maxToolCalls, DEFAULT_ASSISTANT_AI_CONFIG.maxToolCalls, 1, 8),
	maxRequestsPerMinute: clampInteger(value.maxRequestsPerMinute, DEFAULT_ASSISTANT_AI_CONFIG.maxRequestsPerMinute, 1, 10),
});

export type AssistantPlatformFunctionCall = {
	name: string;
	args: Record<string, unknown>;
};

export type AssistantPlatformResponse = {
	text: string;
	functionCalls: AssistantPlatformFunctionCall[];
};

export interface AssistantPlatformChat {
	sendText(text: string, signal?: AbortSignal): Promise<AssistantPlatformResponse>;
	sendFunctionResponses(
		responses: Array<{ name: string; response: Record<string, unknown> }>,
		signal?: AbortSignal,
	): Promise<AssistantPlatformResponse>;
}

export interface AssistantPlatformAdapter {
	getConfig(forceRefresh?: boolean): Promise<AssistantAiConfig>;
	getAvailability(): Promise<AssistantAiAvailability>;
	createChat(input: {
		model: string;
		systemInstruction: string;
		history: Array<{ role: 'user' | 'model'; text: string }>;
		functionDeclarations: readonly Record<string, unknown>[];
	}): Promise<AssistantPlatformChat>;
	transcribe(input: AssistantTranscriptionRequest): Promise<string>;
	narrateReport(input: AssistantReportNarrationRequest): Promise<string>;
}

export const resolveAndroidAssistantAppCheckProvider = (
	isDevelopment: boolean,
	configuredProvider?: string,
) => isDevelopment || configuredProvider?.trim() === 'debug' ? 'debug' as const : 'playIntegrity' as const;

export const createAssistantAuthTokenBridge = (
	getCurrentUser: () => { getIdToken(forceRefresh?: boolean): Promise<string> } | null,
) => ({
	get currentUser() {
		const currentUser = getCurrentUser();
		return currentUser
			? { getIdToken: (forceRefresh?: boolean) => currentUser.getIdToken(forceRefresh) }
			: null;
	},
});

const REPORT_KINDS = new Set<AssistantReportKind>([
	'monthly_overview',
	'bank_movements',
	'cash_movements',
	'transaction_search',
	'category_analysis',
	'cash_flow_forecast',
	'pending_obligations',
	'investment_portfolio',
]);

const normalizeReportRequest = (args: Record<string, unknown>): AssistantReportRequest | undefined => {
	if (typeof args.kind !== 'string' || !REPORT_KINDS.has(args.kind as AssistantReportKind)) {
		return undefined;
	}
	return {
		kind: args.kind as AssistantReportKind,
		...(typeof args.period === 'string' ? { period: args.period.slice(0, 20) } : {}),
		...(typeof args.bankRef === 'string' ? { bankRef: args.bankRef.slice(0, 120) } : {}),
		...(typeof args.categoryRef === 'string' ? { categoryRef: args.categoryRef.slice(0, 120) } : {}),
		...(typeof args.query === 'string' ? { query: args.query.slice(0, 120) } : {}),
	};
};

class RequestWindow {
	private timestampsByScope = new Map<string, number[]>();

	assertAvailable(maxRequests: number, scope = 'assistant-session') {
		const now = Date.now();
		const timestamps = (this.timestampsByScope.get(scope) ?? [])
			.filter(timestamp => now - timestamp < 60_000);
		if (timestamps.length >= maxRequests) {
			const error = new Error('Limite local de requisições atingido.');
			error.name = 'AssistantRateLimitError';
			throw error;
		}
		timestamps.push(now);
		this.timestampsByScope.set(scope, timestamps);
	}
}

export const createAssistantAiGateway = (adapter: AssistantPlatformAdapter): AssistantAiGateway => {
	const requestWindow = new RequestWindow();
	let requestInFlight = false;

	const runExclusive = async <T>(
		config: AssistantAiConfig,
		requestScope: string | undefined,
		operation: () => Promise<T>,
	) => {
		if (!config.enabled) {
			const error = new Error('O Lumus IA está temporariamente desativado.');
			error.name = 'AssistantDisabledError';
			throw mapAssistantError(error);
		}
		if (requestInFlight) {
			const error = new Error('Já existe uma resposta em andamento nesta conversa.');
			error.name = 'AssistantBusyError';
			throw mapAssistantError(error);
		}
		try {
			requestWindow.assertAvailable(config.maxRequestsPerMinute, requestScope);
		} catch (error) {
			throw mapAssistantError(error);
		}
		requestInFlight = true;
		try {
			return await operation();
		} catch (error) {
			throw mapAssistantError(error);
		} finally {
			requestInFlight = false;
		}
	};

	return {
		getConfig: forceRefresh => adapter.getConfig(forceRefresh),
		getAvailability: () => adapter.getAvailability(),
		async converse(request: AssistantAiConversationRequest): Promise<AssistantAiConversationResponse> {
			const text = sanitizeAssistantInput(request.text);
			if (!text) {
				throw mapAssistantError(new Error('Mensagem vazia.'));
			}

			return runExclusive(request.config, request.requestScope, async () => {
				const maxTurns = Math.min(12, Math.max(2, request.config.maxContextTurns));
				const history = request.turns.slice(-maxTurns).map(turn => ({
					role: turn.role === 'assistant' ? ('model' as const) : ('user' as const),
					text: sanitizeAssistantInput(turn.text),
				}));
				const chat = await adapter.createChat({
					model: request.config.model,
					systemInstruction: buildAssistantSystemInstruction(request),
					history,
					functionDeclarations: ASSISTANT_FUNCTION_DECLARATIONS,
				});

				let response = await chat.sendText(text, request.signal);
				let toolCallCount = 0;
				let reportRequest: AssistantReportRequest | undefined;
				let actions = normalizeModelActionProposals([], request.config.maxActionsPerResponse);
				let finalText = sanitizeAssistantModelText(response.text);

				while (response.functionCalls.length > 0 && toolCallCount < request.config.maxToolCalls) {
					const functionResponses: Array<{ name: string; response: Record<string, unknown> }> = [];
					for (const call of response.functionCalls) {
						toolCallCount += 1;
						if (toolCallCount > request.config.maxToolCalls) {
							break;
						}

						if (call.name === 'prepare_financial_actions') {
							const proposals = normalizeModelActionProposals(
								call.args.actions,
								request.config.maxActionsPerResponse - actions.length,
							);
							actions = [...actions, ...proposals].slice(0, request.config.maxActionsPerResponse);
							functionResponses.push({
								name: call.name,
								response: {
									accepted: true,
									draftCount: proposals.length,
									message: 'Rascunhos preparados. A confirmação ocorrerá somente nos cartões do aplicativo.',
								},
							});
							continue;
						}

						if (call.name === 'request_financial_report') {
							reportRequest = normalizeReportRequest(call.args) ?? reportRequest;
							functionResponses.push({
								name: call.name,
								response: {
									accepted: Boolean(reportRequest),
									message: reportRequest
										? 'O Lumus calculará o relatório de forma determinística.'
										: 'Solicitação de relatório inválida.',
								},
							});
							continue;
						}

						functionResponses.push({
							name: call.name,
							response: { accepted: false, message: 'Ferramenta não permitida.' },
						});
					}

					if (functionResponses.length === 0) {
						break;
					}
					response = await chat.sendFunctionResponses(functionResponses, request.signal);
					const responseText = sanitizeAssistantModelText(response.text);
					if (responseText) {
						finalText = responseText;
					}
				}

				if (!finalText) {
					finalText = actions.length > 0
						? 'Preparei os registros. Vou pedir somente o que estiver faltando antes de mostrar cada confirmação.'
						: reportRequest
							? 'Vou montar esse resumo com os dados calculados pelo Lumus.'
							: 'Não consegui transformar essa mensagem em uma ação segura. Tente informar o que aconteceu, o valor e a data.';
				}

				return { text: finalText, actions, reportRequest, toolCallCount };
			});
		},
		async transcribe(request: AssistantTranscriptionRequest) {
			return runExclusive(request.config, request.requestScope, async () => {
				const transcript = sanitizeAssistantInput(await adapter.transcribe(request));
				if (!transcript) {
					throw new Error('A transcrição não retornou texto válido.');
				}
				return transcript;
			});
		},
		async narrateReport(request: AssistantReportNarrationRequest) {
			return runExclusive(request.config, request.requestScope, async () => {
				const narrative = sanitizeAssistantModelText(await adapter.narrateReport(request));
				if (!narrative) {
					throw new Error('A resposta narrativa do relatório está vazia.');
				}
				return narrative;
			});
		},
	};
};
