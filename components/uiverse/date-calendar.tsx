import React from 'react';
import { Pressable, View } from 'react-native';

import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Divider } from '@/components/ui/divider';
import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalHeader,
} from '@/components/ui/modal';
import { AddIcon, EditIcon, TrashIcon } from '@/components/ui/icon';
import { TagIcon } from '@/hooks/useTagIcons';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { Heading } from '../ui/heading';

export type DateCalendarItem = {
	id: string;
	name: string;
	valueInCents: number;
	dueDay: number;
	tagId: string;
	description?: string | null;
	reminderEnabled?: boolean;
	isCompletedForCurrentCycle?: boolean;
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
	onAction: (action: 'register' | 'edit' | 'delete' | 'reclaim', item: DateCalendarItem) => void;
	valueLabel?: string;
	dueLabel?: string;
	completedLabel?: string;
	pendingLabel?: string;
	valueTone?: 'expense' | 'gain';
};

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const CELL_PERCENT = '14.2857%';
const CELL_HEIGHT = 82;

const buildCalendarDays = (reference: Date) => {
	const firstDay = new Date(reference.getFullYear(), reference.getMonth(), 1);
	const totalDays = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
	const startOffset = firstDay.getDay();
	const prevMonthTotalDays = new Date(reference.getFullYear(), reference.getMonth(), 0).getDate();

	const days: Array<{ day: number; date: Date }> = [];
	for (let i = 0; i < totalDays; i += 1) {
		const dayNumber = i + 1;
		days.push({ day: dayNumber, date: new Date(reference.getFullYear(), reference.getMonth(), dayNumber) });
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

function DateCalendar({
	items,
	tagsMap,
	tagMetadataMap,
	formatCurrency,
	getStatusText,
	getStatusClassName,
	getDueDayColorClass,
	onAction,
	valueLabel = 'Previsto',
	dueLabel = 'Vencimento',
	completedLabel = 'pagos',
	pendingLabel = 'pend.',
	valueTone = 'expense',
}: DateCalendarProps) {
	const {
		bodyText,
		helperText,
		compactCardClassName,
		subtleCardClassName,
		modalContentClassName,
		tintedCardClassName,
	} = useScreenStyles();
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
	} | null>(null);

	const calendarData = React.useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);

	const itemsByDay = React.useMemo(() => {
		const grouped: Record<number, DateCalendarItem[]> = {};
		const cappedDay = (day: number) => Math.min(Math.max(1, day || 1), calendarData.totalDays);

		items.forEach(item => {
			const safeDay = cappedDay(item.dueDay);
			const list = grouped[safeDay] ?? [];
			list.push(item);
			grouped[safeDay] = list;
		});

		return grouped;
	}, [calendarData.totalDays, items]);

	const handleSelectCalendarDay = React.useCallback(
		(day: number, date: Date) => {
			const dayItems = itemsByDay[day] ?? [];
			if (!dayItems.length) {
				return;
			}
			setSelectedDayItems({ date, items: dayItems });
		},
		[itemsByDay],
	);

	const handleCloseDayModal = React.useCallback(() => {
		setSelectedDayItems(null);
	}, []);

	const handleDayAction = React.useCallback(
		(action: 'register' | 'edit' | 'delete' | 'reclaim', item: DateCalendarItem) => {
			setSelectedDayItems(null);
			onAction(action, item);
		},
		[onAction],
	);

	const selectedDayLabel = React.useMemo(
		() => (selectedDayItems ? formatLongDate(selectedDayItems.date) : 'dia selecionado'),
		[selectedDayItems],
	);
	const amountTextClassName =
		valueTone === 'gain' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-300';
	const highlightedDayClassName =
		valueTone === 'gain'
			? 'bg-emerald-500 dark:bg-emerald-400'
			: 'bg-amber-400 dark:bg-yellow-300';
	const highlightedDayTextClassName = valueTone === 'gain' ? 'text-white' : 'text-slate-900';

	return (
		<>
			<Box className={`${compactCardClassName} overflow-hidden px-2 py-2`}>
				<HStack className="justify-between items-start gap-3 mb-4">
					<VStack className="flex-1">
						<Heading
							className="text-lg uppercase tracking-widest "
						>
							Calendário de Vencimentos
						</Heading>
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
								<Text className={`text-center font-semibold uppercase ${helperText}`}>
									{labelItem}
								</Text>
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
							const hasItems = dayItems.length > 0;
							const completedCount = dayItems.filter(item => item.isCompletedForCurrentCycle).length;
							const pendingCount = dayItems.length - completedCount;
							const badgeBg =
								pendingCount > 0
									? 'bg-orange-100 dark:bg-orange-900/70 border border-orange-200 dark:border-orange-800'
									: 'bg-emerald-100 dark:bg-emerald-900/70 border border-emerald-200 dark:border-emerald-800';

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
											className={`w-12 h-12 items-center justify-center rounded-full ${hasItems
													? highlightedDayClassName
													: 'bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
												} ${hasItems ? '' : 'opacity-80'}`}
											disabled={!hasItems}
											onPress={() => handleSelectCalendarDay(day, date)}
											hitSlop={hasItems ? 8 : 0}
										>
											<Text
												className={`text-center ${hasItems
														? `${highlightedDayTextClassName} font-semibold`
														: 'text-slate-700 dark:text-slate-200'
													}`}
											>
												{day}
											</Text>
										</Pressable>
									</View>
									<View className="h-7 items-center justify-center">
										{hasItems ? (
											<View className={`px-2 py-1 rounded-full ${badgeBg}`}>
												<Text className="text-[10px] text-center font-semibold text-gray-800 dark:text-gray-100" numberOfLines={1}>
													{pendingCount === 0
														? `${dayItems.length} ${completedLabel}`
														: `${pendingCount}/${dayItems.length} ${pendingLabel}`}
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

			<Modal isOpen={Boolean(selectedDayItems)} onClose={handleCloseDayModal}>
				<ModalBackdrop />
				<ModalContent className={`max-w-[420px] ${modalContentClassName}`}>
					<ModalHeader>
						<VStack className="flex-1">
							<Text className="text-xl font-semibold">Resumo de {selectedDayLabel}</Text>
							<Text className={`${helperText} mt-1 text-sm`}>
								{selectedDayItems?.items.length ?? 0} item(ns) programado(s) neste dia.
							</Text>
						</VStack>
						<ModalCloseButton onPress={handleCloseDayModal} />
					</ModalHeader>
					<ModalBody>
						<VStack className="gap-4">
							{selectedDayItems?.items.map(item => (
								<Box
									key={`selected-${item.id}`}
									className={`${subtleCardClassName} w-full px-4 py-4`}
								>
									<HStack className="items-start gap-3">
										<View className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
											<TagIcon
												iconFamily={tagMetadataMap?.[item.tagId]?.iconFamily}
												iconName={tagMetadataMap?.[item.tagId]?.iconName}
												iconStyle={tagMetadataMap?.[item.tagId]?.iconStyle}
												size={18}
												color={valueTone === 'gain' ? '#10B981' : '#D97706'}
											/>
										</View>

										<VStack className="flex-1 gap-1">
											<HStack className="items-start justify-between gap-3">
												<VStack className="flex-1">
													<Text className="text-base font-semibold">{item.name}</Text>
													<Text className={`${helperText} text-sm`}>
														{tagMetadataMap?.[item.tagId]?.name ?? tagsMap[item.tagId] ?? 'Tag não encontrada'}
													</Text>
												</VStack>
												<Text className={`text-base font-semibold ${amountTextClassName}`}>
													{formatCurrency(item.valueInCents)}
												</Text>
											</HStack>

											<HStack className="flex-wrap items-center gap-2 pt-1">
												<Box className={`${compactCardClassName} px-3 py-1.5`}>
													<Text className={`${bodyText} text-xs`}>
														{dueLabel}: <Text className={getDueDayColorClass(item.dueDay, item)}>dia {String(item.dueDay).padStart(2, '0')}</Text>
													</Text>
												</Box>
												<Box className={`${compactCardClassName} px-3 py-1.5`}>
													<Text className={`${bodyText} text-xs`}>
														{valueLabel}
													</Text>
												</Box>
											</HStack>

											<Text className={getStatusClassName(item)}>{getStatusText(item)}</Text>
											<Text className={`${helperText} text-sm`}>
												Lembrete: {item.reminderEnabled === false ? 'desativado' : 'ativado'}
											</Text>
											{item.description ? (
												<Text className={`${bodyText} text-sm`}>Observações: {item.description}</Text>
											) : null}
										</VStack>
									</HStack>
									<Divider className="my-3" />
									<HStack className="gap-3 flex-wrap justify-end">
										<Button
											size="sm"
											variant="outline"
											action="primary"
											onPress={() => handleDayAction('register', item)}
											isDisabled={item.isCompletedForCurrentCycle}
										>
											<ButtonIcon as={AddIcon} />
											<ButtonText>Registrar</ButtonText>
										</Button>
										<Button
											size="sm"
											variant="outline"
											action="primary"
											onPress={() => handleDayAction('edit', item)}
										>
											<ButtonIcon as={EditIcon} />
											<ButtonText>Editar</ButtonText>
										</Button>
										{item.isCompletedForCurrentCycle && (
											<Button
												size="sm"
												variant="outline"
												action="secondary"
												onPress={() => handleDayAction('reclaim', item)}
											>
												<ButtonText>Reivindicar</ButtonText>
											</Button>
										)}
										<Button
											size="sm"
											variant="outline"
											action="negative"
											onPress={() => handleDayAction('delete', item)}
										>
											<ButtonIcon as={TrashIcon} />
											<ButtonText>Excluir</ButtonText>
										</Button>
									</HStack>
								</Box>
							))}
						</VStack>
						{selectedDayItems?.items.length === 0 ? (
							<Text className={`text-center ${helperText}`}>Nenhum item encontrado para este dia.</Text>
						) : null}
					</ModalBody>
				</ModalContent>
			</Modal>
		</>
	);
}

export default DateCalendar;
