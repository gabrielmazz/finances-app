const mockDocuments = new Map<string, Record<string, unknown>>();
const mockWrites: string[] = [];
let mockDenyMissingAssistantRead = false;

jest.mock('@/FirebaseConfig', () => ({ db: {} }));
jest.mock('@/functions/BankFirebase', () => ({ getLegacyBankBalanceInCentsFirebase: jest.fn() }));
jest.mock('@/utils/mandatoryExpenseNotifications', () => ({}));
jest.mock('@/utils/mandatoryGainNotifications', () => ({}));
jest.mock('firebase/firestore', () => ({
	doc: (_db: unknown, collection: string, id: string) => ({ id, path: `${collection}/${id}` }),
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
		update: (reference: { path: string }, data: Record<string, unknown>) => {
			mockDocuments.set(reference.path, { ...mockDocuments.get(reference.path), ...data });
			mockWrites.push(reference.path);
		},
	}),
}));

import { prepareAssistantActions } from '@/services/lumusAssistant/assistantCatalogService';
import { financeCommandService } from '@/services/lumusAssistant/financeCommandService';
import type { AssistantResolvedCatalog } from '@/types/lumusAssistant';

describe('Lumus Assistant confirmed command', () => {
	beforeEach(() => {
		mockDocuments.clear();
		mockWrites.length = 0;
		mockDenyMissingAssistantRead = false;
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
		await expect(financeCommandService.execute('test-user', { ...draft, status: 'confirming' }, catalog))
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
		const confirm = (draft: typeof first) => financeCommandService.execute('test-user', { ...draft, status: 'confirming' }, catalog);

		await expect(confirm(first)).resolves.toMatchObject({ success: true });
		await expect(confirm(first)).resolves.toMatchObject({ success: true });
		expect(mockWrites).toHaveLength(1);
		await expect(confirm(later)).resolves.toMatchObject({ success: true });
		expect(mockWrites).toHaveLength(2);
		expect(new Set(mockWrites).size).toBe(2);
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
			financeCommandService.execute('test-user', { ...draft, status: 'confirming' }, currentCatalog);

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
