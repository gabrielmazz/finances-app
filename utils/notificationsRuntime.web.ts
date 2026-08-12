import type * as ExpoNotifications from 'expo-notifications';

type ExpoNotificationsModule = typeof ExpoNotifications;

const unavailablePermission = {
	granted: false,
	canAskAgain: false,
	status: 'denied',
} as ExpoNotifications.NotificationPermissionsStatus;

// O Web não usa expo-notifications: lembretes continuam exclusivos de builds
// Android/iOS instaladas, sem carregar o módulo nativo no bundle do navegador.
export const isExpoGoNotificationsRuntime = () => false;
export const isNotificationsRuntimeAvailable = () => false;

export const Notifications = {
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
		throw new Error('Lembretes agendados estão disponíveis somente no aplicativo Android ou iOS.');
	},
} as unknown as ExpoNotificationsModule;

export type { ExpoNotificationsModule };
export type {
	NotificationChannel,
	NotificationPermissionsStatus,
	NotificationRequest,
} from 'expo-notifications';
