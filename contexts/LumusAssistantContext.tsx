import React from 'react';
import * as Speech from 'expo-speech';

import { useAuth } from '@/contexts/AuthContext';
import { useValueVisibility } from '@/contexts/ValueVisibilityContext';
import type {
	AssistantAiAvailability,
	AssistantAiConfig,
	AssistantDraftAction,
	AssistantMessage,
	AssistantResolvedCatalog,
} from '@/types/lumusAssistant';
import { assistantAiGateway } from '@/services/lumusAssistant/assistantPlatform';
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
	parseAssistantQuestionAnswer,
	sanitizeAssistantInput,
	transitionAssistantDraft,
} from '@/utils/lumusAssistant';
import { mapAssistantError } from '@/utils/lumusAssistantErrors';
import { getFieldDefinition } from '@/utils/lumusAssistantSchemas';

type LumusAssistantContextValue = {
	messages: AssistantMessage[];
	drafts: AssistantDraftAction[];
	catalog: AssistantResolvedCatalog;
	availability: AssistantAiAvailability | null;
	config: AssistantAiConfig | null;
	isBootstrapping: boolean;
	isSending: boolean;
	consentGranted: boolean;
	autoReadEnabled: boolean;
	speakingMessageId: string | null;
	revocationEpoch: number;
	grantConsent(): Promise<void>;
	revokeConsent(): Promise<void>;
	setAutoReadEnabled(value: boolean): void;
	sendMessage(text: string): Promise<void>;
	transcribeAudio(input: { base64Audio: string; mimeType: string; durationMs: number }): Promise<string>;
	answerQuestion(messageId: string, value: unknown, label: string, applyToSimilar?: boolean): Promise<void>;
	editDraft(actionId: string, patch: Record<string, unknown>): Promise<void>;
	beginConfirmation(actionId: string): void;
	cancelConfirmation(actionId: string): void;
	executeDraft(actionId: string): Promise<void>;
	cancelDraft(actionId: string): void;
	retryNotification(actionId: string): Promise<void>;
	clearConversation(): void;
	speak(messageId: string, text: string): Promise<void>;
	stopSpeaking(): Promise<void>;
};

const LumusAssistantContext = React.createContext<LumusAssistantContextValue | undefined>(undefined);

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

const findNextQuestion = (drafts: AssistantDraftAction[]) => {
	const firstDraft = drafts.find(draft => draft.status === 'needs_input' && draft.missingFields.length > 0);
	if (!firstDraft) return null;
	const field = firstDraft.missingFields[0]!;
	const targetActionIds = drafts
		.filter(draft =>
			draft.status === 'needs_input' &&
			draft.missingFields.some(candidate => candidate.key === field.key),
		)
		.map(draft => draft.clientActionId);
	return { field, targetActionIds };
};

