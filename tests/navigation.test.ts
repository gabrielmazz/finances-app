type RouterMock = {
	dismissTo: jest.Mock;
	replace: jest.Mock;
	canGoBack: jest.Mock;
	back: jest.Mock;
};

const loadNavigationModule = (routerOverrides: Partial<RouterMock> = {}) => {
	jest.resetModules();

	const router: RouterMock = {
		dismissTo: jest.fn(),
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
	});

	afterEach(() => {
		jest.dontMock('expo-router');
	});

	it('dismisses to the Home dashboard route', () => {
		const { Keyboard, navigation, router } = loadNavigationModule();

		navigation.navigateToHomeDashboard();

		expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
		expect(router.dismissTo).toHaveBeenCalledWith({
			pathname: '/home',
			params: { tab: '0' },
		}, { withAnchor: true });
		expect(router.replace).not.toHaveBeenCalled();
	});

	it('replaces with Home if dismissTo fails', () => {
		const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		const { navigation, router } = loadNavigationModule({
			dismissTo: jest.fn(() => {
				throw new Error('Navigation state unavailable');
			}),
		});

		try {
			navigation.navigateToHomeDashboard();

			expect(router.replace).toHaveBeenCalledWith({
				pathname: '/home',
				params: { tab: '0' },
			}, { withAnchor: true });
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
});
