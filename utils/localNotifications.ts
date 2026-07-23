import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

import {
	Notifications,
	isNotificationsRuntimeAvailable,
	type NotificationChannel,
	type NotificationPermissionsStatus,
} from '@/utils/notificationsRuntime';

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
			scheduledFor?: Date;
		}
	| {
			success: false;
			reason: 'permissions-denied' | 'channel-disabled' | 'unavailable' | 'schedule-error';
			message: string;
		};

export type LocalNotificationDiagnostics = {
	supported: boolean;
	permissionGranted: boolean;
	canAskAgain: boolean;
	scheduledCount: number;
	mandatoryReminderCount: number;
	expenseChannelEnabled: boolean | null;
	gainChannelEnabled: boolean | null;
	testChannelEnabled: boolean | null;
};

type LocalNotificationChannelConfig = {
	id: string;
	name: string;
	description: string;
};

const LEGACY_MIGRATION_STORAGE_KEY = '@lumusNotifications:legacy-cleanup-v1';
const ANDROID_APPLICATION_ID = 'com.gabrielmazz.lumusfinances';
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
	'system-tests-v1',
	'system-tests-v2-notifee',
];

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
	systemTest: {
		id: 'system-tests-v1-expo',
		name: 'Testes de notificações',
		description: 'Notificações disparadas pela central de testes do Lumus Finanças.',
	},
};

let hasRegisteredNotificationHandler = false;
let legacyMigrationPromise: Promise<void> | null = null;
let bootstrapPromise: Promise<void> | null = null;

export const isNotificationsEnvironmentSupported = () =>
	(Platform.OS === 'android' || Platform.OS === 'ios') && isNotificationsRuntimeAvailable();
const supportsAndroidNotificationChannels = () =>
	Platform.OS === 'android' && (typeof Platform.Version !== 'number' || Platform.Version >= 26);

export const getMandatoryReminderChannelConfig = (kind: MandatoryReminderKind) => LOCAL_NOTIFICATION_CHANNELS[kind];
export const getSystemTestNotificationChannelConfig = () => LOCAL_NOTIFICATION_CHANNELS.systemTest;

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

export const isSystemTestNotificationChannelEnabled = async () => {
	if (Platform.OS !== 'android') {
		return true;
	}
	if (!supportsAndroidNotificationChannels()) {
		return true;
	}

	await ensureSystemTestNotificationChannel();
	return isAndroidChannelEnabled(
		await Notifications.getNotificationChannelAsync(getSystemTestNotificationChannelConfig().id),
	);
};

export const ensureMandatoryReminderNotificationChannels = async () => {
	await Promise.all([
		ensureMandatoryReminderNotificationChannel('expense'),
		ensureMandatoryReminderNotificationChannel('gain'),
	]);
};

export const ensureSystemTestNotificationChannel = () => ensureLocalNotificationChannel('systemTest');

export const ensureLocalNotificationChannels = async () => {
	await Promise.all([
		ensureMandatoryReminderNotificationChannels(),
		ensureSystemTestNotificationChannel(),
	]);
};

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

const buildTestContent = () => ({
	title: 'Teste de notificação',
	body: 'As notificações locais do Lumus Finanças estão funcionando neste dispositivo.',
});

const permissionFailureResult = (permission: LocalNotificationPermissionResult): LocalNotificationTestResult => ({
	success: false,
	reason: permission.granted ? 'schedule-error' : permission.reason,
	message:
		!permission.granted && permission.reason === 'unavailable'
			? 'As notificações locais exigem um development build instalado neste ambiente.'
			: 'As notificações do aplicativo estão desativadas para este dispositivo.',
});

export const sendLocalNotificationTest = async (): Promise<LocalNotificationTestResult> => {
	const permission = await ensureLocalNotificationPermission();
	if (!permission.granted) {
		return permissionFailureResult(permission);
	}

	try {
		await ensureLegacyNotificationMigration();
		if (!(await isSystemTestNotificationChannelEnabled())) {
			return {
				success: false,
				reason: 'channel-disabled',
				message: 'O canal de testes está desativado nas configurações de notificações do Android.',
			};
		}
		const content = buildTestContent();
		const notificationId = await Notifications.scheduleNotificationAsync({
			identifier: `lumus-system-test-now-${Date.now()}`,
			content: {
				...content,
				sound: 'default',
				priority: Notifications.AndroidNotificationPriority.HIGH,
				data: { notificationSystem: 'lumus-system-test-v1', mode: 'immediate' },
			},
			trigger: Platform.OS === 'android' ? { channelId: getSystemTestNotificationChannelConfig().id } : null,
		});

		return { success: true, notificationId, ...content };
	} catch (error) {
		console.error('Erro ao disparar a notificação local de teste:', error);
		return {
			success: false,
			reason: 'schedule-error',
			message: 'Não foi possível disparar a notificação de teste neste dispositivo.',
		};
	}
};

