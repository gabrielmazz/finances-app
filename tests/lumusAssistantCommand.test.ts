import { replanSparkRecurringFirebase, undoSparkRecurringReplanFirebase } from '@/functions/SparkRecurringReplanFirebase';
jest.mock('@/functions/SparkRecurringReplanFirebase', () => ({ replanSparkRecurringFirebase: jest.fn(async () => ({ transactionId: 'replan', idempotent: false })), undoSparkRecurringReplanFirebase: jest.fn() }));
import { saveSparkRecurringMetadataFirebase } from '@/functions/SparkRecurringMetadataFirebase';
jest.mock('@/functions/SparkRecurringMetadataFirebase',()=>({saveSparkRecurringMetadataFirebase:jest.fn(async()=>({transactionId:'metadata',idempotent:false}))}));
import { readSparkRecurringPlansFirebase } from '@/functions/SparkRecurringReadFirebase';
import { createSparkRecurringPlanFirebase, updateSparkRecurringPlanFirebase, settleSparkRecurringFirebase, undoSparkRecurringFirebase } from '@/functions/SparkRecurringFirebase';
import { suppressMandatoryExpenseNotificationCycle, scheduleMandatoryExpenseNotification, cancelMandatoryExpenseNotification } from '@/utils/mandatoryExpenseNotifications';
import { suppressMandatoryGainNotificationCycle, scheduleMandatoryGainNotification, cancelMandatoryGainNotification } from '@/utils/mandatoryGainNotifications';
import type { SparkRecurringReadModel } from '@/utils/sparkRecurringReadModel';
jest.mock('@/functions/SparkRecurringReadFirebase', () => ({ readSparkRecurringPlansFirebase: jest.fn() }));
jest.mock('@/functions/SparkRecurringFirebase', () => ({ createSparkRecurringPlanFirebase:jest.fn(async()=>({transactionId:'definition',idempotent:false})), updateSparkRecurringPlanFirebase:jest.fn(async()=>({transactionId:'definition',idempotent:false})), settleSparkRecurringFirebase: jest.fn(async () => ({transactionId:'settlement',idempotent:false})), undoSparkRecurringFirebase: jest.fn(async () => ({transactionId:'undo',idempotent:false})) }));
jest.mock('@/functions/SparkPairFormFirebase', () => ({ prepareSparkPairReversalFirebase: jest.fn(), executeSparkPairReversalFirebase: jest.fn(async () => ({transactionId:'undo',idempotent:false})) }));
jest.mock('@/functions/SparkTransferFirebase', () => ({ transferSparkFundsFirebase: jest.fn(async () => ({transactionId:'pair',idempotent:false})), transferSparkDatedFundsFirebase: jest.fn(async () => ({transactionId:'dated-pair',idempotent:false})) }));
jest.mock('@/functions/SparkOrdinaryReadFirebase', () => ({ readSparkOrdinaryForEditFirebase: jest.fn() }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: jest.fn(async () => null) }));
jest.mock('@/functions/SparkMovementCommandFirebase', () => ({ executeSparkMovementCommandFirebase: jest.fn(async () => ({ transactionId: 'spark', idempotent: false })) }));
const mockDocuments = new Map<string, Record<string, unknown>>();
const mockWrites: string[] = [];
let mockDenyMissingAssistantRead = false;

