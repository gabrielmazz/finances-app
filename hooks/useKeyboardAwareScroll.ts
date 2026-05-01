import React from 'react';
import {
	findNodeHandle,
	Keyboard,
	Platform,
	ScrollView,
	TextInput,
	useWindowDimensions,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
} from 'react-native';

type InputRef = React.RefObject<TextInput | null> | React.RefObject<any>;

type UseKeyboardAwareScrollOptions<InputKey extends string> = {
	getInputRef: (key: InputKey) => InputRef | null;
	keyboardScrollOffset?: (key: InputKey) => number;
	minBottomPadding?: number;
	bottomPaddingOffset?: number;
	focusRetryDelays?: number[];
	keyboardRetryDelays?: number[];
};

const defaultKeyboardScrollOffset = () => 120;
const defaultFocusRetryDelays = [100, 250, 450];
const defaultKeyboardRetryDelays = [50, 150];

export function useKeyboardAwareScroll<InputKey extends string>({
	getInputRef,
	keyboardScrollOffset = defaultKeyboardScrollOffset,
	minBottomPadding = 140,
	bottomPaddingOffset = 120,
	focusRetryDelays = defaultFocusRetryDelays,
	keyboardRetryDelays = defaultKeyboardRetryDelays,
}: UseKeyboardAwareScrollOptions<InputKey>) {
	const { height: windowHeight } = useWindowDimensions();
	const scrollViewRef = React.useRef<ScrollView | null>(null);
	const lastFocusedInputKey = React.useRef<InputKey | null>(null);
	const scrollYRef = React.useRef(0);
	const keyboardHeightRef = React.useRef(0);
	const keyboardTopRef = React.useRef<number | null>(null);
	const [keyboardHeight, setKeyboardHeight] = React.useState(0);

	const scrollToInput = React.useCallback(
		(key: InputKey) => {
			const inputRef = getInputRef(key);
			if (!inputRef?.current) {
				return;
			}

			const nodeHandle = findNodeHandle(inputRef.current);
			const scrollViewNode = scrollViewRef.current;
			const scrollResponder = scrollViewNode?.getScrollResponder?.();
			const innerViewNode = scrollViewNode?.getInnerViewNode?.();
			const offset = keyboardScrollOffset(key);

			if (scrollResponder && nodeHandle) {
				scrollResponder.scrollResponderScrollNativeHandleToKeyboard(nodeHandle, offset, true);
			} else if (scrollViewNode && innerViewNode && typeof inputRef.current.measureLayout === 'function') {
				inputRef.current.measureLayout(
					innerViewNode,
					(_x: number, y: number) =>
						scrollViewNode.scrollTo({
							y: Math.max(0, y - offset),
							animated: true,
						}),
					() => {},
				);
			}

			const keyboardTop =
				keyboardTopRef.current ??
				(keyboardHeightRef.current > 0 ? windowHeight - keyboardHeightRef.current : null);

			if (!keyboardTop || typeof inputRef.current.measureInWindow !== 'function') {
				return;
			}

			// Segue [[Componentes UI]]: campos editáveis devem permanecer acima do teclado.
			inputRef.current.measureInWindow((_x: number, y: number, _width: number, height: number) => {
				const inputBottom = y + height;
				const visibleBottom = keyboardTop - offset;

				if (inputBottom <= visibleBottom) {
					return;
				}

				scrollViewNode?.scrollTo({
					y: Math.max(0, scrollYRef.current + inputBottom - visibleBottom),
					animated: true,
				});
			});
		},
		[getInputRef, keyboardScrollOffset, windowHeight],
	);

	const handleInputFocus = React.useCallback(
		(key: InputKey) => {
			lastFocusedInputKey.current = key;
			scrollToInput(key);
			focusRetryDelays.forEach(delay => {
				setTimeout(() => scrollToInput(key), delay);
			});
		},
		[focusRetryDelays, scrollToInput],
	);

	React.useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

		const showSub = Keyboard.addListener(showEvent, e => {
			const nextKeyboardHeight = e.endCoordinates?.height ?? 0;
			keyboardHeightRef.current = nextKeyboardHeight;
			keyboardTopRef.current = e.endCoordinates?.screenY ?? (nextKeyboardHeight > 0 ? windowHeight - nextKeyboardHeight : null);
			setKeyboardHeight(nextKeyboardHeight);

			const focusedKey = lastFocusedInputKey.current;
			if (focusedKey) {
				keyboardRetryDelays.forEach(delay => {
					setTimeout(() => scrollToInput(focusedKey), delay);
				});
			}
		});

		const hideSub = Keyboard.addListener(hideEvent, () => {
			keyboardHeightRef.current = 0;
			keyboardTopRef.current = null;
			setKeyboardHeight(0);
		});

		return () => {
			showSub.remove();
			hideSub.remove();
		};
	}, [keyboardRetryDelays, scrollToInput, windowHeight]);

	const handleScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
		scrollYRef.current = event.nativeEvent.contentOffset.y;
	}, []);

	const contentBottomPadding = React.useMemo(
		() => Math.max(minBottomPadding, keyboardHeight + bottomPaddingOffset),
		[bottomPaddingOffset, keyboardHeight, minBottomPadding],
	);

	return {
		scrollViewRef,
		keyboardHeight,
		contentBottomPadding,
		handleInputFocus,
		scrollToInput,
		handleScroll,
		scrollEventThrottle: 16,
	};
}
