import type { CSSProperties } from 'react';

import { cn } from '@/lib/utils';
import {
	LUMUS_FONT_STACKS,
	LUMUS_RUNTIME_COLORS,
} from '@/design-system/tokens';

export const MANTINE_TABS_CLASS_NAMES = {
	root: 'w-full',
	list: 'w-full',
	tab: [
		'flex-1 justify-center text-lumus-on-accent',
		'data-[active]:bg-lumus-accent dark:data-[active]:bg-lumus-accent-dark',
		'data-[active]:text-lumus-on-accent data-[active]:shadow-lumus-accent',
		'hover:bg-white dark:hover:bg-lumus-surface-hover-dark hover:text-slate-900 dark:hover:text-slate-100',
		'focus-visible:outline-2 focus-visible:outline-lumus-focus focus-visible:outline-offset-2',
		'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40',
	].join(' '),
} as const;

export const MANTINE_TAGS_INPUT_CLASS_NAMES = {
	input:
		'border-slate-200 dark:border-slate-800 web:focus-within:border-lumus-focus dark:web:focus-within:border-lumus-accent-dark web:focus-within:ring-2 web:focus-within:ring-lumus-accent dark:web:focus-within:ring-lumus-accent-dark',
	inputField: 'text-left placeholder:text-left',
	option: [
		'text-white',
		'data-[combobox-selected]:outline-2 data-[combobox-selected]:outline-white data-[combobox-selected]:-outline-offset-2',
		'focus-visible:outline-2 focus-visible:outline-white focus-visible:-outline-offset-2',
	].join(' '),
} as const;

export const MANTINE_ASSISTANT_TEXTAREA_CLASS_NAMES = {
	root: 'min-w-0 flex-1',
	wrapper: 'w-full',
	input: [
		'min-h-touch max-h-32 resize-none rounded-2xl border-slate-200 bg-white px-3 py-2.5 text-base leading-5 text-slate-900 placeholder:text-slate-500',
		'web:transition-colors web:focus:border-lumus-focus web:focus:ring-2 web:focus:ring-lumus-accent',
		'dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-white',
		'dark:web:focus:border-lumus-accent-dark dark:web:focus:ring-lumus-accent-dark',
		'disabled:cursor-not-allowed disabled:opacity-50',
	].join(' '),
} as const;

export const MANTINE_TABS_CSS_VARIABLES = {
	'--tabs-color': LUMUS_RUNTIME_COLORS.light.accent,
	'--tabs-text-color': LUMUS_RUNTIME_COLORS.light.onAccent,
} as CSSProperties;

export const MANTINE_MOVEMENT_TABS_CLASS_NAMES = {
	...MANTINE_TABS_CLASS_NAMES,
	tab: cn(
		MANTINE_TABS_CLASS_NAMES.tab.replace('dark:data-[active]:bg-lumus-accent-dark', ''),
		'data-[active]:bg-lumus-accent dark:data-[active]:bg-lumus-accent data-[active]:text-white data-[active]:shadow-none',
	),
} as const;

export const MANTINE_MOVEMENT_TABS_CSS_VARIABLES = {
	...MANTINE_TABS_CSS_VARIABLES,
	'--tabs-text-color': LUMUS_RUNTIME_COLORS.light.surface,
} as CSSProperties;

export const getMantineTabsStyles = (_isDarkMode: boolean) => {
	return {
		list: {
			gap: 6,
			padding: 5,
			border: 'none',
			borderRadius: 18,
			backgroundColor: 'transparent',
		},
		tab: {
			position: 'relative',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			minHeight: 46,
			paddingInline: 16,
			border: 'none',
			borderRadius: 13,
			fontSize: 14,
			fontFamily: LUMUS_FONT_STACKS.sans,
			fontWeight: 600,
			letterSpacing: '0.01em',
			lineHeight: 1.2,
			transition:
				'background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease, color 150ms ease',
		},
		tabSection: {
			position: 'absolute',
			insetInlineStart: 16,
			display: 'inline-flex',
			color: 'inherit',
			pointerEvents: 'none',
		},
		tabLabel: {
			display: 'block',
			width: '100%',
			textAlign: 'center',
			color: 'inherit',
			fontFamily: LUMUS_FONT_STACKS.sans,
		},
	} as const;
};

