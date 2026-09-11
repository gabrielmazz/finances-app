import React from 'react';
import { Pressable, Text as NativeText, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, Polygon, Rect } from 'react-native-svg';

import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Modal, ModalBackdrop, ModalBody, ModalCloseButton, ModalContent, ModalHeader } from '@/components/ui/modal';
import {
	AddIcon,
	CalendarDaysIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	CheckCircleIcon,
	EditIcon,
	Icon,
	RepeatIcon,
	TrashIcon,
} from '@/components/ui/icon';
import { TagIcon } from '@/hooks/useTagIcons';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import {
	formatConfiguredMonthlyDueLabel,
	formatResolvedMonthDateLabel,
	formatResolvedMonthDayLabel,
	getBrazilNationalHolidaysForMonth,
} from '@/utils/businessCalendar';
import { Heading } from '@/components/ui/heading';
import AnimatedContent from '@/components/web/motion/AnimatedContent';
import Grainient from '@/components/web/visuals/Grainient';
import { NATIVE_LIBRARY_STYLES } from '@/design-system/native-styles';

export type DateCalendarItem = {
	id: string;
	name: string;
	valueInCents: number;
	displayValueInCents?: number | null;
	dueDay: number;
	tagId: string;
	description?: string | null;
	reminderEnabled?: boolean;
	reminderSummary?: string;
	usesBusinessDays?: boolean;
	resolvedDueDate?: Date | null;
	holidayName?: string | null;
	isCompletedForCurrentCycle?: boolean;
	isInstallmentComplete?: boolean;
	installmentTotal?: number | null;
	installmentLabel?: string | null;
	canReclaimCurrentCycle?: boolean;
	lastStatusDate?: Date | null;
};

export type DateCalendarTagMetadata = {
	name: string;
	iconFamily?: TagIconFamily | null;
	iconName?: string | null;
	iconStyle?: TagIconStyle | null;
};

type DateCalendarProps = {
	items: DateCalendarItem[];
	tagsMap: Record<string, string>;
	tagMetadataMap?: Record<string, DateCalendarTagMetadata>;
	formatCurrency: (valueInCents: number) => string;
	getStatusText: (item: DateCalendarItem) => string;
	getStatusClassName: (item: DateCalendarItem) => string;
	getDueDayColorClass: (dueDay: number, item?: DateCalendarItem) => string;
	onAction: (action: 'register' | 'settle' | 'edit' | 'delete' | 'reclaim', item: DateCalendarItem) => void;
	valueLabel?: string;
	dueLabel?: string;
	completedLabel?: string;
	pendingLabel?: string;
	valueTone?: 'expense' | 'gain';
	modalSize?: 'md' | 'lg';
};

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const CELL_PERCENT = '14.2857%';
const CELL_HEIGHT = 82;
const HOLIDAY_PURPLE_LIGHT = '#7C3AED';
const HOLIDAY_PURPLE_DARK = '#8B5CF6';
const DAY_CIRCLE_SIZE = 48;
const DAY_CIRCLE_RADIUS = DAY_CIRCLE_SIZE / 2;

const buildCalendarDays = (reference: Date) => {
	const firstDay = new Date(reference.getFullYear(), reference.getMonth(), 1);
	const totalDays = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
	const startOffset = firstDay.getDay();
	const prevMonthTotalDays = new Date(reference.getFullYear(), reference.getMonth(), 0).getDate();

	const days: Array<{ day: number; date: Date }> = [];
	for (let i = 0; i < totalDays; i += 1) {
		const dayNumber = i + 1;
		days.push({
			day: dayNumber,
			date: new Date(reference.getFullYear(), reference.getMonth(), dayNumber),
		});
	}

	const prevPlaceholders = Array.from({ length: startOffset }).map((_, index) => ({
		day: prevMonthTotalDays - startOffset + index + 1,
	}));

	const totalCells = startOffset + totalDays;
	const trailing = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
	const nextPlaceholders = Array.from({ length: trailing }).map((_, index) => ({
		day: index + 1,
	}));

	return { days, prevPlaceholders, nextPlaceholders, totalDays };
};

const formatLongDate = (value: Date) =>
	new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: 'long',
		year: 'numeric',
	}).format(value);

