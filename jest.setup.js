const mockNotificationState = {
	platformOS: 'android',
	appOwnership: 'standalone',
	expoGoConfig: null,
	permissions: { granted: true },
	requestPermissions: { granted: true },
	storage: {},
	scheduled: [],
	nextNotificationId: 1,
	nextTriggerDate: new Date('2026-02-10T12:00:00.000Z').getTime(),
};

global.__mockNotificationState = mockNotificationState;

global.__resetNotificationMockState = () => {
	mockNotificationState.platformOS = 'android';
	mockNotificationState.appOwnership = 'standalone';
	mockNotificationState.expoGoConfig = null;
	mockNotificationState.permissions = { granted: true };
	mockNotificationState.requestPermissions = { granted: true };
	mockNotificationState.storage = {};
	mockNotificationState.scheduled = [];
	mockNotificationState.nextNotificationId = 1;
	mockNotificationState.nextTriggerDate = new Date('2026-02-10T12:00:00.000Z').getTime();
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

jest.mock('expo-notifications', () => ({
	__esModule: true,
	SchedulableTriggerInputTypes: {
		CALENDAR: 'calendar',
		DATE: 'date',
	},
	AndroidImportance: {
		HIGH: 'high',
	},
	AndroidNotificationPriority: {
		HIGH: 'high',
	},
	IosAuthorizationStatus: {
		PROVISIONAL: 'provisional',
	},
	setNotificationHandler: jest.fn(),
	setNotificationChannelAsync: jest.fn(async () => undefined),
	getPermissionsAsync: jest.fn(async () => mockNotificationState.permissions),
	requestPermissionsAsync: jest.fn(async () => mockNotificationState.requestPermissions),
	getNextTriggerDateAsync: jest.fn(async () => mockNotificationState.nextTriggerDate),
	getAllScheduledNotificationsAsync: jest.fn(async () =>
		mockNotificationState.scheduled.map(notification => ({
			identifier: notification.identifier,
		})),
	),
	scheduleNotificationAsync: jest.fn(async payload => {
		const identifier = `notification-${mockNotificationState.nextNotificationId}`;
		mockNotificationState.nextNotificationId += 1;
		mockNotificationState.scheduled.push({ identifier, payload });
		return identifier;
	}),
	cancelScheduledNotificationAsync: jest.fn(async identifier => {
		mockNotificationState.scheduled = mockNotificationState.scheduled.filter(
			notification => notification.identifier !== identifier,
		);
	}),
}));
