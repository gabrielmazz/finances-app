const FIREBASE_PACKAGES = [
	'@react-native-firebase/ai',
	'@react-native-firebase/analytics',
	'@react-native-firebase/app',
	'@react-native-firebase/app-check',
	'@react-native-firebase/auth',
	'@react-native-firebase/remote-config',
] as const;

const originalEnvironment = { ...process.env };

const loadConfig = (existingFiles: string[]) => {
	jest.resetModules();
	jest.doMock('node:fs', () => ({
		existsSync: (filePath: string) => existingFiles.includes(filePath),
	}));
	return require('../react-native.config.js');
};

describe('autolinking condicional do React Native Firebase', () => {
	afterEach(() => {
		process.env = { ...originalEnvironment };
		jest.dontMock('node:fs');
	});

	it('remove os módulos nativos quando os arquivos de serviço não existem', () => {
		delete process.env.GOOGLE_SERVICES_JSON;
		delete process.env.GOOGLE_SERVICE_INFO_PLIST;
		const config = loadConfig([]);

		for (const packageName of FIREBASE_PACKAGES) {
			expect(config.dependencies[packageName].platforms.ios).toBeNull();
			expect(config.dependencies[packageName].platforms.android).toEqual(
				packageName === '@react-native-firebase/app'
					? { sourceDir: '__disabled_without_google_services__' }
					: null,
			);
		}
	});

	it('mantém o autolinking Android quando o arquivo indicado realmente existe', () => {
		process.env.GOOGLE_SERVICES_JSON = '/tmp/google-services.json';
		delete process.env.GOOGLE_SERVICE_INFO_PLIST;
		const config = loadConfig(['/tmp/google-services.json']);

		for (const packageName of FIREBASE_PACKAGES) {
			expect(config.dependencies[packageName].platforms).toEqual({ ios: null });
		}
	});
});
