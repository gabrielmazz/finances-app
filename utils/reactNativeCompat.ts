import React from 'react';
import { Platform, UIManager } from 'react-native';

type EffectEvent = <Arguments extends unknown[], Result>(
	callback: (...arguments_: Arguments) => Result,
) => (...arguments_: Arguments) => Result;

type ReactWithEffectEvent = typeof React & {
	useEffectEvent?: EffectEvent;
};

const reactRuntime = React as ReactWithEffectEvent;

if (typeof reactRuntime.useEffectEvent !== 'function') {
	// Mantine 9.5 uses React 19.2's useEffectEvent, while Expo 54 currently pins React 19.1.
	// Keep the event callback stable and update the implementation after each render.
	reactRuntime.useEffectEvent = <Arguments extends unknown[], Result>(
		callback: (...arguments_: Arguments) => Result,
	) => {
		const callbackRef = React.useRef(callback);

		React.useLayoutEffect(() => {
			callbackRef.current = callback;
		}, [callback]);

		return React.useCallback(
			(...arguments_: Arguments) => callbackRef.current(...arguments_),
			[],
		);
	};
}

if (Platform.OS === 'android' && typeof UIManager.setLayoutAnimationEnabledExperimental === 'function') {
	// Some dependencies still call this legacy API even though it is a no-op in the New Architecture.
	UIManager.setLayoutAnimationEnabledExperimental = () => {};
}
