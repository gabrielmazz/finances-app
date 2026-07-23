import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { auth } from '@/FirebaseConfig';
import type {
	AssistantAiAvailability,
	AssistantAiConfig,
	AssistantReportNarrationRequest,
	AssistantTranscriptionRequest,
} from '@/types/lumusAssistant';
import {
	ASSISTANT_REMOTE_CONFIG_DEFAULTS,
	createAssistantAuthTokenBridge,
	createAssistantAiGateway,
	normalizeAssistantAiConfig,
	resolveAndroidAssistantAppCheckProvider,
	type AssistantPlatformAdapter,
	type AssistantPlatformResponse,
} from '@/services/lumusAssistant/assistantGatewayCore';
import {
	TRANSCRIPTION_INSTRUCTION,
	buildReportNarrationInstruction,
} from '@/services/lumusAssistant/assistantPrompt';
import type { FirebaseApp as NativeFirebaseApp } from '@react-native-firebase/app';
import type { FirebaseAppCheckTypes } from '@react-native-firebase/app-check';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import type { FunctionDeclaration, Part } from '@react-native-firebase/ai';
import type { RemoteConfig } from '@react-native-firebase/remote-config';

type NativeFirebaseModules = {
	app: typeof import('@react-native-firebase/app');
	appCheck: typeof import('@react-native-firebase/app-check');
	ai: typeof import('@react-native-firebase/ai');
	remoteConfig: typeof import('@react-native-firebase/remote-config');
};

let nativeApp: NativeFirebaseApp | null = null;
let nativeAppCheckModule: FirebaseAppCheckTypes.Module | null = null;
let appCheckInitialization: Promise<FirebaseAppCheckTypes.Module> | null = null;
let remoteConfigInstance: RemoteConfig | null = null;
let remoteConfigLoaded = false;
let configPromise: Promise<AssistantAiConfig> | null = null;
let nativeFirebaseModulesPromise: Promise<NativeFirebaseModules> | null = null;

// Expo Go não contém os módulos RN Firebase. A checagem precisa acontecer antes
// de qualquer import nativo, conforme a limitação registrada em [[Assistente Lumus]].
export const isExpoGoAssistantRuntime = () =>
	Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const assertSupportedNativeRuntime = () => {
	if (Platform.OS !== 'android') {
		throw new Error('Plataforma não suportada pelo Lumus IA nesta entrega.');
	}
	if (isExpoGoAssistantRuntime()) {
		throw new Error('Ambiente não suportado: o Lumus IA no Android exige um development build e não funciona no Expo Go.');
	}
};

const loadNativeFirebaseModules = async (): Promise<NativeFirebaseModules> => {
	assertSupportedNativeRuntime();
	if (!nativeFirebaseModulesPromise) {
		nativeFirebaseModulesPromise = Promise.all([
			import('@react-native-firebase/app'),
			import('@react-native-firebase/app-check'),
			import('@react-native-firebase/ai'),
			import('@react-native-firebase/remote-config'),
		]).then(([app, appCheck, ai, remoteConfig]) => ({ app, appCheck, ai, remoteConfig }));
	}
	try {
		return await nativeFirebaseModulesPromise;
	} catch (error) {
		nativeFirebaseModulesPromise = null;
		throw error;
	}
};

const getConfiguredNativeApp = async () => {
	assertSupportedNativeRuntime();
	if (nativeApp) {
		return nativeApp;
	}
	const { app } = await loadNativeFirebaseModules();
	nativeApp = app.getApp();
	return nativeApp;
};

