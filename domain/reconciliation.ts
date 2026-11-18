import { validCents } from './money';

// This is a comparison of supplied evidence, not an authorization to write or a
// proof that the caller's independent coverage assessment is correct.
export type ReconciliationMovement = {
	identity: string;
	accountId: string;
	at: number;
	kind: 'gain' | 'expense' | 'transfer-in' | 'transfer-out' | 'withdrawal' | 'investment-out' | 'investment-in' | 'adjustment';
	cents: number;
	status: 'posted' | 'cancelled';
};
export type ReconciliationEvidence = {
	accountId: string;
	authorized: boolean;
	opening: { accountId: string; at: number; cents: number } | null;
	ending: { accountId: string; at: number; cents: number } | null;
	coverage: 'independently-verified' | 'unknown';
	movements: ReconciliationMovement[];
};
export type ReconciliationResult =
	| { status: 'unauthorized' | 'pending'; calculatedCents: null }
	| { status: 'reconciled' | 'divergent'; calculatedCents: number; differenceCents: number };

export function assessReconciliation(input: ReconciliationEvidence): ReconciliationResult {
	if (!input.authorized) return { status: 'unauthorized', calculatedCents: null };
	const pending = { status: 'pending', calculatedCents: null } as const;
	const { opening, ending, movements, accountId } = input;
	if (!accountId || !opening || !ending || opening.accountId !== accountId || ending.accountId !== accountId ||
		!Number.isSafeInteger(opening.at) || !Number.isSafeInteger(ending.at) || opening.at >= ending.at ||
		!validCents(opening.cents) || !validCents(ending.cents) || input.coverage !== 'independently-verified' ||
		!Array.isArray(movements)) return pending;
	const seen = new Map<string, string>();
	let total = BigInt(opening.cents);
	for (const item of movements) {
		if (!item || !item.identity || item.accountId !== accountId || !Number.isSafeInteger(item.at) ||
			!validCents(item.cents) || !['posted', 'cancelled'].includes(item.status) ||
			!['gain', 'expense', 'transfer-in', 'transfer-out', 'withdrawal', 'investment-out', 'investment-in', 'adjustment'].includes(item.kind) ||
			(item.kind !== 'adjustment' && item.cents < 0)) return pending;
		if (item.at <= opening.at || item.at > ending.at) return pending;
		const fingerprint = JSON.stringify([item.accountId, item.at, item.kind, item.cents, item.status]);
		const previous = seen.get(item.identity);
		if (previous !== undefined) {
			if (previous !== fingerprint) return pending;
			continue;
		}
		seen.set(item.identity, fingerprint);
		if (item.status === 'cancelled') continue;
		const sign = ['expense', 'transfer-out', 'withdrawal', 'investment-out'].includes(item.kind) ? -1n : 1n;
		total += sign * BigInt(item.cents);
	}
	if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < -BigInt(Number.MAX_SAFE_INTEGER)) return pending;
	const calculatedCents = Number(total);
	if (!validCents(calculatedCents)) return pending;
	return { status: calculatedCents === ending.cents ? 'reconciled' : 'divergent', calculatedCents,
		differenceCents: calculatedCents - ending.cents };
}
