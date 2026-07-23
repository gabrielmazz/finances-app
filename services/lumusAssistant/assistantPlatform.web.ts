import { auth, app } from '@/FirebaseConfig';
import type {
	AssistantAiAvailability,
	AssistantAiConfig,
	AssistantReportNarrationRequest,
	AssistantTranscriptionRequest,
} from '@/types/lumusAssistant';
import {
	ASSISTANT_REMOTE_CONFIG_DEFAULTS,
	createAssistantAiGateway,
	normalizeAssistantAiConfig,
	type AssistantPlatformAdapter,
	type AssistantPlatformResponse,
} from '@/services/lumusAssistant/assistantGatewayCore';
import {
	TRANSCRIPTION_INSTRUCTION,
	buildReportNarrationInstruction,
} from '@/services/lumusAssistant/assistantPrompt';
import {
	GoogleAIBackend,
	getAI,
	getGenerativeModel,
	type FunctionDeclaration,
	type Part,
} from 'firebase/ai';
import {
	ReCaptchaEnterpriseProvider,
	initializeAppCheck,
} from 'firebase/app-check';
import {
	fetchAndActivate,
	getBoolean,
	getNumber,
	getRemoteConfig,
	getString,
	isSupported,
	type RemoteConfig,
} from 'firebase/remote-config';

const SITE_KEY = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_KEY?.trim() ?? '';

let appCheckInitialized = false;
let remoteConfigInstance: RemoteConfig | null = null;
let remoteConfigLoaded = false;
let configPromise: Promise<AssistantAiConfig> | null = null;