const ensureNativeAppCheck = async () => {
	if (nativeAppCheckModule) {
		return nativeAppCheckModule;
	}
	if (appCheckInitialization) {
		return appCheckInitialization;
	}
	appCheckInitialization = (async () => {
		const app = await getConfiguredNativeApp();
		const { appCheck } = await loadNativeFirebaseModules();
		const module = appCheck.default(app);
		const provider = module.newReactNativeFirebaseAppCheckProvider();
		const configuredProvider = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_ANDROID_PROVIDER?.trim();
		const selectedProvider = resolveAndroidAssistantAppCheckProvider(__DEV__, configuredProvider);
		const useDebugProvider = selectedProvider === 'debug';
		provider.configure({
			android: {
				provider: selectedProvider,
				...(useDebugProvider && process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN
					? { debugToken: process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN }
					: {}),
			},
		});
		try {
			await module.initializeAppCheck({ provider, isTokenAutoRefreshEnabled: true });
		} catch (error) {
			const message = error instanceof Error ? error.message.toLocaleLowerCase('pt-BR') : '';
			if (!message.includes('already') && !message.includes('inicializ')) {
				throw error;
			}
		}
		nativeAppCheckModule = module;
		return module;
	})();
	try {
		return await appCheckInitialization;
	} catch (error) {
		appCheckInitialization = null;
		throw error;
	}
};

const readRemoteConfig = async (forceRefresh = false): Promise<AssistantAiConfig> => {
	if (Platform.OS !== 'android') {
		return normalizeAssistantAiConfig({ enabled: false });
	}
	if (isExpoGoAssistantRuntime()) {
		return normalizeAssistantAiConfig({});
	}
	if (!forceRefresh && configPromise) {
		return configPromise;
	}
	configPromise = (async () => {
		try {
			const app = await getConfiguredNativeApp();
			const { remoteConfig: remoteConfigModule } = await loadNativeFirebaseModules();
			const remoteConfig = remoteConfigInstance ?? remoteConfigModule.getRemoteConfig(app as never);
			remoteConfigInstance = remoteConfig;
			remoteConfig.defaultConfig = { ...ASSISTANT_REMOTE_CONFIG_DEFAULTS };
			remoteConfig.settings = {
				fetchTimeoutMillis: 10_000,
				minimumFetchIntervalMillis: __DEV__ ? 0 : 12 * 60 * 60 * 1_000,
			};
			try {
				await remoteConfigModule.fetchAndActivate(remoteConfig);
				remoteConfigLoaded = true;
			} catch {
				remoteConfigLoaded = false;
			}
			return normalizeAssistantAiConfig({
				enabled: remoteConfigModule.getBoolean(remoteConfig, 'lumus_ai_enabled'),
				model: remoteConfigModule.getString(remoteConfig, 'lumus_ai_model'),
				maxContextTurns: remoteConfigModule.getNumber(remoteConfig, 'lumus_ai_max_context_turns'),
				maxActionsPerResponse: remoteConfigModule.getNumber(remoteConfig, 'lumus_ai_max_actions'),
				maxToolCalls: remoteConfigModule.getNumber(remoteConfig, 'lumus_ai_max_tool_calls'),
				maxRequestsPerMinute: remoteConfigModule.getNumber(remoteConfig, 'lumus_ai_max_requests_per_minute'),
			});
		} catch {
			remoteConfigLoaded = false;
			return normalizeAssistantAiConfig({ enabled: false });
		}
	})();
	return configPromise;
};

const toPlatformResponse = (result: { response: { text(): string; functionCalls(): Array<{ name: string; args: object }> | undefined } }): AssistantPlatformResponse => {
	let text = '';
	try {
		text = result.response.text();
	} catch {
		text = '';
	}
	return {
		text,
		functionCalls: (result.response.functionCalls() ?? []).map(call => ({
			name: call.name,
			args: call.args && typeof call.args === 'object' ? (call.args as Record<string, unknown>) : {},
		})),
	};
};

const createAuthFacade = () =>
	createAssistantAuthTokenBridge(() => auth.currentUser) as unknown as FirebaseAuthTypes.Module;

