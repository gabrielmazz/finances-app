import type {
	AssistantAiConversationResponse, AssistantDraftAction, AssistantMessage,
	AssistantReportRequest, AssistantResolvedCatalog, FinanceCommandService, AssistantSendProgress,
} from '@/types/lumusAssistant';
import {
	createAssistantId, formatCents, getActionAmountInCents,
	parseAssistantQuestionAnswer, sanitizeAssistantInput,
	formatCycleKey,
} from '@/utils/lumusAssistant';
import { getFieldDefinition, ASSISTANT_ACTION_LABELS } from '@/utils/lumusAssistantSchemas';
import {
	assistantActionSignature, createAssistantAuthorizationSession, isAssistantCancellation,
	isAssistantConfirmation, isAssistantMutationIntent, canAssistantExecuteDirectly,
} from './assistantAuthorization';
import { mapAssistantError } from '@/utils/lumusAssistantErrors';
import { expandAssistantBatch, getExplicitAssistantBatchCount, parseAssistantLocalRequest } from './assistantBatchService';

type State = { messages: AssistantMessage[]; drafts: AssistantDraftAction[]; catalog: AssistantResolvedCatalog; busy: boolean; progress: AssistantSendProgress | null };
type Options = {
	uid: string; finance: FinanceCommandService;
	interpret(text: string, state: State, signal: AbortSignal): Promise<AssistantAiConversationResponse>;
	report(request: AssistantReportRequest, catalog: AssistantResolvedCatalog): Promise<string>;
	application?(text: string, context: { emit(text: string): void; signal: AbortSignal; originText: string; proposedByModel: boolean; applicationConfirmationSnapshot: string | null }): Promise<string | null>;
	applicationConfirmationSnapshot?(): string | null;
	onChange(state: State): void; onCommit?(): Promise<void>;
};
type Confirmation = { ids: string[]; signatures: string[] };
const pending = (draft: AssistantDraftAction) => !['succeeded', 'cancelled', 'executing'].includes(draft.status);
const normalized = (text: string) => text.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const isAccountQuery = (text: string) => /\b(?:meu|minha|meus|minhas|tenho|gastei|recebi|pendentes|extrato)\b/.test(normalized(text)) && /\b(?:saldo|gasto|ganho|despesa|receita|carteira|investimentos?|cdi|contas?|pendentes|extrato|tenho|gastei|recebi)\b/.test(normalized(text));
const isGeneralExplanation = (text: string) => /^(?:o que (?:e|sao|significa)|como (?:funciona|funcionam)|explique)\b/.test(normalized(text)) && !/\b(?:meu|minha|meus|minhas|tenho|gastei|recebi|extrato|cadastrei|registrad[oa])\b/.test(normalized(text));

