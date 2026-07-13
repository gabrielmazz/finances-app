import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { Notification } from '@notifee/react-native';
import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import {
	ensureLegacyNotificationMigration,
	ensureLocalNotificationPermission,
	ensureMandatoryReminderNotificationChannel,
	getMandatoryReminderChannelConfig,
	getNotifeeRuntime,
	hasLocalNotificationPermission,
	warnNotificationsUnavailable,
	type LocalNotificationPermissionResult,
	type MandatoryReminderKind,
	type NotifeeRuntime,
} from '@/utils/localNotifications';

export type { MandatoryReminderKind } from '@/utils/localNotifications';

export type MandatoryReminderPermissionResult = LocalNotificationPermissionResult;

export type MandatoryReminderScheduleResult =
	| {
			success: true;
			nextTriggerAt: Date;
			title: string;
			body: string;
		}
	| {
			success: false;
			reason: 'permissions-denied' | 'unavailable' | 'invalid-trigger' | 'limit-reached';
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

type MandatoryReminderConfig = Required<
	Pick<MandatoryReminderSyncItem, 'id' | 'name' | 'dueDay' | 'reminderHour' | 'reminderMinute'>
> & {
	kind: MandatoryReminderKind;
	usesBusinessDays: boolean;
	description: string | null;
};

type ReminderScheduledOccurrence = {
	notificationId: string;
	triggerAt: string;
};

type ReminderStorageEntry = {
	fingerprint: string;
	config: MandatoryReminderConfig;
	nextTriggerAt: string;
	schedules: ReminderScheduledOccurrence[];
};

type ReminderStorageMap = Record<string, ReminderStorageEntry>;

const STORAGE_KEY = '@mandatoryReminderNotifications:notifee-v3';
const IOS_MAX_SCHEDULED_REMINDERS = 60;
const IOS_MAX_MONTHLY_WINDOW = 12;
const ANDROID_MAX_SCHEDULED_REMINDERS = 50;

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

const buildReminderStorageKey = (kind: MandatoryReminderKind, templateId: string) => `${kind}:${templateId}`;

const buildConfig = ({
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
}): MandatoryReminderConfig => ({
	kind,
	id: templateId,
	name: normalizeName(name),
	dueDay: normalizeDay(dueDay),
	usesBusinessDays: normalizeUsesBusinessDays(usesBusinessDays),
	reminderHour: normalizeHour(reminderHour),
	reminderMinute: normalizeMinute(reminderMinute),
	description: normalizeDescription(description),
});

const buildReminderFingerprint = (config: MandatoryReminderConfig) =>
	JSON.stringify({
		version: 'notifee-v3',
		...config,
		channelId: getMandatoryReminderChannelConfig(config.kind).id,
		strategy: Platform.OS === 'android' ? 'next-delivery-v3' : 'capacity-window-v3',
	});

const buildReminderContent = (config: MandatoryReminderConfig) => {
	const observationSuffix = config.description ? ` Observação: ${config.description}` : '';

	if (config.kind === 'expense') {
		return {
			title: `Vencimento de ${config.name}`,
			body: `O pagamento de ${config.name} deve ser efetuado hoje.${observationSuffix}`,
		};
	}

	return {
		title: `Recebimento de ${config.name}`,
		body: `O recebimento de ${config.name} deve ser realizado hoje.${observationSuffix}`,
	};
};

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

const getEntrySchedules = (entry?: ReminderStorageEntry | null): ReminderScheduledOccurrence[] =>
	Array.isArray(entry?.schedules)
		? entry.schedules.filter(
			schedule =>
				typeof schedule?.notificationId === 'string' &&
				schedule.notificationId.length > 0 &&
				typeof schedule?.triggerAt === 'string' &&
				schedule.triggerAt.length > 0,
		)
		: [];

const getFutureMonthlyOccurrences = ({
	config,
	count,
	fromDate = new Date(),
}: {
	config: MandatoryReminderConfig;
	count: number;
	fromDate?: Date;
}) => {
	const dates: Date[] = [];
	const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1, 12, 0, 0, 0);

	while (dates.length < count) {
		const resolvedOccurrence = resolveMonthlyOccurrence({
			referenceDate: cursor,
			dueDay: config.dueDay,
			usesBusinessDays: config.usesBusinessDays,
		});
		const triggerAt = new Date(
			resolvedOccurrence.date.getFullYear(),
			resolvedOccurrence.date.getMonth(),
			resolvedOccurrence.date.getDate(),
			config.reminderHour,
			config.reminderMinute,
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

const buildNotificationId = (config: MandatoryReminderConfig, triggerAt: Date) =>
	`mandatory-${config.kind}-${encodeURIComponent(config.id)}-${triggerAt.getTime()}`;

const createTriggerNotification = async ({
	runtime,
	config,
	triggerAt,
}: {
	runtime: NotifeeRuntime;
	config: MandatoryReminderConfig;
	triggerAt: Date;
}): Promise<ReminderScheduledOccurrence> => {
	const content = buildReminderContent(config);
	const notificationId = buildNotificationId(config, triggerAt);
	await runtime.notifee.createTriggerNotification(
		{
			id: notificationId,
			title: content.title,
			body: content.body,
			data: {
				reminderType: 'mandatory-v3',
				kind: config.kind,
				templateId: config.id,
				name: config.name,
				dueDay: config.dueDay,
				usesBusinessDays: config.usesBusinessDays ? '1' : '0',
				reminderHour: config.reminderHour,
				reminderMinute: config.reminderMinute,
				description: config.description ?? '',
			},
			android: {
				channelId: getMandatoryReminderChannelConfig(config.kind).id,
				pressAction: { id: 'default' },
			},
			ios: {
				sound: 'default',
			},
		},
		{
			type: runtime.TriggerType.TIMESTAMP,
			timestamp: triggerAt.getTime(),
		},
	);

	return {
		notificationId,
		triggerAt: triggerAt.toISOString(),
	};
};

const cancelEntrySchedules = async (runtime: NotifeeRuntime, entry?: ReminderStorageEntry | null) => {
	for (const schedule of getEntrySchedules(entry)) {
		try {
			await runtime.notifee.cancelNotification(schedule.notificationId);
		} catch (error) {
			console.warn('Erro ao cancelar lembrete obrigatório agendado:', error);
		}
	}
};

const getActiveEntries = (map: ReminderStorageMap) =>
	Object.entries(map)
		.filter(([, entry]) => entry?.config && typeof entry.config.id === 'string')
		.sort(([, left], [, right]) => {
			const leftNext = getFutureMonthlyOccurrences({ config: left.config, count: 1 })[0]?.getTime() ?? Number.MAX_SAFE_INTEGER;
			const rightNext = getFutureMonthlyOccurrences({ config: right.config, count: 1 })[0]?.getTime() ?? Number.MAX_SAFE_INTEGER;
			return leftNext - rightNext || left.config.name.localeCompare(right.config.name);
		});

const areAllSchedulesCurrent = async (runtime: NotifeeRuntime, map: ReminderStorageMap) => {
	const triggerIds = new Set(await runtime.notifee.getTriggerNotificationIds());
	return getActiveEntries(map).every(([, entry]) => {
		const schedules = getEntrySchedules(entry);
		return schedules.length > 0 && schedules.every(schedule => triggerIds.has(schedule.notificationId));
	});
};

const buildLimitReachedResult = (): MandatoryReminderScheduleResult => ({
	success: false,
	reason: 'limit-reached',
	message:
		'O dispositivo atingiu o limite de lembretes locais pendentes. Abra a lista de gastos ou ganhos após concluir lembretes antigos para reidratar a agenda.',
});

const scheduleAllActiveEntries = async ({
	runtime,
	map,
}: {
	runtime: NotifeeRuntime;
	map: ReminderStorageMap;
}): Promise<Map<string, MandatoryReminderScheduleResult>> => {
	const entries = getActiveEntries(map);
	const results = new Map<string, MandatoryReminderScheduleResult>();

	for (const [, entry] of entries) {
		await cancelEntrySchedules(runtime, entry);
		entry.schedules = [];
	}

	const existingTriggerCount = (await runtime.notifee.getTriggerNotificationIds()).length;
	const triggerLimit = Platform.OS === 'android' ? ANDROID_MAX_SCHEDULED_REMINDERS : IOS_MAX_SCHEDULED_REMINDERS;
	const availableSlots = Math.max(0, triggerLimit - existingTriggerCount);
	const entriesToSchedule = entries.slice(0, availableSlots);
	const occurrencesPerEntry =
		Platform.OS === 'android'
			? 1
			: Math.max(1, Math.min(IOS_MAX_MONTHLY_WINDOW, Math.floor(availableSlots / Math.max(entriesToSchedule.length, 1))));

	for (const [storageKey, entry] of entries) {
		if (!entriesToSchedule.some(([eligibleKey]) => eligibleKey === storageKey)) {
			results.set(storageKey, buildLimitReachedResult());
			continue;
		}

		try {
			await ensureMandatoryReminderNotificationChannel(entry.config.kind);
			const triggerDates = getFutureMonthlyOccurrences({ config: entry.config, count: occurrencesPerEntry });
			const schedules: ReminderScheduledOccurrence[] = [];
			for (const triggerAt of triggerDates) {
				schedules.push(await createTriggerNotification({ runtime, config: entry.config, triggerAt }));
			}

			const nextTriggerAt = triggerDates[0];
			if (!nextTriggerAt) {
				results.set(storageKey, {
					success: false,
					reason: 'invalid-trigger',
					message: 'Não foi possível calcular a próxima data do lembrete com os dados informados.',
				});
				continue;
			}

			entry.nextTriggerAt = nextTriggerAt.toISOString();
			entry.schedules = schedules;
			const content = buildReminderContent(entry.config);
			results.set(storageKey, { success: true, nextTriggerAt, ...content });
		} catch (error) {
			console.error('Erro ao agendar lembrete obrigatório:', error);
			results.set(storageKey, {
				success: false,
				reason: 'invalid-trigger',
				message: 'Não foi possível agendar o lembrete neste dispositivo.',
			});
		}
	}

	return results;
};

const upsertReminderEntry = (map: ReminderStorageMap, config: MandatoryReminderConfig) => {
	const storageKey = buildReminderStorageKey(config.kind, config.id);
	const fingerprint = buildReminderFingerprint(config);
	const currentEntry = map[storageKey];
	const didChange = currentEntry?.fingerprint !== fingerprint;
	map[storageKey] = {
		fingerprint,
		config,
		nextTriggerAt: currentEntry?.nextTriggerAt ?? '',
		schedules: getEntrySchedules(currentEntry),
	};
	return { storageKey, didChange };
};

export const ensureMandatoryReminderPermission = async (): Promise<MandatoryReminderPermissionResult> =>
	ensureLocalNotificationPermission();

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
	const runtime = getNotifeeRuntime();
	if (!runtime) {
		warnNotificationsUnavailable();
		return {
			success: false,
			reason: 'unavailable',
			message: 'Não foi possível acessar as notificações locais neste ambiente.',
		};
	}

	await ensureLegacyNotificationMigration();
	const permission = await ensureLocalNotificationPermission({ requestIfNeeded: requestPermission });
	if (!permission.granted) {
		return {
			success: false,
			reason: permission.reason,
			message:
				permission.reason === 'unavailable'
					? 'Não foi possível acessar as notificações locais neste ambiente.'
					: 'As notificações do aplicativo estão desativadas para este dispositivo.',
		};
	}

	const map = await readReminderMap();
	const config = buildConfig({
		kind,
		templateId,
		name,
		dueDay,
		usesBusinessDays,
		reminderHour,
		reminderMinute,
		description,
	});
	const { storageKey } = upsertReminderEntry(map, config);
	const results = await scheduleAllActiveEntries({ runtime, map });
	await writeReminderMap(map);
	return results.get(storageKey) ?? buildLimitReachedResult();
};

export const cancelMandatoryReminderNotification = async (kind: MandatoryReminderKind, templateId: string) => {
	const runtime = getNotifeeRuntime();
	if (!runtime) {
		warnNotificationsUnavailable();
		return;
	}

	await ensureLegacyNotificationMigration();
	const map = await readReminderMap();
	const storageKey = buildReminderStorageKey(kind, templateId);
	const entry = map[storageKey];
	if (!entry) {
		return;
	}

	await cancelEntrySchedules(runtime, entry);
	delete map[storageKey];
	if (await hasLocalNotificationPermission()) {
		await scheduleAllActiveEntries({ runtime, map });
	}
	await writeReminderMap(map);
};

export const syncMandatoryReminderNotifications = async (
	kind: MandatoryReminderKind,
	items: MandatoryReminderSyncItem[],
) => {
	const runtime = getNotifeeRuntime();
	if (!runtime) {
		warnNotificationsUnavailable();
		return;
	}

	await ensureLegacyNotificationMigration();
	const map = await readReminderMap();
	const expectedKeys = new Set<string>();
	let didChange = false;

	for (const item of items) {
		const storageKey = buildReminderStorageKey(kind, item.id);
		expectedKeys.add(storageKey);
		if (item.reminderEnabled === false) {
			if (map[storageKey]) {
				await cancelEntrySchedules(runtime, map[storageKey]);
				delete map[storageKey];
				didChange = true;
			}
			continue;
		}

		const { didChange: entryChanged } = upsertReminderEntry(
			map,
			buildConfig({
				kind,
				templateId: item.id,
				name: item.name,
				dueDay: item.dueDay,
				usesBusinessDays: item.usesBusinessDays,
				reminderHour: item.reminderHour ?? 9,
				reminderMinute: item.reminderMinute ?? 0,
				description: item.description,
			}),
		);
		didChange = didChange || entryChanged;
	}

	for (const storageKey of Object.keys(map)) {
		if (!storageKey.startsWith(`${kind}:`) || expectedKeys.has(storageKey)) {
			continue;
		}

		await cancelEntrySchedules(runtime, map[storageKey]);
		delete map[storageKey];
		didChange = true;
	}

	const permissionGranted = await hasLocalNotificationPermission();
	const schedulesAreCurrent = permissionGranted && (await areAllSchedulesCurrent(runtime, map));
	if (permissionGranted && (didChange || !schedulesAreCurrent)) {
		const results = await scheduleAllActiveEntries({ runtime, map });
		for (const [storageKey, result] of results) {
			if (!result.success) {
				console.warn(`[mandatoryReminderNotifications] ${result.message}`, { storageKey, reason: result.reason });
			}
		}
		didChange = true;
	}

	if (didChange) {
		await writeReminderMap(map);
	}
};

const getStringData = (data: Notification['data'], key: string) => {
	const value = data?.[key];
	return typeof value === 'string' ? value : '';
};

const getNumberData = (data: Notification['data'], key: string) => {
	const value = data?.[key];
	return typeof value === 'number' ? value : Number(value);
};

const getConfigFromNotification = (notification: Notification): MandatoryReminderConfig | null => {
	const kind = getStringData(notification.data, 'kind');
	if (getStringData(notification.data, 'reminderType') !== 'mandatory-v3' || (kind !== 'expense' && kind !== 'gain')) {
		return null;
	}

	const templateId = getStringData(notification.data, 'templateId');
	const name = getStringData(notification.data, 'name');
	if (!templateId || !name) {
		return null;
	}

	return buildConfig({
		kind,
		templateId,
		name,
		dueDay: getNumberData(notification.data, 'dueDay'),
		usesBusinessDays: getStringData(notification.data, 'usesBusinessDays') === '1',
		reminderHour: getNumberData(notification.data, 'reminderHour'),
		reminderMinute: getNumberData(notification.data, 'reminderMinute'),
		description: getStringData(notification.data, 'description'),
	});
};

// Android emits DELIVERED in a headless task, so one timestamp trigger keeps recurring indefinitely.
export const scheduleNextMandatoryReminderFromNotification = async (notification: Notification) => {
	if (Platform.OS !== 'android') {
		return;
	}

	const runtime = getNotifeeRuntime({ warnIfUnavailable: false });
	const config = getConfigFromNotification(notification);
	if (!runtime || !config) {
		return;
	}

	const nextTriggerAt = getFutureMonthlyOccurrences({ config, count: 1 })[0];
	if (!nextTriggerAt) {
		return;
	}

	try {
		await ensureMandatoryReminderNotificationChannel(config.kind, { warnIfUnavailable: false });
		const schedule = await createTriggerNotification({ runtime, config, triggerAt: nextTriggerAt });
		const map = await readReminderMap();
		const storageKey = buildReminderStorageKey(config.kind, config.id);
		map[storageKey] = {
			fingerprint: buildReminderFingerprint(config),
			config,
			nextTriggerAt: schedule.triggerAt,
			schedules: [schedule],
		};
		await writeReminderMap(map);
	} catch (error) {
		console.error('Erro ao reagendar o próximo lembrete obrigatório:', error);
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
