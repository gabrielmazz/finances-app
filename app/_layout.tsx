import { Stack } from 'expo-router';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ValueVisibilityProvider } from '@/contexts/ValueVisibilityContext';
import '@/global.css';

export default function RootLayout() {
	return (
		<ValueVisibilityProvider>
			<GluestackUIProvider>
				<Stack screenOptions={{ headerShown: false }} />
			</GluestackUIProvider>
		</ValueVisibilityProvider>
	);
}
