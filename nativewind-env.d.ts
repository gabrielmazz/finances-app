/// <reference types="nativewind/types" />
/// <reference path="./types/assets.d.ts" />
/// <reference path="./types/svg.d.ts" />

// React Native 0.81 declares the props consumed by JSX in the concrete
// component modules below. NativeWind augments the `react-native` barrel,
// but TypeScript does not carry that augmentation into these re-exported
// interfaces, which makes valid `className` props appear as errors.
declare module 'react-native/Libraries/Components/View/ViewPropTypes' {
	interface ViewProps {
		className?: string;
		cssInterop?: boolean;
	}
}

declare module 'react-native/Libraries/Components/Keyboard/KeyboardAvoidingView' {
	interface KeyboardAvoidingViewProps {
		contentContainerClassName?: string;
	}
}

declare module 'react-native/Libraries/Components/ScrollView/ScrollView' {
	interface ScrollViewProps {
		contentContainerClassName?: string;
		indicatorClassName?: string;
	}
}

declare module 'react-native/Libraries/Image/Image' {
	interface ImagePropsBase {
		className?: string;
		cssInterop?: boolean;
	}
}

declare module 'react-native/Libraries/Text/Text' {
	interface TextProps {
		className?: string;
		cssInterop?: boolean;
	}
}
