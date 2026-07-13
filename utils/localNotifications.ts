import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { Notification } from '@notifee/react-native';

export type MandatoryReminderKind = 'expense' | 'gain';
export type LocalNotificationChannelKind = MandatoryReminderKind | 'systemTest';

export type LocalNotificationPermissionResult =
	| { granted: true }
	| { granted: false; reason: 'permissions-denied' | 'unavailable' };

export type LocalNotificationTestResult =
	| {
			success: true;
			notificationId: string;
			title: string;
			body: string;
		}
	| {
			success: false;
			reason: 'permissions-denied' | 'unavailable' | 'schedule-error';
			message: string;
		};

export type NotifeeRuntime = {
	notifee: typeof import('@notifee/react-native').default;
	AuthorizationStatus: typeof import('@notifee/react-native').AuthorizationStatus;
	AndroidImportance: typeof import('@notifee/react-native').AndroidImportance;
	EventType: typeof import('@notifee/react-native').EventType;
	TriggerType: typeof import('@notifee/react-native').TriggerType;
};

type GetNotifeeOptions = {
	warnIfUnavailable?: boolean;
};

type EnsureChannelOptions = {
	warnIfUnavailable?: boolean;
};

type LocalNotificationChannelConfig = {
	id: string;
	name: string;
	description: string;
};

const LEGACY_REMINDER_STORAGE_KEY = '@mandatoryReminderNotifications';
const LEGACY_MIGRATION_STORAGE_KEY = '@mandatoryReminderNotifications:notifee-migration-v1';

// Versioned IDs keep the old Expo channels isolated during the one-release migration.
const LOCAL_NOTIFICATION_CHANNELS: Record<LocalNotificationChannelKind, LocalNotificationChannelConfig> = {
	expense: {
		id: 'mandatory-expenses-v3-notifee',
		name: 'Gastos obrigatórios',
		description: 'Lembretes para os gastos obrigatórios cadastrados.',
	},
	gain: {
		id: 'mandatory-gains-v3-notifee',
		name: 'Ganhos obrigatórios',
		description: 'Lembretes para os ganhos obrigatórios cadastrados.',
	},
	systemTest: {
		id: 'system-tests-v2-notifee',
		name: 'Testes do sistema',
		description: 'Notificações disparadas pela tela de testes do aplicativo.',
	},
};

const MANDATORY_REMINDER_CHANNELS: Record<MandatoryReminderKind, LocalNotificationChannelConfig> = {
	expense: LOCAL_NOTIFICATION_CHANNELS.expense,
	gain: LOCAL_NOTIFICATION_CHANNELS.gain,
};

let cachedNotifeeRuntime: NotifeeRuntime | null = null;
let hasWarnedUnavailableEnvironment = false;
let hasRegisteredForegroundEvents = false;
let hasRegisteredBackgroundEvents = false;
let legacyMigrationPromise: Promise<void> | null = null;

export const isExpoGoEnvironment = Constants.appOwnership === 'expo' || Boolean(Constants.expoGoConfig);

export const isNotificationsEnvironmentSupported = () => {
	if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
		return false;
	}

	return !isExpoGoEnvironment;
};

export const warnNotificationsUnavailable = () => {
	if (hasWarnedUnavailableEnvironment) {
		return;
	}

	hasWarnedUnavailableEnvironment = true;
	console.warn(
		'Os lembretes locais exigem um build de desenvolvimento ou produção. O Expo Go não inclui o módulo nativo Notifee.',
	);
};

export const getNotifeeRuntime = ({ warnIfUnavailable = true }: GetNotifeeOptions = {}): NotifeeRuntime | null => {
	if (!isNotificationsEnvironmentSupported()) {
		if (warnIfUnavailable) {
			warnNotificationsUnavailable();
		}
		return null;
	}

	if (!cachedNotifeeRuntime) {
		try {
			// Notifee is loaded only in native builds so web/Expo Go never resolve a missing native module.
			// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
			const module = require('@notifee/react-native') as typeof import('@notifee/react-native');
			cachedNotifeeRuntime = {
				notifee: module.default ?? (module as unknown as typeof import('@notifee/react-native').default),
				AuthorizationStatus: module.AuthorizationStatus,
				AndroidImportance: module.AndroidImportance,
				EventType: module.EventType,
				TriggerType: module.TriggerType,
			};
		} catch (error) {
			console.error('Não foi possível carregar o módulo nativo Notifee:', error);
			return null;
		}
	}

	return cachedNotifeeRuntime;
};

