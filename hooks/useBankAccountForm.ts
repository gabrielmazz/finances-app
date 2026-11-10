import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { getFirebaseClient } from '../firebase/client';
import { createBank, readBank, updateBank } from '../firebase/banks';
import { beginAnotherBank, pendingBankIntent } from '../application/bankIntents';
import { errorMessage } from '../application/errors';
import type { AccountType, BankAccount, BankRef } from '../domain/banks';
import { useBankAccounts } from '../contexts/BankAccountsContext';
import { useSession } from './useSession';
import { usePostSubmitBehavior } from './usePostSubmitBehavior';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const todayBR = () => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export function useBankAccountForm() {
	const params = useLocalSearchParams<{ bankId?: string; bankSource?: string }>();
	const id = first(params.bankId) || null,
		source = first(params.bankSource) || 'legacy';
	const ref = React.useMemo<BankRef | null>(
		() => (id ? { id, source: source as BankRef['source'] } : null),
		[id, source],
	);
	const accounts = useBankAccounts(),
		session = useSession(),
		applyPostSubmit = usePostSubmitBehavior('addRegisterBank');
	const scope = accounts.scope,
		identity = scope ? `${scope.uid}:${scope.kind}:${scope.id}:${source}:${id || 'create'}` : null;
	const latestIdentity = React.useRef(identity);
	latestIdentity.current = identity;
	const owner = React.useRef<string | null>(null),
		operation = React.useRef<string | null>(null),
		pending = React.useRef(false);
	const [nameBank, setNameBank] = React.useState(''),
		[selectedColor, setSelectedColor] = React.useState<string | null>(null),
		[selectedBankIconKey, setSelectedBankIconKey] = React.useState('outro-banco');
	const [institutionName, setInstitutionName] = React.useState(''),
		[accountType, setAccountType] = React.useState<AccountType | 'unknown'>('checking'),
		[openingDate, setOpeningDate] = React.useState(todayBR);
	const [openingBalanceInCents, setOpeningBalanceInCents] = React.useState(0),
		[overdraftReason, setOverdraftReason] = React.useState('');
	const [loaded, setLoaded] = React.useState<BankAccount | null>(null),
		[saved, setSaved] = React.useState<BankAccount | null>(null);
	const [isLoadingBank, setLoading] = React.useState(false),
		[isSubmitting, setSubmitting] = React.useState(false),
		[error, setError] = React.useState<string | null>(null),
		[loadError, setLoadError] = React.useState<string | null>(null),
		[nameValidationError, setNameValidationError] = React.useState<string | null>(null);
	const canWrite =
		!!scope &&
		(scope.kind === 'personal' || (session.context?.kind === 'group' && session.context.role === 'admin'));
	function fill(bank: BankAccount) {
		setNameBank(bank.name);
		setSelectedColor(bank.colorHex);
		setSelectedBankIconKey(bank.institutionKey);
		setInstitutionName(bank.institutionName);
		setAccountType(bank.accountType);
		if (bank.balanceInCents !== null) setOpeningBalanceInCents(bank.balanceInCents);
		if (bank.openingDate) setOpeningDate(bank.openingDate.split('-').reverse().join('/'));
	}
	function reset() {
		setNameBank('');
		setSelectedColor(null);
		setSelectedBankIconKey('outro-banco');
		setInstitutionName('');
		setAccountType('checking');
		setOpeningBalanceInCents(0);
		setOpeningDate(todayBR());
		setOverdraftReason('');
		setError(null);
		setNameValidationError(null);
	}
	const retryBankLoad = React.useCallback(async () => {
		if (!scope || !identity) return;
		const key = identity;
		setLoading(true);
		setLoadError(null);
		try {
			const client = getFirebaseClient();
			if (ref) {
				const bank = await readBank(client, scope, ref);
				if (latestIdentity.current !== key) return;
				setLoaded(bank);
				fill(bank);
			} else {
				const operationId = await pendingBankIntent(client, scope);
				if (latestIdentity.current !== key) return;
				operation.current = operationId;
				try {
					const bank = await readBank(client, scope, { id: operationId, source: 'new' });
					if (latestIdentity.current !== key) return;
					setSaved(bank);
					fill(bank);
				} catch (reason) {
					if (!(reason instanceof Error && reason.message === 'banks/not-found')) throw reason;
				}
			}
		} catch (reason) {
			if (latestIdentity.current === key) setLoadError(errorMessage(reason));
		} finally {
			if (latestIdentity.current === key) setLoading(false);
		}
	}, [identity]);
	React.useEffect(() => {
		if (owner.current === identity) return;
		owner.current = identity;
		operation.current = null;
		setLoaded(null);
		setSaved(null);
		setSubmitting(false);
		setLoadError(null);
		reset();
		if (identity) void retryBankLoad();
	}, [identity, retryBankLoad]);
	React.useEffect(() => {
		if (
			ref &&
			saved &&
			(nameBank !== saved.name ||
				selectedBankIconKey !== saved.institutionKey ||
				institutionName !== saved.institutionName ||
				accountType !== saved.accountType ||
				selectedColor !== saved.colorHex)
		)
			setSaved(null);
	}, [ref, saved, nameBank, selectedBankIconKey, institutionName, accountType, selectedColor]);
	const submit = async () => {
		if (pending.current || !scope || !canWrite || (!ref && saved)) return;
		const key = identity;
		pending.current = true;
		setSubmitting(true);
		setError(null);
		setNameValidationError(null);
		try {
			const metadata = {
				name: nameBank,
				institutionKey: selectedBankIconKey,
				institutionName,
				accountType: accountType as AccountType,
				colorHex: selectedColor,
			};
			let bank: BankAccount;
			if (ref) {
				if (!loaded) throw Error('banks/not-found');
				bank = await updateBank(getFirebaseClient(), scope, ref, loaded.revision, metadata);
			} else {
				const match = openingDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
				if (!match) throw Error('banks/invalid-date');
				if (!operation.current) throw Error('banks/invalid-operation');
				bank = await createBank(getFirebaseClient(), scope, operation.current, {
					...metadata,
					initialBalanceCents: openingBalanceInCents,
					openingDate: `${match[3]}-${match[2]}-${match[1]}`,
					reason: overdraftReason,
				});
			}
			if (latestIdentity.current !== key) return;
			setLoaded(bank);
			setSaved(bank);
			await accounts.reload();
			if (latestIdentity.current === key) applyPostSubmit({ isEditing: !!ref });
		} catch (reason) {
			if (latestIdentity.current === key) {
				const text = errorMessage(reason);
				setError(text);
				if (reason instanceof Error && reason.message === 'banks/invalid-name') setNameValidationError(text);
			}
		} finally {
			pending.current = false;
			if (latestIdentity.current === key) setSubmitting(false);
		}
	};
	const startAnother = async () => {
		if (!scope || !saved || pending.current) return;
		const key = identity;
		pending.current = true;
		setSubmitting(true);
		try {
			const next = await beginAnotherBank(getFirebaseClient(), scope, saved.id);
			if (latestIdentity.current !== key) return;
			operation.current = next;
			setSaved(null);
			setLoaded(null);
			reset();
			await retryBankLoad();
		} catch (reason) {
			if (latestIdentity.current === key) setError(errorMessage(reason));
		} finally {
			pending.current = false;
			if (latestIdentity.current === key) setSubmitting(false);
		}
	};
	const isCurrent = owner.current === identity;
	return {
		nameBank: isCurrent ? nameBank : '',
		setNameBank,
		selectedColor: isCurrent ? selectedColor : null,
		setSelectedColor,
		selectedBankIconKey: isCurrent ? selectedBankIconKey : 'outro-banco',
		setSelectedBankIconKey,
		institutionName: isCurrent ? institutionName : '',
		setInstitutionName,
		accountType: isCurrent ? accountType : ('checking' as AccountType),
		setAccountType,
		openingDate: isCurrent ? openingDate : todayBR(),
		setOpeningDate,
		openingBalanceInCents: isCurrent ? openingBalanceInCents : 0,
		setOpeningBalanceInCents,
		overdraftReason: isCurrent ? overdraftReason : '',
		setOverdraftReason,
		isLoadingBank: isLoadingBank || !isCurrent || !scope,
		isSubmitting,
		nameValidationError: isCurrent ? nameValidationError : null,
		setNameValidationError,
		bankLoadError: accounts.scopeError || loadError,
		loadedBankId: isCurrent ? (loaded?.id ?? null) : null,
		editingBankId: id,
		isEditing: !!ref,
		retryBankLoad,
		registerBank: submit,
		error: isCurrent ? error : null,
		saved: isCurrent ? saved : null,
		startAnother,
		canWrite,
	};
}
