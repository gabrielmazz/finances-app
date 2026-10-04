import { auth } from '@/FirebaseConfig';
import { getRelatedUsersFirebase } from '@/functions/RegisterUserFirebase';
import { getUserProfileFirebase, getUserProfileAccessSummaryFirebase, updateUserProfileFirebase } from '@/functions/UserProfileFirebase';
import { runUserRelationshipFirebase } from '@/functions/UserRelationshipFirebase';
import type { PostSubmitBehavior, PostSubmitBehaviorMode, PostSubmitDestinationKey, PostSubmitScreenKey } from '@/contexts/PostSubmitBehaviorContext';
import type { RouteVisibilityKey } from '@/contexts/RouteVisibilityContext';
import { createLocalAnnotation, getLocalAnnotationTitle, loadLocalAnnotations, saveLocalAnnotation } from '@/utils/localAnnotations';
import { createAssistantId, maskFinancialValuesInText } from '@/utils/lumusAssistant';
import { createAssistantRecordFingerprint } from '@/utils/assistantRecordFingerprint';
import type { LocalAnnotation } from '@/types/localAnnotations';
import { APP_ROUTE_PATHS, getRouteVisibilityKeyForPath, type AppRouteKey, type AppRoutePath, type NavigationParams } from '@/utils/navigation';
import { parseAssistantExportRequest, prepareAssistantExport, executeAssistantExport, type AssistantExportRequest } from '@/services/lumusAssistant/assistantExportService';

export type AssistantApplicationCommand = (
	| { kind: 'export_report'; request: AssistantExportRequest }
	| { kind: 'read_profile'; detail?: 'email' | 'createdAt' | 'id' | 'accessSummary' | 'linkedCount' }
	| { kind: 'update_profile_name'; name: string; expectedProfileName?: string }
	| { kind: 'list_relationships' }
	| { kind: 'change_relationship'; action: 'link' | 'unlink'; relatedUserId?: string; reference?: string; clientActionId: string; expectedFingerprint?: string; relatedUserName?: string }
	| { kind: 'copy_own_id' }
	| { kind: 'set_auto_read'; enabled: boolean }
	| { kind: 'revoke_assistant_consent' }
	| { kind: 'list_annotations' }
	| { kind: 'read_annotation'; title: string; targetId?: string }
	| { kind: 'create_annotation'; title: string; markdown: string; clientActionId: string }
	| { kind: 'update_annotation'; title: string; markdown?: string; newTitle?: string; targetId?: string; expectedFingerprint?: string; clientActionId: string }
	| { kind: 'read_preferences' }
	| { kind: 'read_route_visibility' }
	| { kind: 'read_post_submit'; key?: PostSubmitScreenKey; mode?: PostSubmitBehaviorMode }
	| { kind: 'set_theme'; mode: 'light' | 'dark' }
	| { kind: 'set_value_visibility'; hidden: boolean }
	| { kind: 'set_trusted_cache'; enabled: boolean }
	| { kind: 'set_route_visibility'; key: RouteVisibilityKey; visible: boolean }
	| { kind: 'set_post_submit'; key: PostSubmitScreenKey; mode: PostSubmitBehaviorMode; patch: Partial<PostSubmitBehavior> }
	| { kind: 'navigate'; route: AppRouteKey; params?: NavigationParams }
	| { kind: 'logout' }
) & { requiresConfirmation: boolean };

export type AssistantApplicationAdapters = {
	isCurrentSession?(): boolean;
	themeMode: 'light' | 'dark';
	shouldHideValues: boolean;
	getShouldHideValues?(): boolean;
	trustedDeviceCache: boolean;
	setThemeMode: (mode: 'light' | 'dark') => void | Promise<void>;
	setShouldHideValues: (hidden: boolean) => void | Promise<void>;
	setTrustedDeviceCache: (enabled: boolean) => Promise<void>;
	isRouteVisible: (key: RouteVisibilityKey) => boolean;
	setRouteVisibility: (key: RouteVisibilityKey, visible: boolean) => void | Promise<void>;
	getBehaviorForScreen: (key: PostSubmitScreenKey, mode?: PostSubmitBehaviorMode) => PostSubmitBehavior;
	updateBehaviorForScreen: (key: PostSubmitScreenKey, mode: PostSubmitBehaviorMode, patch: Partial<PostSubmitBehavior>) => void | Promise<void>;
	navigate?: (pathname: AppRoutePath, params?: NavigationParams) => void | Promise<void>;
	logout?: (uid: string) => Promise<void>;
	copyOwnUserId?: (uid: string) => Promise<void>;
	setAutoReadEnabled?: (enabled: boolean) => void | Promise<void>;
	revokeAssistantConsent?: () => Promise<void>;
};

export type AssistantApplicationResult = {
	success: boolean;
	message: string;
	changed?: 'profile' | 'relationships' | 'annotations' | 'preferences';
	choiceField?: 'bank' | 'category';
	choices?: Array<{ value: string; label: string }>;
};

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

const routeNames: Array<{ key: RouteVisibilityKey; names: string[] }> = [
	{ key: 'addRegisterExpenses', names: ['despesa', 'despesas', 'registro de despesas'] },
	{ key: 'addRegisterGain', names: ['ganho', 'ganhos', 'receita', 'receitas', 'registro de ganhos'] },
	{ key: 'addMandatoryExpenses', names: ['despesas fixas', 'gastos obrigatorios', 'despesas obrigatorias'] },
	{ key: 'addMandatoryGains', names: ['receitas fixas', 'ganhos obrigatorios', 'receitas obrigatorias'] },
	{ key: 'addFinance', names: ['investimento', 'investimentos', 'carteira'] },
	{ key: 'addRescue', names: ['saque', 'saques', 'saque em dinheiro'] },
	{ key: 'transferScreen', names: ['transferencia', 'transferencias'] },
	{ key: 'registerMonthlyBalance', names: ['saldo mensal', 'saldo de abertura'] },
	{ key: 'addRegisterBank', names: ['banco', 'bancos', 'novo banco'] },
	{ key: 'addRegisterTag', names: ['categoria', 'categorias', 'nova categoria'] },
	{ key: 'addUserRelation', names: ['vinculo', 'vinculos', 'relacionar usuario', 'vinculos de usuario'] },
	{ key: 'lumusAssistant', names: ['lumus ia', 'assistente', 'assistente lumus'] },
	{ key: 'annotations', names: ['anotacoes', 'anotacao'] },
];

const resolveRouteName = (text: string) => {
	const name = normalize(text).replace(/^(?:a |o |uma |um )/, '');
	return routeNames.find(route => route.names.includes(name))?.key;
};

