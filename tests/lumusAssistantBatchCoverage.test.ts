jest.mock('@/FirebaseConfig', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({}));

import { expandAssistantBatch, getExplicitAssistantBatchCount } from '@/services/lumusAssistant/assistantBatchService';
import { AssistantFriendlyError } from '@/utils/lumusAssistantErrors';
import { createAssistantConversation } from '@/services/lumusAssistant/assistantConversationService';
import { validateAssistantExecutionAuthorization } from '@/services/lumusAssistant/assistantAuthorization';
import { buildAssistantDraft } from '@/utils/lumusAssistant';
import { ASSISTANT_ACTION_KINDS } from '@/types/lumusAssistant';
import type { AssistantActionKind, AssistantAiConversationResponse, AssistantCatalogType, AssistantDraftAction, AssistantExecuteResult, AssistantModelActionProposal, AssistantResolvedCatalog, FinanceCommandService } from '@/types/lumusAssistant';

type BatchRequest = NonNullable<AssistantAiConversationResponse['batchRequests']>[number];
type BatchCase = { kind: AssistantActionKind; source: AssistantCatalogType; field: 'recordRef' | 'investmentRef' | 'bankRef' | 'sourceBankRef'; payload: Record<string, unknown> };
const COUNT = 211;
test.each([
	'Pague as cinco contas de internet',
	'Resgate cinco investimentos',
	'Aporte R$ 10 em cinco investimentos',
	'Transfira R$ 10 de cinco bancos para o principal',
	'Saque das cinco contas',
	'Ajuste os cinco bancos',
])('preserva a quantidade humana em %s', text => expect(getExplicitAssistantBatchCount(text)).toBe(5));
const DATE = '2026-10-03';
const movement = { valueInCents: 100, date: DATE };
const cases: BatchCase[] = [
	{ kind: 'update_expense', source: 'expenses', field: 'recordRef', payload: { valueInCents: 100 } },
	{ kind: 'delete_expense', source: 'expenses', field: 'recordRef', payload: {} },
	{ kind: 'update_gain', source: 'gains', field: 'recordRef', payload: { valueInCents: 100 } },
	{ kind: 'delete_gain', source: 'gains', field: 'recordRef', payload: {} },
	{ kind: 'undo_cash_withdrawal', source: 'cashWithdrawals', field: 'recordRef', payload: {} },
	{ kind: 'update_mandatory_expense', source: 'mandatoryExpenses', field: 'recordRef', payload: { dueDay: 2 } },
	{ kind: 'delete_mandatory_expense', source: 'mandatoryExpenses', field: 'recordRef', payload: {} },
	{ kind: 'pay_mandatory_expense', source: 'mandatoryExpenses', field: 'recordRef', payload: { bankRef: 'principal', ...movement } },
	{ kind: 'undo_mandatory_expense_payment', source: 'mandatoryExpenses', field: 'recordRef', payload: {} },
	{ kind: 'update_mandatory_gain', source: 'mandatoryGains', field: 'recordRef', payload: { dueDay: 2 } },
	{ kind: 'delete_mandatory_gain', source: 'mandatoryGains', field: 'recordRef', payload: {} },
	{ kind: 'receive_mandatory_gain', source: 'mandatoryGains', field: 'recordRef', payload: { bankRef: 'principal', ...movement } },
	{ kind: 'undo_mandatory_gain_receipt', source: 'mandatoryGains', field: 'recordRef', payload: {} },
	{ kind: 'update_investment', source: 'investments', field: 'recordRef', payload: { currentValueInCents: 1000 } },
	{ kind: 'delete_investment', source: 'investments', field: 'recordRef', payload: {} },
	{ kind: 'deposit_investment', source: 'investments', field: 'investmentRef', payload: movement },
	{ kind: 'redeem_investment', source: 'investments', field: 'investmentRef', payload: movement },
	{ kind: 'sync_investment', source: 'investments', field: 'investmentRef', payload: { syncedValueInCents: 1000, date: DATE } },
	{ kind: 'undo_investment_deposit', source: 'investmentDeposits', field: 'recordRef', payload: {} },
	{ kind: 'undo_investment_redemption', source: 'investmentRedemptions', field: 'recordRef', payload: {} },
	{ kind: 'undo_investment_sync', source: 'investmentSyncs', field: 'recordRef', payload: {} },
	{ kind: 'update_bank', source: 'banks', field: 'recordRef', payload: { colorHex: '#123456' } },
	{ kind: 'delete_bank', source: 'banks', field: 'recordRef', payload: {} },
	{ kind: 'update_category', source: 'categories', field: 'recordRef', payload: { iconLabel: 'Mercado' } },
	{ kind: 'delete_category', source: 'categories', field: 'recordRef', payload: {} },
	{ kind: 'revert_balance_adjustment', source: 'bankBalanceAdjustments', field: 'recordRef', payload: {} },
	{ kind: 'create_transfer', source: 'banks', field: 'sourceBankRef', payload: { targetBankRef: 'destination', ...movement } },
	{ kind: 'create_cash_withdrawal', source: 'banks', field: 'bankRef', payload: movement },
	{ kind: 'upsert_monthly_balance', source: 'banks', field: 'bankRef', payload: { cycle: '2026-10', valueInCents: 100000 } },
	{ kind: 'upsert_balance_adjustment', source: 'banks', field: 'bankRef', payload: { date: DATE, targetBalanceInCents: 100000 } },
];
const creations: AssistantActionKind[] = ['create_expense', 'create_gain', 'create_mandatory_expense', 'create_mandatory_gain', 'create_investment', 'create_bank', 'create_category', 'upsert_cdi_rate'];

