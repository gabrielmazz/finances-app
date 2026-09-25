import type {
	AssistantAiAvailability,
	AssistantAiConfig,
	AssistantReportNarrationRequest,
	AssistantTranscriptionRequest,
} from '@/types/lumusAssistant';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
	ASSISTANT_REMOTE_CONFIG_DEFAULTS,
	normalizeAssistantAiConfig,
	type AssistantPlatformAdapter,
	type AssistantPlatformResponse,
} from '@/services/lumusAssistant/assistantGatewayCore';
import {
	TRANSCRIPTION_INSTRUCTION,
	buildReportNarrationInstruction,
} from '@/services/lumusAssistant/assistantPrompt';
import { mapAssistantError } from '@/utils/lumusAssistantErrors';
import { PRODUCTION_FIREBASE_PROJECT_ID } from '@/utils/firebaseRuntime';

type ExpoGoPlatform = 'android' | 'ios';
type ExpoGoContent = { role: 'user' | 'model'; parts: Array<Record<string, unknown>> };

type ExpoGoAssistantDependencies = {
	isDevelopment: boolean;
	usesFirebaseEmulator: boolean;
	platform: ExpoGoPlatform;
	isAuthenticated: () => boolean;
	firebase: { apiKey?: string; appId?: string; projectId?: string };
	debugToken?: string;
	fetchImplementation: typeof fetch;
};

type AppCheckExchangeResponse = { token?: unknown; ttl?: unknown };
type GenerateContentResponse = {
	candidates?: Array<{
		content?: { parts?: Array<Record<string, unknown>> };
	}>;
	};

const getFirebaseConfigError = (firebase: ExpoGoAssistantDependencies['firebase']) => {
	if (!firebase.apiKey || !firebase.appId || !firebase.projectId) return true;
	if (firebase.projectId !== PRODUCTION_FIREBASE_PROJECT_ID || !firebase.appId.includes(':web:')) return true;
	return false;
};

const errorWithStatus = (status: number, message: string) => {
	const error = new Error(message) as Error & { status: number };
	error.status = status;
	return error;
};

const getSafeServiceError = (status: number, responseMessage = '') => {
	const detail = responseMessage.toLocaleLowerCase('pt-BR');
	if (/app.?check|attestation|integrity/.test(detail)) {
		const error = new Error('Firebase App Check rejeitou a solicitação.');
		error.name = 'AssistantAppCheckError';
		(error as Error & { status: number }).status = status;
		return error;
	}
	if (/model|publisher/.test(detail)) {
		return errorWithStatus(status, 'Firebase AI Logic não encontrou o modelo configurado.');
	}
	return errorWithStatus(status, `Firebase AI Logic retornou HTTP ${status}.`);
};

const readResponseErrorMessage = async (response: Response) => {
	try {
		const body = await response.json() as { error?: { message?: unknown } };
		return typeof body.error?.message === 'string' ? body.error.message : '';
	} catch {
		return '';
	}
};

const getTextAndFunctionCalls = (content?: { parts?: Array<Record<string, unknown>> }): AssistantPlatformResponse => {
	const parts = Array.isArray(content?.parts) ? content.parts : [];
	const text = parts
		.map(part => typeof part.text === 'string' ? part.text : '')
		.filter(Boolean)
		.join('\n');
	const functionCalls = parts.flatMap(part => {
		if (!part.functionCall || typeof part.functionCall !== 'object') return [];
		const call = part.functionCall as Record<string, unknown>;
		if (typeof call.name !== 'string' || !call.name) return [];
		return [{
			...(typeof call.id === 'string' ? { id: call.id } : {}),
			name: call.name,
			args: call.args && typeof call.args === 'object' && !Array.isArray(call.args)
				? call.args as Record<string, unknown>
				: {},
		}];
	});
	return { text, functionCalls };
};

/**
 * Expo Go has no native React Native Firebase modules. This development-only
 * adapter uses the Firebase AI Logic generateContent transport directly and
 * exchanges a registered App Check Debug token in memory. It never receives
 * or sends a financial Firebase Auth token. See [[Assistente Lumus]].
 */
