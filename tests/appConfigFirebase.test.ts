const originalEnvironment = { ...process.env };

const loadAppConfig = (existingFiles: string[]) => {
	jest.resetModules();
	jest.doMock('node:fs', () => ({
		existsSync: (filePath: string) => existingFiles.includes(filePath),
	}));
	return require('../app.config.ts').default;
};

const ANDROID_EAS_BUILD_PROFILES = ['development', 'preview', 'production', 'production-apk'] as const;

describe('configuração nativa Firebase para builds EAS Android', () => {
	afterEach(() => {
		process.env = { ...originalEnvironment };
		jest.dontMock('node:fs');
	});

	it.each(ANDROID_EAS_BUILD_PROFILES)(
		'recusa um build Android %s sem o arquivo Google Services',
		(buildProfile) => {
		process.env.EAS_BUILD_PROFILE = buildProfile;
		process.env.EAS_BUILD_PLATFORM = 'android';
		delete process.env.GOOGLE_SERVICES_JSON;

		const appConfig = loadAppConfig([]);

		expect(() => appConfig({ config: {} })).toThrow('GOOGLE_SERVICES_JSON');
		},
	);

	it.each(ANDROID_EAS_BUILD_PROFILES)('inclui o arquivo e o plugin no build Android %s quando a variável de arquivo existe no EAS', (buildProfile) => {
		process.env.EAS_BUILD_PROFILE = buildProfile;
		process.env.EAS_BUILD_PLATFORM = 'android';
		process.env.GOOGLE_SERVICES_JSON = '/tmp/google-services.json';

		const appConfig = loadAppConfig(['/tmp/google-services.json']);
		const config = appConfig({ config: {} });

		expect(config.android?.googleServicesFile).toBe('/tmp/google-services.json');
		expect(config.plugins).toContain('@react-native-firebase/app');
	});

	it('associa cada perfil EAS ao ambiente que fornece o arquivo Firebase', () => {
		const easConfig = require('../eas.json');

		expect(easConfig.build.development.environment).toBe('development');
		expect(easConfig.build.preview.environment).toBe('preview');
		expect(easConfig.build.production.environment).toBe('production');
		expect(easConfig.build['production-apk'].environment).toBe('production');
	});
});
