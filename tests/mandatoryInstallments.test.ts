import {
	getMandatoryInstallmentEndDateFromTotal,
	getMandatoryInstallmentTotalFromDateRange,
	getMandatoryInstallmentsCompletedFromStartDate,
	resolveMandatoryInstallmentsCompleted,
} from '@/utils/mandatoryInstallments';

describe('mandatory installments', () => {
	it('calculates installment quantity from an inclusive monthly range', () => {
		expect(
			getMandatoryInstallmentTotalFromDateRange(
				new Date(2026, 0, 15),
				new Date(2026, 3, 1),
			),
		).toBe(4);
		expect(
			getMandatoryInstallmentTotalFromDateRange(
				new Date(2026, 0, 15),
				new Date(2025, 11, 20),
			),
		).toBe(1);
	});

	it('calculates the end date from quantity preserving the start day when possible', () => {
		const endDate = getMandatoryInstallmentEndDateFromTotal(new Date(2025, 0, 31), 2);

		expect(endDate).toEqual(new Date(2025, 1, 28));
	});

	it('counts elapsed installments before the current cycle and includes the current cycle only when completed', () => {
		const startDate = new Date(2026, 0, 10);
		const referenceDate = new Date(2026, 6, 6);

		expect(
			getMandatoryInstallmentsCompletedFromStartDate({
				startDate,
				installmentTotal: 12,
				isCurrentCycleCompleted: false,
				referenceDate,
			}),
		).toBe(6);

		expect(
			getMandatoryInstallmentsCompletedFromStartDate({
				startDate,
				installmentTotal: 12,
				isCurrentCycleCompleted: true,
				referenceDate,
			}),
		).toBe(7);
	});

	it('preserves a higher stored counter when resolving retroactive progress', () => {
		expect(
			resolveMandatoryInstallmentsCompleted({
				storedCompleted: 5,
				installmentTotal: 12,
				startDate: new Date(2026, 5, 10),
				isCurrentCycleCompleted: false,
				referenceDate: new Date(2026, 6, 6),
			}),
		).toBe(5);
	});
});
