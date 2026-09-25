import React from 'react';
import { BorderBeam } from 'border-beam';
import { useReducedMotion } from 'motion/react';

export type AssistantComposerFrameProps = React.PropsWithChildren<{
	active: boolean;
	theme: 'dark' | 'light';
	className: string;
}>;

export const AssistantComposerFrame = ({ active, theme, className, children }: AssistantComposerFrameProps) => {
	const prefersReducedMotion = useReducedMotion();

	return (
		<BorderBeam
			active={active && !prefersReducedMotion}
			borderRadius={24}
			className={className}
			colorVariant="gold"
			size="md"
			staticColors
			strength={0.55}
			theme={theme}
		>
			{children}
		</BorderBeam>
	);
};
