import { Platform } from 'react-native';

export const platformCapabilities = {
	// [[Notificações]]: lembretes são alarmes locais de builds instaladas; Web não
	// solicita permissão nem tenta agendar notificações no navegador.
	supportsScheduledLocalNotifications: Platform.OS === 'android' || Platform.OS === 'ios',
} as const;