const adapter: AssistantPlatformAdapter = {
	getConfig: readRemoteConfig,
	async getAvailability(): Promise<AssistantAiAvailability> {
		const platformSupported = Platform.OS === 'android';
		const isExpoGo = platformSupported && isExpoGoAssistantRuntime();
		let nativeConfigured = false;
		if (platformSupported && !isExpoGo) {
			try {
				await getConfiguredNativeApp();
				nativeConfigured = true;
			} catch {
				nativeConfigured = false;
			}
		}
		const config = await readRemoteConfig();
		return {
			available: Boolean(platformSupported && nativeConfigured && auth.currentUser && config.enabled),
			platform: platformSupported ? 'android' : 'unsupported',
			appCheckConfigured: nativeConfigured,
			remoteConfigLoaded,
			model: config.model,
			reason: !platformSupported
				? 'Nesta entrega, o Lumus IA nativo está disponível no Android.'
				: isExpoGo
					? 'O Lumus IA no Android exige um development build. O restante do aplicativo pode ser testado no Expo Go.'
				: !nativeConfigured
					? 'Forneça google-services.json e gere um development build.'
					: !auth.currentUser
						? 'Entre na sua conta para usar o Lumus IA.'
						: !config.enabled
							? 'O Lumus IA foi desativado pelo Remote Config.'
							: undefined,
		};
	},
	async createChat(input) {
		const app = await getConfiguredNativeApp();
		const appCheck = await ensureNativeAppCheck();
		const { ai: nativeAi } = await loadNativeFirebaseModules();
		if (!auth.currentUser) {
			throw new Error('Usuário não autenticado.');
		}
		const ai = nativeAi.getAI(app, {
			backend: new nativeAi.GoogleAIBackend(),
			appCheck,
			auth: createAuthFacade(),
		});
		const model = nativeAi.getGenerativeModel(ai, {
			model: input.model,
			systemInstruction: input.systemInstruction,
			tools: [{ functionDeclarations: input.functionDeclarations as unknown as FunctionDeclaration[] }],
			generationConfig: { temperature: 0.15, topP: 0.8, maxOutputTokens: 2_048 },
		});
		const chat = model.startChat({
			history: input.history.map(item => ({ role: item.role, parts: [{ text: item.text }] })),
		});
		return {
			async sendText(text: string, signal?: AbortSignal) {
				return toPlatformResponse(await chat.sendMessage(text, { signal }));
			},
			async sendFunctionResponses(responses, signal?: AbortSignal) {
				const parts: Part[] = responses.map(response => ({
					functionResponse: { name: response.name, response: response.response },
				}));
				return toPlatformResponse(await chat.sendMessage(parts, { signal }));
			},
		};
	},
	async transcribe(request: AssistantTranscriptionRequest) {
		const app = await getConfiguredNativeApp();
		const appCheck = await ensureNativeAppCheck();
		const { ai: nativeAi } = await loadNativeFirebaseModules();
		if (!auth.currentUser) {
			throw new Error('Usuário não autenticado.');
		}
		const estimatedBytes = Math.floor((request.base64Audio.length * 3) / 4);
		if (estimatedBytes > 20 * 1024 * 1024 || request.durationMs > 60_500) {
			throw new Error('O áudio excede o limite de 60 segundos ou 20 MB.');
		}
		const ai = nativeAi.getAI(app, { backend: new nativeAi.GoogleAIBackend(), appCheck, auth: createAuthFacade() });
		const model = nativeAi.getGenerativeModel(ai, {
			model: request.config.model,
			generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 1_024 },
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
		const app = await getConfiguredNativeApp();
		const appCheck = await ensureNativeAppCheck();
		const { ai: nativeAi } = await loadNativeFirebaseModules();
		if (!auth.currentUser) {
			throw new Error('Usuário não autenticado.');
		}
		const ai = nativeAi.getAI(app, { backend: new nativeAi.GoogleAIBackend(), appCheck, auth: createAuthFacade() });
		const model = nativeAi.getGenerativeModel(ai, {
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