beforeEach(() => jest.useFakeTimers({ now: new Date('2026-10-03T15:00:00Z'), doNotFake: ['performance'] }));
afterEach(() => jest.useRealTimers());

function catalogFor(source: AssistantCatalogType): AssistantResolvedCatalog {
	const catalog: AssistantResolvedCatalog = {
		banks: [{ handle: 'principal', realId: 'real-principal', label: 'Banco principal', data: { kind: 'bank' } }, { handle: 'destination', realId: 'real-destination', label: 'Destino', data: { kind: 'bank' } }],
	};
	catalog[source] = [...(catalog[source] ?? []), ...Array.from({ length: COUNT + 1 }, (_, index) => ({
		handle: `target-${index}`, realId: `real-${index}`, label: `Lote ${index}`,
		ownerScope: index === COUNT ? 'related_read_only' as const : 'current_user' as const,
		data: { valueInCents: 100, dueDay: 1, date: new Date(`${DATE}T15:00:00Z`), ...(source === 'banks' ? { kind: 'bank', isActive: true } : {}) },
	})), { handle: 'outside', realId: 'real-outside', label: 'Fora do filtro' }];
	return catalog;
}

/** A memória substitui somente o executor de domínio; seleção, estado, schema e grants são reais. */
function batchHarness(request: BatchRequest, catalog = catalogFor(cases.find(item => item.kind === request.kind)?.source ?? 'categories'), effect?: (draft: AssistantDraftAction, effects: Map<string, Record<string, unknown>>) => Promise<AssistantExecuteResult>, proposals?: AssistantModelActionProposal[]) {
	const effects = new Map<string, Record<string, unknown>>();
	const attempts: string[] = [];
	const stages = new Set<string>();
	let inFlight = 0;
	let maxInFlight = 0;
	const loadCatalog = jest.fn(async () => catalog);
	const prepareActions = jest.fn(async (_uid: string, proposals: AssistantModelActionProposal[]) => ({ actions: proposals.map(item => buildAssistantDraft(item)), catalog }));
	const invalidate = jest.fn(async () => {});
	const finance: FinanceCommandService = {
		loadCatalog, prepareActions,
		updateDraft: async (_uid, draft, patch) => buildAssistantDraft({ ...draft, payload: { ...draft.payload, ...patch } }),
		retryNotification: async () => ({ success: true, message: 'Notificação atualizada' }),
		execute: async (uid, draft, _catalog, grant) => {
			expect(validateAssistantExecutionAuthorization(uid, draft, grant)).toBe(true);
			expect(validateAssistantExecutionAuthorization('other-user', draft, grant)).toBe(false);
			expect(validateAssistantExecutionAuthorization(uid, { ...draft, payload: { ...draft.payload, description: 'alterado' } }, grant)).toBe(false);
			attempts.push(draft.clientActionId); inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
			try {
				if (effect) return await effect(draft, effects);
				if (!effects.has(draft.clientActionId)) effects.set(draft.clientActionId, { ...draft.payload });
				return { success: true, message: 'Efeito persistido no executor sintético' };
			} finally { inFlight--; }
		},
	};
	const interpret = jest.fn(async (): Promise<AssistantAiConversationResponse> => ({ text: '', actions: proposals ? [...proposals] : [], reportRequests: [], toolCallCount: 1, ...(proposals ? {} : { batchRequests: [request] }) }));
	const conversation = createAssistantConversation({
		uid: 'synthetic-user', finance, interpret, report: async () => 'Consulta sintética', onCommit: invalidate,
		onChange: state => { if (state.progress) stages.add(state.progress.active); },
	});
	return { conversation, effects, attempts, stages, interpret, loadCatalog, prepareActions, invalidate, maxInFlight: () => maxInFlight };
}

