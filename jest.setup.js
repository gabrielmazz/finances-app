const mockNotificationState = {
	platformOS: 'android',
	appOwnership: 'standalone',
	expoGoConfig: null,
	permissions: { authorizationStatus: 1 },
	requestPermissions: { authorizationStatus: 1 },
	storage: {},
	triggerNotifications: [],
	displayedNotifications: [],
	nextNotificationId: 1,
	foregroundEventHandler: null,
	backgroundEventHandler: null,
};

global.__mockNotificationState = mockNotificationState;

global.__resetNotificationMockState = () => {
	mockNotificationState.platformOS = 'android';
	mockNotificationState.appOwnership = 'standalone';
	mockNotificationState.expoGoConfig = null;
	mockNotificationState.permissions = { authorizationStatus: 1 };
	mockNotificationState.requestPermissions = { authorizationStatus: 1 };
	mockNotificationState.storage = {};
	mockNotificationState.triggerNotifications = [];
	mockNotificationState.displayedNotifications = [];
	mockNotificationState.nextNotificationId = 1;
	mockNotificationState.foregroundEventHandler = null;
	mockNotificationState.backgroundEventHandler = null;
};

jest.mock('react-native', () => ({
	__esModule: true,
	Keyboard: {
		dismiss: jest.fn(),
	},
	Platform: {
		get OS() {
			return mockNotificationState.platformOS;
		},
		select: options => options?.[mockNotificationState.platformOS] ?? options?.default,
	},
}));

const constantsMock = {};
Object.defineProperties(constantsMock, {
	appOwnership: {
		get: () => mockNotificationState.appOwnership,
	},
	expoGoConfig: {
		get: () => mockNotificationState.expoGoConfig,
	},
});

jest.mock('expo-constants', () => ({
	__esModule: true,
	default: constantsMock,
	...constantsMock,
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
	__esModule: true,
	default: {
		getItem: jest.fn(async key => mockNotificationState.storage[key] ?? null),
		setItem: jest.fn(async (key, value) => {
			mockNotificationState.storage[key] = value;
		}),
		removeItem: jest.fn(async key => {
			delete mockNotificationState.storage[key];
		}),
		clear: jest.fn(async () => {
			mockNotificationState.storage = {};
		}),
	},
}));

jest.mock('@notifee/react-native', () => {
	const notifee = {
		createChannel: jest.fn(async channel => channel.id),
		getNotificationSettings: jest.fn(async () => mockNotificationState.permissions),
		requestPermission: jest.fn(async () => mockNotificationState.requestPermissions),
		displayNotification: jest.fn(async notification => {
			const id = notification.id ?? `displayed-${mockNotificationState.nextNotificationId}`;
			mockNotificationState.nextNotificationId += 1;
			mockNotificationState.displayedNotifications.push({ id, notification });
			return id;
		}),
		createTriggerNotification: jest.fn(async (notification, trigger) => {
			const id = notification.id ?? `trigger-${mockNotificationState.nextNotificationId}`;
			mockNotificationState.nextNotificationId += 1;
			mockNotificationState.triggerNotifications = mockNotificationState.triggerNotifications.filter(
				entry => entry.id !== id,
			);
			mockNotificationState.triggerNotifications.push({ id, notification, trigger });
			return id;
		}),
		getTriggerNotificationIds: jest.fn(async () => mockNotificationState.triggerNotifications.map(entry => entry.id)),
		cancelNotification: jest.fn(async id => {
			mockNotificationState.triggerNotifications = mockNotificationState.triggerNotifications.filter(entry => entry.id !== id);
			mockNotificationState.displayedNotifications = mockNotificationState.displayedNotifications.filter(entry => entry.id !== id);
		}),
		onForegroundEvent: jest.fn(handler => {
			mockNotificationState.foregroundEventHandler = handler;
			return jest.fn();
		}),
		onBackgroundEvent: jest.fn(handler => {
			mockNotificationState.backgroundEventHandler = handler;
		}),
		openNotificationSettings: jest.fn(async () => undefined),
	};

	return {
		__esModule: true,
		default: notifee,
		AuthorizationStatus: {
			NOT_DETERMINED: -1,
			DENIED: 0,
			AUTHORIZED: 1,
			PROVISIONAL: 2,
		},
		AndroidImportance: {
			HIGH: 4,
		},
		TriggerType: {
			TIMESTAMP: 0,
		},
		EventType: {
			DELIVERED: 3,
		},
	};
});

jest.mock('expo-notifications', () => ({
	__esModule: true,
	cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
}));
