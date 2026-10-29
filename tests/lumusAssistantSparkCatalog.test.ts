const mockContext = jest.fn(), mockAccounts = jest.fn(), mockEvents = jest.fn(), mockPlans = jest.fn(), mockLegacy = jest.fn();
const mockRead = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ db: {} }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkAccountReadFirebase', () => ({ readSparkAccountsFirebase: (...args: unknown[]) => mockAccounts(...args) }));
jest.mock('@/functions/SparkFinancialReadFirebase', () => ({ readSparkFinancialEventsFirebase: (...args: unknown[]) => mockEvents(...args) }));
jest.mock('@/functions/SparkRecurringReadFirebase', () => ({ readSparkRecurringPlansFirebase: (...args: unknown[]) => mockPlans(...args) }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ getFinancialLedgerContextFirebase: mockLegacy }));
jest.mock('firebase/firestore', () => ({ collection: (_db: unknown, name: string) => ({ name }), where: (field: string, op: string, id: string) => ({ field, id }), limit: (count: number) => ({ count }), startAfter: (cursor: any) => ({ cursor }), query: (source: any, ...constraints: any[]) => ({ source, constraints }), getDocsFromServer: (...args: unknown[]) => mockRead(...args), getDocs: () => { throw new Error('Leitura legada indevida'); } }));
import { prepareAssistantActions, getPendingMandatoryCatalogItems, loadAssistantResolvedCatalog, toAssistantModelCatalog, resetAssistantCatalogSession } from '@/services/lumusAssistant/assistantCatalogService';
const account = (id: string, kind = 'bank', active = true) => ({ accountId: id, position: { kind, active, balanceInCents: 2345, revision: 2 }, lifecycle: { isActive: active, archived: false }, catalog: { name: id === 'cash' ? 'Dinheiro' : 'Conta ' + id }, principal: null });
const movement = (id: string, kind = 'expense', actorId = 'owner') => ({ originalOperationId: id, originalSource: 'live', executionReference: { source: 'live', operationId: id, family: 'ordinary' }, economicKind: kind, deltaInCents: kind === 'expense' ? -100 : 100, actorId, details: { name: 'Movimento ' + id }, effectiveAt: new Date('2026-10-25T15:00:00Z') });
beforeEach(() => { jest.clearAllMocks(); mockContext.mockReset().mockResolvedValue({ groupId: 'group', actorId: 'owner', role: 'member' }); mockAccounts.mockReset().mockResolvedValue([account('bank'), account('cash','cash'), account('inv','investment'), account('inactive','bank',false)]); mockEvents.mockReset().mockResolvedValue([movement('one'),movement('other','income','other')]); mockPlans.mockReset().mockResolvedValue([{ id: 'plan', actorId: 'owner', recurringType: 'expense', name: 'Aluguel', active: true }]); mockRead.mockReset().mockResolvedValue({ docs: [] }); resetAssistantCatalogSession(); });
it('usa contas nativas e Caixa real sem consultar razão ou fontes antigas', async () => {
 const catalog = await loadAssistantResolvedCatalog('owner'); expect(catalog.banks?.map(item => item.realId)).toEqual(['bank','cash']); expect(catalog.investments?.[0]?.collection).toBe('sparkPositions'); expect(catalog.banks?.[0]?.data?.currentBalanceInCents).toBe(2345); expect(mockLegacy).not.toHaveBeenCalled(); expect(catalog.mandatoryExpenses?.[0]?.realId).toBe('plan');
});
it('preserva origem e referência ordinária e marca movimento de outro membro somente leitura', async () => {
 const catalog = await loadAssistantResolvedCatalog('owner'); expect(catalog.expenses?.[0]?.collection).toBe('sparkOperations'); expect(catalog.expenses?.[0]?.data?.sparkExecutionReference).toMatchObject({ operationId: 'one' }); expect(catalog.gains?.[0]?.ownerScope).toBe('related_read_only');
 const model = JSON.stringify(toAssistantModelCatalog(catalog)); expect(model).not.toContain('sparkOperations'); expect(model).not.toContain('currentBalanceInCents');
});
it('erro nativo não consulta legado nem retorna catálogo vazio', async () => {
 mockAccounts.mockRejectedValueOnce(new Error('offline')); await expect(loadAssistantResolvedCatalog('owner')).rejects.toThrow('offline'); expect(mockLegacy).not.toHaveBeenCalled();
});
it('recusa acesso alterado no final da consulta', async () => {
 mockContext.mockResolvedValueOnce({ groupId: 'group', role: 'member' }).mockResolvedValueOnce(null); await expect(loadAssistantResolvedCatalog('owner')).rejects.toThrow('acesso financeiro mudou');
});
it('pagina categorias do grupo, remove excluídas e não inventa Caixa ausente', async () => {
 mockAccounts.mockResolvedValue([account('bank')]);
 const rows = Array.from({ length: 201 }, (_, i) => ({ id: 'category-' + i, data: () => ({ name: 'Categoria ' + i, groupId: 'group', personId: 'other', usageType: 'expense', deleted: i === 200 }) }));
 mockRead.mockImplementation(async ({ constraints }: any) => { if (constraints.some((c: any) => c.field === 'personId')) return { docs: [] }; const cursor = constraints.find((c: any) => c.cursor); return { docs: cursor ? rows.slice(200) : rows.slice(0,200) }; });
 const catalog = await loadAssistantResolvedCatalog('owner'); expect(catalog.categories).toHaveLength(200); expect(catalog.categories?.[0]?.ownerScope).toBe('related_read_only'); expect(catalog.banks).toHaveLength(1); expect(mockRead).toHaveBeenCalledTimes(3);
});
it('renova handles da sessão sem alterar identidades locais', async () => {
 const before = await loadAssistantResolvedCatalog('owner'); resetAssistantCatalogSession('owner'); const after = await loadAssistantResolvedCatalog('owner'); expect(after.gains?.[0]?.realId).toBe(before.gains?.[0]?.realId); expect(after.gains?.[0]?.handle).not.toBe(before.gains?.[0]?.handle);
});


