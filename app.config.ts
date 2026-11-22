import type { ConfigContext, ExpoConfig } from 'expo/config';
import appJson from './app.json';

export default ({ config }: ConfigContext): ExpoConfig => {
	const app = { ...config, ...(appJson.expo as ExpoConfig) };
	const mode = process.env.EXPO_PUBLIC_FIREBASE_MODE;
	const homologation = process.env.LUMUS_HOMOLOGATION === '1';
	if (homologation && mode !== 'production') throw new Error('O build de homologação exige o Firebase oficial.');
	const suffix = homologation ? '.homologacao' : mode === 'emulator' ? '.emulador' : mode === 'staging' ? '.hml' : '';
	return { ...app, name: mode === 'staging' ? 'Lumus Finanças HML' : app.name,
		android: { ...app.android, package: appJson.expo.android.package + suffix } };
};