jest.mock('@/FirebaseConfig', () => ({ db: {}, auth: { currentUser: { uid: 'test-user' } } }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({
	parseFinancialAccount: jest.requireActual('@/functions/FinancialLedgerFirebase').parseFinancialAccount,
	getFinancialLedgerContextFirebase: jest.fn(async () => null),
	completeFinancialRecurringFirebase: jest.fn(async () => ({ transactionId: 'ledger-recurring', amountInCents: 300, idempotent: false })),
	manageFinancialMetadataFirebase: jest.fn(async () => ({ recordId: 'metadata-record', idempotent: false })),
	correctFinancialLedgerMovementFirebase: jest.fn(async () => ({ transactionId: 'ledger-corrected', reversalTransactionId: 'reversed', idempotent: false })),
	postLedgerMovementFirebase: jest.fn(async () => ({ transactionId: 'persisted-ledger-id', idempotent: false })),
	transferFundsFinancialLedgerFirebase: jest.fn(),
	reverseFinancialLedgerTransactionFirebase: jest.fn(),
	manageFinancialLedgerAccountFirebase: jest.fn(),
	reconcileFinancialLedgerAccountFirebase: jest.fn(),
}));
jest.mock('@/functions/LegacyFinancialMovementFirebase', () => ({ executeLegacyFinancialMovementFirebase: jest.fn(async () => ({ recordId: 'trusted-record', idempotent: false })) }));
jest.mock('@/functions/BankBalanceAdjustmentFirebase', () => ({ runBankBalanceAdjustmentFirebase: jest.fn(async () => ({ previousBalanceInCents: 1_000 })) }));
jest.mock('@/functions/TagFirebase', () => ({ getTagReferenceSummary: jest.fn(async () => ({ success: true, data: { total: 0 } })) }));
jest.mock('@/functions/BankFirebase', () => ({ getLegacyBankBalanceInCentsFirebase: jest.fn(async () => ({ success: true, data: 100_000 })) }));
jest.mock('@/utils/mandatoryExpenseNotifications', () => ({ suppressMandatoryExpenseNotificationCycle: jest.fn(async () => undefined), scheduleMandatoryExpenseNotification: jest.fn(async () => ({success:true})), cancelMandatoryExpenseNotification: jest.fn(async () => undefined) }));
jest.mock('@/utils/mandatoryGainNotifications', () => ({ suppressMandatoryGainNotificationCycle: jest.fn(async () => undefined), scheduleMandatoryGainNotification: jest.fn(async () => ({success:true})), cancelMandatoryGainNotification: jest.fn(async () => undefined) }));
jest.mock('firebase/firestore', () => ({
	Timestamp: jest.requireActual('firebase/firestore').Timestamp,
	collection: (_db: unknown, name: string) => ({ name }),
	where: (field: string, operator: string, value: unknown) => ({ field, operator, value }),
	query: (source: { name: string }, ...filters: Array<{ field: string; value: unknown }>) => ({ source, filters }),
	getDocs: async ({ source, filters }: { source: { name: string }; filters: Array<{ field: string; value: unknown }> }) => {
		const docs = Array.from(mockDocuments.entries()).filter(([path, data]) => path.startsWith(source.name + '/') && filters.every(filter => data[filter.field] === filter.value)).map(([path, data]) => ({ id: path.split('/').at(-1), ref: { id: path.split('/').at(-1), path }, data: () => data }));
		return { docs, empty: docs.length === 0, size: docs.length };
	},
	serverTimestamp: () => new Date('2026-10-02T15:00:00Z'),
	doc: (base: any, ...segments: string[]) => ({ id: segments[segments.length - 1], path: [...(base?.path ? [base.path] : []),...segments].join('/') }),
	getDocFromServer: async (reference: { path: string }) => ({ exists: () => mockDocuments.has(reference.path), data: () => mockDocuments.get(reference.path) }),
	getDoc: async (reference: { path: string }) => ({
		exists: () => mockDocuments.has(reference.path),
		data: () => mockDocuments.get(reference.path),
	}),
	runTransaction: async (_db: unknown, callback: (transaction: unknown) => Promise<unknown>) => callback({
		get: async (reference: { path: string }) => {
			if (mockDenyMissingAssistantRead && reference.path.startsWith('expenses/assistant_') && !mockDocuments.has(reference.path)) {
				throw Object.assign(new Error('Denied by rules'), { code: 'permission-denied' });
			}
			return {
				exists: () => mockDocuments.has(reference.path),
				data: () => mockDocuments.get(reference.path),
			};
		},
		set: (reference: { path: string }, data: Record<string, unknown>) => {
			mockDocuments.set(reference.path, data);
			mockWrites.push(reference.path);
		},
		delete: (reference: { path: string }) => { mockDocuments.delete(reference.path); mockWrites.push(reference.path); },
		update: (reference: { path: string }, data: Record<string, unknown>) => {
			mockDocuments.set(reference.path, { ...mockDocuments.get(reference.path), ...data });
			mockWrites.push(reference.path);
		},
	}),
}));

import { executeLegacyFinancialMovementFirebase } from '@/functions/LegacyFinancialMovementFirebase';
import { createAssistantRecordFingerprint } from '@/utils/assistantRecordFingerprint';
import { prepareAssistantActions } from '@/services/lumusAssistant/assistantCatalogService';
import { financeCommandService } from '@/services/lumusAssistant/financeCommandService';
import { createAssistantAuthorizationSession } from '@/services/lumusAssistant/assistantAuthorization';
import { completeFinancialRecurringFirebase, correctFinancialLedgerMovementFirebase, getFinancialLedgerContextFirebase, manageFinancialMetadataFirebase, manageFinancialLedgerAccountFirebase, parseFinancialAccount, postLedgerMovementFirebase, reconcileFinancialLedgerAccountFirebase, reverseFinancialLedgerTransactionFirebase, transferFundsFinancialLedgerFirebase } from '@/functions/FinancialLedgerFirebase';
import { runBankBalanceAdjustmentFirebase } from '@/functions/BankBalanceAdjustmentFirebase';
import { auth } from '@/FirebaseConfig';
import { getSparkContextFirebase } from '@/functions/SparkContextFirebase';
import { prepareSparkPairReversalFirebase, executeSparkPairReversalFirebase } from '@/functions/SparkPairFormFirebase';
import { transferSparkFundsFirebase, transferSparkDatedFundsFirebase } from '@/functions/SparkTransferFirebase';
import { readSparkOrdinaryForEditFirebase } from '@/functions/SparkOrdinaryReadFirebase';
import { executeSparkMovementCommandFirebase } from '@/functions/SparkMovementCommandFirebase';
import { getTagReferenceSummary } from '@/functions/TagFirebase';
import type { AssistantActionKind, AssistantDraftAction } from '@/types/lumusAssistant';
import type { AssistantResolvedCatalog } from '@/types/lumusAssistant';

const confirmDraft = (draft: AssistantDraftAction, catalog: AssistantResolvedCatalog) => {
	const session = createAssistantAuthorizationSession('test-user');
	session.recordUserMessage('confirmation-message', 'Sim');
	const authorization = session.authorize(draft, 'confirmation-message', 'confirmation')!;
	return financeCommandService.execute('test-user', { ...draft, status: 'confirming' }, catalog, authorization);
};

describe('Lumus Assistant confirmed command', () => {
	beforeEach(() => {
		mockDocuments.clear();
		mockWrites.length = 0;
		mockDenyMissingAssistantRead = false;
		mockDocuments.set('tags/tag_1', { personId: 'test-user', name: 'Categoria', usageType: 'both' });
		jest.mocked(getFinancialLedgerContextFirebase).mockResolvedValue(null);
		jest.mocked(getFinancialLedgerContextFirebase).mockClear();
		jest.mocked(postLedgerMovementFirebase).mockClear();
		jest.mocked(manageFinancialLedgerAccountFirebase).mockReset();
	});

	it('posts a migrated expense through the authorized ledger API without touching legacy collections', async () => {
		jest.mocked(getFinancialLedgerContextFirebase).mockResolvedValue({ groupId: 'group-1', role: 'member' });
		const catalog: AssistantResolvedCatalog = {
			banks: [{ handle: 'account-1', label: 'Banco do grupo', realId: 'bank-1', collection: 'financialAccounts', data: { groupId: 'group-1', kind: 'bank' } }],
			expenseCategories: [{ handle: 'category-1', label: 'Alimentação', realId: 'tag-1' }],
		};
		const draft = (await prepareAssistantActions('test-user', [{ kind: 'create_expense', payload: { name: 'Mercado', valueInCents: 8290, date: '2026-10-01', bankRef: 'account-1', categoryRef: 'category-1' } }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		expect(postLedgerMovementFirebase).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'group-1', accountId: 'bank-1', amountInCents: 8290, direction: 'expense', clientActionId: draft.clientActionId }));
		expect(mockWrites).toHaveLength(0);
	});

	it('reconciles a legacy deletion after response loss without requiring the deleted target again', async () => {
		const data = { personId: 'test-user', name: 'Café', valueInCents: 1_200 };
		mockDocuments.set('expenses/expense-1', data);
		const catalog: AssistantResolvedCatalog = { expenses: [{ handle: 'expense-handle', realId: 'expense-1', label: 'Café', collection: 'expenses', data }] };
		const draft = (await prepareAssistantActions('test-user', [{ kind: 'delete_expense', payload: { recordRef: 'expense-handle' } }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		expect(mockDocuments.has('expenses/expense-1')).toBe(false);
		expect(mockWrites.filter(path => path === 'expenses/expense-1')).toHaveLength(1);
	});

	it('settles and undoes three legacy installments using the exact contractual remainder', async () => {
		const data = { personId: 'test-user', name: 'Parcelas', valueInCents: 333, installmentTotal: 3, installmentsCompleted: 0, installmentTotalValueInCents: 1_000 };
		mockDocuments.set('mandatoryExpenses/template-3', data);
		const catalog: AssistantResolvedCatalog = { banks: [{ handle: 'cash', realId: null, label: 'Dinheiro' }], mandatoryExpenses: [{ handle: 'plan-3', realId: 'template-3', label: 'Parcelas', collection: 'mandatoryExpenses', data }] };
		const draft = (await prepareAssistantActions('test-user', [{ kind: 'pay_mandatory_expense', payload: { recordRef: 'plan-3', bankRef: 'cash', date: '2026-10-02', installmentsToAdvance: 3 } }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		const movement = Array.from(mockDocuments.entries()).find(([path]) => path.startsWith('expenses/'))![1];
		expect(movement.valueInCents).toBe(1_000);
		expect(mockDocuments.get('mandatoryExpenses/template-3')?.installmentsCompleted).toBe(3);
		const updated = mockDocuments.get('mandatoryExpenses/template-3')!;
		const undoCatalog = { ...catalog, mandatoryExpenses: [{ ...catalog.mandatoryExpenses![0]!, data: updated }] };
		const undo = (await prepareAssistantActions('test-user', [{ kind: 'undo_mandatory_expense_payment', payload: { recordRef: 'plan-3' } }], undoCatalog)).actions[0]!;
		await expect(confirmDraft(undo, undoCatalog)).resolves.toMatchObject({ success: true });
		expect(mockDocuments.get('mandatoryExpenses/template-3')?.installmentsCompleted).toBe(0);
	});

	it('reconciles a migrated account update from its persisted receipt before checking the changed snapshot', async () => {
		jest.mocked(getFinancialLedgerContextFirebase).mockResolvedValue({ groupId: 'group-1', role: 'admin' });
		const data = { groupId: 'group-1', kind: 'bank', name: 'Antigo', currentBalanceInCents: 1_000, archivedAt: null };
		mockDocuments.set('financialAccounts/bank-1', data);
		const catalog: AssistantResolvedCatalog = { banks: [{ handle: 'bank-1-handle', label: 'Antigo', realId: 'bank-1', collection: 'financialAccounts', data: { ...parseFinancialAccount('bank-1', data), personId: 'test-user', financialRole: 'admin' } }] };
		jest.mocked(manageFinancialLedgerAccountFirebase).mockImplementation(async input => {
			mockDocuments.set('financialAccounts/bank-1', { ...data, name: input.name });
			mockDocuments.set('financialGroups/group-1/operations/' + input.clientActionId, { actorId: 'test-user', assistantRequestFingerprint: input.assistantRequestFingerprint });
			return { accountId: 'bank-1', idempotent: false };
		});
		const draft = (await prepareAssistantActions('test-user', [{ kind: 'update_bank', payload: { recordRef: 'bank-1-handle', bankName: 'Novo' } }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		expect(manageFinancialLedgerAccountFirebase).toHaveBeenCalledTimes(1);
		await expect(confirmDraft({ ...draft, payload: { ...draft.payload, bankName: 'Outro' } }, catalog)).resolves.toMatchObject({ success: false, errorCode: 'idempotency-conflict' });
	});

	it('rejects model status and forged authorization before reading or writing any data', async () => {
		const catalog: AssistantResolvedCatalog = { banks: [{ handle: 'cash', label: 'Dinheiro', realId: null }], expenseCategories: [{ handle: 'category_1', label: 'Alimentação', realId: 'tag_1' }] };
		const draft = (await prepareAssistantActions('test-user', [{ kind: 'create_expense', payload: { name: 'Café', valueInCents: 1200, date: '2026-09-24', bankRef: 'cash', categoryRef: 'category_1' } }], catalog)).actions[0]!;
		await expect(financeCommandService.execute('test-user', { ...draft, status: 'confirming' }, catalog, { token: 'model-confirmed' })).resolves.toMatchObject({ success: false, errorCode: 'authorization-required' });
		expect(mockWrites).toHaveLength(0);
		expect(getFinancialLedgerContextFirebase).not.toHaveBeenCalled();
	});

	it('identifies a denied payment read without claiming an uncertain commit', async () => {
		const template = { personId: 'test-user', name: 'Obrigação de teste', valueInCents: 1200 };
		mockDocuments.set('mandatoryExpenses/template_1', template);
		const catalog: AssistantResolvedCatalog = {
			banks: [{ handle: 'cash', label: 'Dinheiro', realId: null }],
			mandatoryExpenses: [{ handle: 'mandatory_1', label: 'Obrigação de teste', realId: 'template_1', collection: 'mandatoryExpenses', data: template }],
		};
		const draft = (await prepareAssistantActions('test-user', [{
			kind: 'pay_mandatory_expense',
			payload: { recordRef: 'mandatory_1', bankRef: 'cash', date: '2026-09-25' },
		}], catalog)).actions[0]!;
		mockDenyMissingAssistantRead = true;
		await expect(confirmDraft(draft, catalog))
			.resolves.toMatchObject({ success: false, errorCode: 'permission-denied' });
		expect(mockWrites).toHaveLength(0);
	});

	it('retries one card idempotently while allowing a later request with the same model label', async () => {
		const proposal = {
			clientActionId: 'expense_1',
			kind: 'create_expense' as const,
			payload: { name: 'Café', valueInCents: 1200, date: '2026-09-24', bankRef: 'cash', categoryRef: 'category_1' },
		};
		const catalog: AssistantResolvedCatalog = {
			banks: [{ handle: 'cash', label: 'Dinheiro', realId: null }],
			expenseCategories: [{ handle: 'category_1', label: 'Alimentação', realId: 'tag_1' }],
		};
		const first = (await prepareAssistantActions('test-user', [proposal], catalog)).actions[0]!;
		const later = (await prepareAssistantActions('test-user', [proposal], catalog)).actions[0]!;
		const confirm = (draft: typeof first) => confirmDraft(draft, catalog);

		await expect(confirm(first)).resolves.toMatchObject({ success: true });
		await expect(confirm(first)).resolves.toMatchObject({ success: true });
		expect(mockWrites.filter(path => path.startsWith('expenses/'))).toHaveLength(1);
		await expect(confirm(later)).resolves.toMatchObject({ success: true });
		expect(mockWrites.filter(path => path.startsWith('expenses/'))).toHaveLength(2);
		expect(new Set(mockWrites.filter(path => path.startsWith('expenses/'))).size).toBe(2);
	});

	it.each([
		['expense', 'pay_mandatory_expense', 'mandatoryExpenses'],
		['gain', 'receive_mandatory_gain', 'mandatoryGains'],
	] as const)('settles a %s cycle once per card and blocks another card for the same cycle', async (_type, kind, collection) => {
		const template = { personId: 'test-user', name: 'Obrigação de teste', valueInCents: 1200 };
		const templatePath = `${collection}/template_1`;
		mockDocuments.set(templatePath, template);
		const catalog: AssistantResolvedCatalog = {
			banks: [{ handle: 'cash', label: 'Dinheiro', realId: null }],
			[collection]: [{ handle: 'mandatory_1', label: 'Obrigação de teste', realId: 'template_1', collection, data: template }],
		};
		const proposal = { kind, payload: { recordRef: 'mandatory_1', bankRef: 'cash', date: '2026-09-25' } };
		const first = (await prepareAssistantActions('test-user', [proposal], catalog)).actions[0]!;
		const confirm = (draft: typeof first, currentCatalog: AssistantResolvedCatalog = catalog) =>
			confirmDraft(draft, currentCatalog);

		await expect(confirm(first)).resolves.toMatchObject({ success: true });
		const writesAfterFirst = mockWrites.length;
		await expect(confirm(first)).resolves.toMatchObject({ success: true });
		expect(mockWrites).toHaveLength(writesAfterFirst);
		const latestTemplate = {
			...mockDocuments.get(templatePath)!,
			[_type === 'expense' ? 'lastPaymentExpenseId' : 'lastReceiptGainId']: null,
		};
		mockDocuments.set(templatePath, latestTemplate);
		const freshCatalog: AssistantResolvedCatalog = {
			...catalog,
			[collection]: [{ ...catalog[collection]?.[0]!, data: latestTemplate }],
		};
		const later = (await prepareAssistantActions('test-user', [proposal], freshCatalog)).actions[0]!;
		await expect(confirm(later, freshCatalog)).resolves.toMatchObject({
			success: false,
			errorCode: 'already-completed-cycle',
		});
		expect(mockWrites).toHaveLength(writesAfterFirst);
	});
});

const domainFixture = () => {
	const date = new Date('2026-10-01T15:00:00Z');
	const source = (collection: string, realId: string, data: Record<string, unknown>) => { mockDocuments.set(collection + '/' + realId, data); return { collection, realId, handle: realId, label: String(data.name ?? realId), data }; };
	const banks = [source('banks', 'b1', { personId: 'test-user', name: 'Banco 1', isActive: true }), source('banks', 'b2', { personId: 'test-user', name: 'Banco 2' })];
	const categories = [source('tags', 'c1', { personId: 'test-user', name: 'Categoria', usageType: 'both', isMandatoryExpense: true, isMandatoryGain: true })];
	const expenses = [source('expenses', 'e1', { personId: 'test-user', name: 'Despesa', valueInCents: 500, bankId: 'b1', date })];
	const gains = [source('gains', 'g1', { personId: 'test-user', name: 'Receita', valueInCents: 500, bankId: 'b1', date })];
	const investments = [source('financeInvestments', 'i1', { personId: 'test-user', name: 'CDB', bankId: 'b1', currentValueInCents: 1_000, initialValueInCents: 1_000, date })];
	const mandatoryExpenses = [source('mandatoryExpenses', 'me1', { personId: 'test-user', name: 'Internet', valueInCents: 300, dueDay: 10 })];
	const mandatoryGains = [source('mandatoryGains', 'mg1', { personId: 'test-user', name: 'Salário', valueInCents: 300, dueDay: 10 })];
	const cashWithdrawals = [source('cashRescues', 'w1', { personId: 'test-user', name: 'Saque', bankId: 'b1', valueInCents: 200, date })];
	const investmentDeposits = [source('expenses', 'id1', { personId: 'test-user', name: 'Aporte', investmentId: 'i1', bankId: 'b1', date, valueInCents: 200, isInvestmentDeposit: true })];
	const investmentRedemptions = [source('gains', 'ir1', { personId: 'test-user', name: 'Resgate', investmentId: 'i1', bankId: 'b1', date, valueInCents: 200, isInvestmentRedemption: true })];
	const investmentSyncs = [source('financeInvestmentSyncs', 'is1', { personId: 'test-user', name: 'Sincronização', investmentId: 'i1', previousValueInCents: 900, syncedValueInCents: 1_000 })];
	const bankBalanceAdjustments = [source('bankBalanceAdjustments', 'a1', { personId: 'test-user', name: 'Ajuste', bankId: 'b1', status: 'active', date })];
	return { banks, categories, expenseCategories: categories, gainCategories: categories, mandatoryExpenseCategories: categories, mandatoryGainCategories: categories, expenses, gains, investments, mandatoryExpenses, mandatoryGains, cashWithdrawals, investmentDeposits, investmentRedemptions, investmentSyncs, bankBalanceAdjustments } satisfies AssistantResolvedCatalog;
};
const commonMovement = { name: 'Registro novo', valueInCents: 700, date: '2026-10-02', bankRef: 'b1', categoryRef: 'c1' };
const recurring = { name: 'Recorrência nova', valueInCents: 700, dueDay: 10, categoryRef: 'c1' };
const legacyCases: Array<[AssistantActionKind, Record<string, unknown>, string, Record<string, unknown> | null]> = [
	['create_expense', commonMovement, 'expenses/', { name: 'Registro novo', valueInCents: 700 }],
	['create_gain', commonMovement, 'gains/', { name: 'Registro novo', valueInCents: 700 }],
	['update_expense', { recordRef: 'e1', valueInCents: 800 }, 'expenses/e1', { valueInCents: 800 }],
	['update_gain', { recordRef: 'g1', valueInCents: 800 }, 'gains/g1', { valueInCents: 800 }],
	['delete_expense', { recordRef: 'e1' }, 'expenses/e1', null],
	['delete_gain', { recordRef: 'g1' }, 'gains/g1', null],
	['upsert_monthly_balance', { bankRef: 'b1', cycle: '2026-10', valueInCents: 9_000 }, 'monthlyBalances/', { valueInCents: 9_000, month: 10 }],
	['create_transfer', { sourceBankRef: 'b1', targetBankRef: 'b2', valueInCents: 700, date: '2026-10-02' }, 'bankTransfers/', { sourceBankId: 'b1', targetBankId: 'b2', valueInCents: 700 }],
	['create_cash_withdrawal', { bankRef: 'b1', valueInCents: 700, date: '2026-10-02' }, 'cashRescues/', { bankId: 'b1', valueInCents: 700 }],
	['undo_cash_withdrawal', { recordRef: 'w1' }, 'cashRescues/w1', null],
	['create_mandatory_expense', recurring, 'mandatoryExpenses/', { name: 'Recorrência nova', valueInCents: 700 }],
	['create_mandatory_gain', recurring, 'mandatoryGains/', { name: 'Recorrência nova', valueInCents: 700 }],
	['update_mandatory_expense', { recordRef: 'me1', valueInCents: 800 }, 'mandatoryExpenses/me1', { valueInCents: 800 }],
	['update_mandatory_gain', { recordRef: 'mg1', valueInCents: 800 }, 'mandatoryGains/mg1', { valueInCents: 800 }],
	['delete_mandatory_expense', { recordRef: 'me1' }, 'mandatoryExpenses/me1', null],
	['delete_mandatory_gain', { recordRef: 'mg1' }, 'mandatoryGains/mg1', null],
	['pay_mandatory_expense', { recordRef: 'me1', bankRef: 'b1', date: '2026-10-02' }, 'mandatoryExpenses/me1', { lastPaymentCycle: '2026-10' }],
	['receive_mandatory_gain', { recordRef: 'mg1', bankRef: 'b1', date: '2026-10-02' }, 'mandatoryGains/mg1', { lastReceiptCycle: '2026-10' }],
	['create_investment', { name: 'Investimento novo', initialValueInCents: 700, cdiPercentageInBasisPoints: 10_000, redemptionTerm: 'anytime', bankRef: 'b1', date: '2026-10-02' }, 'financeInvestments/', { name: 'Investimento novo', initialValueInCents: 700 }],
	['update_investment', { recordRef: 'i1', cdiPercentageInBasisPoints: 11_000 }, 'financeInvestments/i1', { cdiPercentageInBasisPoints: 11_000 }],
	['delete_investment', { recordRef: 'i1' }, 'financeInvestments/i1', null],
	['deposit_investment', { investmentRef: 'i1', valueInCents: 200, date: '2026-10-02' }, 'financeInvestments/i1', { currentValueInCents: 1_200 }],
	['redeem_investment', { investmentRef: 'i1', valueInCents: 200, date: '2026-10-02' }, 'financeInvestments/i1', { currentValueInCents: 800 }],
	['sync_investment', { investmentRef: 'i1', syncedValueInCents: 1_200, date: '2026-10-02' }, 'financeInvestments/i1', { currentValueInCents: 1_200 }],
	['undo_investment_deposit', { recordRef: 'id1' }, 'financeInvestments/i1', { currentValueInCents: 800 }],
	['undo_investment_redemption', { recordRef: 'ir1' }, 'financeInvestments/i1', { currentValueInCents: 1_200 }],
	['undo_investment_sync', { recordRef: 'is1' }, 'financeInvestments/i1', { currentValueInCents: 900 }],
	['upsert_cdi_rate', { annualRateInBasisPoints: 1_400, effectiveFrom: '2026-10-02' }, 'investmentCdiRates/', { annualRateInBasisPoints: 1_400 }],
	['create_bank', { bankName: 'Banco novo', initialBalanceInCents: 9_000, initialBalanceCycle: '2026-10' }, 'banks/', { name: 'Banco novo' }],
	['update_bank', { recordRef: 'b1', isActive: false }, 'banks/b1', { isActive: false }],
	['delete_bank', { recordRef: 'b1' }, 'banks/b1', null],
	['create_category', { categoryName: 'Categoria nova', usageType: 'both', iconLabel: 'Café' }, 'tags/', { name: 'Categoria nova', iconFamily: 'ionicons', iconName: 'cafe-outline' }],
	['update_category', { recordRef: 'c1', categoryName: 'Categoria atualizada', iconLabel: 'Mercado' }, 'tags/c1', { name: 'Categoria atualizada', iconFamily: 'material-community', iconName: 'shopping-outline' }],
	['delete_category', { recordRef: 'c1' }, 'tags/c1', null],
];
describe('Legacy domain command effects', () => {
	beforeEach(() => {
		mockDocuments.clear(); mockWrites.length = 0; jest.mocked(getFinancialLedgerContextFirebase).mockResolvedValue(null);
		jest.mocked(manageFinancialMetadataFirebase).mockImplementation(async input => {
			if (!input.groupId && input.domain === 'category' && input.action === 'delete') {
				mockDocuments.delete('tags/' + input.recordId); mockWrites.push('tags/' + input.recordId);
				const id = 'assistant_' + createAssistantRecordFingerprint({ personId: 'test-user', actionId: input.clientActionId, suffix: 'receipt' }) + '_receipt';
				mockDocuments.set('assistantOperationReceipts/' + id, { personId: 'test-user', fingerprint: input.assistantRequestFingerprint });
			}
			return { recordId: input.recordId ?? 'saved', idempotent: false };
		});
	});
	it.each(legacyCases.filter(([kind]) => !['create_transfer', 'create_cash_withdrawal', 'create_investment', 'deposit_investment', 'redeem_investment', 'update_investment', 'undo_investment_redemption', 'undo_investment_deposit'].includes(kind)))('%s persists its domain effect once', async (kind, payload, target, expected) => {
		const catalog = domainFixture();
		if (kind === 'delete_investment') { mockDocuments.delete('expenses/id1'); mockDocuments.delete('gains/ir1'); }
		const draft = (await prepareAssistantActions('test-user', [{ kind, payload }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		if (expected === null) expect(mockDocuments.has(target)).toBe(false);
		else if (target.endsWith('/')) expect(Array.from(mockDocuments.entries()).filter(([path]) => path.startsWith(target)).map(([, data]) => data)).toEqual(expect.arrayContaining([expect.objectContaining(expected)]));
		else expect(mockDocuments.get(target)).toMatchObject(expected);
		const financialWrites = mockWrites.length;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		expect(mockWrites).toHaveLength(financialWrites);
	});
	it.each(legacyCases.filter(([kind]) => ['create_transfer', 'create_cash_withdrawal', 'create_investment', 'deposit_investment', 'redeem_investment', 'update_investment', 'undo_investment_redemption', 'undo_investment_deposit'].includes(kind)))('%s delegates to the trusted legacy movement command', async (kind, payload) => {
		const catalog = domainFixture();
		jest.mocked(executeLegacyFinancialMovementFirebase).mockClear();
		const draft = (await prepareAssistantActions('test-user', [{ kind, payload }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		expect(executeLegacyFinancialMovementFirebase).toHaveBeenCalledWith(expect.objectContaining({ kind, expectedActorId: 'test-user', clientActionId: draft.clientActionId, assistantRequestFingerprint: expect.any(String) }));
		expect(mockWrites).toHaveLength(0);
	});
	it.each(['expense', 'gain'] as const)('rejects a %s plan outside its civil-month interval before writing', async type => {
		const catalog = domainFixture();
		const collection = type === 'expense' ? 'mandatoryExpenses' : 'mandatoryGains';
		const item = catalog[collection][0]!;
		const data = { ...item.data, installmentTotal: 3, installmentsCompleted: 0, installmentStartDate: new Date('2026-08-01T15:00:00Z'), installmentEndDate: new Date('2026-09-30T15:00:00Z') };
		mockDocuments.set(collection + '/' + item.realId, data); catalog[collection][0] = { ...item, data };
		const draft = (await prepareAssistantActions('test-user', [{ kind: type === 'expense' ? 'pay_mandatory_expense' : 'receive_mandatory_gain', payload: { recordRef: item.handle, bankRef: 'b1', date: '2026-10-02' } }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: false, errorCode: 'plan-outside-period' });
		expect(mockWrites).toHaveLength(0);
	});
	it('updates the legacy installment contract and derives its monthly cents', async () => {
		const catalog = domainFixture();
		const draft = (await prepareAssistantActions('test-user', [{ kind: 'update_mandatory_expense', payload: { recordRef: 'me1', installmentTotal: 3, installmentTotalValueInCents: 1_001 } }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		expect(mockDocuments.get('mandatoryExpenses/me1')).toMatchObject({ installmentTotal: 3, installmentTotalValueInCents: 1_001, valueInCents: 333 });
	});
	it.each(['expense', 'gain'] as const)('undoes a completed legacy %s cycle once with its template link intact', async type => {
		const catalog = domainFixture(); const collection = type === 'expense' ? 'mandatoryExpenses' : 'mandatoryGains';
		const item = catalog[collection][0]!;
		const settlement = (await prepareAssistantActions('test-user', [{ kind: type === 'expense' ? 'pay_mandatory_expense' : 'receive_mandatory_gain', payload: { recordRef: item.handle, bankRef: 'b1', date: '2026-10-02' } }], catalog)).actions[0]!;
		await expect(confirmDraft(settlement, catalog)).resolves.toMatchObject({ success: true });
		catalog[collection][0] = { ...item, data: mockDocuments.get(collection + '/' + item.realId)! };
		const undo = (await prepareAssistantActions('test-user', [{ kind: type === 'expense' ? 'undo_mandatory_expense_payment' : 'undo_mandatory_gain_receipt', payload: { recordRef: item.handle } }], catalog)).actions[0]!;
		await expect(confirmDraft(undo, catalog)).resolves.toMatchObject({ success: true });
		const persistedWrites = mockWrites.length;
		await expect(confirmDraft(undo, catalog)).resolves.toMatchObject({ success: true });
		expect(mockWrites).toHaveLength(persistedWrites);
		expect(mockDocuments.get(collection + '/' + item.realId)?.[type === 'expense' ? 'lastPaymentCycle' : 'lastReceiptCycle']).toBeNull();
	});
	it.each(['upsert_balance_adjustment', 'revert_balance_adjustment'] as const)('%s reaches the shared legacy adjustment command with an immutable request identity', async kind => {
		const catalog = domainFixture();
		jest.mocked(runBankBalanceAdjustmentFirebase).mockClear();
		const payload = kind === 'upsert_balance_adjustment' ? { bankRef: 'b1', date: '2026-10-02', targetBalanceInCents: 800, expectedPreviousBalanceInCents: 1_000 } : { recordRef: 'a1' };
		const draft = (await prepareAssistantActions('test-user', [{ kind, payload }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		expect(runBankBalanceAdjustmentFirebase).toHaveBeenCalledWith(expect.objectContaining({ expectedActorId: 'test-user', action: kind === 'upsert_balance_adjustment' ? 'save' : 'revert', clientActionId: draft.clientActionId }));
	});
	it('normalizes a legacy market asset to manual valuation like the investment form', async () => {
		const catalog = domainFixture();
		const draft = (await prepareAssistantActions('test-user', [{ kind: 'update_investment', payload: { recordRef: 'i1', assetType: 'stock' } }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		expect(executeLegacyFinancialMovementFirebase).toHaveBeenCalledWith(expect.objectContaining({ kind: 'update_investment', fields: expect.objectContaining({ assetType: 'stock', valuationMethod: 'manual' }) }));
	});
	it('does not reuse an expense-only investment category for a redemption', async () => {
		const catalog = domainFixture();
		catalog.categories = [{ ...catalog.categories[0]!, label: 'Investimento', data: { ...catalog.categories[0]!.data, usageType: 'expense' } }];
		catalog.gainCategories = [];
		jest.mocked(executeLegacyFinancialMovementFirebase).mockClear();
		const draft = (await prepareAssistantActions('test-user', [{ kind: 'redeem_investment', payload: { investmentRef: 'i1', valueInCents: 100, date: '2026-10-03' } }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		const command = jest.mocked(executeLegacyFinancialMovementFirebase).mock.calls[0]![0];
		expect(command.kind).toBe('redeem_investment'); expect('categoryId' in command).toBe(false);
	});
	it('does not delete a referenced category', async () => {
		const catalog = domainFixture();
		jest.mocked(getTagReferenceSummary).mockResolvedValueOnce({ success: true, data: { expenses: 1, gains: 0, mandatoryExpenses: 0, mandatoryGains: 0, total: 1 } });
		const draft = (await prepareAssistantActions('test-user', [{ kind: 'delete_category', payload: { recordRef: 'c1' } }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: false, errorCode: 'linked-record' });
		expect(mockDocuments.has('tags/c1')).toBe(true);
	});
});

const ledgerFixture = () => {
	const catalog = domainFixture();
	const account = (id: string, kind: 'bank' | 'cash' | 'investment') => {
		const data = { groupId: 'group-1', kind, name: id, currentBalanceInCents: 10_000, ...(kind === 'investment' ? { bankAccountId: 'b1' } : {}) };
		mockDocuments.set('financialAccounts/' + id, data);
		return { realId: id, handle: id, label: id, collection: 'financialAccounts', data: { ...parseFinancialAccount(id, data), personId: 'test-user', financialRole: 'admin' } };
	};
	catalog.banks = [account('b1', 'bank'), account('b2', 'bank'), account('cash-ledger', 'cash')];
	catalog.investments = [account('i1', 'investment')];
	const ledgerMovement = (id: string, kind: string, accountId = 'b1') => {
		const data = { groupId: 'group-1', kind, note: id, actorId: 'test-user', effectiveAt: new Date('2026-10-01T15:00:00Z'), legs: [{ accountId, deltaInCents: -500 }, { accountId: null, deltaInCents: 500 }] };
		mockDocuments.set('ledgerTransactions/' + id, data);
		return { realId: id, handle: id, label: id, collection: 'ledgerTransactions', data };
	};
	catalog.expenses = [ledgerMovement('e1', 'expense')]; catalog.gains = [ledgerMovement('g1', 'income')];
	catalog.cashWithdrawals = [ledgerMovement('w1', 'transfer')];
	catalog.investmentDeposits = [ledgerMovement('id1', 'investment_deposit', 'i1')];
	catalog.investmentRedemptions = [ledgerMovement('ir1', 'investment_redemption', 'i1')];
	catalog.investmentSyncs = [ledgerMovement('is1', 'reconciliation_adjustment', 'i1')];
	return catalog satisfies AssistantResolvedCatalog;
};
const migratedApiFor = (kind: AssistantActionKind) => {
	if (kind.includes('category') || /^(create|update|delete)_mandatory_/.test(kind) || kind === 'upsert_cdi_rate') return manageFinancialMetadataFirebase;
	if (kind.includes('mandatory')) return completeFinancialRecurringFirebase;
	if (kind === 'create_expense' || kind === 'create_gain') return postLedgerMovementFirebase;
	if (kind === 'update_expense' || kind === 'update_gain') return correctFinancialLedgerMovementFirebase;
	if (kind === 'delete_expense' || kind === 'delete_gain' || kind.startsWith('undo_')) return reverseFinancialLedgerTransactionFirebase;
	if (kind === 'create_transfer' || kind === 'create_cash_withdrawal' || kind === 'deposit_investment' || kind === 'redeem_investment') return transferFundsFinancialLedgerFirebase;
	if (kind === 'sync_investment' || kind === 'upsert_monthly_balance') return reconcileFinancialLedgerAccountFirebase;
	return manageFinancialLedgerAccountFirebase;
};
describe('Migrated domain dispatch and authorization', () => {
	beforeEach(() => {
		mockDocuments.clear(); mockWrites.length = 0;
		jest.mocked(getFinancialLedgerContextFirebase).mockResolvedValue({ groupId: 'group-1', role: 'admin' });
		for (const call of [manageFinancialMetadataFirebase, completeFinancialRecurringFirebase, postLedgerMovementFirebase, correctFinancialLedgerMovementFirebase, reverseFinancialLedgerTransactionFirebase, transferFundsFinancialLedgerFirebase, reconcileFinancialLedgerAccountFirebase, manageFinancialLedgerAccountFirebase]) {
			jest.mocked(call as typeof manageFinancialMetadataFirebase).mockReset();
			jest.mocked(call as typeof manageFinancialMetadataFirebase).mockResolvedValue({ recordId: 'saved', idempotent: false });
		}
	});
	it.each(legacyCases)('%s reaches its trusted migrated command without legacy writes', async (kind, payload) => {
		const catalog = ledgerFixture();
		const draft = (await prepareAssistantActions('test-user', [{ kind, payload }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		expect(migratedApiFor(kind)).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'group-1', clientActionId: draft.clientActionId, expectedActorId: 'test-user' }));
		expect(mockWrites).toHaveLength(0);
	});
	it.each(['undo_mandatory_expense_payment', 'undo_mandatory_gain_receipt'] as const)('%s uses a template transaction rather than reversing an unrelated movement', async kind => {
		const catalog = ledgerFixture();
		const draft = (await prepareAssistantActions('test-user', [{ kind, payload: { recordRef: kind.includes('expense') ? 'me1' : 'mg1' } }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		expect(completeFinancialRecurringFirebase).toHaveBeenCalledWith(expect.objectContaining({ action: 'undo', templateId: kind.includes('expense') ? 'me1' : 'mg1' }));
	});
	it.each(['upsert_balance_adjustment', 'revert_balance_adjustment'] as const)('%s preserves the shared adjustment domain API', async kind => {
		const catalog = ledgerFixture();
		const payload = kind === 'upsert_balance_adjustment' ? { bankRef: 'b1', date: '2026-10-02', targetBalanceInCents: 800, expectedPreviousBalanceInCents: 1_000 } : { recordRef: 'a1' };
		const draft = (await prepareAssistantActions('test-user', [{ kind, payload }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		expect(runBankBalanceAdjustmentFirebase).toHaveBeenCalledWith(expect.objectContaining({ action: kind === 'upsert_balance_adjustment' ? 'save' : 'revert', clientActionId: draft.clientActionId }));
	});
	it('normalizes a migrated market asset to manual valuation without sending an invalid CDI mode', async () => {
		const catalog = ledgerFixture();
		const draft = (await prepareAssistantActions('test-user', [{ kind: 'update_investment', payload: { recordRef: 'i1', assetType: 'stock' } }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		expect(manageFinancialLedgerAccountFirebase).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ assetType: 'stock', valuationMethod: 'manual' }) }));
	});
	it('routes an initial investment correction through the atomic account command', async () => {
		const catalog = ledgerFixture();
		const draft = (await prepareAssistantActions('test-user', [{ kind: 'update_investment', payload: { recordRef: 'i1', initialValueInCents: 800 } }], catalog)).actions[0]!;
		await expect(confirmDraft(draft, catalog)).resolves.toMatchObject({ success: true });
		expect(manageFinancialLedgerAccountFirebase).toHaveBeenCalledWith(expect.objectContaining({ action: 'update', initialValueInCents: 800 }));
	});
});

describe('Callable quota recovery in the financial executor', () => {
 const error = {code:'functions/resource-exhausted',details:{reason:'rate-limit',retryAfterMs:1000}};
 beforeEach(() => {
  jest.useFakeTimers();mockDocuments.clear();mockWrites.length=0;mockDenyMissingAssistantRead=false;
  jest.mocked(getFinancialLedgerContextFirebase).mockResolvedValue(null);
  jest.mocked(executeLegacyFinancialMovementFirebase).mockReset();
  jest.mocked(runBankBalanceAdjustmentFirebase).mockReset();
 });
 afterEach(() => { jest.clearAllTimers();jest.useRealTimers();(auth as any).currentUser={uid:'test-user'}; });
 const withdrawal = async () => {
  const catalog=domainFixture();
  const draft=(await prepareAssistantActions('test-user',[{kind:'create_cash_withdrawal',payload:{bankRef:'b1',valueInCents:700,date:'2026-10-02'}}],catalog)).actions[0]!;
  const session=createAssistantAuthorizationSession('test-user');session.recordUserMessage('confirmation','confirmo');
  return {catalog,draft,session,grant:session.authorize(draft,'confirmation','confirmation')!};
 };
 it('reuses the immutable callable identity after a rejected attempt',async()=>{
  const {catalog,draft,grant}=await withdrawal();
  const call=jest.mocked(executeLegacyFinancialMovementFirebase);
  call.mockRejectedValueOnce(error).mockResolvedValue({recordId:'saved',idempotent:false});
  const result=financeCommandService.execute('test-user',draft,catalog,grant);
  await jest.advanceTimersByTimeAsync(1000);
  await expect(result).resolves.toMatchObject({success:true});
  expect(call).toHaveBeenCalledTimes(2);
  expect(call.mock.calls[0]![0]).toEqual(call.mock.calls[1]![0]);
  expect(call.mock.calls[1]![0].clientActionId).toBe(draft.clientActionId);
 });
 it.each(['uid','authorization'] as const)('does not resend when %s changes during a quota wait',async reason=>{
  const {catalog,draft,grant,session}=await withdrawal();
  const call=jest.mocked(executeLegacyFinancialMovementFirebase).mockRejectedValue(error);
  const result=financeCommandService.execute('test-user',draft,catalog,grant);
  await jest.advanceTimersByTimeAsync(1);
  expect(call).toHaveBeenCalledTimes(1);
  if(reason==='uid')(auth as any).currentUser={uid:'other-user'};else session.dispose();
  await jest.advanceTimersByTimeAsync(1000);
  await expect(result).resolves.toMatchObject({success:false,errorCode:'cancelled'});
  expect(call).toHaveBeenCalledTimes(1);
 });
 it('keeps all 211 adjustment drafts when previews need to wait, with at most eight requests in flight',async()=>{
  const banks=Array.from({length:211},(_,index)=>({handle:`b${index}`,realId:`bank-${index}`,label:`Bank ${index}`,collection:'banks',data:{personId:'test-user',isActive:true}}));
  const firstAttempts=new Set<string>();let active=0;let peak=0;
  jest.mocked(runBankBalanceAdjustmentFirebase).mockImplementation(async input=>{
   active++;peak=Math.max(peak,active);
   try{await Promise.resolve();if(!firstAttempts.has(input.bankId)){firstAttempts.add(input.bankId);throw {...error,details:{...error.details,retryAfterMs:10}};}return {previousBalanceInCents:1000};}
   finally{active--;}
  });
  const result=financeCommandService.prepareActions('test-user',banks.map(bank=>({kind:'upsert_balance_adjustment',payload:{bankRef:bank.handle,date:'2026-10-02',targetBalanceInCents:1200}})),{banks});
  await jest.runAllTimersAsync();
  const prepared=await result;
  expect(prepared.actions).toHaveLength(211);
  expect(prepared.actions.every(item=>item.status==='ready'&&item.payload.expectedPreviousBalanceInCents===1000)).toBe(true);
  expect(new Set(prepared.actions.map(item=>item.clientActionId)).size).toBe(211);
  expect(peak).toBeLessThanOrEqual(8);
  expect(jest.mocked(runBankBalanceAdjustmentFirebase).mock.calls.every(([input])=>input.action==='preview')).toBe(true);
 });
 it.each(['abort','uid'] as const)('discards an already sent preview when %s changes before the response',async reason=>{
  let entered!:()=>void;let release!:(value:any)=>void;
  const inFlight=new Promise<void>(resolve=>{entered=resolve;});
  jest.mocked(runBankBalanceAdjustmentFirebase).mockImplementation(()=>new Promise(resolve=>{release=resolve;entered();}));
  const controller=new AbortController();
  const preparing=financeCommandService.prepareActions('test-user',[{kind:'upsert_balance_adjustment',payload:{bankRef:'b1',date:'2026-10-02',targetBalanceInCents:1200}}],domainFixture(),{signal:controller.signal});
  const rejected=expect(preparing).rejects.toThrow('Pedido cancelado');
  await inFlight;
  if(reason==='abort')controller.abort();else(auth as any).currentUser={uid:'other-user'};
  release({previousBalanceInCents:1000});await rejected;
  expect(jest.mocked(runBankBalanceAdjustmentFirebase)).toHaveBeenCalledTimes(1);
 });
});


describe('comandos ordinários Spark do chat', () => {
  const catalog: AssistantResolvedCatalog = { banks: [{ handle: 'native-bank', realId: 'bank', label: 'Banco', collection: 'sparkPositions', data: { groupId: 'spark-group', kind: 'bank' } }], expenseCategories: [{ handle: 'tag', realId: 'category', label: 'Categoria', collection: 'tags' }], gainCategories: [{ handle: 'tag', realId: 'category', label: 'Categoria', collection: 'tags' }] };
  const prepare = async (kind: 'create_expense' | 'create_gain' = 'create_expense') => (await prepareAssistantActions('test-user', [{ kind, payload: { name: 'Mercado', valueInCents: 123, date: '2026-10-01', bankRef: 'native-bank', categoryRef: 'tag' } }], catalog)).actions[0]!;
  beforeEach(() => { jest.mocked(getSparkContextFirebase).mockResolvedValue({ groupId: 'spark-group', actorId: 'test-user', role: 'member' }); jest.mocked(executeSparkMovementCommandFirebase).mockClear(); jest.mocked(postLedgerMovementFirebase).mockClear(); });
  afterEach(() => { jest.mocked(getSparkContextFirebase).mockResolvedValue(null); });
  it.each(['create_expense', 'create_gain'] as const)('registra %s no protocolo nativo com centavos e direção corretos', async kind => {
    const draft = await prepare(kind); expect(await confirmDraft(draft, catalog)).toMatchObject({ success: true });
    expect(executeSparkMovementCommandFirebase).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'create', movementKind: kind === 'create_expense' ? 'expense' : 'income', amountInCents: 123, accountId: 'bank', categoryId: 'category', clientActionId: draft.clientActionId, assistantRequestFingerprint: expect.any(String) }));
    expect(postLedgerMovementFirebase).not.toHaveBeenCalled();
    expect(jest.mocked(executeSparkMovementCommandFirebase).mock.calls[0]?.[1]).not.toHaveProperty('role');
  });
  it('retry conserva material, data e ID após resposta incerta', async () => {
    const draft = await prepare(); jest.mocked(executeSparkMovementCommandFirebase).mockRejectedValueOnce(new Error('offline'));
    expect(await confirmDraft(draft, catalog)).toMatchObject({ success: false }); expect(await confirmDraft(draft, catalog)).toMatchObject({ success: true });
    expect(jest.mocked(executeSparkMovementCommandFirebase).mock.calls[0]?.[1]).toEqual(jest.mocked(executeSparkMovementCommandFirebase).mock.calls[1]?.[1]);
  });
  it('dinheiro usa o ID do Caixa canônico', async () => {
    const cashCatalog = { ...catalog, banks: [{ ...catalog.banks![0]!, realId: 'cash', data: { groupId: 'spark-group', kind: 'cash' } }] };
    const draft = await prepare(); expect(await confirmDraft(draft, cashCatalog)).toMatchObject({ success: true });
    expect(executeSparkMovementCommandFirebase).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accountId: 'cash', details: expect.objectContaining({ moneyFormat: true }) }));
  });
  it('contexto nativo não permite conta de outro grupo nem banco legado', async () => {
    const draft = await prepare(); const wrong = { ...catalog, banks: [{ ...catalog.banks![0]!, collection: 'financialAccounts' }] };
    expect(await confirmDraft(draft, wrong)).toMatchObject({ success: false, errorCode: 'invalid-reference' }); expect(executeSparkMovementCommandFirebase).not.toHaveBeenCalled();
  });
  it('falha de contexto não permite fallback financeiro antigo', async () => {
    jest.mocked(getFinancialLedgerContextFirebase).mockClear();
    jest.mocked(getSparkContextFirebase).mockRejectedValueOnce(new Error('context offline'));
    expect(await confirmDraft(await prepare(), catalog)).toMatchObject({ success: false });
    expect(getFinancialLedgerContextFirebase).not.toHaveBeenCalled(); expect(executeSparkMovementCommandFirebase).not.toHaveBeenCalled();
  });
  it('família sem adaptador não tenta escritor antigo em contexto nativo', async () => {
    jest.mocked(getFinancialLedgerContextFirebase).mockClear();
    const draft: AssistantDraftAction = { ...await prepare(), kind: 'delete_bank', payload: { recordRef: 'not-supported' }, missingFields: [] };
    expect(await confirmDraft(draft, catalog)).toMatchObject({ success: false, errorCode: 'capability-unavailable' });
    expect(getFinancialLedgerContextFirebase).not.toHaveBeenCalled(); expect(executeSparkMovementCommandFirebase).not.toHaveBeenCalled();
  });
  it('ausência de autorização não inicia comando', async () => {
    expect(await financeCommandService.execute('test-user', await prepare(), catalog, undefined as any)).toMatchObject({ success: false, errorCode: 'authorization-required' }); expect(executeSparkMovementCommandFirebase).not.toHaveBeenCalled();
  });
});


it('alterar a data de preparo invalida a autorização já emitida', async () => {
 const session = createAssistantAuthorizationSession('test-user');
 const draft = (await prepareAssistantActions('test-user', [{ kind: 'create_expense', payload: { name: 'Teste', valueInCents: 100, date: '2026-10-01', bankRef: 'bank', categoryRef: 'tag' } }], {})).actions[0]!;
 session.recordUserMessage('confirm-date', 'Sim'); const authorization = session.authorize(draft, 'confirm-date', 'confirmation')!;
 expect(await financeCommandService.execute('test-user', { ...draft, preparedAt: '2026-10-01T00:00:00Z' }, {}, authorization)).toMatchObject({ success: false, errorCode: 'authorization-required' });
});


describe('correção e estorno nativos pela conversa', () => {
 const target = () => ({ groupId: 'spark-group', readerActorId: 'test-user', reference: { source: 'live' as const, operationId: 'original_op', family: 'ordinary' as const }, expectedFingerprint: 'confirmed-original', movementKind: 'expense' as const, accountId: 'bank', amountInCents: 200, effectiveAt: jest.requireActual('firebase/firestore').Timestamp.fromDate(new Date('2026-10-01T14:00:00Z')), categoryId: 'category', details: { name: 'Original', explanation: 'Descrição', paymentFormats: ['Pix'], moneyFormat: false }, personId: 'test-user' });
 const catalog: AssistantResolvedCatalog = { expenses: [{ handle: 'original', realId: 'original_op', label: 'Original', collection: 'sparkOperations', data: { groupId: 'spark-group', sparkExecutionReference: { source: 'live', operationId: 'original_op', family: 'ordinary' } } }] };
 beforeEach(() => { jest.mocked(getSparkContextFirebase).mockResolvedValue({ groupId: 'spark-group', actorId: 'test-user', role: 'member' }); jest.mocked(readSparkOrdinaryForEditFirebase).mockReset().mockResolvedValue(target()); jest.mocked(executeSparkMovementCommandFirebase).mockClear(); });
 afterEach(() => { jest.mocked(getSparkContextFirebase).mockResolvedValue(null); });
 const prepare = async (kind: 'update_expense' | 'delete_expense') => (await financeCommandService.prepareActions('test-user', [{ kind, payload: { recordRef: 'original', ...(kind === 'update_expense' ? { valueInCents: 300 } : {}) } }], catalog)).actions[0]!;
 it('prepara alvo canônico antes da confirmação e corrige preservando data e detalhes', async () => {
  const draft = await prepare('update_expense'); expect(draft.sparkMovementTarget?.expectedFingerprint).toBe('confirmed-original');
  expect(await confirmDraft(draft,catalog)).toMatchObject({ success: true }); expect(executeSparkMovementCommandFirebase).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'correct', amountInCents: 300, effectiveAt: target().effectiveAt, expectedFingerprint: 'confirmed-original', details: expect.objectContaining({ name: 'Original', paymentFormats: ['Pix'] }) }));
 });
 it('estorna sem excluir e reenvia o mesmo comando mesmo após o alvo ser resolvido', async () => {
  const draft = await prepare('delete_expense'); expect(await confirmDraft(draft,catalog)).toMatchObject({ success: true });
  jest.mocked(readSparkOrdinaryForEditFirebase).mockRejectedValueOnce(new Error('Já resolvido'));
  expect(await confirmDraft(draft,{})).toMatchObject({ success: true });
  const calls = jest.mocked(executeSparkMovementCommandFirebase).mock.calls; expect(calls[0]?.[1]).toEqual(calls[1]?.[1]); expect(calls[0]?.[1].action).toBe('reverse'); expect(readSparkOrdinaryForEditFirebase).toHaveBeenCalledTimes(1);
 });
 it('alterar alvo depois da autorização não executa', async () => {
  const draft = await prepare('delete_expense'); const session = createAssistantAuthorizationSession('test-user'); session.recordUserMessage('confirm','sim'); const authorization = session.authorize(draft,'confirm','confirmation')!;
  expect(await financeCommandService.execute('test-user', { ...draft, sparkMovementTarget: { ...draft.sparkMovementTarget!, amountInCents: 999 } },catalog,authorization)).toMatchObject({ success:false,errorCode:'authorization-required' }); expect(executeSparkMovementCommandFirebase).not.toHaveBeenCalled();
 });
 it('falha ao preparar alvo não publica proposta executável', async () => {
  jest.mocked(readSparkOrdinaryForEditFirebase).mockRejectedValueOnce(new Error('Já estornado')); await expect(prepare('delete_expense')).rejects.toThrow('Já estornado'); expect(executeSparkMovementCommandFirebase).not.toHaveBeenCalled();
 });
});


describe('transferências e saques Spark pelo chat', () => {
 const bank = (id: string, kind = 'bank') => ({handle:id,label:id,realId:id,collection:'sparkPositions',data:{groupId:'pairs-group',kind}});
 const catalog: AssistantResolvedCatalog = {banks:[bank('source'),bank('target'),bank('cash','cash')]};
 const prepare = async (kind: 'create_transfer'|'create_cash_withdrawal' = 'create_transfer', patch: Record<string,unknown> = {}, targetCatalog = catalog) => (await financeCommandService.prepareActions('test-user',[{kind,payload:{valueInCents:123,date:'2026-10-26',...(kind === 'create_transfer' ? {sourceBankRef:'source',targetBankRef:'target'} : {bankRef:'source'}),...patch}}],targetCatalog)).actions[0]!;
 beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-10-26T15:00:00Z')); jest.mocked(getSparkContextFirebase).mockResolvedValue({groupId:'pairs-group',actorId:'test-user',role:'member'}); jest.mocked(transferSparkFundsFirebase).mockReset().mockResolvedValue({transactionId:'pair',idempotent:false}); jest.mocked(transferSparkDatedFundsFirebase).mockReset().mockResolvedValue({transactionId:'pair',idempotent:false}); jest.mocked(transferFundsFinancialLedgerFirebase).mockClear(); });
 afterEach(() => { jest.useRealTimers(); jest.mocked(getSparkContextFirebase).mockResolvedValue(null); });
 it.each(['create_transfer','create_cash_withdrawal'] as const)('prepara %s e usa commit do servidor para hoje sem hora', async kind => {
  const draft = await prepare(kind); expect(draft.sparkPairCommand).not.toHaveProperty('effectiveAt');
  expect(await confirmDraft(draft,catalog)).toMatchObject({success:true});
  expect(transferSparkFundsFirebase).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({fromAccountId:'source',toAccountId:kind === 'create_transfer'?'target':'cash',amountInCents:123,clientActionId:draft.clientActionId}));
  expect(transferFundsFinancialLedgerFirebase).not.toHaveBeenCalled();
 });
 it('retry conserva par completo e funciona sem catálogo depois de resposta incerta', async () => {
  const draft = await prepare('create_cash_withdrawal'); jest.mocked(transferSparkFundsFirebase).mockRejectedValueOnce(new Error('unavailable'));
  expect(await confirmDraft(draft,catalog)).toMatchObject({success:false}); expect(await confirmDraft(draft,{})).toMatchObject({success:true});
  const calls = jest.mocked(transferSparkFundsFirebase).mock.calls; expect(calls[0]?.[1]).toEqual(calls[1]?.[1]);
 });
 it('retroativo usa protocolo datado e conserva a data no retry', async () => {
  const draft = await prepare('create_transfer',{date:'2026-10-25',time:'10:15'}); await confirmDraft(draft,catalog); await confirmDraft(draft,catalog);
  const calls = jest.mocked(transferSparkDatedFundsFirebase).mock.calls; expect(calls[0]?.[1].effectiveAt.toDate().toISOString()).toBe('2026-10-25T13:15:00.000Z'); expect(calls[0]?.[1]).toEqual(calls[1]?.[1]); expect(transferSparkFundsFirebase).not.toHaveBeenCalled();
 });
 it('alteração no par depois da autorização invalida o envio', async () => {
  const draft = await prepare(); const session = createAssistantAuthorizationSession('test-user');session.recordUserMessage('confirmation','sim'); const authorization = session.authorize(draft,'confirmation','confirmation')!;
  expect(await financeCommandService.execute('test-user',{...draft,sparkPairCommand:{...draft.sparkPairCommand!,amountInCents:999}},catalog,authorization)).toMatchObject({success:false,errorCode:'authorization-required'}); expect(transferSparkFundsFirebase).not.toHaveBeenCalled();
 });
 it('saque não inventa Caixa ausente e transferência não aceita Caixa como destino', async () => {
  await expect(prepare('create_cash_withdrawal',{}, {banks:[bank('source')]})).rejects.toThrow('Caixa');
  await expect(prepare('create_transfer',{targetBankRef:'cash'})).rejects.toThrow('Caixa'); expect(transferSparkFundsFirebase).not.toHaveBeenCalled();
 });
 it('contas com handles diferentes não permitem origem e destino com mesmo ID', async () => {
  await expect(prepare('create_transfer',{}, {banks:[bank('source'),{...bank('target'),realId:'source'}]})).rejects.toThrow('contas ativas');
 });
 it('data futura e justificativa de saldo negativo em transferência são recusadas no preparo', async () => {
  await expect(prepare('create_transfer',{date:'2026-10-27'})).rejects.toThrow('futura');
  await expect(prepare('create_transfer',{overdraftReason:'Teste negativo'})).rejects.toThrow('saldo suficiente');
 });
 it('virada do dia sem recibo bloqueia novo efeito; com recibo do dia original permite retry', async () => {
  const draft = await prepare(); jest.setSystemTime(new Date('2026-10-27T15:00:00Z'));
  expect(await confirmDraft(draft,{})).toMatchObject({success:false,errorCode:'day-changed'}); expect(transferSparkFundsFirebase).not.toHaveBeenCalled();
  mockDocuments.set(`financialGroups/pairs-group/sparkOperations/${draft.clientActionId}`,{createdAt:new Date('2026-10-26T15:01:00Z')});
  expect(await confirmDraft(draft,{})).toMatchObject({success:true});
 });
 it('recibo de outra data não é anunciado como sucesso deste pedido', async () => {
  const draft = await prepare(); mockDocuments.set(`financialGroups/pairs-group/sparkOperations/${draft.clientActionId}`,{createdAt:new Date('2026-10-25T15:00:00Z')});
  expect(await confirmDraft(draft,{})).toMatchObject({success:false,errorCode:'idempotency-conflict'}); expect(transferSparkFundsFirebase).not.toHaveBeenCalled();
 });
 it('pedido direto não autoriza transferir ou sacar sem confirmação explícita', async () => {
  const draft = await prepare(); const session = createAssistantAuthorizationSession('test-user'); session.recordUserMessage('direct','Registre uma transferência entre bancos'); expect(session.authorize(draft,'direct','direct')).toBeNull();
 });
});


describe('desfazer saque Spark pelo chat', () => {
 const original = {kind:'transfer',actorId:'test-user',fromAccountId:'bank',toAccountId:'cash',amountInCents:123};
 const item = (source: 'live'|'imported' = 'live') => ({handle:'withdrawal',label:'Saque em dinheiro',realId:'original_pair',collection:source === 'live'?'sparkOperations':'sparkImportedIdentities',data:{groupId:'undo-group',fromAccountId:'bank',valueInCents:123,bankName:'Banco de teste',sparkExecutionReference:{source,operationId:'original_pair',family:'pair'}}});
 const prepare = async (source: 'live'|'imported' = 'live') => (await financeCommandService.prepareActions('test-user',[{kind:'undo_cash_withdrawal',payload:{recordRef:'withdrawal'}}],{cashWithdrawals:[item(source)]})).actions[0]!;
 beforeEach(() => {
  jest.mocked(getSparkContextFirebase).mockResolvedValue({groupId:'undo-group',actorId:'test-user',role:'member'});
  mockDocuments.set('financialGroups/undo-group/sparkOperations/original_pair',original);
  mockDocuments.set('financialGroups/undo-group/sparkImportedIdentities/original_pair',{...original,pairResolutionAllowed:true});
  mockDocuments.set('financialGroups/undo-group/sparkPositions/bank',{schemaVersion:1,kind:'bank',active:true,balanceInCents:500,revision:1,lastOperationId:'original_pair',nextActivationAt:null});
  jest.mocked(prepareSparkPairReversalFirebase).mockReset().mockImplementation(async (_db,actorId,reference,clientActionId)=>({groupId:'undo-group',actorId,clientActionId,originalOperationId:reference.operationId,originalSource:reference.source,note:null,overdraftReason:null}));
  jest.mocked(executeSparkPairReversalFirebase).mockReset().mockResolvedValue({transactionId:'undo',idempotent:false});
 });
 afterEach(() => { jest.mocked(getSparkContextFirebase).mockResolvedValue(null); });
 it.each(['live','imported'] as const)('prepara origem %s e estorna par completo com ID confirmado', async source => {
  const draft = await prepare(source); expect(draft.sparkWithdrawalReversal?.amountInCents).toBe(123);
  expect(await confirmDraft(draft,{})).toMatchObject({success:true,message:expect.stringContaining('devolvido ao banco')});
  expect(executeSparkPairReversalFirebase).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({groupId:'undo-group',actorId:'test-user',clientActionId:draft.clientActionId,originalOperationId:'original_pair',originalSource:source,note:'Estorno de saque em dinheiro'}));
 });
 it('reenvia o mesmo estorno sem exigir alvo ainda presente no catálogo', async () => {
  const draft = await prepare(); jest.mocked(executeSparkPairReversalFirebase).mockRejectedValueOnce(new Error('resposta perdida'));
  expect(await confirmDraft(draft,{})).toMatchObject({success:false}); expect(await confirmDraft(draft,{})).toMatchObject({success:true});
  const calls = jest.mocked(executeSparkPairReversalFirebase).mock.calls; expect(calls[0]?.[1]).toEqual(calls[1]?.[1]); expect(prepareSparkPairReversalFirebase).toHaveBeenCalledTimes(1);
 });
 it('alterar o saque depois da autorização impede envio', async () => {
  const draft = await prepare(), session = createAssistantAuthorizationSession('test-user');session.recordUserMessage('confirm','sim');const authorization=session.authorize(draft,'confirm','confirmation')!;
  expect(await financeCommandService.execute('test-user',{...draft,sparkWithdrawalReversal:{...draft.sparkWithdrawalReversal!,amountInCents:999}},{},authorization)).toMatchObject({success:false,errorCode:'authorization-required'});expect(executeSparkPairReversalFirebase).not.toHaveBeenCalled();
 });
 it('recusa transferência bancária ou aporte disfarçado de saque', async () => {
  mockDocuments.set('financialGroups/undo-group/sparkOperations/original_pair',{...original,toAccountId:'other-bank'}); await expect(prepare()).rejects.toThrow('não é o saque');
  mockDocuments.set('financialGroups/undo-group/sparkOperations/original_pair',{...original,kind:'investment_redemption'}); await expect(prepare()).rejects.toThrow('não é o saque'); expect(executeSparkPairReversalFirebase).not.toHaveBeenCalled();
 });
 it('recusa alvo obsoleto ou indisponível antes da confirmação', async () => {
  jest.mocked(prepareSparkPairReversalFirebase).mockRejectedValueOnce(new Error('Saque já estornado'));await expect(prepare()).rejects.toThrow('já estornado');expect(executeSparkPairReversalFirebase).not.toHaveBeenCalled();
 });
 it('mudança de grupo não executa comando preparado', async () => {
  const draft=await prepare();jest.mocked(getSparkContextFirebase).mockResolvedValue({groupId:'other',actorId:'test-user',role:'member'});expect(await confirmDraft(draft,{})).toMatchObject({success:false,errorCode:'invalid-reference'});expect(executeSparkPairReversalFirebase).not.toHaveBeenCalled();
 });
 it('recusa financeira do executor não anuncia sucesso nem usa escritor legado', async () => {
  const draft=await prepare();jest.mocked(executeSparkPairReversalFirebase).mockRejectedValueOnce(new Error('Caixa insuficiente'));jest.mocked(transferFundsFinancialLedgerFirebase).mockClear();expect(await confirmDraft(draft,{})).toMatchObject({success:false});expect(transferFundsFinancialLedgerFirebase).not.toHaveBeenCalled();
 });
});


describe('pagamentos e recebimentos recorrentes Spark pelo chat', () => {
 const plan: SparkRecurringReadModel = {id:'plan',actorId:'test-user',recurringType:'expense',name:'Contrato',categoryId:'tag',startCycle:'2026-09',endCycle:'2026-11',historyFromCycle:'2026-09',valueInCents:333,installmentTotal:3,contractTotalInCents:1000,installmentsCompleted:2,active:true,revision:7,metadata:null,completedCycles:[],cycleWindow:{fromCycle:'2026-10',throughCycle:'2028-10'},cycleStates:[]};
 const catalog: AssistantResolvedCatalog = {
  banks:[{handle:'account',label:'Banco de teste',realId:'bank',collection:'sparkPositions',data:{groupId:'recurring-group',kind:'bank',isActive:true}}, {handle:'cash',label:'Dinheiro',realId:'cash',collection:'sparkPositions',data:{groupId:'recurring-group',kind:'cash',isActive:true}}],
  mandatoryExpenses:[{handle:'recurring',label:'Contrato',realId:'plan',collection:'sparkRecurringPlans',data:{groupId:'recurring-group',personId:'test-user'}}],
  mandatoryGains:[{handle:'recurring',label:'Contrato',realId:'plan',collection:'sparkRecurringPlans',data:{groupId:'recurring-group',personId:'test-user'}}],
 };
 const prepare = async (kind: 'pay_mandatory_expense'|'receive_mandatory_gain' = 'pay_mandatory_expense', patch: Record<string,unknown> = {}, source = catalog) => (await financeCommandService.prepareActions('test-user',[{kind,payload:{recordRef:'recurring',bankRef:'account',date:'2026-10-26',...patch}}],source)).actions[0]!;
 beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-26T15:45:00Z'));
  jest.mocked(getSparkContextFirebase).mockReset().mockResolvedValue({groupId:'recurring-group',actorId:'test-user',role:'member'});
  jest.mocked(readSparkRecurringPlansFirebase).mockReset().mockResolvedValue([{...plan}]);
  jest.mocked(settleSparkRecurringFirebase).mockReset().mockResolvedValue({transactionId:'settlement',idempotent:false});
  jest.mocked(suppressMandatoryExpenseNotificationCycle).mockReset().mockResolvedValue(undefined);
  jest.mocked(suppressMandatoryGainNotificationCycle).mockReset().mockResolvedValue(undefined);
  jest.mocked(completeFinancialRecurringFirebase).mockClear();jest.mocked(executeLegacyFinancialMovementFirebase).mockClear();mockWrites.length=0;
 });
 afterEach(() => {jest.useRealTimers();jest.mocked(getSparkContextFirebase).mockResolvedValue(null);(auth as any).currentUser={uid:'test-user'};});
 it.each(['pay_mandatory_expense','receive_mandatory_gain'] as const)('prepara %s com resto final e envia o comando capturado', async kind => {
  jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,recurringType:kind==='pay_mandatory_expense'?'expense':'gain'}]);
  const draft=await prepare(kind), command=draft.sparkRecurringSettlement!.command;
  expect(command).toMatchObject({planId:'plan',cycle:'2026-10',expectedPlanRevision:7,amountInCents:334,installmentsCount:1,accountId:'bank',overdraftReason:null});
  expect(command.effectiveAt.toDate().toISOString()).toBe('2026-10-26T15:45:00.000Z');
  expect(await confirmDraft(draft,catalog)).toMatchObject({success:true});
  expect(settleSparkRecurringFirebase).toHaveBeenCalledWith(expect.anything(),command);
  expect(kind==='pay_mandatory_expense'?suppressMandatoryExpenseNotificationCycle:suppressMandatoryGainNotificationCycle).toHaveBeenCalledWith('test-user','plan','2026-10');
  expect(completeFinancialRecurringFirebase).not.toHaveBeenCalled();expect(mockWrites).toHaveLength(0);
 });
 it.each([[1,2,667],[0,3,1000]])('soma parcelas pelo contador explícito %i e quantidade %i', async (completed,quantity,amount) => {
  jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,installmentsCompleted:completed}]);
  const draft=await prepare('pay_mandatory_expense',{installmentsToAdvance:quantity});expect(draft.sparkRecurringSettlement?.command).toMatchObject({amountInCents:amount,installmentsCount:quantity});
 });
 it('não avança parcelas pelo calendário e aceita valor variável de plano sem fim', async () => {
  jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,startCycle:'2020-01',endCycle:null,installmentTotal:null,contractTotalInCents:null,installmentsCompleted:0}]);
  expect((await prepare('pay_mandatory_expense',{valueInCents:450})).sparkRecurringSettlement?.command.amountInCents).toBe(450);
  expect((await prepare()).sparkRecurringSettlement?.command.amountInCents).toBe(333);
  await expect(prepare('pay_mandatory_expense',{installmentsToAdvance:2})).rejects.toThrow('sem fim');
 });
 it('marca liquidação após vigência e exige confirmação inclusive para ordem direta', async () => {
  jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,startCycle:'2026-07',historyFromCycle:'2026-07',endCycle:'2026-09'}]);
  const draft=await prepare();expect(draft.sparkRecurringSettlement?.command).toMatchObject({lateSettlement:true,note:expect.stringContaining('após a vigência')});
  const session=createAssistantAuthorizationSession('test-user');session.recordUserMessage('direct','Pague o contrato');expect(session.authorize(draft,'direct','direct')).toBeNull();
 });
 it('usa conta Caixa canônica e lê o mês civil solicitado em São Paulo', async () => {
  jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,cycleWindow:{fromCycle:'2026-09',throughCycle:'2028-09'}}]);
  const draft=await prepare('pay_mandatory_expense',{bankRef:'cash',date:'2026-09-30',time:'23:30'});
  expect(draft.sparkRecurringSettlement?.command).toMatchObject({cycle:'2026-09',accountId:'cash'});
  expect(draft.sparkRecurringSettlement?.command.effectiveAt.toDate().toISOString()).toBe('2026-10-01T02:30:00.000Z');
  expect(readSparkRecurringPlansFirebase).toHaveBeenCalledWith(expect.anything(),'test-user','recurring-group',new Date('2026-10-01T02:30:00Z'));
 });
 it.each([{valueInCents:333},{installmentsToAdvance:2}])('recusa valor ou quantidade incompatível com o restante %j', async patch => {
  await expect(prepare('pay_mandatory_expense',patch)).rejects.toThrow();expect(settleSparkRecurringFirebase).not.toHaveBeenCalled();
 });
 it.each([{actorId:'other'}, {recurringType:'gain'}, {active:false}, {successorPlanId:'new'}, {replanCancelled:true}])('recusa plano de outro titular/tipo ou indisponível %j', async patch => {
  jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,...patch} as SparkRecurringReadModel]);
  await expect(prepare()).rejects.toThrow('plano mudou');expect(settleSparkRecurringFirebase).not.toHaveBeenCalled();
 });
 it.each([{completedCycles:['2026-10']},{cycleStates:[{cycle:'2026-10',active:true}]}])('recusa ciclo já concluído %j', async patch => {
  jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,...patch} as SparkRecurringReadModel]);await expect(prepare()).rejects.toThrow('já foi pago');
 });
 it('não trata histórico desconhecido como pendência nem permite data futura', async () => {
  jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,historyFromCycle:'2026-11'}]);await expect(prepare()).rejects.toThrow('histórico confirmado');
  await expect(prepare('pay_mandatory_expense',{date:'2026-10-27'})).rejects.toThrow('data futura');
  await expect(prepare('pay_mandatory_expense',{time:'23:59'})).rejects.toThrow('data futura');
 });
 it('não usa referência legada nem conta de outro grupo no contexto Spark', async () => {
  await expect(prepare('pay_mandatory_expense',{}, {...catalog,mandatoryExpenses:[{...catalog.mandatoryExpenses![0]!,collection:'mandatoryExpenses'}]})).rejects.toThrow('Atualize');
  await expect(prepare('pay_mandatory_expense',{}, {...catalog,banks:[{...catalog.banks![0]!,data:{groupId:'other',kind:'bank'}}]})).rejects.toThrow('Atualize');
 });
 it('falha de leitura não consulta legado; troca de grupo durante o preparo descarta resultado', async () => {
  jest.mocked(readSparkRecurringPlansFirebase).mockRejectedValueOnce(new Error('sem conexão'));await expect(prepare()).rejects.toThrow('sem conexão');
  jest.mocked(getSparkContextFirebase).mockResolvedValueOnce({groupId:'recurring-group',actorId:'test-user',role:'member'}).mockResolvedValueOnce({groupId:'other',actorId:'test-user',role:'member'});
  await expect(prepare()).rejects.toThrow('grupo mudou');expect(completeFinancialRecurringFirebase).not.toHaveBeenCalled();
 });
 it('retry usa ID/data/revisão/valor idênticos sem reler plano já alterado pelo commit', async () => {
  const draft=await prepare();jest.mocked(settleSparkRecurringFirebase).mockRejectedValueOnce(new Error('resposta perdida'));
  expect(await confirmDraft(draft,{})).toMatchObject({success:false});jest.advanceTimersByTime(86400000);
  jest.mocked(readSparkRecurringPlansFirebase).mockRejectedValue(new Error('plano já pago'));
  expect(await confirmDraft(draft,{})).toMatchObject({success:true});
  const calls=jest.mocked(settleSparkRecurringFirebase).mock.calls;expect(calls[0]?.[1]).toEqual(calls[1]?.[1]);expect(readSparkRecurringPlansFirebase).toHaveBeenCalledTimes(1);
 });
 it('alteração do comando após autorização é recusada; troca de grupo não envia', async () => {
  const draft=await prepare(), session=createAssistantAuthorizationSession('test-user');session.recordUserMessage('confirm','sim');const grant=session.authorize(draft,'confirm','confirmation')!;
  const altered={...draft,sparkRecurringSettlement:{...draft.sparkRecurringSettlement!,command:{...draft.sparkRecurringSettlement!.command,amountInCents:999}}};
  expect(await financeCommandService.execute('test-user',altered,{},grant)).toMatchObject({success:false,errorCode:'authorization-required'});
  jest.mocked(getSparkContextFirebase).mockResolvedValue({groupId:'other',actorId:'test-user',role:'member'});expect(await confirmDraft(draft,{})).toMatchObject({success:false,errorCode:'invalid-reference'});expect(settleSparkRecurringFirebase).not.toHaveBeenCalled();
 });
 it('edição do rascunho prepara novo comando e invalida autorização anterior', async () => {
  const draft=await prepare(), session=createAssistantAuthorizationSession('test-user');session.recordUserMessage('confirm','sim');const grant=session.authorize(draft,'confirm','confirmation')!;
  const edited=await financeCommandService.updateDraft('test-user',draft,{bankRef:'cash'},catalog);
  expect(edited.sparkRecurringSettlement?.command.accountId).toBe('cash');expect(edited.clientActionId).toBe(draft.clientActionId);
  expect(await financeCommandService.execute('test-user',edited,{},grant)).toMatchObject({success:false,errorCode:'authorization-required'});expect(settleSparkRecurringFirebase).not.toHaveBeenCalled();
 });
 it('sem comando preparado e com falha financeira não anuncia sucesso nem usa fallback', async () => {
  const draft=await prepare();expect(await confirmDraft({...draft,sparkRecurringSettlement:undefined},catalog)).toMatchObject({success:false,errorCode:'invalid-reference'});
  jest.mocked(settleSparkRecurringFirebase).mockRejectedValueOnce(new Error('saldo insuficiente'));expect(await confirmDraft(draft,catalog)).toMatchObject({success:false});expect(completeFinancialRecurringFirebase).not.toHaveBeenCalled();expect(executeLegacyFinancialMovementFirebase).not.toHaveBeenCalled();expect(suppressMandatoryExpenseNotificationCycle).not.toHaveBeenCalled();
 });
 it('perda do contexto Spark não ativa caminho legado no preparo nem no reenvio', async () => {
  const draft=await prepare();jest.mocked(getSparkContextFirebase).mockResolvedValue(null);jest.mocked(getFinancialLedgerContextFirebase).mockClear();
  await expect(prepare()).rejects.toThrow('grupo Spark não está disponível');expect(await confirmDraft(draft,{})).toMatchObject({success:false,errorCode:'invalid-reference'});
  expect(getFinancialLedgerContextFirebase).not.toHaveBeenCalled();expect(settleSparkRecurringFirebase).not.toHaveBeenCalled();expect(mockWrites).toHaveLength(0);
 });
 it('conta de leitura ou Caixa fictício não são aceitos para pagamento', async () => {
  const readOnly=await prepare('pay_mandatory_expense',{}, {...catalog,mandatoryExpenses:[{...catalog.mandatoryExpenses![0]!,ownerScope:'related_read_only'}]});expect(readOnly.missingFields.map(field=>field.key)).toContain('recordRef');expect(readOnly.sparkRecurringSettlement).toBeUndefined();
  await expect(prepare('pay_mandatory_expense',{}, {...catalog,banks:[{...catalog.banks![0]!,data:{groupId:'recurring-group',kind:'cash'}}]})).rejects.toThrow('Atualize');
 });
 it('falha da agenda preserva sucesso; retry nativo atualiza só o lembrete sem reler legado', async () => {
  const draft=await prepare();jest.mocked(suppressMandatoryExpenseNotificationCycle).mockRejectedValueOnce(new Error('agenda'));
  const result=await confirmDraft(draft,{});expect(result).toMatchObject({success:true,notificationWarning:expect.any(String),notificationRetry:{operation:'suppress_cycle',templateId:'plan',cycle:'2026-10'}});
  const completed:AssistantDraftAction={...draft,status:'succeeded',result};
  expect(await financeCommandService.retryNotification('test-user',completed,{})).toMatchObject({success:true});expect(settleSparkRecurringFirebase).toHaveBeenCalledTimes(1);expect(suppressMandatoryExpenseNotificationCycle).toHaveBeenCalledTimes(2);expect(readSparkRecurringPlansFirebase).toHaveBeenCalledTimes(1);
  (auth as any).currentUser={uid:'other'};expect(await financeCommandService.retryNotification('test-user',completed,{})).toMatchObject({success:false});expect(suppressMandatoryExpenseNotificationCycle).toHaveBeenCalledTimes(2);
 });
});


