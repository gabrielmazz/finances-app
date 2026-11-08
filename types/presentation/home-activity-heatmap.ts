export type HomeActivityHeatmap = {
	startDate: string;
	endDate: string;
	dailyActionCounts: Record<string, number>;
	totalActions: number;
};
