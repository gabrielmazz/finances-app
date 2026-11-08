export function useBankMovementsRequest(_scope: string) {
	return { personId: null as string | null, beginRequest: () => () => false, cancelRequest: () => {} };
}
