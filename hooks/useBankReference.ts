import React from 'react';
import { getFirebaseClient } from '@/firebase/client';
import { financialLedgerAllowsWrites, selectedFinancialProject, usesCanonicalFinance } from '@/firebase/config';
import { prepareLegacyReference, previewLegacyReference, type LegacyReferenceInput } from '@/firebase/banks';
import { errorMessage } from '@/application/errors';
import { useBankAccounts } from '@/contexts/BankAccountsContext';
import type { BankAccount, BankMetadata } from '@/domain/banks';
import { navigateToHomeDashboard } from '@/utils/navigation';
import { referenceInstant } from '@/domain/referenceTime';

export function useBankReference(bank: BankAccount | null, metadata: BankMetadata) {
	const accounts = useBankAccounts();
	const [editing, setEditing] = React.useState(false), [balance, setBalance] = React.useState(Number.NaN),
		[referenceDate, setReferenceDate] = React.useState(''), [referenceTime, setReferenceTime] = React.useState(''),
		[reason, setReason] = React.useState(''), [preview, setPreview] = React.useState<LegacyReferenceInput | null>(null),
		[error, setError] = React.useState<string | null>(null), [busy, setBusy] = React.useState(false);
	const locked = React.useRef(false);
	const identity = accounts.scope && bank ? `${accounts.scope.uid}:${accounts.scope.kind}:${accounts.scope.id}:${bank.source}:${bank.id}` : null;
	const currentIdentity = React.useRef(identity);
	currentIdentity.current = identity;
	const mode = process.env.EXPO_PUBLIC_FIREBASE_MODE;
	const project = selectedFinancialProject();
	const canonical = usesCanonicalFinance(project);
	const writable = financialLedgerAllowsWrites(project);
	const eligible = canonical ? bank?.migrated && bank.openingDate === null : bank?.source === 'legacy';
	const available = ['emulator', 'staging', 'production'].includes(mode || '') && accounts.scope?.kind === 'personal' && bank && eligible && !bank.blocked && bank.status === 'active';
	React.useEffect(() => { setEditing(false); setBalance(Number.NaN); setReferenceDate(''); setReferenceTime(''); setReason(''); setPreview(null); setError(null); }, [identity]);
	async function simulate() {
		if (!available || !accounts.scope || !bank || locked.current) return;
		locked.current = true; setBusy(true); setError(null);
		const owner = identity;
		try {
			const candidate = { ...metadata, initialBalanceCents: balance, referenceAt: referenceInstant(referenceDate, referenceTime), reason, confirmed: true, pendingReviewed: true };
			await previewLegacyReference(getFirebaseClient(), accounts.scope, bank.id, candidate);
			if (currentIdentity.current === owner) setPreview(candidate);
		} catch (problem) { if (currentIdentity.current === owner) setError(errorMessage(problem)); }
		finally { locked.current = false; setBusy(false); }
	}
	async function confirm() {
		if (!available || !writable || !accounts.scope || !bank || !preview || locked.current) return;
		locked.current = true; setBusy(true); setError(null);
		const owner = identity;
		try {
			await prepareLegacyReference(getFirebaseClient(), accounts.scope, bank.id, preview);
			if (currentIdentity.current === owner) { setPreview(null); await accounts.reload(); if (currentIdentity.current === owner) navigateToHomeDashboard(); }
		} catch (problem) { if (currentIdentity.current === owner) { setPreview(null); setError(errorMessage(problem)); } }
		finally { locked.current = false; setBusy(false); }
	}
	return { available: !!available, writable, editing, setEditing, balance, setBalance, referenceDate, setReferenceDate, referenceTime, setReferenceTime, reason, setReason, preview, setPreview, error, busy, simulate, confirm };
}
