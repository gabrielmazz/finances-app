import React from 'react';
import { Text as RNText, View, type TextProps, type ViewProps } from 'react-native';

export type BadgeSize = 'sm' | 'md' | 'lg';
export type BadgeVariant = 'solid' | 'outline';
export type BadgeAction = 'muted' | 'positive' | 'negative' | 'warning';

type BadgeContextValue = {
	action: BadgeAction;
	size: BadgeSize;
	variant: BadgeVariant;
};

const BadgeContext = React.createContext<BadgeContextValue>({
	action: 'muted',
	size: 'md',
	variant: 'solid',
});

const cx = (...classNames: Array<string | false | null | undefined>) =>
	classNames.filter(Boolean).join(' ');

const badgeSizeClassNames: Record<BadgeSize, string> = {
	sm: 'pl-2 pr-2 py-0.5',
	md: 'pl-2.5 pr-2.5 py-1',
	lg: 'pl-3 pr-3 py-1.5',
};

const badgeContainerClassNames: Record<BadgeVariant, Record<BadgeAction, string>> = {
	outline: {
		muted: 'border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900',
		positive: 'border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40',
		negative: 'border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40',
		warning: 'border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40',
	},
	solid: {
		muted: 'border border-slate-600 bg-slate-700 dark:border-slate-500 dark:bg-slate-600',
		positive: 'border border-emerald-600 bg-emerald-600 dark:border-emerald-500 dark:bg-emerald-500',
		negative: 'border border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500',
		warning: 'border border-amber-500 bg-amber-500 dark:border-amber-400 dark:bg-amber-400',
	},
};

const badgeTextClassNames: Record<BadgeVariant, Record<BadgeAction, string>> = {
	outline: {
		muted: 'text-slate-700 dark:text-slate-300',
		positive: 'text-emerald-700 dark:text-emerald-300',
		negative: 'text-red-700 dark:text-red-300',
		warning: 'text-amber-700 dark:text-amber-300',
	},
	solid: {
		muted: 'text-white dark:text-slate-100',
		positive: 'text-white',
		negative: 'text-white',
		warning: 'text-slate-950',
	},
};

const badgeIconSizeByBadgeSize = {
	sm: 'xs',
	md: 'sm',
	lg: 'md',
} as const;

type BadgeProps = ViewProps & {
	action?: BadgeAction;
	size?: BadgeSize;
	variant?: BadgeVariant;
	className?: string;
};

type BadgeTextProps = TextProps & {
	className?: string;
};

type BadgeIconProps = {
	as?: React.ComponentType<any>;
	className?: string;
	size?: '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
	[key: string]: unknown;
};

const Badge = React.forwardRef<React.ComponentRef<typeof View>, BadgeProps>(function Badge(
	{
		action = 'muted',
		size = 'md',
		variant = 'solid',
		className,
		children,
		...props
	},
	ref,
) {
	return (
		<BadgeContext.Provider value={{ action, size, variant }}>
			<View
				ref={ref}
				className={cx(
					'self-start flex-row items-center justify-center rounded-full',
					badgeSizeClassNames[size],
					badgeContainerClassNames[variant][action],
					className,
				)}
				{...props}
			>
				{children}
			</View>
		</BadgeContext.Provider>
	);
});

const BadgeText = React.forwardRef<React.ComponentRef<typeof RNText>, BadgeTextProps>(function BadgeText(
	{ className, children, ...props },
	ref,
) {
	const { action, variant, size } = React.useContext(BadgeContext);

	return (
		<RNText
			ref={ref}
			className={cx(
				'font-semibold',
				size === 'lg' ? 'text-sm' : 'text-xs',
				badgeTextClassNames[variant][action],
				'text-center',
				className,
			)}
			{...props}
		>
			{children}
		</RNText>
	);
});

function BadgeIcon({ as: IconComponent, className, size, ...props }: BadgeIconProps) {
	const { action, variant, size: badgeSize } = React.useContext(BadgeContext);

	if (!IconComponent) {
		return null;
	}

	return (
		<IconComponent
			size={size ?? badgeIconSizeByBadgeSize[badgeSize]}
			className={cx(badgeTextClassNames[variant][action], className)}
			{...props}
		/>
	);
}

export { Badge, BadgeText, BadgeIcon };
