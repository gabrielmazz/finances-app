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
	gainTemplateId: string;
	name: string;
	dueDay: number;
	usesBusinessDays?: boolean;
	reminderHour: number;
	reminderMinute: number;
	reminderDaysBefore?: number;
	reminderOnDueDate?: boolean;
	description?: string | null;
	lastCompletedCycle?: string | null;
	activeFromDate?: Date | string | null;
	activeThroughDate?: Date | string | null;
	requestPermission?: boolean;
};

type SyncGain = MandatoryReminderSyncItem;

export const scheduleMandatoryGainNotification = async ({
	accountId,
	gainTemplateId,
	name,
	dueDay,
	usesBusinessDays,
	reminderHour,
	reminderMinute,
	reminderDaysBefore = 0,
	reminderOnDueDate = true,
	description,
	lastCompletedCycle,
	activeFromDate,
	activeThroughDate,
	requestPermission = true,
}: ScheduleOptions): Promise<MandatoryReminderScheduleResult> =>
	scheduleMandatoryReminderNotification({
		accountId,
		kind: 'gain',
		templateId: gainTemplateId,
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

export const cancelMandatoryGainNotification = async (accountId: string, gainTemplateId: string) =>
	cancelMandatoryReminderNotification(accountId, 'gain', gainTemplateId);

export const syncMandatoryGainNotifications = async (accountId: string, gains: SyncGain[]) =>
	syncMandatoryReminderNotifications(accountId, 'gain', gains);

export const suppressMandatoryGainNotificationCycle = async (
	accountId: string,
	gainTemplateId: string,
	cycleKey: string,
) => suppressMandatoryReminderCycle(accountId, 'gain', gainTemplateId, cycleKey);

export const ensureNotificationPermissionForMandatoryGains =
	async (): Promise<MandatoryReminderPermissionResult> => ensureMandatoryReminderPermission();
