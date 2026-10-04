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
jest.mock('@/utils/mandatoryExpenseNotifications', () => ({}));
jest.mock('@/utils/mandatoryGainNotifications', () => ({}));
jest.mock('firebase/firestore', () => ({
	collection: (_db: unknown, name: string) => ({ name }),
	where: (field: string, operator: string, value: unknown) => ({ field, operator, value }),
	query: (source: { name: string }, ...filters: Array<{ field: string; value: unknown }>) => ({ source, filters }),
	getDocs: async ({ source, filters }: { source: { name: string }; filters: Array<{ field: string; value: unknown }> }) => {
		const docs = Array.from(mockDocuments.entries()).filter(([path, data]) => path.startsWith(source.name + '/') && filters.every(filter => data[filter.field] === filter.value)).map(([path, data]) => ({ id: path.split('/').at(-1), ref: { id: path.split('/').at(-1), path }, data: () => data }));
		return { docs, empty: docs.length === 0, size: docs.length };
	},
	serverTimestamp: () => new Date('2026-10-02T15:00:00Z'),
	doc: (_db: unknown, ...segments: string[]) => ({ id: segments[segments.length - 1], path: segments.join('/') }),
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
