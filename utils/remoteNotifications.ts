import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';

import { auth, db } from '@/FirebaseConfig';
import { isFirebaseEmulatorRuntime } from '@/utils/firebaseRuntime';
import { ensureLocalNotificationPermission } from '@/utils/localNotifications';
import { Notifications, isNotificationsRuntimeAvailable } from '@/utils/notificationsRuntime';
import { platformCapabilities } from '@/utils/platformCapabilities';

const PUSH_DEVICE_ID_STORAGE_KEY = '@lumusRemoteNotifications:device-id-v1';
const pendingRegistrations = new Map<string, Set<Promise<RemoteNotificationRegistrationResult>>>();
const revokingAccounts = new Set<string>();
let installationIdPromise: Promise<string> | null = null;

export type RemoteNotificationRegistrationResult =
	| { registered: true }
	| { registered: false; reason: 'unavailable' | 'permissions-denied' | 'token-error' };

const getProjectId = () => {
	const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
	return typeof extra?.eas?.projectId === 'string' ? extra.eas.projectId : null;
};

const createInstallationId = async () => {
	const stored = await AsyncStorage.getItem(PUSH_DEVICE_ID_STORAGE_KEY);
	if (stored) return stored;

	const installationId = `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
	await AsyncStorage.setItem(PUSH_DEVICE_ID_STORAGE_KEY, installationId);
	return installationId;
};

const getInstallationId = async () => {
	if (!installationIdPromise) installationIdPromise = createInstallationId();
	try { return await installationIdPromise; }
	catch (error) { installationIdPromise = null; throw error; }
};

/**
 * [[Notificações]]: the token belongs to one installed app, never to the
 * shared finance record. Backend triggers are the only senders.
 */
const performRemoteNotificationRegistration = async (
	accountId: string,
	{ requestPermission = false }: { requestPermission?: boolean } = {},
): Promise<RemoteNotificationRegistrationResult> => {
	if (auth.currentUser?.uid !== accountId || revokingAccounts.has(accountId)) return { registered: false, reason: 'unavailable' };
	if (isFirebaseEmulatorRuntime()) return { registered: false, reason: 'unavailable' };
	if (!platformCapabilities.supportsScheduledLocalNotifications || !isNotificationsRuntimeAvailable()) {
		return { registered: false, reason: 'unavailable' };
	}

	const permission = await ensureLocalNotificationPermission({ requestIfNeeded: requestPermission });
	if (!permission.granted) return { registered: false, reason: 'permissions-denied' };

	const projectId = getProjectId();
	if (!projectId) {
		console.warn('Expo projectId ausente; não foi possível registrar notificações remotas.');
		return { registered: false, reason: 'token-error' };
	}

	try {
		const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
		const expoPushToken = tokenResult.data;
		if (typeof expoPushToken !== 'string' || expoPushToken.length === 0) {
			return { registered: false, reason: 'token-error' };
		}

		const installationId = await getInstallationId();
		if (auth.currentUser?.uid !== accountId || revokingAccounts.has(accountId)) return { registered: false, reason: 'unavailable' };
		await setDoc(
			doc(db, 'users', accountId, 'pushDevices', installationId),
			{
				expoPushToken,
				platform: Platform.OS,
				updatedAt: new Date(),
			},
			{ merge: true },
		);
		return { registered: true };
	} catch (error) {
		console.error('Erro ao registrar dispositivo para notificações remotas:', error);
		return { registered: false, reason: 'token-error' };
	}
};

export const registerRemoteNotificationDevice = async (
	accountId: string,
	options: { requestPermission?: boolean } = {},
): Promise<RemoteNotificationRegistrationResult> => {
	const pending = performRemoteNotificationRegistration(accountId, options);
	const registrations = pendingRegistrations.get(accountId) ?? new Set();
	registrations.add(pending);
	pendingRegistrations.set(accountId, registrations);
	try { return await pending; }
	finally {
		registrations.delete(pending);
		if (registrations.size === 0) pendingRegistrations.delete(accountId);
	}
};

export const unregisterRemoteNotificationDevice = async (accountId: string): Promise<void> => {
	if (auth.currentUser?.uid !== accountId) throw new Error('A conta mudou antes de remover o token push.');
	revokingAccounts.add(accountId);
	try {
		await Promise.all(pendingRegistrations.get(accountId) ?? []);
		const installationId = await AsyncStorage.getItem(PUSH_DEVICE_ID_STORAGE_KEY);
		if (installationId) await deleteDoc(doc(db, 'users', accountId, 'pushDevices', installationId));
	} catch (error) {
		revokingAccounts.delete(accountId);
		throw error;
	}
};

export const finishRemoteNotificationLogout = (accountId: string) => {
	revokingAccounts.delete(accountId);
};
