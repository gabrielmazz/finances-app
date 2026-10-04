import { redactAssistantPersonalData, searchAssistantCatalog } from '@/services/lumusAssistant/assistantBatchService';
jest.mock('@/FirebaseConfig', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({}));

import { createAssistantConversation } from '@/services/lumusAssistant/assistantConversationService';
import { canAssistantExecuteDirectly, createAssistantAuthorizationSession, validateAssistantExecutionAuthorization } from '@/services/lumusAssistant/assistantAuthorization';
import { buildAssistantDraft } from '@/utils/lumusAssistant';
import type { FinanceCommandService, AssistantDraftAction } from '@/types/lumusAssistant';

const proposal = { kind: 'create_expense' as const, payload: { name: 'Mercado', valueInCents: 8290, date: '2026-10-01', bankRef: 'nubank', categoryRef: 'food' } };

test('autorização direta distingue categoria, movimento e recorrência do pedido original', () => {
	expect(canAssistantExecuteDirectly('Registre R$ 82,90 de mercado hoje no Nubank, categoria alimentação', buildAssistantDraft({kind:'create_category',payload:{categoryName:'Mercado',usageType:'expense'}}))).toBe(false);
	expect(canAssistantExecuteDirectly('Crie uma despesa fixa de internet',buildAssistantDraft(proposal))).toBe(false);
	expect(canAssistantExecuteDirectly('Crie uma categoria Mercado',buildAssistantDraft({kind:'create_category',payload:{categoryName:'Mercado',usageType:'expense'}}))).toBe(true);
});

function harness(actions = [proposal], overrides: Partial<Parameters<typeof createAssistantConversation>[0]> = {}) {
	const committed = new Map<string, number>();
	const finance: FinanceCommandService = {
		loadCatalog: async () => ({ banks: [{ handle: 'nubank', realId: 'bank', label: 'Nubank' }], expenseCategories: [{ handle: 'food', realId: 'tag', label: 'Alimentação' }] }),
		prepareActions: async (_uid, items) => ({ actions: items.map(item => buildAssistantDraft(item)), catalog: {} }),
		updateDraft: async (_uid, draft, patch) => buildAssistantDraft({ ...draft, payload: { ...draft.payload, ...patch } }),
		execute: async (uid, draft, _catalog, authorization) => {
			if (!validateAssistantExecutionAuthorization(uid, draft, authorization)) return { success: false, message: 'Sem autorização' };
			committed.set(draft.clientActionId, Number(draft.payload.valueInCents));
			return { success: true, message: 'Despesa registrada.' };
		},
		retryNotification: async () => ({ success: true, message: 'Lembrete atualizado.' }),
	};
	const conversation = createAssistantConversation({ uid: 'synthetic-user', finance, interpret: async () => ({ text: '', actions, reportRequests: [], toolCallCount: 0 }), report: async () => 'Saldo atualizado', onChange: () => {}, ...overrides });
	return { conversation, committed };
}

test('uma ordem completa salva centavos uma vez e informa o resultado persistido', async () => {
	const { conversation, committed } = harness();
	await conversation.send('Registre R$ 82,90 de mercado hoje no Nubank, categoria alimentação');
	expect([...committed.values()]).toEqual([8290]);
	expect(conversation.snapshot().drafts[0]?.status).toBe('succeeded');
});

test('negação dentro de um nome citado é dado, enquanto negar a operação impede o commit', async () => {
	const valid = harness();
	await valid.conversation.send('Registre R$ 82,90 de "Não sei" hoje no Nubank, categoria alimentação');
	expect([...valid.committed.values()]).toEqual([8290]);
	for (const text of ['Não registre R$ 82,90', 'Registre R$ 82,90, mas não execute', '"Registre R$ 82,90" é um exemplo']) {
		const denied = harness();
		await denied.conversation.send(text);
		await denied.conversation.send('sim');
		expect(denied.committed.size).toBe(0);
	}
});

test('uma consulta proposta como escrita pelo modelo não grava sem confirmação ativa', async () => {
	const { conversation, committed } = harness();
	await conversation.send('Quanto gastei no mercado?');
	await conversation.send('sim');
	expect(committed.size).toBe(0);
});

