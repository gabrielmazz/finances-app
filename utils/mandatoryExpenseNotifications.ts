import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const STORAGE_KEY = '@mandatoryExpenseNotifications';
const CHANNEL_ID = 'mandatory-expenses';

type NotificationsModule = typeof import('expo-notifications');

let cachedNotificationsModule: NotificationsModule | null = null;
let hasWarnedUnavailableEnvironment = false;

const isNotificationsEnvironmentSupported = () => {
	if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
		return false;
	}

	// Expo Go não oferece suporte às APIs de push em Android no SDK 53+
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
		'Notificações não estão disponíveis neste ambiente (Expo Go). Gere um build de desenvolvimento para utilizar os lembretes de gastos obrigatórios.',
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
		console.error('Erro ao ler notificações armazenadas:', error);
		return {};
	}
};

const writeNotificationMap = async (map: NotificationMap) => {
	try {
		await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
	} catch (error) {
		console.error('Erro ao salvar notificações armazenadas:', error);
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
	expenseId: string;
	name: string;
	dueDay: number;
	reminderHour: number;
	reminderMinute: number;
	description?: string | null;
	requestPermission?: boolean;
};

type ScheduleMandatoryNotificationResult =
	| { success: true }
	| { success: false; reason: 'permissions-denied' | 'unavailable' };

export const scheduleMandatoryExpenseNotification = async ({
	expenseId,
	name,
	dueDay,
	reminderHour,
	reminderMinute,
	description,
	requestPermission = true,
}: ScheduleOptions): Promise<ScheduleMandatoryNotificationResult> => {
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

	await cancelMandatoryExpenseNotification(expenseId);

	const normalizedDay = Math.min(Math.max(dueDay, 1), 31);

	const notificationId = await Notifications.scheduleNotificationAsync({
		content: {
			title: 'Gasto obrigatório',
			body: `${name} vence hoje.${description ? ` Observação: ${description}` : ''}`,
			data: {
				expenseId,
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
	map[expenseId] = notificationId;
	await writeNotificationMap(map);

	return { success: true as const };
};

export const cancelMandatoryExpenseNotification = async (expenseId: string) => {
	const Notifications = getNotificationsModule();
	if (!Notifications) {
		warnNotificationsUnavailable();
		return;
	}

	const map = await readNotificationMap();
	const notificationId = map[expenseId];

	if (notificationId) {
		try {
			await Notifications.cancelScheduledNotificationAsync(notificationId);
		} catch (error) {
			console.warn('Erro ao cancelar notificação agendada:', error);
		}

		delete map[expenseId];
		await writeNotificationMap(map);
	}
};

type SyncExpense = {
	id: string;
	name: string;
	dueDay: number;
	reminderEnabled?: boolean;
	reminderHour?: number;
	reminderMinute?: number;
	description?: string | null;
};

export const syncMandatoryExpenseNotifications = async (expenses: SyncExpense[]) => {
	if (!getNotificationsModule()) {
		warnNotificationsUnavailable();
		return;
	}

	const permissionGranted = await hasNotificationPermission();

	for (const expense of expenses) {
		if (expense.reminderEnabled === false) {
			await cancelMandatoryExpenseNotification(expense.id);
			continue;
		}

		if (!permissionGranted) {
			continue;
		}

		await scheduleMandatoryExpenseNotification({
			expenseId: expense.id,
			name: expense.name,
			dueDay: expense.dueDay,
			reminderHour: expense.reminderHour ?? 9,
			reminderMinute: expense.reminderMinute ?? 0,
			description: expense.description,
			requestPermission: false,
		});
	}
};

export const ensureNotificationPermissionForMandatoryExpenses = async () => {
	if (!getNotificationsModule()) {
		warnNotificationsUnavailable();
		return false;
	}

	if (await hasNotificationPermission()) {
		return true;
	}
	return requestNotificationPermission();
};
