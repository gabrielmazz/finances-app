import type { AssistantActionKind, AssistantAiConversationResponse, AssistantCatalogType, AssistantDraftAction, AssistantModelCatalog, AssistantModelActionProposal, AssistantResolvedCatalog, AssistantReportRequest } from '@/types/lumusAssistant';
import { getFieldDefinition } from '@/utils/lumusAssistantSchemas';
import { formatIsoDate, normalizeAssistantDateInput, parseIsoDateAtLocalNoon, parseMoneyToCents, maskFinancialValuesInText } from '@/utils/lumusAssistant';
import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import { AssistantFriendlyError } from '@/utils/lumusAssistantErrors';

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
const BATCH_ACCOUNT_FIELDS: Partial<Record<AssistantActionKind, 'bankRef' | 'sourceBankRef'>> = {
	create_transfer: 'sourceBankRef',
	create_cash_withdrawal: 'bankRef',
	upsert_monthly_balance: 'bankRef',
	upsert_balance_adjustment: 'bankRef',
};
const BATCH_INVESTMENT_ACTIONS: readonly AssistantActionKind[] = ['deposit_investment', 'redeem_investment', 'sync_investment'];

export function getExplicitAssistantBatchCount(text: string): number | undefined {
	const count = /^(?:pague|quite|receba|exclua|remova|edite|altere|corrija|estorne|sincronize|resgate|aporte|transfira|saque|ajuste)\s+(?:[^;\n]*?\s+(?:em|de|para)\s+)?(?:(?:[oa]s|d[oa]s|tod[oa]s [oa]s)\s+)?(\d+|duas?|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(?:contas|despesas|gastos|receitas|ganhos|categorias|bancos|investimentos|registros|lancamentos)\b/.exec(normalize(text));
	if (!count) return undefined;
	const words: Record<string, number> = {duas:2,dois:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10};
	const number = words[count[1]!] ?? Number(count[1]);
	return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export function expandAssistantBatch(request: NonNullable<AssistantAiConversationResponse['batchRequests']>[number], catalog: AssistantResolvedCatalog, now = new Date()) {
	if (request.kind === 'upsert_balance_adjustment' && request.payload.recordRef !== undefined) throw new AssistantFriendlyError('invalid-request', 'Para corrigir ajustes existentes em lote, dite o ajuste e os dados de cada item. A seleção por banco cria um ajuste novo por conta.');
	const accountField = BATCH_ACCOUNT_FIELDS[request.kind];
	const field = accountField ?? (getFieldDefinition(request.kind, 'recordRef').choiceSource ? 'recordRef' : BATCH_INVESTMENT_ACTIONS.includes(request.kind) ? 'investmentRef' : undefined);
	if (!field) throw new AssistantFriendlyError('invalid-request', 'Essa operação não aceita seleção em lote. Dite os itens com os dados de cada um.');
	const source = getFieldDefinition(request.kind, field).choiceSource;
	if (!source) throw new AssistantFriendlyError('invalid-request', 'Essa operação não aceita seleção em lote. Dite os itens com os dados de cada um.');
	const cycle = request.period ?? formatIsoDate(now).slice(0, 7);
	const query = normalize(request.query ?? '');
	let excluded = 0;
	let readOnly = 0;
	let unavailableHistory = 0;
	const proposals: AssistantModelActionProposal[] = [];
	for (const item of catalog[source] ?? []) {
		if (query && !normalize(item.label).includes(query)) continue;
		if (item.ownerScope === 'related_read_only') { readOnly++; continue; }
		const data = item.data ?? {};
		if (accountField && (item.realId === null || data.kind === 'cash' || data.kind === 'investment' || data.isActive === false || data.archivedAt || request.kind === 'create_transfer' && item.handle === request.payload.targetBankRef)) { excluded++; continue; }
		const settlement = request.kind === 'pay_mandatory_expense' || request.kind === 'receive_mandatory_gain';
		if (settlement) {
			const completed = request.kind === 'pay_mandatory_expense' ? data.lastPaymentCycle : data.lastReceiptCycle;
			const cycles = data.completedCycles && typeof data.completedCycles === 'object' ? data.completedCycles : {};
			if (Object.hasOwn(cycles,cycle)) {excluded++;continue;}
			if (typeof completed === 'string' && cycle < completed && data.assistantCycleHistoryComplete !== true) {unavailableHistory++;continue;}
			if (completed === cycle || typeof data.installmentTotal === 'number' && Number(data.installmentsCompleted ?? 0) >= data.installmentTotal) { excluded++; continue; }
			const reference = parseIsoDateAtLocalNoon(`${cycle}-15`)!;
			const due = resolveMonthlyOccurrence({ referenceDate: reference, dueDay: Number(data.dueDay ?? 1), usesBusinessDays: data.usesBusinessDays === true }).date;
			const dueIso = formatIsoDate(due);
			if (request.overdue && dueIso >= formatIsoDate(now)) { excluded++; continue; }
			const start = data.installmentStartDate;
			const end = data.installmentEndDate;
			const civil = (value: unknown) => value instanceof Date ? formatIsoDate(value) : typeof value === 'string' ? value : value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function' ? formatIsoDate(value.toDate()) : null;
			if (civil(start) && civil(start)!.slice(0, 7) > cycle || civil(end) && civil(end)!.slice(0, 7) < cycle) { excluded++; continue; }
		} else if (request.period && !accountField) {
			const date = data.date ?? data.effectiveAt;
			const instant = date instanceof Date ? date : date && typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function' ? date.toDate() : null;
			if (!instant || formatIsoDate(instant).slice(0, 7) !== cycle) { excluded++; continue; }
		}
		// Um ciclo anterior não autoriza lançar o pagamento na data de hoje.
		proposals.push({ kind: request.kind, payload: { ...request.payload, [field]: item.handle, ...(settlement && !request.payload.date && cycle === formatIsoDate(now).slice(0, 7) ? { date: formatIsoDate(now) } : {}) } });
	}
	return { proposals, excluded, readOnly, unavailableHistory, scope: `${query || 'todos'}${request.period ? ` · ${cycle}` : ''}${request.overdue ? ' · vencidos' : ''}` };
}

/** Consultas inequívocas dispensam rede/modelo, com a mesma fonte de domínio. */
export function parseAssistantLocalReport(text: string, catalog: AssistantResolvedCatalog): AssistantReportRequest | null {
	let input = normalize(text).replace(/[?!.]+$/g, '');
	const month = /\s+(?:em|de|do mes de)\s+(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(input);
	const period = month?.[1];
	if (month) input = input.slice(0, month.index);
	input = input.replace(/\s+(?:neste|nesse|este|esse|deste|desse) mes$/, '').replace(/^por favor,?\s+/, '');
	const balance = /^(?:qual (?:e )?(?:o )?(?:meu )?saldo|(?:mostre|consulte) (?:o )?(?:meu )?saldo|saldo)(?: (?:atual))?(?: (?:do|da|no|na|de) (.+))?$/.exec(input);
	if (balance) {
		if (period) return null;
		const bank = balance[1] ? (catalog.banks ?? []).filter(item => normalize(item.label) === balance[1]) : [];
		if (balance[1] && bank.length !== 1) return null;
		return {kind:'account_balance', ...(bank.length ? {bankRef:bank[0]!.handle} : {})};
	}
	const extreme = /^(?:qual (?:foi|e) (?:o )?(?:meu )?|mostre (?:o )?(?:meu )?)?(maior|menor) (gasto|despesa|ganho|receita)$/.exec(input);
	if (extreme) return {kind:`${extreme[1] === 'maior' ? 'largest' : 'smallest'}_${/ganho|receita/.test(extreme[2]!) ? 'gain' : 'expense'}`, ...(period ? {period} : {})};
	if (/^(?:mostre|consulte) (?:a )?(?:visao mensal|visao do mes|resumo do mes)$/.test(input)) return {kind:'monthly_overview', ...(period ? {period} : {})};
	if (/^(?:(?:mostre|liste|consulte|quais sao) (?:as )?)?(?:contas|obrigacoes) pendentes$/.test(input)) return {kind:'pending_obligations', ...(period ? {period} : {})};
	if (/^(?:mostre|consulte) (?:a )?(?:minha )?carteira(?: de investimentos)?$/.test(input) && !period) return {kind:'investment_portfolio'};
	if (/^(?:(?:qual e|mostre|liste|consulte) (?:a |o )?)?(?:taxas? (?:de )?cdi|cdi cadastrado)$/.test(input) && !period) return {kind:'cdi_rates'};
	const forecast = /^(?:mostre|consulte) (?:a )?previsao (?:de|para|dos proximos) (3|6|12) meses$/.exec(input);
	if (forecast && !period) return {kind:'cash_flow_forecast', period:forecast[1]};
	const statement = /^(?:mostre|consulte) (?:o )?extrato(?: (?:do|da|de) (.+))?$/.exec(input);
	if (statement) {
		if (statement[1] === 'caixa') return {kind:'cash_movements', ...(period ? {period} : {})};
		const bank = statement[1] ? (catalog.banks ?? []).filter(item => normalize(item.label) === statement[1]) : [];
		if (statement[1] && bank.length !== 1) return null;
		return {kind:'bank_movements', ...(bank.length ? {bankRef:bank[0]!.handle} : {}), ...(period ? {period} : {})};
	}
	return null;
}

export function parseAssistantLocalRequest(text: string, catalog: AssistantResolvedCatalog): AssistantAiConversationResponse | null {
	const clauses = text.split(/[;\n]+/).map(value => value.trim()).filter(Boolean);
	const actions: AssistantModelActionProposal[] = [];
	const reportRequests: AssistantReportRequest[] = [];
	for (const clause of clauses) {
		const action = parseAssistantLocalMovement(clause, catalog);
		const report = action ? null : parseAssistantLocalReport(clause, catalog);
		if (action) actions.push(action);
		else if (report) reportRequests.push(report);
		else return null;
	}
	return clauses.length ? {text:'',actions,reportRequests,toolCallCount:0} : null;
}

/** Gramática pequena para a ordem completa comum; demais linguagens seguem no gateway. */
export function parseAssistantLocalMovement(text: string, catalog: AssistantResolvedCatalog): AssistantModelActionProposal | null {
	const match = /^(?:registre|registrar|adicione)\s+(?:(?:uma\s+)?(despesa|receita|ganho)\s+(?:de\s+)?)?(R\$\s*[\d.,]+|[\d.,]+\s+reais?)\s+de\s+(.+?)\s+(hoje|ontem|anteontem|\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\s+(?:no|na|em)\s+(.+?),\s*categoria\s+(.+?)[.!]*$/i.exec(text.trim());
	if (!match) return null;
	const kind = /receita|ganho/i.test(match[1] ?? '') ? 'create_gain' : 'create_expense';
	const resolve = (source: 'banks' | 'expenseCategories' | 'gainCategories', name: string) => {
		const choices = (catalog[source] ?? []).filter(item => item.ownerScope !== 'related_read_only' && normalize(item.label) === normalize(name));
		return choices.length === 1 ? choices[0]!.handle : undefined;
	};
	const valueInCents = parseMoneyToCents(match[2]);
	const date = normalizeAssistantDateInput(match[4]);
	if (valueInCents === null || valueInCents <= 0 || !date) return null;
	return { kind, payload: { name: match[3]!.trim(), valueInCents, date, bankRef: resolve('banks', match[5]!), categoryRef: resolve(kind === 'create_gain' ? 'gainCategories' : 'expenseCategories', match[6]!) } };
}


export function redactAssistantPersonalData(text: string, uid?: string, privateIdentifiers: readonly string[] = []) {
 let result = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email omitido]')
 .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[token omitido]')
 .replace(/\bAIza[A-Za-z0-9_-]{30,}\b/g,'[chave omitida]')
 .replace(/\b(?:uid|id(?:entificador)?)\s*(?::|=)?\s+[A-Za-z0-9_-]+\b/gi,'[identificador omitido]');
 if (uid) result = result.split(uid).join('[identificador omitido]');
 for(const identifier of new Set(privateIdentifiers)) if(identifier.length >= 3) result=result.split(identifier).join('[identificador omitido]');
 return result;
}

export function getAssistantPrivateIdentifiers(catalog: AssistantResolvedCatalog, uid?: string): string[] {
	const identifiers = new Set<string>(uid ? [uid] : []);
	const collect = (value: unknown, depth: number) => {
		if (!value || typeof value !== 'object' || depth > 4) return;
		for(const [key,item] of Object.entries(value)) {
			if (typeof item === 'string' && /(?:^id$|^uid$|Id$|Uid$)/.test(key)) identifiers.add(item);
			else if(typeof item === 'object') collect(item,depth+1);
		}
	};
	for(const items of Object.values(catalog)) for(const item of items??[]) {if(item.realId) identifiers.add(item.realId);collect(item.data,0);}
	return [...identifiers];
}

/** O recorte inicial contém somente nomes citados; a busca completa continua local. */
export function selectAssistantModelCatalog(catalog: AssistantModelCatalog, text: string): AssistantModelCatalog {
	const input = normalize(text);
	const stop = new Set(['para','hoje','ontem','registre','registrar','pague','receba','ganho','despesa','receita','banco','categoria','qual','quais','quanto','todos','todas','mesmo','saldo','mostre','liste','atual','conta','financeiro']);
	const tokens = input.split(/[^a-z0-9]+/).filter(value=>value.length >= 4 && !stop.has(value));
	return Object.fromEntries(Object.entries(catalog).map(([source,items])=>[source,(items??[]).filter(item=>tokens.some(token=>normalize(item.label).includes(token))).slice(0,8)]));
}
export function searchAssistantCatalog(catalog: AssistantResolvedCatalog, drafts: AssistantDraftAction[], source: AssistantCatalogType|'pending', query: string, hideValues: boolean, uid?: string) {
 const items = source === 'pending' ? drafts.filter(item => !['succeeded','cancelled'].includes(item.status)).map(item => ({ handle: item.clientActionId, label: `${item.kind} · ${item.payload.name ?? ''} · ${item.payload.date ?? item.payload.cycle ?? ''}`, description: `Faltam: ${item.missingFields.map(field=>field.label).join(', ')}` }))
 : Object.hasOwn(catalog, source) ? catalog[source] ?? [] : [];
 const matches=items.filter(item=>normalize(item.label).includes(normalize(query)));
 const privateIdentifiers=getAssistantPrivateIdentifiers(catalog,uid);
 const selected: NonNullable<AssistantModelCatalog[AssistantCatalogType]> = matches.slice(0,40).map(item=>({handle:item.handle,label:redactAssistantPersonalData(hideValues?maskFinancialValuesInText(item.label):item.label,uid,privateIdentifiers),...(item.description?{description:redactAssistantPersonalData(hideValues?maskFinancialValuesInText(item.description):item.description,uid,privateIdentifiers)}:{})}));
 return {items:selected,total:matches.length,complete:matches.length<=40};
}
