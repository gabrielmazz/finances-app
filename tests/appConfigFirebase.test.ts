const originalEnvironment = { ...process.env };

const loadAppConfig = (existingFiles: string[], googleServicesProjectId = 'finances-app-e8685') => {
	jest.resetModules();
	jest.doMock('node:fs', () => ({
		existsSync: (filePath: string) => existingFiles.includes(filePath),
		readFileSync: () => JSON.stringify({
			project_info: { project_id: googleServicesProjectId },
			client: [{ client_info: { android_client_info: { package_name: 'com.gabrielmazz.lumusfinances' } } }],
		}),
	}));
	return require('../app.config.ts').default;
};

const ANDROID_FIREBASE_BUILD_PROFILES = ['development', 'preview', 'production', 'production-apk'] as const;

describe('configuração nativa Firebase para builds EAS Android', () => {
	afterEach(() => {
		process.env = { ...originalEnvironment };
		jest.dontMock('node:fs');
	});

	it.each(ANDROID_FIREBASE_BUILD_PROFILES)(
		'recusa um build Android %s sem o arquivo Google Services',
		(buildProfile) => {
		process.env.EAS_BUILD_PROFILE = buildProfile;
		process.env.EAS_BUILD_PLATFORM = 'android';
		process.env.EAS_BUILD_ID = 'test-build';
		delete process.env.GOOGLE_SERVICES_JSON;

		const appConfig = loadAppConfig([]);

		expect(() => appConfig({ config: {} })).toThrow('GOOGLE_SERVICES_JSON');
		},
	);

	it('não incorpora o JSON local de produção ao preview antes de o arquivo secreto chegar ao worker', () => {
		process.env.EAS_BUILD_PROFILE = 'preview';
		process.env.EAS_BUILD_PLATFORM = 'android';
		process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'lumus-preview-test';
		delete process.env.EAS_BUILD_ID;
		delete process.env.GOOGLE_SERVICES_JSON;
		const localGoogleServicesFile = require('node:path').resolve(__dirname, '../google-services.json');
		const config = loadAppConfig([localGoogleServicesFile])({ config: {} });
		expect(config.android?.googleServicesFile).toBeUndefined();
		expect(config.plugins).not.toContain('@react-native-firebase/app');
	});

	it.each(ANDROID_FIREBASE_BUILD_PROFILES)('inclui o arquivo e o plugin no build Android %s quando a variável de arquivo existe no EAS', (buildProfile) => {
		process.env.EAS_BUILD_PROFILE = buildProfile;
		process.env.EAS_BUILD_PLATFORM = 'android';
		process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'finances-app-e8685';
		process.env.GOOGLE_SERVICES_JSON = '/tmp/google-services.json';

		const appConfig = loadAppConfig(['/tmp/google-services.json']);
		const config = appConfig({ config: {} });

		expect(config.android?.googleServicesFile).toBe('/tmp/google-services.json');
		expect(config.plugins).toContain('@react-native-firebase/app');
	});

	it('inclui Firebase nativo no build Android development para a ponte híbrida de AI Logic', () => {
		const buildProfile = 'development';
		process.env.EAS_BUILD_PROFILE = buildProfile;
		process.env.EAS_BUILD_PLATFORM = 'android';
		process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'finances-app-e8685';
		process.env.GOOGLE_SERVICES_JSON = '/tmp/google-services.json';
		const config = loadAppConfig(['/tmp/google-services.json'])({ config: {} });
		expect(config.android?.googleServicesFile).toBe('/tmp/google-services.json');
		expect(config.plugins).toContain('@react-native-firebase/app');
	});

	it('rejects an Android Firebase file from another project', () => {
		process.env.EAS_BUILD_PROFILE = 'preview';
		process.env.EAS_BUILD_PLATFORM = 'android';
		process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'lumus-preview-test';
		process.env.GOOGLE_SERVICES_JSON = '/tmp/google-services.json';
		const appConfig = loadAppConfig(['/tmp/google-services.json']);
		expect(() => appConfig({ config: {} })).toThrow('não corresponde ao projeto Firebase');
	});

	it('associa cada perfil EAS ao ambiente que fornece o arquivo Firebase', () => {
		const easConfig = require('../eas.json');

		expect(easConfig.build.development.environment).toBe('development');
		expect(easConfig.build.preview.environment).toBe('preview');
		expect(easConfig.build.production.environment).toBe('production');
		expect(easConfig.build['production-apk'].environment).toBe('production');
		expect(easConfig.build.development.env.EXPO_PUBLIC_FIREBASE_TARGET).toBe('emulator');
		expect(easConfig.build.development.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID).toBe('finances-app-e8685');
		expect(easConfig.build.development.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_ANDROID_PROVIDER).toBe('debug');
		expect(easConfig.build.preview.extends).toBeUndefined();
		expect(easConfig.build.preview.env.EXPO_PUBLIC_FIREBASE_TARGET).toBe('preview');
		expect(easConfig.build.preview.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_ANDROID_PROVIDER).toBe('debug');
		expect(easConfig.build.production.env.EXPO_PUBLIC_FIREBASE_TARGET).toBe('production');
		expect(easConfig.build.production.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_ANDROID_PROVIDER).toBe('playIntegrity');
	});
});
