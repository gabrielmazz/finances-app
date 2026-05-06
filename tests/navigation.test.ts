type RouterMock = {
	canDismiss: jest.Mock;
	dismissAll: jest.Mock;
	replace: jest.Mock;
	canGoBack: jest.Mock;
	back: jest.Mock;
};

const loadNavigationModule = (routerOverrides: Partial<RouterMock> = {}) => {
	jest.resetModules();

	const router: RouterMock = {
		canDismiss: jest.fn(() => false),
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
	});

	afterEach(() => {
		jest.dontMock('expo-router');
	});

	it('dismisses a disposable stack and replaces with the Home dashboard route', () => {
		const { Keyboard, navigation, router } = loadNavigationModule({
			canDismiss: jest.fn(() => true),
		});

		navigation.navigateToHomeDashboard();

		expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
		expect(router.canDismiss).toHaveBeenCalledTimes(1);
		expect(router.dismissAll).toHaveBeenCalledTimes(1);
		expect(router.replace).toHaveBeenCalledWith({
			pathname: '/home',
			params: { tab: '0' },
		});
	});

	it('replaces with Home when there is no disposable stack', () => {
		const { navigation, router } = loadNavigationModule({
			canDismiss: jest.fn(() => false),
		});

		navigation.navigateToHomeDashboard();

		expect(router.dismissAll).not.toHaveBeenCalled();
		expect(router.replace).toHaveBeenCalledWith({
			pathname: '/home',
			params: { tab: '0' },
		});
	});

	it('still replaces with Home if dismiss capability detection fails', () => {
		const { navigation, router } = loadNavigationModule({
			canDismiss: jest.fn(() => {
				throw new Error('Navigation state unavailable');
			}),
		});

		navigation.navigateToHomeDashboard();

		expect(router.dismissAll).not.toHaveBeenCalled();
		expect(router.replace).toHaveBeenCalledWith({
			pathname: '/home',
			params: { tab: '0' },
		});
	});

	it('preserves native back behavior when history exists', () => {
		const { navigation, router } = loadNavigationModule({
			canGoBack: jest.fn(() => true),
		});

		navigation.navigateBackOrHomeDashboard();

		expect(router.back).toHaveBeenCalledTimes(1);
		expect(router.canDismiss).not.toHaveBeenCalled();
		expect(router.dismissAll).not.toHaveBeenCalled();
		expect(router.replace).not.toHaveBeenCalled();
	});
});
