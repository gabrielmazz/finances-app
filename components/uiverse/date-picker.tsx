import React from 'react';
import { Pressable, View } from 'react-native';

import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import { Input, InputField } from '@/components/ui/input';
import { Modal, ModalBackdrop, ModalBody, ModalCloseButton, ModalContent, ModalHeader } from '@/components/ui/modal';
import { AddIcon, ArrowLeftIcon, ArrowRightIcon } from '@/components/ui/icon';
import { Divider } from '@/components/ui/divider';

type DatePickerFieldProps = {
	label?: string;
	value?: string | null;
	onChange: (formattedValue: string, date: Date) => void;
	placeholder?: string;
	isDisabled?: boolean;
};

// Domingo, Segunda, Terça, Quarta, Quinta, Sexta, Sábado (sem acentos para manter ASCII)
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const CELL_PERCENT = '14.2857%';
const CELL_HEIGHT = 52;

const formatDateToBR = (date: Date) => {
	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const year = date.getFullYear();
	return `${day}/${month}/${year}`;
};

const parseBRDate = (value?: string | null) => {
	if (!value) {
		return null;
	}
	const [dayStr, monthStr, yearStr] = value.split('/');
	const day = Number(dayStr);
	const month = Number(monthStr);
	const year = Number(yearStr);
	if (!day || !month || !year) {
		return null;
	}
	const candidate = new Date(year, month - 1, day);
	if (
		candidate.getFullYear() !== year ||
		candidate.getMonth() !== month - 1 ||
		candidate.getDate() !== day
	) {
		return null;
	}
	return candidate;
};

const buildCalendarDays = (reference: Date) => {
	const firstDay = new Date(reference.getFullYear(), reference.getMonth(), 1);
	const totalDays = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
	const startOffset = firstDay.getDay(); // 0 = Sunday
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

	return { startOffset, days, prevPlaceholders, nextPlaceholders };
};

export function DatePickerField({
	label,
	value,
	onChange,
	placeholder = 'DD/MM/AAAA',
	isDisabled,
}: DatePickerFieldProps) {
	const [isOpen, setIsOpen] = React.useState(false);
	const [visibleMonth, setVisibleMonth] = React.useState<Date>(() => parseBRDate(value) ?? new Date());

	const selectedDate = React.useMemo(() => parseBRDate(value), [value]);
	const monthLabel = React.useMemo(
		() =>
			new Intl.DateTimeFormat('pt-BR', {
				month: 'long',
				year: 'numeric',
			}).format(visibleMonth),
		[visibleMonth],
	);

	const { startOffset, days, prevPlaceholders, nextPlaceholders } = React.useMemo(
		() => buildCalendarDays(visibleMonth),
		[visibleMonth],
	);

	const handleSelect = React.useCallback(
		(date: Date) => {
			const formatted = formatDateToBR(date);
			onChange(formatted, date);
			setIsOpen(false);
		},
		[onChange],
	);

	const goToPrevMonth = React.useCallback(() => {
		setVisibleMonth(current => {
			const next = new Date(current);
			next.setMonth(current.getMonth() - 1);
			return next;
		});
	}, []);

	const goToNextMonth = React.useCallback(() => {
		setVisibleMonth(current => {
			const next = new Date(current);
			next.setMonth(current.getMonth() + 1);
			return next;
		});
	}, []);

	const handleOpen = React.useCallback(() => {
		if (isDisabled) {
			return;
		}
		setVisibleMonth(parseBRDate(value) ?? new Date());
		setIsOpen(true);
	}, [isDisabled, value]);

	const handleClose = React.useCallback(() => {
		setIsOpen(false);
	}, []);

	const handleSelectToday = React.useCallback(() => {
		handleSelect(new Date());
	}, [handleSelect]);

	return (
		<VStack className="w-full">
			{label ? (
				<Text className="mb-2 font-semibold text-gray-700 dark:text-gray-200">{label}</Text>
			) : null}
			<Pressable
				onPress={handleOpen}
				disabled={isDisabled}
				hitSlop={8}
				accessibilityRole="button"
				accessibilityLabel={label ?? 'Selecionar data'}
			>
				<View pointerEvents="none">
					<Input isDisabled={isDisabled}>
						<InputField value={value ?? ''} placeholder={placeholder} editable={false} />
					</Input>
				</View>
			</Pressable>

			<Modal isOpen={isOpen} onClose={handleClose}>
				<ModalBackdrop />
				<ModalContent className="max-w-[360px]">
					<ModalHeader>
						<HStack className="justify-between items-center w-full">
							<Button variant="link" size="sm" onPress={goToPrevMonth}>
								<ButtonIcon as={ArrowLeftIcon} />
							</Button>
							<Text className="text-lg font-semibold capitalize">{monthLabel}</Text>
							<Button variant="link" size="sm" onPress={goToNextMonth}>
								<ButtonIcon as={ArrowRightIcon} />
							</Button>
						</HStack>
						<ModalCloseButton onPress={handleClose} />
					</ModalHeader>
					<ModalBody>
						<VStack className="gap-3">
							<View className="flex-row w-full">
								{WEEKDAY_LABELS.map((labelItem, index) => (
									<View
										key={`${labelItem}-${index}`}
										className="items-center justify-center"
										style={{ width: CELL_PERCENT, height: CELL_HEIGHT }}
									>
										<Text className="text-center font-semibold text-gray-600 dark:text-gray-300 uppercase">
											{labelItem}
										</Text>
									</View>
								))}
							</View>
							<View className="flex-row flex-wrap w-full">
								{prevPlaceholders.map(item => (
									<View
										key={`prev-${item.day}`}
										style={{
											width: CELL_PERCENT,
											height: CELL_HEIGHT,
											alignItems: 'center',
											justifyContent: 'center',
										}}
									>
										<Text className="text-center text-gray-500 dark:text-gray-600">{item.day}</Text>
									</View>
								))}
								{days.map(({ day, date }) => {
									const isSelected =
										selectedDate &&
										selectedDate.getFullYear() === date.getFullYear() &&
										selectedDate.getMonth() === date.getMonth() &&
										selectedDate.getDate() === date.getDate();
									return (
										<View
											key={day}
											style={{
												width: CELL_PERCENT,
												height: CELL_HEIGHT,
												alignItems: 'center',
												justifyContent: 'center',
											}}
										>
											<Pressable
												className={`w-10 h-10 items-center justify-center rounded-full ${
													isSelected ? 'bg-[#FFE000]' : 'bg-gray-100 dark:bg-gray-800'
												}`}
												onPress={() => handleSelect(date)}
											>
												<Text className={`text-center ${isSelected ? 'text-white font-semibold' : 'text-gray-800 dark:text-gray-200'}`}>
													{day}
												</Text>
											</Pressable>
										</View>
									);
								})}
								{nextPlaceholders.map(item => (
									<View
										key={`next-${item.day}`}
										style={{
											width: CELL_PERCENT,
											height: CELL_HEIGHT,
											alignItems: 'center',
											justifyContent: 'center',
										}}
									>
										<Text className="text-center text-gray-500 dark:text-gray-600">{item.day}</Text>
									</View>
								))}
							</View>
							<Divider />
							<HStack className="justify-between items-center">
								<Button variant="outline" onPress={handleSelectToday}>
									<ButtonIcon as={AddIcon} />
									<ButtonText>Hoje</ButtonText>
								</Button>
								<Button variant="link" onPress={handleClose}>
									<ButtonText>Fechar</ButtonText>
								</Button>
							</HStack>
						</VStack>
					</ModalBody>
				</ModalContent>
			</Modal>
		</VStack>
	);
}

export default DatePickerField;