test('confirmação de lote é única e não repete sucessos', async () => {
	const { conversation, committed } = harness([proposal, { ...proposal, payload: { ...proposal.payload, valueInCents: 1000 } }]);
	await conversation.send('Registre duas despesas');
	expect(committed.size).toBe(0);
	await conversation.send('confirmo');
	expect([...committed.values()]).toEqual([8290, 1000]);
	await conversation.send('sim');
	expect(committed.size).toBe(2);
});

test('autorizações recusam argumento alterado, outro usuário, token forjado e sessão encerrada', () => {
	const draft: AssistantDraftAction = buildAssistantDraft(proposal);
	const session = createAssistantAuthorizationSession('synthetic-user');
	session.recordUserMessage('user-event', 'Registre a despesa');
	const authorization = session.authorize(draft, 'user-event', 'direct')!;
	expect(validateAssistantExecutionAuthorization('synthetic-user', draft, authorization)).toBe(true);
	expect(validateAssistantExecutionAuthorization('other', draft, authorization)).toBe(false);
	expect(validateAssistantExecutionAuthorization('synthetic-user', { ...draft, payload: { ...draft.payload, valueInCents: 999 } }, authorization)).toBe(false);
	expect(validateAssistantExecutionAuthorization('synthetic-user', draft, { token: authorization.token })).toBe(false);
	session.dispose();
	expect(validateAssistantExecutionAuthorization('synthetic-user', draft, authorization)).toBe(false);
});


test('complemento com moeda decimal mantém 82,90 e preenche vários campos', async () => {
 const {conversation, committed} = harness([{kind:'create_expense',payload:{name:'Mercado',bankRef:'nubank',categoryRef:'food'}} as typeof proposal]);
 await conversation.send('Registre a despesa Mercado');
 await conversation.send('R$ 82,90, hoje');
 expect([...committed.values()]).toEqual([8290]);
});

test('correção depois do resumo confirma todo o pedido atualizado e nunca a versão anterior', async () => {
 const {conversation,committed} = harness([proposal], {
  interpret:async (_text,state)=> state.drafts.length ? {text:'',actions:[],reportRequests:[],toolCallCount:0,draftUpdates:[{actionId:state.drafts[0]!.clientActionId,patch:{valueInCents:9000}}]} : {text:'',actions:[proposal,{...proposal,payload:{...proposal.payload,valueInCents:1000}}],reportRequests:[],toolCallCount:0},
 });
 await conversation.send('Registre duas despesas');
 await conversation.send('corrija a primeira para noventa reais');
 expect(committed.size).toBe(0);
 await conversation.send('sim');
 expect([...committed.values()]).toEqual([9000,1000]);
});

test('consulta paralela conserva pedido, invalida sim e retome restaura confirmação', async () => {
 const {conversation,committed} = harness([proposal,{...proposal,payload:{...proposal.payload,valueInCents:1000}}]);
 await conversation.send('Registre duas despesas');
 await conversation.send('Qual meu saldo?');
 await conversation.send('sim');
 expect(committed.size).toBe(0);
 await conversation.send('retome');
 await conversation.send('confirmo');
 expect(committed.size).toBe(2);
});

test('negação de confirmação não grava e preserva cancelamento', async () => {
 const {conversation,committed} = harness([proposal,{...proposal,payload:{...proposal.payload,valueInCents:1000}}]);
 await conversation.send('Registre duas despesas');
 await conversation.send('não');
 await conversation.send('sim');
 expect(committed.size).toBe(0);
 expect(conversation.snapshot().drafts.every(item=>item.status==='cancelled')).toBe(true);
});

test('cancelar durante commit conserva seu sucesso e não inicia o próximo item', async () => {
 let release!:()=>void;
 let entered!:()=>void;
 const enteredCommit = new Promise<void>(resolve=>{entered=resolve;});
 const wait = new Promise<void>(resolve=>{release=resolve;});
 const writes:string[]=[];
 const base=harness();
 const finance:FinanceCommandService={
  loadCatalog:async()=>({}),prepareActions:async(_uid,items)=>({actions:items.map(item=>buildAssistantDraft(item)),catalog:{}}),updateDraft:async(_uid,item)=>item,
  execute:async(_uid,item)=>{entered();await wait;writes.push(item.clientActionId);return {success:true,message:'Persistida'};},retryNotification:async()=>({success:true,message:''}),
 };
 const {conversation}=harness([proposal,{...proposal,payload:{...proposal.payload,valueInCents:1000}}],{finance});
 await conversation.send('Registre duas despesas');
 const committing=conversation.send('confirmo');
 await enteredCommit;
 await conversation.send('cancele');
 release();await committing;
 expect(writes).toHaveLength(1);
 expect(conversation.snapshot().drafts.map(item=>item.status)).toEqual(['succeeded','cancelled']);
 expect(conversation.snapshot().messages.at(-1)).toMatchObject({text:expect.stringContaining('1 não iniciadas por cancelamento')});
 base.conversation.dispose();
});