describe('desfazer pagamentos e recebimentos recorrentes Spark pelo chat', () => {
 const date=new Date('2026-10-01T02:30:00Z'), effectiveAt=new Date('2026-10-23T15:00:00Z');
 const state={cycle:'2026-10',active:true,settlementOperationId:'settled',accountId:'bank',amountInCents:667,installmentsCount:2,installmentsBefore:1,installmentsAfter:3,effectiveAt};
 const base:SparkRecurringReadModel={id:'plan',actorId:'test-user',recurringType:'expense',name:'Contrato',categoryId:'tag',startCycle:'2026-08',endCycle:'2026-10',historyFromCycle:'2026-08',valueInCents:333,installmentTotal:3,contractTotalInCents:1000,installmentsCompleted:3,active:true,revision:7,metadata:{dueDay:30,usesBusinessDays:false,description:null,reminderConfigVersion:1,reminderEnabled:true,reminderDaysBefore:1,reminderOnDueDate:true,reminderHour:19,reminderMinute:0},completedCycles:['2026-10'],cycleWindow:{fromCycle:'2026-10',throughCycle:'2028-10'},cycleStates:[state]};
 let livePlan:SparkRecurringReadModel;
 const original=(patch:Record<string,unknown>={})=>({kind:'recurring_settlement',actorId:'test-user',planId:'plan',cycle:'2026-10',recurringType:'expense',accountId:'bank',amountInCents:667,installmentsCount:2,differenceInCents:-667,effectiveAt,...patch});
 const catalog:AssistantResolvedCatalog={banks:[{handle:'account',label:'Banco de teste',realId:'bank',collection:'sparkPositions',data:{groupId:'reverse-recurring',kind:'bank'}}],mandatoryExpenses:[{handle:'plan',label:'Contrato',realId:'plan',collection:'sparkRecurringPlans',data:{groupId:'reverse-recurring',personId:'test-user'}}],mandatoryGains:[{handle:'plan',label:'Contrato',realId:'plan',collection:'sparkRecurringPlans',data:{groupId:'reverse-recurring',personId:'test-user'}}]};
 const prepare=async(kind:'undo_mandatory_expense_payment'|'undo_mandatory_gain_receipt'='undo_mandatory_expense_payment')=>(await financeCommandService.prepareActions('test-user',[{kind,payload:{recordRef:'plan'}}],catalog)).actions[0]!;
 beforeEach(()=>{
  jest.useFakeTimers().setSystemTime(new Date('2026-10-26T15:00:00Z'));livePlan={...base,cycleStates:[{...state}]};
  jest.mocked(getSparkContextFirebase).mockReset().mockResolvedValue({groupId:'reverse-recurring',actorId:'test-user',role:'member'});
  jest.mocked(readSparkRecurringPlansFirebase).mockReset().mockImplementation(async()=>[livePlan]);
  jest.mocked(undoSparkRecurringFirebase).mockReset().mockImplementation(async()=>{livePlan={...livePlan,installmentsCompleted:1,revision:8,completedCycles:[],cycleStates:[{...state,active:false}]};return{transactionId:'undo',idempotent:false};});
  jest.mocked(scheduleMandatoryExpenseNotification).mockReset().mockResolvedValue({success:true} as any);jest.mocked(scheduleMandatoryGainNotification).mockReset().mockResolvedValue({success:true} as any);
  jest.mocked(cancelMandatoryExpenseNotification).mockReset().mockResolvedValue(undefined as any);jest.mocked(cancelMandatoryGainNotification).mockReset().mockResolvedValue(undefined as any);
  jest.mocked(completeFinancialRecurringFirebase).mockClear();jest.mocked(executeLegacyFinancialMovementFirebase).mockClear();mockWrites.length=0;
  mockDocuments.set('financialGroups/reverse-recurring/sparkOperations/settled',original());
 });
 afterEach(()=>{jest.useRealTimers();jest.mocked(getSparkContextFirebase).mockResolvedValue(null);(auth as any).currentUser={uid:'test-user'};});
 it.each(['undo_mandatory_expense_payment','undo_mandatory_gain_receipt'] as const)('%s prepara valor efetivado e envia inverso pelo protocolo',async kind=>{
  if(kind==='undo_mandatory_gain_receipt'){livePlan={...livePlan,recurringType:'gain'};mockDocuments.set('financialGroups/reverse-recurring/sparkOperations/settled',original({recurringType:'gain',differenceInCents:667}));}
  const draft=await prepare(kind), prepared=draft.sparkRecurringReversal!;
  expect(prepared).toMatchObject({amountInCents:667,installmentsCount:2,bankName:'Banco de teste',command:{cycle:'2026-10',expectedPlanRevision:7,settlementOperationId:'settled',overdraftReason:null}});expect(prepared.command.effectiveAt.toDate()).toEqual(effectiveAt);
  expect(await confirmDraft(draft,{})).toMatchObject({success:true,message:expect.stringContaining('histórico preservado')});expect(undoSparkRecurringFirebase).toHaveBeenCalledWith(expect.anything(),prepared.command);
  expect(kind==='undo_mandatory_expense_payment'?scheduleMandatoryExpenseNotification:scheduleMandatoryGainNotification).toHaveBeenCalledWith(expect.objectContaining({accountId:'test-user',name:'Contrato',lastCompletedCycle:null,requestPermission:false,dueDay:30}));
  expect(completeFinancialRecurringFirebase).not.toHaveBeenCalled();expect(mockWrites).toHaveLength(0);
 });
 it('permite plano arquivado e limpa o lembrete sem reativar o contrato',async()=>{
  livePlan={...livePlan,active:false};const draft=await prepare();expect(await confirmDraft(draft,{})).toMatchObject({success:true});expect(cancelMandatoryExpenseNotification).toHaveBeenCalledWith('test-user','plan');expect(scheduleMandatoryExpenseNotification).not.toHaveBeenCalled();
 });
 it('valor negociado é estornado pelo valor real e não pela soma nominal atual',async()=>{
  livePlan={...livePlan,cycleStates:[{...state,amountInCents:500,settlementMode:'negotiated',contractAmountInCents:667}]};mockDocuments.set('financialGroups/reverse-recurring/sparkOperations/settled',original({amountInCents:500,differenceInCents:-500}));expect((await prepare()).sparkRecurringReversal?.amountInCents).toBe(500);
 });
 it('aceita receipt importado e identifica Dinheiro como conta original',async()=>{
  livePlan={...livePlan,cycleStates:[{...state,accountId:'cash'}]};mockDocuments.set('financialGroups/reverse-recurring/sparkOperations/settled',original({kind:'imported_recurring_settlement',accountId:'cash'}));expect((await prepare()).sparkRecurringReversal?.bankName).toBe('Dinheiro');
 });
 it.each([{actorId:'other'},{recurringType:'gain'},{successorPlanId:'new'},{replanCancelled:true}])('recusa titular/tipo/replanejamento incompatível %j',async patch=>{livePlan={...livePlan,...patch} as SparkRecurringReadModel;await expect(prepare()).rejects.toThrow('plano mudou');expect(undoSparkRecurringFirebase).not.toHaveBeenCalled();});
 it('não desfaz parcela anterior à última faixa efetivada nem presume ciclo',async()=>{
  livePlan={...livePlan,installmentsCompleted:4};await expect(prepare()).rejects.toThrow('parcelas efetivadas depois');livePlan={...base,cycleStates:[]};await expect(prepare()).rejects.toThrow('ciclo atual');livePlan={...base,cycleStates:[{...state,active:false}]};await expect(prepare()).rejects.toThrow('ciclo atual');
 });
 it.each([{amountInCents:666},{differenceInCents:667},{kind:'income'},{actorId:'other'},{accountId:'cash'},{installmentsCount:1},{effectiveAt:new Date('2026-10-24T15:00:00Z')}])('recusa original divergente do ciclo %j',async patch=>{mockDocuments.set('financialGroups/reverse-recurring/sparkOperations/settled',original(patch));await expect(prepare()).rejects.toThrow('original não corresponde');expect(undoSparkRecurringFirebase).not.toHaveBeenCalled();});
 it('histórico desconhecido, leitura falha ou grupo alterado não iniciam estorno',async()=>{
  livePlan={...base,historyFromCycle:'2026-11'};await expect(prepare()).rejects.toThrow('histórico confirmado');livePlan={...base};jest.mocked(readSparkRecurringPlansFirebase).mockRejectedValueOnce(new Error('offline'));await expect(prepare()).rejects.toThrow('offline');
  jest.mocked(getSparkContextFirebase).mockResolvedValueOnce({groupId:'reverse-recurring',actorId:'test-user',role:'member'}).mockResolvedValueOnce({groupId:'other',actorId:'test-user',role:'member'});await expect(prepare()).rejects.toThrow('grupo mudou');expect(undoSparkRecurringFirebase).not.toHaveBeenCalled();
 });
 it('usa ciclo civil de São Paulo na virada de mês',async()=>{
  jest.setSystemTime(date);livePlan={...base,historyFromCycle:'2026-08',cycleWindow:{fromCycle:'2026-09',throughCycle:'2028-09'},cycleStates:[{...state,cycle:'2026-09',effectiveAt:new Date('2026-09-23T15:00:00Z')}]};mockDocuments.set('financialGroups/reverse-recurring/sparkOperations/settled',original({cycle:'2026-09',effectiveAt:new Date('2026-09-23T15:00:00Z')}));expect((await prepare()).sparkRecurringReversal?.command.cycle).toBe('2026-09');
 });
 it('reenvio após resposta perdida usa mesmo comando sem plano/catálogo ainda ativos',async()=>{
  const draft=await prepare();jest.mocked(undoSparkRecurringFirebase).mockRejectedValueOnce(new Error('resposta perdida'));expect(await confirmDraft(draft,{})).toMatchObject({success:false});
  jest.mocked(readSparkRecurringPlansFirebase).mockRejectedValue(new Error('sem leitura'));jest.advanceTimersByTime(7*86400000);mockDocuments.delete('financialGroups/reverse-recurring/sparkOperations/settled');expect(await confirmDraft(draft,{})).toMatchObject({success:true,notificationWarning:expect.any(String)});
  const calls=jest.mocked(undoSparkRecurringFirebase).mock.calls;expect(calls[0]?.[1]).toEqual(calls[1]?.[1]);expect(calls[1]?.[1].cycle).toBe('2026-10');
 });
 it('comando/valor adulterados após autorização são recusados',async()=>{
  const draft=await prepare(),session=createAssistantAuthorizationSession('test-user');session.recordUserMessage('sim','sim');const grant=session.authorize(draft,'sim','confirmation')!;
  expect(await financeCommandService.execute('test-user',{...draft,sparkRecurringReversal:{...draft.sparkRecurringReversal!,amountInCents:999}},{},grant)).toMatchObject({success:false,errorCode:'authorization-required'});expect(undoSparkRecurringFirebase).not.toHaveBeenCalled();
 });
 it('perda ou troca do contexto Spark não utiliza caminho legado',async()=>{
  const draft=await prepare();jest.mocked(getSparkContextFirebase).mockResolvedValue(null);jest.mocked(getFinancialLedgerContextFirebase).mockClear();await expect(prepare()).rejects.toThrow('grupo Spark não está disponível');expect(await confirmDraft(draft,{})).toMatchObject({success:false,errorCode:'invalid-reference'});expect(getFinancialLedgerContextFirebase).not.toHaveBeenCalled();
  jest.mocked(getSparkContextFirebase).mockResolvedValue({groupId:'other',actorId:'test-user',role:'member'});expect(await confirmDraft(draft,{})).toMatchObject({success:false,errorCode:'invalid-reference'});expect(undoSparkRecurringFirebase).not.toHaveBeenCalled();
 });
 it('falha financeira ou ausência do comando preparado não anunciam sucesso',async()=>{
  const draft=await prepare();expect(await confirmDraft({...draft,sparkRecurringReversal:undefined},catalog)).toMatchObject({success:false,errorCode:'invalid-reference'});jest.mocked(undoSparkRecurringFirebase).mockRejectedValueOnce(new Error('saldo insuficiente'));expect(await confirmDraft(draft,{})).toMatchObject({success:false});expect(completeFinancialRecurringFirebase).not.toHaveBeenCalled();expect(scheduleMandatoryExpenseNotification).not.toHaveBeenCalled();
 });
 it('falha da agenda conserva sucesso e retry atualiza somente o lembrete',async()=>{
  const draft=await prepare();jest.mocked(scheduleMandatoryExpenseNotification).mockRejectedValueOnce(new Error('agenda'));const result=await confirmDraft(draft,{});expect(result).toMatchObject({success:true,notificationWarning:expect.any(String),notificationRetry:{operation:'sync',cycle:'2026-10'}});
  const completed:AssistantDraftAction={...draft,status:'succeeded',result};expect(await financeCommandService.retryNotification('test-user',completed,{})).toMatchObject({success:true});expect(undoSparkRecurringFirebase).toHaveBeenCalledTimes(1);expect(scheduleMandatoryExpenseNotification).toHaveBeenCalledTimes(2);
  const changedActor={...completed,sparkRecurringReversal:{...completed.sparkRecurringReversal!,command:{...completed.sparkRecurringReversal!.command,actorId:'other'}}};
  expect(await financeCommandService.retryNotification('test-user',changedActor,{})).toMatchObject({success:false});expect(scheduleMandatoryExpenseNotification).toHaveBeenCalledTimes(2);
  (auth as any).currentUser={uid:'other'};expect(await financeCommandService.retryNotification('test-user',completed,{})).toMatchObject({success:false});expect(scheduleMandatoryExpenseNotification).toHaveBeenCalledTimes(2);
 });
 it('retry de lembrete respeita um ciclo pago novamente e não reabre aviso',async()=>{
  const draft=await prepare();jest.mocked(scheduleMandatoryExpenseNotification).mockRejectedValueOnce(new Error('agenda'));const result=await confirmDraft(draft,{});livePlan={...base,installmentTotal:4,contractTotalInCents:1333,endCycle:'2026-11'};
  expect(await financeCommandService.retryNotification('test-user',{...draft,status:'succeeded',result},{})).toMatchObject({success:true});expect(scheduleMandatoryExpenseNotification).toHaveBeenLastCalledWith(expect.objectContaining({lastCompletedCycle:'2026-10'}));expect(undoSparkRecurringFirebase).toHaveBeenCalledTimes(1);
 });
});


