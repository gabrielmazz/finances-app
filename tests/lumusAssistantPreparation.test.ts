jest.mock('@/FirebaseConfig', () => ({ db: {} }));

import { getPendingMandatoryCatalogItems, prepareAssistantActions, updatePreparedAssistantDraft } from '@/services/lumusAssistant/assistantCatalogService';
import { findNextAssistantQuestion } from '@/utils/lumusAssistant';

describe('Lumus Assistant action preparation', () => {
	it('asks for a separate name for each of four expenses', async () => {
		const catalog = {
			banks: [{ handle: 'cash', label: 'Dinheiro', realId: null }],
			expenseCategories: [{ handle: 'food', label: 'Compras', realId: 'category_1' }],
		};
		let drafts = (await prepareAssistantActions('test-user', [5000, 5000, 5000, 8000].map(valueInCents => ({
			kind: 'create_expense' as const,
			payload: { valueInCents, date: '2026-09-25', bankRef: 'cash', categoryRef: 'food' },
		})), catalog)).actions;
		expect(drafts).toHaveLength(4);
		for (let index = 0; index < 4; index += 1) {
			const question = findNextAssistantQuestion(drafts);
			expect(question?.field.key).toBe('name');
			expect(question?.targetActionIds[0]).toBe(drafts[index]?.clientActionId);
			expect(question?.targetActionIds).toHaveLength(4 - index);
			drafts = drafts.map((draft, draftIndex) => draftIndex === index
				? updatePreparedAssistantDraft(draft, { name: `Item ${index + 1}` }, catalog)
				: draft);
			expect(drafts[index]?.status).toBe('ready');
		}
		expect(findNextAssistantQuestion(drafts)).toBeNull();
		expect(drafts.map(draft => draft.payload.name)).toEqual(['Item 1', 'Item 2', 'Item 3', 'Item 4']);
	});

	it('offers only pending owned obligations and prepares one selected payment card', async () => {
		const catalog = {
			banks: [{ handle: 'cash', label: 'Dinheiro em espécie', realId: null }],
			mandatoryExpenses: [
				{ handle: 'expense_pending', label: 'Conta pendente', realId: 'expense_1', collection: 'mandatoryExpenses', data: { lastPaymentCycle: null, installmentTotal: 3, installmentsCompleted: 1 } },
				{ handle: 'expense_paid', label: 'Conta paga', realId: 'expense_2', data: { lastPaymentCycle: '2026-09' } },
				{ handle: 'expense_finished', label: 'Conta concluída', realId: 'expense_3', data: { installmentTotal: 1, installmentsCompleted: 1 } },
				{ handle: 'expense_related', label: 'Conta relacionada', realId: 'expense_4', ownerScope: 'related_read_only' as const, data: {} },
			],
		};
		expect(getPendingMandatoryCatalogItems(catalog, 'expense', '2026-09').map(item => item.handle)).toEqual(['expense_pending']);
		const prepared = await prepareAssistantActions('test-user', [{
			kind: 'pay_mandatory_expense', payload: { date: '2026-09-25' },
		}], catalog);
		expect(prepared.actions).toHaveLength(1);
		expect(prepared.actions[0]?.missingFields[0]).toMatchObject({
			key: 'recordRef',
			choices: [{ value: 'expense_pending', label: 'Conta pendente' }],
		});
		const selected = updatePreparedAssistantDraft(prepared.actions[0]!, {
			recordRef: 'expense_pending', bankRef: 'cash',
		}, catalog);
		expect(selected.status).toBe('ready');
		expect(selected.originalSnapshot?.recordHandle).toBe('expense_pending');
	});

	it('offers pending mandatory gains for receipt', async () => {
		const catalog = {
			mandatoryGains: [
				{ handle: 'gain_pending', label: 'Ganho pendente', realId: 'gain_1', data: { lastReceiptCycle: null } },
				{ handle: 'gain_received', label: 'Ganho recebido', realId: 'gain_2', data: { lastReceiptCycle: '2026-09' } },
			],
		};
		const prepared = await prepareAssistantActions('test-user', [{
			kind: 'receive_mandatory_gain', payload: { date: '2026-09-25' },
		}], catalog);
		expect(prepared.actions[0]?.missingFields[0]).toMatchObject({
			key: 'recordRef',
			choices: [{ value: 'gain_pending', label: 'Ganho pendente' }],
		});
	});

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
