import React from 'react';
import { Keyboard, Platform, TouchableWithoutFeedback } from 'react-native';

export function ScreenDismissKeyboard({ children }: React.PropsWithChildren) {
	if (Platform.OS === 'web') {
		return <>{children}</>;
	}

	return (
		<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
			{children}
		</TouchableWithoutFeedback>
	);
}
