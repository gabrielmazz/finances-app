import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type {
	NotificationContentInput,
	NotificationPermissionsStatus,
	SchedulableNotificationTriggerInput,
} from 'expo-notifications';
import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import {
	ensureMandatoryReminderNotificationChannel,
	ensureMandatoryReminderNotificationChannels,
	getMandatoryReminderChannelConfig,
	getNotificationsModule,
	warnNotificationsUnavailable,
	type MandatoryReminderKind,
	type NotificationsModule,
} from '@/utils/localNotifications';

export type { MandatoryReminderKind } from '@/utils/localNotifications';

export type MandatoryReminderPermissionResult =
	| { granted: true }
	| { granted: false; reason: 'permissions-denied' | 'unavailable' };

export type MandatoryReminderScheduleResult =
	| {
		success: true;
		nextTriggerAt: Date;
		title: string;
		body: string;
	}
	| {
		success: false;
		reason: 'permissions-denied' | 'unavailable' | 'invalid-trigger';
		message: string;
	};

export type MandatoryReminderSyncItem = {
	id: string;
	name: string;
	dueDay: number;
	usesBusinessDays?: boolean;
	reminderEnabled?: boolean;
	reminderHour?: number;
	reminderMinute?: number;
	description?: string | null;
};

type ReminderScheduledOccurrence = {
	notificationId: string;
	triggerAt: string;
};

type ReminderStorageEntry = {
	fingerprint: string;
	nextTriggerAt: string;
	schedules: ReminderScheduledOccurrence[];
	notificationId?: string;
};

type ReminderStorageMap = Record<string, ReminderStorageEntry>;

const STORAGE_KEY = '@mandatoryReminderNotifications';

const DATE_SCHEDULE_WINDOW_MONTHS = 12;

