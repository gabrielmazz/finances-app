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
	shouldAttachAssistantAuthToken,
	type AssistantPlatformAdapter,
	type AssistantPlatformResponse,
} from '@/services/lumusAssistant/assistantGatewayCore';
import {
	TRANSCRIPTION_INSTRUCTION,
	buildReportNarrationInstruction,
} from '@/services/lumusAssistant/assistantPrompt';
import { canObtainAssistantAppCheckToken } from '@/utils/lumusAssistantAppCheck';
import { isFirebaseEmulatorRuntime } from '@/utils/firebaseRuntime';
import { assistantExpoGoAdapter } from '@/services/lumusAssistant/assistantPlatform.expoGo';
import type { FirebaseApp as NativeFirebaseApp } from '@react-native-firebase/app';
import type { FirebaseAppCheckTypes } from '@react-native-firebase/app-check';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import type { Content, FunctionDeclaration, Part } from '@react-native-firebase/ai';
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

// Expo Go não contém os módulos RN Firebase. Nessa execução o assistente usa o
// transporte JavaScript isolado; os imports nativos seguem protegidos pela checagem.
export const isExpoGoAssistantRuntime = () =>
	Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const assertSupportedNativeRuntime = () => {
	if (Platform.OS !== 'android') {
		throw new Error('Plataforma não suportada pelo Lumus IA nesta entrega.');
	}
};

