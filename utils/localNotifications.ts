import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import {
	Notifications,
	isNotificationsRuntimeAvailable,
	type NotificationChannel,
	type NotificationPermissionsStatus,
} from '@/utils/notificationsRuntime';

export type MandatoryReminderKind = 'expense' | 'gain';
export type LocalNotificationChannelKind = MandatoryReminderKind;

export type LocalNotificationPermissionResult =
	| { granted: true }
	| { granted: false; reason: 'permissions-denied' | 'unavailable' };

type LocalNotificationChannelConfig = {
	id: string;
	name: string;
	description: string;
};

const LEGACY_MIGRATION_STORAGE_KEY = '@lumusNotifications:legacy-cleanup-v1';
const REMOVED_TEST_CHANNELS_CLEANUP_STORAGE_KEY = '@lumusNotifications:removed-test-channels-v1';
const LEGACY_STORAGE_KEYS = [
	'@mandatoryReminderNotifications',
	'@mandatoryReminderNotifications:notifee-v3',
	'@mandatoryReminderNotifications:notifee-migration-v1',
];
const LEGACY_ANDROID_CHANNEL_IDS = [
	'mandatory-expenses',
	'mandatory-gains',
	'mandatory-expenses-v2',
	'mandatory-gains-v2',
	'mandatory-expenses-v3-notifee',
	'mandatory-gains-v3-notifee',
];
const REMOVED_TEST_ANDROID_CHANNEL_IDS = ['system-tests-v1', 'system-tests-v2-notifee', 'system-tests-v1-expo'];

const LOCAL_NOTIFICATION_CHANNELS: Record<LocalNotificationChannelKind, LocalNotificationChannelConfig> = {
	expense: {
		id: 'payment-reminders-v1',
		name: 'Lembretes de pagamentos',
		description: 'Avisos configurados para os vencimentos de gastos obrigatórios.',
	},
	gain: {
		id: 'income-reminders-v1',
		name: 'Lembretes de recebimentos',
		description: 'Avisos configurados para os recebimentos de ganhos obrigatórios.',
	},
};

let hasRegisteredNotificationHandler = false;
let legacyMigrationPromise: Promise<void> | null = null;
let removedTestChannelsCleanupPromise: Promise<void> | null = null;
let bootstrapPromise: Promise<void> | null = null;

export const isNotificationsEnvironmentSupported = () =>
	(Platform.OS === 'android' || Platform.OS === 'ios') && isNotificationsRuntimeAvailable();
const supportsAndroidNotificationChannels = () =>
	Platform.OS === 'android' && (typeof Platform.Version !== 'number' || Platform.Version >= 26);

export const getMandatoryReminderChannelConfig = (kind: MandatoryReminderKind) => LOCAL_NOTIFICATION_CHANNELS[kind];

export const ensureLocalNotificationChannel = async (kind: LocalNotificationChannelKind) => {
	if (!supportsAndroidNotificationChannels()) {
		return true;
	}

	const channel = LOCAL_NOTIFICATION_CHANNELS[kind];
	await Notifications.setNotificationChannelAsync(channel.id, {
		name: channel.name,
		description: channel.description,
		importance: Notifications.AndroidImportance.HIGH,
		lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
		sound: 'default',
		enableVibrate: true,
		vibrationPattern: [0, 250, 200, 250],
		enableLights: true,
		lightColor: '#FFE000',
		showBadge: false,
	});

	return true;
};

export const ensureMandatoryReminderNotificationChannel = (kind: MandatoryReminderKind) =>
	ensureLocalNotificationChannel(kind);

const isAndroidChannelEnabled = (channel: NotificationChannel | null) =>
	Boolean(channel && channel.importance > Notifications.AndroidImportance.NONE);

export const isMandatoryReminderNotificationChannelEnabled = async (kind: MandatoryReminderKind) => {
	if (Platform.OS !== 'android') {
		return true;
	}
	if (!supportsAndroidNotificationChannels()) {
		return true;
	}

	await ensureMandatoryReminderNotificationChannel(kind);
	return isAndroidChannelEnabled(
		await Notifications.getNotificationChannelAsync(getMandatoryReminderChannelConfig(kind).id),
	);
};

export const ensureMandatoryReminderNotificationChannels = async () => {
	await Promise.all([
		ensureMandatoryReminderNotificationChannel('expense'),
		ensureMandatoryReminderNotificationChannel('gain'),
	]);
};

export const ensureLocalNotificationChannels = ensureMandatoryReminderNotificationChannels;

const isPermissionGranted = (status: NotificationPermissionsStatus) => status.granted === true;

export const hasLocalNotificationPermission = async () => {
	if (!isNotificationsEnvironmentSupported()) {
		return false;
	}

	return isPermissionGranted(await Notifications.getPermissionsAsync());
};