const destinations: Record<string, PostSubmitDestinationKey> = {
	home: 'homeDashboard', inicio: 'homeDashboard', dashboard: 'homeDashboard',
	controle: 'homeControl', configuracoes: 'homeConfigurations', 'analise por categoria': 'categoryAnalysis',
	despesas: 'addRegisterExpenses', ganhos: 'addRegisterGain', 'saldo mensal': 'registerMonthlyBalance',
	transferencias: 'transferScreen', saque: 'addRescue', 'despesas fixas': 'mandatoryExpenses',
	'receitas fixas': 'mandatoryGains', investimentos: 'financialList', bancos: 'addRegisterBank',
	categorias: 'addRegisterTag', vinculos: 'addUserRelation',
};

const navigationNames: Record<string, { route: AppRouteKey; params?: NavigationParams }> = {
	inicio: { route: 'home', params: { tab: '0' } }, home: { route: 'home', params: { tab: '0' } }, dashboard: { route: 'home', params: { tab: '0' } },
	controle: { route: 'home', params: { tab: '1' } }, configuracoes: { route: 'home', params: { tab: '2' } },
	perfil: { route: 'profile' }, 'meu perfil': { route: 'profile' },
	'extrato': { route: 'bankMovements' }, 'movimentos do banco': { route: 'bankMovements' },
	'analise por categoria': { route: 'categoryAnalysis' }, 'previsao financeira': { route: 'financialForecast' }, 'previsao de fluxo de caixa': { route: 'financialForecast' },
	'configuracoes das telas': { route: 'screenSettings' }, 'configuracao das telas': { route: 'screenSettings' },
	'ajuste de saldo': { route: 'bankBalanceAdjustment' }, 'ajustar saldo': { route: 'bankBalanceAdjustment' },
	investimentos: { route: 'financialList' }, carteira: { route: 'financialList' }, 'novo investimento': { route: 'addFinance' },
	'despesas fixas': { route: 'mandatoryExpenses' }, 'nova despesa fixa': { route: 'addMandatoryExpenses' },
	'receitas fixas': { route: 'mandatoryGains' }, 'nova receita fixa': { route: 'addMandatoryGains' },
	despesas: { route: 'addRegisterExpenses' }, receitas: { route: 'addRegisterGain' }, ganhos: { route: 'addRegisterGain' },
	bancos: { route: 'addRegisterBank' }, 'novo banco': { route: 'addRegisterBank' }, categorias: { route: 'addRegisterTag' }, 'nova categoria': { route: 'addRegisterTag' },
	'saldo mensal': { route: 'registerMonthlyBalance' }, 'saldo de abertura': { route: 'registerMonthlyBalance' },
	transferencias: { route: 'transferScreen' }, saque: { route: 'addRescue' }, vinculos: { route: 'addUserRelation' },
	anotacoes: { route: 'annotations' }, 'lumus ia': { route: 'lumusAssistant' }, assistente: { route: 'lumusAssistant' },
};

