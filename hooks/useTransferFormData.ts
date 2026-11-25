import { civilDateKey, financialDateKey } from '@/utils/financialCivilDate';
import { useMovementBanks } from './useMovementOptions';

export function useTransferFormData(originId: string | null, destinationId: string | null, date: Date | null = null) {
	const { accounts, banks, writable, optionsError: error } = useMovementBanks();
	const { active } = accounts;
	const hasMore = !!(active.nextNew || active.nextLegacy || active.nextBound);
	const originAccount = writable.find(bank => bank.id === originId);
	return {
		mayAlreadyBeIncluded: !!(date && originAccount?.referenceAt && civilDateKey(date) <= financialDateKey(originAccount.referenceAt)),
		personId: accounts.scope?.uid ?? null,
		banks,
		isLoadingBanks: active.loading,
		banksError: error,
		error,
		reload: accounts.reload,
		hasMore,
		loadMore: () => accounts.load('active', true),
		originBalanceInCents: originAccount?.balanceInCents ?? null,
		isLoadingBalance: active.loading && !!originId,
		targetBalanceInCents: writable.find(bank => bank.id === destinationId)?.balanceInCents ?? null,
		isLoadingTargetBalance: active.loading && !!destinationId,
		needsBanks: accounts.canWrite && active.loaded && !active.loading && !hasMore && banks.length < 2,
	};
}
