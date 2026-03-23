import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ReactNativeAsyncStorage } from 'firebase/auth';

const SECURE_STORE_KEY_PREFIX = 'finances_auth_';

let secureStoreAvailabilityPromise: Promise<boolean> | null = null;

const buildSecureStoreKey = (key: string) =>
  `${SECURE_STORE_KEY_PREFIX}${key.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

const isSecureStoreAvailable = async () => {
  if (Platform.OS === 'web') {
    return false;
  }

  if (!secureStoreAvailabilityPromise) {
    secureStoreAvailabilityPromise = SecureStore.isAvailableAsync().catch(() => false);
  }

  return secureStoreAvailabilityPromise;
};

const getSecureStoreItem = async (key: string) => {
  try {
    return await SecureStore.getItemAsync(buildSecureStoreKey(key));
  } catch (error) {
    console.warn('Erro ao ler autenticação do SecureStore:', error);
    return null;
  }
};

const setSecureStoreItem = async (key: string, value: string) => {
  try {
    await SecureStore.setItemAsync(buildSecureStoreKey(key), value);
    return true;
  } catch (error) {
    console.warn('Erro ao persistir autenticação no SecureStore:', error);
    return false;
  }
};

const deleteSecureStoreItem = async (key: string) => {
  try {
    await SecureStore.deleteItemAsync(buildSecureStoreKey(key));
  } catch (error) {
    console.warn('Erro ao remover autenticação do SecureStore:', error);
  }
};

export const firebaseAuthStorage: ReactNativeAsyncStorage = {
  async setItem(key, value) {
    const canUseSecureStore = await isSecureStoreAvailable();

    if (canUseSecureStore) {
      const persisted = await setSecureStoreItem(key, value);
      if (persisted) {
        await AsyncStorage.removeItem(key).catch(() => {});
        return;
      }
    }

    await AsyncStorage.setItem(key, value);
  },

  async getItem(key) {
    const canUseSecureStore = await isSecureStoreAvailable();

    if (canUseSecureStore) {
      const secureValue = await getSecureStoreItem(key);
      if (secureValue !== null) {
        return secureValue;
      }

      const fallbackValue = await AsyncStorage.getItem(key);
      if (fallbackValue !== null) {
        const migrated = await setSecureStoreItem(key, fallbackValue);
        if (migrated) {
          await AsyncStorage.removeItem(key).catch(() => {});
        }
      }

      return fallbackValue;
    }

    return AsyncStorage.getItem(key);
  },

  async removeItem(key) {
    const canUseSecureStore = await isSecureStoreAvailable();

    if (canUseSecureStore) {
      await deleteSecureStoreItem(key);
    }

    await AsyncStorage.removeItem(key);
  },
};