const normalizeDay = (value: number) => Math.min(Math.max(Math.trunc(value) || 1, 1), 31);
const normalizeHour = (value: number) => Math.min(Math.max(Math.trunc(value) || 0, 0), 23);
const normalizeMinute = (value: number) => Math.min(Math.max(Math.trunc(value) || 0, 0), 59);
const normalizeName = (value: string) => value.trim();
const normalizeUsesBusinessDays = (value?: boolean) => value === true;
const normalizeDescription = (value?: string | null) => {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const buildReminderContent = ({
	kind,
	name,
	description,
}: {
	kind: MandatoryReminderKind;
	name: string;
	description?: string | null;
}) => {
	const normalizedName = normalizeName(name);
	const normalizedDescription = normalizeDescription(description);
	const observationSuffix = normalizedDescription ? ` Observação: ${normalizedDescription}` : '';

	if (kind === 'expense') {
		return {
			title: `Vencimento de ${normalizedName}`,
			body: `O pagamento de ${normalizedName} deve ser efetuado hoje.${observationSuffix}`,
		};
	}

	return {
		title: `Recebimento de ${normalizedName}`,
		body: `O recebimento de ${normalizedName} deve ser realizado hoje.${observationSuffix}`,
	};
};

const buildReminderStorageKey = (kind: MandatoryReminderKind, templateId: string) => `${kind}:${templateId}`;

const buildReminderFingerprint = ({
	kind,
	templateId,
	name,
	dueDay,
	usesBusinessDays,
	reminderHour,
	reminderMinute,
	description,
}: {
	kind: MandatoryReminderKind;
	templateId: string;
	name: string;
	dueDay: number;
	usesBusinessDays?: boolean;
	reminderHour: number;
	reminderMinute: number;
	description?: string | null;
}) =>
	JSON.stringify({
		kind,
		templateId,
		channelId: getMandatoryReminderChannelConfig(kind).id,
		scheduleStrategy:
			Platform.OS === 'android' || normalizeUsesBusinessDays(usesBusinessDays)
				? `date-window-v2:${DATE_SCHEDULE_WINDOW_MONTHS}`
				: 'repeating-calendar-v2',
		name: normalizeName(name),
		dueDay: normalizeDay(dueDay),
		usesBusinessDays: normalizeUsesBusinessDays(usesBusinessDays),
		reminderHour: normalizeHour(reminderHour),
		reminderMinute: normalizeMinute(reminderMinute),
		description: normalizeDescription(description),
	});

const readReminderMap = async (): Promise<ReminderStorageMap> => {
	try {
		const storedValue = await AsyncStorage.getItem(STORAGE_KEY);
		if (!storedValue) {
			return {};
		}

		return JSON.parse(storedValue) as ReminderStorageMap;
	} catch (error) {
		console.error('Erro ao ler o mapa de lembretes obrigatórios:', error);
		return {};
	}
};

const writeReminderMap = async (map: ReminderStorageMap) => {
	try {
		await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
	} catch (error) {
		console.error('Erro ao salvar o mapa de lembretes obrigatórios:', error);
	}
};

const getEntrySchedules = (entry?: ReminderStorageEntry | null): ReminderScheduledOccurrence[] => {
	if (!entry) {
		return [];
	}

	if (Array.isArray(entry.schedules)) {
		return entry.schedules.filter(
			schedule =>
				typeof schedule?.notificationId === 'string' &&
				schedule.notificationId.length > 0 &&
				typeof schedule?.triggerAt === 'string' &&
				schedule.triggerAt.length > 0,
		);
	}

	if (typeof entry.notificationId === 'string' && entry.notificationId.length > 0) {
		return [
			{
				notificationId: entry.notificationId,
				triggerAt: entry.nextTriggerAt,
			},
		];
	}

	return [];
};

const isPermissionGranted = (Notifications: NotificationsModule, settings: NotificationPermissionsStatus) =>
	settings.granted === true || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

const hasNotificationPermission = async () => {
	const Notifications = getNotificationsModule();
	if (!Notifications) {
		warnNotificationsUnavailable();
		return false;
	}

	const settings = await Notifications.getPermissionsAsync();
	return isPermissionGranted(Notifications, settings);
};

const requestNotificationPermission = async () => {
	const Notifications = getNotificationsModule();
	if (!Notifications) {
		warnNotificationsUnavailable();
		return false;
	}

	await ensureMandatoryReminderNotificationChannels();

	const settings = await Notifications.requestPermissionsAsync({
		ios: {
			allowAlert: true,
			allowBadge: false,
			allowSound: true,
		},
	});

	return isPermissionGranted(Notifications, settings);
};

const buildRepeatingFixedDayReminderTrigger = (
	Notifications: NotificationsModule,
	kind: MandatoryReminderKind,
	dueDay: number,
	reminderHour: number,
	reminderMinute: number,
): SchedulableNotificationTriggerInput => {
	const normalizedDay = normalizeDay(dueDay);
	const normalizedHour = normalizeHour(reminderHour);
	const normalizedMinute = normalizeMinute(reminderMinute);
	const channelId = getMandatoryReminderChannelConfig(kind).id;

	return {
		type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
		channelId,
		repeats: true,
		day: normalizedDay,
		hour: normalizedHour,
		minute: normalizedMinute,
		second: 0,
	};
};

const buildMonthlyReminderDates = ({
	dueDay,
	usesBusinessDays,
	reminderHour,
	reminderMinute,
	fromDate = new Date(),
}: {
	dueDay: number;
	usesBusinessDays?: boolean;
	reminderHour: number;
	reminderMinute: number;
	fromDate?: Date;
}) => {
	const dates: Date[] = [];
	const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1, 12, 0, 0, 0);

	while (dates.length < DATE_SCHEDULE_WINDOW_MONTHS) {
		const resolvedOccurrence = resolveMonthlyOccurrence({
			referenceDate: cursor,
			dueDay,
			usesBusinessDays,
		});
		const triggerAt = new Date(
			resolvedOccurrence.date.getFullYear(),
			resolvedOccurrence.date.getMonth(),
			resolvedOccurrence.date.getDate(),
			normalizeHour(reminderHour),
			normalizeMinute(reminderMinute),
			0,
			0,
		);

		if (triggerAt.getTime() > fromDate.getTime()) {
			dates.push(triggerAt);
		}

		cursor.setMonth(cursor.getMonth() + 1);
	}

	return dates;
};

const buildReminderContentInput = ({
	Notifications,
	kind,
	templateId,
	dueDay,
	usesBusinessDays,
	content,
}: {
	Notifications: NotificationsModule;
	kind: MandatoryReminderKind;
	templateId: string;
	dueDay: number;
	usesBusinessDays: boolean;
	content: ReturnType<typeof buildReminderContent>;
}): NotificationContentInput => ({
	title: content.title,
	body: content.body,
	sound: true,
	priority: Platform.OS === 'android' ? Notifications.AndroidNotificationPriority.HIGH : undefined,
	data: {
		templateId,
		kind,
		dueDay: normalizeDay(dueDay),
		usesBusinessDays,
	},
});

const getScheduledNotificationIdSet = async (Notifications: NotificationsModule) => {
	const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
	return new Set(
		scheduledNotifications
			.map(notification => notification.identifier)
			.filter((identifier): identifier is string => typeof identifier === 'string' && identifier.length > 0),
	);
};

