const mockRuntimeState = { platformOS: 'android', platformVersion: 35, storage: {} };

// babel-preset-expo rewrites direct EXPO_PUBLIC_* accesses to this virtual
// module. Jest runs the same resolver without Metro, so expose its process env.
jest.mock('expo/virtual/env', () => ({ env: process.env }));

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
			return mockRuntimeState.platformOS;
		},
		get Version() {
			return mockRuntimeState.platformVersion;
		},
		select: options => options?.[mockRuntimeState.platformOS] ?? options?.default,
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
		getItem: jest.fn(async key => mockRuntimeState.storage[key] ?? null),
		setItem: jest.fn(async (key, value) => {
			mockRuntimeState.storage[key] = value;
		}),
		removeItem: jest.fn(async key => {
			delete mockRuntimeState.storage[key];
		}),
		clear: jest.fn(async () => {
			mockRuntimeState.storage = {};
		}),
	},
}));
