import React from 'react';
import { useWindowDimensions } from 'react-native';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Insets = {
	top: number;
};

type UseScreenStylesProps = {
	isDarkMode: boolean;
	windowHeight: number;
	insets: Insets;
};

export function useScreenStyles() {

	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { height: windowHeight } = useWindowDimensions();

	const headingText = isDarkMode ? 'text-slate-100' : 'text-slate-900';

	const surfaceBackground = isDarkMode ? '#020617' : '#FFFFFF';
	const cardBackground = isDarkMode ? 'bg-slate-950' : 'bg-white';
	const bodyText = isDarkMode ? 'text-slate-300' : 'text-slate-700';
	const helperText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
	const inputField = isDarkMode
		? 'text-slate-100 placeholder:text-slate-500'
		: 'text-slate-900 placeholder:text-slate-500';

	const focusFieldClassName =
		'data-[focus=true]:border-[#FFE000] dark:data-[focus=true]:border-yellow-300';

	const fieldContainerClassName = `h-10 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const fieldContainerClassNameNotSpace = `rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const fieldContainerCardClassName = `rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const textareaContainerClassName = `h-24 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const sectionCardClassName = isDarkMode
		? 'rounded-3xl border border-slate-800 bg-slate-950'
		: 'rounded-3xl border border-slate-200 bg-white';
	const compactCardClassName = isDarkMode
		? ''
		: '';
	const tintedCardClassName = isDarkMode
		? 'rounded-2xl border border-slate-800 bg-slate-900/80'
		: 'rounded-2xl border border-slate-200 bg-slate-50';
	const notTintedCardClassName = isDarkMode
		? 'rounded-2xl border border-slate-800'
		: 'rounded-2xl border border-slate-200';
	const subtleCardClassName = isDarkMode
		? ''
		: '';
	const modalContentClassName = isDarkMode
		? 'rounded-[28px] border border-slate-800 bg-slate-950'
		: 'rounded-[28px] border border-slate-200 bg-white';
	const drawerContentClassName = isDarkMode
		? 'rounded-l-[28px] border-l border-slate-800 bg-slate-950'
		: 'rounded-l-[28px] border-l border-slate-200 bg-white';
	const drawerHeaderCardClassName = isDarkMode
		? 'rounded-2xl border border-slate-800 bg-slate-900/60'
		: 'rounded-2xl border border-slate-200 bg-slate-50';
	const topSummaryCardClassName = isDarkMode
		? 'rounded-[28px] border border-slate-800 bg-slate-950'
		: 'rounded-[28px] border border-slate-200 bg-white';

	const submitButtonClassName = isDarkMode
		? 'bg-yellow-400 text-white hover:bg-yellow-300 rounded-2xl border border-transparent'
		: 'bg-yellow-400 text-white hover:bg-yellow-500 rounded-2xl border border-transparent';

	const submitButtonCancelClassName = isDarkMode
		? 'bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-2xl border border-slate-700'
		: 'bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-2xl border border-slate-300';
		
	const accordionSectionButtonClassName = `${submitButtonClassName} w-full justify-center`;


	const submitButtonTextClassName = isDarkMode ? 'text-slate-900' : 'text-white';

	const heroHeight = Math.max(windowHeight * 0.28, 250) + insets.top;

	const infoCardStyle = React.useMemo(
		() => ({
			borderRadius: 20,
			borderWidth: 1,
			borderColor: isDarkMode
				? 'rgba(148, 163, 184, 0.14)'
				: 'rgba(226, 232, 240, 1)',
			backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.78)' : '#FFFFFF',
		}),
		[isDarkMode],
	);

	const labelText = isDarkMode ? 'text-slate-300' : 'text-slate-700';

	const switchRadioClassName = 'items-center gap-3';

	const switchRadioIndicatorClassName = isDarkMode
		? 'data-[checked=true]:border-yellow-300 data-[checked=true]:bg-yellow-300/20'
		: 'data-[checked=true]:border-yellow-400 data-[checked=true]:bg-yellow-100';

	const switchRadioIconClassName = isDarkMode
		? 'fill-yellow-300 text-yellow-300'
		: 'fill-yellow-500 text-yellow-500';

	const switchRadioLabelClassName = isDarkMode
		? ''
		: '';

	const addTagButtonClassName = isDarkMode
		? 'h-10 w-10 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950'
		: 'h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white';

	// Classes compartilhadas das tabelas seguem o padrão documentado em [[Configurações]] e [[Hooks Customizados]].
	const tableBaseClassName = 'w-full';
	const tableHeaderRowClassName = 'border-b border-slate-200 bg-transparent dark:border-slate-800';
	const tableRowClassName = 'border-b border-slate-200 bg-transparent dark:border-slate-800';
	const tableHeadTextClassName = 'px-5 py-3 text-sm font-semibold';
	const tableActionsHeaderTextClassName = 'text-center text-sm font-semibold';
	const tableContentCellClassName = 'min-w-0 px-4 py-3';
	const tableCaptionClassName = `${helperText} px-4 py-3 text-xs bg-transparent`;
	const tableActionsHeaderClassName = 'flex-none items-center justify-center px-2 py-3';
	const tableActionsCellClassName = 'flex-none items-center justify-center px-2 py-3';
	const tableSingleActionColumnClassName = 'w-[76px]';
	const tableDoubleActionColumnClassName = 'w-[112px]';
	const tableUsersMinWidthClassName = 'w-full';
	const tableBanksMinWidthClassName = 'w-full';
	const tableTagsMinWidthClassName = 'w-full';
	const tableRelatedUsersMinWidthClassName = 'w-full';
	const tableIconButtonClassName = 'h-10 w-10 rounded-2xl bg-transparent px-0 data-[hover=true]:bg-transparent data-[active=true]:bg-transparent';
	const tablePrimaryIconClassName = isDarkMode ? 'text-yellow-300' : 'text-yellow-500';
	const tablePaginationContainerClassName = isDarkMode
		? 'border-t border-slate-800 px-4 py-4'
		: 'border-t border-slate-200 px-4 py-4';
	const tablePaginationListClassName = 'flex-wrap items-center justify-center gap-2';
	const tablePaginationButtonClassName = isDarkMode
		? 'min-w-[32px] rounded-2xl border border-slate-800 bg-slate-950 px-0'
		: 'min-w-[32px] rounded-2xl border border-slate-200 bg-white px-0';
	const tablePaginationActiveButtonClassName = `${submitButtonClassName} min-w-[32px] px-0`;
	const tablePaginationInfoTextClassName = `${helperText} text-center text-xs mt-4`;

	const checkboxClassName = 'items-center gap-3';

	const checkboxIndicatorClassName = isDarkMode
		? 'rounded-md border-slate-500'
		: 'rounded-md border-slate-300';

	const checkboxIndicatorCheckedClassName = isDarkMode
		? 'data-[checked=true]:border-yellow-300 data-[checked=true]:bg-yellow-300'
		: 'data-[checked=true]:border-yellow-400 data-[checked=true]:bg-yellow-400';

	const checkboxIndicatorCheckedStyle = React.useMemo(
		() => ({
			borderColor: isDarkMode ? '#FDE047' : '#FACC15',
			backgroundColor: isDarkMode ? '#FDE047' : '#FACC15',
		}),
		[isDarkMode],
	);

	const checkboxIconClassName = 'text-slate-950';

	const checkboxLabelClassName = isDarkMode
		? 'text-slate-300'
		: 'text-slate-700';

	const checkboxLabelCheckedClassName = isDarkMode
		? 'text-slate-100'
		: 'text-slate-900';
	const skeletonBaseColor = isDarkMode ? 'rgba(30, 41, 59, 0.96)' : '#E2E8F0';
	const skeletonHighlightColor = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.55)';
	const skeletonMutedBaseColor = isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#F1F5F9';
	const skeletonMutedHighlightColor = isDarkMode ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.7)';

	const switchTrack = isDarkMode
		? 'bg-slate-700 data-[checked=true]:bg-yellow-300/20'
		: 'bg-slate-300 data-[checked=true]:bg-yellow-400/20';
	const switchTrackColor = React.useMemo(
		() => ({ false: '#CBD5E1', true: '#FACC15' }),
		[],
	);
	const switchThumbColor = '#FFFFFF';
	const switchIosBackgroundColor = '#CBD5E1';

	return {
		isDarkMode,
		headingText,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		focusFieldClassName,
		fieldContainerClassName,
		fieldContainerClassNameNotSpace,
		fieldContainerCardClassName,
		textareaContainerClassName,
		sectionCardClassName,
		compactCardClassName,
		tintedCardClassName,
		notTintedCardClassName,
		subtleCardClassName,
		modalContentClassName,
		drawerContentClassName,
		drawerHeaderCardClassName,
		topSummaryCardClassName,
		submitButtonClassName,
		accordionSectionButtonClassName,
		submitButtonCancelClassName,
		submitButtonTextClassName,
		heroHeight,
		infoCardStyle,
		insets,
		labelText,
		switchRadioClassName,
		switchRadioIndicatorClassName,
		switchRadioIconClassName,
		switchRadioLabelClassName,
		addTagButtonClassName,
		tableBaseClassName,
		tableHeaderRowClassName,
		tableRowClassName,
		tableHeadTextClassName,
		tableActionsHeaderTextClassName,
		tableContentCellClassName,
		tableCaptionClassName,
		tableActionsHeaderClassName,
		tableActionsCellClassName,
		tableSingleActionColumnClassName,
		tableDoubleActionColumnClassName,
		tableUsersMinWidthClassName,
		tableBanksMinWidthClassName,
		tableTagsMinWidthClassName,
		tableRelatedUsersMinWidthClassName,
		tableIconButtonClassName,
		tablePrimaryIconClassName,
		tablePaginationContainerClassName,
		tablePaginationListClassName,
		tablePaginationButtonClassName,
		tablePaginationActiveButtonClassName,
		tablePaginationInfoTextClassName,
		checkboxClassName,
		checkboxIndicatorClassName,
		checkboxIndicatorCheckedClassName,
		checkboxIndicatorCheckedStyle,
		checkboxIconClassName,
		checkboxLabelClassName,
		checkboxLabelCheckedClassName,
		skeletonBaseColor,
		skeletonHighlightColor,
		skeletonMutedBaseColor,
		skeletonMutedHighlightColor,
		switchTrack,
		switchTrackColor,
		switchThumbColor,
		switchIosBackgroundColor,
	};
}
