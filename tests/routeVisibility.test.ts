const loadRouteVisibility = () => {
	jest.resetModules();
	jest.doMock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));

	return require('@/contexts/RouteVisibilityContext') as typeof import('@/contexts/RouteVisibilityContext');
};

describe('route visibility preferences', () => {
	afterEach(() => {
		jest.dontMock('react-native-css-interop/jsx-runtime');
	});

	it('keeps missing routes disabled and honors explicit local choices', () => {
		const { normalizeRouteVisibility } = loadRouteVisibility();

		expect(
			normalizeRouteVisibility({
				lumusAssistant: false,
				addRegisterExpenses: false,
				annotations: false,
			}),
		).toMatchObject({
			lumusAssistant: false,
			addRegisterExpenses: false,
			addRegisterGain: false,
			annotations: false,
		});
	});

	it('starts every functional screen disabled', () => {
		const { normalizeRouteVisibility } = loadRouteVisibility();

		expect(Object.values(normalizeRouteVisibility(null)).every(value => value === false)).toBe(true);
		expect(normalizeRouteVisibility(null)).toMatchObject({
			lumusAssistant: false,
			addRegisterExpenses: false,
			addRegisterGain: false,
			annotations: false,
		});
	});

	it('discards retired preferences while preserving visibility for remaining screens', () => {
		const { normalizeRouteVisibility } = loadRouteVisibility();
		const visibility = normalizeRouteVisibility({
			appTests: true,
			addRegisterBank: false,
			addRegisterTag: true,
		});

		expect(visibility).not.toHaveProperty('appTests');
		expect(visibility).toMatchObject({ addRegisterBank: false, addRegisterTag: true });
	});
});
