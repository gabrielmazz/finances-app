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
	gainTemplateId: string;
	name: string;
	dueDay: number;
	reminderHour: number;
	reminderMinute: number;
	description?: string | null;
	requestPermission?: boolean;
};

type SyncGain = MandatoryReminderSyncItem;

export const scheduleMandatoryGainNotification = async ({
	gainTemplateId,
	name,
	dueDay,
	reminderHour,
	reminderMinute,
	description,
	requestPermission = true,
}: ScheduleOptions): Promise<MandatoryReminderScheduleResult> =>
	scheduleMandatoryReminderNotification({
		kind: 'gain',
		templateId: gainTemplateId,
		name,
		dueDay,
		reminderHour,
		reminderMinute,
		description,
		requestPermission,
	});

export const cancelMandatoryGainNotification = async (gainTemplateId: string) =>
	cancelMandatoryReminderNotification('gain', gainTemplateId);

export const syncMandatoryGainNotifications = async (gains: SyncGain[]) =>
	syncMandatoryReminderNotifications('gain', gains);

export const ensureNotificationPermissionForMandatoryGains =
	async (): Promise<MandatoryReminderPermissionResult> => ensureMandatoryReminderPermission();

