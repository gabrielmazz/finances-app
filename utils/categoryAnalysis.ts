import type {
	CategoryAnalysisMetric,
	CategoryAnalysisMonthBucket,
	CategoryAnalysisMovementType,
	CategoryAnalysisRecentMovement,
} from '@/functions/CategoryAnalysisFirebase';

export type CategoryAnalysisRange = { startDate: Date; endDate: Date };

export const formatCategoryAnalysisDate = (date: Date) =>
	new Intl.DateTimeFormat('pt-BR').format(date);

export const getDefaultCategoryAnalysisRange = (now = new Date(), months = 3): CategoryAnalysisRange => ({
	startDate: new Date(now.getFullYear(), now.getMonth() - months, 1),
	endDate: new Date(now.getFullYear(), now.getMonth(), 0),
});

export const getCategoryAnalysisRangeError = ({ startDate, endDate }: CategoryAnalysisRange, now = new Date()) => {
	if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
		return 'Selecione datas válidas para o histórico.';
	}
	if (startDate > endDate) return 'A data inicial deve ser anterior ou igual à data final.';
	if (endDate >= new Date(now.getFullYear(), now.getMonth(), 1)) {
		return 'O histórico deve terminar antes do mês atual, que é analisado separadamente.';
	}
	const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + endDate.getMonth() - startDate.getMonth() + 1;
	return months > 12 ? 'Selecione um histórico de até 12 meses.' : null;
};

export const buildCategoryAnalysisMonths = (range: CategoryAnalysisRange, now = new Date()) => {
	const error = getCategoryAnalysisRangeError(range, now);
	if (error) throw new Error(error);
	const start = new Date(range.startDate.getFullYear(), range.startDate.getMonth(), range.startDate.getDate());
	const end = new Date(range.endDate.getFullYear(), range.endDate.getMonth(), range.endDate.getDate(), 23, 59, 59, 999);
	const makeMonth = (date: Date, isCurrentMonth: boolean) => {
		const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
		const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
		return {
			key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
			label: new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(date),
			isCurrentMonth,
			isComparisonMonth: !isCurrentMonth && start <= startDate && end >= endDate,
			daysInMonth: endDate.getDate(),
			startDate: isCurrentMonth ? startDate : new Date(Math.max(start.getTime(), startDate.getTime())),
			endDate: isCurrentMonth ? now : new Date(Math.min(end.getTime(), endDate.getTime())),
		};
	};
	const months = [];
	for (let date = new Date(start.getFullYear(), start.getMonth(), 1); date <= end;
		date = new Date(date.getFullYear(), date.getMonth() + 1, 1)) {
		months.push(makeMonth(date, false));
	}
	months.push(makeMonth(now, true));
	return months;
};

// Mesmos dias do calendário nos meses completos: [[Análise por Categoria]].
export const calculateCategoryAnalysisMetric = (
	months: CategoryAnalysisMonthBucket[],
	movements: CategoryAnalysisRecentMovement[],
	type: CategoryAnalysisMovementType,
	comparisonDay: number,
): CategoryAnalysisMetric => {
	const current = months.find(month => month.isCurrentMonth);
	const history = months.filter(month => month.isComparisonMonth);
	const historyKeys = new Set(history.map(month => month.key));
	const historicalMovements = movements.filter(movement => {
		const date = movement.date;
		return date && movement.type === type && date.getDate() <= comparisonDay &&
			historyKeys.has(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
	});
	const historicalTotal = historicalMovements.reduce((sum, movement) => sum + movement.valueInCents, 0);
	const historicalAverageInCents = history.length ? Math.round(historicalTotal / history.length) : 0;
	const currentInCents = (type === 'expense' ? current?.expenseInCents : current?.gainInCents) ?? 0;
	const deltaInCents = currentInCents - historicalAverageInCents;
	const deltaPercent = historicalAverageInCents > 0
		? Number(((deltaInCents / historicalAverageInCents) * 100).toFixed(1)) : null;
	return {
		currentInCents, historicalAverageInCents, deltaInCents, deltaPercent,
		status: deltaPercent === null ? 'no-history' : Math.abs(deltaPercent) <= 5 ? 'stable' : deltaInCents > 0 ? 'above' : 'below',
		currentCount: (type === 'expense' ? current?.expenseCount : current?.gainCount) ?? 0,
		historicalCount: historicalMovements.length,
	};
};

export const getCategoryAnalysisMovementPage = (
	movements: CategoryAnalysisRecentMovement[], type: CategoryAnalysisMovementType, showAll: boolean, page = 0,
) => {
	const filtered = movements.filter(movement => movement.type === type);
	const pageSize = showAll ? 20 : 8;
	const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
	const currentPage = showAll ? Math.max(0, Math.min(page, pageCount - 1)) : 0;
	return { all: filtered, items: filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize), pageCount, currentPage };
};