const texts = (conversation: ReturnType<typeof createAssistantConversation>) => conversation.snapshot().messages.flatMap(item => 'text' in item ? [item.text] : []);

test.each(cases)('$kind percorre 211 alvos de $source com um grant por item e uma confirmação', async testCase => {
	const harness = batchHarness({ kind: testCase.kind, query: 'Lote', payload: testCase.payload });
	await harness.conversation.send('Altere todos os registros do lote conforme o pedido');
	expect(harness.effects.size).toBe(0);
	expect(harness.conversation.snapshot().drafts).toHaveLength(COUNT);
	expect(harness.conversation.snapshot().drafts.every(item => item.status === 'ready')).toBe(true);
	await harness.conversation.send('confirmo');
	expect(harness.effects.size).toBe(COUNT);
	expect(new Set([...harness.effects.values()].map(item => item[testCase.field]))).toEqual(new Set(Array.from({ length: COUNT }, (_, index) => `target-${index}`)));
	expect(harness.conversation.snapshot().drafts.every(item => item.status === 'succeeded')).toBe(true);
	expect(harness.attempts).toHaveLength(COUNT);
	expect(harness.maxInFlight()).toBe(1);
	expect(harness.loadCatalog).toHaveBeenCalledTimes(1);
	expect(harness.prepareActions).toHaveBeenCalledTimes(1);
	expect(harness.interpret).toHaveBeenCalledTimes(1);
	expect(harness.invalidate).toHaveBeenCalledTimes(1);
	expect(harness.stages.has('executing_actions')).toBe(true);
	expect(texts(harness.conversation)).toEqual(expect.arrayContaining([expect.stringContaining('1 sem permissão'), '10 de 211 concluídas.', '210 de 211 concluídas.', '211 de 211 concluídas.']));
	await harness.conversation.send('sim');
	expect(harness.attempts).toHaveLength(COUNT);
	harness.conversation.dispose();
});

test.each(creations)('%s exige itens ditados e nunca inventa seleção de investimentos', kind => {
	expect(() => expandAssistantBatch({ kind, payload: {} }, catalogFor('investments'))).toThrow(AssistantFriendlyError);
});

test('o inventário cobre todos os kinds atuais como seleção elegível ou criação com itens próprios', () => {
	expect([...cases.map(item => item.kind), ...creations].sort()).toEqual([...ASSISTANT_ACTION_KINDS].sort());
});

test.each<AssistantActionKind>(['pay_mandatory_expense', 'receive_mandatory_gain'])('%s exclui parcelas fora do plano, ciclos concluídos e histórico insuficiente antes de executar', async kind => {
	const source = kind === 'pay_mandatory_expense' ? 'mandatoryExpenses' : 'mandatoryGains';
	const completedField = kind === 'pay_mandatory_expense' ? 'lastPaymentCycle' : 'lastReceiptCycle';
	const catalog = catalogFor(source);
	const excludedData = [
		{ completedCycles: { '2026-10': { operationId: 'already-committed' } } },
		{ [completedField]: '2026-10' },
		{ installmentTotal: 2, installmentsCompleted: 2 },
		{ installmentStartDate: '2026-11-01' },
		{ installmentEndDate: new Date('2026-09-30T15:00:00Z') },
		{ dueDay: 3 },
		{ dueDay: 4 },
	];
	catalog[source]!.push(...excludedData.map((data, index) => ({ handle: `excluded-${index}`, realId: `real-excluded-${index}`, label: `Lote excluído ${index}`, data: { dueDay: 1, ...data } })),
		{ handle: 'unknown-history', realId: 'real-unknown', label: 'Lote histórico incerto', data: { dueDay: 1, [completedField]: '2026-11' } },
		{ handle: 'known-history', realId: 'real-known', label: 'Lote histórico completo', data: { dueDay: 1, [completedField]: '2026-11', assistantCycleHistoryComplete: true, completedCycles: {} } });
	const harness = batchHarness({ kind, query: 'Lote', period: '2026-10', overdue: true, payload: { bankRef: 'principal', date: DATE } }, catalog);
	await harness.conversation.send('Pague todos os itens vencidos do lote');
	expect(harness.conversation.snapshot().drafts).toHaveLength(212);
	expect(texts(harness.conversation)).toEqual(expect.arrayContaining([expect.stringContaining('7 excluídos'), expect.stringContaining('1 sem histórico suficiente')]));
	await harness.conversation.send('confirmo');
	expect(harness.effects.size).toBe(212);
	expect([...harness.effects.values()].some(item => String(item.recordRef).startsWith('excluded-') || item.recordRef === 'unknown-history')).toBe(false);
	expect([...harness.effects.values()].some(item => item.recordRef === 'known-history')).toBe(true);
	harness.conversation.dispose();
});