test('detalhes do lote percorrem todos os resultados por mensagens sem modelo nem novas escritas', async () => {
	const items = Array.from({length:12},(_,index)=>({...proposal,payload:{...proposal.payload,name:`Item ${index + 1}`}}));
	const interpret = jest.fn(async () => ({text:'',actions:items,reportRequests:[],toolCallCount:1}));
	const {conversation,committed} = harness(items,{interpret});
	await conversation.send('Registre doze despesas');
	await conversation.send('confirmo');
	expect(committed.size).toBe(12);
	await conversation.send('detalhes do lote');
	expect(conversation.snapshot().messages.at(-1)).toMatchObject({text:expect.stringContaining('Item 8')});
	await conversation.send('mais detalhes');
	expect(conversation.snapshot().messages.at(-1)).toMatchObject({text:expect.stringContaining('12. Registrar despesa: Item 12')});
	expect(interpret).toHaveBeenCalledTimes(1);
	expect(committed.size).toBe(12);
});

test('uma escrita mais consulta lê somente depois do commit confirmado', async()=>{
 const order:string[]=[];
 const {conversation,committed}=harness([proposal],{report:async()=>{order.push('read');expect(committed.size).toBe(1);return 'Saldo persistido';},onCommit:async()=>{order.push('invalidate');}});
 await conversation.send('Registre R$ 82,90 de mercado hoje no Nubank, categoria alimentação; qual meu saldo?');
 expect(order).toEqual(['invalidate','read']);
});

test('entrada grande não é truncada e não processa parte dos itens',async()=>{
 const interpret=jest.fn();
 const {conversation,committed}=harness([proposal],{interpret});
 await conversation.send('registre '+ 'a'.repeat(4000));
 expect(interpret).not.toHaveBeenCalled();expect(committed.size).toBe(0);
 expect(conversation.snapshot().messages.at(-1)).toMatchObject({type:'warning'});
});

test('proposta local mantém a origem autenticada em vez de usar frase canônica como autorização',async()=>{
 const application=jest.fn(async (_text:string,context:{proposedByModel:boolean})=>context.proposedByModel?'Alteração negada':null);
 const {conversation}=harness([],{application,interpret:async()=>({text:'Salvei',actions:[],reportRequests:[],toolCallCount:1,applicationCommands:['altere meu nome para Outro']})});
 await conversation.send('Qual meu nome?');
 expect(application.mock.calls[1]).toEqual(['altere meu nome para Outro',expect.objectContaining({originText:'Qual meu nome?',proposedByModel:true})]);
 expect(conversation.snapshot().messages.at(-1)).toMatchObject({text:'Alteração negada'});
});

test('cancelar referência ambígua espera ordinal e mantém outro pedido',async()=>{
 const {conversation,committed}=harness([proposal,{...proposal,payload:{...proposal.payload,valueInCents:1000}}]);
 await conversation.send('Registre duas despesas');
 await conversation.send('cancele a despesa mercado');
 expect(conversation.snapshot().drafts.every(item=>item.status==='ready')).toBe(true);
 await conversation.send('a segunda');
 expect(conversation.snapshot().drafts.map(item=>item.status)).toEqual(['ready','cancelled']);
 await conversation.send('retome');await conversation.send('confirmo');
 expect([...committed.values()]).toEqual([8290]);
});

