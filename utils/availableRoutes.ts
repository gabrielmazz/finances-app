import type { RouteVisibilityKey } from '@/contexts/RouteVisibilityContext';

// A preferência local não habilita módulos cuja reconstrução ainda não terminou.
const availableRoutes: ReadonlySet<RouteVisibilityKey> = new Set([
	'homeDashboard', 'addRegisterBank', 'addRegisterTag', 'addRegisterGain', 'addRegisterExpenses', 'bankMovements', 'profile',
]);

export function isRebuiltRoute(key: RouteVisibilityKey): boolean {
	if (key === 'transferScreen' || key === 'addRescue' || key === 'addMandatoryGains' || key === 'addMandatoryExpenses')
		return process.env.EXPO_PUBLIC_FIREBASE_MODE === 'emulator';
	return availableRoutes.has(key);
}
