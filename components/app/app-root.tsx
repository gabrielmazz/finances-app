import React from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FontAwesome6, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';

import { showNotifierAlert, WebNotifierAlertHost } from '@/components/uiverse/feedback/notifier-alert';
import NotifierBoundary from '@/components/uiverse/feedback/notifier-boundary';
import Loader from '@/components/uiverse/shared/loader';
import WebAppShell from '@/components/uiverse/navigation/web-app-shell';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { FinanceDataProvider } from '@/contexts/FinanceDataContext';
import { LumusAssistantProvider } from '@/contexts/LumusAssistantContext';
import { PostSubmitBehaviorProvider } from '@/contexts/PostSubmitBehaviorContext';
import { RouteVisibilityProvider, useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import { ThemeProvider, useAppTheme } from '@/contexts/ThemeContext';
import { ValueVisibilityProvider } from '@/contexts/ValueVisibilityContext';
import { refreshMandatoryReminderNotifications } from '@/utils/mandatoryReminderNotifications';
import { synchronizeMandatoryReminderAccount } from '@/utils/mandatoryReminderAccountSync';
import { APP_ROUTE_GUARD_ENTRIES, isAppRouteAllowed } from '@/utils/appRouteGuards';
import { registerRemoteNotificationDevice } from '@/utils/remoteNotifications';
import { cleanupExpiredSession } from '@/utils/secureLogout';
import { synchronizeSparkSharedChanges } from '@/utils/sparkSharedChanges';
import SparkActivationNotice from '@/components/uiverse/banks/spark-activation-notice';
import SparkOperationRecoveryNotice from '@/components/uiverse/banks/spark-operation-recovery-notice';

const AuthBootstrapScreen = () => {
	return (
		<SafeAreaView className="flex-1 bg-white dark:bg-slate-950">
			<View className="flex-1 items-center justify-center bg-white dark:bg-slate-950">
				<Loader />
			</View>
		</SafeAreaView>
	);
};

const NotificationLifecycleBridge = () => {
	const { user, isAuthReady } = useAuth();
	const { themeMode } = useAppTheme();
	const themeRef = React.useRef(themeMode);
	themeRef.current = themeMode;
	const announceChanges = React.useCallback((count: number, hasMore: boolean) => showNotifierAlert({
		title: 'Alterações no seu grupo', description: `${count ? `${count} alteração(ões) em recorrências foram feitas por outra pessoa. Abra suas listas para conferir.` : 'Há atualizações no histórico do grupo.'}${hasMore ? ' A conferência continuará na próxima abertura.' : ''}`,
		type: 'info', isDarkMode: themeRef.current === 'dark',
	}), []);

	React.useEffect(() => {
		if (!isAuthReady || !user?.uid) {
			return;
		}

		let isCancelled = false;
		const accountId = user.uid;
		void synchronizeMandatoryReminderAccount(accountId, () => !isCancelled).catch(error => {
			console.error('Erro ao sincronizar lembretes após autenticação:', error);
		});
		void synchronizeSparkSharedChanges(accountId, () => !isCancelled, announceChanges).then(async mode => {
			if (mode !== 'legacy' || isCancelled) return;
			const result = await registerRemoteNotificationDevice(accountId);
			if (!result.registered && result.reason === 'token-error') console.warn('Não foi possível registrar este aparelho para notificações remotas.');
		}).catch(error => console.error('Não foi possível conferir os avisos do grupo:', error));

		return () => {
			isCancelled = true;
		};
	}, [announceChanges, isAuthReady, user?.uid]);

	React.useEffect(() => {
		if (!user?.uid) {
			return;
		}

		const accountId = user.uid;
		let isCancelled = false;
		const subscription = AppState.addEventListener('change', nextState => {
			if (nextState === 'active') {
				void refreshMandatoryReminderNotifications(accountId);
				void synchronizeMandatoryReminderAccount(accountId, () => !isCancelled).catch(error => console.error('Não foi possível atualizar os lembretes do grupo:', error));
				void synchronizeSparkSharedChanges(accountId, () => !isCancelled, announceChanges).catch(error => console.error('Não foi possível atualizar os avisos do grupo:', error));
			}
		});

		return () => { isCancelled = true; subscription.remove(); };
	}, [announceChanges, user?.uid]);

	return null;
};

const AuthenticatedStack = () => {
	const { isLoadingTheme, themeMode } = useAppTheme();
	const { isAuthReady, isAuthenticated, registerActivity, sessionExpired } = useAuth();
	const { isLoadingRouteVisibility, isRouteVisible } = useRouteVisibility();
	const expiryNoticeShown = React.useRef(false);
	React.useEffect(() => {
		if (!sessionExpired) expiryNoticeShown.current = false;
		if (!sessionExpired || !isAuthReady || expiryNoticeShown.current) return;
		expiryNoticeShown.current = true;
		showNotifierAlert({
			description: 'Sua sessão expirou. Entre novamente com email e senha.',
			type: 'warn',
			isDarkMode: themeMode === 'dark',
		});
	}, [isAuthReady, sessionExpired, themeMode]);

	if (!isAuthReady || isLoadingTheme || isLoadingRouteVisibility) {
		return <AuthBootstrapScreen />;
	}

	return (
		<View className="flex-1" onStartShouldSetResponderCapture={() => !registerActivity()} onTouchMove={registerActivity}>
			{isAuthenticated && <SparkOperationRecoveryNotice />}
			{isAuthenticated && <SparkActivationNotice />}
			<WebAppShell isAuthenticated={isAuthenticated}>
				<Stack screenOptions={{ headerShown: false }}>
					<Stack.Protected guard={!isAuthenticated}>
						<Stack.Screen name="index" />
					</Stack.Protected>

					{APP_ROUTE_GUARD_ENTRIES.map(entry => (
							<Stack.Protected
								key={entry.name}
								guard={isAppRouteAllowed(entry, isAuthenticated, isRouteVisible)}
							>
								<Stack.Screen name={entry.name} />
							</Stack.Protected>
					))}
				</Stack>
			</WebAppShell>
		</View>
	);
};

const LayoutWithTheme = () => {
	const { themeMode } = useAppTheme();

	return (
		<GestureHandlerRootView className="flex-1">
			<GluestackUIProvider mode={themeMode}>
				<NotifierBoundary>
					<WebNotifierAlertHost />
					<AuthProvider onSessionExpired={cleanupExpiredSession}>
						<FinanceDataProvider>
							<NotificationLifecycleBridge />
							<LumusAssistantProvider>
								<AuthenticatedStack />
							</LumusAssistantProvider>
						</FinanceDataProvider>
					</AuthProvider>
				</NotifierBoundary>
			</GluestackUIProvider>
		</GestureHandlerRootView>
	);
};

export default function AppRoot() {
	// [[Gerenciamento de Tags]]: category glyphs need their font families ready before any screen renders.
	const [iconFontsLoaded, iconFontsError] = useFonts({
		...Ionicons.font,
		...MaterialCommunityIcons.font,
		...FontAwesome6.font,
	});
	if (!iconFontsLoaded && !iconFontsError) return <AuthBootstrapScreen />;

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
