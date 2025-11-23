import { Stack } from 'expo-router';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ValueVisibilityProvider } from '@/contexts/ValueVisibilityContext';
import { ThemeProvider, useAppTheme } from '@/contexts/ThemeContext';
import '@/global.css';

const LayoutWithTheme = () => {
	const { themeMode } = useAppTheme();

	return (
		<GluestackUIProvider mode={themeMode}>
			<Stack screenOptions={{ headerShown: false }} />
		</GluestackUIProvider>
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
