export type HomeMandatoryItem = {
	id: string;
	name: string;
	type: 'expense' | 'gain';
	valueInCents: number;
	dueDate: Date;
	isOverdue: boolean;
	installmentLabel: string | null;
};
