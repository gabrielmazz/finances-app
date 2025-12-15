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

type DateCalendarProps = {
	items: DateCalendarItem[];
	tagsMap: Record<string, string>;
	formatCurrency: (valueInCents: number) => string;
	getStatusText: (item: DateCalendarItem) => string;
	getStatusClassName: (item: DateCalendarItem) => string;
	getDueDayColorClass: (dueDay: number, item?: DateCalendarItem) => string;
	onAction: (action: 'register' | 'edit' | 'delete' | 'reclaim', item: DateCalendarItem) => void;
	valueLabel?: string;
	dueLabel?: string;
	completedLabel?: string;
	pendingLabel?: string;
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
	formatCurrency,
	getStatusText,
	getStatusClassName,
	getDueDayColorClass,
	onAction,
	valueLabel = 'Previsto',
	dueLabel = 'Vencimento',
	completedLabel = 'pagos',
	pendingLabel = 'pend.',
}: DateCalendarProps) {
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

	return (
		<>
			<Box className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm mb-5">
				<HStack className="justify-between items-center mb-3">
					<VStack className="flex-1">
						<Text className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">
							Calendário de vencimentos
						</Text>
						<Text className="text-xl font-semibold capitalize">{visibleMonthLabel}</Text>
					</VStack>
				</HStack>

				<Text className="text-sm text-gray-600 dark:text-gray-400 mb-4">
					Visualize todos os vencimentos do mês e toque em um dia destacado para abrir as ações.
				</Text>

				<View className="flex-row w-full mb-2">
					{WEEKDAY_LABELS.map((labelItem, index) => (
						<View
							key={`${labelItem}-${index}`}
							className="items-center justify-center"
							style={{ width: CELL_PERCENT, height: 32 }}
						>
							<Text className="text-center font-semibold text-gray-600 dark:text-gray-300 uppercase">
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
								<Text className="text-center text-gray-500 dark:text-gray-600">{item.day}</Text>
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
										className={`w-12 h-12 items-center justify-center rounded-full ${
											hasItems ? 'bg-[#FFE000]' : 'bg-gray-100 dark:bg-gray-800'
										} ${hasItems ? '' : 'opacity-80'}`}
										disabled={!hasItems}
										onPress={() => handleSelectCalendarDay(day, date)}
										hitSlop={hasItems ? 8 : 0}
									>
										<Text
											className={`text-center ${
												hasItems ? 'text-gray-900 font-semibold' : 'text-gray-800 dark:text-gray-200'
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
								<Text className="text-center text-gray-500 dark:text-gray-600">{item.day}</Text>
							</View>
							<View className="h-7" />
						</View>
					))}
				</View>
			</Box>

			<Modal isOpen={Boolean(selectedDayItems)} onClose={handleCloseDayModal}>
				<ModalBackdrop />
				<ModalContent className="max-w-[420px]">
					<ModalHeader>
						<Text className="text-xl font-semibold">Vencimentos em {selectedDayLabel}</Text>
						<ModalCloseButton onPress={handleCloseDayModal} />
					</ModalHeader>
					<ModalBody>
						<VStack className="gap-4">
							{selectedDayItems?.items.map(item => (
								<Box
									key={`selected-${item.id}`}
									className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 w-full"
								>
									<VStack className="gap-1">
										<Text className="text-lg font-semibold">{item.name}</Text>
										<Text className="text-gray-700 dark:text-gray-300">
											{valueLabel}:{' '}
											<Text className="text-orange-500 dark:text-orange-300">{formatCurrency(item.valueInCents)}</Text>
										</Text>
										<Text className="text-gray-700 dark:text-gray-300">
											{dueLabel}:{' '}
											<Text className={getDueDayColorClass(item.dueDay, item)}>
												dia {String(item.dueDay).padStart(2, '0')}
											</Text>
										</Text>
										<Text className="text-gray-600">Tag: {tagsMap[item.tagId] ?? 'Tag não encontrada'}</Text>
										<Text className="text-gray-600">
											Lembrete: {item.reminderEnabled === false ? 'desativado' : 'ativado'}
										</Text>
										<Text className={getStatusClassName(item)}>{getStatusText(item)}</Text>
										{item.description ? <Text className="text-gray-600">Observações: {item.description}</Text> : null}
									</VStack>
									<Divider className="my-3" />
									<HStack className="gap-3 flex-wrap justify-end">
										<Button
											size="sm"
											variant="link"
											action="primary"
											onPress={() => handleDayAction('register', item)}
											isDisabled={item.isCompletedForCurrentCycle}
										>
											<ButtonIcon as={AddIcon} />
										</Button>
										<Button
											size="sm"
											variant="link"
											action="primary"
											onPress={() => handleDayAction('edit', item)}
										>
											<ButtonIcon as={EditIcon} />
										</Button>
										{item.isCompletedForCurrentCycle && (
											<Button
												size="sm"
												variant="link"
												action="secondary"
												onPress={() => handleDayAction('reclaim', item)}
											>
												<ButtonText>Reivindicar</ButtonText>
											</Button>
										)}
										<Button
											size="sm"
											variant="link"
											action="negative"
											onPress={() => handleDayAction('delete', item)}
										>
											<ButtonIcon as={TrashIcon} />
										</Button>
									</HStack>
								</Box>
							))}
						</VStack>
						{selectedDayItems?.items.length === 0 ? (
							<Text className="text-center text-gray-500">Nenhum item encontrado para este dia.</Text>
						) : null}
					</ModalBody>
				</ModalContent>
			</Modal>
		</>
	);
}

export default DateCalendar;
