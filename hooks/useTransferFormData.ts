import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import type { BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
export function useTransferFormData(..._selection: (string | null)[]) {
	return {
		personId: null as string | null,
		banks: [] as BankActionsheetOption[],
		isLoadingBanks: false,
		banksError: FEATURE_UNAVAILABLE_MESSAGE,
		error: FEATURE_UNAVAILABLE_MESSAGE,
		reload: showFeatureUnavailable,
		originBalanceInCents: null as number | null,
		isLoadingBalance: false,
		targetBalanceInCents: null as number | null,
		isLoadingTargetBalance: false,
		needsBanks: false,
	};
}
