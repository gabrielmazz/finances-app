import type { MovementRecord } from '@/types/bankMovements';

import type { HomeExpenseHistoryMonth } from '@/types/presentation/home-expense-history';

import type { HomeActivityHeatmap } from '@/types/presentation/home-activity-heatmap';

import type { HomeMandatoryItem } from '@/types/presentation/home-mandatory-schedule';

export type HomeBankBalanceCard = {
	id: string;
	name: string;
	balanceInCents: number | null;
	colorHex: string | null;
};

export type HomeCashSummary = {
	id: 'cash-transactions';
	name: string;
	balanceInCents: number;
	currentMonthExpensesInCents: number;
	currentMonthGainsInCents: number;
};

export type HomeInvestmentsData = {
	portfolio: HomeInvestmentPortfolio;
	projectionStatus?: 'confirmed_only' | 'projected';
};

export type HomeInvestmentPortfolio = {
	items: HomeInvestmentItem[];
	totalCurrentBaseInCents: number;
	totalInitialInCents: number;
	totalSimulatedInCents: number;
	totalEstimatedGainInCents: number;
	investmentCount: number;
};

export type HomeInvestmentItem = {
	id: string;
	name: string;
	bankId: string | null;
	bankNameSnapshot: string | null;
	initialValueInCents: number;
	currentBaseValueInCents: number;
	simulatedValueInCents: number;
	estimatedGainInCents: number;
	cdiPercentage: number;
	lastManualSyncValueInCents: number | null;
	lastManualSyncAt: Date | null;
	createdAt: Date | null;
};

export type HomeMovementsData = {
	timelineMovements: HomeTimelineMovement[];
	bankColorsById: Record<string, string | null>;
};

export type HomeTimelineMovement = MovementRecord & {
	id: string;
	type: 'expense' | 'gain' | 'sync';
	name: string;
	valueInCents: number;
	date: Date | null;
	tagId: string | null;
	tagName: string | null;
	tagIconFamily: string | null;
	tagIconName: string | null;
	tagIconStyle: string | null;
	bankId: string | null;
	bankName: string | null;
	explanation: string | null;
	moneyFormat: boolean | null;
	isBankTransfer: boolean;
	bankTransferDirection: 'incoming' | 'outgoing' | null;
	bankTransferSourceBankNameSnapshot: string | null;
	bankTransferTargetBankNameSnapshot: string | null;
	isInvestmentDeposit: boolean;
	isInvestmentRedemption: boolean;
	isFinanceInvestmentSync: boolean;
	investmentSyncPreviousValueInCents: number | null;
	investmentSyncReason: 'manual' | 'deposit' | 'withdrawal' | null;
	investmentNameSnapshot: string | null;
	isFromMandatory: boolean;
};

export type HomeOverviewData = {
	bankBalances: HomeBankBalanceCard[];
	cashSummary: HomeCashSummary | null;
	currentMonthExpensesByBankId: Record<string, number>;
	currentMonthGainsByBankId: Record<string, number>;
	expenseHistoryLastThreeMonths: HomeExpenseHistoryMonth[];
	activityHeatmap: HomeActivityHeatmap;
	upcomingMandatoryItems: HomeMandatoryItem[];
};
