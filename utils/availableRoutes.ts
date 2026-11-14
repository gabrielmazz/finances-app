import type { RouteVisibilityKey } from '@/contexts/RouteVisibilityContext';

// A preferência local não habilita módulos cuja reconstrução ainda não terminou.
const availableRoutes: ReadonlySet<RouteVisibilityKey> = new Set([
	'homeDashboard', 'addRegisterBank', 'addRegisterTag', 'addRegisterGain', 'addRegisterExpenses', 'bankMovements', 'profile',
]);

export function isRebuiltRoute(key: RouteVisibilityKey): boolean {
	return availableRoutes.has(key);
}
