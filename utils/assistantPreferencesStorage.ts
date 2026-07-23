import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PREFIX = 'lumus_assistant_v1_';
let secureStoreAvailable: Promise<boolean> | null = null;

const keyFor = (uid: string, preference: 'consent' | 'auto_read') =>
	`${PREFIX}${preference}_${uid.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

const canUseSecureStore = () => {
	if (Platform.OS === 'web') return Promise.resolve(false);
	secureStoreAvailable ??= SecureStore.isAvailableAsync().catch(() => false);
	return secureStoreAvailable;
};

const read = async (key: string) => {
	if (await canUseSecureStore()) {
		try {
			const secureValue = await SecureStore.getItemAsync(key);
			if (secureValue !== null) return secureValue;
		} catch {
			// O fallback local mantém a preferência disponível sem interromper o app.
		}
	}
	return AsyncStorage.getItem(key);
};

const write = async (key: string, value: string) => {
	if (await canUseSecureStore()) {
		try {
			await SecureStore.setItemAsync(key, value);
			await AsyncStorage.removeItem(key).catch(() => undefined);
			return;
		} catch {
			// Continua no armazenamento local quando o cofre não está acessível.
		}
	}
	await AsyncStorage.setItem(key, value);
};

const remove = async (key: string) => {
	if (await canUseSecureStore()) {
		await SecureStore.deleteItemAsync(key).catch(() => undefined);
	}
	await AsyncStorage.removeItem(key).catch(() => undefined);
};

export const assistantPreferencesStorage = {
	async getConsent(uid: string) {
		const value = await read(keyFor(uid, 'consent'));
		return value === 'accepted_v1';
	},
	setConsent(uid: string) {
		return write(keyFor(uid, 'consent'), 'accepted_v1');
	},
	revokeConsent(uid: string) {
		return remove(keyFor(uid, 'consent'));
	},
	async getAutoRead(uid: string) {
		return (await read(keyFor(uid, 'auto_read'))) === 'enabled';
	},
	setAutoRead(uid: string, enabled: boolean) {
		return write(keyFor(uid, 'auto_read'), enabled ? 'enabled' : 'disabled');
	},
};