test('falha parcial repete somente o ID que falhou e conserva sucesso',async()=>{
 const calls:string[]=[];const persisted=new Set<string>();let firstFailure=true;
 const finance:FinanceCommandService={loadCatalog:async()=>({}),prepareActions:async(_uid,items)=>({actions:items.map(item=>buildAssistantDraft(item)),catalog:{}}),updateDraft:async(_uid,item)=>item,retryNotification:async()=>({success:true,message:''}),execute:async(uid,item,_catalog,grant)=>{
  expect(validateAssistantExecutionAuthorization(uid,item,grant)).toBe(true);calls.push(item.clientActionId);
  if(item.payload.valueInCents===1000&&firstFailure){firstFailure=false;return {success:false,message:'Falha antes do commit'};}
  persisted.add(item.clientActionId);return {success:true,message:'Salva'};
 }};
 const {conversation}=harness([proposal,{...proposal,payload:{...proposal.payload,valueInCents:1000}}],{finance});
 await conversation.send('Registre duas despesas');await conversation.send('confirmo');
 const [first,second]=conversation.snapshot().drafts.map(item=>item.clientActionId);
 expect(persisted.size).toBe(1);
 await conversation.send('tente novamente');await conversation.send('confirmo');
 expect(calls).toEqual([first,second,second]);expect(persisted.size).toBe(2);
});

test('lote financeiro percorre 501 itens elegíveis e conta permissão/conclusão sem duplicar',async()=>{
 const catalog={mandatoryExpenses:Array.from({length:503},(_,i)=>({handle:`item${i}`,realId:`real${i}`,label:`Internet ${i}`,ownerScope:i===501?'related_read_only' as const:'current_user' as const,data:{valueInCents:100,dueDay:1,...(i===502?{installmentTotal:1,installmentsCompleted:1}:{})}}))};
 const committed=new Set<string>();let commits=0;
 const finance:FinanceCommandService={loadCatalog:async()=>catalog,prepareActions:async(_uid,items)=>({actions:items.map(item=>buildAssistantDraft(item)),catalog}),updateDraft:async(_uid,item)=>item,retryNotification:async()=>({success:true,message:''}),execute:async(uid,item,_catalog,grant)=>{expect(validateAssistantExecutionAuthorization(uid,item,grant)).toBe(true);committed.add(item.clientActionId);commits++;return {success:true,message:'Paga'};}};
 const {conversation}=harness([],{finance,interpret:async()=>({text:'',actions:[],reportRequests:[],toolCallCount:1,batchRequests:[{kind:'pay_mandatory_expense',query:'Internet',payload:{bankRef:'nubank',date:'2026-10-02'}}]})});
 await conversation.send('Pague todas as contas de internet');expect(committed.size).toBe(0);
 await conversation.send('confirmo');expect(committed.size).toBe(501);expect(commits).toBe(501);
 await conversation.send('sim');expect(commits).toBe(501);
 expect(conversation.snapshot().messages.some(item=>'text' in item&&item.text.includes('1 sem permissão'))).toBe(true);
});


test('sim enviado antes do resumo não autoriza confirmação criada posteriormente na fila',async()=>{
 let release!:()=>void;let entered!:()=>void;
 const enteredModel=new Promise<void>(resolve=>{entered=resolve;});
 const wait=new Promise<void>(resolve=>{release=resolve;});
 const {conversation,committed}=harness([],{interpret:async()=>{entered();await wait;return {text:'',actions:[proposal,{...proposal,payload:{...proposal.payload,valueInCents:1000}}],reportRequests:[],toolCallCount:0};}});
 const order=conversation.send('Registre duas despesas');await enteredModel;
 const earlyYes=conversation.send('sim');release();await order;await earlyYes;
 expect(committed.size).toBe(0);
 await conversation.send('confirmo');expect(committed.size).toBe(2);
});

test('interpretação não recebe a próxima mensagem já enfileirada',async()=>{
 let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});
 const seen:string[][]=[];let first=true;
 const {conversation}=harness([],{interpret:async(_text,state)=>{seen.push(state.messages.filter(item=>item.role==='user'&&'text'in item).map(item=>'text'in item?item.text:''));if(first){first=false;await wait;}return {text:'Explicação geral',actions:[],reportRequests:[],toolCallCount:0};}});
 const a=conversation.send('O que significa conciliação?');
 const b=conversation.send('Explique com exemplo');release();await a;await b;
 expect(seen[0]).toEqual(['O que significa conciliação?']);
 expect(seen[1]).toEqual(['O que significa conciliação?','Explique com exemplo']);
});


