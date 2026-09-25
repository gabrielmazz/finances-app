import React from 'react';
import type { LayoutChangeEvent } from 'react-native';
import Animated, {
	cancelAnimation,
	Easing,
	useAnimatedProps,
	useReducedMotion,
	useSharedValue,
	withRepeat,
	withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import { Box } from '@/components/ui/box';
import { LUMUS_RUNTIME_COLORS } from '@/design-system/tokens';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const COMPOSER_RADIUS = 24;
const BEAM_LENGTH = 62;

export type AssistantComposerFrameProps = React.PropsWithChildren<{
	active: boolean;
	theme: 'dark' | 'light';
	className: string;
}>;

export const AssistantComposerFrame = ({ active, theme, className, children }: AssistantComposerFrameProps) => {
	const [size, setSize] = React.useState({ width: 0, height: 0 });
	const progress = useSharedValue(0);
	const reduceMotion = useReducedMotion();
	const radius = Math.min(COMPOSER_RADIUS, Math.max(0, (size.height - 2) / 2));
	const innerWidth = Math.max(0, size.width - 2);
	const innerHeight = Math.max(0, size.height - 2);
	const perimeter = innerWidth > 0 && innerHeight > 0
		? 2 * (innerWidth + innerHeight - 4 * radius) + 2 * Math.PI * radius
		: 0;
	const dashLength = Math.min(BEAM_LENGTH, perimeter);
	const dashGap = Math.max(1, perimeter - dashLength);

	const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
		const { width, height } = event.nativeEvent.layout;
		setSize(current => current.width === width && current.height === height ? current : { width, height });
	}, []);
	const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: -progress.value }));

	React.useEffect(() => {
		cancelAnimation(progress);
		if (!active || reduceMotion || perimeter <= 0) {
			progress.value = 0;
			return;
		}

		progress.value = withRepeat(withTiming(perimeter, { duration: 2600, easing: Easing.linear }), -1, false);
		return () => cancelAnimation(progress);
	}, [active, perimeter, progress, reduceMotion]);

	const accent = LUMUS_RUNTIME_COLORS[theme].accent;

	return (
		<Box onLayout={handleLayout} className={`relative w-full ${className}`}>
			{children}
			{active && size.width > 2 && size.height > 2 ? (
				<Box pointerEvents="none" className="absolute inset-0">
					<Svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}>
						<AnimatedRect
							x={1}
							y={1}
							width={innerWidth}
							height={innerHeight}
							rx={radius}
							fill="none"
							stroke={accent}
							strokeWidth={7}
							strokeLinecap="round"
							strokeDasharray={`${dashLength} ${dashGap}`}
							strokeDashoffset={0}
							opacity={0.12}
							animatedProps={animatedProps}
						/>
						<AnimatedRect
							x={1}
							y={1}
							width={innerWidth}
							height={innerHeight}
							rx={radius}
							fill="none"
							stroke={accent}
							strokeWidth={1.5}
							strokeLinecap="round"
							strokeDasharray={`${dashLength} ${dashGap}`}
							strokeDashoffset={0}
							animatedProps={animatedProps}
						/>
					</Svg>
				</Box>
			) : null}
		</Box>
	);
};
