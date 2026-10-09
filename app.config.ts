import fs from 'node:fs';
import path from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

const resolveGoogleServicesFile = (allowLocalFallback: boolean) => {
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
	return allowLocalFallback && fs.existsSync(localFile) ? './google-services.json' : undefined;
};

const validateGoogleServicesFile = (filePath: string, expectedProjectId: string, expectedPackage: string) => {
	const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, filePath);
	let googleServices: {
		project_info?: { project_id?: string };
		client?: Array<{ client_info?: { android_client_info?: { package_name?: string } } }>;
	};
	try {
		googleServices = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
	} catch {
		throw new Error('GOOGLE_SERVICES_JSON deve apontar para um JSON Firebase Android válido.');
	}
	if (googleServices.project_info?.project_id !== expectedProjectId ||
		!googleServices.client?.some(client => client.client_info?.android_client_info?.package_name === expectedPackage)) {
		throw new Error('GOOGLE_SERVICES_JSON não corresponde ao projeto Firebase e pacote Android deste build.');
	}
};

export default ({ config }: ConfigContext): ExpoConfig => {
	const base = appJson.expo as ExpoConfig;
	const buildProfile = process.env.EAS_BUILD_PROFILE ?? '';
	const firebaseTarget = process.env.EXPO_PUBLIC_FIREBASE_TARGET ?? '';
	const isLocalAssistantDevelopment = firebaseTarget === 'emulator' && (
		buildProfile === 'development' ||
		(!buildProfile && process.env.EXPO_PUBLIC_APP_ENV === 'development')
	);
	const appCheckDebugToken = isLocalAssistantDevelopment
		? process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN?.trim()
		: undefined;
	const requiresNativeFirebase = ['development', 'preview', 'production', 'production-apk'].includes(buildProfile);
	// O arquivo secreto do preview só existe no worker EAS; nunca usar o JSON local de produção.
	const googleServicesFile = resolveGoogleServicesFile(buildProfile !== 'preview');
	const androidGoogleServicesFile = process.env.EAS_BUILD_PLATFORM === 'ios'
		? undefined
		: googleServicesFile;
	const isAndroidEasBuild =
		requiresNativeFirebase &&
		process.env.EAS_BUILD_PLATFORM === 'android';

	// [[Firebase Config]]: todo build EAS Android precisa incluir os módulos
	// nativos do Lumus IA. No perfil development, somente AI Logic/App Check/
	// Remote Config usam esse app; os dados financeiros seguem nos emuladores.
	if (isAndroidEasBuild && process.env.EAS_BUILD_ID && !androidGoogleServicesFile) {
		throw new Error(
			'O build EAS Android exige GOOGLE_SERVICES_JSON (variável de arquivo do EAS/CI) para incluir o Firebase AI do Lumus.',
		);
	}
	if (isAndroidEasBuild && androidGoogleServicesFile) {
		validateGoogleServicesFile(
			androidGoogleServicesFile,
			process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
			base.android?.package ?? '',
		);
	}

	const extra = { ...base.extra, ...config.extra };
	delete extra.lumusAssistantAppCheckDebugToken;
	if (appCheckDebugToken) {
		extra.lumusAssistantAppCheckDebugToken = appCheckDebugToken;
	}

	return {
		...config,
		...base,
		extra,
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