const cancelReminderNotificationInternal = async ({
	kind,
	templateId,
	Notifications,
	map,
}: {
	kind: MandatoryReminderKind;
	templateId: string;
	Notifications: NotificationsModule;
	map: ReminderStorageMap;
}) => {
	const storageKey = buildReminderStorageKey(kind, templateId);
	const currentEntry = map[storageKey];
	const schedules = getEntrySchedules(currentEntry);

	for (const schedule of schedules) {
		try {
			await Notifications.cancelScheduledNotificationAsync(schedule.notificationId);
		} catch (error) {
			console.warn('Erro ao cancelar lembrete obrigatório agendado:', error);
		}
	}

	if (currentEntry) {
		delete map[storageKey];
		return true;
	}

	return false;
};

const scheduleReminderNotificationInternal = async ({
	kind,
	templateId,
	name,
	dueDay,
	usesBusinessDays,
	reminderHour,
	reminderMinute,
	description,
	Notifications,
	map,
}: {
	kind: MandatoryReminderKind;
	templateId: string;
	name: string;
	dueDay: number;
	usesBusinessDays?: boolean;
	reminderHour: number;
	reminderMinute: number;
	description?: string | null;
	Notifications: NotificationsModule;
	map: ReminderStorageMap;
}): Promise<MandatoryReminderScheduleResult> => {
	await ensureMandatoryReminderNotificationChannel(kind);

	const content = buildReminderContent({ kind, name, description });
	const storageKey = buildReminderStorageKey(kind, templateId);
	const normalizedUsesBusinessDays = normalizeUsesBusinessDays(usesBusinessDays);
	await cancelReminderNotificationInternal({ kind, templateId, Notifications, map });
	const schedules: ReminderScheduledOccurrence[] = [];
	let nextTriggerAt: Date | null = null;

	if (Platform.OS === 'android' || normalizedUsesBusinessDays) {
		const triggerDates = buildMonthlyReminderDates({
			dueDay,
			usesBusinessDays: normalizedUsesBusinessDays,
			reminderHour,
			reminderMinute,
		});

		if (triggerDates.length === 0) {
			return {
				success: false,
				reason: 'invalid-trigger',
				message: 'Não foi possível calcular a próxima data do lembrete com os dados informados.',
			};
		}

		for (const triggerDate of triggerDates) {
			const notificationId = await Notifications.scheduleNotificationAsync({
				content: buildReminderContentInput({
					Notifications,
					kind,
					templateId,
					dueDay,
					usesBusinessDays: normalizedUsesBusinessDays,
					content,
				}),
				trigger: {
					type: Notifications.SchedulableTriggerInputTypes.DATE,
					date: triggerDate,
					channelId: getMandatoryReminderChannelConfig(kind).id,
				},
			});

			schedules.push({
				notificationId,
				triggerAt: triggerDate.toISOString(),
			});
		}

		nextTriggerAt = triggerDates[0] ?? null;
	} else {
		const trigger = buildRepeatingFixedDayReminderTrigger(Notifications, kind, dueDay, reminderHour, reminderMinute);
		const nextTriggerTimestamp = await Notifications.getNextTriggerDateAsync(trigger);

		if (nextTriggerTimestamp === null) {
			return {
				success: false,
				reason: 'invalid-trigger',
				message: 'Não foi possível calcular a próxima data do lembrete com os dados informados.',
			};
		}

		const notificationId = await Notifications.scheduleNotificationAsync({
			content: buildReminderContentInput({
				Notifications,
				kind,
				templateId,
				dueDay,
				usesBusinessDays: false,
				content,
			}),
			trigger,
		});

		nextTriggerAt = new Date(nextTriggerTimestamp);
		schedules.push({
			notificationId,
			triggerAt: nextTriggerAt.toISOString(),
		});
	}

	if (!nextTriggerAt) {
		return {
			success: false,
			reason: 'invalid-trigger',
			message: 'Não foi possível calcular a próxima data do lembrete com os dados informados.',
		};
	}

	map[storageKey] = {
		fingerprint: buildReminderFingerprint({
			kind,
			templateId,
			name,
			dueDay,
			usesBusinessDays: normalizedUsesBusinessDays,
			reminderHour,
			reminderMinute,
			description,
		}),
		nextTriggerAt: nextTriggerAt.toISOString(),
		schedules,
	};

	return {
		success: true,
		nextTriggerAt,
		title: content.title,
		body: content.body,
	};
};

export const ensureMandatoryReminderPermission = async (): Promise<MandatoryReminderPermissionResult> => {
	if (!getNotificationsModule()) {
		warnNotificationsUnavailable();
		return { granted: false, reason: 'unavailable' };
	}

	if (await hasNotificationPermission()) {
		return { granted: true };
	}

	const granted = await requestNotificationPermission();
	if (granted) {
		return { granted: true };
	}

	return { granted: false, reason: 'permissions-denied' };
};