export const getMandatoryReminderChannelConfig = (kind: MandatoryReminderKind) => MANDATORY_REMINDER_CHANNELS[kind];
export const getSystemTestNotificationChannelConfig = () => LOCAL_NOTIFICATION_CHANNELS.systemTest;

export const ensureLocalNotificationChannel = async (
	kind: LocalNotificationChannelKind,
	{ warnIfUnavailable = true }: EnsureChannelOptions = {},
) => {
	if (Platform.OS !== 'android') {
		return true;
	}

	const runtime = getNotifeeRuntime({ warnIfUnavailable });
	if (!runtime) {
		return false;
	}

	const channel = LOCAL_NOTIFICATION_CHANNELS[kind];
	await runtime.notifee.createChannel({
		id: channel.id,
		name: channel.name,
		description: channel.description,
		importance: runtime.AndroidImportance.HIGH,
		vibration: true,
		sound: 'default',
	});
	return true;
};

export const ensureMandatoryReminderNotificationChannel = async (
	kind: MandatoryReminderKind,
	options?: EnsureChannelOptions,
) => ensureLocalNotificationChannel(kind, options);

export const ensureMandatoryReminderNotificationChannels = async (options?: EnsureChannelOptions) => {
	await Promise.all(
		(Object.keys(MANDATORY_REMINDER_CHANNELS) as MandatoryReminderKind[]).map(kind =>
			ensureMandatoryReminderNotificationChannel(kind, options),
		),
	);
};

export const ensureSystemTestNotificationChannel = async (options?: EnsureChannelOptions) =>
	ensureLocalNotificationChannel('systemTest', options);

export const ensureLocalNotificationChannels = async (options?: EnsureChannelOptions) => {
	await Promise.all(
		(Object.keys(LOCAL_NOTIFICATION_CHANNELS) as LocalNotificationChannelKind[]).map(kind =>
			ensureLocalNotificationChannel(kind, options),
		),
	);
};

const isPermissionGranted = (runtime: NotifeeRuntime, authorizationStatus: number) =>
	authorizationStatus >= runtime.AuthorizationStatus.AUTHORIZED;

export const hasLocalNotificationPermission = async () => {
	const runtime = getNotifeeRuntime();
	if (!runtime) {
		return false;
	}

	const settings = await runtime.notifee.getNotificationSettings();
	return isPermissionGranted(runtime, settings.authorizationStatus);
};

export const requestLocalNotificationPermission = async () => {
	const runtime = getNotifeeRuntime();
	if (!runtime) {
		return false;
	}

	await ensureLocalNotificationChannels();
	const settings = await runtime.notifee.requestPermission({
		alert: true,
		badge: false,
		sound: true,
	});
	return isPermissionGranted(runtime, settings.authorizationStatus);
};

export const ensureLocalNotificationPermission = async ({
	requestIfNeeded = true,
}: {
	requestIfNeeded?: boolean;
} = {}): Promise<LocalNotificationPermissionResult> => {
	if (!getNotifeeRuntime()) {
		return { granted: false, reason: 'unavailable' };
	}

	if (await hasLocalNotificationPermission()) {
		return { granted: true };
	}

	if (!requestIfNeeded) {
		return { granted: false, reason: 'permissions-denied' };
	}

	try {
		return (await requestLocalNotificationPermission())
			? { granted: true }
			: { granted: false, reason: 'permissions-denied' };
	} catch (error) {
		console.error('Erro ao solicitar a permissão de notificações:', error);
		return { granted: false, reason: 'permissions-denied' };
	}
};

const scheduleNextMandatoryReminderFromDelivery = async (notification?: Notification) => {
	if (Platform.OS !== 'android' || !notification) {
		return;
	}

	try {
		// Avoid a circular startup dependency: this is only resolved after a reminder was delivered.
		// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
		const { scheduleNextMandatoryReminderFromNotification } = require('@/utils/mandatoryReminderNotifications') as typeof import('@/utils/mandatoryReminderNotifications');
		await scheduleNextMandatoryReminderFromNotification(notification);
	} catch (error) {
		console.error('Erro ao preparar o próximo lembrete obrigatório:', error);
	}
};

