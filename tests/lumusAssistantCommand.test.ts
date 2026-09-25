const mockDocuments = new Map<string, Record<string, unknown>>();
const mockWrites: string[] = [];

jest.mock('@/FirebaseConfig', () => ({ db: {} }));
jest.mock('@/functions/BankFirebase', () => ({ getLegacyBankBalanceInCentsFirebase: jest.fn() }));
jest.mock('@/utils/mandatoryExpenseNotifications', () => ({}));
jest.mock('@/utils/mandatoryGainNotifications', () => ({}));
jest.mock('firebase/firestore', () => ({
	doc: (_db: unknown, collection: string, id: string) => ({ id, path: `${collection}/${id}` }),
	runTransaction: async (_db: unknown, callback: (transaction: unknown) => Promise<unknown>) => callback({
		get: async (reference: { path: string }) => ({
			exists: () => mockDocuments.has(reference.path),
			data: () => mockDocuments.get(reference.path),
		}),
		set: (reference: { path: string }, data: Record<string, unknown>) => {
			mockDocuments.set(reference.path, data);
			mockWrites.push(reference.path);
		},
	}),
}));

import { prepareAssistantActions } from '@/services/lumusAssistant/assistantCatalogService';
import { financeCommandService } from '@/services/lumusAssistant/financeCommandService';

describe('Lumus Assistant confirmed command', () => {
	beforeEach(() => {
		mockDocuments.clear();
		mockWrites.length = 0;
	});

	it('retries one card idempotently while allowing a later request with the same model label', async () => {
		const proposal = {
			clientActionId: 'expense_1',
			kind: 'create_expense' as const,
			payload: { name: 'Café', valueInCents: 1200, date: '2026-09-24', bankRef: 'cash', categoryRef: 'category_1' },
		};
		const catalog = {
			banks: [{ handle: 'cash', label: 'Dinheiro', realId: null }],
			expenseCategories: [{ handle: 'category_1', label: 'Alimentação', realId: 'tag_1' }],
		};
		const first = (await prepareAssistantActions('test-user', [proposal], catalog)).actions[0]!;
		const later = (await prepareAssistantActions('test-user', [proposal], catalog)).actions[0]!;
		const confirm = (draft: typeof first) => financeCommandService.execute('test-user', { ...draft, status: 'confirming' }, catalog);

		await expect(confirm(first)).resolves.toMatchObject({ success: true });
		await expect(confirm(first)).resolves.toMatchObject({ success: true });
		expect(mockWrites).toHaveLength(1);
		await expect(confirm(later)).resolves.toMatchObject({ success: true });
		expect(mockWrites).toHaveLength(2);
		expect(new Set(mockWrites).size).toBe(2);
	});
});
