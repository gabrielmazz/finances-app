import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { NotificationPermissionsStatus, SchedulableNotificationTriggerInput } from 'expo-notifications';

type NotificationsModule = typeof import('expo-notifications');

export type MandatoryReminderKind = 'expense' | 'gain';

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
	reminderEnabled?: boolean;
	reminderHour?: number;
	reminderMinute?: number;
	description?: string | null;
};

type ReminderStorageEntry = {
	notificationId: string;
	fingerprint: string;
	nextTriggerAt: string;
};

type ReminderStorageMap = Record<string, ReminderStorageEntry>;

const STORAGE_KEY = '@mandatoryReminderNotifications';

let cachedNotificationsModule: NotificationsModule | null = null;
let hasWarnedUnavailableEnvironment = false;

const normalizeDay = (value: number) => Math.min(Math.max(Math.trunc(value) || 1, 1), 31);
const normalizeHour = (value: number) => Math.min(Math.max(Math.trunc(value) || 0, 0), 23);
const normalizeMinute = (value: number) => Math.min(Math.max(Math.trunc(value) || 0, 0), 59);
const normalizeName = (value: string) => value.trim();
const normalizeDescription = (value?: string | null) => {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const isNotificationsEnvironmentSupported = () => Platform.OS === 'ios' || Platform.OS === 'android';

const warnNotificationsUnavailable = () => {
	if (hasWarnedUnavailableEnvironment) {
		return;
	}

	hasWarnedUnavailableEnvironment = true;
	console.warn('Não foi possível acessar as APIs de notificações locais neste ambiente.');
};

const getNotificationsModule = (): NotificationsModule | null => {
	if (!isNotificationsEnvironmentSupported()) {
		return null;
	}

	if (!cachedNotificationsModule) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
			cachedNotificationsModule = require('expo-notifications');
		} catch (error) {
			console.error('Não foi possível carregar o módulo expo-notifications:', error);
			return null;
		}
	}

	return cachedNotificationsModule;
};

const getChannelConfig = (kind: MandatoryReminderKind) => {
	if (kind === 'expense') {
		return {
			id: 'mandatory-expenses',
			name: 'Gastos obrigatórios',
			description: 'Lembretes para os gastos obrigatórios cadastrados.',
		};
	}

	return {
		id: 'mandatory-gains',
		name: 'Ganhos obrigatórios',
		description: 'Lembretes para os ganhos obrigatórios cadastrados.',
	};
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
	reminderHour,
	reminderMinute,
	description,
}: {
	kind: MandatoryReminderKind;
	templateId: string;
	name: string;
	dueDay: number;
	reminderHour: number;
	reminderMinute: number;
	description?: string | null;
}) =>
	JSON.stringify({
		kind,
		templateId,
		name: normalizeName(name),
		dueDay: normalizeDay(dueDay),
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

	const settings = await Notifications.requestPermissionsAsync({
		ios: {
			allowAlert: true,
			allowBadge: false,
			allowSound: true,
		},
	});

	return isPermissionGranted(Notifications, settings);
};

const ensureNotificationChannel = async (kind: MandatoryReminderKind) => {
	if (Platform.OS !== 'android') {
		return;
	}

	const Notifications = getNotificationsModule();
	if (!Notifications) {
		return;
	}

	const channel = getChannelConfig(kind);

	await Notifications.setNotificationChannelAsync(channel.id, {
		name: channel.name,
		importance: Notifications.AndroidImportance.DEFAULT,
		description: channel.description,
	});
};

const buildReminderTrigger = (
	Notifications: NotificationsModule,
	kind: MandatoryReminderKind,
	dueDay: number,
	reminderHour: number,
	reminderMinute: number,
): SchedulableNotificationTriggerInput => {
	const normalizedDay = normalizeDay(dueDay);
	const normalizedHour = normalizeHour(reminderHour);
	const normalizedMinute = normalizeMinute(reminderMinute);
	const channelId = getChannelConfig(kind).id;

	if (Platform.OS === 'android') {
		return {
			type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
			channelId,
			day: normalizedDay,
			hour: normalizedHour,
			minute: normalizedMinute,
		};
	}

	return {
		type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
		repeats: true,
		day: normalizedDay,
		hour: normalizedHour,
		minute: normalizedMinute,
		second: 0,
	};
};

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

	if (currentEntry?.notificationId) {
		try {
			await Notifications.cancelScheduledNotificationAsync(currentEntry.notificationId);
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
	reminderHour: number;
	reminderMinute: number;
	description?: string | null;
	Notifications: NotificationsModule;
	map: ReminderStorageMap;
}): Promise<MandatoryReminderScheduleResult> => {
	await ensureNotificationChannel(kind);

	const trigger = buildReminderTrigger(Notifications, kind, dueDay, reminderHour, reminderMinute);
	const nextTriggerTimestamp = await Notifications.getNextTriggerDateAsync(trigger);

	if (nextTriggerTimestamp === null) {
		return {
			success: false,
			reason: 'invalid-trigger',
			message: 'Não foi possível calcular a próxima data do lembrete com os dados informados.',
		};
	}

	const content = buildReminderContent({ kind, name, description });
	const storageKey = buildReminderStorageKey(kind, templateId);
	await cancelReminderNotificationInternal({ kind, templateId, Notifications, map });

	const notificationId = await Notifications.scheduleNotificationAsync({
		content: {
			title: content.title,
			body: content.body,
			data: {
				templateId,
				kind,
				dueDay: normalizeDay(dueDay),
			},
		},
		trigger,
	});

	map[storageKey] = {
		notificationId,
		fingerprint: buildReminderFingerprint({
			kind,
			templateId,
			name,
			dueDay,
			reminderHour,
			reminderMinute,
			description,
		}),
		nextTriggerAt: new Date(nextTriggerTimestamp).toISOString(),
	};

	return {
		success: true,
		nextTriggerAt: new Date(nextTriggerTimestamp),
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
	reminderHour,
	reminderMinute,
	description,
	requestPermission = true,
}: {
	kind: MandatoryReminderKind;
	templateId: string;
	name: string;
	dueDay: number;
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
			reminderHour: normalizedHour,
			reminderMinute: normalizedMinute,
			description: item.description,
		});
		const currentEntry = map[storageKey];
		const isCurrentScheduleStillPresent =
			typeof currentEntry?.notificationId === 'string' && scheduledNotificationIds.has(currentEntry.notificationId);

		if (currentEntry && currentEntry.fingerprint === fingerprint && isCurrentScheduleStillPresent) {
			continue;
		}

		const result = await scheduleReminderNotificationInternal({
			kind,
			templateId: item.id,
			name: item.name,
			dueDay: item.dueDay,
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