export function parseAssistantApplicationCommand(text: string): AssistantApplicationCommand | null {
	const exportRequest = parseAssistantExportRequest(text);
	if (exportRequest) return { kind: 'export_report', request: exportRequest, requiresConfirmation: false };
	const normalized = normalize(text).replace(/[?!\.]+$/, '');
	if (/^(?:qual (?:e )?(?:o )?meu|mostre (?:o )?meu|consulte (?:o )?meu) (?:email|e-mail)(?: de acesso| de login)?$/.test(normalized)) return { kind: 'read_profile', detail: 'email', requiresConfirmation: false };
	if (/^(?:qual (?:e )?(?:o )?meu|mostre (?:o )?meu) (?:id|identificador)$/.test(normalized)) return { kind: 'read_profile', detail: 'id', requiresConfirmation: false };
	if (/^(?:quando (?:eu )?(?:criei (?:a )?minha conta|me cadastrei)|(?:mostre|consulte) (?:a )?(?:minha )?data de cadastro)$/.test(normalized)) return { kind: 'read_profile', detail: 'createdAt', requiresConfirmation: false };
	if (/^quantas contas (?:estao )?vinculadas$/.test(normalized)) return { kind: 'read_profile', detail: 'linkedCount', requiresConfirmation: false };
	if (/^(?:quantos cadastros (?:eu )?(?:monitoro|acompanho|tenho)|(?:mostre|consulte) (?:o )?(?:meu )?resumo de acesso)$/.test(normalized)) return { kind: 'read_profile', detail: 'accessSummary', requiresConfirmation: false };
	if (/^(?:saia da conta|sair da conta|encerre minha sessao|faca logout)$/.test(normalized)) return { kind: 'logout', requiresConfirmation: false };
	if (/^(?:copie|copiar) (?:o )?meu (?:id|identificador)$/.test(normalized)) return { kind: 'copy_own_id', requiresConfirmation: false };
	if (/^(?:ative|desative) (?:a )?leitura automatica(?: das respostas)?$/.test(normalized)) return { kind: 'set_auto_read', enabled: normalized.startsWith('ative'), requiresConfirmation: false };
	if (/^(?:revogue|remova|cancele) (?:o )?(?:consentimento|acesso) (?:da ia|do lumus ia|do assistente)$/.test(normalized)) return { kind: 'revoke_assistant_consent', requiresConfirmation: false };
	const navigation = /^(?:abra|abrir|va para|ir para) (?:a |o )?(?:tela (?:de |do |da )?)?(.+)$/.exec(normalized);
	if (navigation && navigationNames[navigation[1]]) return { kind: 'navigate', ...navigationNames[navigation[1]], requiresConfirmation: false };
	if (/^(?:(?:quais sao|quais|mostre|liste|consulte) )?(?:as )?telas (?:(?:estao|sao) )?(?:visiveis|ocultas|disponiveis)$/.test(normalized)) return { kind: 'read_route_visibility', requiresConfirmation: false };
	if (/^(?:mostre|consulte|quais sao) (?:as )?preferencias (?:de retorno|apos salvar|apos registro)$/.test(normalized)) return { kind: 'read_post_submit', requiresConfirmation: false };
	const readReturn = /^(?:como (?:esta|ficou)|mostre|consulte) (?:o )?(?:retorno|comportamento) (?:depois de|ao) (cadastrar|registrar|criar|editar) (.+)$/.exec(normalized);
	if (readReturn) {
		const key = resolveRouteName(readReturn[2]);
		if (key && key !== 'annotations' && key !== 'lumusAssistant') return { kind: 'read_post_submit', key, mode: readReturn[1] === 'editar' ? 'edit' : 'create', requiresConfirmation: false };
	}
	if (/^(?:mostre|consulte|quais sao) (?:as )?minhas preferencias$/.test(normalized)) return { kind: 'read_preferences', requiresConfirmation: false };
	if (/^(?:ative|use|aplique|mude para) (?:o )?(?:tema|modo) (?:escuro|claro)$/.test(normalized)) return {
		kind: 'set_theme', mode: normalized.endsWith('escuro') ? 'dark' : 'light', requiresConfirmation: false,
	};
	if (/^(?:oculte|esconda|mostre|exiba) (?:os )?valores(?: financeiros)?$/.test(normalized)) return {
		kind: 'set_value_visibility', hidden: /^(oculte|esconda)/.test(normalized), requiresConfirmation: false,
	};
	if (/^(?:confie neste dispositivo|ative o cache financeiro|nao confie neste dispositivo|desative o cache financeiro)$/.test(normalized)) return {
		kind: 'set_trusted_cache', enabled: /^(confie|ative)/.test(normalized), requiresConfirmation: /^(confie|ative)/.test(normalized),
	};
	const visibility = /^(mostre|exiba|oculte|esconda) (?:a )?tela (?:de |do |da |dos |das )?(.+)$/.exec(normalized);
	if (visibility) {
		const key = resolveRouteName(visibility[2]);
		if (key) return { kind: 'set_route_visibility', key, visible: /^(mostre|exiba)$/.test(visibility[1]), requiresConfirmation: key === 'lumusAssistant' && /^(oculte|esconda)$/.test(visibility[1]) };
	}
	const returnAfter = /^(?:depois de|ao) (cadastrar|registrar|criar|editar) (.+?) (?:volte|retorne|voltar|retornar) para (?:a |o )?(.+)$/.exec(normalized);
	const stayAfter = /^(?:depois de|ao) (cadastrar|registrar|criar|editar) (.+?) (?:permaneca|fique) (?:na tela|no formulario)(?: (?:e )?(limpe|nao limpe|sem limpar|mantenha)(?: os campos)?)?$/.exec(normalized);
	const behavior = returnAfter ?? stayAfter;
	if (behavior) {
		const key = resolveRouteName(behavior[2]);
		const destination = returnAfter ? destinations[returnAfter[3]] : undefined;
		if (key && key !== 'annotations' && key !== 'lumusAssistant' && (!returnAfter || destination)) return {
			kind: 'set_post_submit', key, mode: behavior[1] === 'editar' ? 'edit' : 'create', requiresConfirmation: false,
			patch: returnAfter ? { shouldReturnAfterSubmit: true, returnDestination: destination!, shouldClearFieldsAfterSubmit: false }
				: { shouldReturnAfterSubmit: false, shouldClearFieldsAfterSubmit: behavior[1] !== 'editar' && (!stayAfter?.[3] || stayAfter[3] === 'limpe') },
		};
	}
	if (/^(?:(?:qual e|mostre|consulte|ver) )?(?:meu perfil|meus dados de perfil)$/.test(normalized)) {
		return { kind: 'read_profile', requiresConfirmation: false };
	}
	const name = /^(?:mude|altere|troque|atualize) meu nome para\s+([^;\n]+)$/i.exec(text.trim());
	if (name) return { kind: 'update_profile_name', name: name[1].trim(), requiresConfirmation: true };
	if (/^(?:(?:quais sao|mostre|liste|consulte) )?(?:minhas contas vinculadas|meus usuarios relacionados|meus vinculos)$/.test(normalized)) {
		return { kind: 'list_relationships', requiresConfirmation: false };
	}
	const relationship = /^(vincule|relacione|desvincule|remova o v[ií]nculo)\s+([\s\S]+)$/i.exec(text.trim());
	if (relationship) {
		const action = /^(vincule|relacione)$/i.test(relationship[1]) ? 'link' : 'unlink';
		const reference = relationship[2].replace(/^(?:com |(?:o |a )?(?:usu[aá]rio|conta)\s+(?:com\s+)?(?:o\s+)?)/i, '').trim();
		const explicitId = /^(?:ID|UID|identificador)\s+([\w-]+)$/i.exec(reference);
		if (explicitId || (action === 'link' && /^[\w-]+$/.test(reference))) return { kind: 'change_relationship', action, relatedUserId: explicitId?.[1] ?? reference, clientActionId: createAssistantId('relationship'), requiresConfirmation: true };
		if (action === 'unlink' && reference && !/[;\n]/.test(reference)) return { kind: 'change_relationship', action, reference, clientActionId: createAssistantId('relationship'), requiresConfirmation: true };
	}
	if (/^(?:(?:quais sao|mostre|liste|consulte) )?(?:minhas anotacoes|anotacoes)$/.test(normalized)) {
		return { kind: 'list_annotations', requiresConfirmation: false };
	}
	const noteRead = /^(?:leia|mostre|consulte|abra) (?:a )?anota[çc][aã]o\s+(.+)$/i.exec(text.trim());
	if (noteRead) return { kind: 'read_annotation', title: noteRead[1].trim(), requiresConfirmation: false };
	const noteCreate = /^(?:crie|registre|salve) (?:uma )?anota[çc][aã]o (?:chamada )?(.+?)(?::|\s+com (?:o )?(?:texto|conte[uú]do))\s*([\s\S]+)$/i.exec(text.trim());
	if (noteCreate) return {
		kind: 'create_annotation', title: noteCreate[1].trim(), markdown: noteCreate[2].trim(),
		clientActionId: createAssistantId('annotation'), requiresConfirmation: false,
	};
	const noteUpdate = /^(?:altere|atualize|corrija) (?:a )?anota[çc][aã]o\s+(.+?)(?::|\s+para)\s*([\s\S]+)$/i.exec(text.trim());
	if (noteUpdate) return {
		kind: 'update_annotation', title: noteUpdate[1].trim(), markdown: noteUpdate[2].trim(),
		clientActionId: createAssistantId('annotation_edit'), requiresConfirmation: true,
	};
	const noteRename = /^renomeie (?:a )?anota[çc][aã]o\s+(.+?)\s+para\s+([^;\n]+)$/i.exec(text.trim());
	if (noteRename) return { kind: 'update_annotation', title: noteRename[1].trim(), newTitle: noteRename[2].trim(), clientActionId: createAssistantId('annotation_edit'), requiresConfirmation: true };
	return null;
}

export type AssistantApplicationBatch = {
	uid: string;
	requestId: string;
	items: Array<{ id: string; command: AssistantApplicationCommand }>;
	signature: string;
	requiresConfirmation: boolean;
};

