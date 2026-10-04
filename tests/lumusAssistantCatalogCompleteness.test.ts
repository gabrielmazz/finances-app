const mockOwnedRecords = Array.from({ length: 251 }, (_, index) => ({
	id: `expense-${String(index).padStart(4, '0')}`,
	data: () => ({ personId: 'test-user', name: `Despesa ${index + 1}`, valueInCents: 100, date: new Date('2026-09-25T15:00:00Z') }),
}));
const mockMetadataRecords = [{ id: 'created-category', data: () => ({ personId: 'test-user', groupId: 'group-1', name: 'Nova categoria', usageType: 'both', assistantActionId: 'create-category-action' }) }];
const mockLedgerTransactions = [
	{ id: 'mine', data: () => ({ groupId: 'group-1', actorId: 'test-user', kind: 'expense', note: 'Mercado', effectiveAt: new Date('2026-09-25T15:00:00Z'), legs: [{ accountId: 'bank-1', deltaInCents: -100 }, { accountId: null, deltaInCents: 100 }] }) },
	{ id: 'someone-else', data: () => ({ groupId: 'group-1', actorId: 'other-user', kind: 'expense', note: 'Outro gasto', effectiveAt: new Date('2026-09-25T15:00:00Z'), legs: [{ accountId: 'bank-1', deltaInCents: -100 }, { accountId: null, deltaInCents: 100 }] }) },
];

jest.mock('@/FirebaseConfig', () => ({ db: {} }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({
	getFinancialLedgerContextFirebase: jest.fn(async () => null),
	getFinancialLedgerAccountsFirebase: jest.fn(async () => []),
}));
jest.mock('firebase/firestore', () => ({
	collection: (_db: unknown, name: string) => ({ name }),
	where: () => ({}),
	limit: (count: number) => ({ count }),
	startAfter: (cursor: { id: string }) => ({ cursor }),
	query: (source: { name: string }, ...constraints: Array<{ count?: number; cursor?: { id: string } }>) => ({ source, constraints }),
	getDocs: async ({ source, constraints }: { source: { name: string }; constraints: Array<{ count?: number; cursor?: { id: string } }> }) => {
		const records = source.name === 'expenses' ? mockOwnedRecords : source.name === 'ledgerTransactions' ? mockLedgerTransactions : source.name === 'tags' ? mockMetadataRecords : [];
		const cursor = constraints.find(item => item.cursor)?.cursor;
		const start = cursor ? records.findIndex(item => item.id === cursor.id) + 1 : 0;
		const count = constraints.find(item => item.count)?.count ?? records.length;
		const docs = records.slice(start, start + count);
		return { docs, size: docs.length, empty: docs.length === 0 };
	},
}));

import { loadAssistantResolvedCatalog, prepareAssistantActions } from '@/services/lumusAssistant/assistantCatalogService';
import { getFinancialLedgerAccountsFirebase, getFinancialLedgerContextFirebase } from '@/functions/FinancialLedgerFirebase';

beforeEach(() => {
	jest.mocked(getFinancialLedgerContextFirebase).mockResolvedValue(null);
	jest.mocked(getFinancialLedgerAccountsFirebase).mockResolvedValue([]);
});

it('keeps every writable record available locally beyond the catalog and page limits', async () => {
	const catalog = await loadAssistantResolvedCatalog('test-user');
	expect(catalog.expenses).toHaveLength(251);
	expect(catalog.expenses?.some(item => item.realId === 'expense-0250')).toBe(true);
});

it('uses group accounts and distinguishes writable and readable ledger movements for a migrated member', async () => {
	jest.mocked(getFinancialLedgerContextFirebase).mockResolvedValue({ groupId: 'group-1', role: 'member' });
	jest.mocked(getFinancialLedgerAccountsFirebase).mockResolvedValue([
		{ id: 'bank-1', groupId: 'group-1', kind: 'bank', name: 'Banco do grupo', currentBalanceInCents: 5000 },
		{ id: 'cash-1', groupId: 'group-1', kind: 'cash', name: 'Caixa', currentBalanceInCents: 1000 },
	]);
	const catalog = await loadAssistantResolvedCatalog('test-user');
	expect(catalog.banks?.map(item => item.realId)).toEqual(['bank-1', 'cash-1']);
	expect(catalog.expenses?.map(item => item.realId)).toEqual(['mine', 'someone-else']);
	expect(catalog.expenses?.[1]?.ownerScope).toBe('related_read_only');
	expect(catalog.expenses?.[0]?.collection).toBe('ledgerTransactions');
});

it('preserves creation identities in the complete catalog for dependent movements', async () => {
	jest.mocked(getFinancialLedgerContextFirebase).mockResolvedValue({ groupId: 'group-1', role: 'admin' });
	jest.mocked(getFinancialLedgerAccountsFirebase).mockResolvedValue([
		{ id: 'bank-created', groupId: 'group-1', kind: 'bank', name: 'Banco novo', currentBalanceInCents: 5000, assistantActionId: 'create-bank-action' },
		{ id: 'investment-created', groupId: 'group-1', kind: 'investment', name: 'Investimento novo', currentBalanceInCents: 1000, assistantActionId: 'create-investment-action', bankAccountId: 'bank-created' },
	]);
	const catalog = await loadAssistantResolvedCatalog('test-user');
	expect(catalog.banks?.find(item => item.data?.assistantActionId === 'create-bank-action')?.realId).toBe('bank-created');
	expect(catalog.investments?.find(item => item.data?.assistantActionId === 'create-investment-action')?.data?.bankAccountId).toBe('bank-created');
	expect(catalog.expenseCategories?.find(item => item.data?.assistantActionId === 'create-category-action')?.realId).toBe('created-category');
});

it('prepares all explicitly expanded items and retains a dependency created before the former chunk limit', async () => {
	const proposals = [{ clientActionId: 'new-bank', kind: 'create_bank' as const, payload: { bankName: 'Banco novo', initialBalanceInCents: 0, initialBalanceCycle: '2026-10' } },
		...Array.from({ length: 501 }, (_, index) => ({ kind: 'create_expense' as const, payload: { name: 'Despesa ' + index, valueInCents: 100, date: '2026-10-02', bankRef: 'action:new-bank', categoryRef: 'category' }, dependsOnActionIds: ['new-bank'] }))];
	const result = await prepareAssistantActions('test-user', proposals, { expenseCategories: [{ realId: 'category', handle: 'category', label: 'Categoria' }] });
	expect(result.actions).toHaveLength(502);
	expect(result.actions[501]?.payload.bankRef).toBe('action:' + result.actions[0]?.clientActionId);
	expect(result.actions[501]?.dependsOnActionIds).toEqual([result.actions[0]?.clientActionId]);
});
