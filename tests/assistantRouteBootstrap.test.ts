const ROUTES = ['@/app/lumus-assistant', '@/app/app-tests'] as const;

describe('rotas que usam os módulos nativos do Assistente Lumus', () => {
	beforeEach(() => {
		jest.resetModules();
	});

	afterEach(() => {
		jest.dontMock('expo-audio');
		jest.dontMock('expo-speech');
		jest.dontMock('react-native-css-interop/jsx-runtime');
		jest.dontMock('@/components/uiverse/assistant-route-boundary');
	});

	it.each(ROUTES)('não avalia áudio ou voz durante o bootstrap de %s', route => {
		let nativeModuleEvaluations = 0;
		const unavailableNativeModule = () => {
			nativeModuleEvaluations += 1;
			throw new Error('Módulo nativo ausente neste development build.');
		};

		jest.doMock('expo-audio', unavailableNativeModule);
		jest.doMock('expo-speech', unavailableNativeModule);
		jest.doMock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
		jest.doMock('@/components/uiverse/assistant-route-boundary', () => ({
			__esModule: true,
			AssistantRouteBoundary: ({ children }: { children: unknown }) => children,
			AssistantRouteLoading: () => null,
		}));

		expect(() => require(route)).not.toThrow();
		expect(nativeModuleEvaluations).toBe(0);
	});
});
