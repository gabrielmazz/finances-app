import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, usePathname, useRootNavigationState } from 'expo-router';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ValueVisibilityProvider } from '@/contexts/ValueVisibilityContext';
import { ThemeProvider, useAppTheme } from '@/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Loader from '@/components/uiverse/loader';
import '@/global.css';

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

const AuthenticatedStack = () => {
	const { isAuthReady, isAuthenticated } = useAuth();
	const pathname = usePathname();
	const rootNavigationState = useRootNavigationState();
	const isLoginRoute = pathname === '/' || pathname === '/index';
	const shouldRedirectToLogin = isAuthReady && !isAuthenticated && !isLoginRoute;
	const shouldRedirectToHome = isAuthReady && isAuthenticated && isLoginRoute;

	if (!rootNavigationState?.key || !isAuthReady) {
		return <AuthBootstrapScreen />;
	}

	if (shouldRedirectToLogin) {
		return <Redirect href="/" />;
	}

	if (shouldRedirectToHome) {
		return <Redirect href={{ pathname: '/home', params: { tab: '0' } }} />;
	}

	return <Stack screenOptions={{ headerShown: false }} />;
};

const LayoutWithTheme = () => {
	const { themeMode } = useAppTheme();

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<GluestackUIProvider mode={themeMode}>
				<AuthProvider>
					<AuthenticatedStack />
				</AuthProvider>
			</GluestackUIProvider>
		</GestureHandlerRootView>
	);
};

export default function RootLayout() {
	return (
		<ThemeProvider>
			<ValueVisibilityProvider>
				<LayoutWithTheme />
			</ValueVisibilityProvider>
		</ThemeProvider>
	);
}
