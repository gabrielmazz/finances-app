import {
	findMandatoryExpenseRegistrationTarget,
	findMandatoryExpenseSuggestion,
} from '@/utils/mandatoryExpenseSuggestions';

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
			valueInCents: 180000,
		});
		expect(suggestion?.matchKey).toContain('rent|2026-05');
	});

	it('suggests a high-confidence flexible name and value match', () => {
		const suggestion = findMandatoryExpenseSuggestion(
			{
				name: 'NET flix',
				valueInCents: 5570,
				tagId: 'streaming',
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
		});
	});

	it('suggests a unique canonical utility name even with another category and a variable value', () => {
		const suggestion = findMandatoryExpenseSuggestion(
			{
				name: 'Luz',
				valueInCents: 13500,
				tagId: 'regular-home',
				date: new Date(2026, 4, 20, 9, 0, 0, 0),
			},
			[
				buildCandidate({
					id: 'electricity',
					name: 'Conta de Luz',
					valueInCents: 11000,
					tagId: 'mandatory-utilities',
					dueDay: 10,
				}),
			],
		);

		expect(suggestion).toMatchObject({ id: 'electricity', name: 'Conta de Luz' });
	});

	it('recognizes energia elétrica as the canonical name for luz', () => {
		const suggestion = findMandatoryExpenseSuggestion(
			{
				name: 'Conta de Energia Elétrica',
				valueInCents: 14200,
				tagId: 'regular-home',
				date: new Date(2026, 4, 20, 9, 0, 0, 0),
			},
			[
				buildCandidate({
					id: 'electricity',
					name: 'Luz',
					valueInCents: 11000,
					tagId: 'mandatory-utilities',
					dueDay: 10,
				}),
			],
		);

		expect(suggestion).toMatchObject({ id: 'electricity', name: 'Luz' });
	});

	it.each([
		{
			id: 'rent',
			candidateName: 'Aluguel',
			draftName: 'Fatura do Aluguel',
			candidateValueInCents: 180000,
			draftValueInCents: 195000,
		},
		{
			id: 'internet',
			candidateName: 'Internet Residencial',
			draftName: 'Pagamento da Internet Residencial',
			candidateValueInCents: 9990,
			draftValueInCents: 11000,
		},
		{
			id: 'gym',
			candidateName: 'Academia',
			draftName: 'Mensalidade da Academia',
			candidateValueInCents: 12990,
			draftValueInCents: 14500,
		},
		{
			id: 'insurance',
			candidateName: 'Seguro do Carro',
			draftName: 'Pagamento do Seguro do Carro',
			candidateValueInCents: 22000,
			draftValueInCents: 24000,
		},
	])(
		'suggests any uniquely identified mandatory expense despite different regular category and value: $candidateName',
		({ id, candidateName, draftName, candidateValueInCents, draftValueInCents }) => {
			const suggestion = findMandatoryExpenseSuggestion(
				{
					name: draftName,
					valueInCents: draftValueInCents,
					tagId: 'regular-expenses',
					date: new Date(2026, 4, 20, 9, 0, 0, 0),
				},
				[
					buildCandidate({
						id,
						name: candidateName,
						valueInCents: candidateValueInCents,
						tagId: 'mandatory-expenses',
						dueDay: 10,
					}),
				],
			);

			expect(suggestion).toMatchObject({ id, name: candidateName });
		},
	);

	it('uses the previous payment value as corroboration for a variable recurring bill', () => {
		const suggestion = findMandatoryExpenseSuggestion(
			{
				name: 'NET flix',
				valueInCents: 8000,
				tagId: 'streaming',
				date: new Date(2026, 4, 20, 9, 0, 0, 0),
			},
			[
				buildCandidate({
					id: 'netflix',
					name: 'Netflix',
					valueInCents: 5590,
					lastPaymentValueInCents: 7950,
					tagId: 'streaming',
					dueDay: 5,
				}),
			],
		);

		expect(suggestion).toMatchObject({ id: 'netflix' });
	});

	it('does not suggest a mandatory expense already paid in the draft cycle', () => {
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

		expect(suggestion).toBeNull();
	});

	it('recovers a candidate whose recorded payment no longer exists', () => {
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
					hasLinkedPaymentExpense: false,
				}),
			],
		);

		expect(suggestion).toMatchObject({ id: 'rent' });
	});

	it('does not suggest a fuzzy candidate with only one corroborating signal', () => {
		const suggestion = findMandatoryExpenseSuggestion(
			{
				name: 'NET flix',
				valueInCents: 5590,
				tagId: 'other',
				date: new Date(2026, 4, 20, 9, 0, 0, 0),
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

		expect(suggestion).toBeNull();
	});

	it('does not suggest a fuzzy candidate based only on category and due date', () => {
		const suggestion = findMandatoryExpenseSuggestion(
			{
				name: 'NET flix',
				valueInCents: 12000,
				tagId: 'streaming',
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

		expect(suggestion).toBeNull();
	});

	it('does not suggest when more than one pending candidate has the same canonical name', () => {
		const suggestion = findMandatoryExpenseSuggestion(
			{
				name: 'Luz',
				valueInCents: 13500,
				tagId: 'regular-home',
				date: draftDate,
			},
			[
				buildCandidate({
					id: 'electricity-home',
					name: 'Conta de Luz',
					valueInCents: 11000,
					tagId: 'mandatory-home',
				}),
				buildCandidate({
					id: 'electricity-office',
					name: 'Pagamento de Energia Elétrica',
					valueInCents: 15000,
					tagId: 'mandatory-office',
				}),
			],
		);

		expect(suggestion).toBeNull();
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

	it('does not suggest an installment before its configured start cycle', () => {
		const suggestion = findMandatoryExpenseSuggestion(
			{
				name: 'Curso',
				valueInCents: 35000,
				tagId: 'education',
				date: draftDate,
			},
			[
				buildCandidate({
					id: 'course',
					name: 'Curso',
					valueInCents: 35000,
					tagId: 'education',
					dueDay: 10,
					installmentTotal: 6,
					installmentStartDate: new Date(2026, 5, 10),
					installmentEndDate: new Date(2026, 10, 10),
				}),
			],
		);

		expect(suggestion).toBeNull();
	});

	describe('focused mandatory expense target', () => {
		const candidates = [
			{ id: 'rent', isPaidForCurrentCycle: false, isInstallmentComplete: false },
			{ id: 'internet', isPaidForCurrentCycle: true, isInstallmentComplete: false },
			{ id: 'course', isPaidForCurrentCycle: false, isInstallmentComplete: true },
		];

		it('returns only the requested pending target', () => {
			expect(findMandatoryExpenseRegistrationTarget('rent', candidates)).toEqual(candidates[0]);
		});

		it('does not return unknown, paid, or completed targets', () => {
			expect(findMandatoryExpenseRegistrationTarget('unknown', candidates)).toBeNull();
			expect(findMandatoryExpenseRegistrationTarget('internet', candidates)).toBeNull();
			expect(findMandatoryExpenseRegistrationTarget('course', candidates)).toBeNull();
		});
	});
});
