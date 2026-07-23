const mockNotificationState = {
	platformOS: 'android',
	platformVersion: 35,
	permissions: { granted: true, status: 'granted', canAskAgain: true },
	requestPermissions: { granted: true, status: 'granted', canAskAgain: true },
	storage: {},
	scheduledNotifications: [],
	displayedNotifications: [],
	channels: {},
	nextNotificationId: 1,
	notificationHandler: null,
};

global.__mockNotificationState = mockNotificationState;

global.__resetNotificationMockState = () => {
	mockNotificationState.platformOS = 'android';
	mockNotificationState.platformVersion = 35;
	mockNotificationState.permissions = { granted: true, status: 'granted', canAskAgain: true };
	mockNotificationState.requestPermissions = { granted: true, status: 'granted', canAskAgain: true };
	mockNotificationState.storage = {};
	mockNotificationState.scheduledNotifications = [];
	mockNotificationState.displayedNotifications = [];
	mockNotificationState.channels = {};
	mockNotificationState.nextNotificationId = 1;
	mockNotificationState.notificationHandler = null;
};

jest.mock('react-native', () => ({
	__esModule: true,
	Keyboard: {
		dismiss: jest.fn(),
	},
	Linking: {
		openSettings: jest.fn(async () => undefined),
		sendIntent: jest.fn(async () => undefined),
	},
	AppState: {
		addEventListener: jest.fn(() => ({ remove: jest.fn() })),
	},
	Platform: {
		get OS() {
			return mockNotificationState.platformOS;
		},
		get Version() {
			return mockNotificationState.platformVersion;
		},
		select: options => options?.[mockNotificationState.platformOS] ?? options?.default,
	},
}));

jest.mock('expo-constants', () => ({
	__esModule: true,
	default: { executionEnvironment: 'bare' },
	ExecutionEnvironment: {
		Bare: 'bare',
		Standalone: 'standalone',
		StoreClient: 'storeClient',
	},
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

jest.mock('expo-notifications', () => {
	const SchedulableTriggerInputTypes = {
		DATE: 'date',
		TIME_INTERVAL: 'timeInterval',
		DAILY: 'daily',
		WEEKLY: 'weekly',
		MONTHLY: 'monthly',
		YEARLY: 'yearly',
		CALENDAR: 'calendar',
	};
	const AndroidImportance = {
		NONE: 0,
		HIGH: 4,
	};
	const AndroidNotificationVisibility = {
		PRIVATE: 2,
	};
	const AndroidNotificationPriority = {
		HIGH: 'high',
	};

	return {
		__esModule: true,
		SchedulableTriggerInputTypes,
		AndroidImportance,
		AndroidNotificationVisibility,
		AndroidNotificationPriority,
		setNotificationHandler: jest.fn(handler => {
			mockNotificationState.notificationHandler = handler;
		}),
		setNotificationChannelAsync: jest.fn(async (id, channel) => {
			const existingChannel = mockNotificationState.channels[id];
			mockNotificationState.channels[id] = existingChannel?.userDisabled
				? { id, ...channel, importance: AndroidImportance.NONE, userDisabled: true }
				: { id, ...channel };
			return mockNotificationState.channels[id];
		}),
		deleteNotificationChannelAsync: jest.fn(async id => {
			delete mockNotificationState.channels[id];
		}),
		getNotificationChannelAsync: jest.fn(async id => mockNotificationState.channels[id] ?? null),
		getPermissionsAsync: jest.fn(async () => mockNotificationState.permissions),
		requestPermissionsAsync: jest.fn(async () => {
			mockNotificationState.permissions = mockNotificationState.requestPermissions;
			return mockNotificationState.requestPermissions;
		}),
		scheduleNotificationAsync: jest.fn(async request => {
			const identifier = request.identifier ?? `notification-${mockNotificationState.nextNotificationId++}`;
			const entry = { identifier, content: request.content, trigger: request.trigger };
			const isScheduledTrigger = Boolean(request.trigger?.type);

			if (isScheduledTrigger) {
				mockNotificationState.scheduledNotifications = mockNotificationState.scheduledNotifications.filter(
					notification => notification.identifier !== identifier,
				);
				mockNotificationState.scheduledNotifications.push(entry);
			} else {
				mockNotificationState.displayedNotifications.push(entry);
			}

			return identifier;
		}),
		getAllScheduledNotificationsAsync: jest.fn(async () => [...mockNotificationState.scheduledNotifications]),
		cancelScheduledNotificationAsync: jest.fn(async identifier => {
			mockNotificationState.scheduledNotifications = mockNotificationState.scheduledNotifications.filter(
				notification => notification.identifier !== identifier,
			);
		}),
		cancelAllScheduledNotificationsAsync: jest.fn(async () => {
			mockNotificationState.scheduledNotifications = [];
		}),
	};
});
