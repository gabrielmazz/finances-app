import React from 'react';
import '@/utils/reactNativeCompat';
import { AppState, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { NotifierWrapper } from 'react-native-notifier';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ValueVisibilityProvider } from '@/contexts/ValueVisibilityContext';
import { ThemeProvider, useAppTheme } from '@/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { PostSubmitBehaviorProvider } from '@/contexts/PostSubmitBehaviorContext';
import { bootstrapLocalNotifications } from '@/utils/localNotifications';
import { refreshMandatoryReminderNotifications } from '@/utils/mandatoryReminderNotifications';
import { synchronizeMandatoryReminderAccount } from '@/utils/mandatoryReminderAccountSync';
import { APP_ROUTE_PATHS } from '@/utils/navigation';
import Loader from '@/components/uiverse/loader';
import '@/global.css';

void bootstrapLocalNotifications();

const AUTHENTICATED_ROUTE_NAMES = Object.values(APP_ROUTE_PATHS)
	.filter(pathname => pathname !== APP_ROUTE_PATHS.login)
	.map(pathname => pathname.slice(1));

const AuthBootstrapScreen = () => {
	const { isDarkMode } = useAppTheme();
	const backgroundColor = isDarkMode ? '#020617' : '#ffffff';

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor }}>
			<View
				style={{
					flex: 1,
					alignItems: 'center',
					justifyContent: 'center',
					backgroundColor,
				}}
			>
				<Loader />
			</View>
		</SafeAreaView>
	);
};

const NotificationLifecycleBridge = () => {
	const { user, isAuthReady } = useAuth();

	React.useEffect(() => {
		if (!isAuthReady || !user?.uid) {
			return;
		}

		let isCancelled = false;
		const accountId = user.uid;
		void synchronizeMandatoryReminderAccount(accountId, () => !isCancelled).catch(error => {
			console.error('Erro ao sincronizar lembretes após autenticação:', error);
		});

		return () => {
			isCancelled = true;
		};
	}, [isAuthReady, user?.uid]);

	React.useEffect(() => {
		if (!user?.uid) {
			return;
		}

		const accountId = user.uid;
		const subscription = AppState.addEventListener('change', nextState => {
			if (nextState === 'active') {
				void refreshMandatoryReminderNotifications(accountId);
			}
		});

		return () => subscription.remove();
	}, [user?.uid]);

	return null;
};

const AuthenticatedStack = () => {
	const { isLoadingTheme } = useAppTheme();
	const { isAuthReady, isAuthenticated } = useAuth();

	if (!isAuthReady || isLoadingTheme) {
		return <AuthBootstrapScreen />;
	}

	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Protected guard={!isAuthenticated}>
				<Stack.Screen name="index" />
			</Stack.Protected>

			<Stack.Protected guard={isAuthenticated}>
				{AUTHENTICATED_ROUTE_NAMES.map(routeName => (
					<Stack.Screen key={routeName} name={routeName} />
				))}
			</Stack.Protected>
		</Stack>
	);
};

const LayoutWithTheme = () => {
	const { themeMode } = useAppTheme();

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<GluestackUIProvider mode={themeMode}>
				<NotifierWrapper translucentStatusBar>
					<AuthProvider>
						<NotificationLifecycleBridge />
						<AuthenticatedStack />
					</AuthProvider>
				</NotifierWrapper>
			</GluestackUIProvider>
		</GestureHandlerRootView>
	);
};

export default function RootLayout() {
	return (
		<ThemeProvider>
			<ValueVisibilityProvider>
				<PostSubmitBehaviorProvider>
					<LayoutWithTheme />
				</PostSubmitBehaviorProvider>
			</ValueVisibilityProvider>
		</ThemeProvider>
	);
}
