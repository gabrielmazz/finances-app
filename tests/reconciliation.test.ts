import { assessReconciliation, type ReconciliationEvidence } from '../domain/reconciliation';

const evidence: ReconciliationEvidence = {
	accountId: 'account', authorized: true,
	opening: { accountId: 'account', at: 100, cents: 100000 },
	ending: { accountId: 'account', at: 200, cents: 119000 },
	coverage: 'independently-verified',
	movements: [
		{ identity: 'income', accountId: 'account', at: 110, kind: 'gain', cents: 50000, status: 'posted' },
		{ identity: 'mandatory', accountId: 'account', at: 120, kind: 'expense', cents: 20000, status: 'posted' },
		{ identity: 'transfer', accountId: 'account', at: 130, kind: 'transfer-out', cents: 5000, status: 'posted' },
		{ identity: 'withdrawal', accountId: 'account', at: 140, kind: 'withdrawal', cents: 6000, status: 'posted' },
	],
};

test('compares independently verified coverage without applying effects twice', () => {
	expect(assessReconciliation(evidence)).toMatchObject({ status: 'reconciled', calculatedCents: 119000 });
});

test('does not treat incomplete, ambiguous, or unauthorized history as reconciled', () => {
	expect(assessReconciliation({ ...evidence, coverage: 'unknown' }).status).toBe('pending');
	expect(assessReconciliation({ ...evidence, opening: null }).status).toBe('pending');
	expect(assessReconciliation({ ...evidence, authorized: false }).status).toBe('unauthorized');
	expect(assessReconciliation({ ...evidence, movements: [{ ...evidence.movements[0], accountId: 'other' }] }).status).toBe('pending');
	expect(assessReconciliation({ ...evidence, movements: [{ ...evidence.movements[0], kind: 'unknown' as never }] }).status).toBe('pending');
	expect(assessReconciliation({ ...evidence, movements: [{ ...evidence.movements[0], at: 100 }] }).status).toBe('pending');
});

test('detects divergence and ignores cancelled events and verified duplicate identities', () => {
	const duplicate = evidence.movements[0];
	const cancelled = { ...duplicate, identity: 'cancelled', status: 'cancelled' as const };
	const input = { ...evidence, movements: [...evidence.movements, duplicate, cancelled] };
	expect(assessReconciliation(input)).toMatchObject({ status: 'reconciled', calculatedCents: 119000 });
	expect(assessReconciliation({ ...input, ending: { ...evidence.ending!, cents: 120000 } })).toMatchObject({ status: 'divergent', differenceCents: -1000 });
	expect(assessReconciliation({ ...input, movements: [...input.movements, { ...duplicate, cents: 1 }] }).status).toBe('pending');
	expect(assessReconciliation({ ...input, movements: [...input.movements].reverse() })).toEqual(assessReconciliation(input));
});

test('identical amounts are not silently deduplicated and accounting uses integer cents', () => {
	const additional = { ...evidence.movements[1], identity: 'another-expense' };
	expect(assessReconciliation({ ...evidence, movements: [...evidence.movements, additional] })).toMatchObject({ status: 'divergent', calculatedCents: 99000 });
	expect(assessReconciliation({ ...evidence, movements: [{ ...additional, cents: 1.5 }] }).status).toBe('pending');
});

test('handles both transfer directions, investment principal and signed adjustments', () => {
	const movements: ReconciliationEvidence['movements'] = [
		{ identity: 'in', accountId: 'account', at: 110, kind: 'transfer-in', cents: 1000, status: 'posted' },
		{ identity: 'invest', accountId: 'account', at: 120, kind: 'investment-out', cents: 3000, status: 'posted' },
		{ identity: 'redemption', accountId: 'account', at: 130, kind: 'investment-in', cents: 800, status: 'posted' },
		{ identity: 'adjustment', accountId: 'account', at: 140, kind: 'adjustment', cents: -100, status: 'posted' },
	];
	expect(assessReconciliation({ ...evidence, movements, ending: { ...evidence.ending!, cents: 98700 } })).toMatchObject({ status: 'reconciled', calculatedCents: 98700 });
});