test('lote por mês respeita a data civil paulista e não inclui o mês seguinte ou histórico sem data', () => {
	const catalog = catalogFor('expenses');
	catalog.expenses!.push(
		{ handle: 'september', realId: 'real-september', label: 'Lote setembro', data: { date: new Date('2026-10-01T02:59:59Z') } },
		{ handle: 'november', realId: 'real-november', label: 'Lote novembro', data: { effectiveAt: { toDate: () => new Date('2026-11-01T03:00:00Z') } } },
		{ handle: 'no-date', realId: 'real-no-date', label: 'Lote sem data' },
	);
	const selection = expandAssistantBatch({ kind: 'delete_expense', query: 'Lote', period: '2026-10', payload: {} }, catalog);
	expect(selection.proposals).toHaveLength(COUNT);
	expect(selection.excluded).toBe(3);
	expect(selection.readOnly).toBe(1);
});

test.each<AssistantActionKind>(['create_transfer', 'create_cash_withdrawal', 'upsert_monthly_balance', 'upsert_balance_adjustment'])('%s conta exclusões por tipo/estado de conta e não confunde período com criação do banco', kind => {
	const catalog = catalogFor('banks');
	catalog.banks!.push(
		{ handle: 'cash', realId: null, label: 'Lote Caixa', data: { kind: 'cash' } },
		{ handle: 'inactive', realId: 'real-inactive', label: 'Lote inativo', data: { kind: 'bank', isActive: false } },
		{ handle: 'archived', realId: 'real-archived', label: 'Lote arquivado', data: { kind: 'bank', archivedAt: new Date() } },
		{ handle: 'wrong-kind', realId: 'real-investment', label: 'Lote investimento', data: { kind: 'investment' } },
		{ handle: 'destination', realId: 'real-destination', label: 'Lote destino', data: { kind: 'bank', date: new Date('2025-01-01T15:00:00Z') } },
	);
	const selection = expandAssistantBatch({ kind, query: 'Lote', period: '2026-10', payload: { targetBankRef: 'destination' } }, catalog);
	expect(selection.proposals).toHaveLength(kind === 'create_transfer' ? 211 : 212);
	expect(selection.excluded).toBe(kind === 'create_transfer' ? 5 : 4);
	expect(selection.readOnly).toBe(1);
});

test('quantidade explícita divergente em conjunto acima de 200 não corta ou executa parte do lote', async () => {
	const harness = batchHarness({ kind: 'delete_expense', query: 'Lote', expectedCount: 210, payload: {} });
	await harness.conversation.send('Exclua os registros do lote');
	await harness.conversation.send('confirmo');
	expect(harness.effects.size).toBe(0);
	expect(harness.prepareActions).not.toHaveBeenCalled();
	expect(harness.conversation.snapshot().drafts).toHaveLength(0);
	expect(texts(harness.conversation)).toEqual(expect.arrayContaining([expect.stringContaining('pediu 210 itens')]));
	harness.conversation.dispose();
});

test.each([{human:5,model:211},{human:211,model:5}])('o modelo não substitui a quantidade humana $human por $model', async ({human,model}) => {
	const harness = batchHarness({ kind: 'delete_expense', query: 'Lote', expectedCount: model, payload: {} });
	await harness.conversation.send(`Exclua as ${human} despesas do lote`);
	await harness.conversation.send('confirmo');
	expect(harness.effects.size).toBe(0);
	expect(harness.prepareActions).not.toHaveBeenCalled();
	expect(texts(harness.conversation)).toEqual(expect.arrayContaining([expect.stringContaining(`Você pediu ${human} itens`)]));
	harness.conversation.dispose();
});

