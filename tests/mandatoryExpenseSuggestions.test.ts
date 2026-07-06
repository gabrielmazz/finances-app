import { findMandatoryExpenseSuggestion } from '@/utils/mandatoryExpenseSuggestions';

const draftDate = new Date(2026, 4, 10, 9, 0, 0, 0);

const buildCandidate = (overrides: Record<string, unknown> = {}) => ({
	id: 'rent',
	name: 'Aluguel',
	valueInCents: 180000,
	tagId: 'housing',
	dueDay: 10,
	usesBusinessDays: false,
	lastPaymentCycle: null,
	installmentTotal: null,
	installmentsCompleted: 0,
	...overrides,
});

describe('mandatory expense suggestions', () => {
	it('suggests a pending mandatory expense on an exact match', () => {
		const suggestion = findMandatoryExpenseSuggestion(
			{
				name: 'Aluguel',
				valueInCents: 180000,
				tagId: 'housing',
				date: draftDate,
			},
			[buildCandidate()],
		);

		expect(suggestion).toMatchObject({
			id: 'rent',
			name: 'Aluguel',
			status: 'pending',
			valueInCents: 180000,
		});
		expect(suggestion?.matchKey).toContain('rent|pending|2026-05');
	});

	it('suggests a high-confidence flexible name and value match', () => {
		const suggestion = findMandatoryExpenseSuggestion(
			{
				name: 'NET flix',
				valueInCents: 5570,
				tagId: null,
				date: new Date(2026, 4, 5, 9, 0, 0, 0),
			},
			[
				buildCandidate({
					id: 'netflix',
					name: 'Netflix',
					valueInCents: 5590,
					tagId: 'streaming',
					dueDay: 5,
				}),
			],
		);

		expect(suggestion).toMatchObject({
			id: 'netflix',
			status: 'pending',
		});
	});

	it('suggests a mandatory expense already paid in the draft cycle', () => {
		const suggestion = findMandatoryExpenseSuggestion(
			{
				name: 'Aluguel',
				valueInCents: 180000,
				tagId: 'housing',
				date: draftDate,
			},
			[
				buildCandidate({
					lastPaymentCycle: '2026-05',
				}),
			],
		);

		expect(suggestion).toMatchObject({
			id: 'rent',
			status: 'paid',
		});
		expect(suggestion?.matchKey).toContain('rent|paid|2026-05');
	});

	it('does not suggest when two candidates are too close', () => {
		const suggestion = findMandatoryExpenseSuggestion(
			{
				name: 'Internet',
				valueInCents: 9990,
				tagId: 'services',
				date: new Date(2026, 4, 15, 9, 0, 0, 0),
			},
			[
				buildCandidate({
					id: 'internet-home',
					name: 'Internet',
					valueInCents: 9990,
					tagId: 'services',
					dueDay: 15,
				}),
				buildCandidate({
					id: 'internet-office',
					name: 'Internet',
					valueInCents: 9990,
					tagId: 'services',
					dueDay: 15,
				}),
			],
		);

		expect(suggestion).toBeNull();
	});

	it('does not suggest an installment plan completed before the draft cycle', () => {
		const suggestion = findMandatoryExpenseSuggestion(
			{
				name: 'Notebook',
				valueInCents: 35000,
				tagId: 'work',
				date: draftDate,
			},
			[
				buildCandidate({
					id: 'notebook',
					name: 'Notebook',
					valueInCents: 35000,
					tagId: 'work',
					dueDay: 10,
					lastPaymentCycle: '2026-04',
					installmentTotal: 3,
					installmentsCompleted: 3,
				}),
			],
		);

		expect(suggestion).toBeNull();
	});
});