export const getMantineChartStrokeColor = (isDarkMode: boolean) =>
	isDarkMode
		? LUMUS_RUNTIME_COLORS.dark.elevatedSurface
		: LUMUS_RUNTIME_COLORS.light.surface;

export const getMantineTagsInputStyles = (isDarkMode: boolean) => {
	const colors = isDarkMode ? LUMUS_RUNTIME_COLORS.dark : LUMUS_RUNTIME_COLORS.light;

	return {
		root: { width: '100%' },
		input: {
			display: 'flex',
			alignItems: 'center',
			minHeight: 48,
			borderRadius: 16,
			backgroundColor: 'transparent',
			color: colors.text,
			paddingInlineStart: 12,
			paddingBlock: 4,
			transition: 'border-color 150ms ease, box-shadow 150ms ease',
		},
		inputField: {
			minHeight: 36,
			color: colors.text,
			fontFamily: LUMUS_FONT_STACKS.sans,
			fontSize: 14,
			lineHeight: '20px',
			'--input-placeholder-color': colors.categoryPlaceholder,
		},
		pillsList: { width: '100%', alignItems: 'center', gap: 6, padding: 0 },
		pill: {
			display: 'inline-flex',
			alignItems: 'center',
			justifyContent: 'center',
			borderRadius: 999,
			backgroundColor: colors.accent,
			color: colors.onAccent,
			fontSize: 12,
			fontWeight: 700,
			textAlign: 'center',
		},
		dropdown: {
			borderRadius: 16,
			borderColor: LUMUS_RUNTIME_COLORS.light.accent,
			backgroundColor: LUMUS_RUNTIME_COLORS.light.accent,
			boxShadow: '0 12px 30px rgba(2,6,23,0.22)',
			padding: 6,
			overflow: 'hidden',
		},
		option: {
			display: 'flex',
			alignItems: 'center',
			backgroundColor: LUMUS_RUNTIME_COLORS.light.accent,
			color: LUMUS_RUNTIME_COLORS.light.surface,
			borderRadius: 10,
			fontFamily: LUMUS_FONT_STACKS.sans,
			fontSize: 14,
			minHeight: 42,
			padding: '10px 12px',
			transition: 'background-color 150ms ease, color 150ms ease',
		},
	} as const;
};

export const MANTINE_SELECTED_PILL_STYLE = {
	alignItems: 'center',
	justifyContent: 'center',
	backgroundColor: LUMUS_RUNTIME_COLORS.light.accent,
	color: LUMUS_RUNTIME_COLORS.light.surface,
	fontWeight: 700,
	textAlign: 'center',
} as const;

export const MANTINE_SELECTED_PILL_SLOT_STYLES = {
	label: { color: LUMUS_RUNTIME_COLORS.light.surface, flex: 1, textAlign: 'center' },
	remove: { color: LUMUS_RUNTIME_COLORS.light.surface },
} as const;

export const MANTINE_TAGS_INPUT_CLEAR_BUTTON_STYLE = {
	color: LUMUS_RUNTIME_COLORS.light.surface,
	background: 'transparent',
	pointerEvents: 'all',
} as const;

export const getMantineNumberInputClassNames = (
	containerClassName: string,
	inputTextClassName: string,
) => ({
	root: 'm-0 w-full',
	input: cn(containerClassName, inputTextClassName, 'pl-4 pr-11 text-base'),
	controls: 'my-1 mr-2 w-7 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800',
	control:
		'border-0 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200',
});