test('falha parcial e resposta perdida após commit reutilizam só os IDs falhos e reconciliam sem duplicar', async () => {
	const failedOnce = new Set<string>();
	const harness = batchHarness({ kind: 'update_category', query: 'Lote', payload: { iconLabel: 'Mercado' } }, undefined, async (draft, effects) => {
		const target = draft.payload.recordRef;
		if (effects.has(draft.clientActionId)) return { success: true, message: 'Recibo existente conferido' };
		if (target === 'target-5' && !failedOnce.has(draft.clientActionId)) { failedOnce.add(draft.clientActionId); return { success: false, message: 'Falha comprovada antes do commit' }; }
		effects.set(draft.clientActionId, { ...draft.payload });
		if (target === 'target-200' && !failedOnce.has(draft.clientActionId)) { failedOnce.add(draft.clientActionId); throw new Error('Timeout após commit'); }
		return { success: true, message: 'Alteração persistida' };
	});
	await harness.conversation.send('Altere todas as categorias do lote');
	await harness.conversation.send('confirmo');
	expect(harness.effects.size).toBe(210);
	const failedIds = harness.conversation.snapshot().drafts.filter(item => item.status === 'failed').map(item => item.clientActionId);
	expect(failedIds).toHaveLength(2);
	await harness.conversation.send('tente novamente');
	expect(harness.attempts).toHaveLength(211);
	await harness.conversation.send('confirmo');
	expect(harness.effects.size).toBe(211);
	expect(harness.attempts.slice(211)).toEqual(failedIds);
	expect(harness.conversation.snapshot().drafts.every(item => item.status === 'succeeded')).toBe(true);
	expect(harness.invalidate).toHaveBeenCalledTimes(2);
	harness.conversation.dispose();
});

test('cancelar lote durante o item 51 preserva commits e não inicia os 160 restantes', async () => {
	let release!: () => void;
	let entered!: () => void;
	const enteredCommit = new Promise<void>(resolve => { entered = resolve; });
	const paused = new Promise<void>(resolve => { release = resolve; });
	const harness = batchHarness({ kind: 'delete_gain', query: 'Lote', payload: {} }, undefined, async (draft, effects) => {
		if (draft.payload.recordRef === 'target-50') { entered(); await paused; }
		effects.set(draft.clientActionId, { ...draft.payload });
		return { success: true, message: 'Commit conferido' };
	});
	await harness.conversation.send('Exclua todas as receitas do lote');
	const committing = harness.conversation.send('confirmo');
	await enteredCommit;
	await harness.conversation.send('cancele');
	release(); await committing;
	expect(harness.effects.size).toBe(51);
	expect(harness.attempts).toHaveLength(51);
	expect(harness.conversation.snapshot().drafts.filter(item => item.status === 'succeeded')).toHaveLength(51);
	expect(harness.conversation.snapshot().drafts.filter(item => item.status === 'cancelled')).toHaveLength(160);
	await harness.conversation.send('tente novamente');
	expect(harness.attempts).toHaveLength(51);
	harness.conversation.dispose();
});

test.each([false, true])('211 comandos ditados mantêm dependência, referência criada e retry de falha inicial=%s', async initialFailure => {
	const catalog: AssistantResolvedCatalog = { expenseCategories: [] };
	const proposals: AssistantModelActionProposal[] = [
		{ clientActionId: 'category-created', kind: 'create_category', payload: { categoryName: 'Alimentação', usageType: 'expense' } },
		...Array.from({ length: 210 }, (_, index): AssistantModelActionProposal => ({ clientActionId: `expense-${index}`, kind: 'create_expense', dependsOnActionIds: ['category-created'], payload: { name: `Mercado ${index}`, ...movement, bankRef: 'principal', categoryRef: 'action:category-created' } })),
	];
	let failOnce = initialFailure;
	const harness = batchHarness({ kind: 'update_category', payload: {} }, catalog, async (draft, effects) => {
		if (draft.kind === 'create_category') {
			if (failOnce) { failOnce = false; return { success: false, message: 'Categoria não foi criada' }; }
			catalog.expenseCategories = [{ handle: 'created-food', realId: 'real-food', label: 'Alimentação', data: { assistantActionId: draft.clientActionId } }];
		} else {
			expect(effects.has('category-created')).toBe(true);
			expect(draft.payload.categoryRef).toBe('created-food');
		}
		effects.set(draft.clientActionId, { ...draft.payload });
		return { success: true, message: 'Commit persistido' };
	}, proposals);
	await harness.conversation.send('Registre os itens ditados e sua categoria');
	await harness.conversation.send('confirmo');
	if (initialFailure) {
		expect(harness.effects.size).toBe(0);
		expect(harness.attempts).toEqual(['category-created']);
		await harness.conversation.send('tente novamente'); await harness.conversation.send('confirmo');
		expect(harness.effects.size).toBe(1);
		expect(harness.attempts).toEqual(['category-created', 'category-created']);
		await harness.conversation.send('retome'); await harness.conversation.send('confirmo');
	}
	expect(harness.effects.size).toBe(211);
	expect(harness.attempts.slice(initialFailure ? 2 : 1)).toEqual(Array.from({ length: 210 }, (_, index) => `expense-${index}`));
	expect(harness.loadCatalog).toHaveBeenCalledTimes(2);
	expect(harness.maxInFlight()).toBe(1);
	harness.conversation.dispose();
});

