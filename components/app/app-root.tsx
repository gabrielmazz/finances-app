import FeatureUnavailableNotice from '@/components/app/feature-unavailable';
import { APP_ROUTE_PATHS } from '@/utils/navigation';
import { FontAwesome6, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack, usePathname } from 'expo-router';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { WebNotifierAlertHost } from '@/components/uiverse/feedback/notifier-alert';
import NotifierBoundary from '@/components/uiverse/feedback/notifier-boundary';
import WebAppShell from '@/components/uiverse/navigation/web-app-shell';
import Loader from '@/components/uiverse/shared/loader';
import { PostSubmitBehaviorProvider } from '@/contexts/PostSubmitBehaviorContext';
import { RouteVisibilityProvider, useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import { ThemeProvider, useAppTheme } from '@/contexts/ThemeContext';
import { ValueVisibilityProvider } from '@/contexts/ValueVisibilityContext';
import { SessionProvider } from '@/contexts/SessionContext';
import { BankAccountsProvider } from '@/contexts/BankAccountsContext';
import { useSession } from '@/hooks/useSession';

import { APP_ROUTE_GUARD_ENTRIES, isAppRouteAllowed } from '@/utils/appRouteGuards';

const AppBootstrapScreen = () => {
	return (
		<SafeAreaView className="flex-1 bg-white dark:bg-slate-950">
			<View className="flex-1 items-center justify-center bg-white dark:bg-slate-950">
				<Loader />
			</View>
		</SafeAreaView>
	);
};

const PresentationStack = () => {
	const pathname = usePathname();
	const showWorkspace = pathname !== APP_ROUTE_PATHS.login && pathname !== '/';
	const { isLoadingTheme } = useAppTheme();
	const { initializing, user, error, contextError } = useSession();
	const { isLoadingRouteVisibility, isRouteVisible } = useRouteVisibility();
	if (isLoadingTheme || isLoadingRouteVisibility || initializing) return <AppBootstrapScreen />;
	return (
		<View className="flex-1">
			{showWorkspace && (
                <SafeAreaView edges={['top']} className="bg-background-0">
                    <FeatureUnavailableNotice showWorkspace message={contextError || error || (process.env.EXPO_PUBLIC_FIREBASE_MODE==='emulator'?'Bancos e saldo inicial disponíveis em testes. Os demais módulos financeiros continuam em reconstrução.':undefined)} />
                </SafeAreaView>
            )}
			<WebAppShell showWorkspace={showWorkspace}>
				<Stack screenOptions={{ headerShown: false }}>
					<Stack.Screen name="index" />
					{APP_ROUTE_GUARD_ENTRIES.map((entry) => (
						<Stack.Protected key={entry.name} guard={isAppRouteAllowed(entry, isRouteVisible, !!user)}>
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
					<PresentationStack />
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
	if (!iconFontsLoaded && !iconFontsError) return <AppBootstrapScreen />;

	return (
		<ThemeProvider>
			<ValueVisibilityProvider>
				<PostSubmitBehaviorProvider>
					<RouteVisibilityProvider>
								<SessionProvider>
                                <BankAccountsProvider>
                                    <LayoutWithTheme />
                                </BankAccountsProvider>
                            </SessionProvider>
					</RouteVisibilityProvider>
				</PostSubmitBehaviorProvider>
			</ValueVisibilityProvider>
		</ThemeProvider>
	);
}
