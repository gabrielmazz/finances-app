import type {
CategoryAnalysisMovementType,
CategoryAnalysisRecentMovement
} from '@/types/presentation/category-analysis';

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

export const getCategoryAnalysisMovementPage = (
	movements: CategoryAnalysisRecentMovement[], type: CategoryAnalysisMovementType, showAll: boolean, page = 0,
) => {
	const filtered = movements.filter(movement => movement.type === type);
	const pageSize = showAll ? 20 : 8;
	const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
	const currentPage = showAll ? Math.max(0, Math.min(page, pageCount - 1)) : 0;
	return { all: filtered, items: filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize), pageCount, currentPage };
};
