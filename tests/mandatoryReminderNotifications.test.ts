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

const buildExpenseSchedule = (overrides: Record<string, unknown> = {}) => ({
	accountId: 'user-1',
	kind: 'expense' as const,
	templateId: 'rent',
	name: 'Aluguel',
	dueDay: 15,
	usesBusinessDays: false,
	reminderHour: 9,
	reminderMinute: 30,
	reminderDaysBefore: 3,
	reminderOnDueDate: true,
	description: 'Pagar pelo app do banco',
	requestPermission: false,
	...overrides,
});

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

	it('cleans every legacy schedule and bootstraps the new Expo channels and foreground handler', async () => {
		state.storage['@mandatoryReminderNotifications:notifee-v3'] = '{}';
		state.scheduledNotifications = [
			{ identifier: 'mandatory-expense-old', content: { data: {} }, trigger: { type: 'date' } },
		];
		const { notifications, localNotifications } = loadNotificationModules();

		await localNotifications.bootstrapLocalNotifications();

		expect(notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
		expect(state.scheduledNotifications).toHaveLength(0);
		expect(state.storage['@mandatoryReminderNotifications:notifee-v3']).toBeUndefined();
		expect(state.storage['@lumusNotifications:legacy-cleanup-v1']).toBe('complete');
		expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
			'payment-reminders-v1',
			expect.objectContaining({ importance: notifications.AndroidImportance.HIGH }),
		);
		expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
			'income-reminders-v1',
			expect.objectContaining({ importance: notifications.AndroidImportance.HIGH }),
		);
		expect(notifications.setNotificationHandler).toHaveBeenCalledTimes(1);
	});

	it('removes retired test channels even when the previous legacy migration already completed', async () => {
		state.storage['@lumusNotifications:legacy-cleanup-v1'] = 'complete';
		state.channels['system-tests-v1'] = { id: 'system-tests-v1' };
		state.channels['system-tests-v2-notifee'] = { id: 'system-tests-v2-notifee' };
		state.channels['system-tests-v1-expo'] = { id: 'system-tests-v1-expo' };
		const { notifications, localNotifications } = loadNotificationModules();

		await localNotifications.bootstrapLocalNotifications();

		expect(notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
		expect(state.channels['system-tests-v1']).toBeUndefined();
		expect(state.channels['system-tests-v2-notifee']).toBeUndefined();
		expect(state.channels['system-tests-v1-expo']).toBeUndefined();
		expect(state.storage['@lumusNotifications:removed-test-channels-v1']).toBe('complete');
	});

	it('schedules D-3, D-2, D-1 and the due date as concrete Android dates for six cycles', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();

		const result = await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());

		expect(result).toMatchObject({ success: true, scheduledCount: 24 });
		expect(state.scheduledNotifications).toHaveLength(24);
		const januarySchedules = state.scheduledNotifications.filter(
			(entry: any) => entry.content.data.cycleKey === '2026-01',
		);
		expect(januarySchedules.map((entry: any) => entry.trigger.date.getTime())).toEqual([
			new Date(2026, 0, 12, 9, 30, 0, 0).getTime(),
			new Date(2026, 0, 13, 9, 30, 0, 0).getTime(),
			new Date(2026, 0, 14, 9, 30, 0, 0).getTime(),
			new Date(2026, 0, 15, 9, 30, 0, 0).getTime(),
		]);
		expect(januarySchedules[0]).toMatchObject({
			identifier: expect.stringContaining('lumus-reminder-v1-'),
			content: expect.objectContaining({
				title: 'Pagamento em 3 dias: Aluguel',
				data: expect.objectContaining({
					notificationSystem: 'lumus-mandatory-reminders-v1',
					accountId: 'user-1',
					templateId: 'rent',
					daysBefore: 3,
				}),
			}),
			trigger: expect.objectContaining({ type: 'date', channelId: 'payment-reminders-v1' }),
		});
	});

	it('schedules normally on Android 7 where notification channels do not exist', async () => {
		state.platformVersion = 25;
		const { notifications, mandatoryReminderNotifications } = loadNotificationModules();

		const result = await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());

		expect(result).toMatchObject({ success: true, scheduledCount: 24 });
		expect(notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
	});

	it('does not schedule the cycle that was already paid', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();

		const result = await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(
			buildExpenseSchedule({ lastCompletedCycle: '2026-01' }),
		);

		expect(result).toMatchObject({ success: true, scheduledCount: 20 });
		expect(state.scheduledNotifications[0].content.data.cycleKey).toBe('2026-02');
		expect(state.scheduledNotifications[0].trigger.date.getTime()).toBe(
			new Date(2026, 1, 12, 9, 30, 0, 0).getTime(),
		);
	});

	it('crosses month and year boundaries from the resolved due date', async () => {
		jest.setSystemTime(new Date(2025, 11, 28, 8, 0, 0, 0));
		const { mandatoryReminderNotifications } = loadNotificationModules();

		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(
			buildExpenseSchedule({ dueDay: 1 }),
		);

		const januarySchedules = state.scheduledNotifications.filter(
			(entry: any) => entry.content.data.cycleKey === '2026-01',
		);
		expect(januarySchedules.map((entry: any) => entry.trigger.date.getTime())).toEqual([
			new Date(2025, 11, 29, 9, 30, 0, 0).getTime(),
			new Date(2025, 11, 30, 9, 30, 0, 0).getTime(),
			new Date(2025, 11, 31, 9, 30, 0, 0).getTime(),
			new Date(2026, 0, 1, 9, 30, 0, 0).getTime(),
		]);
	});

	it('clamps day 31 to the end of February and keeps the distinct due-date alert', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();

		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(
			buildExpenseSchedule({ dueDay: 31 }),
		);

		const februarySchedules = state.scheduledNotifications.filter(
			(entry: any) => entry.content.data.cycleKey === '2026-02',
		);
		expect(februarySchedules.map((entry: any) => entry.trigger.date.getTime())).toEqual([
			new Date(2026, 1, 25, 9, 30, 0, 0).getTime(),
			new Date(2026, 1, 26, 9, 30, 0, 0).getTime(),
			new Date(2026, 1, 27, 9, 30, 0, 0).getTime(),
			new Date(2026, 1, 28, 9, 30, 0, 0).getTime(),
		]);
		expect(februarySchedules[3]).toMatchObject({
			content: expect.objectContaining({
				title: 'Pagamento vence hoje: Aluguel',
				data: expect.objectContaining({ daysBefore: 0 }),
			}),
		});
	});

	it('subtracts calendar days after resolving a business-day due date', async () => {
		jest.setSystemTime(new Date(2026, 3, 29, 8, 0, 0, 0));
		const { mandatoryReminderNotifications } = loadNotificationModules();

		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(
			buildExpenseSchedule({ dueDay: 1, usesBusinessDays: true }),
		);

		const maySchedules = state.scheduledNotifications.filter(
			(entry: any) => entry.content.data.cycleKey === '2026-05',
		);
		expect(maySchedules[0].trigger.date.getTime()).toBe(new Date(2026, 4, 1, 9, 30, 0, 0).getTime());
		expect(new Date(maySchedules[0].content.data.dueAt).getTime()).toBe(
			new Date(2026, 4, 4, 9, 30, 0, 0).getTime(),
		);
	});

	it('rehydrates an entry when one concrete native schedule is missing', async () => {
		const { notifications, mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());
		const missingId = state.scheduledNotifications[0].identifier;
		state.scheduledNotifications = state.scheduledNotifications.slice(1);
		jest.clearAllMocks();

		const result = await mandatoryReminderNotifications.syncMandatoryReminderNotifications('user-1', 'expense', [
			{
				id: 'rent',
				name: 'Aluguel',
				dueDay: 15,
				reminderEnabled: true,
				reminderHour: 9,
				reminderMinute: 30,
				reminderDaysBefore: 3,
				reminderOnDueDate: true,
				description: 'Pagar pelo app do banco',
			},
		]);

		expect(result).toEqual({ scheduled: 1, failed: 0 });
		expect(state.scheduledNotifications).toHaveLength(24);
		expect(state.scheduledNotifications.some((entry: any) => entry.identifier === missingId)).toBe(true);
		expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(24);
	});

	it('suppresses every remaining alert from a completed cycle and keeps future cycles', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());

		await mandatoryReminderNotifications.suppressMandatoryReminderCycle('user-1', 'expense', 'rent', '2026-01');

		expect(state.scheduledNotifications).toHaveLength(20);
		expect(state.scheduledNotifications.some((entry: any) => entry.content.data.cycleKey === '2026-01')).toBe(false);
		expect(state.scheduledNotifications[0].content.data.cycleKey).toBe('2026-02');
	});

	it('rehydrates the current cycle immediately when a payment is reclaimed', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());
		await mandatoryReminderNotifications.suppressMandatoryReminderCycle('user-1', 'expense', 'rent', '2026-01');

		await mandatoryReminderNotifications.syncMandatoryReminderNotifications('user-1', 'expense', [
			{
				id: 'rent',
				name: 'Aluguel',
				dueDay: 15,
				reminderEnabled: true,
				reminderHour: 9,
				reminderMinute: 30,
				reminderDaysBefore: 3,
				reminderOnDueDate: true,
				description: 'Pagar pelo app do banco',
				lastCompletedCycle: null,
			},
		]);

		expect(state.scheduledNotifications).toHaveLength(24);
		expect(state.scheduledNotifications.some((entry: any) => entry.content.data.cycleKey === '2026-01')).toBe(true);
	});

	it('suppresses the paid cycle even while the app notification permission is disabled', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());
		state.permissions = { granted: false, status: 'denied', canAskAgain: true };

		await mandatoryReminderNotifications.suppressMandatoryReminderCycle('user-1', 'expense', 'rent', '2026-01');

		expect(state.scheduledNotifications).toHaveLength(20);
		expect(state.scheduledNotifications.some((entry: any) => entry.content.data.cycleKey === '2026-01')).toBe(false);
	});

	it('cancels an outdated native agenda when its configuration changes without permission', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());
		state.permissions = { granted: false, status: 'denied', canAskAgain: true };

		await mandatoryReminderNotifications.syncMandatoryReminderNotifications('user-1', 'expense', [
			{
				id: 'rent',
				name: 'Aluguel atualizado',
				dueDay: 20,
				reminderEnabled: true,
				reminderHour: 10,
				reminderMinute: 0,
				reminderDaysBefore: 2,
				reminderOnDueDate: false,
			},
		]);

		expect(state.scheduledNotifications).toHaveLength(0);
	});

	it('replaces fingerprinted native identifiers when a reminder configuration changes', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());
		const previousIds = new Set(state.scheduledNotifications.map((entry: any) => entry.identifier));

		await mandatoryReminderNotifications.syncMandatoryReminderNotifications('user-1', 'expense', [
			{
				id: 'rent',
				name: 'Aluguel atualizado',
				dueDay: 20,
				reminderEnabled: true,
				reminderHour: 10,
				reminderMinute: 0,
				reminderDaysBefore: 2,
				reminderOnDueDate: false,
			},
		]);

		expect(state.scheduledNotifications).toHaveLength(12);
		expect(state.scheduledNotifications.every((entry: any) => !previousIds.has(entry.identifier))).toBe(true);
		expect(state.scheduledNotifications[0].content.title).toBe('Pagamento em 2 dias: Aluguel atualizado');
	});

	it('replans concrete dates immediately when the device timezone fingerprint changes', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());
		const previousIds = new Set(state.scheduledNotifications.map((entry: any) => entry.identifier));
		const currentOffset = new Date().getTimezoneOffset();
		const timezoneOffsetSpy = jest
			.spyOn(Date.prototype, 'getTimezoneOffset')
			.mockReturnValue(currentOffset + 60);

		try {
			await mandatoryReminderNotifications.refreshMandatoryReminderNotifications('user-1');

			expect(state.scheduledNotifications).toHaveLength(24);
			expect(state.scheduledNotifications.every((entry: any) => !previousIds.has(entry.identifier))).toBe(true);
			const store = JSON.parse(state.storage['@lumusMandatoryReminders:expo-v1']);
			expect(store.entries['user-1:expense:rent'].fingerprint).toContain(
				`\"timezoneOffsetMinutes\":${currentOffset + 60}`,
			);
		} finally {
			timezoneOffsetSpy.mockRestore();
		}
	});

	it('removes a ghost request when the native scheduler throws after persisting the attempted identifier', async () => {
		const { notifications, mandatoryReminderNotifications } = loadNotificationModules();
		notifications.scheduleNotificationAsync.mockImplementationOnce(async (request: any) => {
			state.scheduledNotifications.push({
				identifier: request.identifier,
				content: request.content,
				trigger: request.trigger,
			});
			throw new Error('AlarmManager limit');
		});

		const result = await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());

		expect(result).toMatchObject({ success: false, reason: 'schedule-error' });
		expect(state.scheduledNotifications).toHaveLength(0);
		const store = JSON.parse(state.storage['@lumusMandatoryReminders:expo-v1']);
		expect(store.entries['user-1:expense:rent']).toMatchObject({
			status: 'schedule-error',
			scheduleIds: [],
		});
	});

	it('rehydrates an enabled entry as soon as permission returns, without waiting for the daily throttle', async () => {
		state.permissions = { granted: false, status: 'denied', canAskAgain: true };
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.syncMandatoryReminderNotifications('user-1', 'expense', [
			{
				id: 'rent',
				name: 'Aluguel',
				dueDay: 15,
				reminderEnabled: true,
				reminderHour: 9,
				reminderMinute: 30,
				reminderDaysBefore: 3,
				reminderOnDueDate: true,
			},
		]);
		expect(state.scheduledNotifications).toHaveLength(0);
		state.permissions = { granted: true, status: 'granted', canAskAgain: true };

		await mandatoryReminderNotifications.refreshMandatoryReminderNotifications('user-1');

		expect(state.scheduledNotifications).toHaveLength(24);
	});

	it('drops malformed local entries and recovers a valid entry with damaged schedule metadata', async () => {
		let { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());
		const damagedStore = JSON.parse(state.storage['@lumusMandatoryReminders:expo-v1']);
		damagedStore.entries['invalid-entry'] = { config: null, scheduleIds: 'broken' };
		damagedStore.entries['user-1:expense:rent'].scheduleIds = 'broken';
		damagedStore.entries['user-1:expense:rent'].status = 'scheduled';
		state.storage['@lumusMandatoryReminders:expo-v1'] = JSON.stringify(damagedStore);
		state.scheduledNotifications = [];

		({ mandatoryReminderNotifications } = loadNotificationModules());
		await mandatoryReminderNotifications.refreshMandatoryReminderNotifications('user-1');

		expect(state.scheduledNotifications).toHaveLength(24);
		const recoveredStore = JSON.parse(state.storage['@lumusMandatoryReminders:expo-v1']);
		expect(recoveredStore.entries['invalid-entry']).toBeUndefined();
		expect(recoveredStore.entries['user-1:expense:rent'].scheduleIds).toHaveLength(24);
	});

	it('persists a directly saved reminder denied by permission and rehydrates it after Settings grants access', async () => {
		state.permissions = { granted: false, status: 'denied', canAskAgain: false };
		const { mandatoryReminderNotifications } = loadNotificationModules();

		const deniedResult = await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(
			buildExpenseSchedule(),
		);
		expect(deniedResult).toMatchObject({ success: false, reason: 'permissions-denied' });
		expect(state.scheduledNotifications).toHaveLength(0);
		const pendingStore = JSON.parse(state.storage['@lumusMandatoryReminders:expo-v1']);
		expect(pendingStore.entries['user-1:expense:rent'].status).toBe('permission-denied');
		state.permissions = { granted: true, status: 'granted', canAskAgain: true };

		await mandatoryReminderNotifications.refreshMandatoryReminderNotifications('user-1');

		expect(state.scheduledNotifications).toHaveLength(24);
	});

	it('removes managed native orphans even when the local entry was lost', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());
		const store = JSON.parse(state.storage['@lumusMandatoryReminders:expo-v1']);
		store.entries = {};
		state.storage['@lumusMandatoryReminders:expo-v1'] = JSON.stringify(store);

		await mandatoryReminderNotifications.syncMandatoryReminderNotifications('user-1', 'expense', []);

		expect(state.scheduledNotifications).toHaveLength(0);
	});

	it('cancels reminders and local financial configuration when the authenticated account changes', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());

		await mandatoryReminderNotifications.setActiveMandatoryReminderAccount('user-2');

		expect(state.scheduledNotifications).toHaveLength(0);
		const store = JSON.parse(state.storage['@lumusMandatoryReminders:expo-v1']);
		expect(store.activeAccountId).toBe('user-2');
		expect(store.entries).toEqual({});
	});

	it('does not let a stale logout clear reminders from the currently active account', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.setActiveMandatoryReminderAccount('user-2');
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(
			buildExpenseSchedule({ accountId: 'user-2' }),
		);

		const cleared = await mandatoryReminderNotifications.clearMandatoryReminderAccount('user-1');

		expect(cleared).toBe(false);
		expect(state.scheduledNotifications).toHaveLength(24);
		const store = JSON.parse(state.storage['@lumusMandatoryReminders:expo-v1']);
		expect(store.activeAccountId).toBe('user-2');
	});

	it('invalidates an account cleanup if another account becomes active before it runs', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());

		const clearPromise = mandatoryReminderNotifications.clearMandatoryReminderAccount('user-1');
		const activatePromise = mandatoryReminderNotifications.setActiveMandatoryReminderAccount('user-2');
		const [cleared] = await Promise.all([clearPromise, activatePromise]);

		expect(cleared).toBe(false);
		const store = JSON.parse(state.storage['@lumusMandatoryReminders:expo-v1']);
		expect(store.activeAccountId).toBe('user-2');
	});

	it('clears every managed reminder and finalizes local account data after logout succeeds', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());

		await mandatoryReminderNotifications.clearMandatoryReminderAccount('user-1');
		expect(state.scheduledNotifications).toHaveLength(0);
		const preparedStore = JSON.parse(state.storage['@lumusMandatoryReminders:expo-v1']);
		expect(preparedStore.activeAccountId).toBe('user-1');
		expect(Object.keys(preparedStore.entries)).toHaveLength(1);

		await mandatoryReminderNotifications.finalizeMandatoryReminderAccountCleanup('user-1');

		expect(state.scheduledNotifications).toHaveLength(0);
		const store = JSON.parse(state.storage['@lumusMandatoryReminders:expo-v1']);
		expect(store.activeAccountId).toBeNull();
		expect(store.entries).toEqual({});
	});

	it('restores the local agenda from the rollback snapshot when signOut fails', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());
		await mandatoryReminderNotifications.clearMandatoryReminderAccount('user-1');
		expect(state.scheduledNotifications).toHaveLength(0);

		await mandatoryReminderNotifications.setActiveMandatoryReminderAccount('user-1');

		expect(state.scheduledNotifications).toHaveLength(24);
	});

	it('clears orphaned native reminders on logout even when the local store was lost', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());
		delete state.storage['@lumusMandatoryReminders:expo-v1'];

		await mandatoryReminderNotifications.clearMandatoryReminderAccount('user-1');
		await mandatoryReminderNotifications.finalizeMandatoryReminderAccountCleanup('user-1');

		expect(state.scheduledNotifications).toHaveLength(0);
		const store = JSON.parse(state.storage['@lumusMandatoryReminders:expo-v1']);
		expect(store.activeAccountId).toBeNull();
		expect(store.entries).toEqual({});
	});

	it('ignores a stale account sync invoked after an explicit logout started', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());

		const clearPromise = mandatoryReminderNotifications.clearMandatoryReminderAccount('user-1');
		const staleSyncPromise = mandatoryReminderNotifications.syncMandatoryReminderNotifications('user-1', 'expense', [
			{
				id: 'rent',
				name: 'Aluguel',
				dueDay: 15,
				reminderEnabled: true,
				reminderHour: 9,
				reminderMinute: 30,
				reminderDaysBefore: 3,
				reminderOnDueDate: true,
			},
		]);
		await Promise.all([clearPromise, staleSyncPromise]);
		await mandatoryReminderNotifications.finalizeMandatoryReminderAccountCleanup('user-1');

		expect(state.scheduledNotifications).toHaveLength(0);
		const store = JSON.parse(state.storage['@lumusMandatoryReminders:expo-v1']);
		expect(store.activeAccountId).toBeNull();
		expect(store.entries).toEqual({});
	});

	it('caps Android alarms globally, reserves non-managed slots and preserves every template next occurrence', async () => {
		const { localNotifications, mandatoryReminderNotifications } = loadNotificationModules();
		await localNotifications.bootstrapLocalNotifications();
		state.scheduledNotifications = Array.from({ length: 10 }, (_, index) => ({
			identifier: `other-schedule-${index}`,
			content: { data: { notificationSystem: 'another-expo-feature' } },
			trigger: { type: 'date', date: new Date(2026, 0, 20, 12, 0, 0, 0) },
		}));
		const expenses = Array.from({ length: 17 }, (_, index) => ({
			id: `expense-${index}`,
			name: `Despesa ${index}`,
			dueDay: 15,
			reminderEnabled: true,
			reminderHour: 9,
			reminderMinute: 30,
			reminderDaysBefore: 3,
			reminderOnDueDate: true,
		}));
		const gains = Array.from({ length: 4 }, (_, index) => ({
			id: `gain-${index}`,
			name: `Ganho ${index}`,
			dueDay: 15,
			reminderEnabled: true,
			reminderHour: 9,
			reminderMinute: 30,
			reminderDaysBefore: 0,
			reminderOnDueDate: true,
		}));

		await mandatoryReminderNotifications.syncMandatoryReminderNotifications('user-1', 'expense', expenses);
		await mandatoryReminderNotifications.syncMandatoryReminderNotifications('user-1', 'gain', gains);
		expect(state.scheduledNotifications).toHaveLength(400);
		expect(
			state.scheduledNotifications.filter(
				(entry: any) => entry.content.data.notificationSystem === 'lumus-mandatory-reminders-v1',
			),
		).toHaveLength(390);
		for (const expense of expenses) {
			expect(
				state.scheduledNotifications.some((entry: any) => entry.content.data.templateId === expense.id),
			).toBe(true);
		}
		for (const gain of gains) {
			expect(
				state.scheduledNotifications.some((entry: any) => entry.content.data.templateId === gain.id),
			).toBe(true);
		}
		state.scheduledNotifications = state.scheduledNotifications.filter(
			(entry: any) => entry.content.data.notificationSystem === 'lumus-mandatory-reminders-v1',
		);
		await mandatoryReminderNotifications.refreshMandatoryReminderNotifications('user-1');
		expect(state.scheduledNotifications).toHaveLength(400);
	});

	it('reports templates without a slot when active templates exceed the safe Android budget', async () => {
		const { mandatoryReminderNotifications } = loadNotificationModules();
		const gains = Array.from({ length: 401 }, (_, index) => ({
			id: `gain-overflow-${String(index).padStart(3, '0')}`,
			name: `Ganho excedente ${index}`,
			dueDay: 15,
			reminderEnabled: true,
			reminderHour: 9,
			reminderMinute: 30,
			reminderDaysBefore: 0,
			reminderOnDueDate: true,
		}));

		const syncResult = await mandatoryReminderNotifications.syncMandatoryReminderNotifications(
			'user-1',
			'gain',
			gains,
		);
		expect(state.scheduledNotifications).toHaveLength(400);
		expect(syncResult).toEqual({ scheduled: 400, failed: 1 });
	});

	it('uses the smaller safe pending-notification budget on iOS', async () => {
		state.platformOS = 'ios';
		const { mandatoryReminderNotifications } = loadNotificationModules();
		const expenses = Array.from({ length: 8 }, (_, index) => ({
			id: `ios-expense-${index}`,
			name: `Despesa iOS ${index}`,
			dueDay: 15,
			reminderEnabled: true,
			reminderHour: 9,
			reminderMinute: 30,
			reminderDaysBefore: 3,
			reminderOnDueDate: true,
		}));

		await mandatoryReminderNotifications.syncMandatoryReminderNotifications('user-1', 'expense', expenses);
		expect(state.scheduledNotifications).toHaveLength(60);
		for (const expense of expenses) {
			expect(
				state.scheduledNotifications.some((entry: any) => entry.content.data.templateId === expense.id),
			).toBe(true);
		}
	});

	it('does not claim success when the Android payment reminder channel was disabled by the user', async () => {
		state.channels['payment-reminders-v1'] = {
			id: 'payment-reminders-v1',
			importance: 0,
			userDisabled: true,
		};
		const { mandatoryReminderNotifications } = loadNotificationModules();

		const result = await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());

		expect(result).toMatchObject({ success: false, reason: 'channel-disabled' });
		expect(state.scheduledNotifications).toHaveLength(0);
	});

	it('fails safely on unsupported platforms', async () => {
		state.platformOS = 'web';
		const { mandatoryReminderNotifications } = loadNotificationModules();

		const result = await mandatoryReminderNotifications.scheduleMandatoryReminderNotification(buildExpenseSchedule());
		const cleared = await mandatoryReminderNotifications.clearMandatoryReminderAccount('user-1');

		expect(result).toMatchObject({ success: false, reason: 'unavailable' });
		expect(cleared).toBe(true);
		expect(state.scheduledNotifications).toHaveLength(0);
	});
});
