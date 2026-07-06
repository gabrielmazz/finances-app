import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { NotificationPermissionsStatus, NotificationTriggerInput } from 'expo-notifications';

export type NotificationsModule = typeof import('expo-notifications');
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

type GetNotificationsModuleOptions = {
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

const LOCAL_NOTIFICATION_CHANNELS: Record<LocalNotificationChannelKind, LocalNotificationChannelConfig> = {
	expense: {
		id: 'mandatory-expenses-v2',
		name: 'Gastos obrigatórios',
		description: 'Lembretes para os gastos obrigatórios cadastrados.',
	},
	gain: {
		id: 'mandatory-gains-v2',
		name: 'Ganhos obrigatórios',
		description: 'Lembretes para os ganhos obrigatórios cadastrados.',
	},
	systemTest: {
		id: 'system-tests-v1',
		name: 'Testes do sistema',
		description: 'Notificações disparadas pela tela de testes do aplicativo.',
	},
};

const MANDATORY_REMINDER_CHANNELS: Record<MandatoryReminderKind, LocalNotificationChannelConfig> = {
	expense: LOCAL_NOTIFICATION_CHANNELS.expense,
	gain: LOCAL_NOTIFICATION_CHANNELS.gain,
};

let cachedNotificationsModule: NotificationsModule | null = null;
let hasWarnedUnavailableEnvironment = false;
let hasConfiguredNotificationHandler = false;

export const isExpoGoEnvironment = Constants.appOwnership === 'expo' || Boolean(Constants.expoGoConfig);

export const isNotificationsEnvironmentSupported = () => {
	if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
		return false;
	}

	if (isExpoGoEnvironment) {
		return false;
	}

	return true;
};

export const warnNotificationsUnavailable = () => {
	if (hasWarnedUnavailableEnvironment) {
		return;
	}

	hasWarnedUnavailableEnvironment = true;
	console.warn(
		'Os lembretes obrigatórios não podem ser agendados no Expo Go. Use um build de desenvolvimento ou produção para testar notificações.',
	);
};

export const getNotificationsModule = ({
	warnIfUnavailable = true,
}: GetNotificationsModuleOptions = {}): NotificationsModule | null => {
	if (!isNotificationsEnvironmentSupported()) {
		if (warnIfUnavailable) {
			warnNotificationsUnavailable();
		}
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

export const getMandatoryReminderChannelConfig = (kind: MandatoryReminderKind) => MANDATORY_REMINDER_CHANNELS[kind];
export const getSystemTestNotificationChannelConfig = () => LOCAL_NOTIFICATION_CHANNELS.systemTest;

export const configureLocalNotificationHandler = () => {
	const Notifications = getNotificationsModule({ warnIfUnavailable: false });
	if (!Notifications) {
		return false;
	}

	if (hasConfiguredNotificationHandler) {
		return true;
	}

	// Segue [[Notificações]]: o handler precisa ser registrado no entry real do Expo Router.
	Notifications.setNotificationHandler({
		handleNotification: async () => ({
			shouldPlaySound: true,
			shouldSetBadge: false,
			shouldShowBanner: true,
			shouldShowList: true,
		}),
	});
	hasConfiguredNotificationHandler = true;
	return true;
};

export const ensureLocalNotificationChannel = async (
	kind: LocalNotificationChannelKind,
	{ warnIfUnavailable = true }: EnsureChannelOptions = {},
) => {
	if (Platform.OS !== 'android') {
		return true;
	}

	const Notifications = getNotificationsModule({ warnIfUnavailable });
	if (!Notifications) {
		return false;
	}

	const channel = LOCAL_NOTIFICATION_CHANNELS[kind];
	await Notifications.setNotificationChannelAsync(channel.id, {
		name: channel.name,
		importance: Notifications.AndroidImportance.HIGH,
		description: channel.description,
		enableVibrate: true,
		showBadge: true,
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

const isPermissionGranted = (Notifications: NotificationsModule, settings: NotificationPermissionsStatus) =>
	settings.granted === true || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

export const hasLocalNotificationPermission = async () => {
	const Notifications = getNotificationsModule();
	if (!Notifications) {
		warnNotificationsUnavailable();
		return false;
	}

	const settings = await Notifications.getPermissionsAsync();
	return isPermissionGranted(Notifications, settings);
};

export const requestLocalNotificationPermission = async () => {
	const Notifications = getNotificationsModule();
	if (!Notifications) {
		warnNotificationsUnavailable();
		return false;
	}

	configureLocalNotificationHandler();
	await ensureLocalNotificationChannels();

	const settings = await Notifications.requestPermissionsAsync({
		ios: {
			allowAlert: true,
			allowBadge: false,
			allowSound: true,
		},
	});

	return isPermissionGranted(Notifications, settings);
};

export const ensureLocalNotificationPermission = async ({
	requestIfNeeded = true,
}: {
	requestIfNeeded?: boolean;
} = {}): Promise<LocalNotificationPermissionResult> => {
	if (!getNotificationsModule()) {
		warnNotificationsUnavailable();
		return { granted: false, reason: 'unavailable' };
	}

	configureLocalNotificationHandler();

	if (await hasLocalNotificationPermission()) {
		return { granted: true };
	}

	if (!requestIfNeeded) {
		return { granted: false, reason: 'permissions-denied' };
	}

	const granted = await requestLocalNotificationPermission();
	if (granted) {
		return { granted: true };
	}

	return { granted: false, reason: 'permissions-denied' };
};

export const sendLocalNotificationTest = async (): Promise<LocalNotificationTestResult> => {
	const Notifications = getNotificationsModule();
	if (!Notifications) {
		warnNotificationsUnavailable();
		return {
			success: false,
			reason: 'unavailable',
			message: 'As notificações locais não estão disponíveis neste ambiente.',
		};
	}

	configureLocalNotificationHandler();
	const permission = await ensureLocalNotificationPermission();
	if (!permission.granted) {
		return {
			success: false,
			reason: permission.reason,
			message:
				permission.reason === 'unavailable'
					? 'As notificações locais não estão disponíveis neste ambiente.'
					: 'As notificações do aplicativo estão desativadas para este dispositivo.',
		};
	}

	try {
		await ensureSystemTestNotificationChannel();
		const channel = getSystemTestNotificationChannelConfig();
		const title = 'Teste de notificação';
		const body = 'Se esta mensagem apareceu, as notificações locais do Lumus Finanças estão funcionando neste dispositivo.';
		const trigger: NotificationTriggerInput = Platform.OS === 'android' ? { channelId: channel.id } : null;
		const notificationId = await Notifications.scheduleNotificationAsync({
			content: {
				title,
				body,
				sound: true,
				priority: Platform.OS === 'android' ? Notifications.AndroidNotificationPriority.HIGH : undefined,
				vibrate: Platform.OS === 'android' ? [0, 250, 250, 250] : undefined,
				data: {
					kind: 'system-test',
					triggeredAt: new Date().toISOString(),
				},
			},
			trigger,
		});

		return {
			success: true,
			notificationId,
			title,
			body,
		};
	} catch (error) {
		console.error('Erro ao disparar notificação local de teste:', error);
		return {
			success: false,
			reason: 'schedule-error',
			message: 'Não foi possível disparar a notificação de teste neste dispositivo.',
		};
	}
};

export const bootstrapLocalNotifications = async () => {
	const didConfigureHandler = configureLocalNotificationHandler();
	if (!didConfigureHandler) {
		return;
	}

	await ensureLocalNotificationChannels({ warnIfUnavailable: false });
};