const ensureWebAppCheck = () => {
	if (appCheckInitialized) {
		return;
	}
	if (!SITE_KEY) {
		throw new Error('Firebase App Check reCAPTCHA Enterprise não configurado.');
	}
	const debugToken = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN?.trim();
	if (process.env.NODE_ENV === 'development' && debugToken) {
		(globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
	}
	try {
		initializeAppCheck(app, {
			provider: new ReCaptchaEnterpriseProvider(SITE_KEY),
			isTokenAutoRefreshEnabled: true,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message.toLocaleLowerCase('pt-BR') : '';
		if (!message.includes('already') && !message.includes('inicializ')) {
			throw error;
		}
	}
	appCheckInitialized = true;
};

const readRemoteConfig = async (forceRefresh = false): Promise<AssistantAiConfig> => {
	if (!forceRefresh && configPromise) {
		return configPromise;
	}
	configPromise = (async () => {
		const supported = await isSupported().catch(() => false);
		if (!supported) {
			remoteConfigLoaded = false;
			return normalizeAssistantAiConfig({});
		}

		const remoteConfig = remoteConfigInstance ?? getRemoteConfig(app);
		remoteConfigInstance = remoteConfig;
		remoteConfig.defaultConfig = { ...ASSISTANT_REMOTE_CONFIG_DEFAULTS };
		remoteConfig.settings = {
			fetchTimeoutMillis: 10_000,
			minimumFetchIntervalMillis: process.env.NODE_ENV === 'development' ? 0 : 12 * 60 * 60 * 1_000,
		};
		try {
			await fetchAndActivate(remoteConfig);
			remoteConfigLoaded = true;
		} catch {
			remoteConfigLoaded = false;
		}

		return normalizeAssistantAiConfig({
			enabled: getBoolean(remoteConfig, 'lumus_ai_enabled'),
			model: getString(remoteConfig, 'lumus_ai_model'),
			maxContextTurns: getNumber(remoteConfig, 'lumus_ai_max_context_turns'),
			maxActionsPerResponse: getNumber(remoteConfig, 'lumus_ai_max_actions'),
			maxToolCalls: getNumber(remoteConfig, 'lumus_ai_max_tool_calls'),
			maxRequestsPerMinute: getNumber(remoteConfig, 'lumus_ai_max_requests_per_minute'),
		});
	})();
	return configPromise;
};

const toPlatformResponse = (result: Awaited<ReturnType<ReturnType<typeof getGenerativeModel>['generateContent']>>): AssistantPlatformResponse => {
	let text = '';
	try {
		text = result.response.text();
	} catch {
		text = '';
	}
	const functionCalls = (result.response.functionCalls() ?? []).map(call => ({
		name: call.name,
		args: call.args && typeof call.args === 'object' ? (call.args as Record<string, unknown>) : {},
	}));
	return { text, functionCalls };
};

const adapter: AssistantPlatformAdapter = {
	getConfig: readRemoteConfig,
	async getAvailability(): Promise<AssistantAiAvailability> {
		const config = await readRemoteConfig();
		return {
			available: Boolean(config.enabled && SITE_KEY && auth.currentUser),
			platform: 'web',
			appCheckConfigured: Boolean(SITE_KEY),
			remoteConfigLoaded,
			model: config.model,
			reason: !SITE_KEY
				? 'Defina EXPO_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_KEY.'
				: !auth.currentUser
					? 'Entre na sua conta para usar o Lumus IA.'
					: !config.enabled
						? 'O Lumus IA foi desativado pelo Remote Config.'
						: undefined,
		};
	},
	async createChat(input) {
		ensureWebAppCheck();
		if (!auth.currentUser) {
			throw new Error('Usuário não autenticado.');
		}
		const ai = getAI(app, { backend: new GoogleAIBackend() });
		const model = getGenerativeModel(ai, {
			model: input.model,
			systemInstruction: input.systemInstruction,
			tools: [{ functionDeclarations: input.functionDeclarations as unknown as FunctionDeclaration[] }],
			generationConfig: {
				temperature: 0.15,
				topP: 0.8,
				maxOutputTokens: 2_048,
			},
		});
		const chat = model.startChat({
			history: input.history.map(item => ({ role: item.role, parts: [{ text: item.text }] })),
		});

		return {
			async sendText(text: string, signal?: AbortSignal) {
				const result = await chat.sendMessage(text, { signal });
				return toPlatformResponse(result);
			},
			async sendFunctionResponses(responses, signal?: AbortSignal) {
				const parts: Part[] = responses.map(response => ({
					functionResponse: {
						name: response.name,
						response: response.response,
					},
				}));
				const result = await chat.sendMessage(parts, { signal });
				return toPlatformResponse(result);
			},
		};
	},
	async transcribe(request: AssistantTranscriptionRequest) {
		ensureWebAppCheck();
		if (!auth.currentUser) {
			throw new Error('Usuário não autenticado.');
		}
		const estimatedBytes = Math.floor((request.base64Audio.length * 3) / 4);
		if (estimatedBytes > 20 * 1024 * 1024 || request.durationMs > 60_500) {
			throw new Error('O áudio excede o limite de 60 segundos ou 20 MB.');
		}
		const ai = getAI(app, { backend: new GoogleAIBackend() });
		const model = getGenerativeModel(ai, {
			model: request.config.model,
			generationConfig: {
				temperature: 0,
				responseMimeType: 'application/json',
				maxOutputTokens: 1_024,
			},
		});
		const result = await model.generateContent(
			[
				{ inlineData: { data: request.base64Audio, mimeType: request.mimeType } },
				{ text: TRANSCRIPTION_INSTRUCTION },
			],
			{ signal: request.signal },
		);
		const parsed = JSON.parse(result.response.text()) as { transcript?: unknown };
		if (typeof parsed.transcript !== 'string') {
			throw new Error('Resposta JSON de transcrição inválida.');
		}
		return parsed.transcript;
	},
	async narrateReport(request: AssistantReportNarrationRequest) {
		ensureWebAppCheck();
		if (!auth.currentUser) {
			throw new Error('Usuário não autenticado.');
		}
		const ai = getAI(app, { backend: new GoogleAIBackend() });
		const model = getGenerativeModel(ai, {
			model: request.config.model,
			systemInstruction: 'Você explica relatórios calculados pelo aplicativo Lumus e nunca altera dados.',
			generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
		});
		const result = await model.generateContent(
			buildReportNarrationInstruction(request.report),
			{ signal: request.signal },
		);
		return result.response.text();
	},
};

export const assistantAiGateway = createAssistantAiGateway(adapter);