export const scheduleMandatoryReminderNotification = async ({
	kind,
	templateId,
	name,
	dueDay,
	usesBusinessDays,
	reminderHour,
	reminderMinute,
	description,
	requestPermission = true,
}: {
	kind: MandatoryReminderKind;
	templateId: string;
	name: string;
	dueDay: number;
	usesBusinessDays?: boolean;
	reminderHour: number;
	reminderMinute: number;
	description?: string | null;
	requestPermission?: boolean;
}): Promise<MandatoryReminderScheduleResult> => {
	const Notifications = getNotificationsModule();
	if (!Notifications) {
		warnNotificationsUnavailable();
		return {
			success: false,
			reason: 'unavailable',
			message: 'Não foi possível acessar as notificações locais neste ambiente.',
		};
	}

	let permissionGranted = await hasNotificationPermission();

	if (!permissionGranted && requestPermission) {
		permissionGranted = await requestNotificationPermission();
	}

	if (!permissionGranted) {
		return {
			success: false,
			reason: 'permissions-denied',
			message: 'As notificações do aplicativo estão desativadas para este dispositivo.',
		};
	}

	const map = await readReminderMap();
	const result = await scheduleReminderNotificationInternal({
		kind,
		templateId,
		name,
		dueDay,
		usesBusinessDays,
		reminderHour,
		reminderMinute,
		description,
		Notifications,
		map,
	});

	if (result.success) {
		await writeReminderMap(map);
	}

	return result;
};

export const cancelMandatoryReminderNotification = async (kind: MandatoryReminderKind, templateId: string) => {
	const Notifications = getNotificationsModule();
	if (!Notifications) {
		warnNotificationsUnavailable();
		return;
	}

	const map = await readReminderMap();
	const changed = await cancelReminderNotificationInternal({
		kind,
		templateId,
		Notifications,
		map,
	});

	if (changed) {
		await writeReminderMap(map);
	}
};

export const syncMandatoryReminderNotifications = async (
	kind: MandatoryReminderKind,
	items: MandatoryReminderSyncItem[],
) => {
	const Notifications = getNotificationsModule();
	if (!Notifications) {
		warnNotificationsUnavailable();
		return;
	}

	const map = await readReminderMap();
	const scheduledNotificationIds = await getScheduledNotificationIdSet(Notifications);
	const permissionGranted = await hasNotificationPermission();
	const expectedStorageKeys = new Set(items.map(item => buildReminderStorageKey(kind, item.id)));
	let didChangeMap = false;

	for (const item of items) {
		if (item.reminderEnabled === false) {
			const changed = await cancelReminderNotificationInternal({
				kind,
				templateId: item.id,
				Notifications,
				map,
			});
			didChangeMap = didChangeMap || changed;
			continue;
		}

		if (!permissionGranted) {
			continue;
		}

		const normalizedHour = normalizeHour(item.reminderHour ?? 9);
		const normalizedMinute = normalizeMinute(item.reminderMinute ?? 0);
		const storageKey = buildReminderStorageKey(kind, item.id);
		const fingerprint = buildReminderFingerprint({
			kind,
			templateId: item.id,
			name: item.name,
			dueDay: item.dueDay,
			usesBusinessDays: item.usesBusinessDays,
			reminderHour: normalizedHour,
			reminderMinute: normalizedMinute,
			description: item.description,
		});
		const currentEntry = map[storageKey];
		const currentSchedules = getEntrySchedules(currentEntry);
		const isCurrentScheduleStillPresent =
			currentSchedules.length > 0 &&
			currentSchedules.every(schedule => scheduledNotificationIds.has(schedule.notificationId));

		if (currentEntry && currentEntry.fingerprint === fingerprint && isCurrentScheduleStillPresent) {
			continue;
		}

		const result = await scheduleReminderNotificationInternal({
			kind,
			templateId: item.id,
			name: item.name,
			dueDay: item.dueDay,
			usesBusinessDays: item.usesBusinessDays,
			reminderHour: normalizedHour,
			reminderMinute: normalizedMinute,
			description: item.description,
			Notifications,
			map,
		});

		if (result.success) {
			didChangeMap = true;
			continue;
		}

		if (result.reason === 'invalid-trigger') {
			console.warn(`[mandatoryReminderNotifications] ${result.message}`, {
				kind,
				templateId: item.id,
			});
		}
	}

	for (const storageKey of Object.keys(map)) {
		if (!storageKey.startsWith(`${kind}:`)) {
			continue;
		}

		if (expectedStorageKeys.has(storageKey)) {
			continue;
		}

		const templateId = storageKey.slice(kind.length + 1);
		const changed = await cancelReminderNotificationInternal({
			kind,
			templateId,
			Notifications,
			map,
		});
		didChangeMap = didChangeMap || changed;
	}

	if (didChangeMap) {
		await writeReminderMap(map);
	}
};

export const formatMandatoryReminderNextTrigger = (date: Date) =>
	new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(date);
