import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Polygon, Rect } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

const useLoopAnimation = (duration: number) => {
	const progress = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const animation = Animated.loop(
			Animated.timing(progress, {
				toValue: 1,
				duration,
				easing: Easing.linear,
				useNativeDriver: false,
			}),
		);

		animation.start();

		return () => animation.stop();
	}, [duration, progress]);

	return progress;
};

const Loader = () => {
	const sharedProgress = useLoopAnimation(3000);
	const triangleProgress = useLoopAnimation(3000);

	const circleDashOffset = sharedProgress.interpolate({
		inputRange: [0, 0.25, 0.5, 0.75, 1],
		outputRange: [75, 125, 175, 225, 275],
	});

	const rectDashOffset = sharedProgress.interpolate({
		inputRange: [0, 0.25, 0.5, 0.75, 1],
		outputRange: [0, 64, 128, 192, 256],
	});

	const triangleDashOffset = triangleProgress.interpolate({
		inputRange: [0, 0.33, 0.66, 1],
		outputRange: [0, 74, 147, 221],
	});

	return (
		<View style={styles.wrapper}>
			<View style={styles.loader}>
				<Svg viewBox="0 0 80 80" style={styles.svg}>
					<AnimatedCircle
						r={32}
						cx={40}
						cy={40}
						fill="none"
						stroke="#2f3545"
						strokeWidth={10}
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeDasharray="150 50 150 50"
						strokeDashoffset={circleDashOffset}
					/>
				</Svg>
			</View>

			<View style={[styles.loader, styles.triangle]}>
				<Svg viewBox="0 0 86 80" style={styles.svg}>
					<AnimatedPolygon
						points="43 8 79 72 7 72"
						fill="none"
						stroke="#2f3545"
						strokeWidth={10}
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeDasharray="145 76 145 76"
						strokeDashoffset={triangleDashOffset}
					/>
				</Svg>
			</View>

			<View style={styles.loader}>
				<Svg viewBox="0 0 80 80" style={styles.svg}>
					<AnimatedRect
						x={8}
						y={8}
						width={64}
						height={64}
						fill="none"
						stroke="#2f3545"
						strokeWidth={10}
						rx={8}
						strokeDasharray="192 64 192 64"
						strokeDashoffset={rectDashOffset}
					/>
				</Svg>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	wrapper: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
	},
	loader: {
		width: 44,
		height: 44,
		alignItems: 'center',
		justifyContent: 'center',
		marginHorizontal: 8,
	},
	triangle: {
		width: 48,
	},
	svg: {
		width: '100%',
		height: '100%',
	},
});

export default Loader;
