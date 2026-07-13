declare global {
	var __mockNotificationState: any;
	var __resetNotificationMockState: () => void;
}

const loadNotificationModules = () => {
	jest.resetModules();

	return {
		notifee: require('@notifee/react-native'),
		localNotifications: require('@/utils/localNotifications'),
		mandatoryReminderNotifications: require('@/utils/mandatoryReminderNotifications'),
	};
};

describe('mandatory reminder notifications', () => {
	const state = global.__mockNotificationState as any;

	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date(2026, 0, 10, 8, 0, 0, 0));
		global.__resetNotificationMockState();
		jest.clearAllMocks();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('bootstraps the Notifee channels and foreground delivery handler', async () => {
		const { notifee, localNotifications } = loadNotificationModules();

		await localNotifications.bootstrapLocalNotifications();

		expect(notifee.default.createChannel).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'mandatory-expenses-v3-notifee', importance: notifee.AndroidImportance.HIGH }),
		);
		expect(notifee.default.createChannel).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'mandatory-gains-v3-notifee', importance: notifee.AndroidImportance.HIGH }),
		);
		expect(notifee.default.createChannel).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'system-tests-v2-notifee', importance: notifee.AndroidImportance.HIGH }),
		);
		expect(notifee.default.onForegroundEvent).toHaveBeenCalledTimes(1);
	});

	it('requests permission and sends an immediate Notifee system test notification', async () => {
		state.permissions = { authorizationStatus: notifeeAuthorizationDenied() };
		state.requestPermissions = { authorizationStatus: notifeeAuthorizationGranted() };
		const { notifee, localNotifications } = loadNotificationModules();

		const result = await localNotifications.sendLocalNotificationTest();

		expect(result).toMatchObject({ success: true, title: 'Teste de notificação' });
		expect(notifee.default.requestPermission).toHaveBeenCalledTimes(1);
		expect(notifee.default.displayNotification).toHaveBeenCalledWith(
			expect.objectContaining({
			title: 'Teste de notificação',
			android: expect.objectContaining({ channelId: 'system-tests-v2-notifee' }),
		}),
		);
	});

	it('schedules the next Android reminder with a timestamp and persists its Notifee state', async () => {
		const { notifee, mandatoryReminderNotifications } = loadNotificationModules();

		const result = await mandatoryReminderNotifications.scheduleMandatoryReminderNotification({
			kind: 'expense',
			templateId: 'rent',
			name: 'Aluguel',
			dueDay: 31,
			usesBusinessDays: false,
			reminderHour: 9,
			reminderMinute: 30,
			description: 'Pagar pelo app do banco',
			requestPermission: false,
		});

		expect(result).toMatchObject({
			success: true,
			title: 'Vencimento de Aluguel',
			body: 'O pagamento de Aluguel deve ser efetuado hoje. Observação: Pagar pelo app do banco',
		});
		expect(notifee.default.createTriggerNotification).toHaveBeenCalledTimes(1);
		const [notification, trigger] = notifee.default.createTriggerNotification.mock.calls[0];
		expect(notification).toMatchObject({
			android: { channelId: 'mandatory-expenses-v3-notifee', pressAction: { id: 'default' } },
			data: expect.objectContaining({ templateId: 'rent', kind: 'expense', reminderType: 'mandatory-v3' }),
		});
		expect(trigger).toEqual({ type: notifee.TriggerType.TIMESTAMP, timestamp: new Date(2026, 0, 31, 9, 30, 0, 0).getTime() });

		const storedMap = JSON.parse(state.storage['@mandatoryReminderNotifications:notifee-v3']);
		expect(storedMap['expense:rent'].schedules).toHaveLength(1);
		expect(storedMap['expense:rent'].fingerprint).toContain('mandatory-expenses-v3-notifee');
	});

	it('rehydrates the following Android month from the delivered notification event', async () => {
		const { notifee, localNotifications, mandatoryReminderNotifications } = loadNotificationModules();
		await localNotifications.bootstrapLocalNotifications();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification({
			kind: 'gain',
			templateId: 'salary',
			name: 'Salário',
			dueDay: 5,
			reminderHour: 7,
			reminderMinute: 15,
			requestPermission: false,
		});

		const first = state.triggerNotifications[0];
		state.triggerNotifications = [];
		jest.setSystemTime(new Date(2026, 1, 5, 7, 15, 1, 0));
		await state.foregroundEventHandler({ type: notifee.EventType.DELIVERED, detail: { notification: first.notification } });

		expect(notifee.default.createTriggerNotification).toHaveBeenCalledTimes(2);
		const [, nextTrigger] = notifee.default.createTriggerNotification.mock.calls[1];
		expect(nextTrigger.timestamp).toBe(new Date(2026, 2, 5, 7, 15, 0, 0).getTime());
	});

	it('uses a bounded rolling date window on iOS', async () => {
		state.platformOS = 'ios';
		state.permissions = { authorizationStatus: notifeeAuthorizationGranted() };
		const { notifee, mandatoryReminderNotifications } = loadNotificationModules();

		const result = await mandatoryReminderNotifications.scheduleMandatoryReminderNotification({
			kind: 'gain',
			templateId: 'salary',
			name: 'Salário',
			dueDay: 5,
			reminderHour: 7,
			reminderMinute: 15,
			requestPermission: false,
		});

		expect(result.success).toBe(true);
		expect(notifee.default.createTriggerNotification).toHaveBeenCalledTimes(12);
	});

	it('does not load or schedule Notifee notifications in Expo Go', async () => {
		const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		state.appOwnership = 'expo';
		state.expoGoConfig = {};
		const { notifee, mandatoryReminderNotifications } = loadNotificationModules();

		const result = await mandatoryReminderNotifications.scheduleMandatoryReminderNotification({
			kind: 'expense',
			templateId: 'card',
			name: 'Cartão',
			dueDay: 10,
			reminderHour: 9,
			reminderMinute: 0,
		});

		expect(result).toMatchObject({ success: false, reason: 'unavailable' });
		expect(notifee.default.createTriggerNotification).not.toHaveBeenCalled();
		warnSpy.mockRestore();
	});
});

const notifeeAuthorizationGranted = () => 1;
const notifeeAuthorizationDenied = () => 0;
