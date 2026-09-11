import React from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/contexts/ThemeContext';
import {
	LUMUS_CLASS_NAMES,
	LUMUS_LAYOUT_TOKENS,
	LUMUS_RUNTIME_COLORS,
} from '@/design-system/tokens';
import {
	WEB_EXPENSE_CLASS_NAMES,
	WEB_SELECT_CLASS_NAMES,
	WEB_TIME_PICKER_CLASS_NAMES,
} from '@/design-system/web-forms';
import {
	WEB_DASHBOARD_CLASS_NAMES,
	WEB_DASHBOARD_DOM_STYLES,
} from '@/design-system/web-dashboard';

export {
	WEB_DASHBOARD_CLASS_NAMES,
	WEB_DASHBOARD_DOM_STYLES,
	WEB_EXPENSE_CLASS_NAMES,
};

/**
 * Compatibility facade for existing screens.
 *
 * Visual decisions live in `design-system/` and Tailwind. This hook only reads
 * runtime layout/theme information and resolves values for APIs that cannot
 * consume NativeWind classes. New code should import class contracts directly.
 */
export function useScreenStyles() {
	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { height: windowHeight } = useWindowDimensions();
	const runtimeColors = isDarkMode ? LUMUS_RUNTIME_COLORS.dark : LUMUS_RUNTIME_COLORS.light;

	const heroHeight =
		Math.max(
			windowHeight * LUMUS_LAYOUT_TOKENS.heroViewportRatio,
			LUMUS_LAYOUT_TOKENS.heroMinimumHeight,
		) + insets.top;

	const infoCardStyle = React.useMemo(
		() => ({
			borderRadius: 20,
			borderWidth: 1,
			borderColor: runtimeColors.infoBorder,
			backgroundColor: runtimeColors.infoSurface,
		}),
		[runtimeColors.infoBorder, runtimeColors.infoSurface],
	);

	const checkboxIndicatorCheckedStyle = React.useMemo(
		() => ({
			borderColor: runtimeColors.accent,
			backgroundColor: runtimeColors.accent,
		}),
		[runtimeColors.accent],
	);

	const webDashboardPalette = React.useMemo(
		() => ({
			canvas: runtimeColors.canvas,
			surface: runtimeColors.surface,
			surfaceMuted: runtimeColors.surfaceMuted,
			border: runtimeColors.border,
			primaryText: runtimeColors.text,
			secondaryText: runtimeColors.textMuted,
			accent: runtimeColors.accentStrong,
		}),
		[runtimeColors],
	);

	const fieldContainerClassName = `${LUMUS_CLASS_NAMES.controlCompact} ${LUMUS_CLASS_NAMES.focusRing} px-3 py-2 web:h-control web:bg-transparent`;
	const submitButtonClassName = LUMUS_CLASS_NAMES.primaryButton;
	const helperText = LUMUS_CLASS_NAMES.helper;

	return {
		isDarkMode,
		headingText: LUMUS_CLASS_NAMES.heading,
		surfaceBackground: runtimeColors.canvas,
		cardBackground: 'bg-white dark:bg-slate-950',
		bodyText: LUMUS_CLASS_NAMES.body,
		helperText,
		inputField: LUMUS_CLASS_NAMES.inputText,
		focusFieldClassName: LUMUS_CLASS_NAMES.focusRing,
		fieldBankContainerClassName: `${LUMUS_CLASS_NAMES.control} ${LUMUS_CLASS_NAMES.focusRing}`,
		fieldContainerClassName,
		fieldContainerClassNameNotSpace: `${LUMUS_CLASS_NAMES.control} ${LUMUS_CLASS_NAMES.focusRing}`,
		fieldContainerCardClassName: `${LUMUS_CLASS_NAMES.control} ${LUMUS_CLASS_NAMES.focusRing} py-2`,
		textareaContainerClassName: `${LUMUS_CLASS_NAMES.textarea} ${LUMUS_CLASS_NAMES.focusRing}`,
		sectionCardClassName: LUMUS_CLASS_NAMES.card,
		dividerClassName: LUMUS_CLASS_NAMES.divider,
		warningCardClassName: 'rounded-control bg-warning-50 dark:bg-warning-950',
		warningTextClassName: 'text-warning-800 dark:text-warning-200',
		assistantAvailableTextClassName: LUMUS_CLASS_NAMES.successText,
		assistantUnavailableTextClassName: 'text-warning-700 dark:text-warning-300',
		compactCardClassName: '',
		tintedCardClassName: LUMUS_CLASS_NAMES.cardTinted,
		notTintedCardClassName: LUMUS_CLASS_NAMES.cardBordered,
		subtleCardClassName: '',
		modalContentClassName: LUMUS_CLASS_NAMES.modal,
		drawerContentClassName: LUMUS_CLASS_NAMES.drawer,
		drawerHeaderCardClassName:
			'rounded-control border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60',
		topSummaryCardClassName: LUMUS_CLASS_NAMES.modal,
		submitButtonClassName,
		accordionSectionButtonClassName: `${submitButtonClassName} w-full justify-center`,
		submitButtonCancelClassName: LUMUS_CLASS_NAMES.secondaryButton,
		submitButtonTextClassName: LUMUS_CLASS_NAMES.primaryButtonText,
		heroHeight,
		infoCardStyle,
		insets,
		labelText: LUMUS_CLASS_NAMES.label,
		switchRadioClassName: 'items-center gap-3',
		switchRadioIndicatorClassName:
			'data-[checked=true]:border-lumus-accent data-[checked=true]:bg-lumus-accent/20',
		switchRadioIconClassName:
			'fill-lumus-accent-pressed text-lumus-accent-pressed dark:fill-lumus-accent dark:text-lumus-accent',
		switchRadioLabelClassName: '',
		addTagButtonClassName: `${LUMUS_CLASS_NAMES.iconButton} ${LUMUS_CLASS_NAMES.surface}`,
		tableBaseClassName: 'w-full',
		tableHeaderRowClassName: `border-b bg-transparent ${LUMUS_CLASS_NAMES.divider}`,
		tableRowClassName: `border-b bg-transparent ${LUMUS_CLASS_NAMES.divider}`,
		tableHeadTextClassName: 'px-5 py-3 text-sm font-semibold',
		tableActionsHeaderTextClassName: 'text-center text-sm font-semibold',
		tableContentCellClassName: 'min-w-0 px-4 py-3',
		tableCaptionClassName: `${helperText} bg-transparent px-4 py-3 text-xs`,
		tableActionsHeaderClassName: 'flex-none items-center justify-center px-2 py-3',
		tableActionsCellClassName: 'flex-none items-center justify-center px-2 py-3',
		tableSingleActionColumnClassName: 'w-[76px]',
		tableDoubleActionColumnClassName: 'w-[112px]',
		tableTripleActionColumnClassName: 'w-[160px]',
		tableUsersMinWidthClassName: 'w-full',
		tableBanksMinWidthClassName: 'w-full',
		tableTagsMinWidthClassName: 'w-full',
		tableRelatedUsersMinWidthClassName: 'w-full',
		tableIconButtonClassName:
			'h-10 w-10 rounded-control bg-transparent px-0 data-[active=true]:bg-transparent data-[hover=true]:bg-transparent focus-visible:ring-2 focus-visible:ring-lumus-focus',
		tablePrimaryIconClassName: 'text-yellow-600 dark:text-yellow-300',
		tablePaginationContainerClassName: `border-t px-4 py-4 ${LUMUS_CLASS_NAMES.divider}`,
		tablePaginationListClassName: 'flex-wrap items-center justify-center gap-2',
		tablePaginationButtonClassName: `${LUMUS_CLASS_NAMES.surface} min-w-8 rounded-control px-0`,
		tablePaginationActiveButtonClassName: `${submitButtonClassName} min-w-8 px-0`,
		tablePaginationInfoTextClassName: `${helperText} mt-4 text-center text-xs`,
		checkboxClassName: 'items-center gap-3',
		checkboxIndicatorClassName: 'rounded-md border-slate-300 dark:border-slate-500',
		checkboxIndicatorCheckedClassName:
			'data-[checked=true]:border-lumus-accent data-[checked=true]:bg-lumus-accent',
		checkboxIndicatorCheckedStyle,
		checkboxIconClassName: 'text-lumus-on-accent',
		checkboxLabelClassName: LUMUS_CLASS_NAMES.label,
		checkboxLabelCheckedClassName: LUMUS_CLASS_NAMES.heading,
		skeletonBaseColor: runtimeColors.skeleton,
		skeletonHighlightColor: runtimeColors.skeletonHighlight,
		skeletonMutedBaseColor: runtimeColors.skeletonMuted,
		skeletonMutedHighlightColor: runtimeColors.skeletonMutedHighlight,
		switchTrack: 'bg-slate-300 data-[checked=true]:bg-lumus-accent/20 dark:bg-slate-700',
		switchTrackColor: {
			false: LUMUS_RUNTIME_COLORS.light.controlTrack,
			true: LUMUS_RUNTIME_COLORS.light.accent,
		},
		switchThumbColor: LUMUS_RUNTIME_COLORS.light.surface,
		switchActiveThumbColor: LUMUS_RUNTIME_COLORS.light.accentStrong,
		switchIosBackgroundColor: LUMUS_RUNTIME_COLORS.light.controlTrack,
		webDashboardPalette,
		webDashboardClassNames: WEB_DASHBOARD_CLASS_NAMES,
		webExpenseClassNames: WEB_EXPENSE_CLASS_NAMES,
		webSelectClassNames: WEB_SELECT_CLASS_NAMES,
		webTimePickerClassNames: WEB_TIME_PICKER_CLASS_NAMES,
	};
}