export const scheduleLocalNotificationTest = async (delaySeconds = 15): Promise<LocalNotificationTestResult> => {
	const permission = await ensureLocalNotificationPermission();
	if (!permission.granted) {
		return permissionFailureResult(permission);
	}

	try {
		await ensureLegacyNotificationMigration();
		if (!(await isSystemTestNotificationChannelEnabled())) {
			return {
				success: false,
				reason: 'channel-disabled',
				message: 'O canal de testes está desativado nas configurações de notificações do Android.',
			};
		}
		const content = buildTestContent();
		const scheduledFor = new Date(Date.now() + Math.max(5, Math.trunc(delaySeconds)) * 1000);
		const notificationId = await Notifications.scheduleNotificationAsync({
			identifier: `lumus-system-test-scheduled-${scheduledFor.getTime()}`,
			content: {
				...content,
				body: 'Este aviso foi agendado pela central de testes. O motor de datas concretas está funcionando.',
				sound: 'default',
				priority: Notifications.AndroidNotificationPriority.HIGH,
				data: { notificationSystem: 'lumus-system-test-v1', mode: 'scheduled' },
			},
			trigger: {
				type: Notifications.SchedulableTriggerInputTypes.DATE,
				date: scheduledFor,
				...(Platform.OS === 'android' ? { channelId: getSystemTestNotificationChannelConfig().id } : {}),
			},
		});

		return {
			success: true,
			notificationId,
			title: content.title,
			body: 'Este aviso foi agendado pela central de testes. O motor de datas concretas está funcionando.',
			scheduledFor,
		};
	} catch (error) {
		console.error('Erro ao agendar a notificação local de teste:', error);
		return {
			success: false,
			reason: 'schedule-error',
			message: 'Não foi possível criar o teste agendado neste dispositivo.',
		};
	}
};

export const getLocalNotificationDiagnostics = async (): Promise<LocalNotificationDiagnostics> => {
	if (!isNotificationsEnvironmentSupported()) {
		return {
			supported: false,
			permissionGranted: false,
			canAskAgain: false,
			scheduledCount: 0,
			mandatoryReminderCount: 0,
			expenseChannelEnabled: null,
			gainChannelEnabled: null,
			testChannelEnabled: null,
		};
	}

	await ensureLegacyNotificationMigration();
	await ensureLocalNotificationChannels();
	const androidChannelsSupported = supportsAndroidNotificationChannels();

	const [permission, scheduled, expenseChannel, gainChannel, testChannel] = await Promise.all([
		Notifications.getPermissionsAsync(),
		Notifications.getAllScheduledNotificationsAsync(),
		androidChannelsSupported
			? Notifications.getNotificationChannelAsync(getMandatoryReminderChannelConfig('expense').id)
			: Promise.resolve(null),
		androidChannelsSupported
			? Notifications.getNotificationChannelAsync(getMandatoryReminderChannelConfig('gain').id)
			: Promise.resolve(null),
		androidChannelsSupported
			? Notifications.getNotificationChannelAsync(getSystemTestNotificationChannelConfig().id)
			: Promise.resolve(null),
	]);

	return {
		supported: true,
		permissionGranted: isPermissionGranted(permission),
		canAskAgain: permission.canAskAgain,
		scheduledCount: scheduled.length,
		mandatoryReminderCount: scheduled.filter(
			request => request.content.data?.notificationSystem === 'lumus-mandatory-reminders-v1',
		).length,
		expenseChannelEnabled: androidChannelsSupported ? isAndroidChannelEnabled(expenseChannel) : null,
		gainChannelEnabled: androidChannelsSupported ? isAndroidChannelEnabled(gainChannel) : null,
		testChannelEnabled: androidChannelsSupported ? isAndroidChannelEnabled(testChannel) : null,
	};
};

export const openLocalNotificationSettings = async () => {
	if (!isNotificationsEnvironmentSupported()) {
		return false;
	}

	if (Platform.OS === 'android') {
		try {
			await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
				{
					key: 'android.provider.extra.APP_PACKAGE',
					value: ANDROID_APPLICATION_ID,
				},
			]);
			return true;
		} catch (error) {
			console.warn('Não foi possível abrir a tela específica de notificações:', error);
		}
	}

	await Linking.openSettings();
	return true;
};

export const bootstrapLocalNotifications = async () => {
	registerForegroundNotificationHandler();
	if (!isNotificationsEnvironmentSupported()) {
		return;
	}

	if (!bootstrapPromise) {
		bootstrapPromise = (async () => {
			await ensureLegacyNotificationMigration();
			await ensureLocalNotificationChannels();
		})().catch(error => {
			bootstrapPromise = null;
			console.error('Erro ao inicializar as notificações locais:', error);
		});
	}

	await bootstrapPromise;
};