export const LumusAssistantProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
	const { user, isAuthReady } = useAuth();
	const { shouldHideValues } = useValueVisibility();
	const [messages, setMessages] = React.useState<AssistantMessage[]>([]);
	const [drafts, setDrafts] = React.useState<AssistantDraftAction[]>([]);
	const [catalog, setCatalog] = React.useState<AssistantResolvedCatalog>({});
	const [availability, setAvailability] = React.useState<AssistantAiAvailability | null>(null);
	const [config, setConfig] = React.useState<AssistantAiConfig | null>(null);
	const [isBootstrapping, setIsBootstrapping] = React.useState(true);
	const [isSending, setIsSending] = React.useState(false);
	const [consentGranted, setConsentGranted] = React.useState(false);
	const [autoReadEnabled, updateAutoReadEnabled] = React.useState(false);
	const [speakingMessageId, setSpeakingMessageId] = React.useState<string | null>(null);
	const [revocationEpoch, setRevocationEpoch] = React.useState(0);
	const activeAbortRef = React.useRef<AbortController | null>(null);
	const executingActionIdsRef = React.useRef(new Set<string>());
	const accountRef = React.useRef<string | null>(null);
	const messagesRef = React.useRef(messages);
	const draftsRef = React.useRef(drafts);
	const catalogRef = React.useRef(catalog);

	React.useEffect(() => { messagesRef.current = messages; }, [messages]);
	React.useEffect(() => { draftsRef.current = drafts; }, [drafts]);
	React.useEffect(() => { catalogRef.current = catalog; }, [catalog]);

	const clearSession = React.useCallback(() => {
		activeAbortRef.current?.abort();
		activeAbortRef.current = null;
		executingActionIdsRef.current.clear();
		resetAssistantCatalogSession(accountRef.current);
		void Speech.stop();
		setSpeakingMessageId(null);
		setMessages([]);
		setDrafts([]);
		setCatalog({});
		setIsSending(false);
		setRevocationEpoch(value => value + 1);
	}, []);

	React.useEffect(() => {
		if (!isAuthReady) return;
		const uid = user?.uid ?? null;
		if (accountRef.current !== uid) {
			clearSession();
			accountRef.current = uid;
		}
		if (!uid) {
			setConsentGranted(false);
			updateAutoReadEnabled(false);
			setAvailability(null);
			setConfig(null);
			setIsBootstrapping(false);
			return;
		}

		let cancelled = false;
		setIsBootstrapping(true);
		void Promise.all([
			assistantPreferencesStorage.getConsent(uid),
			assistantPreferencesStorage.getAutoRead(uid),
			assistantAiGateway.getConfig(),
			assistantAiGateway.getAvailability(),
		])
			.then(([consent, autoRead, nextConfig, nextAvailability]) => {
				if (cancelled || accountRef.current !== uid) return;
				setConsentGranted(consent);
				updateAutoReadEnabled(autoRead);
				setConfig(nextConfig);
				setAvailability(nextAvailability);
			})
			.catch(error => {
				if (cancelled) return;
				const friendly = mapAssistantError(error);
				setAvailability({
					available: false,
					platform: 'unsupported',
					appCheckConfigured: false,
					remoteConfigLoaded: false,
					model: 'gemini-3.5-flash',
					reason: friendly.message,
				});
			})
			.finally(() => {
				if (!cancelled) setIsBootstrapping(false);
			});
		return () => { cancelled = true; };
	}, [clearSession, isAuthReady, user?.uid]);

	const appendNextQuestion = React.useCallback((nextDrafts: AssistantDraftAction[]) => {
		const next = findNextQuestion(nextDrafts);
		if (!next) return;
		setMessages(current => {
			const hasOpenQuestion = current.some(message => message.type === 'question' && !message.answeredAt);
			if (hasOpenQuestion) return current;
			return [...current, createMessage({
				type: 'question',
				role: 'assistant',
				text: next.field.question,
				field: next.field,
				targetActionIds: next.targetActionIds,
			})];
		});
	}, []);

	const speak = React.useCallback(async (messageId: string, text: string) => {
		await Speech.stop();
		const speakable = shouldHideValues ? maskFinancialValuesInText(text) : text;
		if (!speakable.trim()) return;
		setSpeakingMessageId(messageId);
		Speech.speak(speakable, {
			language: 'pt-BR',
			rate: 0.95,
			onDone: () => setSpeakingMessageId(current => current === messageId ? null : current),
			onStopped: () => setSpeakingMessageId(current => current === messageId ? null : current),
			onError: () => setSpeakingMessageId(current => current === messageId ? null : current),
		});
	}, [shouldHideValues]);

	const sendMessage = React.useCallback(async (rawText: string) => {
		const uid = user?.uid;
		const text = sanitizeAssistantInput(rawText);
		if (!uid || !config || !consentGranted || !text || isSending) return;
		if (isAssistantClearConversationCommand(text)) {
			clearSession();
			return;
		}
		const userMessage = createMessage({ type: 'text', role: 'user', text });
		const openQuestion = messagesRef.current.find(
			(message): message is Extract<AssistantMessage, { type: 'question' }> =>
				message.type === 'question' && !message.answeredAt,
		);
		if (openQuestion) {
			const parsedAnswer = parseAssistantQuestionAnswer(openQuestion.field, text);
			setMessages(current => [...current, userMessage]);
			if (!parsedAnswer) {
				setMessages(current => [...current, createMessage({
					type: 'warning',
					role: 'assistant',
					text: 'Não consegui associar essa resposta com segurança. Escolha uma opção do cartão ou escreva somente a informação pedida.',
				})]);
				return;
			}
			const targetIds = openQuestion.targetActionIds.slice(0, 1);
			const nextDrafts = await Promise.all(draftsRef.current.map(async draft =>
				targetIds.includes(draft.clientActionId)
					? financeCommandService.updateDraft(uid, draft, { [openQuestion.field.key]: parsedAnswer.value }, catalogRef.current)
					: draft,
			));
			draftsRef.current = nextDrafts;
			setDrafts(nextDrafts);
			setMessages(current => current.map(message =>
				message.id === openQuestion.id && message.type === 'question'
					? { ...message, answeredAt: new Date().toISOString(), answerLabel: parsedAnswer.label }
					: message,
			));
			queueMicrotask(() => appendNextQuestion(nextDrafts));
			return;
		}
		setMessages(current => [...current, userMessage]);
		setIsSending(true);
		const controller = new AbortController();
		activeAbortRef.current = controller;
		try {
			const nextCatalog = await financeCommandService.loadCatalog(uid);
			if (accountRef.current !== uid) return;
			setCatalog(nextCatalog);
			const turns = messagesRef.current
				.filter((message): message is Extract<AssistantMessage, { type: 'text' }> => message.type === 'text')
				.map(message => ({ role: message.role === 'assistant' ? 'assistant' as const : 'user' as const, text: message.text, createdAt: message.createdAt }))
				.slice(-config.maxContextTurns);
			const response = await assistantAiGateway.converse({
				requestScope: uid,
				text,
				turns,
				activeSummary: buildAssistantActiveDraftSummary(draftsRef.current),
				catalog: toAssistantModelCatalog(nextCatalog, { hideValues: shouldHideValues }),
				nowIso: new Date().toISOString(),
				timeZone: 'America/Sao_Paulo',
				config,
				signal: controller.signal,
			});
			if (accountRef.current !== uid) return;
			const assistantText = createMessage({ type: 'text', role: 'assistant', text: response.text });
			const prepared = response.actions.length > 0
				? await financeCommandService.prepareActions(uid, response.actions, nextCatalog)
				: { actions: [] as AssistantDraftAction[], catalog: nextCatalog };
			const mergedDrafts = [...draftsRef.current, ...prepared.actions];
			setDrafts(mergedDrafts);
			setMessages(current => [
				...current,
				assistantText,
				...prepared.actions.map(action => createMessage({ type: 'draft', role: 'assistant', actionId: action.clientActionId })),
			]);
			if (response.reportRequest) {
				try {
					const report = await assistantReportService.createReport(uid, response.reportRequest, nextCatalog);
					try {
							report.narrative = await assistantAiGateway.narrateReport({
								requestScope: uid,
								report,
							config,
							signal: controller.signal,
						});
					} catch {
						// O resumo determinístico permanece disponível se a narrativa falhar ou atingir a cota.
					}
					if (accountRef.current === uid) {
						setMessages(current => [...current, createMessage({ type: 'report', role: 'assistant', report })]);
					}
				} catch {
					setMessages(current => [...current, createMessage({
						type: 'warning', role: 'assistant', text: 'Não consegui atualizar esse relatório agora. Nenhum dado foi alterado.',
					})]);
				}
			}
			appendNextQuestion(mergedDrafts);
			if (autoReadEnabled) void speak(assistantText.id, assistantText.text);
		} catch (error) {
			if (controller.signal.aborted) return;
			const friendly = mapAssistantError(error);
			setMessages(current => [...current, createMessage({ type: 'error', role: 'assistant', text: friendly.message })]);
		} finally {
			if (activeAbortRef.current === controller) activeAbortRef.current = null;
			if (accountRef.current === uid) setIsSending(false);
		}
	}, [appendNextQuestion, autoReadEnabled, clearSession, config, consentGranted, isSending, shouldHideValues, speak, user?.uid]);

	const answerQuestion = React.useCallback(async (
		messageId: string,
		value: unknown,
		label: string,
		applyToSimilar = false,
	) => {
		const uid = user?.uid;
		if (!uid) return;
		const question = messagesRef.current.find(
			(message): message is Extract<AssistantMessage, { type: 'question' }> => message.id === messageId && message.type === 'question',
		);
		if (!question || question.answeredAt) return;
		const targetIds = applyToSimilar ? question.targetActionIds : question.targetActionIds.slice(0, 1);
		const nextDrafts = await Promise.all(draftsRef.current.map(async draft =>
			targetIds.includes(draft.clientActionId)
				? financeCommandService.updateDraft(uid, draft, { [question.field.key]: value }, catalogRef.current)
				: draft,
		));
		setDrafts(nextDrafts);
		setMessages(current => current.map(message =>
			message.id === messageId && message.type === 'question'
				? { ...message, answeredAt: new Date().toISOString(), answerLabel: label }
				: message,
		));
		queueMicrotask(() => appendNextQuestion(nextDrafts));
	}, [appendNextQuestion, user?.uid]);

	const editDraft = React.useCallback(async (actionId: string, patch: Record<string, unknown>) => {
		const uid = user?.uid;
		const draft = draftsRef.current.find(item => item.clientActionId === actionId);
		if (!uid || !draft) return;
		const updated = await financeCommandService.updateDraft(uid, draft, patch, catalogRef.current);
		const nextDrafts = draftsRef.current.map(item => item.clientActionId === actionId ? updated : item);
		setDrafts(nextDrafts);
		appendNextQuestion(nextDrafts);
	}, [appendNextQuestion, user?.uid]);

	const beginConfirmation = React.useCallback((actionId: string) => {
		setDrafts(current => current.map(draft =>
			draft.clientActionId === actionId && (draft.status === 'ready' || draft.status === 'failed')
				? transitionAssistantDraft(draft, 'confirming')
				: draft,
		));
	}, []);

	const cancelConfirmation = React.useCallback((actionId: string) => {
		setDrafts(current => current.map(draft =>
			draft.clientActionId === actionId && draft.status === 'confirming'
				? transitionAssistantDraft(draft, 'ready')
				: draft,
		));
	}, []);

	const executeDraft = React.useCallback(async (actionId: string) => {
		const uid = user?.uid;
		const draft = draftsRef.current.find(item => item.clientActionId === actionId);
		if (!uid || !draft || draft.status !== 'confirming' || executingActionIdsRef.current.has(actionId)) return;
		const unmetDependency = draft.dependsOnActionIds.some(dependencyId =>
			draftsRef.current.find(item => item.clientActionId === dependencyId)?.status !== 'succeeded',
		);
		if (unmetDependency) {
			setMessages(current => [...current, createMessage({
				type: 'warning', role: 'assistant', actionId, text: 'Confirme primeiro a ação indicada como dependência.',
			})]);
			return;
		}
		executingActionIdsRef.current.add(actionId);
		try {
			setDrafts(current => current.map(item => item.clientActionId === actionId ? transitionAssistantDraft(item, 'executing') : item));
			const result = await financeCommandService.execute(uid, draft, catalogRef.current);
		if (accountRef.current !== uid) return;
		if (!result.success) {
			setDrafts(current => current.map(item => item.clientActionId === actionId
				? { ...item, status: result.errorCode === 'stale' ? 'stale' : 'failed', error: result.message }
				: item));
			setMessages(current => [...current, createMessage({ type: 'error', role: 'assistant', actionId, text: result.message })]);
			return;
		}
		let nextCatalog = catalogRef.current;
		try {
			nextCatalog = await financeCommandService.loadCatalog(uid);
			setCatalog(nextCatalog);
		} catch {
			// A escrita já foi concluída; uma próxima mensagem recarregará o catálogo.
		}
		let nextDrafts = draftsRef.current.map(item => item.clientActionId === actionId
				? {
					...item,
					status: 'succeeded' as const,
					result: {
						message: result.message,
						recordHandle: result.recordHandle,
						notificationWarning: result.notificationWarning,
						notificationRetry: result.notificationRetry,
					},
					error: undefined,
				  }
			: item);
			nextDrafts = await Promise.all(nextDrafts.map(async item => {
				if (!item.dependsOnActionIds.includes(actionId)) return item;
				const patch: Record<string, unknown> = {};
				for (const [key, value] of Object.entries(item.payload)) {
					if (value !== `action:${actionId}`) continue;
					const source = getFieldDefinition(item.kind, key).choiceSource;
					const createdItem = source
						? (nextCatalog[source] ?? []).find(candidate => candidate.data?.assistantActionId === actionId)
						: undefined;
					if (createdItem) patch[key] = createdItem.handle;
				}
				return Object.keys(patch).length > 0
					? financeCommandService.updateDraft(uid, item, patch, nextCatalog)
					: item;
			}));
		setDrafts(nextDrafts);
		setMessages(current => [
			...current,
			createMessage({ type: 'success', role: 'assistant', actionId, text: result.message }),
			...(result.notificationWarning
				? [createMessage({ type: 'warning', role: 'assistant', actionId, text: result.notificationWarning })]
				: []),
		]);
		} finally {
			executingActionIdsRef.current.delete(actionId);
		}
	}, [user?.uid]);

	const cancelDraft = React.useCallback((actionId: string) => {
		const cancelledIds = new Set([actionId]);
		let foundDependent = true;
		while (foundDependent) {
			foundDependent = false;
			for (const draft of draftsRef.current) {
				if (!cancelledIds.has(draft.clientActionId) && draft.dependsOnActionIds.some(id => cancelledIds.has(id))) {
					cancelledIds.add(draft.clientActionId);
					foundDependent = true;
				}
			}
		}
		const nextDrafts = draftsRef.current.map(draft =>
			cancelledIds.has(draft.clientActionId) && !['succeeded', 'cancelled'].includes(draft.status)
				? {
					...draft,
					status: 'cancelled' as const,
					warnings: draft.clientActionId === actionId
						? draft.warnings
						: [...draft.warnings, 'Cancelado porque uma ação necessária também foi cancelada.'],
				  }
				: draft,
		);
		draftsRef.current = nextDrafts;
		setDrafts(nextDrafts);
		setMessages(current => current.map(message => {
			if (message.type !== 'question' || message.answeredAt) return message;
			const remainingTargets = message.targetActionIds.filter(id => !cancelledIds.has(id));
			return remainingTargets.length > 0
				? { ...message, targetActionIds: remainingTargets }
				: { ...message, answeredAt: new Date().toISOString(), answerLabel: 'Rascunho cancelado' };
		}));
		queueMicrotask(() => appendNextQuestion(nextDrafts));
	}, [appendNextQuestion]);

	const retryNotification = React.useCallback(async (actionId: string) => {
		const uid = user?.uid;
		const draft = draftsRef.current.find(item => item.clientActionId === actionId);
		if (!uid || !draft?.result?.notificationWarning || executingActionIdsRef.current.has(actionId)) return;
		executingActionIdsRef.current.add(actionId);
		try {
			const result = await financeCommandService.retryNotification(uid, draft, catalogRef.current);
			if (accountRef.current !== uid) return;
			if (!result.success) {
				setMessages(current => [...current, createMessage({ type: 'warning', role: 'assistant', actionId, text: result.message })]);
				return;
			}
			setDrafts(current => current.map(item => item.clientActionId === actionId && item.result
					? { ...item, result: { ...item.result, notificationWarning: undefined, notificationRetry: undefined } }
				: item));
			setMessages(current => [...current, createMessage({ type: 'success', role: 'assistant', actionId, text: result.message })]);
		} finally {
			executingActionIdsRef.current.delete(actionId);
		}
	}, [user?.uid]);

	const grantConsent = React.useCallback(async () => {
		if (!user?.uid) return;
		await assistantPreferencesStorage.setConsent(user.uid);
		setConsentGranted(true);
	}, [user?.uid]);

	const revokeConsent = React.useCallback(async () => {
		if (user?.uid) await assistantPreferencesStorage.revokeConsent(user.uid);
		setConsentGranted(false);
		clearSession();
	}, [clearSession, user?.uid]);

	const setAutoReadEnabled = React.useCallback((value: boolean) => {
		updateAutoReadEnabled(value);
		if (user?.uid) void assistantPreferencesStorage.setAutoRead(user.uid, value);
		if (!value) void Speech.stop().then(() => setSpeakingMessageId(null));
	}, [user?.uid]);

	const transcribeAudio = React.useCallback(async (input: { base64Audio: string; mimeType: string; durationMs: number }) => {
		if (!config || !consentGranted) throw new Error('Consentimento necessário.');
		const controller = new AbortController();
		activeAbortRef.current = controller;
		try {
			return await assistantAiGateway.transcribe({ ...input, requestScope: user?.uid, config, signal: controller.signal });
		} finally {
			if (activeAbortRef.current === controller) activeAbortRef.current = null;
		}
	}, [config, consentGranted, user?.uid]);

	const stopSpeaking = React.useCallback(async () => {
		await Speech.stop();
		setSpeakingMessageId(null);
	}, []);

	const contextValue = React.useMemo<LumusAssistantContextValue>(() => ({
		messages,
		drafts,
		catalog,
		availability,
		config,
		isBootstrapping,
		isSending,
		consentGranted,
		autoReadEnabled,
		speakingMessageId,
		revocationEpoch,
		grantConsent,
		revokeConsent,
		setAutoReadEnabled,
		sendMessage,
		transcribeAudio,
		answerQuestion,
		editDraft,
		beginConfirmation,
		cancelConfirmation,
		executeDraft,
		cancelDraft,
		retryNotification,
		clearConversation: clearSession,
		speak,
		stopSpeaking,
	}), [
		answerQuestion, autoReadEnabled, availability, beginConfirmation, cancelConfirmation,
		cancelDraft, catalog, clearSession, config, consentGranted, drafts, editDraft, executeDraft,
		grantConsent, isBootstrapping, isSending, messages, revokeConsent, revocationEpoch,
		retryNotification, sendMessage, setAutoReadEnabled, speak, speakingMessageId, stopSpeaking, transcribeAudio,
	]);

	return <LumusAssistantContext.Provider value={contextValue}>{children}</LumusAssistantContext.Provider>;
};

export const useLumusAssistant = () => {
	const context = React.useContext(LumusAssistantContext);
	if (!context) throw new Error('useLumusAssistant deve ser usado dentro de LumusAssistantProvider.');
	return context;
};
