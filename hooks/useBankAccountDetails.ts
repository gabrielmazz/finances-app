import React from 'react';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { useBankAccounts } from '../contexts/BankAccountsContext';
import { useSession } from './useSession';
import { getFirebaseClient } from '../firebase/client';
import { archiveBank, readBank } from '../firebase/banks';
import { errorMessage } from '../application/errors';
import type { BankAccount, BankRef } from '../domain/banks';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
export function useBankAccountDetails() {
	const params = useLocalSearchParams<{ bankId?: string; bankSource?: string; cashView?: string }>();
	const accounts = useBankAccounts(),
		session = useSession(),
		focused = useIsFocused();
	const id = first(params.bankId),
		source = first(params.bankSource) || 'legacy',
		cash = first(params.cashView) === 'true';
	const [bank, setBank] = React.useState<BankAccount | null>(null),
		[loading, setLoading] = React.useState(false),
		[error, setError] = React.useState<string | null>(null),
		[confirm, setConfirm] = React.useState(false),
		[busy, setBusy] = React.useState(false);
	const identity =
		accounts.scope && id && !cash
			? `${accounts.scope.uid}:${accounts.scope.kind}:${accounts.scope.id}:${source}:${id}`
			: null;
	const owner = React.useRef(identity);
	owner.current = identity;
	const [dataOwner, setDataOwner] = React.useState<string | null>(null);
	const reload = React.useCallback(async () => {
		if (!identity || !id || !accounts.scope) return;
		const key = identity;
		setLoading(true);
		setError(null);
		try {
			const result = await readBank(getFirebaseClient(), accounts.scope, {
				id,
				source: source as BankRef['source'],
			});
			if (owner.current === key) {
				setBank(result);
				setDataOwner(key);
			}
		} catch (reason) {
			if (owner.current === key) {
				setBank(null);
				setError(errorMessage(reason));
			}
		} finally {
			if (owner.current === key) setLoading(false);
		}
	}, [identity]);
	React.useEffect(() => {
		setBank(null);
		setConfirm(false);
		setBusy(false);
		setLoading(false);
		setError(null);
		if (focused) void reload();
	}, [identity, focused, reload]);
	const current = dataOwner === identity ? bank : null;
	const canWrite =
		!!accounts.scope &&
		(accounts.scope.kind === 'personal' ||
			(session.context?.kind === 'group' && session.context.role === 'admin'));
	const archiving = React.useRef(false);
	async function archive() {
		if (!current || !accounts.scope || archiving.current) return;
		const key = identity;
		archiving.current = true;
		setBusy(true);
		setError(null);
		try {
			const result = await archiveBank(getFirebaseClient(), accounts.scope, current, current.revision);
			if (owner.current !== key) return;
			setBank(result);
			setConfirm(false);
			await accounts.reload();
		} catch (reason) {
			if (owner.current === key) setError(errorMessage(reason));
		} finally {
			archiving.current = false;
			if (owner.current === key) setBusy(false);
		}
	}
	return {
		id,
		cash,
		current,
		loading,
		error,
		confirm,
		setConfirm,
		busy,
		scopeError: accounts.scopeError,
		canWrite,
		reload,
		archive,
	};
}
