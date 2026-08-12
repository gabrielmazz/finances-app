const loadRouteVisibility = () => {
	jest.resetModules();
	jest.doMock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));

	return require('@/contexts/RouteVisibilityContext') as typeof import('@/contexts/RouteVisibilityContext');
};

describe('route visibility preferences', () => {
	afterEach(() => {
		jest.dontMock('react-native-css-interop/jsx-runtime');
	});

	it('hides only the routes explicitly disabled in local preferences', () => {
		const { normalizeRouteVisibility } = loadRouteVisibility();

		expect(
			normalizeRouteVisibility({
				lumusAssistant: false,
				addRegisterExpenses: false,
				annotations: false,
				appTests: true,
			}),
		).toMatchObject({
			lumusAssistant: false,
			addRegisterExpenses: false,
			addRegisterGain: true,
			annotations: false,
			appTests: true,
		});
	});

	it('keeps standard routes visible while annotations and app tests stay hidden by default', () => {
		const { normalizeRouteVisibility } = loadRouteVisibility();

		expect(normalizeRouteVisibility(null)).toMatchObject({
			lumusAssistant: true,
			addRegisterExpenses: true,
			addRegisterGain: true,
			annotations: false,
			appTests: false,
		});
	});
});