export type AssistantApplicationBatchProgress = { total: number; completed: number; failed: number; pending: number; active?: string };
export type AssistantApplicationBatchResult = AssistantApplicationBatchProgress & {
	cancelled: boolean;
	message: string;
	results: Array<{ id: string; status: 'pending' | 'succeeded' | 'failed'; result?: AssistantApplicationResult }>;
};

export function parseAssistantApplicationBatch(text: string): AssistantApplicationCommand[] | null {
	const clauses = text.split(/[;\n]+/).map(clause => clause.trim()).filter(Boolean);
	if (clauses.length < 2) return null;
	const commands = clauses.map(parseAssistantApplicationCommand);
	return commands.every((command): command is AssistantApplicationCommand => command !== null) ? commands : null;
}

export function resolveAssistantApplicationChoice(command: AssistantApplicationCommand, result: AssistantApplicationResult, answer: string): AssistantApplicationCommand | null {
	if (command.kind !== 'read_annotation' && command.kind !== 'update_annotation' && command.kind !== 'change_relationship' && command.kind !== 'export_report') return null;
	const choices = result.choices ?? [];
	const value = normalize(answer).replace(/^(?:use |escolha )/, '').replace(/^(?:a |o )/, '').replace(/[.!]+$/, '');
	const ordinals: Record<string, number> = { primeira: 1, primeiro: 1, segunda: 2, segundo: 2, terceira: 3, terceiro: 3, quarta: 4, quarto: 4, quinta: 5, quinto: 5, sexta: 6, sexto: 6, setima: 7, setimo: 7, oitava: 8, oitavo: 8, nona: 9, nono: 9, decima: 10, decimo: 10 };
	const number = ordinals[value] ?? (/^\d+$/.test(value) ? Number(value) : undefined);
	const matching = number === undefined ? choices.filter(choice => normalize(choice.label) === value || normalize(choice.label).includes(value)) : choices[number - 1] ? [choices[number - 1]] : [];
	if (matching.length !== 1) return null;
	if (command.kind === 'export_report') return { ...command, request: { ...command.request, ...(result.choiceField === 'category' || command.request.target === 'category_analysis' ? { categoryId: matching[0].value } : { bankId: matching[0].value }) } };
	return command.kind === 'change_relationship' ? { ...command, relatedUserId: matching[0].value, reference: undefined } : { ...command, targetId: matching[0].value };
}

export function summarizeAssistantApplicationCommand(command: AssistantApplicationCommand, adapters?: AssistantApplicationAdapters): string {
	let label: string;
	switch (command.kind) {
		case 'export_report': label = command.request.target === 'category_analysis' ? `Exportar análise da categoria ${command.request.categoryLabel || command.request.categoryName || 'informada'} em PDF` : command.request.target === 'mandatory_expenses' || command.request.target === 'mandatory_gains' ? `Exportar ${command.request.target === 'mandatory_expenses' ? 'despesas' : 'receitas'} fixas em PDF` : `Exportar o extrato de ${command.request.bankLabel || command.request.bankName || 'um banco'} em PDF`; break;
		case 'update_profile_name': label = `Alterar seu nome de ${command.expectedProfileName || 'não informado'} para ${command.name}`; break;
		case 'change_relationship': label = `${command.action === 'link' ? 'Vincular' : 'Desvincular'} ${command.relatedUserName || 'a conta informada'}; ${command.action === 'link' ? 'compartilhar' : 'remover o compartilhamento de'} dados autorizados entre as contas`; break;
		case 'create_annotation': label = `Criar a anotação ${command.title} neste aparelho`; break;
		case 'update_annotation': label = command.newTitle ? `Renomear a anotação ${command.title} para ${command.newTitle} neste aparelho` : `Substituir o conteúdo da anotação ${command.title} neste aparelho`; break;
		case 'read_annotation': label = `Ler a anotação ${command.title}`; break;
		case 'set_theme': label = `Aplicar tema ${command.mode === 'dark' ? 'escuro' : 'claro'}`; break;
		case 'set_value_visibility': label = `${command.hidden ? 'Ocultar' : 'Exibir'} valores financeiros`; break;
		case 'set_trusted_cache': label = command.enabled ? 'Autorizar a persistência do cache financeiro neste aparelho' : 'Remover o cache financeiro persistido deste aparelho'; break;
		case 'set_route_visibility': label = `${command.visible ? 'Mostrar' : 'Ocultar'} a tela ${routeNames.find(route => route.key === command.key)?.names[0] || 'informada'}`; break;
		case 'set_post_submit': label = `Alterar o comportamento depois de ${command.mode === 'edit' ? 'editar' : 'cadastrar'} ${routeNames.find(route => route.key === command.key)?.names[0] || 'o formulário'}`; break;
		case 'navigate': label = `Abrir ${Object.entries(navigationNames).find(([, target]) => target.route === command.route)?.[0] || 'a tela solicitada'}`; break;
		case 'logout': label = 'Encerrar a sessão depois da limpeza segura dos lembretes'; break;
		case 'copy_own_id': label = 'Copiar seu identificador para a área de transferência'; break;
		case 'set_auto_read': label = `${command.enabled ? 'Ativar' : 'Desativar'} leitura automática das respostas`; break;
		case 'revoke_assistant_consent': label = 'Revogar consentimento e limpar a sessão do Lumus IA'; break;
		case 'read_profile': label = 'Consultar seu perfil'; break;
		case 'list_relationships': label = 'Consultar contas vinculadas'; break;
		case 'list_annotations': label = 'Consultar anotações neste aparelho'; break;
		case 'read_route_visibility': label = 'Consultar visibilidade das telas'; break;
		case 'read_post_submit': label = 'Consultar preferências após salvar'; break;
		case 'read_preferences': label = 'Consultar preferências deste aparelho'; break;
	}
	return adapters?.shouldHideValues ? maskFinancialValuesInText(label) : label;
}

export function summarizeAssistantApplicationBatch(batch: AssistantApplicationBatch, adapters?: AssistantApplicationAdapters, includeAll = false): string {
	const shown = includeAll ? batch.items : batch.items.slice(0, 8);
	return `${batch.items.length} operações no seu perfil ou neste aparelho:\n${shown.map((item, index) => `${index + 1}. ${summarizeAssistantApplicationCommand(item.command, adapters)}`).join('\n')}${shown.length < batch.items.length ? `\nMais ${batch.items.length - shown.length} operações. Peça os detalhes pelo chat.` : ''}`;
}

const applicationBatchSignature = (batch: Pick<AssistantApplicationBatch, 'uid' | 'requestId' | 'items'>) =>
	createAssistantRecordFingerprint({ uid: batch.uid, requestId: batch.requestId, items: batch.items });

