import React from 'react';
import {
	Platform,
	StatusBar,
	StyleSheet,
	Text,
	View,
	type StyleProp,
	type TextStyle,
	type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Notifier, type QueueMode } from 'react-native-notifier';

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
		backgroundColor: '#DC2626',
		statusBarColor: '#DC2626',
		textColor: '#FFFFFF',
	},
	warn: {
		backgroundColor: '#D97706',
		statusBarColor: '#D97706',
		textColor: '#FFFFFF',
	},
	info: {
		backgroundColor: '#2563EB',
		statusBarColor: '#2563EB',
		textColor: '#FFFFFF',
	},
	success: {
		backgroundColor: '#16A34A',
		statusBarColor: '#16A34A',
		textColor: '#FFFFFF',
	},
};

const DEFAULT_TITLES: Record<NotifierAlertType, string> = {
	error: 'Erro',
	warn: 'Atenção',
	info: 'Aviso',
	success: 'Sucesso',
};

const styles = StyleSheet.create({
	safeArea: {
		width: '100%',
	},
	content: {
		marginHorizontal: 10,
		marginBottom: 10,
		paddingHorizontal: 16,
		paddingBottom: 12,
	},
	title: {
		fontSize: 15,
		lineHeight: 22,
		fontWeight: '700',
		textAlign: 'center',
	},
	description: {
		fontSize: 14,
		lineHeight: 22,
		textAlign: 'center',
	},
	notifierContainer: {
		zIndex: 9999,
		elevation: 9999,
	},
});

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
			style={[
				styles.safeArea,
				{
					backgroundColor: backgroundColor ?? variant.backgroundColor,
					paddingTop: extraTopPadding,
				},
			]}
		>
			<View style={[styles.content, contentStyle]}>
				{!!title && <Text style={[styles.title, { color: resolvedTextColor }, titleStyle]}>{title}</Text>}
				{!!description && (
					<Text style={[styles.description, { color: resolvedTextColor }, descriptionStyle]}>
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
		containerStyle: styles.notifierContainer,
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
