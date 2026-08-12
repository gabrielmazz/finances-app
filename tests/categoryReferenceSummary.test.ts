import {
	createTagReferenceSummary,
	hasTagReferences,
} from '@/utils/categoryReferenceSummary';

describe('category reference safety', () => {
	it('allows deleting a category with no references', () => {
		const summary = createTagReferenceSummary({
			expenses: 0,
			gains: 0,
			mandatoryExpenses: 0,
			mandatoryGains: 0,
		});

		expect(summary.total).toBe(0);
		expect(hasTagReferences(summary)).toBe(false);
	});

	it.each([
		['a transaction', { expenses: 1, gains: 0, mandatoryExpenses: 0, mandatoryGains: 0 }],
		['a recurring transaction', { expenses: 0, gains: 0, mandatoryExpenses: 1, mandatoryGains: 0 }],
		['both kinds of records', { expenses: 2, gains: 1, mandatoryExpenses: 3, mandatoryGains: 4 }],
	])('blocks deletion when the category has %s', (_scenario, counts) => {
		const summary = createTagReferenceSummary(counts);

		expect(summary.total).toBeGreaterThan(0);
		expect(hasTagReferences(summary)).toBe(true);
	});
});
