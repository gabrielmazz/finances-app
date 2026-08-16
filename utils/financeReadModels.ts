export type FinanceMonthlySummaryV1 = {
	version: 1;
	scopeType: 'group' | 'person';
	scopeId: string;
	groupId?: string;
	monthKey: string;
	transactionCount: number;
	bankDeltaInCents: Record<string, number>;
	updatedAt?: unknown;
};

export type LegacyBankBalanceReadModelV1 = {
	version: 1;
	personId: string;
	bankId: string;
	balanceInCents: number | null;
	snapshotMonthKey: string | null;
	updatedAt?: unknown;
};

export type PaginatedResult<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };
