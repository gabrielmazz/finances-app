import React from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function Loader() {
	return (
		<View accessibilityRole="progressbar" accessibilityLabel="Carregando" className="items-center justify-center">
			<ActivityIndicator color="#2f3545" size="large" />
		</View>
	);
}
