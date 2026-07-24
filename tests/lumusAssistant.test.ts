import {
	ASSISTANT_DEFAULT_MAX_ACTIONS,
	ASSISTANT_MAX_INPUT_CHARACTERS,
	buildAssistantActiveDraftSummary,
	buildAssistantDraft,
	createAssistantOpaqueHandle,
	canTransitionAssistantDraft,
	isAssistantClearConversationCommand,
	inferAssistantDependencyReferences,
	maskFinancialValuesInText,
	normalizeAssistantDateInput,
	normalizeModelActionProposals,
	parseIsoDateAtLocalNoon,
	parseAssistantQuestionAnswer,
	parseMoneyToCents,
	sanitizeAssistantInput,
	sanitizeAssistantModelText,
	transitionAssistantDraft,
	updateAssistantDraftPayload,
} from '@/utils/lumusAssistant';
import { mapAssistantError } from '@/utils/lumusAssistantErrors';
import {
	assistantActionSchemas,
	getActionValidation,
} from '@/utils/lumusAssistantSchemas';
import { ASSISTANT_ACTION_KINDS } from '@/types/lumusAssistant';

describe('Lumus Assistant domain contracts', () => {
	describe('money and dates', () => {
		it.each([
			['R$ 50,00', 5_000],
			['150 reais', 15_000],
			['1.234,56', 123_456],
			['1234.56', 123_456],
		])('normalizes %s to integer cents', (input, expected) => {
			expect(parseMoneyToCents(input)).toBe(expected);
		});

		it('normalizes relative dates in America/Sao_Paulo', () => {
			const reference = new Date('2026-07-20T02:30:00.000Z');

			expect(normalizeAssistantDateInput('hoje', reference)).toBe('2026-07-19');
			expect(normalizeAssistantDateInput('ontem', reference)).toBe('2026-07-18');
			expect(normalizeAssistantDateInput('dia 18 deste mês', reference)).toBe('2026-07-18');
		});

		it('materializes civil dates at the requested wall clock in America/Sao_Paulo', () => {
			expect(parseIsoDateAtLocalNoon('2026-07-18')?.toISOString()).toBe('2026-07-18T15:00:00.000Z');
			expect(parseIsoDateAtLocalNoon('2026-07-18', '08:30')?.toISOString()).toBe('2026-07-18T11:30:00.000Z');
		});

		it('rejects impossible dates instead of rolling them into another month', () => {
			expect(normalizeAssistantDateInput('31/02/2026')).toBeNull();
			expect(normalizeAssistantDateInput('01/13/2026')).toBeNull();
			expect(parseIsoDateAtLocalNoon('2026-02-31')).toBeNull();
		});
	});

	describe('schemas and draft state machine', () => {
		it('accepts typed or spoken answers for an open dynamic question without calling AI', () => {
			const bankField = {
				key: 'bankRef',
				label: 'Banco',
				kind: 'bank' as const,
				question: 'Qual banco?',
				choices: [
					{ value: 'bank_opaque_a', label: 'Nubank' },
					{ value: 'bank_opaque_b', label: 'Inter' },
				],
			};

			expect(parseAssistantQuestionAnswer(bankField, 'quero no Nubank')).toEqual({
				value: 'bank_opaque_a',
				label: 'Nubank',
			});
			expect(parseAssistantQuestionAnswer({ ...bankField, choices: [
				{ value: 'one', label: 'Conta' },
				{ value: 'two', label: 'Conta' },
			] }, 'Conta')).toBeNull();
			expect(parseAssistantQuestionAnswer({
				key: 'valueInCents', label: 'Valor', kind: 'money', question: 'Qual valor?',
			}, 'R$ 50,00')?.value).toBe(5_000);
		});

		it('has a schema for every supported assistant action', () => {
			expect(Object.keys(assistantActionSchemas).sort()).toEqual([...ASSISTANT_ACTION_KINDS].sort());
		});

		it('rejects calendar-invalid ISO dates at the schema boundary', () => {
			expect(assistantActionSchemas.create_expense.safeParse({
				name: 'Teste',
				valueInCents: 1_000,
				date: '2026-02-31',
				bankRef: 'bank_1',
				categoryRef: 'category_1',
			}).success).toBe(false);
		});

		it('reports only the missing fields needed to finish an expense', () => {
			const validation = getActionValidation({
				kind: 'create_expense',
				payload: { name: 'Mercado', valueInCents: 5_000, date: '2026-07-18' },
			});

			expect(validation.valid).toBe(false);
			expect(validation.missingFields.map(field => field.key).sort()).toEqual(['bankRef', 'categoryRef']);
		});

		it('requires distinct source and target banks for transfers', () => {
			const validation = getActionValidation({
				kind: 'create_transfer',
				payload: {
					sourceBankRef: 'bank_1',
					targetBankRef: 'bank_1',
					valueInCents: 10_000,
					date: '2026-07-20',
				},
			});

			expect(validation.valid).toBe(false);
			expect(validation.missingFields.map(field => field.key)).toContain('targetBankRef');
		});

		it('moves a draft through review but never skips explicit confirmation', () => {
			const draft = buildAssistantDraft({
				clientActionId: 'expense_1',
				kind: 'create_expense',
				payload: {
					name: 'Mercado',
					valueInCents: 5_000,
					date: '2026-07-18',
					bankRef: 'bank_1',
					categoryRef: 'category_1',
				},
			});

			expect(draft.status).toBe('ready');
			expect(canTransitionAssistantDraft('ready', 'executing')).toBe(false);
			expect(() => transitionAssistantDraft(draft, 'executing')).toThrow('Transição de rascunho inválida');
			const confirming = transitionAssistantDraft(draft, 'confirming');
			expect(transitionAssistantDraft(confirming, 'executing').status).toBe('executing');
		});

		it('keeps dependencies unique and blocks incomplete dependent drafts', () => {
			const draft = buildAssistantDraft({
				clientActionId: 'expense_after_bank',
				kind: 'create_expense',
				payload: { name: 'Mercado', valueInCents: 5_000, date: '2026-07-18' },
				dependsOnActionIds: ['new_bank', 'new_bank'],
			});

			expect(draft.dependsOnActionIds).toEqual(['new_bank']);
			expect(draft.status).toBe('needs_input');
		});

		it('summarizes only active draft state without copying financial values', () => {
			const active = buildAssistantDraft({
				clientActionId: 'expense-active',
				kind: 'create_expense',
				payload: { name: 'Mercado', valueInCents: 987_654, date: '2026-07-18' },
			});
			const cancelled = transitionAssistantDraft(active, 'cancelled');
			const summary = buildAssistantActiveDraftSummary([cancelled, active]);

			expect(summary).toContain('expense-active');
			expect(summary).toContain('valueInCents');
			expect(summary).not.toContain('987654');
			expect(JSON.parse(summary)).toHaveLength(1);
		});

		it('links a new bank and category to a dependent expense without exposing real IDs', () => {
			const proposals = inferAssistantDependencyReferences([
				{
					clientActionId: 'new_bank',
					kind: 'create_bank',
					payload: { bankName: 'Banco X', initialBalanceInCents: 0, initialBalanceCycle: '2026-07' },
				},
				{
					clientActionId: 'new_category',
					kind: 'create_category',
					payload: { categoryName: 'Mercado', usageType: 'expense' },
				},
				{
					clientActionId: 'expense_after_creations',
					kind: 'create_expense',
					payload: { name: 'Compras', valueInCents: 5_000, date: '2026-07-20' },
					dependsOnActionIds: ['new_bank', 'new_category'],
				},
			]);

			expect(proposals[2]?.payload).toMatchObject({
				bankRef: 'action:new_bank',
				categoryRef: 'action:new_category',
			});
		});

		it('does not guess whether a newly created bank is transfer source or target', () => {
			const proposals = inferAssistantDependencyReferences([
				{
					clientActionId: 'new_bank',
					kind: 'create_bank',
					payload: { bankName: 'Banco X', initialBalanceInCents: 0, initialBalanceCycle: '2026-07' },
				},
				{
					clientActionId: 'transfer',
					kind: 'create_transfer',
					payload: { valueInCents: 1_000, date: '2026-07-20' },
					dependsOnActionIds: ['new_bank'],
				},
			]);

			expect(proposals[1]?.payload.sourceBankRef).toBeUndefined();
			expect(proposals[1]?.payload.targetBankRef).toBeUndefined();
		});
	});

	describe('privacy, bounds, and friendly failures', () => {
		it('keeps opaque catalog handles stable only within the same session salt', () => {
			const first = createAssistantOpaqueHandle('bank', 'banks', 'real-firestore-id', 'session-a');
			const repeated = createAssistantOpaqueHandle('bank', 'banks', 'real-firestore-id', 'session-a');
			const anotherSession = createAssistantOpaqueHandle('bank', 'banks', 'real-firestore-id', 'session-b');

			expect(repeated).toBe(first);
			expect(anotherSession).not.toBe(first);
			expect(first).not.toContain('real-firestore-id');
		});

		it('recognizes clear-conversation as a local command without sending it to the model', () => {
			expect(isAssistantClearConversationCommand('Limpar conversa')).toBe(true);
			expect(isAssistantClearConversationCommand('Apagar a conversa!')).toBe(true);
			expect(isAssistantClearConversationCommand('Limpar a despesa')).toBe(false);
		});

		it('masks values before rendering or reading private messages', () => {
			const masked = maskFinancialValuesInText('Você gastou R$ 1.234,56 e recebeu 150 reais.');
			expect(masked).toBe('Você gastou valor oculto e recebeu valor oculto.');
		});

		it('strips model HTML/code and respects the input/context action bounds', () => {
			expect(sanitizeAssistantModelText('<b>Olá</b> ```const token = 1```')).toBe('Olá');
			expect(sanitizeAssistantInput('x'.repeat(ASSISTANT_MAX_INPUT_CHARACTERS + 20))).toHaveLength(ASSISTANT_MAX_INPUT_CHARACTERS);

			const proposals = Array.from({ length: 30 }, (_, index) => ({
				kind: 'delete_expense',
				payload: { recordRef: `expense_${index}` },
			}));
			expect(normalizeModelActionProposals(proposals)).toHaveLength(ASSISTANT_DEFAULT_MAX_ACTIONS);
		});

		it.each([
			[{ code: 429, message: 'quota exceeded' }, 'quota'],
			[{ code: 503, message: 'unavailable' }, 'unavailable'],
			[new Error('Firebase AppCheck rejected reCAPTCHA'), 'app-check'],
			[new Error('network offline'), 'network'],
		])('maps %p to a safe user-facing error', (error, expectedCode) => {
			expect(mapAssistantError(error).code).toBe(expectedCode);
		});
	});
});
