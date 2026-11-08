import type { RouteVisibilityKey } from '@/contexts/RouteVisibilityContext';

import {
	APP_PLATFORM_GROUP,
	APP_PLATFORM_PREFIX,
	APP_ROUTE_PATHS,
	getRouteVisibilityKeyForPath,
	type AppRoutePath,
} from '@/utils/navigation';

export const APP_ROUTE_GUARD_ENTRIES = (['web', 'mobile'] as const).flatMap((group) =>
	Object.values(APP_ROUTE_PATHS).map((pathname) => ({
		name: `${group}${pathname === APP_ROUTE_PATHS.login ? '/index' : pathname.slice(APP_PLATFORM_PREFIX.length)}`,
		pathname,
		isLogin: pathname === APP_ROUTE_PATHS.login,
		isActivePlatform: group === APP_PLATFORM_GROUP,
	})),
);

export function isAppRouteAllowed(
	entry: (typeof APP_ROUTE_GUARD_ENTRIES)[number],
	isRouteVisible: (key: RouteVisibilityKey) => boolean,
	isAuthenticated = false,
): boolean {
	// Expo registra também os arquivos do grupo alternativo; eles não podem ficar implicitamente acessíveis.
	if (!entry.isActivePlatform) return false;
	if (entry.isLogin) return true;
	if (!isAuthenticated) return false;
	const visibilityKey = getRouteVisibilityKeyForPath(entry.pathname as AppRoutePath);
	return !visibilityKey || isRouteVisible(visibilityKey);
}
