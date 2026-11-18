import { useMovementBanks } from './useMovementOptions';

export function useRescueFormData(accountId: string | null) {
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
		currentBankBalanceInCents: writable.find(bank => bank.id === accountId)?.balanceInCents ?? null,
		isLoadingBankBalance: active.loading && !!accountId,
		needsBank: active.loaded && !active.loading && !hasMore && !banks.length,
	};
}