function applicationMutationTarget(command: AssistantApplicationCommand): string | undefined {
	switch (command.kind) {
		case 'update_profile_name': return 'profile';
		case 'update_annotation': return `annotation:${command.targetId}`;
		case 'change_relationship': return `relationship:${command.relatedUserId}`;
		case 'set_route_visibility': return `visibility:${command.key}`;
		case 'set_post_submit': return `post-submit:${command.key}:${command.mode}`;
		case 'set_theme': case 'set_value_visibility': case 'set_trusted_cache': return command.kind;
		default: return undefined;
	}
}

export async function prepareAssistantApplicationBatch(
	uid: string,
	commands: AssistantApplicationCommand[],
	adapters?: AssistantApplicationAdapters,
): Promise<{ batch?: AssistantApplicationBatch; result?: AssistantApplicationResult; pendingIndex?: number }> {
	requireCurrentAccount(uid);
	if (!commands.length) return { result: { success: false, message: 'Informe as operações do lote.' } };
	const items: AssistantApplicationBatch['items'] = [];
	const targets = new Set<string>();
	for (let index = 0; index < commands.length; index += 1) {
		const prepared = await prepareAssistantApplicationCommand(uid, commands[index], adapters);
		if (!prepared.command) return { result: prepared.result, pendingIndex: index };
		const command = prepared.command;
		const target = applicationMutationTarget(command);
		if (target && targets.has(target)) return { result: { success: false, message: 'O lote altera o mesmo alvo mais de uma vez. Informe uma única alteração final para esse alvo antes de confirmar.' } };
		if (target) targets.add(target);
		const leavesConversation = command.kind === 'navigate' || command.kind === 'logout' || command.kind === 'revoke_assistant_consent' || (command.kind === 'set_route_visibility' && command.key === 'lumusAssistant' && !command.visible);
		if (leavesConversation && index < commands.length - 1) return { result: { success: false, message: 'Coloque abrir outra tela, ocultar o Lumus IA ou sair da conta no final do pedido, depois das outras operações.' } };
		items.push({ id: createAssistantId('application_item'), command });
	}
	const batch = { uid, requestId: createAssistantId('application_batch'), items, requiresConfirmation: items.some(item => item.command.requiresConfirmation) };
	return { batch: { ...batch, signature: applicationBatchSignature(batch) } };
}

type ApplicationBatchCheckpoint = {
	signature: string;
	results: AssistantApplicationBatchResult['results'];
	running?: Promise<AssistantApplicationBatchResult>;
};
const applicationBatchCheckpoints = new Map<string, ApplicationBatchCheckpoint>();
const applicationBatchKey = (uid: string, requestId: string) => `${uid}\u0000${requestId}`;

export function clearAssistantApplicationBatchCheckpoints(uid: string) {
	for (const key of applicationBatchCheckpoints.keys()) if (key.startsWith(`${uid}\u0000`)) applicationBatchCheckpoints.delete(key);
	relationshipChoices.delete(uid);
}

export function executeAssistantApplicationBatch(
	uid: string,
	batch: AssistantApplicationBatch,
	adapters?: AssistantApplicationAdapters,
	options: { authorizedSignature?: string; isCancelled?: () => boolean; onProgress?: (progress: AssistantApplicationBatchProgress) => void } = {},
): Promise<AssistantApplicationBatchResult> {
	try {
		requireCurrentAccount(uid);
		if (batch.uid !== uid) throw new Error('A conta mudou. Envie o pedido novamente na conta atual.');
		if (batch.signature !== applicationBatchSignature(batch)) throw new Error('O lote mudou. Confira as operações e confirme a versão atual.');
		if (batch.items.some(item => item.command.requiresConfirmation) && options.authorizedSignature !== batch.signature) throw new Error('Confirme o resumo atual do lote na conversa antes de executar.');
		const key = applicationBatchKey(uid, batch.requestId);
		let checkpoint = applicationBatchCheckpoints.get(key);
		if (checkpoint && checkpoint.signature !== batch.signature) throw new Error('Este pedido de lote mudou. Prepare uma nova versão e confirme novamente.');
		if (checkpoint?.running) return checkpoint.running;
		if (!checkpoint) {
			checkpoint = { signature: batch.signature, results: batch.items.map(item => ({ id: item.id, status: 'pending' })) };
			applicationBatchCheckpoints.set(key, checkpoint);
		}
		const current = checkpoint;
		const executionItems = JSON.parse(JSON.stringify(batch.items)) as AssistantApplicationBatch['items'];
		const progress = (): AssistantApplicationBatchProgress => ({
			total: batch.items.length, completed: current.results.filter(item => item.status === 'succeeded').length,
			failed: current.results.filter(item => item.status === 'failed').length, pending: current.results.filter(item => item.status === 'pending').length,
		});
		const running = (async () => {
			let cancelled = false;
			for (let index = 0; index < executionItems.length; index += 1) {
				if (current.results[index].status === 'succeeded') continue;
				if (options.isCancelled?.() || applicationBatchCheckpoints.get(key) !== current || auth.currentUser?.uid !== uid) { cancelled = true; break; }
				const item = executionItems[index];
				options.onProgress?.({ ...progress(), active: item.id });
				try {
					const result = await executeAssistantApplicationCommand(uid, item.command, adapters);
					current.results[index] = { id: item.id, status: result.success ? 'succeeded' : 'failed', result };
				} catch (error) {
					const message = error instanceof Error && /(?:A conta mudou|mudou\. Confira|confirme novamente|antes de salvar)/.test(error.message)
						? error.message : 'Não foi possível concluir esta operação. Tente novamente; as operações concluídas serão preservadas.';
					current.results[index] = { id: item.id, status: 'failed', result: { success: false, message } };
				}
				options.onProgress?.(progress());
			}
			const counts = progress();
			return { ...counts, cancelled, results: current.results.map(item => ({ ...item })), message: `${counts.completed} de ${counts.total} operações concluídas; ${counts.failed} falhas; ${counts.pending} pendentes.${cancelled ? ' Cancelamento interrompeu o início de novas operações; as concluídas foram preservadas.' : ''}` };
		})();
		current.running = running;
		void running.finally(() => { if (current.running === running) current.running = undefined; }).catch(() => undefined);
		return running;
	} catch (error) { return Promise.reject(error); }
}

function requireCurrentAccount(uid: string) {
	if (!uid || auth.currentUser?.uid !== uid) throw new Error('A conta mudou. Envie o pedido novamente na conta atual.');
}

const relationshipChoices = new Map<string, Array<{ value: string; label: string }>>();
function requireApplicationScope(uid: string, adapters?: AssistantApplicationAdapters) {
	requireCurrentAccount(uid);
	if (adapters?.isCurrentSession?.() === false) throw new Error('A sessão do assistente foi encerrada. Nenhuma nova operação foi iniciada.');
}