describe('cadastro e edição de recorrências Spark pelo chat',()=>{
 const plan:SparkRecurringReadModel={id:'existing',actorId:'test-user',recurringType:'expense',name:'Contrato',categoryId:'category',startCycle:'2026-08',endCycle:'2026-10',historyFromCycle:'2026-08',valueInCents:333,installmentTotal:3,contractTotalInCents:1000,installmentsCompleted:1,active:true,revision:4,metadataRevision:2,metadata:{dueDay:30,usesBusinessDays:true,description:'Anterior',reminderConfigVersion:1,reminderEnabled:false,reminderDaysBefore:2,reminderOnDueDate:true,reminderHour:19,reminderMinute:20},completedCycles:[],cycleWindow:{fromCycle:'2026-10',throughCycle:'2028-10'},cycleStates:[]};
 const category={handle:'category',label:'Categoria autorizada',realId:'category',collection:'tags',data:{groupId:'definitions',personId:'other',usageType:'both'}};
 const catalog:AssistantResolvedCatalog={mandatoryExpenseCategories:[category],mandatoryGainCategories:[category],mandatoryExpenses:[{handle:'existing',label:'Contrato',realId:'existing',collection:'sparkRecurringPlans',data:{groupId:'definitions',personId:'test-user'}}],mandatoryGains:[{handle:'existing',label:'Contrato',realId:'existing',collection:'sparkRecurringPlans',data:{groupId:'definitions',personId:'test-user'}}]};
 type Kind='create_mandatory_expense'|'create_mandatory_gain'|'update_mandatory_expense'|'update_mandatory_gain';
 const prepare=async(kind:Kind='create_mandatory_expense',patch:Record<string,unknown>={})=>(await financeCommandService.prepareActions('test-user',[{kind,payload:{...(kind.startsWith('create_')?{name:'Internet',valueInCents:10000,dueDay:25,categoryRef:'category'}:{recordRef:'existing',name:'Novo nome'}),...patch}}],catalog)).actions[0]!;
 beforeEach(()=>{
  jest.useFakeTimers().setSystemTime(new Date('2026-10-26T15:00:00Z'));jest.mocked(getSparkContextFirebase).mockReset().mockResolvedValue({groupId:'definitions',actorId:'test-user',role:'member'});jest.mocked(readSparkRecurringPlansFirebase).mockReset().mockResolvedValue([plan]);
  jest.mocked(createSparkRecurringPlanFirebase).mockReset().mockResolvedValue({transactionId:'definition',idempotent:false});jest.mocked(updateSparkRecurringPlanFirebase).mockReset().mockResolvedValue({transactionId:'definition',idempotent:false});jest.mocked(saveSparkRecurringMetadataFirebase).mockReset().mockResolvedValue({transactionId:'metadata',idempotent:false});
  jest.mocked(settleSparkRecurringFirebase).mockClear();jest.mocked(completeFinancialRecurringFirebase).mockClear();jest.mocked(cancelMandatoryExpenseNotification).mockReset().mockResolvedValue(undefined as any);jest.mocked(cancelMandatoryGainNotification).mockReset().mockResolvedValue(undefined as any);mockWrites.length=0;
 });
 afterEach(()=>{jest.useRealTimers();jest.mocked(getSparkContextFirebase).mockResolvedValue(null);(auth as any).currentUser={uid:'test-user'};});
 it.each(['create_mandatory_expense','create_mandatory_gain'] as const)('%s salva definição e metadados sem efetivar ciclo',async kind=>{
  const draft=await prepare(kind), prepared=draft.sparkRecurringDefinition!;jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,id:prepared.definition.input.planId,recurringType:prepared.recurringType,metadata:prepared.metadata.metadata}]);
  expect(prepared.definition).toMatchObject({action:'create',input:{clientActionId:draft.clientActionId,valueInCents:10000,installmentTotal:null,contractTotalInCents:null,startCycle:'2026-10',categoryId:'category'}});expect(prepared.metadata.clientActionId).not.toBe(draft.clientActionId);
  expect(await confirmDraft(draft,catalog)).toMatchObject({success:true});expect(createSparkRecurringPlanFirebase).toHaveBeenCalledWith(expect.anything(),prepared.definition.input);expect(saveSparkRecurringMetadataFirebase).toHaveBeenCalledWith(expect.anything(),prepared.metadata);expect(settleSparkRecurringFirebase).not.toHaveBeenCalled();expect(completeFinancialRecurringFirebase).not.toHaveBeenCalled();expect(mockWrites).toHaveLength(0);
 });
 it('captura contrato finito exato com resto final e vigência futura',async()=>{
  const draft=await prepare('create_mandatory_expense',{valueInCents:333,installmentTotal:3,installmentTotalValueInCents:1000,installmentStartDate:'2026-11-15',installmentEndDate:'2027-01-31'});expect(draft.sparkRecurringDefinition).toMatchObject({startCycle:'2026-11',endCycle:'2027-01',installmentTotal:3,contractTotalInCents:1000,definition:{input:{valueInCents:333}}});
 });
 it('calcula total a partir do nominal quando não foi informado',async()=>{expect((await prepare('create_mandatory_gain',{valueInCents:333,installmentTotal:3})).sparkRecurringDefinition?.contractTotalInCents).toBe(999);});
 it.each([{installmentStartDate:'2026-11-01'},{valueInCents:334,installmentTotal:3,installmentTotalValueInCents:1000},{installmentTotalValueInCents:1000},{installmentTotal:3,installmentEndDate:'2026-11-30'},{valueInCents:1e12,installmentTotal:360}])('recusa contrato/data/limite incoerente %j',async patch=>{await expect(prepare('create_mandatory_expense',patch)).rejects.toThrow();expect(createSparkRecurringPlanFirebase).not.toHaveBeenCalled();});
 it.each(['update_mandatory_expense','update_mandatory_gain'] as const)('%s preserva contrato e campos omitidos com revisões canônicas',async kind=>{
  jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,recurringType:kind.endsWith('expense')?'expense':'gain'}]);const draft=await prepare(kind,{dueDay:28,description:null}),prepared=draft.sparkRecurringDefinition!;
  expect(prepared.definition).toMatchObject({action:'update',input:{planId:'existing',expectedPlanRevision:4,name:'Novo nome',valueInCents:333,categoryId:'category',active:true}});expect(prepared.metadata).toMatchObject({expectedMetadataRevision:2,metadata:{dueDay:28,description:null,usesBusinessDays:true,reminderHour:19,reminderMinute:20}});
  expect(await confirmDraft(draft,{})).toMatchObject({success:true});expect(updateSparkRecurringPlanFirebase).toHaveBeenCalledWith(expect.anything(),prepared.definition.input);expect(settleSparkRecurringFirebase).not.toHaveBeenCalled();
 });
 it.each([{installmentTotal:4},{installmentTotal:null},{installmentTotalValueInCents:1100},{valueInCents:334},{installmentStartDate:'2026-09-01'},{installmentStartDate:null},{installmentEndDate:null}])('edição recusa alteração de contrato sem replanejar %j',async patch=>{await expect(prepare('update_mandatory_expense',patch)).rejects.toThrow();expect(updateSparkRecurringPlanFirebase).not.toHaveBeenCalled();});
 it('plano sem fim permite atualizar nominal e preserva contador sem pagamentos',async()=>{jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,installmentTotal:null,contractTotalInCents:null,endCycle:null,installmentsCompleted:0}]);expect((await prepare('update_mandatory_expense',{valueInCents:450})).sparkRecurringDefinition?.definition.input.valueInCents).toBe(450);});
 it.each([{actorId:'other'},{recurringType:'gain'},{successorPlanId:'new'},{replanCancelled:true}])('recusa edição de alvo incompatível %j',async patch=>{jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,...patch} as SparkRecurringReadModel]);await expect(prepare('update_mandatory_expense')).rejects.toThrow('recorrência mudou');});
 it('lembrete sem vencimento confirmado pergunta o dia antes de preparar',async()=>{
  jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,metadata:null}]);const draft=await prepare('update_mandatory_expense',{reminderEnabled:true});expect(draft.missingFields.map(field=>field.key)).toEqual(['dueDay']);expect(draft.sparkRecurringDefinition).toBeUndefined();const updated=await financeCommandService.updateDraft('test-user',draft,{dueDay:12},catalog);expect(updated.sparkRecurringDefinition?.metadata.metadata.dueDay).toBe(12);
 });
 it('guarda as duas identidades no reenvio após perda da resposta da definição',async()=>{
  const draft=await prepare();jest.mocked(createSparkRecurringPlanFirebase).mockRejectedValueOnce(new Error('resposta perdida'));expect(await confirmDraft(draft,{})).toMatchObject({success:false});jest.advanceTimersByTime(7*86400000);expect(await confirmDraft(draft,{})).toMatchObject({success:true});const calls=jest.mocked(createSparkRecurringPlanFirebase).mock.calls;expect(calls[0]?.[1]).toEqual(calls[1]?.[1]);expect(saveSparkRecurringMetadataFirebase).toHaveBeenCalledWith(expect.anything(),draft.sparkRecurringDefinition!.metadata);
 });
 it('falha entre definição e configuração informa parcial e retoma receipts imutáveis',async()=>{
  const draft=await prepare();jest.mocked(saveSparkRecurringMetadataFirebase).mockRejectedValueOnce(new Error('offline'));expect(await confirmDraft(draft,{})).toMatchObject({success:false,errorCode:'recurring-configuration-pending',message:expect.stringContaining('definição está confirmada')});
  await expect(financeCommandService.updateDraft('test-user',draft,{name:'Outro nome'},catalog)).rejects.toThrow('mesmos dados');expect(await confirmDraft(draft,{})).toMatchObject({success:true});const definitions=jest.mocked(createSparkRecurringPlanFirebase).mock.calls,metadata=jest.mocked(saveSparkRecurringMetadataFirebase).mock.calls;expect(definitions[0]?.[1]).toEqual(definitions[1]?.[1]);expect(metadata[0]?.[1]).toEqual(metadata[1]?.[1]);
 });
 it('retry de edição não relê o plano cuja revisão já mudou pelo próprio commit',async()=>{
  const draft=await prepare('update_mandatory_expense');jest.mocked(saveSparkRecurringMetadataFirebase).mockRejectedValueOnce(new Error('resposta perdida'));expect(await confirmDraft(draft,{})).toMatchObject({success:false});jest.mocked(readSparkRecurringPlansFirebase).mockRejectedValue(new Error('leitura indisponível'));expect(await confirmDraft(draft,{})).toMatchObject({success:true,notificationWarning:expect.any(String)});const calls=jest.mocked(updateSparkRecurringPlanFirebase).mock.calls;expect(calls[0]?.[1]).toEqual(calls[1]?.[1]);
 });
 it('edição antes do envio recompila comando e invalida confirmação anterior',async()=>{
  const draft=await prepare(),session=createAssistantAuthorizationSession('test-user');session.recordUserMessage('sim','sim');const grant=session.authorize(draft,'sim','confirmation')!;const updated=await financeCommandService.updateDraft('test-user',draft,{name:'Outro nome'},catalog);expect(updated.sparkRecurringDefinition?.definition.input.planId).toBe(draft.sparkRecurringDefinition?.definition.input.planId);expect(await financeCommandService.execute('test-user',updated,{},grant)).toMatchObject({success:false,errorCode:'authorization-required'});expect(createSparkRecurringPlanFirebase).not.toHaveBeenCalled();
 });
 it('alteração de metadados após autorização impede qualquer fase',async()=>{
  const draft=await prepare(),session=createAssistantAuthorizationSession('test-user');session.recordUserMessage('sim','sim');const grant=session.authorize(draft,'sim','confirmation')!;const prepared=draft.sparkRecurringDefinition!;expect(await financeCommandService.execute('test-user',{...draft,sparkRecurringDefinition:{...prepared,metadata:{...prepared.metadata,metadata:{...prepared.metadata.metadata,dueDay:1}}}},{},grant)).toMatchObject({success:false,errorCode:'authorization-required'});expect(createSparkRecurringPlanFirebase).not.toHaveBeenCalled();expect(saveSparkRecurringMetadataFirebase).not.toHaveBeenCalled();
 });
 it('perda ou troca do grupo Spark não ativa fallback legado',async()=>{
  const draft=await prepare();jest.mocked(getSparkContextFirebase).mockResolvedValue(null);jest.mocked(getFinancialLedgerContextFirebase).mockClear();expect(await confirmDraft(draft,{})).toMatchObject({success:false,errorCode:'invalid-reference'});expect(getFinancialLedgerContextFirebase).not.toHaveBeenCalled();jest.mocked(getSparkContextFirebase).mockResolvedValue({groupId:'other',actorId:'test-user',role:'member'});expect(await confirmDraft(draft,{})).toMatchObject({success:false});expect(createSparkRecurringPlanFirebase).not.toHaveBeenCalled();
 });
 it('cancelamento entre fases conserva definição confirmada e não envia metadados',async()=>{
  const draft=await prepare(),controller=new AbortController(),session=createAssistantAuthorizationSession('test-user');session.recordUserMessage('sim','sim');const grant=session.authorize(draft,'sim','confirmation')!;
  jest.mocked(createSparkRecurringPlanFirebase).mockImplementationOnce(async()=>{controller.abort();return{transactionId:'definition',idempotent:false};});expect(await financeCommandService.execute('test-user',draft,{},grant,{signal:controller.signal})).toMatchObject({success:false,errorCode:'recurring-configuration-pending'});expect(saveSparkRecurringMetadataFirebase).not.toHaveBeenCalled();
 });
 it('cancelamento comprovado da definição exige nova intenção e não envia configuração',async()=>{
  const draft=await prepare();jest.mocked(createSparkRecurringPlanFirebase).mockRejectedValueOnce(Object.assign(new Error('cancelada'),{sparkIntentCancelled:true}));expect(await confirmDraft(draft,{})).toMatchObject({success:false,errorCode:'recurring-intent-cancelled'});expect(saveSparkRecurringMetadataFirebase).not.toHaveBeenCalled();
 });
 it('cancelamento comprovado dos metadados orienta editar o plano já salvo',async()=>{
  const draft=await prepare();jest.mocked(saveSparkRecurringMetadataFirebase).mockRejectedValueOnce(Object.assign(new Error('cancelada'),{sparkIntentCancelled:true}));expect(await confirmDraft(draft,{})).toMatchObject({success:false,errorCode:'recurring-configuration-cancelled',message:expect.stringContaining('edite essa recorrência')});expect(createSparkRecurringPlanFirebase).toHaveBeenCalledTimes(1);
 });
 it('falha da agenda após as duas fases permite repetir só o lembrete',async()=>{
  const draft=await prepare();jest.mocked(cancelMandatoryExpenseNotification).mockRejectedValueOnce(new Error('agenda'));jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,id:draft.sparkRecurringDefinition!.definition.input.planId}]);const result=await confirmDraft(draft,{});expect(result).toMatchObject({success:true,notificationWarning:expect.any(String)});expect(await financeCommandService.retryNotification('test-user',{...draft,status:'succeeded',result},{})).toMatchObject({success:true});expect(createSparkRecurringPlanFirebase).toHaveBeenCalledTimes(1);expect(saveSparkRecurringMetadataFirebase).toHaveBeenCalledTimes(1);
 });
});


