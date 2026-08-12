export type TagReferenceSummary = {
	expenses: number;
	gains: number;
	mandatoryExpenses: number;
	mandatoryGains: number;
	total: number;
};

export function createTagReferenceSummary(
	counts: Omit<TagReferenceSummary, 'total'>,
): TagReferenceSummary {
	return {
		...counts,
		total:
			counts.expenses +
			counts.gains +
			counts.mandatoryExpenses +
			counts.mandatoryGains,
	};
}

export function hasTagReferences(summary: TagReferenceSummary) {
	return summary.total > 0;
}