const benchmarkTest = process.env.MEASURE_ASSISTANT_BATCH === '1' ? test : test.skip;
benchmarkTest('mede 20 conversas sintéticas por fonte com 211 efeitos e grants verificáveis', async () => {
	const sources = [...new Set(cases.map(item => item.source))];
	const measurements: Array<Record<string, string | number>> = [];
	for (const source of sources) {
		const sampleCase = cases.find(item => item.source === source && ['pay_mandatory_expense', 'receive_mandatory_gain', 'deposit_investment', 'update_bank', 'update_category'].includes(item.kind)) ?? cases.find(item => item.source === source)!;
		const times: number[] = [];
		for (let sample = -1; sample < 20; sample++) {
			const harness = batchHarness({ kind: sampleCase.kind, query: 'Lote', payload: sampleCase.payload });
			const start = performance.now();
			await harness.conversation.send('Altere todos os registros do lote conforme o pedido');
			await harness.conversation.send('confirmo');
			const elapsed = performance.now() - start;
			expect(harness.effects.size).toBe(211);
			expect(harness.attempts).toHaveLength(211);
			expect(harness.maxInFlight()).toBe(1);
			expect(harness.loadCatalog).toHaveBeenCalledTimes(1);
			expect(harness.interpret).toHaveBeenCalledTimes(1);
			if (sample >= 0) times.push(elapsed);
			harness.conversation.dispose();
		}
		times.sort((a, b) => a - b);
		measurements.push({ source, kind: sampleCase.kind, samples: 20, eligibleItems: 211, fixtureItems: source === 'banks' ? 215 : 213, p50Ms: Number(times[9]!.toFixed(2)), p95Ms: Number(times[18]!.toFixed(2)), catalogLoaderCalls: 1, interpreterCalls: 1, networkModelCalls: 0, firestoreReads: 0, executorCalls: 211, effectWrites: 211, maxConcurrentExecutions: 1 });
	}
	console.log('ASSISTANT_BATCH_SEAM_METRICS', JSON.stringify({ environment: 'Jest/WSL; catálogo e executor em memória; assertions de grant incluídas no tempo; uma amostra de aquecimento por fonte; dois envios por conversa (pedido e confirmação)', measurements }));
}, 30000);

test('uma criação sem conjunto selecionável não usa investimentos como alvos', () => {
	expect(() => expandAssistantBatch({ kind: 'create_expense', payload: {} }, {
		investments: [{ handle: 'investment', realId: 'real-investment', label: 'Reserva' }],
	})).toThrow(AssistantFriendlyError);
});

test.each<AssistantActionKind>(['create_transfer', 'create_cash_withdrawal', 'upsert_monthly_balance', 'upsert_balance_adjustment'])('%s seleciona as contas bancárias do conjunto', kind => {
	const selection = expandAssistantBatch({ kind, query: 'Conta', payload: { targetBankRef: 'target' } }, {
		banks: [{ handle: 'bank', realId: 'real-bank', label: 'Conta origem', data: { kind: 'bank' } }],
		investments: [{ handle: 'investment', realId: 'real-investment', label: 'Conta investimento' }],
		bankBalanceAdjustments: [{ handle: 'adjustment', realId: 'real-adjustment', label: 'Conta ajuste antigo' }],
	});
	expect(selection.proposals).toEqual([{ kind, payload: { targetBankRef: 'target', [kind === 'create_transfer' ? 'sourceBankRef' : 'bankRef']: 'bank' } }]);
});

test('ajuste em lote por banco não reaproveita um único registro anterior em contas diferentes', () => {
	expect(() => expandAssistantBatch({ kind: 'upsert_balance_adjustment', payload: { recordRef: 'existing-adjustment', date: DATE, targetBalanceInCents: 100 } }, catalogFor('banks'))).toThrow(AssistantFriendlyError);
});
