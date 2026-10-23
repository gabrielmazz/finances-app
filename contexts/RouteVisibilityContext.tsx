import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { POST_SUBMIT_SCREEN_OPTIONS, type PostSubmitScreenKey } from '@/contexts/PostSubmitBehaviorContext';

export type RouteVisibilityKey = PostSubmitScreenKey | 'lumusAssistant' | 'annotations'
	| 'homeDashboard' | 'bankMovements' | 'categoryAnalysis' | 'financialForecast' | 'bankBalanceAdjustment' | 'profile';

export type RouteVisibilityByKey = Record<RouteVisibilityKey, boolean>;

type RouteVisibilityContextValue = {
	isRouteVisible: (routeKey: RouteVisibilityKey) => boolean;
	setRouteVisibility: (routeKey: RouteVisibilityKey, isVisible: boolean) => void;
	hideAllRoutes: () => void;
	isLoadingRouteVisibility: boolean;
};

// [[Visibilidade de Rotas]]: nova etapa começa fechada; a preferência anterior fica preservada.
const STORAGE_KEY = '@finances/route-visibility:screen-validation-v1';
const RELEASES_STORAGE_KEY = '@finances/route-visibility:screen-validation-applied-v1';
// Uma revisão por avanço: habilita a tela uma vez, preservando escolhas posteriores do usuário.
const SCREEN_VALIDATION_RELEASES: { id: string; routes: RouteVisibilityKey[] }[] = [
  { id: 'gains-expenses-2026-10-23', routes: ['addRegisterGain', 'addRegisterExpenses'] },
  { id: 'statement-dashboard-2026-10-23', routes: ['bankMovements', 'homeDashboard'] },
  { id: 'transfer-2026-10-23', routes: ['transferScreen'] },
  { id: 'withdrawal-2026-10-23', routes: ['addRescue'] },
];
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
			[routeKey]: false,
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

export function applyScreenValidationReleases(value: unknown, applied: unknown) {
  const visibility = normalizeRouteVisibility(value);
  const appliedIds = Array.isArray(applied) ? applied.filter((id): id is string => typeof id === 'string') : [];
  const pending = SCREEN_VALIDATION_RELEASES.filter(release => !appliedIds.includes(release.id));
  for (const release of pending) for (const route of release.routes) visibility[route] = true;
  return { visibility, appliedIds: [...new Set([...appliedIds, ...pending.map(release => release.id)])], changed: pending.length > 0 };
}

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
				const [storedValue, storedReleases] = await Promise.all([
					AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(RELEASES_STORAGE_KEY),
				]);

				if (!isMounted) {
					return;
				}

				let appliedReleases: unknown = null;
				try { appliedReleases = storedReleases ? JSON.parse(storedReleases) : null; }
				catch (error) { console.error('Erro ao carregar as liberações de telas:', error); }
				const next = applyScreenValidationReleases(storedValue ? JSON.parse(storedValue) : null, appliedReleases);
				setVisibilityByRoute(next.visibility);
				if (next.changed) {
					// Persistir escolhas antes do marcador permite recuperar uma gravação interrompida.
					try {
						await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next.visibility));
						await AsyncStorage.setItem(RELEASES_STORAGE_KEY, JSON.stringify(next.appliedIds));
					} catch (error) { console.error('Erro ao salvar a liberação das telas:', error); }
				}
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
		const nextVisibility = createDefaultRouteVisibility();
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
