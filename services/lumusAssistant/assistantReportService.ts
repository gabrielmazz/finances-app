import type {
	AssistantReport,
	AssistantReportRequest,
	AssistantReportService,
	AssistantResolvedCatalog,
} from '@/types/lumusAssistant';
import { getHomeBalancesFirebase, getHomeInvestmentsFirebase } from '@/functions/HomeFirebase';
import { getFinancialForecastFirebase } from '@/functions/FinancialForecastFirebase';
import { getFinancialLedgerContextFirebase } from '@/functions/FinancialLedgerFirebase';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import { findAssistantCatalogItem, loadAssistantResolvedCatalog } from '@/services/lumusAssistant/assistantCatalogService';
import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import { getMandatoryInstallmentValueInCents } from '@/utils/mandatoryInstallments';
import { shouldIncludeMovementInGainExpenseTotals } from '@/utils/monthlyBalance';
import { createAssistantId, formatCycleKey, formatCents, formatIsoDate, parseIsoDateAtLocalNoon } from '@/utils/lumusAssistant';
import { db } from '@/FirebaseConfig';
import { AssistantFriendlyError } from '@/utils/lumusAssistantErrors';
import { endOfFinancialCivilDay } from '@/utils/financialCivilDate';
import { collection, getDocs, limit, orderBy, query, startAfter, Timestamp, where, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore';

const getMonthLabel = (date: Date) =>
	new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);

