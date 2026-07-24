import { Keyboard } from 'react-native';
import { router, type Href, type UnknownInputParams } from 'expo-router';
import type { RouteVisibilityKey } from '@/contexts/RouteVisibilityContext';
import type { PostSubmitDestinationKey } from '@/contexts/PostSubmitBehaviorContext';

type RouterNavigationOptions = Parameters<typeof router.push>[1];

export const APP_ROUTE_PATHS = {
	login: '/',
	home: '/home',
	lumusAssistant: '/lumus-assistant',
	categoryAnalysis: '/category-analysis',
	financialForecast: '/financial-forecast',
	annotations: '/annotations',
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

export const ROUTE_VISIBILITY_PATHS: Record<RouteVisibilityKey, readonly AppRoutePath[]> = {
	addRegisterExpenses: [APP_ROUTE_PATHS.addRegisterExpenses],
	addRegisterGain: [APP_ROUTE_PATHS.addRegisterGain],
	addMandatoryExpenses: [APP_ROUTE_PATHS.mandatoryExpenses, APP_ROUTE_PATHS.addMandatoryExpenses],
	addMandatoryGains: [APP_ROUTE_PATHS.mandatoryGains, APP_ROUTE_PATHS.addMandatoryGains],
	addFinance: [APP_ROUTE_PATHS.financialList, APP_ROUTE_PATHS.addFinance],
	addRescue: [APP_ROUTE_PATHS.addRescue],
	transferScreen: [APP_ROUTE_PATHS.transferScreen],
	registerMonthlyBalance: [APP_ROUTE_PATHS.registerMonthlyBalance],
	addRegisterBank: [APP_ROUTE_PATHS.addRegisterBank],
	addRegisterTag: [APP_ROUTE_PATHS.addRegisterTag],
	addRegisterUser: [APP_ROUTE_PATHS.addRegisterUser],
	addUserRelation: [APP_ROUTE_PATHS.addUserRelation],
	lumusAssistant: [APP_ROUTE_PATHS.lumusAssistant],
	annotations: [APP_ROUTE_PATHS.annotations],
};

export const getRouteVisibilityKeyForPath = (pathname: AppRoutePath): RouteVisibilityKey | null => {
	for (const [routeKey, routePaths] of Object.entries(ROUTE_VISIBILITY_PATHS) as Array<
		[RouteVisibilityKey, readonly AppRoutePath[]]
	>) {
		if (routePaths.includes(pathname)) {
			return routeKey;
		}
	}

	return null;
};

export const getPostSubmitDestinationPath = (destination: PostSubmitDestinationKey): AppRoutePath | null => {
	switch (destination) {
		case 'homeControl':
			return APP_ROUTE_PATHS.addRegisterExpenses;
		case 'categoryAnalysis':
			return APP_ROUTE_PATHS.categoryAnalysis;
		case 'addRegisterExpenses':
			return APP_ROUTE_PATHS.addRegisterExpenses;
		case 'addRegisterGain':
			return APP_ROUTE_PATHS.addRegisterGain;
		case 'registerMonthlyBalance':
			return APP_ROUTE_PATHS.registerMonthlyBalance;
		case 'transferScreen':
			return APP_ROUTE_PATHS.transferScreen;
		case 'addRescue':
			return APP_ROUTE_PATHS.addRescue;
		case 'mandatoryExpenses':
			return APP_ROUTE_PATHS.mandatoryExpenses;
		case 'mandatoryGains':
			return APP_ROUTE_PATHS.mandatoryGains;
		case 'financialList':
			return APP_ROUTE_PATHS.financialList;
		case 'addRegisterBank':
			return APP_ROUTE_PATHS.addRegisterBank;
		case 'addRegisterTag':
			return APP_ROUTE_PATHS.addRegisterTag;
		case 'addRegisterUser':
			return APP_ROUTE_PATHS.addRegisterUser;
		case 'addUserRelation':
			return APP_ROUTE_PATHS.addUserRelation;
		default:
			return null;
	}
};

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
	const parsedValue = typeof firstValue === 'number' ? firstValue : Number(firstValue);

	if (!Number.isFinite(parsedValue)) {
		return fallback;
	}

	const normalizedValue = Math.trunc(parsedValue);
	return HOME_TAB_VALUES.includes(normalizedValue) ? (normalizedValue as HomeTabIndex) : fallback;
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
			const normalizedArray = value.filter((item) => item !== undefined && item !== null);
			return normalizedArray.length > 0 ? [[key, normalizedArray]] : [];
		}

		return [[key, value]];
	});

	if (compactedEntries.length === 0) {
		return undefined;
	}

	return Object.fromEntries(compactedEntries) as UnknownInputParams;
};

