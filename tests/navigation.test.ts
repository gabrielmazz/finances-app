type RouterMock = {
	push: jest.Mock;
	dismissTo: jest.Mock;
	dismissAll: jest.Mock;
	replace: jest.Mock;
	canGoBack: jest.Mock;
	back: jest.Mock;
};

let nextFrameId = 1;
let pendingFrames = new Map<number, (timestamp: number) => void>();

const flushAnimationFrames = () => {
	const frames = [...pendingFrames.values()];
	pendingFrames.clear();
	frames.forEach(callback => callback(Date.now()));
};

const loadNavigationModule = (routerOverrides: Partial<RouterMock> = {}) => {
	jest.resetModules();

	const router: RouterMock = {
		push: jest.fn(),
		dismissTo: jest.fn(),
		dismissAll: jest.fn(),
		replace: jest.fn(),
		canGoBack: jest.fn(() => false),
		back: jest.fn(),
		...routerOverrides,
	};

	jest.doMock('expo-router', () => ({
		__esModule: true,
		router,
	}));

	return {
		router,
		Keyboard: require('react-native').Keyboard,
		navigation: require('@/utils/navigation'),
	};
};

describe('navigation helpers', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		nextFrameId = 1;
		pendingFrames = new Map();
		Object.defineProperty(globalThis, 'requestAnimationFrame', {
			configurable: true,
			writable: true,
			value: jest.fn((callback: (timestamp: number) => void) => {
				const frameId = nextFrameId;
				nextFrameId += 1;
				pendingFrames.set(frameId, callback);
				return frameId;
			}),
		});
		Object.defineProperty(globalThis, 'cancelAnimationFrame', {
			configurable: true,
			writable: true,
			value: jest.fn((frameId: number) => {
				pendingFrames.delete(frameId);
			}),
		});
	});

	afterEach(() => {
		jest.dontMock('expo-router');
		delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
		delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
	});

	it('replaces the current route when Home is selected manually', () => {
		const { Keyboard, navigation, router } = loadNavigationModule();

		navigation.navigateToHomeDashboard();

		expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
		expect(router.replace).toHaveBeenCalledWith({
			pathname: '/home',
			params: { tab: '0' },
		});
		expect(router.dismissTo).not.toHaveBeenCalled();
		expect(router.dismissAll).not.toHaveBeenCalled();
	});

	it('defers an automatic redirect until the next frame and dispatches one replace', () => {
		const { Keyboard, navigation, router } = loadNavigationModule();

		navigation.redirectToHomeDashboard();

		expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
		expect(router.replace).not.toHaveBeenCalled();

		flushAnimationFrames();

		expect(router.replace).toHaveBeenCalledTimes(1);
		expect(router.replace).toHaveBeenCalledWith({
			pathname: '/home',
			params: { tab: '0' },
		});
		expect(router.dismissTo).not.toHaveBeenCalled();
		expect(router.dismissAll).not.toHaveBeenCalled();
	});

	it('keeps only the most recent automatic redirect scheduled in the same frame', () => {
		const { navigation, router } = loadNavigationModule();

		navigation.redirectToRoute(navigation.APP_ROUTE_PATHS.addRegisterExpenses);
		navigation.redirectToRoute(navigation.APP_ROUTE_PATHS.addRegisterGain);
		flushAnimationFrames();

		expect(router.replace).toHaveBeenCalledTimes(1);
		expect(router.replace).toHaveBeenCalledWith({
			pathname: '/add-register-gain',
		});
	});

	it('cancels a pending redirect when the user starts a manual navigation', () => {
		const { navigation, router } = loadNavigationModule();

		navigation.redirectToHomeDashboard();
		navigation.navigateToRoute(navigation.APP_ROUTE_PATHS.categoryAnalysis);
		flushAnimationFrames();

		expect(router.push).toHaveBeenCalledTimes(1);
		expect(router.push).toHaveBeenCalledWith({
			pathname: '/category-analysis',
		});
		expect(router.replace).not.toHaveBeenCalled();
	});

	it('passes the focused mandatory expense to the mandatory expenses list', () => {
		const { navigation, router } = loadNavigationModule();

		navigation.navigateToRoute(navigation.APP_ROUTE_PATHS.mandatoryExpenses, {
			focusMandatoryExpenseId: 'rent',
		});

		expect(router.push).toHaveBeenCalledWith({
			pathname: '/mandatory-expenses',
			params: { focusMandatoryExpenseId: 'rent' },
		});
	});

	it('maps each configurable route to its local visibility preference', () => {
		const { navigation } = loadNavigationModule();

		expect(
			navigation.getRouteVisibilityKeyForPath(navigation.APP_ROUTE_PATHS.lumusAssistant),
		).toBe('lumusAssistant');
		expect(
			navigation.getRouteVisibilityKeyForPath(navigation.APP_ROUTE_PATHS.mandatoryExpenses),
		).toBe('addMandatoryExpenses');
		expect(
			navigation.getRouteVisibilityKeyForPath(navigation.APP_ROUTE_PATHS.home),
		).toBeNull();
	});

	it('logs a synchronous replace failure without dispatching a destructive fallback action', () => {
		const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		const { navigation, router } = loadNavigationModule({
			replace: jest.fn(() => {
				throw new Error('Navigation state unavailable');
			}),
		});

		try {
			navigation.navigateToHomeDashboard();

			expect(router.replace).toHaveBeenCalledTimes(1);
			expect(router.dismissTo).not.toHaveBeenCalled();
			expect(router.dismissAll).not.toHaveBeenCalled();
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		} finally {
			consoleErrorSpy.mockRestore();
		}
	});

	it('preserves native back behavior when history exists', () => {
		const { navigation, router } = loadNavigationModule({
			canGoBack: jest.fn(() => true),
		});

		navigation.navigateBackOrHomeDashboard();

		expect(router.back).toHaveBeenCalledTimes(1);
		expect(router.dismissTo).not.toHaveBeenCalled();
		expect(router.replace).not.toHaveBeenCalled();
	});

	it('defers the automatic inline return until form cleanup has completed', () => {
		const { navigation, router } = loadNavigationModule({
			canGoBack: jest.fn(() => true),
		});

		navigation.redirectBackOrRoute(navigation.APP_ROUTE_PATHS.addRegisterExpenses);

		expect(router.back).not.toHaveBeenCalled();
		flushAnimationFrames();

		expect(router.back).toHaveBeenCalledTimes(1);
		expect(router.replace).not.toHaveBeenCalled();
	});

	it('keeps the protected-route registry aligned with every flat route file', () => {
		const { readdirSync } = require('node:fs');
		const { join } = require('node:path');
		const { navigation } = loadNavigationModule();
		const registeredPaths = Object.values(navigation.APP_ROUTE_PATHS).sort();
		const filePaths = readdirSync(join(process.cwd(), 'app'))
			.filter((fileName: string) => fileName.endsWith('.tsx') && fileName !== '_layout.tsx')
			.map((fileName: string) => {
				const routeName = fileName.slice(0, -4);
				return routeName === 'index' ? '/' : `/${routeName}`;
			})
			.sort();

		expect(registeredPaths).toEqual(filePaths);
	});
});
