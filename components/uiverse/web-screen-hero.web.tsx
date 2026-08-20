import React from 'react';
import { View } from 'react-native';

import AnimatedContent from '@/components/web/AnimatedContent';
import Grainient from '@/components/web/Grainient';
import StrokeText from '@/components/web/StrokeText';
import { WEB_DASHBOARD_CLASS_NAMES } from '@/hooks/useScreenStyle';

type WebScreenHeroProps = {
	title: string;
	Illustration: React.ComponentType<any>;
	isDarkMode: boolean;
	topPadding: number;
};

export default function WebScreenHero({
	title,
	Illustration,
	isDarkMode,
	topPadding,
}: WebScreenHeroProps) {
	return (
		<>
			<View
				pointerEvents="none"
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					width: '100%',
					height: '100%',
					opacity: 0.62,
					zIndex: 1,
				}}
				aria-hidden
			>
				<Grainient
					className="web-screen-hero-grainient"
					timeSpeed={0.12}
					colorBalance={isDarkMode ? 0.08 : -0.12}
					warpStrength={0.8}
					warpFrequency={3.5}
					warpSpeed={1.8}
					warpAmplitude={100}
					blendSoftness={0.18}
					grainAmount={0.08}
					grainScale={3}
					grainAnimated
					contrast={1.08}
					zoom={0.9}
					color1={isDarkMode ? '#f8bd0c' : '#FFE58A'}
					color2={isDarkMode ? '#facc15' : '#D97706'}
					color3={isDarkMode ? '#fefe59' : '#EAB308'}
				/>
			</View>
			<div
				className="pointer-events-none relative z-[2] flex h-full w-full flex-col items-center justify-start gap-[14px] px-6"
				style={{ paddingTop: topPadding }}
			>
				<StrokeText
					text={title}
					strokeColor="#FFFFFF"
					fillColor="#FFFFFF"
					strokeWidth={1.5}
					drawDuration={2}
					fillDelay={1}
					fontSize={40}
					fontWeight={600}
					letterSpacing={-0.5}
					fontFamily={'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'}
					ease="power3.out"
					trigger="mount"
					className="block w-full max-w-[620px] text-center text-[25px] font-extrabold text-white"
				/>
				<AnimatedContent
					distance={100}
					direction="vertical"
					reverse={false}
					duration={2}
					ease="power3.out"
					initialOpacity={0}
					animateOpacity
					scale={1}
					threshold={0.1}
					delay={0}
					trigger="mount"
					className={WEB_DASHBOARD_CLASS_NAMES.heroIllustrationAnimation}
				>
					<Illustration
						width="40%"
						height="100%"
						className="opacity-90"
						aria-hidden
					/>
				</AnimatedContent>
			</div>
		</>
	);
}
