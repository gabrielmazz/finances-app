export type MandatoryExpenseSuggestion = {
	id: string;
	name: string;
	valueInCents: number;
	tagId: string | null;
	dueDay: number;
	matchKey: string;
	score: number;
};
