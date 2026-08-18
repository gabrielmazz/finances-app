import React from 'react';
import { useWindowDimensions, type ViewStyle } from 'react-native';
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

// Classes estruturais compartilhadas pela composição Web do Dashboard.
// Mantidas aqui para que a Home Web não crie um StyleSheet paralelo à
// composição mobile, conforme [[Dashboard Home]] e [[Sistema de Temas]].
export const WEB_DASHBOARD_CLASS_NAMES = {
	screen: 'flex-1 w-screen',
	fill: 'flex-1 w-screen',
	hero: 'absolute inset-x-0 top-0 w-screen overflow-hidden',
	heroImage: 'absolute inset-0 h-full w-full',
	heroContent: 'flex-1 items-center justify-start gap-[14px] px-6',
	heroIllustrationAnimation:
		'mx-auto mt-[14px] flex h-[40%] w-full shrink-0 flex-col items-center justify-center',
	heroTitle: 'block w-full max-w-[620px] text-center text-[25px] font-extrabold text-white',
	sheet: 'flex-1 w-full rounded-tl-[28px] rounded-tr-[28px] px-8 pb-0.5',
	sheetCompact: 'px-[18px]',
	sheetInner: 'flex-1',
	scrollContent: 'gap-7 pb-[18px] pt-[18px]',
	topColumns: 'gap-[26px]',
	topColumnsDesktop: 'flex-row',
	topColumnsDesktopCentered: 'justify-center',
	monthlySummaryCards: 'flex-row gap-3',
	monthlySummaryCardsCompact: 'flex-col',
	mandatorySection: 'w-full rounded-[20px] border px-4 pb-4 pt-4',
	mandatorySectionHelper: 'mb-[14px] mt-[-6px] text-xs',
	mandatoryColumns: 'flex-row gap-3',
	mandatoryColumnsCompact: 'flex-col',
	mandatoryColumn: 'min-w-0 flex-1 rounded-2xl border p-3',
	mandatoryColumnHeader: 'flex-row items-center gap-2.5',
	mandatoryColumnIcon: 'h-[34px] w-[34px] items-center justify-center rounded-xl',
	mandatoryColumnCopy: 'min-w-0 flex-1',
	mandatoryColumnTitle: 'text-[13px] font-extrabold',
	mandatoryColumnHelper: 'mt-0.5 text-[11px]',
	mandatoryItems: 'mt-3.5 gap-2.5',
	mandatoryItem: 'min-w-0 flex-row items-center gap-2.5',
	mandatoryDateChip: 'min-w-[58px] items-center justify-center rounded-[9px] border px-[7px] py-1.5',
	mandatoryDateText: 'text-center text-[10px] font-extrabold',
	mandatoryItemCopy: 'min-w-0 flex-1',
	mandatoryItemName: 'text-[13px] font-bold',
	mandatoryItemMeta: 'mt-0.5 flex-row items-center justify-between gap-2',
	mandatoryItemInstallment: 'min-w-0 flex-1 text-[10px]',
	mandatoryItemAmount: 'text-[12px] font-extrabold tabular-nums',
	mandatoryEmptyText: 'mt-3.5 text-xs',
	mandatorySkeleton: 'h-[126px] flex-1 rounded-2xl',
	monthlySummaryCard: 'min-h-[126px] flex-1 rounded-[18px] border px-[18px] py-4',
	monthlySummaryCardContent: 'flex-1 flex-row items-center gap-3',
	monthlySummaryCopy: 'min-w-0 flex-1',
	monthlySummaryPeriod: 'text-[10px] font-extrabold uppercase tracking-[0.7px]',
	monthlySummaryLabel: 'mt-2.5 text-[13px] font-bold',
	monthlySummaryValue: 'mt-1 text-[21px] font-extrabold',
	monthlySummaryHelper: 'mt-1.5 text-xs',
	expenseChartSection: 'w-full rounded-[20px] border px-3 pb-1.5 pt-4',
	expenseChartHelper: 'mb-0.5 mt-[-5px] text-xs',
	expenseChartSkeleton: 'mt-3 h-[290px] w-full rounded-[14px]',
	activityHeatmapSection: 'w-full rounded-[20px] border px-3 pb-3 pt-4',
	activityHeatmapHelper: 'mb-2.5 mt-[-5px] text-xs',
	activityHeatmapSkeleton: 'h-[178px] w-full rounded-[14px]',
	section: 'mb-1',
	columnSection: 'min-w-0 flex-1',
	bankSection: 'flex-col',
	bankSectionCentered: 'w-full max-w-[610px] flex-none self-center',
	sectionHeading: 'mb-3 min-h-[34px] flex-row items-center gap-[5px]',
	headingWithTip: 'flex-1 flex-row items-center gap-[5px]',
	sectionHeadingText: 'text-[17px] font-extrabold uppercase tracking-[1.1px]',
	infoButton: 'h-6 w-6 items-center justify-center',
	popoverBackdrop: 'bg-transparent',
	tooltip: 'max-w-[300px] rounded-xl',
	tooltipText: 'text-xs leading-[19px] text-slate-200',
	bankCardPressable: 'min-h-[200px] w-full flex-1',
	bankCard: 'min-h-[200px] flex-1',
	bankCardContent: 'flex-1 justify-between p-[18px]',
	cardKicker: 'text-[10px] font-bold uppercase tracking-[0.6px]',
	bankName: 'mt-1 text-xl font-extrabold',
	bankBalance: 'mt-1 text-[22px] font-extrabold',
	bankCardFooter: 'flex-row justify-between gap-[18px]',
	bankFooterRight: 'items-end',
	bankFooterValue: 'mt-0.5 text-[13px] font-bold',
	investmentVisual: 'items-center',
	chartCenter: 'items-center justify-center',
	chartLabel: 'text-[10px] font-bold tracking-[1px]',
	chartCount: 'mt-0.5 text-[30px] font-extrabold',
	chartCaption: 'mt-px text-[11px]',
	investmentTotals: 'mt-4 w-full flex-row justify-between',
	totalRight: 'items-end',
	totalLabel: 'text-[10px] font-bold uppercase tracking-[0.6px]',
	totalValue: 'mt-1 text-[17px] font-extrabold',
	timeline: 'mt-0.5',
	timelineRow: 'min-h-[80px] flex-row',
	timelineRail: 'w-7 items-center pb-0 pt-2',
	timelineDot: 'h-[13px] w-[13px] rounded-full border-2 border-white',
	timelineLine: 'my-0.5 w-[3px] flex-1 rounded-full',
	timelineBody: 'flex-1 pb-3.5',
	movementHeader: 'flex-row items-center justify-between gap-3',
	movementIdentity: 'min-w-0 flex-1 flex-row items-center gap-3',
	movementIcon: 'h-11 w-11 items-center justify-center rounded-[15px]',
	movementCopy: 'min-w-0 flex-1',
	movementName: 'text-[15px] font-bold',
	movementSubtitle: 'mt-0.5 text-xs opacity-[0.68]',
	movementAmount: 'items-end',
	amount: 'text-[15px] font-bold',
	movementDate: 'mt-1 flex-row items-center gap-1',
	dateText: 'text-[11px] text-slate-400',
	movementDetailAnimation: 'w-full self-stretch overflow-hidden rounded-[18px]',
	movementDetail: 'relative mt-2.5 w-full overflow-hidden rounded-[18px]',
	movementDetailGrainient: 'absolute inset-0 h-full w-full rounded-[18px] opacity-[0.96]',
	movementDetailContent: 'relative z-[1] px-4 py-3.5',
	detailGrid: 'mt-3.5 flex-row flex-wrap gap-3',
	detailItem: 'min-w-[130px] w-[45%]',
	detailLabel: 'text-[10px] font-bold uppercase tracking-[0.5px] text-white/70',
	detailText: 'mt-1 text-[13px] leading-[18px] text-white',
	emptyText: 'py-4 text-[13px] leading-5',
	emptyMovement: 'rounded-2xl border p-[18px]',
	inlineError: 'mt-2 text-[13px] leading-5',
	errorText: 'text-amber-500',
	gainValue: 'text-emerald-500',
	simulatedValue: 'text-emerald-400',
	expenseValue: 'text-red-500',
	skeletonShort: 'h-3 w-[110px]',
	skeletonLong: 'mt-3 h-7 w-[180px]',
	skeletonBalance: 'mt-10 h-[34px] w-[150px]',
	investmentSkeleton: 'items-center gap-[18px] py-5',
	skeletonDonut: 'h-[190px] w-[190px]',
	timelineSkeleton: 'gap-[18px]',
	skeletonRow: 'flex-row items-center gap-3.5',
	skeletonDot: 'h-[42px] w-[42px]',
	skeletonText: 'h-[30px] flex-1',
};

