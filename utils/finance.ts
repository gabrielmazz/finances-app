export type RedemptionTerm = 'anytime' | '1m' | '3m' | '6m' | '1y' | '2y' | '3y';

export const redemptionTermLabels: Record<RedemptionTerm, string> = {
	anytime: 'A qualquer momento',
	'1m': '1 mês',
	'3m': '3 meses',
	'6m': '6 meses',
	'1y': '1 ano',
	'2y': '2 anos',
	'3y': '3 anos',
};
