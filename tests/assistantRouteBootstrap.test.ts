describe('rota do Assistente Lumus', () => {
	beforeEach(() => {
		jest.resetModules();
	});

	afterEach(() => {
		jest.dontMock('react-native-css-interop/jsx-runtime');
		jest.dontMock('@/components/uiverse/assistant-route-boundary');
		jest.dontMock('@/contexts/LumusAssistantContext');
		jest.dontMock('@/screens/LumusAssistantScreen');
	});

	it('monta provider e tela diretamente, sem Suspense na entrada da rota', () => {
		const AssistantRouteBoundary = ({ children }: { children: unknown }) => children;
		const LumusAssistantProvider = ({ children }: { children: unknown }) => children;
		const LumusAssistantScreen = () => null;

		jest.doMock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
		jest.doMock('@/components/uiverse/assistant-route-boundary', () => ({
			__esModule: true,
			AssistantRouteBoundary,
		}));
		jest.doMock('@/contexts/LumusAssistantContext', () => ({
			__esModule: true,
			LumusAssistantProvider,
		}));
		jest.doMock('@/screens/LumusAssistantScreen', () => ({
			__esModule: true,
			default: LumusAssistantScreen,
		}));

		const LumusAssistantRoute = require('@/app/lumus-assistant').default;
		const routeElement = LumusAssistantRoute();
		const providerElement = routeElement.props.children;

		expect(routeElement.type).toBe(AssistantRouteBoundary);
		expect(providerElement.type).toBe(LumusAssistantProvider);
		expect(providerElement.props.children.type).toBe(LumusAssistantScreen);
	});
});