describe('arquivamento de recorrências Spark pelo chat',()=>{
 const cycle={cycle:'2026-10',active:true,settlementOperationId:'paid',accountId:'bank',amountInCents:333,installmentsCount:1,installmentsBefore:0,installmentsAfter:1,effectiveAt:new Date('2026-10-20T15:00:00Z')};
 const base:SparkRecurringReadModel={id:'plan',actorId:'test-user',recurringType:'expense',name:'Contrato canônico',categoryId:'category',startCycle:'2026-09',endCycle:'2026-11',historyFromCycle:'2026-09',valueInCents:333,installmentTotal:3,contractTotalInCents:1000,installmentsCompleted:1,active:true,revision:5,metadataRevision:2,metadata:{dueDay:30,usesBusinessDays:false,description:'Preservar',reminderConfigVersion:1,reminderEnabled:true,reminderDaysBefore:1,reminderOnDueDate:true,reminderHour:19,reminderMinute:20},completedCycles:['2026-10'],cycleWindow:{fromCycle:'2026-10',throughCycle:'2028-10'},cycleStates:[cycle]};
 let live:SparkRecurringReadModel;
 const catalog:AssistantResolvedCatalog={mandatoryExpenses:[{handle:'target',realId:'plan',label:'Nome anterior',collection:'sparkRecurringPlans',data:{groupId:'archive-group',personId:'test-user',name:'Nome anterior',valueInCents:999}}],mandatoryGains:[{handle:'target',realId:'plan',label:'Nome anterior',collection:'sparkRecurringPlans',data:{groupId:'archive-group',personId:'test-user'}}]};
 const prepare=async(kind:'delete_mandatory_expense'|'delete_mandatory_gain'='delete_mandatory_expense',source=catalog)=>(await financeCommandService.prepareActions('test-user',[{kind,payload:{recordRef:'target',archiveOnly:true}}],source)).actions[0]!;
 beforeEach(()=>{
  jest.useFakeTimers().setSystemTime(new Date('2026-10-26T15:00:00Z'));live={...base};jest.mocked(getSparkContextFirebase).mockReset().mockResolvedValue({groupId:'archive-group',actorId:'test-user',role:'member'});jest.mocked(readSparkRecurringPlansFirebase).mockReset().mockImplementation(async()=>[live]);
  jest.mocked(updateSparkRecurringPlanFirebase).mockReset().mockImplementation(async()=>{live={...live,active:false,revision:6};return{transactionId:'archive',idempotent:false};});
  jest.mocked(cancelMandatoryExpenseNotification).mockReset().mockResolvedValue(undefined as any);jest.mocked(cancelMandatoryGainNotification).mockReset().mockResolvedValue(undefined as any);jest.mocked(scheduleMandatoryExpenseNotification).mockReset().mockResolvedValue({success:true} as any);jest.mocked(scheduleMandatoryGainNotification).mockReset().mockResolvedValue({success:true} as any);
  jest.mocked(saveSparkRecurringMetadataFirebase).mockClear();jest.mocked(settleSparkRecurringFirebase).mockClear();jest.mocked(undoSparkRecurringFirebase).mockClear();jest.mocked(manageFinancialMetadataFirebase).mockClear();mockWrites.length=0;
 });
 afterEach(()=>{jest.useRealTimers();jest.mocked(getSparkContextFirebase).mockResolvedValue(null);(auth as any).currentUser={uid:'test-user'};});
 it.each(['delete_mandatory_expense','delete_mandatory_gain'] as const)('%s arquiva com revisão canônica sem apagar contrato/ciclos ou movimentar saldo',async kind=>{
  if(kind==='delete_mandatory_gain')live={...live,recurringType:'gain'};const draft=await prepare(kind);expect(draft.sparkRecurringArchive?.command).toMatchObject({groupId:'archive-group',actorId:'test-user',clientActionId:draft.clientActionId,planId:'plan',expectedPlanRevision:5,name:'Contrato canônico',categoryId:'category',valueInCents:333,active:false});
  expect(await confirmDraft(draft,{})).toMatchObject({success:true,message:expect.stringContaining('arquivada')});expect(updateSparkRecurringPlanFirebase).toHaveBeenCalledWith(expect.anything(),draft.sparkRecurringArchive!.command);
  expect(live).toMatchObject({active:false,installmentsCompleted:1,installmentTotal:3,contractTotalInCents:1000,metadata:base.metadata,cycleStates:base.cycleStates});expect(kind==='delete_mandatory_expense'?cancelMandatoryExpenseNotification:cancelMandatoryGainNotification).toHaveBeenCalledWith('test-user','plan');expect(saveSparkRecurringMetadataFirebase).not.toHaveBeenCalled();expect(settleSparkRecurringFirebase).not.toHaveBeenCalled();expect(undoSparkRecurringFirebase).not.toHaveBeenCalled();expect(manageFinancialMetadataFirebase).not.toHaveBeenCalled();expect(mockWrites).toHaveLength(0);
 });
 it('recorrência sem parcelas conserva nominal e contador explícito',async()=>{live={...live,installmentTotal:null,contractTotalInCents:null,installmentsCompleted:0,endCycle:null};expect((await prepare()).sparkRecurringArchive).toMatchObject({installmentTotal:null,installmentsCompleted:0,command:{valueInCents:333,active:false}});});
 it.each([{actorId:'other'},{recurringType:'gain'},{successorPlanId:'next'},{replanCancelled:true}])('recusa titular/tipo/replanejamento incompatível %j',async patch=>{live={...live,...patch} as SparkRecurringReadModel;await expect(prepare()).rejects.toThrow('plano mudou');expect(updateSparkRecurringPlanFirebase).not.toHaveBeenCalled();});
 it('não oferece uma segunda intenção para plano já arquivado',async()=>{live={...live,active:false};await expect(prepare()).rejects.toThrow('já está arquivada');expect(updateSparkRecurringPlanFirebase).not.toHaveBeenCalled();});
 it('erro de leitura, referência legada ou grupo errado não iniciam arquivamento',async()=>{
  jest.mocked(readSparkRecurringPlansFirebase).mockRejectedValueOnce(new Error('offline'));await expect(prepare()).rejects.toThrow('offline');await expect(prepare('delete_mandatory_expense',{...catalog,mandatoryExpenses:[{...catalog.mandatoryExpenses![0]!,collection:'mandatoryExpenses'}]})).rejects.toThrow('Atualize');await expect(prepare('delete_mandatory_expense',{...catalog,mandatoryExpenses:[{...catalog.mandatoryExpenses![0]!,data:{groupId:'other'}}]})).rejects.toThrow('Atualize');expect(updateSparkRecurringPlanFirebase).not.toHaveBeenCalled();
 });
 it('troca de grupo durante o preparo descarta o comando',async()=>{
  jest.mocked(getSparkContextFirebase).mockResolvedValueOnce({groupId:'archive-group',actorId:'test-user',role:'member'}).mockResolvedValueOnce({groupId:'other',actorId:'test-user',role:'member'});await expect(prepare()).rejects.toThrow('grupo mudou');expect(updateSparkRecurringPlanFirebase).not.toHaveBeenCalled();
 });
 it('retry conserva comando, revisão e ID sem depender do plano ainda ativo no catálogo',async()=>{
  const draft=await prepare();jest.mocked(updateSparkRecurringPlanFirebase).mockRejectedValueOnce(new Error('resposta perdida'));expect(await confirmDraft(draft,{})).toMatchObject({success:false});live={...live,active:false,revision:6};jest.mocked(readSparkRecurringPlansFirebase).mockRejectedValue(new Error('catálogo indisponível'));jest.advanceTimersByTime(8*86400000);expect(await confirmDraft(draft,{})).toMatchObject({success:true,notificationWarning:expect.any(String)});const calls=jest.mocked(updateSparkRecurringPlanFirebase).mock.calls;expect(calls[0]?.[1]).toEqual(calls[1]?.[1]);
 });
 it('alteração após autorização não arquiva outro plano',async()=>{
  const draft=await prepare(),session=createAssistantAuthorizationSession('test-user');session.recordUserMessage('sim','sim');const grant=session.authorize(draft,'sim','confirmation')!,prepared=draft.sparkRecurringArchive!;
  expect(await financeCommandService.execute('test-user',{...draft,sparkRecurringArchive:{...prepared,command:{...prepared.command,planId:'other'}}},{},grant)).toMatchObject({success:false,errorCode:'authorization-required'});expect(updateSparkRecurringPlanFirebase).not.toHaveBeenCalled();
 });
 it('preparação ausente ou comando de restauração não executam pelo caminho de arquivar',async()=>{
  const draft=await prepare();expect(await confirmDraft({...draft,sparkRecurringArchive:undefined},catalog)).toMatchObject({success:false,errorCode:'invalid-reference'});expect(await confirmDraft({...draft,sparkRecurringArchive:{...draft.sparkRecurringArchive!,command:{...draft.sparkRecurringArchive!.command,active:true}}},catalog)).toMatchObject({success:false,errorCode:'invalid-reference'});expect(updateSparkRecurringPlanFirebase).not.toHaveBeenCalled();
 });
 it('perda ou troca de contexto não ativa executor legado',async()=>{
  const draft=await prepare();jest.mocked(getFinancialLedgerContextFirebase).mockClear();jest.mocked(getSparkContextFirebase).mockResolvedValue(null);expect(await confirmDraft(draft,{})).toMatchObject({success:false,errorCode:'invalid-reference'});await expect(prepare()).rejects.toThrow('Nenhum registro foi excluído');jest.mocked(getSparkContextFirebase).mockResolvedValue({groupId:'other',actorId:'test-user',role:'member'});expect(await confirmDraft(draft,{})).toMatchObject({success:false});expect(getFinancialLedgerContextFirebase).not.toHaveBeenCalled();expect(updateSparkRecurringPlanFirebase).not.toHaveBeenCalled();
 });
 it('pedido explícito de arquivar em conta legada é recusado sem excluir',async()=>{
  jest.mocked(getSparkContextFirebase).mockResolvedValue(null);const legacy:AssistantResolvedCatalog={mandatoryExpenses:[{handle:'legacy',realId:'legacy',label:'Antigo',collection:'mandatoryExpenses',data:{personId:'test-user'}}]};const draft=(await prepareAssistantActions('test-user',[{kind:'delete_mandatory_expense',payload:{recordRef:'legacy',archiveOnly:true}}],legacy)).actions[0]!;
  expect(await confirmDraft(draft,legacy)).toMatchObject({success:false,errorCode:'capability-unavailable'});expect(mockWrites).toHaveLength(0);expect(manageFinancialMetadataFirebase).not.toHaveBeenCalled();
 });
 it('correção do rascunho preserva o pedido de arquivar em vez de excluir',async()=>{
  const draft=await prepare();const changed=await financeCommandService.updateDraft('test-user',draft,{archiveOnly:false},catalog);expect(changed.payload.archiveOnly).toBe(true);
 });
 it('cancelamento antes do envio e recusa financeira não anunciam arquivamento',async()=>{
  const draft=await prepare(),controller=new AbortController(),session=createAssistantAuthorizationSession('test-user');session.recordUserMessage('sim','sim');const grant=session.authorize(draft,'sim','confirmation')!;controller.abort();expect(await financeCommandService.execute('test-user',draft,{},grant,{signal:controller.signal})).toMatchObject({success:false,errorCode:'cancelled'});expect(updateSparkRecurringPlanFirebase).not.toHaveBeenCalled();jest.mocked(updateSparkRecurringPlanFirebase).mockRejectedValueOnce(new Error('revisão mudou'));expect(await confirmDraft(draft,{})).toMatchObject({success:false});expect(cancelMandatoryExpenseNotification).not.toHaveBeenCalled();
 });
 it('cancelamento comprovado da tentativa pede nova intenção sem tocar na agenda',async()=>{
  const draft=await prepare();jest.mocked(updateSparkRecurringPlanFirebase).mockRejectedValueOnce(Object.assign(new Error('cancelada'),{sparkIntentCancelled:true}));expect(await confirmDraft(draft,{})).toMatchObject({success:false,errorCode:'recurring-archive-cancelled'});expect(cancelMandatoryExpenseNotification).not.toHaveBeenCalled();
 });
 it('agenda falha após commit mas retry atualiza só o lembrete com vínculo original',async()=>{
  const draft=await prepare();jest.mocked(cancelMandatoryExpenseNotification).mockRejectedValueOnce(new Error('agenda'));const result=await confirmDraft(draft,{});expect(result).toMatchObject({success:true,notificationWarning:expect.any(String),notificationRetry:{operation:'sync',templateId:'plan'}});const completed:AssistantDraftAction={...draft,status:'succeeded',result};expect(await financeCommandService.retryNotification('test-user',completed,{})).toMatchObject({success:true});expect(updateSparkRecurringPlanFirebase).toHaveBeenCalledTimes(1);expect(cancelMandatoryExpenseNotification).toHaveBeenCalledTimes(2);(auth as any).currentUser={uid:'other'};expect(await financeCommandService.retryNotification('test-user',completed,{})).toMatchObject({success:false});expect(cancelMandatoryExpenseNotification).toHaveBeenCalledTimes(2);
 });
 it('retry da agenda respeita restauração posterior e não cancela plano novamente ativo',async()=>{
  const draft=await prepare();jest.mocked(cancelMandatoryExpenseNotification).mockRejectedValueOnce(new Error('agenda'));const result=await confirmDraft(draft,{});live={...base,active:true,revision:7};expect(await financeCommandService.retryNotification('test-user',{...draft,status:'succeeded',result},{})).toMatchObject({success:true});expect(updateSparkRecurringPlanFirebase).toHaveBeenCalledTimes(1);expect(cancelMandatoryExpenseNotification).toHaveBeenCalledTimes(1);expect(scheduleMandatoryExpenseNotification).toHaveBeenCalledWith(expect.objectContaining({accountId:'test-user',expenseId:'plan',lastCompletedCycle:'2026-10',requestPermission:false}));
 });
});


