export type HomeExpenseHistorySource = {
	date: Date | null;
	valueInCents: number;
};

export type HomeExpenseHistoryMonth = {
	key: string;
	label: string;
	daysInMonth: number;
	dailyExpensesInCents: Record<string, number>;
	totalExpensesInCents: number;
	totalGainsInCents: number;
};

const isValidDate = (value: Date | null): value is Date =>
	value instanceof Date && !Number.isNaN(value.getTime());

const getMonthKey = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const getMonthLabel = (date: Date) =>
	`${new Intl.DateTimeFormat('pt-BR', { month: 'short' })
		.format(date)
		.replace('.', '')}/${date.getFullYear()}`;

export const buildHomeExpenseHistory = (
	expenseSources: HomeExpenseHistorySource[],
	gainSources: HomeExpenseHistorySource[] = [],
	referenceDate = new Date(),
): HomeExpenseHistoryMonth[] => {
	if (!isValidDate(referenceDate)) {
		return [];
	}

	const months = Array.from({ length: 3 }, (_, index) => {
		const date = new Date(
			referenceDate.getFullYear(),
			referenceDate.getMonth() - 2 + index,
			1,
		);
		return {
			key: getMonthKey(date),
			label: getMonthLabel(date),
			daysInMonth: new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(),
			dailyExpensesInCents: {} as Record<string, number>,
			totalExpensesInCents: 0,
			totalGainsInCents: 0,
		};
	});

	const addSourcesToMonths = (
		sources: HomeExpenseHistorySource[],
		field: 'totalExpensesInCents' | 'totalGainsInCents',
	) => {
		for (const source of sources) {
			const date = source.date;
			if (
				!isValidDate(date) ||
				date.getTime() > referenceDate.getTime() ||
				!Number.isSafeInteger(source.valueInCents) ||
				source.valueInCents <= 0
			) {
				continue;
			}

			const month = months.find((candidate) => candidate.key === getMonthKey(date));
			if (!month) {
				continue;
			}

			if (field === 'totalExpensesInCents') {
				const dayKey = String(date.getDate());
				month.dailyExpensesInCents[dayKey] =
					(month.dailyExpensesInCents[dayKey] ?? 0) + source.valueInCents;
			}
			month[field] += source.valueInCents;
		}
	}

	addSourcesToMonths(expenseSources, 'totalExpensesInCents');
	addSourcesToMonths(gainSources, 'totalGainsInCents');

	return months;
};
