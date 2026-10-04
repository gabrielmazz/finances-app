import React from 'react';
import { usePathname } from 'expo-router';
import { navigateToRoute } from '@/utils/navigation';
import { logoutCurrentUser } from '@/utils/secureLogout';

import { useQueryClient } from '@tanstack/react-query';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useFinanceData } from '@/contexts/FinanceDataContext';
import { useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import { usePostSubmitBehaviorPreferences } from '@/contexts/PostSubmitBehaviorContext';
import { createAssistantConversation } from '@/services/lumusAssistant/assistantConversationService';
import { isAssistantConfirmation, isAssistantCancellation } from '@/services/lumusAssistant/assistantAuthorization';
import {
	parseAssistantApplicationCommand, prepareAssistantApplicationCommand, executeAssistantApplicationCommand,
	parseAssistantApplicationBatch, prepareAssistantApplicationBatch, executeAssistantApplicationBatch,
	clearAssistantApplicationBatchCheckpoints, resolveAssistantApplicationChoice,
	summarizeAssistantApplicationCommand, summarizeAssistantApplicationBatch,
	type AssistantApplicationBatch, type AssistantApplicationCommand, type AssistantApplicationAdapters, type AssistantApplicationResult,
} from '@/services/lumusAssistant/assistantApplicationService';
import { auth } from '@/FirebaseConfig';

import { useAuth } from '@/contexts/AuthContext';
import { useValueVisibility } from '@/contexts/ValueVisibilityContext';
import type {
	AssistantAiAvailability,
	AssistantAiConfig,
	AssistantDraftAction,
	AssistantMessage,
	AssistantSendProgress,
	AssistantResolvedCatalog,
} from '@/types/lumusAssistant';
import { assistantAiGateway } from '@/services/lumusAssistant/assistantPlatform';
import { DEFAULT_ASSISTANT_AI_CONFIG } from '@/services/lumusAssistant/assistantGatewayCore';
import { financeCommandService } from '@/services/lumusAssistant/financeCommandService';
import { assistantReportService } from '@/services/lumusAssistant/assistantReportService';
import {
	resetAssistantCatalogSession,
	toAssistantModelCatalog,
} from '@/services/lumusAssistant/assistantCatalogService';
import { assistantPreferencesStorage } from '@/utils/assistantPreferencesStorage';
import {
	createAssistantId,
	buildAssistantActiveDraftSummary,
	isAssistantClearConversationCommand,
	maskFinancialValuesInText,
} from '@/utils/lumusAssistant';
import { searchAssistantCatalog, selectAssistantModelCatalog, redactAssistantPersonalData, getAssistantPrivateIdentifiers } from '@/services/lumusAssistant/assistantBatchService';
import { mapAssistantError } from '@/utils/lumusAssistantErrors';

type LumusAssistantContextValue = {
	messages: AssistantMessage[];
	drafts: AssistantDraftAction[];
	catalog: AssistantResolvedCatalog;
	availability: AssistantAiAvailability | null;
	config: AssistantAiConfig | null;
	isBootstrapping: boolean;
	isRefreshingAvailability: boolean;
	isSending: boolean;
	sendingProgress: AssistantSendProgress | null;
	consentGranted: boolean;
	autoReadEnabled: boolean;
	speakingMessageId: string | null;
	revocationEpoch: number;
	grantConsent(): Promise<void>;
	revokeConsent(): Promise<void>;
	refreshAvailability(): Promise<void>;
	setAutoReadEnabled(value: boolean): void;
	sendMessage(text: string): Promise<void>;
	transcribeAudio(input: { base64Audio: string; mimeType: string; durationMs: number }): Promise<string>;
	retryNotification(actionId: string): Promise<void>;
	clearConversation(): void;
	speak(messageId: string, text: string): Promise<void>;
	stopSpeaking(): Promise<void>;
};

const LumusAssistantContext = React.createContext<LumusAssistantContextValue | undefined>(undefined);

type PendingApplication = (
	| { kind: 'command'; command: AssistantApplicationCommand }
	| { kind: 'batch'; batch: AssistantApplicationBatch }
	| { kind: 'choice'; command: AssistantApplicationCommand; result: AssistantApplicationResult; commands?: AssistantApplicationCommand[]; pendingIndex?: number }
) & { confirmationActive: boolean; confirmationKey?: string };

const getApplicationConfirmationSnapshot = (intent: PendingApplication | null) => intent?.confirmationActive && intent.kind !== 'choice'
	? JSON.stringify({ version: intent.confirmationKey, arguments: intent.kind === 'batch' ? intent.batch.signature : intent.command }) : null;

let speechRuntime: Promise<typeof import('expo-speech')> | undefined;
const loadSpeechRuntime = () => speechRuntime ??= Promise.resolve(require('expo-speech') as typeof import('expo-speech'));
const stopLoadedSpeech = async () => { if (speechRuntime) await (await speechRuntime).stop(); };
const normalizedCommand = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
const isApplicationMutationIntent = (text: string, command: AssistantApplicationCommand) => !/[?"“”«»]/.test(text) && text.split(/[;\n]/).some(clause => {
	const value = normalizedCommand(clause).replace(/^por favor[, ]+/, '');
	switch (command.kind) {
		case 'export_report': return /^(?:exporte|gere|baixe|quero (?:exportar|gerar|baixar))\b/.test(value) && /\b(?:pdf|relatorio|extrato|analise)\b/.test(value);
		case 'update_profile_name': return /\b(?:mude|altere|troque|atualize|corrija|quero (?:mudar|alterar))\b/.test(value) && /\b(?:meu nome|nome d[oe] (?:meu )?perfil)\b/.test(value);
		case 'create_annotation': return /\b(?:crie|registre|salve|quero criar)\b/.test(value) && /\banotacao\b/.test(value);
		case 'update_annotation': return /\b(?:altere|atualize|corrija|edite|renomeie|quero (?:editar|alterar|renomear))\b/.test(value) && /\banotacao\b/.test(value);
		case 'change_relationship': return command.action === 'link'
			? /\b(?:vincule|relacione|quero vincular)\b/.test(value)
			: /\b(?:desvincule|remova o vinculo|quero desvincular)\b/.test(value);
		case 'set_theme': return /\b(?:use|aplique|ative|mude|troque|quero (?:mudar|alterar))\b/.test(value) && /\b(?:tema|modo)\b/.test(value);
		case 'set_value_visibility': return /\bvalores\b/.test(value) && (command.hidden ? /\b(?:oculte|esconda|quero ocultar)\b/.test(value) : /\b(?:mostre|exiba|quero exibir)\b/.test(value));
		case 'set_trusted_cache': return /\b(?:confie|nao confie|ative|desative)\b/.test(value) && /\b(?:dispositivo|cache)\b/.test(value);
		case 'set_route_visibility': return /\btela\b/.test(value) && (command.visible ? /\b(?:mostre|exiba)\b/.test(value) : /\b(?:oculte|esconda)\b/.test(value));
		case 'set_post_submit': return /\b(?:depois de|ao|quando)\b/.test(value) && /\b(?:cadastrar|registrar|criar|editar|salvar)\b/.test(value) && /\b(?:volte|retorne|permaneca|fique)\b/.test(value);
		case 'navigate': return /^(?:abra|va para|quero abrir)\b/.test(value);
		case 'logout': return /\b(?:saia|encerre|faca logout)\b/.test(value) && /\b(?:conta|sessao|logout)\b/.test(value);
		case 'copy_own_id': return /\bcopie\b/.test(value) && /\b(?:id|identificador)\b/.test(value);
		case 'set_auto_read': return /\b(?:ative|desative)\b/.test(value) && /\bleitura automatica\b/.test(value);
		case 'revoke_assistant_consent': return /\b(?:revogue|remova|cancele)\b/.test(value) && /\b(?:consentimento|acesso)\b/.test(value) && /\b(?:ia|lumus|assistente)\b/.test(value);
		default: return false;
	}
});
const isApplicationRead = (command: AssistantApplicationCommand) => command.kind.startsWith('read_') || command.kind.startsWith('list_');