describe('restauração de recorrências Spark pelo chat',()=>{
 const plan:SparkRecurringReadModel={id:'plan',actorId:'test-user',recurringType:'expense',name:'Contrato',categoryId:'category',startCycle:'2026-09',endCycle:null,historyFromCycle:'2026-09',valueInCents:333,installmentTotal:null,contractTotalInCents:null,installmentsCompleted:0,active:false,revision:5,metadata:null,completedCycles:[],cycleWindow:{fromCycle:'2026-10',throughCycle:'2028-10'},cycleStates:[]};
 let live:SparkRecurringReadModel;
 const catalog:AssistantResolvedCatalog={mandatoryExpenses:[{handle:'target',realId:'plan',label:'Contrato',collection:'sparkRecurringPlans',data:{groupId:'restore-group',personId:'test-user',active:false}}],mandatoryGains:[{handle:'target',realId:'plan',label:'Contrato',collection:'sparkRecurringPlans',data:{groupId:'restore-group',personId:'test-user',active:false}}]};
 const prepare=async(kind:'update_mandatory_expense'|'update_mandatory_gain'='update_mandatory_expense')=>(await financeCommandService.prepareActions('test-user',[{kind,payload:{recordRef:'target',restoreOnly:true}}],catalog)).actions[0]!;
 beforeEach(()=>{jest.useFakeTimers().setSystemTime(new Date('2026-10-26T15:00:00Z'));live={...plan};jest.mocked(getSparkContextFirebase).mockReset().mockResolvedValue({groupId:'restore-group',actorId:'test-user',role:'member'});jest.mocked(readSparkRecurringPlansFirebase).mockReset().mockImplementation(async()=>[live]);jest.mocked(updateSparkRecurringPlanFirebase).mockReset().mockImplementation(async()=>{live={...live,active:true,revision:6};return{transactionId:'restored',idempotent:false};});jest.mocked(cancelMandatoryExpenseNotification).mockReset().mockResolvedValue(undefined as any);jest.mocked(cancelMandatoryGainNotification).mockReset().mockResolvedValue(undefined as any);jest.mocked(settleSparkRecurringFirebase).mockClear();mockWrites.length=0;});
 afterEach(()=>{jest.useRealTimers();jest.mocked(getSparkContextFirebase).mockResolvedValue(null);});
 it.each(['update_mandatory_expense','update_mandatory_gain'] as const)('%s preserva valores e reativa somente após confirmação',async kind=>{live={...live,recurringType:kind.endsWith('expense')?'expense':'gain'};const draft=await prepare(kind);expect(draft.sparkRecurringRestore?.command).toMatchObject({planId:'plan',expectedPlanRevision:5,valueInCents:333,active:true});expect(await confirmDraft(draft,{})).toMatchObject({success:true});expect(updateSparkRecurringPlanFirebase).toHaveBeenCalledWith(expect.anything(),draft.sparkRecurringRestore!.command);expect(settleSparkRecurringFirebase).not.toHaveBeenCalled();expect(mockWrites).toHaveLength(0);});
 it.each([{active:true},{actorId:'other'},{successorPlanId:'new'},{replanCancelled:true}])('recusa plano não elegível %j',async patch=>{live={...live,...patch};await expect(prepare()).rejects.toThrow();expect(updateSparkRecurringPlanFirebase).not.toHaveBeenCalled();});
 it('retry reutiliza comando mesmo com plano já ativo',async()=>{const draft=await prepare();jest.mocked(updateSparkRecurringPlanFirebase).mockRejectedValueOnce(new Error('perda'));expect(await confirmDraft(draft,{})).toMatchObject({success:false});expect(await confirmDraft(draft,{})).toMatchObject({success:true});const calls=jest.mocked(updateSparkRecurringPlanFirebase).mock.calls;expect(calls[0]?.[1]).toEqual(calls[1]?.[1]);});
 it('bloqueia alteração após autorização e perda do grupo',async()=>{const draft=await prepare(),session=createAssistantAuthorizationSession('test-user');session.recordUserMessage('sim','sim');const grant=session.authorize(draft,'sim','confirmation')!;expect(await financeCommandService.execute('test-user',{...draft,sparkRecurringRestore:{...draft.sparkRecurringRestore!,command:{...draft.sparkRecurringRestore!.command,planId:'other'}}},{},grant)).toMatchObject({success:false,errorCode:'authorization-required'});jest.mocked(getSparkContextFirebase).mockResolvedValue(null);expect(await confirmDraft(draft,{})).toMatchObject({success:false});expect(updateSparkRecurringPlanFirebase).not.toHaveBeenCalled();});
 it('falha do lembrete não repete a restauração',async()=>{const draft=await prepare();jest.mocked(cancelMandatoryExpenseNotification).mockRejectedValueOnce(new Error('agenda'));const result=await confirmDraft(draft,{});expect(result).toMatchObject({success:true,notificationWarning:expect.any(String)});expect(await financeCommandService.retryNotification('test-user',{...draft,status:'succeeded',result},{})).toMatchObject({success:true});expect(updateSparkRecurringPlanFirebase).toHaveBeenCalledTimes(1);});
});