test('redação remove UID de terceiros explícito e IDs reais dentro de dados do catálogo',()=>{
 expect(redactAssistantPersonalData('Vincule a conta com UID target-real-123','authenticated-user')).not.toContain('target-real-123');
 const result=searchAssistantCatalog({banks:[{handle:'opaque_bank',realId:'real-bank-123',label:'Conta real-bank-123',description:'Dono third-user-789',data:{personId:'third-user-789'}}]},[],'banks','Conta',false,'authenticated-user');
 expect(JSON.stringify(result)).not.toContain('real-bank-123');expect(JSON.stringify(result)).not.toContain('third-user-789');
 expect(result.items[0]!.handle).toBe('opaque_bank');
});


test('quantidade explícita diferente do conjunto encontrado não seleciona os primeiros nem amplia o lote',async()=>{
 const catalog={mandatoryExpenses:Array.from({length:6},(_,i)=>({handle:`item${i}`,realId:`real${i}`,label:`Internet ${i}`,data:{valueInCents:100,dueDay:1}}))};
 const execute=jest.fn(async()=>({success:true,message:'Paga'}));
 const finance:FinanceCommandService={loadCatalog:async()=>catalog,prepareActions:async(_uid,items)=>({actions:items.map(item=>buildAssistantDraft(item)),catalog}),updateDraft:async(_uid,item)=>item,retryNotification:async()=>({success:true,message:''}),execute};
 const {conversation}=harness([],{finance,interpret:async()=>({text:'',actions:[],reportRequests:[],toolCallCount:1,batchRequests:[{kind:'pay_mandatory_expense',query:'Internet',payload:{bankRef:'nubank',date:'2026-10-02'}}]})});
 await conversation.send('Pague as cinco contas de internet');await conversation.send('sim');
 expect(execute).not.toHaveBeenCalled();expect(conversation.snapshot().drafts).toHaveLength(0);
 expect(conversation.snapshot().messages.some(item=>'text' in item&&item.text.includes('pediu 5 itens'))).toBe(true);
});


test('pergunta conceitual não lê catálogo pessoal e ainda preserva o pedido pendente',async()=>{
 const loadCatalog=jest.fn(async()=>({})); const interpret=jest.fn(async(_text: string, _state: {catalog: object})=>({text:'Juros são o custo do empréstimo.',actions:[],reportRequests:[],toolCallCount:0}));
 const {conversation}=harness([],{finance:{loadCatalog,prepareActions:async()=>({actions:[],catalog:{}}),updateDraft:async(_uid,draft)=>draft,execute:async()=>({success:false,message:''}),retryNotification:async()=>({success:true,message:''})},interpret});
 await conversation.send('O que são juros?');expect(loadCatalog).not.toHaveBeenCalled();
 expect(interpret.mock.calls[0]?.[1]?.catalog).toEqual({});
});


test('retry de lembrete após commit não repete efeito financeiro e limpa somente a falha de agenda',async()=>{
 const execute=jest.fn(async()=>({success:true,message:'Despesa salva',notificationWarning:'Não consegui agendar'}));
 const retryNotification=jest.fn(async()=>({success:true,message:'Lembrete atualizado'}));
 const finance:FinanceCommandService={loadCatalog:async()=>({banks:[{handle:'nubank',realId:'bank',label:'Nubank'}],expenseCategories:[{handle:'food',realId:'tag',label:'Alimentação'}]}),prepareActions:async(_uid,items)=>({actions:items.map(item=>buildAssistantDraft(item)),catalog:{}}),updateDraft:async(_uid,draft)=>draft,execute,retryNotification};
 const {conversation}=harness([proposal],{finance});
 await conversation.send('Registre R$ 82,90 de mercado hoje no Nubank, categoria alimentação');
 await conversation.send('tente o lembrete novamente');
 expect(execute).toHaveBeenCalledTimes(1);expect(retryNotification).toHaveBeenCalledTimes(1);
 expect(conversation.snapshot().drafts[0]?.status).toBe('succeeded');expect(conversation.snapshot().drafts[0]?.result?.notificationWarning).toBeUndefined();
 await conversation.send('tente o lembrete novamente');expect(retryNotification).toHaveBeenCalledTimes(1);
});
