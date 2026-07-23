import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
	POST_SUBMIT_SCREEN_OPTIONS,
	type PostSubmitScreenKey,
} from '@/contexts/PostSubmitBehaviorContext';

export type RouteVisibilityKey = PostSubmitScreenKey | 'lumusAssistant';

export type RouteVisibilityByKey = Record<RouteVisibilityKey, boolean>;

type RouteVisibilityContextValue = {
	isRouteVisible: (routeKey: RouteVisibilityKey) => boolean;
	setRouteVisibility: (routeKey: RouteVisibilityKey, isVisible: boolean) => void;
	isLoadingRouteVisibility: boolean;
};

const STORAGE_KEY = '@finances/route-visibility';
const routeVisibilityKeys: RouteVisibilityKey[] = [
	...POST_SUBMIT_SCREEN_OPTIONS.map(item => item.key),
	'lumusAssistant',
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
			[routeKey]:
				typeof rawVisibility[routeKey] === 'boolean'
					? rawVisibility[routeKey]
					: fallbackVisibility[routeKey],
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

				if (!isMounted) {
					return;
				}

				setVisibilityByRoute(normalizeRouteVisibility(storedValue ? JSON.parse(storedValue) : null));
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
		(routeKey: RouteVisibilityKey) => visibilityByRoute[routeKey] !== false,
		[visibilityByRoute],
	);

	const setRouteVisibility = React.useCallback(
		(routeKey: RouteVisibilityKey, isVisible: boolean) => {
			setVisibilityByRoute(currentVisibility => {
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

	const contextValue = React.useMemo<RouteVisibilityContextValue>(
		() => ({
			isRouteVisible,
			setRouteVisibility,
			isLoadingRouteVisibility,
		}),
		[isLoadingRouteVisibility, isRouteVisible, setRouteVisibility],
	);

	return (
		<RouteVisibilityContext.Provider value={contextValue}>
			{children}
		</RouteVisibilityContext.Provider>
	);
};

export const useRouteVisibility = () => {
	const context = React.useContext(RouteVisibilityContext);

	if (!context) {
		throw new Error('useRouteVisibility deve ser utilizado dentro de um RouteVisibilityProvider.');
	}

	return context;
};
