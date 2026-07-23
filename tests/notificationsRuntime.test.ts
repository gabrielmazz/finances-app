describe('notificationsRuntime', () => {
	afterEach(() => {
		jest.resetModules();
		jest.dontMock('expo-notifications');
		jest.dontMock('expo-constants');
	});

	it('não avalia expo-notifications no Expo Go Android', () => {
		jest.resetModules();
		let didTryToLoadNotifications = false;
		jest.doMock('expo-constants', () => ({
			__esModule: true,
			default: { executionEnvironment: 'storeClient' },
			ExecutionEnvironment: { StoreClient: 'storeClient' },
		}));
		jest.doMock('expo-notifications', () => {
			didTryToLoadNotifications = true;
			throw new Error('This package must not be evaluated in Expo Go');
		});

		const runtime = require('@/utils/notificationsRuntime') as typeof import('@/utils/notificationsRuntime');

		expect(runtime.isExpoGoNotificationsRuntime()).toBe(true);
		expect(runtime.isNotificationsRuntimeAvailable()).toBe(false);
		expect(didTryToLoadNotifications).toBe(false);
	});

	it('preserva a inicialização quando o módulo nativo não está disponível', async () => {
		jest.resetModules();
		jest.doMock('expo-constants', () => ({
			__esModule: true,
			default: { executionEnvironment: 'bare' },
			ExecutionEnvironment: { StoreClient: 'storeClient' },
		}));
		jest.doMock('expo-notifications', () => {
			throw new Error('Native module ExpoNotifications is unavailable');
		});
		const warningSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

		const runtime = require('@/utils/notificationsRuntime') as typeof import('@/utils/notificationsRuntime');

		expect(runtime.isNotificationsRuntimeAvailable()).toBe(false);
		await expect(runtime.Notifications.getPermissionsAsync()).resolves.toMatchObject({ granted: false });
		await expect(
			runtime.Notifications.scheduleNotificationAsync({ content: {}, trigger: null }),
		).rejects.toThrow(
			'expo-notifications não está disponível neste runtime.',
		);
		expect(warningSpy).toHaveBeenCalledTimes(1);

		warningSpy.mockRestore();
	});
});
