import type * as ExpoNotifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';

type ExpoNotificationsModule = typeof ExpoNotifications;

let notificationModule: ExpoNotificationsModule | null | undefined;
let didReportUnavailableRuntime = false;

// [[Notificações]]: o pacote registra um erro no Expo Go Android ao ser avaliado,
// mesmo quando o app usa apenas lembretes locais. Não o carregue nesse host.
export const isExpoGoNotificationsRuntime = () =>
	Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const unavailablePermission = {
	granted: false,
	canAskAgain: false,
	status: 'denied',
} as ExpoNotifications.NotificationPermissionsStatus;

const unavailableModule = {
	AndroidImportance: { NONE: 0, HIGH: 4 },
	AndroidNotificationVisibility: { PRIVATE: 0 },
	AndroidNotificationPriority: { HIGH: 2 },
	SchedulableTriggerInputTypes: { DATE: 'date' },
	setNotificationChannelAsync: async () => undefined,
	getNotificationChannelAsync: async () => null,
	deleteNotificationChannelAsync: async () => undefined,
	getPermissionsAsync: async () => unavailablePermission,
	requestPermissionsAsync: async () => unavailablePermission,
	setNotificationHandler: () => undefined,
	cancelAllScheduledNotificationsAsync: async () => undefined,
	cancelScheduledNotificationAsync: async () => undefined,
	getAllScheduledNotificationsAsync: async () => [],
	scheduleNotificationAsync: async () => {
		throw new Error('expo-notifications não está disponível neste runtime.');
	},
} as unknown as ExpoNotificationsModule;

const loadNotificationsModule = () => {
	if (notificationModule !== undefined) {
		return notificationModule;
	}

	if (isExpoGoNotificationsRuntime()) {
		notificationModule = null;
		return notificationModule;
	}

	try {
		notificationModule = require('expo-notifications') as ExpoNotificationsModule;
	} catch (error) {
		notificationModule = null;
		if (!didReportUnavailableRuntime) {
			didReportUnavailableRuntime = true;
			console.warn('Notificações locais indisponíveis neste runtime:', error);
		}
	}

	return notificationModule;
};

export const isNotificationsRuntimeAvailable = () => loadNotificationsModule() !== null;

// Mantém os serviços de lembretes carregáveis mesmo quando o módulo nativo não existe.
export const Notifications = new Proxy(unavailableModule, {
	get(_target, property, receiver) {
		const module = loadNotificationsModule();
		return Reflect.get(module ?? unavailableModule, property, receiver);
	},
}) as ExpoNotificationsModule;

export type { ExpoNotificationsModule };
export type {
	NotificationChannel,
	NotificationPermissionsStatus,
	NotificationRequest,
} from 'expo-notifications';
