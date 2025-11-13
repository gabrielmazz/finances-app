import { Stack } from 'expo-router';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '@/global.css';

export default function RootLayout() {
    return (
        <GluestackUIProvider>
            <Stack screenOptions={{ headerShown: false }} />
        </GluestackUIProvider>
    );
}
