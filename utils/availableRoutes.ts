import type { RouteVisibilityKey } from '@/contexts/RouteVisibilityContext';
import { financialLedgerAllowsWrites, selectedFinancialProject } from '@/firebase/config';

// A preferência local não habilita módulos cuja reconstrução ainda não terminou.
const availableRoutes: ReadonlySet<RouteVisibilityKey> = new Set([
	'homeDashboard', 'addRegisterBank', 'addRegisterTag', 'addRegisterGain', 'addRegisterExpenses', 'bankMovements', 'profile',
]);

export function isRebuiltRoute(key: RouteVisibilityKey): boolean {
	if (key === 'transferScreen' || key === 'addRescue' || key === 'addMandatoryGains' || key === 'addMandatoryExpenses') {
		return financialLedgerAllowsWrites(selectedFinancialProject());
	}
	return availableRoutes.has(key);
}
