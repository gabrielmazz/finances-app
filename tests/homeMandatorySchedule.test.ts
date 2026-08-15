import { buildHomeMandatorySchedule } from '@/utils/homeMandatorySchedule';

describe('buildHomeMandatorySchedule', () => {
	const referenceDate = new Date(2026, 7, 14, 12, 0, 0);

	it('returns pending current-cycle items ordered by occurrence', () => {
		const items = buildHomeMandatorySchedule(
			[
				{ id: 'rent', name: 'Aluguel', valueInCents: 180000, dueDay: 20 },
				{ id: 'internet', name: 'Internet', valueInCents: 12000, dueDay: 16 },
			],
			[{ id: 'salary', name: 'Salário', valueInCents: 500000, dueDay: 5 }],
			referenceDate,
		);

		expect(items.map((item) => `${item.type}:${item.id}`)).toEqual([
			'expense:internet',
			'expense:rent',
			'gain:salary',
		]);
		expect(items[0]).toMatchObject({
			name: 'Internet',
			valueInCents: 12000,
			isOverdue: false,
		});
	});

	it('moves a completed current cycle to the next occurrence', () => {
		const [item] = buildHomeMandatorySchedule(
			[
				{
					id: 'rent',
					name: 'Aluguel',
					valueInCents: 180000,
					dueDay: 20,
					lastPaymentCycle: '2026-08',
				},
			],
			[],
			referenceDate,
		);

		expect(item.dueDate).toEqual(new Date(2026, 8, 20, 12, 0, 0));
	});

	it('ignores completed installment plans and invalid monetary values', () => {
		const items = buildHomeMandatorySchedule(
			[
				{
					id: 'finished',
					name: 'Seguro',
					valueInCents: 10000,
					dueDay: 10,
					installmentTotal: 3,
					installmentsCompleted: 3,
				},
				{ id: 'invalid', name: 'Inválido', valueInCents: 10.5, dueDay: 12 },
			],
			[],
			referenceDate,
		);

		expect(items).toEqual([]);
	});
});
