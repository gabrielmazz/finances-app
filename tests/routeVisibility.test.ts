const loadRouteVisibility = () => {
	jest.resetModules();
	jest.doMock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));

	return require('@/contexts/RouteVisibilityContext') as typeof import('@/contexts/RouteVisibilityContext');
};

describe('route visibility preferences', () => {
	afterEach(() => {
		jest.dontMock('react-native-css-interop/jsx-runtime');
	});

	it('keeps missing routes visible and honors explicit local choices', () => {
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
			addRegisterGain: true,
			annotations: false,
		});
	});

	it('starts every preserved screen visible', () => {
		const { normalizeRouteVisibility } = loadRouteVisibility();

		expect(Object.values(normalizeRouteVisibility(null)).every(value => value === true)).toBe(true);
		expect(normalizeRouteVisibility(null)).toMatchObject({
			lumusAssistant: true,
			addRegisterExpenses: true,
			addRegisterGain: true,
			annotations: true,
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
