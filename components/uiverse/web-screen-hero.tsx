import React from 'react';

import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';

type WebScreenHeroProps = {
	title: string;
	Illustration: React.ComponentType<any>;
	isDarkMode: boolean;
	topPadding: number;
	illustrationWidth?: string | number;
	illustrationHeight?: string | number;
};

export default function WebScreenHero({
	title,
	Illustration,
	isDarkMode,
	topPadding,
	illustrationWidth = '40%',
	illustrationHeight = '40%',
}: WebScreenHeroProps) {
	return (
		<VStack
			className="h-full w-full items-center justify-start gap-4 px-6"
			style={{ paddingTop: topPadding }}
		>
			<Heading size="xl" className="text-center text-white">
				{title}
			</Heading>
			<Illustration width={illustrationWidth} height={illustrationHeight} className="opacity-90" />
		</VStack>
	);
}
