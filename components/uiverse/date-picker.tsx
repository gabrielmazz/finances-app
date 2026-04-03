import React from 'react';
import { Pressable, View } from 'react-native';

import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import { Input, InputField } from '@/components/ui/input';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from '@/components/ui/modal';
import { ArrowLeftIcon, ArrowRightIcon } from '@/components/ui/icon';
import { useScreenStyles } from '@/hooks/useScreenStyle';

type DatePickerFieldProps = {
	label?: string;
	accessibilityLabel?: string;
	value?: string | null;
	onChange: (formattedValue: string, date: Date) => void;
	placeholder?: string;
	isDisabled?: boolean;
	containerClassName?: string;
	labelClassName?: string;
	triggerClassName?: string;
	inputClassName?: string;
};

// Domingo, Segunda, Terça, Quarta, Quinta, Sexta, Sábado (sem acentos para manter ASCII)
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const CELL_PERCENT = '14.2857%';
const WEEKDAY_CELL_HEIGHT = 40;
const DAY_CELL_HEIGHT = 52;

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
	accessibilityLabel,
	value,
	onChange,
	placeholder = 'DD/MM/AAAA',
	isDisabled,
	containerClassName,
	labelClassName,
	triggerClassName,
	inputClassName,
}: DatePickerFieldProps) {
	const {
		isDarkMode,
		headingText,
		labelText,
		bodyText,
		helperText,
		inputField: defaultInputClassName,
		fieldContainerClassName,
		modalContentClassName,
		submitButtonClassName,
		submitButtonCancelClassName,
	} = useScreenStyles();
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

	const triggerFocusedClassName = isOpen ? (isDarkMode ? 'border-yellow-300' : 'border-[#FFE000]') : '';
	const resolvedTriggerClassName = `${triggerClassName ?? fieldContainerClassName} ${triggerFocusedClassName}`.trim();
	const resolvedInputClassName = inputClassName ?? defaultInputClassName;
	const monthNavigationContainerClassName = isDarkMode
		? 'w-full border-y border-slate-800'
		: 'w-full border-y border-slate-200';
	const neutralDayClassName = isDarkMode ? 'bg-slate-900' : 'bg-slate-100';

	return (
		<VStack className={containerClassName ? `w-full ${containerClassName}` : 'w-full'}>
			{label ? (
				<Text
					className={
						labelClassName
							? `mb-2 font-semibold ${labelText} ${labelClassName}`
							: `mb-2 font-semibold ${labelText}`
					}
				>
					{label}
				</Text>
			) : null}
			<Pressable
				onPress={handleOpen}
				disabled={isDisabled}
				hitSlop={8}
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabel ?? label ?? 'Selecionar data'}
			>
				<View pointerEvents="none">
					<Input isDisabled={isDisabled} className={resolvedTriggerClassName}>
						<InputField
							value={value ?? ''}
							placeholder={placeholder}
							editable={false}
							className={resolvedInputClassName}
						/>
					</Input>
				</View>
			</Pressable>

			<Modal isOpen={isOpen} onClose={handleClose}>
				<ModalBackdrop />
				<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
					<ModalHeader>
						<ModalTitle>Selecionar data</ModalTitle>
						<ModalCloseButton onPress={handleClose} />
					</ModalHeader>
					<View className={monthNavigationContainerClassName}>
						<HStack className="w-full items-center px-4 py-3">
							<Button variant="link" size="md" onPress={goToPrevMonth} className="h-10 w-10 rounded-2xl px-0">
								<ButtonIcon as={ArrowLeftIcon} className={headingText} />
							</Button>
							<View className="flex-1 items-center justify-center px-2">
								<Text className={`text-base font-semibold capitalize ${headingText}`}>{monthLabel}</Text>
							</View>
							<Button variant="link" size="md" onPress={goToNextMonth} className="h-10 w-10 rounded-2xl px-0">
								<ButtonIcon as={ArrowRightIcon} className={headingText} />
							</Button>
						</HStack>
					</View>
					<ModalBody className="px-0 pt-0">
						<VStack className="gap-2 px-6 pb-2 pt-4">
							<View className="flex-row w-full">
								{WEEKDAY_LABELS.map((labelItem, index) => (
									<View
										key={`${labelItem}-${index}`}
										className="items-center justify-center"
										style={{ width: CELL_PERCENT, height: WEEKDAY_CELL_HEIGHT }}
									>
										<Text className={`text-center text-xs font-semibold uppercase ${helperText}`}>
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
											height: DAY_CELL_HEIGHT,
											alignItems: 'center',
											justifyContent: 'center',
										}}
									>
										<Text className={`text-center ${helperText}`}>{item.day}</Text>
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
												height: DAY_CELL_HEIGHT,
												alignItems: 'center',
												justifyContent: 'center',
											}}
										>
											<Pressable
												className={`h-10 w-10 items-center justify-center rounded-full ${
													isSelected ? 'bg-[#FFE000]' : neutralDayClassName
												}`}
												onPress={() => handleSelect(date)}
											>
												<Text
													className={`text-center font-medium ${
														isSelected ? 'font-semibold text-slate-900' : bodyText
													}`}
												>
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
											height: DAY_CELL_HEIGHT,
											alignItems: 'center',
											justifyContent: 'center',
										}}
									>
										<Text className={`text-center ${helperText}`}>{item.day}</Text>
									</View>
								))}
							</View>
						</VStack>
					</ModalBody>
					<ModalFooter className="gap-3">
						<Button variant="outline" onPress={handleClose} className={submitButtonCancelClassName}>
							<ButtonText>Cancelar</ButtonText>
						</Button>
						<Button variant="solid" onPress={handleSelectToday} className={submitButtonClassName}>
							<ButtonText>Hoje</ButtonText>
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</VStack>
	);
}

export default DatePickerField;
