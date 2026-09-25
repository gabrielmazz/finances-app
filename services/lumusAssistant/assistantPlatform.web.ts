import { auth, app } from '@/FirebaseConfig';
import {
	PRODUCTION_FIREBASE_PROJECT_ID,
	isFirebaseEmulatorRuntime,
} from '@/utils/firebaseRuntime';
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
import { canObtainAssistantAppCheckToken } from '@/utils/lumusAssistantAppCheck';
import {
	getApps,
	initializeApp,
	type FirebaseApp,
	type FirebaseOptions,
} from 'firebase/app';
import {
	GoogleAIBackend,
	getAI,
	getGenerativeModel,
	type FunctionDeclaration,
	type Part,
} from 'firebase/ai';
import {
	ReCaptchaEnterpriseProvider,
	getToken,
	initializeAppCheck,
	type AppCheck,
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
const ASSISTANT_DEVELOPMENT_APP_NAME = 'LUMUS_ASSISTANT_DEVELOPMENT';

let webAppCheck: AppCheck | null = null;
let remoteConfigInstance: RemoteConfig | null = null;
let remoteConfigLoaded = false;
let configPromise: Promise<AssistantAiConfig> | null = null;

const getAssistantDevelopmentFirebaseOptions = (): FirebaseOptions => {
	// These are public Firebase client identifiers, not Gemini credentials. They
	// let only AI Logic, App Check and Remote Config use the real project while
	// Auth, Firestore and Functions remain connected to the local emulators.
	const options: FirebaseOptions = {
		apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
		authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
		projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
		storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
		messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
		appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
		measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
	};
	if (
		options.projectId !== PRODUCTION_FIREBASE_PROJECT_ID ||
		!options.apiKey ||
		!options.authDomain ||
		!options.storageBucket ||
		!options.messagingSenderId ||
		!options.appId
	) {
		throw new Error('Configuração pública do Firebase AI de desenvolvimento ausente ou inválida.');
	}
	return options;
};

const getAssistantFirebaseApp = (): FirebaseApp => {
	if (!isFirebaseEmulatorRuntime()) return app;
	const existing = getApps().find(candidate => candidate.name === ASSISTANT_DEVELOPMENT_APP_NAME);
	return existing ?? initializeApp(
		getAssistantDevelopmentFirebaseOptions(),
		ASSISTANT_DEVELOPMENT_APP_NAME,
	);
};

const ensureWebAppCheck = (assistantApp: FirebaseApp) => {
	if (webAppCheck) return webAppCheck;
	if (!SITE_KEY) {
		throw new Error('Firebase App Check reCAPTCHA Enterprise não configurado.');
	}
	const debugToken = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN?.trim();
	if (isFirebaseEmulatorRuntime() || (process.env.NODE_ENV === 'development' && debugToken)) {
		(globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
			debugToken && debugToken.toLocaleLowerCase('pt-BR') !== 'true' ? debugToken : true;
	}
	const initialized = initializeAppCheck(assistantApp, {
		provider: new ReCaptchaEnterpriseProvider(SITE_KEY),
		isTokenAutoRefreshEnabled: true,
	});
	webAppCheck = initialized;
	return initialized;
};

const readRemoteConfig = async (forceRefresh = false): Promise<AssistantAiConfig> => {
	if (!forceRefresh && configPromise) {
		return configPromise;
	}
	configPromise = (async () => {
		try {
			const supported = await isSupported().catch(() => false);
			if (!supported) {
				remoteConfigLoaded = false;
				return normalizeAssistantAiConfig({});
			}

			const assistantApp = getAssistantFirebaseApp();
			const remoteConfig = remoteConfigInstance ?? getRemoteConfig(assistantApp);
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
		} catch {
			remoteConfigLoaded = false;
			return normalizeAssistantAiConfig({});
		}
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
		...(call.id ? { id: call.id } : {}),
		name: call.name,
		args: call.args && typeof call.args === 'object' ? (call.args as Record<string, unknown>) : {},
	}));
	return { text, functionCalls };
};

const adapter: AssistantPlatformAdapter = {
	getConfig: readRemoteConfig,
	async getAvailability(): Promise<AssistantAiAvailability> {
		let assistantApp: FirebaseApp;
		try {
			assistantApp = getAssistantFirebaseApp();
		} catch {
			const config = normalizeAssistantAiConfig({ enabled: false });
			return {
				available: false,
				platform: 'web',
				appCheckConfigured: false,
				remoteConfigLoaded: false,
				model: config.model,
				reason: 'Configure os identificadores públicos do projeto Firebase para testar o Lumus IA em desenvolvimento.',
			};
		}
		const config = await readRemoteConfig();
		let appCheckConfigured = false;
		if (SITE_KEY) {
			try {
				const appCheck = ensureWebAppCheck(assistantApp);
				appCheckConfigured = await canObtainAssistantAppCheckToken({
					getToken: async () => getToken(appCheck),
				});
			} catch {
				appCheckConfigured = false;
			}
		}
		return {
			available: Boolean(config.enabled && appCheckConfigured && auth.currentUser),
			platform: 'web',
			appCheckConfigured,
			remoteConfigLoaded,
			model: config.model,
			reason: !SITE_KEY
				? 'Defina EXPO_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_KEY.'
				: !appCheckConfigured
					? 'Não foi possível obter um token do Firebase App Check. Cadastre o token de debug e tente novamente.'
				: !auth.currentUser
					? 'Entre na sua conta para usar o Lumus IA.'
					: !config.enabled
						? 'O Lumus IA foi desativado pelo Remote Config.'
						: undefined,
		};
	},
	async createChat(input) {
		const assistantApp = getAssistantFirebaseApp();
		ensureWebAppCheck(assistantApp);
		if (!auth.currentUser) {
			throw new Error('Usuário não autenticado.');
		}
		const ai = getAI(assistantApp, { backend: new GoogleAIBackend() });
		const model = getGenerativeModel(ai, {
			model: input.model,
			systemInstruction: input.systemInstruction,
			tools: [{ functionDeclarations: input.functionDeclarations as unknown as FunctionDeclaration[] }],
			generationConfig: {
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
						...(response.id ? { id: response.id } : {}),
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
		const assistantApp = getAssistantFirebaseApp();
		ensureWebAppCheck(assistantApp);
		if (!auth.currentUser) {
			throw new Error('Usuário não autenticado.');
		}
		const estimatedBytes = Math.floor((request.base64Audio.length * 3) / 4);
		if (estimatedBytes > 20 * 1024 * 1024 || request.durationMs > 60_500) {
			throw new Error('O áudio excede o limite de 60 segundos ou 20 MB.');
		}
		const ai = getAI(assistantApp, { backend: new GoogleAIBackend() });
		const model = getGenerativeModel(ai, {
			model: request.config.model,
			generationConfig: {
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
		const assistantApp = getAssistantFirebaseApp();
		ensureWebAppCheck(assistantApp);
		if (!auth.currentUser) {
			throw new Error('Usuário não autenticado.');
		}
		const ai = getAI(assistantApp, { backend: new GoogleAIBackend() });
		const model = getGenerativeModel(ai, {
			model: request.config.model,
			systemInstruction: 'Você explica relatórios calculados pelo aplicativo Lumus e nunca altera dados.',
			generationConfig: { maxOutputTokens: 512 },
		});
		const result = await model.generateContent(
			buildReportNarrationInstruction(request.report),
			{ signal: request.signal },
		);
		return result.response.text();
	},
};

export const assistantAiGateway = createAssistantAiGateway(adapter);