type NewAssistantMessage = AssistantMessage extends infer Message
	? Message extends AssistantMessage
		? Omit<Message, 'id' | 'createdAt'>
		: never
	: never;

const createMessage = <T extends NewAssistantMessage>(message: T): T & Pick<AssistantMessage, 'id' | 'createdAt'> => ({
	...message,
	id: createAssistantId('message'),
	createdAt: new Date().toISOString(),
});

export const LumusAssistantProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
	const { user, isAuthReady } = useAuth();
	const { shouldHideValues, setShouldHideValues } = useValueVisibility();
	const { themeMode, setThemeMode } = useAppTheme();
	const { trustedDeviceCache, setTrustedDeviceCache } = useFinanceData();
	const { isRouteVisible, setRouteVisibility } = useRouteVisibility();
	const { getBehaviorForScreen, updateBehaviorForScreen } = usePostSubmitBehaviorPreferences();
	const queryClient = useQueryClient();
	const conversationRef = React.useRef<ReturnType<typeof createAssistantConversation> | null>(null);
	const conversationAccountRef = React.useRef<string | null>(null);
	const pendingApplicationRef = React.useRef<PendingApplication | null>(null);
	const suspendedApplicationsRef = React.useRef<PendingApplication[]>([]);
	const lastApplicationBatchRef = React.useRef<AssistantApplicationBatch | null>(null);
	const pathname = usePathname();
	const [hasActivated, setHasActivated] = React.useState(false);
	React.useEffect(() => { if (pathname.endsWith('/lumus-assistant')) setHasActivated(true); }, [pathname]);
	const [messages, setMessages] = React.useState<AssistantMessage[]>([]);
	const [drafts, setDrafts] = React.useState<AssistantDraftAction[]>([]);
	const [catalog, setCatalog] = React.useState<AssistantResolvedCatalog>({});
	const [availability, setAvailability] = React.useState<AssistantAiAvailability | null>(null);
	const [config, setConfig] = React.useState<AssistantAiConfig | null>(null);
	const [isBootstrapping, setIsBootstrapping] = React.useState(true);
	const [isRefreshingAvailability, setIsRefreshingAvailability] = React.useState(false);
	const [isSending, setIsSending] = React.useState(false);
	const [sendingProgress, setSendingProgress] = React.useState<AssistantSendProgress | null>(null);
	const [consentGranted, setConsentGranted] = React.useState(false);
	const [autoReadEnabled, updateAutoReadEnabled] = React.useState(false);
	const [speakingMessageId, setSpeakingMessageId] = React.useState<string | null>(null);
	const [revocationEpoch, setRevocationEpoch] = React.useState(0);
	const activeAbortRef = React.useRef<AbortController | null>(null);
	const accountRef = React.useRef<string | null>(null);
	const messagesRef = React.useRef(messages);
	const draftsRef = React.useRef(drafts);
	const catalogRef = React.useRef(catalog);
	const speechVersionRef = React.useRef(0);
	const consentVersionRef = React.useRef(0);
	const sessionVersionRef = React.useRef(0);
	const lastAutoReadMessageRef = React.useRef<string | null>(null);
	const aiOperationQueueRef = React.useRef<Promise<void>>(Promise.resolve());
	const enqueueAiOperation = React.useCallback(<Result,>(operation: () => Promise<Result>): Promise<Result> => {
		const result = aiOperationQueueRef.current.then(operation);
		aiOperationQueueRef.current = result.then(() => undefined, () => undefined);
		return result;
	}, []);

	React.useEffect(() => { messagesRef.current = messages; }, [messages]);
	React.useEffect(() => { draftsRef.current = drafts; }, [drafts]);
	React.useEffect(() => { catalogRef.current = catalog; }, [catalog]);

	const adapters: AssistantApplicationAdapters = {
		themeMode, setThemeMode, shouldHideValues, setShouldHideValues,
		trustedDeviceCache: trustedDeviceCache?.enabled === true, setTrustedDeviceCache, isRouteVisible, setRouteVisibility,
		getBehaviorForScreen, updateBehaviorForScreen, navigate: (path, params) => navigateToRoute(path, params),
		logout: uid => logoutCurrentUser({ userId: uid, isDarkMode: themeMode === 'dark' }),
		copyOwnUserId: async uid => {
			if (auth.currentUser?.uid !== uid) throw new Error('A conta mudou.');
			const clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
			if (auth.currentUser?.uid !== uid || !await clipboard.setStringAsync(uid)) throw new Error('Não foi possível copiar seu identificador.');
		},
		setAutoReadEnabled: value => applyAutoReadPreference(value),
		revokeAssistantConsent: () => revokeConsent(),
	};
	const runtimeRef = React.useRef({ config, availability, shouldHideValues, adapters, autoReadEnabled, consentGranted });
	runtimeRef.current = { config, availability, shouldHideValues, adapters, autoReadEnabled, consentGranted };
	React.useEffect(() => () => {
		sessionVersionRef.current++;
		conversationRef.current?.dispose();
		conversationRef.current = null;
		conversationAccountRef.current = null;
		pendingApplicationRef.current = null;
		suspendedApplicationsRef.current = [];
		lastApplicationBatchRef.current = null;
		activeAbortRef.current?.abort();
		activeAbortRef.current = null;
		speechVersionRef.current++; lastAutoReadMessageRef.current = null;
		if (accountRef.current) clearAssistantApplicationBatchCheckpoints(accountRef.current);
		void stopLoadedSpeech().catch(() => undefined);
	}, []);

	const clearSession = React.useCallback(() => {
		sessionVersionRef.current++;
		conversationRef.current?.dispose();
		conversationRef.current = null;
		pendingApplicationRef.current = null;
		suspendedApplicationsRef.current = [];
		lastApplicationBatchRef.current = null;
		if (accountRef.current) clearAssistantApplicationBatchCheckpoints(accountRef.current);
		activeAbortRef.current?.abort();
		activeAbortRef.current = null;
		resetAssistantCatalogSession(accountRef.current);
		speechVersionRef.current++; lastAutoReadMessageRef.current = null;
		void stopLoadedSpeech().catch(() => undefined);
		messagesRef.current = [];
		draftsRef.current = [];
		catalogRef.current = {};
		setSpeakingMessageId(null);
		setMessages([]);
		setDrafts([]);
		setCatalog({});
		setIsSending(false);
		setSendingProgress(null);
		setRevocationEpoch(value => value + 1);
	}, []);

	const refreshAvailability = React.useCallback(async () => {
		const uid = user?.uid;
		if (!uid || accountRef.current !== uid) return;
		setIsRefreshingAvailability(true);
		try {
			const nextConfig = await assistantAiGateway.getConfig(true);
			const nextAvailability = await assistantAiGateway.getAvailability();
			if (accountRef.current !== uid) return;
			setConfig(nextConfig);
			setAvailability(nextAvailability);
		} catch (error) {
			if (accountRef.current !== uid) return;
			const friendly = mapAssistantError(error);
			setAvailability({
				available: false,
				platform: 'unsupported',
				appCheckConfigured: false,
				remoteConfigLoaded: false,
				model: DEFAULT_ASSISTANT_AI_CONFIG.model,
				reason: friendly.message,
			});
		} finally {
			if (accountRef.current === uid) setIsRefreshingAvailability(false);
		}
	}, [user?.uid]);

	React.useEffect(() => {
		if (!isAuthReady) return;
		const uid = user?.uid ?? null;
		if (accountRef.current !== uid) {
			consentVersionRef.current++;
			runtimeRef.current.consentGranted = false;
			setConsentGranted(false);
			clearSession();
			accountRef.current = uid;
			setIsRefreshingAvailability(false);
		}
		if (!uid) {
			setConsentGranted(false);
			updateAutoReadEnabled(false);
			setAvailability(null);
			setConfig(null);
			setIsBootstrapping(false);
			setIsRefreshingAvailability(false);
			return;
		}

		if (!hasActivated) return;
		let cancelled = false;
		const consentVersion = consentVersionRef.current;
		const isCurrent = () => !cancelled && accountRef.current === uid && auth.currentUser?.uid === uid;
		setIsBootstrapping(true);
		void Promise.allSettled([
			assistantPreferencesStorage.getConsent(uid).then(consent => {
				if (isCurrent() && consentVersion === consentVersionRef.current) {
					runtimeRef.current.consentGranted = consent;
					setConsentGranted(consent);
				}
			}),
			assistantPreferencesStorage.getAutoRead(uid).then(autoRead => {
				if (isCurrent() && consentVersion === consentVersionRef.current) updateAutoReadEnabled(autoRead);
			}),
			assistantAiGateway.getConfig().then(nextConfig => { if (isCurrent()) setConfig(nextConfig); }),
			assistantAiGateway.getAvailability().then(nextAvailability => { if (isCurrent()) setAvailability(nextAvailability); }),
		])
			.then(results => {
				if (!isCurrent()) return;
				const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
				if (!failure) return;
				const friendly = mapAssistantError(failure.reason);
				setAvailability({
					available: false,
					platform: 'unsupported',
					appCheckConfigured: false,
					remoteConfigLoaded: false,
					model: DEFAULT_ASSISTANT_AI_CONFIG.model,
					reason: friendly.message,
				});
			})
			.finally(() => {
				if (isCurrent()) setIsBootstrapping(false);
			});
		return () => { cancelled = true; };
	}, [clearSession, hasActivated, isAuthReady, user?.uid]);

	const speak = React.useCallback(async (messageId: string, text: string) => {
		const uid = accountRef.current;
		const version = ++speechVersionRef.current;
		try {
			const speech = await loadSpeechRuntime();
			await speech.stop();
			if (version !== speechVersionRef.current || !uid || auth.currentUser?.uid !== uid || !runtimeRef.current.consentGranted) return;
			const speakable = runtimeRef.current.shouldHideValues ? maskFinancialValuesInText(text) : text;
			if (!speakable.trim()) return;
			setSpeakingMessageId(messageId);
			const finished = () => { if (version === speechVersionRef.current) setSpeakingMessageId(current => current === messageId ? null : current); };
			speech.speak(speakable, { language: 'pt-BR', rate: 0.95, onDone: finished, onStopped: finished, onError: finished });
		} catch { if (version === speechVersionRef.current) setSpeakingMessageId(null); }
	}, []);

	React.useEffect(() => {
		speechVersionRef.current++;
		void stopLoadedSpeech().catch(() => undefined);
		setSpeakingMessageId(null);
	}, [shouldHideValues]);

	const sendMessage = React.useCallback(async (rawText: string) => {
		const uid = user?.uid;
		const text = rawText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
		if (!uid || auth.currentUser?.uid !== uid || accountRef.current !== uid || !runtimeRef.current.consentGranted || !text) return;
		if (isAssistantClearConversationCommand(text)) { clearSession(); return; }
		if (isAssistantCancellation(text)) pendingApplicationRef.current = null;
		if (!conversationRef.current || conversationAccountRef.current !== uid) {
			conversationRef.current?.dispose();
			conversationAccountRef.current = uid;
			conversationRef.current = createAssistantConversation({
				uid, finance: financeCommandService,
				onChange: state => {
					if (accountRef.current !== uid) return;
					messagesRef.current = state.messages; draftsRef.current = state.drafts; catalogRef.current = state.catalog;
					setMessages(state.messages); setDrafts(state.drafts); setCatalog(state.catalog);
					setIsSending(state.busy); setSendingProgress(state.progress);
					if (!state.busy) {
						const latest = [...state.messages].reverse().find(item => item.role === 'assistant' && 'text' in item && item.text.trim());
						if (latest && 'text' in latest && latest.id !== lastAutoReadMessageRef.current) {
							lastAutoReadMessageRef.current = latest.id;
							if (runtimeRef.current.autoReadEnabled && runtimeRef.current.consentGranted) void speak(latest.id, latest.text);
						}
					}
				},
				onCommit: async () => { await queryClient.invalidateQueries({ queryKey: ['finance', uid] }); },
				interpret: (text, state, signal) => enqueueAiOperation(() => {
					const runtime = runtimeRef.current;
					if (signal.aborted || auth.currentUser?.uid !== uid || accountRef.current !== uid || !runtime.consentGranted) throw new Error('A sessão do assistente foi encerrada.');
					if (!runtime.config || !runtime.availability?.available) throw new Error('O modelo está indisponível. Você pode continuar usando os comandos locais disponíveis.');
					const privateIdentifiers = getAssistantPrivateIdentifiers(state.catalog, uid);
					const redact = (value: string) => redactAssistantPersonalData(runtime.shouldHideValues ? maskFinancialValuesInText(value) : value, uid, privateIdentifiers);
					const relevantCatalog = selectAssistantModelCatalog(toAssistantModelCatalog(state.catalog, { hideValues: runtime.shouldHideValues }), text);
					return assistantAiGateway.converse({
						requestScope: uid, text: redact(text),
						searchCatalog: (source, query) => Promise.resolve(searchAssistantCatalog(state.catalog, state.drafts, source, query, runtime.shouldHideValues, uid)),
						turns: state.messages.filter((item): item is Extract<AssistantMessage, { type: 'text' }> => item.type === 'text' && !item.excludeFromModelHistory).slice(0, -1).map(item => ({ role: item.role === 'assistant' ? 'assistant' : 'user', text: redact(item.text), createdAt: item.createdAt })),
						activeSummary: redact(JSON.stringify({
							finance: buildAssistantActiveDraftSummary(state.drafts),
							application: [...suspendedApplicationsRef.current, ...(pendingApplicationRef.current ? [pendingApplicationRef.current] : [])].map(intent =>
								intent.kind === 'batch' ? summarizeAssistantApplicationBatch(intent.batch, runtime.adapters)
									: summarizeAssistantApplicationCommand(intent.command, runtime.adapters)),
						})),
						catalog: Object.fromEntries(Object.entries(relevantCatalog).map(([source, items]) => [source, items?.map(item => ({ ...item, label: redact(item.label), ...(item.description ? { description: redact(item.description) } : {}) }))])),
						nowIso: new Date().toISOString(), timeZone: 'America/Sao_Paulo', config: runtime.config, signal,
					});
				}),
				report: async (request, catalog) => (await assistantReportService.createReport(uid, request, catalog)).deterministicSummary,
				applicationConfirmationSnapshot: () => getApplicationConfirmationSnapshot(pendingApplicationRef.current),
				application: async (text, { emit, signal, originText, proposedByModel, applicationConfirmationSnapshot }) => {
					const sessionVersion = sessionVersionRef.current;
					const isCurrentSession = () => sessionVersion === sessionVersionRef.current && !signal.aborted && accountRef.current === uid && auth.currentUser?.uid === uid && runtimeRef.current.consentGranted;
					const currentAdapters = () => ({ ...runtimeRef.current.adapters, isCurrentSession, getShouldHideValues: () => runtimeRef.current.shouldHideValues });
					const refreshAfter = async (result: AssistantApplicationResult) => {
						if (result.success && (result.changed === 'profile' || result.changed === 'relationships')) await queryClient.invalidateQueries({ queryKey: ['finance', uid] });
						return result.message;
					};
					const describe = (intent: PendingApplication, all = false) => intent.kind === 'batch'
						? summarizeAssistantApplicationBatch(intent.batch, currentAdapters(), all)
						: intent.kind === 'choice' ? intent.result.message : summarizeAssistantApplicationCommand(intent.command, currentAdapters());
					const remember = (intent: PendingApplication, replace = false) => {
						const previous = pendingApplicationRef.current;
						if (previous && !replace) suspendedApplicationsRef.current.push({ ...previous, confirmationActive: false });
						pendingApplicationRef.current = { ...intent, confirmationKey: createAssistantId('application_confirmation') };
					};
					const executeBatch = async (batch: AssistantApplicationBatch, confirmed: boolean) => {
						lastApplicationBatchRef.current = batch;
						let lastCount = -1;
						const result = await executeAssistantApplicationBatch(uid, batch, currentAdapters(), {
							...(confirmed ? { authorizedSignature: batch.signature } : {}),
							isCancelled: () => signal.aborted || accountRef.current !== uid,
							onProgress: progress => {
								if (progress.completed !== lastCount && (progress.completed % 10 === 0 || progress.pending === 0)) {
									lastCount = progress.completed; emit(`${progress.completed} de ${progress.total} operações concluídas.`);
								}
							},
						});
						if (result.results.some(item => item.status === 'succeeded' && (item.result?.changed === 'profile' || item.result?.changed === 'relationships'))) await queryClient.invalidateQueries({ queryKey: ['finance', uid] });
						return `${result.message}${result.failed || result.pending ? '\nDiga “tente o lote local novamente” para conferir somente falhas e pendências.' : ''}${result.failed ? `\n${result.results.filter(item => item.status === 'failed').slice(0, 8).map(item => item.result?.message).join('\n')}` : ''}`;
					};
					const prepareOne = async (command: AssistantApplicationCommand, replace = false) => {
						const prepared = await prepareAssistantApplicationCommand(uid, command, currentAdapters());
						if (!isCurrentSession()) return 'A sessão foi encerrada antes de preparar esta operação.';
						if (prepared.result) {
							if (prepared.result.choices?.length) remember({ kind: 'choice', command, result: prepared.result, confirmationActive: false }, replace);
							return prepared.result.message;
						}
						if (!prepared.command) return 'Não consegui preparar esta alteração.';
						if (prepared.command.requiresConfirmation) {
							remember({ kind: 'command', command: prepared.command, confirmationActive: true }, replace);
							return `${summarizeAssistantApplicationCommand(prepared.command, currentAdapters())}.\nPosso aplicar esta alteração? Responda “confirmo”, corrija o pedido ou cancele.`;
						}
						return refreshAfter(await executeAssistantApplicationCommand(uid, prepared.command, currentAdapters()));
					};
					const prepareBatch = async (commands: AssistantApplicationCommand[], replace = false) => {
						const prepared = await prepareAssistantApplicationBatch(uid, commands, currentAdapters());
						if (!isCurrentSession()) return 'A sessão foi encerrada antes de preparar este lote.';
						if (!prepared.batch) {
							if (prepared.result?.choices?.length && prepared.pendingIndex !== undefined) remember({ kind: 'choice', command: commands[prepared.pendingIndex]!, commands, pendingIndex: prepared.pendingIndex, result: prepared.result, confirmationActive: false }, replace);
							return prepared.result?.message ?? 'Não consegui preparar esse lote.';
						}
						if (prepared.batch.requiresConfirmation) {
							remember({ kind: 'batch', batch: prepared.batch, confirmationActive: true }, replace);
							return `${summarizeAssistantApplicationBatch(prepared.batch, currentAdapters())}\nPosso aplicar este conjunto? Responda “confirmo”.`;
						}
						return executeBatch(prepared.batch, false);
					};
					const pending = pendingApplicationRef.current;
					const normalized = normalizedCommand(text).replace(/[.!]+$/, '');
					if (proposedByModel && (isAssistantConfirmation(text) || isAssistantCancellation(text) || /^(?:retome|continue)\b/.test(normalized))) return 'Uma proposta do modelo não pode confirmar, retomar ou cancelar um pedido.';
					if (!proposedByModel && pending && isAssistantConfirmation(text) && pending.confirmationActive && pending.kind !== 'choice') {
						if (applicationConfirmationSnapshot !== getApplicationConfirmationSnapshot(pending)) return 'Não havia esta confirmação ativa quando sua resposta foi enviada. Confira o resumo atual antes de confirmar.';
						pendingApplicationRef.current = null;
						return pending.kind === 'batch' ? executeBatch(pending.batch, true) : refreshAfter(await executeAssistantApplicationCommand(uid, pending.command, currentAdapters()));
					}
					if (!proposedByModel && pending?.confirmationActive && /^(?:nao|nao confirmo|nao pode)$/.test(normalized)) {
						if (applicationConfirmationSnapshot !== getApplicationConfirmationSnapshot(pending)) return 'Sua resposta não estava ligada à confirmação atual. O pedido permanece pendente.';
						pendingApplicationRef.current = null;
						return 'Esse pedido local foi cancelado. Nenhuma alteração dele foi registrada.';
					}
					if (!proposedByModel && pending?.kind === 'choice') {
						const resolved = resolveAssistantApplicationChoice(pending.command, pending.result, text);
						if (resolved) {
							if (/^(?:a |o )?(?:\d+|primeir[ao]|segund[ao]|terceir[ao]|quart[ao]|quint[ao])[.!]*$/.test(normalized) && draftsRef.current.some(draft => draft.status === 'needs_input')) return 'Essa posição pode se referir à anotação/conta ou ao pedido financeiro. Retome pelo nome para escolher o pedido.';
							if (pending.commands && pending.pendingIndex !== undefined) return prepareBatch(pending.commands.map((command, index) => index === pending.pendingIndex ? resolved : command), true);
							return prepareOne(resolved, true);
						}
					}
					if (!proposedByModel && /^tente o lote local novamente$/.test(normalized) && lastApplicationBatchRef.current) {
						remember({ kind: 'batch', batch: lastApplicationBatchRef.current, confirmationActive: true });
						return `${summarizeAssistantApplicationBatch(lastApplicationBatchRef.current, currentAdapters())}\nVou conferir somente falhas e pendências, preservando sucessos. Posso continuar? Responda “confirmo”.`;
					}
					if (!proposedByModel && /^(?:detalhe|mostre os detalhes d[oe]) (?:o )?lote local$/.test(normalized) && pending?.kind === 'batch') {
						pending.confirmationActive = false; return describe(pending, true);
					}
					const resume = /^(?:retome|continue)(?: (?:o pedido |a alteracao )?(.+))?$/.exec(normalized);
					if (!proposedByModel && resume) {
						const intents = [...suspendedApplicationsRef.current, ...(pending ? [pending] : [])];
						const target = resume[1]?.replace(/^(?:meu |minha |o |a )/, '');
						const matching = target ? intents.filter(intent => normalizedCommand(describe(intent)).includes(target)) : intents;
						if (matching.length === 1) {
							const selected = matching[0]!;
							suspendedApplicationsRef.current = intents.filter(intent => intent !== selected).map(intent => ({ ...intent, confirmationActive: false }));
							pendingApplicationRef.current = { ...selected, confirmationActive: selected.kind !== 'choice', confirmationKey: createAssistantId('application_confirmation') };
							return `${describe(selected)}${selected.kind !== 'choice' ? '\nPosso aplicar esta versão? Responda “confirmo”.' : ''}`;
						}
						if (matching.length > 1) return `Há mais de um pedido local pendente:\n${matching.map((intent, index) => `${index + 1}. ${describe(intent)}`).join('\n')}\nRetome pelo nome para identificar o pedido.`;
					}
					const commands = parseAssistantApplicationBatch(text);
					let command = commands ? null : parseAssistantApplicationCommand(text);
					if (pending) pending.confirmationActive = false;
					if (!commands && !command) return null;
					const mutations = (commands ?? [command!]).filter(item => !isApplicationRead(item));
					if (proposedByModel && mutations.some(item => !isApplicationMutationIntent(originText, item))) return 'Não consegui vincular todas as alterações propostas ao seu pedido. Nenhuma alteração de perfil, preferência, vínculo ou anotação foi executada.';
					if (proposedByModel) {
						const originalId = /\bID\s+([\w-]+)/i.exec(originText)?.[1];
						if (mutations.some(item => item.kind === 'change_relationship' && item.relatedUserId && item.relatedUserId !== originalId)) return 'Informe o ID da conta para vincular, ou o nome de uma conta já vinculada para remover. O modelo não pode escolher um identificador.';
					}
					if (commands) return prepareBatch(commands);
					return prepareOne(command!);
				},
			});
		}
		await conversationRef.current.send(text);
	}, [clearSession, consentGranted, enqueueAiOperation, queryClient, speak, user?.uid]);

	const retryNotification = React.useCallback(async (actionId: string) => {
		const uid = user?.uid;
		const draft = draftsRef.current.find(item => item.clientActionId === actionId);
		if (!uid || !draft?.result?.notificationWarning) return;
		const result = await financeCommandService.retryNotification(uid, draft, catalogRef.current);
		if (accountRef.current === uid) setMessages(current => [...current, createMessage({ type: result.success ? 'success' : 'warning', role: 'assistant', text: result.message })]);
	}, [user?.uid]);

	const grantConsent = React.useCallback(async () => {
		const uid = user?.uid;
		if (!uid || accountRef.current !== uid || auth.currentUser?.uid !== uid) return;
		const version = ++consentVersionRef.current;
		await assistantPreferencesStorage.setConsent(uid);
		if (version !== consentVersionRef.current || accountRef.current !== uid || auth.currentUser?.uid !== uid) return;
		runtimeRef.current.consentGranted = true;
		setConsentGranted(true);
	}, [user?.uid]);

	const revokeConsent = React.useCallback(async () => {
		const uid = user?.uid;
		if (!uid || accountRef.current !== uid || auth.currentUser?.uid !== uid) return;
		consentVersionRef.current++;
		runtimeRef.current.consentGranted = false;
		setConsentGranted(false);
		clearSession();
		await assistantPreferencesStorage.revokeConsent(uid);
	}, [clearSession, user?.uid]);

	const applyAutoReadPreference = React.useCallback(async (value: boolean) => {
		const uid = accountRef.current;
		if (!uid || auth.currentUser?.uid !== uid) return;
		await assistantPreferencesStorage.setAutoRead(uid, value);
		if (auth.currentUser?.uid !== uid || accountRef.current !== uid) return;
		updateAutoReadEnabled(value);
		if (!value) { speechVersionRef.current++; await stopLoadedSpeech().catch(() => undefined); setSpeakingMessageId(null); }
	}, []);
	const setAutoReadEnabled = React.useCallback((value: boolean) => { void applyAutoReadPreference(value).catch(() => undefined); }, [applyAutoReadPreference]);

	const transcribeAudio = React.useCallback(async (input: { base64Audio: string; mimeType: string; durationMs: number }) => {
		const uid = user?.uid;
		const runtime = runtimeRef.current;
		if (!uid || accountRef.current !== uid || auth.currentUser?.uid !== uid || !runtime.config || !runtime.consentGranted) throw new Error('Consentimento necessário.');
		const controller = new AbortController();
		activeAbortRef.current = controller;
		try {
			await conversationRef.current?.whenIdle();
			if (controller.signal.aborted || accountRef.current !== uid || auth.currentUser?.uid !== uid || !runtimeRef.current.consentGranted) throw new Error('A sessão foi encerrada. Grave novamente na conta atual.');
			const text = await enqueueAiOperation(() => {
				if (controller.signal.aborted || accountRef.current !== uid || auth.currentUser?.uid !== uid || !runtimeRef.current.consentGranted) throw new Error('A sessão foi encerrada. Grave novamente na conta atual.');
				return assistantAiGateway.transcribe({ ...input, requestScope: uid, config: runtime.config!, signal: controller.signal });
			});
			if (controller.signal.aborted || accountRef.current !== uid || auth.currentUser?.uid !== uid || !runtimeRef.current.consentGranted) throw new Error('A sessão foi encerrada. Grave novamente na conta atual.');
			return text;
		} finally {
			if (activeAbortRef.current === controller) activeAbortRef.current = null;
		}
	}, [config, consentGranted, enqueueAiOperation, user?.uid]);

	const stopSpeaking = React.useCallback(async () => {
		speechVersionRef.current++;
		await stopLoadedSpeech().catch(() => undefined);
		setSpeakingMessageId(null);
	}, []);

	const contextValue = React.useMemo<LumusAssistantContextValue>(() => ({
		messages,
		drafts,
		catalog,
		availability,
		config,
		isBootstrapping,
		isRefreshingAvailability,
		isSending,
		sendingProgress,
		consentGranted,
		autoReadEnabled,
		speakingMessageId,
		revocationEpoch,
		grantConsent,
		revokeConsent,
		refreshAvailability,
		setAutoReadEnabled,
		sendMessage,
		transcribeAudio,
		retryNotification,
		clearConversation: clearSession,
		speak,
		stopSpeaking,
	}), [
		autoReadEnabled, availability,
		catalog, clearSession, config, consentGranted, drafts,
		grantConsent, isBootstrapping, isRefreshingAvailability, isSending, messages, refreshAvailability, revokeConsent, revocationEpoch, sendingProgress,
		retryNotification, sendMessage, setAutoReadEnabled, speak, speakingMessageId, stopSpeaking, transcribeAudio,
	]);

	return <LumusAssistantContext.Provider value={contextValue}>{children}</LumusAssistantContext.Provider>;
};

export const useLumusAssistant = () => {
	const context = React.useContext(LumusAssistantContext);
	if (!context) throw new Error('useLumusAssistant deve ser usado dentro de LumusAssistantProvider.');
	return context;
};
