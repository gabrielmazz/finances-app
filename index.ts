import { registerLocalNotificationBackgroundHandler } from './utils/localNotifications';

// Notifee accepts one background handler and needs it before Expo Router mounts.
// This powers the next Android monthly reminder after the current one is delivered.
registerLocalNotificationBackgroundHandler();

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
require('expo-router/entry');
