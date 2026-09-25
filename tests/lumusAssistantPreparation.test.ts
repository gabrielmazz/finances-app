jest.mock('@/FirebaseConfig', () => ({ db: {} }));

import { prepareAssistantActions } from '@/services/lumusAssistant/assistantCatalogService';

describe('Lumus Assistant action preparation', () => {
	it('allocates a new local action ID for the same model label in later messages', async () => {
		const proposal = {
			clientActionId: 'expense_1',
			kind: 'create_expense' as const,
			payload: { name: 'Café', valueInCents: 1200, date: '2026-09-24', bankRef: 'cash', categoryRef: 'category_1' },
		};
		const catalog = { banks: [{ handle: 'cash', label: 'Dinheiro', realId: null }], expenseCategories: [{ handle: 'category_1', label: 'Alimentação', realId: 'tag_1' }] };

		const first = await prepareAssistantActions('test-user', [proposal], catalog);
		const second = await prepareAssistantActions('test-user', [proposal], catalog);

		expect(first.actions[0]?.status).toBe('ready');
		expect(second.actions[0]?.status).toBe('ready');
		expect(first.actions[0]?.clientActionId).not.toBe(second.actions[0]?.clientActionId);
	});

	it('remaps dependent references to the local action IDs', async () => {
		const prepared = await prepareAssistantActions('test-user', [
			{ clientActionId: 'new_bank', kind: 'create_bank', payload: { bankName: 'Banco', initialBalanceInCents: 0, initialBalanceCycle: '2026-09' } },
			{ clientActionId: 'new_category', kind: 'create_category', payload: { categoryName: 'Casa', usageType: 'expense' } },
			{ clientActionId: 'expense_1', kind: 'create_expense', payload: { name: 'Conta', valueInCents: 1000, date: '2026-09-24' }, dependsOnActionIds: ['new_bank', 'new_category'] },
		], {});

		const [bank, category, expense] = prepared.actions;
		expect(expense?.dependsOnActionIds).toEqual([bank?.clientActionId, category?.clientActionId]);
		expect(expense?.payload).toMatchObject({
			bankRef: `action:${bank?.clientActionId}`,
			categoryRef: `action:${category?.clientActionId}`,
		});
	});

	it('turns an unknown model dependency into a question instead of blocking confirmation forever', async () => {
		const prepared = await prepareAssistantActions('test-user', [{
			clientActionId: 'expense_1',
			kind: 'create_expense',
			payload: { name: 'Conta', valueInCents: 1000, date: '2026-09-24', bankRef: 'action:missing', categoryRef: 'action:missing' },
			dependsOnActionIds: ['missing'],
		}], {});

		expect(prepared.actions[0]?.dependsOnActionIds).toEqual([]);
		expect(prepared.actions[0]?.missingFields.map(field => field.key)).toEqual(['bankRef', 'categoryRef']);
	});
});
