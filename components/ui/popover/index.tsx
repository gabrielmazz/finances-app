'use client';
import React from 'react';
import { createPopover } from '@gluestack-ui/core/popover/creator';
import { Pressable, View, ViewStyle } from 'react-native';
import {
	Motion,
	AnimatePresence,
	createMotionAnimatedComponent,
	MotionComponentProps,
} from '@legendapp/motion';
import {
	tva,
	withStyleContext,
	useStyleContext,
	type VariantProps,
} from '@gluestack-ui/utils/nativewind-utils';
import { cssInterop } from 'nativewind';

const SCOPE = 'POPOVER';

type IAnimatedPressableProps = React.ComponentProps<typeof Pressable> &
	MotionComponentProps<typeof Pressable, ViewStyle, unknown, unknown, unknown>;

type IMotionViewProps = React.ComponentProps<typeof View> &
	MotionComponentProps<typeof View, ViewStyle, unknown, unknown, unknown>;

const AnimatedPressable = createMotionAnimatedComponent(
	Pressable,
) as React.ComponentType<IAnimatedPressableProps>;

const MotionView = Motion.View as React.ComponentType<IMotionViewProps>;

const UIPopover = createPopover({
	Root: withStyleContext(View, SCOPE),
	Arrow: MotionView,
	Content: MotionView,
	Header: View,
	Footer: View,
	Body: View,
	Backdrop: AnimatedPressable,
	CloseButton: Pressable,
	AnimatePresence,
});

cssInterop(AnimatedPressable, { className: 'style' });
cssInterop(MotionView, { className: 'style' });

const popoverStyle = tva({
	base: 'absolute left-0 top-0 right-0 bottom-0 web:pointer-events-none',
	variants: {
		size: {
			sm: '',
			md: '',
			lg: '',
		},
	},
});

const popoverBackdropStyle = tva({
	base: 'absolute left-0 top-0 right-0 bottom-0 bg-transparent',
});

const popoverContentStyle = tva({
	base: 'rounded-2xl border border-outline-200 bg-background-0 shadow-hard-5',
	parentVariants: {
		size: {
			sm: 'min-w-[160px] max-w-[188px]',
			md: 'min-w-[180px] max-w-[208px]',
			lg: 'min-w-[200px] max-w-[228px]',
		},
	},
});

const popoverArrowStyle = tva({
	base: 'h-3.5 w-3.5 rotate-45 border-l border-t border-outline-200 bg-background-0',
});

const popoverBodyStyle = tva({
	base: 'px-4 py-3',
});

type IPopoverProps = React.ComponentProps<typeof UIPopover> &
	VariantProps<typeof popoverStyle> & { className?: string };

type IPopoverBackdropProps = React.ComponentProps<typeof UIPopover.Backdrop> &
	VariantProps<typeof popoverBackdropStyle> & { className?: string };

type IPopoverContentProps = React.ComponentProps<typeof UIPopover.Content> &
	VariantProps<typeof popoverContentStyle> & { className?: string };

type IPopoverArrowProps = React.ComponentProps<typeof UIPopover.Arrow> &
	VariantProps<typeof popoverArrowStyle> & { className?: string };

type IPopoverBodyProps = React.ComponentProps<typeof UIPopover.Body> &
	VariantProps<typeof popoverBodyStyle> & { className?: string };

const Popover = React.forwardRef<React.ComponentRef<typeof UIPopover>, IPopoverProps>(
	function Popover({ className, size = 'md', ...props }, ref) {
		return (
			<UIPopover
				ref={ref}
				{...props}
				className={popoverStyle({ size, class: className })}
				context={{ size }}
				pointerEvents="box-none"
			/>
		);
	},
);

const PopoverBackdrop = React.forwardRef<
	React.ComponentRef<typeof UIPopover.Backdrop>,
	IPopoverBackdropProps
>(function PopoverBackdrop({ className, ...props }, ref) {
	return (
		<UIPopover.Backdrop
			ref={ref}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{
				type: 'timing',
				duration: 120,
			}}
			{...props}
			className={popoverBackdropStyle({ class: className })}
		/>
	);
});

const PopoverContent = React.forwardRef<
	React.ComponentRef<typeof UIPopover.Content>,
	IPopoverContentProps
>(function PopoverContent({ className, size, ...props }, ref) {
	const { size: parentSize } = useStyleContext(SCOPE);

	return (
		<UIPopover.Content
			ref={ref}
			{...props}
			className={popoverContentStyle({
				parentVariants: { size: parentSize },
				size,
				class: className,
			})}
		/>
	);
});

const PopoverArrow = React.forwardRef<
	React.ComponentRef<typeof UIPopover.Arrow>,
	IPopoverArrowProps
>(function PopoverArrow({ className, ...props }, ref) {
	return (
		<UIPopover.Arrow
			ref={ref}
			{...props}
			className={popoverArrowStyle({ class: className })}
		/>
	);
});

const PopoverBody = React.forwardRef<
	React.ComponentRef<typeof UIPopover.Body>,
	IPopoverBodyProps
>(function PopoverBody({ className, ...props }, ref) {
	return (
		<UIPopover.Body
			ref={ref}
			{...props}
			className={popoverBodyStyle({ class: className })}
		/>
	);
});

Popover.displayName = 'Popover';
PopoverBackdrop.displayName = 'PopoverBackdrop';
PopoverContent.displayName = 'PopoverContent';
PopoverArrow.displayName = 'PopoverArrow';
PopoverBody.displayName = 'PopoverBody';

export { Popover, PopoverBackdrop, PopoverContent, PopoverArrow, PopoverBody };
