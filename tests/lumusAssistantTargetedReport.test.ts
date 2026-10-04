const mockGetDocs = jest.fn();
const mockGetLedgerContext = jest.fn();
const mockGetRelatedUsers = jest.fn();
const mockGetHome = jest.fn();

jest.mock('@/FirebaseConfig', () => ({ db: {} }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ getFinancialLedgerContextFirebase: (...args: unknown[]) => mockGetLedgerContext(...args) }));
jest.mock('@/functions/RegisterUserFirebase', () => ({ getRelatedUsersIDsFirebase: (...args: unknown[]) => mockGetRelatedUsers(...args) }));
jest.mock('@/functions/HomeFirebase', () => ({
 getHomeBalancesFirebase: async (...args:unknown[]) => {const result=await mockGetHome(...args);return result?.data?.overview;},
 getHomeInvestmentsFirebase: async (...args:unknown[]) => {const result=await mockGetHome(...args);return result?.data?.investments;},
}));
jest.mock('firebase/firestore', () => ({
	collection: (_db: unknown, name: string) => name,
	query: (name: string, ...filters: unknown[]) => ({ name, filters }),
	where: (field: string, operator: string, value: unknown) => ({ field, operator, value }),
	orderBy: (field: string, direction: string) => ({ field, direction }),
 limit: (count: number) => ({ limit:count }),
 startAfter: (document: unknown) => ({ cursor:document }),
	Timestamp: { fromDate: (date: Date) => date },
	getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));

import { assistantReportService } from '@/services/lumusAssistant/assistantReportService';

let documentSequence=0;
const document = (data: Record<string, unknown>) => ({ id: `fixture-${++documentSequence}`, data: () => data });
const at = (iso: string) => ({ toDate: () => new Date(iso) });

describe('Lumus targeted financial answers', () => {
	beforeEach(() => {
		mockGetDocs.mockReset();
		mockGetLedgerContext.mockReset().mockResolvedValue(null);
		mockGetRelatedUsers.mockReset().mockResolvedValue({ success: true, data: ['related-user'] });
	});

	it('finds the largest expense across the whole month, not just the six Home movements', async () => {
		mockGetDocs.mockResolvedValue({ docs: [
			...Array.from({ length: 8 }, (_, index) => document({ name: `Compra ${index}`, valueInCents: 1000 + index, date: at('2026-09-20T12:00:00.000Z') })),
			document({ name: 'Compra maior', valueInCents: 90000, date: at('2026-09-02T12:00:00.000Z') }),
			document({ name: 'Transferência', valueInCents: 120000, date: at('2026-09-03T12:00:00.000Z'), isBankTransfer: true }),
			document({ name: 'Investimento', valueInCents: 150000, date: at('2026-09-04T12:00:00.000Z'), isInvestmentDeposit: true }),
		] });
		const report = await assistantReportService.createReport('current-user', { kind: 'largest_expense', period: '2026-09' }, {});
		expect(report.deterministicSummary.replace(/\u00a0/g, ' ')).toContain('Compra maior: R$ 900,00, em 02/09/2026');
		expect(report.chart).toBeUndefined();
		expect(mockGetDocs.mock.calls[0][0].filters).toEqual(expect.arrayContaining([
			{ field: 'personId', operator: 'in', value: ['current-user', 'related-user'] },
			{ field: 'date', operator: '>=', value: new Date('2026-09-01T03:00:00.000Z') },
		]));
	});

	it('uses ledger transactions for a migrated account and ignores transfers', async () => {
		mockGetLedgerContext.mockResolvedValue({ groupId: 'group-1', role: 'member' });
		mockGetDocs.mockResolvedValue({ docs: [
			document({ kind: 'transfer', effectiveAt: at('2026-08-15T12:00:00.000Z'), note: 'Movimento interno', legs: [{ accountId: 'account-1', deltaInCents: -999999 }] }),
			document({ kind: 'expense', effectiveAt: at('2026-08-10T12:00:00.000Z'), note: 'Aluguel', legs: [{ accountId: 'account-1', deltaInCents: -75000 }, { accountId: null, deltaInCents: 75000 }] }),
		] });
		const report = await assistantReportService.createReport('current-user', { kind: 'largest_expense', period: '2026-08' }, {});
		expect(report.deterministicSummary.replace(/\u00a0/g, ' ')).toContain('Aluguel: R$ 750,00');
		expect(mockGetRelatedUsers).not.toHaveBeenCalled();
		expect(mockGetDocs.mock.calls[0][0].name).toBe('ledgerTransactions');
		expect(mockGetDocs.mock.calls[0][0].filters).toEqual(expect.arrayContaining([
			{ field: 'effectiveAt', operator: '<', value: new Date('2026-09-01T03:00:00.000Z') },
		]));
	});

	it('returns the largest gain from the gain collection', async () => {
		mockGetDocs.mockResolvedValue({ docs: [
			document({ name: 'Venda', valueInCents: 12000, date: at('2026-08-05T12:00:00.000Z') }),
			document({ name: 'Rendimento', valueInCents: 30000, date: at('2026-08-09T12:00:00.000Z') }),
		] });
		const report = await assistantReportService.createReport('current-user', { kind: 'largest_gain', period: '2026-08' }, {});
		expect(report.deterministicSummary.replace(/\u00a0/g, ' ')).toContain('Rendimento: R$ 300,00');
		expect(mockGetDocs.mock.calls[0][0].name).toBe('gains');
	});

	it('answers the smallest expense instead of reusing the largest expense', async () => {
		mockGetDocs.mockResolvedValue({ docs: [
			document({ name: 'Conta maior', valueInCents: 90000, date: at('2026-09-20T12:00:00.000Z') }),
			document({ name: 'Compra menor', valueInCents: 750, date: at('2026-09-10T12:00:00.000Z') }),
			document({ name: 'Depósito', valueInCents: 100, date: at('2026-09-11T12:00:00.000Z'), isInvestmentDeposit: true }),
		] });
		const report = await assistantReportService.createReport('current-user', { kind: 'smallest_expense', period: '2026-09' }, {});
		expect(report.deterministicSummary.replace(/\u00a0/g, ' ')).toContain('menor gasto em setembro de 2026 foi Compra menor: R$ 7,50');
	});

	it('selects the smallest gain from a migrated ledger without counting transfers', async () => {
		mockGetLedgerContext.mockResolvedValue({ groupId: 'group-1', role: 'member' });
		mockGetDocs.mockResolvedValue({ docs: [
			document({ kind: 'income', effectiveAt: at('2026-08-09T12:00:00.000Z'), note: 'Venda maior', legs: [{ accountId: 'account-1', deltaInCents: 50000 }] }),
			document({ kind: 'income', effectiveAt: at('2026-08-10T12:00:00.000Z'), note: 'Venda menor', legs: [{ accountId: 'account-1', deltaInCents: 1200 }] }),
			document({ kind: 'transfer', effectiveAt: at('2026-08-11T12:00:00.000Z'), note: 'Entre contas', legs: [{ accountId: 'account-1', deltaInCents: 100 }] }),
		] });
		const report = await assistantReportService.createReport('current-user', { kind: 'smallest_gain', period: '2026-08' }, {});
		expect(report.deterministicSummary.replace(/\u00a0/g, ' ')).toContain('menor ganho em agosto de 2026 foi Venda menor: R$ 12,00');
	});

	it('defaults to the current São Paulo month and excludes future dated records', async () => {
		jest.useFakeTimers().setSystemTime(new Date('2026-09-01T02:30:00.000Z'));
		try {
			mockGetDocs.mockResolvedValue({ docs: [] });
			await assistantReportService.createReport('current-user', { kind: 'largest_expense' }, {});
			expect(mockGetDocs.mock.calls[0][0].filters).toEqual(expect.arrayContaining([
				{ field: 'date', operator: '>=', value: new Date('2026-08-01T03:00:00.000Z') },
				{ field: 'date', operator: '<', value: new Date('2026-09-01T03:00:00.000Z') },
			]));
		} finally {
			jest.useRealTimers();
		}
	});

	it('answers an empty month and rejects a future month without reading transactions', async () => {
		mockGetDocs.mockResolvedValue({ docs: [] });
		const report = await assistantReportService.createReport('current-user', { kind: 'largest_gain', period: '2026-08' }, {});
		expect(report.deterministicSummary).toBe('Não encontrei ganhos registrados em agosto de 2026.');
		await expect(assistantReportService.createReport('current-user', { kind: 'largest_expense', period: '2099-01' }, {}))
			.rejects.toThrow('mês válido');
		expect(mockGetDocs).toHaveBeenCalledTimes(1);
	});
});


test('pesquisa o período inteiro com cursor e encontra o registro fora das duas primeiras páginas', async () => {
 mockGetLedgerContext.mockResolvedValue(null);
 mockGetRelatedUsers.mockResolvedValue({success:true,data:[]});
 mockGetDocs.mockReset();
 const pages=[...Array.from({length:400},(_,i)=>document({name:`Item ${i}`,valueInCents:100,date:at('2026-08-10T12:00:00Z'),bankId:'bank'})), document({name:'Registro antigo encontrado',valueInCents:12345,date:at('2026-08-02T12:00:00Z'),bankId:'bank'})];
 let page=0;
 mockGetDocs.mockImplementation(async (query:{name:string})=>({docs:query.name==='expenses'?pages.slice(200*page,200*++page):[]}));
 const report=await assistantReportService.createReport('current-user',{kind:'transaction_search',query:'antigo',period:'2026-08'},{});
 expect(report.metrics[0].value).toBe(1);
 expect(report.metrics[2].valueInCents).toBe(12345);
 expect(mockGetDocs.mock.calls.filter(([q])=>q.name==='expenses')).toHaveLength(3);
 expect(mockGetDocs.mock.calls.some(([q])=>q.filters.some((f:{cursor?:unknown})=>f.cursor))).toBe(true);
});

test('ranking no razão descarta original estornado em outro mês', async () => {
 mockGetLedgerContext.mockResolvedValue({groupId:'group-1',role:'member'});
 const original=document({kind:'expense',note:'Estornada',effectiveAt:at('2026-08-10T12:00:00Z'),legs:[{accountId:'account-1',deltaInCents:-90000}]});
 const active=document({kind:'expense',note:'Ativa',effectiveAt:at('2026-08-10T12:00:00Z'),legs:[{accountId:'account-1',deltaInCents:-5000}]});
 mockGetDocs.mockReset().mockImplementation(async (q:{filters:Array<{field?:string}>})=>({docs:q.filters.some(f=>f.field==='effectiveAt')?[original,active]:[document({kind:'reversal',reversesTransactionId:original.id,effectiveAt:at('2026-09-10T12:00:00Z')})]}));
 const report=await assistantReportService.createReport('current-user',{kind:'largest_expense',period:'2026-08'},{});
 expect(report.metrics[0].valueInCents).toBe(5000);
});


test('saldo pontual usa posição persistida e recusa período histórico sem inventar',async()=>{
 mockGetHome.mockResolvedValue({success:true,data:{overview:{success:true,data:{bankBalances:[{id:'bank',name:'Nubank',balanceInCents:91710}],cashSummary:{balanceInCents:500}}}}});
 const report=await assistantReportService.createReport('current-user',{kind:'account_balance',bankRef:'bank-ref'},{banks:[{handle:'bank-ref',realId:'bank',label:'Nubank'}]});
 expect(report.metrics).toEqual([{label:'Nubank',valueInCents:91710}]);
 await expect(assistantReportService.createReport('current-user',{kind:'account_balance',period:'2026-08'},{})).rejects.toThrow('posição atual');
});

test('pendências atuais excluem parcelas encerradas e futuras e calculam centavos da última parcela',async()=>{
 jest.useFakeTimers().setSystemTime(new Date('2026-10-02T10:00:00Z'));
 try{
 const item=(id:string,data:Record<string,unknown>)=>({handle:id,realId:id,label:id,data});
 const report=await assistantReportService.createReport('current-user',{kind:'pending_obligations'},{mandatoryExpenses:[
 item('Internet',{valueInCents:1000,dueDay:1}),item('Paga',{valueInCents:3000,dueDay:1,lastPaymentCycle:'2026-10'}),
 item('Encerrada',{valueInCents:333,installmentTotal:3,installmentsCompleted:3}),
 item('Última parcela',{valueInCents:333,installmentTotal:3,installmentsCompleted:2,installmentTotalValueInCents:1000}),
 item('Futura',{valueInCents:1000,installmentStartDate:new Date('2026-11-01T15:00:00Z')}),
 ],mandatoryGains:[item('Venda',{valueInCents:500,dueDay:5})]});
 expect(report.metrics.map(item=>item.valueInCents??item.value)).toEqual([1334,500,3]);
 expect(report.deterministicSummary).toContain('Última parcela');
 expect(report.deterministicSummary).not.toContain('Encerrada');
 }finally{jest.useRealTimers();}
});

test('histórico legado desconhecido não é apresentado como obrigação aberta',async()=>{
 mockGetLedgerContext.mockResolvedValue(null);
 const report=await assistantReportService.createReport('current-user',{kind:'pending_obligations',period:'2026-08'},{mandatoryExpenses:[{handle:'old',realId:'old',label:'Antiga',data:{valueInCents:1000,dueDay:1,lastPaymentCycle:'2026-09'}}],mandatoryGains:[]});
 expect(report.metrics[2].value).toBe(0);
 expect(report.deterministicSummary).toContain('preservou apenas o último ciclo');
 expect(report.deterministicSummary).toContain('totais acima são parciais');
});

test('razão não prova períodos anteriores à criação da recorrência nem reconstrói histórico legado por ausência de evento',async()=>{
 mockGetLedgerContext.mockResolvedValue({groupId:'group-1',role:'member'});
 mockGetDocs.mockResolvedValue({docs:[]});
 const report=await assistantReportService.createReport('current-user',{kind:'pending_obligations',period:'2019-08'},{mandatoryExpenses:[
  {handle:'new',realId:'new',label:'Nova em 2026',data:{valueInCents:1000,dueDay:1,assistantCycleHistoryComplete:true,createdAt:at('2026-01-10T12:00:00Z')}},
  {handle:'old',realId:'old',label:'Migrada sem histórico',data:{valueInCents:1000,dueDay:1}},
 ],mandatoryGains:[]});
 expect(report.metrics[2].value).toBe(0);
 expect(report.deterministicSummary).not.toContain('Nova em 2026');
 expect(report.deterministicSummary).toContain('1 obrigação(ões) antigas');
});

test('CDI lê vigência cadastrada no grupo e distingue fonte de cotação externa',async()=>{
 mockGetLedgerContext.mockResolvedValue({groupId:'group-1',role:'member'});
 mockGetDocs.mockResolvedValue({docs:[document({annualRateInBasisPoints:1490,effectiveFrom:at('2026-08-01T03:00:00Z')})]});
 const report=await assistantReportService.createReport('current-user',{kind:'cdi_rates'},{});
 expect(report.deterministicSummary).toContain('14,90% ao ano');
 expect(report.deterministicSummary).toContain('não consultei uma cotação externa');
 expect(mockGetDocs.mock.calls.at(-1)[0].filters).toContainEqual({field:'groupId',operator:'==',value:'group-1'});
});


test('saldo de Caixa migrado reconhece kind cash com handle opaco',async()=>{
 mockGetHome.mockResolvedValue({success:true,data:{overview:{success:true,data:{bankBalances:[],cashSummary:{balanceInCents:2345}}}}});
 const report=await assistantReportService.createReport('current-user',{kind:'account_balance',bankRef:'account_opaque'},{banks:[{handle:'account_opaque',realId:'real-cash',label:'Caixa',data:{kind:'cash'}}]});
 expect(report.metrics).toEqual([{label:'Caixa',valueInCents:2345}]);
});
