import { Keyboard } from 'react-native';
import { router, type Href, type UnknownInputParams } from 'expo-router';

type RouterNavigationOptions = Parameters<typeof router.push>[1];

export const APP_ROUTE_PATHS = {
	login: '/',
	home: '/home',
	categoryAnalysis: '/category-analysis',
	addRegisterBank: '/add-register-bank',
	addRegisterUser: '/add-register-user',
	addRegisterExpenses: '/add-register-expenses',
	addRegisterGain: '/add-register-gain',
	addRegisterTag: '/add-register-tag',
	addMandatoryExpenses: '/add-mandatory-expenses',
	addMandatoryGains: '/add-mandatory-gains',
	addFinance: '/add-finance',
	addRescue: '/add-rescue',
	addUserRelation: '/add-user-relation',
	appTests: '/app-tests',
	screenSettings: '/screen-settings',
	registerMonthlyBalance: '/register-monthly-balance',
	bankMovements: '/bank-movements',
	bankSummary: '/bank-summary',
	financialList: '/financial-list',
	mandatoryExpenses: '/mandatory-expenses',
	mandatoryGains: '/mandatory-gains',
	transferScreen: '/transfer-screen',
} as const;

export type AppRouteKey = keyof typeof APP_ROUTE_PATHS;
export type AppRoutePath = (typeof APP_ROUTE_PATHS)[AppRouteKey];

export const HOME_TAB_INDEX = {
	dashboard: 0,
	control: 1,
	config: 2,
} as const;

export type HomeTabKey = keyof typeof HOME_TAB_INDEX;
export type HomeTabIndex = (typeof HOME_TAB_INDEX)[HomeTabKey];

export type NavigationParams = UnknownInputParams;

const APP_ROUTE_VALUES = Object.values(APP_ROUTE_PATHS) as AppRoutePath[];
const HOME_TAB_VALUES = Object.values(HOME_TAB_INDEX) as number[];

export const isAppRoutePath = (value: unknown): value is AppRoutePath =>
	typeof value === 'string' && APP_ROUTE_VALUES.includes(value as AppRoutePath);

export const normalizeHomeTabIndex = (
	value?: HomeTabIndex | number | string | string[] | null,
	fallback: HomeTabIndex = HOME_TAB_INDEX.dashboard,
): HomeTabIndex => {
	const firstValue = Array.isArray(value) ? value[0] : value;
	const parsedValue =
		typeof firstValue === 'number' ? firstValue : Number(firstValue);

	if (!Number.isFinite(parsedValue)) {
		return fallback;
	}

	const normalizedValue = Math.trunc(parsedValue);
	return HOME_TAB_VALUES.includes(normalizedValue)
		? (normalizedValue as HomeTabIndex)
		: fallback;
};

const compactParams = (params?: NavigationParams) => {
	if (!params) {
		return undefined;
	}

	const compactedEntries = Object.entries(params).flatMap(([key, value]) => {
		if (value === undefined || value === null) {
			return [];
		}

		if (Array.isArray(value)) {
			const normalizedArray = value.filter(
				item => item !== undefined && item !== null,
			);
			return normalizedArray.length > 0 ? [[key, normalizedArray]] : [];
		}

		return [[key, value]];
	});

	if (compactedEntries.length === 0) {
		return undefined;
	}

	return Object.fromEntries(compactedEntries) as UnknownInputParams;
};

export const createAppHref = (
	pathname: AppRoutePath,
	params?: NavigationParams,
): Href => {
	const compactedParams = compactParams(params);

	return {
		pathname,
		...(compactedParams ? { params: compactedParams } : {}),
	};
};

export const createHomeHref = (
	tab: HomeTabIndex | number | string | string[] | null = HOME_TAB_INDEX.dashboard,
): Href =>
	createAppHref(APP_ROUTE_PATHS.home, {
		tab: String(normalizeHomeTabIndex(tab)),
	});

export const HOME_DASHBOARD_ROUTE = createHomeHref(HOME_TAB_INDEX.dashboard);

const logNavigationError = (action: string, href: Href, error: unknown) => {
	console.error(`[navigation] Falha ao executar ${action}`, {
		href,
		error,
	});
};

const replaceWithFallback = (href: Href, options?: RouterNavigationOptions) => {
	try {
		router.replace(href, options);
	} catch (error) {
		logNavigationError('replace', href, error);
	}
};

const dismissToOrReplace = (href: Href, options?: RouterNavigationOptions) => {
	try {
		router.dismissTo(href, options);
	} catch (error) {
		logNavigationError('dismissTo', href, error);
		replaceWithFallback(href, options);
	}
};

export const navigateToRoute = (
	pathname: AppRoutePath,
	params?: NavigationParams,
	options?: RouterNavigationOptions,
) => {
	Keyboard.dismiss();
	router.push(createAppHref(pathname, params), options);
};

export const replaceToRoute = (
	pathname: AppRoutePath,
	params?: NavigationParams,
	options?: RouterNavigationOptions,
) => {
	Keyboard.dismiss();
	replaceWithFallback(createAppHref(pathname, params), options);
};

export const dismissToRoute = (
	pathname: AppRoutePath,
	params?: NavigationParams,
	options?: RouterNavigationOptions,
) => {
	Keyboard.dismiss();
	dismissToOrReplace(createAppHref(pathname, params), options);
};

export const navigateToHomeTab = (
	tab: HomeTabIndex | number | string | string[] | null = HOME_TAB_INDEX.dashboard,
) => {
	Keyboard.dismiss();
	// Fluxo documentado em Arquitetura/Navegação.md: submits usam uma única ação POP_TO/REPLACE para evitar pilhas obsoletas em produção.
	dismissToOrReplace(createHomeHref(tab), { withAnchor: true });
};

export const navigateToHomeDashboard = () => {
	navigateToHomeTab(HOME_TAB_INDEX.dashboard);
};

export const navigateToHomeConfigurations = () => {
	navigateToHomeTab(HOME_TAB_INDEX.config);
};

export const navigateBackOrRoute = (
	fallbackPathname: AppRoutePath = APP_ROUTE_PATHS.home,
	fallbackParams?: NavigationParams,
) => {
	Keyboard.dismiss();
	const resolvedFallbackParams =
		fallbackParams ??
		(fallbackPathname === APP_ROUTE_PATHS.home
			? { tab: String(HOME_TAB_INDEX.dashboard) }
			: undefined);
	const fallbackHref = createAppHref(fallbackPathname, resolvedFallbackParams);

	try {
		if (router.canGoBack()) {
			router.back();
			return;
		}
	} catch (error) {
		logNavigationError('canGoBack', fallbackHref, error);
	}

	replaceWithFallback(fallbackHref, { withAnchor: true });
};

export const navigateBackOrHomeDashboard = () => {
	navigateBackOrRoute();
};
