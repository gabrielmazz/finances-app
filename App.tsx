import React from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ExpoRoot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';

Notifications.setNotificationHandler({
	handleNotification: async () => ({
		shouldShowAlert: true,
		shouldPlaySound: false,
		shouldSetBadge: false,
		shouldShowBanner: true,
		shouldShowList: true,
	}),
});

export default function App() {
	
	React.useEffect(() => {
		if (Platform.OS === 'android') {
			void Notifications.setNotificationChannelAsync('mandatory-expenses', {
				name: 'Gastos obrigatórios',
				importance: Notifications.AndroidImportance.DEFAULT,
				description: 'Lembretes para os gastos obrigatórios cadastrados.',
			});

			void Notifications.setNotificationChannelAsync('mandatory-gains', {
				name: 'Ganhos obrigatórios',
				importance: Notifications.AndroidImportance.DEFAULT,
				description: 'Lembretes para os ganhos obrigatórios cadastrados.',
			});
		}
	}, []);

	
	// Importação de fontes customizadas
	const [fontsLoaded] = useFonts({
		'Arimo': require('./assets/Fonts/Arimo-VariableFont_wght.ttf'),
		'IBMPlexSans': require('./assets/Fonts/IBMPlexSans-VariableFont_wdth,wght.ttf'),
		'Metamorphous': require('./assets/Fonts/Metamorphous-Regular.ttf'),
		'Obitron': require('./assets/Fonts/Obitron-VariableFont_wght.ttf'),
		'Raleway': require('./assets/Fonts/Raleway-VariableFont_wght.ttf'),
	});

	// `require.context` is provided by Metro to let expo-router discover routes.
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const context = (require as any).context('./app');
	return (
		<SafeAreaProvider>
			<ExpoRoot context={context} />
		</SafeAreaProvider>
	);
}