export const requestLocalNotificationPermission = async () => {
	if (!isNotificationsEnvironmentSupported()) {
		return false;
	}

	await ensureLocalNotificationChannels();
	return isPermissionGranted(
		await Notifications.requestPermissionsAsync({
			ios: {
				allowAlert: true,
				allowBadge: false,
				allowSound: true,
			},
		}),
	);
};

export const ensureLocalNotificationPermission = async ({
	requestIfNeeded = true,
}: {
	requestIfNeeded?: boolean;
} = {}): Promise<LocalNotificationPermissionResult> => {
	if (!isNotificationsEnvironmentSupported()) {
		return { granted: false, reason: 'unavailable' };
	}

	try {
		if (await hasLocalNotificationPermission()) {
			return { granted: true };
		}

		if (!requestIfNeeded) {
			return { granted: false, reason: 'permissions-denied' };
		}

		return (await requestLocalNotificationPermission())
			? { granted: true }
			: { granted: false, reason: 'permissions-denied' };
	} catch (error) {
		console.error('Erro ao verificar a permissão de notificações:', error);
		return { granted: false, reason: 'permissions-denied' };
	}
};

const registerForegroundNotificationHandler = () => {
	if (hasRegisteredNotificationHandler || !isNotificationsEnvironmentSupported()) {
		return;
	}

	Notifications.setNotificationHandler({
		handleNotification: async () => ({
			shouldShowBanner: true,
			shouldShowList: true,
			shouldPlaySound: true,
			shouldSetBadge: false,
			priority: Notifications.AndroidNotificationPriority.HIGH,
		}),
		handleError: (notificationId, error) => {
			console.error(`Erro ao apresentar a notificação ${notificationId}:`, error);
		},
	});
	hasRegisteredNotificationHandler = true;
};

const cleanupLegacyNotificationState = async () => {
	if ((await AsyncStorage.getItem(LEGACY_MIGRATION_STORAGE_KEY)) === 'complete') {
		return;
	}

	// O app não possuía outros agendadores locais. A limpeza integral impede que lembretes
	// Expo antigos sobrevivam à troca do motor e que o Notifee volte a renová-los.
	await Notifications.cancelAllScheduledNotificationsAsync();
	await Promise.all(LEGACY_STORAGE_KEYS.map(key => AsyncStorage.removeItem(key)));

	if (Platform.OS === 'android') {
		await Promise.all(
			LEGACY_ANDROID_CHANNEL_IDS.map(async channelId => {
				try {
					await Notifications.deleteNotificationChannelAsync(channelId);
				} catch (error) {
					console.warn(`Não foi possível remover o canal legado ${channelId}:`, error);
				}
			}),
		);
	}

	await AsyncStorage.setItem(LEGACY_MIGRATION_STORAGE_KEY, 'complete');
};

export const ensureLegacyNotificationMigration = async () => {
	if (!legacyMigrationPromise) {
		legacyMigrationPromise = cleanupLegacyNotificationState().catch(error => {
			legacyMigrationPromise = null;
			throw error;
		});
	}

	await legacyMigrationPromise;
};

const cleanupRemovedTestNotificationChannels = async () => {
	if ((await AsyncStorage.getItem(REMOVED_TEST_CHANNELS_CLEANUP_STORAGE_KEY)) === 'complete') {
		return;
	}

	if (Platform.OS === 'android') {
		await Promise.all(
			REMOVED_TEST_ANDROID_CHANNEL_IDS.map(async channelId => {
				try {
					await Notifications.deleteNotificationChannelAsync(channelId);
				} catch (error) {
					console.warn(`Não foi possível remover o canal de teste descontinuado ${channelId}:`, error);
				}
			}),
		);
	}

	await AsyncStorage.setItem(REMOVED_TEST_CHANNELS_CLEANUP_STORAGE_KEY, 'complete');
};

const ensureRemovedTestNotificationChannelsCleanup = async () => {
	if (!removedTestChannelsCleanupPromise) {
		removedTestChannelsCleanupPromise = cleanupRemovedTestNotificationChannels().catch(error => {
			removedTestChannelsCleanupPromise = null;
			throw error;
		});
	}

	await removedTestChannelsCleanupPromise;
};

export const bootstrapLocalNotifications = async () => {
	registerForegroundNotificationHandler();
	if (!isNotificationsEnvironmentSupported()) {
		return;
	}

	if (!bootstrapPromise) {
		bootstrapPromise = (async () => {
			await ensureLegacyNotificationMigration();
			await ensureRemovedTestNotificationChannelsCleanup();
			await ensureLocalNotificationChannels();
		})().catch(error => {
			bootstrapPromise = null;
			console.error('Erro ao inicializar as notificações locais:', error);
		});
	}

	await bootstrapPromise;
};
