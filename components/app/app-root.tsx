import React from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { WebNotifierAlertHost } from '@/components/uiverse/notifier-alert';
import NotifierBoundary from '@/components/uiverse/notifier-boundary';
import Loader from '@/components/uiverse/loader';
import WebAppShell from '@/components/uiverse/web-app-shell';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { FinanceDataProvider } from '@/contexts/FinanceDataContext';
import { PostSubmitBehaviorProvider } from '@/contexts/PostSubmitBehaviorContext';
import { RouteVisibilityProvider, useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import { ThemeProvider, useAppTheme } from '@/contexts/ThemeContext';
import { ValueVisibilityProvider } from '@/contexts/ValueVisibilityContext';
import { refreshMandatoryReminderNotifications } from '@/utils/mandatoryReminderNotifications';
import { synchronizeMandatoryReminderAccount } from '@/utils/mandatoryReminderAccountSync';
import {
	APP_ROUTE_PATHS,
	getRouteVisibilityKeyForPath,
	type AppRoutePath,
} from '@/utils/navigation';
import { registerRemoteNotificationDevice } from '@/utils/remoteNotifications';

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
		void registerRemoteNotificationDevice(accountId).then(result => {
			if (!result.registered && result.reason === 'token-error') {
				console.warn('Não foi possível registrar este aparelho para notificações remotas.');
			}
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
	const { isLoadingRouteVisibility, isRouteVisible } = useRouteVisibility();

	if (!isAuthReady || isLoadingTheme || isLoadingRouteVisibility) {
		return <AuthBootstrapScreen />;
	}

	return (
		<WebAppShell isAuthenticated={isAuthenticated}>
			<Stack screenOptions={{ headerShown: false }}>
				<Stack.Protected guard={!isAuthenticated}>
					<Stack.Screen name="index" />
				</Stack.Protected>

				{AUTHENTICATED_ROUTE_NAMES.map(routeName => {
					const pathname = `/${routeName}` as AppRoutePath;
					const routeVisibilityKey = getRouteVisibilityKeyForPath(pathname);

					return (
						<Stack.Protected
							key={routeName}
							guard={isAuthenticated && (!routeVisibilityKey || isRouteVisible(routeVisibilityKey))}
						>
							<Stack.Screen name={routeName} />
						</Stack.Protected>
					);
				})}
			</Stack>
		</WebAppShell>
	);
};

const LayoutWithTheme = () => {
	const { themeMode } = useAppTheme();

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<GluestackUIProvider mode={themeMode}>
				<NotifierBoundary>
					<WebNotifierAlertHost />
					<AuthProvider>
						<FinanceDataProvider>
							<NotificationLifecycleBridge />
							<AuthenticatedStack />
						</FinanceDataProvider>
					</AuthProvider>
				</NotifierBoundary>
			</GluestackUIProvider>
		</GestureHandlerRootView>
	);
};

export default function AppRoot() {
	return (
		<ThemeProvider>
			<ValueVisibilityProvider>
				<PostSubmitBehaviorProvider>
					<RouteVisibilityProvider>
						<LayoutWithTheme />
					</RouteVisibilityProvider>
				</PostSubmitBehaviorProvider>
			</ValueVisibilityProvider>
		</ThemeProvider>
	);
}
