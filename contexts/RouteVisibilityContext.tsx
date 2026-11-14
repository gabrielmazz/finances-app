import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

import { POST_SUBMIT_SCREEN_OPTIONS,type PostSubmitScreenKey } from '@/contexts/PostSubmitBehaviorContext';
import { isRebuiltRoute } from '@/utils/availableRoutes';

export type RouteVisibilityKey = PostSubmitScreenKey | 'lumusAssistant' | 'annotations'
	| 'homeDashboard' | 'bankMovements' | 'categoryAnalysis' | 'financialForecast' | 'bankBalanceAdjustment' | 'profile';

export type RouteVisibilityByKey = Record<RouteVisibilityKey, boolean>;

type RouteVisibilityContextValue = {
	isRouteVisible: (routeKey: RouteVisibilityKey) => boolean;
	setRouteVisibility: (routeKey: RouteVisibilityKey, isVisible: boolean) => void;
	hideAllRoutes: () => void;
	isLoadingRouteVisibility: boolean;
};

// Preferências da etapa visual não sobrescrevem a configuração anterior.
const STORAGE_KEY = '@finances/route-visibility:frontend-v1';
const routeVisibilityKeys: RouteVisibilityKey[] = [
	...POST_SUBMIT_SCREEN_OPTIONS.map((item) => item.key),
	'lumusAssistant',
	'annotations',
	'homeDashboard',
	'bankMovements',
	'categoryAnalysis',
	'financialForecast',
	'bankBalanceAdjustment',
	'profile',
];

const createDefaultRouteVisibility = (): RouteVisibilityByKey =>
	routeVisibilityKeys.reduce(
		(visibilityByKey, routeKey) => ({
			...visibilityByKey,
			[routeKey]: true,
		}),
		{} as RouteVisibilityByKey,
	);

export const normalizeRouteVisibility = (value: unknown): RouteVisibilityByKey => {
	const fallbackVisibility = createDefaultRouteVisibility();

	if (!value || typeof value !== 'object') {
		return fallbackVisibility;
	}

	const rawVisibility = value as Partial<Record<RouteVisibilityKey, unknown>>;

	return routeVisibilityKeys.reduce(
		(visibilityByKey, routeKey) => ({
			...visibilityByKey,
			[routeKey]: typeof rawVisibility[routeKey] === 'boolean' ? rawVisibility[routeKey] : fallbackVisibility[routeKey],
		}),
		{} as RouteVisibilityByKey,
	);
};

const RouteVisibilityContext = React.createContext<RouteVisibilityContextValue | undefined>(undefined);

export const RouteVisibilityProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
	const [visibilityByRoute, setVisibilityByRoute] = React.useState(createDefaultRouteVisibility);
	const [isLoadingRouteVisibility, setIsLoadingRouteVisibility] = React.useState(true);

	const persistRouteVisibility = React.useCallback(async (nextVisibilityByRoute: RouteVisibilityByKey) => {
		try {
			await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextVisibilityByRoute));
		} catch (error) {
			console.error('Erro ao salvar a visibilidade das telas:', error);
		}
	}, []);

	React.useEffect(() => {
		let isMounted = true;

		const loadRouteVisibility = async () => {
			try {
                const storedValue = await AsyncStorage.getItem(STORAGE_KEY);
                if (isMounted) setVisibilityByRoute(normalizeRouteVisibility(storedValue ? JSON.parse(storedValue) : null));
			} catch (error) {
				console.error('Erro ao carregar a visibilidade das telas:', error);
				if (isMounted) {
					setVisibilityByRoute(createDefaultRouteVisibility());
				}
			} finally {
				if (isMounted) {
					setIsLoadingRouteVisibility(false);
				}
			}
		};

		void loadRouteVisibility();

		return () => {
			isMounted = false;
		};
	}, []);

	const isRouteVisible = React.useCallback(
		(routeKey: RouteVisibilityKey) => isRebuiltRoute(routeKey) && visibilityByRoute[routeKey] !== false,
		[visibilityByRoute],
	);

	const setRouteVisibility = React.useCallback(
		(routeKey: RouteVisibilityKey, isVisible: boolean) => {
			setVisibilityByRoute((currentVisibility) => {
				const nextVisibility = {
					...currentVisibility,
					[routeKey]: isVisible,
				};

				void persistRouteVisibility(nextVisibility);
				return nextVisibility;
			});
		},
		[persistRouteVisibility],
	);

	const hideAllRoutes = React.useCallback(() => {
		const nextVisibility = Object.fromEntries(routeVisibilityKeys.map(key => [key, false])) as RouteVisibilityByKey;
		setVisibilityByRoute(nextVisibility);
		void persistRouteVisibility(nextVisibility);
	}, [persistRouteVisibility]);

	const contextValue = React.useMemo<RouteVisibilityContextValue>(
		() => ({
			isRouteVisible,
			setRouteVisibility,
			hideAllRoutes,
			isLoadingRouteVisibility,
		}),
		[hideAllRoutes, isLoadingRouteVisibility, isRouteVisible, setRouteVisibility],
	);

	return <RouteVisibilityContext.Provider value={contextValue}>{children}</RouteVisibilityContext.Provider>;
};

export const useRouteVisibility = () => {
	const context = React.useContext(RouteVisibilityContext);

	if (!context) {
		throw new Error('useRouteVisibility deve ser utilizado dentro de um RouteVisibilityProvider.');
	}

	return context;
};
