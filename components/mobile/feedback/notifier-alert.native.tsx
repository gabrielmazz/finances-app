import React from 'react';
import {
	Platform,
	StatusBar,
	Text,
	View,
	type StyleProp,
	type TextStyle,
	type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Notifier, type QueueMode } from 'react-native-notifier';

import { NATIVE_LIBRARY_STYLES } from '@/design-system/native-styles';
import { LUMUS_ALERT_COLORS } from '@/design-system/tokens';

export type NotifierAlertType = 'error' | 'warn' | 'info' | 'success';

type NotifierAlertVariant = {
	backgroundColor: string;
	statusBarColor: string;
	textColor: string;
};

export type NotifierAlertProps = {
	title?: string;
	description?: string;
	type?: NotifierAlertType;
	backgroundColor?: string;
	textColor?: string;
	extraTopPadding?: number;
	contentStyle?: StyleProp<ViewStyle>;
	titleStyle?: StyleProp<TextStyle>;
	descriptionStyle?: StyleProp<TextStyle>;
};

export type ShowNotifierAlertParams = {
	title?: string;
	description: string;
	type?: NotifierAlertType;
	duration?: number;
	queueMode?: QueueMode;
	isDarkMode?: boolean;
	backgroundColor?: string;
	statusBarColor?: string;
	textColor?: string;
	extraTopPadding?: number;
	contentStyle?: StyleProp<ViewStyle>;
	titleStyle?: StyleProp<TextStyle>;
	descriptionStyle?: StyleProp<TextStyle>;
};

const ALERT_VARIANTS: Record<NotifierAlertType, NotifierAlertVariant> = {
	error: {
		backgroundColor: LUMUS_ALERT_COLORS.error,
		statusBarColor: LUMUS_ALERT_COLORS.error,
		textColor: LUMUS_ALERT_COLORS.text,
	},
	warn: {
		backgroundColor: LUMUS_ALERT_COLORS.warn,
		statusBarColor: LUMUS_ALERT_COLORS.warn,
		textColor: LUMUS_ALERT_COLORS.text,
	},
	info: {
		backgroundColor: LUMUS_ALERT_COLORS.info,
		statusBarColor: LUMUS_ALERT_COLORS.info,
		textColor: LUMUS_ALERT_COLORS.text,
	},
	success: {
		backgroundColor: LUMUS_ALERT_COLORS.success,
		statusBarColor: LUMUS_ALERT_COLORS.success,
		textColor: LUMUS_ALERT_COLORS.text,
	},
};

const DEFAULT_TITLES: Record<NotifierAlertType, string> = {
	error: 'Erro',
	warn: 'Atenção',
	info: 'Aviso',
	success: 'Sucesso',
};

export const restoreNotifierAlertStatusBar = (isDarkMode = false) => {
	StatusBar.setBarStyle(isDarkMode ? 'light-content' : 'dark-content', true);
	if (Platform.OS === 'android') {
		StatusBar.setBackgroundColor('transparent', true);
	}
};

export const NotifierAlert: React.FC<NotifierAlertProps> = ({
	title,
	description,
	type = 'info',
	backgroundColor,
	textColor,
	extraTopPadding = 10,
	contentStyle,
	titleStyle,
	descriptionStyle,
}) => {
	const variant = ALERT_VARIANTS[type];
	const resolvedTextColor = textColor ?? variant.textColor;

	return (
		<SafeAreaView
			edges={['top']}
			className="w-full"
			style={{
				backgroundColor: backgroundColor ?? variant.backgroundColor,
				paddingTop: extraTopPadding,
			}}
		>
			<View className="mx-2.5 mb-2.5 px-4 pb-3" style={contentStyle}>
				{!!title && <Text className="text-label text-center font-bold" style={[{ color: resolvedTextColor }, titleStyle]}>{title}</Text>}
				{!!description && (
					<Text className="text-body-sm text-center" style={[{ color: resolvedTextColor }, descriptionStyle]}>
						{description}
					</Text>
				)}
			</View>
		</SafeAreaView>
	);
};

export const showNotifierAlert = ({
	title,
	description,
	type = 'info',
	duration = 3500,
	queueMode = 'reset',
	isDarkMode = false,
	backgroundColor,
	statusBarColor,
	textColor,
	extraTopPadding = 10,
	contentStyle,
	titleStyle,
	descriptionStyle,
}: ShowNotifierAlertParams) => {
	const variant = ALERT_VARIANTS[type];
	const resolvedStatusBarColor = statusBarColor ?? backgroundColor ?? variant.statusBarColor;

	Notifier.showNotification<typeof NotifierAlert>({
		title: title ?? DEFAULT_TITLES[type],
		description,
		duration,
		queueMode,
		onShown: () => {
			StatusBar.setBarStyle('light-content', true);
			if (Platform.OS === 'android') {
				StatusBar.setBackgroundColor(resolvedStatusBarColor, true);
			}
		},
		onHidden: () => restoreNotifierAlertStatusBar(isDarkMode),
		containerStyle: NATIVE_LIBRARY_STYLES.notifierContainer,
		Component: NotifierAlert,
		componentProps: {
			type,
			backgroundColor,
			textColor,
			extraTopPadding,
			contentStyle,
			titleStyle,
			descriptionStyle,
		},
		translucentStatusBar: false,
	});
};

export default NotifierAlert;

// O host Mantine só é montado pela variante Web; em plataformas nativas o
// react-native-notifier continua sendo o canal documentado em [[Notificações]].
export const WebNotifierAlertHost = () => null;