const compareDateCalendarItems = (left: DateCalendarItem, right: DateCalendarItem) => {
	const completionOrder = Number(Boolean(left.isCompletedForCurrentCycle)) - Number(Boolean(right.isCompletedForCurrentCycle));
	if (completionOrder !== 0) {
		return completionOrder;
	}

	return left.name.trim().localeCompare(right.name.trim(), 'pt-BR', { sensitivity: 'base' });
};

type DateCalendarTonePalette = {
	accentColor: string;
	amountColor: string;
	iconGradient: [string, string];
};

const DATE_CALENDAR_TONES: Record<
	NonNullable<DateCalendarProps['valueTone']>,
	{ pending: DateCalendarTonePalette; completed: DateCalendarTonePalette }
> = {
	gain: {
		pending: {
			accentColor: '#0EA5E9',
			amountColor: '#34D399',
			iconGradient: ['#0C4A6E', '#38BDF8'],
		},
		completed: {
			accentColor: '#10B981',
			amountColor: '#34D399',
			iconGradient: ['#047857', '#34D399'],
		},
	},
	expense: {
		pending: {
			accentColor: '#F59E0B',
			amountColor: '#F59E0B',
			iconGradient: ['#B45309', '#FACC15'],
		},
		completed: {
			accentColor: '#10B981',
			amountColor: '#34D399',
			iconGradient: ['#047857', '#34D399'],
		},
	},
};

