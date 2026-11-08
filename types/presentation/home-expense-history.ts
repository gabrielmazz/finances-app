export type HomeExpenseHistoryMonth = {
	key: string;
	label: string;
	daysInMonth: number;
	dailyExpensesInCents: Record<string, number>;
	totalExpensesInCents: number;
	totalGainsInCents: number;
};
