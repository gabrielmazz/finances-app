import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { app, db } from '@/FirebaseConfig';
import { ensureLocalNotificationPermission } from '@/utils/localNotifications';
import { Notifications, isNotificationsRuntimeAvailable } from '@/utils/notificationsRuntime';
import { platformCapabilities } from '@/utils/platformCapabilities';

const PUSH_DEVICE_ID_STORAGE_KEY = '@lumusRemoteNotifications:device-id-v1';
const functions = getFunctions(app, 'southamerica-east1');

type RemoteNotificationTestResponse = {
	recipientCount: number;
	deviceCount: number;
	acceptedCount: number;
};

export type RemoteNotificationRegistrationResult =
	| { registered: true }
	| { registered: false; reason: 'unavailable' | 'permissions-denied' | 'token-error' };

const getProjectId = () => {
	const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
	return typeof extra?.eas?.projectId === 'string' ? extra.eas.projectId : null;
};

const getInstallationId = async () => {
	const stored = await AsyncStorage.getItem(PUSH_DEVICE_ID_STORAGE_KEY);
	if (stored) return stored;

	const installationId = `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
	await AsyncStorage.setItem(PUSH_DEVICE_ID_STORAGE_KEY, installationId);
	return installationId;
};

/**
 * [[Notificações]]: the token belongs to one installed app, never to the
 * shared finance record. The callable Function is the only sender.
 */
export const registerRemoteNotificationDevice = async (
	accountId: string,
	{ requestPermission = false }: { requestPermission?: boolean } = {},
): Promise<RemoteNotificationRegistrationResult> => {
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

export const sendLinkedDevicesNotificationTest = async () => {
	const callable = httpsCallable<undefined, RemoteNotificationTestResponse>(functions, 'sendLinkedDevicesNotificationTest');
	return (await callable()).data;
};