export const createAppHref = (pathname: AppRoutePath, params?: NavigationParams): Href => {
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

let pendingRedirectFrame: number | null = null;

const cancelPendingRedirect = () => {
	if (pendingRedirectFrame === null) {
		return;
	}

	cancelAnimationFrame(pendingRedirectFrame);
	pendingRedirectFrame = null;
};

const replaceSafely = (href: Href, options?: RouterNavigationOptions) => {
	try {
		if (options) {
			router.replace(href, options);
			return;
		}

		router.replace(href);
	} catch (error) {
		logNavigationError('replace', href, error);
	}
};

const scheduleNavigation = (navigationAction: () => void) => {
	cancelPendingRedirect();
	pendingRedirectFrame = requestAnimationFrame(() => {
		pendingRedirectFrame = null;
		navigationAction();
	});
};

const scheduleReplace = (href: Href, options?: RouterNavigationOptions) => {
	scheduleNavigation(() => replaceSafely(href, options));
};

const createBackFallbackHref = (fallbackPathname: AppRoutePath, fallbackParams?: NavigationParams) => {
	const resolvedFallbackParams =
		fallbackParams ??
		(fallbackPathname === APP_ROUTE_PATHS.home ? { tab: String(HOME_TAB_INDEX.dashboard) } : undefined);

	return createAppHref(fallbackPathname, resolvedFallbackParams);
};

export const navigateToRoute = (
	pathname: AppRoutePath,
	params?: NavigationParams,
	options?: RouterNavigationOptions,
) => {
	cancelPendingRedirect();
	Keyboard.dismiss();
	const href = createAppHref(pathname, params);

	try {
		if (options) {
			router.push(href, options);
			return;
		}

		router.push(href);
	} catch (error) {
		logNavigationError('push', href, error);
	}
};

export const replaceToRoute = (
	pathname: AppRoutePath,
	params?: NavigationParams,
	options?: RouterNavigationOptions,
) => {
	cancelPendingRedirect();
	Keyboard.dismiss();
	replaceSafely(createAppHref(pathname, params), options);
};

export const redirectToRoute = (
	pathname: AppRoutePath,
	params?: NavigationParams,
	options?: RouterNavigationOptions,
) => {
	Keyboard.dismiss();
	// [[Navegação]]: o redirect pós-submit espera um frame para o formulário
	// concluir finally/setState antes da única transição REPLACE no NativeStack.
	scheduleReplace(createAppHref(pathname, params), options);
};

export const navigateToHomeTab = (tab: HomeTabIndex | number | string | string[] | null = HOME_TAB_INDEX.dashboard) => {
	cancelPendingRedirect();
	Keyboard.dismiss();
	replaceSafely(createHomeHref(tab));
};

export const redirectToHomeTab = (tab: HomeTabIndex | number | string | string[] | null = HOME_TAB_INDEX.dashboard) => {
	Keyboard.dismiss();
	// POP_TO/dismissTo é deliberadamente proibido neste fluxo: a falha da ação
	// enfileirada é silenciosa em release e pode deixar o NativeStack sem conteúdo.
	scheduleReplace(createHomeHref(tab));
};

export const redirectToHomeDashboard = () => {
	redirectToHomeTab(HOME_TAB_INDEX.dashboard);
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
	cancelPendingRedirect();
	Keyboard.dismiss();
	const fallbackHref = createBackFallbackHref(fallbackPathname, fallbackParams);

	try {
		if (router.canGoBack()) {
			router.back();
			return;
		}
	} catch (error) {
		logNavigationError('canGoBack', fallbackHref, error);
	}

	replaceSafely(fallbackHref);
};

export const redirectBackOrRoute = (
	fallbackPathname: AppRoutePath = APP_ROUTE_PATHS.home,
	fallbackParams?: NavigationParams,
) => {
	Keyboard.dismiss();
	const fallbackHref = createBackFallbackHref(fallbackPathname, fallbackParams);

	scheduleNavigation(() => {
		try {
			if (router.canGoBack()) {
				router.back();
				return;
			}
		} catch (error) {
			logNavigationError('canGoBack', fallbackHref, error);
		}

		replaceSafely(fallbackHref);
	});
};

export const navigateBackOrHomeDashboard = () => {
	navigateBackOrRoute();
};