it('oferece saques ativos uma vez, sem transferências, aportes ou estornos já resolvidos', async () => {
 const pair = (id: string, extra: Record<string,unknown> = {}) => ({...movement(id),kind:'transfer',term:'delta',accountId:'cash',counterpartyAccountId:'bank',deltaInCents:123,economicKind:null,executionReference:{source:'live',operationId:id,family:'pair'},...extra});
 mockEvents.mockResolvedValue([pair('active'),pair('reversed'),pair('reversal',{deltaInCents:-123,executionReference:null,resolvesOperationId:'reversed',resolvesOriginalSource:'live'}),pair('deposit',{kind:'investment_deposit'}),pair('incoming-bank',{accountId:'bank',counterpartyAccountId:'cash'})]);
 const catalog=await loadAssistantResolvedCatalog('owner');expect(catalog.cashWithdrawals?.map(item=>item.realId)).toEqual(['active']);expect(catalog.cashWithdrawals?.[0]?.data?.sparkExecutionReference).toMatchObject({family:'pair',operationId:'active'});
});
it('mantém saque de outro membro somente leitura e separa identidades importadas', async () => {
 mockEvents.mockResolvedValue([{...movement('shared','expense','other'),kind:'transfer',term:'delta',accountId:'cash',counterpartyAccountId:'bank',deltaInCents:123,economicKind:null,originalSource:'imported',executionReference:{source:'imported',operationId:'shared',family:'pair'}}]);
 const catalog=await loadAssistantResolvedCatalog('owner');expect(catalog.cashWithdrawals?.[0]?.ownerScope).toBe('related_read_only');expect(catalog.cashWithdrawals?.[0]?.collection).toBe('sparkImportedIdentities');
});


it.each(['expense','gain'] as const)('seleção de %s pendente reconhece ciclos Spark como lista de meses', type => {
 const source=type==='expense'?'mandatoryExpenses':'mandatoryGains';
 const item=(handle:string,completedCycles:unknown)=>({handle,label:handle,realId:handle,collection:'sparkRecurringPlans',data:{installmentTotal:null,installmentsCompleted:0,completedCycles}});
 expect(getPendingMandatoryCatalogItems({[source]:[item('paid',['2026-10']),item('pending',['2026-09'])]},type,'2026-10').map(entry=>entry.handle)).toEqual(['pending']);
});


it('mantém plano arquivado com ciclo atual efetivado para desfazer, sem oferecê-lo para pagamento',async()=>{
 jest.useFakeTimers().setSystemTime(new Date('2026-10-26T15:00:00Z'));
 try{
  mockPlans.mockResolvedValue([{id:'archived',actorId:'owner',recurringType:'expense',name:'Arquivado',active:false,installmentTotal:3,installmentsCompleted:3,cycleStates:[{cycle:'2026-10',active:true,installmentsAfter:3}]},{id:'empty',actorId:'owner',recurringType:'expense',name:'Sem ciclo',active:false,cycleStates:[]}]);
  const catalog=await loadAssistantResolvedCatalog('owner');expect(catalog.mandatoryExpenses?.map(item=>item.realId)).toEqual(['archived','empty']);expect(getPendingMandatoryCatalogItems(catalog,'expense','2026-10')).toHaveLength(0);
  const undo=(await prepareAssistantActions('owner',[{kind:'undo_mandatory_expense_payment',payload:{}}],catalog)).actions[0]!;expect(undo.missingFields.find(field=>field.key==='recordRef')?.choices?.map(item=>item.label)).toEqual(['Arquivado']);
 }finally{jest.useRealTimers();}
});
it('plano de outro titular permanece somente leitura inclusive para administrador',async()=>{
 mockContext.mockResolvedValue({groupId:'group',actorId:'owner',role:'admin'});mockPlans.mockResolvedValue([{id:'foreign',actorId:'other',recurringType:'gain',name:'Recebimento de outro titular',active:true}]);
 const catalog=await loadAssistantResolvedCatalog('owner');expect(catalog.mandatoryGains?.[0]?.ownerScope).toBe('related_read_only');
});
