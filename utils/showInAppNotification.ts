import { Notifier, NotifierComponents } from 'react-native-notifier';

export type InAppNotificationType = 'error' | 'warn' | 'info' | 'success';

type ShowInAppNotificationParams = {
	title?: string;
	description: string;
	type?: InAppNotificationType;
	duration?: number;
};

const defaultTitles: Record<InAppNotificationType, string> = {
	error: 'Erro',
	warn: 'Atenção',
	info: 'Aviso',
	success: 'Sucesso',
};

export const showInAppNotification = ({
	title,
	description,
	type = 'info',
	duration = 3500,
}: ShowInAppNotificationParams) => {
	Notifier.showNotification({
		title: title ?? defaultTitles[type],
		description,
		duration,
		queueMode: 'reset',
		containerStyle: {
			zIndex: 9999,
			elevation: 9999,
		},
		Component: NotifierComponents.Alert,
		componentProps: {
			alertType: type,
		},
		translucentStatusBar: true,
	});
};
