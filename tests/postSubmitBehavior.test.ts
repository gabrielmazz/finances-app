const loadPostSubmitBehavior = () => {
	jest.resetModules();
	jest.doMock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));

	return require('@/contexts/PostSubmitBehaviorContext') as typeof import('@/contexts/PostSubmitBehaviorContext');
};

describe('post-submit behavior preferences', () => {
	afterEach(() => {
		jest.dontMock('react-native-css-interop/jsx-runtime');
	});

	it('preserves an edit destination selected by the user', () => {
		const { normalizePostSubmitBehavior } = loadPostSubmitBehavior();

		expect(
			normalizePostSubmitBehavior(
				{
					shouldReturnAfterSubmit: true,
					returnDestination: 'financialList',
					shouldClearFieldsAfterSubmit: true,
				},
				'edit',
			),
		).toEqual({
			shouldReturnAfterSubmit: true,
			returnDestination: 'financialList',
			shouldClearFieldsAfterSubmit: false,
		});
	});

	it('keeps Home as the default destination for older edit preferences', () => {
		const { normalizePostSubmitBehavior } = loadPostSubmitBehavior();

		expect(normalizePostSubmitBehavior({ shouldReturnAfterSubmit: true }, 'edit')).toMatchObject({
			shouldReturnAfterSubmit: true,
			returnDestination: 'homeDashboard',
			shouldClearFieldsAfterSubmit: false,
		});
	});
});
