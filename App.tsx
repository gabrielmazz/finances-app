import React from 'react';
import { ExpoRoot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { bootstrapLocalNotifications } from '@/utils/localNotifications';

export default function App() {
	
	React.useEffect(() => {
		void bootstrapLocalNotifications();
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