const createBaseReport = (
	request: AssistantReportRequest,
	title: string,
	periodLabel: string,
	scopeLabel = 'Minha conta e dados relacionados em modo leitura',
): AssistantReport => ({
	id: createAssistantId('report'),
	kind: request.kind,
	title,
	periodLabel,
	scopeLabel,
	updatedAt: new Date().toISOString(),
	metrics: [],
	deterministicSummary: '',
	notes: [],
});

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export type HistoricalMovement = {
 id: string; name: string; valueInCents: number; date: Date; type: 'expense'|'gain';
 bankId: string|null; categoryId?: string; explanation?: string; economic: boolean; reversed?: boolean; templateId?: string;
};
const readDate = (value: unknown): Date | null => {
 const date = value instanceof Date ? value : value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function' ? value.toDate() : null;
 return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
};
const periodWindow = (request: AssistantReportRequest) => {
 const currentCycle = formatCycleKey(new Date());
 const period = request.period?.trim() || currentCycle;
 if (!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(period) || period > currentCycle) throw new AssistantFriendlyError('invalid-request', 'Informe um mês válido que não esteja no futuro.');
 const [year, month] = period.split('-').map(Number);
 const start = parseIsoDateAtLocalNoon(`${period}-01`, '00:00')!;
 const nextMonth = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`;
 const end = parseIsoDateAtLocalNoon(nextMonth, '00:00')!;
 const todayStart = parseIsoDateAtLocalNoon(formatIsoDate(new Date()), '00:00')!;
 const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
 return { period, start, end: period === currentCycle ? new Date(Math.min(end.getTime(), tomorrowStart.getTime())) : end,
 label: getMonthLabel(new Date(Date.UTC(year, month - 1, 15, 12))) };
};
// O cursor é independente do catálogo de referências e não trunca os dados da consulta.
const readAllPages = async (name: string, filters: QueryConstraint[]) => {
 const documents: QueryDocumentSnapshot[] = [];
 let cursor: QueryDocumentSnapshot | undefined;
 while (true) {
  const snapshot = await getDocs(query(collection(db, name), ...filters, ...(cursor ? [startAfter(cursor)] : []), limit(200)));
  documents.push(...snapshot.docs);
  if (snapshot.docs.length < 200) break;
  const next = snapshot.docs[snapshot.docs.length - 1]!;
  if (cursor?.id === next.id) throw new AssistantFriendlyError('invalid-request', 'A consulta não avançou. Nenhum resultado incompleto será apresentado.');
  cursor = next;
 }
 return documents;
};
export const readAssistantPeriodMovements = async (personId: string, request: AssistantReportRequest, catalog: AssistantResolvedCatalog = {}, range?: { start: Date; end: Date; label: string }) => {
 const window = periodWindow(request);
 if (range) {
  if (!Number.isFinite(range.start.getTime()) || !Number.isFinite(range.end.getTime()) || range.start >= range.end || range.end.getTime() > endOfFinancialCivilDay(new Date()).getTime() + 1) throw new AssistantFriendlyError('invalid-request', 'Informe um intervalo válido até hoje, em São Paulo.');
  window.start = range.start; window.end = range.end; window.label = range.label;
 }
 const context = await getFinancialLedgerContextFirebase(personId);
 const movements: HistoricalMovement[] = [];
 if (context) {
  const [documents, reversals] = await Promise.all([
   readAllPages('ledgerTransactions', [where('groupId','==',context.groupId), where('effectiveAt','>=',Timestamp.fromDate(window.start)), where('effectiveAt','<',Timestamp.fromDate(window.end)), orderBy('effectiveAt','desc')]),
   readAllPages('ledgerTransactions', [where('groupId','==',context.groupId), where('kind','==','reversal')]),
  ]);
  const reversed = new Set(reversals.filter(doc => readDate(doc.data().effectiveAt) && readDate(doc.data().effectiveAt)!.getTime() <= endOfFinancialCivilDay(new Date()).getTime()).map(doc => doc.data().reversesTransactionId));
  for (const document of documents) {
   const item = document.data(); const date = readDate(item.effectiveAt); if (!date) continue;
   const legs = Array.isArray(item.legs) ? item.legs as Array<Record<string,unknown>> : [];
   for (const [index, leg] of legs.entries()) {
    if (typeof leg.accountId !== 'string' || !Number.isSafeInteger(leg.deltaInCents) || leg.deltaInCents === 0) continue;
    const cash = catalog.banks?.find(bank => bank.data?.kind === 'cash' && bank.realId === leg.accountId);
    movements.push({id:`${document.id}:${index}`,name:typeof item.note === 'string' && item.note.trim() ? item.note : 'Movimento financeiro',
     date, valueInCents: Math.abs(Number(leg.deltaInCents)), type:Number(leg.deltaInCents)<0?'expense':'gain',bankId:cash?null:leg.accountId,
     categoryId:typeof item.categoryId === 'string'?item.categoryId:undefined, economic:['income','expense'].includes(item.kind), reversed: reversed.has(document.id),
     templateId:Array.isArray(item.sourceReferences) ? item.sourceReferences.find((ref:{collection?:string;id?:string}) => ref.collection === 'mandatoryExpenses' || ref.collection === 'mandatoryGains')?.id : undefined,
    });
   }
  }
 } else {
  const related=await getRelatedUsersIDsFirebase(personId);
  if(!related.success) throw new AssistantFriendlyError('invalid-request', 'Não foi possível conferir os dados relacionados.');
  const people=Array.from(new Set([personId,...(Array.isArray(related.data)?related.data:[])]));
  const sources = request.kind.endsWith('_expense') ? ['expenses'] : request.kind.endsWith('_gain') ? ['gains'] : ['expenses','gains','cashRescues'];
  const snapshots=await Promise.all(sources.flatMap(name => Array.from({length:Math.ceil(people.length/30)},(_,index)=>
   readAllPages(name,[where('personId','in',people.slice(index*30,(index+1)*30)),where('date','>=',Timestamp.fromDate(window.start)),where('date','<',Timestamp.fromDate(window.end)),orderBy('date','asc')]).then(docs=>({name,docs}))
  )));
  for(const {name,docs} of snapshots) for(const document of docs){
   const item=document.data(); const date=readDate(item.date);
   if(!date || !Number.isSafeInteger(item.valueInCents) || item.valueInCents<=0) continue;
   const base={id:document.id,name:typeof item.name==='string'?item.name:'Movimento financeiro',date,valueInCents:item.valueInCents,
    bankId:typeof item.bankId==='string'?item.bankId:null, categoryId:typeof item.tagId==='string'?item.tagId:undefined,
    explanation:typeof item.explanation==='string'?item.explanation:undefined, economic:shouldIncludeMovementInGainExpenseTotals(item),templateId:typeof item.mandatoryTemplateId==='string'?item.mandatoryTemplateId:typeof item.mandatoryExpenseId==='string'?item.mandatoryExpenseId:typeof item.mandatoryGainId==='string'?item.mandatoryGainId:undefined};
   if(name==='cashRescues') {
    movements.push({...base,id:`${document.id}:bank`,type:'expense',economic:false},{...base,id:`${document.id}:cash`,type:'gain',bankId:null,economic:false});
   } else movements.push({...base,type:name==='expenses'?'expense':'gain'});
  }
 }
 movements.sort((a,b)=>b.date.getTime()-a.date.getTime() || a.id.localeCompare(b.id));
 return {movements,window};
};
const readPeriodMovements = readAssistantPeriodMovements;
const createExtremumMovementReport = async (personId:string,request:AssistantReportRequest):Promise<AssistantReport> => {
 const kind=request.kind.endsWith('_gain')?'gain':'expense'; const smallest=request.kind.startsWith('smallest_');
 const {movements,window}=await readPeriodMovements(personId,request);
 const candidates=movements.filter(item=>item.type===kind && item.economic && !item.reversed)
 .sort((a,b)=>(smallest?a.valueInCents-b.valueInCents:b.valueInCents-a.valueInCents)||b.date.getTime()-a.date.getTime());
 const report=createBaseReport(request,`${smallest?'Menor':'Maior'} ${kind==='expense'?'despesa':'ganho'}`,window.label);
 const selected=candidates[0];
 if(!selected){report.deterministicSummary=kind==='expense'?`Não encontrei despesas registradas em ${window.label}.`:`Não encontrei ganhos registrados em ${window.label}.`;return report;}
 report.metrics=[{label:kind==='expense'?'Valor da despesa':'Valor do ganho',valueInCents:selected.valueInCents}];
 report.deterministicSummary=`Seu ${smallest?'menor':'maior'} ${kind==='expense'?'gasto':'ganho'} em ${window.label} foi ${selected.name}: ${formatCents(selected.valueInCents)}, em ${formatIsoDate(selected.date).split('-').reverse().join('/')}.`;
 return report;
};
const groupMovementsByDay = (movements: HistoricalMovement[]) => {
 const grouped=new Map<string,number>();
 for (const movement of movements){const key=formatIsoDate(movement.date).slice(5).split('-').reverse().join('/');grouped.set(key,(grouped.get(key)??0)+(movement.type==='expense'?-movement.valueInCents:movement.valueInCents));}
 return Array.from(grouped.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([label,value])=>({label,value}));
};

const createAccountBalanceReport = async (personId:string, request:AssistantReportRequest, catalog:AssistantResolvedCatalog):Promise<AssistantReport> => {
 if(request.period) throw new AssistantFriendlyError('invalid-request', 'A consulta de saldo mostra a posição atual. Para outro mês, peça o extrato ou a visão mensal.');
 const result=await getHomeBalancesFirebase(personId);
 if(!result.success) throw new AssistantFriendlyError('invalid-request', 'Não foi possível conferir os saldos atuais.');
 const overview=result.data;
 const bank=request.bankRef?findAssistantCatalogItem(catalog,'banks',request.bankRef):null;
 if(request.bankRef && !bank) throw new AssistantFriendlyError('invalid-request', 'Informe o nome de um banco acessível ou Caixa.');
 let balances=overview.bankBalances.map(item=>({id:item.id,label:item.name,value:item.balanceInCents}));
 if(overview.cashSummary) balances.push({id:'cash',label:'Caixa',value:overview.cashSummary.balanceInCents});
 if(bank) balances=balances.filter(item=>item.id===(bank.handle==='cash'||bank.data?.kind==='cash'?'cash':bank.realId) || item.id===bank.data?.legacyBankId);
 if(!balances.length) throw new AssistantFriendlyError('invalid-request', 'Não consegui conferir o saldo dessa conta.');
 const known=balances.filter((item):item is typeof item & {value:number}=>typeof item.value==='number');
 const report=createBaseReport(request,'Saldo atual','Posição atual',bank?.label??'Bancos e Caixa acessíveis');
 report.metrics=known.map(item=>({label:item.label,valueInCents:item.value}));
 report.deterministicSummary=bank?`${bank.label}: ${known.length?formatCents(known[0].value):'saldo indisponível'}.`:`Saldo conhecido: ${formatCents(sum(known.map(item=>item.value)))}.\n${known.map(item=>`${item.label}: ${formatCents(item.value)}`).join('\n')}`;
 if(known.length<balances.length) report.deterministicSummary+=' Há contas sem saldo conferido; o total é parcial.';
 return report;
};
const createMonthlyOverview = async (personId:string,request:AssistantReportRequest):Promise<AssistantReport> => {
 const {movements,window}=await readPeriodMovements(personId,request);
 const active=movements.filter(item=>item.economic && !item.reversed);
 const expenses=sum(active.filter(item=>item.type==='expense').map(item=>item.valueInCents));
 const gains=sum(active.filter(item=>item.type==='gain').map(item=>item.valueInCents));
 const report=createBaseReport(request,'Visão do mês',window.label);
 report.metrics=[{label:'Ganhos',valueInCents:gains,tone:'positive'},{label:'Despesas',valueInCents:expenses,tone:'negative'},{label:'Resultado',valueInCents:gains-expenses,tone:gains>=expenses?'positive':'warning'}];
 report.chart={kind:'bar',points:[{label:'Ganhos',value:gains},{label:'Despesas',value:expenses}]};
 report.deterministicSummary=`Em ${window.label}: ${formatCents(gains)} em ganhos, ${formatCents(expenses)} em despesas e resultado de ${formatCents(gains-expenses)}.`;
 return report;
};

const createMovementReport = async (
	personId: string,
	request: AssistantReportRequest,
	catalog: AssistantResolvedCatalog,
): Promise<AssistantReport> => {
	const { movements: complete, window } = await readPeriodMovements(personId, request, catalog);
	let movements = complete;
	let scope = 'Todos os movimentos do período';
	if (request.kind === 'bank_movements') {
		const bank = findAssistantCatalogItem(catalog, 'banks', request.bankRef);
		if (request.bankRef && (!bank || !bank.realId)) {
			throw new AssistantFriendlyError('invalid-request', 'Informe um banco válido para o relatório.');
		}
		if (bank?.realId) {
			movements = movements.filter(movement => movement.bankId === bank.realId);
			scope = bank.label;
		}
	}
	if (request.kind === 'cash_movements') {
		movements = movements.filter(movement => movement.bankId === null);
		scope = 'Dinheiro em espécie';
	}
	if (request.kind === 'transaction_search') {
		const normalizedQuery = request.query?.trim().toLocaleLowerCase('pt-BR') ?? '';
		if (normalizedQuery) {
			movements = movements.filter(movement =>
				[movement.name, movement.explanation, catalog.categories?.find(item => item.realId === movement.categoryId)?.label, catalog.banks?.find(item => item.realId === movement.bankId)?.label]
					.filter((value): value is string => typeof value === 'string')
					.some(value => value.toLocaleLowerCase('pt-BR').includes(normalizedQuery)),
			);
			scope = `Busca por “${request.query?.trim()}”`;
		}
	}
	const expenses = sum(movements.filter(item => item.type === 'expense').map(item => item.valueInCents));
	const gains = sum(movements.filter(item => item.type === 'gain').map(item => item.valueInCents));
	const report = createBaseReport(
		request,
		request.kind === 'transaction_search' ? 'Pesquisa de transações' : 'Movimentos financeiros',
		window.label,
		scope,
	);
	report.metrics = [
		{ label: 'Registros encontrados', value: movements.length, displayValue: String(movements.length) },
		{ label: 'Ganhos', valueInCents: gains, tone: 'positive' },
		{ label: 'Despesas', valueInCents: expenses, tone: 'negative' },
	];
	report.chart = { kind: 'line', points: groupMovementsByDay(movements) };
	report.deterministicSummary = movements.length === 0
		? 'Nenhum movimento foi encontrado nesse escopo.'
		: `${movements.length} movimento(s) encontrado(s), com resultado líquido de ${formatCents(gains - expenses)}.`;
	const offset = request.offset ?? 0;
	if (!Number.isSafeInteger(offset) || offset < 0) throw new AssistantFriendlyError('invalid-request', 'Informe uma continuação válida do extrato.');
	const details = movements.slice(offset, offset + 20);
	if (details.length) report.deterministicSummary += `\n${details.map((item,index) => `${offset + index + 1}. ${item.name} · ${formatIsoDate(item.date).split('-').reverse().join('/')} · ${item.type === 'expense' ? 'saída' : 'entrada'} ${formatCents(item.valueInCents)}${item.reversed ? ' · estornado' : ''}`).join('\n')}`;
	if (offset + details.length < movements.length) report.deterministicSummary += `\nMostrei ${offset + 1} a ${offset + details.length} de ${movements.length}. Diga “mostre os demais” para continuar no chat.`;
	else if (offset >= movements.length && movements.length) report.deterministicSummary += '\nTodos os registros desse conjunto já foram apresentados.';
	report.notes.push('Movimentos incluem transferências e estornos; o resultado líquido representa as entradas menos as saídas desse extrato.');
	return report;
};

const createCategoryReport = async (personId:string,request:AssistantReportRequest,catalog:AssistantResolvedCatalog):Promise<AssistantReport> => {
 const {movements,window}=await readPeriodMovements(personId,request,catalog);
 const category=request.categoryRef?findAssistantCatalogItem(catalog,'categories',request.categoryRef):null;
 if(request.categoryRef && !category) throw new AssistantFriendlyError('invalid-request', 'Informe uma categoria acessível.');
 const active=movements.filter(item=>item.economic && !item.reversed && (!category || item.categoryId===category.realId));
 const expenses=sum(active.filter(item=>item.type==='expense').map(item=>item.valueInCents));
 const gains=sum(active.filter(item=>item.type==='gain').map(item=>item.valueInCents));
 const report=createBaseReport(request,category?`Categoria: ${category.label}`:'Análise por categoria',window.label);
 report.metrics=[{label:'Despesas',valueInCents:expenses,tone:'negative'},{label:'Ganhos',valueInCents:gains,tone:'positive'},{label:'Movimentos',value:active.length}];
 const grouped=new Map<string,{expense:number;gain:number}>();
 for(const item of active){const label=catalog.categories?.find(candidate=>candidate.realId===item.categoryId)?.label??'Sem categoria';const value=grouped.get(label)??{expense:0,gain:0};value[item.type==='expense'?'expense':'gain']+=item.valueInCents;grouped.set(label,value);}
 report.deterministicSummary=category?`${category.label}, ${window.label}: ${formatCents(expenses)} em despesas e ${formatCents(gains)} em ganhos.`:`${window.label}: ${formatCents(expenses)} em despesas e ${formatCents(gains)} em ganhos.\n${[...grouped.entries()].sort(([,a],[,b])=>b.expense-a.expense).map(([label,totals])=>`${label}: despesas ${formatCents(totals.expense)}; ganhos ${formatCents(totals.gain)}`).join('\n')}`;
 report.chart={kind:'bar',points:[...grouped.entries()].map(([label,totals])=>({label,value:totals.expense}))};
 return report;
};

const createForecastReport = async (
	personId: string,
	request: AssistantReportRequest,
): Promise<AssistantReport> => {
	const requestedMonths = Number.parseInt(request.period ?? '', 10);
	if(request.period && !['3','6','12'].includes(request.period)) throw new AssistantFriendlyError('invalid-request', 'A previsão aceita períodos de 3, 6 ou 12 meses.');
	const period = requestedMonths === 6 || requestedMonths === 12 ? requestedMonths : 3;
	const result = await getFinancialForecastFirebase(personId, period);
	if (!result.success) throw new AssistantFriendlyError('invalid-request', result.error);
	const forecast = result.data;
	const report = createBaseReport(request, 'Previsão de fluxo', `Próximos ${period} meses`);
	report.metrics = [
		{ label: 'Saldo de abertura', valueInCents: forecast.openingBalanceInCents },
		{ label: 'Saldo projetado', valueInCents: forecast.finalBalanceInCents, tone: forecast.finalBalanceInCents >= 0 ? 'positive' : 'warning' },
		{ label: 'Ganhos previstos', valueInCents: forecast.totalGainsInCents, tone: 'positive' },
		{ label: 'Despesas previstas', valueInCents: forecast.totalExpensesInCents, tone: 'negative' },
	];
	report.chart = {
		kind: 'line',
		points: forecast.months.map(month => ({
			label: month.label,
			value: month.closingBalanceInCents,
			color: month.closingBalanceInCents >= 0 ? '#22c55e' : '#ef4444',
		})),
	};
	report.deterministicSummary = `Mantidas as premissas atuais, o saldo ao fim do período é ${formatCents(forecast.finalBalanceInCents)}.`;
	report.notes.push('Previsão baseada nos registros, recorrências e médias existentes; não é garantia de resultado.');
	if (forecast.missingSnapshotBankNames.length > 0) {
		report.notes.push(`Saldo mensal ausente em: ${forecast.missingSnapshotBankNames.join(', ')}.`);
	}
	return report;
};

const createPendingReport = async (
 personId: string, request: AssistantReportRequest, suppliedCatalog: AssistantResolvedCatalog,
): Promise<AssistantReport> => {
 const window = periodWindow(request);
 const catalog = suppliedCatalog.mandatoryExpenses && suppliedCatalog.mandatoryGains ? suppliedCatalog : await loadAssistantResolvedCatalog(personId);
 const historical = window.period !== formatCycleKey(new Date());
 const ledger = historical ? await getFinancialLedgerContextFirebase(personId) : null;
 const history = ledger ? (await readPeriodMovements(personId,request,catalog)).movements : [];
 let unknown = 0;
 const items = (['mandatoryExpenses','mandatoryGains'] as const).flatMap(source => (catalog[source] ?? []).flatMap(item => {
  const data = item.data ?? {};
  const type = source === 'mandatoryExpenses' ? 'expense' : 'gain';
  const lastCycle = type === 'expense' ? data.lastPaymentCycle : data.lastReceiptCycle;
  const completedCycles = Array.isArray(data.completedCycles) ? data.completedCycles : data.completedCycles && typeof data.completedCycles === 'object' ? Object.keys(data.completedCycles) : [];
  if (lastCycle === window.period || completedCycles.includes(window.period) || history.some(movement => movement.templateId === item.realId && movement.type === type && !movement.reversed && movement.economic)) return [];
  const created = readDate(data.createdAt);
  if (created && formatCycleKey(created) > window.period) return [];
  const start = readDate(data.installmentStartDate);
  const end = readDate(data.installmentEndDate);
  if (start && formatCycleKey(start) > window.period || end && formatCycleKey(end) < window.period) return [];
  if (historical && data.assistantCycleHistoryComplete !== true) {unknown++;return [];}
  if (typeof data.installmentTotal === 'number' && Number(data.installmentsCompleted ?? 0) >= data.installmentTotal) return [];
  const value = typeof data.installmentTotal === 'number' ? getMandatoryInstallmentValueInCents({installmentTotal:data.installmentTotal,installmentsCompleted:data.installmentsCompleted,installmentValueInCents:data.valueInCents,installmentTotalValueInCents:data.installmentTotalValueInCents}) : data.valueInCents;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new AssistantFriendlyError('invalid-request', 'Uma obrigação tem valor inválido. Não apresentei um total incompleto.');
  const due = resolveMonthlyOccurrence({referenceDate:parseIsoDateAtLocalNoon(`${window.period}-15`)!,dueDay:Number(data.dueDay ?? 1),usesBusinessDays:data.usesBusinessDays === true}).date;
  return [{label:item.label,type,value,due,readOnly:item.ownerScope === 'related_read_only'}];
 }));
 const expenses = items.filter(item=>item.type === 'expense');
 const gains = items.filter(item=>item.type === 'gain');
 const expenseTotal = sum(expenses.map(item=>item.value));
 const gainTotal = sum(gains.map(item=>item.value));
 const report = createBaseReport(request,'Obrigações pendentes',window.label);
 report.metrics = [{label:'Gastos pendentes',valueInCents:expenseTotal,tone:'negative'},{label:'Ganhos pendentes',valueInCents:gainTotal,tone:'positive'},{label:'Itens conferidos pendentes',value:items.length,displayValue:String(items.length)}];
 report.deterministicSummary = `${window.label}: ${expenses.length} despesa(s) pendentes, ${formatCents(expenseTotal)}; ${gains.length} receita(s) pendentes, ${formatCents(gainTotal)}.`;
 const offset = request.offset ?? 0;
 const shown = items.slice(offset,offset+20);
 report.deterministicSummary += shown.length ? `\n${shown.map((item,index)=>`${offset+index+1}. ${item.label} · ${formatCents(item.value)} · vencimento ${formatIsoDate(item.due).split('-').reverse().join('/')}${item.readOnly?' · somente leitura':''}`).join('\n')}` : '';
 if(offset + shown.length < items.length) report.deterministicSummary += `\nHá ${items.length} itens no conjunto. Diga “mostre os demais” para continuar.`;
 if(unknown) report.deterministicSummary += `\nNão consegui reconstruir ${unknown} obrigação(ões) antigas nesse mês: o armazenamento legado preservou apenas o último ciclo. Elas não foram classificadas como pendentes nem pagas; os totais acima são parciais.`;
 return report;
};

const createInvestmentReport = async (
	personId: string,
	request: AssistantReportRequest,
): Promise<AssistantReport> => {
	if(request.period) throw new AssistantFriendlyError('invalid-request','A carteira mostra a posição atual e suas simulações. Não existe uma série histórica completa de cotações integrada.');
	const result = await getHomeInvestmentsFirebase(personId);
	if (!result.success) {
		throw new AssistantFriendlyError('invalid-request', 'Não foi possível carregar a carteira.');
	}
	const complete = result.data.portfolio;
	const queryText = request.query?.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
	const items = queryText ? complete.items.filter(item=>item.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').includes(queryText)) : complete.items;
	const portfolio = {...complete,items,investmentCount:items.length,totalCurrentBaseInCents:sum(items.map(item=>item.currentBaseValueInCents)),totalSimulatedInCents:sum(items.map(item=>item.simulatedValueInCents)),totalEstimatedGainInCents:sum(items.map(item=>item.estimatedGainInCents))};
	const report = createBaseReport(request, 'Carteira de investimentos', 'Posição atual');
	report.metrics = [
		{ label: 'Valor base atual', valueInCents: portfolio.totalCurrentBaseInCents },
		{ label: 'Valor simulado', valueInCents: portfolio.totalSimulatedInCents },
		{ label: 'Ganho estimado', valueInCents: portfolio.totalEstimatedGainInCents, tone: portfolio.totalEstimatedGainInCents >= 0 ? 'positive' : 'warning' },
		{ label: 'Investimentos', value: portfolio.investmentCount, displayValue: String(portfolio.investmentCount) },
	];
	report.chart = {
		kind: 'donut',
		points: portfolio.items.slice(0, 8).map((item, index) => ({
			label: item.name,
			value: item.simulatedValueInCents,
			color: ['#facc15', '#38bdf8', '#a78bfa', '#22c55e', '#fb7185', '#f97316', '#2dd4bf', '#94a3b8'][index],
		})),
	};
	report.deterministicSummary = portfolio.investmentCount === 0
		? 'Nenhum investimento foi encontrado.'
		: `A carteira tem ${portfolio.investmentCount} investimento(s) e valor simulado de ${formatCents(portfolio.totalSimulatedInCents)}.`;
	const offset=request.offset??0;
	report.deterministicSummary += items.length ? `\n${items.slice(offset,offset+20).map(item=>`${item.name}: base ${formatCents(item.currentBaseValueInCents)}; simulação ${formatCents(item.simulatedValueInCents)}`).join('\n')}\nA simulação depende das taxas e datas cadastradas; não é uma cotação nem garantia de rentabilidade.` : '';
	if(offset+20<items.length) report.deterministicSummary+='\nDiga “mostre os demais” para continuar.';
	report.notes.push('Valores simulados não são recomendação nem garantia de rentabilidade.');
	return report;
};

const createCdiReport = async (personId:string,request:AssistantReportRequest):Promise<AssistantReport> => {
 if(request.period) throw new AssistantFriendlyError('invalid-request','A consulta de CDI lista vigências cadastradas. Informe a data na pergunta; não é uma cotação pública em tempo real.');
 const context=await getFinancialLedgerContextFirebase(personId);
 const pages=await Promise.all([readAllPages('investmentCdiRates',[where('personId','==',personId)]),...(context?[readAllPages('investmentCdiRates',[where('groupId','==',context.groupId)])]:[])]);
 const docs=[...new Map(pages.flat().map(document=>[document.id,document])).values()];
 const today=formatIsoDate(new Date());
 const rates=docs.map(document=>document.data()).flatMap(item=>{const date=readDate(item.effectiveFrom);return date&&Number.isSafeInteger(item.annualRateInBasisPoints)&&item.annualRateInBasisPoints>0?[{date,value:item.annualRateInBasisPoints as number}]:[];}).sort((a,b)=>b.date.getTime()-a.date.getTime());
 const report=createBaseReport(request,'CDI cadastrado','Vigências disponíveis',context?'Grupo financeiro':'Sua conta');
 const current=rates.filter(item=>formatIsoDate(item.date)<=today);
 report.deterministicSummary=current.length ? `CDI cadastrado mais recente: ${(current[0]!.value/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}% ao ano, vigente desde ${formatIsoDate(current[0]!.date).split('-').reverse().join('/')}.`:'Nenhuma taxa CDI vigente foi cadastrada nesse escopo.';
 report.deterministicSummary += `\n${rates.slice(request.offset??0,(request.offset??0)+20).map(item=>`${formatIsoDate(item.date).split('-').reverse().join('/')}: ${(item.value/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}% ao ano${formatIsoDate(item.date)>today?' · vigência futura':''}`).join('\n')}`;
 report.deterministicSummary += '\nSão taxas cadastradas no aplicativo; não consultei uma cotação externa.';
 return report;
};

export const assistantReportService: AssistantReportService = {
	async createReport(personId, request, catalog) {
		switch (request.kind) {
			case 'largest_expense':
			case 'largest_gain':
			case 'smallest_expense':
			case 'smallest_gain':
				return createExtremumMovementReport(personId, request);
			case 'account_balance':
				return createAccountBalanceReport(personId, request, catalog);
			case 'monthly_overview':
				return createMonthlyOverview(personId, request);
			case 'bank_movements':
			case 'cash_movements':
			case 'transaction_search':
				return createMovementReport(personId, request, catalog);
			case 'category_analysis':
				return createCategoryReport(personId, request, catalog);
			case 'cash_flow_forecast':
				return createForecastReport(personId, request);
			case 'pending_obligations':
				return createPendingReport(personId, request, catalog);
			case 'cdi_rates':
				return createCdiReport(personId,request);
			case 'investment_portfolio':
				return createInvestmentReport(personId, request);
		}
	},
};
