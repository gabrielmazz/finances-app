import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icon';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import {
	DEFAULT_MANDATORY_REMINDER_HOUR,
	DEFAULT_MANDATORY_REMINDER_MINUTE,
	formatMandatoryReminderTime,
	isMandatoryReminderTimeValid,
	parseMandatoryReminderTime,
} from '@/utils/mandatoryReminderTime';

type TimePickerFieldProps = {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	isDisabled?: boolean;
	accessibilityLabel?: string;
	triggerClassName?: string;
	inputClassName?: string;
};

type WebPressableProps = React.ComponentProps<typeof Pressable> & {
	onKeyDown?: (event: unknown) => void;
};

const WebPressable = Pressable as React.ComponentType<WebPressableProps>;

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const TIME_OPTION_HEIGHT = 36;

type TimeOptionColumnProps = {
	title: string;
	options: readonly number[];
	selectedValue: number;
	onSelect: (value: number) => void;
	classNames: ReturnType<typeof useScreenStyles>['webTimePickerClassNames'];
};

function TimeOptionColumn({ title, options, selectedValue, onSelect, classNames }: TimeOptionColumnProps) {
	const scrollViewRef = React.useRef<ScrollView>(null);
	const selectedIndex = options.indexOf(selectedValue);

	React.useEffect(() => {
		if (selectedIndex < 0) {
			return;
		}

		const animationFrame = requestAnimationFrame(() => {
			scrollViewRef.current?.scrollTo({ y: selectedIndex * TIME_OPTION_HEIGHT, animated: false });
		});

		return () => cancelAnimationFrame(animationFrame);
	}, [selectedIndex]);

	return (
		<View className={classNames.column}>
			<Text className={classNames.columnTitle}>{title}</Text>
			<ScrollView
				ref={scrollViewRef}
				className={classNames.columnScroll}
				nestedScrollEnabled
				showsVerticalScrollIndicator
			>
				{options.map(option => {
					const isSelected = option === selectedValue;
					const formattedOption = String(option).padStart(2, '0');

					return (
						<WebPressable
							key={option}
							onPress={() => onSelect(option)}
							accessibilityRole="button"
							accessibilityLabel={`${title} ${formattedOption}`}
							accessibilityState={{ selected: isSelected }}
							className={`${classNames.option} ${isSelected ? classNames.optionSelected : ''}`}
						>
							<Text className={classNames.optionText}>{formattedOption}</Text>
						</WebPressable>
					);
				})}
			</ScrollView>
		</View>
	);
}

export function TimePickerField({
	value,
	onChange,
	placeholder = 'Selecione o horário',
	isDisabled = false,
	accessibilityLabel = 'Selecionar horário',
	triggerClassName,
	inputClassName,
}: TimePickerFieldProps) {
	const {
		inputField: defaultInputClassName,
		fieldContainerClassName,
		webTimePickerClassNames,
	} = useScreenStyles();
	const [isPickerOpen, setIsPickerOpen] = React.useState(false);
	const [selectedHour, setSelectedHour] = React.useState(DEFAULT_MANDATORY_REMINDER_HOUR);
	const [selectedMinute, setSelectedMinute] = React.useState(DEFAULT_MANDATORY_REMINDER_MINUTE);
	const resolvedTriggerClassName = triggerClassName ?? webTimePickerClassNames.trigger ?? fieldContainerClassName;
	const resolvedInputClassName = inputClassName ?? defaultInputClassName;
	const hasValidValue = isMandatoryReminderTimeValid(value);

	React.useEffect(() => {
		if (isDisabled) {
			setIsPickerOpen(false);
		}
	}, [isDisabled]);

	const handleOpen = React.useCallback(() => {
		if (isDisabled) {
			return;
		}

		const parsedTime = parseMandatoryReminderTime(value);
		setSelectedHour(parsedTime?.hour ?? DEFAULT_MANDATORY_REMINDER_HOUR);
		setSelectedMinute(parsedTime?.minute ?? DEFAULT_MANDATORY_REMINDER_MINUTE);
		setIsPickerOpen(current => !current);
	}, [isDisabled, value]);

	const handleTriggerKeyDown = React.useCallback((event: unknown) => {
		const keyboardEvent = event as {
			key?: string;
			nativeEvent?: { key?: string };
			preventDefault?: () => void;
		};
		const key = keyboardEvent.key ?? keyboardEvent.nativeEvent?.key;

		if (key === 'Enter' || key === ' ') {
			keyboardEvent.preventDefault?.();
			handleOpen();
		} else if (key === 'Escape') {
			setIsPickerOpen(false);
		}
	}, [handleOpen]);

	const handleHourSelect = (hour: number) => {
		setSelectedHour(hour);
		onChange(formatMandatoryReminderTime(hour, selectedMinute));
	};

	const handleMinuteSelect = (minute: number) => {
		setSelectedMinute(minute);
		onChange(formatMandatoryReminderTime(selectedHour, minute));
	};

	return (
		<View className="relative z-30 w-full">
			<WebPressable
				onPress={handleOpen}
				onKeyDown={handleTriggerKeyDown}
				disabled={isDisabled}
				accessibilityRole="combobox"
				accessibilityLabel={accessibilityLabel}
				accessibilityState={{ disabled: isDisabled, expanded: isPickerOpen }}
				style={webTimePickerClassNames.triggerStyle}
				className={`${resolvedTriggerClassName} ${webTimePickerClassNames.trigger} flex-row items-center justify-between overflow-hidden ${isDisabled ? 'opacity-40' : ''}`}
			>
				<Text
					className={`${hasValidValue ? webTimePickerClassNames.value : webTimePickerClassNames.placeholder} ${resolvedInputClassName} min-w-0 flex-1`}
					numberOfLines={1}
				>
					{hasValidValue ? value : placeholder}
				</Text>
				{isPickerOpen ? (
					<ChevronUpIcon className={webTimePickerClassNames.icon} style={webTimePickerClassNames.iconStyle} aria-hidden />
				) : (
					<ChevronDownIcon className={webTimePickerClassNames.icon} style={webTimePickerClassNames.iconStyle} aria-hidden />
				)}
			</WebPressable>

			{isPickerOpen ? (
				<View className={webTimePickerClassNames.menu}>
					<TimeOptionColumn
						title="Hora"
						options={HOURS}
						selectedValue={selectedHour}
						onSelect={handleHourSelect}
						classNames={webTimePickerClassNames}
					/>
					<TimeOptionColumn
						title="Minuto"
						options={MINUTES}
						selectedValue={selectedMinute}
						onSelect={handleMinuteSelect}
						classNames={webTimePickerClassNames}
					/>
				</View>
			) : null}
		</View>
	);
}

export default TimePickerField;
