import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-expect-error Metro resolves this official export through the react-native condition.
import { getReactNativePersistence } from 'firebase/auth';

export const authPersistence = getReactNativePersistence(AsyncStorage);
