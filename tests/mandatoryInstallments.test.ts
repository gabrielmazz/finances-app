import {
	getMandatoryInstallmentEndDateFromTotal,
	getMandatoryInstallmentRemainingValueInCents,
	getMandatoryInstallmentTotalFromDateRange,
	getMandatoryInstallmentValueInCents,
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

	it('calculates the remaining settlement amount in cents', () => {
		expect(
			getMandatoryInstallmentRemainingValueInCents({
				installmentTotal: 10,
				installmentsCompleted: 3,
				installmentValueInCents: 12500,
			}),
		).toBe(87500);
	});

	it('keeps the contracted total exact when a selection includes the final installment', () => {
		expect(
			getMandatoryInstallmentValueInCents({
				installmentTotal: 3,
				installmentsCompleted: 0,
				installmentsToSettle: 2,
				installmentValueInCents: 3333,
				installmentTotalValueInCents: 10000,
			}),
		).toBe(6666);

		expect(
			getMandatoryInstallmentValueInCents({
				installmentTotal: 3,
				installmentsCompleted: 2,
				installmentsToSettle: 1,
				installmentValueInCents: 3333,
				installmentTotalValueInCents: 10000,
			}),
		).toBe(3334);
	});

	it('does not allow settlement for a non-installment plan', () => {
		expect(
			getMandatoryInstallmentRemainingValueInCents({
				installmentTotal: null,
				installmentsCompleted: 0,
				installmentValueInCents: 12500,
			}),
		).toBeNull();
	});
});