const registerForegroundEvents = () => {
	const runtime = getNotifeeRuntime({ warnIfUnavailable: false });
	if (!runtime || hasRegisteredForegroundEvents) {
		return;
	}

	runtime.notifee.onForegroundEvent(async ({ type, detail }) => {
		if (type === runtime.EventType.DELIVERED) {
			await scheduleNextMandatoryReminderFromDelivery(detail.notification);
		}
	});
	hasRegisteredForegroundEvents = true;
};

export const registerLocalNotificationBackgroundHandler = () => {
	const runtime = getNotifeeRuntime({ warnIfUnavailable: false });
	if (!runtime || hasRegisteredBackgroundEvents) {
		return false;
	}

	// Notifee accepts one background handler. index.ts registers it before Expo Router starts.
	runtime.notifee.onBackgroundEvent(async ({ type, detail }) => {
		if (type === runtime.EventType.DELIVERED) {
			await scheduleNextMandatoryReminderFromDelivery(detail.notification);
		}
	});
	hasRegisteredBackgroundEvents = true;
	return true;
};

const migrateLegacyExpoSchedules = async () => {
	const migrationComplete = await AsyncStorage.getItem(LEGACY_MIGRATION_STORAGE_KEY);
	if (migrationComplete) {
		return;
	}

	const legacySchedules = await AsyncStorage.getItem(LEGACY_REMINDER_STORAGE_KEY);
	if (!legacySchedules) {
		await AsyncStorage.setItem(LEGACY_MIGRATION_STORAGE_KEY, 'no-legacy-schedules');
		return;
	}

	try {
		// The Expo module remains in this release only to cancel alarms created by prior builds.
		// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
		const legacyNotifications = require('expo-notifications') as typeof import('expo-notifications');
		await legacyNotifications.cancelAllScheduledNotificationsAsync();
		await AsyncStorage.removeItem(LEGACY_REMINDER_STORAGE_KEY);
		await AsyncStorage.setItem(LEGACY_MIGRATION_STORAGE_KEY, 'cancelled');
	} catch (error) {
		console.warn('Não foi possível limpar os agendamentos legados do Expo Notifications:', error);
	}
};

export const ensureLegacyNotificationMigration = async () => {
	if (!legacyMigrationPromise) {
		legacyMigrationPromise = migrateLegacyExpoSchedules();
	}

	await legacyMigrationPromise;
};

export const sendLocalNotificationTest = async (): Promise<LocalNotificationTestResult> => {
	const runtime = getNotifeeRuntime();
	if (!runtime) {
		return {
			success: false,
			reason: 'unavailable',
			message: 'As notificações locais exigem um build de desenvolvimento ou produção.',
		};
	}

	const permission = await ensureLocalNotificationPermission();
	if (!permission.granted) {
		return {
			success: false,
			reason: permission.reason,
			message:
				permission.reason === 'unavailable'
					? 'As notificações locais exigem um build de desenvolvimento ou produção.'
					: 'As notificações do aplicativo estão desativadas para este dispositivo.',
		};
	}

	try {
		await ensureSystemTestNotificationChannel();
		const channel = getSystemTestNotificationChannelConfig();
		const title = 'Teste de notificação';
		const body = 'Se esta mensagem apareceu, as notificações locais do Lumus Finanças estão funcionando neste dispositivo.';
		const notificationId = await runtime.notifee.displayNotification({
			title,
			body,
			data: {
				kind: 'system-test',
				triggeredAt: new Date().toISOString(),
			},
			android: {
				channelId: channel.id,
				pressAction: { id: 'default' },
			},
			ios: {
				sound: 'default',
			},
		});

		return { success: true, notificationId, title, body };
	} catch (error) {
		console.error('Erro ao disparar notificação local de teste:', error);
		return {
			success: false,
			reason: 'schedule-error',
			message: 'Não foi possível disparar a notificação de teste neste dispositivo.',
		};
	}
};

export const openLocalNotificationSettings = async () => {
	const runtime = getNotifeeRuntime();
	if (!runtime) {
		return false;
	}

	await runtime.notifee.openNotificationSettings(
		Platform.OS === 'android' ? getSystemTestNotificationChannelConfig().id : undefined,
	);
	return true;
};

export const bootstrapLocalNotifications = async () => {
	const runtime = getNotifeeRuntime({ warnIfUnavailable: false });
	if (!runtime) {
		return;
	}

	try {
		await ensureLegacyNotificationMigration();
		await ensureLocalNotificationChannels({ warnIfUnavailable: false });
		registerForegroundEvents();
	} catch (error) {
		console.error('Erro ao inicializar as notificações locais:', error);
	}
};