/** Fluxo compartilhado Web/voz/native. O modelo propõe; eventos do usuário autorizam. */
export function createAssistantConversation(options: Options) {
	let state: State = { messages: [], drafts: [], catalog: {}, busy: false, progress: null };
	let disposed = false;
	let epoch = 0;
	let confirmation: Confirmation | null = null;
	let controller: AbortController | null = null;
	let cancelled = false;
	let queue = Promise.resolve();
	let queueGeneration = 0;
	let authorization = createAssistantAuthorizationSession(options.uid);
	const origins = new Map<string, string>();
	const deferredReports = new Map<string, AssistantReportRequest[]>();
	let lastReports: AssistantReportRequest[] = [];
	let lastFinancialOrigin: string | null = null;
	let detailCursor: { ids: string[]; offset: number } | null = null;
	let cancellationChoices: string[] = [];
	const receivedConfirmations = new Map<string, Confirmation | null>();
	const receivedApplicationConfirmations = new Map<string, string | null>();
	const publish = () => { if (!disposed) options.onChange({ ...state }); };
	const say = (text: string, type: 'text' | 'success' | 'error' | 'warning' = 'text', role: 'user' | 'assistant' = 'assistant', includeInModelHistory = false) => {
		const message: AssistantMessage = { id: createAssistantId('message'), createdAt: new Date().toISOString(), role, type, text, ...(type === 'text' && role === 'assistant' ? { excludeFromModelHistory: !includeInModelHistory } : {}) };
		state.messages = [...state.messages, message]; publish(); return message.id;
	};
	const replace = (draft: AssistantDraftAction) => { state.drafts = state.drafts.map(item => item.clientActionId === draft.clientActionId ? draft : item); publish(); };
	const cancelTargets = (ids: string[]) => {
		const selected = new Set(ids);
		for (let changed = true; changed;) {
			changed = false;
			for (const item of state.drafts) if (!selected.has(item.clientActionId) && item.dependsOnActionIds.some(id => selected.has(id))) {selected.add(item.clientActionId);changed = true;}
		}
		confirmation = null;
		state.drafts = state.drafts.map(item => selected.has(item.clientActionId) && pending(item) ? {...item,status:'cancelled'} : item);publish();
		say(state.drafts.some(item => selected.has(item.clientActionId) && item.status === 'executing') ? 'A operação já está em andamento. Vou informar o resultado real; seus dependentes não serão iniciados.' : 'Esse pedido e suas dependências foram cancelados. Os demais pedidos permanecem.');
	};
	const summaries = (drafts: AssistantDraftAction[]) => drafts.slice(0, 8).map((draft, index) => {
		const amount = getActionAmountInCents(draft.kind, draft.payload);
		const references = ['name', 'bankRef', 'sourceBankRef', 'targetBankRef', 'recordRef', 'investmentRef', 'categoryRef', 'date'].flatMap(key => {
			const value = draft.payload[key]; if (typeof value !== 'string') return [];
			const source = getFieldDefinition(draft.kind, key).choiceSource;
			return [source ? state.catalog[source]?.find(item => item.handle === value)?.label ?? 'referência pendente' : value];
		});
		const effect = draft.kind === 'update_investment' && typeof draft.payload.initialValueInCents === 'number' ? ` · estornar o aporte inicial e registrar um novo aporte de ${formatCents(draft.payload.initialValueInCents)}`
			: draft.kind === 'update_bank' && typeof draft.payload.isActive === 'boolean' ? ` · ${draft.payload.isActive?'ativar':'desativar'} o banco`
			: draft.kind === 'upsert_balance_adjustment' && typeof draft.payload.targetBalanceInCents === 'number' ? ` · saldo conferido ${formatCents(draft.payload.targetBalanceInCents)}` : '';
		return `${index + 1}. ${ASSISTANT_ACTION_LABELS[draft.kind]}: ${references.join(' · ')}${amount !== null ? ` · ${formatCents(amount)}` : ''}${effect}`;
	}).join('\n');
	const ask = (ids: string[]) => {
		const draft = state.drafts.find(item => ids.includes(item.clientActionId) && pending(item) && item.missingFields.length > 0);
		if (!draft) return false;
		const field = draft.missingFields[0]!;
		const choices = field.choices?.filter(item => !item.disabled) ?? [];
		say(`${field.question}${choices.length ? `\n${choices.slice(0, 12).map((choice, index) => `${index + 1}. ${choice.label}${choice.description ? ` (${choice.description})` : ''}`).join('\n')}${choices.length > 12 ? '\nHá outras opções; informe o nome.' : ''}` : ''}`);
		return true;
	};
	const reports = async (requests: AssistantReportRequest[], currentEpoch: number) => {
		if (requests.length) detailCursor = null;
		for (const request of requests) {
			if (disposed || epoch !== currentEpoch) return;
			state.progress = {active:'building_report',completed:[]};publish();
			try { const text = await options.report(request, state.catalog); if (epoch === currentEpoch && !disposed) {lastReports = [request];say(text);} }
			catch (error) { if (epoch === currentEpoch && !disposed) say(mapAssistantError(error).message, 'error'); }
		}
	};
	const execute = async (ids: string[], messageId: string, mode: 'direct' | 'confirmation', currentEpoch: number) => {
		cancelled = false;
		state.progress={active:'executing_actions',completed:['preparing_actions']};publish();
		let done = 0;
		let failures = 0;
		let blocked = 0;
		for (const id of ids) {
			if (cancelled || disposed || epoch !== currentEpoch) break;
			const draft = state.drafts.find(item => item.clientActionId === id);
			if (!draft || draft.status === 'succeeded' || draft.status === 'cancelled') continue;
			if (draft.missingFields.length || draft.dependsOnActionIds.some(dependency => state.drafts.find(item => item.clientActionId === dependency)?.status !== 'succeeded')) { blocked++; continue; }
			const grant = authorization.authorize(draft, messageId, mode);
			if (!grant) { blocked++; continue; }
			replace({ ...draft, status: 'executing' });
			let result;
			try { result = await options.finance.execute(options.uid, draft, state.catalog, grant); }
			catch { result = { success: false, message: 'Resultado incerto. Peça para tentar novamente; a mesma operação será conferida antes de repetir.', errorCode: 'transaction-failed' }; }
			if (disposed || epoch !== currentEpoch) return;
			if (!result.success) {
				failures++; replace({ ...draft, status: result.errorCode === 'stale' ? 'stale' : 'failed', error: result.message });
				if (ids.length <= 8) say(result.message, 'error');
				continue;
			}
			done++; replace({ ...draft, status: 'succeeded', error: undefined, result });
			if (ids.length <= 8) say(result.message, 'success');
			if (result.notificationWarning) say(result.notificationWarning, 'warning');
			try {
				// Só dependências criadas precisam recarregar referências por item.
				if (state.drafts.some(item => pending(item) && item.dependsOnActionIds.includes(id))) {
					const catalog = await options.finance.loadCatalog(options.uid);
					if (disposed || epoch !== currentEpoch) return;
					state.catalog = catalog;
					for (const item of state.drafts.filter(item => pending(item) && item.dependsOnActionIds.includes(id))) {
						const patch: Record<string, unknown> = {};
						for (const [key, value] of Object.entries(item.payload)) {
							if (value !== `action:${id}`) continue;
							const source = getFieldDefinition(item.kind, key).choiceSource;
							const created = source && catalog[source]?.find(candidate => candidate.data?.assistantActionId === id);
							if (created) patch[key] = created.handle;
						}
						if (Object.keys(patch).length) replace(await options.finance.updateDraft(options.uid, item, patch, catalog));
					}
				}
			} catch { say('A operação foi salva; não consegui atualizar todas as leituras agora.', 'warning'); }
			if (ids.length > 8 && (done % 10 === 0 || done + failures + blocked === ids.length)) say(`${done} de ${ids.length} concluídas.`, 'success');
		}
		if (done) {
			try { await options.onCommit?.(); } catch { say('As operações foram salvas; algumas leituras ainda precisam ser atualizadas.', 'warning'); }
		}
		const notStarted = ids.filter(id => state.drafts.find(item => item.clientActionId === id)?.status === 'cancelled').length;
		if (ids.length > 1 || cancelled) say(`${done} concluídas, ${failures} falhas, ${blocked} aguardando dados ou dependências${notStarted ? `, ${notStarted} não iniciadas por cancelamento` : ''}${cancelled ? '. Parei de iniciar novos itens; operações já salvas foram preservadas' : ''}.${ids.length > 8 ? ' Peça “detalhes do lote” para consultar os resultados por item.' : ''}`, failures ? 'warning' : 'success');
		if (!cancelled) {
			const requests = ids.flatMap(id => deferredReports.get(id) ?? []);
			if (!failures && !blocked) ids.forEach(id => deferredReports.delete(id));
			if (requests.length && (failures || blocked)) say('Algumas operações não concluíram. A consulta a seguir mostra a posição persistida.', 'warning');
			await reports(requests, currentEpoch);
		}
	};
	const finish = async (ids: string[], currentEpoch: number, forceConfirmation = false) => {
		const drafts = ids.flatMap(id => { const draft = state.drafts.find(item => item.clientActionId === id); return draft && pending(draft) ? [draft] : []; });
		if (ask(ids) || !drafts.length) return;
		const origin = origins.get(drafts[0]!.clientActionId);
		if (!forceConfirmation && drafts.length === 1 && origin && canAssistantExecuteDirectly(state.messages.find(message => message.id === origin && message.type === 'text')?.type === 'text' ? (state.messages.find(message => message.id === origin) as Extract<AssistantMessage, { type: 'text' }>).text : '',drafts[0]!)) {
			await execute(ids, origin, 'direct', currentEpoch); return;
		}
		confirmation = { ids: drafts.map(item => item.clientActionId), signatures: drafts.map(assistantActionSignature) };
		const amount = drafts.reduce((total, draft) => total + (getActionAmountInCents(draft.kind, draft.payload) ?? 0), 0);
		say(`${summaries(drafts)}${drafts.length > 8 ? `\nMais ${drafts.length - 8} operações do mesmo pedido.` : ''}\n${drafts.length} operação(ões)${amount ? ` · soma dos valores ${formatCents(amount)}` : ''}. Posso registrar este conjunto? Responda “confirmo”, corrija os dados ou cancele.`);
	};
	const process = async (text: string, messageId: string, currentEpoch: number) => {
		if (disposed || epoch !== currentEpoch) return;
		state.busy = true; state.progress = { active: 'loading_data', completed: [] }; publish();
		const abort = new AbortController(); controller = abort;
		try {
			const applicationContext = {emit: (text: string) => { if (!disposed && epoch === currentEpoch) say(text); }, signal: abort.signal, originText:text, proposedByModel:false,applicationConfirmationSnapshot:receivedApplicationConfirmations.get(messageId)??null};
			const applicationResult = await options.application?.(text, applicationContext);
			if (disposed || epoch !== currentEpoch) return;
			if (/^(?:tente|tentar|atualize|reagende) (?:os? )?(?:lembretes?|notificacoes?)(?: novamente)?$/.test(normalized(text).trim())) {
				const warnings = state.drafts.filter(item => item.status === 'succeeded' && item.result?.notificationWarning);
				if (!warnings.length) {say('Não há lembrete com falha neste pedido.');return;}
				for (const draft of warnings) {
					if (disposed || epoch !== currentEpoch || abort.signal.aborted) break;
					const result = await options.finance.retryNotification(options.uid, draft, state.catalog);
					if (disposed || epoch !== currentEpoch || abort.signal.aborted) return;
					replace({...draft,result:{...draft.result!,notificationWarning:result.success?undefined:result.message,notificationRetry:result.success?undefined:draft.result?.notificationRetry}});
					say(result.message, result.success?'success':'warning');
				}
				return;
			}
			if (applicationResult !== undefined && applicationResult !== null) { confirmation = null; state.messages = state.messages.map(item => item.id === messageId ? { ...item, excludeFromModelHistory: true } : item); say(applicationResult); return; }
			if (/^(?:nao|nao confirmo|nao pode)$/.test(normalized(text)) && confirmation) {
				const selected = confirmation; confirmation = null;
				state.drafts = state.drafts.map(item => selected.ids.includes(item.clientActionId) ? {...item,status:'cancelled'} : item);publish();say('Esse conjunto foi cancelado. Nenhuma nova operação dele foi registrada.');return;
			}
			if (isAssistantConfirmation(text) && (confirmation || !state.drafts.some(item => pending(item) && item.missingFields[0]?.kind === 'boolean'))) {
				const selected = receivedConfirmations.get(messageId);
				if (!selected || !confirmation || JSON.stringify(selected) !== JSON.stringify(confirmation) || selected.ids.some((id, index) => { const draft = state.drafts.find(item => item.clientActionId === id); return !draft || assistantActionSignature(draft) !== selected.signatures[index]; })) { say('Não havia uma confirmação ativa dessa versão quando sua resposta chegou. Leia o resumo atual e confirme para continuar.'); return; }
				confirmation = null;
				await execute(selected.ids, messageId, 'confirmation', currentEpoch); return;
			}
			if (/^(?:tente novamente|tentar novamente|repita as falhas|retry)$/.test(normalized(text))) {
				const failed = state.drafts.filter(item => item.status === 'failed');
				if (!failed.length) { say('Não há operações com falha para tentar novamente.'); return; }
				say('Vou conferir as operações com falha usando os mesmos identificadores. Os sucessos permanecem.');
				await finish(failed.map(item => item.clientActionId), currentEpoch, true); return;
			}
			if (/^(?:continue|retome)(?: o pedido)?$/.test(normalized(text))) {
				const active = state.drafts.filter(pending);
				if (active.length) await finish(active.map(item => item.clientActionId), currentEpoch, true);
				else say('Não há um pedido pendente para continuar.');
				return;
			}
			// Uma pergunta paralela invalida o foco de confirmação, mas conserva o pedido.
			confirmation = null;
			const detailRequest = /^(?:detalhes do lote|mostre (?:os )?resultados do lote|mostre (?:as )?falhas do lote|mostre (?:os )?itens cancelados)[.!?]*$/.test(normalized(text));
			if (detailRequest || (/^mais detalhes[.!?]*$/.test(normalized(text)) && detailCursor)) {
				if (detailRequest) {
					const filter = /falhas/.test(normalized(text)) ? (item: AssistantDraftAction) => ['failed', 'stale'].includes(item.status)
						: /cancelados/.test(normalized(text)) ? (item: AssistantDraftAction) => item.status === 'cancelled' : () => true;
					detailCursor = { ids: state.drafts.filter(item => origins.get(item.clientActionId) === lastFinancialOrigin && filter(item)).map(item => item.clientActionId), offset: 0 };
				}
				const selected = detailCursor!;
				const labels: Record<AssistantDraftAction['status'], string> = { draft: 'Pedido em preparo', confirming: 'Aguardando confirmação', ready: 'Aguardando confirmação', needs_input: 'Dados faltantes', executing: 'Em andamento; resultado em conferência', succeeded: 'Concluída', failed: 'Falhou', stale: 'Registro mudou; nova revisão necessária', cancelled: 'Não iniciada por cancelamento' };
				const items = selected.ids.slice(selected.offset, selected.offset + 8).flatMap(id => { const item = state.drafts.find(draft => draft.clientActionId === id); return item ? [item] : []; });
				const lines = items.map((item, index) => `${summaries([item]).replace(/^1\./, `${selected.offset + index + 1}.`)} — ${labels[item.status]}${item.error ? `: ${item.error}` : ''}`);
				selected.offset += items.length;
				say(lines.length ? `${lines.join('\n')}\n${selected.offset} de ${selected.ids.length} resultados consultados.${selected.offset < selected.ids.length ? ' Diga “mais detalhes” para continuar.' : ''}` : 'Não há outros resultados deste lote para esse filtro.');
				return;
			}
			if (/^(?:mais detalhes|mostre os demais|proximos registros|continue o extrato)$/.test(normalized(text)) && lastReports.length) {
				await reports(lastReports.map(request => ({...request,offset:(request.offset ?? 0) + 20})),currentEpoch);return;
			}
			if (/^(?:e )?(?:no|em|do) mes passado[?]?$/.test(normalized(text)) && lastReports.length) {
				const [year,month] = formatCycleKey(new Date()).split('-').map(Number);
				const period = `${month === 1 ? year! - 1 : year}-${String(month === 1 ? 12 : month! - 1).padStart(2,'0')}`;
				await reports(lastReports.map(request => ({...request,period,offset:0})),currentEpoch);return;
			}
			const current = state.drafts.filter(pending);
			const questionDraft = current.find(item => item.missingFields.length);
			const isNewSubject = /[?]|\b(?:quanto|qual|saldo|relatorio|mostre|liste|registre|crie|adicione|pague)\b/.test(normalized(text));
			if (questionDraft && !isNewSubject) {
				const patch: Record<string, unknown> = {};
				for (const part of text.split(/;|\s+e\s+|(?<!\d),|,(?!\d)/)) {
					for (const field of questionDraft.missingFields) {
						if (field.kind === 'money' && !/^(?:R\$\s*)?[\d.,]+(?:\s*reais)?$/i.test(part.trim())) continue;
						if (field.choices?.length && /^(?:(?:o|a)\s+)?(?:\d+|primeir[oa]|segund[oa]|terceir[oa])$/.test(normalized(part.trim())) && field !== questionDraft.missingFields[0]) continue;
						if (field.kind === 'text' && questionDraft.missingFields.length > 1) continue;
						const answer = parseAssistantQuestionAnswer(field, part.trim());
						if (answer && !(field.kind === 'date' && /^\d+(?:[.,]\d+)?$/.test(part.trim()) && questionDraft.missingFields.some(item => item.kind === 'money'))) patch[field.key] = answer.value;
					}
				}
				if (Object.keys(patch).length) {
					const updated = await options.finance.updateDraft(options.uid, questionDraft, patch, state.catalog);
					if (disposed || epoch !== currentEpoch) return;
					replace(updated);
					const group = current.filter(item => origins.get(item.clientActionId) === origins.get(questionDraft.clientActionId));
					for (const item of group) {
						if (item.clientActionId === questionDraft.clientActionId) continue;
						const shared = Object.fromEntries(Object.entries(patch).filter(([key]) => item.missingFields.some(field => field.key === key && field.allowApplyToSimilar)));
						if (Object.keys(shared).length) replace(await options.finance.updateDraft(options.uid, item, shared, state.catalog));
					}
					await finish(group.map(item => item.clientActionId), currentEpoch); return;
				}
			}
			const directRead = parseAssistantLocalRequest(text, state.catalog);
			if (directRead && !directRead.actions.length && directRead.reportRequests.every(request=>!request.bankRef && !request.categoryRef)) {
				await reports(directRead.reportRequests,currentEpoch);return;
			}
			const generalExplanation = isGeneralExplanation(text);
			const catalog = generalExplanation ? {} : await options.finance.loadCatalog(options.uid);
			if (disposed || epoch !== currentEpoch) return;
			if (!generalExplanation) state.catalog = catalog;
			state.progress = { active: 'interpreting_request', completed: generalExplanation ? [] : ['loading_data'] }; publish();
			const turnIndex = state.messages.findIndex(item => item.id === messageId);
			const response = parseAssistantLocalRequest(text, catalog)
				?? await options.interpret(text, {...state,catalog,messages:state.messages.slice(0,turnIndex + 1)}, abort.signal);
			if (disposed || epoch !== currentEpoch || abort.signal.aborted) return;
			for (const warning of response.warnings ?? []) say(warning, 'warning');
			if (response.fallbackModel) say('O modelo principal ficou indisponível. Usei o modelo de apoio para interpretar este pedido.', 'warning');
			let handledApplication = false;
			if (response.applicationCommands?.length) {
				const result = await options.application?.(response.applicationCommands.join('\n'), {...applicationContext,proposedByModel:true});
				if (disposed || epoch !== currentEpoch || abort.signal.aborted) return;
				if (result) {say(result);handledApplication = true;state.messages = state.messages.map(item => item.id === messageId ? {...item,excludeFromModelHistory:true} : item);}
				else say('Não consegui associar o pedido local a uma operação disponível. Nenhuma alteração local foi feita.', 'warning');
			}
			for (const batch of response.batchRequests ?? []) {
				const selection = expandAssistantBatch(batch, catalog);
				say(`Filtro: ${selection.scope}. ${selection.proposals.length} elegíveis, ${selection.excluded} excluídos por data ou conclusão e ${selection.readOnly} sem permissão de escrita.${selection.unavailableHistory ? ` ${selection.unavailableHistory} sem histórico suficiente para conferir o ciclo, excluídos da execução.` : ''}`);
				const humanCount = getExplicitAssistantBatchCount(text);
				if (humanCount !== undefined && batch.expectedCount !== undefined && humanCount !== batch.expectedCount) {
					say(`Você pediu ${humanCount} itens, mas a interpretação sugeriu ${batch.expectedCount}. Qual filtro identifica o conjunto que você quer? Nenhum item desse lote foi iniciado.`, 'warning');
					continue;
				}
				const expectedCount = humanCount ?? batch.expectedCount;
				if (expectedCount !== undefined && expectedCount !== selection.proposals.length) {
					say(`Você pediu ${expectedCount} itens, mas esse filtro encontrou ${selection.proposals.length} elegíveis. Qual filtro identifica o conjunto que você quer? Nenhum item desse lote foi iniciado.`, 'warning');
					continue;
				}
				response.actions.push(...selection.proposals);
			}
			const affected: string[] = [];
			for (const update of response.draftUpdates ?? []) {
				const draft = state.drafts.find(item => item.clientActionId === update.actionId && pending(item));
				if (!draft) continue;
				const updated = await options.finance.updateDraft(options.uid, draft, update.patch, catalog);
				if (disposed || epoch !== currentEpoch) return;
				replace(updated);
				for (const item of state.drafts.filter(item => pending(item) && origins.get(item.clientActionId) === origins.get(draft.clientActionId))) if (!affected.includes(item.clientActionId)) affected.push(item.clientActionId);
			}
			for (const proposal of response.actions) {
				for (const [key, value] of Object.entries(proposal.payload)) {
					if (!key.endsWith('Ref') || typeof value !== 'string') continue;
					const source = getFieldDefinition(proposal.kind, key).choiceSource;
					const selections = response.referenceCandidates?.filter(selection => selection.source === source) ?? [];
					const exact = selections.some(selection => selection.total === 1 && selection.handles.includes(value));
					const candidate = source ? catalog[source]?.find(item => item.handle === value) : null;
					if (!exact && selections.some(selection => selection.total > 1 && candidate && normalized(candidate.label).includes(normalized(selection.query)))) proposal.payload[key] = undefined;
				}
			}
			if (response.actions.length) {
				state.progress={active:'preparing_actions',completed:['loading_data','interpreting_request']};publish();
				const prepared = await options.finance.prepareActions(options.uid, response.actions, catalog);
				if (disposed || epoch !== currentEpoch) return;
				state.drafts = [...state.drafts, ...prepared.actions];
				for (const draft of prepared.actions) { origins.set(draft.clientActionId, messageId); affected.push(draft.clientActionId); }
			}
			publish();
			if (affected.length) {
				if (response.reportRequests.length) deferredReports.set(affected[affected.length - 1]!, response.reportRequests);
				// A consulta nunca autoriza uma proposta de escrita emitida pelo modelo.
				if (!isAssistantMutationIntent(text) && !response.draftUpdates?.length) { say('A consulta não autoriza alterar seus registros. Nenhuma operação foi executada.', 'warning'); state.drafts = state.drafts.map(item => affected.includes(item.clientActionId) ? { ...item, status: 'cancelled' } : item); publish(); await reports(response.reportRequests, currentEpoch); return; }
				lastFinancialOrigin = origins.get(affected[0]!) ?? null; detailCursor = null;
				await finish(affected, currentEpoch, Boolean(response.draftUpdates?.length));
			} else {
				await reports(response.reportRequests, currentEpoch);
				if (!handledApplication && !response.reportRequests.length && !response.warnings?.length) {
					if (isAssistantMutationIntent(text)) say('Não consegui preparar esse pedido para registro. Nenhuma operação foi executada.');
					else if (isAccountQuery(text)) say('Não consegui consultar a fonte necessária para essa pergunta. Nenhum valor foi calculado e nenhuma alteração foi feita.');
					else say(response.text || 'Não consegui associar o pedido a uma operação disponível.','text','assistant',true);
				}
			}
		} catch (error) { if (!disposed && epoch === currentEpoch && !abort.signal.aborted) say(mapAssistantError(error).message, 'error'); }
		finally { receivedConfirmations.delete(messageId); receivedApplicationConfirmations.delete(messageId); if (epoch === currentEpoch && !disposed) { state.busy = false; state.progress = null; publish(); } if (controller === abort) controller = null; }
	};
	return {
		snapshot: () => state,
		whenIdle: () => queue,
		send(raw: string) {
			if (raw.trim().length > 4000) {say('A mensagem ultrapassa 4.000 caracteres. Divida os itens em mensagens menores; nenhum item dessa mensagem foi processado.', 'warning'); return Promise.resolve();}
			const text = sanitizeAssistantInput(raw); if (!text || disposed) return Promise.resolve();
			const messageId = say(text, 'text', 'user'); authorization.recordUserMessage(messageId, text);
			receivedConfirmations.set(messageId,confirmation ? {ids:[...confirmation.ids],signatures:[...confirmation.signatures]} : null);
			receivedApplicationConfirmations.set(messageId,options.applicationConfirmationSnapshot?.()??null);
			const targetCancellation = /^(?:cancele|cancelar|cancela)\s+(?:a |o )?(?:despesa|receita|pedido|operacao)(?:\s+(?:do|da|de))?\s+(.+?)[.!]*$/.exec(normalized(text));
			if (targetCancellation) {
				const reference = targetCancellation[1]!.replace(/[.!]+$/,'');
				const matches = state.drafts.filter(item => item.status !== 'succeeded' && item.status !== 'cancelled' && (normalized(String(item.payload.name ?? '')).includes(reference) || normalized(ASSISTANT_ACTION_LABELS[item.kind]).includes(reference)));
				if (matches.length === 1) {cancelTargets([matches[0]!.clientActionId]);return Promise.resolve();}
				if (!matches.length) {say('Não encontrei um pedido em aberto com esse nome. Informe o nome usado na conversa.');return Promise.resolve();}
				cancellationChoices = matches.map(item=>item.clientActionId);say(`Há mais de um pedido. Qual deseja cancelar?\n${summaries(matches)}`);return Promise.resolve();
			}
			if (cancellationChoices.length) {
				const ordinal = /^(?:a |o )?(\d+|primeir[oa]|segund[oa]|terceir[oa])$/.exec(normalized(text));
				const index = ordinal ? /^\d+$/.test(ordinal[1]!) ? Number(ordinal[1]) - 1 : /^primeir/.test(ordinal[1]!) ? 0 : /^segund/.test(ordinal[1]!) ? 1 : 2 : -1;
				const id = cancellationChoices[index];cancellationChoices = [];
				if (id) {cancelTargets([id]);return Promise.resolve();}
			}
			if (isAssistantCancellation(text)) {
				cancelled = true; queueGeneration++; confirmation = null; controller?.abort();
				state.drafts = state.drafts.map(draft => pending(draft) ? { ...draft, status: 'cancelled' } : draft); publish();
				say(state.drafts.some(item => item.status === 'executing') ? 'Parei de iniciar novos itens. Vou conferir a operação em andamento; o que já foi salvo permanece.' : 'Pedido cancelado. Operações já salvas permanecem.');
				return Promise.resolve();
			}
			const currentEpoch = epoch;
			const generation = queueGeneration;
			queue = queue.then(() => generation === queueGeneration ? process(text, messageId, currentEpoch) : undefined); return queue;
		},
		clear() { authorization.dispose(); authorization = createAssistantAuthorizationSession(options.uid); epoch++; cancelled = true; queueGeneration++; confirmation = null; controller?.abort(); origins.clear(); deferredReports.clear();receivedConfirmations.clear();receivedApplicationConfirmations.clear(); lastReports = [];lastFinancialOrigin = null;detailCursor = null;cancellationChoices = [];state = { messages: [], drafts: [], catalog: {}, busy: false, progress: null }; publish(); },
		dispose() { disposed = true; epoch++; cancelled = true; controller?.abort(); authorization.dispose(); },
	};
}
