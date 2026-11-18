import { useMovementBanks } from './useMovementOptions';

export function useTransferFormData(originId: string | null, destinationId: string | null) {
	const { accounts, banks, writable } = useMovementBanks();
	const { active } = accounts;
	const error = accounts.scopeError || active.error;
	const hasMore = !!(active.nextNew || active.nextLegacy || active.nextBound);
	return {
		personId: accounts.scope?.uid ?? null,
		banks,
		isLoadingBanks: active.loading,
		banksError: error,
		error,
		reload: accounts.reload,
		hasMore,
		loadMore: () => accounts.load('active', true),
		originBalanceInCents: writable.find(bank => bank.id === originId)?.balanceInCents ?? null,
		isLoadingBalance: active.loading && !!originId,
		targetBalanceInCents: writable.find(bank => bank.id === destinationId)?.balanceInCents ?? null,
		isLoadingTargetBalance: active.loading && !!destinationId,
		needsBanks: active.loaded && !active.loading && !hasMore && banks.length < 2,
	};
}