const relatedChoices = (users: unknown): Array<{ value: string; label: string }> => Array.isArray(users) ? users.flatMap(user => {
	if (!user || typeof user !== 'object') return [];
	const record = user as Record<string, unknown>;
	const value = typeof record.id === 'string' ? record.id : typeof record.uid === 'string' ? record.uid : '';
	return value ? [{ value, label: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'Conta sem nome' }] : [];
}) : [];

function matchingAnnotations(notes: LocalAnnotation[], title: string) {
	const value = normalize(title);
	const ordinal = /^(?:a |o )?(primeira|primeiro|segunda|segundo|terceira|terceiro|quarta|quarto|quinta|quinto|\d+)$/.exec(value);
	if (ordinal) {
		const numbers: Record<string, number> = { primeira: 1, primeiro: 1, segunda: 2, segundo: 2, terceira: 3, terceiro: 3, quarta: 4, quarto: 4, quinta: 5, quinto: 5 };
		const index = (numbers[ordinal[1]] ?? Number(ordinal[1])) - 1;
		return notes[index] ? [notes[index]] : [];
	}
	const exact = notes.filter(note => normalize(getLocalAnnotationTitle(note)) === value);
	return exact.length ? exact : notes.filter(note => normalize(getLocalAnnotationTitle(note)).includes(value));
}

export async function prepareAssistantApplicationCommand(
	uid: string,
	command: AssistantApplicationCommand,
	adapters?: AssistantApplicationAdapters,
): Promise<{ command?: AssistantApplicationCommand; result?: AssistantApplicationResult }> {
	requireApplicationScope(uid, adapters);
	if (command.kind === 'export_report') {
		if (!adapters) return { result: { success: false, message: 'As preferências de privacidade ainda não estão disponíveis.' } };
		const prepared = await prepareAssistantExport(uid, command.request, adapters);
		return prepared.request ? { command: { ...command, request: prepared.request } } : { result: prepared.result };
	}
	if (command.kind === 'update_profile_name') {
		const profile = await getUserProfileFirebase(uid);
		requireApplicationScope(uid, adapters);
		return { command: { ...command, expectedProfileName: profile.name } };
	}
	if (command.kind === 'change_relationship') {
		if (!adapters?.isRouteVisible('addUserRelation')) return { result: { success: false, message: 'A tela de vínculos está oculta neste aparelho. Peça para mostrá-la antes de alterar um vínculo.' } };
		let relatedUserId = command.relatedUserId;
		if (!relatedUserId && command.action === 'unlink') {
			const listed = await getRelatedUsersFirebase(uid);
			requireApplicationScope(uid, adapters);
			if (!listed.success) return { result: { success: false, message: 'Não foi possível consultar os vínculos. Tente novamente.' } };
			const currentChoices = relatedChoices(listed.data);
			const choices = relationshipChoices.get(uid) ?? currentChoices;
			const value = normalize(command.reference ?? '');
			const ordinal: Record<string, number> = { primeira: 1, primeiro: 1, segunda: 2, segundo: 2, terceira: 3, terceiro: 3, quarta: 4, quarto: 4, quinta: 5, quinto: 5 };
			const index = ordinal[value.replace(/^(?:a |o )/, '')] ?? (/^\d+$/.test(value) ? Number(value) : undefined);
			const matching = index !== undefined && relationshipChoices.has(uid) ? choices[index - 1] ? [choices[index - 1]] : [] : currentChoices.filter(choice => value && normalize(choice.label).includes(value));
			const stillLinked = matching.filter(choice => currentChoices.some(current => current.value === choice.value));
			if (stillLinked.length !== 1) {
				const visibleChoices = stillLinked.map(choice => ({ ...choice, label: adapters.shouldHideValues ? maskFinancialValuesInText(choice.label) : choice.label }));
				return { result: { success: false, message: visibleChoices.length ? `Qual conta deseja desvincular? ${visibleChoices.map((choice, index) => `${index + 1}. ${choice.label}`).join('; ')}.` : 'Não encontrei um vínculo inequívoco com esse nome ou posição. Liste suas contas vinculadas antes de usar uma posição.', choices: visibleChoices } };
			}
			relatedUserId = stillLinked[0].value;
		}
		if (!relatedUserId) return { result: { success: false, message: 'Informe explicitamente o ID da conta para criar o vínculo.' } };
		const preview = await runUserRelationshipFirebase(uid, { action: 'preview', relatedUserId });
		requireApplicationScope(uid, adapters);
		return { command: { ...command, relatedUserId, expectedFingerprint: preview.fingerprint, relatedUserName: preview.relatedUserName } };
	}
	if (command.kind === 'update_annotation' || command.kind === 'read_annotation') {
		if (!adapters?.isRouteVisible('annotations')) return { result: { success: false, message: 'Anotações está oculta neste aparelho. Peça para mostrar a tela de anotações antes de editá-la.' } };
		const notes = await loadLocalAnnotations(uid);
		requireApplicationScope(uid, adapters);
		const matching = command.targetId ? notes.filter(note => note.id === command.targetId) : matchingAnnotations(notes, command.title);
		const visible = (value: string) => adapters.shouldHideValues ? maskFinancialValuesInText(value) : value;
		if (matching.length !== 1) return { result: {
			success: false,
			message: matching.length ? `Há mais de uma anotação correspondente. Responda pelo nome ou posição: ${matching.map((note, index) => `${index + 1}. ${visible(getLocalAnnotationTitle(note))}`).join('; ')}.` : 'Não encontrei a anotação neste aparelho.',
			choices: matching.map(note => ({ value: note.id, label: visible(getLocalAnnotationTitle(note)) })),
		} };
		return { command: command.kind === 'read_annotation'
			? { ...command, title: getLocalAnnotationTitle(matching[0]), targetId: matching[0].id }
			: { ...command, title: getLocalAnnotationTitle(matching[0]), targetId: matching[0].id, expectedFingerprint: createAssistantRecordFingerprint(matching[0]) } };
	}
	return { command };
}

export function executeAssistantApplicationCommand(
	uid: string,
	command: AssistantApplicationCommand,
	adapters?: AssistantApplicationAdapters,
): Promise<AssistantApplicationResult> {
	const privateResult = (result: AssistantApplicationResult): AssistantApplicationResult => adapters?.shouldHideValues ? {
		...result, message: maskFinancialValuesInText(result.message), choices: result.choices?.map(choice => ({ ...choice, label: maskFinancialValuesInText(choice.label) })),
	} : result;
	return executeApplicationCommand(uid, command, adapters).then(privateResult);
}

