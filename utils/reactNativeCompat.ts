import { Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && typeof UIManager.setLayoutAnimationEnabledExperimental === 'function') {
	// Some dependencies still call this legacy API even though it is a no-op in the New Architecture.
	UIManager.setLayoutAnimationEnabledExperimental = () => {};
}
