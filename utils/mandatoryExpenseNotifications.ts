import {
	cancelMandatoryReminderNotification,
	ensureMandatoryReminderPermission,
	scheduleMandatoryReminderNotification,
	syncMandatoryReminderNotifications,
	type MandatoryReminderPermissionResult,
	type MandatoryReminderScheduleResult,
	type MandatoryReminderSyncItem,
} from '@/utils/mandatoryReminderNotifications';

type ScheduleOptions = {
	expenseId: string;
	name: string;
	dueDay: number;
	reminderHour: number;
	reminderMinute: number;
	description?: string | null;
	requestPermission?: boolean;
};

type SyncExpense = MandatoryReminderSyncItem;

export const scheduleMandatoryExpenseNotification = async ({
	expenseId,
	name,
	dueDay,
	reminderHour,
	reminderMinute,
	description,
	requestPermission = true,
}: ScheduleOptions): Promise<MandatoryReminderScheduleResult> =>
	scheduleMandatoryReminderNotification({
		kind: 'expense',
		templateId: expenseId,
		name,
		dueDay,
		reminderHour,
		reminderMinute,
		description,
		requestPermission,
	});

export const cancelMandatoryExpenseNotification = async (expenseId: string) =>
	cancelMandatoryReminderNotification('expense', expenseId);

export const syncMandatoryExpenseNotifications = async (expenses: SyncExpense[]) =>
	syncMandatoryReminderNotifications('expense', expenses);

export const ensureNotificationPermissionForMandatoryExpenses =
	async (): Promise<MandatoryReminderPermissionResult> => ensureMandatoryReminderPermission();

