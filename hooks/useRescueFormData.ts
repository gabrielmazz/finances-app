import { civilDateKey, financialDateKey } from '@/utils/financialCivilDate';
import { useMovementBanks } from './useMovementOptions';

export function useRescueFormData(accountId: string | null, date: Date | null) {
	const { accounts, banks, writable, optionsError: error } = useMovementBanks();
	const { active } = accounts;
	const hasMore = !!(active.nextNew || active.nextLegacy || active.nextBound);
	const bank = writable.find(bank => bank.id === accountId);
	return {
		mayAlreadyBeIncluded: !!(date && bank?.referenceAt && civilDateKey(date) <= financialDateKey(bank.referenceAt)),
		personId: accounts.scope?.uid ?? null,
		banks,
		isLoadingBanks: active.loading,
		banksError: error,
		error,
		reload: accounts.reload,
		hasMore,
		loadMore: () => accounts.load('active', true),
		currentBankBalanceInCents: bank?.balanceInCents ?? null,
		isLoadingBankBalance: active.loading && !!accountId,
		needsBank: accounts.canWrite && active.loaded && !active.loading && !hasMore && !banks.length,
	};
}
