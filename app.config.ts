import type { ConfigContext, ExpoConfig } from 'expo/config';
import appJson from './app.json';
export default ({ config }: ConfigContext): ExpoConfig => ({ ...config, ...(appJson.expo as ExpoConfig) });
