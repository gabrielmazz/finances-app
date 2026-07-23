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
			}),
		).toMatchObject({
			lumusAssistant: false,
			addRegisterExpenses: false,
			addRegisterGain: true,
		});
	});

	it('keeps all routes visible when no preference has been saved', () => {
		const { normalizeRouteVisibility } = loadRouteVisibility();

		expect(normalizeRouteVisibility(null)).toMatchObject({
			lumusAssistant: true,
			addRegisterExpenses: true,
			addRegisterGain: true,
		});
	});
});