describe('replanejamento Spark pelo chat', () => {
 const plan: SparkRecurringReadModel = {id:'plan',actorId:'test-user',recurringType:'expense',name:'Contrato',categoryId:'category',startCycle:'2026-08',endCycle:'2026-12',historyFromCycle:'2026-08',valueInCents:200,installmentTotal:5,contractTotalInCents:1000,installmentsCompleted:2,active:true,revision:4,metadataRevision:2,metadata:{dueDay:20,usesBusinessDays:false,description:null,reminderConfigVersion:1,reminderEnabled:false,reminderDaysBefore:2,reminderOnDueDate:true,reminderHour:9,reminderMinute:0},completedCycles:[],cycleWindow:{fromCycle:'2026-10',throughCycle:'2028-10'},cycleStates:[]};
 let live: SparkRecurringReadModel;
 const catalog: AssistantResolvedCatalog = {mandatoryExpenses:[{handle:'target',realId:'plan',label:'Contrato',collection:'sparkRecurringPlans',data:{groupId:'replan-group',personId:'test-user',active:true}}],mandatoryGains:[{handle:'target',realId:'plan',label:'Contrato',collection:'sparkRecurringPlans',data:{groupId:'replan-group',personId:'test-user',active:true}}]};
 const payload = {recordRef:'target',replanOnly:true,replanTotalInCents:901,replanInstallments:3,replanStartCycle:'2026-11',replanReason:'Renegociação'};
 const prepare = async (kind: 'update_mandatory_expense'|'update_mandatory_gain' = 'update_mandatory_expense', patch: Record<string,unknown> = {}) => (await financeCommandService.prepareActions('test-user',[{kind,payload:{...payload,...patch}}],catalog)).actions[0]!;
 beforeEach(() => {jest.useFakeTimers().setSystemTime(new Date('2026-10-26T15:00:00Z')); live={...plan}; (auth as any).currentUser={uid:'test-user'}; jest.mocked(getSparkContextFirebase).mockReset().mockResolvedValue({groupId:'replan-group',actorId:'test-user',role:'member'}); jest.mocked(readSparkRecurringPlansFirebase).mockReset().mockImplementation(async()=>[live]); jest.mocked(replanSparkRecurringFirebase).mockReset().mockResolvedValue({transactionId:'replan',idempotent:false}); jest.mocked(cancelMandatoryExpenseNotification).mockReset().mockResolvedValue(undefined as any);});
 afterEach(() => {jest.useRealTimers();jest.mocked(getSparkContextFirebase).mockResolvedValue(null);});
 it.each(['update_mandatory_expense','update_mandatory_gain'] as const)('prepara e confirma %s com contrato e revisões capturados',async kind=>{live={...live,recurringType:kind.endsWith('expense')?'expense':'gain'};const draft=await prepare(kind);expect(draft.sparkRecurringReplan?.command).toMatchObject({planId:'plan',expectedPlanRevision:4,expectedMetadataRevision:2,contractTotalInCents:901,installmentTotal:3,startCycle:'2026-11',reason:'Renegociação'});expect(replanSparkRecurringFirebase).not.toHaveBeenCalled();expect(await confirmDraft(draft,{})).toMatchObject({success:true});expect(replanSparkRecurringFirebase).toHaveBeenCalledWith(expect.anything(),draft.sparkRecurringReplan!.command);});
 it.each([{active:false},{actorId:'other'},{installmentTotal:null},{installmentsCompleted:5},{successorPlanId:'next'},{metadata:null}])('recusa contrato inelegível %j',async patch=>{live={...live,...patch};await expect(prepare()).rejects.toThrow();expect(replanSparkRecurringFirebase).not.toHaveBeenCalled();});
 it('solicita campos ausentes e rejeita total ou início inválido',async()=>{const draft=await prepare('update_mandatory_expense',{replanReason:undefined});expect(draft.missingFields.map(x=>x.key)).toContain('replanReason');await expect(prepare('update_mandatory_expense',{replanTotalInCents:2})).rejects.toThrow();await expect(prepare('update_mandatory_expense',{replanStartCycle:'2026-09'})).rejects.toThrow();});
 it('recupera resposta perdida com o mesmo comando e bloqueia alteração após envio',async()=>{const draft=await prepare();jest.mocked(replanSparkRecurringFirebase).mockRejectedValueOnce(new Error('perda'));expect(await confirmDraft(draft,{})).toMatchObject({success:false});await expect(financeCommandService.updateDraft('test-user',draft,{replanTotalInCents:1200},catalog)).rejects.toThrow('envio anterior');live={...live,active:false,successorPlanId:'new'};expect(await confirmDraft(draft,{})).toMatchObject({success:true});expect(jest.mocked(replanSparkRecurringFirebase).mock.calls[0]?.[1]).toEqual(jest.mocked(replanSparkRecurringFirebase).mock.calls[1]?.[1]);});
 it('impede troca de material ou grupo depois da confirmação',async()=>{const draft=await prepare(),session=createAssistantAuthorizationSession('test-user');session.recordUserMessage('yes','sim');const grant=session.authorize(draft,'yes','confirmation')!;expect(await financeCommandService.execute('test-user',{...draft,sparkRecurringReplan:{...draft.sparkRecurringReplan!,command:{...draft.sparkRecurringReplan!.command,contractTotalInCents:1}}},{},grant)).toMatchObject({success:false,errorCode:'authorization-required'});jest.mocked(getSparkContextFirebase).mockResolvedValue(null);expect(await confirmDraft(draft,{})).toMatchObject({success:false});expect(replanSparkRecurringFirebase).not.toHaveBeenCalled();});
 it('falha de agenda permite repetir lembretes sem repetir contrato',async()=>{const draft=await prepare(), successor={...plan,id:draft.sparkRecurringReplan!.command.replacementPlanId};jest.mocked(readSparkRecurringPlansFirebase).mockResolvedValue([{...plan,active:false},successor]);jest.mocked(cancelMandatoryExpenseNotification).mockRejectedValueOnce(new Error('agenda'));const result=await confirmDraft(draft,{});expect(result).toMatchObject({success:true,notificationWarning:expect.any(String)});expect(await financeCommandService.retryNotification('test-user',{...draft,status:'succeeded',result},{})).toMatchObject({success:true});expect(replanSparkRecurringFirebase).toHaveBeenCalledTimes(1);});
});