// Classes estruturais da composição Web de cadastro de despesas.
// Mantidas aqui para que a tela siga o mesmo contrato de estilos da Home Web.
export const WEB_EXPENSE_CLASS_NAMES = {
	formSurface: 'min-w-0 flex-1',
	formScroll: 'px-5 pb-8 pt-7 sm:px-8 lg:px-10',
	fieldGrid: 'gap-4 lg:flex-row lg:flex-wrap',
	fieldHalf: 'lg:w-[calc(50%-8px)]',
	fieldFull: 'w-full',
	fieldLabel: 'mb-2 ml-1 text-xs font-bold uppercase tracking-[0.7px]',
	fieldInput:
		'h-12 rounded-2xl border bg-transparent px-1 focus-visible:ring-2 focus-visible:ring-yellow-300 web:data-[focus=true]:ring-0',
	fieldTextarea: 'h-[112px] rounded-2xl border bg-transparent web:data-[focus=true]:ring-0',
	fieldCard: 'rounded-[22px] border px-4 py-4',
	sectionLabel: 'flex-row items-center gap-2',
	submit: 'mt-6 h-12 rounded-2xl focus-visible:ring-2 focus-visible:ring-yellow-300',
	modal: 'max-w-[380px]',
};

export const WEB_DASHBOARD_DOM_STYLES: Record<string, ViewStyle> = {
	sparkline: { width: 112, height: 52, backgroundColor: 'transparent' },
	expenseLineChart: { height: 326, width: '100%', backgroundColor: 'transparent' },
	activityHeatmap: { minHeight: 190, width: '100%', backgroundColor: 'transparent' },
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

	const fieldBankContainerClassName = `min-h-[48px] rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const fieldContainerClassName = `pt-2 pb-2 h-10 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName} web:h-12 web:rounded-2xl web:border web:bg-transparent web:px-1 web:focus-visible:ring-2 web:focus-visible:ring-yellow-300 web:data-[focus=true]:ring-0`;
	const fieldContainerClassNameNotSpace = `rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const fieldContainerCardClassName = `pt-2 pb-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const textareaContainerClassName = `h-24 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName} web:h-[112px] web:rounded-2xl web:border web:bg-transparent web:data-[focus=true]:ring-0`;
	const sectionCardClassName = isDarkMode
		? 'rounded-3xl border border-slate-800 bg-slate-950'
		: 'rounded-3xl border border-slate-200 bg-white';
	const dividerClassName = isDarkMode ? 'border-slate-800' : 'border-slate-200';
	const warningCardClassName = isDarkMode
		? 'rounded-2xl bg-warning-950'
		: 'rounded-2xl bg-warning-50';
	const warningTextClassName = isDarkMode ? 'text-warning-200' : 'text-warning-800';
	const assistantAvailableTextClassName = isDarkMode ? 'text-success-400' : 'text-success-600';
	const assistantUnavailableTextClassName = isDarkMode ? 'text-warning-300' : 'text-warning-700';
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
	const tableTripleActionColumnClassName = 'w-[160px]';
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
	// Tokens da composição Web do Dashboard. Mantidos aqui para que telas não
	// decidam a paleta claro/escuro localmente, conforme [[Sistema de Temas]].
	const webDashboardPalette = isDarkMode
		? {
			canvas: surfaceBackground,
			surface: '#0B1225',
			surfaceMuted: '#111B31',
			border: '#1E293B',
			primaryText: '#F8FAFC',
			secondaryText: '#94A3B8',
			accent: '#FACC15',
		}
		: {
			canvas: surfaceBackground,
			surface: '#FFFFFF',
			surfaceMuted: '#F8FAFC',
			border: '#E2E8F0',
			primaryText: '#0F172A',
			secondaryText: '#64748B',
			accent: '#CA8A04',
		};

	return {
		isDarkMode,
		headingText,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		focusFieldClassName,
		fieldBankContainerClassName,
		fieldContainerClassName,
		fieldContainerClassNameNotSpace,
		fieldContainerCardClassName,
		textareaContainerClassName,
		sectionCardClassName,
		dividerClassName,
		warningCardClassName,
		warningTextClassName,
		assistantAvailableTextClassName,
		assistantUnavailableTextClassName,
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
		tableTripleActionColumnClassName,
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
		webDashboardPalette,
		webDashboardClassNames: WEB_DASHBOARD_CLASS_NAMES,
		webExpenseClassNames: WEB_EXPENSE_CLASS_NAMES,
	};
}
