describe('rota do Assistente Lumus', () => {
	beforeEach(() => {
		jest.resetModules();
	});

	afterEach(() => {
		jest.dontMock('react-native-css-interop/jsx-runtime');
		jest.dontMock('@/components/uiverse/assistant/assistant-route-boundary');
		jest.dontMock('@/contexts/LumusAssistantContext');
		jest.dontMock('@/screens/mobile/LumusAssistantScreen');
		jest.dontMock('@/screens/web/LumusAssistantScreen.web');
	});

	it('monta provider e tela diretamente, sem Suspense na entrada da rota', () => {
		const AssistantRouteBoundary = ({ children }: { children: unknown }) => children;
		const LumusAssistantProvider = ({ children }: { children: unknown }) => children;
		const LumusAssistantScreen = () => null;

		jest.doMock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
		jest.doMock('@/components/uiverse/assistant/assistant-route-boundary', () => ({
			__esModule: true,
			AssistantRouteBoundary,
		}));
		jest.doMock('@/contexts/LumusAssistantContext', () => ({
			__esModule: true,
			LumusAssistantProvider,
		}));
		jest.doMock('@/screens/mobile/LumusAssistantScreen', () => ({
			__esModule: true,
			default: LumusAssistantScreen,
		}));

		const LumusAssistantRoute = require('@/app/mobile/lumus-assistant').default;
		const routeElement = LumusAssistantRoute();
		const providerElement = routeElement.props.children;

		expect(routeElement.type).toBe(AssistantRouteBoundary);
		expect(providerElement.type).toBe(LumusAssistantProvider);
		expect(providerElement.props.children.type).toBe(LumusAssistantScreen);
	});

	it('monta a composição Web própria diretamente, sem reutilizar a tela mobile', () => {
		const AssistantRouteBoundary = ({ children }: { children: unknown }) => children;
		const LumusAssistantProvider = ({ children }: { children: unknown }) => children;
		const LumusAssistantScreenWeb = () => null;

		jest.doMock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
		jest.doMock('@/components/uiverse/assistant/assistant-route-boundary', () => ({
			__esModule: true,
			AssistantRouteBoundary,
		}));
		jest.doMock('@/contexts/LumusAssistantContext', () => ({
			__esModule: true,
			LumusAssistantProvider,
		}));
		jest.doMock('@/screens/web/LumusAssistantScreen.web', () => ({
			__esModule: true,
			default: LumusAssistantScreenWeb,
		}));

		const LumusAssistantRoute = require('@/app/web/lumus-assistant').default;
		const routeElement = LumusAssistantRoute();
		const providerElement = routeElement.props.children;

		expect(routeElement.type).toBe(AssistantRouteBoundary);
		expect(providerElement.type).toBe(LumusAssistantProvider);
		expect(providerElement.props.children.type).toBe(LumusAssistantScreenWeb);
	});
});
