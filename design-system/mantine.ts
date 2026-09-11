import type { CSSProperties } from 'react';

import { cn } from '@/lib/utils';
import {
	LUMUS_FONT_STACKS,
	LUMUS_RUNTIME_COLORS,
} from '@/design-system/tokens';

export const MANTINE_TABS_CLASS_NAMES = {
	root: 'w-full',
	list: 'w-full',
	tab: 'flex-1 justify-center',
} as const;

export const MANTINE_TABS_CSS_VARIABLES = {
	'--tabs-color': LUMUS_RUNTIME_COLORS.light.accent,
	'--tabs-text-color': LUMUS_RUNTIME_COLORS.light.onAccent,
} as CSSProperties;

export const getMantineTabsStyles = (isDarkMode: boolean) => {
	const colors = isDarkMode ? LUMUS_RUNTIME_COLORS.dark : LUMUS_RUNTIME_COLORS.light;

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
			color: colors.onAccent,
			fontSize: 14,
			fontFamily: LUMUS_FONT_STACKS.sans,
			fontWeight: 600,
			letterSpacing: '0.01em',
			lineHeight: 1.2,
			transition:
				'background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease, color 150ms ease',
			'&[data-active]': {
				backgroundColor: colors.accent,
				border: 'none',
				boxShadow: '0 6px 18px rgba(250,204,21,0.22)',
				color: colors.onAccent,
			},
			'&:hover:not([data-disabled]):not([data-active])': {
				backgroundColor: isDarkMode ? 'rgba(148,163,184,0.12)' : colors.surface,
				color: colors.text,
			},
			'&:focus-visible': {
				outline: `2px solid ${colors.focus}`,
				outlineOffset: 2,
			},
			'&[data-disabled]': {
				cursor: 'not-allowed',
				opacity: 0.4,
			},
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

export const getMantineTagsInputStyles = (isDarkMode: boolean) => {
	const colors = isDarkMode ? LUMUS_RUNTIME_COLORS.dark : LUMUS_RUNTIME_COLORS.light;

	return {
		root: { width: '100%' },
		input: {
			minHeight: 48,
			borderRadius: 16,
			borderColor: colors.border,
			backgroundColor: 'transparent',
			color: colors.text,
			padding: 3,
			transition: 'border-color 150ms ease, box-shadow 150ms ease',
			'&:focus-within': {
				borderColor: colors.focus,
				boxShadow: `0 0 0 2px ${isDarkMode ? 'rgba(253,224,71,0.22)' : 'rgba(202,138,4,0.20)'}`,
			},
		},
		inputField: {
			minHeight: 36,
			color: colors.text,
			fontFamily: LUMUS_FONT_STACKS.sans,
			fontSize: 14,
			lineHeight: '20px',
			'&::placeholder': {
				color: colors.textMuted,
				opacity: 1,
			},
		},
		pillsList: { gap: 6, padding: 0 },
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
			borderColor: colors.border,
			backgroundColor: colors.elevatedSurface,
			boxShadow: '0 12px 30px rgba(2,6,23,0.22)',
			padding: 6,
			overflow: 'hidden',
		},
		option: {
			display: 'flex',
			alignItems: 'center',
			borderRadius: 10,
			color: colors.text,
			fontFamily: LUMUS_FONT_STACKS.sans,
			fontSize: 14,
			minHeight: 42,
			padding: '10px 12px',
			transition: 'background-color 150ms ease, color 150ms ease',
			'&[data-combobox-selected]': {
				backgroundColor: isDarkMode ? 'rgba(250,204,21,0.16)' : '#FEF9C3',
				color: colors.text,
			},
			'&:hover': {
				backgroundColor: isDarkMode ? 'rgba(148,163,184,0.12)' : colors.surfaceMuted,
			},
			'&:focus-visible': {
				outline: `2px solid ${colors.focus}`,
				outlineOffset: -2,
			},
		},
	} as const;
};

export const MANTINE_SELECTED_PILL_STYLE = {
	alignItems: 'center',
	justifyContent: 'center',
	backgroundColor: LUMUS_RUNTIME_COLORS.light.accent,
	color: LUMUS_RUNTIME_COLORS.light.onAccent,
	fontWeight: 700,
	textAlign: 'center',
} as const;

export const MANTINE_SELECTED_PILL_SLOT_STYLES = {
	label: { color: LUMUS_RUNTIME_COLORS.light.onAccent, flex: 1, textAlign: 'center' },
	remove: { color: LUMUS_RUNTIME_COLORS.light.onAccent },
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