async function executeApplicationCommand(
	uid: string,
	command: AssistantApplicationCommand,
	adapters?: AssistantApplicationAdapters,
): Promise<AssistantApplicationResult> {
	requireApplicationScope(uid, adapters);
	switch (command.kind) {
		case 'export_report': return adapters ? executeAssistantExport(uid, command.request, adapters) : { success: false, message: 'As preferências de privacidade ainda não estão disponíveis.' };
		case 'read_profile': {
			if (command.detail === 'linkedCount') {
				const result = await getRelatedUsersFirebase(uid);
				requireApplicationScope(uid, adapters);
				if (!result.success) return { success: false, message: 'Não foi possível consultar os vínculos. Tente novamente.' };
				const count = Array.isArray(result.data) ? result.data.length : 0;
				return { success: true, message: `${count} ${count === 1 ? 'conta vinculada' : 'contas vinculadas'}.` };
			}
			const profile = await getUserProfileFirebase(uid);
			requireApplicationScope(uid, adapters);
			if (command.detail === 'email') return { success: true, message: profile.email ? `Seu email de acesso é ${profile.email}.` : 'A conta atual não informa um email de acesso.' };
			if (command.detail === 'id') return { success: true, message: `Seu identificador é ${uid}. Peça “copie meu ID” para copiá-lo neste aparelho.` };
			if (command.detail === 'createdAt') return { success: true, message: profile.createdAt ? `Seu cadastro foi criado em ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(profile.createdAt)}.` : 'A data de cadastro não foi registrada nesta conta.' };
			if (command.detail === 'accessSummary') {
				const summary = await getUserProfileAccessSummaryFirebase(uid, profile);
				requireApplicationScope(uid, adapters);
				return { success: true, message: summary.isAdmin ? `${summary.monitoredRecordsCount} cadastros monitorados, somando usuários, bancos e categorias que seu acesso permite consultar.` : `${summary.monitoredRecordsCount} contas vinculadas.` };
			}
			return { success: true, message: `Seu perfil: ${profile.name || 'nome não informado'}. Acesso ${profile.adminUser ? 'administrativo' : 'padrão'}.` };
		}
		case 'update_profile_name': {
			if (command.expectedProfileName === undefined) throw new Error('Confira o nome atual e confirme a alteração antes de salvar.');
			const profile = await getUserProfileFirebase(uid);
			requireApplicationScope(uid, adapters);
			if (profile.name === command.name.trim()) return { success: true, changed: 'profile', message: `Seu nome já está atualizado para ${profile.name}.` };
			if (profile.name !== command.expectedProfileName) throw new Error('Seu nome mudou. Confira o perfil e confirme novamente.');
			const name = await updateUserProfileFirebase(uid, command.name, { expectedName: command.expectedProfileName, ...(adapters?.isCurrentSession ? { isCurrent: adapters.isCurrentSession } : {}) });
			requireApplicationScope(uid, adapters);
			return { success: true, changed: 'profile', message: `Seu nome foi atualizado para ${name}.` };
		}
		case 'list_relationships': {
			const result = await getRelatedUsersFirebase(uid);
			requireApplicationScope(uid, adapters);
			if (!result.success) return { success: false, message: 'Não foi possível consultar as contas vinculadas. Tente novamente.' };
			const users = Array.isArray(result.data) ? result.data as Array<Record<string, unknown>> : [];
			const choices = relatedChoices(users);
			relationshipChoices.set(uid, choices);
			return { success: true, message: choices.length ? `Contas vinculadas: ${choices.map((choice, index) => `${index + 1}. ${choice.label}`).join('; ')}.` : 'Você não tem contas vinculadas.' };
		}
		case 'change_relationship': {
			if (!adapters?.isRouteVisible('addUserRelation')) return { success: false, message: 'Vínculos está oculto neste aparelho.' };
			if (!command.expectedFingerprint || !command.relatedUserId) throw new Error('Confira o vínculo e confirme a alteração antes de salvar.');
			const result = await runUserRelationshipFirebase(uid, { ...command, relatedUserId: command.relatedUserId });
			requireApplicationScope(uid, adapters);
			return { success: true, changed: 'relationships', message: command.action === 'link' ? `Vínculo com ${result.relatedUserName} registrado. As contas compartilham os dados autorizados.` : `Vínculo com ${result.relatedUserName} removido.` };
		}
		case 'navigate': {
			if (!adapters?.navigate) return { success: false, message: 'A navegação ainda não está disponível nesta conversa.' };
			const pathname = APP_ROUTE_PATHS[command.route];
			const visibilityKey = getRouteVisibilityKeyForPath(pathname);
			if (command.route === 'login' || (visibilityKey && !adapters.isRouteVisible(visibilityKey))) return { success: false, message: 'Esse destino não está disponível nesta sessão. Uma preferência não concede acesso a uma rota protegida.' };
			await adapters.navigate(pathname, command.params);
			requireApplicationScope(uid, adapters);
			return { success: true, message: 'Tela aberta.' };
		}
		case 'logout': {
			if (!adapters?.logout) return { success: false, message: 'A saída segura ainda não está disponível nesta conversa.' };
			await adapters.logout(uid);
			if (auth.currentUser?.uid === uid) return { success: false, message: 'A sessão continua ativa. Não foi possível concluir a saída segura; tente novamente.' };
			if (auth.currentUser) throw new Error('A conta mudou. Nenhuma sessão nova foi encerrada.');
			clearAssistantApplicationBatchCheckpoints(uid);
			return { success: true, message: 'Sua sessão foi encerrada.' };
		}
		case 'copy_own_id': {
			if (!adapters?.copyOwnUserId) return { success: false, message: 'A área de transferência não está disponível nesta plataforma.' };
			await adapters.copyOwnUserId(uid);
			requireApplicationScope(uid, adapters);
			return { success: true, message: 'Seu identificador foi copiado para a área de transferência.' };
		}
		case 'set_auto_read': {
			if (!adapters?.setAutoReadEnabled) return { success: false, message: 'A preferência de leitura automática ainda não está disponível.' };
			await adapters.setAutoReadEnabled(command.enabled);
			requireApplicationScope(uid, adapters);
			return { success: true, message: `Leitura automática ${command.enabled ? 'ativada' : 'desativada'}.` };
		}
		case 'revoke_assistant_consent': {
			if (!adapters?.revokeAssistantConsent) return { success: false, message: 'A revogação do consentimento ainda não está disponível.' };
			await adapters.revokeAssistantConsent();
			clearAssistantApplicationBatchCheckpoints(uid);
			return { success: true, message: 'Consentimento do Lumus IA revogado.' };
		}
		case 'read_preferences':
		case 'read_route_visibility':
		case 'read_post_submit':
		case 'set_theme':
		case 'set_value_visibility':
		case 'set_trusted_cache':
		case 'set_route_visibility':
		case 'set_post_submit': {
			if (!adapters) return { success: false, message: 'As preferências deste aparelho ainda não estão disponíveis.' };
			if (command.kind === 'read_route_visibility') return { success: true, message: routeNames.map(route => `${route.names[0]}: ${adapters.isRouteVisible(route.key) ? 'visível' : 'oculta'}`).join('\n') };
			if (command.kind === 'read_post_submit') {
				const routes = routeNames.filter((route): route is { key: PostSubmitScreenKey; names: string[] } => route.key !== 'lumusAssistant' && route.key !== 'annotations' && (!command.key || command.key === route.key));
				const modes: PostSubmitBehaviorMode[] = command.mode ? [command.mode] : ['create', 'edit'];
				return { success: true, message: routes.flatMap(route => modes.map(mode => {
					const behavior = adapters.getBehaviorForScreen(route.key, mode);
					return `${mode === 'edit' ? 'Editar' : 'Cadastrar'} ${route.names[0]}: ${behavior.shouldReturnAfterSubmit ? `retornar para ${Object.keys(destinations).find(name => destinations[name] === behavior.returnDestination) || behavior.returnDestination}` : `permanecer na tela${behavior.shouldClearFieldsAfterSubmit && mode === 'create' ? ' e limpar os campos' : ''}`}.`;
				})).join('\n') };
			}
			if (command.kind === 'read_preferences') return {
				success: true, message: `Tema ${adapters.themeMode === 'dark' ? 'escuro' : 'claro'}; valores ${adapters.shouldHideValues ? 'ocultos' : 'visíveis'}; cache financeiro ${adapters.trustedDeviceCache ? 'autorizado neste aparelho' : 'desligado'}.`,
			};
			let message: string;
			if (command.kind === 'set_theme') {
				await adapters.setThemeMode(command.mode);
				message = `Tema ${command.mode === 'dark' ? 'escuro' : 'claro'} aplicado.`;
			} else if (command.kind === 'set_value_visibility') {
				await adapters.setShouldHideValues(command.hidden);
				message = command.hidden ? 'Valores ocultos.' : 'Valores visíveis.';
			} else if (command.kind === 'set_trusted_cache') {
				await adapters.setTrustedDeviceCache(command.enabled);
				message = command.enabled ? 'Cache financeiro autorizado neste aparelho.' : 'Cache financeiro persistido desligado e removido deste aparelho.';
			} else if (command.kind === 'set_route_visibility') {
				await adapters.setRouteVisibility(command.key, command.visible);
				message = command.key === 'annotations' && command.visible ? 'Anotações liberada para teste neste aparelho. O recurso continua em desenvolvimento.'
					: `Tela ${command.visible ? 'visível' : 'oculta'} neste aparelho.`;
			} else {
				const patch = { ...command.patch, ...(command.mode === 'edit' || command.patch.shouldReturnAfterSubmit ? { shouldClearFieldsAfterSubmit: false } : {}) };
				await adapters.updateBehaviorForScreen(command.key, command.mode, patch);
				message = 'Preferência após salvar aplicada ao formulário.';
			}
			requireApplicationScope(uid, adapters);
			return { success: true, changed: 'preferences', message };
		}
		case 'list_annotations':
		case 'read_annotation':
		case 'update_annotation':
		case 'create_annotation': {
			if (!adapters?.isRouteVisible('annotations')) return {
				success: false, message: 'Anotações está oculta neste aparelho. Você pode pedir “mostre a tela de anotações” para liberar o acesso de teste.',
			};
			const notes = await loadLocalAnnotations(uid);
			requireApplicationScope(uid, adapters);
			const visible = (text: string) => adapters.shouldHideValues ? maskFinancialValuesInText(text) : text;
			if (command.kind === 'list_annotations') return {
				success: true, message: notes.length ? notes.map((note, index) => `${index + 1}. ${visible(getLocalAnnotationTitle(note))}`).join('\n') : 'Você não tem anotações salvas neste aparelho.',
			};
			if (command.kind === 'read_annotation') {
				const matching = command.targetId ? notes.filter(note => note.id === command.targetId) : matchingAnnotations(notes, command.title);
				if (matching.length !== 1) return {
					success: false, message: matching.length ? 'Há mais de uma anotação com esse nome. Informe um título que identifique a anotação.' : 'Não encontrei uma anotação com esse título neste aparelho.',
				};
				return { success: true, message: visible(`${getLocalAnnotationTitle(matching[0])}: ${matching[0].markdown}`) };
			}
			if (command.kind === 'update_annotation') {
				const original = notes.find(note => note.id === command.targetId);
				if (!original || !command.expectedFingerprint) throw new Error('Confira a anotação e confirme a alteração antes de salvar.');
				const title = command.newTitle?.trim() ?? original.title;
				const markdown = command.markdown ?? original.markdown;
				if (!title) throw new Error('Informe o novo título da anotação.');
				if (original.title === title && original.markdown === markdown) return { success: true, changed: 'annotations', message: `Anotação ${visible(title)} já está atualizada.` };
				if (createAssistantRecordFingerprint(original) !== command.expectedFingerprint) throw new Error('A anotação mudou. Confira o texto e confirme novamente.');
				await saveLocalAnnotation(uid, { ...original, title, markdown, updatedAtISO: new Date().toISOString() }, command.expectedFingerprint, () => auth.currentUser?.uid === uid && adapters.isCurrentSession?.() !== false);
				requireApplicationScope(uid, adapters);
				return { success: true, changed: 'annotations', message: `Anotação ${visible(title)} ${command.newTitle ? 'renomeada' : 'atualizada'} neste aparelho.` };
			}
			const existing = notes.find(note => note.id === command.clientActionId);
			if (existing && (existing.title !== command.title || existing.markdown !== command.markdown)) throw new Error('Este pedido de anotação já foi usado com outro conteúdo. Envie um novo pedido.');
			if (!existing) {
				const note = { ...createLocalAnnotation(), id: command.clientActionId, title: command.title, markdown: command.markdown };
				await saveLocalAnnotation(uid, note, null, () => auth.currentUser?.uid === uid && adapters.isCurrentSession?.() !== false);
				requireApplicationScope(uid, adapters);
			}
			return { success: true, changed: 'annotations', message: `Anotação ${visible(command.title)} salva neste aparelho.` };
		}
	}
}