export const createExpoGoAssistantAdapter = (
	dependencies: ExpoGoAssistantDependencies,
): AssistantPlatformAdapter => {
	const config: AssistantAiConfig = normalizeAssistantAiConfig({
		enabled: ASSISTANT_REMOTE_CONFIG_DEFAULTS.lumus_ai_enabled,
		model: ASSISTANT_REMOTE_CONFIG_DEFAULTS.lumus_ai_model,
		maxContextTurns: ASSISTANT_REMOTE_CONFIG_DEFAULTS.lumus_ai_max_context_turns,
		maxActionsPerResponse: ASSISTANT_REMOTE_CONFIG_DEFAULTS.lumus_ai_max_actions,
		maxToolCalls: ASSISTANT_REMOTE_CONFIG_DEFAULTS.lumus_ai_max_tool_calls,
		maxRequestsPerMinute: ASSISTANT_REMOTE_CONFIG_DEFAULTS.lumus_ai_max_requests_per_minute,
	});
	let cachedAppCheckToken: { token: string; refreshAt: number } | null = null;
	let appCheckPromise: Promise<string> | null = null;

	const runtimeAllowed = () => dependencies.isDevelopment && dependencies.usesFirebaseEmulator;
	const assertRuntime = () => {
		if (!runtimeAllowed()) {
			const error = new Error('O Lumus IA no Expo Go está disponível somente no ambiente local de desenvolvimento.');
			error.name = 'AssistantUnsupportedRuntimeError';
			throw error;
		}
		if (getFirebaseConfigError(dependencies.firebase)) {
			throw new Error('Configure os identificadores públicos do Firebase de desenvolvimento para usar o Lumus no Expo Go.');
		}
	};

	const getAppCheckToken = async () => {
		assertRuntime();
		const debugToken = dependencies.debugToken?.trim();
		if (!debugToken || debugToken.toLocaleLowerCase('pt-BR') === 'true') {
			const error = new Error('O Lumus no Expo Go precisa de um token Firebase App Check Debug cadastrado para o app Web de desenvolvimento.');
			error.name = 'AssistantAppCheckError';
			throw error;
		}
		if (cachedAppCheckToken && cachedAppCheckToken.refreshAt > Date.now()) {
			return cachedAppCheckToken.token;
		}
		if (appCheckPromise) return appCheckPromise;

		appCheckPromise = (async () => {
			const { apiKey, appId, projectId } = dependencies.firebase;
			const appResource = `projects/${encodeURIComponent(projectId!)}/apps/${encodeURIComponent(appId!)}`;
			const url = `https://firebaseappcheck.googleapis.com/v1/${appResource}:exchangeDebugToken?key=${encodeURIComponent(apiKey!)}`;
			const response = await dependencies.fetchImplementation(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ debugToken, limitedUse: false }),
			});
			if (!response.ok) {
				const message = await readResponseErrorMessage(response);
				throw getSafeServiceError(response.status, message);
			}
			const result = await response.json() as AppCheckExchangeResponse;
			if (typeof result.token !== 'string' || typeof result.ttl !== 'string') {
				throw new Error('Resposta inválida do Firebase App Check.');
			}
			const ttlSeconds = Number.parseFloat(result.ttl.replace(/s$/, ''));
			if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
				throw new Error('Expiração inválida do Firebase App Check.');
			}
			cachedAppCheckToken = {
				token: result.token,
				refreshAt: Date.now() + Math.max(0, ttlSeconds * 1_000 - 60_000),
			};
			return result.token;
		})();
		try {
			return await appCheckPromise;
		} finally {
			appCheckPromise = null;
		}
	};

	const callModel = async (
		model: string,
		request: Record<string, unknown>,
		signal?: AbortSignal,
	) => {
		assertRuntime();
		const appCheckToken = await getAppCheckToken();
		const { apiKey, appId, projectId } = dependencies.firebase;
		const modelPath = `projects/${encodeURIComponent(projectId!)}/${model}`;
		const url = `https://firebasevertexai.googleapis.com/v1beta/${modelPath}:generateContent`;
		const response = await dependencies.fetchImplementation(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-goog-api-key': apiKey!,
				'X-Firebase-Appid': appId!,
				'X-Firebase-AppCheck': appCheckToken,
			},
			body: JSON.stringify(request),
			...(signal ? { signal } : {}),
		});
		if (!response.ok) {
			const message = await readResponseErrorMessage(response);
			throw getSafeServiceError(response.status, message);
		}
		return await response.json() as GenerateContentResponse;
	};

	const generate = async (
		model: string,
		contents: ExpoGoContent[],
		options: Record<string, unknown> = {},
		signal?: AbortSignal,
	) => callModel(model, { ...options, contents }, signal);

	const adapter: AssistantPlatformAdapter = {
		async getConfig() {
			return config;
		},
		async getAvailability(): Promise<AssistantAiAvailability> {
			const unavailable = (reason: string, appCheckConfigured = false): AssistantAiAvailability => ({
				available: false,
				platform: dependencies.platform,
				runtime: 'expo-go',
				appCheckConfigured,
				remoteConfigLoaded: false,
				model: config.model,
				reason,
			});
			if (!runtimeAllowed()) {
				return unavailable('O Lumus IA no Expo Go fica disponível somente em desenvolvimento, com os dados financeiros conectados ao Emulator Suite.');
			}
			if (getFirebaseConfigError(dependencies.firebase)) {
				return unavailable('Configure os identificadores públicos do Firebase de desenvolvimento para usar o Lumus no Expo Go.');
			}
			if (!dependencies.isAuthenticated()) {
				return unavailable('Entre na sua conta do Emulator Suite para usar o Lumus IA.');
			}
			try {
				await getAppCheckToken();
			} catch (error) {
				const friendlyError = mapAssistantError(error);
				const reason = friendlyError.code === 'network'
					? 'Sem conexão ao validar o App Check do Lumus. Confira sua internet e tente novamente.'
					: friendlyError.code === 'unavailable'
						? 'O serviço App Check está indisponível. Tente novamente em instantes.'
						: friendlyError.code === 'quota'
							? 'O limite de validações do App Check foi atingido. Aguarde e tente novamente.'
							: friendlyError.code === 'app-check'
								? 'Não foi possível validar o App Check Debug. Confira se o token local está cadastrado no app Web do Firebase de desenvolvimento.'
								: friendlyError.message;
				return unavailable(reason);
			}
			return {
				available: config.enabled,
				platform: dependencies.platform,
				runtime: 'expo-go',
				appCheckConfigured: true,
				remoteConfigLoaded: false,
				model: config.model,
				reason: config.enabled ? undefined : 'O Lumus IA foi desativado na configuração local.',
			};
		},
		async createChat(input) {
			assertRuntime();
			if (!dependencies.isAuthenticated()) throw new Error('Usuário não autenticado.');
			let contents: ExpoGoContent[] = input.history.map(item => ({
				role: item.role,
				parts: [{ text: item.text }],
			}));
			const send = async (content: ExpoGoContent, signal?: AbortSignal) => {
				const response = await generate(input.model, [...contents, content], {
					systemInstruction: { parts: [{ text: input.systemInstruction }] },
					tools: [{ functionDeclarations: input.functionDeclarations }],
					generationConfig: { maxOutputTokens: 2_048 },
				}, signal);
				const modelContent = response.candidates?.[0]?.content;
				contents = modelContent?.parts?.length
					? [...contents, content, { role: 'model', parts: modelContent.parts }]
					: [...contents, content];
				return getTextAndFunctionCalls(modelContent);
			};
			return {
				sendText: (text, signal) => send({ role: 'user', parts: [{ text }] }, signal),
				async sendFunctionResponses(responses, signal) {
					return send({
						// Firebase AI Logic chat contents use user/model roles. Tool results
						// remain local function responses and are never Firestore writes.
						role: 'user',
						parts: responses.map(response => ({
							functionResponse: {
								...(response.id ? { id: response.id } : {}),
								name: response.name,
								response: response.response,
							},
						})),
					}, signal);
				},
			};
		},
		async transcribe(request: AssistantTranscriptionRequest) {
			if (!dependencies.isAuthenticated()) throw new Error('Usuário não autenticado.');
			const estimatedBytes = Math.floor((request.base64Audio.length * 3) / 4);
			if (estimatedBytes > 20 * 1024 * 1024 || request.durationMs > 60_500) {
				throw new Error('O áudio excede o limite de 60 segundos ou 20 MB.');
			}
			const response = await generate(request.config.model, [{
				role: 'user',
				parts: [
					{ inlineData: { data: request.base64Audio, mimeType: request.mimeType } },
					{ text: TRANSCRIPTION_INSTRUCTION },
				],
			}], { generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1_024 } }, request.signal);
			const transcriptJson = getTextAndFunctionCalls(response.candidates?.[0]?.content).text;
			const parsed = JSON.parse(transcriptJson) as { transcript?: unknown };
			if (typeof parsed.transcript !== 'string') throw new Error('Resposta JSON de transcrição inválida.');
			return parsed.transcript;
		},
		async narrateReport(request: AssistantReportNarrationRequest) {
			if (!dependencies.isAuthenticated()) throw new Error('Usuário não autenticado.');
			const response = await generate(request.config.model, [{
				role: 'user',
				parts: [{ text: buildReportNarrationInstruction(request.report, request.question) }],
			}], {
				systemInstruction: { parts: [{ text: 'Você explica relatórios calculados pelo aplicativo Lumus e nunca altera dados.' }] },
				generationConfig: { maxOutputTokens: 512 },
			}, request.signal);
			return getTextAndFunctionCalls(response.candidates?.[0]?.content).text;
		},
	};
	return adapter;
};

const expoExtra = Constants.expoConfig?.extra as { lumusAssistantAppCheckDebugToken?: unknown } | undefined;

export const assistantExpoGoAdapter = createExpoGoAssistantAdapter({
	isDevelopment: typeof __DEV__ !== 'undefined' && __DEV__,
	usesFirebaseEmulator: process.env.EXPO_PUBLIC_FIREBASE_TARGET === 'emulator',
	platform: Platform.OS === 'ios' ? 'ios' : 'android',
	isAuthenticated: () => require('@/FirebaseConfig').auth.currentUser !== null,
	firebase: {
		apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
		appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
		projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
	},
	debugToken: typeof __DEV__ !== 'undefined'
		&& __DEV__
		&& process.env.EXPO_PUBLIC_FIREBASE_TARGET === 'emulator'
		? typeof expoExtra?.lumusAssistantAppCheckDebugToken === 'string'
			? expoExtra.lumusAssistantAppCheckDebugToken
			: undefined
		: undefined,
	fetchImplementation: fetch,
});
