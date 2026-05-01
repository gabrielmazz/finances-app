import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type NotificationsModule = typeof import('expo-notifications');
export type MandatoryReminderKind = 'expense' | 'gain';

type GetNotificationsModuleOptions = {
	warnIfUnavailable?: boolean;
};

type EnsureChannelOptions = {
	warnIfUnavailable?: boolean;
};

type MandatoryReminderChannelConfig = {
	id: string;
	name: string;
	description: string;
};

const MANDATORY_REMINDER_CHANNELS: Record<MandatoryReminderKind, MandatoryReminderChannelConfig> = {
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

export const ensureMandatoryReminderNotificationChannel = async (
	kind: MandatoryReminderKind,
	{ warnIfUnavailable = true }: EnsureChannelOptions = {},
) => {
	if (Platform.OS !== 'android') {
		return true;
	}

	const Notifications = getNotificationsModule({ warnIfUnavailable });
	if (!Notifications) {
		return false;
	}

	const channel = getMandatoryReminderChannelConfig(kind);
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

export const ensureMandatoryReminderNotificationChannels = async (options?: EnsureChannelOptions) => {
	await Promise.all(
		(Object.keys(MANDATORY_REMINDER_CHANNELS) as MandatoryReminderKind[]).map(kind =>
			ensureMandatoryReminderNotificationChannel(kind, options),
		),
	);
};

export const bootstrapLocalNotifications = async () => {
	const didConfigureHandler = configureLocalNotificationHandler();
	if (!didConfigureHandler) {
		return;
	}

	await ensureMandatoryReminderNotificationChannels({ warnIfUnavailable: false });
};
