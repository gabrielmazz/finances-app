import type { ViewStyle, ImageStyle } from 'react-native';

export const BANK_ADJUSTMENT_HERO_IMAGE_STYLE: ImageStyle = { position: 'absolute', width: '100%', height: '100%', top: 0, left: 0 };

/**
 * Props required by third-party native APIs that do not accept NativeWind.
 * Every entry must also be described in style-exceptions.json.
 */
export const NATIVE_LIBRARY_STYLES = {
	notifierContainer: {
		zIndex: 70,
		elevation: 70,
	} satisfies ViewStyle,
	calendarModalBodyContent: {
		alignItems: 'stretch',
		flexGrow: 0,
		flexShrink: 0,
		flexBasis: 'auto',
		paddingBottom: 24,
	} satisfies ViewStyle,
} as const;
