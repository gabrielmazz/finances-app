export const FINANCE_STALE_TIME_MS = 10 * 60 * 1000;

export type FinanceQueryKey = readonly ['finance', string, string, ...readonly unknown[]];

export type FinanceCachePolicy = {
	staleTime: number;
	persistence: 'metadata' | 'financial' | 'none';
};

export type TrustedDeviceCachePreference = {
	uid: string;
	enabled: boolean;
	updatedAt: number;
};

export type ReadAuditEntry = {
	key: readonly unknown[];
	origin: 'firestore' | 'memory-cache' | 'persistent-cache';
	trigger: 'mount' | 'manual-refresh' | 'pagination' | 'mutation';
	durationMs: number;
	documentCount?: number;
	at: number;
};

export const financeQueryKey = {
	profile: (uid: string): FinanceQueryKey => ['finance', uid, 'profile'],
	relatedUsers: (uid: string): FinanceQueryKey => ['finance', uid, 'related-users'],
	banks: (uid: string): FinanceQueryKey => ['finance', uid, 'banks'],
	tags: (uid: string): FinanceQueryKey => ['finance', uid, 'tags'],
	home: (uid: string): FinanceQueryKey => ['finance', uid, 'home'],
} as const;

const readAudit: ReadAuditEntry[] = [];

export function recordFinanceRead(entry: ReadAuditEntry) {
	readAudit.push(entry);
	if (readAudit.length > 200) readAudit.shift();
	if (__DEV__) console.debug('[finance-read]', entry);
}

export function getFinanceReadAudit() {
	return [...readAudit];
}

export { createReadScope, getReadReport, resetReadReport } from '@/utils/firebaseReadAudit';

export const financeCachePolicy = {
	metadata: { staleTime: FINANCE_STALE_TIME_MS, persistence: 'metadata' },
	financial: { staleTime: FINANCE_STALE_TIME_MS, persistence: 'financial' },
	none: { staleTime: 0, persistence: 'none' },
} satisfies Record<string, FinanceCachePolicy>;