function CalendarDayCircle({
	day,
	hasItems,
	hasHoliday,
	activeColor,
	activeTextColor,
	holidayColor,
	borderColor,
	emptyClassName,
	emptyTextClassName,
	splitId,
}: {
	day: number;
	hasItems: boolean;
	hasHoliday: boolean;
	activeColor: string;
	activeTextColor: string;
	holidayColor: string;
	borderColor: string;
	emptyClassName: string;
	emptyTextClassName: string;
	splitId: string;
}) {
	if (hasItems && hasHoliday) {
		return (
			<View
				style={{
					width: DAY_CIRCLE_SIZE,
					height: DAY_CIRCLE_SIZE,
					borderRadius: 999,
					overflow: 'hidden',
				}}
			>
				<Svg width={DAY_CIRCLE_SIZE} height={DAY_CIRCLE_SIZE} viewBox={`0 0 ${DAY_CIRCLE_SIZE} ${DAY_CIRCLE_SIZE}`}>
					<Defs>
						<ClipPath id={splitId}>
							<Circle cx={DAY_CIRCLE_RADIUS} cy={DAY_CIRCLE_RADIUS} r={DAY_CIRCLE_RADIUS - 1} />
						</ClipPath>
					</Defs>
					<G clipPath={`url(#${splitId})`}>
						<Rect width={DAY_CIRCLE_SIZE} height={DAY_CIRCLE_SIZE} fill={holidayColor} />
						<Polygon points={`0,0 ${DAY_CIRCLE_SIZE},0 0,${DAY_CIRCLE_SIZE}`} fill={activeColor} />
						<Line x1={DAY_CIRCLE_SIZE} y1={0} x2={0} y2={DAY_CIRCLE_SIZE} stroke={borderColor} strokeWidth={2.5} />
					</G>
					<Circle
						cx={DAY_CIRCLE_RADIUS}
						cy={DAY_CIRCLE_RADIUS}
						r={DAY_CIRCLE_RADIUS - 1}
						stroke={borderColor}
						strokeWidth={2}
						fill="transparent"
					/>
				</Svg>
				<View
					pointerEvents="none"
					style={{
						position: 'absolute',
						top: 0,
						right: 0,
						bottom: 0,
						left: 0,
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<Text
						style={{
							color: '#FFFFFF',
							fontWeight: '700',
							textShadowColor: 'rgba(15,23,42,0.45)',
							textShadowRadius: 4,
						}}
					>
						{day}
					</Text>
				</View>
			</View>
		);
	}

	if (hasHoliday) {
		return (
			<View
				style={{
					width: DAY_CIRCLE_SIZE,
					height: DAY_CIRCLE_SIZE,
					borderRadius: 999,
					backgroundColor: holidayColor,
					borderWidth: 2,
					borderColor,
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<Text className="font-semibold text-white">{day}</Text>
			</View>
		);
	}

	if (hasItems) {
		return (
			<View
				style={{
					width: DAY_CIRCLE_SIZE,
					height: DAY_CIRCLE_SIZE,
					borderRadius: 999,
					backgroundColor: activeColor,
					borderWidth: 2,
					borderColor,
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<Text style={{ color: activeTextColor, fontWeight: '700' }}>{day}</Text>
			</View>
		);
	}

	return (
		<View
			className={`w-12 h-12 items-center justify-center rounded-full ${emptyClassName} opacity-80`}
			style={{
				borderWidth: 1,
				borderColor,
			}}
		>
			<Text className={emptyTextClassName}>{day}</Text>
		</View>
	);
}

function DateCalendar({
	items,
	tagsMap,
	tagMetadataMap,
	formatCurrency,
	getStatusText,
	getStatusClassName,
	onAction,
	dueLabel = 'Vencimento',
	completedLabel = 'pagos',
	pendingLabel = 'pend.',
	valueTone = 'expense',
	modalSize = 'md',
}: DateCalendarProps) {
	const {
		isDarkMode,
		helperText,
		compactCardClassName,
		subtleCardClassName,
		modalContentClassName,
		insets,
		webDashboardClassNames,
	} =
		useScreenStyles();
	const { height: windowHeight } = useWindowDimensions();
	const visibleMonth = React.useMemo(() => new Date(), []);
	const visibleMonthLabel = React.useMemo(
		() =>
			new Intl.DateTimeFormat('pt-BR', {
				month: 'long',
				year: 'numeric',
			}).format(visibleMonth),
		[visibleMonth],
	);

	const [selectedDayItems, setSelectedDayItems] = React.useState<{
		date: Date;
		items: DateCalendarItem[];
		holidayName?: string | null;
	} | null>(null);
	const [expandedDayItemIds, setExpandedDayItemIds] = React.useState<string[]>([]);
	const [renderedDayItemIds, setRenderedDayItemIds] = React.useState<string[]>([]);

	const calendarData = React.useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
	const holidaysByDay = React.useMemo(
		() =>
			Object.fromEntries(
				getBrazilNationalHolidaysForMonth(visibleMonth).map(holiday => [holiday.date.getDate(), holiday]),
			),
		[visibleMonth],
	);

	const itemsByDay = React.useMemo(() => {
		const grouped: Record<number, DateCalendarItem[]> = {};
		const cappedDay = (day: number) => Math.min(Math.max(1, day || 1), calendarData.totalDays);

		items.forEach(item => {
			const resolvedDate = item.resolvedDueDate ?? null;
			const safeDay =
				resolvedDate &&
					resolvedDate.getFullYear() === visibleMonth.getFullYear() &&
					resolvedDate.getMonth() === visibleMonth.getMonth()
					? cappedDay(resolvedDate.getDate())
					: cappedDay(item.dueDay);
			const list = grouped[safeDay] ?? [];
			list.push(item);
			grouped[safeDay] = list;
		});

		Object.values(grouped).forEach(dayItems => dayItems.sort(compareDateCalendarItems));

		return grouped;
	}, [calendarData.totalDays, items, visibleMonth]);

	const handleSelectCalendarDay = React.useCallback(
		(day: number, date: Date) => {
			const dayItems = itemsByDay[day] ?? [];
			const holidayName = holidaysByDay[day]?.name ?? null;
			if (!dayItems.length && !holidayName) {
				return;
			}
			setExpandedDayItemIds([]);
			setRenderedDayItemIds([]);
			setSelectedDayItems({ date, items: dayItems, holidayName });
		},
		[holidaysByDay, itemsByDay],
	);

	const handleCloseDayModal = React.useCallback(() => {
		setExpandedDayItemIds([]);
		setRenderedDayItemIds([]);
		setSelectedDayItems(null);
	}, []);

	const handleToggleDayItemCard = React.useCallback((itemId: string) => {
		setExpandedDayItemIds(previousState => {
			if (previousState.includes(itemId)) {
				return previousState.filter(id => id !== itemId);
			}

			setRenderedDayItemIds(rendered => (rendered.includes(itemId) ? rendered : [...rendered, itemId]));
			return [...previousState, itemId];
		});
	}, []);

	const handleDayAction = React.useCallback(
		(action: 'register' | 'settle' | 'edit' | 'delete' | 'reclaim', item: DateCalendarItem) => {
			setExpandedDayItemIds([]);
			setRenderedDayItemIds([]);
			setSelectedDayItems(null);
			onAction(action, item);
		},
		[onAction],
	);

	const selectedDayLabel = React.useMemo(
		() => (selectedDayItems ? formatLongDate(selectedDayItems.date) : 'dia selecionado'),
		[selectedDayItems],
	);
	const selectedDayCount = selectedDayItems?.items.length ?? 0;
	const modalSummaryBadgeClassName =
		valueTone === 'gain'
			? 'border border-emerald-500/30 bg-emerald-500/10'
			: 'border border-amber-500/30 bg-amber-500/10';
	const modalSummaryBadgeTextClassName =
		valueTone === 'gain' ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300';
	const holidayBadgeClassName = 'border border-violet-500/30 bg-violet-500/10';
	const holidayBadgeTextClassName = 'text-violet-700 dark:text-violet-300';
	const getItemTonePalette = React.useCallback(
		(item: DateCalendarItem) =>
			item.isCompletedForCurrentCycle
				? DATE_CALENDAR_TONES[valueTone].completed
				: DATE_CALENDAR_TONES[valueTone].pending,
		[valueTone],
	);
	const calendarActiveColor = React.useMemo(
		() => (valueTone === 'gain' ? (isDarkMode ? '#34D399' : '#10B981') : isDarkMode ? '#FDE047' : '#FACC15'),
		[isDarkMode, valueTone],
	);
	const calendarActiveTextColor = valueTone === 'gain' ? '#FFFFFF' : '#0F172A';
	const holidayCircleColor = isDarkMode ? HOLIDAY_PURPLE_DARK : HOLIDAY_PURPLE_LIGHT;
	const calendarDayBorderColor = isDarkMode ? '#0F172A' : '#FFFFFF';
	const emptyDayClassName = 'bg-slate-100 dark:bg-slate-900';
	const emptyDayTextClassName = 'text-slate-700 dark:text-slate-200';
	const timelinePalette = React.useMemo(
		() => ({
			title: isDarkMode ? '#F8FAFC' : '#0F172A',
			subtitle: isDarkMode ? '#94A3B8' : '#64748B',
		}),
		[isDarkMode],
	);
	const formatCalendarItemScheduleLabel = React.useCallback((item: DateCalendarItem) => {
		const configuredLabel = formatConfiguredMonthlyDueLabel(item.dueDay, item.usesBusinessDays);
		const resolvedDate = item.resolvedDueDate ?? null;

		if (!resolvedDate) {
			return configuredLabel;
		}

		if (item.usesBusinessDays) {
			return `${configuredLabel} • ${formatResolvedMonthDayLabel(resolvedDate)}`;
		}

		return configuredLabel;
	}, []);
	const formatCalendarItemResolvedDateLabel = React.useCallback((item: DateCalendarItem) => {
		const resolvedDate = item.resolvedDueDate ?? null;
		if (!resolvedDate) {
			return 'data não disponível';
		}

		const holidayName = item.holidayName ?? null;
		const holidaySuffix = holidayName ? ` • ${holidayName}` : '';
		return `${formatResolvedMonthDateLabel(resolvedDate)}${holidaySuffix}`;
	}, []);
	const getDisplayValueInCents = React.useCallback(
		(item: DateCalendarItem) =>
			typeof item.displayValueInCents === 'number' && !Number.isNaN(item.displayValueInCents)
				? item.displayValueInCents
				: item.valueInCents,
		[],
	);
	const modalMaxHeight = React.useMemo(
		() => Math.max(windowHeight - (insets.top ?? 0) - (insets.bottom ?? 0) - 40, 320),
		[insets.bottom, insets.top, windowHeight],
	);
	const modalWidthClassName = modalSize === 'lg' ? 'web:w-[calc(100%-32px)] web:max-w-[640px]' : 'max-w-[430px]';

	return (
		<>
			<Box className={`${compactCardClassName} overflow-hidden px-2`}>
				<HStack className="justify-between items-start gap-3 mb-4">
					<VStack className="flex-1">
						<Heading className="text-lg uppercase tracking-widest ">Calendário de Vencimentos</Heading>
						<Text className="text-slate-500 dark:text-slate-400 uppercase mt-1">{visibleMonthLabel}</Text>
					</VStack>
				</HStack>

				<View className={`${subtleCardClassName}`}>
					<View className="flex-row">
						{WEEKDAY_LABELS.map((labelItem, index) => (
							<View
								key={`${labelItem}-${index}`}
								className="items-center justify-center"
								style={{ width: CELL_PERCENT, height: 25 }}
							>
								<Text className={`text-center font-semibold uppercase ${helperText}`}>{labelItem}</Text>
							</View>
						))}
					</View>

					<View className="flex-row flex-wrap w-full">
						{calendarData.prevPlaceholders.map(item => (
							<View
								key={`prev-${item.day}`}
								style={{
									width: CELL_PERCENT,
									height: CELL_HEIGHT,
								}}
								className="items-center"
							>
								<View className="flex-1 items-center justify-center">
									<Text className={`text-center ${helperText}`}>{item.day}</Text>
								</View>
								<View className="h-7" />
							</View>
						))}
						{calendarData.days.map(({ day, date }) => {
							const dayItems = itemsByDay[day] ?? [];
							const holiday = holidaysByDay[day] ?? null;
							const hasItems = dayItems.length > 0;
							const hasHoliday = Boolean(holiday);
							const canSelectDay = hasItems || hasHoliday;
							const completedCount = dayItems.filter(item => item.isCompletedForCurrentCycle).length;
							const pendingCount = dayItems.length - completedCount;
							const badgeBg =
								pendingCount > 0
									? 'bg-orange-100 dark:bg-orange-900/70 border border-orange-200 dark:border-orange-800'
									: 'bg-emerald-100 dark:bg-emerald-900/70 border border-emerald-200 dark:border-emerald-800';
							const holidaySplitId = `holiday-split-${valueTone}-${day}`;

							return (
								<View
									key={day}
									style={{
										width: CELL_PERCENT,
										height: CELL_HEIGHT,
									}}
									className="items-center"
								>
									<View className="flex-1 items-center justify-center">
										<Pressable
											disabled={!canSelectDay}
											onPress={() => handleSelectCalendarDay(day, date)}
											hitSlop={canSelectDay ? 8 : 0}
										>
											<CalendarDayCircle
												day={day}
												hasItems={hasItems}
												hasHoliday={hasHoliday}
												activeColor={calendarActiveColor}
												activeTextColor={calendarActiveTextColor}
												holidayColor={holidayCircleColor}
												borderColor={calendarDayBorderColor}
												emptyClassName={emptyDayClassName}
												emptyTextClassName={emptyDayTextClassName}
												splitId={holidaySplitId}
											/>
										</Pressable>
									</View>
									<View className="h-7 items-center justify-center">
										{hasItems ? (
											<View className={`px-2 py-1 rounded-full ${badgeBg}`}>
												<Text
													className="text-[10px] text-center font-semibold text-gray-800 dark:text-gray-100"
													numberOfLines={1}
												>
													{pendingCount === 0
														? `${dayItems.length} ${completedLabel}`
														: `${pendingCount}/${dayItems.length} ${pendingLabel}`}
												</Text>
											</View>
										) : hasHoliday ? (
											<View className={`px-2 py-1 rounded-full ${holidayBadgeClassName}`}>
												<Text
													className={`text-[10px] text-center font-semibold ${holidayBadgeTextClassName}`}
													numberOfLines={1}
												>
													Feriado
												</Text>
											</View>
										) : null}
									</View>
								</View>
							);
						})}
						{calendarData.nextPlaceholders.map(item => (
							<View
								key={`next-${item.day}`}
								style={{
									width: CELL_PERCENT,
									height: CELL_HEIGHT,
								}}
								className="items-center"
							>
								<View className="flex-1 items-center justify-center">
									<Text className={`text-center ${helperText}`}>{item.day}</Text>
								</View>
								<View className="h-7" />
							</View>
						))}
					</View>
				</View>
			</Box>

			<Modal size={modalSize} isOpen={Boolean(selectedDayItems)} onClose={handleCloseDayModal}>
				<ModalBackdrop />
				<ModalContent
					className={`${modalWidthClassName} grow-0 shrink basis-auto ${modalContentClassName} web:h-auto web:min-h-0 web:flex-none`}
					style={{ maxHeight: modalMaxHeight }}
				>
					<ModalHeader className="pt-5">
						<VStack className="flex-1">
							<Heading className="text-lg uppercase tracking-widest ">Resumo diário</Heading>
							<Text className="text-slate-500 dark:text-slate-400 uppercase mt-1">{selectedDayLabel}</Text>
						</VStack>
						<ModalCloseButton accessibilityLabel="Fechar resumo diário" onPress={handleCloseDayModal} />
					</ModalHeader>
					<ModalBody
						className="grow-0 shrink basis-auto px-6 pb-4 pt-3 web:max-h-[calc(100vh-180px)] web:min-h-0 web:flex-none web:overscroll-contain"
						showsVerticalScrollIndicator={false}
						contentContainerStyle={NATIVE_LIBRARY_STYLES.calendarModalBodyContent}
					>
						<VStack className="w-full gap-2">
							<HStack className="flex-wrap gap-2">
								{selectedDayCount > 0 ? (
									<View className={`px-3 py-1 rounded-full ${modalSummaryBadgeClassName}`}>
										<Text className={`text-xs font-semibold ${modalSummaryBadgeTextClassName}`}>
											{selectedDayCount} item(ns) no dia
										</Text>
									</View>
								) : null}
								{selectedDayItems?.holidayName ? (
									<View className={`px-3 py-1 rounded-full ${holidayBadgeClassName}`}>
										<Text className={`text-xs font-semibold ${holidayBadgeTextClassName}`}>
											{selectedDayItems.holidayName}
										</Text>
									</View>
								) : null}
							</HStack>
							<View className="w-full">
								{selectedDayItems?.items.map(item => {
									const tonePalette = getItemTonePalette(item);
									const tagMetadata = tagMetadataMap?.[item.tagId];
									const itemTagLabel = tagMetadata?.name ?? tagsMap[item.tagId] ?? 'Tag não encontrada';
									const itemName = typeof item.name === 'string' ? item.name.trim() : '';
									const itemNameLabel =
										itemName || (valueTone === 'gain' ? 'Ganho obrigatório sem nome' : 'Gasto obrigatório sem nome');
									const summaryText = getStatusText(item);
									const itemTypeLabel = valueTone === 'gain' ? 'Ganho obrigatório' : 'Gasto obrigatório';
									const reminderLabel =
										item.reminderSummary ?? (item.reminderEnabled === true ? 'Ativado' : 'Desativado');
									const isExpanded = expandedDayItemIds.includes(item.id);
									const actionTextClassName = 'text-white';
									const actionIconClassName = 'text-white';

									return (
										<View
											key={`selected-${item.id}`}
											className="w-full pb-3 mb-3 last:mb-0"
										>
											<Pressable
												onPress={() => handleToggleDayItemCard(item.id)}
												accessibilityRole="button"
												accessibilityLabel={`${isExpanded ? 'Recolher' : 'Expandir'} detalhes de ${itemNameLabel}`}
												accessibilityState={{ expanded: isExpanded }}
												className={`${webDashboardClassNames.movementHeader} min-h-[52px] cursor-pointer rounded-2xl py-1 focus-visible:ring-2 focus-visible:ring-yellow-300`}
											>
												<View className={webDashboardClassNames.movementIdentity}>
													<View
														className={`${webDashboardClassNames.movementIcon} border border-white/10`}
														style={{ backgroundColor: tonePalette.iconGradient[0] }}
													>
														<TagIcon
															iconFamily={tagMetadata?.iconFamily}
															iconName={tagMetadata?.iconName}
															iconStyle={tagMetadata?.iconStyle}
															size={18}
															color="#FFFFFF"
														/>
													</View>

													<View className={webDashboardClassNames.movementCopy}>
														<NativeText
															numberOfLines={1}
															className={webDashboardClassNames.movementName}
															style={{ color: timelinePalette.title }}
														>
															{itemNameLabel}
														</NativeText>
														<NativeText
															numberOfLines={1}
															className={webDashboardClassNames.movementSubtitle}
															style={{ color: timelinePalette.subtitle }}
														>
															{itemTagLabel}
														</NativeText>
														{item.installmentLabel ? (
															<NativeText
																numberOfLines={1}
																className="mt-0.5 text-[11px] font-bold leading-4"
																style={{ color: tonePalette.accentColor }}
															>
																{item.installmentLabel}
															</NativeText>
														) : null}
													</View>
												</View>

												<View className={webDashboardClassNames.movementAmount}>
													<NativeText
														className={`${webDashboardClassNames.amount} tabular-nums`}
														style={{ color: tonePalette.amountColor }}
													>
														{formatCurrency(getDisplayValueInCents(item))}
													</NativeText>
													<View className={webDashboardClassNames.movementDate}>
														<Icon
															as={CalendarDaysIcon}
															size="xs"
															className={isDarkMode ? 'text-slate-500' : 'text-slate-400'}
														/>
														<NativeText numberOfLines={1} className={webDashboardClassNames.dateText}>
															{formatCalendarItemScheduleLabel(item)}
														</NativeText>
														{isExpanded ? (
															<Icon
																as={ChevronUpIcon}
																size="xs"
																className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}
															/>
														) : (
															<Icon
																as={ChevronDownIcon}
																size="xs"
																className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}
															/>
														)}
													</View>
												</View>
											</Pressable>

											{renderedDayItemIds.includes(item.id) ? (
												<AnimatedContent
													key={`${item.id}:detail`}
													trigger="mount"
													visible={isExpanded}
													distance={18}
													duration={0.36}
													disappearDuration={0.28}
													disappearScale={1}
													ease="power3.out"
													initialOpacity={0}
													animateOpacity
													scale={1}
													className={webDashboardClassNames.movementDetailAnimation}
													onDisappearanceComplete={() =>
														setRenderedDayItemIds(rendered => rendered.filter(id => id !== item.id))
													}
												>
													<View className={webDashboardClassNames.movementDetail}>
														<View
															pointerEvents="none"
															className={webDashboardClassNames.movementDetailGrainient}
														>
															<Grainient
																className="movement-detail-grainient"
																timeSpeed={0.1}
																warpStrength={0.8}
																warpFrequency={3.5}
																warpSpeed={1.6}
																warpAmplitude={90}
																blendSoftness={0.2}
																grainAmount={0.06}
																grainScale={3}
																grainAnimated
																contrast={1.12}
																zoom={1.05}
																color1={tonePalette.iconGradient[0]}
																color2={tonePalette.accentColor}
																color3={tonePalette.iconGradient[1]}
															/>
														</View>
														<View className={webDashboardClassNames.movementDetailContent}>
															<View className="flex-row items-start">
																<View className="min-w-0 flex-1">
																	<NativeText
																		className="text-[10px] font-bold uppercase tracking-[0.5px]"
																		style={{ color: 'rgba(255,255,255,0.7)' }}
																	>
																		Status
																	</NativeText>
																	<NativeText
																		className={`mt-1 text-[13px] leading-5 ${getStatusClassName(item)}`}
																		style={{ color: '#FFFFFF' }}
																	>
																		{summaryText}
																	</NativeText>
																</View>
															</View>

															<View className="mt-3.5 flex-row flex-wrap gap-3">
																{[
																	{ label: 'Tipo', value: itemTypeLabel },
																	{
																		label: dueLabel,
																		value: formatConfiguredMonthlyDueLabel(item.dueDay, item.usesBusinessDays),
																	},
																	{ label: 'Neste mês', value: formatCalendarItemResolvedDateLabel(item) },
																	{ label: 'Tag', value: itemTagLabel },
																	{ label: 'Lembrete', value: reminderLabel },
																	...(item.installmentLabel
																		? [{ label: 'Parcelas', value: item.installmentLabel }]
																		: []),
																].map(metaItem => (
																	<View key={`${item.id}-${metaItem.label}`} className="min-w-[128px] flex-1">
																		<NativeText
																			className="text-[10px] font-bold uppercase tracking-[0.5px]"
																			style={{ color: 'rgba(255,255,255,0.7)' }}
																		>
																			{metaItem.label}
																		</NativeText>
																		<NativeText
																			className="mt-1 text-[13px] leading-[18px]"
																			style={{ color: '#FFFFFF' }}
																		>
																			{metaItem.value}
																		</NativeText>
																	</View>
																))}
															</View>

															{item.description ? (
																<View className="mt-3">
																	<NativeText
																		className="text-[10px] font-bold uppercase tracking-[0.5px]"
																		style={{ color: 'rgba(255,255,255,0.7)' }}
																	>
																		Descrição
																	</NativeText>
																	<NativeText
																		className="mt-1 text-[13px] leading-[18px]"
																		style={{ color: '#FFFFFF' }}
																	>
																		{item.description}
																	</NativeText>
																</View>
															) : null}

															<View className="flex-row flex-wrap gap-x-4 gap-y-2 pt-0.5">
																<Pressable
																	onPress={() => handleDayAction('register', item)}
																	disabled={item.isCompletedForCurrentCycle}
																	accessibilityRole="button"
																	accessibilityLabel={`Registrar pagamento de ${itemNameLabel}`}
																	className={`min-h-[40px] flex-row items-center gap-2 rounded-xl px-2 focus-visible:ring-2 focus-visible:ring-yellow-300 ${actionTextClassName}`}
																	style={{ opacity: item.isCompletedForCurrentCycle ? 0.45 : 1 }}
																>
																	<Icon as={AddIcon} size="sm" className={actionIconClassName} />
																	<NativeText className={`text-xs font-semibold ${actionTextClassName}`}>Registrar</NativeText>
																</Pressable>

																{valueTone === 'expense' && typeof item.installmentTotal === 'number' && !item.isInstallmentComplete ? (
																	<Pressable
																		onPress={() => handleDayAction('settle', item)}
																		accessibilityRole="button"
																		accessibilityLabel={`Quitar parcelas restantes de ${itemNameLabel}`}
																		className={`min-h-[40px] flex-row items-center gap-2 rounded-xl px-2 focus-visible:ring-2 focus-visible:ring-yellow-300 ${actionTextClassName}`}
																	>
																		<Icon as={CheckCircleIcon} size="sm" className={actionIconClassName} />
																		<NativeText className={`text-xs font-semibold ${actionTextClassName}`}>Quitar parcelas</NativeText>
																	</Pressable>
																) : null}

																<Pressable
																	onPress={() => handleDayAction('edit', item)}
																	accessibilityRole="button"
																	accessibilityLabel={`Editar ${itemNameLabel}`}
																	className={`min-h-[40px] flex-row items-center gap-2 rounded-xl px-2 focus-visible:ring-2 focus-visible:ring-yellow-300 ${actionTextClassName}`}
																>
																	<Icon as={EditIcon} size="sm" className={actionIconClassName} />
																	<NativeText className={`text-xs font-semibold ${actionTextClassName}`}>Editar</NativeText>
																</Pressable>

																{item.isCompletedForCurrentCycle && item.canReclaimCurrentCycle !== false ? (
																	<Pressable
																		onPress={() => handleDayAction('reclaim', item)}
																		accessibilityRole="button"
																		accessibilityLabel={`Desfazer pagamento de ${itemNameLabel}`}
																		className={`min-h-[40px] flex-row items-center gap-2 rounded-xl px-2 focus-visible:ring-2 focus-visible:ring-yellow-300 ${actionTextClassName}`}
																	>
																		<Icon as={RepeatIcon} size="sm" className={actionIconClassName} />
																		<NativeText className={`text-xs font-semibold ${actionTextClassName}`}>Reivindicar</NativeText>
																	</Pressable>
																) : null}

																<Pressable
																	onPress={() => handleDayAction('delete', item)}
																	accessibilityRole="button"
																	accessibilityLabel={`Excluir ${itemNameLabel}`}
															className="min-h-[40px] flex-row items-center gap-2 rounded-xl px-2 text-white focus-visible:ring-2 focus-visible:ring-white/80"
														>
															<Icon as={TrashIcon} size="sm" className="text-white" />
															<NativeText className="text-xs font-semibold text-white">Excluir</NativeText>
																</Pressable>
															</View>
														</View>
													</View>
												</AnimatedContent>
											) : null}
										</View>
									);
								})}
							</View>
						</VStack>
						{selectedDayCount === 0 ? (
							<Text className={`text-center mt-3 ${helperText}`}>Nenhum item encontrado para este dia.</Text>
						) : null}
					</ModalBody>
				</ModalContent>
			</Modal>
		</>
	);
}

export default DateCalendar;
