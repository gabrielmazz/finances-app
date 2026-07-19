import {
	cancelMandatoryReminderNotification,
	ensureMandatoryReminderPermission,
	scheduleMandatoryReminderNotification,
	suppressMandatoryReminderCycle,
	syncMandatoryReminderNotifications,
	type MandatoryReminderPermissionResult,
	type MandatoryReminderScheduleResult,
	type MandatoryReminderSyncItem,
} from '@/utils/mandatoryReminderNotifications';

type ScheduleOptions = {
	accountId: string;
	expenseId: string;
	name: string;
	dueDay: number;
	usesBusinessDays?: boolean;
	reminderHour: number;
	reminderMinute: number;
	reminderDaysBefore: number;
	reminderOnDueDate: boolean;
	description?: string | null;
	lastCompletedCycle?: string | null;
	activeFromDate?: Date | string | null;
	activeThroughDate?: Date | string | null;
	requestPermission?: boolean;
};

type SyncExpense = MandatoryReminderSyncItem;

export const scheduleMandatoryExpenseNotification = async ({
	accountId,
	expenseId,
	name,
	dueDay,
	usesBusinessDays,
	reminderHour,
	reminderMinute,
	reminderDaysBefore,
	reminderOnDueDate,
	description,
	lastCompletedCycle,
	activeFromDate,
	activeThroughDate,
	requestPermission = true,
}: ScheduleOptions): Promise<MandatoryReminderScheduleResult> =>
	scheduleMandatoryReminderNotification({
		accountId,
		kind: 'expense',
		templateId: expenseId,
		name,
		dueDay,
		usesBusinessDays,
		reminderHour,
		reminderMinute,
		reminderDaysBefore,
		reminderOnDueDate,
		description,
		lastCompletedCycle,
		activeFromDate,
		activeThroughDate,
		requestPermission,
	});

export const cancelMandatoryExpenseNotification = async (accountId: string, expenseId: string) =>
	cancelMandatoryReminderNotification(accountId, 'expense', expenseId);

export const syncMandatoryExpenseNotifications = async (accountId: string, expenses: SyncExpense[]) =>
	syncMandatoryReminderNotifications(accountId, 'expense', expenses);

export const suppressMandatoryExpenseNotificationCycle = async (
	accountId: string,
	expenseId: string,
	cycleKey: string,
) => suppressMandatoryReminderCycle(accountId, 'expense', expenseId, cycleKey);

export const ensureNotificationPermissionForMandatoryExpenses =
	async (): Promise<MandatoryReminderPermissionResult> => ensureMandatoryReminderPermission();
