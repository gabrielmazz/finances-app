import type { TagIconSelection } from '@/hooks/useTagIcons';

import type { TagUsageType } from '@/utils/tagUsage';

export type CategoryAnalysisBankBreakdown = {
	id: string;
	name: string;
	colorHex: string | null;
	isCash: boolean;
	expenseInCents: number;
	gainInCents: number;
	movementCount: number;
};

export type CategoryAnalysisMetric = {
	currentInCents: number;
	historicalAverageInCents: number;
	deltaInCents: number;
	deltaPercent: number | null;
	status: CategoryAnalysisStatus;
	currentCount: number;
	historicalCount: number;
};

export type CategoryAnalysisStatus = 'above' | 'below' | 'stable' | 'no-history';

export type CategoryAnalysisMovementType = 'expense' | 'gain';

export type CategoryAnalysisReport = {
	tagId: string;
	tagName: string;
	currentMonthLabel: string;
	baselineMonthCount: number;
	months: CategoryAnalysisMonthBucket[];
	expense: CategoryAnalysisMetric;
	gain: CategoryAnalysisMetric;
	bankBreakdown: CategoryAnalysisBankBreakdown[];
	movements: CategoryAnalysisRecentMovement[];
	historyPeriodLabel: string;
	comparisonLabel: string;
	currentPeriodLabel: string;
};

export type CategoryAnalysisMonthBucket = {
	key: string;
	label: string;
	isCurrentMonth: boolean;
	daysInMonth: number;
	firstDay: number;
	lastDay: number;
	isComparisonMonth: boolean;
	dailyMovementsByDay: Record<string, { expenseInCents: number; gainInCents: number }>;
	expenseInCents: number;
	gainInCents: number;
	expenseCount: number;
	gainCount: number;
};

export type CategoryAnalysisRecentMovement = {
	id: string;
	type: CategoryAnalysisMovementType;
	name: string;
	valueInCents: number;
	date: Date | null;
	bankId: string | null;
	bankName: string;
	isCash: boolean;
	explanation: string | null;
};

export type CategoryAnalysisTagOption = {
	id: string;
	name: string;
	usageType: TagUsageType | null;
	isMandatoryExpense: boolean;
	isMandatoryGain: boolean;
	icon: TagIconSelection | null;
	currentExpenseInCents: number;
	currentGainInCents: number;
	movementCount: number;
};

export type CategoryAnalysisData = {
	tags: CategoryAnalysisTagOption[];
	reportsByTagId: Record<string, CategoryAnalysisReport>;
	defaultTagId: string | null;
	baselineMonthCount: number;
	generatedAt: Date;
};
