import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const STORAGE_KEY = '@mandatoryGainNotifications';
const CHANNEL_ID = 'mandatory-gains';

type NotificationsModule = typeof import('expo-notifications');

let cachedNotificationsModule: NotificationsModule | null = null;
let hasWarnedUnavailableEnvironment = false;

const isNotificationsEnvironmentSupported = () => {
	if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
		return false;
	}

	if (Constants.appOwnership === 'expo') {
		return false;
	}

	return true;
};

const warnNotificationsUnavailable = () => {
	if (hasWarnedUnavailableEnvironment) {
		return;
	}
	hasWarnedUnavailableEnvironment = true;
	console.warn(
		'Notificações de ganhos obrigatórios não estão disponíveis neste ambiente (Expo Go). Gere um build de desenvolvimento para utilizá-las.',
	);
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

type NotificationMap = Record<string, string>;

const readNotificationMap = async (): Promise<NotificationMap> => {
	try {
		const storedValue = await AsyncStorage.getItem(STORAGE_KEY);
		if (!storedValue) {
			return {};
		}
		return JSON.parse(storedValue) as NotificationMap;
	} catch (error) {
		console.error('Erro ao ler notificações de ganhos armazenadas:', error);
		return {};
	}
};

const writeNotificationMap = async (map: NotificationMap) => {
	try {
		await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
	} catch (error) {
		console.error('Erro ao salvar notificações de ganhos armazenadas:', error);
	}
};

const hasNotificationPermission = async () => {
	const Notifications = getNotificationsModule();
	if (!Notifications) {
		warnNotificationsUnavailable();
		return false;
	}
	const settings = await Notifications.getPermissionsAsync();
	return settings.granted === true;
};

const requestNotificationPermission = async () => {
	const Notifications = getNotificationsModule();
	if (!Notifications) {
		warnNotificationsUnavailable();
		return false;
	}
	const settings = await Notifications.requestPermissionsAsync();
	return settings.granted === true;
};

type ScheduleOptions = {
	gainTemplateId: string;
	name: string;
	dueDay: number;
	reminderHour: number;
	reminderMinute: number;
	description?: string | null;
	requestPermission?: boolean;
};

type ScheduleResult =
	| { success: true }
	| { success: false; reason: 'permissions-denied' | 'unavailable' };

export const scheduleMandatoryGainNotification = async ({
	gainTemplateId,
	name,
	dueDay,
	reminderHour,
	reminderMinute,
	description,
	requestPermission = true,
}: ScheduleOptions): Promise<ScheduleResult> => {
	const Notifications = getNotificationsModule();
	if (!Notifications) {
		warnNotificationsUnavailable();
		return { success: false, reason: 'unavailable' };
	}

	let permissionGranted = await hasNotificationPermission();

	if (!permissionGranted && requestPermission) {
		permissionGranted = await requestNotificationPermission();
	}

	if (!permissionGranted) {
		return { success: false, reason: 'permissions-denied' };
	}

	await cancelMandatoryGainNotification(gainTemplateId);

	const normalizedDay = Math.min(Math.max(dueDay, 1), 31);

	const notificationId = await Notifications.scheduleNotificationAsync({
		content: {
			title: 'Ganho obrigatório',
			body: `${name} deve ser recebido hoje.${description ? ` Observação: ${description}` : ''}`,
			data: {
				gainTemplateId,
			},
		},
		trigger: {
			channelId: CHANNEL_ID,
			day: normalizedDay,
			hour: reminderHour,
			minute: reminderMinute,
			repeats: true,
		},
	});

	const map = await readNotificationMap();
	map[gainTemplateId] = notificationId;
	await writeNotificationMap(map);

	return { success: true };
};

export const cancelMandatoryGainNotification = async (gainTemplateId: string) => {
	const Notifications = getNotificationsModule();
	if (!Notifications) {
		warnNotificationsUnavailable();
		return;
	}

	const map = await readNotificationMap();
	const notificationId = map[gainTemplateId];

	if (notificationId) {
		try {
			await Notifications.cancelScheduledNotificationAsync(notificationId);
		} catch (error) {
			console.warn('Erro ao cancelar notificação de ganho obrigatório:', error);
		}

		delete map[gainTemplateId];
		await writeNotificationMap(map);
	}
};

type SyncGain = {
	id: string;
	name: string;
	dueDay: number;
	reminderEnabled?: boolean;
	reminderHour?: number;
	reminderMinute?: number;
	description?: string | null;
};

export const syncMandatoryGainNotifications = async (gains: SyncGain[]) => {
	if (!getNotificationsModule()) {
		warnNotificationsUnavailable();
		return;
	}

	const permissionGranted = await hasNotificationPermission();

	for (const gain of gains) {
		if (gain.reminderEnabled === false) {
			await cancelMandatoryGainNotification(gain.id);
			continue;
		}

		if (!permissionGranted) {
			continue;
		}

		await scheduleMandatoryGainNotification({
			gainTemplateId: gain.id,
			name: gain.name,
			dueDay: gain.dueDay,
			reminderHour: gain.reminderHour ?? 9,
			reminderMinute: gain.reminderMinute ?? 0,
			description: gain.description,
			requestPermission: false,
		});
	}
};

export const ensureNotificationPermissionForMandatoryGains = async () => {
	if (!getNotificationsModule()) {
		warnNotificationsUnavailable();
		return false;
	}

	if (await hasNotificationPermission()) {
		return true;
	}

	return requestNotificationPermission();
};