describe('desfazer replanejamento Spark pelo chat', () => {
 const old: SparkRecurringReadModel = {id:'old',actorId:'test-user',recurringType:'expense',name:'Original',categoryId:'category',startCycle:'2026-08',endCycle:'2026-12',historyFromCycle:'2026-08',valueInCents:200,installmentTotal:5,contractTotalInCents:1000,installmentsCompleted:2,active:false,revision:4,successorPlanId:'next',replanOperationId:'replan-op',metadata:null,completedCycles:[],cycleWindow:{fromCycle:'2026-10',throughCycle:'2028-10'},cycleStates:[]};
 const next: SparkRecurringReadModel = {...old,id:'next',name:'Novo',active:true,revision:1,startCycle:'2026-11',historyFromCycle:'2026-11',endCycle:'2027-01',installmentTotal:3,contractTotalInCents:900,installmentsCompleted:0,successorPlanId:null,replanOperationId:null,predecessorPlanId:'old',replanOriginOperationId:'replan-op'};
 let plans: SparkRecurringReadModel[];
 const catalog: AssistantResolvedCatalog = {mandatoryExpenses:[{handle:'previous',realId:'old',label:'Original',collection:'sparkRecurringPlans',data:{groupId:'undo-group',personId:'test-user',active:false}},{handle:'current',realId:'next',label:'Novo',collection:'sparkRecurringPlans',data:{groupId:'undo-group',personId:'test-user',active:true,predecessorPlanId:'old'}}],mandatoryGains:[{handle:'current',realId:'next',label:'Novo',collection:'sparkRecurringPlans',data:{groupId:'undo-group',personId:'test-user',active:true,predecessorPlanId:'old'}}]};
 const prepare = async (kind:'update_mandatory_expense'|'update_mandatory_gain'='update_mandatory_expense',patch:Record<string,unknown>={}) => (await financeCommandService.prepareActions('test-user',[{kind,payload:{recordRef:'current',undoReplanOnly:true,replanReason:'Acordo cancelado',...patch}}],catalog)).actions[0]!;
 beforeEach(()=>{jest.useFakeTimers().setSystemTime(new Date('2026-10-27T15:00:00Z'));(auth as any).currentUser={uid:'test-user'};plans=[{...old},{...next}];mockDocuments.set('financialGroups/undo-group/sparkOperations/replan-op',{kind:'recurring_replan',actorId:'test-user',planId:'old',replacementPlanId:'next'});jest.mocked(getSparkContextFirebase).mockReset().mockResolvedValue({groupId:'undo-group',actorId:'test-user',role:'member'});jest.mocked(readSparkRecurringPlansFirebase).mockReset().mockImplementation(async()=>plans);jest.mocked(undoSparkRecurringReplanFirebase).mockReset().mockResolvedValue({transactionId:'undo',idempotent:false});jest.mocked(cancelMandatoryExpenseNotification).mockReset().mockResolvedValue(undefined as any);});
 afterEach(()=>{jest.useRealTimers();jest.mocked(getSparkContextFirebase).mockResolvedValue(null);mockDocuments.delete('financialGroups/undo-group/sparkOperations/replan-op');});
 it.each(['update_mandatory_expense','update_mandatory_gain'] as const)('prepara %s e aguarda confirmação',async kind=>{if(kind.endsWith('gain')) plans=plans.map(plan=>({...plan,recurringType:'gain'}));const draft=await prepare(kind);expect(draft.sparkRecurringReplanUndo).toMatchObject({originalTotalInCents:1000,originalCompleted:2,replacementTotalInCents:900,command:{planId:'old',replacementPlanId:'next',replanOperationId:'replan-op',expectedPlanRevision:4,expectedReplacementRevision:1,reason:'Acordo cancelado'}});expect(undoSparkRecurringReplanFirebase).not.toHaveBeenCalled();expect(await confirmDraft(draft,{})).toMatchObject({success:true});expect(undoSparkRecurringReplanFirebase).toHaveBeenCalledWith(expect.anything(),draft.sparkRecurringReplanUndo!.command);});
 it('aceita a referência ao predecessor e pede motivo ausente',async()=>{expect((await prepare('update_mandatory_expense',{recordRef:'previous'})).sparkRecurringReplanUndo?.command.replacementPlanId).toBe('next');expect((await prepare('update_mandatory_expense',{replanReason:undefined})).missingFields.map(field=>field.key)).toContain('replanReason');});
 it.each([{installmentsCompleted:1},{successorPlanId:'later'},{replanCancelled:true}])('bloqueia dependência posterior %j',async patch=>{plans=[old,{...next,...patch}];await expect(prepare()).rejects.toThrow();expect(undoSparkRecurringReplanFirebase).not.toHaveBeenCalled();});
 it('sem grupo Spark não muda dados legados',async()=>{jest.mocked(getSparkContextFirebase).mockResolvedValue(null);const legacy:AssistantResolvedCatalog={mandatoryExpenses:[{handle:'legacy',realId:'legacy',label:'Antigo',collection:'mandatoryExpenses',data:{personId:'test-user'}}]};const draft=(await prepareAssistantActions('test-user',[{kind:'update_mandatory_expense',payload:{recordRef:'legacy',undoReplanOnly:true,replanReason:'cancelado'}}],legacy)).actions[0]!;expect(await confirmDraft(draft,legacy)).toMatchObject({success:false,errorCode:'capability-unavailable'});expect(undoSparkRecurringReplanFirebase).not.toHaveBeenCalled();});
 it('seleciona somente sucessor elegível quando anterior e sucessor têm o mesmo nome',async()=>{const dup:AssistantResolvedCatalog={mandatoryExpenses:[{handle:'old',realId:'old',label:'Mesmo',collection:'sparkRecurringPlans',data:{successorPlanId:'next',active:false}},{handle:'next',realId:'next',label:'Mesmo',collection:'sparkRecurringPlans',data:{predecessorPlanId:'old',active:true}}]};const ready=(await prepareAssistantActions('test-user',[{kind:'update_mandatory_expense',payload:{recordRef:'Mesmo',undoReplanOnly:true,replanReason:'cancelado'}}],dup)).actions[0]!;expect(ready.payload.recordRef).toBe('next');const missing=(await prepareAssistantActions('test-user',[{kind:'update_mandatory_expense',payload:{undoReplanOnly:true,replanReason:'cancelado'}}],dup)).actions[0]!;expect(missing.missingFields.find(field=>field.key==='recordRef')?.choices?.map(choice=>choice.value)).toEqual(['next']);});
 it('recusa vínculo, titular e receipt inconsistentes',async()=>{plans=[old,{...next,actorId:'other'}];await expect(prepare()).rejects.toThrow();plans=[old,next];mockDocuments.set('financialGroups/undo-group/sparkOperations/replan-op',{kind:'recurring_replan',actorId:'other',planId:'old',replacementPlanId:'next'});await expect(prepare()).rejects.toThrow('registro original');});
 it('não troca comando depois de resposta perdida e repete o mesmo ID',async()=>{const draft=await prepare();jest.mocked(undoSparkRecurringReplanFirebase).mockRejectedValueOnce(new Error('offline'));expect(await confirmDraft(draft,{})).toMatchObject({success:false});await expect(financeCommandService.updateDraft('test-user',draft,{replanReason:'outro'},catalog)).rejects.toThrow('envio anterior');plans=[{...old,active:true,successorPlanId:null},{...next,active:false,replanCancelled:true}];expect(await confirmDraft(draft,{})).toMatchObject({success:true});expect(jest.mocked(undoSparkRecurringReplanFirebase).mock.calls[0]?.[1]).toEqual(jest.mocked(undoSparkRecurringReplanFirebase).mock.calls[1]?.[1]);});
 it('material adulterado ou grupo perdido não executam',async()=>{const draft=await prepare(),session=createAssistantAuthorizationSession('test-user');session.recordUserMessage('yes','sim');const grant=session.authorize(draft,'yes','confirmation')!;expect(await financeCommandService.execute('test-user',{...draft,sparkRecurringReplanUndo:{...draft.sparkRecurringReplanUndo!,command:{...draft.sparkRecurringReplanUndo!.command,replacementPlanId:'different'}}},{},grant)).toMatchObject({success:false,errorCode:'authorization-required'});jest.mocked(getSparkContextFirebase).mockResolvedValue(null);expect(await confirmDraft(draft,{})).toMatchObject({success:false});expect(undoSparkRecurringReplanFirebase).not.toHaveBeenCalled();});
 it('falha de lembretes permite retry sem repetir o desfazimento',async()=>{const draft=await prepare();jest.mocked(cancelMandatoryExpenseNotification).mockRejectedValueOnce(new Error('agenda'));const result=await confirmDraft(draft,{});expect(result).toMatchObject({success:true,notificationWarning:expect.any(String)});expect(await financeCommandService.retryNotification('test-user',{...draft,status:'succeeded',result},{})).toMatchObject({success:true});expect(undoSparkRecurringReplanFirebase).toHaveBeenCalledTimes(1);});
});
