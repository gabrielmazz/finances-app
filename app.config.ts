import fs from 'node:fs';
import path from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

const resolveGoogleServicesFile = () => {
	const easFilePath = process.env.GOOGLE_SERVICES_JSON?.trim();
	if (easFilePath) {
		const absolutePath = path.isAbsolute(easFilePath)
			? easFilePath
			: path.resolve(__dirname, easFilePath);
		if (fs.existsSync(absolutePath)) {
			return easFilePath;
		}
	}

	const localFile = path.join(__dirname, 'google-services.json');
	return fs.existsSync(localFile) ? './google-services.json' : undefined;
};

export default ({ config }: ConfigContext): ExpoConfig => {
	const base = appJson.expo as ExpoConfig;
	const googleServicesFile = resolveGoogleServicesFile();
	const androidGoogleServicesFile = process.env.EAS_BUILD_PLATFORM === 'ios'
		? undefined
		: googleServicesFile;

	return {
		...config,
		...base,
		android: {
			...base.android,
			...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
		},
		plugins: [
			...(base.plugins ?? []),
			...(androidGoogleServicesFile ? ['@react-native-firebase/app'] : []),
			[
				'expo-audio',
				{
					microphonePermission:
						'O Lumus usa o microfone somente enquanto você grava uma mensagem para o assistente.',
					recordAudioAndroid: true,
					enableBackgroundRecording: false,
				},
			],
		],
	};
};
