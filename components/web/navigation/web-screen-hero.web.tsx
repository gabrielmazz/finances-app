import React from 'react';
import { View } from 'react-native';

import AnimatedContent from '@/components/web/motion/AnimatedContent';
import Grainient from '@/components/web/visuals/Grainient';
import StrokeText from '@/components/web/visuals/StrokeText';
import { WEB_DASHBOARD_CLASS_NAMES } from '@/design-system/web-dashboard';
import { LUMUS_FONT_STACKS, LUMUS_HERO_COLORS } from '@/design-system/tokens';

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
	const heroColors = isDarkMode ? LUMUS_HERO_COLORS.dark : LUMUS_HERO_COLORS.light;

	return (
		<>
			<View
				pointerEvents="none"
				className="absolute inset-0 z-content h-full w-full opacity-hero"
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
					color1={heroColors[0]}
					color2={heroColors[1]}
					color3={heroColors[2]}
				/>
			</View>
			<div
				className="pointer-events-none relative z-[2] flex h-full w-full flex-col items-center justify-start gap-[14px] px-6"
				style={{ paddingTop: topPadding }}
			>
				<StrokeText
					text={title}
					strokeColor={LUMUS_HERO_COLORS.text}
					fillColor={LUMUS_HERO_COLORS.text}
					strokeWidth={1.5}
					drawDuration={2}
					fillDelay={1}
					fontSize={40}
					fontWeight={600}
					letterSpacing={-0.5}
					fontFamily={LUMUS_FONT_STACKS.sans}
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