const loadNativeFirebaseModules = async (): Promise<NativeFirebaseModules> => {
	assertSupportedNativeRuntime();
	if (!nativeFirebaseModulesPromise) {
		// Keep evaluation behind the Expo Go/runtime guard. Static require targets
		// remain visible to Metro, but RN Firebase JS/native bindings are only
		// evaluated after a compatible development client is confirmed.
		nativeFirebaseModulesPromise = Promise.resolve().then(() => ({
			app: require('@react-native-firebase/app') as NativeFirebaseModules['app'],
			appCheck: require('@react-native-firebase/app-check') as NativeFirebaseModules['appCheck'],
			ai: require('@react-native-firebase/ai') as NativeFirebaseModules['ai'],
			remoteConfig: require('@react-native-firebase/remote-config') as NativeFirebaseModules['remoteConfig'],
		}));
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
		const configuredExtra = Constants.expoConfig?.extra as {
			lumusAssistantAppCheckDebugToken?: unknown;
		} | undefined;
		const debugToken = typeof configuredExtra?.lumusAssistantAppCheckDebugToken === 'string'
			? configuredExtra.lumusAssistantAppCheckDebugToken
			: undefined;
		provider.configure({
			android: {
				provider: selectedProvider,
				...(useDebugProvider && debugToken
					? { debugToken }
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
	if (isExpoGoAssistantRuntime()) {
		return normalizeAssistantAiConfig({});
	}
	if (Platform.OS !== 'android') {
		return normalizeAssistantAiConfig({ enabled: false });
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
			return normalizeAssistantAiConfig({});
		}
	})();
	return configPromise;
};

const toPlatformResponse = (result: { response: { text(): string; functionCalls(): Array<{ id?: string; name: string; args: object }> | undefined } }): AssistantPlatformResponse => {
	let text = '';
	try {
		text = result.response.text();
	} catch {
		text = '';
	}
	return {
		text,
		functionCalls: (result.response.functionCalls() ?? []).map(call => ({
			...(call.id ? { id: call.id } : {}),
			name: call.name,
			args: call.args && typeof call.args === 'object' ? (call.args as Record<string, unknown>) : {},
		})),
	};
};

const createAuthFacade = () =>
	createAssistantAuthTokenBridge(() => auth.currentUser) as unknown as FirebaseAuthTypes.Module;

const assertAuthenticatedAssistantUser = () => {
	if (auth.currentUser) return;
	const error = new Error('Usuário não autenticado.');
	error.name = 'AssistantAuthenticationError';
	throw error;
};

const getNativeAiService = async () => {
	const app = await getConfiguredNativeApp();
	const appCheck = await ensureNativeAppCheck();
	const { ai: nativeAi } = await loadNativeFirebaseModules();
	const ai = nativeAi.getAI(app, {
		backend: new nativeAi.GoogleAIBackend(),
		appCheck,
		// The local Auth emulator issues tokens for demo-lumus-financas, while
		// google-services.json identifies finances-app-e8685. Sending that token
		// to AI Logic would mix project identities. The screen still requires an
		// authenticated emulator user; only the incompatible cloud Auth header is
		// omitted in this development-only hybrid path.
		...(shouldAttachAssistantAuthToken(isFirebaseEmulatorRuntime()) ? { auth: createAuthFacade() } : {}),
	});
	return { ai, nativeAi };
};

const adapter: AssistantPlatformAdapter = {
	getConfig: forceRefresh => isExpoGoAssistantRuntime()
		? assistantExpoGoAdapter.getConfig(forceRefresh)
		: readRemoteConfig(forceRefresh),
	async getAvailability(): Promise<AssistantAiAvailability> {
		if (isExpoGoAssistantRuntime()) {
			return assistantExpoGoAdapter.getAvailability();
		}
		const platformSupported = Platform.OS === 'android';
		let nativeConfigured = false;
		let appCheckConfigured = false;
		if (platformSupported) {
			try {
				await getConfiguredNativeApp();
				nativeConfigured = true;
			} catch {
				nativeConfigured = false;
			}
			if (nativeConfigured) {
				try {
					const appCheck = await ensureNativeAppCheck();
					appCheckConfigured = await canObtainAssistantAppCheckToken(appCheck);
				} catch {
					appCheckConfigured = false;
				}
			}
		}
		const config = await readRemoteConfig();
		return {
			available: Boolean(platformSupported && nativeConfigured && appCheckConfigured && auth.currentUser && config.enabled),
			platform: platformSupported ? 'android' : 'unsupported',
			runtime: 'native',
			appCheckConfigured,
			remoteConfigLoaded,
			model: config.model,
			reason: !platformSupported
				? 'Nesta entrega, o Lumus IA nativo está disponível no Android.'
				: !nativeConfigured
					? 'Forneça google-services.json e gere um development build.'
					: !appCheckConfigured
						? 'Não foi possível obter um token do Firebase App Check. Verifique o provider e gere uma nova build se a configuração nativa mudou.'
					: !auth.currentUser
						? 'Entre na sua conta para usar o Lumus IA.'
						: !config.enabled
							? 'O Lumus IA foi desativado pelo Remote Config.'
							: undefined,
		};
	},
	async createChat(input) {
		if (isExpoGoAssistantRuntime()) {
			return assistantExpoGoAdapter.createChat(input);
		}
		assertAuthenticatedAssistantUser();
		const { ai, nativeAi } = await getNativeAiService();
		const model = nativeAi.getGenerativeModel(ai, {
			model: input.model,
			systemInstruction: input.systemInstruction,
			tools: [{ functionDeclarations: input.functionDeclarations as unknown as FunctionDeclaration[] }],
			generationConfig: { maxOutputTokens: 2_048 },
		});
		let contents: Content[] = input.history.map(item => ({ role: item.role, parts: [{ text: item.text }] }));
		const send = async (content: Content, signal?: AbortSignal) => {
			const result = await model.generateContent({ contents: [...contents, content] }, { signal });
			const modelContent = result.response.candidates?.[0]?.content;
			contents = modelContent?.parts?.length
				? [...contents, content, { role: 'model', parts: modelContent.parts }]
				: [...contents, content];
			return toPlatformResponse(result);
		};
		return {
			async sendText(text: string, signal?: AbortSignal) {
				return send({ role: 'user', parts: [{ text }] }, signal);
			},
			async sendFunctionResponses(responses, signal?: AbortSignal) {
				const parts: Part[] = responses.map(response => ({
					functionResponse: {
						...(response.id ? { id: response.id } : {}),
						name: response.name,
						response: response.response,
					},
				}));
				// RN Firebase 25.x serializes chat.sendMessage(functionResponse) with
				// role "function", which the current Gemini Developer API rejects.
				return send({ role: 'user', parts }, signal);
			},
		};
	},
	async transcribe(request: AssistantTranscriptionRequest) {
		if (isExpoGoAssistantRuntime()) {
			return assistantExpoGoAdapter.transcribe(request);
		}
		assertAuthenticatedAssistantUser();
		const estimatedBytes = Math.floor((request.base64Audio.length * 3) / 4);
		if (estimatedBytes > 20 * 1024 * 1024 || request.durationMs > 60_500) {
			throw new Error('O áudio excede o limite de 60 segundos ou 20 MB.');
		}
		const { ai, nativeAi } = await getNativeAiService();
		const model = nativeAi.getGenerativeModel(ai, {
			model: request.config.model,
			generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1_024 },
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
		if (isExpoGoAssistantRuntime()) {
			return assistantExpoGoAdapter.narrateReport(request);
		}
		assertAuthenticatedAssistantUser();
		const { ai, nativeAi } = await getNativeAiService();
		const model = nativeAi.getGenerativeModel(ai, {
			model: request.config.model,
			systemInstruction: 'Você explica relatórios calculados pelo aplicativo Lumus e nunca altera dados.',
			generationConfig: { maxOutputTokens: 512 },
		});
		const result = await model.generateContent(
			buildReportNarrationInstruction(request.report, request.question),
			{ signal: request.signal },
		);
		return result.response.text();
	},
};

export const assistantAiGateway = createAssistantAiGateway(adapter);
