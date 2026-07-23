const fs = require('node:fs');
const path = require('node:path');

const REACT_NATIVE_FIREBASE_PACKAGES = [
	'@react-native-firebase/ai',
	'@react-native-firebase/analytics',
	'@react-native-firebase/app',
	'@react-native-firebase/app-check',
	'@react-native-firebase/auth',
	'@react-native-firebase/remote-config',
];

const hasFile = (environmentVariable, localFileName) => {
	const configuredPath = process.env[environmentVariable]?.trim();
	if (configuredPath) {
		const absolutePath = path.isAbsolute(configuredPath)
			? configuredPath
			: path.resolve(__dirname, configuredPath);
		return fs.existsSync(absolutePath);
	}

	return fs.existsSync(path.join(__dirname, localFileName));
};

const linkAndroidFirebase =
	process.env.EAS_BUILD_PLATFORM !== 'ios' &&
	hasFile('GOOGLE_SERVICES_JSON', 'google-services.json');
const linkIosFirebase =
	process.env.EAS_BUILD_PLATFORM !== 'android' &&
	hasFile('GOOGLE_SERVICE_INFO_PLIST', 'GoogleService-Info.plist');

const disabledAndroidPlatform = packageName =>
	packageName === '@react-native-firebase/app'
		? { sourceDir: '__disabled_without_google_services__' }
		: null;

module.exports = {
	dependencies: Object.fromEntries(
		REACT_NATIVE_FIREBASE_PACKAGES.map(packageName => [
			packageName,
			{
				platforms: {
					...(linkAndroidFirebase
						? {}
						: { android: disabledAndroidPlatform(packageName) }),
					...(linkIosFirebase ? {} : { ios: null }),
				},
			},
		]),
	),
};
