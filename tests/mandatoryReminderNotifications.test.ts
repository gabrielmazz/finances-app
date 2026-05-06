declare global {
	var __mockNotificationState: any;
	var __resetNotificationMockState: () => void;
}

const loadNotificationModules = () => {
	jest.resetModules();

	return {
		notifications: require('expo-notifications'),
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

	it('bootstraps the handler and Android channels used by mandatory reminders', async () => {
		const { notifications, localNotifications } = loadNotificationModules();

		await localNotifications.bootstrapLocalNotifications();

		expect(notifications.setNotificationHandler).toHaveBeenCalledTimes(1);
		expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
			'mandatory-expenses-v2',
			expect.objectContaining({
				importance: notifications.AndroidImportance.HIGH,
				name: 'Gastos obrigatórios',
			}),
		);
		expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
			'mandatory-gains-v2',
			expect.objectContaining({
				importance: notifications.AndroidImportance.HIGH,
				name: 'Ganhos obrigatórios',
			}),
		);
	});

	it('forces an Android local notification schedule from the system date and persists the 12-date window', async () => {
		const { notifications, mandatoryReminderNotifications } = loadNotificationModules();

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
		expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
		expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(12);

		const firstSchedule = notifications.scheduleNotificationAsync.mock.calls[0][0];
		expect(firstSchedule).toMatchObject({
			content: {
				title: 'Vencimento de Aluguel',
				data: {
					templateId: 'rent',
					kind: 'expense',
					dueDay: 31,
					usesBusinessDays: false,
				},
			},
			trigger: {
				type: notifications.SchedulableTriggerInputTypes.DATE,
				channelId: 'mandatory-expenses-v2',
			},
		});
		expect(firstSchedule.trigger.date).toEqual(new Date(2026, 0, 31, 9, 30, 0, 0));

		const storedMap = JSON.parse(state.storage['@mandatoryReminderNotifications']);
		expect(storedMap['expense:rent'].schedules).toHaveLength(12);
		expect(storedMap['expense:rent'].fingerprint).toContain('mandatory-expenses-v2');
		expect(storedMap['expense:rent'].fingerprint).toContain('date-window-v2:12');
	});

	it('uses the repeating calendar trigger on iOS for fixed-day reminders', async () => {
		state.platformOS = 'ios';
		state.permissions = { granted: false, ios: { status: 'provisional' } };
		const { notifications, mandatoryReminderNotifications } = loadNotificationModules();

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
		expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
		expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				trigger: expect.objectContaining({
					type: notifications.SchedulableTriggerInputTypes.CALENDAR,
					repeats: true,
					day: 5,
					hour: 7,
					minute: 15,
					channelId: 'mandatory-gains-v2',
				}),
			}),
		);
	});

	it('does not load or schedule notifications in Expo Go', async () => {
		const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		state.appOwnership = 'expo';
		state.expoGoConfig = {};
		const { notifications, mandatoryReminderNotifications } = loadNotificationModules();

		const result = await mandatoryReminderNotifications.scheduleMandatoryReminderNotification({
			kind: 'expense',
			templateId: 'card',
			name: 'Cartão',
			dueDay: 10,
			reminderHour: 9,
			reminderMinute: 0,
		});

		expect(result).toMatchObject({
			success: false,
			reason: 'unavailable',
		});
		expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
		warnSpy.mockRestore();
	});
});
